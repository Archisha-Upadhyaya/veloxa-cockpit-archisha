/**
 * Evidence presentation and safety helpers.
 *
 * The cockpit stores raw document chunks for traceability, but the CEO should
 * never be shown a raw chunk. Everything rendered in the UI goes through this
 * module first: it extracts a short, self-explanatory summary, removes table
 * noise, and blocks individual payroll evidence.
 */

export type EvidenceKind =
  | "email"
  | "transcript"
  | "spreadsheet"
  | "ledger"
  | "document"
  | "unknown";

export type EvidenceSnippet = {
  summary: string;
  kind: EvidenceKind;
  sensitive: boolean;
  dateLabel?: string;
};

export type SnippetContext = {
  /** Risk title/description, chat question, or search query. */
  context?: string;
  sourceTitle?: string;
  locator?: string;
};

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const STOP_WORDS = new Set([
  "the", "and", "for", "from", "with", "that", "this", "these", "those",
  "into", "over", "under", "about", "after", "before", "between", "during",
  "there", "their", "they", "them", "have", "has", "had", "was", "were",
  "will", "would", "could", "should", "can", "may", "might", "must", "not",
  "but", "while", "when", "where", "what", "which", "who", "whom", "whose",
  "why", "how", "all", "any", "each", "more", "most", "some", "such", "than",
  "then", "too", "very", "just", "also", "only", "own", "same", "our", "your",
  "its", "his", "her", "him", "she", "he", "you", "me", "my", "we", "us",
  "is", "are", "be", "been", "being", "do", "does", "did", "done", "get",
  "got", "make", "made", "use", "used", "see", "seen", "say", "said",
]);

const SYNONYMS: Record<string, string[]> = {
  hiring: ["hire", "hired", "recruit", "recruiting", "recruitment", "role", "roles", "headcount", "requisition", "candidate", "offer", "backfill", "vacancy", "open"],
  staffing: ["capacity", "headcount", "role", "roles", "team", "backfill", "attrition", "departure", "resign", "resignation", "notice", "leave", "absence", "coverage"],
  capacity: ["workload", "overload", "understaffed", "bandwidth", "cover", "absence", "leave", "burnout", "handoff"],
  retention: ["attrition", "resign", "resignation", "departure", "notice", "exit", "stay", "leave"],
  departure: ["resign", "resignation", "notice", "exit", "leaving", "last working day"],
  payroll: ["salary", "salaries", "payslip", "compensation", "deduction", "gross", "net", "pay"],
  finance: ["ledger", "burn", "expense", "invoice", "cost", "budget", "cash", "runway", "arr"],
  launch: ["release", "ga", "general availability", "delivery", "ship", "milestone", "timeline"],
  incident: ["outage", "downtime", "reliability", "bug", "severity", "postmortem", "on-call"],
  marketing: ["campaign", "event", "summit", "lead", "spend", "brand"],
  safety: ["risk", "concern", "issue", "problem", "control", "weakness"],
  workload: ["busy", "overloaded", "stretched", "bandwidth", "capacity", "queue", "deadline"],
};

const PAYROLL_MARKERS = [
  /\bpayroll\s+register\b/i,
  /\bgross\s*\(rs\.?\)/i,
  /\bnet\s*\(rs\.?\)/i,
  /\bdeductions?\s*\(rs\.?\)/i,
  /\bdays\s+payable\b/i,
  /\bprocessed\s+by\b/i,
];

const PAYROLL_ROW =
  /\bVX\d{3}\s*,\s*[^,\n]{2,},\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s-]?\d{4}\s*,\s*\d{1,2}\s*,\s*\d{1,2}\s*,/i;

const PAY_AMOUNT =
  /(?:\d{1,3}(?:,\d{2,3}){1,3}|\d{4,}|\d+(?:\.\d+)?\s*(?:l|lpa|lakh|lakhs|crore|cr)\b)/i;

const INDIVIDUAL_PAY = new RegExp(
  `\\b(?:salary|salaries|compensation|ctc|gross\\s+pay|net\\s+pay|take[\\s-]?home|payslip)\\b[^\\n]{0,90}?(?:₹|rs\\.?|inr)?\\s*${PAY_AMOUNT.source}`,
  "i",
);

const PAYSLIP_HEADER =
  /\b(?:employee|name)\b[^\n]{0,80}\b(?:salary|gross|net\s*pay|ctc|deductions?)\b/i;

const LEDGER_HEADER_HINTS = ["vendor", "payee", "amount", "cost centre", "cost center", "narration", "voucher", "txn date"];

const ACTION_WORDS =
  /\b(resign|resigned|hired|hire|left|leaving|paused|pause|open|opened|delayed|slipped|moved|approved|raised|joined|departed|missed|frozen|freeze|on hold|offer|acceptance|attrition|notice|exit|absence|leave|overload|overloaded|burnout)\b/i;

