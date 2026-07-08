import { SkeletonPageHeader, SkeletonToolbar, SkeletonTable } from "@/components/ui/Skeleton";

export default function ClassesLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <SkeletonPageHeader />
      <SkeletonToolbar />
      <SkeletonTable rows={9} />
    </div>
  );
}
