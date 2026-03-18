import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Norway — DrivstoffAppen API
// ---------------------------------------------------------------------------
// API: api.drivstoffappen.no/api/v1
// Authentication: API key required (returns 401 without one).
// The API key is obtained via the DrivstoffAppen mobile app or business
// contact (support@drivstoffappen.no).
//
// Norwegian fuel price transparency is government-mandated (since 2023).
// The DrivstoffAppen is the primary aggregator. Their Nuxt SSR output
// exposes brand-level pricing, but per-station data requires API auth.
//
// Observed fuel type codes (from SSR data):
//   FT_95 = Bensin 95 (maps to E5)
//   FT_98 = Bensin 98 (maps to E5_98)
//   FT_D  = Diesel    (maps to B7)
//
// Prices in NOK (Norwegian Krone).
//
// Env: DRIVSTOFFAPPEN_API_KEY — required for station-level data.
//
// Fallback: If no API key, scrapes average brand-level prices from the
// DrivstoffAppen Nuxt SSR payload at /drivstoffpriser. This yields brand
// aggregates (no per-station data), which still provides useful price
// signals per fuel type.
// ---------------------------------------------------------------------------

const API_BASE = "https://api.drivstoffappen.no/api/v1";
const WEBSITE_URL = "https://drivstoffappen.no/drivstoffpriser";

// Norway bounding box (focus on populated areas 58-70)
const LAT_MIN = 57.9;
const LAT_MAX = 71.2;
const LON_MIN = 4.5;
const LON_MAX = 31.2;

// API fuel type codes → harmonized
const FUEL_TYPE_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["FT_95", "E5"],
  ["FT_98", "E5_98"],
  ["FT_D", "B7"],
  // Additional codes that may appear in the full API
  ["FT_LPG", "LPG"],
  ["FT_CNG", "CNG"],
  ["FT_E85", "E10"], // E85 closest match
]);

// ---------------------------------------------------------------------------
// API response types (based on observed 401 structure and SSR data)
// ---------------------------------------------------------------------------

interface APIStation {
  id: string | number;
  name: string;
  brand: string;
  address: string;
  city: string;
  county?: string;
  latitude: number;
  longitude: number;
  fuelPrices?: Array<{
    fuelType: string;
    price: number;
    date?: string;
  }>;
}

// Brand-level price from SSR payload
interface BrandPrice {
  brandName: string;
  brandLogo?: string;
  fuelType: string;
  price: number;
  priceOld?: number;
  date: string;
}

export class NorwayScraper extends BaseScraper {
  readonly country = "NO";
  readonly source = "drivstoffappen";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const apiKey = process.env.DRIVSTOFFAPPEN_API_KEY;

    if (apiKey) {
      return this.fetchFromAPI(apiKey);
    }

