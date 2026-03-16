"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Source, Layer, useMap } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { ExpressionSpecification } from "maplibre-gl";
import type { StationsGeoJSONCollection } from "@/types/station";
import { StationPopup } from "./station-popup";
import { PRICE_COLORS } from "./price-legend";

const INTERACTIVE_LAYERS = [/* "clusters", */ "unclustered-point"] as const;

interface StationLayerProps {
  stations: StationsGeoJSONCollection;
  onPriceRange?: (min: number | null, max: number | null) => void;
}

export function StationLayer({ stations, onPriceRange }: StationLayerProps) {
  const { current: mapRef } = useMap();
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  const popup = useMemo(() => {
    if (!selectedStationId) return null;
    return stations.features.find((f) => f.properties.id === selectedStationId) ?? null;
  }, [selectedStationId, stations]);

  // Compute min/max price from visible stations
  // Compute P5/P95 percentile range for meaningful color spread
  const { min, max } = useMemo(() => {
    const prices: number[] = [];
    for (const f of stations.features) {
      const p = f.properties.price;
      if (p != null) prices.push(p);
    }
    if (prices.length === 0) return { min: null, max: null };

    prices.sort((a, b) => a - b);
    const p5 = prices[Math.floor(prices.length * 0.05)];
    const p95 = prices[Math.ceil(prices.length * 0.95) - 1];

    // If percentile range is too tight (< 0.02€), widen it slightly
    if (p95 - p5 < 0.02) {
      const mid = (p5 + p95) / 2;
      return { min: mid - 0.01, max: mid + 0.01 };
    }
    return { min: p5, max: p95 };
  }, [stations]);

  // Report percentile range to parent for the unified price panel
  useEffect(() => {
    onPriceRange?.(min, max);
  }, [min, max, onPriceRange]);

  // Build dynamic color interpolation expression using percentile range
  const circleColor = useMemo((): ExpressionSpecification => {
    if (min == null || max == null) {
      return ["case", ["!", ["has", "price"]], "#9ca3af", PRICE_COLORS[3]] as ExpressionSpecification;
    }

    const stops: (string | number)[] = [];
    for (let i = 0; i < PRICE_COLORS.length; i++) {
      const price = min + (i / (PRICE_COLORS.length - 1)) * (max - min);
      stops.push(price, PRICE_COLORS[i]);
    }

    return [
      "case",
      ["!", ["has", "price"]],
      "#9ca3af",
      ["interpolate", ["linear"], ["get", "price"], ...stops],
    ] as ExpressionSpecification;
  }, [min, max]);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0 || !mapRef) return;
      const feature = e.features[0];

      // Clustering disabled — click always opens station popup
      const props = feature.properties as Record<string, unknown>;
      setSelectedStationId(String(props.id ?? ""));
    },
    [mapRef],
  );

  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();

    const handler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      handleClick(e as MapLayerMouseEvent);
    };

    for (const layerId of INTERACTIVE_LAYERS) {
      map.on("click", layerId, handler);
    }

    const setCursor = () => { map.getCanvas().style.cursor = "pointer"; };
    const resetCursor = () => { map.getCanvas().style.cursor = ""; };
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
    setSelectedStationId(null);
  }, []);

  return (
    <>
      <Source
        id="stations"
        type="geojson"
        data={stations}
        /* cluster={true}
        clusterMaxZoom={12}
        clusterRadius={50} */
      >
        {/* Clustering disabled — all individual station points */}
        <Layer
          id="unclustered-point"
          type="circle"
          paint={{
            "circle-color": circleColor,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              6, 4,
              10, 6,
              14, 8,
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
