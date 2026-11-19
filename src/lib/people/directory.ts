import type { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  extractEvidenceSnippet,
  friendlySourceTitle,
  isSensitiveEvidence,
} from "@/lib/evidence/snippet";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export type StoredProfile = {
  email?: string | null;
  joined?: string | null;
  location?: string | null;
  status?: string | null;
  exitDate?: string | null;
  managerKey?: string | null;
  source?: { file?: string; row?: number };
  /** Reported by the CEO, not in the HR export yet. Never treated as evidence. */
  reported?: ReportedStatus | null;
};

export type ReportedStatus = {
  status: "resigned" | "leaving" | "on_leave";
  reportedOn: string;
  expectedExit?: string | null;
  note?: string | null;
  source: string;
};

export type DirectoryPerson = {
  empId: string;
  name: string;
  title: string;
  department: string;
  email: string | null;
  joined: string | null;
  tenure: string | null;
  location: string | null;
  status: string;
  exitDate: string | null;
  isActive: boolean;
  managerId: string | null;
  managerName: string | null;
  managerTitle: string | null;
  reports: Array<{ empId: string; name: string; title: string }>;
  /** Depth in the reporting tree, 0 for the top. */
  level: number;
  /**
   * How close this person is to the CEO's desk:
   * 0 the CEO, 1 direct reports, 2 their teams, 3 associates and trainees.
   */
  tier: 0 | 1 | 2 | 3;
  /** Names from the top of the company down to this person's manager. */
  chain: string[];
  source: string | null;
  mentions: Array<{ summary: string; source: string; date: string | null }>;
  mentionCount: number;
  /** How present this person is across released records (not the HR master or voice notes). */
  presence: { documents: number; mentions: number; score: number };
  /** Whether this person is one of the chat personas (top N by presence and seniority). */
  isPersona: boolean;
  /** Status the CEO reported (e.g. a resignation not yet in the HR export). */
  reported: ReportedStatus | null;
  /** Reporting-line changes that affect this person but are not applied yet. */
  pendingChanges: Array<{ to: string; when: string; status: string; reason: string | null }>;
};

