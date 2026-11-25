import { SkeletonBlock, SkeletonHeader, SkeletonStrip } from "@/components/Skeleton";

export default function DashboardLoading() {
  return (
    <>
      <SkeletonStrip />
      <SkeletonHeader />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonBlock className="h-40" />
        <SkeletonBlock className="h-40" />
      </div>
      <SkeletonBlock className="h-56" />
      <SkeletonBlock className="h-40" />
    </>
  );
}
