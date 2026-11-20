# Decision Log --- Veloxa CXO Cockpit

**Status:** Updated through Day 3\
**Date:** 16 November 2026, last updated 19 November 2026

Decisions record alternatives, rationale, trade-offs and reconsideration
triggers. Add a new dated entry when a decision changes; do not rewrite
history silently.

## D-001 --- Use Next.js as the application and API boundary

-   **Decision:** Use Next.js App Router, React and TypeScript as one
    modular monolith. Use Route Handlers for the API.
-   **Alternatives:** React SPA + Express API; separate frontend/backend
    services; microservices.
-   **Rationale:** The current product needs one CEO-facing cockpit, API
    endpoints, server-side LLM orchestration and database access.
    Next.js can handle these without a second server, and author can explain and modify it end-to-end. A second
    framework does not make the evidence model more correct.
-   **Trade-off:** Long-running ingestion should not execute inside a
    user request. Keep ingestion as scripts initially and extract a
    worker only if later requirements justify it. No schema-validation
    library (e.g. Zod): the deterministic pipeline's inputs are
    version-controlled pack files and small route-handler bodies, covered
    by parser assertions and database constraints instead. If an LLM
    generation layer is added later, its structured output is untrusted
    input and would justify runtime schema validation at that boundary.
-   **Revisit if:** Background workloads, deployment constraints or
    integrations require an independently scalable worker/API.

-   **Revised 18 Nov 2026:** The "revisit" trigger happened: model output is
    now part of the pipeline, so Zod validates every LLM response at that
    boundary (see D-024). The rest of D-001 stands.

## D-002 --- Supabase PostgreSQL is the canonical data store

-   **Decision:** Use Supabase PostgreSQL for relational data and
    pgvector for semantic evidence retrieval.
-   **Alternatives:** SQLite/local JSON; MongoDB; external vector
    database plus relational DB.
-   **Rationale:** The problem is relational and temporal: entities,
    evidence, claims, conflicts, source versions, employee hierarchy,
    risks and access policies need joins and constraints. pgvector keeps
    semantic retrieval close to the canonical records.
-   **Trade-off:** Supabase project configuration and credentials are
    required. Local reproducibility must be documented; do not promise
    that a script can create a hosted Supabase project or credentials
    automatically.
-   **Revisit if:** The deployment environment or later pack size
    requires a separate search service.

## D-003 --- Store atomic evidence, not just whole-document embeddings

-   **Decision:** Parse sources into evidence items with exact source
    locators; chunk and embed only approved evidence text.
-   **Alternatives:** Embed entire files; rely on LLM context windows;
    store only extracted summaries.
-   **Rationale:** The evaluation requires specific record citations
    and expects source conflicts to be explained. Whole-file
    retrieval cannot reliably cite a particular ledger row, email or
    board statement.
-   **Trade-off:** More ingestion work and a more explicit schema.
-   **Revisit if:** A source type cannot be parsed into atomic facts;
    add a source-specific evidence strategy rather than dropping
    provenance.

## D-004 --- Separate source observations from normalized claims

-   **Decision:** Preserve original source wording and normalized claim
    values separately. Link claims to evidence through explicit
    support/contradiction relationships.
-   **Alternatives:** Rewrite source text into a single "clean" company
    fact; store a winner per metric.
-   **Rationale:** T1/T2 include ambiguous numbers and conflicting
    accounts. A normalized field must not erase the literal statement or
    its uncertainty.
-   **Trade-off:** Queries must understand claim status and evidence
    relationships.
-   **Revisit if:** Later sources introduce a clear correction; mark old
    claims superseded rather than deleting them.

## D-005 --- Use bitemporal evidence

-   **Decision:** Store business-valid time separately from evidence
    availability/knowledge time.
-   **Alternatives:** One timestamp per fact; use only transaction date;
    use only ingestion time.
-   **Rationale:** The stretch requirement asks "what did we know on
    date X?". A July report may describe April--June but was not sent
    until 8 July. The 6 October board update cannot leak into a 30 June
    answer.
-   **Trade-off:** More fields and careful query filtering.
-   **Revisit if:** A later requirement needs full transaction-time
    history or corrections to previously published source files; extend
    to source-versioned bitemporal records.

## D-006 --- Do not let vector search decide truth

