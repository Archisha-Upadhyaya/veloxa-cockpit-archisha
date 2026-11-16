# Architecture --- Veloxa CXO Cockpit

**Status:** Day 1 architecture baseline\
**Date:** 16 November 2026\
**Scope:** Day 1 release pack only. Later release packs may change this
design; changes must be recorded in `DECISIONS.md`.

## 1. Architectural direction

Build a **modular monolith in Next.js**, not a collection of
microservices and not 14 independent chatbots.

-   **Next.js App Router + React + TypeScript**: dashboard, employee
    interview interface, evidence views, API Route Handlers.
-   **Supabase PostgreSQL**: canonical structured store, source/evidence
    registry, entity resolution, temporal metadata, access-controlled
    records.
-   **pgvector**: semantic retrieval over approved, non-sensitive
    evidence chunks. Vector similarity is a retrieval aid, never the
    authority for a fact.
-   **Node.js runtime** for server-side application and ingestion
    scripts.
-   No schema-validation library. Ingestion records are checked by
    explicit parser assertions and enforced by database constraints
    (types, `NOT NULL`, checks); API request bodies are validated with
    direct checks in thin route handlers.
-   **LLM provider behind an adapter** so prompts/model/provider can
    change without rewriting domain logic.
-   **Vitest** for unit and integration tests.

Route Handlers are sufficient for the current application boundary. Keep
ingestion as separately executable scripts; if later releases require
long-running jobs, extract a worker without changing the domain model.

## 2. System boundaries

``` text
Browser
  |
  v
Next.js App Router
  |-- Executive cockpit
  |-- Employee interview UI
  |-- Evidence / conflict views
  |-- Risk register
  |-- Historical query UI
  |
  v
Route Handlers (Node runtime)
  |
  v
Application services
  |-- AskCompanyQuestion
  |-- InterviewEmployee
  |-- GetRiskBrief
  |-- AskAsOfDate
  |-- SearchEvidence
  |
  +----------------------+-----------------------+
  |                      |                       |
  v                      v                       v
Evidence service     Agent service          Temporal service
  |                      |                       |
  +----------------------+-----------------------+
                         |
                  Policy / access layer
                         |
          +--------------+------------------+
          |                                 |
          v                                 v
  PostgreSQL relational data         pgvector index
          |
          v
  Supabase PostgreSQL

Offline / controlled ingestion:
Source files -> parsers -> normalized records -> evidence records
             -> entity resolution -> conflict candidates
             -> approved embeddings -> database
```

The LLM is not the database and is not the source of truth. It receives
a bounded set of authorized evidence and produces a structured draft.
The application validates the answer, citations, date constraints and
disclosure policy before returning it.

## 3. Core design principles

1.  **Evidence before prose.** Retrieve and select records first;
    generate the answer only from those records.
2.  **Every material claim is traceable.** Store evidence references at
    claim level, not just a generic source list at answer level.
3.  **Disagreement is data.** Do not overwrite one source with another.
    Preserve competing observations and record the resolution rationale
    separately.
4.  **Event date is not knowledge date.** A transaction may have
    occurred in April but may not have been available to the cockpit
    until the Day 1 release. Store both.
5.  **Vector similarity is not truth.** Use pgvector to find candidate
    evidence, then apply exact entity, date, source and access filters.
6.  **Agents share governed company facts.** Persona-specific
    perspective must not become persona-specific truth.
7.  **Sensitive data is excluded before LLM retrieval.** Salary rows are
    not embedded or sent to the CEO-facing model.
8.  **Unknown means unknown.** No evidence means no factual answer; it
    does not authorize plausible completion.

## 4. Day 1 source inventory and ingestion boundary

The uploaded Day 1 ZIP contains:

-   `transcripts/T1_CEO_Kickoff_Call.docx`
-   `transcripts/T2_CFO_Call.docx`
-   `data_room/hr/Employee_Master.xlsx`
-   `data_room/finance/GL_Export_Apr-Sep_2026.xlsx`
-   `data_room/finance/Payroll_Register_Jan-Mar_2026.xlsx`
-   `data_room/documents/Board_Update_Apr-Jun_2026.pdf`
-   `data_room/documents/Board_Update_Jul-Sep_2026.pdf`
-   `data_room/email/01.eml`, `02.eml`, `03.eml`
-   `data_room/templates/Entity_Resolution.xlsx`
-   `data_room/templates/Evidence_Index.xlsx`
-   `data_room/templates/Connection_Worksheet.pdf`
-   `data_room/README.txt`
-   `brief/Candidate_Brief.docx`

