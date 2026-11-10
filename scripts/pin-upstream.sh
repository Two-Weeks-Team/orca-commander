#!/usr/bin/env bash
set -euo pipefail
REF="${1:-main}"
mkdir -p vendor
if [[ ! -d vendor/orca/.git ]]; then
  git clone https://github.com/stablyai/orca.git vendor/orca
fi
git -C vendor/orca fetch origin "$REF"
git -C vendor/orca checkout --detach FETCH_HEAD
printf 'Upstream SHA: '
git -C vendor/orca rev-parse HEAD
echo 'Record SHA in docs/UPSTREAM.md'
