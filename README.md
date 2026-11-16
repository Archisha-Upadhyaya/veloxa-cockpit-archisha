# Veloxa CXO Cockpit

An evidence-grounded executive intelligence system for **Veloxa Technologies**, developed for the Hiyaku Systems Individual Hackathon (16–20 November 2026).

Veloxa CXO Cockpit is planned as a single interface for the CEO to ask
questions about the company, inspect the evidence behind answers,
understand conflicting information and identify business risks that need
attention.

## Planned Core Capabilities

- **Executive Intelligence:** Ask company-wide questions and receive concise, evidence-backed answers.
- **Evidence & Reconciliation:** Connect information across documents, transcripts, spreadsheets and company records while preserving source disagreements.
- **Employee Agents:** Interact with 14 employee personas grounded in company data, each with their own role, responsibilities, workload, history and perspective.
- **Risk Intelligence:** Identify and rank business concerns using supporting evidence and explainable reasoning.
- **Point-in-Time Queries:** Reconstruct what the company knew at a particular date without allowing later information to influence historical answers.
- **Uncertainty Handling:** Distinguish verified facts, inferences and assumptions. Acknowledge missing or contradictory evidence instead of presenting guesses as facts.

## Architecture

The application follows a modular monolithic architecture using Next.js. The frontend, API endpoints and application services live in one codebase, with ingestion and database responsibilities separated into dedicated modules.

```text
                    Next.js Application
                            |
              +-------------+-------------+
              |                           |
         Executive UI                API Route Handlers
                                          |
                                   Domain Services
                                          |
           +--------------+---------------+--------------+
           |              |               |              |
        Evidence       Employee          Risk         Temporal
       & Retrieval      Agents        Intelligence     Queries
           |              |               |              |
           +--------------+---------------+--------------+
                                          |
                                PostgreSQL + pgvector
                                          |
                                  Ingestion Pipeline
                                          |
                              Day-wise Source Documents
```

### Data Layer

PostgreSQL is the primary relational data store. pgvector supports semantic retrieval of relevant evidence.

The data model separates source documents, source locations, entities, claims, evidence, conflicts, assumptions and temporal availability. This allows answers to be traced back to their underlying records rather than relying on generated summaries alone.

Supabase PostgreSQL is the intended hosted database target. For local execution and evaluation, the project uses a self-contained PostgreSQL + pgvector Docker environment. A hosted Supabase project is not required to run the application.

## Technology Stack

| Layer | Technology |
|---|---|
| Application | Next.js, React, TypeScript |
| UI | Tailwind CSS |
| API | Next.js Route Handlers, Node.js runtime |
| Database | PostgreSQL |
| Vector Search | pgvector |
| Hosted Database Option | Supabase PostgreSQL |
| AI & Retrieval | LLM-assisted retrieval and evidence-grounded response generation |
| Testing | Vitest |
| Local Environment | Docker Compose |

## Project Structure

```text
src/
├── app/                     # Pages, layouts and API routes
├── components/              # Reusable UI components
├── lib/
│   ├── ai/                  # LLM integration and response generation
│   ├── agents/              # Employee agent profiles and runtime
│   ├── evidence/            # Evidence, claims and source handling
│   ├── ingestion/            # Document parsing and processing
│   ├── risks/               # Risk identification and ranking
│   ├── temporal/            # Point-in-time query handling
│   └── database/            # Database access and queries
└── types/                   # Shared TypeScript types

supabase/
└── migrations/              # Database schema and extensions

scripts/                     # Ingestion, seeding and utility scripts
tests/
├── unit/
├── integration/
└── evaluation/

ARCHITECTURE.md
ASSUMPTIONS.md
TRANSCRIPT_NOTES.md
DECISIONS.md
AI_LOG.md

Dockerfile
docker-compose.yml
```

## Running Locally