The data-room README mentions HRMS, leave, Culture Amp, hiring, Jira,
Git history, PagerDuty, on-call rota, invoices, letters and launch-kit
material. Those files are **not in this uploaded Day 1 ZIP**. Do not
create synthetic records for them or claim they have been ingested. Add
them when a later release actually supplies them.

### Parser strategy

-   DOCX: extract paragraphs and tables; retain paragraph/table
    position.
-   PDF: extract text by page; retain page number. Preserve original
    file for visual inspection if text extraction is incomplete.
-   XLSX: ingest sheet name, row number, column headers and cell values.
    Keep original row coordinates.
-   EML: parse headers, message ID, sent date, sender, recipient,
    subject and body.
-   TXT: preserve the complete text and line/section location.

Every source file receives a stable `source_id` and checksum.
Re-ingesting an unchanged file must not duplicate evidence. A changed
file is a new source version.

## 5. Proposed domain model

The initial relational model should preserve source provenance, business
observations and time.

### `source_documents`

One row per logical source file.

-   `id` UUID primary key
-   `logical_path` text unique within a release
-   `file_name` text
-   `file_type` text
-   `release_id` text (Day 1 currently)
-   `checksum_sha256` text
-   `source_created_at` timestamptz nullable
-   `source_published_at` timestamptz nullable
-   `available_at` timestamptz --- when this release made the file
    available to the system
-   `ingested_at` timestamptz
-   `parser_version` text
-   `ingestion_status` text
-   `notes` text nullable

### `source_locations`

Precise location inside a source.

-   `id` UUID
-   `source_id` FK
-   `locator_type` (`paragraph`, `page`, `sheet_row`, `email_header`,
    `email_body`, `line`, etc.)
-   `locator_value` text (e.g. `page=1`, `sheet=GL Apr-Sep; row=8`)
-   `excerpt` text
-   `content_hash` text

### `entities`

Canonical people, organisations, products and projects.

-   `id` UUID
-   `entity_type` (`person`, `company`, `product`, `project`, `vendor`,
    `team`, `system`)
-   `canonical_name` text
-   `canonical_key` text unique
-   `attributes` jsonb
-   `created_at` timestamptz

### `entity_aliases`

Names and spellings that may resolve to a canonical entity.

-   `id` UUID
-   `entity_id` FK
-   `alias` text
-   `source_id` FK nullable
-   `resolution_confidence` (`high`, `medium`, `low`)
-   `resolution_basis` text
-   `status` (`confirmed`, `candidate`, `rejected`)

Never merge aliases solely because strings look similar. For example,
`Sapphire Events Pvt Ltd` and `Saphire Event Mgmt` are a possible vendor
match, not a confirmed one.

### `evidence_items`

Atomic source-backed statements. One evidence item should express one
claim.

-   `id` UUID
-   `evidence_ref` text unique (human-readable stable ref such as
    `E001`)
-   `source_id` FK
-   `source_location_id` FK
-   `subject_entity_id` FK nullable
-   `predicate` text
-   `object_value` jsonb
-   `unit` text nullable
-   `valid_time_start` timestamptz/date nullable --- when the fact
    applies in the business world
-   `valid_time_end` timestamptz/date nullable
-   `available_at` timestamptz --- when the system could know it
-   `confidence` (`high`, `medium`, `low`)
-   `source_kind` (`system_export`, `board_update`, `email`,
    `transcript`, `manual_assumption`)
-   `sensitivity` (`public_internal`, `restricted`, `highly_restricted`)
-   `embedding_status` text
-   `created_at` timestamptz

Store the original wording separately from normalized interpretation.
For transcript-derived statements, keep both the literal transcript
phrase and any proposed normalized value.

### `claims`

Normalized propositions used by the application.

-   `id` UUID
-   `claim_key` text (e.g. `company.arr`)
-   `subject_entity_id` FK nullable
-   `predicate` text
-   `normalized_value` jsonb
-   `unit` text nullable
-   `valid_at` date/timestamptz nullable
-   `claim_status` (`supported`, `disputed`, `inferred`, `unknown`,
    `superseded`)
