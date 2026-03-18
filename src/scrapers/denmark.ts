import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Denmark — Fuelprices.dk API (primary) + DrivstoffAppen fallback
// ---------------------------------------------------------------------------
// PRIMARY: Fuelprices.dk API (https://fuelprices.dk/api/v1)
//   - Official Danish fuel price aggregation service
//   - OpenAPI 3.1.0 spec at /api/openapi.json
//   - Requires free API key via X-API-KEY header
//   - Register at https://fuelprices.dk/registrer
//   - Key endpoint: GET /v1/stations/all?bbox=minLng,minLat,maxLng,maxLat
//   - Returns all stations with company info and current prices in a single request
//   - Stations have lat/lon coordinates, company name, address
//   - Prices are string values keyed by product name (e.g. "Blyfri 95" → "13.09")
//   - Prices in DKK (Danish Krone)
//   - Companies include: Circle K, F24, Shell, OK, Q8, Ingo, OIL!, Go'On
//   - Rate limits: not documented, but the HA integration polls every 1h
//
// FALLBACK: DrivstoffAppen API v1 (api.drivstoffappen.no)
//   - Same API as Norway/Sweden scrapers (see norway.ts for auth docs)
//   - Denmark is countryId=3 in their system
//   - ~2,000 stations with coordinates and prices
//   - Dynamic token auth (no API key env var needed)
//   - Fuel types: same numeric IDs as NO/SE
//   - Additional DK-specific: fuelTypeId=8 (92 Oktan), fuelTypeId=47 (100 Oktan)
//
// Strategy: Use Fuelprices.dk if API key is set (better data quality,
// official source, more product types). Fall back to DrivstoffAppen
// if no API key is configured (still gets ~1,400+ stations).
//
// Env: FUELPRICES_DK_API_KEY — optional, enables primary Fuelprices.dk source.
// ---------------------------------------------------------------------------

const FUELPRICES_API_BASE = "https://fuelprices.dk/api";
const DRIVSTOFF_API_BASE = "https://api.drivstoffappen.no/api/v1";
const DRIVSTOFF_CLIENT_ID = "com.raskebiler.drivstoff.appen.android";
const DRIVSTOFF_COUNTRY_ID = 3; // Denmark

// Denmark bounding box
const LAT_MIN = 54.5;
const LAT_MAX = 57.8;
const LON_MIN = 8.0;
const LON_MAX = 15.2;

// ---------------------------------------------------------------------------
// Fuelprices.dk product name → harmonized EU fuel type
// ---------------------------------------------------------------------------

const FUEL_PRODUCT_MAP: ReadonlyMap<string, FuelType> = new Map([
  // Exact matches (lowercase)
  ["blyfri 95", "E5"],
  ["blyfri 95 e10", "E10"],
  ["blyfri 98", "E5_98"],
  ["oktan 95", "E5"],
  ["oktan 95 e10", "E10"],
  ["oktan 100", "E5_PREMIUM"],
  ["diesel", "B7"],
  ["diesel+", "B7_PREMIUM"],
  ["dieselplus", "B7_PREMIUM"],
  ["adblue", "ADBLUE"],
  ["lpg", "LPG"],
  ["cng", "CNG"],
  ["hvo", "HVO"],
  ["hvo100", "HVO"],
  // Brand-specific names
  ["miles95.", "E5"],
  ["miles+95.", "E5_PREMIUM"],
  ["miles diesel.", "B7"],
  ["miles+ diesel.", "B7_PREMIUM"],
  ["shell fuelsave blyfri 95", "E5"],
  ["shell v-power", "E5_PREMIUM"],
  ["shell fuelsave diesel", "B7"],
  ["shell v-power diesel", "B7_PREMIUM"],
  ["goeasy 95 e10", "E10"],
  ["goeasy 95 extra e5", "E5"],
  ["goeasy diesel", "B7"],
  ["goeasy diesel extra", "B7_PREMIUM"],
  ["benzin 95", "E5"],
  ["upgrade 95", "E5_PREMIUM"],
  ["95 e10", "E10"],
  ["premium 98", "E5_98"],
]);

// DrivstoffAppen fuelTypeId → harmonized fuel type (Denmark-specific set)
const DRIVSTOFF_FUEL_MAP: ReadonlyMap<number, FuelType> = new Map([
  [1, "B7"],         // Diesel
  [2, "E5"],         // 95 Oktan
  [3, "E5_98"],      // 98 Oktan
  [4, "B7"],         // Frigårdsdiesel
  [7, "HVO"],        // HVO 100
  [8, "E5"],         // 92 Oktan (Denmark-specific)
  [9, "E10"],        // E-85
  [47, "E5_PREMIUM"],// 100 Oktan (Denmark-specific)
]);

