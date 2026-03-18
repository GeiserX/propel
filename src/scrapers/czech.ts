import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Czech Republic — Fuelo.net (cz.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~3,000 Czech fuel stations with per-station prices.
// Prices in CZK (Czech Koruna). No open government fuel price API exists
// with station-level data — the Czech Statistical Office publishes national
// averages only, and cenypaliv.cz/pumpy.cz do not expose public APIs.
// Fuelo.net is the best available free source with station-level granularity.
//
// Major brands: Orlen (~622), Shell (~342), MOL (~287), OMV (~206),
//               PAP OIL (~120), AVIA (~111), Aral (~80), BP (~66),
//               Slovnaft (~52), TotalEnergies (~51).
// Fuel types: Natural 95/Efecta 95 (E5), Nafta/Diesel (B7),
//             Super Plus/Natural 98 (E5_98), Verva 100 (E5_PREMIUM),
//             Verva Diesel/Premium (B7_PREMIUM), LPG, CNG.
//
// Two-phase scraping via fuelo.net AJAX endpoints:
//   1. Station list with coordinates (single POST request)
//   2. Per-station info window with prices (GET per station, rate-limited)
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "cz",
  bounds: {
    latMin: 48.55,
    latMax: 51.06,
    lonMin: 12.09,
    lonMax: 18.87,
  },
  currency: "CZK",
  delayMs: 100,
};

export class CzechScraper extends BaseScraper {
  readonly country = "CZ";
  readonly source = "fuelo_cz";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
