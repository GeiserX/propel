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

// Austrian Bundesland codes (1-9)
const BUNDESLAENDER = [1, 2, 3, 4, 5, 6, 7, 8, 9];

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
      for (const bl of BUNDESLAENDER) {
        const url = `${BASE_URL}?code=${bl}&type=BL&fuelType=${ecFuel}&includeClosed=true`;
        try {
          const res = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "Propel/1.0" },
            signal: AbortSignal.timeout(15_000),
          });

          if (!res.ok) {
            console.warn(`[${this.source}] HTTP ${res.status} for BL=${bl} fuel=${ecFuel}`);
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
          console.warn(`[${this.source}] Error for BL=${bl} fuel=${ecFuel}:`, err);
        }
      }
      const count = [...stationMap.values()].length;
      console.log(`[${this.source}] After ${ecFuel}: ${count} unique stations`);
    }

    return { stations: Array.from(stationMap.values()), prices };
  }
}
