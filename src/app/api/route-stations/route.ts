import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { StationsGeoJSONCollection, StationGeoJSON } from "@/types/station";

const VALID_FUEL_TYPES = [
  "E5", "E5_PREMIUM", "E10", "E5_98", "E98_E10",
  "B7", "B7_PREMIUM", "B10", "B_AGRICULTURAL", "HVO",
  "LPG", "CNG", "LNG", "H2", "ADBLUE",
] as const;

const bodySchema = z.object({
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
  }),
  fuel: z.enum(VALID_FUEL_TYPES),
  corridorKm: z.number().min(0.5).max(50).optional().default(5),
});

interface StationRow {
  id: string;
  name: string;
  brand: string | null;
  address: string;
  city: string;
  longitude: number;
  latitude: number;
  price: number | null;
  currency: string;
  reported_at: Date | null;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parseResult = bodySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parseResult.error.issues },
      { status: 400 },
    );
  }

  const { geometry, fuel, corridorKm } = parseResult.data;

  // Convert GeoJSON coordinates to WKT LineString
  const wkt = `LINESTRING(${geometry.coordinates.map(([lon, lat]) => `${lon} ${lat}`).join(",")})`;
  const corridorMeters = corridorKm * 1000;

  try {
    const rows: StationRow[] = await prisma.$queryRawUnsafe(
      `
      SELECT
        s.id,
        s.name,
        s.brand,
        s.address,
        s.city,
        ST_X(s.geom) AS longitude,
        ST_Y(s.geom) AS latitude,
        fp.price::float AS price,
        COALESCE(fp.currency, 'EUR') AS currency,
        fp.reported_at
      FROM stations s
      LEFT JOIN LATERAL (
        SELECT price, currency, reported_at
        FROM fuel_prices
        WHERE station_id = s.id
          AND fuel_type = $3
        ORDER BY reported_at DESC NULLS LAST
        LIMIT 1
      ) fp ON true
      WHERE ST_DWithin(
        s.geom::geography,
        ST_GeomFromText($1, 4326)::geography,
        $2
      )
      `,
      wkt,
      corridorMeters,
      fuel,
    );

    const features: StationGeoJSON[] = rows.map((row) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [row.longitude, row.latitude],
      },
      properties: {
        id: row.id,
        name: row.name,
        brand: row.brand,
        address: row.address,
        city: row.city,
        fuelType: fuel,
        currency: row.currency,
        ...(row.price != null ? { price: row.price } : {}),
        ...(row.reported_at ? { reportedAt: new Date(row.reported_at).toISOString() } : {}),
      },
    }));

    const collection: StationsGeoJSONCollection = {
      type: "FeatureCollection",
      features,
    };

    console.log(`[route-stations] fuel=${fuel} corridor=${corridorKm}km → ${features.length} stations`);
    return NextResponse.json(collection);
  } catch (err) {
    console.error("[route-stations] Query failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
