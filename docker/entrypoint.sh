#!/bin/sh

set -eu

snapshot_directory="node_modules/.package-snapshots"

if ! cmp -s package.json "$snapshot_directory/package.json" ||
  ! cmp -s package-lock.json "$snapshot_directory/package-lock.json"; then
  echo "Package manifests changed; refreshing container dependencies"
  npm ci
  mkdir -p "$snapshot_directory"
  cp package.json package-lock.json "$snapshot_directory"
fi

# The bind-mounted vinext state can outlive its container. A replacement
# development container cannot share a running process with the old container,
# so any retained dev-server lock is stale.
if [ "${1:-}" = "npm" ] && [ "${2:-}" = "run" ] && [ "${3:-}" = "dev" ]; then
  rm -f .vinext/dev/lock.json
fi

exec "$@"
