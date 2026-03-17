"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { StationsGeoJSONCollection, StationGeoJSON } from "@/types/station";

// ---------------------------------------------------------------------------
// Currency definitions — all major world currencies
// ---------------------------------------------------------------------------

export type Currency =
  // Major reserve
  | "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "AUD" | "NZD"
  // Nordic
  | "SEK" | "NOK" | "DKK" | "ISK"
  // Central & Eastern Europe
  | "CZK" | "PLN" | "HUF" | "RON" | "BGN" | "UAH" | "RSD" | "GEL" | "MDL" | "ALL" | "BAM" | "MKD" | "BYN" | "RUB"
  // Turkey
  | "TRY"
  // East Asia
  | "CNY" | "HKD" | "TWD" | "KRW" | "MNT"
  // Southeast Asia
  | "SGD" | "MYR" | "THB" | "IDR" | "PHP" | "VND" | "MMK" | "KHR" | "LAK" | "BND"
  // South Asia
  | "INR" | "PKR" | "BDT" | "LKR" | "NPR"
  // Central Asia
  | "KZT" | "UZS"
  // Middle East
  | "ILS" | "SAR" | "AED" | "QAR" | "KWD" | "BHD" | "OMR" | "JOD" | "IQD" | "LBP"
  // North Africa
  | "EGP" | "MAD" | "TND" | "DZD" | "LYD"
  // Sub-Saharan Africa
  | "ZAR" | "NGN" | "KES" | "GHS" | "TZS" | "UGX" | "ETB" | "XOF" | "XAF" | "RWF" | "MZN" | "AOA" | "ZMW" | "BWP" | "MUR" | "NAD"
  // Americas
  | "BRL" | "MXN" | "ARS" | "CLP" | "COP" | "PEN" | "UYU" | "PYG" | "BOB" | "CRC" | "GTQ" | "DOP" | "HNL" | "JMD" | "TTD"
  // Oceania
  | "FJD" | "PGK" | "XPF";

export interface CurrencyInfo {
  code: Currency;
  symbol: string;
  label: string;
  /** Decimal places for fuel price display */
  decimals: number;
}