    console.log(
      `[${this.source}] No DRIVSTOFFAPPEN_API_KEY set — falling back to SSR brand-level scraping`,
    );
    return this.fetchFromSSR();
  }

  // ---------------------------------------------------------------------------
  // Primary: Station-level data from the authenticated API
  // ---------------------------------------------------------------------------

  private async fetchFromAPI(
    apiKey: string,
  ): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];

    const baseHeaders: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "Propel/1.0",
    };

    // Try different auth header formats since the exact one is unknown
    const authVariants: Array<Record<string, string>> = [
      { Authorization: `Bearer ${apiKey}` },
      { "X-API-KEY": apiKey },
      { apiKey: apiKey },
    ];

    let data: APIStation[] | null = null;

    for (const authHeader of authVariants) {
      try {
        const res = await fetch(`${API_BASE}/stations`, {
          headers: { ...baseHeaders, ...authHeader },
          signal: AbortSignal.timeout(30_000),
        });

        if (res.ok) {
          data = await res.json();
          break;
        }

        if (res.status !== 401) {
          console.log(
            `[${this.source}] API returned ${res.status} with auth header: ${JSON.stringify(authHeader)}`,
          );
        }
      } catch {
        // Try next auth format
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!data) {
      console.log(
        `[${this.source}] API auth failed with all header formats — falling back to SSR`,
      );
      return this.fetchFromSSR();
    }

    for (const s of data) {
      if (!s.latitude || !s.longitude) continue;

      // Bounding-box filter
      if (
        s.latitude < LAT_MIN ||
        s.latitude > LAT_MAX ||
        s.longitude < LON_MIN ||
        s.longitude > LON_MAX
      ) {
        continue;
      }

      const externalId = `no-${s.id}`;

      stations.push({
        externalId,
        name: s.name?.trim() || `${s.brand ?? ""} ${s.city ?? ""}`.trim(),
        brand: s.brand?.trim() || null,
        address: s.address?.trim() || "",
        city: s.city?.trim() || "",
        province: s.county?.trim() || null,
        latitude: s.latitude,
        longitude: s.longitude,
        stationType: "fuel",
      });

      if (s.fuelPrices) {
        for (const fp of s.fuelPrices) {
          const fuelType = FUEL_TYPE_MAP.get(fp.fuelType);
          if (!fuelType) continue;
          if (fp.price <= 0) continue;

          prices.push({
            stationExternalId: externalId,
            fuelType,
            price: fp.price,
            currency: "NOK",
          });
        }
      }
    }

    console.log(
      `[${this.source}] API: ${stations.length} stations, ${prices.length} prices`,
    );
    return { stations, prices };
  }

  // ---------------------------------------------------------------------------
  // Fallback: Scrape brand-level averages from Nuxt SSR payload
  // ---------------------------------------------------------------------------
  // NOTE: This provides brand-level aggregate prices, not per-station data.
  // Stations are created as one virtual station per brand with a central
  // coordinate in Norway. This is a degraded mode for when no API key is
  // available. The data is still useful for average price comparisons.
  // ---------------------------------------------------------------------------

  private async fetchFromSSR(): Promise<{
    stations: RawStation[];
    prices: RawFuelPrice[];
  }> {
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];

    try {
      const res = await fetch(WEBSITE_URL, {
        headers: {
          Accept: "text/html",
          "User-Agent": "Propel/1.0",
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        throw new Error(`DrivstoffAppen website returned HTTP ${res.status}`);
      }

      const html = await res.text();

      // Extract the __NUXT__ SSR payload
      const nuxtMatch = html.match(
        /window\.__NUXT__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/,
      );
      if (!nuxtMatch) {
        throw new Error("Could not extract __NUXT__ payload from page");
      }

      // The NUXT payload is JavaScript — try to extract the brand prices data
      // It's stored under a key like "statistics-fuel-prices-by-brand-data"
      const brandPrices = this.extractBrandPrices(nuxtMatch[1]);

      if (brandPrices.length === 0) {
        throw new Error("No brand prices found in SSR payload");
      }

      console.log(
        `[${this.source}] SSR: Found ${brandPrices.length} brand price entries`,
      );

      // Group by brand
      const brandGroups = new Map<string, BrandPrice[]>();
      for (const bp of brandPrices) {
        const existing = brandGroups.get(bp.brandName) || [];
        existing.push(bp);
        brandGroups.set(bp.brandName, existing);
      }

      // Known brand headquarters / representative coordinates in Norway
      const BRAND_COORDS: ReadonlyMap<
        string,
        { lat: number; lon: number; city: string }
      > = new Map([
        ["Shell", { lat: 59.912, lon: 10.752, city: "Oslo" }],
        ["Esso", { lat: 59.912, lon: 10.752, city: "Oslo" }],
        ["Circle K", { lat: 59.912, lon: 10.752, city: "Oslo" }],
        ["Uno-X", { lat: 58.969, lon: 5.732, city: "Stavanger" }],
        ["Best", { lat: 60.392, lon: 5.324, city: "Bergen" }],
        ["YX", { lat: 63.431, lon: 10.395, city: "Trondheim" }],
        ["ST1", { lat: 59.912, lon: 10.752, city: "Oslo" }],
        ["Automat 1", { lat: 59.912, lon: 10.752, city: "Oslo" }],
      ]);
      const DEFAULT_COORD = { lat: 59.912, lon: 10.752, city: "Oslo" };

      for (const [brandName, brandEntries] of brandGroups) {
        const coord = BRAND_COORDS.get(brandName) || DEFAULT_COORD;
        const externalId = `no-brand-${brandName.toLowerCase().replace(/\s+/g, "-")}`;

        stations.push({
          externalId,
          name: `${brandName} (avg)`,
          brand: brandName,
          address: "",
          city: coord.city,
          province: null,
          latitude: coord.lat,
          longitude: coord.lon,
          stationType: "fuel",
        });

        for (const bp of brandEntries) {
          const fuelType = FUEL_TYPE_MAP.get(bp.fuelType);
          if (!fuelType) continue;
          if (bp.price <= 0) continue;

          prices.push({
            stationExternalId: externalId,
            fuelType,
            price: bp.price,
            currency: "NOK",
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${this.source}] SSR scrape failed: ${msg}`);
    }

    console.log(
      `[${this.source}] SSR fallback: ${stations.length} brand entries, ${prices.length} prices`,
    );
    return { stations, prices };
  }

  /**
   * Extract brand-level price data from the NUXT SSR payload string.
   *
   * The payload is a JS object literal. Brand prices are nested under a key
   * containing "fuel-prices-by-brand". We parse it heuristically since
   * full JS evaluation is not safe.
   */
  private extractBrandPrices(payload: string): BrandPrice[] {
    const results: BrandPrice[] = [];

    // Look for the brand-prices data array patterns in the payload
    // Pattern: brandName:"Shell",fuelType:"FT_D",price:26.15,...
    const entryRegex =
      /brandName:\s*"([^"]+)"[^}]*?fuelType:\s*"([^"]+)"[^}]*?price:\s*([0-9.]+)/g;
    let match;

    while ((match = entryRegex.exec(payload)) !== null) {
      const brandName = match[1];
      const fuelType = match[2];
      const price = parseFloat(match[3]);

      if (brandName && fuelType && !isNaN(price) && price > 0) {
        results.push({
          brandName,
          fuelType,
          price,
          date: new Date().toISOString().slice(0, 10),
        });
      }
    }

    // Deduplicate: keep the latest entry per brand + fuelType
    const deduped = new Map<string, BrandPrice>();
    for (const bp of results) {
      const key = `${bp.brandName}:${bp.fuelType}`;
      deduped.set(key, bp);
    }

    return Array.from(deduped.values());
  }
}
