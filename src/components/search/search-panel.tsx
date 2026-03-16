"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotonResult } from "@/lib/photon";
import { AutocompleteInput, type AutocompleteRef } from "./autocomplete-input";

type Phase = "search" | "destination" | "route";

interface SearchPanelProps {
  mapCenter: [number, number];
  onFlyTo: (coords: [number, number]) => void;
  onRoute: (origin: [number, number], destination: [number, number]) => void;
  onClearRoute: () => void;
  routeInfo: { distance: number; duration: number } | null;
  isLoading: boolean;
}

interface Location {
  label: string;
  coordinates: [number, number];
}

export function SearchPanel({
  mapCenter,
  onFlyTo,
  onRoute,
  onClearRoute,
  routeInfo,
  isLoading,
}: SearchPanelProps) {
  const [phase, setPhase] = useState<Phase>("search");
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [origin, setOrigin] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const originRef = useRef<AutocompleteRef>(null);
  const destRef = useRef<AutocompleteRef>(null);
  // Track if origin was edited during route phase
  const originEditedRef = useRef(false);

  // Origin selected from autocomplete → fly to location, show destination
  const handleOriginSelect = useCallback((result: PhotonResult) => {
    const loc: Location = { label: formatResult(result), coordinates: result.coordinates };
    setOrigin(loc);
    setOriginText(formatResult(result));
    onFlyTo(result.coordinates);

    // If we were in route phase and user picked a new origin, clear route
    if (phase === "route") {
      onClearRoute();
      setDestText("");
      setDestination(null);
    }

    setPhase("destination");
    // Focus destination field after a tick
    setTimeout(() => destRef.current?.focus(), 100);
  }, [onFlyTo, onClearRoute, phase]);

  // Destination selected → calculate route
  const handleDestSelect = useCallback((result: PhotonResult) => {
    const loc: Location = { label: formatResult(result), coordinates: result.coordinates };
    setDestination(loc);
    setDestText(formatResult(result));
  }, []);

  // When destination is selected (coordinates set), auto-calculate route
  useEffect(() => {
    if (origin && destination) {
      setPhase("route");
      onRoute(origin.coordinates, destination.coordinates);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination]);

  // Origin text changes while typing
  const handleOriginChange = useCallback((val: string) => {
    setOriginText(val);

    // If in route/destination phase and user starts typing in origin → reset
    if (phase === "route" || phase === "destination") {
      originEditedRef.current = true;
      // Clear route + destination
      if (phase === "route") {
        onClearRoute();
      }
      setDestText("");
      setDestination(null);
      setOrigin(null);
      setPhase("search");
    }
  }, [phase, onClearRoute]);

  // Destination text changes
  const handleDestChange = useCallback((val: string) => {
    setDestText(val);
    setDestination(null);
  }, []);

  // Enter on origin field → geocode and fly to first result
  const handleOriginEnter = useCallback(async () => {
    if (!originText.trim()) return;
    if (origin) {
      // Already have coordinates, show destination
      setPhase("destination");
      setTimeout(() => destRef.current?.focus(), 100);
      return;
    }
    const result = await originRef.current?.geocode(originText.trim());
    if (result) {
      handleOriginSelect(result);
    }
  }, [originText, origin, handleOriginSelect]);

  // Enter on destination field → geocode and route
  const handleDestEnter = useCallback(async () => {
    if (!destText.trim() || !origin) return;
    if (destination) return; // already routing
    const result = await destRef.current?.geocode(destText.trim());
    if (result) {
      handleDestSelect(result);
    }
  }, [destText, origin, destination, handleDestSelect]);

  // Origin focus during route → prepare to reset
  const handleOriginFocus = useCallback(() => {
    originEditedRef.current = false;
  }, []);

  // Origin blur — if user didn't edit, keep state
  const handleOriginBlur = useCallback(() => {
    // Restore text if user clicked away without editing
    if (!originEditedRef.current && origin && phase === "search") {
      setOriginText(origin.label);
      setPhase(destination ? "route" : "destination");
    }
  }, [origin, destination, phase]);

  const showDest = phase === "destination" || phase === "route";

  return (
    <div className="absolute left-3 top-3 z-10 w-[340px]">
      <div className="rounded-xl border border-black/[0.08] bg-white/95 shadow-lg backdrop-blur-sm">
        {/* Origin row */}
        <div className="flex items-center">
          <div className="flex w-10 shrink-0 items-center justify-center">
            {showDest ? (
              <div className="h-2.5 w-2.5 rounded-full border-2 border-gray-400" />
            ) : (
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            )}
          </div>
          <AutocompleteInput
            ref={originRef}
            placeholder="Buscar lugar..."
            value={originText}
            onChange={handleOriginChange}
            onSelect={handleOriginSelect}
            onClearCoordinates={() => setOrigin(null)}
            onEnter={handleOriginEnter}
            onFocus={handleOriginFocus}
            onBlur={handleOriginBlur}
            mapCenter={mapCenter}
            bare
          />
          {originText && (
            <button
              onClick={() => {
                setOriginText("");
                setOrigin(null);
                setDestText("");
                setDestination(null);
                if (phase === "route") onClearRoute();
                setPhase("search");
              }}
              className="pr-3 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Destination — slides in within the same card */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-out ${
            showDest ? "max-h-24 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {/* Connector: dashed line (left gutter) + horizontal divider */}
          <div className="flex h-3">
            <div className="flex w-10 shrink-0 justify-center">
              <div className="h-full w-px border-l border-dashed border-gray-300" />
            </div>
            <div className="flex flex-1 items-center pr-3">
              <div className="w-full border-t border-gray-100" />
            </div>
          </div>

          {/* Destination row */}
          <div className="flex items-center">
            <div className="flex w-10 shrink-0 items-center justify-center">
              <div className="h-2.5 w-2.5 rounded-sm bg-gray-700" />
            </div>
            <AutocompleteInput
              ref={destRef}
              placeholder="Destino..."
              value={destText}
              onChange={handleDestChange}
              onSelect={handleDestSelect}
              onClearCoordinates={() => setDestination(null)}
              onEnter={handleDestEnter}
              mapCenter={mapCenter}
              bare
            />
            {destText && (
              <button
                onClick={() => {
                  setDestText("");
                  setDestination(null);
                  if (phase === "route") {
                    onClearRoute();
                    setPhase("destination");
                  }
                }}
                className="pr-3 text-gray-400 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Route info — separate card below */}
      {routeInfo && (
        <div className="mt-2 rounded-xl border border-black/[0.08] bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{formatDistance(routeInfo.distance)}</span>
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
            ) : (
              <span className="font-semibold text-gray-800">{formatDuration(routeInfo.duration)}</span>
            )}
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
