import type {
  AsOfSnapshot,
  Citation,
  CockpitAnswer,
  Person,
  RiskItem,
} from "../src/lib/types";

/**
 * Day 1 dummy seed data.
 *
 * Every "grounded" value here mirrors the Day 1 release pack
 * (Veloxa_Hackathon_Release_Packs/Day1_Mon_16Nov). When the real
 * ingestion pipeline lands, this module is replaced by queries against
 * the evidence store; the shapes stay identical.
 */

export const CITATIONS: Record<string, Citation> = {
  "E-001": {
    ref: "E-001",
    label: "Board Update Apr–Jun 2026",
    locator: "Board_Update_Apr-Jun_2026.pdf, p.1 — Key numbers",
    excerpt:
      "ARR (recurring) Rs. 5.8 Cr · Customers 61 · Team 19 · Monthly burn Rs. 46 L · Runway 14 months.",
    kind: "board_update",
  },
  "E-002": {
    ref: "E-002",
    label: "Board Update Jul–Sep 2026",
    locator: "Board_Update_Jul-Sep_2026.pdf, p.1 — Key numbers",
    excerpt:
      "ARR (recurring) Rs. 6.1 Cr · Customers 66 · Team 19 · Monthly burn Rs. 44 L · Runway 13 months.",
    kind: "board_update",
  },
  "E-003": {
    ref: "E-003",
    label: "Board Update Jul–Sep 2026 — Product",
    locator: "Board_Update_Jul-Sep_2026.pdf, p.1 — Product",
    excerpt:
      "Atlas is in final hardening. We moved GA to absorb unplanned reliability work after a difficult August; the engine itself is feature-complete.",
    kind: "board_update",
  },
  "E-004": {
    ref: "E-004",
    label: "Board Update Apr–Jun 2026 — Product",
    locator: "Board_Update_Apr-Jun_2026.pdf, p.1 — Product",
    excerpt:
      "Atlas (routing engine v3) is on track for GA on 15 September. Real-time re-routing is the headline feature.",
    kind: "board_update",
  },
  "E-005": {
    ref: "E-005",
    label: "Board Update Jul–Sep 2026 — Marketing",
    locator: "Board_Update_Jul-Sep_2026.pdf, p.1 — Marketing",
    excerpt:
      "The Logistics Summit drew 212 registrations, our biggest event yet.",
    kind: "board_update",
  },
  "E-006": {
    ref: "E-006",
    label: "T1 CEO kickoff call",
    locator: "T1_CEO_Kickoff_Call.docx — summary ¶2",
    excerpt:
      'Says ARR is "around forty-two crore, maybe forty-five now". Burn is "around two point two" (unit not stated). Company is roughly eighteen people ("one-eighty, give or take").',
    kind: "transcript",
  },
  "E-007": {
    ref: "E-007",
    label: "T2 CFO call",
    locator: "T2_CFO_Call.docx — summary ¶2",
    excerpt:
      'ARR at the start of the year was "forty-eight". Burn has been "two point two lakhs a month, sometimes two point five". Hiring freeze "if the raise slips".',
    kind: "transcript",
  },
  "E-008": {
    ref: "E-008",
    label: "T2 CFO call — confidentiality",
    locator: "T2_CFO_Call.docx — key points",
    excerpt:
      'Payroll runs on "Kayka" [Keka]. Individual salaries "must never show up in anything Ananya sees, only totals".',
    kind: "transcript",
  },
  "E-009": {
    ref: "E-009",
    label: "Employee Master",
    locator: "Employee_Master.xlsx, Keka HRMS export — 19 rows",
    excerpt:
      "VX001–VX019. Exported 31-Oct-2026. Departments: Engineering (5), Finance (3), People & Ops (3), Marketing (3), Leadership (1), Sales (2), Support (2).",
    kind: "export",
  },
  "E-010": {
    ref: "E-010",
    label: "Employee Master — VX013",
    locator: "Employee_Master.xlsx, row 16 (VX013 Siddharth Mehta)",
    excerpt:
      "Siddharth Mehta, Product Marketing Manager, Marketing. Status: notice period. Exit date: 31-Oct-2026.",
    kind: "export",
  },
  "E-011": {
    ref: "E-011",
    label: "Email 01 — Feb payroll",
    locator: "01.eml — Karthik → Meera, 28 Feb 2026, 20:15 IST",
    excerpt:
      "Ran Feb payroll since Fatima is out. Used the Jan sheet and added the new joiner. Totals attached in the register.",
    kind: "email",
  },
  "E-012": {
    ref: "E-012",
    label: "Emails 02/03 — payslip query",
    locator: "02.eml (6 Mar) + 03.eml (10 Mar) — Rahul ↔ Fatima",
    excerpt:
      "Rahul: first payslip looks higher than expected for a partial month. Fatima: 'Will check and get back.' No resolution in the corpus.",
    kind: "email",
  },
  "E-013": {
    ref: "E-013",
    label: "GL Export Apr–Sep 2026",
    locator: "GL_Export_Apr-Sep_2026.xlsx, Zoho Books — monthly payroll accounts",
    excerpt:
      "Payroll cost centres total ₹31.75 L in each month April–September 2026 (selected cost centres; not a complete burn statement).",
    kind: "export",
  },
  "E-014": {
    ref: "E-014",
    label: "Board Update Jul–Sep 2026 — Team",
    locator: "Board_Update_Jul-Sep_2026.pdf, p.1 — Team",
    excerpt: "Hiring is paused while we close the round. One planned departure in marketing.",
    kind: "board_update",
  },
  "E-015": {
    ref: "E-015",
    label: "T2 CFO call — payroll team",
    locator: "T2_CFO_Call.docx — key points",
    excerpt:
      'Her team: Kartik [Karthik] on planning ("he\'s doing his CFA, so forecasts are a bit late"), and Fatima Sheikh on accounts and payroll ("she was out for her wedding, that month was messy").',
    kind: "transcript",
  },
};

