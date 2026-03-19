import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Moldova — ANRE eCarburanți API
// ---------------------------------------------------------------------------
// Public REST API: GET https://api.ecarburanti.anre.md/public/
// Returns all fuel stations (PECO) in Moldova with current prices.
// No authentication required for the public endpoint.
//
// Prices in MDL (Moldovan Leu). ~750 stations.
// Fuel fields: diesel (motorină), gasoline (benzină), gpl (LPG).
// Coordinates are EPSG:3857 (Web Mercator) — must convert to WGS84.
// ---------------------------------------------------------------------------

const API_URL = "https://api.ecarburanti.anre.md/public/";

/** EPSG:3857 (Web Mercator) → EPSG:4326 (WGS84) */
function webMercatorToLatLon(x: number, y: number): { lat: number; lon: number } {
  const lon = (x / 20037508.342789244) * 180;
  const latRad = Math.atan(Math.exp((y / 20037508.342789244) * Math.PI));
  const lat = latRad * (360 / Math.PI) - 90;
  return { lat, lon };
}

interface ANREStation {
  x: number;
  y: number;
  station_type: number;
  station_status: number;
  fullstreet: string | null;
  addrnum: string | null;
  bua: string | null;
  lev2: string | null;
  lev1: string | null;
  station_name: string;
  idno: string;
  company_name: string;
  diesel: number | null;
  gasoline: number | null;
  gpl: number | null;
}

const FUEL_FIELDS: Array<{ field: keyof Pick<ANREStation, "diesel" | "gasoline" | "gpl">; fuelType: FuelType }> = [
  { field: "gasoline", fuelType: "E5" },
  { field: "diesel", fuelType: "B7" },
  { field: "gpl", fuelType: "LPG" },
];

export class MoldovaScraper extends BaseScraper {
  readonly country = "MD";
  readonly source = "anre_md";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const res = await fetch(API_URL, {
      headers: { Accept: "application/json", "User-Agent": "Propel/1.0" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`ANRE API HTTP ${res.status}`);
    const data: ANREStation[] = await res.json();

    console.log(`[${this.source}] Received ${data.length} stations from ANRE API`);

    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];

    for (const s of data) {
      // Skip inactive stations (status 4 = closed/inactive)
      if (s.station_status === 4) continue;
      if (!s.x || !s.y) continue;

      const { lat, lon } = webMercatorToLatLon(s.x, s.y);

      // Moldova bounding box sanity check
      if (lat < 45.4 || lat > 48.5 || lon < 26.6 || lon > 30.2) continue;

      const externalId = `anre_${s.idno}_${lat.toFixed(4)}_${lon.toFixed(4)}`;
      const address = [s.fullstreet, s.addrnum].filter(Boolean).join(" ") || "";
      const city = s.bua || s.lev1 || "";

      stations.push({
        externalId,
        name: s.station_name?.trim() || s.company_name?.trim() || `Station ${s.idno}`,
        brand: s.station_name?.trim() || null,
        address,
        city,
        province: s.lev2 || null,
        latitude: lat,
        longitude: lon,
        stationType: "fuel",
      });

      for (const { field, fuelType } of FUEL_FIELDS) {
        const price = s[field];
        if (price != null && price > 0) {
          prices.push({
            stationExternalId: externalId,
            fuelType,
            price,
            currency: "MDL",
          });
        }
      }
    }

    return { stations, prices };
  }
}
