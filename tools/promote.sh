#!/usr/bin/env bash
# Copy the reviewed sandbox code to the live site (the repository root).
# config.js is not copied: the live site keeps its own configuration and its own data.
set -euo pipefail
cd "$(dirname "$0")/.."
cp sandbox/app.js app.js
cp sandbox/core.js core.js
sed -e 's#src="\.\./lib/#src="lib/#g' -E -e "s/\?v=[0-9]+/?v=$(date +%s)/g" sandbox/index.html > index.html
echo "Live files updated from sandbox/. Review with 'git diff', then commit and push."
