# AI Log — Veloxa CXO Cockpit

**Project:** Veloxa CXO Cockpit  
**Hackathon:** Hiyaku Systems Individual Hackathon  
**Log period:** Day 1 — 16 November 2026  
**Purpose:** Record where AI assistance was used during analysis and development, what was retained or changed, and how the final decisions were reviewed. This is a working project log, not a transcript of every prompt.

---

## AI-001 — Review of the Day 1 release pack

**Work item:** Source-pack inventory and initial understanding

- **AI assistance:** Used to inspect the supplied ZIP structure, identify the Day 1 files and organise the source material into a usable inventory.
- **Candidate review:** Checked the inventory against the release-pack contents and removed references to files that were mentioned in the data-room notes but were not actually present in the Day 1 pack.
- **Edits made:** Kept the initial scope limited to the CEO and CFO transcripts, employee master, finance workbooks, payroll register, board updates, email threads and supplied templates.
- **Outcome:** Day 1 source inventory accepted as the starting point for ingestion planning.
- **Status:** Reviewed and edited.

## AI-002 — CEO and CFO transcript analysis

**Work item:** Extract key statements, uncertainties and cross-source questions from T1 and T2.

- **AI assistance:** Used to organise transcript observations into themes such as ARR, burn, headcount, Atlas delivery, finance processes, payroll confidentiality, attrition and marketing spend.
- **Candidate review:** Compared the observations with the supplied structured records and retained uncertain wording where the transcript did not establish an exact value or name.
- **Edits made:** Kept ambiguous expressions separate from normalized interpretations; avoided treating approximate spoken figures or potentially misheard tool names as confirmed facts. Transcript claims that require corroboration remain marked as such in `TRANSCRIPT_NOTES.md`.
- **Outcome:** Transcript notes provide investigation leads and source references rather than silently resolving discrepancies.
- **Status:** Reviewed and edited.

## AI-003 — Employee roster and agent scope

**Work item:** Determine the initial 14-person agent roster from the Day 1 employee data and challenge brief.

- **AI assistance:** Used to group the roster by department and consider a reusable agent design.
- **Candidate review:** Checked the proposed roster against the employee master and the requirement for 14 employee agents.
- **Edits made:** Kept the 14 profiles distinct while choosing one shared runtime and shared company evidence store. Employee-specific perspectives are represented in profile configuration rather than separate autonomous systems with independent company facts.
- **Outcome:** Initial roster and shared-runtime approach documented in `ARCHITECTURE.md` and `ASSUMPTIONS.md`.
- **Status:** Reviewed and edited.

## AI-004 — Application architecture and technology selection

**Work item:** Select an implementation architecture for the cockpit.

- **AI assistance:** Used to compare a Next.js-only application with a separate React/Express arrangement and to outline service boundaries.
- **Candidate review:** Chose the Next.js App Router approach because it matches the candidate's strongest and most explainable implementation experience; a second server framework was not added merely to increase the technology count.
- **Edits made:** Retained a modular application structure with route handlers, domain/application services, infrastructure adapters and separate ingestion scripts. PostgreSQL is the source of truth; pgvector is used for semantic evidence discovery, not as a replacement for relational records.
- **Outcome:** The architecture is documented as a modular Next.js application with clear boundaries and room to extract a worker later if workload justifies it.
- **Status:** Reviewed and edited.

## AI-005 — Database and reviewer setup design

**Work item:** Make the project runnable by a reviewer without a personal hosted database project.

- **AI assistance:** Used to propose a Docker-based local development and review environment.
- **Candidate review:** Rejected a setup flow that required each reviewer to create a Supabase project, enter credentials, configure environment files, run migrations manually or obtain an LLM API key.
- **Edits made:** Set the required clean-clone command to `docker compose up --build`. The planned Compose stack included the Next.js application, PostgreSQL with pgvector and database readiness checks. Database initialization and Day 1 source ingestion remain separate.
- **Technology clarification:** The local reviewer database is standard PostgreSQL + pgvector. Supabase PostgreSQL remains the intended hosted deployment target; a reviewer does not need a Supabase account or Supabase CLI to run the local version.
- **Outcome:** README setup instructions now describe the single-command Docker workflow and its one environmental prerequisite: Docker with Compose.
- **Status:** Reviewed and edited. The Docker runtime was implemented and
  verified in AI-009; database initialization was added after the Supabase
  project became available.