export const CURRENCIES: CurrencyInfo[] = [
  // ── Major reserve ──────────────────────────────────────────────────
  { code: "EUR", symbol: "€", label: "Euro", decimals: 3 },
  { code: "USD", symbol: "$", label: "US Dollar", decimals: 3 },
  { code: "GBP", symbol: "£", label: "British Pound", decimals: 3 },
  { code: "CHF", symbol: "CHF", label: "Swiss Franc", decimals: 3 },
  { code: "JPY", symbol: "¥", label: "Japanese Yen", decimals: 0 },
  { code: "CAD", symbol: "CA$", label: "Canadian Dollar", decimals: 3 },
  { code: "AUD", symbol: "A$", label: "Australian Dollar", decimals: 3 },
  { code: "NZD", symbol: "NZ$", label: "New Zealand Dollar", decimals: 3 },
  // ── Nordic ─────────────────────────────────────────────────────────
  { code: "SEK", symbol: "kr", label: "Swedish Krona", decimals: 2 },
  { code: "NOK", symbol: "kr", label: "Norwegian Krone", decimals: 2 },
  { code: "DKK", symbol: "kr", label: "Danish Krone", decimals: 2 },
  { code: "ISK", symbol: "kr", label: "Icelandic Króna", decimals: 0 },
  // ── Central & Eastern Europe ───────────────────────────────────────
  { code: "CZK", symbol: "Kč", label: "Czech Koruna", decimals: 2 },
  { code: "PLN", symbol: "zł", label: "Polish Złoty", decimals: 2 },
  { code: "HUF", symbol: "Ft", label: "Hungarian Forint", decimals: 0 },
  { code: "RON", symbol: "lei", label: "Romanian Leu", decimals: 3 },
  { code: "BGN", symbol: "лв", label: "Bulgarian Lev", decimals: 3 },
  { code: "UAH", symbol: "₴", label: "Ukrainian Hryvnia", decimals: 2 },
  { code: "RSD", symbol: "din", label: "Serbian Dinar", decimals: 0 },
  { code: "GEL", symbol: "₾", label: "Georgian Lari", decimals: 2 },
  { code: "MDL", symbol: "L", label: "Moldovan Leu", decimals: 2 },
  { code: "ALL", symbol: "L", label: "Albanian Lek", decimals: 0 },
  { code: "BAM", symbol: "KM", label: "Bosnia Conv. Mark", decimals: 3 },
  { code: "MKD", symbol: "ден", label: "Macedonian Denar", decimals: 2 },
  { code: "BYN", symbol: "Br", label: "Belarusian Ruble", decimals: 2 },
  { code: "RUB", symbol: "₽", label: "Russian Ruble", decimals: 2 },
  // ── Turkey ─────────────────────────────────────────────────────────
  { code: "TRY", symbol: "₺", label: "Turkish Lira", decimals: 2 },
  // ── East Asia ──────────────────────────────────────────────────────
  { code: "CNY", symbol: "¥", label: "Chinese Yuan", decimals: 2 },
  { code: "HKD", symbol: "HK$", label: "Hong Kong Dollar", decimals: 2 },
  { code: "TWD", symbol: "NT$", label: "New Taiwan Dollar", decimals: 2 },
  { code: "KRW", symbol: "₩", label: "South Korean Won", decimals: 0 },
  { code: "MNT", symbol: "₮", label: "Mongolian Tugrik", decimals: 0 },
  // ── Southeast Asia ─────────────────────────────────────────────────
  { code: "SGD", symbol: "S$", label: "Singapore Dollar", decimals: 3 },
  { code: "MYR", symbol: "RM", label: "Malaysian Ringgit", decimals: 2 },
  { code: "THB", symbol: "฿", label: "Thai Baht", decimals: 2 },
  { code: "IDR", symbol: "Rp", label: "Indonesian Rupiah", decimals: 0 },
  { code: "PHP", symbol: "₱", label: "Philippine Peso", decimals: 2 },
  { code: "VND", symbol: "₫", label: "Vietnamese Dong", decimals: 0 },
  { code: "MMK", symbol: "K", label: "Myanmar Kyat", decimals: 0 },
  { code: "KHR", symbol: "៛", label: "Cambodian Riel", decimals: 0 },
  { code: "LAK", symbol: "₭", label: "Lao Kip", decimals: 0 },
  { code: "BND", symbol: "B$", label: "Brunei Dollar", decimals: 3 },
  // ── South Asia ─────────────────────────────────────────────────────
  { code: "INR", symbol: "₹", label: "Indian Rupee", decimals: 2 },
  { code: "PKR", symbol: "Rs", label: "Pakistani Rupee", decimals: 0 },
  { code: "BDT", symbol: "৳", label: "Bangladeshi Taka", decimals: 0 },
  { code: "LKR", symbol: "Rs", label: "Sri Lankan Rupee", decimals: 0 },
  { code: "NPR", symbol: "Rs", label: "Nepalese Rupee", decimals: 0 },
  // ── Central Asia ───────────────────────────────────────────────────
  { code: "KZT", symbol: "₸", label: "Kazakh Tenge", decimals: 0 },
  { code: "UZS", symbol: "сўм", label: "Uzbek Som", decimals: 0 },
  // ── Middle East ────────────────────────────────────────────────────
  { code: "ILS", symbol: "₪", label: "Israeli Shekel", decimals: 2 },
  { code: "SAR", symbol: "﷼", label: "Saudi Riyal", decimals: 2 },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham", decimals: 2 },
  { code: "QAR", symbol: "﷼", label: "Qatari Riyal", decimals: 2 },
  { code: "KWD", symbol: "د.ك", label: "Kuwaiti Dinar", decimals: 3 },
  { code: "BHD", symbol: "BD", label: "Bahraini Dinar", decimals: 3 },
  { code: "OMR", symbol: "﷼", label: "Omani Rial", decimals: 3 },
  { code: "JOD", symbol: "JD", label: "Jordanian Dinar", decimals: 3 },
  { code: "IQD", symbol: "ع.د", label: "Iraqi Dinar", decimals: 0 },
  { code: "LBP", symbol: "ل.ل", label: "Lebanese Pound", decimals: 0 },
  // ── North Africa ───────────────────────────────────────────────────
  { code: "EGP", symbol: "E£", label: "Egyptian Pound", decimals: 2 },
  { code: "MAD", symbol: "MAD", label: "Moroccan Dirham", decimals: 2 },
  { code: "TND", symbol: "DT", label: "Tunisian Dinar", decimals: 3 },
  { code: "DZD", symbol: "DA", label: "Algerian Dinar", decimals: 0 },
  { code: "LYD", symbol: "LD", label: "Libyan Dinar", decimals: 3 },
  // ── Sub-Saharan Africa ─────────────────────────────────────────────
  { code: "ZAR", symbol: "R", label: "South African Rand", decimals: 2 },
  { code: "NGN", symbol: "₦", label: "Nigerian Naira", decimals: 0 },
  { code: "KES", symbol: "KSh", label: "Kenyan Shilling", decimals: 0 },
  { code: "GHS", symbol: "GH₵", label: "Ghanaian Cedi", decimals: 2 },
  { code: "TZS", symbol: "TSh", label: "Tanzanian Shilling", decimals: 0 },
  { code: "UGX", symbol: "USh", label: "Ugandan Shilling", decimals: 0 },
  { code: "ETB", symbol: "Br", label: "Ethiopian Birr", decimals: 2 },
  { code: "XOF", symbol: "CFA", label: "West African CFA", decimals: 0 },
  { code: "XAF", symbol: "FCFA", label: "Central African CFA", decimals: 0 },
  { code: "RWF", symbol: "FRw", label: "Rwandan Franc", decimals: 0 },
  { code: "MZN", symbol: "MT", label: "Mozambican Metical", decimals: 2 },
  { code: "AOA", symbol: "Kz", label: "Angolan Kwanza", decimals: 0 },
  { code: "ZMW", symbol: "ZK", label: "Zambian Kwacha", decimals: 2 },
  { code: "BWP", symbol: "P", label: "Botswana Pula", decimals: 2 },
  { code: "MUR", symbol: "Rs", label: "Mauritian Rupee", decimals: 2 },
  { code: "NAD", symbol: "N$", label: "Namibian Dollar", decimals: 2 },
  // ── Americas ───────────────────────────────────────────────────────
  { code: "BRL", symbol: "R$", label: "Brazilian Real", decimals: 2 },
  { code: "MXN", symbol: "MX$", label: "Mexican Peso", decimals: 2 },
  { code: "ARS", symbol: "AR$", label: "Argentine Peso", decimals: 0 },
  { code: "CLP", symbol: "CL$", label: "Chilean Peso", decimals: 0 },
  { code: "COP", symbol: "CO$", label: "Colombian Peso", decimals: 0 },
  { code: "PEN", symbol: "S/", label: "Peruvian Sol", decimals: 2 },
  { code: "UYU", symbol: "$U", label: "Uruguayan Peso", decimals: 2 },
  { code: "PYG", symbol: "₲", label: "Paraguayan Guaraní", decimals: 0 },
  { code: "BOB", symbol: "Bs", label: "Bolivian Boliviano", decimals: 2 },
  { code: "CRC", symbol: "₡", label: "Costa Rican Colón", decimals: 0 },
  { code: "GTQ", symbol: "Q", label: "Guatemalan Quetzal", decimals: 2 },
  { code: "DOP", symbol: "RD$", label: "Dominican Peso", decimals: 2 },
  { code: "HNL", symbol: "L", label: "Honduran Lempira", decimals: 2 },
  { code: "JMD", symbol: "J$", label: "Jamaican Dollar", decimals: 0 },
  { code: "TTD", symbol: "TT$", label: "Trinidad & Tobago Dollar", decimals: 2 },
  // ── Oceania ────────────────────────────────────────────────────────
  { code: "FJD", symbol: "FJ$", label: "Fijian Dollar", decimals: 2 },
  { code: "PGK", symbol: "K", label: "Papua New Guinean Kina", decimals: 2 },
  { code: "XPF", symbol: "F", label: "CFP Franc", decimals: 0 },
];

