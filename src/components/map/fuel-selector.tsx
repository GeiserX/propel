"use client";

import { FUEL_TYPES } from "@/types/fuel";
import type { FuelType } from "@/types/station";

interface FuelSelectorProps {
  selectedFuel: FuelType;
  onFuelChange: (fuel: FuelType) => void;
}

export function FuelSelector({ selectedFuel, onFuelChange }: FuelSelectorProps) {
  return (
    <div className="absolute right-3 top-3 z-10">
      <select
        value={selectedFuel}
        onChange={(e) => onFuelChange(e.target.value as FuelType)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-md transition-colors hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        {FUEL_TYPES.map((fuel) => (
          <option key={fuel.code} value={fuel.code}>
            {fuel.label}
          </option>
        ))}
      </select>
    </div>
  );
}
