import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { StationsGeoJSONCollection, StationGeoJSON } from "@/types/station";

const VALID_FUEL_TYPES = [
  "E5",
  "E10",
  "E5_98",
  "B7",
  "B7_PREMIUM",
  "B10",
  "LPG",
  "CNG",
  "H2",
] as const;

const querySchema = z.object({
  bbox: z
    .string()
    .transform((val) => val.split(",").map(Number))
    .refine(
      (arr) =>
        arr.length === 4 &&
        arr.every((n) => !Number.isNaN(n)) &&
        arr[0] >= -180 &&
        arr[0] <= 180 &&
        arr[1] >= -90 &&
        arr[1] <= 90 &&
        arr[2] >= -180 &&
        arr[2] <= 180 &&
        arr[3] >= -90 &&
        arr[3] <= 90,
      { message: "bbox must be minLon,minLat,maxLon,maxLat with valid coordinates" },
    ),
  fuel: z.enum(VALID_FUEL_TYPES),
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
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parseResult = querySchema.safeParse({
    bbox: searchParams.get("bbox"),
    fuel: searchParams.get("fuel"),
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parseResult.error.issues },
      { status: 400 },
    );
  }

  const { bbox, fuel } = parseResult.data;
  const [minLon, minLat, maxLon, maxLat] = bbox;

  try {
    // Query stations within the bounding box with the latest price for the selected fuel type.
    // Uses PostGIS ST_Within + ST_MakeEnvelope for the spatial filter,
    // and a lateral join to get only the most recent price per station.
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
        COALESCE(fp.currency, 'EUR') AS currency
      FROM stations s
      LEFT JOIN LATERAL (
        SELECT price, currency
        FROM fuel_prices
        WHERE station_id = s.id
          AND fuel_type = $5
        ORDER BY reported_at DESC
        LIMIT 1
      ) fp ON true
      WHERE ST_Within(
        s.geom,
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )
      LIMIT 2000
      `,
      minLon,
      minLat,
      maxLon,
      maxLat,
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
        price: row.price,
        fuelType: fuel,
        currency: row.currency,
      },
    }));

    const collection: StationsGeoJSONCollection = {
      type: "FeatureCollection",
      features,
    };

    return NextResponse.json(collection, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("Failed to query stations:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
