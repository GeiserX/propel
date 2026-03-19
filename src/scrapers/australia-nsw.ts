import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Australia NSW — FuelCheck API (api.onegov.nsw.gov.au)
// ---------------------------------------------------------------------------
// NSW Government Fuel API. OAuth2 client credentials flow.
// Returns ~3,200 stations with ~10,000 price rows.
// Prices in Australian cents per litre.
//
// Auth flow:
//   1. GET /oauth/client_credential/accesstoken?grant_type=client_credentials
//      with Basic auth header (base64 of apikey:secret)
//      → returns JSON with access_token (valid ~12h)
//   2. Use Bearer token + apikey header on subsequent requests
//
// Endpoint: GET /FuelPriceCheck/v1/fuel/prices
//   Returns { stations: Station[], prices: Price[] }
//   Stations linked to prices via station.code = price.stationcode
//
// Env: NSW_FUEL_API_KEY, NSW_FUEL_API_SECRET (or NSW_FUEL_AUTH_BASIC)
// Rate limit: 2,500 calls/month (free tier)
// ---------------------------------------------------------------------------

const AUTH_URL = "https://api.onegov.nsw.gov.au/oauth/client_credential/accesstoken?grant_type=client_credentials";
const PRICES_URL = "https://api.onegov.nsw.gov.au/FuelPriceCheck/v1/fuel/prices";

/** NSW fuel type codes → harmonised types */
const FUEL_MAP: Record<string, FuelType> = {
  U91: "E5",          // Unleaded 91
  E10: "E10",         // Ethanol 10
  P95: "E5_PREMIUM",  // Premium 95
  P98: "E5_98",       // Premium 98
  DL: "B7",           // Diesel
  PDL: "B7_PREMIUM",  // Premium Diesel
  LPG: "LPG",
  B20: "B10",         // Biodiesel B20 → closest standard
};

interface NSWStation {
  brandid: string;
  stationid: string;
  brand: string;
  code: string;
  name: string;
  address: string;
  location: { latitude: number; longitude: number };
}

interface NSWPrice {
  stationcode: string;
  fueltype: string;
  price: number; // cents per litre
  lastupdated: string;
}

interface NSWResponse {
  stations: NSWStation[];
  prices: NSWPrice[];
}

export class AustraliaNSWScraper extends BaseScraper {
  readonly country = "AU";
  readonly source = "nsw_fuelcheck";

  private async getAccessToken(): Promise<string> {
    const apiKey = process.env.NSW_FUEL_API_KEY;
    const apiSecret = process.env.NSW_FUEL_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error("NSW_FUEL_API_KEY and NSW_FUEL_API_SECRET must be set");
    }

    const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    const res = await fetch(AUTH_URL, {
      headers: {
        Authorization: `Basic ${basic}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`NSW auth HTTP ${res.status}`);
    const data = await res.json() as { access_token: string };

    if (!data.access_token) throw new Error("NSW auth: no access_token in response");
    return data.access_token;
  }

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const token = await this.getAccessToken();
    const apiKey = process.env.NSW_FUEL_API_KEY!;

    const now = new Date();
    const ts = now.toLocaleString("en-AU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: true,
    });

    const res = await fetch(PRICES_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: apiKey,
        transactionid: `propel_${Date.now()}`,
        requesttimestamp: ts,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) throw new Error(`NSW prices HTTP ${res.status}`);
    const data = await res.json() as NSWResponse;

    console.log(`[${this.source}] API returned ${data.stations.length} stations, ${data.prices.length} prices`);

    // Build station code → station lookup
    const stationByCode = new Map<string, NSWStation>();
    for (const s of data.stations) {
      stationByCode.set(s.code, s);
    }

    // Build stations
    const stationMap = new Map<string, RawStation>();
    for (const s of data.stations) {
      const lat = s.location?.latitude;
      const lon = s.location?.longitude;
      if (!lat || !lon) continue;
      // Australia bounding box
      if (lat < -44 || lat > -10 || lon < 112 || lon > 154) continue;

      const externalId = `nsw_${s.code}`;
      stationMap.set(s.code, {
        externalId,
        name: s.name || `${s.brand} ${s.code}`,
        brand: s.brand || null,
        address: s.address || "",
        city: extractSuburb(s.address),
        province: "NSW",
        latitude: lat,
        longitude: lon,
        stationType: "fuel",
      });
    }

    // Build prices
    const prices: RawFuelPrice[] = [];
    for (const p of data.prices) {
      const fuelType = FUEL_MAP[p.fueltype];
      if (!fuelType) continue;

      const station = stationMap.get(p.stationcode);
      if (!station) continue;

      if (p.price <= 0) continue;

      prices.push({
        stationExternalId: station.externalId,
        fuelType,
        price: p.price / 100, // cents → dollars
        currency: "AUD",
      });
    }

    return { stations: Array.from(stationMap.values()), prices };
  }
}

/** Extract suburb from NSW address format: "123 Street, SUBURB NSW 2000" */
function extractSuburb(address: string): string {
  // Match the suburb part before the NSW/postcode
  const m = address.match(/,\s*([A-Z\s]+?)\s+NSW\s+\d{4}/);
  return m?.[1]?.trim() || "";
}
