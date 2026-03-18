import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Sweden — DrivstoffAppen API v1 (drivstoffappen.no)
// ---------------------------------------------------------------------------
// Same API as Norway (see norway.ts for full auth documentation).
// Sweden is countryId=2 in the DrivstoffAppen system.
//
// API base: https://api.drivstoffappen.no/api/v1
// Auth: Dynamic token-based (same as Norway — see norway.ts).
//   1. GET /authorization-sessions → { token }
//   2. Rotate token left by 1 char, MD5 hash → use as X-API-KEY
//
// Endpoint: GET /stations?countryId=2 → all Swedish stations with prices
// Returns ~3,900 stations in a single request, including EV chargers.
//
// Fuel type IDs (same codes across all countries):
//   1 = Diesel (FT_D)          → B7
//   2 = 95 Oktan (FT_95)       → E5
//   3 = 98 Oktan (FT_98)       → E5_98
//   4 = Frigårdsdiesel (FT_FD) → B7 (duty-free diesel)
//   7 = HVO 100 (FT_100)       → HVO
//   8 = 92 Oktan (FT_92)       → E5  (lower octane, same ethanol spec)
//   9 = E-85 (FT_E85)          → E10 (high ethanol blend; closest match)
//
// Prices in SEK (Swedish Krona). Currency field in API is "KR" (not "SEK").
//
// Previous approach (bensinpriser.nu HTML scraping) was replaced because:
//   - Required ~3000+ HTTP requests per scrape (list + detail pages)
//   - Fragile regex-based HTML parsing
//   - User-reported prices with 7-day expiry (stale data)
//   - DrivstoffAppen has better coverage (~3,900 vs ~2,700 stations)
//   - Single API request vs thousands of page fetches
//
// Env: No env vars needed (auth is dynamic).
// ---------------------------------------------------------------------------

const API_BASE = "https://api.drivstoffappen.no/api/v1";
const CLIENT_ID = "com.raskebiler.drivstoff.appen.android";
const COUNTRY_ID = 2; // Sweden

// Sweden bounding box
const LAT_MIN = 55.3;
const LAT_MAX = 69.1;
const LON_MIN = 11.0;
const LON_MAX = 24.2;

// DrivstoffAppen fuelTypeId → harmonized EU fuel type
// Only fuel types (fuelKindId=1), not EV charger types (fuelKindId=2)
const FUEL_TYPE_MAP: ReadonlyMap<number, FuelType> = new Map([
  [1, "B7"],         // Diesel
  [2, "E5"],         // 95 Oktan
  [3, "E5_98"],      // 98 Oktan
  [4, "B7"],         // Frigårdsdiesel (duty-free diesel)
  [7, "HVO"],        // HVO 100
  [8, "E5"],         // 92 Oktan (lower octane gasoline; E5 closest match)
  [9, "E10"],        // E-85 (high ethanol blend)
]);

// ---------------------------------------------------------------------------
// API response types (shared structure with Norway — see norway.ts)
// ---------------------------------------------------------------------------

interface AuthSession {
  id: number;
  authorizationId: number;
  token: string;
  createdAt: string;
  expiresAt: string;
  deleted: number;
}

interface StationPrice {
  id: number;
  fuelTypeId: number;
  currency: string;
  price: number;
  deleted: number;
  lastUpdated: number;
  createdAt: string;
  updatedAt: string;
}

interface StationBrand {
  id: number;
  name: string;
  pictureUrl: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  deleted: number;
  countryIds: number[];
}

interface APIStation {
  id: number;
  externalId?: string;
  brandId: number;
  countryId: number;
  stationTypeId: number;
  name: string;
  location: string;
  latitude: string;
  longitude: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  deleted: number;
  createdAt: string;
  updatedAt: string;
  prices: StationPrice[];
  amenityIds?: number[];
  brand: StationBrand;
}

// ---------------------------------------------------------------------------
// Authentication helpers (identical to Norway)
// ---------------------------------------------------------------------------

