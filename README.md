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

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
