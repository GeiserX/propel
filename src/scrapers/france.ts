import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// France — data.economie.gouv.fr (OpenDataSoft)
// ---------------------------------------------------------------------------
// Dataset: prix-des-carburants-en-france-flux-instantane-v2
// ~9,800 stations, updated every 10 minutes, Licence Ouverte v2.0
// API: paginated records endpoint, max 100 per page
// ---------------------------------------------------------------------------

const BASE_URL =
  "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";

const FUEL_FIELD_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["gazole_prix", "B7"],
  ["sp95_prix", "E5"],
  ["e10_prix", "E10"],
  ["sp98_prix", "E5_98"],
  ["e85_prix", "E10"],      // E85 maps closest to E10
  ["gplc_prix", "LPG"],
]);

interface FranceRecord {
  id: number;
  adresse: string;
  ville: string;
  departement: string;
  cp: string;
  geom: { lon: number; lat: number } | null;
  gazole_prix: number | null;
  sp95_prix: number | null;
  e10_prix: number | null;
  sp98_prix: number | null;
  e85_prix: number | null;
  gplc_prix: number | null;
}

export class FranceScraper extends BaseScraper {
  readonly country = "FR";
  readonly source = "economie_gouv";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];
    let offset = 0;
    const limit = 100;
    let total = Infinity;

    while (offset < total) {
      const url = `${BASE_URL}?limit=${limit}&offset=${offset}&select=id,adresse,ville,departement,cp,geom,gazole_prix,sp95_prix,e10_prix,sp98_prix,e85_prix,gplc_prix`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Propel/1.0" },
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) throw new Error(`France API HTTP ${res.status}`);

      const data: { total_count: number; results: FranceRecord[] } = await res.json();
      total = data.total_count;

      for (const r of data.results) {
        if (!r.geom) continue;
        const { lon, lat } = r.geom;
        if (lat < 41 || lat > 52 || lon < -6 || lon > 10) continue;

        const externalId = String(r.id);
        const city = r.ville?.trim() || "";
        const address = r.adresse?.trim() || "";

        stations.push({
          externalId,
          name: city ? `${city} — ${address}` : address,
          brand: null,
          address,
          city,
          province: r.departement?.trim() || null,
          latitude: lat,
          longitude: lon,
          stationType: "fuel",
        });

        for (const [field, fuelType] of FUEL_FIELD_MAP) {
          const price = r[field as keyof FranceRecord] as number | null;
          if (price != null && price > 0) {
            prices.push({ stationExternalId: externalId, fuelType, price, currency: "EUR" });
          }
        }
      }

      offset += limit;
      if (data.results.length === 0) break;
    }

    console.log(`[${this.source}] Paginated ${Math.ceil(offset / limit)} pages, ${total} total records`);
    return { stations, prices };
  }
}
