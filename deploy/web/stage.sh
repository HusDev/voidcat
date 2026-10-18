#!/bin/sh
# Puts what the web image needs (Dockerfile, nginx settings, the built app) in one folder for Cloud Build.
set -eu
out="${1:-build/web}"
rm -rf "$out"
mkdir -p "$out"
cp deploy/web/Dockerfile deploy/web/nginx.conf deploy/web/headers.conf "$out/"
cp -R dist "$out/dist"
