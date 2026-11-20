# Veloxa CXO Cockpit

An evidence-grounded executive cockpit for **Veloxa Technologies**, built for the
Hiyaku Systems Individual Hackathon (16–20 November 2026).

The CEO can ask company-wide questions, read short supporting extracts, inspect
open concerns, and talk to employee agents whose answers stay grounded in the
released material. Every visible extract is sanitised: the cockpit shows a
sentence a person can read, never a CSV row, a table, or a raw document chunk.

## Live demo

**https://veloxa-cockpit.vercel.app** — sign in with `ceo` / `veloxa-brief`.

The deployment runs against a hosted Supabase project with the Day 1–4 release
packs ingested and live Gemini analysis enabled.

## What works today

- **Morning brief (overview)** — greets the CEO by name and shows the three
  most important concerns above the fold, each with the facts, a next step,
  its evidence and a "Talk to …" button for the right person. If documents
  arrived after the brief was built, it says so and offers to update it.
- **Concern register** — all open items, ranked by severity × confidence.
  Each concern's page shows what the records say, why it matters, the next
  step, and every supporting record with the reason it counts.
- **Ask anything** — `/api/ask` answers the CEO's questions from all released
  records with numbered citations, preferring company records over call
  transcripts and flagging conflicts.
- **Company health check** — on demand, a status for 5–8 business areas
  (clients and revenue, cash and spending, delivery…) with a contact for each;
  the last result is saved.
- **Employee chat** — 14 personas, chosen by how much each person appears in
  the documents. Each has a voice generated from their own records, addresses
  the CEO by name, admits what they do not know, and never exposes pay. A
  conversation started in the side panel continues on its full page
  (`/chat/[person]`) and lasts until it is ended or the CEO signs out.
- **Time machine** — view the company as known at the end of any past day:
  documents, concerns, who had joined, who was on leave or had left.
- **Brief as PDF** — `/report`, an A4 document with letterhead that opens like
  a preview (click outside or press Esc to close) and saves as PDF.
- **Dark mode and phones** — light/dark/system theme; bottom tab bar on
  mobile.
- **Reporting line and reorganisations** — the directory comes from the HR
  master's `Manager ID`; planned moves are dated changes that apply only when
  confirmed and safe (see `DECISIONS.md` D-027).
- **Ingestion** — Day-wise release packs are scanned from `transcripts/` and
  `data_room/`, hashed, and re-ingested only when changed. Earlier release days
  are unavailable to later as-of queries.
- **Risk analysis** — each data-room folder is analysed separately, then
  consolidated into distinct concerns, each citing its records and saying why
  each one counts. When no model is available, the last stored brief is kept;
  nothing is invented in its place.
- **Two database paths, one schema** — hosted Supabase PostgreSQL and a
  self-contained Docker stack apply the same migrations and use the same API
  client. No feature depends on a hosted-only service.

Payroll registers, payslips, and named individual pay are marked sensitive at
ingestion and read time. They are never embedded, retrieved, sent to a model,
or rendered in the UI. Aggregate payroll totals remain available for financial
analysis.

## One-command local setup

Everything (database, API, app, data) runs in Docker. No Supabase account is
needed, and nothing touches a hosted database.

**You need:** Docker with Compose, and this repository including the
`Veloxa_Hackathon_Release_Packs/` folder.

```bash
docker compose up --build
```

Then open **http://localhost:3000** and sign in:

| Username | Password |
|---|---|
| `ceo` | `veloxa-brief` |

These are placeholder credentials, configurable through `VELOXA_USERNAME`,
`VELOXA_PASSWORD` and `VELOXA_SESSION_SECRET`. Every page and API sits behind
sign-in; a signed-out visit goes to `/login` and returns to the page
afterwards. Signing out also clears any open chats.

That one command:

1. starts PostgreSQL with pgvector and applies every migration in
   `supabase/migrations/`;
2. starts PostgREST behind a small gateway, so the app talks to the local
   database exactly as it would to Supabase;
3. builds and starts the app;
4. runs a bootstrap job that ingests the release packs (Day 1–4) and the
   people directory; the app then embeds the documents and builds the brief
   in the background (a few minutes on the free Gemini tier).

It is safe to run again: unchanged files are skipped and existing data is
kept.

The release packs are committed in this repository, so a fresh clone has the
Day 1–4 material the bootstrap needs.

### Test set

The cockpit ships with 30 questions and the answers it must stand behind:

```bash
pnpm install
pnpm test
```

That runs the unit tests and the acceptance set. To run only the acceptance
set:

```bash
pnpm test:cockpit
```

The questions cover policy refusals, point-in-time boundaries, grounded facts,
missing records and recorded conflicts. `TEST_SET.md` is the human-readable
version; `tests/acceptance/cockpit.test.ts` is the executable one. The suite is
deterministic and needs no database, model key or network connection.

### Optional: AI features