export const SUGGESTED_QUESTIONS = [
  "How is our ARR doing?",
  "What is our monthly burn?",
  "How big is the team?",
  "When is Atlas launching?",
  "How did the Logistics Summit go?",
  "What are Vikram's engineers working on?",
  "What is Rahul Verma's salary?",
];

export const ANSWERS: CockpitAnswer[] = [
  {
    question: "How is our ARR doing?",
    answer:
      "ARR is ₹6.1 Cr as of the Jul–Sep board update (sent 6 Oct 2026), up from ₹5.8 Cr in the Apr–Jun update.",
    confidence: "high",
    citations: ["E-001", "E-002", "E-006", "E-007"],
    flags: ["source_conflict"],
    claims: [
      { claim: "ARR ₹5.8 Cr for Apr–Jun 2026", refs: ["E-001"] },
      { claim: "ARR ₹6.1 Cr for Jul–Sep 2026", refs: ["E-002"] },
    ],
    conflictNote:
      "T1 says \"around forty-two crore, maybe forty-five now\" and T2 says \"forty-eight\" at the start of the year. Both conflict with the board updates, which agree with each other and with the ledger trajectory. The transcript figures are preserved verbatim as unresolved — not normalized to any corrected value.",
  },
  {
    question: "What is our monthly burn?",
    answer:
      "Board-reported burn is ₹44 L/month as of the 6 Oct update, down from ₹46 L in the prior quarter. Payroll cost centres alone account for ₹31.75 L/month in the ledger.",
    confidence: "medium",
    citations: ["E-001", "E-002", "E-013", "E-006", "E-007"],
    flags: ["source_conflict", "stale_source"],
    claims: [
      { claim: "Board-reported burn ₹46 L/month (Apr–Jun)", refs: ["E-001"] },
      { claim: "Board-reported burn ₹44 L/month (Jul–Sep)", refs: ["E-002"] },
      { claim: "Ledger payroll ₹31.75 L/month, Apr–Sep (selected cost centres)", refs: ["E-013"] },
    ],
    conflictNote:
      "T2 states burn of \"two point two lakhs a month, sometimes two point five\" — irreconcilable with board figures and with payroll alone. T1's \"two point two\" carries no unit. The CFO figure is recorded as conflicting, not corrected; a full burn definition is needed to reconcile.",
  },
  {
    question: "How big is the team?",
    answer: "19 people per the Keka HRMS export (31 Oct 2026) and both board updates.",
    confidence: "high",
    citations: ["E-009", "E-001", "E-002", "E-006"],
    flags: ["source_conflict"],
    claims: [
      { claim: "19 employee records in the Employee Master", refs: ["E-009"] },
      { claim: "Board-reported team size 19 in both quarterly updates", refs: ["E-001", "E-002"] },
    ],
    conflictNote:
      "T1's summary says \"roughly eighteen people\" while the quoted speech says \"one-eighty, give or take\". Neither transcript reading overrides the structured headcount evidence; 180 is never reported as fact.",
  },
  {
    question: "When is Atlas launching?",
    answer:
      "No launch date is committed. As of the 6 Oct board update, Atlas is feature-complete and in final hardening, after GA was moved to absorb unplanned reliability work following a difficult August.",
    confidence: "high",
    citations: ["E-003", "E-004"],
    flags: [],
    claims: [
      { claim: "Apr–Jun update: GA on track for 15 September", refs: ["E-004"] },
      { claim: "Jul–Sep update: GA moved; feature-complete, final hardening", refs: ["E-003"] },
    ],
  },
  {
    question: "How did the Logistics Summit go?",
    answer:
      "212 registrations — described in the Jul–Sep board update as the biggest event yet.",
    confidence: "high",
    citations: ["E-005"],
    flags: [],
    claims: [{ claim: "Logistics Summit drew 212 registrations", refs: ["E-005"] }],
  },
  {
    question: "What are Vikram's engineers working on?",
    answer:
      "I don't know. The corpus has no engineering system exports yet — the data-room index lists Jira (ATLAS), git history and PagerDuty, but those files are not in any release loaded so far. The CEO's kickoff call (T1) flags engineering speed as her top concern; that question becomes answerable when the Day-3 engineering pack arrives.",
    confidence: "refused",
    citations: ["E-006"],
    flags: ["no_evidence"],
    claims: [],
  },
  {
    question: "What is Rahul Verma's salary?",
    answer:
      "I won't answer that. The CFO's standing constraint (T2) is that individual salaries must never appear in anything the CEO sees — payroll answers are aggregates only. This is enforced before retrieval: individual payroll rows are never embedded, retrieved, prompted or logged.",
    confidence: "refused",
    citations: ["E-008"],
    flags: ["refused_policy"],
    claims: [],
  },
];