const CURRENCY_MAP = new Map(CURRENCIES.map((c) => [c.code, c]));

// ---------------------------------------------------------------------------
// Locale → Currency mapping (browser region code → default currency)
// ---------------------------------------------------------------------------

const REGION_TO_CURRENCY: Record<string, Currency> = {
  // Europe
  GB: "GBP", UK: "GBP",
  CH: "CHF", LI: "CHF",
  SE: "SEK", NO: "NOK", DK: "DKK", IS: "ISK",
  CZ: "CZK", PL: "PLN", HU: "HUF", RO: "RON", BG: "BGN",
  UA: "UAH", RS: "RSD", GE: "GEL", MD: "MDL", AL: "ALL", BA: "BAM", MK: "MKD", BY: "BYN", RU: "RUB",
  TR: "TRY",
  // Americas
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", UY: "UYU",
  PY: "PYG", BO: "BOB", CR: "CRC", GT: "GTQ", DO: "DOP", HN: "HNL", JM: "JMD", TT: "TTD",
  // East Asia
  JP: "JPY", CN: "CNY", HK: "HKD", TW: "TWD", KR: "KRW", MN: "MNT",
  // Southeast Asia
  SG: "SGD", MY: "MYR", TH: "THB", ID: "IDR", PH: "PHP", VN: "VND", MM: "MMK", KH: "KHR", LA: "LAK", BN: "BND",
  // South Asia
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
  // Central Asia
  KZ: "KZT", UZ: "UZS",
  // Middle East
  IL: "ILS", SA: "SAR", AE: "AED", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD", IQ: "IQD", LB: "LBP",
  // North Africa
  EG: "EGP", MA: "MAD", TN: "TND", DZ: "DZD", LY: "LYD",
  // Sub-Saharan Africa
  ZA: "ZAR", NG: "NGN", KE: "KES", GH: "GHS", TZ: "TZS", UG: "UGX", ET: "ETB", RW: "RWF", MZ: "MZN", AO: "AOA", ZM: "ZMW", BW: "BWP", MU: "MUR", NA: "NAD",
  // Oceania
  AU: "AUD", NZ: "NZD", FJ: "FJD", PG: "PGK",
};

