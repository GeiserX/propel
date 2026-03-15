"use client";

import type { FuelType } from "@/types/station";
import { FUEL_TYPES, FUEL_CATEGORIES, FUEL_TYPE_MAP } from "@/types/fuel";
import { StatsDropdown } from "./stats-dropdown";

interface NavbarProps {
  selectedFuel: FuelType;
  onFuelChange: (fuel: FuelType) => void;
}

function CategoryIcon({ category }: { category: string }) {
  const cls = "h-3.5 w-3.5";
  if (category === "diesel" || category === "gasoline") {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="2" width="7" height="12" rx="1" />
        <path d="M10 5.5l1.5-1.5a1 1 0 011.5 0v5a1.5 1.5 0 01-3 0V7" />
        <path d="M5 5.5h3" />
      </svg>
    );
  }
  if (category === "gas") {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="5.5" />
        <path d="M5 8c0-2 1.5-4 3-4s3 2 3 4-1.5 4-3 4-3-2-3-4z" />
      </svg>
    );
  }
  if (category === "hydrogen") {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="currentColor">
        <path d="M4.5 3a.75.75 0 01.75.75v3.5h5.5v-3.5a.75.75 0 011.5 0v8.5a.75.75 0 01-1.5 0v-3.5h-5.5v3.5a.75.75 0 01-1.5 0v-8.5A.75.75 0 014.5 3z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2c0 0-3.5 3-3.5 5.5a3.5 3.5 0 007 0C11.5 5 8 2 8 2z" />
    </svg>
  );
}

export function Navbar({ selectedFuel, onFuelChange }: NavbarProps) {
  const currentFuel = FUEL_TYPE_MAP.get(selectedFuel);

  return (
    <nav className="relative z-20 flex h-11 shrink-0 items-center justify-between bg-[#0c111b] px-3.5">
      {/* Left: Logo + Stats */}
      <div className="flex items-center gap-1">
        <a href="/" className="flex items-center gap-0">
          <svg viewBox="0 0 140 32" className="h-6" aria-label="Propel">
            <defs>
              <linearGradient id="plogo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#34d399" />
                <stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <rect x="0" y="2" width="28" height="28" rx="7" fill="url(#plogo)" />
            <path d="M17.5 6L10 17h5l-2.5 9L20 15h-5l2.5-9z" fill="#0c111b" />
            <text x="35" y="23.5" fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif" fontSize="20" fontWeight="700" letterSpacing="-0.5" fill="white">
              Propel
            </text>
          </svg>
        </a>

        <div className="mx-1.5 h-4 w-px bg-white/[0.08]" />

        <StatsDropdown />
      </div>

      {/* Right: Fuel type selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-emerald-400/80">
          {currentFuel && <CategoryIcon category={currentFuel.category} />}
        </span>
        <select
          value={selectedFuel}
          onChange={(e) => onFuelChange(e.target.value as FuelType)}
          className="h-7 cursor-pointer appearance-none rounded border border-white/[0.08] bg-white/[0.06] py-0 pr-6 pl-2 text-[13px] font-medium text-gray-200 transition-all hover:border-white/15 hover:bg-white/10 focus:border-emerald-400/40 focus:bg-white/10 focus:ring-1 focus:ring-emerald-400/20 focus:outline-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.35rem center",
          }}
        >
          {FUEL_CATEGORIES.map((cat) => {
            const fuels = FUEL_TYPES.filter((f) => f.category === cat.key);
            if (fuels.length === 0) return null;
            return (
              <optgroup key={cat.key} label={cat.label}>
                {fuels.map((fuel) => (
                  <option key={fuel.code} value={fuel.code}>
                    {fuel.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>
    </nav>
  );
}