// ---------------------------------------------------------------------------
// Fuelprices.dk API response types
// ---------------------------------------------------------------------------

interface DKCompany {
  id: number;
  company: string;
  url: string;
}

interface DKStation {
  id: number;
  identifier: number | null;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  last_update: string | null;
}

interface DKStationWithPrices {
  company: DKCompany;
  station: DKStation;
  prices: Record<string, string>; // product name → price as string
}

// ---------------------------------------------------------------------------
// DrivstoffAppen types (shared with norway.ts / sweden.ts)
// ---------------------------------------------------------------------------

interface AuthSession {
  token: string;
  expiresAt: string;
}

interface DrivstoffStation {
  id: number;
  brandId: number;
  countryId: number;
  stationTypeId: number;
  name: string;
  location: string;
  latitude: string;
  longitude: string;
  coordinates: { latitude: number; longitude: number };
  deleted: number;
  prices: Array<{
    fuelTypeId: number;
    currency: string;
    price: number;
    deleted: number;
    lastUpdated: number;
  }>;
  brand: {
    id: number;
    name: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Classify a Fuelprices.dk product name into a FuelType. */
function classifyFuel(product: string): FuelType | null {
  const lower = product.toLowerCase().trim();

  // Exact match
  const direct = FUEL_PRODUCT_MAP.get(lower);
  if (direct) return direct;

  // Partial match (check if any known key is contained)
  for (const [key, fuelType] of FUEL_PRODUCT_MAP) {
    if (lower.includes(key)) return fuelType;
  }

  // Heuristic fallback
  if (lower.includes("100") && !lower.includes("hvo")) return "E5_PREMIUM";
  if (lower.includes("98")) return "E5_98";
  if (lower.includes("95") && lower.includes("e10")) return "E10";
  if (lower.includes("95")) return "E5";
  if (lower.includes("diesel") && (lower.includes("+") || lower.includes("plus") || lower.includes("premium"))) return "B7_PREMIUM";
  if (lower.includes("diesel")) return "B7";
  if (lower.includes("adblue")) return "ADBLUE";

  return null;
}

/** Extract city from a Danish address string. */
function extractCity(address: string | null): string {
  if (!address) return "";
  // Common formats:
  //   "Halsvej 38 Rærup, 9310 Vodskov, Danmark"  → "Vodskov"
  //   "Haslevej, 8230 Aarhus, Denmark"            → "Aarhus"
  //   "Vestergade 35 D, 5800 Nyborg"              → "Nyborg"
  const cleaned = address
    .replace(/,?\s*(Danmark|Denmark)$/i, "")
    .trim();
  const parts = cleaned.split(",").map((p) => p.trim());
  const last = parts[parts.length - 1];
  if (!last) return "";
  // Remove leading postal code (4-digit Danish)
  return last.replace(/^\d{4}\s*/, "").trim();
}

// ---------------------------------------------------------------------------
// DrivstoffAppen auth (same as norway.ts)
// ---------------------------------------------------------------------------

async function getDrivstoffApiKey(): Promise<string> {
  const res = await fetch(`${DRIVSTOFF_API_BASE}/authorization-sessions`, {
    headers: { Accept: "application/json", "User-Agent": "Propel/1.0" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`DrivstoffAppen auth failed: HTTP ${res.status}`);
  }

  const session: AuthSession = await res.json();
  const shifted = session.token.slice(1) + session.token[0];
  const encoder = new TextEncoder();
  const data = encoder.encode(shifted);

  const { createHash } = await import("node:crypto");
  return createHash("md5").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// Scraper
// ---------------------------------------------------------------------------

export class DenmarkScraper extends BaseScraper {
  readonly country = "DK";
  readonly source = "fuelprices_dk";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const apiKey = process.env.FUELPRICES_DK_API_KEY;

    if (apiKey) {
      console.log(`[${this.source}] Using Fuelprices.dk API (primary)...`);
      return this.fetchFromFuelpricesDk(apiKey);
    }

    console.log(
      `[${this.source}] No FUELPRICES_DK_API_KEY — falling back to DrivstoffAppen API`,
    );
    return this.fetchFromDrivstoffappen();
  }

  // ---------------------------------------------------------------------------
  // Primary: Fuelprices.dk API
  // ---------------------------------------------------------------------------

  private async fetchFromFuelpricesDk(
    apiKey: string,
  ): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];
    const seenStations = new Set<string>();

    // Use bbox to restrict to Denmark
    const bbox = `${LON_MIN},${LAT_MIN},${LON_MAX},${LAT_MAX}`;
    const url = `${FUELPRICES_API_BASE}/v1/stations/all?bbox=${bbox}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
        "User-Agent": "Propel/1.0",
      },
      signal: AbortSignal.timeout(60_000),
    });

    if (res.status === 401) {
      console.error(
        `[${this.source}] API key rejected (401). Register at https://fuelprices.dk/registrer`,
      );
      console.log(`[${this.source}] Falling back to DrivstoffAppen...`);
      return this.fetchFromDrivstoffappen();
    }

