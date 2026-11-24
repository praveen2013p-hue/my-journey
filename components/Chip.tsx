import type { ReactNode } from "react";

export type ChipVariant = "green" | "amber" | "red" | "yellow" | "gold" | "neutral";

const VARIANT_CLASSES: Record<ChipVariant, string> = {
  green: "text-pos border-pos-border bg-pos-wash",
  amber: "text-warn border-warn-border bg-warn-wash",
  red: "text-neg border-neg-border bg-neg-wash",
  yellow: "text-stage1 border-stage1-border bg-stage1-wash",
  gold: "text-gold-light border-gold-border bg-gold-wash",
  neutral: "text-muted border-border-strong bg-chip-neutral",
};

export function Chip({ variant, children }: { variant: ChipVariant; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}

export function gradeVariant(grade: "A" | "B" | "C"): ChipVariant {
  if (grade === "A") return "green";
  if (grade === "B") return "amber";
  return "red";
}

export function stageVariant(stage: 1 | 2 | 3 | 4 | null): ChipVariant {
  if (stage === 1) return "yellow";
  if (stage === 2) return "green";
  if (stage === 3) return "amber";
  if (stage === 4) return "red";
  return "neutral";
}
