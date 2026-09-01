#!/usr/bin/env bash
# One command: remote migrations + seed (+ local if Docker is running).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Olune full database setup ==="
echo ""

bash scripts/db-sync.sh "$@" || {
  echo ""
  echo "Remote/local sync failed. If you lack CLI credentials:"
  echo "  Add GitHub secrets and run the 'Supabase Database Sync' workflow"
  echo "  (see docs/SETUP_DATABASE.md). Do not paste migrations into the"
  echo "  SQL Editor by hand — that desyncs the migration history."
  exit 1
}

echo ""
echo "=== Done ==="
echo ""
echo "Migrations are applied. This script no longer seeds a platform operator:"
echo "that account is a cross-tenant superuser and is created deliberately, with"
echo "a password you supply. To create one against a local or preview database:"
echo ""
echo "  ALLOW_PLATFORM_ADMIN_SEED=1 \\"
echo "  PLATFORM_ADMIN_PASSWORD=\"\$(openssl rand -base64 24)\" \\"
echo "    npm run seed:platform-admin"
echo ""
echo "See TEST_ACCOUNTS.md."
