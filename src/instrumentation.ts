import type { BaseScraper } from "./scrapers/base";

// Per-country default scrape intervals (hours).
// Override any country with PROPEL_SCRAPE_INTERVAL_XX env var (e.g. PROPEL_SCRAPE_INTERVAL_FR=0.5).
// Set to 0 to disable a specific country's automatic scraping.
const DEFAULT_INTERVALS: Record<string, number> = {
  ES: 12,   // Spain MITECO — updated daily
  FR: 1,    // France — updated every 10 min, we scrape hourly
  PT: 12,   // Portugal DGEG — updated daily
  IT: 12,   // Italy MIMIT — updated daily
  AT: 2,    // Austria E-Control — real-time, we scrape every 2h
  DE: 1,    // Germany Tankerkoenig — real-time, we scrape hourly
  GB: 4,    // UK CMA — 14 retailer feeds, near real-time, scrape every 4h
  SI: 6,    // Slovenia goriva.si — government-regulated, scrape every 6h
  NL: 6,    // Netherlands ANWB — commercial API, scrape every 6h
  BE: 6,    // Belgium ANWB — commercial API, scrape every 6h
  LU: 12,   // Luxembourg ANWB — small country, scrape every 12h
  RO: 12,   // Romania Peco Online — daily updates, scrape every 12h
  GR: 12,   // Greece FuelGR — grid queries, scrape every 12h
  IE: 12,   // Ireland Pick A Pump — crowdsourced, scrape every 12h
  HR: 12,   // Croatia MZOE — government monitoring, scrape every 12h
  CH: 12,   // Switzerland Fuelo.net — community-sourced, scrape every 12h
  PL: 12,   // Poland Fuelo.net — community-sourced, scrape every 12h
  CZ: 12,   // Czech Republic Fuelo.net — community-sourced, scrape every 12h
  HU: 12,   // Hungary Fuelo.net — community-sourced, scrape every 12h
  BG: 12,   // Bulgaria Fuelo.net — community-sourced, scrape every 12h
  SK: 12,   // Slovakia Fuelo.net — community-sourced, scrape every 12h
  DK: 6,    // Denmark fuelprices.dk — API, scrape every 6h
  SE: 12,   // Sweden bensinpriser.nu — community-sourced, scrape every 12h
  NO: 6,    // Norway DrivstoffAppen — government-mandated, scrape every 6h
  RS: 12,   // Serbia NIS + cenagoriva — brand-level, scrape every 12h
  FI: 12,   // Finland polttoaine.net — community-sourced, scrape every 12h
};

