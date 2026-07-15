import { SkeletonPageHeader, SkeletonStatRow, SkeletonTable } from "@/components/ui/Skeleton";

// Shape-neutral admin fallback — also inherited by admin child routes that
// don't ship their own loading.tsx, so keep it generic (header, stats, list).
export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <SkeletonPageHeader />
      <SkeletonStatRow />
      <SkeletonTable rows={6} />
    </div>
  );
}
