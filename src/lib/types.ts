export type Confidence = "high" | "medium" | "low" | "refused";

export type SourceKind =
  | "board_update"
  | "export"
  | "email"
  | "transcript"
  | "policy";

export interface Citation {
  ref: string; // stable evidence ref, e.g. "E-014"
  label: string; // short display label
  locator: string; // exact location inside the source
  excerpt: string;
  kind: SourceKind;
}

export type AnswerFlag =
  | "source_conflict"
  | "refused_policy"
  | "no_evidence"
  | "stale_source";

export interface CockpitAnswer {
  question: string;
  answer: string;
  confidence: Confidence;
  citations: string[]; // Citation refs
  flags: AnswerFlag[];
  /** Structured claims behind the answer, each tied to evidence refs. */
  claims: Array<{
    claim: string;
    refs: string[];
  }>;
  /** Optional conflict note shown when sources disagree. */
  conflictNote?: string;
}

export interface RiskItem {
  rank: number;
  title: string;
  severity: "critical" | "high" | "medium" | "info_gap";
  likelihood: "high" | "medium" | "low";
  statement: string; // observed facts only
  inference: string; // clearly separated interpretation
  refs: string[];
}

export interface AsOfSnapshot {
  asOf: string;
  label: string;
  available: boolean;
  metrics: Array<{ metric: string; value: string; source: string }>;
  status: string[];
  note: string;
}

export type Provenance = "grounded" | "assumed" | "no_visibility";

export interface InterviewExchange {
  question: string;
  answer: string;
  provenance: Provenance;
  refs: string[];
}

export interface Person {
  empId: string;
  name: string;
  title: string;
  department: "Engineering" | "Finance" | "People & Ops" | "Marketing";
  joined: string;
  location: string;
  /** Facts straight from the loaded records. */
  groundedFacts: string[];
  /** Invented persona colour, logged as assumptions in ASSUMPTIONS.md. */
  assumedDetails: string[];
  interview: InterviewExchange[];
}
