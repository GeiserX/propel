"use client";

import { useCallback, useEffect, useState } from "react";
import { Source, Layer, useMap } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type { StationsGeoJSONCollection, StationGeoJSON } from "@/types/station";
import { StationPopup } from "./station-popup";

const INTERACTIVE_LAYERS = ["clusters", "unclustered-point"] as const;

interface StationLayerProps {
  stations: StationsGeoJSONCollection;
}

export function StationLayer({ stations }: StationLayerProps) {
  const { current: mapRef } = useMap();
  const [popup, setPopup] = useState<StationGeoJSON | null>(null);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0 || !mapRef) return;
      const feature = e.features[0];

      // Handle cluster click: zoom into it
      if (feature.properties?.cluster) {
        const source = mapRef.getSource("stations") as GeoJSONSource | undefined;
        if (!source) return;
        const clusterId = feature.properties.cluster_id as number;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geometry = feature.geometry as GeoJSON.Point;
          mapRef.easeTo({
            center: [geometry.coordinates[0], geometry.coordinates[1]],
            zoom: zoom + 1,
          });
        });
        return;
      }

      // Handle unclustered point click: show popup
      const geometry = feature.geometry as GeoJSON.Point;
      const props = feature.properties as Record<string, unknown>;
      setPopup({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [geometry.coordinates[0], geometry.coordinates[1]],
        },
        properties: {
          id: String(props.id ?? ""),
          name: String(props.name ?? ""),
          brand: props.brand ? String(props.brand) : null,
          address: String(props.address ?? ""),
          city: String(props.city ?? ""),
          price: props.price != null ? Number(props.price) : null,
          fuelType: String(props.fuelType ?? ""),
          currency: String(props.currency ?? ""),
        },
      });
    },
    [mapRef],
  );

  // Register click handlers on the interactive layers via the map instance
  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();

    const handler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      handleClick(e as MapLayerMouseEvent);
    };

    for (const layerId of INTERACTIVE_LAYERS) {
      map.on("click", layerId, handler);
    }

    // Pointer cursor on hover over interactive layers
    const setCursor = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const resetCursor = () => {
      map.getCanvas().style.cursor = "";
    };
    for (const layerId of INTERACTIVE_LAYERS) {
      map.on("mouseenter", layerId, setCursor);
      map.on("mouseleave", layerId, resetCursor);
    }

    return () => {
      for (const layerId of INTERACTIVE_LAYERS) {
        map.off("click", layerId, handler);
        map.off("mouseenter", layerId, setCursor);
        map.off("mouseleave", layerId, resetCursor);
      }
    };
  }, [mapRef, handleClick]);

  const handleClosePopup = useCallback(() => {
    setPopup(null);
  }, []);

  return (
    <>
      <Source
        id="stations"
        type="geojson"
        data={stations}
        cluster={true}
        clusterMaxZoom={14}
        clusterRadius={50}
      >
        {/* Cluster circles */}
        <Layer
          id="clusters"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#60a5fa", // blue-400 for small clusters
              20,
              "#3b82f6", // blue-500 for medium
              100,
              "#2563eb", // blue-600 for large
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              18,
              20,
              24,
              100,
              30,
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          }}
        />

        {/* Cluster count labels */}
        <Layer
          id="cluster-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
          }}
          paint={{
            "text-color": "#ffffff",
          }}
        />

        {/* Unclustered station points, color-coded by price */}
        <Layer
          id="unclustered-point"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": [
              "case",
              // Null/missing price: gray
              ["!", ["has", "price"]],
              "#9ca3af",
              ["==", ["typeof", ["get", "price"]], "string"],
              "#9ca3af",
              // Price-based color: green (cheap) -> yellow (mid) -> red (expensive)
              [
                "interpolate",
                ["linear"],
                ["get", "price"],
                0.8,
                "#22c55e", // green-500: cheapest
                1.2,
                "#22c55e", // green-500: still cheap
                1.5,
                "#eab308", // yellow-500: mid-range
                1.8,
                "#ef4444", // red-500: expensive
                2.5,
                "#ef4444", // red-500: very expensive
              ],
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              6,
              4,
              10,
              6,
              14,
              8,
            ],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#ffffff",
          }}
        />
      </Source>

      {popup && (
        <StationPopup station={popup} onClose={handleClosePopup} />
      )}
    </>
  );
}
