"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview", hint: "signal" },
  { href: "/people", label: "People", hint: "directory" },
  { href: "/risks", label: "Concerns", hint: "attention" },
  { href: "/sources", label: "Documents", hint: "evidence" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 px-4 pt-4">
      <div className="mx-auto flex h-[64px] max-w-[1380px] items-center justify-between rounded-2xl border border-[var(--line)] bg-[color:var(--paper)]/95 px-4 shadow-[0_8px_24px_rgba(47,55,48,.08)] backdrop-blur-xl lg:px-6">
        <Link href="/" className="group flex items-center gap-3">
          <span className="logo-mark">V</span>
          <span>
            <span className="block font-serif text-[17px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
              Veloxa
            </span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              company brief
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-1 sm:flex">
          {links.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-2 text-xs transition ${
                  active
                    ? "bg-[var(--ink)] text-[var(--surface)] shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <span className="hidden w-[120px] sm:block" aria-hidden="true" />
      </div>
    </header>
  );
}
