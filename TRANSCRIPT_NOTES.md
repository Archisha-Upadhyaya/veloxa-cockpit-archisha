# Transcript Notes --- Day 1

**Sources:** `T1_CEO_Kickoff_Call.docx`, `T2_CFO_Call.docx`\
**Date reviewed:** 16 November 2026

Both files are explicitly auto-generated MeetNotes summaries. T1 has
fair audio quality; T2 has poor speakerphone audio. Speakers are Ananya
R. and an unidentified Speaker 2 in T1; Meera I. and Ananya R. in T2.
The source files do not provide recording dates. Do not invent them.

## T1 --- CEO kickoff call

### T1-N01 --- Company size: "eighteen" vs "one-eighty"

-   **Transcript wording:** Summary says company is roughly eighteen
    people; parenthetical quoted phrase is "one-eighty, give or take".
-   **Other evidence:** Both board updates state team size 19. Employee
    Master contains 19 employee records.
-   **Assessment:** The transcript summary is internally ambiguous. The
    structured employee list and board updates support a team size of
    19, not 180. The source does not prove whether Ananya actually said
    "eighteen" or "one-eighty".
-   **Treatment:** Use "board-reported team size: 19; employee master:
    19 records". Attach this transcript as a conflicting/ambiguous
    source. Never claim 180 people.
-   **Confidence:** High for the conflict; no confidence in
    reconstructing the audio.

### T1-N02 --- ARR: "forty-two crore, maybe forty-five now"

-   **Transcript wording:** "around forty-two crore, maybe forty-five
    now".
-   **Other evidence:** Board update Apr--Jun reports ARR ₹5.8 Cr;
    Jul--Sep reports ₹6.1 Cr.
-   **Assessment:** Material conflict. The transcript may have a unit,
    decimal or recognition error, but there is no basis to choose a
    correction.
-   **Treatment:** Use the board-reported values for the periods they
    explicitly cover. Preserve T1's literal statement as unresolved. Do
    not normalize it to ₹4.2 Cr, ₹42 Cr or any other value.
-   **Confidence:** High that the sources disagree; low on the intended
    transcript value.

### T1-N03 --- Engineering tool: "Linear" or "Jeera board"

-   **Transcript wording:** "Linear, I think, or they moved back to the
    Jeera board"; code is on "Git Hub".
-   **Other evidence:** No engineering export is present in the Day 1
    ZIP. Data-room README says Jira (ATLAS) and Git history exist, but
    the corresponding files are absent.
-   **Assessment:** "Jeera" likely refers to Jira and "Git Hub" to
    GitHub, but this is a candidate normalization, not verified system
    evidence. Linear may be a genuine alternative.
-   **Treatment:** Preserve raw terms; create candidate aliases
    `Jeera -> Jira` and `Git Hub -> GitHub` with medium confidence. Do
    not state which work tracker is currently in use.
-   **Confidence:** Medium.

### T1-N04 --- Routing engine v3 / Atlas launch timing

-   **Transcript wording:** Version three was promised to some customers
    "by the festive season"; CEO is unsure it will make it.
-   **Other evidence:** Apr--Jun board update says Atlas GA was on track
    for 15 September. Jul--Sep update, sent 6 October, says GA moved to
    absorb unplanned reliability work after a difficult August; engine
    is feature-complete and in final hardening.
-   **Assessment:** The later board update is the latest supplied
    status. "Festive season" is imprecise and cannot be translated into
    a specific GA date.
-   **Treatment:** State that the board reported a schedule change and
    final hardening as of the 6 October update. Do not claim the product
    launched or that a new GA date was committed.
-   **Confidence:** High for the board-reported status.

### T1-N05 --- Burn: "two point two" with no unit

-   **Transcript wording:** Burn is "around two point two"; unit not
    stated.
-   **Other evidence:** T2 explicitly says ₹2.2--2.5 lakh per month;
    board updates report ₹46 L and ₹44 L per month. The GL shows monthly
    payroll of ₹31.75 L from April through September, before other
    selected costs.
-   **Assessment:** T1 alone is unitless. The T2 unit is inconsistent
    with the board figures and GL payroll alone. The transcript may be
    misheard or use a different metric, but no correction is proven.
-   **Treatment:** Keep three distinct source observations. For current
    board-reported burn, cite the relevant board update. Flag the
    transcript/ledger discrepancy.
-   **Confidence:** High that the numbers are not directly reconcilable
    from the current pack.

### T1-N06 --- HR survey platform: "Cult Amp or something"

