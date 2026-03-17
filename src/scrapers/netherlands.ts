import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Netherlands — ANWB Fuel Stations API
// ---------------------------------------------------------------------------
// Single GET request returns all stations with prices, coordinates, brand.
// No auth required. Covers NL (and BE). Prices in EUR.
// Fuel types: EURO95 (E10), EURO98 (E5), DIESEL (B7), DIESEL_SPECIAL (B7_PREMIUM),
//             AUTOGAS (LPG), CNG
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.anwb.nl/routing/points-of-interest/v3/all";

// Netherlands bounding box
const NL_BBOX = { south: 50.7, west: 3.3, north: 53.6, east: 7.3 };

const FUEL_TYPE_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["EURO95", "E10"],
  ["EURO98", "E5"],
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

export class NetherlandsScraper extends BaseScraper {
  readonly country = "NL";
  readonly source = "anwb";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const url = `${BASE_URL}?type-filter=FUEL_STATION&bounding-box-filter=${NL_BBOX.south},${NL_BBOX.west},${NL_BBOX.north},${NL_BBOX.east}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Propel/1.0)",
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

      // Filter to Netherlands only (ANWB also returns Belgian stations)
      if (s.address?.iso3CountryCode && s.address.iso3CountryCode !== "NLD") continue;
      // NL bounding box check
      if (lat < 50.7 || lat > 53.6 || lon < 3.3 || lon > 7.3) continue;

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

    console.log(`[${this.source}] Fetched ${data.value.length} total, ${stations.length} NL stations`);
    return { stations, prices };
  }
}
