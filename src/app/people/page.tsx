import type { Metadata } from "next";
import { Suspense } from "react";
import PeopleDirectory from "@/components/people/PeopleDirectory";

export const metadata: Metadata = {
  title: "People",
  description: "Everyone at Veloxa, who they report to, and who you can talk to.",
};

export default function PeoplePage() {
  return (
    <main className="mx-auto w-full max-w-[1380px] flex-1 px-5 py-8 lg:px-10">
      {/* The directory reads ?department / ?chat / ?about on the client;
          useSearchParams needs a Suspense boundary under Cache Components. */}
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading people…</p>}>
        <PeopleDirectory />
      </Suspense>
    </main>
  );
}