-   `confidence` (`high`, `medium`, `low`)
-   `created_at` timestamptz

### `claim_evidence`

Many-to-many relation between claims and evidence.

-   `claim_id` FK
-   `evidence_item_id` FK
-   `relationship` (`supports`, `contradicts`, `qualifies`,
    `supersedes`)
-   `weight` numeric nullable
-   `rationale` text

### `conflicts`

Explicitly model unresolved and resolved disagreements.

-   `id` UUID
-   `conflict_key` text
-   `description` text
-   `status` (`open`, `provisionally_resolved`, `resolved`,
    `not_comparable`)
-   `resolution` text nullable
-   `resolution_confidence` text nullable
-   `reviewed_at` timestamptz nullable
-   `reopen_condition` text nullable

Link the conflict to all relevant evidence through `conflict_evidence`.

### `employee_profiles`

The 14 target agent identities and factual employee metadata.

-   `entity_id` FK to `entities`
-   `employee_id` text unique
-   `department` text
-   `title` text
-   `manager_entity_id` FK nullable
-   `join_date` date
-   `location` text
-   `employment_status` text
-   `exit_date` date nullable
-   `agent_enabled` boolean

Do not load every employee-master row as an interview agent. The brief
asks for 14 people across Engineering, Finance, People & Ops and
Marketing. The matching set in the employee master is 14 people in those
four departments. CEO, Sales and Support records remain company
entities/records but are not part of the 14-person agent roster.

### `agent_personas`

Persona material separated from verified HR facts.

-   `employee_entity_id` FK
-   `voice_profile` jsonb
-   `known_topics` jsonb
-   `known_unknowns` jsonb
-   `perspective_rules` jsonb
-   `invented_details` jsonb
-   `persona_version` text

Every invented personal-life detail must link to an assumption record.
Persona invention excludes performance
reviews, private conversations, medical
information, political views or other sensitive facts.

### `assumptions`

-   `id` UUID
-   `assumption_ref` text
-   `statement` text
-   `basis` text
-   `confidence` text
-   `created_on` date
-   `status` (`active`, `confirmed`, `revised`, `rejected`)
-   `what_would_change_mind` text
-   `supersedes_assumption_id` FK nullable

Never delete a disproved assumption; append a revision and preserve
history.

### `risk_items`

-   `id` UUID
-   `risk_key` text
-   `title` text
-   `description` text
-   `severity` (`critical`, `high`, `medium`, `low`)
-   `likelihood` (`high`, `medium`, `low`, `unknown`)
-   `status` (`open`, `watch`, `mitigated`, `closed`)
-   `first_observed_at` timestamptz
-   `last_reviewed_at` timestamptz
-   `owner_entity_id` FK nullable
-   `confidence` text

Each risk must link to evidence and distinguish observed facts from
inferred impact.

### `answer_runs` and `answer_claims`

Persist the question, as-of date, answer, model/prompt version,
retrieved evidence IDs, policy outcome, confidence and per-sentence
claims/citations. This enables reproducibility and debugging. Do not
store sensitive raw payroll values in answer logs.

## 6. Temporal model: two different clocks

The application must distinguish:

1.  **Valid time:** when a fact was true in Veloxa's business world.
2.  **Knowledge/availability time:** when the cockpit had access to that
    fact.

At minimum, every evidence item needs `valid_time` and `available_at`.
Also retain `source_published_at` and `ingested_at` when known.

For a question such as "What did we know on 30 June 2026?": - filter
evidence to `available_at <= requested_cutoff`; - filter business facts
to those valid on the requested date where the question concerns state
at that date; - do not use a board update sent on 6 October to answer
what was known on 30 June; - explain if the requested historical cutoff
predates the earliest available evidence.

For the Day 1 pack, the exact release timestamp is not provided in the
files. Set the release availability date to 16 November 2026 (date
precision only) and document that as a system ingestion convention, not
a claim about the original source creation time. Do not backdate
`available_at` to the transaction date.

## 7. Ingestion workflow

1.  **Register** each source file and compute SHA-256 checksum.
2.  **Parse** into source-specific records while retaining
    page/sheet/row/paragraph locators.
3.  **Normalize** dates, currency, units and names without discarding
    original text.
4.  **Extract atomic evidence**. Every evidence row must point to an
    exact source location.