-   **Decision:** Use pgvector to discover semantically relevant
    evidence, then validate against exact filters, structured facts,
    dates, entity IDs and policy.
-   **Alternatives:** Pure vector RAG; pure SQL; LLM decides which
    source to trust.
-   **Rationale:** Semantic similarity can retrieve a related but wrong
    period, employee or metric. The data has precise row-level evidence
    and conflicting numbers.
-   **Trade-off:** Hybrid retrieval and ranking are more complex.
-   **Revisit if:** Evaluation shows semantic retrieval misses useful
    evidence; improve candidate discovery without relaxing factual
    validation.

## D-007 --- One shared agent runtime, 14 persona configurations

-   **Decision:** Implement 14 agents as profiles/configurations over
    one shared runtime and shared company evidence service.
-   **Alternatives:** 14 separate LLM agents/services; one generic
    chatbot pretending to be any employee.
-   **Rationale:** Shared runtime prevents divergent company facts and
    is easier to test. Profiles provide role-specific knowledge
    boundaries, perspective and voice.
-   **Trade-off:** The persona layer must be designed carefully so
    employees do not sound interchangeable.
-   **Revisit if:** A role requires a materially different tool set or
    access boundary; isolate capabilities, not duplicate the entire
    architecture.

-   **Revised 18 Nov 2026:** The 14 personas are now chosen from the data
    (see D-026), not fixed by department.

## D-008 --- Separate factual employee data from invented persona details

-   **Decision:** Keep employee-master facts separate from invented
    personal-life and communication-style assumptions. Every invented
    detail is logged in `ASSUMPTIONS.md` and stored as explicitly
    fictional persona metadata.
-   **Alternatives:** Freely improvise a backstory in each conversation;
    avoid all personality and make agents database lookup tools.
-   **Rationale:** The brief asks for people who feel real but also
    requires assumptions to be documented. A versioned persona profile
    supports consistency and review.
-   **Trade-off:** Persona richness is constrained by explicit fictional
    boundaries.
-   **Revisit if:** Later releases add actual employee statements or
    more persona instructions.

-   **Superseded 18 Nov 2026:** The CEO ruled out hand-written data of any
    kind. Invented persona details and scripted interviews were deleted
    (see D-020); personas are generated from each person's own records.

## D-009 --- Enforce payroll confidentiality before retrieval

-   **Decision:** Individual salary rows are restricted and excluded
    from CEO-facing retrieval, embeddings, prompts, logs and responses.
    Only approved aggregates can be returned to Ananya.
-   **Alternatives:** Retrieve all payroll data and ask the LLM not to
    reveal it; hide values in the UI; redact after generation.
-   **Rationale:** T2 explicitly says individual salaries must never
    appear in anything Ananya sees. Prompt instructions and UI masking
    are insufficient controls.
-   **Trade-off:** Separate aggregation path and automated leakage tests
    are required.
-   **Revisit if:** Only after a documented, explicit change to the
    access policy. Until then, keep the restriction.

## D-010 --- Keep the Day 1 release boundary explicit

-   **Decision:** Ingest only files physically present in the Day 1 ZIP.
    Record README-mentioned but absent exports as expected/missing, not
    as ingested.
-   **Alternatives:** Generate placeholder Jira, HR or Culture Amp
    records; assume README inventory means files are present.
-   **Rationale:** The Candidate Brief says data arrives in releases.
    Fabricating missing records would make the cockpit appear more
    complete but undermine trust.
-   **Trade-off:** Some Day 1 questions must return "not enough
    evidence".
-   **Revisit if:** Later release folders supply the missing data.

## D-011 --- Preserve uncertain entity aliases

-   **Decision:** Use employee IDs and exact identifiers first. Store
    ambiguous names and tool/vendor spellings as candidate aliases with
    confidence and rationale.
-   **Alternatives:** Fuzzy-match and merge automatically; leave all
    names disconnected.
-   **Rationale:** Examples include "Jeera", "Joho Books", "Kayka",
    "Vicky", and Sapphire/Saphire. Some are likely recognition errors;
    some could refer to different entities.
-   **Trade-off:** Some queries may show unresolved identities.
-   **Revisit if:** An authoritative export or identifier confirms a
    match.

## D-012 --- Risk ranking combines explicit rules and evidence-backed explanation

