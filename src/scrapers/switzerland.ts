import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Switzerland — Fuelo.net (ch.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~2,200 Swiss fuel stations with per-station prices.
// Prices in CHF (Swiss Franc). No public government fuel price API exists
// in Switzerland — Comparis.ch has the data but uses CAPTCHA protection.
// Fuelo.net is the best available free source with station-level granularity.
//
// Major brands: AVIA (~674), Tamoil (~253), Eni (~224), SOCAR (~187),
//               BP (~122), Shell (~78), Esso (~62), IP (~58),
//               TotalEnergies (~45), Q8 (~44), Aral (~38).
// Fuel types: Eurosuper/Bleifrei 95 (E5), Diesel (B7), Super Plus 98 (E5_98),
//             BP Ultimate/V-Power Racing (E5_PREMIUM), Diesel Premium (B7_PREMIUM),
//             LPG, CNG.
//
// Two-phase scraping via fuelo.net AJAX endpoints:
//   1. Station list with coordinates (single POST request)
//   2. Per-station info window with prices (GET per station, rate-limited)
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "ch",
  bounds: {
    latMin: 45.8,
    latMax: 47.85,
    lonMin: 5.9,
    lonMax: 10.55,
  },
  currency: "CHF",
  delayMs: 100,
};

export class SwitzerlandScraper extends BaseScraper {
  readonly country = "CH";
  readonly source = "fuelo_ch";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
