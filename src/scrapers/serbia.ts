import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Serbia — NIS Gazprom station map + cenagoriva.rs brand-level prices
// ---------------------------------------------------------------------------
// Station data: nisgazprom.rs/benzinske-stanice/mapa/ embeds all NIS/Gazprom
// Petrol stations inline as `var bs = { items: "..." }` with lat/lon, address,
// and fuel availability (Goriva array). ~300+ stations.
//
// Price data: cenagoriva.rs provides brand-level prices (one price per chain
// per fuel type) for all major Serbian brands. Since Serbian fuel prices are
// government-regulated and uniform per brand, brand-level prices are accurate.
//
// NOTE: Only NIS Petrol / Gazprom Petrol stations have per-station locations.
// Other brands (OMV, MOL, EKO, Euro Petrol, Avia) are scraped as brand-level
// prices applied to the NIS network stations that carry matching fuel types.
// For non-NIS brands, we emit brand-level price entries without station data
// (they won't match any station and will be filtered out by base.ts).
//
// Currency: RSD (Serbian Dinar) — NOT in ECB rates, conversion handled separately.
// ---------------------------------------------------------------------------

const MAP_URL = "https://www.nisgazprom.rs/benzinske-stanice/mapa/";

// cenagoriva.rs fuel type pages and their harmonized mapping
const CENA_FUEL_PAGES: ReadonlyArray<{ path: string; fuelType: FuelType; label: string }> = [
  { path: "/",                   fuelType: "E5",         label: "BMB 95" },
  { path: "/bmb-100",           fuelType: "E5_98",      label: "BMB 100" },
  { path: "/bmb-premijum",      fuelType: "E5_PREMIUM", label: "BMB 95 Premium" },
  { path: "/evro-dizel",        fuelType: "B7",         label: "Evro Dizel" },
  { path: "/evro-dizel-premijum", fuelType: "B7_PREMIUM", label: "Evro Dizel Premium" },
  { path: "/tng",               fuelType: "LPG",        label: "TNG/LPG" },
];

// Map NIS Gazprom fuel names (from Goriva[].NazivRobe) to harmonized types
const NIS_FUEL_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["EVRO PREMIJUM BMB-95", "E5"],
  ["EBMB100 GDRIVE100", "E5_98"],
  ["G-DRIVE DIZEL", "B7_PREMIUM"],
  ["EVRO DIZEL", "B7"],
  ["AUTOGAS TNG", "LPG"],
  ["METAN CNG", "CNG"],
]);

// Serbia bounding box
const LAT_MIN = 42.2;
const LAT_MAX = 46.2;
const LON_MIN = 18.8;
const LON_MAX = 23.0;

interface NISStation {
  CompanyCode: string;
  Pj: string;
  Naziv: string;
  Adresa: string;
  Ptt: string;
  Mesto: string;
  Telefon: string;
  Brend: string;
  Latitude: number;
  Longitude: number;
  Goriva: Array<{
    SapSifra: string;
    OrfejSifra: string;
    NazivRobe: string;
  }>;
}

interface BrandPrice {
  brand: string;
  price: number;
}

export class SerbiaScraper extends BaseScraper {
  readonly country = "RS";
  readonly source = "nis_cenagoriva";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    // Step 1: Fetch station locations from NIS Gazprom map
    const nisStations = await this.fetchNISStations();
    console.log(`[${this.source}] Fetched ${nisStations.length} NIS/Gazprom stations`);

    // Step 2: Fetch brand-level prices from cenagoriva.rs
    const brandPrices = await this.fetchBrandPrices();
    console.log(`[${this.source}] Fetched prices for ${brandPrices.size} fuel types`);