-   **Decision:** Generate risk candidates from transparent
    rules/conditions, then use the LLM to explain only the linked
    evidence and uncertainty.
-   **Alternatives:** Ask an LLM to invent a risk list; use a fixed
    manually written dashboard; calculate a numeric score with arbitrary
    weights.
-   **Rationale:** The CEO wants to know what to worry about. The answer
    must be defensible and traceable. Day 1 supports potential concerns,
    not definitive causal conclusions.
-   **Trade-off:** Initial risk coverage is narrower than free-form AI
    brainstorming.
-   **Revisit if:** More source types enable calibrated
    likelihood/impact scoring. Any numeric score must have documented
    inputs and weights.

## D-013 --- Answers use claim-level citations and explicit uncertainty

-   **Decision:** Return short prose plus structured claims, evidence
    refs, confidence, conflicts and unknowns. Validate citations
    server-side.
-   **Alternatives:** Add a generic source list at the end; allow
    uncited narrative; show a confidence percentage without calibration.
-   **Rationale:** A source list does not show which record supports
    which sentence. Unsupported certainty is worse than a clear refusal.
-   **Trade-off:** More structured generation and validation.
-   **Revisit if:** Evaluation identifies a better readable format;
    preserve claim-to-evidence traceability.

## D-014 --- Do not invent a current system status from old exports

-   **Decision:** Display the source period and source date prominently;
    distinguish "reported as of" from "current".
-   **Alternatives:** Present latest available row as live state; infer
    current status from old snapshots.
-   **Rationale:** Day 1 contains board snapshots and historical finance
    data, not live operational systems.
-   **Trade-off:** Some cockpit answers will be explicitly stale or
    historical.
-   **Revisit if:** Later releases provide current operational exports.

## D-015 --- Build evidence and data correctness before dashboard polish

-   **Decision:** Prioritize ingestion, source locators, entity
    resolution, conflict handling, access control and answer validation
    before visual refinement.
-   **Alternatives:** Build a polished dashboard with mocked data first.
-   **Rationale:** The brief weights truthfulness, citations, source
    interpretation, live explanation and readable code more heavily than
    surface polish.
-   **Trade-off:** Day 1 UI may be intentionally plain.
-   **Revisit if:** Core correctness checks pass and time remains.

## D-016 --- Use one portable migration for local and hosted PostgreSQL

-   **Decision:** Keep the schema in `supabase/migrations/` and use the
    same SQL for local pgvector Docker development and Supabase deployment.
-   **Alternatives:** Maintain a separate local schema; require every
    reviewer to run a database setup script; use SQLite locally.
-   **Rationale:** One migration prevents local and hosted schemas from
    drifting. Docker applies it on a fresh volume; Supabase can apply it
    through SQL Editor or CLI.
-   **Trade-off:** The local container is not a full Supabase emulator.
    Supabase-specific authentication, storage and row-level policies must
    be added when those application features are implemented.
-   **Status:** Implemented for the initial relational foundation.
    Application queries, ingestion and additional policy rules remain
    planned.
-   **Revisit if:** The application begins depending on Supabase services
    beyond PostgreSQL and pgvector.

## D-017 --- Show three concerns on the overview, keep all concerns available

-   **Decision:** `/api/dashboard` returns the three highest-priority open
    concerns. `/api/risks` returns the full deduplicated register, and every
    concern links to `/risks/[riskKey]`.
-   **Alternatives:** Generate exactly three concerns per analysis run; show
    only three anywhere; show the three newest.
-   **Rationale:** T6a asks for "top three" on opening, but analysis should
    not be capped at three. A fourth material concern must remain visible
    rather than being dropped or forced into a weaker top-three list.
-   **Trade-off:** Two views to maintain, and the ranking must be stable.
-   **Revisit if:** The CEO explicitly wants newest-first ordering or a
    different overview count.

-   **Updated 18 Nov 2026:** Still three on the overview, now ranked by
    severity × confidence (D-022). Positives were removed from the attention
    map; the health check (D-028) covers what is going well.

## D-018 --- Sanitise evidence at read time, not only at ingestion

-   **Decision:** Every CEO-facing extract passes through
    `src/lib/evidence/snippet.ts`, even when the database already contains an
    older unsanitised chunk.
-   **Alternatives:** Trust ingestion-time cleanup; hide the evidence panel
    entirely.
