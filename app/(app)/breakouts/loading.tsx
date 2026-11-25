import { SkeletonBlock, SkeletonHeader, SkeletonTable } from "@/components/Skeleton";

export default function BreakoutsLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonBlock className="h-10 w-72" />
      <SkeletonBlock className="h-14" />
      <SkeletonTable rows={10} />
    </>
  );
}