The project is designed so that reviewers can run it without creating
external accounts or configuring environment variables. The local stack
uses the same PostgreSQL extensions as the hosted Supabase database.

**Prerequisite:** Docker with Docker Compose support, running on the machine.

```bash
docker compose up --build
```

This single command:

1. Build the Next.js application.
2. Start the local PostgreSQL database with pgvector.
3. Wait for the database health check.
4. Apply the committed database schema on first database startup.
5. Start the application.

Once running, open:

**http://localhost:3000**

No Supabase account, API key, `.env.local` file, manual database setup or
separate migration command is required for the local Docker workflow. The
schema is initialized only when the database volume is first created.

To stop the application, use `Ctrl+C`. To stop and remove the local
containers:

```bash
docker compose down
```

To also delete the local database volume and start with an empty database:

```bash
docker compose down -v
```

## Hosted Supabase deployment

The migration in
[`supabase/migrations/20261117000000_initial_schema.sql`](supabase/migrations/20261117000000_initial_schema.sql)
is now the shared schema for local PostgreSQL and the Supabase project.
Apply it to Supabase with either option below.

### Option A: Supabase SQL Editor

Open the project's SQL Editor, paste the complete migration file, and run
it once:

<https://supabase.com/dashboard/project/ccjbbuvhprwbmmdvkydr/sql/new>

### Option B: Supabase CLI

From the repository root, after installing and authenticating the Supabase
CLI:

```bash
supabase login
supabase link --project-ref ccjbbuvhprwbmmdvkydr
supabase db push
```

For local hosted-database testing, copy `.env.example` to `.env.local`,
then fill in the real values:

```bash
cp .env.example .env.local
```

For deployment, configure the same variables in the deployment provider:
`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_APP_URL`.
Deploy this Next.js application to a Node-compatible host such as
   Vercel. The provider's deployment URL is the deployed link to share.

`DATABASE_URL` must be a server-only secret. Never put a Supabase
service-role key in client code or expose it as a `NEXT_PUBLIC_*` variable.
The current UI is a foundation page; database-backed product features
should be enabled only after their server-side data access modules are
implemented.

### Current integration boundary

The current application has the schema and connection configuration ready,
but the home page does not yet query the database. Database-backed product
features remain the next implementation step.

The local Docker smoke-test runtime is functional without an external LLM
API key. AI-provider integration is planned separately and is not a
prerequisite for starting the current foundation app.

## Documentation

| File | Description |
|---|---|
| `ARCHITECTURE.md` | Application architecture, data model, ingestion pipeline and technical design |
| `ASSUMPTIONS.md` | Explicit assumptions, their rationale and confidence |
| `TRANSCRIPT_NOTES.md` | Transcript interpretation, ambiguous statements and source conflicts |
| `DECISIONS.md` | Architectural and product decisions, alternatives and trade-offs |
| `AI_LOG.md` | AI-assisted work, human review, corrections and accepted outcomes |
| `supabase/migrations/` | Shared PostgreSQL/pgvector schema |
| `.env.example` | Safe template for hosted database and deployment variables |

## Development Status

**Day 1 — Architecture and foundation**

- Reviewed the supplied Day 1 source materials and identified initial information conflicts.
- Established the Next.js modular application architecture.
- Selected PostgreSQL and pgvector for structured storage and semantic retrieval.
- Defined the initial evidence, entity, claim, conflict and temporal data model.
- Established the 14-employee agent scope from the supplied employee master.
- Defined a Docker-based, self-contained local evaluation environment.
- Documented initial assumptions, transcript observations and architectural decisions.

Implementation will progress incrementally as additional release packs become available. Features will be identified as complete only after implementation and testing.

## Project Scope

This is a fictional company intelligence system built exclusively around the materials supplied for the Hiyaku Systems hackathon. Company information, employee details and generated assumptions are treated as fictional project data.

---

**Veloxa CXO Cockpit**  Hiyaku Systems Individual Hackathon · November 2026