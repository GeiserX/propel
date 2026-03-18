import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Latvia — Fuelo.net (lv.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~800 Latvian fuel stations with per-station prices.
// Prices in EUR. Major brands: Circle K, Neste, Viada, Gulf, Virši.
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "lv",
  bounds: {
    latMin: 55.7,
    latMax: 58.1,
    lonMin: 20.9,
    lonMax: 28.2,
  },
  currency: "EUR",
  delayMs: 100,
};

export class LatviaScraper extends BaseScraper {
  readonly country = "LV";
  readonly source = "fuelo_lv";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
