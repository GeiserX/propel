import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Denmark — Fuelprices.dk API
// ---------------------------------------------------------------------------
// Public API at https://fuelprices.dk/api/v1 (OpenAPI 3.1.0).
// Requires free API key via X-API-KEY header (register at /registrer).
// Main endpoint: GET /v1/stations/all — returns all stations with prices.
// Supports bbox filter: ?bbox=minLng,minLat,maxLng,maxLat
// Prices in DKK (Danish Krone).
//
// Fuel product names observed: "Blyfri 95", "Blyfri 98", "Diesel",
// "Blyfri 95 E10", "Diesel+", "AdBlue"
// ---------------------------------------------------------------------------

const BASE_URL = "https://fuelprices.dk/api";

// Denmark bounding box
const LAT_MIN = 54.5;
const LAT_MAX = 57.8;
const LON_MIN = 8.0;
const LON_MAX = 15.2;

// Map Danish product names to harmonized EU fuel types
const FUEL_PRODUCT_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["blyfri 95", "E5"],
  ["blyfri 95 e10", "E10"],
  ["blyfri 98", "E5_98"],
  ["oktan 95", "E5"],
  ["oktan 98", "E5_98"],
  ["diesel", "B7"],
  ["diesel+", "B7_PREMIUM"],
  ["adblue", "ADBLUE"],
  ["lpg", "LPG"],
  ["cng", "CNG"],
  ["hvo", "HVO"],
]);

/** Attempt to classify a product name into a FuelType */
function classifyFuel(product: string): FuelType | null {
  const lower = product.toLowerCase().trim();
  // Direct match
  const direct = FUEL_PRODUCT_MAP.get(lower);
  if (direct) return direct;
  // Partial match
  for (const [key, fuelType] of FUEL_PRODUCT_MAP) {
    if (lower.includes(key)) return fuelType;
  }
  // Fallback heuristics
  if (lower.includes("98") || lower.includes("oktan 98")) return "E5_98";
  if (lower.includes("95") && lower.includes("e10")) return "E10";
  if (lower.includes("95")) return "E5";
  if (lower.includes("diesel")) return "B7";
  return null;
}

// ---------------------------------------------------------------------------
// API response types
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

export class DenmarkScraper extends BaseScraper {
  readonly country = "DK";
  readonly source = "fuelprices_dk";

  private get apiKey(): string {
    const key = process.env.FUELPRICES_DK_API_KEY;
    if (!key) {
      throw new Error(
        "FUELPRICES_DK_API_KEY env var is required. " +
          "Register for a free key at https://fuelprices.dk/registrer",
      );
    }
    return key;
  }

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];
    const seenStations = new Set<string>();

    // Use bbox to restrict to Denmark
    const bbox = `${LON_MIN},${LAT_MIN},${LON_MAX},${LAT_MAX}`;
    const url = `${BASE_URL}/v1/stations/all?bbox=${bbox}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-KEY": this.apiKey,
        "User-Agent": "Propel/1.0",
      },
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      throw new Error(
        `Fuelprices.dk API returned HTTP ${res.status}: ${await res.text()}`,
      );
    }

    const data: DKStationWithPrices[] = await res.json();

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

      const externalId = `dk-${entry.company.id}-${s.id}`;

      if (!seenStations.has(externalId)) {
        seenStations.add(externalId);

        // Parse city from address (best effort: take last part after comma)
        const addressParts = s.address?.split(",").map((p) => p.trim()) ?? [];
        const city =
          addressParts.length > 1
            ? addressParts[addressParts.length - 1]
            : "";

        stations.push({
          externalId,
          name:
            s.name?.trim() ||
            `${entry.company.company} ${s.address ?? ""}`.trim(),
          brand: entry.company.company?.trim() || null,
          address: s.address?.trim() || "",
          city,
          province: null,
          latitude: s.latitude,
          longitude: s.longitude,
          stationType: "fuel",
        });
      }

      // Parse prices
      for (const [product, priceStr] of Object.entries(entry.prices)) {
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) continue;

        const fuelType = classifyFuel(product);
        if (!fuelType) {
          continue; // Skip unknown fuel types
        }

        prices.push({
          stationExternalId: externalId,
          fuelType,
          price,
          currency: "DKK",
        });
      }
    }

    console.log(
      `[${this.source}] Fetched ${stations.length} stations, ${prices.length} prices from API`,
    );
    return { stations, prices };
  }
}
