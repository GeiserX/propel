import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import type { FuelType } from "../types/station";

/**
 * Transaction client type — Prisma's interactive transaction callback receives
 * a PrismaClient minus the transaction/connection methods.
 */
type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// ---------------------------------------------------------------------------
// Scraper result
// ---------------------------------------------------------------------------

export interface ScraperResult {
  country: string;
  source: string;
  stationsUpserted: number;
  pricesUpserted: number;
  durationMs: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Normalised intermediate types (what scrapers produce before DB writes)
// ---------------------------------------------------------------------------

export interface RawStation {
  externalId: string;
  name: string;
  brand: string | null;
  address: string;
  city: string;
  province: string | null;
  latitude: number;
  longitude: number;
  stationType: "fuel" | "ev_charger" | "both";
}

export interface RawFuelPrice {
  /** Must match a RawStation.externalId in the same batch */
  stationExternalId: string;
  fuelType: FuelType;
  price: number; // per litre in local currency
  currency: string; // ISO 4217
}

// ---------------------------------------------------------------------------
// Abstract scraper contract
// ---------------------------------------------------------------------------

export abstract class BaseScraper {
  abstract readonly country: string; // ISO 3166-1 alpha-2
  abstract readonly source: string; // e.g. "miteco"

  /**
   * Fetch stations + prices from the upstream data source.
   * Each implementation must normalise the raw API response into
   * `RawStation[]` and `RawFuelPrice[]`.
   */
  abstract fetch(): Promise<{
    stations: RawStation[];
    prices: RawFuelPrice[];
  }>;

  // ---------------------------------------------------------------------------
  // Common persistence logic
  // ---------------------------------------------------------------------------

