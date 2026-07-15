import { SkeletonPageHeader, SkeletonTabs, SkeletonTwoPane } from "@/components/ui/Skeleton";

export default function InboxLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <SkeletonPageHeader />
      <SkeletonTabs count={2} />
      <SkeletonTwoPane />
    </div>
  );
}
