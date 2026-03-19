import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Argentina — Secretaría de Energía (Open Data CSV)
// ---------------------------------------------------------------------------
// Public open data from datos.gob.ar: station-level fuel prices with GPS.
// CSV with ~37K rows (one row per station × fuel type × day/night).
// No authentication required.
//
// Prices in ARS (Argentine Peso) per litre. ~4,600 stations.
// Fuel types: Nafta Súper (92-95 RON), Nafta Premium (>95 RON),
//             Gas Oil Grado 2 (diesel), Gas Oil Grado 3 (premium diesel),
//             GNC (compressed natural gas).
// ---------------------------------------------------------------------------

const CSV_URL =
  "http://datos.energia.gob.ar/dataset/1c181390-5045-475e-94dc-410429be4b17/resource/80ac25de-a44a-4445-9215-090cf55cfda5/download/precios-en-surtidor-resolucin-3142016.csv";

/** Argentina fuel product names → harmonised fuel types */
const FUEL_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["Nafta (súper) entre 92 y 95 Ron", "E5"],
  ["Nafta (premium) de más de 95 Ron", "E5_PREMIUM"],
  ["Gas Oil Grado 2", "B7"],
  ["Gas Oil Grado 3", "B7_PREMIUM"],
  ["GNC", "CNG"],
]);

/** Known brand name normalization */
const BRAND_MAP: Record<string, string> = {
  "SHELL C.A.P.S.A.": "Shell",
  "OIL COMBUSTIBLES S.A.": "Oil Combustibles",
  "DAPSA S.A.": "DAPSA",
  "SIN EMPRESA BANDERA": "",
};

interface CSVRow {
  cuit: string;
  empresa: string;
  direccion: string;
  localidad: string;
  provincia: string;
  producto: string;
  tipohorario: string;
  precio: string;
  empresabandera: string;
  latitud: string;
  longitud: string;
}

/** Minimal CSV parser that handles quoted fields with commas */
function parseCSV(text: string): CSVRow[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]);
  const colIdx = (name: string) => header.indexOf(name);

  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    rows.push({
      cuit: fields[colIdx("cuit")] || "",
      empresa: fields[colIdx("empresa")] || "",
      direccion: fields[colIdx("direccion")] || "",
      localidad: fields[colIdx("localidad")] || "",
      provincia: fields[colIdx("provincia")] || "",
      producto: fields[colIdx("producto")] || "",
      tipohorario: fields[colIdx("tipohorario")] || "",
      precio: fields[colIdx("precio")] || "",
      empresabandera: fields[colIdx("empresabandera")] || "",
      latitud: fields[colIdx("latitud")] || "",
      longitud: fields[colIdx("longitud")] || "",
    });
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export class ArgentinaScraper extends BaseScraper {
  readonly country = "AR";
  readonly source = "energia_ar";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const res = await fetch(CSV_URL, {
      headers: { "User-Agent": "Pumperly/1.0" },
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) throw new Error(`Argentina CSV HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);

    console.log(`[${this.source}] Parsed ${rows.length} CSV rows`);

    const stationMap = new Map<string, RawStation>();
    const prices: RawFuelPrice[] = [];

    for (const r of rows) {
      // Use only daytime prices (day/night rarely differ)
      if (r.tipohorario !== "Diurno") continue;

      const lat = parseFloat(r.latitud);
      const lon = parseFloat(r.longitud);
      if (isNaN(lat) || isNaN(lon)) continue;

      // Argentina bounding box
      if (lat < -56 || lat > -21 || lon < -74 || lon > -53) continue;

      const price = parseFloat(r.precio);
      if (isNaN(price) || price <= 0) continue;

      const fuelType = FUEL_MAP.get(r.producto);
      if (!fuelType) continue;

      const externalId = `ar_${r.cuit}_${lat.toFixed(4)}_${lon.toFixed(4)}`;

      if (!stationMap.has(externalId)) {
        const brand = BRAND_MAP[r.empresabandera] ?? r.empresabandera;
        stationMap.set(externalId, {
          externalId,
          name: brand || r.empresa || `Station ${r.cuit}`,
          brand: brand || null,
          address: r.direccion,
          city: r.localidad,
          province: r.provincia,
          latitude: lat,
          longitude: lon,
          stationType: "fuel",
        });
      }

      prices.push({
        stationExternalId: externalId,
        fuelType,
        price,
        currency: "ARS",
      });
    }

    return { stations: Array.from(stationMap.values()), prices };
  }
}