-   **Rationale:** Existing databases and future ingestion paths can contain
    raw CSV rows, metric tables, or payroll text. A presentation guard keeps
    the UI safe without requiring a destructive re-ingest.
-   **Trade-off:** Some chunks produce no extract and show an honest empty
    state.
-   **Revisit if:** All ingestion paths guarantee structured, pre-summarised
    extracts.

## D-019 --- Run the same schema locally through PostgREST

-   **Decision:** The Docker stack runs PostgreSQL + pgvector, PostgREST, and
    a small nginx gateway that rewrites `/rest/v1/*`. The app's Supabase JS
    client works unchanged.
-   **Alternatives:** Require a hosted Supabase project; replace the client
    with raw `pg` queries in Docker.
-   **Rationale:** Reviewers need one-command setup without accounts, and
    local/hosted behaviour must not drift.
-   **Trade-off:** The local stack does not emulate Supabase Auth, Storage, or
    RLS. The current app uses only PostgreSQL and pgvector.
-   **Revisit if:** A feature depends on a Supabase service other than the
    database.

## D-020 --- No hand-written data in the system (18 Nov 2026)

-   **Decision:** Everything shown comes from the release packs, the HR
    master or live analysis. `scripts/seed-data.ts` and its seed script were
    deleted; `scripts/purge-seeded.ts` removes the rows they created.
-   **Alternatives:** Keep the seed as a demo baseline; keep it only for
    Docker.
