"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Map from "react-map-gl/maplibre";
import type { MapRef, ViewStateChangeEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import type { FuelType, StationsGeoJSONCollection } from "@/types/station";
import { StationLayer } from "./station-layer";
import { GeolocateButton } from "./geolocate-button";
import { PriceFilter } from "./price-filter";
import { RouteLayer } from "./route-layer";

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
  clusterStations: boolean;
  routeGeometry: GeoJSON.LineString | null;
  onMapMove?: (center: [number, number]) => void;
}

export const MapView = forwardRef<MapRef, MapViewProps>(function MapView(
  { selectedFuel, center, zoom, clusterStations, routeGeometry, onMapMove },
  ref,
) {
  const mapRef = useRef<MapRef | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useImperativeHandle(ref, () => mapRef.current!, []);

  const [stations, setStations] = useState<StationsGeoJSONCollection>(EMPTY_COLLECTION);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [legendRange, setLegendRange] = useState<{ min: number | null; max: number | null }>({ min: null, max: null });

  const handlePriceRange = useCallback((min: number | null, max: number | null) => {
    setLegendRange({ min, max });
  }, []);

  const filteredStations: StationsGeoJSONCollection = maxPrice != null
    ? {
        type: "FeatureCollection",
        features: stations.features.filter(
          (f) => f.properties.price != null && f.properties.price <= maxPrice,
        ),
      }
    : stations;

  // Fetch corridor stations when route is active
  const fetchRouteStations = useCallback(
    async (fuel: FuelType, geometry: GeoJSON.LineString) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/route-stations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geometry, fuel }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data: StationsGeoJSONCollection = await res.json();
        setStations(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to fetch route stations:", err);
      }
    },
    [],
  );

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
    (_e: ViewStateChangeEvent) => {
      // Only fetch bbox stations when no route is active
      if (!routeGeometry) {
        debouncedFetch(selectedFuel);
      }
      // Report center for geo-biased autocomplete
      const map = mapRef.current;
      if (map) {
        const c = map.getCenter();
        onMapMove?.([c.lng, c.lat]);
      }
    },
    [debouncedFetch, selectedFuel, routeGeometry, onMapMove],
  );

  const handleLoad = useCallback(() => {
    // Auto-geolocate on first load — fly to user location if allowed
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          mapRef.current?.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 12,
            duration: 1500,
          });
          // flyTo triggers moveEnd which fetches stations
        },
        () => {
          // Denied or error — fetch stations at default view
          fetchStations(selectedFuel);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    } else {
      fetchStations(selectedFuel);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchStations]);

  // When route is active, fetch corridor stations; otherwise bbox stations
  useEffect(() => {
    if (routeGeometry) {
      fetchRouteStations(selectedFuel, routeGeometry);
    } else {
      fetchStations(selectedFuel);
    }
  }, [fetchStations, fetchRouteStations, selectedFuel, routeGeometry]);

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
      interactiveLayerIds={clusterStations ? ["clusters", "unclustered-point"] : ["unclustered-point"]}
      attributionControl={{ compact: true }}
      style={{ width: "100%", height: "100%" }}
    >
      {routeGeometry && <RouteLayer geometry={routeGeometry} />}
      <StationLayer stations={filteredStations} onPriceRange={handlePriceRange} cluster={clusterStations} />
      <GeolocateButton onGeolocate={handleGeolocate} />
      <PriceFilter
        stations={stations}
        maxPrice={maxPrice}
        onMaxPriceChange={setMaxPrice}
        legendMin={legendRange.min}
        legendMax={legendRange.max}
      />
    </Map>
  );
});
