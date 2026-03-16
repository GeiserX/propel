import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Austria — E-Control Spritpreisrechner API
// ---------------------------------------------------------------------------
// API: api.e-control.at/sprit/1.0/search/gas-stations/by-region
// Query per Bundesland (9 states) × fuel type. No auth for search endpoints.
// Fuel types: DIE (diesel), SUP (super 95), GAS (super E10)
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.e-control.at/sprit/1.0/search/gas-stations/by-region";

// Austrian political district codes (Politische Bezirke).
// The API limits results to 10 per query, so querying by district (~117)
// instead of Bundesland (9) gives much better coverage (~2,500+ stations).
const BEZIRKE = [
  101,102,103,104,105,106,107,108,109,
  201,202,203,204,205,206,207,208,209,210,
  301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,320,321,322,323,325,
  401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,
  501,502,503,504,505,506,
  601,603,606,610,611,612,614,616,617,620,621,622,623,
  701,702,703,704,705,706,707,708,709,
  801,802,803,804,
  900,901,902,903,904,905,906,907,908,909,910,911,912,913,914,915,916,917,918,919,920,921,922,923,
];

// E-Control fuel type codes → harmonized
const FUEL_TYPE_MAP: ReadonlyMap<string, FuelType> = new Map([
  ["DIE", "B7"],
  ["SUP", "E5"],
  ["GAS", "E10"],
]);

interface EControlStation {
  id: number;
  name: string;
  location: {
    address: string;
    city: string;
    postalCode: string;
    latitude: number;
    longitude: number;
  };
  prices: Array<{
    fuelType: string;
    amount: number;
    label: string;
  }>;
  open: boolean;
}

export class AustriaScraper extends BaseScraper {
  readonly country = "AT";
  readonly source = "econtrol";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    const stationMap = new Map<number, RawStation>();
    const prices: RawFuelPrice[] = [];

    for (const [ecFuel, fuelType] of FUEL_TYPE_MAP) {
      for (const bz of BEZIRKE) {
        const url = `${BASE_URL}?code=${bz}&type=PB&fuelType=${ecFuel}&includeClosed=false`;
        try {
          const res = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "Propel/1.0" },
            signal: AbortSignal.timeout(15_000),
          });

          if (!res.ok) {
            console.warn(`[${this.source}] HTTP ${res.status} for PB=${bz} fuel=${ecFuel}`);
            continue;
          }

          const data: EControlStation[] = await res.json();

          for (const s of data) {
            if (!s.location?.latitude || !s.location?.longitude) continue;
            const { latitude: lat, longitude: lon } = s.location;
            // Austria bounding box
            if (lat < 46 || lat > 49 || lon < 9 || lon > 18) continue;

            const externalId = String(s.id);

            if (!stationMap.has(s.id)) {
              stationMap.set(s.id, {
                externalId,
                name: s.name?.trim() || `Station ${externalId}`,
                brand: null,
                address: s.location.address?.trim() || "",
                city: s.location.city?.trim() || "",
                province: null,
                latitude: lat,
                longitude: lon,
                stationType: "fuel",
              });
            }

            for (const p of s.prices) {
              if (p.amount > 0) {
                const mappedFuel = FUEL_TYPE_MAP.get(p.fuelType) ?? fuelType;
                prices.push({
                  stationExternalId: externalId,
                  fuelType: mappedFuel,
                  price: p.amount,
                  currency: "EUR",
                });
              }
            }
          }
        } catch (err) {
          console.warn(`[${this.source}] Error for PB=${bz} fuel=${ecFuel}:`, err);
        }
      }
      const count = [...stationMap.values()].length;
      console.log(`[${this.source}] After ${ecFuel}: ${count} unique stations`);
    }

    return { stations: Array.from(stationMap.values()), prices };
  }
}
