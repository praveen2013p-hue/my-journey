"use client";

import { ColorType, createChart, LineSeries, type IChartApi, type Time } from "lightweight-charts";
import { useEffect, useRef } from "react";

export interface WealthGrowthPoint {
  /** "yyyy-mm-01" */
  time: string;
  invested: number;
  value: number;
}

/** Overview's "how my capital is growing" chart - cumulative invested vs. actual account value, over every month on record. */
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

    valueSeries.setData(points.map((p) => ({ time: p.time as Time, value: p.value })));
    investedSeries.setData(points.map((p) => ({ time: p.time as Time, value: p.invested })));

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
      <div className="mt-1.5 text-xs text-muted">Gold = account value (USD) · gray = total capital deposited</div>
    </div>
  );
}
