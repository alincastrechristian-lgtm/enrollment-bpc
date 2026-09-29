#!/bin/sh
set -eu

data_dir="/app/data"

mkdir -p "$data_dir"

# Ensure the node user can write to the data directory.
chown -R node:node "$data_dir"

su-exec node node /app/scripts/migrate.mjs
exec su-exec node node /app/build