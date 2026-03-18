import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Estonia — Fuelo.net (ee.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~500 Estonian fuel stations with per-station prices.
// Prices in EUR. Major brands: Neste, Circle K, Olerex, Alexela, Terminal.
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "ee",
  bounds: {
    latMin: 57.5,
    latMax: 59.7,
    lonMin: 21.8,
    lonMax: 28.2,
  },
  currency: "EUR",
  delayMs: 100,
};

export class EstoniaScraper extends BaseScraper {
  readonly country = "EE";
  readonly source = "fuelo_ee";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
