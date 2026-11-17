import { createServerSupabaseClient } from "@/lib/supabase/server";
import { filterEvidenceAsOf } from "@/lib/analysis/risk";
import {
  dedupeEvidenceSummaries,
  extractEvidenceSnippet,
  friendlySourceTitle,
  humanizeConcernText,
  humanizeLocator,
  isSensitiveEvidence,
} from "@/lib/evidence/snippet";

type EvidenceRow = {
  evidence_item_id: string;
  evidence_items:
    | {
        id: string;
        evidence_text: string;
        available_at: string;
        source_locations:
          | {
              locator: string;
              source_documents:
                | { title: string; release_day: string | null }
                | null;
            }
          | null;
      }
    | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ riskKey: string }> },
) {
  try {
    const { riskKey } = await context.params;
    const supabase = createServerSupabaseClient();
    const asOf = new Date().toISOString();
    const risk = await supabase
      .from("risk_items")
      .select(
        "id, risk_key, title, description, severity, likelihood, status, confidence, origin, first_observed_at, last_reviewed_at",
      )
      .eq("risk_key", decodeURIComponent(riskKey))
      .maybeSingle();

    if (risk.error) throw new Error(risk.error.message);
    if (!risk.data) return Response.json({ error: "Concern not found." }, { status: 404 });
    const concern = {
      ...risk.data,
      title: humanizeConcernText(risk.data.title),
      description: humanizeConcernText(risk.data.description),
    };

    const evidence = await supabase
      .from("risk_evidence")
      .select(
        "evidence_item_id, evidence_items!inner(id, evidence_text, available_at, source_locations(locator, source_documents(title, release_day)))",
      )
      .eq("risk_id", risk.data.id)
      .lte("evidence_items.available_at", asOf);
    if (evidence.error) throw new Error(evidence.error.message);

    const rawRecords = (evidence.data ?? []) as unknown as EvidenceRow[];
    const records = filterEvidenceAsOf(
      rawRecords.map((record) => ({
        ...record,
        text: record.evidence_items?.evidence_text ?? "",
      })),
      new Date(asOf),
    );

    const contextText = `${concern.title} ${concern.description}`;
    const seen = new Set<string>();
    const snippets = records
      .map((record) => {
        const rawText = record.evidence_items?.evidence_text ?? "";
        if (!rawText || isSensitiveEvidence(rawText)) return null;
        const sourceTitle =
          record.evidence_items?.source_locations?.source_documents?.title ??
          "Source record";
        const locator = record.evidence_items?.source_locations?.locator ?? "";
        const snippet = extractEvidenceSnippet(rawText, {
          context: contextText,
          sourceTitle,
          locator,
        });
        if (snippet.sensitive || !snippet.summary) return null;
        if (seen.has(snippet.summary)) return null;
        seen.add(snippet.summary);
        const releaseDay =
          record.evidence_items?.source_locations?.source_documents?.release_day;
        return {
          id: record.evidence_item_id,
          summary: snippet.summary,
          source: friendlySourceTitle(sourceTitle),
          locator: humanizeLocator(locator),
          kind: snippet.kind,
          dateLabel:
            snippet.dateLabel ??
            (releaseDay ? releaseDay : undefined) ??
            (record.evidence_items?.available_at
              ? record.evidence_items.available_at.slice(0, 10)
              : undefined),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const dedupedSnippets = dedupeEvidenceSummaries(snippets).slice(0, 5);

    const sensitiveCount =
      rawRecords.length -
      rawRecords.filter((record) => !isSensitiveEvidence(record.evidence_items?.evidence_text ?? "")).length;

    return Response.json({
      risk: concern,
      evidence: dedupedSnippets,
      notice:
        dedupedSnippets.length === 0
          ? sensitiveCount > 0
            ? "The supporting material for this concern is confidential and cannot be shown."
            : "No short supporting extract is available for this concern."
          : sensitiveCount > 0
            ? "Some supporting material is confidential and has been excluded."
            : undefined,
    });
  } catch (error) {
    console.error("Concern detail query failed", error);
    return Response.json({ error: "Unable to load concern details." }, { status: 502 });
  }
}
