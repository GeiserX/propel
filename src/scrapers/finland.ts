import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Finland — Polttoaine.net (crowdsourced fuel price tracker)
// ---------------------------------------------------------------------------
// Data source: polttoaine.net — the leading Finnish fuel price comparison
// site with ~395 active stations. Crowdsourced prices (valid for 5 days).
//
// Approach:
// 1. Scrape city pages for station names, addresses, and prices
//    (95E10, 98E, Diesel). Each station has a unique map ID.
// 2. Fetch individual map pages to extract GPS coordinates from the
//    Google Maps embed: new google.maps.LatLng(lat, lon).
//
// Fuel type mapping:
//   95E10 → E10 (contains up to 10% ethanol)
//   98E   → E5_98 (98 octane, max 5% ethanol)
//   Di    → B7 (standard diesel)
//
// Currency: EUR (Finland uses the Euro).
// Finland bbox: lat 59.7-70.1, lon 20.5-31.6
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.polttoaine.net";

// Finland bounding box
const LAT_MIN = 59.7;
const LAT_MAX = 70.1;
const LON_MIN = 20.5;
const LON_MAX = 31.6;

// Major Finnish cities/municipalities to scrape — covers the populated areas.
// Sourced from polttoaine.net's city listing. Using URL-encoded forms.
const CITY_PAGES: ReadonlyArray<string> = [
  "Helsinki", "Espoo", "Vantaa", "Tampere", "Turku", "Oulu",
  "Jyva_skyla_", "Kuopio", "Lahti", "Rovaniemi", "Kotka", "Kouvola",
  "Vaasa", "Salo", "Mikkeli", "Raahe", "Rauma", "Savonlinna",
  "Seina_joki", "Ha_meenlinna", "Kokkola", "Imatra", "Kemi",
  "Riihima_ki", "Lohja", "Forssa", "Heinola", "Akaa",
  "Ja_rvenpa_a_", "Nurmija_rvi", "Tuusula", "Vihti", "Hollola",
  "Kangasala", "Pirkkala", "Lempa_a_la_", "Kaarina", "Raisio",
  "Naantali", "Lieto", "Kempele", "Liminka", "Ii",
  "Kuusamo", "Tornio", "Kittila_", "Inari",
  "A_a_nekoski", "Varkaus", "Nurmes", "Ylivieska", "Oulainen",
  "Alavus", "Lapua", "Ikaalinen", "Parkano", "Uusikaupunki",
  "Laitila", "Hanko", "Raasepori", "Ma_ntsa_la_", "Ka_rko_la_",
  "Nastola", "Asikkala", "Orivesi", "Paimio", "Masku",
  // Regional views (aggregated metro areas)
  "index.php?t=PK-Seutu",
  "index.php?t=Turun_seutu",
  "index.php?t=Tampereen_seutu",
  "index.php?t=Oulun_seutu",
  "index.php?t=Jyva_skyla_n_seutu",
  "index.php?t=Porin_seutu",
  "index.php?t=Seina_joen_seutu",
  // Major highways
  "1-tie", "3-tie", "4-tie", "5-tie", "7-tie", "8-tie", "9-tie",
];

interface PolttoaineStation {
  mapId: string;
  name: string;
  address: string;
  city: string;
  prices: Map<FuelType, number>;
}

export class FinlandScraper extends BaseScraper {
  readonly country = "FI";
  readonly source = "polttoaine";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    // Step 1: Scrape city pages for stations and prices
    const stationMap = new Map<string, PolttoaineStation>();
    await this.scrapeAllCityPages(stationMap);

    console.log(`[${this.source}] Found ${stationMap.size} unique stations across all city pages`);

    // Step 2: Fetch coordinates from individual map pages
    const coordMap = await this.fetchCoordinates(Array.from(stationMap.keys()));

    console.log(`[${this.source}] Retrieved coordinates for ${coordMap.size} stations`);