function decodeEntities(value: string) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function normalize(value: string) {
  return decodeEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Individual payroll rows and payroll registers are never safe to show to the
 * CEO. Aggregate payroll totals are allowed; named employee pay is not.
 */
export function isSensitiveEvidence(text: string): boolean {
  const value = normalize(text);
  if (!value) return false;
  if (/\bpayroll\s+register\b/i.test(value)) return true;
  if (PAYROLL_ROW.test(value)) return true;
  const markerHits = PAYROLL_MARKERS.filter((marker) => marker.test(value)).length;
  if (markerHits >= 2) return true;
  if (/\bVX\d{3}\b/.test(value) && INDIVIDUAL_PAY.test(value)) return true;
  // Header-led payslips do not repeat the word "payroll" on every row.
  if (
    PAYSLIP_HEADER.test(value) &&
    /\bVX\d{3}\b/.test(value) &&
    PAY_AMOUNT.test(value)
  ) {
    return true;
  }
  return false;
}

/**
 * Stricter guard used for model output. Any individual compensation signal is
 * rejected, even if it does not look like a payroll register row.
 */
export function containsCompensationData(text: string): boolean {
  const value = normalize(text);
  if (!value) return false;
  if (isSensitiveEvidence(value)) return true;
  if (INDIVIDUAL_PAY.test(value)) return true;
  if (/\b(?:gross|net|deductions?)\s*\(rs\.?\)/i.test(value)) return true;
  return false;
}

export function redactSensitiveLines(text: string): string {
  return normalize(text)
    .split("\n")
    .filter((line) => {
      if (!line.trim()) return false;
      if (PAYROLL_ROW.test(line)) return false;
      if (PAYROLL_MARKERS.some((marker) => marker.test(line))) return false;
      if (/\bVX\d{3}\b/.test(line) && INDIVIDUAL_PAY.test(line)) return false;
      return true;
    })
    .join("\n");
}

/**
 * True when text still looks like a table, CSV export, or document dump.
 */
export function looksLikeRawDump(text: string): boolean {
  const value = normalize(text);
  if (!value) return false;
  if (/\bSheet:\s*/i.test(value)) return true;
  if (/\bchunk-\d+/i.test(value)) return true;
  if (/,{3,}/.test(value)) return true;
  if (/\t{2,}/.test(value)) return true;
  if (/\b(?:Txn Date,\s*Voucher|Emp ID,\s*Name,\s*Month|Employee,\s*Leave Type)\b/i.test(value)) {
    return true;
  }
  const lines = value.split("\n").filter((line) => line.trim());
  const csvLines = lines.filter(
    (line) => (line.match(/,/g) ?? []).length >= 5,
  ).length;
  if (csvLines >= 2) return true;
  return false;
}

function isJunkSentence(sentence: string) {
  const value = compact(sentence);
  if (!value) return true;
  if (
    /^(?:period|reporting period|runway|prepared|confidential|page|action items?|key numbers?|summary|source)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  if (
    /\b(?:auto-detected|chunk|row \d+|column|corpus|dataset|retrieval|analytical flag)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  // An amount that ends at "Rs." is a broken table cell, not a sentence.
  if (/\b(?:Rs|INR|₹)\.?\s*$/i.test(value)) return true;
  if ((value.match(/·/g) ?? []).length >= 1) return true;
  const digits = (value.match(/\d/g) ?? []).length;
  const letters = (value.match(/[a-z]/gi) ?? []).length;
  if (digits >= 8 && digits / Math.max(letters, 1) > 0.2) return true;
  if (!/[a-z]{3}/i.test(value)) return true;
  return false;
}

function splitSentences(text: string) {
  // Protect common abbreviations so "Rs. 46 L" is not split into two
  // fragments. The NUL marker is restored immediately after splitting.
  const protectedText = compact(text).replace(
    /\b(Rs|Mr|Mrs|Ms|Dr|No|Ltd|Inc|vs|etc|approx|Pvt)\.\s/gi,
    "$1\u0000 ",
  );
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .map((sentence) => sentence.replace(/\u0000/g, ".").trim())
    .filter((sentence) => sentence.length >= 18 && !isJunkSentence(sentence));
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  fields.push(current.trim());
  return fields;
}

function meaningful(value: string | undefined) {
  if (!value) return false;
  const text = value.trim();
  return Boolean(
    text &&
      text !== "-" &&
      text !== "—" &&
      text.toLowerCase() !== "n/a" &&
      text.toLowerCase() !== "na" &&
      text.toLowerCase() !== "null" &&
      text !== "0",
  );
}

function termList(context?: string) {
  const terms = new Set<string>();
  if (!context) return terms;
  const words = context
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  for (const word of words) {
    terms.add(word);
    for (const synonym of SYNONYMS[word] ?? []) terms.add(synonym);
  }
  return terms;
}

function fieldScore(fields: string[], terms: Set<string>) {
  const haystack = fields.join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += term.length >= 6 ? 3 : 2;
  }
  if (ACTION_WORDS.test(haystack)) score += 2;
  if (/\b(?:2025|2026|2027)\b/.test(haystack)) score += 1;
  if (/\b(?:rs\.?|₹)\s?\d/i.test(haystack)) score += 1;
  return score;
}

function sentenceScore(sentence: string, terms: Set<string>) {
  const lower = sentence.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (lower.includes(term)) score += term.length >= 6 ? 3 : 2;
  }
  if (ACTION_WORDS.test(lower)) score += 2;
  if (/\b(?:2025|2026|2027)\b|\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(lower)) {
    score += 2;
  }
  if (/\b(?:rs\.?|₹)\s?\d/i.test(lower)) score += 1;
  if ((sentence.match(/,/g) ?? []).length >= 4) score -= 5;
  if (sentence.length > 360) score -= 2;
  return score;
}

function bestSentences(text: string, terms: Set<string>, limit = 2) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return "";
  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: sentenceScore(sentence, terms),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .sort((left, right) => left.index - right.index);
  if (ranked.length === 0) {
    return sentences.slice(0, limit).join(" ");
  }
  return ranked.map((item) => item.sentence).join(" ");
}