Create `.env.local` with one or more Gemini keys (copy `.env.example`) before
starting. Separate multiple keys with commas; the app rotates to the next key
when one hits its per-minute quota:

```bash
GEMINI_API_KEYS=key-one,key-two,key-three
```

A single key works. The legacy `GEMINI_API_KEY` name is still accepted.

| | With a key | Without a key |
|---|---|---|
| Documents, people, reporting line, time machine, PDF brief | ✓ | ✓ |
| Concerns, health check, retention watch | ✓ | – (nothing is invented in their place) |
| Ask and employee chat | full answers | stored extracts / record-based replies |
| Search | semantic | keyword |

Docker always uses its own local database: the Supabase URL and key in
`.env.local` are overridden inside the stack, so a hosted project is never
touched.

### Stop, reset, rebuild

```bash
docker compose down        # stop; data is kept in the veloxa-postgres volume
docker compose down -v     # stop and delete the local database
docker compose up --build  # rebuild after pulling new code
```

### Ports already in use?

```bash
VELOXA_APP_PORT=3100 VELOXA_API_PORT=3101 VELOXA_DB_PORT=55432 docker compose up --build
```

Then open **http://localhost:3100**. Defaults are 3000 (app), 3001 (API
gateway) and 5432 (PostgreSQL).

### Developing locally instead

For live reload against a hosted Supabase project, use `pnpm install` and
`pnpm dev` with `.env.local` filled in (see below). Run one dev server per
project folder.

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

`SUPABASE_SECRET_KEY` is read only on the server; the app has no
browser-side Supabase client. `SUPABASE_URL` is the primary setting, with
`NEXT_PUBLIC_SUPABASE_URL` accepted as a fallback.

What gets ingested: the Day 1–4 release packs (`VELOXA_RELEASE_DAYS`,
default `Day1,Day2,Day3,Day4`). Data-room files are primary evidence; call transcripts are
secondary. CEO voice notes (`T6*`) are never ingested.

Models: each task has its own failover chain (`GEMINI_ANALYSIS_MODELS`,
`GEMINI_CHAT_MODELS`); see `src/lib/ai/gemini.ts` for the verified defaults.

There is no hand-written seed data. Everything comes from the release packs:
documents and evidence from `/api/sync`, the people directory (including the
reporting line) from the latest released `Employee_Master.xlsx`, and concerns
from `/api/analyze`. To clear rows left by the old static seed:

```bash
pnpm purge:seeded --dry-run   # count what would be removed
pnpm purge:seeded
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
| `GET /api/dashboard` | Morning brief: CEO, counts, ranked concerns, whether the brief is out of date |
| `GET /api/cockpit` | Everything above in one response (`?refresh=1` re-runs analysis first) |
| `GET /api/risks` | All open/watch concerns, deduplicated and ranked |
| `GET /api/risks/[riskKey]` | One concern, its owner, and evidence with "why this counts" |
| `GET /api/people` | Directory in reporting-line order, personas, pending reporting changes |
| `POST /api/people/[employeeKey]/chat` | Persona reply, with conversation history |
| `POST /api/ask` | Answer to any CEO question, with numbered sources |
| `GET`/`POST /api/health-check` | Last saved health check / run a new one |
| `GET`/`POST /api/org-changes`, `PATCH /api/org-changes/[id]` | Reporting-line changes |
| `GET`/`POST /api/retention-check` | Last saved / new retention watch: who to check in with and why (work records only) |
| `POST`/`DELETE /api/people/[employeeKey]/report` | Record or clear a status the CEO reports (e.g. a resignation) before HR records show it |
| any `GET` above with `?asOf=YYYY-MM-DD` | The same view as known at the end of that day (the time machine sets this as a cookie) |
| `POST /api/retrieve` | Search returning deduplicated snippets (keyword fallback) |
| `POST /api/sync` | Incremental release-pack ingestion |
| `POST /api/embed` | Quota-safe embedding batches |
| `POST /api/analyze` | Concern analysis by folder, then consolidated; keeps stored concerns if no model answers |

Like every route, these require sign-in. Server jobs (the Docker bootstrap)
call them with `Authorization: Bearer <VELOXA_SESSION_SECRET>`.

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
pnpm test               # 87 tests: 30 cockpit questions + 57 unit tests
pnpm test:cockpit       # only the 30-question acceptance set
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
scripts/                     # purge-seeded, sync-employees, embed, Docker migration and bootstrap jobs
tests/unit/                  # Vitest safety and ranking tests
tests/acceptance/            # 30 cockpit questions with expected answers
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
| `TEST_SET.md` | The 30 questions and the answers the cockpit must stand behind |
| `.env.example` | Hosted and local configuration template |

## Scope

This is a fictional company intelligence system built exclusively around the
materials supplied for the Hiyaku Systems hackathon. Company information,
employee details, and generated assumptions are fictional project data.

---

**Veloxa CXO Cockpit** · Hiyaku Systems Individual Hackathon · November 2026
