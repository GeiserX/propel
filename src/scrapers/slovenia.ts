import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Slovenia — goriva.si API
// ---------------------------------------------------------------------------
// REST API: GET /api/v1/search/?position={lat},{lng}&radius={meters}
// Returns paginated results. Slovenia is ~270×150km, a single 200km query
// from center covers the entire country.
// Prices in EUR. Government-regulated prices.
// ---------------------------------------------------------------------------

const BASE_URL = "https://goriva.si/api/v1/search/";

// Center of Slovenia with a radius that covers the entire country
const QUERY_CENTER = { lat: 46.15, lng: 14.99 };
const QUERY_RADIUS = 200000; // 200km in meters

const FUEL_TYPE_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["95", "E5"],
  ["dizel", "B7"],
  ["98", "E5_98"],
  ["100", "E5_PREMIUM"],
  ["dizel-premium", "B7_PREMIUM"],
  ["avtoplin-lpg", "LPG"],
  ["hvo", "HVO"],
  ["cng", "CNG"],
  ["lng", "LNG"],
]);

interface GorivaSIStation {
  pk: number;
  franchise: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  prices: Record<string, number | null>;
  distance: number;
  open_hours: string;
  zip_code: string;
}

interface GorivaSIResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: GorivaSIStation[];
}

export class SloveniaScraper extends BaseScraper {
  readonly country = "SI";
  readonly source = "goriva_si";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];
    let page = 1;
    let totalFetched = 0;

    // Paginate through all results
    let url: string | null = `${BASE_URL}?position=${QUERY_CENTER.lat},${QUERY_CENTER.lng}&radius=${QUERY_RADIUS}&franchise=&name=&o=`;

    while (url) {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Propel/1.0" },
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) throw new Error(`goriva.si HTTP ${res.status}`);
      const data: GorivaSIResponse = await res.json();

      for (const s of data.results) {
        if (!s.lat || !s.lng) continue;
        // Slovenia bounding box
        if (s.lat < 45.4 || s.lat > 46.9 || s.lng < 13.3 || s.lng > 16.7) continue;

        const externalId = String(s.pk);

        stations.push({
          externalId,
          name: s.name?.trim() || `Station ${externalId}`,
          brand: null,
          address: s.address?.trim() || "",
          city: "",
          province: null,
          latitude: s.lat,
          longitude: s.lng,
          stationType: "fuel",
        });

        for (const [field, fuelType] of FUEL_TYPE_MAP) {
          const price = s.prices[field];
          if (price != null && price > 0) {
            prices.push({
              stationExternalId: externalId,
              fuelType,
              price,
              currency: "EUR",
            });
          }
        }
      }

      totalFetched += data.results.length;
      console.log(`[${this.source}] Page ${page}: ${data.results.length} stations (total: ${totalFetched})`);

      url = data.next;
      page++;

      // Safety: small delay between pages
      if (url) await new Promise((r) => setTimeout(r, 200));
    }

    return { stations, prices };
  }
}