-   **Transcript wording:** HR runs surveys on "Cult Amp or something".
-   **Other evidence:** Day 1 README mentions Culture Amp pulse as an
    expected data-room source, but no Culture Amp export is present.
-   **Assessment:** Likely Culture Amp, not confirmed by an actual
    export.
-   **Treatment:** Candidate alias only; do not report survey results or
    attrition rate from this transcript.
-   **Confidence:** Medium.

### T1-N07 --- Attrition "feels high" vs Deepa says "normal"

-   **Transcript wording:** Ananya feels attrition is high; Deepa says
    it is normal.
-   **Other evidence:** Employee Master lists Siddharth Mehta in notice
    period with exit date 31 October; Jul--Sep board update says one
    planned departure in Marketing. No leave, exit, hiring or attrition
    report is included.
-   **Assessment:** This is a difference in perception, not a measurable
    attrition trend. One planned departure is not enough to calculate
    attrition.
-   **Treatment:** Preserve both perspectives. Do not label attrition
    high or normal as a verified fact.
-   **Confidence:** High that the transcript records disagreement; low
    on actual attrition level.

### T1-N08 --- "hub sport export" and "slag channel"

-   **Transcript wording:** Action items include "Send the hub sport
    export" and "Look into slag channel for engineering updates".
-   **Other evidence:** None in the Day 1 pack identifies these terms.
-   **Assessment:** Likely speech-to-text errors, but intended phrases
    cannot be reconstructed safely.
-   **Treatment:** Preserve verbatim with `unresolved_transcription`
    status. Do not create action items with guessed names.
-   **Confidence:** High that the phrases are unclear.

### T1-N09 --- "the number by March"

-   **Transcript wording:** Speaker 2 says the board wants "the number
    by March"; unclear which number.
-   **Other evidence:** No matching board request in the supplied files.
-   **Assessment:** Ambiguous referent and unidentified speaker.
-   **Treatment:** Do not infer whether this means ARR, fundraising,
    revenue, profitability or another metric.
-   **Confidence:** High that it is unknown.

## T2 --- CFO call

### T2-N01 --- Fiscal year: FY26 or FY27

-   **Transcript wording:** Fiscal year runs April to March; speaker
    says "we're in FY twenty-six", with note that speaker may have said
    twenty-seven.
-   **Other evidence:** The board updates cover April--June and
    July--September 2026. Under an April--March fiscal year, April 2026
    begins FY2026--27 (often abbreviated FY27).
-   **Assessment:** FY27 is a plausible interpretation, but the
    transcript explicitly flags uncertainty.
-   **Treatment:** Store the literal transcript statement and the
    calendar-derived fiscal-year interpretation separately. Do not claim
    the speaker definitely said FY27.
-   **Confidence:** Medium.

### T2-N02 --- ARR at start of year: "forty-eight"

-   **Transcript wording:** ARR at start of year was "forty-eight".
-   **Other evidence:** Board updates report ₹5.8 Cr for Apr--Jun and
    ₹6.1 Cr for Jul--Sep. No unit is provided in T2.
-   **Assessment:** Could be an omitted decimal/unit, but this cannot be
    inferred as a fact.
-   **Treatment:** Keep literal "48" with unknown unit. Do not normalize
    to ₹4.8 Cr or ₹48 Cr.
-   **Confidence:** High that the value is underspecified.

### T2-N03 --- Burn: ₹2.2--2.5 lakh/month

-   **Transcript wording:** ₹2.2 lakh per month, sometimes ₹2.5 lakh.
-   **Other evidence:** Board updates report ₹46 L and ₹44 L per month.
    GL payroll alone is ₹31.75 L in each month Apr--Sep 2026.
-   **Assessment:** Material discrepancy. The ledger is selected cost
    centres, so it is not a complete burn statement; however, payroll
    alone makes ₹2.2--2.5 L/month implausible as total company burn if
    the units and periods are as written.
-   **Treatment:** Treat board figures as board-reported burn. Record
    the CFO transcript as conflicting, not corrected. Seek the full
    management accounts/cash-flow definition.
-   **Confidence:** High that the transcript statement is not
    reconcilable as written.

### T2-N04 --- Tally to "Joho books" in Jan or Feb

-   **Transcript wording:** Books moved from Tally to "Joho books"
    sometime in January or February; older numbers may not match.
-   **Other evidence:** GL workbook is labelled Zoho Books,
    Apr--Sep 2026. Data-room README identifies the finance source as
    Zoho Books.
-   **Assessment:** "Joho" likely means Zoho. Exact migration date
    remains uncertain. The supplied GL is a later-period export and does
    not prove historical completeness.
