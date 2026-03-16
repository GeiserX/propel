"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotonResult } from "@/lib/photon";
import type { Route } from "@/components/map/route-layer";
import type { StationsGeoJSONCollection } from "@/types/station";
import { AutocompleteInput, type AutocompleteRef } from "./autocomplete-input";

type Phase = "search" | "destination" | "route";

const ALT_COLORS = ["#8b5cf6", "#14b8a6", "#f59e0b"];
const MAX_WAYPOINTS = 5;

interface SearchPanelProps {
  mapCenter: [number, number];
  onFlyTo: (coords: [number, number]) => void;
  onRoute: (origin: [number, number], destination: [number, number], waypoints?: [number, number][]) => void;
  onClearRoute: () => void;
  onSelectRoute?: (index: number) => void;
  routes: Route[] | null;
  primaryRouteIndex: number;
  isLoading: boolean;
  primaryStations?: StationsGeoJSONCollection;
}

interface Location {
  label: string;
  coordinates: [number, number];
}

let waypointIdCounter = 0;

interface WaypointEntry {
  id: number;
  text: string;
  location: Location | null;
}

export function SearchPanel({
  mapCenter,
  onFlyTo,
  onRoute,
  onClearRoute,
  onSelectRoute,
  routes,
  primaryRouteIndex,
  isLoading,
  primaryStations,
}: SearchPanelProps) {
  const [phase, setPhase] = useState<Phase>("search");
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [origin, setOrigin] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [waypoints, setWaypoints] = useState<WaypointEntry[]>([]);
  const originRef = useRef<AutocompleteRef>(null);
  const destRef = useRef<AutocompleteRef>(null);
  const waypointRefs = useRef<Map<number, AutocompleteRef>>(new Map());
  const originEditedRef = useRef(false);

  const primaryRoute = routes?.[primaryRouteIndex] ?? null;

  // Calculate route with current state
  const calculateRoute = useCallback(
    (o: Location, d: Location, wps: WaypointEntry[]) => {
      const wpCoords = wps
        .filter((wp) => wp.location != null)
        .map((wp) => wp.location!.coordinates);
      onRoute(o.coordinates, d.coordinates, wpCoords.length > 0 ? wpCoords : undefined);
    },
    [onRoute],
  );

  // Origin selected
  const handleOriginSelect = useCallback(
    (result: PhotonResult) => {
      const loc: Location = { label: formatResult(result), coordinates: result.coordinates };
      setOrigin(loc);
      setOriginText(formatResult(result));
      onFlyTo(result.coordinates);

      if (phase === "route") {
        onClearRoute();
        setDestText("");
        setDestination(null);
        setWaypoints([]);
      }

      setPhase("destination");
      setTimeout(() => destRef.current?.focus(), 100);
    },
    [onFlyTo, onClearRoute, phase],
  );

  // Destination selected → auto-calculate route
  const handleDestSelect = useCallback(
    (result: PhotonResult) => {
      const loc: Location = { label: formatResult(result), coordinates: result.coordinates };
      setDestination(loc);
      setDestText(formatResult(result));

      if (origin) {
        setPhase("route");
        calculateRoute(origin, loc, waypoints);
      }
    },
    [origin, waypoints, calculateRoute],
  );

  // Waypoint selected → recalculate if route active
  const handleWaypointSelect = useCallback(
    (wpId: number, result: PhotonResult) => {
      const loc: Location = { label: formatResult(result), coordinates: result.coordinates };
      setWaypoints((prev) => {
        const updated = prev.map((wp) => (wp.id === wpId ? { ...wp, text: formatResult(result), location: loc } : wp));
        if (origin && destination) {
          calculateRoute(origin, destination, updated);
        }
        return updated;
      });
    },
    [origin, destination, calculateRoute],
  );

  const handleOriginChange = useCallback(
    (val: string) => {
      setOriginText(val);
      if (phase === "route" || phase === "destination") {
        originEditedRef.current = true;
        if (phase === "route") onClearRoute();
        setDestText("");
        setDestination(null);
        setOrigin(null);
        setWaypoints([]);
        setPhase("search");
      }
    },
    [phase, onClearRoute],
  );

  const handleDestChange = useCallback(
    (val: string) => {
      setDestText(val);
      setDestination(null);
    },
    [],
  );

  const handleWaypointChange = useCallback((wpId: number, val: string) => {
    setWaypoints((prev) => prev.map((wp) => (wp.id === wpId ? { ...wp, text: val, location: null } : wp)));
  }, []);

  const handleOriginEnter = useCallback(async () => {
    if (!originText.trim()) return;
    if (origin) {
      setPhase("destination");
      setTimeout(() => destRef.current?.focus(), 100);
      return;
    }
    const result = await originRef.current?.geocode(originText.trim());
    if (result) handleOriginSelect(result);
  }, [originText, origin, handleOriginSelect]);

  const handleDestEnter = useCallback(async () => {
    if (!destText.trim() || !origin) return;
    if (destination) return;
    const result = await destRef.current?.geocode(destText.trim());
    if (result) handleDestSelect(result);
  }, [destText, origin, destination, handleDestSelect]);

  const handleWaypointEnter = useCallback(
    async (wpId: number) => {
      const wp = waypoints.find((w) => w.id === wpId);
      if (!wp || !wp.text.trim()) return;
      const ref = waypointRefs.current.get(wpId);
      const result = await ref?.geocode(wp.text.trim());
      if (result) handleWaypointSelect(wpId, result);
    },
    [waypoints, handleWaypointSelect],
  );

  const handleOriginFocus = useCallback(() => {
    originEditedRef.current = false;
  }, []);

  const handleOriginBlur = useCallback(() => {
    if (!originEditedRef.current && origin && phase === "search") {
      setOriginText(origin.label);
      setPhase(destination ? "route" : "destination");
    }
  }, [origin, destination, phase]);

  // Swap origin ↔ destination
  const handleSwap = useCallback(() => {
    const oldOrigin = origin;
    const oldOriginText = originText;
    const oldDest = destination;
    const oldDestText = destText;

    setOrigin(oldDest);
    setOriginText(oldDestText);
    setDestination(oldOrigin);
    setDestText(oldOriginText);

    // Reverse waypoints
    setWaypoints((prev) => [...prev].reverse());

    // Recalculate if both endpoints exist
    if (oldDest && oldOrigin) {
      calculateRoute(oldDest, oldOrigin, [...waypoints].reverse());
    }
  }, [origin, originText, destination, destText, waypoints, calculateRoute]);

  // Add waypoint
  const addWaypoint = useCallback(() => {
    if (waypoints.length >= MAX_WAYPOINTS) return;
    const id = ++waypointIdCounter;
    setWaypoints((prev) => [...prev, { id, text: "", location: null }]);
    setTimeout(() => waypointRefs.current.get(id)?.focus(), 100);
  }, [waypoints.length]);

  // Remove waypoint
  const removeWaypoint = useCallback(
    (wpId: number) => {
      setWaypoints((prev) => {
        const updated = prev.filter((wp) => wp.id !== wpId);
        if (origin && destination && phase === "route") {
          calculateRoute(origin, destination, updated);
        }
        return updated;
      });
    },
    [origin, destination, phase, calculateRoute],
  );

  const showDest = phase === "destination" || phase === "route";

  const [destVisible, setDestVisible] = useState(false);
  useEffect(() => {
    if (showDest) {
      const t = setTimeout(() => setDestVisible(true), 300);
      return () => clearTimeout(t);
    }
    setDestVisible(false);
  }, [showDest]);

  // Station list: sorted by routeFraction, only those with price
  const stationList = primaryStations?.features
    .filter((f) => f.properties.routeFraction != null && f.properties.price != null)
    .sort((a, b) => (a.properties.routeFraction ?? 0) - (b.properties.routeFraction ?? 0))
    ?? [];

  return (
    <div className="absolute left-3 top-3 z-10 w-[340px]">
      {/* Search card */}
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
                setWaypoints([]);
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

        {/* Destination + waypoints — slides in */}
        <div
          className={`transition-all duration-300 ease-out ${
            showDest ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
          } ${destVisible ? "overflow-visible" : "overflow-hidden"}`}
        >
          {/* Waypoints (between origin and destination) */}
          {waypoints.map((wp, idx) => (
            <div key={wp.id}>
              {/* Connector */}
              <div className="flex h-3">
                <div className="flex w-10 shrink-0 justify-center">
                  <div className="h-full w-px border-l border-dashed border-gray-300" />
                </div>
                <div className="flex flex-1 items-center pr-3">
                  <div className="w-full border-t border-gray-100" />
                </div>
              </div>
              {/* Waypoint row */}
              <div className="flex items-center">
                <div className="flex w-10 shrink-0 items-center justify-center">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-600">
                    {idx + 1}
                  </div>
                </div>
                <AutocompleteInput
                  ref={(el) => {
                    if (el) waypointRefs.current.set(wp.id, el);
                    else waypointRefs.current.delete(wp.id);
                  }}
                  placeholder="Parada intermedia..."
                  value={wp.text}
                  onChange={(val) => handleWaypointChange(wp.id, val)}
                  onSelect={(result) => handleWaypointSelect(wp.id, result)}
                  onEnter={() => handleWaypointEnter(wp.id)}
                  mapCenter={mapCenter}
                  bare
                />
                <button
                  onClick={() => removeWaypoint(wp.id)}
                  className="pr-3 text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {/* Connector before destination */}
          <div className="relative flex h-3">
            <div className="flex w-10 shrink-0 justify-center">
              <div className="h-full w-px border-l border-dashed border-gray-300" />
            </div>
            <div className="flex flex-1 items-center pr-3">
              <div className="w-full border-t border-gray-100" />
            </div>
            {/* Swap button */}
            {origin && destination && (
              <button
                onClick={handleSwap}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white p-1 shadow-sm hover:bg-gray-50"
                title="Intercambiar origen y destino"
              >
                <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                </svg>
              </button>
            )}
          </div>

          {/* Destination row */}
          <div className="flex items-center">
            <div className="flex w-10 shrink-0 items-center justify-center">
              <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
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

          {/* Add waypoint button */}
          {showDest && waypoints.length < MAX_WAYPOINTS && (
            <div className="flex items-center border-t border-gray-100">
              <button
                onClick={addWaypoint}
                className="flex w-full items-center gap-2 px-4 py-1.5 text-xs text-gray-400 hover:text-gray-600"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Añadir parada
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Route info + alternatives */}
      {primaryRoute && (
        <div className="mt-2 rounded-xl border border-black/[0.08] bg-white/95 shadow-lg backdrop-blur-sm">
          {/* Primary route */}
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-gray-500">{formatDistance(primaryRoute.distance)}</span>
            </div>
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
            ) : (
              <span className="text-sm font-semibold text-gray-800">{formatDuration(primaryRoute.duration)}</span>
            )}
          </div>

          {/* Alternative routes */}
          {routes && routes.length > 1 && routes.map((route, i) => {
            if (i === primaryRouteIndex) return null;
            const color = ALT_COLORS[i % ALT_COLORS.length];
            return (
              <button
                key={i}
                onClick={() => onSelectRoute?.(i)}
                className="flex w-full items-center justify-between border-t border-gray-100 px-4 py-2 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-gray-400">{formatDistance(route.distance)}</span>
                </div>
                <span className="text-sm text-gray-500">{formatDuration(route.duration)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Station list along route */}
      {phase === "route" && stationList.length > 0 && (
        <div className="mt-2 rounded-xl border border-black/[0.08] bg-white/95 shadow-lg backdrop-blur-sm">
          <div className="border-b border-gray-100 px-4 py-2">
            <span className="text-xs font-medium text-gray-500">
              Estaciones en ruta ({stationList.length})
            </span>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {stationList.map((station) => {
              const km = primaryRoute
                ? (station.properties.routeFraction ?? 0) * primaryRoute.distance
                : 0;
              return (
                <button
                  key={station.properties.id}
                  onClick={() => onFlyTo(station.geometry.coordinates)}
                  className="flex w-full items-center justify-between border-b border-gray-50 px-4 py-2 text-left hover:bg-gray-50 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    {station.properties.brand && (
                      <span className="text-xs font-semibold text-gray-700">{station.properties.brand}</span>
                    )}
                    <p className="truncate text-xs text-gray-500">{station.properties.name}</p>
                  </div>
                  <div className="ml-3 shrink-0 text-right">
                    {station.properties.price != null && (
                      <span className="text-sm font-semibold text-gray-800">
                        {station.properties.price.toFixed(3)} {station.properties.currency}
                      </span>
                    )}
                    <p className="text-[10px] text-gray-400">km {km.toFixed(0)}</p>
                  </div>
                </button>
              );
            })}
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
