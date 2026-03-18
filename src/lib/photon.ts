const PHOTON_URL = process.env.PHOTON_URL;

export interface PhotonResult {
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  coordinates: [number, number]; // [lon, lat]
}

interface PhotonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
}

interface PhotonResponse {
  type: "FeatureCollection";
  features: PhotonFeature[];
}

export async function geocode(
  query: string,
  lat?: number,
  lon?: number,
): Promise<PhotonResult[]> {
  if (!PHOTON_URL) return [];

  const params = new URLSearchParams({ q: query, limit: "5" });
  if (lat != null && lon != null) {
    params.set("lat", String(lat));
    params.set("lon", String(lon));
  }

  const res = await fetch(`${PHOTON_URL}/api?${params}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return [];

  const data: PhotonResponse = await res.json();

  return data.features.map((f) => ({
    name: f.properties.name ?? query,
    city: f.properties.city ?? null,
    state: f.properties.state ?? null,
    country: f.properties.country ?? null,
    coordinates: f.geometry.coordinates,
  }));
}
