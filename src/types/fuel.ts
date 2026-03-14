import type { FuelType } from "./station";

export interface FuelTypeInfo {
  code: FuelType;
  label: string;
  category: "gasoline" | "diesel" | "gas" | "hydrogen";
}

export const FUEL_TYPES: FuelTypeInfo[] = [
  { code: "B7", label: "Diesel", category: "diesel" },
  { code: "B7_PREMIUM", label: "Diesel Premium", category: "diesel" },
  { code: "B10", label: "Diesel B10", category: "diesel" },
  { code: "E5", label: "Gasoline 95", category: "gasoline" },
  { code: "E10", label: "Gasoline E10", category: "gasoline" },
  { code: "E5_98", label: "Gasoline 98", category: "gasoline" },
  { code: "LPG", label: "LPG / Autogas", category: "gas" },
  { code: "CNG", label: "CNG", category: "gas" },
  { code: "H2", label: "Hydrogen", category: "hydrogen" },
];

export const FUEL_TYPE_MAP = new Map(FUEL_TYPES.map((f) => [f.code, f]));
