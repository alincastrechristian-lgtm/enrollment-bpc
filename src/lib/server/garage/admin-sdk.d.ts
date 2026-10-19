// The upstream JavaScript SDK ships no TypeScript declarations.
declare module 'garage_administration_api' {
	export interface GarageBucket {
		id: string;
		globalAliases: string[];
		bytes?: number;
		objects?: number;
		quotas?: { maxSize?: number | null; maxObjects?: number | null };
		websiteAccess?: boolean;
		unfinishedUploads?: number;
	}
	export interface GarageKey {
		accessKeyId: string;
		secretAccessKey: string | null;
		name: string;
		expired: boolean;
	}
	export class AccessKeyApi {
		constructor(client: ApiClient);
		getKeyInfo(options: {
			id?: string;
			search?: string;
			showSecretKey: boolean;
		}): Promise<GarageKey>;
		createKey(body: { name: string; neverExpires: boolean }): Promise<GarageKey>;
	}
	export class ApiClient {
		constructor(basePath: string);
		authentications: { bearerAuth: { accessToken: string } };
		timeout: number;
		deserialize(response: { body: unknown }, returnType?: unknown): unknown;
		plugins: ((request: { redirects(count: number): unknown }) => unknown)[];
	}
	export interface GarageNodeRole {
		id: string;
		capacity?: number | null;
		zone?: string;
		tags?: string[];
		remove?: boolean;
	}
	export interface GarageLayout {
		version: number;
		roles: GarageNodeRole[];
		stagedRoleChanges: GarageNodeRole[];
		stagedParameters: unknown;
	}
	export class ClusterLayoutApi {
		constructor(client: ApiClient);
		getClusterLayout(): Promise<GarageLayout>;
		updateClusterLayout(body: { roles: GarageNodeRole[] }): Promise<GarageLayout>;
		applyClusterLayout(body: { version: number }): Promise<{ layout: GarageLayout }>;
	}
	export class ClusterApi {
		constructor(client: ApiClient);
		getClusterStatus(): Promise<{
			layoutVersion: number;
			nodes: {
				id: string;
				isUp: boolean;
				draining: boolean;
				hostname?: string | null;
				garageVersion?: string | null;
				dataPartition?: { available: number; total: number } | null;
			}[];
		}>;
		getClusterHealth(): Promise<{
			status: string;
			storageNodes: number;
			storageNodesUp: number;
			partitions: number;
			partitionsQuorum: number;
			partitionsAllOk: number;
		}>;
		getClusterStatistics(): Promise<{
			dataAvail?: number | null;
			metadataAvail?: number | null;
			incompleteAvailInfo?: boolean | null;
			totalObjectBytes?: number | null;
			totalObjectCount?: number | null;
			bucketCount?: number | null;
		}>;
	}
	export class BucketApi {
		constructor(client: ApiClient);
		getBucketInfo(options: { globalAlias: string }): Promise<GarageBucket>;
		createBucket(body: { globalAlias: string }): Promise<GarageBucket>;
	}
	export class PermissionApi {
		constructor(client: ApiClient);
		allowBucketKey(body: {
			bucketId: string;
			accessKeyId: string;
			permissions: { read: boolean; write: boolean; owner: boolean };
		}): Promise<GarageBucket>;
	}
}
