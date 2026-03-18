import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Bosnia and Herzegovina — Fuelo.net (ba.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~430 Bosnian fuel stations with per-station prices.
// Prices in BAM (convertible mark). Major brands: Nestro, Hifa, Petrol, OMV.
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "ba",
  bounds: {
    latMin: 42.5,
    latMax: 45.3,
    lonMin: 15.7,
    lonMax: 19.7,
  },
  currency: "BAM",
  delayMs: 100,
};

export class BosniasScraper extends BaseScraper {
  readonly country = "BA";
  readonly source = "fuelo_ba";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
