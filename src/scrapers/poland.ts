import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import { fetchFueloCountry, type FueloConfig } from "./fuelo";

// ---------------------------------------------------------------------------
// Poland — Fuelo.net (pl.fuelo.net)
// ---------------------------------------------------------------------------
// Fuelo.net aggregates ~8,800 Polish fuel stations with per-station prices.
// Prices in PLN (Polish Zloty). No clean open government API exists —
// Orlen's station service (wsp.orlen.pl) has WAF protection, and UOKiK's
// fuel price monitoring does not expose a public station-level API.
// Fuelo.net is the best available free source with station-level granularity.
//
// Major brands: Orlen (~2,612), Shell (~734), BP (~719), Moya (~499),
//               LOTOS (~427), Circle K (~423), MOL (~345), OMV (~148),
//               AVIA (~127), AMIC (~126).
// Fuel types: Pb95/Miles 95 (E5), ON/Diesel (B7), Pb98/Super Plus 98 (E5_98),
//             V-Power Racing/Verva 98 (E5_PREMIUM), Premium Diesel (B7_PREMIUM),
//             LPG, CNG.
//
// Two-phase scraping via fuelo.net AJAX endpoints:
//   1. Station list with coordinates (single POST request)
//   2. Per-station info window with prices (GET per station, rate-limited)
//
// Note: Poland is large (~8,800 stations), so a full scrape takes ~15-20 min
// at the default 100ms rate limit. The delay can be tuned via delayMs.
// ---------------------------------------------------------------------------

const FUELO_CONFIG: FueloConfig = {
  subdomain: "pl",
  bounds: {
    latMin: 49.0,
    latMax: 54.85,
    lonMin: 14.1,
    lonMax: 24.15,
  },
  currency: "PLN",
  delayMs: 100,
};

export class PolandScraper extends BaseScraper {
  readonly country = "PL";
  readonly source = "fuelo_pl";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    return fetchFueloCountry(FUELO_CONFIG, this.source);
  }
}
