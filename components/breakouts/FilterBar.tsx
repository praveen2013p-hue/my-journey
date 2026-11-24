"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "@/components/icons";
import type { Grade, Market } from "@/lib/db/schema-types";

interface FilterBarProps {
  weekEnding: string | null;
  prevWeek: string;
  nextWeek: string;
  rangeMode: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  market: "ALL" | Market;
  grades: Grade[];
  sector: string;
  industry: string;
  search: string;
  availableSectors: string[];
  availableIndustries: string[];
}

const ALL_GRADES: Grade[] = ["A", "B", "C"];

export function FilterBar(props: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchText, setSearchText] = useState(props.search);
  const [showRange, setShowRange] = useState(props.rangeMode);

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleGrade(grade: Grade) {
    const next = props.grades.includes(grade)
      ? props.grades.filter((g) => g !== grade)
      : [...props.grades, grade];
    pushParams({ grades: next.length > 0 && next.length < 3 ? next.join(",") : null });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {!showRange ? (
          <>
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => pushParams({ week: props.prevWeek, dateFrom: null, dateTo: null })}
              className="flex min-h-[44px] items-center justify-center rounded-lg border border-border-strong bg-panel-alt px-3 text-muted hover:bg-panel"
            >
              <ChevronLeftIcon />
            </button>
            <div className="flex min-h-[44px] items-center rounded-lg border border-border-strong bg-field px-3 font-semibold">
              Week ending {props.weekEnding ?? "—"}
            </div>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => pushParams({ week: props.nextWeek, dateFrom: null, dateTo: null })}
              className="flex min-h-[44px] items-center justify-center rounded-lg border border-border-strong bg-panel-alt px-3 text-muted hover:bg-panel"
            >
              <ChevronRightIcon />
            </button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="From date"
              defaultValue={props.dateFrom ?? ""}
              onChange={(e) => pushParams({ dateFrom: e.target.value, week: null })}
              className="min-h-[44px] rounded-lg border border-border-strong bg-field px-3 text-text"
            />
            <span className="text-muted">to</span>
            <input
              type="date"
              aria-label="To date"
              defaultValue={props.dateTo ?? ""}
              onChange={(e) => pushParams({ dateTo: e.target.value, week: null })}
              className="min-h-[44px] rounded-lg border border-border-strong bg-field px-3 text-text"
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (showRange) {
              setShowRange(false);
              pushParams({ dateFrom: null, dateTo: null });
            } else {
              setShowRange(true);
            }
          }}
          className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel"
        >
          <CalendarIcon /> {showRange ? "Use week view" : "Custom range"}
        </button>

        <span
          className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-medium ${
            props.market === "ALL"
              ? "border-gold-border bg-gold-wash-strong text-gold-light"
              : "border-border-strong text-muted hover:text-text"
          }`}
          onClick={() => pushParams({ market: null })}
        >
          All
        </span>
        <span
          className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-medium ${
            props.market === "IN"
              ? "border-gold-border bg-gold-wash-strong text-gold-light"
              : "border-border-strong text-muted hover:text-text"
          }`}
          onClick={() => pushParams({ market: "IN" })}
        >
          India
        </span>
        <span
          className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-medium ${
            props.market === "US"
              ? "border-gold-border bg-gold-wash-strong text-gold-light"
              : "border-border-strong text-muted hover:text-text"
          }`}
          onClick={() => pushParams({ market: "US" })}
        >
          US
        </span>

        <span className="ml-1.5 flex items-center gap-2">
          {ALL_GRADES.map((grade) => (
            <span
              key={grade}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-medium ${
                props.grades.includes(grade)
                  ? "border-gold-border bg-gold-wash-strong text-gold-light"
                  : "border-border-strong text-muted hover:text-text"
              }`}
              onClick={() => toggleGrade(grade)}
            >
              {grade}
            </span>
          ))}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <select
          aria-label="Sector"
          value={props.sector}
          onChange={(e) => pushParams({ sector: e.target.value || null })}
          className="min-h-[44px] rounded-lg border border-border-strong bg-field px-3 text-text"
        >
          <option value="">Sector: All</option>
          {props.availableSectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Industry"
          value={props.industry}
          onChange={(e) => pushParams({ industry: e.target.value || null })}
          className="min-h-[44px] rounded-lg border border-border-strong bg-field px-3 text-text"
        >
          <option value="">Industry: All</option>
          {props.availableIndustries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <div className="flex min-h-[44px] min-w-[260px] items-center gap-2 rounded-lg border border-border-strong bg-field px-3 text-muted">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search ticker or name"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") pushParams({ search: searchText || null });
            }}
            onBlur={() => pushParams({ search: searchText || null })}
            className="w-full bg-transparent text-text outline-none placeholder:text-muted"
          />
        </div>
      </div>
    </div>
  );
}
