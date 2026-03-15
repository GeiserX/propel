"use client";

import { Source, Layer } from "react-map-gl/maplibre";

interface RouteLayerProps {
  geometry: GeoJSON.LineString;
}

export function RouteLayer({ geometry }: RouteLayerProps) {
  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    geometry,
    properties: {},
  };

  return (
    <Source id="route" type="geojson" data={geojson}>
      {/* Route outline (white border for visibility) */}
      <Layer
        id="route-outline"
        type="line"
        paint={{
          "line-color": "#ffffff",
          "line-width": 7,
          "line-opacity": 0.8,
        }}
        layout={{
          "line-cap": "round",
          "line-join": "round",
        }}
      />
      {/* Route fill (blue) */}
      <Layer
        id="route-fill"
        type="line"
        paint={{
          "line-color": "#3b82f6",
          "line-width": 4,
          "line-opacity": 0.9,
        }}
        layout={{
          "line-cap": "round",
          "line-join": "round",
        }}
      />
    </Source>
  );
}
