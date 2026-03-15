import { NextResponse } from "next/server";
import { getConfig, COUNTRIES } from "@/lib/config";

export async function GET() {
  const config = getConfig();
  const enabled = config.enabledCountries.map((code) => ({
    code,
    name: COUNTRIES[code]?.name ?? code,
    center: COUNTRIES[code]?.center,
    zoom: COUNTRIES[code]?.zoom,
  }));

  return NextResponse.json({
    defaultCountry: config.defaultCountry,
    defaultFuel: config.defaultFuel,
    center: config.center,
    zoom: config.zoom,
    enabledCountries: enabled,
  }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
