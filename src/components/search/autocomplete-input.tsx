"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PhotonResult } from "@/lib/photon";

export interface AutocompleteRef {
  geocode: (query: string) => Promise<PhotonResult | null>;
}

interface AutocompleteInputProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: PhotonResult) => void;
  onClearCoordinates?: () => void;
  mapCenter?: [number, number]; // [lon, lat] for geo-biased results
}

export const AutocompleteInput = forwardRef<AutocompleteRef, AutocompleteInputProps>(function AutocompleteInput({
  placeholder,
  value,
  onChange,
  onSelect,
  onClearCoordinates,
  mapCenter,
}, ref) {
  const [results, setResults] = useState<PhotonResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const doGeocode = useCallback(
    async (query: string): Promise<PhotonResult[]> => {
      const params = new URLSearchParams({ q: query });
      if (mapCenter) {
        params.set("lon", String(mapCenter[0]));
        params.set("lat", String(mapCenter[1]));
      }
      try {
        const res = await fetch(`/api/geocode?${params}`);
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    },
    [mapCenter],
  );

  useImperativeHandle(ref, () => ({
    geocode: async (query: string) => {
      const results = await doGeocode(query);
      return results[0] ?? null;
    },
  }), [doGeocode]);

  const fetchResults = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setResults([]);
        return;
      }

      const data = await doGeocode(query);
      setResults(data);
      setIsOpen(data.length > 0);
      setActiveIndex(-1);
    },
    [doGeocode],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      onChange(val);
      onClearCoordinates?.();

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchResults(val), 300);
    },
    [onChange, onClearCoordinates, fetchResults],
  );

  const handleSelect = useCallback(
    (result: PhotonResult) => {
      const label = formatResult(result);
      onChange(label);
      onSelect(result);
      setIsOpen(false);
      setResults([]);
    },
    [onChange, onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        handleSelect(results[activeIndex]);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    },
    [isOpen, results, activeIndex, handleSelect],
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
      />

      {isOpen && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {results.map((r, i) => (
            <li
              key={`${r.coordinates[0]}-${r.coordinates[1]}-${i}`}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === activeIndex ? "bg-emerald-50 text-emerald-700" : "text-gray-700 hover:bg-gray-50"
              }`}
              onMouseDown={() => handleSelect(r)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="font-medium">{r.name}</span>
              {(r.city || r.state) && (
                <span className="ml-1 text-gray-400">
                  {[r.city, r.state].filter(Boolean).join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

function formatResult(r: PhotonResult): string {
  const parts = [r.name];
  if (r.city && r.city !== r.name) parts.push(r.city);
  return parts.join(", ");
}
