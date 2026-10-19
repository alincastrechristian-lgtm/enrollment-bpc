import {
	BucketApi,
	ClusterApi,
	type GarageLayout,
	type GarageNodeRole
} from 'garage_administration_api';
import { GARAGE_REGION } from '$app/env/private';
import { error, isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import { createGarageAdminClient, GARAGE_BUCKET } from './index';
import { createGarageLayoutApi, verifyLayout } from './layout';
import { withGarageLock } from './credentials';

export async function getStorageOverview() {
	try {
		const client = createGarageAdminClient();
		const cluster = new ClusterApi(client);
		const [status, health, statistics, rawLayout, bucket] = await Promise.all([
			cluster.getClusterStatus(),
			cluster.getClusterHealth(),
			cluster.getClusterStatistics(),
			createGarageLayoutApi(client).getClusterLayout(),
			new BucketApi(client).getBucketInfo({ globalAlias: GARAGE_BUCKET })
		]);
		const layout = verifyLayout(rawLayout);
		return {
			region: GARAGE_REGION,
			layoutVersion: layout.version,
			hasStagedChanges: layout.stagedRoleChanges.length > 0 || layout.stagedParameters !== null,
			health: {
				status: health.status,
				storageNodes: health.storageNodes,
				storageNodesUp: health.storageNodesUp,
				partitions: health.partitions,
				partitionsQuorum: health.partitionsQuorum
			},
			space: {
				available: statistics.dataAvail ?? null,
				objectBytes: statistics.totalObjectBytes ?? null,
				metadataAvailable: statistics.metadataAvail ?? null,
				incomplete: statistics.incompleteAvailInfo ?? false
			},
			bucket: {
				name: GARAGE_BUCKET,
				bytes: bucket.bytes ?? null,
				objects: bucket.objects ?? null,
				maxSize: bucket.quotas?.maxSize ?? null,
				maxObjects: bucket.quotas?.maxObjects ?? null,
				websiteAccess: bucket.websiteAccess ?? false,
				unfinishedUploads: bucket.unfinishedUploads ?? 0
			},
			nodes: layout.roles.map((role) => {
				const node = status.nodes.find((node) => node.id === role.id);
				return {
					id: role.id,
					capacity: role.capacity ?? null,
					zone: role.zone ?? '',
					tags: role.tags ?? [],
					hostname: node?.hostname || role.id.slice(0, 12),
					online: node?.isUp ?? false,
					draining: node?.draining ?? false,
					version: node?.garageVersion ?? null,
					diskAvailable: node?.dataPartition?.available ?? null,
					diskTotal: node?.dataPartition?.total ?? null
				};
			})
		};
	} catch {
		error(503, 'Could not load Garage status. Check connectivity and admin token permissions.');
	}
}

export const capacitySchema = z
	.object({
		nodeId: z.string().regex(/^[a-f0-9]{64}$/),
		layoutVersion: z.coerce
			.number()
			.int()
			.min(1)
			.max(Number.MAX_SAFE_INTEGER - 1),
		capacityGB: z.coerce
			.number()
			.positive()
			.refine((value) => Number.isSafeInteger(value * 1_000_000_000)),
		confirmed: z.literal('yes')
	})
	.strict();

function roleShape(role: GarageNodeRole) {
	return {
		id: role.id,
		capacity: role.capacity ?? null,
		zone: role.zone ?? '',
		tags: [...(role.tags ?? [])].sort()
	};
}

function rolesMatch(actual: GarageNodeRole[], expected: GarageNodeRole[]): boolean {
	const normalize = (roles: GarageNodeRole[]) =>
		roles.map(roleShape).sort((a, b) => a.id.localeCompare(b.id));
	return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected));
}

function verifyPending(layout: GarageLayout, original: GarageLayout, change: GarageNodeRole): void {
	if (
		layout.version !== original.version ||
		layout.stagedParameters !== null ||
		!rolesMatch(layout.roles, original.roles) ||
		layout.stagedRoleChanges.length !== 1 ||
		layout.stagedRoleChanges[0].remove === true ||
		!rolesMatch(layout.stagedRoleChanges, [change])
	) {
		error(
			409,
			'Garage layout changed while staging the increase. Refresh and review pending changes.'
		);
	}
}

export async function increaseNodeCapacity(input: unknown) {
	const parsed = capacitySchema.safeParse(input);
	if (!parsed.success) error(400, 'Choose a valid node, capacity in GB, and confirm the increase.');
	const { nodeId, layoutVersion, capacityGB } = parsed.data;
	const capacity = capacityGB * 1_000_000_000;
	try {
		return await withGarageLock(async (assertOwned) => {
			const client = createGarageAdminClient();
			const layouts = createGarageLayoutApi(client);
			const original = verifyLayout(await layouts.getClusterLayout());
			if (
				original.version !== layoutVersion ||
				original.stagedRoleChanges.length ||
				original.stagedParameters !== null
			) {
				error(
					409,
					'Garage layout changed or has pending changes. Refresh before increasing capacity.'
				);
			}
			const role = original.roles.find((role) => role.id === nodeId);
			if (!role || role.capacity == null) error(404, 'Storage node not found.');
			if (capacity <= role.capacity)
				error(400, 'New capacity must be greater than current capacity.');
			if (!role.zone || !Array.isArray(role.tags))
				error(409, 'Node configuration is incomplete. Review Garage layout.');
			const status = await new ClusterApi(client).getClusterStatus();
			const node = status.nodes.find((node) => node.id === nodeId);
			if (status.layoutVersion !== original.version)
				error(409, 'Garage layout changed. Refresh before retrying.');
			if (!node?.isUp || node.draining)
				error(409, 'Capacity can only be increased for an online storage node.');
			if (node.dataPartition && capacity > node.dataPartition.total)
				error(400, 'Capacity exceeds the node filesystem size. Add disk space first.');
			const change = { id: nodeId, capacity, zone: role.zone, tags: [...role.tags] };
			assertOwned();
			verifyPending(
				verifyLayout(await layouts.updateClusterLayout({ roles: [change] })),
				original,
				change
			);
			verifyPending(verifyLayout(await layouts.getClusterLayout()), original, change);
			assertOwned();
			const expectedRoles = original.roles.map((role) => (role.id === nodeId ? change : role));
			let applied: GarageLayout;
			try {
				applied = verifyLayout(
					(await layouts.applyClusterLayout({ version: original.version + 1 })).layout
				);
			} catch {
				// The apply response may be lost after Garage committed the change.
				applied = verifyLayout(await layouts.getClusterLayout());
			}
			if (applied.version !== original.version + 1 || !rolesMatch(applied.roles, expectedRoles)) {
				error(
					503,
					'Garage did not confirm the capacity increase. Refresh and review pending layout changes.'
				);
			}
			return { nodeId, capacity, layoutVersion: applied.version };
		});
	} catch (caught) {
		if (isHttpError(caught)) throw caught;
		error(
			503,
			'Capacity update failed. Refresh and review Garage status and pending layout changes.'
		);
	}
}
