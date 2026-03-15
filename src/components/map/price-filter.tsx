"use client";

import { useMemo } from "react";
import type { StationsGeoJSONCollection } from "@/types/station";

interface PriceFilterProps {
  stations: StationsGeoJSONCollection;
  maxPrice: number | null;
  enabled: boolean;
  onMaxPriceChange: (price: number | null) => void;
  onEnabledChange: (enabled: boolean) => void;
}

export function PriceFilter({
  stations,
  maxPrice,
  enabled,
  onMaxPriceChange,
  onEnabledChange,
}: PriceFilterProps) {
  // Only consider stations that have a price for the selected fuel
  const { min, max, pricedCount, totalCount } = useMemo(() => {
    const prices: number[] = [];
    let total = 0;
    for (const f of stations.features) {
      total++;
      if (f.properties.price != null) prices.push(f.properties.price);
    }
    if (prices.length === 0) return { min: null, max: null, pricedCount: 0, totalCount: total };
    prices.sort((a, b) => a - b);
    return { min: prices[0], max: prices[prices.length - 1], pricedCount: prices.length, totalCount: total };
  }, [stations]);

  if (min == null || max == null || pricedCount < 2 || max - min < 0.005) return null;

  const step = 0.001;
  const sliderMin = Math.floor(min * 1000) / 1000;
  const sliderMax = Math.ceil(max * 1000) / 1000;
  const currentValue = maxPrice ?? sliderMax;

  const filteredCount = enabled && maxPrice != null
    ? stations.features.filter(
        (f) => f.properties.price != null && f.properties.price <= maxPrice,
      ).length
    : pricedCount;

  return (
    <div className="absolute bottom-[76px] left-3 z-10 w-48 rounded-lg border border-black/10 bg-white/90 px-3 py-2 shadow-md backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="h-3 w-3 cursor-pointer rounded border-gray-300 text-emerald-500 focus:ring-emerald-400/30"
          />
          <span className="text-[10px] font-semibold text-gray-600">Precio máx.</span>
        </label>
        {enabled && maxPrice != null && (
          <button
            onClick={() => onMaxPriceChange(null)}
            className="text-[9px] font-medium text-emerald-600 hover:text-emerald-700"
          >
            Reset
          </button>
        )}
      </div>

      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={step}
        value={currentValue}
        disabled={!enabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!enabled) onEnabledChange(true);
          onMaxPriceChange(v >= sliderMax ? null : v);
        }}
        className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-emerald-500 disabled:cursor-default disabled:opacity-40 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:shadow-sm"
      />

      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] tabular-nums text-gray-400">{sliderMin.toFixed(3)} €</span>
        <span className={`text-[11px] font-bold tabular-nums ${enabled && maxPrice != null ? "text-emerald-600" : "text-gray-500"}`}>
          {currentValue.toFixed(3)} €
        </span>
        <span className="text-[10px] tabular-nums text-gray-400">{sliderMax.toFixed(3)} €</span>
      </div>

      {enabled && (
        <p className="mt-1 text-center text-[9px] text-gray-400">
          {filteredCount} de {pricedCount} con precio
        </p>
      )}
    </div>
  );
}
