import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Italy — MIMIT (Ministero delle Imprese e del Made in Italy)
// ---------------------------------------------------------------------------
// Two CSV files (pipe-delimited):
//   1. anagrafica_impianti_attivi.csv — station registry (~23,600)
//   2. prezzo_alle_8.csv — latest prices
// Updated daily. No authentication needed.
// ---------------------------------------------------------------------------

const STATIONS_URL = "https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv";
const PRICES_URL = "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv";

// Italian fuel description → harmonized type
const FUEL_NAME_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["Benzina", "E5"],
  ["Benzina speciale", "E5_PREMIUM"],
  ["Gasolio", "B7"],
  ["Gasolio speciale", "B7_PREMIUM"],
  ["Gasolio Alpino", "B7"],
  ["GPL", "LPG"],
  ["Metano", "CNG"],
  ["GNL", "LNG"],
  ["L-GNC", "CNG"],
  ["HiQ Diesel", "B7_PREMIUM"],
  ["Blue Diesel", "B7_PREMIUM"],
  ["Blue Super", "E5_PREMIUM"],
  ["HiQ Perform+", "E5_PREMIUM"],
]);

function parseFuelType(raw: string): FuelType | null {
  const trimmed = raw.trim();
  // Exact match first
  const direct = FUEL_NAME_MAP.get(trimmed);
  if (direct) return direct;
  // Partial match for variants
  const lower = trimmed.toLowerCase();
  if (lower.includes("gasolio") || lower.includes("diesel")) return "B7";
  if (lower.includes("benzina") || lower.includes("super")) return "E5";
  if (lower.includes("gpl")) return "LPG";
  if (lower.includes("metano") || lower.includes("gnc")) return "CNG";
  if (lower.includes("gnl")) return "LNG";
  return null;
}

export class ItalyScraper extends BaseScraper {
  readonly country = "IT";
  readonly source = "mimit";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    // Fetch both CSVs in parallel
    const [stationsText, pricesText] = await Promise.all([
      fetch(STATIONS_URL, {
        headers: { "User-Agent": "Propel/1.0" },
        signal: AbortSignal.timeout(60_000),
      }).then((r) => { if (!r.ok) throw new Error(`MIMIT stations CSV HTTP ${r.status}`); return r.text(); }),
      fetch(PRICES_URL, {
        headers: { "User-Agent": "Propel/1.0" },
        signal: AbortSignal.timeout(60_000),
      }).then((r) => { if (!r.ok) throw new Error(`MIMIT prices CSV HTTP ${r.status}`); return r.text(); }),
    ]);

    // Parse stations CSV (pipe-delimited, skip first 2 lines)
    // Format: idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine
    const stations: RawStation[] = [];
    const stationLines = stationsText.split("\n");

    for (let i = 2; i < stationLines.length; i++) {
      const line = stationLines[i].trim();
      if (!line) continue;
      const parts = line.split("|");
      if (parts.length < 10) continue;

      const externalId = parts[0].trim();
      const brand = parts[2]?.trim() || null;
      const name = parts[4]?.trim() || "";
      const address = parts[5]?.trim() || "";
      const city = parts[6]?.trim() || "";
      const province = parts[7]?.trim() || null;
      const lat = parseFloat(parts[8]);
      const lon = parseFloat(parts[9]);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      // Italy bounding box
      if (lat < 35 || lat > 48 || lon < 6 || lon > 19) continue;

      stations.push({
        externalId,
        name: name || `${brand ?? ""} ${city}`.trim(),
        brand,
        address,
        city,
        province,
        latitude: lat,
        longitude: lon,
        stationType: "fuel",
      });
    }

    // Parse prices CSV (pipe-delimited, skip first 2 lines)
    // Format: idImpianto|descCarburante|prezzo|isSelf|dtComu
    const prices: RawFuelPrice[] = [];
    const priceLines = pricesText.split("\n");
    const stationIds = new Set(stations.map((s) => s.externalId));

    for (let i = 2; i < priceLines.length; i++) {
      const line = priceLines[i].trim();
      if (!line) continue;
      const parts = line.split("|");
      if (parts.length < 3) continue;

      const stationExternalId = parts[0].trim();
      if (!stationIds.has(stationExternalId)) continue;

      const fuelDesc = parts[1]?.trim() || "";
      const fuelType = parseFuelType(fuelDesc);
      if (!fuelType) continue;

      const price = parseFloat(parts[2]);
      if (!Number.isFinite(price) || price <= 0) continue;

      prices.push({ stationExternalId, fuelType, price, currency: "EUR" });
    }

    console.log(`[${this.source}] Parsed ${stations.length} stations, ${prices.length} prices from CSVs`);
    return { stations, prices };
  }
}
