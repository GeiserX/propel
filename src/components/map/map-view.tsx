"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Map from "react-map-gl/maplibre";
import type { MapRef, ViewStateChangeEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import type { FuelType, StationsGeoJSONCollection } from "@/types/station";
import { StationLayer } from "./station-layer";
import { GeolocateButton } from "./geolocate-button";
import { PriceFilter } from "./price-filter";

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const DEBOUNCE_MS = 300;
const MIN_ZOOM_FOR_FETCH = 5;

const EMPTY_COLLECTION: StationsGeoJSONCollection = {
  type: "FeatureCollection",
  features: [],
};

interface MapViewProps {
  selectedFuel: FuelType;
  center: [number, number];
  zoom: number;
}

export function MapView({ selectedFuel, center, zoom }: MapViewProps) {
  const mapRef = useRef<MapRef | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [stations, setStations] = useState<StationsGeoJSONCollection>(EMPTY_COLLECTION);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  const filteredStations: StationsGeoJSONCollection = maxPrice != null
    ? {
        type: "FeatureCollection",
        features: stations.features.filter(
          (f) => f.properties.price != null && f.properties.price <= maxPrice,
        ),
      }
    : stations;

  const fetchStations = useCallback(
    async (fuel: FuelType) => {
      const map = mapRef.current;
      if (!map) return;

      const z = map.getZoom();
      if (z < MIN_ZOOM_FOR_FETCH) {
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

      if (abortRef.current) abortRef.current.abort();
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchStations(fuel), DEBOUNCE_MS);
    },
    [fetchStations],
  );

  const handleMoveEnd = useCallback(
    (_e: ViewStateChangeEvent) => debouncedFetch(selectedFuel),
    [debouncedFetch, selectedFuel],
  );

  const handleLoad = useCallback(() => {
    fetchStations(selectedFuel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchStations]);

  useEffect(() => {
    fetchStations(selectedFuel);
  }, [fetchStations, selectedFuel]);

  // Reset price filter when fuel type changes
  useEffect(() => {
    setMaxPrice(null);
  }, [selectedFuel]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleGeolocate = useCallback((lon: number, lat: number) => {
    mapRef.current?.flyTo({ center: [lon, lat], zoom: 12, duration: 1500 });
  }, []);

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        longitude: center[0],
        latitude: center[1],
        zoom,
      }}
      mapStyle={OPENFREEMAP_STYLE}
      onLoad={handleLoad}
      onMoveEnd={handleMoveEnd}
      interactiveLayerIds={["clusters", "unclustered-point"]}
      attributionControl={{ compact: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <StationLayer stations={filteredStations} />
      <GeolocateButton onGeolocate={handleGeolocate} />
      <PriceFilter stations={stations} maxPrice={maxPrice} onMaxPriceChange={setMaxPrice} />
    </Map>
  );
}
