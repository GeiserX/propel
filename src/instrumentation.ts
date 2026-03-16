import type { BaseScraper } from "./scrapers/base";

export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const intervalHours = parseFloat(process.env.PROPEL_SCRAPE_INTERVAL_HOURS ?? "24");
  if (intervalHours <= 0) {
    console.log("[scraper] PROPEL_SCRAPE_INTERVAL_HOURS=0 — automatic scraping disabled");
    return;
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(`[scraper] Automatic scraping every ${intervalHours}h`);

  const { SpainScraper } = await import("./scrapers/spain");
  const { FranceScraper } = await import("./scrapers/france");
  const { PortugalScraper } = await import("./scrapers/portugal");
  const { ItalyScraper } = await import("./scrapers/italy");
  const { AustriaScraper } = await import("./scrapers/austria");
  const { GermanyScraper } = await import("./scrapers/germany");

  // Map of country code -> scraper factory
  const scrapers: Record<string, () => BaseScraper> = {
    ES: () => new SpainScraper(),
    FR: () => new FranceScraper(),
    PT: () => new PortugalScraper(),
    IT: () => new ItalyScraper(),
    AT: () => new AustriaScraper(),
    DE: () => new GermanyScraper(),
  };

  // Determine which countries to scrape from config
  const enabledRaw = process.env.PROPEL_ENABLED_COUNTRIES;
  const countries = enabledRaw
    ? enabledRaw.split(",").map((c) => c.trim().toUpperCase()).filter((c) => c in scrapers)
    : Object.keys(scrapers);

  async function runAll() {
    for (const code of countries) {
      try {
        const scraper = scrapers[code]();
        const result = await scraper.run();
        const status = result.errors.length === 0 ? "OK" : `${result.errors.length} error(s)`;
        console.log(`[scraper] ${code}: ${status} — ${result.stationsUpserted} stations, ${result.pricesUpserted} prices in ${(result.durationMs / 1000).toFixed(1)}s`);
      } catch (err) {
        console.error(`[scraper] ${code}: fatal error —`, err);
      }
    }
  }

  // Run once on startup (delay 10s to let DB connections settle)
  setTimeout(runAll, 10_000);

  // Then repeat on interval
  setInterval(runAll, intervalMs);
}
