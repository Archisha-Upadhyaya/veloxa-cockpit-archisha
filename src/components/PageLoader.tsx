"use client";

import { useEffect, useState } from "react";

/**
 * Brand loader: the Veloxa "V" draws itself while a short line says what is
 * being read. Pages render nothing else until their data has arrived, so the
 * CEO never sees empty cards that fill in later.
 */
export default function PageLoader({
  lines = ["Loading…"],
  fullScreen = false,
}: {
  lines?: string[];
  fullScreen?: boolean;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % lines.length), 1400);
    return () => clearInterval(timer);
  }, [lines.length]);

  return (
    <div className={`page-loader ${fullScreen ? "is-full" : ""}`} role="status" aria-live="polite">
      <svg className="page-loader-mark" viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true">
        <rect className="page-loader-frame" x="4" y="4" width="56" height="56" rx="16" ry="16" />
        <path className="page-loader-v" d="M20 20 L32 46 L44 20" />
      </svg>
      <p key={index} className="page-loader-line">{lines[index]}</p>
    </div>
  );
}
