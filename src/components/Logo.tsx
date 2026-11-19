/**
 * Veloxa mark (original artwork): a free-standing V made of two folded
 * ribbons. The lighter left arm runs under the deeper right arm at the base,
 * a thin cut in the page colour gives the fold depth, and a small saffron
 * spark sits off the right arm. One component for nav, loader and PDF.
 */
export const LOGO_PATHS = {
  left: "M2.5 5h7.2l8.1 19.2-3.9 4.3z",
  right: "M22.3 5h7.2l-11.6 23.5h-4.3z",
  cut: "M14.1 27.6l3.6-8.4",
  spark: "M26.6 1.6l1.1 2.2 2.2 1.1-2.2 1.1-1.1 2.2-1.1-2.2-2.2-1.1 2.2-1.1z",
};

export default function Logo({ size = 34, animated = false, className = "" }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <svg
      className={`veloxa-logo ${animated ? "is-animated" : ""} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Veloxa"
    >
      {/* Colours are inline (theme variables) so the mark renders even
          before the stylesheet loads; CSS only adds motion. */}
      <path className="veloxa-logo-left" d={LOGO_PATHS.left} style={{ fill: "color-mix(in srgb, var(--accent, #2f5f54) 55%, var(--paper, #ffffff))" }} />
      <path className="veloxa-logo-right" d={LOGO_PATHS.right} style={{ fill: "var(--accent, #2f5f54)" }} />
      <path className="veloxa-logo-cut" d={LOGO_PATHS.cut} style={{ stroke: "var(--paper, #ffffff)", strokeWidth: 1.1, strokeLinecap: "round" }} />
      <path className="veloxa-logo-spark" d={LOGO_PATHS.spark} style={{ fill: "var(--brand-2, #c46a2b)" }} />
    </svg>
  );
}
