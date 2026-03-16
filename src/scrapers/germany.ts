import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Germany — Tankerkoenig (MTS-K / Bundeskartellamt)
// ---------------------------------------------------------------------------
// API v4: creativecommons.tankerkoenig.de/api/v4/stations/search
// ~14,700 stations, real-time prices, CC BY 4.0 license
// Requires free API key from https://onboarding.tankerkoenig.de
// Radius search max 25km — we tile Germany with overlapping circles.
// ---------------------------------------------------------------------------

const BASE_URL = "https://creativecommons.tankerkoenig.de/api/v4/stations/search";

const FUEL_CATEGORY_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["diesel", "B7"],
  ["gasoline", "E5"],  // Default for gasoline category
]);

// Specific fuel name overrides
const FUEL_NAME_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["Diesel", "B7"],
  ["Super E5", "E5"],
  ["Super E10", "E10"],
  ["Super Plus", "E5_98"],
]);

// Grid of coordinates covering Germany (~357,000 km²)
// Germany bbox: lat 47.3-55.1, lon 5.9-15.1
// With 25km radius circles (50km diameter), we need ~0.45° lat and ~0.65° lon steps
// to ensure overlap. That gives roughly 18 lat × 15 lon = 270 queries.
function generateGrid(): Array<{ lat: number; lon: number }> {
  const grid: Array<{ lat: number; lon: number }> = [];
  for (let lat = 47.3; lat <= 55.1; lat += 0.40) {
    for (let lon = 5.9; lon <= 15.1; lon += 0.55) {
      grid.push({ lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 });
    }
  }
  return grid;
}

interface V4Station {
  id: string;
  name: string;
  brand: string;
  street: string;
  postalCode: string;
  place: string;
  coords: { lat: number; lng: number };
  isOpen: boolean;
  fuels: Array<{
    category: string;
    name: string;
    price: number | null;
  }>;
}

interface V4Response {
  stations: V4Station[];
}

export class GermanyScraper extends BaseScraper {
  readonly country = "DE";
  readonly source = "tankerkoenig";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const apiKey = process.env.TANKERKOENIG_API_KEY;
    if (!apiKey) {
      throw new Error("TANKERKOENIG_API_KEY env var required. Register at https://onboarding.tankerkoenig.de");
    }

    const grid = generateGrid();
    const stationMap = new Map<string, RawStation>();
    const priceMap = new Map<string, RawFuelPrice>();

    for (let i = 0; i < grid.length; i++) {
      const { lat, lon } = grid[i];
      const url = `${BASE_URL}?lat=${lat}&lng=${lon}&rad=25&apikey=${apiKey}`;

      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "Propel/1.0" },
          signal: AbortSignal.timeout(15_000),
        });

        if (res.status === 503) {
          console.warn(`[${this.source}] Rate limited at grid ${i}/${grid.length}, waiting 10s...`);
          await new Promise((r) => setTimeout(r, 10_000));
          continue;
        }

        if (!res.ok) {
          console.warn(`[${this.source}] HTTP ${res.status} for grid ${i} (${lat},${lon})`);
          continue;
        }

        const data: V4Response = await res.json();

        for (const s of data.stations) {
          if (!s.coords?.lat || !s.coords?.lng) continue;
          // Germany bounding box
          if (s.coords.lat < 47 || s.coords.lat > 56 || s.coords.lng < 5 || s.coords.lng > 16) continue;

          if (!stationMap.has(s.id)) {
            stationMap.set(s.id, {
              externalId: s.id,
              name: s.name?.trim() || `${s.brand ?? ""} ${s.place ?? ""}`.trim(),
              brand: s.brand?.trim() || null,
              address: s.street?.trim() || "",
              city: s.place?.trim() || "",
              province: null,
              latitude: s.coords.lat,
              longitude: s.coords.lng,
              stationType: "fuel",
            });
          }

          for (const f of s.fuels) {
            if (f.price == null || f.price <= 0) continue;
            const fuelType = FUEL_NAME_MAP.get(f.name) ?? FUEL_CATEGORY_MAP.get(f.category);
            if (!fuelType) continue;

            const key = `${s.id}:${fuelType}`;
            if (!priceMap.has(key)) {
              priceMap.set(key, {
                stationExternalId: s.id,
                fuelType,
                price: f.price,
                currency: "EUR",
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[${this.source}] Error for grid ${i} (${lat},${lon}):`, err);
      }

      // Small delay to avoid rate limiting (100ms between requests)
      if (i % 50 === 49) {
        console.log(`[${this.source}] Progress: ${i + 1}/${grid.length} queries, ${stationMap.size} unique stations`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[${this.source}] Completed ${grid.length} grid queries, ${stationMap.size} unique stations`);
    return {
      stations: Array.from(stationMap.values()),
      prices: Array.from(priceMap.values()),
    };
  }
}
