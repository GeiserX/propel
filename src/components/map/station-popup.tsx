"use client";

import { Popup } from "react-map-gl/maplibre";
import type { StationGeoJSON } from "@/types/station";
import { FUEL_TYPE_MAP } from "@/types/fuel";

interface StationPopupProps {
  station: StationGeoJSON;
  onClose: () => void;
}

export function StationPopup({ station, onClose }: StationPopupProps) {
  const { properties, geometry } = station;
  const fuelInfo = FUEL_TYPE_MAP.get(properties.fuelType as Parameters<typeof FUEL_TYPE_MAP.get>[0]);

  return (
    <Popup
      longitude={geometry.coordinates[0]}
      latitude={geometry.coordinates[1]}
      anchor="bottom"
      onClose={onClose}
      closeOnClick={false}
      className="station-popup"
      maxWidth="280px"
    >
      <div className="p-1">
        <h3 className="text-sm font-semibold text-gray-900 leading-tight">
          {properties.name}
        </h3>

        {properties.brand && (
          <p className="mt-0.5 text-xs font-medium text-blue-600">
            {properties.brand}
          </p>
        )}

        <p className="mt-1 text-xs text-gray-500 leading-snug">
          {properties.address}
        </p>
        <p className="text-xs text-gray-500">
          {properties.city}
        </p>

        {properties.price != null && (
          <div className="mt-2 flex items-baseline gap-1.5 rounded-md bg-gray-50 px-2 py-1.5">
            <span className="text-lg font-bold text-gray-900">
              {properties.price.toFixed(3)}
            </span>
            <span className="text-xs text-gray-500">
              {properties.currency}/{fuelInfo?.label ?? properties.fuelType}
            </span>
          </div>
        )}
      </div>
    </Popup>
  );
}