5.  **Resolve entities** using employee IDs and explicit identifiers
    first; aliases second; fuzzy matching only creates candidates.
6.  **Create claims** and attach supporting/contradicting evidence.
7.  **Detect conflicts** on key metrics and propositions, but do not
    auto-resolve them.
8.  **Apply sensitivity labels**. Payroll line items are highly
    restricted and excluded from embeddings and CEO-facing retrieval.
9.  **Generate embeddings** only for approved evidence chunks.
10. **Validate** counts, required fields, date parsing, duplicate
    handling and source coverage.
11. **Publish** the release only after validation; failed ingestion must
    not partially publish an inconsistent release.

Ingestion should be idempotent. Re-running the same release should not
create duplicate documents, evidence or entities.

## 8. Retrieval and answer-generation flow

For a CEO question:

1.  Parse intent: company fact, trend, employee interview, risk question
    or historical/as-of query.
2.  Extract named entities, metric, time range and requested detail.
3.  Apply access policy and temporal cutoff **before** retrieval.
4.  Retrieve structured claims using exact filters; retrieve semantic
    candidates using pgvector.
5.  Combine candidates, deduplicate and rank by relevance, source
    quality, date and confidence.
6.  Resolve the evidence set: retain contradictions, do not hide
    inconvenient records.
7.  Ask the LLM to produce structured output:
    -   short answer
    -   claims
    -   evidence refs per claim
    -   confidence
    -   disagreement/unknowns
    -   suggested next check
8.  Validate every citation exists and supports the associated claim.
9.  Reject unsupported numbers, dates, names and causal statements.
10. Apply disclosure checks to the final answer.
11. Persist an answer-run record and return the response.

A citation must identify a source and locator, for example:
`Board_Update_Jul-Sep_2026.pdf, p. 1` or
`GL_Export_Apr-Sep_2026.xlsx, GL Apr-Sep, row 28`. A citation to an
entire workbook without a row/sheet is insufficient for a specific
amount.

## 9. Employee agent design

There are 14 agents, exactly the records in Engineering, Finance, People
& Ops and Marketing:

-   Engineering: Vikram Menon, Priya Nair, Arjun Das, Sneha Kulkarni,
    Rahul Verma.
-   Finance: Meera Iyer, Karthik Subramanian, Fatima Sheikh.
-   People & Ops: Deepa Joshi, Rohan Banerjee, Lakshmi Pillai.
-   Marketing: Nikhil Bose, Aisha Khan, Siddharth Mehta.

This is a derived roster from the employee master and the brief's four
named departments. Keep the CEO, Sales and Support people in the company
directory, but do not count them among the 14 initial agents.

Each agent uses: - the same canonical company facts and evidence
service; - a factual employee profile from the employee master; - only
role-relevant records that the access policy permits; - a persona layer
containing communication style and explicitly labelled invented life
details; - a perspective policy: the employee may express a view,
uncertainty or limited knowledge, but may not fabricate company facts.

**One shared agent runtime serves all 14 personas** through profile
configurations. This is easier to test, cheaper,
more consistent and more defensible.

An agent response should distinguish: - "I can confirm from the
records..." - "My role gives me visibility into..." - "I do not have
visibility into..." - "That is my interpretation, not a recorded fact."

For example, the employee master establishes Rahul Verma as a Backend
Engineer who joined on 3 February 2026. It does not establish his
personality, hobbies or private life. Those can be invented only as
clearly marked persona assumptions.

## 10. Payroll confidentiality and access control

The payroll workbook includes individual gross, deductions and net
amounts. The CFO transcript says individual salaries must never appear
in anything Ananya sees.

Enforce this at the data/service layer:

-   Keep raw payroll rows in a restricted table/schema or a separately
    protected storage boundary.
-   Do not create vector embeddings for individual payroll rows.
-   Do not include individual payroll rows in CEO or general agent
    retrieval.
-   Do not pass individual salary values to an LLM used for CEO answers.
-   Do not place them in application logs, error traces, analytics or AI
    logs.
-   Expose only approved aggregate payroll metrics through a server-side
    aggregation function.
-   Return only totals, trends or approved grouped values; suppress
    groups small enough to reveal a person's pay.
-   Add tests that search rendered responses, API output and logs for
    individual salary values.
