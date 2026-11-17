# Veloxa CXO Cockpit

An evidence-grounded executive cockpit for **Veloxa Technologies**, built for the
Hiyaku Systems Individual Hackathon (16–20 November 2026).

The CEO can ask company-wide questions, read short supporting extracts, inspect
open concerns, and talk to employee agents whose answers stay grounded in the
released material. Every visible extract is sanitised: the cockpit shows a
sentence a person can read, never a CSV row, a table, or a raw document chunk.

## What works today

- **Company overview** — headcount, open concerns, latest sources, and a
  three-item priority list. The overview never tries to show every concern.
- **Concern register** — all open and watch items, ranked by severity,
  likelihood, and recency. Every concern opens a detail page with short
  evidence and a confidentiality notice when material is withheld.
- **Evidence-grounded search** — `/api/retrieve` returns deduplicated snippets
  with source and date labels, not raw chunks.
- **Employee agents** — 14 employee personas. Answers sound like a colleague:
  they use first person, admit what they do not know, and never expose pay or
  quote internal records. Pay questions get a short, polite refusal.
- **Ingestion** — Day-wise release packs are scanned from `transcripts/` and
  `data_room/`, hashed, and re-ingested only when changed. Earlier release days
  are unavailable to later as-of queries.
- **Risk analysis** — 5–10 grounded concerns at most, not a forced three. When
  the model is unavailable, deterministic evidence-derived concerns keep the
  cockpit usable.
- **Two database paths, one schema** — hosted Supabase PostgreSQL and a
  self-contained Docker stack apply the same migrations and use the same API
  client. No feature depends on a hosted-only service.

Payroll registers, payslips, and named individual pay are marked sensitive at
ingestion and read time. They are never embedded, retrieved, sent to a model,
or rendered in the UI. Aggregate payroll totals remain available for financial
analysis.

## Quick start with Docker

Prerequisite: Docker with Docker Compose support.

```bash
docker compose up --build
```

Open **http://localhost:3000**.

The stack starts PostgreSQL with pgvector, applies every migration, seeds the
reviewed baseline, starts the Next.js app, then runs the bootstrap job:
`sync → embed → analyze`. Bootstrap is safe to repeat: ingestion skips unchanged
files, embeddings only fill gaps, and analysis updates concerns by fingerprint.

Data lives in the named volume `veloxa-postgres` and survives rebuilds:

```bash
docker compose down      # stop, keep data
docker compose down -v   # stop and delete the local database
```

### Ports already in use?

The host ports are configurable:

```bash
VELOXA_APP_PORT=3100 \
VELOXA_API_PORT=3101 \
VELOXA_DB_PORT=55432 \
docker compose up --build
```

Then open **http://localhost:3100**. The app container still reaches PostgREST
through the internal `gateway` service; only the host mappings change.

### Without an AI key

The stack runs without `GEMINI_API_KEY`. In that mode it uses:

- deterministic local embeddings for retrieval,
- a deterministic chat fallback for employee agents,
- deterministic evidence-derived concerns when analysis is unavailable.

With `GEMINI_API_KEY` set in `.env.local`, Gemini handles chat, risk analysis,
and embeddings (1536 dimensions). If Gemini is rate-limited, each path falls
back instead of failing the request.

## Hosted Supabase

The Docker database and a hosted Supabase project use the same migrations in
`supabase/migrations/`:

```text
20261117000000_initial_schema.sql
20261117210000_ingestion_and_analysis.sql
20261117230000_evidence_safety.sql
```

