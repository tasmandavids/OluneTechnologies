import { SkeletonPageHeader, SkeletonTabs, SkeletonCalendar } from "@/components/ui/Skeleton";

export default function ScheduleLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <SkeletonPageHeader />
      <SkeletonTabs count={2} />
      <SkeletonCalendar />
    </div>
  );
}
