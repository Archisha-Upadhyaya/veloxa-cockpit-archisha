# AI Log --- Veloxa CXO Cockpit

**Date:** 16 November 2026\
**Purpose:** Record AI-assisted work, what was verified, what remains a
human decision, and corrections. This log records actual assistance used
for the Day 1 planning pass; it must be appended to as development
continues.

## Entry AI-001 --- Day 1 ZIP inspection and source inventory

-   **Activity:** Used an AI assistant to inspect the Day 1 ZIP
    inventory and extract text from the DOCX, PDF, XLSX, EML and TXT
    files.
-   **Inputs:** Day1_Mon_16Nov.zip.
-   **Outputs:** File inventory, transcript notes, employee roster
    analysis, finance-source observations and missing-file list.
-   **Verified against source:** T1 and T2 transcript text;
    Employee_Master.xlsx; GL_Export_Apr-Sep_2026.xlsx;
    Payroll_Register_Jan-Mar_2026.xlsx; both board update PDFs; all
    three EML messages; templates and data-room README.
-   **Important finding:** The data-room README names several expected
    exports that are not physically present in this Day 1 ZIP. They were
    not treated as ingested.
-   **Human review required:** Check any extracted spreadsheet row
    references against the workbook before using them in a final demo or
    printed evidence index.
-   **Status:** Completed for planning.

## Entry AI-002 --- Employee roster interpretation

-   **Activity:** Compared the Candidate Brief's request for 14 people
    across Engineering, Finance, HR and Marketing with the employee
    master.
-   **Output:** Proposed roster: Engineering 5, Finance 3, People & Ops
    3, Marketing 3.
-   **Verified:** The roster counts match the employee-master records in
    those four departments.
-   **Boundary:** CEO, Sales and Support employees remain in the company
    directory but are not included in the initial 14 agent roster.
-   **Human review required:** Confirm that a later release or reviewer
    instruction does not redefine the roster.
-   **Status:** Provisional Day 1 interpretation.

## Entry AI-003 --- Conflict identification

-   **Activity:** Compared CEO/CFO transcript statements with board
    updates, finance workbook rows and email threads.
-   **Output:** Identified headcount ambiguity, ARR conflict, burn
    conflict, Atlas schedule update, marketing-spend reconciliation gap,
    payroll process exception and Rahul payslip query.
-   **Safety constraint:** No guessed transcript correction was promoted
    to fact. Literal transcript text and structured-source values remain
    separately represented.
-   **Human review required:** Confirm source locators and add evidence
    IDs during ingestion.
-   **Status:** Completed for initial notes; resolution remains open
    where evidence is insufficient.

## Entry AI-004 --- Architecture proposal

-   **Activity:** Drafted a modular Next.js architecture using Supabase
    PostgreSQL and pgvector.
-   **Output:** Proposed relational evidence model, temporal fields,
    shared agent runtime, ingestion workflow, API contracts and payroll
    disclosure boundary.
-   **Decision ownership:** The candidate must understand, implement and
    defend the architecture. AI-generated design is not evidence that
    code exists.
-   **Human review required:** Validate schema and Supabase
    RLS/permissions; test the actual service-role and browser-key
    boundaries; implement and run migrations.
-   **Status:** Proposed, not implemented.

## Entry AI-005 --- Documentation drafting

-   **Activity:** Drafted `ARCHITECTURE.md`, `ASSUMPTIONS.md`,
    `TRANSCRIPT_NOTES.md`, `DECISIONS.md` and this `AI_LOG.md`.
-   **Output:** Day 1 documentation baseline.
-   **Verification:** Content is grounded in the uploaded Day 1 pack;
    interpretations are labelled as assumptions or unresolved conflicts.
-   **Human review required:** Candidate should read every decision and
    be able to explain the alternatives and trade-offs without relying
    on the assistant.
-   **Status:** Drafted; candidate review required.

## AI usage rules for future entries

For every meaningful AI-assisted task, append: - date and task; -
model/tool used if known; - files or prompts supplied; - generated
output or code changed; - what was independently checked; - tests run
and their result; - errors, corrections or rejected suggestions; - what
remains uncertain; - whether the output was accepted, modified or
discarded.

Do not write "AI verified" when the assistant merely generated an
answer. Verification means a human or deterministic test checked the
result against source material or executable behaviour.

Never paste individual salary values, secrets, access tokens or private
credentials into external AI prompts. Do not include restricted payroll
rows in prompts or AI logs.