function formatDate(value: string): string {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    if (!Number.isNaN(date.valueOf())) {
      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
    }
  }
  const dayFirst = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dayFirst) {
    const year = Number(dayFirst[3].length === 2 ? `20${dayFirst[3]}` : dayFirst[3]);
    const date = new Date(Date.UTC(year, Number(dayFirst[2]) - 1, Number(dayFirst[1])));
    if (!Number.isNaN(date.valueOf())) {
      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
    }
  }
  const named = text.match(
    /\b(\d{1,2})[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s-]+(\d{4})\b/i,
  );
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month !== undefined) {
      const date = new Date(Date.UTC(Number(named[3]), month, Number(named[1])));
      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
    }
  }
  return compact(text.slice(0, 40));
}

function formatAmount(value: string): string {
  const text = value.replace(/rs\.?|inr|₹/gi, "").replace(/,/g, "").trim();
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) {
    return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(numeric)}`;
  }
  return compact(value);
}

function clampSentence(value: string, maximum = 300) {
  let text = compact(value)
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\.\s*\./g, ".")
    .trim();
  if (!text) return "";
  if (text.length > maximum) {
    const window = text.slice(0, maximum);
    const boundary = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("; "),
      window.lastIndexOf(", "),
      window.lastIndexOf(" "),
    );
    text = `${window.slice(0, boundary > maximum * 0.55 ? boundary : maximum).trim()}…`;
  }
  if (!/[.!?…]$/.test(text)) text += ".";
  return text;
}

function humanizeSourceTitle(sourceTitle?: string) {
  if (!sourceTitle) return "Source";
  const base = sourceTitle.split("/").pop()?.replace(/\.[^.]+$/, "") ?? sourceTitle;
  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn an export file name into a label a CEO can read. The raw title stays in
 * the database for traceability; only the presentation label changes.
 */
export function friendlySourceTitle(sourceTitle?: string) {
  const raw = compact(sourceTitle ?? "");
  if (!raw) return "Source";
  const base = raw.split("/").pop()?.replace(/\.[^.]+$/, "") ?? raw;
  const lower = base.toLowerCase();
  if (/^t6[abcd](?:[_\s-]|$)/.test(lower)) return "CEO voice note";
  if (/^t1(?:[_\s-]|$)/.test(lower)) return "CEO kickoff call";
  if (/^t2(?:[_\s-]|$)/.test(lower)) return "CFO call";
  if (/^t3(?:[_\s-]|$)/.test(lower)) return "Head of People call";
  if (/^t4(?:[_\s-]|$)/.test(lower)) return "Head of Marketing call";
  if (/^t5(?:[_\s-]|$)/.test(lower)) return "VP Engineering call";
  const board = base.match(/board.?update.?([a-z]{3})[-_ ]?([a-z]{3})[-_ ](\d{4})/i);
  if (board) {
    const month = (value: string) =>
      `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
    return `Board update, ${month(board[1])}–${month(board[2])} ${board[3]}`;
  }
  const ledger = base.match(/gl.?export.?([a-z]{3})[-_ ]?([a-z]{3})[-_ ](\d{4})/i);
  if (ledger) {
    const month = (value: string) =>
      `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
    return `Finance ledger, ${month(ledger[1])}–${month(ledger[2])} ${ledger[3]}`;
  }
  if (/^employee.?master/.test(lower)) return "Employee master";
  if (/^hiring.?tracker/.test(lower)) return "Hiring tracker";
  if (/^leave.?register/.test(lower)) return "Leave register";
  if (/^pulse.?survey/.test(lower)) return "Pulse survey";
  if (/^resignation.?letter/.test(lower)) return "Resignation letter";
  if (/^connection.?worksheet/.test(lower)) return "Connection worksheet";
  if (/^entity.?resolution/.test(lower)) return "Entity resolution";
  if (/^evidence.?index/.test(lower)) return "Evidence index";
  if (/^\d{1,2}$/.test(base)) return "Email";
  return humanizeSourceTitle(sourceTitle);
}

function extractDateLabel(text: string, sourceTitle?: string) {
  const source = humanizeSourceTitle(sourceTitle);
  const quarter = source.match(/\b([a-z]{3})[a-z]*[\s-]+([a-z]{3})[a-z]*[\s-]+(\d{4})\b/i);
  if (quarter) {
    return `${quarter[1]}–${quarter[2]} ${quarter[3]}`;
  }
  const explicit = text.match(
    /\b(?:dated|sent|on|date:?)\s+(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4})\b/i,
  );
  if (explicit) return formatDate(explicit[1]);
  const named = text.match(
    /\b(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4})\b/i,
  );
  if (named) return formatDate(named[1]);
  return undefined;
}

function ledgerRowFromFields(fields: string[], header: string[] | null) {
  const find = (names: string[]) => {
    if (!header) return -1;
    return header.findIndex((column) =>
      names.some((name) => column.toLowerCase().includes(name)),
    );
  };
  const dateIndex = find(["date"]);
  const vendorIndex = find(["vendor", "payee"]);
  const costIndex = find(["cost centre", "cost center", "cost"]);
  const amountIndex = find(["amount"]);
  const narrationIndex = find(["narration", "description", "notes"]);
  const standard = !header && fields.length >= 7;
  return {
    date: standard ? fields[0] : dateIndex >= 0 ? fields[dateIndex] : "",
    vendor: standard ? fields[2] : vendorIndex >= 0 ? fields[vendorIndex] : "",
    costCentre: standard ? fields[4] : costIndex >= 0 ? fields[costIndex] : "",
    amount: standard ? fields[5] : amountIndex >= 0 ? fields[amountIndex] : "",
    narration: standard ? fields[6] : narrationIndex >= 0 ? fields[narrationIndex] : "",
  };
}

function formatLedgerRow(row: ReturnType<typeof ledgerRowFromFields>) {
  const vendor = compact(row.vendor);
  const narration = compact(row.narration);
  const date = row.date ? formatDate(row.date) : "";
  const amount = row.amount ? formatAmount(row.amount) : "";
  const cost = compact(row.costCentre);
  const parts: string[] = [];
  if (vendor) parts.push(vendor);
  if (narration && narration.toLowerCase() !== vendor.toLowerCase()) parts.push(narration);
  if (parts.length === 0) return "";
  let summary = parts.join(" — ");
  if (date) summary += ` (${date})`;
  if (amount) summary += `, ${amount}`;
  if (cost) summary += ` (cost centre ${cost})`;
  return clampSentence(summary, 260);
}

function extractLedgerRow(text: string, terms: Set<string>) {
  const lines = normalize(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const headerIndex = lines.findIndex((line) => {
    const fields = parseCsvLine(line).map((field) => field.toLowerCase());
    return (
      fields.some((field) => field.includes("vendor") || field.includes("payee")) &&
      fields.some((field) => field.includes("amount")) &&
      fields.some((field) => field.includes("date") || field.includes("txn"))
    );
  });
  const header =
    headerIndex >= 0 ? parseCsvLine(lines[headerIndex]).map((field) => field.trim()) : null;
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  let best: { row: ReturnType<typeof ledgerRowFromFields>; score: number } | null = null;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || LEDGER_HEADER_HINTS.some((hint) => line.toLowerCase().startsWith(hint))) {
      continue;
    }
    const fields = parseCsvLine(line);
    if (fields.length < 4) continue;
    const raw = fields.join(",");
    if (isSensitiveEvidence(raw)) continue;
    if (/\b(?:salaries|payroll)\b/i.test(raw) && !terms.has("payroll") && !terms.has("salary")) {
      continue;
    }
    const row = ledgerRowFromFields(fields, header);
    if (!row.vendor && !row.narration) continue;
    if (!row.date && !row.amount) continue;
    const score = fieldScore(fields, terms);
    if (!best || score > best.score) best = { row, score };
  }
  if (!best || best.score <= 0) return "";
  return formatLedgerRow(best.row);
}

function extractSpreadsheetRow(text: string, terms: Set<string>) {
  const flat = compact(text);
  const rawEmployee = flat.match(
    /\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}),\s*([^,]{2,60}),\s*([^.]+)\.\s*Status:\s*([^.]+)\.\s*Exit date:\s*([0-9A-Za-z -]{6,20})/i,
  );
  if (rawEmployee) {
    return clampSentence(
      `${rawEmployee[1]} is ${rawEmployee[2]} in ${rawEmployee[3]}, with an exit date of ${formatDate(rawEmployee[5])} (${rawEmployee[4].toLowerCase()}).`,
      260,
    );
  }

  const lines = normalize(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^sheet:\s*/i.test(line));
  if (lines.length === 0) return "";
  const headerCandidates = lines
    .slice(0, 12)
    .map((line, index) => ({
      line,
      index,
      fields: parseCsvLine(line).filter((field) => meaningful(field)),
    }))
    .filter((candidate) => candidate.fields.length >= 3)
    .sort((left, right) => right.fields.length - left.fields.length);
  const header = headerCandidates[0];
  if (!header) return "";
  const headerFields = parseCsvLine(header.line);
  let best:
    | { fields: string[]; score: number; index: number }
    | null = null;
  for (let index = header.index + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const fields = parseCsvLine(line);
    const values = fields.filter((field) => meaningful(field));
    if (values.length < 2) continue;
    const raw = fields.join(",");
    if (isSensitiveEvidence(raw)) continue;
    if (/\b(?:salaries|payroll)\b/i.test(raw) && !terms.has("payroll")) continue;
    const score = fieldScore(fields, terms);
    if (!best || score > best.score) best = { fields, score, index };
  }
  if (!best) return "";
  if (best.score <= 0) return "";
  const pairs = headerFields
    .map((column, index) => ({ column: compact(column), value: compact(best?.fields[index] ?? "") }))
    .filter((pair) => meaningful(pair.column) && meaningful(pair.value));
  if (pairs.length === 0) return "";
  const get = (names: string[]) =>
    pairs.find((pair) => names.some((name) => pair.column.toLowerCase().includes(name)))?.value;
  const name = get(["full name", "employee name", "employee", "name"]);
  const title = get(["title", "role", "position"]);
  const department = get(["department"]);
  const status = get(["status"]);
  const exitDate = get(["exit date"]);
  if (name && (exitDate || (status && !/^active$/i.test(status)))) {
    let summary = `${name}${title ? ` is ${title}` : ""}${department ? ` in ${department}` : ""}`;
    if (exitDate) summary += `, with an exit date of ${formatDate(exitDate)}`;
    if (status && !/^active$/i.test(status)) summary += ` (${status.toLowerCase()})`;
    return clampSentence(summary, 260);
  }
  const role = get(["role", "position", "title"]);
  const statusDate = get(["status date", "date"]);
  const pipeline = get(["in pipeline", "pipeline", "candidates"]);
  const notes = get(["notes", "note", "comment"]);
  if (role && status) {
    let summary = `${role} — ${status}`;
    if (statusDate) summary += ` (${formatDate(statusDate)})`;
    if (pipeline) summary += `; ${pipeline} in pipeline`;
    if (notes) summary += `. ${notes}`;
    return clampSentence(summary, 260);
  }
  const employee = get(["employee", "name"]);
  const leaveType = get(["leave type", "type"]);
  const from = get(["from", "start"]);
  const to = get(["to", "end"]);
  if (employee && leaveType) {
    let summary = `${employee} — ${leaveType} leave`;
    if (from && to) summary += `, ${formatDate(from)} to ${formatDate(to)}`;
    return clampSentence(summary, 260);
  }
  const team = get(["team"]);
  const quarterValue = get(["quarter"]);
  const engagement = get(["engagement"]);
  if (team && engagement) {
    return clampSentence(
      `${team} engagement was ${engagement}/5${quarterValue ? ` in ${quarterValue}` : ""}`,
      220,
    );
  }
  // Deliberately no generic column dump. A vague sentence is better than a raw
  // row the CEO cannot read.
  return "";
}

function extractEmail(text: string, terms: Set<string>) {
  const lines = normalize(text).split("\n");
  const subject = lines
    .map((line) => line.match(/^Subject:\s*(.+)$/i)?.[1]?.trim())
    .find(Boolean);
  const bodyLines = lines.filter(
    (line) =>
      !/^(?:From|To|Cc|Bcc|Subject|Date|Reply-To):/i.test(line.trim()) &&
      !/^-{2,}\s*(?:original|forwarded)\s*message\s*-{2,}$/i.test(line.trim()),
  );
  const body = bodyLines
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:hi|hello|dear)\s+[^,]{1,40},?\s*/i, "")
    .replace(/\bOn .{0,120}wrote:/i, " ")
    .replace(/\b(?:Regards|Thanks|Thank you|Best|Sincerely)[,.!]?\s*$/i, " ");
  const best = bestSentences(body, terms, 2);
  if (subject && best) {
    const subjectText = compact(subject);
    const bestText = compact(best);
    if (bestText.toLowerCase().startsWith(subjectText.toLowerCase())) return bestText;
    return clampSentence(`${subjectText}: ${bestText}`, 300);
  }
  if (best) return best;
  return subject ? clampSentence(subject, 180) : "";
}

function extractDocument(text: string, terms: Set<string>) {
  const lines = normalize(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  // PDF text extraction puts every table cell in its own paragraph. Treat
  // paragraphs as separate units so a metrics table cannot be glued into one
  // long pseudo-sentence ahead of the actual prose.
  const paragraphs = normalize(text)
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);
  const flat = lines.join("\n");
  const prose = paragraphs
    .filter(
      (paragraph) =>
        !/^(?:to|from|subject|date|dear|regards|sincerely|thanks|best)\b/i.test(
          paragraph,
        ),
    )
    .join(". ");
  const head = lines.slice(0, 6);
  const headName = head.find((line) =>
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(line),
  );
  const signature = flat.match(
    /(?:regards|sincerely|thanks|best)[,.\s]*\n+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*$/i,
  )?.[1];
  const name = headName ?? signature;
  const documentDate = head.find((line) =>
    /^\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}$/i.test(line),
  );
  const role = flat.match(/resignation from the role of ([^.\n]+)/i)?.[1]?.trim();
  const lastDay = flat.match(/last working day (?:will be|is) ([^.\n]+)/i)?.[1]?.trim();
  if (role && lastDay) {
    const date = documentDate ? formatDate(documentDate) : "";
    const subject = name ?? "The employee";
    const first = date
      ? `${subject} resigned as ${role} on ${date}`
      : `${subject} resigned as ${role}`;
    return clampSentence(`${first}; last working day ${lastDay}`, 280);
  }
  const firstSentence = bestSentences(prose, terms, 2);
  if (firstSentence) return firstSentence;
  return "";
}

function extractTranscript(text: string, terms: Set<string>) {
  const lines = normalize(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const keyStart = lines.findIndex((line) => /^key points$/i.test(line));
  const body = keyStart >= 0 ? lines.slice(keyStart + 1).join(" ") : lines.join(" ");
  const best = bestSentences(body, terms, 2);
  if (best) return best;
  return "";
}

function kindFor(sourceTitle: string | undefined, text: string): EvidenceKind {
  const extension = sourceTitle?.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "eml") return "email";
  if (extension === "xlsx" || extension === "csv") {
    return /txn date|voucher|vendor \/ payee/i.test(text) ? "ledger" : "spreadsheet";
  }
  if (extension === "docx") return "transcript";
  if (extension === "pdf") return "document";
  if (/\bSheet:\s*/i.test(text)) return "spreadsheet";
  if (
    /employee master|hiring tracker|leave register|pulse survey|gl export|entity resolution|evidence index/i.test(
      sourceTitle ?? "",
    )
  ) {
    return /gl export/i.test(sourceTitle ?? "") ? "ledger" : "spreadsheet";
  }
  return "unknown";
}

function sanitizeForExtraction(text: string) {
  return normalize(text)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\bchunk-\d+\b/gi, " ")
    .replace(/^Sheet:\s*.+$/gim, " ")
    .replace(/\bAction items?\s*\(auto-detected\).*$/gim, " ")
    .replace(/\bAction items?\s*:.*$/gim, " ")
    .split("\n")
    .filter(
      (line) =>
        !/^(?:team|product|marketing|finance|people|key numbers|summary|key points|risks?)$/i.test(
          line.trim(),
        ),
    )
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Convert a raw evidence chunk into one short, human-readable sentence (or
 * two). Returns sensitive=true and no summary for individual payroll data.
 */
export function extractEvidenceSnippet(
  rawText: string,
  options: SnippetContext = {},
): EvidenceSnippet {
  const kind = kindFor(options.sourceTitle, rawText);
  if (isSensitiveEvidence(rawText)) {
    return { summary: "", kind, sensitive: true };
  }
  const terms = termList(options.context);
  const text = sanitizeForExtraction(rawText);
  if (!text) return { summary: "", kind, sensitive: false };

  let summary = "";
  if (kind === "ledger") {
    summary = extractLedgerRow(text, terms);
  } else if (kind === "spreadsheet") {
    summary = extractSpreadsheetRow(text, terms);
  } else if (kind === "email") {
    summary = extractEmail(text, terms);
  } else if (kind === "transcript") {
    summary = extractTranscript(text, terms);
  } else if (kind === "document") {
    summary = extractDocument(text, terms);
  }

  if (!summary) summary = bestSentences(text, terms, 2);
  if (!summary) summary = splitSentences(text).slice(0, 2).join(" ");
  if (!summary) return { summary: "", kind, sensitive: false };

  summary = clampSentence(summary, 300);
  if (looksLikeRawDump(summary) || isSensitiveEvidence(summary)) {
    return { summary: "", kind, sensitive: isSensitiveEvidence(summary) };
  }
  return {
    summary,
    kind,
    sensitive: false,
    dateLabel: extractDateLabel(rawText, options.sourceTitle),
  };
}

/**
 * Bootstrap concerns were written with source codes and internal shorthand.
 * Existing databases may still contain that text, so make it readable at read
 * time rather than requiring a destructive re-seed.
 */
export function humanizeConcernText(value: string) {
  // Generic readability fixes only; no rule refers to a specific person,
  // project or file.
  return compact(value)
    .replace(/\s*\(VX\d{3}\)/g, "")
    .replace(/\bVX\d{3}\b/g, "an employee")
    .replace(/\b(?:chunk|row|sheet)[- ]?\d+\b/gi, "")
    .replace(/\bthe (?:current |loaded )?corpus\b/gi, "the released material")
    .replace(/\bInference:\s*/g, "What this means: ")
    .replace(/\s+/g, " ")
    .replace(/(^|[.!?:]\s+)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`)
    .trim();
}