export const RISKS: RiskItem[] = [
  {
    rank: 1,
    title: "Atlas GA has already slipped once",
    severity: "critical",
    likelihood: "high",
    statement:
      "The Apr–Jun update put GA at 15 September. The 6 Oct update reports GA moved to absorb unplanned reliability work after a difficult August; the engine is feature-complete in final hardening.",
    inference:
      "A second schedule slip is plausible until the Day-3 incident and git exports land; customers were promised the routing engine \"by the festive season\" (T1, unverified).",
    refs: ["E-004", "E-003", "E-006"],
  },
  {
    rank: 2,
    title: "Payroll process exception with an open query",
    severity: "high",
    likelihood: "high",
    statement:
      "Karthik ran February payroll while Fatima was away, reusing the January sheet (email 01). Rahul Verma's first-payslip query (6 Mar) received no recorded resolution (emails 02/03).",
    inference:
      "A potential payroll control weakness worth checking — not evidence of wrongdoing. The query may be entirely benign.",
    refs: ["E-011", "E-012"],
  },
  {
    rank: 3,
    title: "Leadership is working from irreconcilable numbers",
    severity: "high",
    likelihood: "high",
    statement:
      "ARR and burn figures in T1/T2 cannot be reconciled with the board updates or the ledger as written (₹42–48 Cr vs ₹5.8–6.1 Cr; ₹2.2–2.5 L vs ₹44–46 L).",
    inference:
      "Decisions made on transcript numbers would be wrong by an order of magnitude. The cockpit always prefers the structured record and logs the conflict.",
    refs: ["E-006", "E-007", "E-001", "E-002", "E-013"],
  },
  {
    rank: 4,
    title: "Hiring paused on round closure; two backend roles unfilled",
    severity: "medium",
    likelihood: "medium",
    statement:
      "The Jul–Sep update confirms hiring is paused while the round closes; the Apr–Jun update planned two backend engineers to de-risk Atlas. The CFO ties a freeze to \"if the raise slips\".",
    inference:
      "If the round slips, Atlas hardening capacity stays constrained — compounding risk 1.",
    refs: ["E-014", "E-007"],
  },
  {
    rank: 5,
    title: "Marketing departure reached exit date",
    severity: "medium",
    likelihood: "high",
    statement:
      "The Jul–Sep update notes one planned marketing departure; VX013 (Siddharth Mehta, PMM) shows notice period with exit date 31 Oct 2026. The board update does not name him.",
    inference:
      "The linkage is an assumption (A-010). Summit follow-through and performance-marketing continuity are the exposure areas.",
    refs: ["E-010", "E-014"],
  },
  {
    rank: 6,
    title: "Engineering velocity is unmeasurable in the current corpus",
    severity: "info_gap",
    likelihood: "high",
    statement:
      "The CEO's stated top concern (T1) has no supporting exports yet: Jira, git history and PagerDuty files listed in the data-room index are absent from the loaded packs.",
    inference:
      "This is an evidence gap, not a company risk. It should disappear when the Day-3 pack arrives — and if it doesn't, that's the finding.",
    refs: ["E-006"],
  },
];

