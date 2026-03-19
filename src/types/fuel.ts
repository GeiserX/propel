import type { FuelType } from "./station";

export interface FuelTypeInfo {
  code: FuelType;
  label: string;
  category: "gasoline" | "diesel" | "gas" | "hydrogen" | "electric" | "other";
}

export const FUEL_TYPES: FuelTypeInfo[] = [
  // Diesel
  { code: "B7", label: "Diesel (A)", category: "diesel" },
  { code: "B7_PREMIUM", label: "Diesel Premium", category: "diesel" },
  { code: "B_AGRICULTURAL", label: "Diesel B (Agrícola)", category: "diesel" },
  { code: "HVO", label: "Diesel Renovable (HVO)", category: "diesel" },
  // Gasoline
  { code: "E5", label: "Gasolina 95", category: "gasoline" },
  { code: "E5_PREMIUM", label: "Gasolina 95 Premium", category: "gasoline" },
  { code: "E10", label: "Gasolina 95 E10", category: "gasoline" },
  { code: "E5_98", label: "Gasolina 98", category: "gasoline" },
  { code: "E98_E10", label: "Gasolina 98 E10", category: "gasoline" },
  // Gas
  { code: "LPG", label: "GLP / Autogas", category: "gas" },
  { code: "CNG", label: "GNC", category: "gas" },
  { code: "LNG", label: "GNL", category: "gas" },
  // Hydrogen
  { code: "H2", label: "Hidrógeno", category: "hydrogen" },
  // Electric
  { code: "EV", label: "EV Charging", category: "electric" },
  // Other
  { code: "ADBLUE", label: "AdBlue", category: "other" },
];

export const FUEL_TYPE_MAP = new Map(FUEL_TYPES.map((f) => [f.code, f]));

export const FUEL_CATEGORIES: { key: FuelTypeInfo["category"]; label: string }[] = [
  { key: "diesel", label: "Diésel" },
  { key: "gasoline", label: "Gasolina" },
  { key: "gas", label: "Gas" },
  { key: "hydrogen", label: "Hidrógeno" },
  { key: "electric", label: "Eléctrico" },
  { key: "other", label: "Otros" },
];
