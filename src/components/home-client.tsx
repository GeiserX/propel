"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FuelType, StationsGeoJSONCollection } from "@/types/station";
import type { MapRef } from "react-map-gl/maplibre";
import type { Route } from "@/components/map/route-layer";
import { Navbar } from "@/components/nav/navbar";
import { MapView } from "@/components/map/map-view";
import { SearchPanel } from "@/components/search/search-panel";

interface Props {
  defaultFuel: string;
  center: [number, number];
  zoom: number;
  clusterStations: boolean;
}

interface RouteState {
  routes: Route[];
  primaryIndex: number;
}

export function HomeClient({ defaultFuel, center, zoom, clusterStations }: Props) {
  const [selectedFuel, setSelectedFuel] = useState<FuelType>(defaultFuel as FuelType);
  const [routeState, setRouteState] = useState<RouteState | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [primaryStations, setPrimaryStations] = useState<StationsGeoJSONCollection>({ type: "FeatureCollection", features: [] });
  const mapRef = useRef<MapRef | null>(null);

  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  // Reset price filter when fuel type changes
  useEffect(() => { setMaxPrice(null); }, [selectedFuel]);

  const handleMapMove = useCallback((newCenter: [number, number]) => {
    setMapCenter(newCenter);
  }, []);

  const handleRoute = useCallback(
    async (origin: [number, number], destination: [number, number], waypoints?: [number, number][]) => {
      setIsRouteLoading(true);
      try {
        const res = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, destination, waypoints }),
        });
        if (!res.ok) return;
        const data: { routes: Route[] } = await res.json();
        if (data.routes.length === 0) return;

        setRouteState({ routes: data.routes, primaryIndex: 0 });

        // Fit map to primary route bounds
        const primary = data.routes[0];
        mapRef.current?.fitBounds(
          [
            [primary.bbox[0], primary.bbox[1]],
            [primary.bbox[2], primary.bbox[3]],
          ],
          { padding: 60, duration: 1000 },
        );
      } catch (err) {
        console.error("Route calculation failed:", err);
      } finally {
        setIsRouteLoading(false);
      }
    },
    [],
  );

  const handleSelectRoute = useCallback((index: number) => {
    setRouteState((prev) => {
      if (!prev) return prev;
      const route = prev.routes[index];
      if (!route) return prev;

      // Fit map to newly selected route
      mapRef.current?.fitBounds(
        [
          [route.bbox[0], route.bbox[1]],
          [route.bbox[2], route.bbox[3]],
        ],
        { padding: 60, duration: 800 },
      );

      return { ...prev, primaryIndex: index };
    });
  }, []);

  const handleClearRoute = useCallback(() => {
    setRouteState(null);
    setPrimaryStations({ type: "FeatureCollection", features: [] });
  }, []);

  const handleFlyTo = useCallback((coords: [number, number], stationId?: string) => {
    mapRef.current?.flyTo({ center: coords, zoom: 14, duration: 1500 });
    if (stationId) setSelectedStationId(stationId);
  }, []);

  const handlePrimaryStationsChange = useCallback((stations: StationsGeoJSONCollection) => {
    setPrimaryStations(stations);
  }, []);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden">
      <Navbar selectedFuel={selectedFuel} onFuelChange={setSelectedFuel} />
      <div className="relative flex-1">
        <MapView
          ref={mapRef}
          selectedFuel={selectedFuel}
          center={center}
          zoom={zoom}
          clusterStations={clusterStations}
          routes={routeState?.routes ?? null}
          primaryRouteIndex={routeState?.primaryIndex ?? 0}
          selectedStationId={selectedStationId}
          onSelectStation={setSelectedStationId}
          maxPrice={maxPrice}
          onMaxPriceChange={setMaxPrice}
          onMapMove={handleMapMove}
          onSelectRoute={handleSelectRoute}
          onPrimaryStationsChange={handlePrimaryStationsChange}
        />
        <SearchPanel
          mapCenter={mapCenter}
          onFlyTo={handleFlyTo}
          onRoute={handleRoute}
          onClearRoute={handleClearRoute}
          onSelectRoute={handleSelectRoute}
          routes={routeState?.routes ?? null}
          primaryRouteIndex={routeState?.primaryIndex ?? 0}
          isLoading={isRouteLoading}
          primaryStations={primaryStations}
          maxPrice={maxPrice}
        />
      </div>
    </main>
  );
}
