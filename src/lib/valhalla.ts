const VALHALLA_URL = process.env.VALHALLA_URL;

export interface ValhallaRoute {
  geometry: GeoJSON.LineString;
  distance: number; // km
  duration: number; // seconds
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

interface ValhallaLeg {
  shape: string; // encoded polyline (precision 6)
  summary: { length: number; time: number };
}

interface ValhallaTrip {
  legs: ValhallaLeg[];
  summary: { length: number; time: number };
}

/** Decode Valhalla encoded polyline (precision 6). */
function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / 1e6, lat / 1e6]); // [lon, lat] for GeoJSON
  }
  return coords;
}

export async function getRoute(
  locations: { lat: number; lon: number }[],
  costing: string = "auto",
): Promise<ValhallaRoute | null> {
  if (!VALHALLA_URL) return null;

  const body = {
    locations: locations.map((l) => ({ lat: l.lat, lon: l.lon })),
    costing,
    directions_options: { units: "kilometers" },
  };

  const res = await fetch(`${VALHALLA_URL}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return null;

  const data: { trip: ValhallaTrip } = await res.json();
  const { trip } = data;

  // Combine all leg shapes into a single coordinate array
  const allCoords: [number, number][] = [];
  for (const leg of trip.legs) {
    const decoded = decodePolyline(leg.shape);
    // Skip first point of subsequent legs (duplicate with previous leg's last point)
    if (allCoords.length > 0 && decoded.length > 0) {
      allCoords.push(...decoded.slice(1));
    } else {
      allCoords.push(...decoded);
    }
  }

  // Compute bounding box
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of allCoords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  return {
    geometry: { type: "LineString", coordinates: allCoords },
    distance: trip.summary.length,
    duration: trip.summary.time,
    bbox: [minLon, minLat, maxLon, maxLat],
  };
}
