import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Sweden — Bensinpriser.nu scraper
// ---------------------------------------------------------------------------
// Bensinpriser.nu is a community-driven Swedish fuel price comparison site.
// No public JSON API — data is scraped from server-rendered HTML pages.
//
// List pages: /stationer/{fuel}/alla/alla/{page}  (14 stations per page)
//   - Fuel slugs: 95 (E10), 98 (E5), diesel, etanol, fordonsgas, biodiesel
//   - Pages: 0..~15 per fuel type (wraps around after last page)
//
// Detail pages: /station/{county}/{municipality}/{slug}
//   - Contains Google Maps link with lat/lon coordinates
//   - Station name, brand, address, phone, all fuel prices
//
// Prices in SEK (Swedish Krona). User-reported (7-day expiry).
// ---------------------------------------------------------------------------

const BASE_URL = "https://bensinpriser.nu";

// Sweden bounding box (focus on populated areas)
const LAT_MIN = 55.3;
const LAT_MAX = 69.1;
const LON_MIN = 11.0;
const LON_MAX = 24.2;

// Max pages to fetch per fuel type (stops when duplicates detected)
const MAX_PAGES = 25;

// Fuel type slugs used in bensinpriser.nu URLs
const FUEL_SLUGS: ReadonlyArray<{ slug: string; fuelType: FuelType }> = [
  { slug: "95", fuelType: "E10" }, // 95 is E10 in Sweden
  { slug: "98", fuelType: "E5_98" },
  { slug: "diesel", fuelType: "B7" },
  // etanol (E85) and fordonsgas (CNG) are not in the FuelType enum
  // biodiesel maps to HVO
  { slug: "biodiesel", fuelType: "HVO" },
];

// ---------------------------------------------------------------------------
// HTML parsing helpers (no DOM — regex-based for server-side Node.js)
// ---------------------------------------------------------------------------

interface ListPageStation {
  slug: string; // detail page path e.g. /station/kalmar-lan/vastervik/allen-54
  brand: string;
  city: string;
  address: string;
  price: number;
}

/** Parse the station list page HTML and extract station rows. */
function parseListPage(html: string): ListPageStation[] {
  const stations: ListPageStation[] = [];
  // Match table rows with data-href pointing to station detail pages
  const rowRegex =
    /data-href="(\/station\/[^"]+)"[\s\S]*?<b>([^<]*?)(?:\s*<small>([^<]*?)<\/small>)?<\/b>[\s\S]*?<br\s*\/?>([^<]*?)<\/td>[\s\S]*?<b[^>]*>([0-9]+,[0-9]+)kr<\/b>/g;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const slug = match[1];
    const brand = match[2].trim();
    const city = (match[3] || "").trim();
    const address = match[4].trim();
    const priceStr = match[5].replace(",", ".");
    const price = parseFloat(priceStr);

    if (slug && !isNaN(price) && price > 0) {
      stations.push({ slug, brand, city, address, price });
    }
  }

  return stations;
}

/** Extract coordinates from a station detail page HTML. */
function parseDetailCoords(
  html: string,
): { lat: number; lon: number } | null {
  // Google Maps link: daddr=57.7596978, 16.6168694
  const coordMatch = html.match(
    /daddr=(-?[0-9]+\.[0-9]+),\s*(-?[0-9]+\.[0-9]+)/,
  );
  if (!coordMatch) return null;

  const lat = parseFloat(coordMatch[1]);
  const lon = parseFloat(coordMatch[2]);
  if (isNaN(lat) || isNaN(lon)) return null;

  return { lat, lon };
}

// ---------------------------------------------------------------------------
// Scraper
// ---------------------------------------------------------------------------

export class SwedenScraper extends BaseScraper {
  readonly country = "SE";
  readonly source = "bensinpriser_nu";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    // Phase 1: Collect station slugs + prices from list pages
    const stationPriceMap = new Map<
      string,
      {
        brand: string;
        city: string;
        address: string;
        prices: Map<FuelType, number>;
      }
    >();

