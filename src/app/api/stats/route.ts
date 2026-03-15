import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConfig, COUNTRIES } from "@/lib/config";

interface CountStats {
  country: string;
  stations: number;
  prices: number;
  last_update: Date | null;
}

export async function GET() {
  const config = getConfig();

  try {
    const rows: CountStats[] = await prisma.$queryRawUnsafe(`
      SELECT
        s.country,
        COUNT(DISTINCT s.id)::int AS stations,
        COUNT(fp.id)::int AS prices,
        MAX(fp.reported_at) AS last_update
      FROM stations s
      LEFT JOIN fuel_prices fp ON fp.station_id = s.id
      GROUP BY s.country
      ORDER BY stations DESC
    `);

    const countries = rows.map((r) => ({
      code: r.country,
      name: COUNTRIES[r.country]?.name ?? r.country,
      stations: r.stations,
      prices: r.prices,
      lastUpdate: r.last_update ? new Date(r.last_update).toISOString() : null,
    }));

    const totals = {
      stations: countries.reduce((sum, c) => sum + c.stations, 0),
      prices: countries.reduce((sum, c) => sum + c.prices, 0),
    };

    return NextResponse.json({
      totals,
      countries,
      config: {
        defaultCountry: config.defaultCountry,
        enabledCountries: config.enabledCountries,
        defaultFuel: config.defaultFuel,
        center: config.center,
        zoom: config.zoom,
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("Failed to query stats:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
