"use client";

import {
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { sma } from "@/lib/weinstein";

export interface WeeklyChartBar {
  weekEnding: string;
  close: number;
  volume: number;
}

export function WeeklyChart({
  bars,
  breakoutLevel,
}: {
  bars: WeeklyChartBar[];
  breakoutLevel: number | null;
}) {
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

    const priceSeries = chart.addSeries(LineSeries, {
      color: "#E8E6E1",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    const maSeries = chart.addSeries(LineSeries, {
      color: "#E6CF5C",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#3A3E46",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    priceSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.25 } });

    const closes = bars.map((b) => b.close);
    const maValues = sma(closes, 30);

    priceSeries.setData(bars.map((b) => ({ time: b.weekEnding, value: b.close })));
    maSeries.setData(
      bars
        .map((b, i) => ({ time: b.weekEnding, value: maValues[i] }))
        .filter((d): d is { time: string; value: number } => d.value !== null),
    );
    volumeSeries.setData(
      bars.map((b) => ({ time: b.weekEnding, value: b.volume, color: "#3A3E46" })),
    );

    if (breakoutLevel !== null) {
      priceSeries.createPriceLine({
        price: breakoutLevel,
        color: "#E8923A",
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: "breakout level",
      });
    }

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
  }, [bars, breakoutLevel]);

  return (
    <div>
      <div ref={containerRef} className="w-full" />
      <div className="mt-1.5 text-xs text-muted">
        White = price · yellow = 30W MA · dashed = breakout level
      </div>
    </div>
  );
}
