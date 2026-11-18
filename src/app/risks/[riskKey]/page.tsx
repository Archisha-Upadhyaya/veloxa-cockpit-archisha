import type { Metadata } from "next";
import RiskDetailView from "@/components/RiskDetailView";

export const metadata: Metadata = {
  title: "Concern",
  description: "A concern, its evidence and the next step.",
};

export const instant = false;

export default async function RiskDetailPage({
  params,
}: {
  params: Promise<{ riskKey: string }>;
}) {
  const { riskKey } = await params;
  return <RiskDetailView riskKey={riskKey} />;
}
