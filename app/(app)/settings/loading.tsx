import { SkeletonBlock, SkeletonHeader } from "@/components/Skeleton";

export default function SettingsLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-32" />
      <SkeletonBlock className="h-32" />
      <SkeletonBlock className="h-24" />
    </>
  );
}
