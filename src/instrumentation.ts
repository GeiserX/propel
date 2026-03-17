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

  const scraperFactories: Record<string, () => BaseScraper> = {
    ES: () => new SpainScraper(),
    FR: () => new FranceScraper(),
    PT: () => new PortugalScraper(),
    IT: () => new ItalyScraper(),
    AT: () => new AustriaScraper(),
    DE: () => new GermanyScraper(),
    GB: () => new UKScraper(),
    SI: () => new SloveniaScraper(),
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
