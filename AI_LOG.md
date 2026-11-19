# AI Log — Veloxa CXO Cockpit

**Project:** Veloxa CXO Cockpit  
**Hackathon:** Hiyaku Systems Individual Hackathon  
**Log period:** Day 1 to Day 4 — 16 to 19 November 2026  
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

## AI-010 — Concern quality: specific, evidenced, owned

**Work item (17–18 Nov):** The attention map showed three near-identical,
generic concerns ("Delivery commitments have unresolved execution signals").

- **AI assistance:** Traced the generic text to a keyword fallback with
  canned descriptions and a single hard-coded "suggested action"; drafted a
  replacement analysis that returns separate observed facts, inference and
  next step, plus a per-record "why this counts" rationale.
- **Candidate review:** Ran the analysis end to end against the local
  database and read every finding. Rejected outputs that were still vague,
  invented deadlines ("by 25 November") or anonymised people ("one
  individual" for Sneha Kulkarni).
- **Changes made:** Short evidence labels (E1, E2…) instead of UUIDs after
  the model cited a non-existent UUID and crashed the save on a foreign key;
  no evidence means no finding; severity is capped by confidence and record
  count; ranking is severity × confidence; prompts forbid invented dates,
  buzzwords and label-style titles, and require names and "so what".
- **Verification:** Unit tests (`risk-ranking`, `reorg`), repeated live runs
  on Docker and hosted Supabase; findings read manually each time.
- **Outcome:** Accepted. Quality still varies run to run on the free-tier
  lite model (see AI-015).

## AI-011 — No hard-coded data anywhere

**Work item (17–18 Nov):** The CEO required that nothing shown is
hand-written.

- **AI assistance:** Audited the codebase and found `scripts/seed-data.ts`
  (~770 lines: invented people details, scripted interview answers, 20
  citations, six pre-written concerns) feeding the whole hosted database,
  plus person-specific rewrite rules in the chat sanitiser (e.g. turning a
  phrase into "Meera said that about me…").
- **Candidate review:** Confirmed which rows in each database came from the
  seed before deleting anything; ran the purge with `--dry-run` first.
- **Changes made:** Deleted the seed and its script; added
  `scripts/purge-seeded.ts`; people now come from the released
  `Employee_Master.xlsx` (`src/lib/ingestion/people.ts`); every fallback
  returns stored database data rather than template text; the sanitiser and
  text humaniser keep only generic rules.
- **Verification:** Purge counts matched expectations on Docker and hosted
  (7 answers, 6 concerns, 16 assumptions, 14 scripted personas, 3
  conflicts); tests updated to generic cases.
- **Outcome:** Accepted.

## AI-012 — Reporting line from Manager ID

**Work item (18 Nov):** Everyone showed as "Top of company".

- **AI assistance:** Found that the mapping code existed but the hosted
  database still held the seeded profiles with no manager; added a
  people-only sync (`pnpm sync:employees`).
- **Candidate review:** Compared the printed tree row by row with the
  spreadsheet's `Manager ID` column.
- **Verification:** Both databases print the same tree as the sheet;
  `employee-master` unit tests parse the real file (19 rows, banner row
  skipped, every manager resolves).
- **Outcome:** Accepted.

## AI-013 — Overview, people and chat UI

**Work item (17–18 Nov):** Make the site a personal morning brief rather
than a generic dashboard.

- **AI assistance:** Rebuilt the overview (greeting by the CEO's name,
  stat cards, top three concerns, Ask, health check), the people table
  (indented reporting line, details row, persona-only chat), the concern
  detail page and the chat drawer.
- **Candidate review:** Checked each change in a headless Chrome (own
  throwaway profile, DevTools protocol) at 1440×900: the three concern cards
  must end above the fold, no console errors, no failed requests.
- **Changes made after review:** Custom CSS moved into Tailwind layers
  (unlayered rules were silently overriding spacing utilities); the CEO's
  message now appears before the reply; Ask moved below the concerns;
  "going well" hidden when empty; citation numbers renumbered 1..n; jargon
  ("released material", "pack", "executive intelligence") removed;
  per-page tab titles.
- **Verification:** Screenshots and DOM checks on every page; the three
  cards end at 846 px on a 900 px viewport.
- **Outcome:** Accepted.

## AI-014 — Employee chat as people, not an assistant

**Work item (18 Nov):** Replies must sound like the employee, address the
CEO by name and never invent reassurance.

- **AI assistance:** Persona voices generated once from each person's own
  records and cached; full text of records naming the person passed as
  first-hand knowledge; conversation history kept.
- **Candidate review:** Read replies from Meera, Fatima, Karthik, Rahul and
  Vikram. Fatima first claimed February payroll was "finalised on schedule"
  (contradicted by the email showing Karthik ran it in her absence); Meera
  claimed she personally paused hiring.
- **Changes made:** Rules against claiming things are fine or taking credit
  without a record; a name-correction safety net; chat limited to the 14
  personas; the CEO cannot chat with themself.
- **Verification:** `address-ceo` unit tests; live replies re-read.
- **Outcome:** Accepted; replies on the lite model can still drift.

## AI-015 — Model availability and failover

**Work item (17–18 Nov):** The analysis returned nothing because the
configured model was unavailable.

- **AI assistance:** Listed models for the key and made real calls to each.
  Found `gemini-3.8-flash` and `gemini-3-flash` limited to 20 requests a
  day on the free tier and often overloaded, pro/`gemini-4` not in quota,
  2.5 retired, `gemini-3.1-flash-lite` reliably available.
- **Changes made:** Per-task model chains with automatic failover
  (`src/lib/ai/gemini.ts`); Gemini structured output (response schemas)
  after the lite model produced malformed JSON; retries on 503;
  folder-by-folder analysis plus a consolidation pass so the lite model
  keeps distinct issues apart.
- **Verification:** Live runs logging which model answered; debug logging
  of pre-merge findings to tune the merge (over-merging was traced to call
  transcripts being shared context in every batch).
- **Outcome:** Accepted. Free-tier quota remains a real limit.

## AI-016 — Day 3 data and table profiles

**Work item (18 Nov):** Add the Day 3 data room and the T4/T5 calls.

- **AI assistance:** Added a generic profile for large tables (rows per
  month and per grouping column) so the 1,453-row git log becomes readable
  facts; capped long documents to their first chunks in analysis.
- **Candidate review:** Checked the profile against the raw CSV. It surfaced
  Priya Nair under two identities and Sneha Kulkarni's August commit drop.
- **Verification:** 13 Day 3 documents present in both databases; T6 voice
  notes absent.
- **Outcome:** Accepted.

## AI-017 — Reorganisations that cannot break the directory

**Work item (18 Nov, T6b):** "Make sure the thing doesn't break when we move
people around."

- **AI assistance:** Dated reporting-line changes (`org_changes`), a pure
  directory builder, and tests for tentative, future-dated,
  missing-manager and loop cases.
- **Candidate review:** Found an existing bug while doing this: a reporting
  loop would have made people disappear from the directory.
- **Verification:** `reorg` unit tests (department move, loops, nobody
  lost, CEO stays the single top).
- **Outcome:** Accepted. The CRO move is recorded as tentative because no
  CRO exists in any record.

## AI-018 — Health check and Ask

**Work item (18 Nov):** On-demand company status by business area, and a
search box that answers questions.

- **AI assistance:** Health check that picks 5–8 business areas from the
  evidence and saves the result; Ask that reads the whole (small) corpus and
  cites sources.
- **Candidate review:** The first health check said "Clients and revenue:
  no data" although board updates report ARR; traced to one-line summaries
  dropping figures and fixed by passing full records. Ask first quoted the
  call's burn figure; fixed by marking calls as secondary and leading with
  company records.
- **Verification:** Live runs; Ask answer for burn and runway checked
  against the board update (₹44 L/month, 13 months).
- **Outcome:** Accepted.

## AI-019 — Production-only errors and local servers

**Work item (18 Nov):** Docker build failures and a broken local page.

- **Findings:** `next build` with Cache Components rejected reading the
  clock and the query string during prerender (fixed with a client clock
  hook and `useSearchParams` inside `<Suspense>`). A stale `next start` on
  port 3000 served HTML that pointed at deleted CSS chunks, so the page had
  no styles.
- **Outcome:** Fixed. Local checks now use `next dev` only; production
  builds are run before deploying, on request.

---

## AI-020 — Day 4 voice notes: T6c and T6d

**Work item (19 Nov):** Day 4 has no data-room files, only two CEO voice
notes.

- **AI assistance:** Drafted the response to T6c (declined: individual
  quit-risk ranking from private messages) and built the T6d answer:
  CEO-reported statuses, a departure-impact action, and Jira/git profile
  cross-tabs.
- **Candidate review:** Checked every board-call figure against the raw
  Jira export and git log with separate scripts (PN: 14 of 27 open issues,
  62 of 115 open story points; Priya 588 of 843 engine commits; GA 15 Dec).
  The model's first answer missed all of them and cited an unrelated
  payroll email; the profile, prompt and citation changes fixed most of
  that, but the lite model still misreads some totals, so the verified
  figures are written in `TRANSCRIPT_NOTES.md`.
- **Changes made:** Surveillance-request guard with tests built from the
  voice-note wording; reported status preserved through syncs; Ask always
  sees the directory and maps initials, handles and misspellings; one
  citation number per document.
- **Verification:** Unit tests (`chat-safety`, `table-profile`); live Ask
  on hosted Supabase for both voice notes; Priya's status checked to
  survive a full re-sync.
- **Outcome:** Accepted. Docker data updated through the code directly; the
  Docker app image was not rebuilt (no builds until requested).

---

## AI-021 — Retention watch, loaders and a dev-server loop

**Work item (19 Nov):** The CEO preferred an on-demand "prone to resign"
view over a refusal; pages showed empty cards before data; the dev page on
:3001 reloaded endlessly.

- **Retention watch:** work-records-only check with cited reasons; the
  CEO-reported resignation is added by code with source "Reported by you"
  after the model first cited a board update for it. Live result: Priya
  (urgent: resignation, ownership email, late nights), Sneha (urgent:
  on-call and incidents), Aisha (check in).
- **Loaders:** a branded loader (the "V" mark drawing itself) on every
  page; nothing renders until that page's data has arrived. Verified in
  headless Chrome: loader first, then the full page, no empty cards.
- **Reload loop:** reproduced (27 page loads in 15 s with no file
  changes); cause was a corrupted `.next/dev` cache shared by earlier
  servers and a production build. Cleared and restarted: one load.
- **Audit:** both databases re-checked (documents per day, no voice notes,
  personas, reported status, findings complete). Found zero embeddings
  after the re-ingest and a mismatched `match_evidence` signature on
  hosted; listed for follow-up.

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