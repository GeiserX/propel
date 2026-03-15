"use client";

import { useState } from "react";
import type { FuelType } from "@/types/station";
import { Navbar } from "@/components/nav/navbar";
import { MapView } from "@/components/map/map-view";

interface Props {
  defaultFuel: string;
  center: [number, number];
  zoom: number;
}

export function HomeClient({ defaultFuel, center, zoom }: Props) {
  const [selectedFuel, setSelectedFuel] = useState<FuelType>(defaultFuel as FuelType);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden">
      <Navbar selectedFuel={selectedFuel} onFuelChange={setSelectedFuel} />
      <div className="relative flex-1">
        <MapView selectedFuel={selectedFuel} center={center} zoom={zoom} />
      </div>
    </main>
  );
}