export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Global toggle — set to 0 to disable all automatic scraping
  const globalInterval = parseFloat(process.env.PROPEL_SCRAPE_INTERVAL_HOURS ?? "-1");
  if (globalInterval === 0) {
    console.log("[scraper] PROPEL_SCRAPE_INTERVAL_HOURS=0 — automatic scraping disabled");
    return;
  }

  const { SpainScraper } = await import("./scrapers/spain");
  const { FranceScraper } = await import("./scrapers/france");
  const { PortugalScraper } = await import("./scrapers/portugal");
  const { ItalyScraper } = await import("./scrapers/italy");
  const { AustriaScraper } = await import("./scrapers/austria");
  const { GermanyScraper } = await import("./scrapers/germany");
  const { UKScraper } = await import("./scrapers/uk");
  const { SloveniaScraper } = await import("./scrapers/slovenia");
  const { NetherlandsScraper } = await import("./scrapers/netherlands");
  const { BelgiumScraper } = await import("./scrapers/belgium");
  const { LuxembourgScraper } = await import("./scrapers/luxembourg");
  const { RomaniaScraper } = await import("./scrapers/romania");
  const { GreeceScraper } = await import("./scrapers/greece");
  const { IrelandScraper } = await import("./scrapers/ireland");
  const { CroatiaScraper } = await import("./scrapers/croatia");
  const { SwitzerlandScraper } = await import("./scrapers/switzerland");
  const { PolandScraper } = await import("./scrapers/poland");
  const { CzechScraper } = await import("./scrapers/czech");
  const { HungaryScraper } = await import("./scrapers/hungary");
  const { BulgariaScraper } = await import("./scrapers/bulgaria");
  const { SlovakiaScraper } = await import("./scrapers/slovakia");
  const { DenmarkScraper } = await import("./scrapers/denmark");
  const { SwedenScraper } = await import("./scrapers/sweden");
  const { NorwayScraper } = await import("./scrapers/norway");
  const { SerbiaScraper } = await import("./scrapers/serbia");
  const { FinlandScraper } = await import("./scrapers/finland");

  const scraperFactories: Record<string, () => BaseScraper> = {
    ES: () => new SpainScraper(),
    FR: () => new FranceScraper(),
    PT: () => new PortugalScraper(),
    IT: () => new ItalyScraper(),
    AT: () => new AustriaScraper(),
    DE: () => new GermanyScraper(),
    GB: () => new UKScraper(),
    SI: () => new SloveniaScraper(),
    NL: () => new NetherlandsScraper(),
    BE: () => new BelgiumScraper(),
    LU: () => new LuxembourgScraper(),
    RO: () => new RomaniaScraper(),
    GR: () => new GreeceScraper(),
    IE: () => new IrelandScraper(),
    HR: () => new CroatiaScraper(),
    CH: () => new SwitzerlandScraper(),
    PL: () => new PolandScraper(),
    CZ: () => new CzechScraper(),
    HU: () => new HungaryScraper(),
    BG: () => new BulgariaScraper(),
    SK: () => new SlovakiaScraper(),
    DK: () => new DenmarkScraper(),
    SE: () => new SwedenScraper(),
    NO: () => new NorwayScraper(),
    RS: () => new SerbiaScraper(),
    FI: () => new FinlandScraper(),
  };

  // Determine which countries to scrape
  const enabledRaw = process.env.PROPEL_ENABLED_COUNTRIES;
  const countries = enabledRaw
    ? enabledRaw.split(",").map((c) => c.trim().toUpperCase()).filter((c) => c in scraperFactories)
    : Object.keys(scraperFactories);

  // Resolve per-country intervals
  for (const code of countries) {
    // Priority: PROPEL_SCRAPE_INTERVAL_XX > PROPEL_SCRAPE_INTERVAL_HOURS > DEFAULT_INTERVALS
    const perCountryEnv = process.env[`PROPEL_SCRAPE_INTERVAL_${code}`];
    let intervalHours: number;
    if (perCountryEnv != null) {
      intervalHours = parseFloat(perCountryEnv);
    } else if (globalInterval > 0) {
      intervalHours = globalInterval;
    } else {
      intervalHours = DEFAULT_INTERVALS[code] ?? 12;
    }

    if (intervalHours <= 0) {
      console.log(`[scraper] ${code}: automatic scraping disabled`);
      continue;
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;
    console.log(`[scraper] ${code}: scraping every ${intervalHours}h`);

    async function runScraper() {
      try {
        const scraper = scraperFactories[code]();
        const result = await scraper.run();
        const status = result.errors.length === 0 ? "OK" : `${result.errors.length} error(s)`;
        console.log(`[scraper] ${code}: ${status} — ${result.stationsUpserted} stations, ${result.pricesUpserted} prices in ${(result.durationMs / 1000).toFixed(1)}s`);
      } catch (err) {
        console.error(`[scraper] ${code}: fatal error —`, err);
      }
    }

    // Stagger startup: 10s base + 5s per country to avoid hammering DB
    const startupDelay = 10_000 + countries.indexOf(code) * 5_000;
    setTimeout(runScraper, startupDelay);

    // Then repeat on its own interval
    setTimeout(() => setInterval(runScraper, intervalMs), startupDelay);
  }
}
