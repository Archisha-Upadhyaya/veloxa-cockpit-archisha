# Veloxa CXO Cockpit

An evidence-grounded executive intelligence system for **Veloxa Technologies**, developed for the Hiyaku Systems Individual Hackathon (16–20 November 2026).

Veloxa CXO Cockpit gives the CEO a single interface to ask questions about the company, inspect the evidence behind answers, understand conflicting information and identify business risks that need attention.

## Core Capabilities

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

The project is designed so that reviewers can run it without creating external accounts or configuring environment variables.

**Prerequisite:** Docker with Docker Compose support, running on the machine.

```bash
docker compose up --build
```

This single command is intended to:

1. Build the Next.js application.
2. Start the local PostgreSQL database with pgvector.
3. Wait for the database health check.
4. Apply database migrations automatically.
5. Load the supplied Day 1 demonstration data.
6. Start the application.

Once running, open:

**http://localhost:3000**

No Supabase account, API key, `.env.local` file, manual database setup or separate seed command is required for the local evaluation workflow.

The local demonstration mode is designed to remain functional without an external LLM API key. AI-provider integration can be enabled separately, without making it a prerequisite for starting or exploring the application.

To stop the application, use `Ctrl+C`. To stop and remove the local containers:

```bash
docker compose down
```

## Documentation

| File | Description |
|---|---|
| `ARCHITECTURE.md` | Application architecture, data model, ingestion pipeline and technical design |
| `ASSUMPTIONS.md` | Explicit assumptions, their rationale and confidence |
| `TRANSCRIPT_NOTES.md` | Transcript interpretation, ambiguous statements and source conflicts |
| `DECISIONS.md` | Architectural and product decisions, alternatives and trade-offs |
| `AI_LOG.md` | AI-assisted work, human review, corrections and accepted outcomes |

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