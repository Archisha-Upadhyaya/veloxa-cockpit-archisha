#!/bin/sh
set -eu

# One-time (and repeat-safe) bootstrap for the local Docker stack.
# The sync ingests the release packs and the people directory; when files are
# new or changed, the app itself embeds them and builds the brief in the
# background (pacing itself for API quotas). Set GEMINI_API_KEYS in .env.local
# (one or more comma-separated keys) for AI analysis, chat and semantic search;
# without keys the documents, people, time machine and keyword search still
# work, but no concerns are generated.

BASE_URL="${APP_URL:-http://app:3000}"
# The app requires sign-in; trusted jobs use the shared session secret.
AUTH="Authorization: Bearer ${VELOXA_SESSION_SECRET:-}"

echo "Waiting for the cockpit API…"
until curl -fsS -H "${AUTH}" "${BASE_URL}/api/people" >/dev/null 2>&1; do
  sleep 2
done

echo "Ingesting the release packs and the people directory…"
attempt=0
until response="$(curl -fsS -H "${AUTH}" -X POST "${BASE_URL}/api/sync")"; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 30 ]; then
    echo "Ingestion did not succeed after 30 attempts." >&2
    exit 1
  fi
  sleep 3
done
echo "${response}"
echo

if echo "${response}" | grep -q '"reanalysing":true'; then
  echo "New documents found: the app is embedding them and building the brief in the background (a few minutes)."
else
  echo "Nothing new to ingest; the existing brief is kept."
fi
echo "Local bootstrap complete. Open the app in your browser."
