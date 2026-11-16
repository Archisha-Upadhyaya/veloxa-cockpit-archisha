# Decision Log --- Veloxa CXO Cockpit

**Status:** Day 1 decisions\
**Date:** 16 November 2026

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

## D-016 --- Plan one portable migration for local and hosted PostgreSQL

-   **Decision:** Keep the future schema in `supabase/migrations/` and
    use the same SQL for local pgvector Docker development and Supabase
    deployment once the Supabase data model is finalized.
-   **Alternatives:** Maintain a separate local schema; require every
    reviewer to run a database setup script; use SQLite locally.
-   **Rationale:** One migration should prevent local and hosted schemas
    from drifting. The current Docker database remains empty so no
    provisional schema is mistaken for the final model.
-   **Trade-off:** The local container is not a full Supabase emulator.
    Supabase-specific authentication, storage and row-level policies must
    be added when those application features are implemented.
-   **Status:** Planned; implementation begins after the Supabase project
    and schema are ready.
-   **Revisit if:** The application begins depending on Supabase services
    beyond PostgreSQL and pgvector.
