"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type Locale = "es" | "en" | "fr" | "de" | "it" | "pt";

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "es", label: "Español", flag: "ES" },
  { code: "en", label: "English", flag: "GB" },
  { code: "fr", label: "Français", flag: "FR" },
  { code: "de", label: "Deutsch", flag: "DE" },
  { code: "it", label: "Italiano", flag: "IT" },
  { code: "pt", label: "Português", flag: "PT" },
];

// ---------------------------------------------------------------------------
// Translation keys
// ---------------------------------------------------------------------------

const translations: Record<Locale, Record<string, string>> = {
  es: {
    "search.placeholder": "Buscar lugar...",
    "search.destination": "Destino",
    "search.addWaypoint": "Añadir parada",
    "route.distance": "km",
    "route.duration": "min",
    "route.loading": "Calculando ruta...",
    "route.alternatives": "Rutas alternativas",
    "stations.title": "Estaciones en ruta",
    "stations.empty": "No hay estaciones con este filtro",
    "stations.detourMax": "Desvío máximo",
    "stations.noLimit": "Sin límite",
    "stations.cheapest": "MÁS BARATA",
    "stations.leastDetour": "MENOS RODEO",
    "stations.balanced": "EQUILIBRADA",
    "fuel.diesel": "Diésel",
    "fuel.gasoline": "Gasolina",
    "fuel.gas": "Gas",
    "fuel.hydrogen": "Hidrógeno",
    "fuel.other": "Otros",
    "stats.title": "Estadísticas",
    "stats.stations": "estaciones",
    "stats.prices": "precios",
    "stats.lastUpdate": "Última actualización",
  },
  en: {
    "search.placeholder": "Search place...",
    "search.destination": "Destination",
    "search.addWaypoint": "Add stop",
    "route.distance": "km",
    "route.duration": "min",
    "route.loading": "Calculating route...",
    "route.alternatives": "Alternative routes",
    "stations.title": "Stations along route",
    "stations.empty": "No stations match this filter",
    "stations.detourMax": "Max detour",
    "stations.noLimit": "No limit",
    "stations.cheapest": "CHEAPEST",
    "stations.leastDetour": "LEAST DETOUR",
    "stations.balanced": "BALANCED",
    "fuel.diesel": "Diesel",
    "fuel.gasoline": "Gasoline",
    "fuel.gas": "Gas",
    "fuel.hydrogen": "Hydrogen",
    "fuel.other": "Other",
    "stats.title": "Statistics",
    "stats.stations": "stations",
    "stats.prices": "prices",
    "stats.lastUpdate": "Last update",
  },
  fr: {
    "search.placeholder": "Rechercher un lieu...",
    "search.destination": "Destination",
    "search.addWaypoint": "Ajouter un arrêt",
    "route.distance": "km",
    "route.duration": "min",
    "route.loading": "Calcul de l'itinéraire...",
    "route.alternatives": "Itinéraires alternatifs",
    "stations.title": "Stations sur le trajet",
    "stations.empty": "Aucune station avec ce filtre",
    "stations.detourMax": "Détour max",
    "stations.noLimit": "Sans limite",
    "stations.cheapest": "MOINS CHÈRE",
    "stations.leastDetour": "MOINS DE DÉTOUR",
    "stations.balanced": "ÉQUILIBRÉE",
    "fuel.diesel": "Diesel",
    "fuel.gasoline": "Essence",
    "fuel.gas": "Gaz",
    "fuel.hydrogen": "Hydrogène",
    "fuel.other": "Autres",
    "stats.title": "Statistiques",
    "stats.stations": "stations",
    "stats.prices": "prix",
    "stats.lastUpdate": "Dernière mise à jour",
  },
  de: {
    "search.placeholder": "Ort suchen...",
    "search.destination": "Ziel",
    "search.addWaypoint": "Zwischenstopp",
    "route.distance": "km",
    "route.duration": "Min",
    "route.loading": "Route wird berechnet...",
    "route.alternatives": "Alternative Routen",
    "stations.title": "Tankstellen an der Route",
    "stations.empty": "Keine Tankstellen mit diesem Filter",
    "stations.detourMax": "Max. Umweg",
    "stations.noLimit": "Kein Limit",
    "stations.cheapest": "GÜNSTIGSTE",
    "stations.leastDetour": "WENIGSTER UMWEG",
    "stations.balanced": "AUSGEWOGEN",
    "fuel.diesel": "Diesel",
    "fuel.gasoline": "Benzin",
    "fuel.gas": "Gas",
    "fuel.hydrogen": "Wasserstoff",
    "fuel.other": "Andere",
    "stats.title": "Statistik",
    "stats.stations": "Tankstellen",
    "stats.prices": "Preise",
    "stats.lastUpdate": "Letztes Update",
  },
  it: {
    "search.placeholder": "Cerca luogo...",
    "search.destination": "Destinazione",
    "search.addWaypoint": "Aggiungi tappa",
    "route.distance": "km",
    "route.duration": "min",
    "route.loading": "Calcolo percorso...",
    "route.alternatives": "Percorsi alternativi",
    "stations.title": "Stazioni sul percorso",
    "stations.empty": "Nessuna stazione con questo filtro",
    "stations.detourMax": "Deviazione max",
    "stations.noLimit": "Senza limite",
    "stations.cheapest": "PIÙ ECONOMICA",
    "stations.leastDetour": "MENO DEVIAZIONE",
    "stations.balanced": "EQUILIBRATA",
    "fuel.diesel": "Diesel",
    "fuel.gasoline": "Benzina",
    "fuel.gas": "Gas",
    "fuel.hydrogen": "Idrogeno",
    "fuel.other": "Altri",
    "stats.title": "Statistiche",
    "stats.stations": "stazioni",
    "stats.prices": "prezzi",
    "stats.lastUpdate": "Ultimo aggiornamento",
  },
  pt: {
    "search.placeholder": "Pesquisar local...",
    "search.destination": "Destino",
    "search.addWaypoint": "Adicionar paragem",
    "route.distance": "km",
    "route.duration": "min",
    "route.loading": "A calcular rota...",
    "route.alternatives": "Rotas alternativas",
    "stations.title": "Estações na rota",
    "stations.empty": "Sem estações com este filtro",
    "stations.detourMax": "Desvio máximo",
    "stations.noLimit": "Sem limite",
    "stations.cheapest": "MAIS BARATA",
    "stations.leastDetour": "MENOS DESVIO",
    "stations.balanced": "EQUILIBRADA",
    "fuel.diesel": "Gasóleo",
    "fuel.gasoline": "Gasolina",
    "fuel.gas": "Gás",
    "fuel.hydrogen": "Hidrogénio",
    "fuel.other": "Outros",
    "stats.title": "Estatísticas",
    "stats.stations": "estações",
    "stats.prices": "preços",
    "stats.lastUpdate": "Última atualização",
  },
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "es",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ defaultLocale = "es", children }: { defaultLocale?: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return defaultLocale;
    const stored = localStorage.getItem("propel-locale") as Locale | null;
    return stored && stored in translations ? stored : defaultLocale;
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("propel-locale", l);
  }, []);

  const t = useCallback((key: string) => {
    return translations[locale]?.[key] ?? translations.es[key] ?? key;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
