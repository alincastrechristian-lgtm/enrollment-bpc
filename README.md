# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.17.1 create --template minimal --types ts --add prettier eslint tailwindcss="plugins:none" better-auth="demo:password" drizzle="database:sqlite+sqlite:better-sqlite3" --install pnpm enrollment-system
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Docker

The GitHub Actions workflow builds the Docker image for pull requests to `master` and publishes it to Docker Hub on pushes to `master` or manual runs. Add the repository secrets `DOCKER_USERNAME` and `DOCKER_PASSWORD` (a Docker Hub access token) before publishing. The workflow publishes `aetherknowledge/safehub:latest` and a commit-specific tag.

To run the published image locally:

```sh
docker run --rm -p 3000:3000 \
  -e ORIGIN=http://localhost:3000 \
  -e BETTER_AUTH_SECRET="replace-with-a-long-random-secret" \
  -v enrollment-data:/app/data \
  aetherknowledge/safehub:latest
```

The SQLite database is stored in `./data/local.db` beside the Compose file. On startup, the container creates the database if needed and applies any pending SQL migrations from `drizzle/`. When you change the schema, generate and commit a migration with `pnpm db:generate`; the next container start applies it.

Set `ORIGIN` to the public URL when deploying behind a domain or proxy.

### Garage bucket

To automatically create the `bpc` bucket on app startup, set `GARAGE_ADMIN_ENDPOINT`
and `GARAGE_ADMIN_TOKEN` in `.env`. The endpoint must reach your Garage server's
Admin API (port `3903`); the token must match `[admin].admin_token` in its
`garage.toml`, or be a scoped token allowing `GetBucketInfo`, `CreateBucket`,
`GetKeyInfo`, `CreateKey`, and `AllowBucketKey` when using file uploads. Startup
also needs `GetClusterLayout`; initial single-node bootstrap additionally needs
`GetClusterStatus`, `UpdateClusterLayout`, and `ApplyClusterLayout`.
Bucket, access-key, and permission operations use the
official Garage Admin SDK, pinned to a Git commit.
Docker Compose passes these settings to the app.

For a fresh single-node Garage with `replication_factor = 1`, startup assigns the
running node **10 GB** (10,000,000,000 bytes) in zone `dc1` and applies layout
version 1 before creating the bucket. This declares node capacity; it does not
create a server or reserve disk space. Existing initialized layouts retain their
capacity. Multiple nodes and unrelated staged changes require manual layout
setup. A partially completed app bootstrap can resume on the next startup.

Startup reuses an existing `bpc` bucket, and builds never contact Garage. Leave
both admin values unset to disable setup. Incomplete settings or Garage failures
fail initialization; correct the settings or connectivity and restart the app.
`GARAGE_METRICS_TOKEN` is not used by the app.

### File upload and download

Sign in and open `/test/files`. Uploads (up to 10 MiB), file listing, and streamed
downloads use AWS SDK for JavaScript v3 against Garage's S3 API. Each user's files
are isolated under their own prefix in `bpc`; filenames can repeat without
overwriting earlier uploads. File contents and credentials never go into page data.

Set the Garage endpoints, admin token, and region; no manual S3 key creation is needed:

```dotenv
GARAGE_API_ENDPOINT=http://your-garage-server:3900
GARAGE_ADMIN_ENDPOINT=http://your-garage-server:3903
GARAGE_ADMIN_TOKEN=your-admin-token
GARAGE_REGION=garage
BODY_SIZE_LIMIT=12M
```

`GARAGE_REGION` must match `[s3_api].s3_region` in `garage.toml`. At startup the
Admin SDK creates/reuses `bpc`, creates/reuses an app access key, and grants it
read/write without adding owner access. The private `garage_storage` table stores
only the key ID and stable name for each S3 endpoint. Garage returns its secret
at startup; the secret stays in server memory and is never saved in the DB or
returned to the browser. Restarts reuse the same key, and a DB lease serializes
simultaneous provisioning attempts. Partial setup can retry without replacing
an already-created key.

Run `pnpm db:migrate` before local development. Containers apply the new additive
migration automatically before app startup. No existing settings or file data is
changed. Keep the metadata table when rolling back to an older build.

Missing configuration displays a setup message on the files page. Compose forwards all storage settings and sets
the Node adapter's body limit to `12M`; direct Node deployments must also set
`BODY_SIZE_LIMIT=12M`. Keep the same minimum request-body limit in any reverse proxy.

See [Garage's JavaScript guide](https://garagehq.deuxfleurs.fr/documentation/build/javascript/).

### Storage administration

Administrators can open **Settings > Storage** at `/user/settings/storage` to
browse all files in `bpc`, upload/download files, delete files or entire folders,
and view cluster health,
available data space, filesystem space, bucket usage/quotas, and node details.
Page access, uploads, downloads, and capacity updates require the admin role.
Deletions also require the admin role and explicit confirmation. Folder deletion
permanently removes all objects under its prefix, including nested folders;
partial failures are reported so remaining files can be retried. Avoid uploading
to a folder while deleting it.
Scoped Admin API tokens additionally need `GetClusterHealth` and
`GetClusterStatistics`, plus the layout/status/bucket permissions listed above.

Node capacity increases use decimal GB and require confirmation. They update
Garage's placement capacity; they do not provision hardware, extend disks, or
enforce a disk quota. Existing zone/tags are preserved. Offline/draining nodes,
decreases, stale layouts, pending layout changes, and values exceeding reported
filesystem size are rejected. App instances serialize updates through the
existing database lease. Avoid editing layouts through other tools during an
update; if an operation fails after staging, review Garage's pending layout
before retrying. File uploads retain the 10 MiB limit.

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
