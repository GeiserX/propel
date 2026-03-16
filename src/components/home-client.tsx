"use client";

import { useCallback, useRef, useState } from "react";
import type { FuelType } from "@/types/station";
import type { MapRef } from "react-map-gl/maplibre";
import { Navbar } from "@/components/nav/navbar";
import { MapView } from "@/components/map/map-view";
import { SearchPanel } from "@/components/search/search-panel";

interface Props {
  defaultFuel: string;
  center: [number, number];
  zoom: number;
  clusterStations: boolean;
}

interface RouteData {
  geometry: GeoJSON.LineString;
  distance: number;
  duration: number;
  bbox: [number, number, number, number];
}

export function HomeClient({ defaultFuel, center, zoom, clusterStations }: Props) {
  const [selectedFuel, setSelectedFuel] = useState<FuelType>(defaultFuel as FuelType);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const mapRef = useRef<MapRef | null>(null);

  const [mapCenter, setMapCenter] = useState<[number, number]>(center);

  const handleMapMove = useCallback((newCenter: [number, number]) => {
    setMapCenter(newCenter);
  }, []);

  const handleRoute = useCallback(
    async (origin: [number, number], destination: [number, number]) => {
      setIsRouteLoading(true);
      try {
        const res = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, destination }),
        });
        if (!res.ok) return;
        const data: RouteData = await res.json();
        setRouteData(data);

        // Fit map to route bounds
        mapRef.current?.fitBounds(
          [
            [data.bbox[0], data.bbox[1]],
            [data.bbox[2], data.bbox[3]],
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

  const handleClearRoute = useCallback(() => {
    setRouteData(null);
  }, []);

  const handleFlyTo = useCallback((coords: [number, number]) => {
    mapRef.current?.flyTo({ center: coords, zoom: 12, duration: 1500 });
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
          routeGeometry={routeData?.geometry ?? null}
          onMapMove={handleMapMove}
        />
        <SearchPanel
          mapCenter={mapCenter}
          onFlyTo={handleFlyTo}
          onRoute={handleRoute}
          onClearRoute={handleClearRoute}
          routeInfo={routeData ? { distance: routeData.distance, duration: routeData.duration } : null}
          isLoading={isRouteLoading}
        />
      </div>
    </main>
  );
}
