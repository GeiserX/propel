import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Ireland — Pick A Pump API
// ---------------------------------------------------------------------------
// Crowdsourced fuel price comparison covering ROI (Republic of Ireland).
// API endpoint: GET /v1/stations/nearby?lat=&lng=&radius=
// Returns max 200 stations per query. Grid-based approach needed.
// Prices in euro cents (194.9 = €1.949/L).
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.pickapump.com/v1/stations/nearby";

const FUEL_FIELD_MAP: ReadonlyArray<[string, FuelType]> = [
  ["petrol", "E10"],         // Standard unleaded (E10 in Ireland since 2019)
  ["diesel", "B7"],          // Standard diesel
  ["petrolplus", "E5_98"],   // Premium petrol (98 octane)
  ["dieselplus", "B7_PREMIUM"], // Premium diesel
  ["hvo", "HVO"],            // Hydrotreated vegetable oil
];

// Grid of coordinates covering Republic of Ireland
// Ireland bbox: lat 51.4-55.4, lon -10.5 to -5.5
// 20km radius circles → ~0.35° lat and ~0.55° lon steps
function generateGrid(): Array<{ lat: number; lon: number }> {
  const grid: Array<{ lat: number; lon: number }> = [];
  for (let lat = 51.4; lat <= 55.5; lat += 0.35) {
    for (let lon = -10.5; lon <= -5.4; lon += 0.55) {
      grid.push({
        lat: Math.round(lat * 100) / 100,
        lon: Math.round(lon * 100) / 100,
      });
    }
  }
  return grid;
}

interface PAPStation {
  id: string;
  stationName: string;
  brand: string;
  address: string;
  town: string;
  county: string;
  postcode: string;
  country: string; // "ROI", "NI", "UK"
  coords: { lat: number; lng: number };
  prices?: {
    petrol?: number;
    diesel?: number;
    petrolplus?: number;
    dieselplus?: number;
    hvo?: number;
    currency?: string;
    date_added?: string;
  };
}

export class IrelandScraper extends BaseScraper {
  readonly country = "IE";
  readonly source = "pickapump";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const grid = generateGrid();
    const stationMap = new Map<string, RawStation>();
    const priceMap = new Map<string, RawFuelPrice>();
    let totalQueries = 0;

    for (let i = 0; i < grid.length; i++) {
      const { lat, lon } = grid[i];
      const url = `${BASE_URL}?lat=${lat}&lng=${lon}&radius=20`;

      try {
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; Pumperly/1.0)",
            Origin: "https://pickapump.com",
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          if (res.status === 429) {
            await new Promise((r) => setTimeout(r, 5_000));
            continue;
          }
          continue;
        }

        const data: PAPStation[] = await res.json();

        for (const s of data) {
          // Only ROI stations (skip NI/UK — covered by CMA UK scraper)
          if (s.country !== "ROI") continue;
          if (!s.coords?.lat || !s.coords?.lng) continue;

          // Ireland bounding box
          if (s.coords.lat < 51.3 || s.coords.lat > 55.5) continue;
          if (s.coords.lng < -10.6 || s.coords.lng > -5.4) continue;

          if (!stationMap.has(s.id)) {
            stationMap.set(s.id, {
              externalId: s.id,
              name: s.stationName?.trim() || `Station ${s.id}`,
              brand: s.brand?.trim() || null,
              address: s.address?.trim() || "",
              city: s.town?.trim() || "",
              province: s.county?.trim() || null,
              latitude: s.coords.lat,
              longitude: s.coords.lng,
              stationType: "fuel",
            });
          }

          if (s.prices) {
            for (const [field, fuelType] of FUEL_FIELD_MAP) {
              const priceVal = s.prices[field as keyof typeof s.prices];
              if (typeof priceVal !== "number") continue;
              if (priceVal <= 0 || priceVal > 500) continue; // cents, max ~€5/L

              const key = `${s.id}:${fuelType}`;
              if (!priceMap.has(key)) {
                priceMap.set(key, {
                  stationExternalId: s.id,
                  fuelType,
                  price: priceVal / 100, // cents to EUR/L
                  currency: "EUR",
                });
              }
            }
          }
        }
      } catch {
        // Skip failed queries silently
      }

      totalQueries++;
      if (totalQueries % 20 === 0) {
        console.log(`[${this.source}] Progress: ${totalQueries} queries, ${stationMap.size} unique stations`);
      }

      // Rate limit: 150ms between requests
      await new Promise((r) => setTimeout(r, 150));
    }

    console.log(`[${this.source}] Completed ${totalQueries} queries, ${stationMap.size} stations`);
    return {
      stations: Array.from(stationMap.values()),
      prices: Array.from(priceMap.values()),
    };
  }
}
