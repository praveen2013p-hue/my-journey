"use client";

import { ColorType, createChart, LineSeries, type IChartApi, type Time } from "lightweight-charts";
import { useEffect, useRef } from "react";

export interface WealthGrowthPoint {
  /** "yyyy-mm-01" */
  time: string;
  invested: number;
  value: number;
  /** Null when this month falls outside the benchmark index table's coverage - that point is simply omitted from the line, never interpolated. */
  benchmark: number | null;
}

/** Overview's "how my wealth is growing" chart - cumulative invested vs. actual portfolio value vs. the same cash flows in a Nifty 50 benchmark, over every month on record. */
export function WealthGrowthChart({ points }: { points: WealthGrowthPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height: 220,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#A3A39E",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#2E3138" },
      },
      rightPriceScale: { borderColor: "#2E3138" },
      timeScale: { borderColor: "#2E3138" },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const valueSeries = chart.addSeries(LineSeries, {
      color: "#C9A24A",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    const investedSeries = chart.addSeries(LineSeries, {
      color: "#A3A39E",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const benchmarkSeries = chart.addSeries(LineSeries, {
      color: "#5B8DBE",
      lineWidth: 1,
      lineStyle: 2, // dashed - visually distinct from the two solid lines
      priceLineVisible: false,
      lastValueVisible: false,
    });

    valueSeries.setData(points.map((p) => ({ time: p.time as Time, value: p.value })));
    investedSeries.setData(points.map((p) => ({ time: p.time as Time, value: p.invested })));
    // Benchmark coverage can have gaps (DECISIONS.md) - points with no
    // coverage are left out entirely rather than interpolated across.
    benchmarkSeries.setData(
      points.filter((p) => p.benchmark !== null).map((p) => ({ time: p.time as Time, value: p.benchmark! })),
    );

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [points]);

  return (
    <div>
      <div ref={containerRef} className="w-full" />
      <div className="mt-1.5 text-xs text-muted">
        Gold = portfolio value · gray = total invested · dashed blue = same money in Nifty 50 (approx.)
      </div>
    </div>
  );
}
