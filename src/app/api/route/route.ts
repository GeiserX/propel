import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRoute } from "@/lib/valhalla";

const coordSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

const bodySchema = z.object({
  origin: coordSchema,
  destination: coordSchema,
  waypoints: z.array(coordSchema).max(5).optional(),
});

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

  const { origin, destination, waypoints } = parseResult.data;

  // Build locations array: origin + waypoints + destination
  const locations = [
    { lon: origin[0], lat: origin[1] },
    ...(waypoints ?? []).map(([lon, lat]) => ({ lon, lat })),
    { lon: destination[0], lat: destination[1] },
  ];

  try {
    const route = await getRoute(locations);
    if (!route) {
      console.error("[route] Valhalla returned no route");
      return NextResponse.json({ error: "Routing service unavailable" }, { status: 502 });
    }

    console.log(`[route] ${route.distance.toFixed(1)}km, ${Math.round(route.duration / 60)}min, ${route.geometry.coordinates.length} points`);
    return NextResponse.json(route);
  } catch (err) {
    console.error("[route] Calculation failed:", err);
    return NextResponse.json({ error: "Route calculation failed" }, { status: 502 });
  }
}