    for (const { slug: fuelSlug, fuelType } of FUEL_SLUGS) {
      const seenSlugsThisFuel = new Set<string>();
      let consecutiveDuplicatePages = 0;

      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${BASE_URL}/stationer/${fuelSlug}/alla/alla/${page}`;

        try {
          const res = await fetch(url, {
            headers: {
              Accept: "text/html",
              "User-Agent": "Propel/1.0",
            },
            signal: AbortSignal.timeout(15_000),
          });

          if (!res.ok) break;
          const html = await res.text();
          const rows = parseListPage(html);

          if (rows.length === 0) break;

          // Check for page wrap-around (all slugs already seen)
          let allSeen = true;
          for (const row of rows) {
            if (!seenSlugsThisFuel.has(row.slug)) {
              allSeen = false;
              seenSlugsThisFuel.add(row.slug);
            }
          }

          if (allSeen) {
            consecutiveDuplicatePages++;
            if (consecutiveDuplicatePages >= 2) {
              break; // Two consecutive duplicate pages → data has wrapped
            }
          } else {
            consecutiveDuplicatePages = 0;
          }

          // Merge station data
          for (const row of rows) {
            let entry = stationPriceMap.get(row.slug);
            if (!entry) {
              entry = {
                brand: row.brand,
                city: row.city,
                address: row.address,
                prices: new Map(),
              };
              stationPriceMap.set(row.slug, entry);
            }
            // Keep the cheapest observed price per fuel type
            const existing = entry.prices.get(fuelType);
            if (!existing || row.price < existing) {
              entry.prices.set(fuelType, row.price);
            }
          }
        } catch {
          // Skip failed page
        }

        // Rate limit: 100ms between list page requests
        await new Promise((r) => setTimeout(r, 100));
      }

      console.log(
        `[${this.source}] After ${fuelSlug}: ${seenSlugsThisFuel.size} stations found`,
      );
    }

    console.log(
      `[${this.source}] Total unique station slugs: ${stationPriceMap.size}`,
    );

    // Phase 2: Fetch detail pages for coordinates
    // Batch detail fetches with rate limiting
    const stationSlugs = Array.from(stationPriceMap.keys());
    const coordsMap = new Map<string, { lat: number; lon: number }>();
    let fetchedDetails = 0;
    let failedDetails = 0;

    for (const slug of stationSlugs) {
      const url = `${BASE_URL}${slug}`;

      try {
        const res = await fetch(url, {
          headers: {
            Accept: "text/html",
            "User-Agent": "Propel/1.0",
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          const html = await res.text();
          const coords = parseDetailCoords(html);
          if (coords) {
            coordsMap.set(slug, coords);
          }
        }
      } catch {
        failedDetails++;
      }

      fetchedDetails++;
      if (fetchedDetails % 50 === 0) {
        console.log(
          `[${this.source}] Detail progress: ${fetchedDetails}/${stationSlugs.length} ` +
            `(${coordsMap.size} with coords, ${failedDetails} failed)`,
        );
      }

      // Rate limit: 150ms between detail page requests
      await new Promise((r) => setTimeout(r, 150));
    }

    console.log(
      `[${this.source}] Detail pages: ${coordsMap.size}/${stationSlugs.length} with coordinates`,
    );

    // Phase 3: Build output (only stations with valid coordinates)
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];

    for (const [slug, entry] of stationPriceMap) {
      const coords = coordsMap.get(slug);
      if (!coords) continue; // Skip stations without coordinates

      // Bounding-box filter
      if (
        coords.lat < LAT_MIN ||
        coords.lat > LAT_MAX ||
        coords.lon < LON_MIN ||
        coords.lon > LON_MAX
      ) {
        continue;
      }

      // Use the slug as the external ID (stable, human-readable)
      const externalId = slug.replace("/station/", "se-");

      stations.push({
        externalId,
        name: entry.brand
          ? `${entry.brand} ${entry.city}`.trim()
          : entry.address || slug.split("/").pop() || "Unknown",
        brand: entry.brand || null,
        address: entry.address || "",
        city: entry.city || "",
        province: slug.split("/")[2]?.replace(/-/g, " ") || null, // county from URL
        latitude: coords.lat,
        longitude: coords.lon,
        stationType: "fuel",
      });

      for (const [fuelType, price] of entry.prices) {
        prices.push({
          stationExternalId: externalId,
          fuelType,
          price,
          currency: "SEK",
        });
      }
    }

    console.log(
      `[${this.source}] Final: ${stations.length} stations, ${prices.length} prices`,
    );
    return { stations, prices };
  }
}
