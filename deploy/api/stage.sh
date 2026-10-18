#!/bin/sh
# Puts what the API image needs (its code, the shared filing instructions, the Dockerfile) in one folder for Cloud Build.
set -eu
out="${1:-build/api}"
rm -rf "$out"
mkdir -p "$out/api" "$out/src/lib"
cp deploy/api/Dockerfile "$out/"
cp api/package.json api/bun.lock api/server.ts api/read.ts "$out/api/"
cp src/lib/filing.ts "$out/src/lib/"
