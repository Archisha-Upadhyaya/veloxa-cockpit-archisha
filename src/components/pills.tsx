const AREA_PALETTE = ["#2f5f54", "#8a5a2b", "#5b4b8a", "#a0453f", "#2c6a8f", "#7a6a1f", "#6b3f6b", "#3f6b3f"];

/** Stable colour per department, based on its position in the stored list. */
export function areaColor(area: string, all: string[]) {
  const index = all.indexOf(area);
  return AREA_PALETTE[(index < 0 ? Math.abs([...area].reduce((sum, char) => sum + char.charCodeAt(0), 0)) : index) % AREA_PALETTE.length];
}

export function SeverityPill({ severity }: { severity: string }) {
  return <span className={`sev-pill sev-pill-${severity}`}>{severity}</span>;
}

export function AreaPill({ area, all }: { area: string; all: string[] }) {
  const color = areaColor(area, all);
  return (
    <span className="area-pill" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>
      {area}
    </span>
  );
}

export function ConfidencePill({ confidence }: { confidence?: string | null }) {
  const level = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  return (
    <span className="conf-pill" title={`${confidence ?? "low"} confidence`}>
      {[1, 2, 3].map((dot) => (
        <span key={dot} className={dot <= level ? "on" : ""} />
      ))}
      {confidence ?? "low"} confidence
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  return <span className={`status-dot-${status}`} aria-hidden="true" />;
}
