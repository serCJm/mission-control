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

exec "$@"
