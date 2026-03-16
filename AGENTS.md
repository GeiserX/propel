# AGENTS.md - AI Agent Instructions for Propel

> **PLAN MODE**: Use Plan Mode frequently! Before implementing complex features, multi-step tasks, or making significant changes, switch to Plan Mode to think through the approach, consider edge cases, and outline the implementation strategy.

> **IMPORTANT**: Do NOT update this file unless the user explicitly says to. Only the user can authorize changes to AGENTS.md.

> **SECURITY WARNING**: This repository is PUBLIC at [github.com/GeiserX/propel](https://github.com/GeiserX/propel). **NEVER commit secrets, API keys, passwords, tokens, or any sensitive data.** All secrets must be stored in:
> - GitHub Secrets (for CI/CD)
> - Private GitOps repositories (for docker-compose)
> - Local `.env` files (gitignored)

---

## Project Overview

**Propel** is an open-source, self-hostable web application that combines real-time energy price comparison with intelligent route planning — for both fuel and electric vehicles. It answers the question no other app in the world currently answers: *"What's the cheapest place to refuel or recharge along my route, and is the detour worth it?"*

- **Live URL**: https://propel.geiser.cloud
- **Repository**: https://github.com/GeiserX/propel
- **License**: GPL-3.0

### What Makes This Different

No product worldwide combines all four capabilities:
1. Full route planning (A to B with waypoints)
2. Real-time energy price filtering along the route (fuel + EV charging)
3. Detour time/cost calculation
4. Smart refueling/recharging recommendations based on remaining range

The closest analog is **A Better Route Planner (ABRP)** for EVs — Propel does this for ALL vehicle types, with real-time pricing.

---

## Owner Context

**Operator**: Sergio Fernandez Rubio
**Trade Name**: GeiserCloud
**GitHub**: GeiserX

### Communication Style
- Be direct and efficient — don't over-explain
- Do the work, don't ask permission for clear tasks
- Wait for explicit deploy instruction — do NOT commit or deploy until told
- Use exact values when provided

### Preferences
- Clean, readable code without over-engineering
- Self-hosted solutions over SaaS
- Privacy-focused (cookieless analytics, minimal data collection)
- Semver versioning for Docker images (never `:latest`)
- GitOps with Portainer for infrastructure
- Docker Hub for images (`drumsergio/propel`)
- Tailwind CSS for styling
- TypeScript strict mode
- Do NOT add Co-Authored-By lines to commits
- Do NOT add "Generated with Claude Code" attribution anywhere

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| Next.js 15+ | App Router, Server Components, ISR for station pages |
| React 19 | UI library |
| TypeScript | Type safety (strict mode) |
| Tailwind CSS | Styling |
| shadcn/ui | UI components |
| MapLibre GL JS | GPU-accelerated vector tile map rendering |
| react-map-gl | React wrapper for MapLibre (`react-map-gl/maplibre`) |
| next-intl v4 | Internationalization (10+ languages) |
| Zustand | Client state management |
| TanStack Query | Server state, price data caching + background refresh |
| Turf.js | Geospatial calculations (buffer, along, distance) |
| @serwist/next | PWA / service worker / offline support |

### Backend
| Technology | Purpose |
|---|---|
| Next.js API Routes | REST API endpoints |
| Prisma ORM | Database access with PostGIS extensions |
| Zod | Request/response validation |

### Infrastructure
| Component | Details |
|---|---|
| PostGIS 17 | Spatial database for stations + prices (`postgis/postgis:17-3.4`) |
| Valhalla 3.5.1 | Self-hosted routing engine (`ghcr.io/gis-ops/docker-valhalla/valhalla:3.5.1`). Multi-country tiles (ES+FR+PT+IT+AT) built from 5 Geofabrik PBFs (~9.3GB total). Enhance stage needs ~12GB RAM peak. |
| Protomaps PMTiles | Self-hosted vector map tiles on NVMe |
| OpenFreeMap | Primary tile provider (free, no API key, no rate limits) |
| Photon 1.0.1 | Geocoding / address autocomplete. Runs on `eclipse-temurin:21-jre` with official JAR. Uses OpenSearch backend (NOT old Elasticsearch). Data imported from **per-country JSONL dumps** (~2.9GB total for 5 countries, ~37M docs). |
| Caddy | Reverse proxy (existing on watchtower) |
| Docker | Multi-stage builds, images on Docker Hub |
| Portainer | Container management with GitOps |

### External Data Sources (All Free, No Auth Unless Noted)
| Country | Source | Update Freq | Stations | Auth | Scraper Status |
|---|---|---|---|---|---|
| Spain | MITECO REST API | Daily | ~12,200 | None | ✅ Implemented |
| France | data.economie.gouv.fr bulk export | 10 min | ~9,900 | None | ✅ Implemented |
| Portugal | DGEG paginated API | Daily | ~3,200 | None (non-commercial) | ✅ Implemented |
| Italy | MIMIT CSV (pipe-delimited) | Daily | ~23,600 | None | ✅ Implemented |
| Austria | E-Control API (per-district) | Real-time | ~930 | None | ✅ Implemented |
| Germany | Tankerkoenig v4 API | Real-time | ~14,700 | Free API key | ✅ Code ready, needs key |
| UK | CMA Open Data (14 retailer JSON endpoints) | Near real-time | ~8,000 | None | Not started |
| Slovenia | goriva.si REST API | Real-time | TBD | None | Not started |

---

## Architecture

### System Architecture

```
propel.geiser.cloud (Caddy reverse proxy on watchtower)
    |
    +-- Next.js App (SSR + API routes)         [Port 3200, ~512MB RAM]
    |       |
    |       +-- PostGIS (stations + prices)    [Port 5433, ~2-4GB RAM]
    |       |
    |       +-- Valhalla (routing engine)      [Port 8002, ~2-4GB RAM]
    |       |
    |       +-- PMTiles (static on NVMe via Caddy)
    |
    +-- Scraper workers (built into app, per-country intervals)  [~256MB RAM]
    |
    +-- Photon (geocoding)                     [Port 2322, ~1GB RAM]
```

**Steady-state: ~6-8GB RAM, ~40GB disk (5 countries: ES+FR+PT+IT+AT).**
**First-time build: needs ~16GB RAM peak** (Valhalla enhance), then drops to steady-state. Run Valhalla and Photon builds sequentially to avoid memory pressure.
**Disk breakdown**: PBFs ~9.3GB, Valhalla tiles ~6-8GB, Photon data ~8-10GB (37M docs indexed), PostGIS ~2GB (~50K stations), app ~50MB.

### Database Schema (PostGIS)

```
stations
  - id (UUID, PK)
  - external_id (VARCHAR, unique per country source)
  - country (VARCHAR, ISO 3166-1 alpha-2)
  - name (VARCHAR)
  - brand (VARCHAR, nullable)
  - address (TEXT)
  - city (VARCHAR)
  - province (VARCHAR, nullable)
  - geom (GEOMETRY(Point, 4326), GiST indexed)
  - station_type (VARCHAR: 'fuel' | 'ev_charger' | 'both')
  - opening_hours (JSONB, nullable)
  - amenities (JSONB, nullable)
  - created_at (TIMESTAMPTZ)
  - updated_at (TIMESTAMPTZ)

fuel_prices
  - id (BIGINT, PK, auto)
  - station_id (UUID, FK -> stations.id)
  - fuel_type (VARCHAR, EU harmonized: E5, E10, B7, B10, LPG, CNG, H2, etc.)
  - price (DECIMAL(6,3), per liter in local currency)
  - currency (VARCHAR(3), ISO 4217: EUR, GBP, PLN, etc.)
  - reported_at (TIMESTAMPTZ)
  - source (VARCHAR: miteco, tankerkoenig, opendatasoft, etc.)
  - INDEX (station_id, fuel_type, reported_at DESC)

ev_chargers (future — Phase 5+)
  - id (UUID, PK)
  - station_id (UUID, FK -> stations.id)
  - connector_type (VARCHAR: CCS2, CHAdeMO, Type2, etc.)
  - power_kw (DECIMAL)
  - price_per_kwh (DECIMAL, nullable)
  - network (VARCHAR: Tesla, Ionity, ChargePoint, etc.)
  - available (BOOLEAN, nullable)

price_history
  - Same as fuel_prices but partitioned by month for analytics
  - Populated by trigger on fuel_prices INSERT
```

### EU Harmonized Fuel Type Codes (EN 16942)

Internal canonical IDs — display localized names per country/language:

| Code | Description | Spain | France | Germany | Italy | UK |
|---|---|---|---|---|---|---|
| E5 | Gasoline <=5% ethanol | Gasolina 95 E5 | SP95 | Super E5 | Benzina | Unleaded (E5) |
| E10 | Gasoline <=10% ethanol | Gasolina 95 E10 | SP95-E10 | Super E10 | Benzina E10 | Unleaded (E10) |
| E5_98 | Gasoline 98 oct | Gasolina 98 E5 | SP98 | Super Plus | Benzina 98 | Super Unleaded |
| B7 | Diesel <=7% biodiesel | Gasoleo A | Gazole | Diesel | Gasolio | Diesel |
| B7_PREMIUM | Premium diesel | Gasoleo Premium | Gazole Premium | Diesel Premium | Gasolio Premium | Premium Diesel |
| LPG | Autogas | GLP | GPLc | Autogas | GPL | LPG |
| CNG | Compressed natural gas | GNC | GNV | CNG/Erdgas | Metano | CNG |
| H2 | Hydrogen | Hidrogeno | Hydrogene | Wasserstoff | Idrogeno | Hydrogen |

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostGIS connection string | Required |
| `PROPEL_DEFAULT_COUNTRY` | ISO code for initial map view | `ES` |
| `PROPEL_ENABLED_COUNTRIES` | Comma-separated ISO codes to enable (e.g. `ES,FR,DE`) | All countries with scrapers |
| `PROPEL_DEFAULT_FUEL` | Override default fuel type | Per-country default |
| `PROPEL_CLUSTER_STATIONS` | Enable station clustering at low zoom (`true`/`false`) | `true` |
| `PROPEL_CORRIDOR_KM` | Station search corridor width in km around route | `5` (range: 0.5-50) |
| `PROPEL_SCRAPE_INTERVAL_HOURS` | Global scrape interval override (0 = disabled) | Per-country defaults |
| `PROPEL_SCRAPE_INTERVAL_XX` | Per-country interval, e.g. `PROPEL_SCRAPE_INTERVAL_FR=0.5` | See defaults below |
| `TANKERKOENIG_API_KEY` | Germany Tankerkoenig API key (free registration) | — |
| `VALHALLA_URL` | Valhalla routing engine URL | — |
| `PHOTON_URL` | Photon geocoding service URL | — |

**Per-country default scrape intervals**: ES=12h, FR=1h, PT=12h, IT=12h, AT=2h, DE=1h. Real-time sources (FR/DE/AT) scrape more frequently; daily sources (ES/PT/IT) scrape every 12h. Each country runs on its own timer with staggered startup (5s apart).

These env vars allow self-hosters to scope the app to their country/region. For example, a French self-hoster can set `PROPEL_DEFAULT_COUNTRY=FR` and `PROPEL_ENABLED_COUNTRIES=FR` to show only France.

### Design Decisions

- **No timezone-based country detection** — use env vars for country config, not client TZ
- **Navbar is dark** (`#0c111b`) — minimal height (44px), Propel logo on left, fuel selector on right
- **Logo**: Emerald-to-cyan gradient rounded square with lightning bolt cutout. "Propel" wordmark in bold white
- **Stats dropdown** next to logo (separated by divider) — shows station/price totals, per-country breakdown with flags, last update timestamp. Footer: "Made with ♥ by Sergio Fernández" + GitHub Sponsors button (same pattern as Telegram-Archive)
- **Fuel selector** has optgroup categories (Diésel, Gasolina, Gas, Hidrógeno, Otros) with category icon
- **Station popup layout** (top to bottom): brand name (bold, primary heading) → address + city (small gray) → price card (large 22px price + EUR/L, fuel type label + "· Actualizado hace Xh" below). "Sin precio para [fuel]" if no data. Brand comes from MITECO "Rótulo" field; `name` = brand + city (internal, not shown in popup)
- **Map clustering**: Controlled by `PROPEL_CLUSTER_STATIONS` env var. When enabled, clusters only at zoom ≤7, radius 40px. Production instance has it disabled. 12K stations renders fine in MapLibre without clustering.
- **Map default center/zoom** comes from server config (env vars), not hardcoded
- **Auto-geolocation on load**: Uses Permissions API to check state first — if `granted`, flies directly (no wasted default fetch); if `denied`, loads default country view; if `prompt`, loads default view then asks (re-fetches if accepted). This avoids double fetches for returning users.
- **Station fetch**: No min-zoom gate — stations load at all zoom levels (API returns 12K stations in ~100ms). 100ms debounce on pan/zoom.
- **Search panel**: Always expanded by default. Users can collapse and re-expand.
- **Fuel dropdown**: Uses explicit dark backgrounds on `<option>` elements to prevent unreadable text on light OS themes.
- **Route z-order**: Route line renders below station points (`beforeId="unclustered-point"`) so stations are always clickable.
- **Docker Publish workflow**: Must include a `type=raw,value=latest,enable={{is_default_branch}}` tag rule — without it, main-branch pushes produce zero tags and the build fails.

---

## Phase 1: Route Planning (Implemented)

### Components
- **`src/lib/photon.ts`** — Photon geocoding client. Calls `/api` with query, language, optional geo-bias.
- **`src/lib/valhalla.ts`** — Valhalla routing client. Calls `POST /route` with locations + costing. Includes precision-6 polyline decoder.
- **`src/app/api/geocode/route.ts`** — `GET /api/geocode?q=Madrid&lat=40.4&lon=-3.7` — Zod validated, proxies to Photon.
- **`src/app/api/route/route.ts`** — `POST /api/route` with `{ origin, destination, waypoints? }` — calls Valhalla.
- **`src/app/api/route-stations/route.ts`** — `POST /api/route-stations` with `{ geometry, fuel, corridorKm? }` — finds stations within N km of route using `ST_DWithin` on PostGIS geography.
- **`src/components/search/search-panel.tsx`** — Left-side collapsible panel (Google Maps style). Origin + destination inputs, swap, "Calcular ruta" button. Auto-geocodes typed text on submit if no autocomplete selection was made.
- **`src/components/search/autocomplete-input.tsx`** — Reusable autocomplete with 300ms debounce, keyboard nav, geo-biased results. Exposes `geocode()` method via `forwardRef`.
- **`src/components/map/route-layer.tsx`** — MapLibre route visualization: white outline (7px) + blue fill (4px, `#3b82f6`).
- **`src/components/map/map-view.tsx`** — Uses `forwardRef` to expose MapRef. Switches between bbox station fetch and corridor station fetch based on active route.

### Infrastructure
- **Valhalla**: 5-country PBFs (ES+FR+PT+IT+AT) from Geofabrik, tile build on first start. Image: `ghcr.io/gis-ops/docker-valhalla/valhalla:3.5.1`. Needs 16GB RAM limit (enhance peaks at ~12GB). Downloads ~9.3GB of PBFs, build takes ~60-90 min. Do NOT run simultaneously with Photon import — causes OOM. To add a country: add its PBF URL to `tile_urls`, delete tiles, restart.
- **Photon**: No official Docker image. Uses `eclipse-temurin:21-jre` with custom entrypoint that downloads Photon 1.0.1 JAR + per-country JSONL dumps from `download1.graphhopper.com/public/europe/{country}/photon-dump-{country}-1.0-latest.jsonl.zst`. Downloads 5 dumps (~2.9GB total: ES 469MB, FR 1.4GB, PT 107MB, IT 548MB, AT 308MB), concatenates (first file keeps header, rest skip line 1), imports as one file. ~37M docs, ~89 min import. Must bind to `0.0.0.0` (`-listen-ip 0.0.0.0`). To add a country: add its dump URL to the DUMPS list, delete `.import_done` + `photon_data/`, restart.
- **CRITICAL Photon notes**: (1) **Do NOT use planet dump with `-country-codes` flag** — Photon 1.0.1 crashes with NPE on entries lacking `country_code`. (2) **Do NOT use `grep`/`awk` to filter planet dump** — the JSONL header line must be preserved and gets stripped by naive filtering. (3) **Country-specific dumps are the reliable approach** — they avoid both issues. (4) France is listed as `france-monacco` (sic) on the download server. (5) Docker Compose `$$` escaping required for shell variables in the command block. (6) Old `lehrenfried/photon` image is incompatible (Elasticsearch 5.5.0 vs OpenSearch).

## Core Features & Algorithms

See **ROADMAP.md** for the full feature breakdown and phase plan.

---

## Internationalization (i18n)

### Library: next-intl v4

- Localized URL routing: `/es/gasolineras`, `/de/tankstellen`, `/fr/stations-service`
- Prefix-based with `as-needed` mode (no prefix for default locale)
- Default locale: `es` (Spanish)
- Supported locales: `es`, `en`, `fr`, `de`, `it`, `pt`, `nl`, `pl`, `at` (Austrian German variant)

### Auto-Detection
- IP-based country detection: MaxMind GeoLite2 (self-hosted, GDPR-safe)
- Auto-set: language, currency, units, default fuel type
- Manual override always available

### Units
- Distance: km (Europe default), miles (UK)
- Volume: liters (Europe), gallons (UK for display, stored as liters)
- Currency: EUR, GBP, PLN — always show in local currency
- Decimal separator: `,` (continental Europe), `.` (UK)

---

## Data Scrapers

Each country has a dedicated scraper module in `src/scrapers/`. Scrapers run as cron jobs (Docker containers).

### Scraper Contract

```typescript
interface Scraper {
  country: string;           // ISO 3166-1 alpha-2
  source: string;            // e.g., 'miteco', 'tankerkoenig'
  schedule: string;          // cron expression
  fetchStations(): Promise<Station[]>;
  fetchPrices(): Promise<FuelPrice[]>;
}
```

### Country-Specific Notes

**Spain (MITECO)** — Base: `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/`. `EstacionesTerrestres/` returns all stations + prices in a single request. No auth. Cloud IPs sometimes blocked. Default scrape interval: 12h.

**France (Opendatasoft)** — Uses bulk `/exports/json` endpoint (single request, ~9,800 records). Much faster than paginated `/records` (3s vs 30s). Updates every 10 min. Default scrape interval: 1h.

**Germany (Tankerkoenig v4)** — Base: `https://creativecommons.tankerkoenig.de/api/v4/stations/search`. Free API key required (register at `onboarding.tankerkoenig.de`). 25km radius search limit — covers Germany with ~270 overlapping grid queries (0.40° lat × 0.55° lon steps). Rate limit returns HTTP 503. Default scrape interval: 1h.

**Italy (MIMIT)** — CSV downloads (pipe-delimited). Coordinates voluntary (~23,600 stations). Default scrape interval: 12h.

**UK (CMA Feeds)** — 14 separate JSON endpoints per retailer. Prices in pence. Not yet implemented.

**Austria (E-Control)** — Base: `https://api.e-control.at/sprit/1.0/`. Real-time. API returns max 10 results per query — queries 117 political districts (Bezirke, `type=PB`) instead of 9 states to get full coverage (~930 stations). Default scrape interval: 2h.

**Portugal (DGEG)** — Base: `https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/`. Paginated per fuel type (~3,200 stations). Commercial use prohibited. Default scrape interval: 12h.

---

## Project Structure

```
propel/
├── .github/workflows/
├── prisma/schema.prisma
├── public/locales/{es,en,fr,de,it,pt}.json
├── src/
│   ├── app/
│   │   ├── [locale]/page.tsx           # Map view (default)
│   │   ├── [locale]/route/page.tsx     # Route results
│   │   ├── [locale]/station/[id]/      # Station detail (ISR)
│   │   └── api/{stations,route,detour,refuel}/
│   ├── components/{map,search,route,ui}/
│   ├── lib/{db,valhalla,photon,geo,fuel-types,detour,refuel,i18n}.ts
│   ├── scrapers/{base,spain,france,germany,italy,uk,austria,portugal}.ts
│   └── types/{station,route,fuel}.ts
├── docker/{Dockerfile,Dockerfile.scraper,docker-compose.yml}
├── AGENTS.md
├── ROADMAP.md
├── README.md
└── package.json
```

---

## Deployment

| Environment | URL | Server |
|---|---|---|
| Production | propel.geiser.cloud | watchtower |
| Development | localhost:3000 | Mac |

### Docker Compose Services

| Service | Image | RAM | Port | Notes |
|---|---|---|---|---|
| app | `drumsergio/propel:x.y.z` | 512 MB | 3200 | Next.js app |
| db | `postgis/postgis:17-3.4` | 2 GB | 5432 | PostGIS spatial DB |
| valhalla | `ghcr.io/gis-ops/docker-valhalla/valhalla:3.5.1` | 16 GB (build), 512 MB (serve) | 8002 | First start builds tiles from PBF (~20min). Enhance stage peaks at ~12GB. After build, steady-state ~512MB. |
| photon | `eclipse-temurin:21-jre` | 4 GB (import), 1-2 GB (serve) | 2322 | First start downloads Photon 1.0.1 JAR + 5 country dumps (~2.9GB). Concatenates and imports ~37M docs in ~89 min. Steady-state ~1-2GB. |
| scraper | Built into the app via `instrumentation.ts` | — | — | Runs on startup + `PROPEL_SCRAPE_INTERVAL_HOURS` interval. No separate container needed. |

### CI/CD

- **Never build Docker images locally for deployment** — always let GitHub Actions runners build and push (they're amd64, matching production)
- Local `docker buildx --platform linux/amd64` is only for emergency hotfixes
- GitHub Actions handles: lint, typecheck, Docker build+push, releases, CodeQL
- Docker Hub secrets (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`) are configured in GitHub repo settings
- **Deployment flow**: commit → push → **wait for GitHub Actions Docker Publish workflow to finish** → then `docker pull` and redeploy on watchtower. Never pull before the workflow completes
- **Never restart Caddy** — always use `caddy reload` (Unraid FUSE causes stale file handles on restart)

### Git Workflow

- **Branch**: `main` only
- **Commits**: Conventional commits (`feat:`, `fix:`, `chore:`)
- **Identity**: `GeiserX` / `9169332+GeiserX@users.noreply.github.com`

---

## Known Constraints

1. **Portugal data is non-commercial** — display with disclaimer
2. **Spain API blocks cloud IPs** — scraper may need residential IP
3. **Italy coordinates are voluntary** — geocode missing via Photon
4. **UK has 14 separate feeds** — each needs individual parser
5. **Germany Tankerkoenig v4**: 25km radius search limit, needs ~270 grid queries to cover country. HTTP 503 rate limiting.
6. **Valhalla tiles need monthly rebuilds** from OSM data

---

## Checklist for AI Agents

Before completing a task, verify:
- [ ] TypeScript strict mode
- [ ] No secrets committed
- [ ] Tests pass
- [ ] Linting passes (`npm run lint`)
- [ ] i18n: user-facing strings use `useTranslations()`, never hardcoded
- [ ] Spatial queries use PostGIS GiST indexes
- [ ] API responses include Zod validation
- [ ] Fuel types use EU harmonized codes

---

*Generated by [LynxPrompt](https://lynxprompt.com)*

*Last updated: March 2026*