async function getSessionToken(): Promise<string> {
  const res = await fetch(`${API_BASE}/authorization-sessions`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Propel/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`DrivstoffAppen auth failed: HTTP ${res.status}`);
  }

  const session: AuthSession = await res.json();
  return session.token;
}

async function deriveApiKey(token: string): Promise<string> {
  const shifted = token.slice(1) + token[0];
  const encoder = new TextEncoder();
  const data = encoder.encode(shifted);

  const { createHash } = await import("node:crypto");
  return createHash("md5").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// Scraper
// ---------------------------------------------------------------------------

export class SwedenScraper extends BaseScraper {
  readonly country = "SE";
  readonly source = "drivstoffappen";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    // Step 1: Authenticate
    console.log(`[${this.source}] Obtaining API session token...`);
    const token = await getSessionToken();
    const apiKey = await deriveApiKey(token);

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "Propel/1.0",
      "X-API-KEY": apiKey,
      "X-CLIENT-ID": CLIENT_ID,
    };

    // Step 2: Fetch all Swedish stations in a single request
    console.log(`[${this.source}] Fetching all stations for Sweden...`);
    const res = await fetch(`${API_BASE}/stations?countryId=${COUNTRY_ID}`, {
      headers,
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      throw new Error(
        `DrivstoffAppen stations API returned HTTP ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }

    const data: APIStation[] = await res.json();
    console.log(`[${this.source}] Received ${data.length} raw stations`);

    // Step 3: Process stations and prices
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];
    const stationMap = new Map<number, boolean>();

    for (const s of data) {
      const lat = s.coordinates?.latitude ?? parseFloat(s.latitude);
      const lon = s.coordinates?.longitude ?? parseFloat(s.longitude);

      if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;

      // Bounding-box filter
      if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
        continue;
      }

      // Skip deleted stations
      if (s.deleted !== 0) continue;

      // Only process road stations (stationTypeId=1)
      // Sweden doesn't have many marine stations in the API
      if (s.stationTypeId !== 1) continue;

      // Collect valid fuel prices
      const validPrices: Array<{ fuelType: FuelType; price: number }> = [];
      for (const p of s.prices) {
        if (p.deleted !== 0) continue;
        if (p.price <= 0) continue;

        const fuelType = FUEL_TYPE_MAP.get(p.fuelTypeId);
        if (!fuelType) continue;

        validPrices.push({ fuelType, price: p.price });
      }

      if (validPrices.length === 0) continue;

      // Dedup
      if (stationMap.has(s.id)) continue;
      stationMap.set(s.id, true);

      const externalId = `se-${s.id}`;
      const brandName = s.brand?.name?.trim() || null;

      stations.push({
        externalId,
        name: s.name?.trim() || `${brandName ?? ""} ${externalId}`.trim(),
        brand: brandName,
        address: s.location?.trim() || "",
        city: extractCity(s.location),
        province: null,
        latitude: lat,
        longitude: lon,
        stationType: "fuel",
      });

      for (const vp of validPrices) {
        prices.push({
          stationExternalId: externalId,
          fuelType: vp.fuelType,
          price: vp.price,
          currency: "SEK",
        });
      }
    }

    console.log(
      `[${this.source}] Processed ${stations.length} stations, ${prices.length} prices`,
    );
    return { stations, prices };
  }
}

/**
 * Extract city from a Swedish address string.
 * Common formats:
 *   "Överbyn 18, 685 94 Torsby"           → "Torsby"
 *   "Kiselvägen 2, 771 41 Ludvika, Sweden" → "Ludvika"
 *   "E45 Munkedal"                          → "Munkedal"
 */
function extractCity(location: string | null): string {
  if (!location) return "";
  // Remove trailing country name
  const cleaned = location
    .replace(/,?\s*(Sweden|Sverige|Denmark|Danmark|Norway|Norge)$/i, "")
    .trim();
  // Split by comma, take last segment
  const parts = cleaned.split(",").map((p) => p.trim());
  const last = parts[parts.length - 1];
  if (!last) return "";
  // Remove leading postal code (Swedish: 3+2 digits with space, e.g. "685 94")
  return last.replace(/^\d{3}\s*\d{2}\s*/, "").trim();
}
