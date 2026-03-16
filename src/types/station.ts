export type StationType = "fuel" | "ev_charger" | "both";

export type FuelType =
  | "E5"
  | "E5_PREMIUM"
  | "E10"
  | "E5_98"
  | "E98_E10"
  | "B7"
  | "B7_PREMIUM"
  | "B10"
  | "B_AGRICULTURAL"
  | "HVO"
  | "LPG"
  | "CNG"
  | "LNG"
  | "H2"
  | "ADBLUE";

export interface Station {
  id: string;
  externalId: string;
  country: string;
  name: string;
  brand: string | null;
  address: string;
  city: string;
  province: string | null;
  latitude: number;
  longitude: number;
  stationType: StationType;
  createdAt: Date;
  updatedAt: Date;
}

export interface FuelPrice {
  id: number;
  stationId: string;
  fuelType: FuelType;
  price: number;
  currency: string;
  reportedAt: Date;
  source: string;
}

export interface StationWithPrices extends Station {
  prices: FuelPrice[];
}

export interface StationGeoJSON {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: string;
    name: string;
    brand: string | null;
    address: string;
    city: string;
    price?: number | null;
    reportedAt?: string | null;
    fuelType: string;
    currency: string;
    routeFraction?: number;
    detourMin?: number;
  };
}

export interface StationsGeoJSONCollection {
  type: "FeatureCollection";
  features: StationGeoJSON[];
}
