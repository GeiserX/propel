import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Hungary — Fuelo.net (hu.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~2,300 Hungarian fuel stations with per-station prices.
// Prices in HUF (Hungarian Forint). Major brands: MOL, OMV, Eni, Shell, Lukoil.
// Fuel types: Super 95 (E5), Diesel (B7), LPG, Gasoline 98 (E5_98),
//             Diesel Premium (B7_PREMIUM), CNG.
//
// Two-phase scraping via fuelo.net AJAX endpoints:
//   1. Station list with coordinates (single POST request)
//   2. Per-station info window with prices (GET per station, rate-limited)
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "hu",
  bounds: {
    latMin: 45.7,
    latMax: 48.6,
    lonMin: 16.1,
    lonMax: 22.9,
  },
  currency: "HUF",
  delayMs: 100,
};

export class HungaryScraper extends BaseScraper {
  readonly country = "HU";
  readonly source = "fuelo_hu";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