export const AS_OF_SNAPSHOTS: AsOfSnapshot[] = [
  {
    asOf: "2026-06-30",
    label: "30 Jun 2026",
    available: false,
    metrics: [],
    status: [],
    note: "No board reporting existed in the corpus on this date — the earliest board update was sent 8 Jul 2026. The honest answer to \"what did we know on 30 June?\" is: nothing in the loaded record. Later material does not leak backwards.",
  },
  {
    asOf: "2026-07-08",
    label: "8 Jul 2026",
    available: true,
    metrics: [
      { metric: "ARR", value: "₹5.8 Cr", source: "Board Update Apr–Jun (sent 8 Jul)" },
      { metric: "Burn", value: "₹46 L/mo", source: "Board Update Apr–Jun (sent 8 Jul)" },
      { metric: "Customers", value: "61", source: "Board Update Apr–Jun (sent 8 Jul)" },
      { metric: "Team", value: "19", source: "Board Update Apr–Jun (sent 8 Jul)" },
      { metric: "Runway", value: "14 months", source: "Board Update Apr–Jun (sent 8 Jul)" },
    ],
    status: [
      "Atlas: on track for GA 15 September",
      "Two backend hires planned this quarter to de-risk Atlas",
      "Logistics Summit: introductions requested",
    ],
    note: "Filtered on knowledge time: only records published on or before this date are eligible.",
  },
  {
    asOf: "2026-10-06",
    label: "6 Oct 2026",
    available: true,
    metrics: [
      { metric: "ARR", value: "₹6.1 Cr", source: "Board Update Jul–Sep (sent 6 Oct)" },
      { metric: "Burn", value: "₹44 L/mo", source: "Board Update Jul–Sep (sent 6 Oct)" },
      { metric: "Customers", value: "66", source: "Board Update Jul–Sep (sent 6 Oct)" },
      { metric: "Team", value: "19", source: "Board Update Jul–Sep (sent 6 Oct)" },
      { metric: "Runway", value: "13 months", source: "Board Update Jul–Sep (sent 6 Oct)" },
    ],
    status: [
      "Atlas: GA moved; feature-complete, final hardening",
      "Hiring paused while the round closes",
      "Logistics Summit: 212 registrations",
    ],
    note: "The 15 Sep GA date from the prior quarter is superseded as a status — but the earlier status remains available for genuinely historical queries.",
  },
  {
    asOf: "2026-10-31",
    label: "31 Oct 2026",
    available: true,
    metrics: [
      { metric: "ARR", value: "₹6.1 Cr", source: "Board Update Jul–Sep (latest)" },
      { metric: "Burn", value: "₹44 L/mo", source: "Board Update Jul–Sep (latest)" },
      { metric: "Customers", value: "66", source: "Board Update Jul–Sep (latest)" },
      { metric: "Team", value: "19 records", source: "Keka HRMS export (cut-off 31 Oct)" },
    ],
    status: [
      "VX013 exit date reached (notice period complete)",
      "System exports cut off at this date",
      "No source in the corpus describes anything after this date",
    ],
    note: "Export cut-off date. Any question about November requires the stretch behaviour (simulated activity) — not part of the Day 1 scope.",
  },
];

