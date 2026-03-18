import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Slovakia — Fuelo.net (sk.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~1,100 Slovak fuel stations with per-station prices.
// Prices in EUR (Slovakia has been in the Eurozone since 2009).
// Major brands: Slovnaft, OMV, Shell, MOL, Eni, Orlen.
// Fuel types: Natural 95 / TEMPO PLUS 95 (E5), Nafta / Diesel (B7),
//             LPG / Autoplyn, EVO Benzin / 98 (E5_98),
//             EVO Diesel / Premium (B7_PREMIUM), CNG.
//
// Two-phase scraping via fuelo.net AJAX endpoints:
//   1. Station list with coordinates (single POST request)
//   2. Per-station info window with prices (GET per station, rate-limited)
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "sk",
  bounds: {
    latMin: 47.7,
    latMax: 49.6,
    lonMin: 16.8,
    lonMax: 22.6,
  },
  currency: "EUR",
  delayMs: 100,
};

export class SlovakiaScraper extends BaseScraper {
  readonly country = "SK";
  readonly source = "fuelo_sk";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
