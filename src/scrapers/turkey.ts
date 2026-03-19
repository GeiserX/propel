import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Turkey — Fuelo.net (tr.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates Turkish fuel stations with per-station prices.
// Prices in TRY (Turkish Lira). Major brands: Opet, Shell, BP, Petrol Ofisi,
// Total, TP (Turkish Petroleum).
// Fuel types: Super 95 (E5), Diesel (B7), LPG, Gasoline 98 (E5_98).
//
// Two-phase scraping via fuelo.net AJAX endpoints:
//   1. Station list with coordinates (single POST request)
//   2. Per-station info window with prices (GET per station, rate-limited)
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "tr",
  bounds: {
    latMin: 35.8,
    latMax: 42.1,
    lonMin: 25.6,
    lonMax: 44.8,
  },
  currency: "TRY",
  delayMs: 100,
};

export class TurkeyScraper extends BaseScraper {
  readonly country = "TR";
  readonly source = "fuelo_tr";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
