"use client";

import { useCallback, useEffect, useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { useI18n } from "@/lib/i18n";

type GeoState = "idle" | "loading" | "active" | "denied";

interface GeolocateButtonProps {
  onGeolocate: (lon: number, lat: number) => void;
}

export function GeolocateButton({ onGeolocate }: GeolocateButtonProps) {
  const { t } = useI18n();
  const [state, setState] = useState<GeoState>("idle");
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Auto-detect location if permission already granted
  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions) return;
    navigator.permissions.query({ name: "geolocation" }).then((perm) => {
      if (perm.state === "granted") {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setUserLocation([pos.coords.longitude, pos.coords.latitude]);
            setState("active");
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
        );
      }
    }).catch(() => {});
  }, []);

  // Watch position when active
  useEffect(() => {
    if (state !== "active" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserLocation([pos.coords.longitude, pos.coords.latitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [state]);

  const handleClick = useCallback(() => {
    if (!navigator.geolocation) {
      setState("denied");
      return;
    }

    setState("loading");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setUserLocation(coords);
        setState("active");
        onGeolocate(coords[0], coords[1]);
      },
      () => {
        setState("denied");
        setTimeout(() => setState("idle"), 3000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [onGeolocate]);

  return (
    <>
      {/* Blue dot for user location */}
      {userLocation && state === "active" && (
        <Marker longitude={userLocation[0]} latitude={userLocation[1]} anchor="center">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-6 w-6 animate-ping rounded-full bg-blue-400/30" />
            <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow-md" />
          </div>
        </Marker>
      )}

      <button
        onClick={handleClick}
        disabled={state === "loading"}
        title={state === "denied" ? t("geo.denied") : t("geo.center")}
        className={`absolute top-14 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg border shadow-md transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-60 dark:hover:bg-gray-700 sm:top-3 sm:right-3 ${
          state === "active"
            ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950"
            : "border-black/10 bg-white dark:border-white/10 dark:bg-gray-800"
        }`}
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
          <svg className="h-4.5 w-4.5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12zm0-3a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    </>
  );
}