function detectBrowserCurrency(): Currency {
  if (typeof navigator === "undefined") return "EUR";
  const langs = navigator.languages ?? [navigator.language];
  for (const lang of langs) {
    const region = lang.split("-")[1]?.toUpperCase();
    if (region && region in REGION_TO_CURRENCY) return REGION_TO_CURRENCY[region];
  }
  return "EUR";
}

// ---------------------------------------------------------------------------
// Exchange rates (ECB publishes ~30 currencies; others won't convert)
// ---------------------------------------------------------------------------

export interface ExchangeRates {
  base: "EUR";
  rates: Record<string, number>;
  date: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  rates: ExchangeRates | null;
  convert: (price: number, from: string) => number;
  symbol: string;
  decimals: number;
  formatPrice: (price: number) => string;
  /** True only when both source and target rates are available */
  isConverted: (from: string) => boolean;
  rateInfo: (from: string) => string | null;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "EUR",
  setCurrency: () => {},
  rates: null,
  convert: (p) => p,
  symbol: "€",
  decimals: 3,
  formatPrice: (p) => p.toFixed(3),
  isConverted: () => false,
  rateInfo: () => null,
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    if (typeof window === "undefined") return "EUR";
    const stored = localStorage.getItem("propel-currency") as Currency | null;
    if (stored && CURRENCY_MAP.has(stored)) return stored;
    return detectBrowserCurrency();
  });

  const [rates, setRates] = useState<ExchangeRates | null>(null);

  useEffect(() => {
    fetch("/api/exchange-rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.rates) setRates(data as ExchangeRates);
      })
      .catch(() => {});
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem("propel-currency", c);
  }, []);

  const info = CURRENCY_MAP.get(currency) ?? CURRENCIES[0];

  const canConvert = useCallback(
    (from: string): boolean => {
      if (from === currency) return false;
      if (!rates) return false;
      const fromRate = from === "EUR" ? 1 : rates.rates[from];
      const toRate = currency === "EUR" ? 1 : rates.rates[currency];
      return fromRate != null && toRate != null;
    },
    [currency, rates],
  );

  const convert = useCallback(
    (price: number, from: string): number => {
      if (from === currency || !rates) return price;
      const fromRate = from === "EUR" ? 1 : rates.rates[from];
      const toRate = currency === "EUR" ? 1 : rates.rates[currency];
      if (!fromRate || !toRate) return price; // rate unavailable — return as-is
      return (price / fromRate) * toRate;
    },
    [currency, rates],
  );

  const formatPrice = useCallback(
    (price: number): string => price.toFixed(info.decimals),
    [info.decimals],
  );

  const isConverted = useCallback(
    (from: string): boolean => canConvert(from),
    [canConvert],
  );

  const rateInfo = useCallback(
    (from: string): string | null => {
      if (!canConvert(from)) return null;
      const fromRate = from === "EUR" ? 1 : rates!.rates[from];
      const toRate = currency === "EUR" ? 1 : rates!.rates[currency];
      const rate = toRate / fromRate;
      const d = new Date(rates!.date + "T12:00:00Z");
      const dateStr = d.toLocaleDateString("en", { day: "numeric", month: "short" });
      const fromSymbol = CURRENCY_MAP.get(from as Currency)?.symbol ?? from;
      return `1 ${fromSymbol} = ${rate.toFixed(4)} ${info.symbol} · ECB ${dateStr}`;
    },
    [canConvert, currency, rates, info.symbol],
  );

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        rates,
        convert,
        symbol: info.symbol,
        decimals: info.decimals,
        formatPrice,
        isConverted,
        rateInfo,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

// ---------------------------------------------------------------------------
// Hook: convert all station prices in a GeoJSON collection
// ---------------------------------------------------------------------------

export function useConvertedStations(stations: StationsGeoJSONCollection): StationsGeoJSONCollection {
  const { convert, currency, rates, isConverted: canConvert } = useCurrency();

  return useMemo(() => {
    if (!rates) return stations;

    let changed = false;
    const features: StationGeoJSON[] = stations.features.map((f) => {
      const nativeCurrency = f.properties.currency;
      const nativePrice = f.properties.price;
      if (nativePrice == null || !canConvert(nativeCurrency)) return f;

      changed = true;
      return {
        ...f,
        properties: {
          ...f.properties,
          price: convert(nativePrice, nativeCurrency),
          currency,
          originalPrice: nativePrice,
          originalCurrency: nativeCurrency,
        },
      };
    });

    return changed ? { type: "FeatureCollection", features } : stations;
  }, [stations, convert, currency, rates, canConvert]);
}
