#!/usr/bin/env bash
set -euo pipefail

VAULT_ROOT="${AGENCY_HQ_VAULT_ROOT:-/Users/agent/Library/CloudStorage/GoogleDrive-ops.daz813@gmail.com/.shortcut-targets-by-id/1Gr2uU6GpxaESaYoYpua94NbXRPlQMK1e/Vault/Vault}"
DEST="$VAULT_ROOT/Agency HQ"

mkdir -p "$DEST"
rsync -a --delete \
  --exclude node_modules \
  "$(cd "$(dirname "$0")/.." && pwd)/" \
  "$DEST/"

echo "Installed to: $DEST"