/**
 * Turn "chunk-3" into something a human can read without exposing the
 * ingestion implementation.
 */
export function humanizeLocator(locator?: string) {
  const value = compact(locator ?? "");
  if (!value) return "";
  if (/^chunk-\d+$/i.test(value)) return "indexed extract";
  return value
    .replace(/\bchunk-\d+\b/gi, "indexed extract")
    .replace(/\s+/g, " ")
    .slice(0, 110);
}

function summaryTokenSet(value: string) {
  return new Set(
    compact(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token)),
  );
}

function summaryQuality(value: string) {
  let score = 0;
  if (value.length >= 45 && value.length <= 240) score += 2;
  if (/^[A-Z]/.test(value)) score += 1;
  if (
    /\b(?:is|was|were|has|had|will|would|moved|paused|plans|resigned|departed|hired|left|runs|run|said|reports|shows|approved|joined|delayed|slipped)\b/i.test(
      value,
    )
  ) {
    score += 2;
  }
  if (/\b(?:says|period|reporting|runway|action items?|auto-detected)\b/i.test(value)) {
    score -= 3;
  }
  if ((value.match(/·/g) ?? []).length > 0) score -= 3;
  if (/\b(?:Rs|INR|₹)\.?\s*$/i.test(value)) score -= 4;
  if (value.length < 40) score -= 1;
  return score;
}

