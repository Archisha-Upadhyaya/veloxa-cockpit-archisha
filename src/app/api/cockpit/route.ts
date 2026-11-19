import { GET as getDashboard } from "@/app/api/dashboard/route";
import { GET as getRisks } from "@/app/api/risks/route";
import { GET as getRiskDetail } from "@/app/api/risks/[riskKey]/route";
import { GET as getPeople } from "@/app/api/people/route";
import { GET as getTimeline } from "@/app/api/timeline/route";
import { POST as runAnalysis } from "@/app/api/analyze/route";

type Section<T> = { ok: true; data: T } | { ok: false; error: string };

async function section<T = unknown>(load: () => Promise<Response>): Promise<Section<T>> {
  try {
    const response = await load();
    const body = await response.json();
    if (!response.ok) return { ok: false, error: body?.error ?? `HTTP ${response.status}` };
    return { ok: true, data: body as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Section failed." };
  }
}

/**
 * Everything the cockpit shows, in one response.
 *
 * GET /api/cockpit            → stored data from the database
 * GET /api/cockpit?refresh=1  → re-run live analysis first; if the model is
 *                               unavailable the stored concerns are returned
 *
 * Each section loads independently, so one failing query never blanks the
 * rest. Every value comes from the database; nothing is hardcoded.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";

  const analysis = refresh
    ? await section<{ mode: "live" | "stored" }>(() => runAnalysis())
    : null;

  const [dashboard, risks, people, sources] = await Promise.all([
    section<{
      stats: unknown;
      latestSources: unknown[];
      concerns: Array<{ risk_key: string }>;
      analysisReady: boolean;
    }>(() => getDashboard(request)),
    section<{ risks: Array<{ risk_key: string }>; analysisReady: boolean }>(() => getRisks(request)),
    section<{ people: unknown[] }>(() => getPeople(request)),
    section<{ sources: unknown[] }>(() => getTimeline(request)),
  ]);

  const riskKeys = risks.ok ? risks.data.risks.map((risk) => risk.risk_key) : [];
  const details = await Promise.all(
    riskKeys.map(async (riskKey) => ({
      riskKey,
      detail: await section<{ evidence: unknown[]; notice?: string }>(() =>
        getRiskDetail(new Request(`${url.origin}/api/risks/${encodeURIComponent(riskKey)}`), {
          params: Promise.resolve({ riskKey }),
        }),
      ),
    })),
  );
  const detailByKey = new Map(details.map((item) => [item.riskKey, item.detail]));

  const errors = Object.fromEntries(
    Object.entries({ analysis, dashboard, risks, people, sources })
      .filter(([, value]) => value && !value.ok)
      .map(([key, value]) => [key, (value as { error: string }).error]),
  );

  const body = {
    generatedAt: new Date().toISOString(),
    analysisMode: analysis
      ? analysis.ok
        ? analysis.data.mode
        : "stored"
      : "stored",
    stats: dashboard.ok ? dashboard.data.stats : null,
    priorityRiskKeys: dashboard.ok ? dashboard.data.concerns.slice(0, 3).map((risk) => risk.risk_key) : [],
    risks: risks.ok
      ? risks.data.risks.map((risk) => {
          const detail = detailByKey.get(risk.risk_key);
          return {
            ...risk,
            evidence: detail?.ok ? detail.data.evidence : [],
            evidenceNotice: detail?.ok ? detail.data.notice ?? null : detail?.error ?? null,
          };
        })
      : [],
    people: people.ok ? people.data.people : [],
    sources: sources.ok ? sources.data.sources : [],
    errors,
  };

  const everythingFailed = [dashboard, risks, people, sources].every((value) => !value.ok);
  return Response.json(body, { status: everythingFailed ? 502 : 200 });
}
