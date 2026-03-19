import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Australia — WA FuelWatch RSS
// ---------------------------------------------------------------------------
// WA FuelWatch: RSS feed from Western Australia government.
// Free, no auth. Covers ~600 stations in WA.
// Prices in Australian cents per litre.
// Different Product IDs for different fuel types.
// URL: https://www.fuelwatch.wa.gov.au/fuelwatch/fuelWatchRSS
//
// Future: Add NSW FuelCheck, QLD API, SA SAFPIS for full coverage.
// ---------------------------------------------------------------------------

const FUELWATCH_BASE = "https://www.fuelwatch.wa.gov.au/fuelwatch/fuelWatchRSS";

/** FuelWatch Product IDs → harmonised fuel types */
const FUELWATCH_PRODUCTS: Array<{ productId: number; fuelType: FuelType }> = [
  { productId: 1, fuelType: "E10" },        // Unleaded Petrol (ULP)
  { productId: 2, fuelType: "E5_PREMIUM" },  // Premium ULP
  { productId: 4, fuelType: "B7" },          // Diesel
  { productId: 5, fuelType: "LPG" },         // LPG
  { productId: 6, fuelType: "E5_98" },       // 98 RON
  { productId: 11, fuelType: "B7_PREMIUM" }, // Premium Diesel
];

interface FuelWatchStation {
  tradingName: string;
  brand: string;
  address: string;
  location: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  price: number; // cents per litre
}

/** Parse FuelWatch RSS XML into station entries */
function parseFuelWatchRSS(xml: string): FuelWatchStation[] {
  const stations: FuelWatchStation[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const tag = (name: string): string => {
      const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
      return m?.[1]?.trim() || "";
    };

    const lat = parseFloat(tag("latitude"));
    const lon = parseFloat(tag("longitude"));
    const price = parseFloat(tag("price"));

    if (isNaN(lat) || isNaN(lon) || isNaN(price) || price <= 0) continue;

    stations.push({
      tradingName: tag("trading-name"),
      brand: tag("brand"),
      address: tag("address"),
      location: tag("location"),
      latitude: lat,
      longitude: lon,
      phone: tag("phone") || null,
      price,
    });
  }

  return stations;
}

export class AustraliaScraper extends BaseScraper {
  readonly country = "AU";
  readonly source = "fuelwatch_wa";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const stationMap = new Map<string, RawStation>();
    const prices: RawFuelPrice[] = [];

    for (const { productId, fuelType } of FUELWATCH_PRODUCTS) {
      try {
        const url = `${FUELWATCH_BASE}?Product=${productId}`;
        const res = await fetch(url, {
          headers: {
            Accept: "application/rss+xml, application/xml, text/xml",
            "User-Agent": "Propel/1.0",
          },
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
          console.log(`[${this.source}] Product ${productId} HTTP ${res.status}, skipping`);
          continue;
        }

        const xml = await res.text();
        const entries = parseFuelWatchRSS(xml);
        console.log(`[${this.source}] Product ${productId} (${fuelType}): ${entries.length} stations`);

        for (const s of entries) {
          // Australia WA bounding box
          if (s.latitude < -36 || s.latitude > -13 || s.longitude < 112 || s.longitude > 129) continue;

          const externalId = `fuelwatch_${s.tradingName.toLowerCase().replace(/\s+/g, "_")}_${s.latitude.toFixed(4)}_${s.longitude.toFixed(4)}`;

          if (!stationMap.has(externalId)) {
            stationMap.set(externalId, {
              externalId,
              name: s.tradingName || `${s.brand} ${s.location}`,
              brand: s.brand || null,
              address: s.address,
              city: s.location,
              province: "WA",
              latitude: s.latitude,
              longitude: s.longitude,
              stationType: "fuel",
            });
          }

          // FuelWatch prices are in cents/litre — convert to dollars/litre
          prices.push({
            stationExternalId: externalId,
            fuelType,
            price: s.price / 100,
            currency: "AUD",
          });
        }

        // Small delay between fuel type requests
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`[${this.source}] Product ${productId} error:`, err);
      }
    }

    return { stations: Array.from(stationMap.values()), prices };
  }
}
