/** Country definition with map center/zoom for initial view. */
export interface CountryConfig {
  code: string;
  name: string;
  center: [number, number]; // [longitude, latitude]
  zoom: number;
  defaultFuel: string;
}

export const COUNTRIES: Record<string, CountryConfig> = {
  ES: { code: "ES", name: "España", center: [-3.7, 40.4], zoom: 6, defaultFuel: "B7" },
  FR: { code: "FR", name: "France", center: [2.35, 46.85], zoom: 6, defaultFuel: "E10" },
  DE: { code: "DE", name: "Deutschland", center: [10.45, 51.16], zoom: 6, defaultFuel: "E5" },
  IT: { code: "IT", name: "Italia", center: [12.49, 41.9], zoom: 6, defaultFuel: "B7" },
  GB: { code: "GB", name: "United Kingdom", center: [-1.17, 52.35], zoom: 6, defaultFuel: "E5" },
  AT: { code: "AT", name: "Österreich", center: [13.33, 47.52], zoom: 7, defaultFuel: "B7" },
  PT: { code: "PT", name: "Portugal", center: [-8.22, 39.4], zoom: 7, defaultFuel: "B7" },
  SI: { code: "SI", name: "Slovenija", center: [14.99, 46.15], zoom: 8, defaultFuel: "B7" },
  NL: { code: "NL", name: "Nederland", center: [5.29, 52.13], zoom: 7, defaultFuel: "E10" },
  BE: { code: "BE", name: "België", center: [4.47, 50.5], zoom: 8, defaultFuel: "E10" },
  LU: { code: "LU", name: "Luxembourg", center: [6.13, 49.81], zoom: 9, defaultFuel: "E10" },
  RO: { code: "RO", name: "România", center: [24.97, 45.94], zoom: 7, defaultFuel: "B7" },
  GR: { code: "GR", name: "Ελλάδα", center: [23.73, 37.97], zoom: 7, defaultFuel: "B7" },
  IE: { code: "IE", name: "Ireland", center: [-7.69, 53.14], zoom: 7, defaultFuel: "B7" },
  HR: { code: "HR", name: "Hrvatska", center: [15.98, 45.81], zoom: 7, defaultFuel: "B7" },
};

/**
 * Get runtime config from environment variables.
 * - PROPEL_DEFAULT_COUNTRY: ISO code for initial map view (default: ES)
 * - PROPEL_ENABLED_COUNTRIES: Comma-separated list of enabled countries (default: all with scrapers)
 * - PROPEL_DEFAULT_FUEL: Override default fuel type (default: per-country)
 * - PROPEL_CORRIDOR_KM: Station search corridor width in km (default: 5, range: 0.5-50)
 * - PROPEL_SCRAPE_INTERVAL_HOURS: Global scrape interval override (default: per-country defaults)
 * - PROPEL_SCRAPE_INTERVAL_XX: Per-country interval in hours, e.g. PROPEL_SCRAPE_INTERVAL_FR=0.5
 */
export function getConfig() {
  const defaultCountry = process.env.PROPEL_DEFAULT_COUNTRY || "ES";
  const enabledRaw = process.env.PROPEL_ENABLED_COUNTRIES;
  const enabledCountries = enabledRaw
    ? enabledRaw.split(",").map((c) => c.trim().toUpperCase()).filter((c) => c in COUNTRIES)
    : Object.keys(COUNTRIES);
  const defaultFuelOverride = process.env.PROPEL_DEFAULT_FUEL || null;
  const clusterStations = (process.env.PROPEL_CLUSTER_STATIONS ?? "true").toLowerCase() === "true";
  const corridorKm = Math.min(50, Math.max(0.5, parseFloat(process.env.PROPEL_CORRIDOR_KM ?? "5") || 5));

  const country = COUNTRIES[defaultCountry] ?? COUNTRIES.ES;
  const defaultFuel = defaultFuelOverride ?? country.defaultFuel;

  return {
    defaultCountry,
    enabledCountries,
    defaultFuel,
    center: country.center,
    zoom: country.zoom,
    clusterStations,
    corridorKm,
  };
}