-   **Rationale:** The CEO's instruction, and the seed was already
    contradicting the source data (wrong join dates, invented colour,
    scripted answers presented as the employee's words).
-   **Trade-off:** With no model available and nothing analysed, a fresh
    database shows no concerns until analysis runs.
-   **Revisit if:** Never for content; test fixtures stay in `tests/`.

## D-021 --- Fallbacks return stored data, never template text (18 Nov 2026)

-   **Decision:** When a model or embedding call fails, every endpoint falls
    back to what the database already holds (stored concerns, keyword search
    over stored evidence, recorded facts), or says nothing is on record.
-   **Rationale:** A canned paragraph is indistinguishable from a real
    finding to the CEO.
-   **Trade-off:** Answers can be thinner when models are down.

## D-022 --- Rank by severity × confidence; evidence caps severity (18 Nov 2026)

-   **Decision:** Concerns with one record or low confidence cannot rank
    above medium; no valid evidence means no concern. Ordering uses
    severity × confidence, then likelihood, then recency.
-   **Rationale:** The CEO asked that weakly evidenced points never look
    important.

## D-023 --- Each finding carries observed / inference / next step / why (18 Nov 2026)

-   **Decision:** Separate columns for observed facts, interpretation and
    the recommended action, plus a per-evidence rationale, area and owner.
    Migrations `20261118000000` and `20261118010000`.
-   **Rationale:** One blended paragraph made concerns read as copies of
    each other and hid why each record was cited.

## D-024 --- Model chains per task, structured output, validation (18 Nov 2026)

-   **Decision:** Analysis and chat each have an ordered model list with
    automatic failover (`GEMINI_ANALYSIS_MODELS`, `GEMINI_CHAT_MODELS`).
    Responses use Gemini response schemas and are validated with Zod; a
    malformed answer moves to the next model.
-   **Rationale:** Verified on the project key: the stronger models hit the
    free-tier daily limit or return 503 often; `gemini-3.1-flash-lite` is
    reliably available.
-   **Revisit if:** The key moves to a paid tier.

## D-025 --- Analyse by folder, then consolidate (18 Nov 2026)

-   **Decision:** Each data-room folder is analysed separately (call
    transcripts added to every batch as secondary context), then one
    consolidation pass writes the final list and cites which batch findings
    each item is built from; evidence is carried over, never rewritten.
-   **Rationale:** In one prompt the lite model merged distinct issues
    (payroll vanished into "financial reporting").
-   **Trade-off:** About seven model calls per run; merged findings pool
    their evidence, so some rationale links are loose.

## D-026 --- 14 chat personas chosen from the data (18 Nov 2026)

-   **Decision:** Excluding the CEO and anyone who has left, the 14 people
    with the most presence in released documents become personas, with
    seniority as the tie-break. Count via `VELOXA_PERSONA_COUNT`.
-   **Result today:** Divya Reddy, Aisha Khan and Kavya Narayan excluded.
-   **Supersedes:** A-001's department-based roster.

## D-027 --- Dated reporting-line changes (18 Nov 2026)

-   **Decision:** Reorganisations are rows in `org_changes` (tentative,
    confirmed, cancelled; effective date). The directory applies a change
    only when confirmed, effective, the new manager exists, and no loop
    results. Migration `20261118020000`.
-   **Rationale:** T6b: "make sure the thing doesn't break when we move
    people around", with the CRO not yet appointed and the date not final.

## D-028 --- Health check by business area, saved (18 Nov 2026)

-   **Decision:** An on-demand check picks 5–8 business areas from the
    evidence (clients and revenue, cash and spending, delivery…), not only
    departments; a CEO-only "department" is never treated as a team. The
    last result is saved in `health_checks` (migration `20261118030000`).

## D-029 --- Ingest Day 1–3; calls secondary; voice notes never (18 Nov 2026)

-   **Decision:** `VELOXA_RELEASE_DAYS` defaults to Day1–Day3. Data-room
    files are primary evidence, call transcripts secondary; `T6*` CEO voice
    notes are never ingested. Large tables get a generated profile chunk.

## D-030 --- Local checks on next dev only (18 Nov 2026)

-   **Decision:** Day-to-day checks use the dev server; production builds
    run before deploying. Docker images are rebuilt to update the Docker
    stack.
-   **Rationale:** A stale `next start` served HTML pointing at deleted CSS
    chunks.

## D-031 --- CEO-reported status, kept apart from HR data (19 Nov 2026)

-   **Decision:** The CEO can record a status the HR export does not show
    yet (resigned, leaving, on leave) with an expected last day. It is
    stored as `profile.reported`, labelled "reported by the CEO", kept
    through HR re-syncs, and passed to analysis, Ask and chat as context,
    never cited as evidence.
-   **Rationale:** T6d: decisions are needed before the HR record changes.
-   **Revisit if:** The HR export starts carrying the same status; clear the
    report then.

## D-032 --- Decline individual quit-risk ranking and message reading (19 Nov 2026)

-   **Decision:** Ask and chat refuse to rank named employees by likelihood
    to quit or to read private messages, and offer team-level retention
    signals instead.
-   **Rationale:** T6c. It is employee monitoring, a manager's approval is
    not the employees' consent, and no such data exists in the packs.
-   **Revisit if:** A lawful, consented, aggregate engagement source is
    provided; even then, results stay at team level.
-   **Revised 19 Nov 2026 (CEO feedback):** Private messages stay out.
    Instead of refusing outright, an on-demand **retention watch** on the
    People page lists who the CEO may want to check in with, using only work
    records (on-call load, ownership of open work, explicit statements in
    email or calls, reported status), with the reasons and their sources.
    No scores or probabilities. "Who is likely to quit?" in Ask answers from
    the last saved check. Saved in `health_checks` with `mode = 'retention'`
    (no new migration).

## D-033 --- Richer table profiles; parser version in the content hash (19 Nov 2026)

-   **Decision:** Large-table profiles add cross-tabs between grouping
    columns and totals of number columns per group (e.g. assignee × status,
    story points by assignee). A parser version is part of each file's
    content hash, so a parsing change re-ingests every file once.
-   **Rationale:** Departure-impact questions need "who owns the open work",
    which the Day 3 profile did not show; unchanged files were otherwise
    never re-read.
-   **Trade-off:** Re-ingesting replaces evidence rows, so concern evidence
    links are rebuilt by the next analysis run.

## D-034 --- Time machine: view the company as of any day (19 Nov 2026)

-   **Decision:** A date picker (release days, a strip of dated documents,
    or any day) sets a cookie; every API reads it (or `?asOf=`). A past day
    means "as known at the end of that day (IST)": documents received by
    then; concerns only if every supporting record had been received;
    people who had joined and not yet left; leave from the leave register;
    exported HR statuses only from the export date; CEO-reported statuses
    from the day reported. Saved checks show the last one run on or before
    the day.
-   **Rationale:** The CEO asked to see the state of the company on a
    specific date without hindsight.
-   **Trade-off:** Concerns come from the latest analysis, filtered by date;
    a past day shows today's wording of findings that were already knowable,
    not a re-run of the analysis as it would have read then.

## D-035 --- "What changed" uses the dates documents carry (19 Nov 2026)

-   **Decision:** Each document's own date (email Date header, "exported /
    sent …" phrases, else the first full date in prose) is shown; the day it
    entered the system is used only when it has none. Table rows' dates are
    never taken as the document date.

## D-036 --- Look and feel (19 Nov 2026)

-   **Decision:** Light/dark/system theme (no flash, remembered per
    browser) with brighter status colours in dark mode; a saffron second
    accent for urgency and time travel; a bottom tab bar on phones; a
    branded loader; the Veloxa mark (revised the same day at the CEO's
    request to an original free-standing V of two folded ribbons with a
    saffron spark, replacing an interim boxed V based on Tabler's MIT icon); chat as a drawer with "open full page"
    (`/chat/[id]`, same conversation); an A4 printable brief at `/report`.

## D-037 --- Names follow the directory; syncs re-run the analysis (19 Nov 2026)

-   **Decision:** Variant spellings of first names in generated text are
    corrected to the directory ("Pria" → Priya, "Snehal" → Sneha, "Ayesha"
    → Aisha), and count towards persona presence. A sync that changes files
    embeds them and re-runs the analysis in the background (`after()`).

## D-038 --- Simple sign-in for the whole site (19 Nov 2026)

-   **Decision:** One username and password from the environment (demo
    defaults in the README), a signed HTTP-only session cookie (HMAC,
    12 hours), and a single `src/proxy.ts` gate: signed-out page visits go to
    `/login?next=…`, API calls get 401. Trusted jobs (the Docker bootstrap)
    send `Authorization: Bearer <VELOXA_SESSION_SECRET>`.
-   **Alternatives:** Supabase Auth; a user table. Not needed for a single
    CEO user.
-   **Updated 20 Nov 2026:** The login page gained a short product panel and
    a show/hide password control. Signing out also clears chats kept in the
    browser session.

## D-039 --- Chat threads live in the browser session (20 Nov 2026)

-   **Decision:** A conversation is kept in the browser's session storage per
    person, so it carries over from the People drawer to the full chat page.
    It ends when the CEO closes it (× or "End chat"), signs out, or closes the
    tab. Nothing is stored on the server; the last few exchanges are sent with
    each question so replies stay in context.
-   **Alternatives:** Store threads in the database (persists across devices).
-   **Revisit if:** Conversations need to survive closing the browser.

## D-040 --- The PDF brief opens as a preview (20 Nov 2026)

-   **Decision:** `/report` sits over a dimmed backdrop; clicking outside the
    page, pressing Esc or "Close" returns to where it was opened.
-   **Revisit if:** More than one person needs access, or roles differ.

## D-041 --- Rotate Gemini keys on quota, without hardcoding a count (20 Nov 2026)

-   **Decision:** `GEMINI_API_KEYS` is a comma-, semicolon- or
    whitespace-separated list of any length. A request starts at the next key
    in rotation; a 401, 403 or 429 puts that key on a short cooldown and the
    request moves to the next key. If every key is cooling down, the request
    tries them in order rather than failing immediately. The legacy
    `GEMINI_API_KEY` name is still read as a one-key list.
-   **Why:** the project has three keys today, but the number can grow or
    shrink. A hardcoded pair would break the moment the list changed.
-   **Scope:** both text generation (`src/lib/ai/gemini.ts`) and embeddings
    (`src/lib/rag/embeddings.ts`) use the same rotation module.
-   **Revisit if:** a key needs a per-key model policy, or the provider exposes
    a reliable quota-reset timestamp.

## D-042 --- Commit the release packs and ship a deterministic acceptance set (20 Nov 2026)

-   **Decision:** The Day 1–4 release packs are committed, not gitignored, so
    `docker compose up --build` works from a fresh clone. The 30-question
    acceptance set lives in `tests/acceptance/` and runs without a database,
    model key or network. `TEST_SET.md` mirrors it for human review.
-   **Why:** the brief says the setup will be tested from a fresh clone, and
    the test set must run with one command. A test that needs a hosted database
    or a live model is not a reliable submission check.
-   **Trade-off:** the committed packs include the supplied fictional company
    material. They contain no real people or real company data.
-   **Revisit if:** the release material is no longer allowed in the
    repository; the bootstrap would then need an explicit download step.
