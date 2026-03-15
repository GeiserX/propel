"use client";

import { useCallback, useRef, useState } from "react";
import type { PhotonResult } from "@/lib/photon";
import { AutocompleteInput, type AutocompleteRef } from "./autocomplete-input";

interface Location {
  label: string;
  coordinates: [number, number]; // [lon, lat]
}

interface SearchPanelProps {
  mapCenter: [number, number];
  onRoute: (origin: [number, number], destination: [number, number]) => void;
  onClearRoute: () => void;
  routeInfo: { distance: number; duration: number } | null;
  isLoading: boolean;
}

export function SearchPanel({
  mapCenter,
  onRoute,
  onClearRoute,
  routeInfo,
  isLoading,
}: SearchPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [origin, setOrigin] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const originRef = useRef<AutocompleteRef>(null);
  const destRef = useRef<AutocompleteRef>(null);

  const handleOriginSelect = useCallback((result: PhotonResult) => {
    setOrigin({ label: result.name, coordinates: result.coordinates });
  }, []);

  const handleDestSelect = useCallback((result: PhotonResult) => {
    setDestination({ label: result.name, coordinates: result.coordinates });
  }, []);

  const handleRoute = useCallback(async () => {
    let o = origin;
    let d = destination;

    // Geocode text if no autocomplete selection was made
    if (!o && originText.trim()) {
      const result = await originRef.current?.geocode(originText.trim());
      if (result) {
        o = { label: result.name, coordinates: result.coordinates };
        setOrigin(o);
        setOriginText(formatResult(result));
      }
    }
    if (!d && destText.trim()) {
      const result = await destRef.current?.geocode(destText.trim());
      if (result) {
        d = { label: result.name, coordinates: result.coordinates };
        setDestination(d);
        setDestText(formatResult(result));
      }
    }

    if (!o || !d) return;
    onRoute(o.coordinates, d.coordinates);
  }, [origin, destination, originText, destText, onRoute]);

  const handleSwap = useCallback(() => {
    setOriginText(destText);
    setDestText(originText);
    setOrigin(destination);
    setDestination(origin);
  }, [originText, destText, origin, destination]);

  const handleClear = useCallback(() => {
    setOriginText("");
    setDestText("");
    setOrigin(null);
    setDestination(null);
    onClearRoute();
  }, [onClearRoute]);

  // Collapsed: search icon button
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-white shadow-md transition-colors hover:bg-gray-50"
        title="Buscar ruta"
      >
        <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="absolute left-3 top-3 z-10 w-[340px] rounded-lg border border-black/10 bg-white/95 shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold text-gray-500">Ruta</span>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Inputs */}
      <div className="flex gap-2 p-3">
        {/* Swap button */}
        <div className="flex flex-col items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <div className="my-1 h-6 w-px bg-gray-300" />
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <button
            onClick={handleSwap}
            className="mt-1.5 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Intercambiar"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
            </svg>
          </button>
        </div>

        {/* Input fields */}
        <div className="flex flex-1 flex-col gap-2">
          <AutocompleteInput
            ref={originRef}
            placeholder="Origen"
            value={originText}
            onChange={setOriginText}
            onSelect={handleOriginSelect}
            onClearCoordinates={() => setOrigin(null)}
            mapCenter={mapCenter}
          />
          <AutocompleteInput
            ref={destRef}
            placeholder="Destino"
            value={destText}
            onChange={setDestText}
            onSelect={handleDestSelect}
            onClearCoordinates={() => setDestination(null)}
            mapCenter={mapCenter}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
        <button
          onClick={handleRoute}
          disabled={(!origin && !originText.trim()) || (!destination && !destText.trim()) || isLoading}
          className="flex-1 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Calculando..." : "Calcular ruta"}
        </button>
        {routeInfo && (
          <button
            onClick={handleClear}
            className="rounded-md px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            Borrar
          </button>
        )}
      </div>

      {/* Route info */}
      {routeInfo && (
        <div className="border-t border-gray-100 px-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {formatDistance(routeInfo.distance)}
            </span>
            <span className="font-medium text-gray-700">
              {formatDuration(routeInfo.duration)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatResult(r: PhotonResult): string {
  const parts = [r.name];
  if (r.city && r.city !== r.name) parts.push(r.city);
  return parts.join(", ");
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}
