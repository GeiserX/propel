import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Greece — FuelGR (deixto.gr) API
// ---------------------------------------------------------------------------
// Reverse-engineered Android app API. Returns stations in XML within a
// 30km radius of given coordinates. We cover Greece with a grid.
// Prices in EUR. Multiple fuel types queried separately.
// ---------------------------------------------------------------------------

const BASE_URL = "https://deixto.gr/fuel/get_data_v4.php";
const DEV = "android.4.0-b2da2cf97330ca3b";
const DSIG = "google/coral/coral:14/UQ1A.240205.004/1709778835:userdebug/release-keys";
const APKSIG = "UPJ2YQunu9eGXu8a/WOiVNAZlYA=";

// Fuel type parameter values and their EU harmonized mappings
const FUEL_QUERIES: ReadonlyArray<{ f: string; fuelType: FuelType }> = [
  { f: "1", fuelType: "E5" },       // 95 octane
  { f: "4", fuelType: "B7" },       // Diesel
  { f: "2", fuelType: "E5_98" },    // 98-100 octane
  { f: "6", fuelType: "LPG" },      // LPG
];

// Grid of coordinates covering Greece (~132,000 km²)
// Greece bbox: lat 34.8-41.8, lon 19.3-29.7 (including islands)
// With 30km radius circles (~60km diameter), we need ~0.54° lat and ~0.65° lon steps
function generateGrid(): Array<{ lat: number; lon: number }> {
  const grid: Array<{ lat: number; lon: number }> = [];
  for (let lat = 34.8; lat <= 41.8; lat += 0.50) {
    for (let lon = 19.3; lon <= 29.7; lon += 0.60) {
      grid.push({
        lat: Math.round(lat * 100) / 100,
        lon: Math.round(lon * 100) / 100,
      });
    }
  }
  return grid;
}

interface FuelGRStation {
  id: string;
  lat: number;
  lng: number;
  brand: string;
  address?: string;
  county?: string;
  municipality?: string;
  price: number;
}

// Parse FuelGR XML response — actual price is in <ft pr="X.XXX"> inside <fts>
function parseXML(xml: string): FuelGRStation[] {
  const stations: FuelGRStation[] = [];
  const gsRegex = /<gs\s+id="(\d+)"([^>]*)>([\s\S]*?)<\/gs>/g;
  let match;

  while ((match = gsRegex.exec(xml)) !== null) {
    const id = match[1];
    const attrs = match[2];
    const body = match[3];

    const getTag = (tag: string): string => {
      // Handle both plain text and CDATA content
      const m = body.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([^\\]]*?)\\]\\]>|([^<]*))</${tag}>`));
      return m ? (m[1] || m[2] || "").trim() : "";
    };

    const lat = parseFloat(getTag("lt"));
    const lng = parseFloat(getTag("lg"));
    if (isNaN(lat) || isNaN(lng)) continue;

    // Price is in <ft pr="X.XXX"> tag
    const ftMatch = body.match(/<ft[^>]+pr="([^"]+)"/);
    if (!ftMatch) continue;
    const price = parseFloat(ftMatch[1]);
    if (isNaN(price) || price <= 0) continue;

    // Extract county from <gs> attributes
    const cntMatch = attrs.match(/cnt="([^"]*)"/);

    // Brand text content (may include CDATA)
    const brMatch = body.match(/<br[^>]*>(?:<!\[CDATA\[([^\]]*?)\]\]>|([^<]*))<\/br>/);
    const brand = (brMatch ? (brMatch[1] || brMatch[2] || "").trim() : "");

    stations.push({
      id,
      lat,
      lng,
      brand,
      address: getTag("ad") || undefined,
      county: cntMatch ? cntMatch[1] : undefined,
      municipality: undefined,
      price,
    });
  }

  return stations;
}

export class GreeceScraper extends BaseScraper {
  readonly country = "GR";
  readonly source = "fuelgr";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const grid = generateGrid();
    const stationMap = new Map<string, RawStation>();
    const priceMap = new Map<string, RawFuelPrice>();
    let totalQueries = 0;

    for (const fuelQuery of FUEL_QUERIES) {
      for (let i = 0; i < grid.length; i++) {
        const { lat, lon } = grid[i];
        const url = `${BASE_URL}?dev=${DEV}&lat=${lat}&long=${lon}&f=${fuelQuery.f}&b=0&d=30&p=0&dSig=${encodeURIComponent(DSIG)}&iLoc=unknown&apkSig=${encodeURIComponent(APKSIG)}`;

        try {
          const res = await fetch(url, {
            headers: { Accept: "application/xml", "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 13)" },
            signal: AbortSignal.timeout(15_000),
          });

          if (!res.ok) {
            if (res.status === 429) {
              await new Promise((r) => setTimeout(r, 5_000));
              continue;
            }
            continue;
          }

          const xml = await res.text();
          const parsed = parseXML(xml);

          for (const s of parsed) {
            // Greece bounding box
            if (s.lat < 34.5 || s.lat > 42.0 || s.lng < 19.0 || s.lng > 30.0) continue;

            if (!stationMap.has(s.id)) {
              stationMap.set(s.id, {
                externalId: s.id,
                name: s.brand || `Station ${s.id}`,
                brand: s.brand || null,
                address: s.address || "",
                city: "",
                province: s.county || null,
                latitude: s.lat,
                longitude: s.lng,
                stationType: "fuel",
              });
            }

            const key = `${s.id}:${fuelQuery.fuelType}`;
            if (!priceMap.has(key)) {
              priceMap.set(key, {
                stationExternalId: s.id,
                fuelType: fuelQuery.fuelType,
                price: s.price,
                currency: "EUR",
              });
            }
          }
        } catch {
          // Skip failed queries silently
        }

        totalQueries++;
        if (totalQueries % 100 === 0) {
          console.log(`[${this.source}] Progress: ${totalQueries} queries, ${stationMap.size} unique stations`);
        }

        // Rate limit: 150ms between requests
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    console.log(`[${this.source}] Completed ${totalQueries} queries, ${stationMap.size} stations`);
    return {
      stations: Array.from(stationMap.values()),
      prices: Array.from(priceMap.values()),
    };
  }
}
