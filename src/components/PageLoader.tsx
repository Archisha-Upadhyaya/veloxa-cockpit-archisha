"use client";

import { useEffect, useState } from "react";
import Logo from "@/components/Logo";

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
      <Logo size={64} animated />
      <p key={index} className="page-loader-line">{lines[index]}</p>
    </div>
  );
}