Apply all three, in order, with either the Supabase SQL Editor or the CLI:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For a hosted deployment, copy `.env.example` to `.env.local` and set:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_APP_URL=https://your-app.example.com
```

`SUPABASE_SECRET_KEY` is server-only and must never be exposed as a
`NEXT_PUBLIC_*` variable. `NEXT_PUBLIC_SUPABASE_URL` remains supported as a
fallback for existing deployments, but new deployments should use
`SUPABASE_URL`. The app does not need a browser-side Supabase client.

Seed and index a hosted database:

```bash
pnpm seed:supabase
pnpm embed:supabase
```

Then call the trusted server operations, or run them from a scheduler/worker:

```bash
curl -X POST https://your-app.example.com/api/sync
curl -X POST https://your-app.example.com/api/embed
curl -X POST https://your-app.example.com/api/analyze
```

A local run against hosted Supabase works the same way: fill in `.env.local`,
then `pnpm dev`.

## API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/dashboard` | Overview metrics, latest sources, top three concerns |
| `GET /api/risks` | All open/watch concerns, deduplicated and ranked |
| `GET /api/risks/[riskKey]` | One concern with short evidence extracts |
| `GET /api/people` | Directory-safe employee profiles |
| `POST /api/people/[employeeKey]/chat` | Human-style employee answer with safe context |
| `POST /api/retrieve` | Semantic search returning deduplicated snippets |
| `POST /api/sync` | Incremental release-pack ingestion |
| `POST /api/embed` | Quota-safe embedding batches |
| `POST /api/analyze` | Grounded concern analysis, 5–10 concerns maximum |

`sync`, `embed`, and `analyze` are trusted server operations. They are not
protected by a public login in this hackathon build, so do not expose them as
unauthenticated production endpoints without adding access control.

## How evidence is made safe

The raw evidence store keeps source text for traceability. Presentation is a
separate layer in `src/lib/evidence/snippet.ts`:

1. Payroll registers, payslips, and named individual pay are detected and
   returned as `sensitive` with no summary.
2. CSV exports, metric tables, and multi-row dumps are rejected.
3. One or two short, self-contained sentences are extracted with the source and
   date. The hard limit is 300 characters.
4. Duplicate facts from a curated citation and the ingested file are merged.
5. Model output passes the same guard: no pay, no raw dump, no record or
   retrieval jargon.

The shared prompt rules live in `src/lib/ai/prompts.ts`. They instruct the model
to answer in plain language, never quote a chunk or table, never reveal
individual pay, and never invent a number that is not in the safe context.

## Development

```bash
pnpm install
pnpm dev
```

Quality checks:

```bash
pnpm test               # Vitest: safety, snippet, ranking, refusal
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

The Docker image runs the production build:

```bash
docker build --target runner -t veloxa-cockpit .
```

## Project structure

```text
src/
├── app/                     # Pages and API route handlers
│   ├── api/                 # dashboard, risks, people, retrieve, sync, embed, analyze
│   ├── people/              # employee directory
│   └── risks/               # concern register and detail pages
├── components/              # Dashboard, RisksView, RiskDetailView, PeopleDirectory
└── lib/
    ├── ai/                  # Gemini adapter and shared safety prompts
    ├── analysis/            # concern schema, ranking, fallback descriptions
    ├── evidence/            # snippet extraction, dedupe, sensitivity, chat guard
    ├── ingestion/           # file discovery, parsing, chunking
    ├── rag/                 # embeddings and retrieval
    └── supabase/            # trusted server client

supabase/migrations/         # shared schema for Docker and hosted Supabase
scripts/                     # seed, embed, Docker migration and bootstrap jobs
tests/unit/                  # Vitest safety and ranking tests
docker/nginx.conf            # /rest/v1 gateway for the Supabase JS client
```

## Documentation

| File | Contents |
|---|---|
| `ARCHITECTURE.md` | Application architecture, data model, ingestion and retrieval |
| `ASSUMPTIONS.md` | Explicit assumptions and confidence |
| `TRANSCRIPT_NOTES.md` | Transcript interpretation and source conflicts |
| `DECISIONS.md` | Product and technical decisions and trade-offs |
| `AI_LOG.md` | AI-assisted work, review, and corrections |
| `.env.example` | Hosted and local configuration template |

## Scope

This is a fictional company intelligence system built exclusively around the
materials supplied for the Hiyaku Systems hackathon. Company information,
employee details, and generated assumptions are fictional project data.

---

**Veloxa CXO Cockpit** · Hiyaku Systems Individual Hackathon · November 2026
