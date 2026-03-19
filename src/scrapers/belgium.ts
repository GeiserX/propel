import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Belgium — ANWB Fuel Stations API
// ---------------------------------------------------------------------------
// Same API as Netherlands scraper. ANWB covers both NL and BE.
// Single GET request, no auth. Prices in EUR.
// Belgian stations identified by iso3CountryCode "BEL".
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.anwb.nl/routing/points-of-interest/v3/all";

// Belgium bounding box
const BE_BBOX = { south: 49.5, west: 2.5, north: 51.5, east: 6.5 };

const FUEL_TYPE_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["EURO95", "E10"],
  ["EURO98", "E5_98"],
  ["DIESEL", "B7"],
  ["DIESEL_SPECIAL", "B7_PREMIUM"],
  ["AUTOGAS", "LPG"],
  ["CNG", "CNG"],
]);

interface ANWBStation {
  id: string;
  coordinates: { latitude: number; longitude: number };
  title: string;
  address?: {
    streetAddress?: string;
    postalCode?: string;
    city?: string;
    country?: string;
    iso3CountryCode?: string;
  };
  prices?: Array<{
    fuelType: string;
    value: number;
    currency: string;
  }>;
}

interface ANWBResponse {
  value: ANWBStation[];
}

export class BelgiumScraper extends BaseScraper {
  readonly country = "BE";
  readonly source = "anwb";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const url = `${BASE_URL}?type-filter=FUEL_STATION&bounding-box-filter=${BE_BBOX.south},${BE_BBOX.west},${BE_BBOX.north},${BE_BBOX.east}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Pumperly/1.0)",
      },
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) throw new Error(`ANWB API HTTP ${res.status}`);
    const data: ANWBResponse = await res.json();

    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];

    for (const s of data.value) {
      if (!s.coordinates?.latitude || !s.coordinates?.longitude) continue;
      const lat = s.coordinates.latitude;
      const lon = s.coordinates.longitude;

      // Filter to Belgium only
      if (s.address?.iso3CountryCode && s.address.iso3CountryCode !== "BEL") continue;
      // BE bounding box check
      if (lat < 49.5 || lat > 51.5 || lon < 2.5 || lon > 6.5) continue;

      const externalId = s.id;

      stations.push({
        externalId,
        name: s.title?.trim() || `Station ${externalId}`,
        brand: s.title?.split(" ")[0]?.trim() || null,
        address: s.address?.streetAddress?.trim() || "",
        city: s.address?.city?.trim() || "",
        province: null,
        latitude: lat,
        longitude: lon,
        stationType: "fuel",
      });

      if (s.prices) {
        for (const p of s.prices) {
          const fuelType = FUEL_TYPE_MAP.get(p.fuelType);
          if (!fuelType) continue;
          if (p.value == null || p.value <= 0) continue;
          prices.push({
            stationExternalId: externalId,
            fuelType,
            price: p.value,
            currency: p.currency || "EUR",
          });
        }
      }
    }

    console.log(`[${this.source}] Fetched ${data.value.length} total, ${stations.length} BE stations`);
    return { stations, prices };
  }
}