## AI-006 — Evidence, conflicts and temporal data model

**Work item:** Plan how the application will represent source material and answer historical questions.

- **AI assistance:** Used to propose source-document, source-location, entity, claim, evidence, conflict and assumption records, including separate valid-time and recorded/available-time fields.
- **Candidate review:** Kept the distinction between when a fact applies and when the company/system could have known it. This is necessary to answer point-in-time questions without using later releases as earlier knowledge.
- **Edits made:** Positioned structured evidence and temporal filtering ahead of semantic retrieval. pgvector is an aid to finding candidate evidence; final answers must still be grounded in retrievable source records.
- **Outcome:** Temporal and evidence requirements are included in the architecture plan and implementation sequence.
- **Status:** Reviewed and edited.

## AI-007 — Payroll confidentiality boundary

**Work item:** Translate the CFO's payroll instruction into an enforceable application rule.

- **AI assistance:** Used to identify the technical implications of showing only payroll totals to the CEO.
- **Candidate review:** Confirmed that a prompt instruction alone would not be a sufficient safeguard.
- **Edits made:** Documented the requirement to keep individual salary data out of CEO-facing retrieval, embeddings, prompts, application logs and responses. Any permitted payroll summary must be produced through a controlled aggregate-only path.
- **Outcome:** Payroll confidentiality is treated as an access and data-flow constraint, with leakage tests included in the planned evaluation suite.
- **Status:** Reviewed and edited; enforcement and tests remain implementation tasks.

## AI-008 — README and project documentation

**Work item:** Draft and refine the Day 1 project documentation.

- **AI assistance:** Used to prepare initial drafts of the README and supporting planning documents.
- **Candidate review:** Reviewed the wording, scope and claims; corrected the setup instructions after identifying the hosted-Supabase prerequisite problem; kept planned work separate from completed work.
- **Edits made:** README now describes the Next.js + PostgreSQL/pgvector direction, the Docker-based reviewer workflow, Day 1 data scope and the five project documents. The architecture and decision documents reflect the selected approach rather than presenting alternatives as if they were all being implemented.
- **Outcome:** Documentation baseline prepared for the first implementation commit.
- **Status:** Reviewed and edited.

---

## AI-009 — Portable PostgreSQL and Supabase setup

**Work item:** Implement the documented local Docker runtime and prepare
the shared schema for the Supabase project.

- **AI assistance:** Used to draft a health-checked Compose stack, a
  production Next.js container, an environment template and a shared
  PostgreSQL/pgvector migration.
- **Candidate review:** Checked that local startup does not require
  Supabase credentials, that the local database initializes from the
  committed migration, and that hosted instructions do not invent a
  deployment URL or expose secrets.
- **Edits made:** Added `Dockerfile`, `docker-compose.yml`,
  `.dockerignore`, `.env.example` and the initial shared migration.
  README, architecture and decision documentation distinguish the working
  database foundation from planned ingestion and product features.
- **Verification:** `docker compose config`, `pnpm lint`, `pnpm build`,
  and a full `docker compose up --build` smoke test passed. The smoke
  test confirmed the app responded on port 3000, the PostgreSQL service
  became healthy and the migration created the expected tables.
- **Outcome:** Accepted with the local and hosted setup paths documented.

---

## Ongoing AI-assisted workflow

For subsequent work, entries will be added when AI materially contributes to analysis, code, tests or documentation. Each entry should record:

1. **Task:** What needed to be done and why.
2. **AI contribution:** The specific analysis, draft, code or debugging help provided.
3. **Candidate review:** What was checked against source data, requirements, code or test output.
4. **Changes made:** What was corrected, rejected, simplified or rewritten before acceptance.
5. **Verification:** The actual command/test/manual check performed and its result, where applicable.
6. **Outcome:** Accepted, accepted with edits, or discarded.

The log should reflect the real development process. It should not imply that AI-generated code was tested when it was not, nor that candidate review was absent when the work was actively checked and revised.

**Confidentiality:** Do not include credentials, tokens or individual salary values in prompts, logs or committed documentation.