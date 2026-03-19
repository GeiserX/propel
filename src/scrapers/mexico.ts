import { BaseScraper, type RawFuelPrice, type RawStation } from "./base";
import type { FuelType } from "../types/station";

// ---------------------------------------------------------------------------
// Mexico — CRE (Comisión Reguladora de Energía)
// ---------------------------------------------------------------------------
// Public XML endpoints (no auth) for station locations and fuel prices.
// Two endpoints:
//   GET /publicaciones/places  → station name, CRE ID, GPS (x=lon, y=lat)
//   GET /publicaciones/prices  → fuel prices by place_id
// Prices in MXN per litre. ~13,500 stations with both location + prices.
// Fuel types: regular (Magna), premium, diesel.
// ---------------------------------------------------------------------------

const PLACES_URL = "https://publicacionexterna.azurewebsites.net/publicaciones/places";
const PRICES_URL = "https://publicacionexterna.azurewebsites.net/publicaciones/prices";

const FUEL_MAP: Record<string, FuelType> = {
  regular: "E5",
  premium: "E5_PREMIUM",
  diesel: "B7",
};

interface PlaceInfo {
  name: string;
  creId: string;
  lon: number;
  lat: number;
}

export class MexicoScraper extends BaseScraper {
  readonly country = "MX";
  readonly source = "cre_mx";

  async fetch(): Promise<{ stations: RawStation[]; prices: RawFuelPrice[] }> {
    // Fetch both endpoints in parallel
    const [placesRes, pricesRes] = await Promise.all([
      fetch(PLACES_URL, {
        headers: { "User-Agent": "Pumperly/1.0" },
        signal: AbortSignal.timeout(60_000),
      }),
      fetch(PRICES_URL, {
        headers: { "User-Agent": "Pumperly/1.0" },
        signal: AbortSignal.timeout(60_000),
      }),
    ]);

    if (!placesRes.ok) throw new Error(`CRE places HTTP ${placesRes.status}`);
    if (!pricesRes.ok) throw new Error(`CRE prices HTTP ${pricesRes.status}`);

    const placesXml = await placesRes.text();
    const pricesXml = await pricesRes.text();

    // Parse places
    const placeMap = new Map<string, PlaceInfo>();
    const placeRegex = /<place\s+place_id="(\d+)">([\s\S]*?)<\/place>/g;
    let match: RegExpExecArray | null;

    while ((match = placeRegex.exec(placesXml)) !== null) {
      const id = match[1];
      const body = match[2];

      const name = body.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim() || "";
      const creId = body.match(/<cre_id>([\s\S]*?)<\/cre_id>/)?.[1]?.trim() || "";
      const lon = parseFloat(body.match(/<x>([\s\S]*?)<\/x>/)?.[1] || "");
      const lat = parseFloat(body.match(/<y>([\s\S]*?)<\/y>/)?.[1] || "");

      if (isNaN(lat) || isNaN(lon)) continue;
      // Mexico bounding box
      if (lat < 14 || lat > 33 || lon < -118 || lon > -86) continue;

      placeMap.set(id, { name, creId, lon, lat });
    }

    console.log(`[${this.source}] Parsed ${placeMap.size} places with coordinates`);

    // Parse prices
    const pricePairs: Array<{ placeId: string; fuelType: FuelType; price: number }> = [];
    const priceRegex = /<place\s+place_id="(\d+)">([\s\S]*?)<\/place>/g;

    while ((match = priceRegex.exec(pricesXml)) !== null) {
      const id = match[1];
      const body = match[2];

      const gpRegex = /<gas_price\s+type="(\w+)">([^<]+)<\/gas_price>/g;
      let gp: RegExpExecArray | null;
      while ((gp = gpRegex.exec(body)) !== null) {
        const fuelType = FUEL_MAP[gp[1]];
        if (!fuelType) continue;
        const price = parseFloat(gp[2]);
        if (isNaN(price) || price <= 0) continue;
        pricePairs.push({ placeId: id, fuelType, price });
      }
    }

    console.log(`[${this.source}] Parsed ${pricePairs.length} price entries`);

    // Merge: only stations that have both location and prices
    const stations: RawStation[] = [];
    const prices: RawFuelPrice[] = [];
    const seenStations = new Set<string>();

    for (const pp of pricePairs) {
      const place = placeMap.get(pp.placeId);
      if (!place) continue;

      const externalId = `cre_${pp.placeId}`;

      if (!seenStations.has(externalId)) {
        seenStations.add(externalId);
        stations.push({
          externalId,
          name: place.name || `Station ${pp.placeId}`,
          brand: extractBrand(place.name),
          address: "",
          city: "",
          province: null,
          latitude: place.lat,
          longitude: place.lon,
          stationType: "fuel",
        });
      }

      prices.push({
        stationExternalId: externalId,
        fuelType: pp.fuelType,
        price: pp.price,
        currency: "MXN",
      });
    }

    return { stations, prices };
  }
}

/** Extract brand from station name (e.g. "PEMEX STATION..." → "Pemex") */
function extractBrand(name: string): string | null {
  const upper = name.toUpperCase();
  const brands: Array<[string, string]> = [
    ["PEMEX", "Pemex"],
    ["SHELL", "Shell"],
    ["BP ", "BP"],
    ["MOBIL", "Mobil"],
    ["TOTAL", "TotalEnergies"],
    ["OXXO GAS", "OXXO Gas"],
    ["G500", "G500"],
    ["GULF", "Gulf"],
    ["ARCO", "ARCO"],
    ["CHEVRON", "Chevron"],
    ["REPSOL", "Repsol"],
    ["ORSAN", "Orsan"],
    ["LODEMO", "Lodemo"],
    ["REDCO", "Redco"],
  ];
  for (const [pattern, brand] of brands) {
    if (upper.includes(pattern)) return brand;
  }
  return null;
}
