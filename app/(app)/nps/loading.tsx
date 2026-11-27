import { SkeletonCards, SkeletonHeader, SkeletonTable } from "@/components/Skeleton";

export default function NpsLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonCards count={5} />
      <SkeletonTable rows={6} />
    </>
  );
}
