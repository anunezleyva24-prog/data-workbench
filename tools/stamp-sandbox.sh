#!/usr/bin/env bash
# Run after editing files in sandbox/ so browsers load the new code instead of a cached copy.
set -euo pipefail
cd "$(dirname "$0")/.."
sed -i -E "s/\?v=[0-9]+/?v=$(date +%s)/g" sandbox/index.html
echo "sandbox/index.html stamped"
