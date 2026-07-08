import { SkeletonPageHeader, SkeletonTabs, SkeletonStatRow, SkeletonTable } from "@/components/ui/Skeleton";

export default function BillingLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <SkeletonPageHeader />
      <SkeletonTabs />
      <SkeletonStatRow />
      <SkeletonTable rows={7} />
    </div>
  );
}
