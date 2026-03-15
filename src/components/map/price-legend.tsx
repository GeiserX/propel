"use client";

export const PRICE_COLORS = [
  "#22c55e", // green
  "#84cc16", // lime
  "#eab308", // yellow
  "#f97316", // orange
  "#ef4444", // red
  "#dc2626", // dark red
  "#a855f7", // purple
] as const;

interface PriceLegendProps {
  min: number | null;
  max: number | null;
}

export function PriceLegend({ min, max }: PriceLegendProps) {
  if (min == null || max == null) return null;

  const gradient = PRICE_COLORS.map((c, i) => {
    const pct = (i / (PRICE_COLORS.length - 1)) * 100;
    return `${c} ${pct.toFixed(0)}%`;
  }).join(", ");

  return (
    <div className="absolute bottom-6 left-3 z-10 rounded-lg border border-black/10 bg-white/90 px-3 py-2 shadow-md backdrop-blur-sm">
      <div
        className="h-2.5 w-40 rounded-full"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
      />
      <div className="mt-1 flex justify-between text-[10px] font-semibold tabular-nums text-gray-600">
        <span>{min.toFixed(3)} €</span>
        <span>{max.toFixed(3)} €</span>
      </div>
    </div>
  );
}
