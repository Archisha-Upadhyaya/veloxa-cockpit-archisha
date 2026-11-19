"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <form className="login-card" onSubmit={submit}>
        <div className="flex flex-col items-center text-center">
          <Logo size={56} animated />
          <h1 className="mt-4 font-serif text-3xl tracking-[-.03em]">Veloxa</h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[.2em] text-[var(--muted)]">Company brief</p>
        </div>

        <label className="login-field">
          <span>Username</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className="login-field">
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>

        {error && <p className="login-error" role="alert">{error}</p>}

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-4 text-center text-xs text-[var(--muted)]">Private to Veloxa leadership.</p>
      </form>
    </div>
  );
}
