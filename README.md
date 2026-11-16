# Veloxa CXO Cockpit

An evidence-grounded executive intelligence system for **Veloxa Technologies**, built for the Hiyaku Systems individual hackathon (16–20 November 2026).

The cockpit gives the CEO one place to ask questions about the company, inspect the records behind an answer, understand conflicting information, and identify what needs attention.

## Core Objectives

- **Executive Q&A** — concise answers supported by traceable source citations.
- **Evidence & Reconciliation** — connect information across company records and transcripts while preserving disagreements instead of silently resolving them.
- **14 Employee Agents** — explore employee roles, responsibilities, workload, history and perspectives, grounded in the supplied company data.
- **Risk Intelligence** — surface and rank evidence-backed business concerns.
- **Point-in-Time Queries** — answer what the company knew at a particular date without exposing information released later.
- **Uncertainty Handling** — distinguish verified facts, inferences and assumptions, and acknowledge when evidence is missing or contradictory.

## Architecture

The application uses a single Next.js codebase. UI, API endpoints and application services remain together, while ingestion and database responsibilities are separated into dedicated modules.

```text
                  Next.js Application
                          |
             +------------+------------+
             |                         |
         Dashboard                Route Handlers
                                       |
                                Domain Services
                                       |
             +------------+------------+------------+
             |            |            |            |
          Evidence     Employee      Risk       Temporal
         & Retrieval     Agents    Intelligence   Queries
             |            |            |            |
             +------------+------------+------------+
                                       |
                              Supabase PostgreSQL
                                  + pgvector
                                       |
                              Ingestion & Indexing
```

## Technology Stack

| Layer | Technology |
|---|---|
| Application | Next.js, React, TypeScript |
| UI | Tailwind CSS |
| API | Next.js Route Handlers (Node.js runtime) |
| Database | Supabase PostgreSQL |
| Vector Search | pgvector |
| Validation | Zod |
| AI & Retrieval | LLM-assisted retrieval and evidence-grounded response generation |
| Testing | Vitest |

## Project Structure

```text
src/
├── app/                 # Pages, layouts and API routes
├── components/          # Reusable UI components
├── lib/
│   ├── agents/          # Employee agent logic
│   ├── ai/              # LLM and retrieval services
│   ├── evidence/        # Evidence and source handling
│   ├── ingestion/       # Document ingestion and processing
│   ├── risks/           # Risk identification and ranking
│   ├── temporal/        # Point-in-time query logic
│   └── supabase/        # Database clients and queries
└── types/               # Shared TypeScript types

supabase/
└── migrations/          # Database schema and pgvector setup

scripts/                 # Setup, ingestion and utility scripts
tests/                   # Automated tests

ARCHITECTURE.md
ASSUMPTIONS.md
TRANSCRIPT_NOTES.md
DECISIONS.md
AI_LOG.md
```

## Setup

**Prerequisites:** Node.js, npm and a configured Supabase project.

Configure the required Supabase credentials in `.env.local` using `.env.example` as the reference.

```bash
npm run setup
```

The setup script is intended to install dependencies, validate configuration and prepare the database schema. Start the application with:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Documentation

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | System design, data flow and technical decisions |
| `ASSUMPTIONS.md` | Explicit assumptions, rationale and confidence |
| `TRANSCRIPT_NOTES.md` | Transcript analysis, mishearings and source conflicts |
| `DECISIONS.md` | Product and architectural decisions, including justified pushback |
| `AI_LOG.md` | AI-assisted work, verification and corrections |

## Development Status

**Day 1 — Initial architecture and application scaffold**

- Next.js application initialized with TypeScript.
- Application architecture and technology choices established.
- Supabase PostgreSQL with pgvector selected as the data layer.
- Core domain modules and database structure planned.
- Implementation of ingestion, evidence retrieval, employee agents, executive Q&A, risk intelligence and automated evaluation will progress as the release packs arrive.

---

*Veloxa CXO Cockpit · Hiyaku Systems Hackathon · November 2026*