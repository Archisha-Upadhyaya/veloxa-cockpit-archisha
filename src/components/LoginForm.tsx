"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { useNow } from "@/components/useNow";

const FEATURES = [
  {
    title: "Your morning brief",
    text: "The three things that need you today, with the evidence behind each and who to talk to.",
    icon: "M4 12h4l3 -8l4 16l3 -8h2",
  },
  {
    title: "Talk to anyone on the team",
    text: "Ask a question and get an answer in their own voice, grounded in the company's records.",
    icon: "M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z",
  },
  {
    title: "A time machine",
    text: "See the company exactly as it was known on any past day. No hindsight.",
    icon: "M3 12a9 9 0 1 0 3 -6.7M3 4v4h4M12 7v5l3 3",
  },
];

export default function LoginForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const now = useNow();
  const greeting = !now ? "Welcome back" : now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        setError((await response.json()).error ?? "Couldn't sign in.");
        return;
      }
      // Back to where they were going (same-site paths only).
      const next = searchParams.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-glow" aria-hidden="true" />
      <div className="login-layout">
        <section className="login-brand" aria-label="About Veloxa">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <span className="font-serif text-2xl tracking-[-.03em]">Veloxa</span>
          </div>
          <h2 className="login-promise">Your company, every morning, in one page.</h2>
          <ul className="login-features">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <span className="login-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={feature.icon} />
                  </svg>
                </span>
                <span>
                  <strong>{feature.title}</strong>
                  <span>{feature.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="login-foot">Built from the company&apos;s own documents. Every answer shows its source.</p>
        </section>

        <form className="login-card" onSubmit={submit}>
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[var(--brand-2)]">
            {now ? now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "\u00a0"}
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-[-.03em]">{greeting}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Sign in to see today&apos;s brief.</p>

          <label className="login-field">
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="login-field">
            <span>Password</span>
            <span className="login-password">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {showPassword ? (
                    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2a9.6 9.6 0 0 1 2.6 -.2c4 0 7.3 2.3 10 7c-.8 1.4 -1.6 2.6 -2.6 3.6M6.6 6.6c-1.8 1.2 -3.3 3 -4.6 5.4c2.7 4.7 6 7 10 7c1.6 0 3.1 -.4 4.4 -1.1M3 3l18 18" />
                  ) : (
                    <path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" />
                  )}
                </svg>
              </button>
            </span>
          </label>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-4 text-center text-xs text-[var(--muted)]">Private to Veloxa leadership.</p>
        </form>
      </div>
    </div>
  );
}
