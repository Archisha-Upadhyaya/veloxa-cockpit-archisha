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

/** Entry-level titles: people the CEO rarely needs day to day. */
const JUNIOR_TITLE = /\b(associate|trainee|intern|apprentice|junior|graduate)\b/i;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type EvidenceRow = {
  evidence_text: string;
  available_at: string;
  source_locations: {
    locator: string;
    source_documents: { title: string; release_day: string | null } | null;
  } | null;
};

/**
 * The whole directory with the reporting line resolved from the stored HR
 * master fields, plus where each person appears in released evidence.
 * Returned in hierarchy order: each manager is followed by their reports.
 */
export async function loadDirectory(supabase: SupabaseClient, asOf = new Date()) {
  const [profiles, evidence] = await Promise.all([
    supabase
      .from("employee_profiles")
      .select("employee_key, display_name, role_title, department, is_active, profile")
      .order("display_name"),
    supabase
      .from("evidence_items")
      .select("evidence_text, available_at, source_locations(locator, source_documents(title, release_day))")
      .eq("is_sensitive", false)
      .lte("available_at", asOf.toISOString())
      .limit(2000),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  if (evidence.error) throw new Error(evidence.error.message);

  const rows = profiles.data ?? [];
  const byKey = new Map(rows.map((row) => [row.employee_key, row]));
  const profileOf = (row: (typeof rows)[number]) => (row.profile ?? {}) as StoredProfile;
  const evidenceRows = (evidence.data ?? []) as unknown as EvidenceRow[];

  const chainOf = (key: string): string[] => {
    const chain: string[] = [];
    const seen = new Set([key]);
    let current = profileOf(byKey.get(key)!).managerKey;
    while (current && byKey.has(current) && !seen.has(current)) {
      chain.unshift(current);
      seen.add(current);
      current = profileOf(byKey.get(current)!).managerKey;
    }
    return chain;
  };

  const people: DirectoryPerson[] = rows.map((row) => {
    const profile = profileOf(row);
    const manager = profile.managerKey ? byKey.get(profile.managerKey) : undefined;
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

    return {
      empId: row.employee_key,
      name: row.display_name,
      title: row.role_title ?? "",
      department: row.department ?? "Unassigned",
      email: profile.email ?? null,
      joined: profile.joined ?? null,
      tenure: tenure(profile.joined, exited ? new Date(`${profile.exitDate}T00:00:00Z`) : asOf),
      location: profile.location ?? null,
      status: profile.status ?? (row.is_active ? "Active" : "Inactive"),
      exitDate: profile.exitDate ?? null,
      isActive: Boolean(row.is_active),
      managerId: profile.managerKey ?? null,
      managerName: manager?.display_name ?? null,
      managerTitle: manager?.role_title ?? null,
      reports: rows
        .filter((candidate) => profileOf(candidate).managerKey === row.employee_key)
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
    };
  });

  // Depth-first: each manager is followed by their own reports.
  const byManager = new Map<string | null, DirectoryPerson[]>();
  for (const person of people) {
    const parent = person.managerId && byKey.has(person.managerId) ? person.managerId : null;
    byManager.set(parent, [...(byManager.get(parent) ?? []), person]);
  }
  const ordered: DirectoryPerson[] = [];
  const visit = (parent: string | null) => {
    const children = (byManager.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const person of children) {
      ordered.push(person);
      visit(person.empId);
    }
  };
  visit(null);
  return ordered;
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
      ? `Status: ${person.status}${person.exitDate ? `, exit date ${person.exitDate}` : ""}`
      : null,
  ].filter((fact): fact is string => Boolean(fact));
}
