"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/lib/i18n";

type GeoState = "idle" | "loading" | "denied";

interface GeolocateButtonProps {
  onGeolocate: (lon: number, lat: number) => void;
}

export function GeolocateButton({ onGeolocate }: GeolocateButtonProps) {
  const { t } = useI18n();
  const [state, setState] = useState<GeoState>("idle");

  const handleClick = useCallback(() => {
    if (!navigator.geolocation) {
      setState("denied");
      return;
    }

    setState("loading");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState("idle");
        onGeolocate(pos.coords.longitude, pos.coords.latitude);
      },
      () => {
        setState("denied");
        setTimeout(() => setState("idle"), 3000);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, [onGeolocate]);

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading"}
      title={state === "denied" ? t("geo.denied") : t("geo.center")}
      className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white shadow-md transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-60"
    >
      {state === "loading" ? (
        <svg className="h-4.5 w-4.5 animate-spin text-gray-500" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : state === "denied" ? (
        <svg className="h-4.5 w-4.5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.05 5.05a7 7 0 119.9 9.9 7 7 0 01-9.9-9.9zM10 3a7 7 0 00-4.95 11.95l9.9-9.9A6.97 6.97 0 0010 3z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="h-4.5 w-4.5 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12zm0-3a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}
