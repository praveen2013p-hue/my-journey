"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Market } from "@/lib/db/schema-types";
import type { TimeFramePreset } from "@/lib/performance-data";

const PRESETS: Array<{ key: TimeFramePreset; label: string }> = [
  { key: "month", label: "This month" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
  { key: "custom", label: "Custom" },
];

export function TimeFrameBar({
  market,
  preset,
  customFrom,
  customTo,
}: {
  market: Market;
  preset: TimeFramePreset;
  customFrom: string | null;
  customTo: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showCustom, setShowCustom] = useState(preset === "custom");

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => pushParams({ market: "IN" })}
          className={`rounded-full border px-3.5 py-1.5 font-medium ${market === "IN" ? "border-gold-border bg-gold-wash-strong text-gold-light" : "border-border-strong text-muted"}`}
        >
          India ₹
        </button>
        <button
          type="button"
          onClick={() => pushParams({ market: "US" })}
          className={`rounded-full border px-3.5 py-1.5 font-medium ${market === "US" ? "border-gold-border bg-gold-wash-strong text-gold-light" : "border-border-strong text-muted"}`}
        >
          US $
        </button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              if (p.key === "custom") {
                setShowCustom(true);
                pushParams({ preset: "custom" });
              } else {
                setShowCustom(false);
                pushParams({ preset: p.key, from: null, to: null });
              }
            }}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${preset === p.key ? "border-gold-border bg-gold-wash-strong text-gold-light" : "border-border-strong text-muted"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {showCustom && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="From date"
            defaultValue={customFrom ?? ""}
            onChange={(e) => pushParams({ preset: "custom", from: e.target.value || null })}
            className="min-h-[40px] rounded-lg border border-border-strong bg-field px-3 text-sm text-text"
          />
          <span className="text-muted">to</span>
          <input
            type="date"
            aria-label="To date"
            defaultValue={customTo ?? ""}
            onChange={(e) => pushParams({ preset: "custom", to: e.target.value || null })}
            className="min-h-[40px] rounded-lg border border-border-strong bg-field px-3 text-sm text-text"
          />
        </div>
      )}
    </div>
  );
}
