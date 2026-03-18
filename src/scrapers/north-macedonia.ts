import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// North Macedonia — Fuelo.net (mk.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~350 North Macedonian fuel stations with per-station prices.
// Prices in MKD (Macedonian denar). Major brands: Makpetrol, Okta, Lukoil, Petrol.
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "mk",
  bounds: {
    latMin: 40.8,
    latMax: 42.4,
    lonMin: 20.4,
    lonMax: 23.0,
  },
  currency: "MKD",
  delayMs: 100,
};

export class NorthMacedoniaScraper extends BaseScraper {
  readonly country = "MK";
  readonly source = "fuelo_mk";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
