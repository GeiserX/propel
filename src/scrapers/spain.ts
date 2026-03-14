import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Spain MITECO REST API scraper
// ---------------------------------------------------------------------------
// Endpoint: https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/
// Returns ~12 000 fuel stations with embedded prices.
// IMPORTANT: The API uses comma as decimal separator for coords AND prices.
// ---------------------------------------------------------------------------

const MITECO_URL =
  "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";

/**
 * Map from Spanish MITECO price field names to EU harmonized fuel codes.
 * Only the types we care about — the API has many more niche fields.
 */
const FUEL_FIELD_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["Precio Gasoleo A", "B7"],
  ["Precio Gasoleo Premium", "B7_PREMIUM"],
  ["Precio Gasolina 95 E5", "E5"],
  ["Precio Gasolina 95 E10", "E10"],
  ["Precio Gasolina 98 E5", "E5_98"],
  ["Precio Gas Licuado del Petróleo", "LPG"],
  // Alternate key used in some API responses
  ["Precio GLP", "LPG"],
  ["Precio Gas Natural Comprimido", "CNG"],
  ["Precio Hidrogeno", "H2"],
]);

/** Shape of a single element in `ListaEESSPrecio` from the MITECO API. */
interface MitecoStation {
  IDEESS: string;
  "Rótulo": string;
  "Dirección": string;
  Municipio: string;
  Provincia: string;
  "C.P.": string;
  Latitud: string;
  "Longitud (WGS84)": string;
  // Margin type (D = direct, R = reseller)
  "Tipo Venta": string;
  // Price fields — all strings with comma decimal sep, or empty
  "Precio Gasoleo A": string;
  "Precio Gasoleo Premium": string;
  "Precio Gasolina 95 E5": string;
  "Precio Gasolina 95 E10": string;
  "Precio Gasolina 98 E5": string;
  "Precio Gas Licuado del Petróleo": string;
  "Precio Gas Natural Comprimido": string;
  "Precio Hidrogeno": string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface MitecoResponse {
  Fecha: string;
  ListaEESSPrecio: MitecoStation[];
  Nota: string;
  ResultadoConsulta: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Spanish-format decimal string ("38,1234" -> 38.1234).
 * Returns `null` for empty or non-numeric values.
 */
function parseSpanishDecimal(raw: string | undefined | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const normalised = raw.replace(",", ".");
  const num = Number(normalised);
  return Number.isFinite(num) ? num : null;
}

/**
 * Clean and title-case a Spanish name/brand string.
 * E.g. "REPSOL  " -> "Repsol", "CEPSA" -> "Cepsa"
 */
function cleanName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Scraper class
// ---------------------------------------------------------------------------

export class SpainScraper extends BaseScraper {
  readonly country = "ES";
  readonly source = "miteco";

  async fetch(): Promise<{
    stations: RawStation[];
    prices: RawFuelPrice[];
  }> {
    const response = await fetch(MITECO_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propel/1.0 (https://propel.geiser.cloud)",
      },
      // 60-second timeout — the endpoint can be slow
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(
        `MITECO API responded with HTTP ${response.status}: ${response.statusText}`,
      );
    }

    const data: MitecoResponse = await response.json();

    if (data.ResultadoConsulta !== "OK") {
      throw new Error(
        `MITECO API error: ResultadoConsulta = "${data.ResultadoConsulta}"`,
      );
    }

    const rawList = data.ListaEESSPrecio;
    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw new Error("MITECO API returned empty ListaEESSPrecio");
    }

    console.log(
      `[miteco] API date: ${data.Fecha}, stations in response: ${rawList.length}`,
    );

    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];
    let skippedCoords = 0;

    for (const raw of rawList) {
      // --- Parse coordinates ---
      const lat = parseSpanishDecimal(raw.Latitud);
      const lon = parseSpanishDecimal(raw["Longitud (WGS84)"]);

      if (lat === null || lon === null) {
        skippedCoords++;
        continue;
      }

      // Sanity check: Spain bounding box roughly [-19, 27] to [5, 44]
      if (lat < 25 || lat > 45 || lon < -20 || lon > 6) {
        skippedCoords++;
        continue;
      }

      const externalId = raw.IDEESS.trim();

      stations.push({
        externalId,
        name: cleanName(raw["Rótulo"]),
        brand: raw["Rótulo"]?.trim() || null,
        address: raw["Dirección"]?.trim() || "",
        city: raw.Municipio?.trim() || "",
        province: raw.Provincia?.trim() || null,
        latitude: lat,
        longitude: lon,
        stationType: "fuel",
      });

      // --- Extract prices ---
      for (const [fieldName, fuelType] of FUEL_FIELD_MAP) {
        const rawPrice = raw[fieldName];
        const price = parseSpanishDecimal(rawPrice);
        if (price === null || price <= 0) continue;

        prices.push({
          stationExternalId: externalId,
          fuelType,
          price,
          currency: "EUR",
        });
      }
    }

    if (skippedCoords > 0) {
      console.log(
        `[miteco] Skipped ${skippedCoords} stations with invalid/missing coordinates`,
      );
    }

    return { stations, prices };
  }
}
