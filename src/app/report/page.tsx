import type { Metadata } from "next";
import ReportView from "@/components/ReportView";

export const metadata: Metadata = {
  title: "Brief (PDF)",
  description: "The CEO brief as a printable document.",
};

export default function ReportPage() {
  return <ReportView />;
}
