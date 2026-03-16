import { getConfig } from "@/lib/config";
import { HomeClient } from "@/components/home-client";

export default function Home() {
  const config = getConfig();

  return (
    <HomeClient
      defaultFuel={config.defaultFuel}
      center={config.center}
      zoom={config.zoom}
      clusterStations={config.clusterStations}
    />
  );
}
