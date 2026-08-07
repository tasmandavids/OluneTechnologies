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
echo "=== Seeding test admin ==="
npm run seed:platform-admin

echo ""
echo "=== Done ==="
echo "  Email:    platform-admin@olune.test"
echo "  Password: testadmin123"
echo "  Console:  /platform and /portal/admin"
