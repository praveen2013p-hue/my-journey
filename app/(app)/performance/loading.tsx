import { SkeletonCards, SkeletonHeader, SkeletonTable } from "@/components/Skeleton";

export default function PerformanceLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonCards count={4} />
      <SkeletonTable rows={6} />
      <SkeletonTable rows={5} />
    </>
  );
}
