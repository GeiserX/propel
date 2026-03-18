import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Bulgaria — Fuelo.net (bg.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~3,500 Bulgarian fuel stations with per-station prices.
// Prices in BGN (Bulgarian Lev, pegged to EUR at 1.95583).
// Major brands: Lukoil, Shell, OMV, Petrol, EKO, Rompetrol, Gazprom.
// Fuel types: Benzin A95H (E5), Super Diesel (B7), Propan Butan (LPG),
//             ECTO 100 / A98 (E5_98), ECTO Diesel / Premium (B7_PREMIUM),
//             ECTO Plus 95 (E5_PREMIUM).
//
// Two-phase scraping via fuelo.net AJAX endpoints:
//   1. Station list with coordinates (single POST request)
//   2. Per-station info window with prices (GET per station, rate-limited)
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "bg",
  bounds: {
    latMin: 41.2,
    latMax: 44.2,
    lonMin: 22.4,
    lonMax: 28.6,
  },
  currency: "BGN",
  delayMs: 100,
};

export class BulgariaScraper extends BaseScraper {
  readonly country = "BG";
  readonly source = "fuelo_bg";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
