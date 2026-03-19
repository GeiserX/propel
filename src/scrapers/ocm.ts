import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";

// ---------------------------------------------------------------------------
// OpenChargeMap (OCM) — EV charging station scraper
// ---------------------------------------------------------------------------
// API: https://api.openchargemap.io/v3/poi/
// Covers all countries. Used as the universal EV data source.
// API key required, passed as X-API-Key header.
// License: Open Data Commons Open Database License (ODbL)
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.openchargemap.io/v3/poi/";
const API_KEY = process.env.PUMPERLY_OCM_API_KEY ?? "";
const MAX_RESULTS = 5000; // Keep moderate to avoid OCM timeouts

interface OCMConnection {
  ConnectionTypeID: number;
  ConnectionType?: { Title: string };
  StatusTypeID?: number;
  LevelID?: number;
  Level?: { Title: string };
  PowerKW?: number;
  Quantity?: number;
}

interface OCMAddressInfo {
  Title?: string;
  AddressLine1?: string;
  Town?: string;
  StateOrProvince?: string;
  Postcode?: string;
  CountryID?: number;
  Country?: { ISOCode: string; Title: string };
  Latitude: number;
  Longitude: number;
}

interface OCMOperatorInfo {
  Title?: string;
}

interface OCMPOI {
  ID: number;
  UUID?: string;
  OperatorInfo?: OCMOperatorInfo;
  AddressInfo: OCMAddressInfo;
  Connections?: OCMConnection[];
  NumberOfPoints?: number;
  StatusTypeID?: number;
  DateLastStatusUpdate?: string;
  DataProviderID?: number;
}

export class OCMScraper extends BaseScraper {
  readonly country: string;
  readonly source = "ocm";

  constructor(country: string) {
    super();
    this.country = country;
  }

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    if (!API_KEY) {
      console.warn(`[${this.source}] PUMPERLY_OCM_API_KEY not set, skipping`);
      return { stations: [], prices: [] };
    }

    const url = new URL(BASE_URL);
    url.searchParams.set("output", "json");
    url.searchParams.set("countrycode", this.country);
    url.searchParams.set("maxresults", String(MAX_RESULTS));
    url.searchParams.set("compact", "true");
    url.searchParams.set("verbose", "false");
    // Only include operational stations (StatusTypeID 50 = Operational)
    url.searchParams.set("statustypeid", "50");

    const res = await fetch(url.toString(), {
      headers: {
        "X-API-Key": API_KEY,
        Accept: "application/json",
        "User-Agent": "Pumperly/1.0",
      },
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      throw new Error(`OCM HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    }

    const pois: OCMPOI[] = await res.json();
    const stations: RawStation[] = [];

    for (const poi of pois) {
      const addr = poi.AddressInfo;
      if (!addr || !addr.Latitude || !addr.Longitude) continue;

      // Basic coordinate sanity
      if (addr.Latitude < -90 || addr.Latitude > 90) continue;
      if (addr.Longitude < -180 || addr.Longitude > 180) continue;

      const externalId = `ocm-${poi.ID}`;
      const brand = poi.OperatorInfo?.Title?.trim() || null;
      const name =
        addr.Title?.trim() ||
        (brand ? `${brand} Charging` : `EV Charger ${poi.ID}`);

      const addressParts = [addr.AddressLine1, addr.Postcode].filter(Boolean);
      const address = addressParts.join(", ") || name;

      stations.push({
        externalId,
        name,
        brand,
        address,
        city: addr.Town?.trim() || "",
        province: addr.StateOrProvince?.trim() || null,
        latitude: addr.Latitude,
        longitude: addr.Longitude,
        stationType: "ev_charger",
      });
    }

    console.log(
      `[${this.source}] ${this.country}: ${pois.length} POIs from API → ${stations.length} valid stations`,
    );

    // EV chargers don't have fuel prices — return empty prices array
    return { stations, prices: [] };
  }
}