function tenure(joined: string | null | undefined, until: Date) {
  if (!joined) return null;
  const start = new Date(`${joined}T00:00:00Z`);
  if (Number.isNaN(start.valueOf())) return null;
  const months =
    (until.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (until.getUTCMonth() - start.getUTCMonth());
  if (months < 1) return "under a month";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} yr` : "", rest ? `${rest} mo` : ""].filter(Boolean).join(" ");
}

/**
 * How present someone is in the released material: distinct documents that
 * name them (full name, first name, or work email), then total mentions. The
 * HR master (everyone is in it) and CEO voice notes are not counted.
 */
function presenceOf(row: ProfileRow, profile: StoredProfile, evidenceRows: EvidenceRow[]) {
  const first = row.display_name.split(/\s+/)[0];
  const patterns = [
    new RegExp(`\\b${escapeRegExp(row.display_name)}\\b`, "i"),
    new RegExp(`\\b${escapeRegExp(first)}\\b`, "i"),
    ...(profile.email ? [new RegExp(`\\b${escapeRegExp(profile.email.split("@")[0])}@`, "i")] : []),
  ];
  const documents = new Set<string>();
  let mentions = 0;
  for (const item of evidenceRows) {
    const document = item.source_locations?.source_documents;
    const key = document?.relative_path ?? document?.title ?? "";
    if (/employee[_\s-]*master/i.test(key) || /(^|\/)T6[a-z]?_/i.test(key)) continue;
    if (patterns.some((pattern) => pattern.test(item.evidence_text))) {
      documents.add(key);
      mentions += 1;
    }
  }
  return { documents: documents.size, mentions, score: documents.size + Math.min(mentions, 50) / 100 };
}

/**
 * Chat personas: the active people (other than the CEO) who matter most to
 * the CEO, by presence in the records, with seniority as the tie-break —
 * someone who reports to the CEO or manages a team outranks an individual
 * contributor with the same presence. Count: VELOXA_PERSONA_COUNT (default 14).
 */
function selectPersonas(people: DirectoryPerson[]) {
  const limit = Number(process.env.VELOXA_PERSONA_COUNT ?? 14);
  const importance = (person: DirectoryPerson) =>
    person.presence.score + (person.level === 1 ? 1 : 0) + (person.reports.length > 0 ? 0.5 : 0) - (person.tier === 3 ? 0.5 : 0);
  people
    .filter((person) => person.isActive && person.level > 0)
    .sort((left, right) => importance(right) - importance(left) || left.name.localeCompare(right.name))
    .slice(0, limit)
    .forEach((person) => {
      person.isPersona = true;
    });
}

/** Entry-level titles: people the CEO rarely needs day to day. */
const JUNIOR_TITLE = /\b(associate|trainee|intern|apprentice|junior|graduate)\b/i;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type EvidenceRow = {
  evidence_text: string;
  available_at: string;
  source_locations: {
    locator: string;
    source_documents: { title: string; release_day: string | null; relative_path?: string | null } | null;
  } | null;
};

export type ProfileRow = {
  employee_key: string;
  display_name: string;
  role_title: string | null;
  department: string | null;
  is_active: boolean | null;
  profile: unknown;
};

export type OrgChange = {
  id: string;
  scope_type: "employee" | "department";
  scope_key: string;
  new_manager_key: string | null;
  new_manager_title: string | null;
  effective_from: string | null;
  effective_note: string | null;
  status: "tentative" | "confirmed" | "cancelled";
  source: string | null;
};

export type ChangeState = OrgChange & {
  applied: boolean;
  /** Why a change is not (yet) applied, in plain words. */
  reason: string | null;
  affects: string[];
};

export type DirectoryResult = {
  people: DirectoryPerson[];
  changes: ChangeState[];
  /** Data problems the directory worked around (e.g. a reporting loop). */
  warnings: string[];
};

/**
 * Pure directory builder: HR master rows + dated reporting-line changes +
 * released evidence → the reporting tree as of a date. Never throws on bad
 * data: unknown managers, loops and unappliable changes are reported as
 * warnings and nobody disappears from the directory.
 */
export function buildDirectory(
  rows: ProfileRow[],
  evidenceRows: EvidenceRow[],
  changes: OrgChange[],
  asOf = new Date(),
): DirectoryResult {
  const byKey = new Map(rows.map((row) => [row.employee_key, row]));
  const profileOf = (row: ProfileRow) => (row.profile ?? {}) as StoredProfile;
  const warnings: string[] = [];
  const today = asOf.toISOString().slice(0, 10);

  // 1. Base reporting line from the HR master.
  const managerOf = new Map<string, string | null>();
  for (const row of rows) {
    const key = profileOf(row).managerKey ?? null;
    if (key && !byKey.has(key)) {
      warnings.push(`${row.display_name}'s manager ${key} is not in the directory; shown at the top.`);
    }
    managerOf.set(row.employee_key, key && byKey.has(key) ? key : null);
  }

  const wouldLoop = (employee: string, manager: string) => {
    let current: string | null = manager;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (current === employee) return true;
      seen.add(current);
      current = managerOf.get(current) ?? null;
    }
    return false;
  };

  // 2. Dated changes, oldest first.
  const changeStates: ChangeState[] = [...changes]
    .filter((change) => change.status !== "cancelled")
    .sort((left, right) => (left.effective_from ?? "9999").localeCompare(right.effective_from ?? "9999"))
    .map((change) => {
      const members =
        change.scope_type === "employee"
          ? rows.filter((row) => row.employee_key === change.scope_key)
          : rows.filter((row) => (row.department ?? "") === change.scope_key);
      // Moving a department moves its top: members whose manager is outside it.
      const movers =
        change.scope_type === "employee"
          ? members
          : members.filter((row) => {
              const manager = managerOf.get(row.employee_key);
              return !manager || byKey.get(manager)?.department !== change.scope_key;
            });
      const state: ChangeState = { ...change, applied: false, reason: null, affects: movers.map((row) => row.display_name) };
      if (members.length === 0) state.reason = `No one in the directory matches "${change.scope_key}".`;
      else if (change.status !== "confirmed") state.reason = "Not confirmed yet.";
      else if (!change.effective_from) state.reason = "No effective date set.";
      else if (change.effective_from > today) state.reason = `Takes effect ${change.effective_from}.`;
      else if (!change.new_manager_key) state.reason = `${change.new_manager_title ?? "The new manager"} is not in the directory yet.`;
      else if (!byKey.has(change.new_manager_key)) state.reason = `${change.new_manager_key} is not in the directory yet.`;
      else if (movers.some((row) => wouldLoop(row.employee_key, change.new_manager_key!))) {
        state.reason = "Would create a reporting loop; not applied.";
        warnings.push(`Change for ${change.scope_key} skipped: it would create a reporting loop.`);
      } else {
        for (const row of movers) managerOf.set(row.employee_key, change.new_manager_key);
        state.applied = true;
      }
      return state;
    });

  // 3. Chains, guarded against loops in the source data itself.
  const chainOf = (key: string): string[] => {
    const chain: string[] = [];
    const seen = new Set([key]);
    let current = managerOf.get(key) ?? null;
    while (current && !seen.has(current)) {
      chain.unshift(current);
      seen.add(current);
      current = managerOf.get(current) ?? null;
    }
    if (current && seen.has(current) && current !== key) {
      warnings.push(`Reporting loop found above ${byKey.get(key)?.display_name ?? key}.`);
    }
    return chain;
  };

  const people: DirectoryPerson[] = rows.map((row) => {
    const profile = profileOf(row);
    const managerId = managerOf.get(row.employee_key) ?? null;
    const manager = managerId ? byKey.get(managerId) : undefined;
    const chain = chainOf(row.employee_key);
    const namePattern = new RegExp(`\\b${escapeRegExp(row.display_name)}\\b`, "i");
    const seen = new Set<string>();
    const mentions = evidenceRows
      .filter((item) => namePattern.test(item.evidence_text) && !isSensitiveEvidence(item.evidence_text))
      .map((item) => {
        const title = item.source_locations?.source_documents?.title ?? "Source record";
        // Employee master rows are the directory itself, not a mention.
        if (/employee[_\s-]*master/i.test(title)) return null;
        const snippet = extractEvidenceSnippet(item.evidence_text, {
          context: `${row.display_name} ${row.role_title ?? ""}`,
          sourceTitle: title,
          locator: item.source_locations?.locator,
        });
        if (snippet.sensitive || !snippet.summary || seen.has(snippet.summary)) return null;
        seen.add(snippet.summary);
        return {
          summary: snippet.summary,
          source: friendlySourceTitle(title),
          date: snippet.dateLabel ?? item.source_locations?.source_documents?.release_day ?? null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const exited = !row.is_active && profile.exitDate;
    const presence = presenceOf(row, profile, evidenceRows);
    const pending = changeStates.filter((change) => !change.applied && change.affects.includes(row.display_name));

    return {
      empId: row.employee_key,
      name: row.display_name,
      title: row.role_title ?? "",
      department: row.department ?? "Unassigned",
      email: profile.email ?? null,
      joined: profile.joined ?? null,
      tenure: tenure(profile.joined, exited ? new Date(`${profile.exitDate}T00:00:00Z`) : asOf),
      location: profile.location ?? null,
      status: profile.reported && row.is_active
        ? { resigned: "Resigned", leaving: "Leaving", on_leave: "On leave" }[profile.reported.status]
        : profile.status ?? (row.is_active ? "Active" : "Inactive"),
      exitDate: profile.exitDate ?? profile.reported?.expectedExit ?? null,
      isActive: Boolean(row.is_active),
      managerId,
      managerName: manager?.display_name ?? null,
      managerTitle: manager?.role_title ?? null,
      reports: rows
        .filter((candidate) => managerOf.get(candidate.employee_key) === row.employee_key)
        .map((candidate) => ({
          empId: candidate.employee_key,
          name: candidate.display_name,
          title: candidate.role_title ?? "",
        })),
      level: chain.length,
      tier: chain.length === 0 ? 0 : JUNIOR_TITLE.test(row.role_title ?? "") ? 3 : chain.length === 1 ? 1 : 2,
      chain: chain.map((key) => byKey.get(key)?.display_name ?? key),
      source: profile.source?.file
        ? `${friendlySourceTitle(profile.source.file.split("/").pop())}${profile.source.row ? `, row ${profile.source.row}` : ""}`
        : null,
      mentions: mentions.slice(0, 3),
      mentionCount: mentions.length,
      presence,
      isPersona: false,
      reported: profile.reported ?? null,
      pendingChanges: pending.map((change) => ({
        to: change.new_manager_key ? byKey.get(change.new_manager_key)?.display_name ?? change.new_manager_key : change.new_manager_title ?? "a new manager",
        when: change.effective_from ?? change.effective_note ?? "date not set",
        status: change.status,
        reason: change.reason,
      })),
    };
  });

  selectPersonas(people);

  // Depth-first: each manager is followed by their own reports. Anyone not
  // reached (only possible with a loop) is appended so no one disappears.
  const byManager = new Map<string | null, DirectoryPerson[]>();
  for (const person of people) {
    const parent = person.managerId && byKey.has(person.managerId) ? person.managerId : null;
    byManager.set(parent, [...(byManager.get(parent) ?? []), person]);
  }
  const ordered: DirectoryPerson[] = [];
  const visited = new Set<string>();
  const visit = (parent: string | null) => {
    const children = (byManager.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const person of children) {
      if (visited.has(person.empId)) continue;
      visited.add(person.empId);
      ordered.push(person);
      visit(person.empId);
    }
  };
  visit(null);
  for (const person of people) if (!visited.has(person.empId)) ordered.push(person);
  return { people: ordered, changes: changeStates, warnings: [...new Set(warnings)] };
}

/** Load everything the directory needs and build it. */
export async function loadDirectoryResult(supabase: SupabaseClient, asOf = new Date()): Promise<DirectoryResult> {
  const [profiles, evidence, changes] = await Promise.all([
    supabase
      .from("employee_profiles")
      .select("employee_key, display_name, role_title, department, is_active, profile")
      .order("display_name"),
    supabase
      .from("evidence_items")
      .select("evidence_text, available_at, source_locations(locator, source_documents(title, release_day, relative_path))")
      .eq("is_sensitive", false)
      .lte("available_at", asOf.toISOString())
      .limit(4000),
    supabase.from("org_changes").select("*"),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  if (evidence.error) throw new Error(evidence.error.message);
  // A database without the org_changes migration simply has no changes.
  const changeRows = changes.error ? [] : ((changes.data ?? []) as OrgChange[]);
  return buildDirectory(
    (profiles.data ?? []) as ProfileRow[],
    (evidence.data ?? []) as unknown as EvidenceRow[],
    changeRows,
    asOf,
  );
}

/** The directory in reporting-line order. */
export async function loadDirectory(supabase: SupabaseClient, asOf = new Date()) {
  return (await loadDirectoryResult(supabase, asOf)).people;
}

/** Plain-language facts about a person, used to ground the chat. */
export function personFacts(person: DirectoryPerson) {
  return [
    `${person.title}, ${person.department}`,
    person.managerName
      ? `Reports to ${person.managerName}${person.managerTitle ? ` (${person.managerTitle})` : ""}`
      : null,
    person.reports.length
      ? `Manages ${person.reports.map((report) => `${report.name} (${report.title})`).join(", ")}`
      : null,
    person.joined ? `Joined ${person.joined}` : null,
    person.location ? `Based in ${person.location}` : null,
    person.status !== "Active"
      ? `Status: ${person.status}${person.exitDate ? `, ${person.reported ? "expected exit around" : "exit date"} ${person.exitDate}` : ""}${person.reported ? ` (reported by the CEO on ${person.reported.reportedOn}${person.reported.note ? `: ${person.reported.note}` : ""}; not yet in HR records)` : ""}`
      : null,
  ].filter((fact): fact is string => Boolean(fact));
}

/**
 * Who to talk to about a finding: the named owner if they are still active,
 * otherwise the most senior active person in the finding's area. Keeps
 * "Talk to …" working after someone leaves or teams are reorganised.
 */
export function ownerFor(
  people: DirectoryPerson[],
  ownerKey: string | null | undefined,
  area: string | null | undefined,
): DirectoryPerson | null {
  const named = ownerKey ? people.find((person) => person.empId === ownerKey) : undefined;
  if (named?.isActive && named.isPersona) return named;
  const department = area ?? named?.department;
  if (!department) return null;
  return (
    people
      .filter((person) => person.isPersona && person.department === department)
      .sort((left, right) => left.level - right.level)[0] ?? null
  );
}

/**
 * Teams that are real departments: a "department" made up only of the CEO
 * (e.g. Leadership) is not a team and is left out of team counts and checks.
 */
export function realDepartments(people: DirectoryPerson[]) {
  const active = people.filter((person) => person.isActive);
  return [...new Set(active.map((person) => person.department))]
    .filter((department) => active.some((person) => person.department === department && person.level > 0))
    .sort();
}