/**
 * Concern pages often receive the same fact twice: once from the curated
 * citation and once from the ingested source file. Keep the cleaner version so
 * the CEO sees a short answer, not the same sentence in three forms.
 */
export function dedupeEvidenceSummaries<T extends { summary: string }>(items: T[]) {
  const kept: Array<{ item: T; tokens: Set<string> }> = [];
  for (const item of items) {
    const tokens = summaryTokenSet(item.summary);
    let duplicate = -1;
    for (let index = 0; index < kept.length; index += 1) {
      const other = kept[index].tokens;
      const overlap = [...tokens].filter((token) => other.has(token)).length;
      const union = tokens.size + other.size - overlap;
      const jaccard = union === 0 ? 0 : overlap / union;
      const containment = overlap / Math.max(1, Math.min(tokens.size, other.size));
      if (jaccard >= 0.55 || containment >= 0.8) {
        duplicate = index;
        break;
      }
    }
    if (duplicate < 0) {
      kept.push({ item, tokens });
      continue;
    }
    if (summaryQuality(item.summary) > summaryQuality(kept[duplicate].item.summary)) {
      kept[duplicate] = { item, tokens };
    }
  }
  return kept.map((entry) => entry.item);
}

/**
 * Guard for anything the model says in the employee chat. Returns a clean
 * human answer, or null when the answer is a raw dump or leaks pay data.
 */
