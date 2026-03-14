-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateTable
CREATE TABLE "stations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_id" TEXT NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT,
    "station_type" VARCHAR(20) NOT NULL DEFAULT 'fuel',
    "geom" geometry(Point, 4326),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_prices" (
    "id" BIGSERIAL NOT NULL,
    "station_id" UUID NOT NULL,
    "fuel_type" VARCHAR(20) NOT NULL,
    "price" DECIMAL(6,3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "reported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50) NOT NULL,

    CONSTRAINT "fuel_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique station per country source
CREATE UNIQUE INDEX "stations_external_id_country_key" ON "stations"("external_id", "country");

-- CreateIndex: spatial GiST on geometry
CREATE INDEX "stations_geom_idx" ON "stations" USING GIST ("geom");

-- CreateIndex: fast price lookups
CREATE INDEX "fuel_prices_station_id_fuel_type_reported_at_idx" ON "fuel_prices"("station_id", "fuel_type", "reported_at" DESC);

-- AddForeignKey
ALTER TABLE "fuel_prices" ADD CONSTRAINT "fuel_prices_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