-   **Treatment:** Candidate alias `Joho Books -> Zoho Books`; retain
    Jan/Feb as an uncertain migration window.
-   **Confidence:** Medium-High for product normalization; low for exact
    migration date.

### T2-N05 --- Payroll on "Kayka"

-   **Transcript wording:** Payroll runs on "Kayka".
-   **Other evidence:** Day 1 README says Keka HRMS; payroll register is
    explicitly described as a pre-Keka payroll workbook. No Keka payroll
    export is included.
-   **Assessment:** Likely Keka. The supplied Jan--Mar register is a
    legacy/pre-Keka source, so it should not be represented as a current
    Keka export.
-   **Treatment:** Candidate alias `Kayka -> Keka`; label payroll
    register as pre-Keka/legacy.
-   **Confidence:** High for likely product name; high that this
    register is pre-Keka based on workbook description.

### T2-N06 --- Individual salaries must not appear to Ananya

-   **Transcript wording:** Individual salaries "must never show up in
    anything Ananya sees, only totals".
-   **Other evidence:** Payroll workbook contains individual gross,
    deductions and net amounts.
-   **Assessment:** Explicit confidentiality requirement.
-   **Treatment:** Enforce at the retrieval and data-service layers. Do
    not embed, prompt, log or return individual payroll rows in
    CEO-facing workflows. Only approved aggregates can be exposed.
-   **Confidence:** High.

### T2-N07 --- Fatima absence and Karthik running February payroll

-   **Transcript wording:** Fatima was out for her wedding; that month
    was messy. Karthik was handling planning and forecasts.
-   **Other evidence:** Email `01.eml` dated 28 Feb 2026 says Karthik
    ran February payroll since Fatima was out, used the January sheet
    and added the new joiner.
-   **Assessment:** Email independently supports the process exception.
    It does not prove a payroll error.
-   **Treatment:** Link the email and transcript to a payroll-process
    observation; do not make personal-life details beyond what is in the
    supplied source.
-   **Confidence:** High.

### T2-N08 --- Rahul's first payslip query remains open

-   **Transcript / email evidence:** Rahul emails Fatima on 6 March that
    the amount on his first payslip seems higher than expected for a
    partial month. Fatima replies on 10 March: "Will check and get
    back."
-   **Structured evidence:** Employee Master gives Rahul's join date as
    3 Feb 2026. Payroll register has a February row with 28 days
    payable.
-   **Assessment:** A query and apparent mismatch exist. The source pack
    contains no response resolving it and no attendance/payable-day
    policy.
-   **Treatment:** Open question / potential payroll control issue. Do
    not say Rahul was overpaid or underpaid.
-   **Confidence:** High that the query exists; unknown whether payroll
    is wrong.

### T2-N09 --- Marketing spend mismatch

-   **Transcript wording:** "Nikhil's numbers never match mine."
-   **Other evidence:** GL contains MKT-PS paid-search entries and
    MKT-EVT summit/event entries. The action item is to share a
    budget-vs-actuals sheet, but that sheet is absent.
-   **Assessment:** The discrepancy is reported but not measurable from
    the selected ledger lines alone.
-   **Treatment:** Add a reconciliation gap. Do not accuse Marketing of
    overspend or Finance of incorrect classification.
-   **Confidence:** High that a mismatch was reported; low on
    cause/size.

### T2-N10 --- "Vicky" and hiring freeze

-   **Transcript wording:** Action item says check the freeze decision
    with "Vicky"; Meera may freeze hiring if the raise slips.
-   **Other evidence:** Employee Master contains Vikram Menon, but no
    direct evidence equates "Vicky" with Vikram. Jul--Sep board update
    says hiring is paused while the round closes.
-   **Assessment:** Hiring pause is corroborated at company level by the
    board update. Identity of "Vicky" remains uncertain.
-   **Treatment:** Use the board update for hiring-paused status. Keep
    "Vicky" unresolved; do not map automatically to Vikram.
-   **Confidence:** High for the board-reported pause; low-medium for
    identity mapping.

## Cross-source resolution policy

-   Prefer a structured export for exact employee IDs, dates and
    recorded transaction amounts, while retaining known export
    limitations.
-   Prefer a board update for what the board was told at that reporting
    date, not as an audited truth.
-   Use emails to corroborate concrete process events and unresolved
    follow-ups.
-   Treat transcript statements as valuable evidence of what leaders
    believed or said, but account for machine transcription, ambiguous
    units and speaker bias.
-   A later source may supersede an earlier *status* without erasing the
    earlier status as historical evidence.
-   Do not turn a plausible explanation into a resolved conflict without
    supporting evidence.