    // Step 3: Build output
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];

    for (const [mapId, station] of Array.from(stationMap.entries())) {
      const coords = coordMap.get(mapId);
      if (!coords) continue; // Skip stations without coordinates

      const { lat, lon } = coords;
      if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) continue;

      const externalId = `fi-${mapId}`;
      const brand = this.extractBrand(station.name);

      stations.push({
        externalId,
        name: station.name,
        brand,
        address: station.address,
        city: station.city,
        province: null,
        latitude: lat,
        longitude: lon,
        stationType: "fuel",
      });

      for (const [fuelType, price] of Array.from(station.prices.entries())) {
        if (price > 0) {
          prices.push({
            stationExternalId: externalId,
            fuelType,
            price,
            currency: "EUR",
          });
        }
      }
    }

    console.log(`[${this.source}] Final: ${stations.length} stations, ${prices.length} prices`);
    return { stations, prices };
  }

  /**
   * Scrape all city pages and collect station data.
   */
  private async scrapeAllCityPages(
    stationMap: Map<string, PolttoaineStation>,
  ): Promise<void> {
    let pagesScraped = 0;

    for (const page of CITY_PAGES) {
      try {
        const url = page.startsWith("index.php")
          ? `${BASE_URL}/${page}`
          : `${BASE_URL}/${page}`;

        const res = await fetch(url, {
          headers: {
            Accept: "text/html",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          console.log(`[${this.source}] Warning: ${page} returned HTTP ${res.status}`);
          continue;
        }

        const html = await res.text();
        const cityName = page.includes("?")
          ? page.split("=")[1]?.replace(/_/g, " ") || page
          : page.replace(/_/g, " ").replace(/a_/g, "a").replace(/o_/g, "o");

        const parsed = this.parseCityPage(html, cityName);

        for (const station of parsed) {
          // Merge: keep the freshest price for each fuel type
          const existing = stationMap.get(station.mapId);
          if (existing) {
            for (const [ft, price] of Array.from(station.prices.entries())) {
              if (price > 0) {
                existing.prices.set(ft, price);
              }
            }
          } else {
            stationMap.set(station.mapId, station);
          }
        }

        pagesScraped++;
        if (pagesScraped % 10 === 0) {
          console.log(
            `[${this.source}] Scraped ${pagesScraped}/${CITY_PAGES.length} pages, ${stationMap.size} unique stations`,
          );
        }
      } catch (err) {
        // Skip failed pages silently
      }

      // Rate limit: 100ms between requests
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /**
   * Parse station data from a polttoaine.net city page.
   *
   * HTML structure:
   *   <tr>
   *     <td>N.</td>
   *     <td><a href="/index.php?cmd=map&id=XXXX">Station Name</a> Address</td>
   *     <td>DD.MM.</td>
   *     <td>1.234</td>  (95E10)
   *     <td>1.234</td>  (98E)
   *     <td>1.234</td>  (Diesel)
   *   </tr>
   */
  private parseCityPage(html: string, city: string): PolttoaineStation[] {
    const stations: PolttoaineStation[] = [];

    // Match table rows containing station data with map links
    // Pattern: <a href="/index.php?cmd=map&id=XXXX">NAME</a> ADDRESS ... prices
    const rowRegex = /<tr[^>]*>\s*<td[^>]*>\s*\d+\.\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;

    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const stationCell = match[1];
      const price95 = this.extractPrice(match[2]);
      const price98 = this.extractPrice(match[3]);
      const priceDi = this.extractPrice(match[4]);

      // Extract map ID and station name from the station cell
      const linkMatch = stationCell.match(
        /<a[^>]*href="[^"]*cmd=map&(?:amp;)?id=(\d+)"[^>]*>([^<]+)<\/a>/i,
      );
      if (!linkMatch) continue;

      const mapId = linkMatch[1];
      const name = linkMatch[2].trim();

      // Extract address: text after the </a> tag
      const afterLink = stationCell.replace(/<a[^>]*>[^<]*<\/a>/i, "").trim();
      const address = afterLink
        .replace(/<[^>]+>/g, "")  // strip remaining HTML
        .replace(/\s+/g, " ")
        .trim();

      const priceMap = new Map<FuelType, number>();
      if (price95 != null) priceMap.set("E10", price95);
      if (price98 != null) priceMap.set("E5_98", price98);
      if (priceDi != null) priceMap.set("B7", priceDi);

      if (priceMap.size > 0) {
        stations.push({
          mapId,
          name,
          address,
          city,
          prices: priceMap,
        });
      }
    }

    return stations;
  }

  /**
   * Extract a price from an HTML cell.
   * Handles: "1.234", "*1.234" (V-Power marker), "-" or empty = no data.
   */
  private extractPrice(cellHtml: string): number | null {
    const text = cellHtml.replace(/<[^>]+>/g, "").trim();
    if (!text || text === "-" || text === "") return null;

    // Remove leading asterisk (marks V-Power/premium variant)
    const cleaned = text.replace(/^\*/, "").trim();
    const price = parseFloat(cleaned);
    if (isNaN(price) || price <= 0) return null;

    // Sanity check: Finnish fuel prices should be between 0.80 and 4.00 EUR
    if (price < 0.80 || price > 4.00) return null;

    return price;
  }

  /**
   * Fetch GPS coordinates from individual station map pages.
   * Each map page contains: new google.maps.LatLng(LAT, LON)
   */
  private async fetchCoordinates(
    mapIds: string[],
  ): Promise<Map<string, { lat: number; lon: number }>> {
    const coords = new Map<string, { lat: number; lon: number }>();
    let fetched = 0;
    let errors = 0;

    for (const mapId of mapIds) {
      try {
        const url = `${BASE_URL}/index.php?cmd=map&id=${mapId}`;
        const res = await fetch(url, {
          headers: {
            Accept: "text/html",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          errors++;
          continue;
        }

        const html = await res.text();

        // Extract coordinates from Google Maps initialization
        const coordMatch = html.match(
          /new\s+google\.maps\.LatLng\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/,
        );
        if (coordMatch) {
          const lat = parseFloat(coordMatch[1]);
          const lon = parseFloat(coordMatch[2]);
          if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
            coords.set(mapId, { lat, lon });
          }
        }
      } catch {
        errors++;
      }

      fetched++;
      if (fetched % 50 === 0) {
        console.log(
          `[${this.source}] Coordinates: ${fetched}/${mapIds.length} fetched, ${coords.size} resolved, ${errors} errors`,
        );
      }

      // Rate limit: 100ms between requests (be respectful to crowdsourced site)
      await new Promise((r) => setTimeout(r, 100));
    }

    return coords;
  }

  /**
   * Extract brand name from station name.
   * Finnish station names follow the pattern: "Brand, Location"
   * or "Brand Station_Type, Location".
   */
  private extractBrand(name: string): string | null {
    // Known Finnish fuel station brands
    const brands = [
      "ABC", "ABC Deli", "Neste Oil Express", "Neste Oil", "Neste Express",
      "Neste", "Shell Express", "ShellExpress", "Shell", "St1", "Teboil Express",
      "Teboil", "Seo", "Esso", "Gulf", "Futura", "Nex", "A24", "Ysi5", "Ritoil",
    ];

    const nameLower = name.toLowerCase();
    // Check longest brand names first (to match "Neste Oil Express" before "Neste")
    for (const brand of brands) {
      if (nameLower.startsWith(brand.toLowerCase())) {
        return brand;
      }
    }

    // Fallback: take first word before comma
    const commaIdx = name.indexOf(",");
    if (commaIdx > 0) {
      return name.substring(0, commaIdx).trim();
    }

    return null;
  }
}
