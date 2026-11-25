"use client";

import dynamic from "next/dynamic";
import type { WealthGrowthPoint } from "./WealthGrowthChart";

// `lightweight-charts` is a genuinely heavy dependency - lazy-loaded so its
// weight is only downloaded by someone actually viewing the NPS page, same
// reasoning as components/breakouts/BreakoutsTable.tsx's SidePanel.
export const WealthGrowthChartLazy = dynamic(
  () => import("./WealthGrowthChart").then((m) => m.WealthGrowthChart),
  {
    ssr: false,
    loading: () => <div className="h-[220px] animate-pulse rounded-lg bg-panel-alt" />,
  },
);

export type { WealthGrowthPoint };
