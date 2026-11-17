import RiskDetailView from "@/components/RiskDetailView";

export const instant = false;

export default async function RiskDetailPage({
  params,
}: {
  params: Promise<{ riskKey: string }>;
}) {
  const { riskKey } = await params;
  return <RiskDetailView riskKey={riskKey} />;
}
