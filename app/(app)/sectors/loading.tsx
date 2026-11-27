import { SkeletonBlock, SkeletonHeader, SkeletonTable } from "@/components/Skeleton";

export default function SectorsLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonBlock className="h-10 w-48" />
      <SkeletonTable rows={10} />
      <SkeletonBlock className="h-64" />
    </>
  );
}