    // Step 3: Combine — apply brand prices to stations based on fuel availability
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];

    for (const s of nisStations) {
      if (s.Latitude < LAT_MIN || s.Latitude > LAT_MAX) continue;
      if (s.Longitude < LON_MIN || s.Longitude > LON_MAX) continue;

      const externalId = `nis-${s.Pj}`;
      const brand = s.Brend?.trim() || "NIS Petrol";

      stations.push({
        externalId,
        name: s.Naziv?.trim() || `NIS ${s.Mesto}`,
        brand,
        address: s.Adresa?.trim() || "",
        city: s.Mesto?.trim() || "",
        province: null,
        latitude: s.Latitude,
        longitude: s.Longitude,
        stationType: "fuel",
      });

      // Determine which fuel types this station carries
      const stationFuelTypes = new Set<FuelType>();
      for (const g of s.Goriva || []) {
        const ft = NIS_FUEL_MAP.get(g.NazivRobe);
        if (ft) stationFuelTypes.add(ft);
      }

      // For each fuel type this station has, look up the brand-level price
      // NIS brand on cenagoriva.rs corresponds to both "NIS Petrol" and "Gazprom Petrol"
      for (const fuelType of Array.from(stationFuelTypes)) {
        const fuelPrices = brandPrices.get(fuelType);
        if (!fuelPrices) continue;

        // Try to find price for the station's brand
        const price = this.findBrandPrice(fuelPrices, brand);
        if (price != null && price > 0) {
          prices.push({
            stationExternalId: externalId,
            fuelType,
            price,
            currency: "RSD",
          });
        }
      }
    }

    console.log(`[${this.source}] Combined: ${stations.length} stations, ${prices.length} prices`);
    return { stations, prices };
  }

  /**
   * Fetch and parse station data from the NIS Gazprom interactive map page.
   * Station data is embedded in `var bs = { items: "[{...},{...},...]" }`.
   */
  private async fetchNISStations(): Promise<NISStation[]> {
    const res = await fetch(MAP_URL, {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; Propel/1.0)",
        "Accept-Language": "sr-RS,sr;q=0.9",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`NIS map page HTTP ${res.status}`);
    const html = await res.text();

    // Extract the bs.items JSON string from the page
    // Format: var bs = {"items":"[{\"CompanyCode\":\"1000\",...},...]"}
    const bsMatch = html.match(/var\s+bs\s*=\s*(\{[^;]*\})\s*;/);
    if (!bsMatch) throw new Error("Could not find station data (var bs) in NIS map page");

    let bsObj: { items: string };
    try {
      bsObj = JSON.parse(bsMatch[1]);
    } catch {
      throw new Error("Failed to parse bs object from NIS map page");
    }

    if (!bsObj.items) throw new Error("bs.items is empty in NIS map page");

    let stations: NISStation[];
    try {
      stations = JSON.parse(bsObj.items);
    } catch {
      throw new Error("Failed to parse bs.items JSON array");
    }

    return stations.filter(
      (s) => s.Latitude != null && s.Longitude != null && s.Latitude !== 0 && s.Longitude !== 0,
    );
  }

  /**
   * Scrape brand-level fuel prices from cenagoriva.rs.
   * Returns a map: FuelType -> array of { brand, price }.
   */
  private async fetchBrandPrices(): Promise<Map<FuelType, BrandPrice[]>> {
    const result = new Map<FuelType, BrandPrice[]>();

    for (const { path, fuelType, label } of CENA_FUEL_PAGES) {
      try {
        const url = `https://cenagoriva.rs${path}`;
        const res = await fetch(url, {
          headers: {
            Accept: "text/html",
            "User-Agent": "Mozilla/5.0 (compatible; Propel/1.0)",
            "Accept-Language": "sr-RS,sr;q=0.9",
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          console.log(`[${this.source}] Warning: cenagoriva.rs${path} returned HTTP ${res.status}`);
          continue;
        }

        const html = await res.text();
        const brandPrices = this.parseCenaGorivaPage(html);
        if (brandPrices.length > 0) {
          result.set(fuelType, brandPrices);
          console.log(
            `[${this.source}] ${label}: ${brandPrices.length} brands (${brandPrices.map((b) => `${b.brand}=${b.price}`).join(", ")})`,
          );
        }
      } catch (err) {
        console.log(`[${this.source}] Warning: failed to fetch ${label}: ${err instanceof Error ? err.message : err}`);
      }

      // Rate limit between page fetches
      await new Promise((r) => setTimeout(r, 200));
    }

    return result;
  }

  /**
   * Parse brand prices from a cenagoriva.rs fuel type page.
   * Prices are in <td class="price" data-price="186.00"> elements,
   * preceded by brand name cells.
   */
  private parseCenaGorivaPage(html: string): BrandPrice[] {
    const prices: BrandPrice[] = [];

    // Match brand rows: look for brand name + price in the table
    // Pattern: <td ...>BRAND_NAME</td> ... <td class="price" data-price="XXX.XX">
    const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*class="[^"]*brand[^"]*"[^>]*>[\s\S]*?(?:<a[^>]*>)?\s*([^<]+?)\s*(?:<\/a>)?[\s\S]*?<\/td>[\s\S]*?<td[^>]*class="[^"]*price[^"]*"[^>]*data-price="([^"]+)"[^>]*>/gi;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
      const brand = match[1].trim();
      const price = parseFloat(match[2]);
      if (brand && !isNaN(price) && price > 0) {
        prices.push({ brand, price });
      }
    }

    // Fallback: simpler regex if the above doesn't match the exact structure
    if (prices.length === 0) {
      const simplePriceRegex = /data-price="(\d+(?:\.\d+)?)"/g;
      const brandRegex = /<img[^>]*alt="([^"]+)"[^>]*class="[^"]*logo[^"]*"/gi;

      const priceMatches: number[] = [];
      let pm;
      while ((pm = simplePriceRegex.exec(html)) !== null) {
        const p = parseFloat(pm[1]);
        if (!isNaN(p)) priceMatches.push(p);
      }

      const brandMatches: string[] = [];
      let bm;
      while ((bm = brandRegex.exec(html)) !== null) {
        brandMatches.push(bm[1].trim());
      }

      // If we found equal numbers of brands and prices, pair them
      if (brandMatches.length > 0 && brandMatches.length === priceMatches.length) {
        for (let i = 0; i < brandMatches.length; i++) {
          if (priceMatches[i] > 0) {
            prices.push({ brand: brandMatches[i], price: priceMatches[i] });
          }
        }
      }
    }

    return prices;
  }

  /**
   * Find the best brand price for a station given its brand name.
   * NIS Petrol and Gazprom Petrol both use "NIS" pricing on cenagoriva.rs.
   */
  private findBrandPrice(brandPrices: BrandPrice[], stationBrand: string): number | null {
    const normalizedBrand = stationBrand.toLowerCase();

    // Direct match
    for (const bp of brandPrices) {
      if (bp.brand.toLowerCase() === normalizedBrand) return bp.price;
    }

    // NIS Petrol / Gazprom Petrol → "NIS" on cenagoriva.rs
    if (normalizedBrand.includes("nis") || normalizedBrand.includes("gazprom")) {
      for (const bp of brandPrices) {
        if (bp.brand.toLowerCase() === "nis") return bp.price;
      }
    }

    return null;
  }
}