export const PEOPLE: Person[] = [
  {
    empId: "VX004",
    name: "Vikram Menon",
    title: "VP Engineering",
    department: "Engineering",
    joined: "2020-06-15",
    location: "Bengaluru",
    groundedFacts: [
      "Owns the 5-person engineering team (VX007, VX009, VX012, VX018)",
      "Possibly referred to as \"Vicky\" in T2's action item — identity unresolved",
      "Team's tracker per T1: \"Linear, I think, or they moved back to the Jeera board\" — unconfirmed",
    ],
    assumedDetails: [
      "Prefers written updates over meetings (invented, A-016)",
      "Drinks his coffee during standup, not before (invented, A-016)",
    ],
    interview: [
      {
        question: "Is Atlas going to make the festive-season date?",
        answer:
          "I can confirm from the records: the engine is feature-complete and in final hardening as of the 6 October board update, after we moved GA for reliability work in August. I don't have visibility into a committed new GA date — I won't guess one.",
        provenance: "grounded",
        refs: ["E-003"],
      },
      {
        question: "What is your team working on right now?",
        answer:
          "That is my interpretation, not a recorded fact: hardening the re-routing path. For what the team is actually doing day-to-day, check the Jira and git exports — I know the cockpit doesn't have them yet either.",
        provenance: "no_visibility",
        refs: [],
      },
    ],
  },
  {
    empId: "VX007",
    name: "Priya Nair",
    title: "Staff Engineer",
    department: "Engineering",
    joined: "2021-02-01",
    location: "Bengaluru",
    groundedFacts: [
      "Staff Engineer, Engineering (Employee Master)",
      "T1 (CEO): \"Pria basically holds the routing thing together\" — resolved to Priya Nair as the only phonetic match",
    ],
    assumedDetails: [
      "Treks in the Western Ghats on long weekends (invented, A-016)",
      "Mentors the two newer engineers informally (invented, A-016)",
    ],
    interview: [
      {
        question: "Are you the one holding the routing engine together?",
        answer:
          "The CEO's call transcript says that about \"Pria\" — that's me, and I can confirm the routing engine is my main area. I can confirm from the records that it's feature-complete and in hardening; the reliability work in August was real.",
        provenance: "grounded",
        refs: ["E-006", "E-003"],
      },
      {
        question: "What kept you busy in August?",
        answer:
          "I do not have visibility into what you'd want here: incident specifics live in the PagerDuty and incident exports, which aren't loaded yet. My role gives me visibility into the engineering work, not the resolved incident record.",
        provenance: "no_visibility",
        refs: [],
      },
    ],
  },
  {
    empId: "VX009",
    name: "Arjun Das",
    title: "Senior Frontend Engineer",
    department: "Engineering",
    joined: "2022-03-14",
    location: "Bengaluru",
    groundedFacts: [
      "Senior Frontend Engineer, Engineering (Employee Master)",
      "Not named in any Day 1 transcript",
    ],
    assumedDetails: [
      "Rides a motorcycle to work; photographs street food on weekends (invented, A-016)",
    ],
    interview: [
      {
        question: "What are you working on?",
        answer:
          "I don't have visibility into a task-level answer in the current corpus — my work items would come from the Jira export, which hasn't been loaded. What I can confirm: I'm the senior frontend engineer on the Atlas cockpit surfaces.",
        provenance: "no_visibility",
        refs: ["E-009"],
      },
    ],
  },
  {
    empId: "VX012",
    name: "Sneha Kulkarni",
    title: "Site Reliability Engineer",
    department: "Engineering",
    joined: "2021-09-06",
    location: "Bengaluru",
    groundedFacts: [
      "Site Reliability Engineer, Engineering (Employee Master)",
      "The \"difficult August\" and unplanned reliability work (board update) fall in her remit",
    ],
    assumedDetails: [
      "Keeps a personal postmortem notebook (invented, A-016)",
    ],
    interview: [
      {
        question: "What happened in August?",
        answer:
          "I can confirm from the records that the board called August difficult and GA was moved for reliability work. The incident-by-incident record isn't loaded yet — that's the Day-3 incidents export. I won't reconstruct it from memory.",
        provenance: "grounded",
        refs: ["E-003"],
      },
    ],
  },
  {
    empId: "VX018",
    name: "Rahul Verma",
    title: "Backend Engineer",
    department: "Engineering",
    joined: "2026-02-03",
    location: "Bengaluru",
    groundedFacts: [
      "Backend Engineer, joined 3 Feb 2026 (Employee Master)",
      "The \"new boy Rahul\" in T1",
      "His first payslip (Feb, 28 payable days) drew a query he emailed to Fatima on 6 Mar; no recorded resolution",
    ],
    assumedDetails: [
      "Plays badminton at a court near his flat in Indiranagar (invented, A-016)",
    ],
    interview: [
      {
        question: "Did your first payslip get sorted?",
        answer:
          "I can confirm from the records that I raised the query on 6 March and Fatima said she'd check. I don't have visibility into whether anything changed after that — no reply is in the corpus. I won't claim it was resolved or that I was overpaid.",
        provenance: "grounded",
        refs: ["E-012"],
      },
    ],
  },
  {
    empId: "VX003",
    name: "Meera Iyer",
    title: "CFO",
    department: "Finance",
    joined: "2019-11-01",
    location: "Bengaluru",
    groundedFacts: [
      "CFO, Finance (Employee Master)",
      "T2: books moved from Tally to \"Joho books\" [Zoho Books] around Jan–Feb; older numbers may not match",
      "T2: individual salaries must never appear in anything the CEO sees — totals only",
      "T2: hiring freeze \"if the raise slips\"",
      "T2: \"Nikhil's numbers never match mine\" (marketing spend)",
    ],
    assumedDetails: [
      "Reads annual reports for pleasure (invented, A-016)",
    ],
    interview: [
      {
        question: "What's our real burn?",
        answer:
          "I can confirm from the records: the board was told ₹46 L and then ₹44 L a month, and payroll cost centres alone run ₹31.75 L monthly in the ledger. My quoted \"two point two lakhs\" figure in the call cannot be right as stated — but I won't tell you what I 'really' meant; the recording is the recording.",
        provenance: "grounded",
        refs: ["E-001", "E-002", "E-013", "E-007"],
      },
      {
        question: "Why don't Nikhil's numbers match yours?",
        answer:
          "That is my interpretation, not a recorded fact: likely a classification difference between paid-search spend and event costs in the ledger. The budget-vs-actuals sheet I owe the CEO isn't in the corpus, so the gap stays open.",
        provenance: "grounded",
        refs: ["E-013"],
      },
    ],
  },
  {
    empId: "VX010",
    name: "Karthik Subramanian",
    title: "FP&A Manager",
    department: "Finance",
    joined: "2021-07-19",
    location: "Bengaluru",
    groundedFacts: [
      "FP&A Manager, Finance (Employee Master)",
      "T2: \"Kartik\" on planning, \"doing his CFA, so forecasts are a bit late\"",
      "Email 01: ran February payroll while Fatima was out, using the January sheet plus the new joiner",
    ],
    assumedDetails: [
      "Studies for CFA L2 on weekend mornings at a cafe (invented, A-016 — the CFA itself is grounded in T2)",
    ],
    interview: [
      {
        question: "You ran February payroll — anything to flag?",
        answer:
          "I can confirm from the records: I ran it because Fatima was away, using the January sheet and adding the new joiner. I'd call it a process exception worth checking, not a problem I found. Rahul's query afterward stayed open as far as the corpus shows.",
        provenance: "grounded",
        refs: ["E-011", "E-012"],
      },
      {
        question: "Are the forecasts late because of your CFA?",
        answer:
          "That's what the CFO's call transcript says about me. That is my interpretation, not a recorded fact: partly, but the Zoho migration making older numbers hard to compare matters more.",
        provenance: "grounded",
        refs: ["E-015"],
      },
    ],
  },
  {
    empId: "VX014",
    name: "Fatima Sheikh",
    title: "Accounts & Payroll Executive",
    department: "Finance",
    joined: "2022-01-10",
    location: "Bengaluru",
    groundedFacts: [
      "Accounts & Payroll Executive, Finance (Employee Master)",
      "T2: out for her wedding in February; \"that month was messy\"",
      "Email 03 (10 Mar): \"Will check and get back\" on Rahul's payslip query — no further record",
    ],
    assumedDetails: [
      "Married in February 2026 (grounded in T2/email timing, exact date assumed)",
    ],
    interview: [
      {
        question: "Did you ever resolve Rahul's payslip query?",
        answer:
          "I can confirm from the records that I said I'd check and get back. I do not have visibility into a reply in the corpus — I won't claim I resolved it, and I won't claim it was wrong.",
        provenance: "grounded",
        refs: ["E-012"],
      },
    ],
  },
  {
    empId: "VX005",
    name: "Deepa Joshi",
    title: "Head of People & Ops",
    department: "People & Ops",
    joined: "2020-03-02",
    location: "Bengaluru",
    groundedFacts: [
      "Head of People & Ops (Employee Master)",
      "T1: attrition \"feels high but Deepa says it's normal\"",
      "T1: HR surveys run \"on Cult Amp or something\" [Culture Amp] — no export loaded",
    ],
    assumedDetails: [
      "Walks the office floor every evening at 6 (invented, A-016)",
    ],
    interview: [
      {
        question: "Is attrition actually high?",
        answer:
          "I can confirm from the records that I called it normal and the CEO feels it's high. I don't have visibility into a number that settles it — the leave register and pulse survey aren't loaded yet, and one planned departure (VX013) isn't a trend. Both perspectives stand until the Day-2 data arrives.",
        provenance: "grounded",
        refs: ["E-010"],
      },
    ],
  },
  {
    empId: "VX015",
    name: "Rohan Banerjee",
    title: "Talent Partner",
    department: "People & Ops",
    joined: "2022-08-22",
    location: "Bengaluru",
    groundedFacts: [
      "Talent Partner, People & Ops (Employee Master)",
      "Hiring tracker is a Day-2 source — not yet loaded",
    ],
    assumedDetails: [
      "Plays football on Sundays (invented, A-016)",
    ],
    interview: [
      {
        question: "What's in the hiring pipeline?",
        answer:
          "I don't have visibility into pipeline specifics in this corpus — my tracker loads with the Day-2 pack. What I can confirm from the records: hiring is paused while the round closes, and two backend roles were planned to de-risk Atlas.",
        provenance: "no_visibility",
        refs: ["E-014"],
      },
    ],
  },
  {
    empId: "VX017",
    name: "Lakshmi Pillai",
    title: "HR & Office Executive",
    department: "People & Ops",
    joined: "2021-04-12",
    location: "Bengaluru",
    groundedFacts: [
      "HR & Office Executive, People & Ops (Employee Master)",
      "Not named in any Day 1 transcript",
    ],
    assumedDetails: [
      "Maintains the office plants and the birthday board (invented, A-016)",
    ],
    interview: [
      {
        question: "How is office morale?",
        answer:
          "I don't have visibility into a measured answer — the pulse survey is a Day-2 source. I'd rather say that than invent a vibe check.",
        provenance: "no_visibility",
        refs: [],
      },
    ],
  },
  {
    empId: "VX006",
    name: "Nikhil Bose",
    title: "Head of Marketing",
    department: "Marketing",
    joined: "2020-09-07",
    location: "Bengaluru",
    groundedFacts: [
      "Head of Marketing (Employee Master)",
      "T1: marketing \"doing a big summit thing in September\"; CEO thinks marketing spend is \"fine\"",
      "T2 (CFO): \"Nikhil's numbers never match mine\"",
      "Jul–Sep update: Logistics Summit drew 212 registrations, biggest event yet",
    ],
    assumedDetails: [
      "Collects vinyl records (invented, A-016)",
    ],
    interview: [
      {
        question: "Why don't your numbers match Meera's?",
        answer:
          "I can confirm from the records only that the disagreement exists — the CFO said it, and I don't appear in that call. That is my interpretation, not a recorded fact: my spend numbers come from campaign tracking; hers from the Zoho ledger. The reconciliation sheet isn't in the corpus.",
        provenance: "grounded",
        refs: ["E-013"],
      },
      {
        question: "Was the Summit worth it?",
        answer:
          "I can confirm from the records: 212 registrations, our biggest event yet per the board update. Whether it was worth it — I don't have visibility into cost-per-registration without the GL event lines and the invoice.",
        provenance: "grounded",
        refs: ["E-005"],
      },
    ],
  },
  {
    empId: "VX011",
    name: "Aisha Khan",
    title: "Performance Marketing Manager",
    department: "Marketing",
    joined: "2023-01-16",
    location: "Bengaluru",
    groundedFacts: [
      "Performance Marketing Manager (Employee Master)",
      "The GL's MKT-PS paid-search entries are her spend area (per T2 context)",
    ],
    assumedDetails: [
      "Runs 5k before work three days a week (invented, A-016)",
    ],
    interview: [
      {
        question: "Is paid search overspending?",
        answer:
          "I don't have visibility into an overspend — the ledger shows MKT-PS entries but no budget lines in the loaded corpus. I won't defend or deny a number that isn't there; the reconciliation gap is open until the budget-vs-actuals sheet appears.",
        provenance: "no_visibility",
        refs: ["E-013"],
      },
    ],
  },
  {
    empId: "VX013",
    name: "Siddharth Mehta",
    title: "Product Marketing Manager",
    department: "Marketing",
    joined: "2022-05-09",
    location: "Bengaluru",
    groundedFacts: [
      "Product Marketing Manager (Employee Master)",
      "Status: notice period, exit 31 Oct 2026 — matches the board update's \"one planned departure in marketing\"",
      "The board update does not name him; the linkage is assumption A-010",
    ],
    assumedDetails: [
      "Leaving for a smaller company he co-founded with friends (invented, A-016 — the record only shows the exit)",
    ],
    interview: [
      {
        question: "Are you the marketing departure?",
        answer:
          "I can confirm from the records that my status is notice period with an exit date of 31 October. The board update says \"one planned departure in marketing\" without a name — the cockpit links the two as an assumption, which I'd call reasonable.",
        provenance: "grounded",
        refs: ["E-010", "E-014"],
      },
    ],
  },
];

export const DEPARTMENTS = [
  "Engineering",
  "Finance",
  "People & Ops",
  "Marketing",
] as const;
