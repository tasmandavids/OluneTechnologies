import { SkeletonPageHeader, SkeletonToolbar, SkeletonCardGrid } from "@/components/ui/Skeleton";

export default function ParentsLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <SkeletonPageHeader />
      <SkeletonToolbar />
      <SkeletonCardGrid />
    </div>
  );
}
