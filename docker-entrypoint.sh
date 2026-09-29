#!/bin/sh
set -eu

data_dir="$(dirname "$DATABASE_URL")"
mkdir -p "$data_dir"

# Bind-mounted host folders may be owned by root or the host user.
chown -R node:node "$data_dir"

su-exec node node /app/scripts/migrate.mjs
exec su-exec node node /app/build