-   Treat database service-role keys as server-only secrets. Never
    expose them to the browser.

The CEO-facing interface should never receive individual salary records,
even if the UI promises to hide them.

## 11. Risk intelligence

Risks should not be generated by asking the LLM "what are the risks?"
with the whole data room. Use deterministic candidate rules plus
evidence-backed explanation.

Day 1 candidate risks: - Atlas GA delay / reliability work after
difficult August. - Payroll process exception and unresolved Rahul
payslip query. - Finance/CEO disagreement over burn and ARR figures. -
Marketing spend reconciliation gap. - Marketing departure and hiring
pause / round dependency.

For each risk store: - observed facts; - inference and causal chain; -
evidence refs; - likelihood and impact rationale; - confidence; - what
would confirm or reduce the risk; - last reviewed date.

Do not claim a risk is real merely because an LLM produces a plausible
story. "Potential payroll control weakness" is supportable; "payroll
fraud" is not.

## 12. Suggested Next.js structure

``` text
src/
  app/
    (cockpit)/
      page.tsx
      people/page.tsx
      people/[employeeId]/page.tsx
      evidence/page.tsx
      risks/page.tsx
      history/page.tsx
    api/
      ask/route.ts
      agents/[employeeId]/interview/route.ts
      risks/route.ts
      evidence/[evidenceRef]/route.ts
  components/
    cockpit/
    agents/
    evidence/
    risks/
  lib/
    application/
      ask-company-question.ts
      interview-employee.ts
      get-risk-brief.ts
      ask-as-of-date.ts
    domain/
      claims/
      evidence/
      conflicts/
      agents/
      risks/
      temporal/
    infrastructure/
      supabase/
      llm/
      parsers/
      embeddings/
    policies/
      access-policy.ts
      disclosure-policy.ts
    validation/
  types/
scripts/
  ingest-day1.ts
  validate-day1.ts
  seed-agents.ts
supabase/
  migrations/
tests/
  unit/
  integration/
  evaluation/
```

Keep route handlers thin: validate request, call an application service,
translate the result to HTTP. Do not put prompt construction, SQL,
conflict resolution and business rules directly in `route.ts`.

## 13. API contracts (initial)

-   `POST /api/ask` --- `{ question, asOfDate? }` → answer, claims,
    citations, confidence, conflicts, unknowns.
-   `POST /api/agents/:employeeId/interview` ---
    `{ message, conversationId? }` → persona response, evidence refs,
    known/unknown boundaries.
-   `GET /api/risks` --- filters by status/severity → ranked
    evidence-backed risk items.
-   `GET /api/evidence/:evidenceRef` --- source excerpt and exact
    locator, subject to access policy.
-   `GET /api/people` --- the 14 agent profiles plus factual metadata
    allowed in the cockpit.

Do not expose a generic endpoint that lets the browser query arbitrary
tables or submit unrestricted SQL.

## 14. Day 1 implementation sequence

1.  Establish the database migration and environment validation.
2.  Build source registry and ingestion parsers for DOCX, PDF, XLSX, EML
    and TXT.
3.  Ingest employee master, board updates, ledger and emails.
4.  Ingest payroll into a restricted path and verify no individual rows
    enter embeddings.
5.  Create the 14-person roster and factual profiles.
6.  Create atomic evidence records and populate an evidence index.
7.  Add entity resolution and conflict records for Day 1 contradictions.
8.  Build exact structured retrieval first; add pgvector for discovery
    after provenance works.
9.  Implement `/api/ask` with citations and refusal/uncertainty
    handling.
10. Implement one agent end-to-end, then configure the other 13 from
    profiles.
11. Build the risk view from explicit risk records.
12. Add regression tests before polishing UI.

## 15. Day 1 exit criteria

-   All files actually present in the Day 1 ZIP are registered and
    accounted for.
-   Each extracted evidence item has a source locator.
-   All 14 target employees are represented with factual profiles.
-   Day 1 conflicts are visible and not silently overwritten.
-   CEO answers cite evidence at claim level.
-   Payroll individual values are excluded from all CEO-facing retrieval
    and logs.
-   Historical queries apply availability cutoffs.
-   A failed or unsupported query can return "not enough evidence".
-   Ingestion is repeatable without duplicate rows.
-   The application can be explained and modified without relying on an
    LLM to explain its own architecture.
