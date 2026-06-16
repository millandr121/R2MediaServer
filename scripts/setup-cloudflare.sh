#!/usr/bin/env bash
#
# One-shot Cloudflare resource setup for the R2 Media Server backend.
#
# Run this on YOUR machine after authenticating:
#   npx wrangler login
#   bash scripts/setup-cloudflare.sh
#
# It creates the R2 bucket, D1 database, and KV namespace, applies the DB
# schema, and writes the real IDs into apps/api/wrangler.toml.
#
# It NEVER touches secrets (JWT_SECRET, R2 keys) — those are set separately
# with `wrangler secret put` and must never be committed.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
API_DIR="apps/api"
BUCKET="r2-media-server"
DB_NAME="r2-media-server"
KV_BINDING="SESSIONS"

echo "==> Authenticated as:"
npx wrangler whoami || { echo "Run 'npx wrangler login' first."; exit 1; }

echo "==> Creating R2 bucket '$BUCKET' (ok if it already exists)..."
npx wrangler r2 bucket create "$BUCKET" 2>&1 | sed 's/^/   /'

echo "==> Creating D1 database '$DB_NAME' (ok if it already exists)..."
npx wrangler d1 create "$DB_NAME" 2>&1 | sed 's/^/   /'

echo "==> Creating KV namespace '$KV_BINDING' (ok if it already exists)..."
npx wrangler kv namespace create "$KV_BINDING" 2>&1 | sed 's/^/   /'

echo "==> Resolving resource IDs..."
DB_ID=$(npx wrangler d1 list --json 2>/dev/null | jq -r ".[] | select(.name==\"$DB_NAME\") | .uuid" | head -1)
KV_ID=$(npx wrangler kv namespace list 2>/dev/null | jq -r ".[] | select(.title==\"$KV_BINDING\") | .id" | head -1)
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(npx wrangler whoami 2>/dev/null | grep -oiE '[0-9a-f]{32}' | head -1)}"

echo
echo "   D1 database_id : ${DB_ID:-<not found — fill in manually>}"
echo "   KV namespace id: ${KV_ID:-<not found — fill in manually>}"
echo "   R2 account id  : ${ACCOUNT_ID:-<not found — fill in manually>}"
echo

# Patch wrangler.toml in place.
TOML="$API_DIR/wrangler.toml"
[[ -n "${DB_ID:-}" ]]      && sed -i.bak "s/REPLACE_WITH_D1_DATABASE_ID/$DB_ID/" "$TOML"
[[ -n "${KV_ID:-}" ]]      && sed -i.bak "s/REPLACE_WITH_KV_NAMESPACE_ID/$KV_ID/" "$TOML"
[[ -n "${ACCOUNT_ID:-}" ]] && sed -i.bak "s|^R2_ACCOUNT_ID = \"\"|R2_ACCOUNT_ID = \"$ACCOUNT_ID\"|" "$TOML"
rm -f "$TOML.bak"

echo "==> Applying the database schema to the remote D1..."
npx wrangler d1 execute "$DB_NAME" --remote --file="$API_DIR/schema.sql"

cat <<EOF

============================================================
Resources are ready. Two things left (see README for detail):

1. Set the runtime secrets (these never go in the repo):
     cd $API_DIR
     npx wrangler secret put JWT_SECRET
     npx wrangler secret put R2_ACCESS_KEY_ID
     npx wrangler secret put R2_SECRET_ACCESS_KEY

2. Commit & push the updated wrangler.toml so Workers Builds
   deploys with the real IDs — OR paste the three IDs above to
   Claude and it will commit them for you.
============================================================
EOF
