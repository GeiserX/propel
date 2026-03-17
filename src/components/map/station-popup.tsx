"use client";

import { Popup } from "react-map-gl/maplibre";
import type { StationGeoJSON } from "@/types/station";
import { FUEL_TYPE_MAP } from "@/types/fuel";

interface StationPopupProps {
  station: StationGeoJSON;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Actualizado ahora";
  if (mins < 60) return `Actualizado hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Actualizado hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Actualizado hace ${days}d`;
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
      maxWidth="260px"
    >
      <div className="px-3 pt-2.5 pb-2">
        {/* Brand — primary heading */}
        {properties.brand && (
          <p className="text-[13px] font-bold text-gray-900 leading-tight">
            {properties.brand}
          </p>
        )}

        {/* Address + city */}
        <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">
          {properties.address}
        </p>
        <p className="text-[11px] text-gray-400">
          {properties.city}
        </p>

        {/* Price block */}
        {properties.price != null ? (
          <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
            <div className="flex items-baseline gap-1">
              <span className="text-[22px] font-bold tabular-nums leading-none text-gray-900">
                {properties.price.toFixed(3)}
              </span>
              <span className="text-[11px] font-medium text-gray-500">
                {{ EUR: "€", GBP: "£", RON: "lei", PLN: "zł", HUF: "Ft", CZK: "Kč" }[properties.currency] ?? properties.currency}/L
              </span>
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
              {fuelInfo?.label ?? properties.fuelType}
              {properties.reportedAt && (
                <span className="ml-1.5 text-gray-400/70">
                  · {timeAgo(properties.reportedAt)}
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2.5 text-center">
            <span className="text-[11px] text-gray-400">
              Sin precio para {fuelInfo?.label ?? properties.fuelType}
            </span>
          </div>
        )}
      </div>
    </Popup>
  );
}
