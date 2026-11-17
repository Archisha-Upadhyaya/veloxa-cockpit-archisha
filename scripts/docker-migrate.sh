#!/bin/sh
set -eu

until pg_isready -h db -U veloxa -d veloxa >/dev/null 2>&1; do
  sleep 1
done

# Migrations are written to be idempotent. Applying every file on every start
# keeps a long-lived Docker volume in lockstep with the hosted Supabase schema.
for file in /migrations/*.sql; do
  echo "Applying ${file}"
  psql -h db -U veloxa -d veloxa -v ON_ERROR_STOP=1 -f "${file}"
done

echo "Migrations complete."
