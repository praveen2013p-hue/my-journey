import { SkeletonBlock, SkeletonHeader } from "@/components/Skeleton";

export default function WeeklyReviewLoading() {
  return (
    <>
      <SkeletonHeader />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonBlock className="h-48" />
        <SkeletonBlock className="h-48" />
      </div>
      <SkeletonBlock className="h-40" />
    </>
  );
}
