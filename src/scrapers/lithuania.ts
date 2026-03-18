import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Lithuania — Fuelo.net (lt.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~850 Lithuanian fuel stations with per-station prices.
// Prices in EUR. Major brands: Circle K, Orlen, Viada, Baltic Petroleum, Neste.
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "lt",
  bounds: {
    latMin: 53.9,
    latMax: 56.5,
    lonMin: 21.0,
    lonMax: 26.8,
  },
  currency: "EUR",
  delayMs: 100,
};

export class LithuaniaScraper extends BaseScraper {
  readonly country = "LT";
  readonly source = "fuelo_lt";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
