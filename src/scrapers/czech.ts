import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Czech Republic — Fuelo.net (community-sourced fuel prices)
// ---------------------------------------------------------------------------
// 1. Clustering API returns all station IDs + coordinates for a bounding box.
// 2. Infowindow API returns per-station HTML with fuel names + prices.
// Prices in CZK. ~3,200 stations.
// Czech fuel types: Natural95 = E5, Natural98/Super Plus = E5_98, Nafta/Diesel = B7,
//                   LPG = LPG, CNG = CNG
// ---------------------------------------------------------------------------

const BASE_URL = "https://cz.fuelo.net";
const CLUSTERING_URL = `${BASE_URL}/ajax/get_gasstations_within_bounds_mysql_clustering`;
const INFOWINDOW_URL = `${BASE_URL}/ajax/get_infowindow_content`;

// Czech Republic bounding box
const LAT_MIN = 48.55;
const LAT_MAX = 51.06;
const LON_MIN = 12.09;
const LON_MAX = 18.87;

// Map fuelo.net fuel image filenames → harmonized EU types
const FUEL_IMG_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["gasoline", "E5"],         // Natural 95 / Super 95 / Efecta 95
  ["gasoline98", "E5_98"],    // Super Plus / Natural 98
  ["gasoline98plus", "E5_PREMIUM"], // Verva 100 / V-Power Racing
  ["diesel", "B7"],           // Nafta / Diesel / Efecta Diesel
  ["dieselplus", "B7_PREMIUM"], // Premium diesel / Verva Diesel / V-Power Diesel
  ["lpg", "LPG"],
  ["cng", "CNG"],
]);

const HEADERS = {
  "User-Agent": "Propel/1.0",
  "X-Requested-With": "XMLHttpRequest",
  Referer: `${BASE_URL}/`,
};

/** Concurrent request limiter */
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

interface ClusterStation {
  id: string;
  lat: string;
  lon: string;
  logo: string;
  cluster_count: string;
}

interface ClusterResponse {
  status: string;
  count: number;
  gasstations: ClusterStation[];
}

interface InfowindowResponse {
  status: string;
  text: string;
}

/** Parse prices from infowindow HTML title attributes.
 *  Format: title="FuelName: 36,17 CZK/l" or title="FuelName: 36,17 Kč/l"
 */
function parsePrices(
  html: string,
  stationExternalId: string,
): { name: string; brand: string | null; address: string; city: string; country: string; prices: RawFuelPrice[] } {
  const prices: RawFuelPrice[] = [];

  // Extract station name from <h4>
  const nameMatch = html.match(/<h4>([^<]+)<\/h4>/);
  const name = nameMatch?.[1]?.trim() ?? `Station ${stationExternalId}`;

  // Extract location from <h5>: "Country, City, Address"
  const locMatch = html.match(/<h5>([^<]+)<\/h5>/);
  const locParts = locMatch?.[1]?.split(",").map((s) => s.trim()) ?? [];
  const country = locParts[0] ?? "";
  const city = locParts[1] ?? "";
  const address = locParts.slice(2).join(", ");

  // Extract brand from first word of station name
  const brand = name.split(" ")[0] ?? null;

  // Parse fuel prices from img title attributes
  // Match: title="FuelName: 36,17 CZK/l" or title="FuelName: 36,17 Kč/l"
  const priceRegex = /src="\/img\/fuels\/default\/([^"]+)\.png"[^>]*title="[^:]+:\s*([\d,.]+)\s*([A-Za-zČčŽž]+)\/[^"]*"/g;
  let match: RegExpExecArray | null;

  while ((match = priceRegex.exec(html)) !== null) {
    const fuelImg = match[1];
    const priceStr = match[2].replace(",", ".");
    const currencyRaw = match[3];
    const price = parseFloat(priceStr);
    const fuelType = FUEL_IMG_MAP.get(fuelImg);

    // Normalize currency: "Kč" or "CZK" → "CZK"
    const currency = (currencyRaw === "Kč" || currencyRaw === "CZK") ? "CZK" : currencyRaw;

    if (fuelType && price > 0 && !isNaN(price)) {
      prices.push({
        stationExternalId,
        fuelType,
        price,
        currency,
      });
    }
  }

  return { name, brand, address, city, country, prices };
}

export class CzechScraper extends BaseScraper {
  readonly country = "CZ";
  readonly source = "fuelo";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    // Step 1: Get all station IDs + coordinates via clustering API
    console.log(`[${this.source}] Fetching CZ station list...`);

    const body = new URLSearchParams({
      lat_min: String(LAT_MIN),
      lat_max: String(LAT_MAX),
      lon_min: String(LON_MIN),
      lon_max: String(LON_MAX),
      zoom: "14",
    });

    const clusterRes = await fetch(CLUSTERING_URL, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(30_000),
    });

    if (!clusterRes.ok) throw new Error(`Fuelo clustering HTTP ${clusterRes.status}`);
    const clusterData: ClusterResponse = await clusterRes.json();

    // Filter to individual stations (not clusters) within CZ bounding box
    const rawStations = clusterData.gasstations.filter((s) => {
      const lat = parseFloat(s.lat);
      const lon = parseFloat(s.lon);
      return (
        s.cluster_count === "1" &&
        lat >= LAT_MIN && lat <= LAT_MAX &&
        lon >= LON_MIN && lon <= LON_MAX
      );
    });

    console.log(`[${this.source}] Found ${rawStations.length} stations in bounding box, fetching prices...`);

    // Step 2: Fetch prices for each station via infowindow API (concurrent, rate-limited)
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];
    let fetched = 0;
    let errors = 0;

    await pMap(
      rawStations,
      async (s) => {
        try {
          const res = await fetch(`${INFOWINDOW_URL}/${s.id}?lang=en`, {
            headers: HEADERS,
            signal: AbortSignal.timeout(15_000),
          });

          if (!res.ok) { errors++; return; }
          const data: InfowindowResponse = await res.json();
          if (data.status !== "OK") { errors++; return; }

          const parsed = parsePrices(data.text, s.id);

          // Filter to Czech Republic only (fuelo.net may include border stations from DE/AT/PL/SK)
          if (parsed.country !== "Czech Republic") return;

          // Only include stations that have at least one price
          if (parsed.prices.length === 0) return;

          const lat = parseFloat(s.lat);
          const lon = parseFloat(s.lon);

          stations.push({
            externalId: s.id,
            name: parsed.name,
            brand: parsed.brand,
            address: parsed.address,
            city: parsed.city,
            province: null,
            latitude: lat,
            longitude: lon,
            stationType: "fuel",
          });

          prices.push(...parsed.prices);
        } catch {
          errors++;
        }

        fetched++;
        if (fetched % 300 === 0) {
          console.log(`[${this.source}] Fetched ${fetched}/${rawStations.length} stations (${errors} errors)`);
        }

        // Rate limit: ~100ms between requests per worker
        await new Promise((r) => setTimeout(r, 100));
      },
      5, // 5 concurrent workers
    );

    console.log(`[${this.source}] Done: ${stations.length} stations, ${prices.length} prices (${errors} errors)`);
    return { stations, prices };
  }
}