export function sanitizeEmployeeAnswer(answer: string): string | null {
  // Generic clean-up only: no phrase here is specific to any person or file.
  let text = normalize(answer)
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/^\s*["“]|["”]\s*$/g, "")
    .replace(/\b(?:as an? (?:ai|assistant|language model)|as the (?:ai|assistant))\b[,:]?\s*/gi, "")
    .replace(/\bI can confirm from (?:the )?(?:records?|data|evidence|corpus|notes)\s*(?:that|:)?\s*/gi, "")
    .replace(/\b(?:based on|according to|from) (?:the |my )?(?:connected |supplied |provided )?(?:records?|evidence|data|context|corpus|notes)\b[,:]?\s*/gi, "")
    .replace(/\b(?:the|this) (?:corpus|dataset)\b/gi, "what I know")
    .replace(/\s*\(VX\d{3}\)/gi, "")
    .replace(/\bVX\d{3}\b/gi, "a colleague")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;
  if (containsCompensationData(text)) return null;
  if (looksLikeRawDump(text)) return null;
  // Out-of-character answers are discarded rather than patched.
  if (/\b(?:corpus|dataset|retrieval|chunk|indexed|prompt|language model|cockpit)\b/i.test(text)) {
    return null;
  }

  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  if (sentences.length > 5) text = sentences.slice(0, 5).join(" ");
  if (text.length > 900) text = clampSentence(text, 900);
  if (!text) return null;
  text = `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  if (!/[.!?…]$/.test(text)) text += ".";
  return text;
}

export function isGreeting(question: string) {
  return /^(?:hi|hello|hey|hiya|namaste|good (?:morning|afternoon|evening)|yo)\b/i.test(
    question.trim(),
  );
}

export function isCompensationQuestion(question: string) {
  const value = question.toLowerCase();
  if (/\b(?:salary|salaries|compensation|ctc|payslip|take[\s-]?home|gross pay|net pay)\b/.test(value)) {
    return true;
  }
  if (/\bpayroll\b/.test(value) && /\b(?:row|register|amount|salary|paid|earn|make|much)\b/.test(value)) {
    return true;
  }
  if (/\b(?:how much|what)\b.{0,30}\b(?:paid|earn|make|salary)\b/.test(value)) {
    return true;
  }
  return false;
}

export function cleanGroundedFact(fact: string) {
  return compact(fact)
    .replace(
      /\s*\([^)]*(?:employee master|records?|keka|source|ref|transcript|call|T\d)[^)]*\)/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert a grounded fact into the first person, without source labels.
 */
export function factToSpeech(fact: string, name?: string) {
  let text = cleanGroundedFact(fact)
    .replace(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\s*[—:-]\s*/, "")
    .trim();
  if (name && text.toLowerCase().startsWith(name.toLowerCase())) {
    text = text.slice(name.length).replace(/^[\s—:-]+/, "");
  }
  text = text
    .replace(/^Keeps\b/i, "I keep")
    .replace(/^Handles\b/i, "I handle")
    .replace(/^Works on\b/i, "I work on")
    .replace(/^Works\b/i, "I work")
    .replace(/^Manages\b/i, "I manage")
    .replace(/^Owns\b/i, "I own")
    .replace(/^Leads\b/i, "I lead")
    .replace(/^Runs\b/i, "I run")
    .replace(/^Supports\b/i, "I support")
    .replace(/^Responsible for\b/i, "I'm responsible for")
    .replace(/^Is responsible for\b/i, "I'm responsible for");
  if (
    !/^I\b/.test(text) &&
    !/^My\b/.test(text) &&
    /\b(?:Manager|Engineer|Executive|Director|Lead|Analyst|Designer|Recruiter|Officer|Head|CFO|CEO|CTO)\b/i.test(
      text,
    ) &&
    text.split(/\s+/).length <= 6
  ) {
    const roleParts = text.split(/,\s*/);
    if (roleParts.length === 2) {
      const article = /\b(?:CEO|CFO|CTO|Head|Lead|Director|VP)\b/i.test(roleParts[0])
        ? "the"
        : "a";
      text = `I'm ${article} ${roleParts[0]} in ${roleParts[1]}`;
    } else {
      text = `I'm the ${text}`;
    }
  } else if (!/^I\b/.test(text) && !/^My\b/.test(text)) {
    text = `I look after ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }
  text = compact(text);
  if (!/[.!?]$/.test(text)) text += ".";
  return text;
}

export function safeFacts(facts: string[], limit = 3) {
  return facts
    .map(cleanGroundedFact)
    .filter((fact) => fact && !isSensitiveEvidence(fact) && !containsCompensationData(fact))
    .filter(
      (fact) =>
        !/\b(?:T\d+[ab]?|transcript|corpus|records?|evidence|resolved to|phonetic|entity resolution|employee master|payroll register|keka|source record|loaded|export)\b/i.test(
          fact,
        ),
    )
    .filter((fact, index, all) => all.indexOf(fact) === index)
    .slice(0, limit);
}
