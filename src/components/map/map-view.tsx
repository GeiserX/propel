"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map from "react-map-gl/maplibre";
import type { MapRef, ViewStateChangeEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import type { FuelType, StationsGeoJSONCollection } from "@/types/station";
import { FuelSelector } from "./fuel-selector";
import { StationLayer } from "./station-layer";

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_CENTER = { longitude: -3.7, latitude: 40.4 };
const DEFAULT_ZOOM = 6;
const DEBOUNCE_MS = 300;
const MIN_ZOOM_FOR_FETCH = 7;

const EMPTY_COLLECTION: StationsGeoJSONCollection = {
  type: "FeatureCollection",
  features: [],
};

export function MapView() {
  const mapRef = useRef<MapRef | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [selectedFuel, setSelectedFuel] = useState<FuelType>("B7");
  const [stations, setStations] = useState<StationsGeoJSONCollection>(EMPTY_COLLECTION);

  const fetchStations = useCallback(
    async (fuel: FuelType) => {
      const map = mapRef.current;
      if (!map) return;

      const zoom = map.getZoom();
      if (zoom < MIN_ZOOM_FOR_FETCH) {
        setStations(EMPTY_COLLECTION);
        return;
      }

      const bounds = map.getBounds();
      if (!bounds) return;

      const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ].join(",");

      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const url = `/api/stations?bbox=${bbox}&fuel=${fuel}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const data: StationsGeoJSONCollection = await res.json();
        setStations(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to fetch stations:", err);
      }
    },
    [],
  );

  const debouncedFetch = useCallback(
    (fuel: FuelType) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        fetchStations(fuel);
      }, DEBOUNCE_MS);
    },
    [fetchStations],
  );

  const handleMoveEnd = useCallback(
    (_e: ViewStateChangeEvent) => {
      debouncedFetch(selectedFuel);
    },
    [debouncedFetch, selectedFuel],
  );

  const handleFuelChange = useCallback(
    (fuel: FuelType) => {
      setSelectedFuel(fuel);
      fetchStations(fuel);
    },
    [fetchStations],
  );

  // Fetch on initial load once the map is ready
  useEffect(() => {
    fetchStations(selectedFuel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: DEFAULT_CENTER.longitude,
          latitude: DEFAULT_CENTER.latitude,
          zoom: DEFAULT_ZOOM,
        }}
        mapStyle={OPENFREEMAP_STYLE}
        onMoveEnd={handleMoveEnd}
        interactiveLayerIds={["clusters", "unclustered-point"]}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <FuelSelector
          selectedFuel={selectedFuel}
          onFuelChange={handleFuelChange}
        />
        <StationLayer stations={stations} />
      </Map>
    </div>
  );
}
