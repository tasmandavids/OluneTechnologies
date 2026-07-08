import { SkeletonPageHeader, SkeletonStatRow, SkeletonTable } from "@/components/ui/Skeleton";

export default function ParentBillingLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <SkeletonPageHeader />
      <SkeletonStatRow count={3} />
      <SkeletonTable rows={6} />
    </div>
  );
}
