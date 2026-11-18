import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  // The root page shares the layout's segment, so the template does not apply.
  title: { absolute: "Today · Veloxa" },
  description: "What needs your attention at Veloxa today.",
};

export default function Home() {
  return <Dashboard />;
}
