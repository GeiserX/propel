import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { geocode } from "@/lib/photon";

const querySchema = z.object({
  q: z.string().min(1).max(200),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parseResult = querySchema.safeParse({
    q: searchParams.get("q"),
    lat: searchParams.get("lat") ?? undefined,
    lon: searchParams.get("lon") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parseResult.error.issues },
      { status: 400 },
    );
  }

  const { q, lat, lon } = parseResult.data;

  try {
    const results = await geocode(q, lat, lon);
    return NextResponse.json(results, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
  }
}