    if (!res.ok) {
      throw new Error(
        `Fuelprices.dk API returned HTTP ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }

    const data: DKStationWithPrices[] = await res.json();
    console.log(`[${this.source}] Received ${data.length} station entries`);

    for (const entry of data) {
      const s = entry.station;
      if (s.latitude == null || s.longitude == null) continue;

      // Bounding-box filter
      if (
        s.latitude < LAT_MIN ||
        s.latitude > LAT_MAX ||
        s.longitude < LON_MIN ||
        s.longitude > LON_MAX
      ) {
        continue;
      }

      // Composite external ID: company + station to ensure uniqueness
      const externalId = `dk-fp-${entry.company.id}-${s.id}`;

      if (!seenStations.has(externalId)) {
        seenStations.add(externalId);

        stations.push({
          externalId,
          name:
            s.name?.trim() ||
            `${entry.company.company} ${s.address ?? ""}`.trim(),
          brand: entry.company.company?.trim() || null,
          address: s.address?.trim() || "",
          city: extractCity(s.address),
          province: null,
          latitude: s.latitude,
          longitude: s.longitude,
          stationType: "fuel",
        });
      }

      // Parse prices (keys are product names, values are price strings)
      for (const [product, priceStr] of Object.entries(entry.prices)) {
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) continue;

        const fuelType = classifyFuel(product);
        if (!fuelType) continue;

        prices.push({
          stationExternalId: externalId,
          fuelType,
          price,
          currency: "DKK",
        });
      }
    }

    console.log(
      `[${this.source}] Fuelprices.dk: ${stations.length} stations, ${prices.length} prices`,
    );
    return { stations, prices };
  }

  // ---------------------------------------------------------------------------
  // Fallback: DrivstoffAppen API
  // ---------------------------------------------------------------------------

  private async fetchFromDrivstoffappen(): Promise<{
    stations: RawStation[];
    prices: RawFuelPrice[];
  }> {
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];

    console.log(`[${this.source}] Authenticating with DrivstoffAppen...`);
    const apiKey = await getDrivstoffApiKey();

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "Propel/1.0",
      "X-API-KEY": apiKey,
      "X-CLIENT-ID": DRIVSTOFF_CLIENT_ID,
    };

    const res = await fetch(
      `${DRIVSTOFF_API_BASE}/stations?countryId=${DRIVSTOFF_COUNTRY_ID}`,
      { headers, signal: AbortSignal.timeout(60_000) },
    );

    if (!res.ok) {
      throw new Error(
        `DrivstoffAppen API returned HTTP ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }

    const data: DrivstoffStation[] = await res.json();
    console.log(
      `[${this.source}] DrivstoffAppen: ${data.length} raw stations`,
    );

    const stationSet = new Map<number, boolean>();

    for (const s of data) {
      const lat = s.coordinates?.latitude ?? parseFloat(s.latitude);
      const lon = s.coordinates?.longitude ?? parseFloat(s.longitude);

      if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;
      if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
        continue;
      }
      if (s.deleted !== 0) continue;
      if (s.stationTypeId !== 1) continue; // Road stations only

      const validPrices: Array<{ fuelType: FuelType; price: number }> = [];
      for (const p of s.prices) {
        if (p.deleted !== 0) continue;
        if (p.price <= 0) continue;

        const fuelType = DRIVSTOFF_FUEL_MAP.get(p.fuelTypeId);
        if (!fuelType) continue;

        validPrices.push({ fuelType, price: p.price });
      }

      if (validPrices.length === 0) continue;
      if (stationSet.has(s.id)) continue;
      stationSet.set(s.id, true);

      const externalId = `dk-da-${s.id}`;
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
          currency: "DKK",
        });
      }
    }

    console.log(
      `[${this.source}] DrivstoffAppen fallback: ${stations.length} stations, ${prices.length} prices`,
    );
    return { stations, prices };
  }
}
