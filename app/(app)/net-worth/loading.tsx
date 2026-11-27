import { SkeletonCards, SkeletonHeader, SkeletonTable } from "@/components/Skeleton";

export default function NetWorthLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonCards count={4} />
      <SkeletonTable rows={5} />
    </>
  );
}
