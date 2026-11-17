#!/bin/sh
set -eu

BASE_URL="${APP_URL:-http://app:3000}"

echo "Waiting for the cockpit API…"
until curl -fsS "${BASE_URL}/api/dashboard" >/dev/null 2>&1; do
  sleep 2
done

echo "Ingesting the release packs…"
attempt=0
while :; do
  if response="$(curl -fsS -X POST "${BASE_URL}/api/sync")"; then
    echo "${response}"
    break
  fi
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 30 ]; then
    echo "Ingestion did not succeed after 30 attempts." >&2
    exit 1
  fi
  sleep 2
done
echo

echo "Creating embeddings in batches…"
attempt=0
while [ "${attempt}" -lt 60 ]; do
  response="$(curl -fsS -X POST "${BASE_URL}/api/embed")" || {
    echo "Embedding request failed." >&2
    exit 1
  }
  echo "${response}"
  if echo "${response}" | grep -q '"complete":true'; then
    break
  fi
  attempt=$((attempt + 1))
done

echo "Running concern analysis…"
curl -fsS -m 240 -X POST "${BASE_URL}/api/analyze" || true
echo

echo "Local bootstrap complete."
