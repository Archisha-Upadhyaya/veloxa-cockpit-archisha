/**
 * Veloxa mark: the Tabler "letter-v" stroke (MIT, see THIRD_PARTY_NOTICES.md)
 * inside a rounded frame. One component for nav, loader, favicon and PDF.
 */
export const V_PATH = "M6 4l6 16l6 -16";

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
      <rect className="veloxa-logo-frame" x="1" y="1" width="30" height="30" rx="9" />
      <path className="veloxa-logo-v" d={V_PATH} transform="translate(4 4)" />
    </svg>
  );
}
