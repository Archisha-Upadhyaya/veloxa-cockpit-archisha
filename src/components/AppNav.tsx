"use client";

import type React from "react";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import TimeMachine, { setViewingDay, useViewingDay } from "@/components/TimeMachine";

const links = [
  { href: "/", label: "Today", icon: "M4 12h4l3 -8l4 16l3 -8h2" },
  { href: "/people", label: "People", icon: "M9 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" },
  { href: "/risks", label: "Concerns", icon: "M12 9v4M12 17h.01M10.3 3.9l-8.1 14a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7 -3l-8.1 -14a2 2 0 0 0 -3.4 0z" },
  { href: "/sources", label: "Documents", icon: "M14 3v4a1 1 0 0 0 1 1h4M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" },
];

type Theme = "system" | "light" | "dark";
const THEME_KEY = "veloxa-theme";

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    let stored: Theme = "system";
    try {
      stored = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system";
    } catch {}
    // Stored preference is only readable in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(stored);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      let current: Theme = "system";
      try {
        current = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system";
      } catch {}
      if (current === "system") applyTheme("system");
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    applyTheme(next);
  };

  const options: Array<{ value: Theme; label: string; path: string }> = [
    { value: "light", label: "Light", path: "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" },
    { value: "system", label: "Match system", path: "M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1zM7 20h10M9 16v4M15 16v4" },
    { value: "dark", label: "Dark", path: "M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" },
  ];
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={theme === option.value} title={option.label} aria-label={option.label} onClick={() => choose(option.value)}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={option.path} />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** Desktop tabs. Reads the URL, so it sits inside <Suspense> (see AppNav). */
function DesktopLinks({ pathname }: { pathname: string | null }) {
  const isActive = (href: string) => pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(link.href) ? "page" : undefined}
          className={`rounded-full px-4 py-2 text-xs font-medium transition ${
            isActive(link.href) ? "bg-[var(--ink)] text-[var(--paper)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}

function MobileLinks({ pathname }: { pathname: string | null }) {
  const isActive = (href: string) => pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <>
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? "page" : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={link.icon} />
          </svg>
          {link.label}
        </Link>
      ))}
    </>
  );
}

const WithPath = ({ render }: { render: (pathname: string | null) => React.ReactNode }) => <>{render(usePathname())}</>;

export default function AppNav() {
  const viewing = useViewingDay();

  return (
    <>
      <header className="sticky top-0 z-30 px-3 pt-3 md:px-4 md:pt-4 print:hidden">
        <div className="nav-shell mx-auto flex h-[60px] max-w-[1380px] items-center justify-between gap-3 rounded-2xl border border-[var(--line)] px-3 backdrop-blur-xl md:h-[64px] md:px-5">
          <Link href="/" className="group flex min-w-0 items-center gap-2.5">
            <Logo size={34} />
            <span className="min-w-0">
              <span className="block font-serif text-[17px] font-semibold leading-tight tracking-[-0.03em] text-[var(--ink)]">Veloxa</span>
              <span className="hidden text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] sm:block">company brief</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-1 md:flex" aria-label="Main">
            {/* usePathname needs Suspense on dynamic routes under Cache Components. */}
            <Suspense fallback={<DesktopLinks pathname={null} />}>
              <WithPath render={(pathname) => <DesktopLinks pathname={pathname} />} />
            </Suspense>
          </nav>

          <div className="flex items-center gap-2">
            <TimeMachine />
            <ThemeToggle />
          </div>
        </div>

        {viewing && (
          <div className="past-banner mx-auto mt-2 flex max-w-[1380px] items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm">
            <span>
              Viewing the company as it was known at the end of{" "}
              <strong>{new Date(`${viewing}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long" })}</strong>
            </span>
            <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => setViewingDay(null)}>
              Back to today
            </button>
          </div>
        )}
      </header>

      {/* Mobile: a fixed bottom tab bar so navigation never disappears. */}
      <nav className="mobile-tabbar print:hidden" aria-label="Main">
        <Suspense fallback={<MobileLinks pathname={null} />}>
          <WithPath render={(pathname) => <MobileLinks pathname={pathname} />} />
        </Suspense>
      </nav>
    </>
  );
}
