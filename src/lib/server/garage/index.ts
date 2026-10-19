import {
	ApiClient,
	BucketApi,
	PermissionApi,
	AccessKeyApi,
	type GarageBucket,
	type GarageKey
} from 'garage_administration_api';
import { GARAGE_ADMIN_ENDPOINT, GARAGE_ADMIN_TOKEN, GARAGE_API_ENDPOINT } from '$app/env/private';
import { provisionGarageCredentials, type GarageCredentials } from './credentials';
import { ensureGarageLayout, GarageLayoutError } from './layout';

export const GARAGE_BUCKET = 'bpc';

export function garageAdminConfigured(): boolean {
	return Boolean(GARAGE_ADMIN_ENDPOINT && GARAGE_ADMIN_TOKEN);
}

export function createGarageAdminClient(): ApiClient {
	if (!GARAGE_ADMIN_ENDPOINT || !GARAGE_ADMIN_TOKEN) {
		throw new Error('Set both GARAGE_ADMIN_ENDPOINT and GARAGE_ADMIN_TOKEN to initialize Garage.');
	}
	const endpoint = new URL(GARAGE_ADMIN_ENDPOINT);
	if (!['http:', 'https:'].includes(endpoint.protocol)) {
		throw new Error('GARAGE_ADMIN_ENDPOINT must use HTTP or HTTPS.');
	}
	const client = new ApiClient(endpoint.href);
	client.authentications.bearerAuth.accessToken = GARAGE_ADMIN_TOKEN;
	client.timeout = 10_000;
	client.plugins = [(request) => request.redirects(0)];
	return client;
}

function isAdminError(caught: unknown, status: number, code: string): boolean {
	if (typeof caught !== 'object' || caught === null || !('status' in caught)) return false;
	if (caught.status !== status || !('response' in caught)) return false;
	const response = caught.response;
	if (typeof response !== 'object' || response === null || !('body' in response)) return false;
	const body = response.body;
	return typeof body === 'object' && body !== null && 'code' in body && body.code === code;
}

function verifyBucket(bucket: GarageBucket): GarageBucket {
	if (!bucket?.id || !bucket.globalAliases?.includes(GARAGE_BUCKET)) {
		throw new Error('Garage returned invalid bucket information for bpc.');
	}
	return bucket;
}

function verifyKey(key: GarageKey): GarageCredentials {
	if (!key?.accessKeyId || !key.secretAccessKey || key.expired !== false) {
		throw new Error('Garage did not return an active S3 key and secret.');
	}
	return { accessKeyId: key.accessKeyId, secretAccessKey: key.secretAccessKey };
}

export async function ensureGarageBucket(): Promise<void> {
	if (!GARAGE_ADMIN_ENDPOINT && !GARAGE_ADMIN_TOKEN) return;
	const client = createGarageAdminClient();
	const buckets = new BucketApi(client);

	async function ensureBucket(): Promise<GarageBucket> {
		try {
			return verifyBucket(await buckets.getBucketInfo({ globalAlias: GARAGE_BUCKET }));
		} catch (caught) {
			if (!isAdminError(caught, 404, 'NoSuchBucket')) throw caught;
		}
		try {
			return verifyBucket(await buckets.createBucket({ globalAlias: GARAGE_BUCKET }));
		} catch (caught) {
			if (!isAdminError(caught, 409, 'BucketAlreadyExists')) throw caught;
			// Another app instance created the bucket after our lookup.
			return verifyBucket(await buckets.getBucketInfo({ globalAlias: GARAGE_BUCKET }));
		}
	}

	try {
		await ensureGarageLayout(client);
		const bucket = await ensureBucket();
		async function grant(accessKeyId: string) {
			await new PermissionApi(client).allowBucketKey({
				bucketId: bucket.id,
				accessKeyId,
				permissions: { read: true, write: true, owner: false }
			});
		}
		if (GARAGE_API_ENDPOINT) {
			await provisionGarageCredentials(async ({ keyName, accessKeyId }) => {
				const keys = new AccessKeyApi(client);
				let key: GarageKey | undefined;
				if (accessKeyId) {
					try {
						key = await keys.getKeyInfo({ id: accessKeyId, showSecretKey: true });
						if (key.accessKeyId !== accessKeyId)
							throw new Error('Garage returned an unexpected key.');
					} catch (caught) {
						if (!isAdminError(caught, 404, 'NoSuchAccessKey')) throw caught;
					}
				}
				if (!key) {
					try {
						key = await keys.getKeyInfo({ search: keyName, showSecretKey: true });
						if (key.name !== keyName) throw new Error('Garage returned an unexpected key name.');
					} catch (caught) {
						if (!isAdminError(caught, 404, 'NoSuchAccessKey')) throw caught;
						key = await keys.createKey({ name: keyName, neverExpires: true });
					}
				}
				const next = verifyKey(key);
				await grant(next.accessKeyId);
				return next;
			});
		}
	} catch (caught) {
		if (caught instanceof GarageLayoutError) throw caught;
		// SDK errors can include request headers containing the admin token.
		const status =
			typeof caught === 'object' && caught !== null && 'status' in caught
				? caught.status
				: 'unavailable';
		// eslint-disable-next-line preserve-caught-error -- SDK causes expose bearer credentials.
		throw new Error(
			`Garage bucket setup failed (${status}). Check Garage configuration and connectivity.`
		);
	}
}
