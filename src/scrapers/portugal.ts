import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Portugal — DGEG (Direção-Geral de Energia e Geologia)
// ---------------------------------------------------------------------------
// API: precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos
// ~3,000 stations, paginated (up to 500 per page)
// Must query per fuel type — each returns stations with that fuel's price
// ---------------------------------------------------------------------------

const BASE_URL = "https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos";

// DGEG fuel type IDs → our harmonized types
const FUEL_TYPE_MAP: ReadonlyMap<number, FuelType> = new Map([
  [2101, "B7"],           // Gasóleo simples
  [2105, "B7_PREMIUM"],   // Gasóleo especial
  [3201, "E5"],           // Gasolina simples 95
  [3205, "E5_PREMIUM"],   // Gasolina especial 95
  [3400, "E5_98"],        // Gasolina 98
  [1120, "LPG"],          // GPL Auto
  [1143, "CNG"],          // GNC
]);

interface DGEGStation {
  Id: number;
  Nome: string;
  Marca: string;
  Municipio: string;
  Distrito: string;
  Morada: string;
  Localidade: string;
  CodPostal: string;
  Latitude: number;
  Longitude: number;
  Preco: string;         // "1,679 €"
  Quantidade: number;    // total count for pagination
}

interface DGEGResponse {
  status: boolean;
  mensagem: string;
  resultado: DGEGStation[];
}

function parsePortuguesePrice(raw: string): number | null {
  // "1,679 €" → 1.679
  const cleaned = raw.replace(/[^\d,]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export class PortugalScraper extends BaseScraper {
  readonly country = "PT";
  readonly source = "dgeg";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const stationMap = new Map<number, RawStation>();
    const prices: RawFuelPrice[] = [];

    for (const [fuelId, fuelType] of FUEL_TYPE_MAP) {
      let page = 1;
      let total = Infinity;

      while ((page - 1) * 500 < total) {
        const url = `${BASE_URL}?idsTiposComb=${fuelId}&qtdPorPagina=500&pagina=${page}`;
        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "Pumperly/1.0" },
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) throw new Error(`DGEG API HTTP ${res.status} for fuel ${fuelId}`);
        const data: DGEGResponse = await res.json();
        if (!data.status || !data.resultado?.length) break;

        total = data.resultado[0].Quantidade;

        for (const s of data.resultado) {
          if (!s.Latitude || !s.Longitude) continue;
          // Portugal bounding box
          if (s.Latitude < 36 || s.Latitude > 43 || s.Longitude < -10 || s.Longitude > -6) continue;

          const externalId = String(s.Id);

          if (!stationMap.has(s.Id)) {
            const brand = s.Marca?.trim() || null;
            stationMap.set(s.Id, {
              externalId,
              name: s.Nome?.trim() || `${brand ?? ""} ${s.Localidade ?? ""}`.trim(),
              brand,
              address: s.Morada?.trim() || "",
              city: s.Municipio?.trim() || "",
              province: s.Distrito?.trim() || null,
              latitude: s.Latitude,
              longitude: s.Longitude,
              stationType: "fuel",
            });
          }

          const price = parsePortuguesePrice(s.Preco);
          if (price != null) {
            prices.push({ stationExternalId: externalId, fuelType, price, currency: "EUR" });
          }
        }

        page++;
        if (data.resultado.length < 500) break;
      }

      console.log(`[${this.source}] Fuel ${fuelId} (${fuelType}): ${total} stations`);
    }

    return { stations: Array.from(stationMap.values()), prices };
  }
}