  /**
   * Run the full scrape-and-persist pipeline.
   *
   * 1. Fetch upstream data via the country-specific `fetch()`.
   * 2. Batch-upsert stations (Prisma + raw SQL for PostGIS geom).
   * 3. Batch-upsert prices (delete-old-then-insert in a transaction).
   */
  async run(): Promise<ScraperResult> {
    const start = Date.now();
    const errors: string[] = [];
    let stationsUpserted = 0;
    let pricesUpserted = 0;

    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    const prisma = new PrismaClient({ adapter });

    try {
      console.log(
        `[${this.source}] Fetching data for ${this.country} ...`,
      );

      const { stations, prices } = await this.fetch();

      console.log(
        `[${this.source}] Fetched ${stations.length} stations, ${prices.length} price rows`,
      );

      // ------------------------------------------------------------------
      // 1. Upsert stations in batches
      // ------------------------------------------------------------------
      const STATION_BATCH = 500;
      for (let i = 0; i < stations.length; i += STATION_BATCH) {
        const batch = stations.slice(i, i + STATION_BATCH);
        try {
          stationsUpserted += await this.upsertStationBatch(prisma, batch);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Station batch ${i}-${i + batch.length}: ${msg}`);
        }
      }

      console.log(`[${this.source}] Upserted ${stationsUpserted} stations`);

      // ------------------------------------------------------------------
      // 2. Upsert prices — one atomic replace per scrape run.
      //    We delete all prices for this source/country then insert fresh
      //    ones inside a transaction so queries never see partial data.
      // ------------------------------------------------------------------
      const PRICE_BATCH = 2000;

      // Build a lookup: externalId -> stationId (UUID)
      const stationRows: Array<{ id: string; external_id: string }> =
        await prisma.$queryRawUnsafe(
          `SELECT id, external_id FROM stations WHERE country = $1`,
          this.country,
        );
      const extToId = new Map(stationRows.map((r) => [r.external_id, r.id]));

      // Resolve prices
      const resolvedPrices = prices.flatMap((p) => {
        const stationId = extToId.get(p.stationExternalId);
        if (!stationId) return [];
        return [
          {
            stationId,
            fuelType: p.fuelType,
            price: p.price,
            currency: p.currency,
            source: this.source,
          },
        ];
      });

      await prisma.$transaction(
        async (tx: TransactionClient) => {
          // Delete existing prices from this source + country
          // (scoped by country so scrapers sharing a source name
          //  like "anwb" for NL/BE/LU don't wipe each other's data)
          await tx.$executeRawUnsafe(
            `DELETE FROM fuel_prices WHERE source = $1
             AND station_id IN (SELECT id FROM stations WHERE country = $2)`,
            this.source,
            this.country,
          );

          // Insert in batches
          for (let i = 0; i < resolvedPrices.length; i += PRICE_BATCH) {
            const batch = resolvedPrices.slice(i, i + PRICE_BATCH);
            const inserted = await this.insertPriceBatch(tx, batch);
            pricesUpserted += inserted;
          }
        },
        { timeout: 120_000 },
      );

      console.log(`[${this.source}] Inserted ${pricesUpserted} prices`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Fatal: ${msg}`);
      console.error(`[${this.source}] Fatal error:`, msg);
    } finally {
      await prisma.$disconnect();
    }

    return {
      country: this.country,
      source: this.source,
      stationsUpserted,
      pricesUpserted,
      durationMs: Date.now() - start,
      errors,
    };
  }

  // ---------------------------------------------------------------------------
  // Batch helpers (use raw SQL for PostGIS geometry + performance)
  // ---------------------------------------------------------------------------

  /**
   * Upsert a batch of stations using a single multi-row INSERT ... ON CONFLICT.
   * Also updates the `geom` column via ST_SetSRID(ST_MakePoint(lon, lat), 4326).
   */
  private async upsertStationBatch(
    prisma: PrismaClient,
    batch: RawStation[],
  ): Promise<number> {
    if (batch.length === 0) return 0;

    // Build parameterised VALUES list.
    // Each station needs 10 params: externalId, country, name, brand,
    // address, city, province, stationType, longitude, latitude
    const params: unknown[] = [];
    const valueClauses: string[] = [];

    for (let i = 0; i < batch.length; i++) {
      const s = batch[i];
      const offset = i * 10;
      valueClauses.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, ` +
          `$${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, ` +
          `ST_SetSRID(ST_MakePoint($${offset + 9}, $${offset + 10}), 4326), ` +
          `NOW(), NOW())`,
      );
      params.push(
        s.externalId,
        this.country,
        s.name,
        s.brand,
        s.address,
        s.city,
        s.province,
        s.stationType,
        s.longitude,
        s.latitude,
      );
    }

    const sql = `
      INSERT INTO stations (external_id, country, name, brand, address, city, province, station_type, geom, created_at, updated_at)
      VALUES ${valueClauses.join(",\n")}
      ON CONFLICT (external_id, country)
      DO UPDATE SET
        name         = EXCLUDED.name,
        brand        = EXCLUDED.brand,
        address      = EXCLUDED.address,
        city         = EXCLUDED.city,
        province     = EXCLUDED.province,
        station_type = EXCLUDED.station_type,
        geom         = EXCLUDED.geom,
        updated_at   = NOW()
    `;

    await prisma.$executeRawUnsafe(sql, ...params);
    return batch.length;
  }

  /**
   * Insert a batch of price rows using a single multi-row INSERT.
   */
  private async insertPriceBatch(
    tx: TransactionClient,
    batch: Array<{
      stationId: string;
      fuelType: string;
      price: number;
      currency: string;
      source: string;
    }>,
  ): Promise<number> {
    if (batch.length === 0) return 0;

    // Each price needs 5 params: stationId, fuelType, price, currency, source
    const params: unknown[] = [];
    const valueClauses: string[] = [];

    for (let i = 0; i < batch.length; i++) {
      const p = batch[i];
      const offset = i * 5;
      valueClauses.push(
        `($${offset + 1}::uuid, $${offset + 2}, $${offset + 3}, $${offset + 4}, NOW(), $${offset + 5})`,
      );
      params.push(p.stationId, p.fuelType, p.price, p.currency, p.source);
    }

    const sql = `
      INSERT INTO fuel_prices (station_id, fuel_type, price, currency, reported_at, source)
      VALUES ${valueClauses.join(",\n")}
    `;

    await tx.$executeRawUnsafe(sql, ...params);
    return batch.length;
  }
}
