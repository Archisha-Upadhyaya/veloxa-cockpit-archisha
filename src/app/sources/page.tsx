import type { Metadata } from "next";
import SourcesView from "@/components/SourcesView";

export const metadata: Metadata = {
  title: "Documents",
  description: "The documents the brief is built from.",
};

export default function SourcesPage() {
  return (
    <main className="mx-auto w-full max-w-[1100px] px-5 py-8 lg:px-10 lg:py-10">
      <SourcesView />
    </main>
  );
}
