import { SkeletonPageHeader, SkeletonCardGrid, SkeletonTable } from "@/components/ui/Skeleton";

// Shape-neutral parent fallback — also inherited by parent child routes that
// don't ship their own loading.tsx (family hub: children cards + activity).
export default function ParentLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <SkeletonPageHeader />
      <SkeletonCardGrid count={3} />
      <SkeletonTable rows={4} />
    </div>
  );
}
