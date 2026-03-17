"use client";

import { Popup } from "react-map-gl/maplibre";
import type { StationGeoJSON } from "@/types/station";
import { FUEL_TYPE_MAP } from "@/types/fuel";
import { useI18n } from "@/lib/i18n";

interface StationPopupProps {
  station: StationGeoJSON;
  onClose: () => void;
}

function timeAgo(iso: string, t: (key: string) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("popup.updatedNow");
  if (mins < 60) return `${t("popup.updated")} ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${t("popup.updated")} ${hours}h`;
  const days = Math.floor(hours / 24);
  return `${t("popup.updated")} ${days}d`;
}

export function StationPopup({ station, onClose }: StationPopupProps) {
  const { t } = useI18n();
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
                  · {timeAgo(properties.reportedAt, t)}
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2.5 text-center">
            <span className="text-[11px] text-gray-400">
              {t("popup.noPrice")} {fuelInfo?.label ?? properties.fuelType}
            </span>
          </div>
        )}

        {/* Navigate button */}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${geometry.coordinates[1]},${geometry.coordinates[0]}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-blue-600"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
          </svg>
          {t("popup.navigate")}
        </a>
      </div>
    </Popup>
  );
}
