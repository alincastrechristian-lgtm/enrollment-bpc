import {
	ApiClient,
	ClusterApi,
	ClusterLayoutApi,
	type GarageLayout,
	type GarageNodeRole
} from 'garage_administration_api';

const CAPACITY = 10_000_000_000; // Garage uses decimal GB, matching CLI capacity 10G.
const ZONE = 'dc1';
const TAG = 'bpc-bootstrap';

export class GarageLayoutError extends Error {}

export function verifyLayout(layout: GarageLayout): GarageLayout {
	if (
		!layout ||
		!Number.isSafeInteger(layout.version) ||
		layout.version < 0 ||
		!Array.isArray(layout.roles) ||
		!Array.isArray(layout.stagedRoleChanges) ||
		!('stagedParameters' in layout)
	) {
		throw new GarageLayoutError('Garage returned invalid cluster layout information.');
	}
	return layout;
}

function initialized(layout: GarageLayout): boolean {
	return layout.version > 0 && layout.roles.length > 0;
}

function verifyFresh(layout: GarageLayout): void {
	if (layout.version !== 0 || layout.roles.length !== 0 || layout.stagedParameters !== null) {
		throw new GarageLayoutError(
			'Automatic Garage bootstrap requires a fresh layout. Configure this layout manually.'
		);
	}
}

function matchesBootstrap(role: GarageNodeRole, nodeId: string): boolean {
	return (
		role?.id === nodeId &&
		role.remove !== true &&
		role.capacity === CAPACITY &&
		role.zone === ZONE &&
		role.tags?.length === 1 &&
		role.tags[0] === TAG
	);
}

function verifyStaged(layout: GarageLayout, nodeId: string): void {
	verifyFresh(layout);
	if (
		layout.stagedRoleChanges.length !== 1 ||
		!matchesBootstrap(layout.stagedRoleChanges[0], nodeId)
	) {
		throw new GarageLayoutError(
			'Garage has other staged layout changes. Review and apply them manually.'
		);
	}
}

export function createGarageLayoutApi(client: ApiClient): ClusterLayoutApi {
	// SDK v2.3's generated NodeRoleChange parser calls a missing initialize method.
	// Keep SDK methods/authentication/timeouts; validate layout JSON ourselves.
	const layoutClient: ApiClient = Object.create(client);
	layoutClient.deserialize = (response) => response.body;
	return new ClusterLayoutApi(layoutClient);
}

export async function ensureGarageLayout(client: ApiClient): Promise<void> {
	const layouts = createGarageLayoutApi(client);
	const cluster = new ClusterApi(client);
	const read = async () => verifyLayout(await layouts.getClusterLayout());
	try {
		let layout = await read();
		if (initialized(layout)) return;
		verifyFresh(layout);

		const status = await cluster.getClusterStatus();
		if (status.layoutVersion !== 0) {
			if (initialized(await read())) return;
			throw new GarageLayoutError('Garage layout changed during bootstrap. Retry startup.');
		}
		if (
			!Array.isArray(status.nodes) ||
			status.nodes.length !== 1 ||
			!status.nodes[0].id ||
			status.nodes[0].isUp !== true ||
			status.nodes[0].draining !== false
		) {
			throw new GarageLayoutError(
				'Automatic Garage bootstrap requires exactly one online node. Configure other clusters manually.'
			);
		}
		const nodeId = status.nodes[0].id;
		if (layout.stagedRoleChanges.length === 0) {
			layout = verifyLayout(
				await layouts.updateClusterLayout({
					roles: [{ id: nodeId, capacity: CAPACITY, zone: ZONE, tags: [TAG] }]
				})
			);
			if (initialized(layout)) return;
		}
		verifyStaged(layout, nodeId);
		// Recheck pending changes before applying; never apply someone else's staging.
		layout = await read();
		if (initialized(layout)) return;
		verifyStaged(layout, nodeId);
		try {
			const applied = verifyLayout((await layouts.applyClusterLayout({ version: 1 })).layout);
			if (
				applied.version !== 1 ||
				applied.roles.length !== 1 ||
				!matchesBootstrap(applied.roles[0], nodeId)
			) {
				throw new GarageLayoutError(
					'Garage did not confirm the initial 10 GB node layout. Check cluster status.'
				);
			}
		} catch (caught) {
			if (caught instanceof GarageLayoutError) throw caught;
			// A simultaneous startup may have applied version 1 first.
			if (!initialized(await read())) throw caught;
		}
	} catch (caught) {
		if (caught instanceof GarageLayoutError) throw caught;
		const status =
			typeof caught === 'object' && caught !== null && 'status' in caught
				? caught.status
				: 'unavailable';
		// Do not attach SDK causes: they expose bearer credentials.
		throw new GarageLayoutError(
			`Garage layout setup failed (${status}). Check admin permissions and single-node replication_factor = 1.`
		);
	}
}
