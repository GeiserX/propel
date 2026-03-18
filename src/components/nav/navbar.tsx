"use client";

import { useState } from "react";
import type { FuelType } from "@/types/station";
import { FUEL_TYPES, FUEL_CATEGORIES, FUEL_TYPE_MAP } from "@/types/fuel";
import { useI18n, LOCALES, type Locale } from "@/lib/i18n";
import { useCurrency, CURRENCIES, type Currency } from "@/lib/currency";
import { useTheme } from "@/lib/theme";
import { StatsDropdown } from "./stats-dropdown";

type GeoState = "idle" | "loading" | "active" | "denied";

interface NavbarProps {
  selectedFuel: FuelType;
  onFuelChange: (fuel: FuelType) => void;
  geoState: GeoState;
  onGeolocate: () => void;
}

const selectChevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

const selectStyle = {
  backgroundImage: selectChevron,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 0.2rem center",
};

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

function FuelSelect({ selectedFuel, onFuelChange, className }: { selectedFuel: FuelType; onFuelChange: (fuel: FuelType) => void; className?: string }) {
  const { t } = useI18n();
  return (
    <select
      value={selectedFuel}
      onChange={(e) => onFuelChange(e.target.value as FuelType)}
      className={className}
      style={{ ...selectStyle, backgroundPosition: "right 0.35rem center" }}
    >
      {FUEL_CATEGORIES.map((cat) => {
        const fuels = FUEL_TYPES.filter((f) => f.category === cat.key);
        if (fuels.length === 0) return null;
        return (
          <optgroup key={cat.key} label={t(`fuel.${cat.key}`)}>
            {fuels.map((fuel) => (
              <option key={fuel.code} value={fuel.code}>
                {fuel.label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

const navBtnCls = "flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] transition-all hover:border-white/15 hover:bg-white/10";

export function Navbar({ selectedFuel, onFuelChange, geoState, onGeolocate }: NavbarProps) {
  const currentFuel = FUEL_TYPE_MAP.get(selectedFuel);
  const { locale, setLocale } = useI18n();
  const currentLocale = LOCALES.find((l) => l.code === locale);
  const { currency, setCurrency } = useCurrency();
  const { theme, toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <nav className="relative z-20 flex h-11 shrink-0 items-center justify-between bg-[#0c111b] px-3.5">
        {/* Left: Logo */}
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
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5">
          {/* Language + Currency — hidden on mobile, shown on sm+ */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="h-7 cursor-pointer appearance-none rounded border border-white/[0.08] bg-[#0c111b] py-0 pr-5 pl-2 text-[13px] font-medium text-gray-200 transition-all hover:border-white/15 hover:bg-white/10 focus:border-emerald-400/40 focus:bg-white/10 focus:ring-1 focus:ring-emerald-400/20 focus:outline-none [&_option]:bg-[#0c111b] [&_option]:text-gray-200"
              style={selectStyle}
              title={currentLocale?.label}
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>

            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="h-7 cursor-pointer appearance-none rounded border border-white/[0.08] bg-[#0c111b] py-0 pr-5 pl-2 text-[13px] font-medium text-gray-200 transition-all hover:border-white/15 hover:bg-white/10 focus:border-emerald-400/40 focus:bg-white/10 focus:ring-1 focus:ring-emerald-400/20 focus:outline-none [&_option]:bg-[#0c111b] [&_option]:text-gray-200"
              style={selectStyle}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
              ))}
            </select>

            <div className="h-4 w-px bg-white/[0.08]" />
          </div>

          {/* Fuel selector — always visible */}
          <span className="text-emerald-400/80">
            {currentFuel && <CategoryIcon category={currentFuel.category} />}
          </span>
          <FuelSelect
            selectedFuel={selectedFuel}
            onFuelChange={onFuelChange}
            className="h-7 max-w-[140px] cursor-pointer appearance-none rounded border border-white/[0.08] bg-[#0c111b] py-0 pr-6 pl-2 text-[13px] font-medium text-gray-200 transition-all hover:border-white/15 hover:bg-white/10 focus:border-emerald-400/40 focus:bg-white/10 focus:ring-1 focus:ring-emerald-400/20 focus:outline-none sm:max-w-none [&_option]:bg-[#0c111b] [&_option]:text-gray-200 [&_optgroup]:bg-[#0c111b] [&_optgroup]:text-gray-400"
          />

          <div className="h-4 w-px bg-white/[0.08]" />

          {/* Geolocate button */}
          <button
            onClick={onGeolocate}
            disabled={geoState === "loading"}
            className={`${navBtnCls} ${
              geoState === "active"
                ? "border-blue-500/40 text-blue-400"
                : "text-gray-400 hover:text-gray-200"
            } disabled:opacity-60`}
          >
            {geoState === "loading" ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : geoState === "denied" ? (
              <svg className="h-3.5 w-3.5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 5.05a7 7 0 119.9 9.9 7 7 0 01-9.9-9.9zM10 3a7 7 0 00-4.95 11.95l9.9-9.9A6.97 6.97 0 0010 3z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12zm0-3a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Theme toggle */}
          <button onClick={toggleTheme} className={`${navBtnCls} text-gray-400 hover:text-gray-200`}>
            {theme === "light" ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            )}
          </button>

          {/* Stats */}
          <StatsDropdown />

          {/* Settings gear — mobile only */}
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={`${navBtnCls} text-gray-400 hover:text-gray-200 sm:hidden`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile settings dropdown */}
      {settingsOpen && (
        <div className="absolute right-2 top-12 z-30 flex flex-col gap-2 rounded-lg border border-black/10 bg-[#0c111b] p-3 shadow-xl sm:hidden">
          <select
            value={locale}
            onChange={(e) => { setLocale(e.target.value as Locale); setSettingsOpen(false); }}
            className="h-8 cursor-pointer appearance-none rounded border border-white/[0.08] bg-[#0c111b] py-0 pr-5 pl-2 text-[13px] font-medium text-gray-200 focus:outline-none [&_option]:bg-[#0c111b] [&_option]:text-gray-200"
            style={selectStyle}
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <select
            value={currency}
            onChange={(e) => { setCurrency(e.target.value as Currency); setSettingsOpen(false); }}
            className="h-8 cursor-pointer appearance-none rounded border border-white/[0.08] bg-[#0c111b] py-0 pr-5 pl-2 text-[13px] font-medium text-gray-200 focus:outline-none [&_option]:bg-[#0c111b] [&_option]:text-gray-200"
            style={selectStyle}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
