# AGENTS.md - AI Agent Instructions for FuelMap

> **PLAN MODE**: Use Plan Mode frequently! Before implementing complex features, multi-step tasks, or making significant changes, switch to Plan Mode to think through the approach, consider edge cases, and outline the implementation strategy.

> **IMPORTANT**: Do NOT update this file unless the user explicitly says to. Only the user can authorize changes to AGENTS.md.

> **SECURITY WARNING**: This repository is PUBLIC at [github.com/GeiserX/fuel](https://github.com/GeiserX/fuel). **NEVER commit secrets, API keys, passwords, tokens, or any sensitive data.** All secrets must be stored in:
> - GitHub Secrets (for CI/CD)
> - Private GitOps repositories (for docker-compose)
> - Local `.env` files (gitignored)

---

## Project Overview

**FuelMap** is an open-source, self-hostable web application that combines real-time fuel price comparison with intelligent route planning. It answers the question no other app in the world currently answers: *"What's the cheapest fuel station along my route, and is the detour worth it?"*

- **Live URL**: https://fuel.geiser.cloud
- **Repository**: https://github.com/GeiserX/fuel
- **License**: MIT

### What Makes This Different

No product worldwide combines all four capabilities:
1. Full route planning (A to B with waypoints)
2. Real-time fuel price filtering along the route
3. Detour time/cost calculation
4. Smart refueling recommendations based on fuel range

The closest analog is **A Better Route Planner (ABRP)** for EVs — this is the ICE/fuel equivalent.

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
- Docker Hub for images (`drumsergio/fuel-app`)
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
| PostGIS 16 | Spatial database for stations + prices (`postgis/postgis:16-3.4`) |
| Valhalla | Self-hosted routing engine with isochrone support (`ghcr.io/gis-ops/docker-valhalla`) |
| Protomaps PMTiles | Self-hosted vector map tiles on NVMe |
| OpenFreeMap | Primary tile provider (free, no API key, no rate limits) |
| Photon | Geocoding / address autocomplete (self-hostable) |
| Caddy | Reverse proxy (existing on watchtower) |
| Docker | Multi-stage builds, images on Docker Hub |
| Portainer | Container management with GitOps |

### External Data Sources (All Free, No Auth Unless Noted)
| Country | Source | Update Freq | Stations | Auth |
|---|---|---|---|---|
| Spain | MITECO REST API | Daily | ~12,000 | None |
| France | Opendatasoft / prix-carburants.gouv.fr | 10 min | ~9,800 | None |
| Germany | Tankerkoenig | 4 min | ~14,000 | Free API key |
| Italy | MIMIT CSV | Daily | ~22,000 | None |
| UK | CMA per-retailer JSON feeds | Varies | ~8,000 | None |
| Austria | E-Control API | Real-time | All | None |
| Portugal | DGEG API | Daily | ~3,500 | None (non-commercial) |

---

## Architecture

### System Architecture

```
fuel.geiser.cloud (Caddy reverse proxy on watchtower)
    |
    +-- Next.js App (SSR + API routes)         [Port 3100, ~512MB RAM]
    |       |
    |       +-- PostGIS (stations + prices)    [Port 5433, ~2-4GB RAM]
    |       |
    |       +-- Valhalla (routing engine)      [Port 8002, ~2-4GB RAM]
    |       |
    |       +-- PMTiles (static on NVMe via Caddy)
    |
    +-- Scraper workers (cron, 2x daily per country)  [~256MB RAM]
    |
    +-- Photon (geocoding)                     [Port 2322, ~1GB RAM]
```

**Total: ~6-10GB RAM, ~80GB disk** — fits on watchtower alongside existing workloads.

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

---

## Core Features & Algorithms

### Feature 1: Map with Fuel Prices (Default View)

On load, the app shows a map centered on the user's detected country with all fuel stations as clustered markers. Each marker shows price for the selected fuel type (default: B7/diesel).

**Implementation:**
- MapLibre GL JS with GeoJSON source, `cluster: true` (GPU-accelerated, handles 50K+ points)
- Stations loaded via API with bounding box query: `GET /api/stations?bbox=sw_lng,sw_lat,ne_lng,ne_lat&fuel=B7`
- PostGIS query: `SELECT * FROM stations JOIN fuel_prices ON ... WHERE ST_Within(geom, ST_MakeEnvelope(...))`
- Color-coded markers: green (cheapest 20%), yellow (mid), red (most expensive)
- Numeric filter: user can set max price (e.g., "show only stations under 1.45 EUR/L")
- TanStack Query for background refresh every 5 minutes

### Feature 2: Route Planning (Top-Left Search)

Search bar with origin + destination (+ optional waypoints). Uses Photon for geocoding autocomplete.

**Implementation:**
- Photon typeahead: `GET https://photon.komoot.io/api?q={input}&lang={locale}&lat={user_lat}&lon={user_lon}&limit=5`
- Route calculation: `POST /api/route` → Valhalla `/route` endpoint
- Display route polyline on map with MapLibre `addLayer('line')`
- Show distance, duration, estimated fuel cost (based on user's vehicle profile if set)
- Support alternative routes via Valhalla `alternates` parameter

### Feature 3: Smart Station Selection Along Route

After route is calculated, user can drill down with these modes:

#### Mode A: "Select stations along route" (Manual)
- Show all stations within the route corridor
- User clicks a station → app calculates extra detour time via Valhalla matrix
- Display: station name, price, detour time, estimated savings vs nearest station

#### Mode B: "Cheapest within N minutes detour" (Auto)
- Configurable slider: max detour time (default: 5 min, range: 1-15 min)
- Algorithm:
  1. Get route polyline from Valhalla
  2. Create corridor polygon: `turf.buffer(routeLine, corridorKm, {units: 'kilometers'})`
     - corridorKm derived from max detour: ~5min = ~5km buffer for highway, ~3km for urban
  3. PostGIS spatial query: all stations within corridor for selected fuel type
  4. Valhalla matrix API: compute detour time for each candidate
     - For each station: `detour = time(prev_waypoint → station) + time(station → next_waypoint) - time(prev_waypoint → next_waypoint)`
  5. Filter: only stations where `detour <= maxDetourMinutes`
  6. Rank by price ascending
  7. Return top 5 with: price, detour time, savings vs route average, address

#### Mode C: "Best station in area" (Geographic)
- User draws a rectangle or selects a segment of the route (e.g., "refuel near Lyon")
- App queries stations in that geographic area
- Ranks by price, shows detour from route

#### Mode D: "Smart refuel based on range" (Automatic)
- User inputs: remaining fuel range (km) and tank capacity (liters)
- Algorithm determines the "sweet zone" along the route:
  ```
  total_route_distance = route.distance
  remaining_range = user_input_range

  # Safety zones (percentage of remaining range along route)
  too_early    = 0% - 25%    # Tank still full, no urgency
  sweet_spot   = 25% - 65%   # Best balance: enough options, no rush
  getting_late = 65% - 80%   # Fewer options, accept higher prices
  danger_zone  = 80% - 90%   # Emergency only — always show nearest
  never        = 90% - 100%  # Never recommend — stranding risk

  # Weight function for station scoring:
  score = (price_savings * fill_amount) - (detour_penalty * time_value)
           * zone_multiplier

  # zone_multiplier:
  #   too_early:    0.3  (heavily penalize — low value to user)
  #   sweet_spot:   1.0  (ideal)
  #   getting_late: 0.7  (acceptable but not preferred)
  #   danger_zone:  0.2  (only if nothing in sweet/late zones)
  ```
- Present top 3 recommendations with reasoning:
  - "Best value: Shell A-30 km 142 — 1.389 EUR/L, 3 min detour, saves 4.20 EUR on a full tank"
  - "Closest cheap: Repsol Albacete — 1.399 EUR/L, 0 min detour (on route)"
  - "Cheapest overall: Plenoil Bonete — 1.359 EUR/L, 7 min detour, saves 6.40 EUR"

### Performance Targets

| Operation | Target | Expected |
|---|---|---|
| Route calculation | < 2s | 100-500ms (Valhalla on NVMe) |
| Station corridor search | < 1s | 50-200ms (PostGIS GiST) |
| Detour matrix calculation | < 1s | 50-200ms (Valhalla matrix) |
| Full "smart refuel" pipeline | < 3s | 500ms-1.5s |
| Map tile loading | < 500ms | 50-200ms (local PMTiles) |

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
  schedule: string;          // cron expression, e.g., '0 8,20 * * *'
  fetchStations(): Promise<Station[]>;
  fetchPrices(): Promise<FuelPrice[]>;
}
```

### Country-Specific Notes

**Spain (MITECO)**
- Base: `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/`
- `EstacionesTerrestres/` returns all stations + current prices in one call
- Accept header: `application/json`
- Cloud IPs sometimes blocked — may need residential proxy or self-hosted scraper
- 30 fuel types available; map to EU harmonized codes
- Schedule: `0 8,20 * * *` (twice daily)

**France (Opendatasoft)**
- Base: `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records`
- JSON with proper lat/lon in `geom` field
- Updates every 10 minutes — can scrape more frequently
- Schedule: `*/30 * * * *` (every 30 min)

**Germany (Tankerkoenig)**
- Base: `https://creativecommons.tankerkoenig.de/json/`
- Requires free API key (register at onboarding.tankerkoenig.de)
- Store API key in `.env` as `TANKERKOENIG_API_KEY`
- Max once per 5 min for automation; radius search max 25km
- Use `list.php` for full refresh, `prices.php` for incremental
- Schedule: `*/5 * * * *` (every 5 min)

**Italy (MIMIT)**
- Station registry: `https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv` (pipe-delimited)
- Prices: `https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv` (pipe-delimited)
- Coordinates are voluntary — some stations lack them. Geocode missing ones via Photon.
- Schedule: `0 9 * * *` (daily, prices published at 8 AM)

**UK (CMA Feeds)**
- 14 separate JSON endpoints, one per retailer (Asda, BP, Shell, Tesco, etc.)
- No standard format — each needs a dedicated parser
- Prices in pence per liter — convert to GBP decimal (divide by 100)
- Schedule: `0 */4 * * *` (every 4 hours)

**Austria (E-Control)**
- Base: `https://api.e-control.at/sprit/1.0/`
- `search/gas-stations/by-address?latitude=&longitude=&fuelType=&includeClosed=`
- Near real-time (stations must report within 30 min)
- Fuel codes: `DIE`, `SUP`, `GAS`
- Schedule: `*/15 * * * *` (every 15 min)

**Portugal (DGEG)**
- Base: `https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/`
- Commercial use **prohibited** — show data but add disclaimer
- ArcGIS FeatureServer for coordinates
- Schedule: `0 10 * * *` (daily)

---

## Project Structure

```
fuel/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint, test, type-check
│       ├── build.yml           # Docker build + push to Docker Hub
│       └── scraper-build.yml   # Scraper image build
├── prisma/
│   └── schema.prisma           # PostGIS schema (stations, fuel_prices, price_history)
├── public/
│   └── locales/                # next-intl message files
│       ├── es.json
│       ├── en.json
│       ├── fr.json
│       ├── de.json
│       └── ...
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── page.tsx        # Map view (default)
│   │   │   ├── route/
│   │   │   │   └── page.tsx    # Route planner results
│   │   │   └── station/
│   │   │       └── [id]/
│   │   │           └── page.tsx # Station detail (SSG/ISR)
│   │   ├── api/
│   │   │   ├── stations/       # GET stations by bbox, radius, or corridor
│   │   │   ├── route/          # POST route calculation (proxies Valhalla)
│   │   │   ├── detour/         # POST detour calculation for candidate stations
│   │   │   └── refuel/         # POST smart refuel recommendation
│   │   └── layout.tsx
│   ├── components/
│   │   ├── map/
│   │   │   ├── FuelMap.tsx     # Main map component (react-map-gl)
│   │   │   ├── StationMarker.tsx
│   │   │   ├── RouteLayer.tsx
│   │   │   └── PricePopup.tsx
│   │   ├── search/
│   │   │   ├── RouteSearch.tsx # Origin/destination with Photon autocomplete
│   │   │   └── FuelFilter.tsx  # Fuel type + price filter controls
│   │   ├── route/
│   │   │   ├── RoutePanel.tsx  # Route details sidebar
│   │   │   ├── StationList.tsx # Stations along route
│   │   │   ├── DetourSlider.tsx
│   │   │   └── RefuelAdvisor.tsx # Smart refuel recommendations
│   │   └── ui/                 # shadcn/ui components
│   ├── lib/
│   │   ├── db.ts               # Prisma client with PostGIS
│   │   ├── valhalla.ts         # Valhalla API client
│   │   ├── photon.ts           # Photon geocoding client
│   │   ├── geo.ts              # Turf.js helpers (buffer, along, distance)
│   │   ├── fuel-types.ts       # EU harmonized fuel type mappings
│   │   ├── detour.ts           # Detour calculation algorithm
│   │   ├── refuel.ts           # Smart refuel zone algorithm
│   │   └── i18n.ts             # next-intl config
│   ├── scrapers/
│   │   ├── base.ts             # Base scraper interface
│   │   ├── spain.ts            # MITECO scraper
│   │   ├── france.ts           # Opendatasoft scraper
│   │   ├── germany.ts          # Tankerkoenig scraper
│   │   ├── italy.ts            # MIMIT CSV scraper
│   │   ├── uk.ts               # CMA multi-retailer scraper
│   │   ├── austria.ts          # E-Control scraper
│   │   ├── portugal.ts         # DGEG scraper
│   │   └── runner.ts           # Cron orchestrator
│   └── types/
│       ├── station.ts
│       ├── route.ts
│       └── fuel.ts
├── docker/
│   ├── Dockerfile              # Next.js app (multi-stage)
│   ├── Dockerfile.scraper      # Scraper worker
│   └── docker-compose.yml      # Full stack: app + db + valhalla + photon
├── AGENTS.md                   # This file
├── README.md
├── package.json
├── tsconfig.json
└── next.config.ts
```

---

## Deployment

### Environments

| Environment | URL | Server |
|---|---|---|
| Production | fuel.geiser.cloud | watchtower |
| Development | Local (`localhost:3000`) | Mac |

### Docker Compose Services

| Service | Image | RAM | Disk | Port |
|---|---|---|---|---|
| app | `drumsergio/fuel-app:x.y.z` | 512 MB | <1 GB | 3100 |
| db | `postgis/postgis:16-3.4` | 2-4 GB | 15-40 GB | 5433 |
| valhalla | `ghcr.io/gis-ops/docker-valhalla` | 2-4 GB | 25-35 GB | 8002 |
| photon | `komoot/photon` | ~1 GB | ~5 GB | 2322 |
| scraper | `drumsergio/fuel-scraper:x.y.z` | 256 MB | <1 GB | — |

### Valhalla Tile Building

Valhalla tiles for Europe must be built on a machine with 30-40GB RAM (more than watchtower can spare during normal operation). Process:

1. Rent Hetzner CCX33 (~0.50 EUR/hour)
2. Download Europe PBF from Geofabrik (~32 GB)
3. Build tiles (~4-6 hours)
4. Transfer to watchtower NVMe via rsync
5. Destroy Hetzner instance

**Total cost: ~3 EUR one-time.**

Runtime on watchtower: 2-4 GB RAM (memory-mapped tiles on NVMe).

### Caddy Config Addition

```
fuel.geiser.cloud {
    reverse_proxy localhost:3100
}
```

---

## Git Workflow

- **Branch**: `main` only (simple project, no develop branch needed initially)
- **Commits**: Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- **CI**: GitHub Actions — lint, type-check, test on every push
- **Deploy**: Push to Docker Hub via GHA, Portainer GitOps auto-deploys

### Commit Identity

```bash
git config user.name "GeiserX"
git config user.email "9169332+GeiserX@users.noreply.github.com"
```

---

## Phase Roadmap

### Phase 0: Foundation
- [ ] Repo setup, AGENTS.md, base Next.js + MapLibre + Tailwind
- [ ] PostGIS schema + Prisma setup
- [ ] Spain scraper (MITECO) — first country
- [ ] Map view with station markers + price display
- [ ] Basic fuel type filter + price filter

### Phase 1: Route Planning
- [ ] Valhalla integration (self-hosted)
- [ ] Route search UI (Photon autocomplete)
- [ ] Route display on map
- [ ] Stations along route (corridor query)

### Phase 2: Smart Features
- [ ] Detour calculation (Valhalla matrix)
- [ ] "Cheapest within N min detour" mode
- [ ] "Best station in area" mode
- [ ] "Smart refuel by range" mode

### Phase 3: Multi-Country
- [ ] France, Germany, Austria scrapers
- [ ] Italy, UK, Portugal scrapers
- [ ] i18n (next-intl, 10+ locales)
- [ ] Currency conversion for cross-border trips

### Phase 4: Polish
- [ ] PWA + offline support
- [ ] Station detail pages (ISR for SEO)
- [ ] Price history charts
- [ ] Vehicle profile (consumption, tank size)
- [ ] Dark mode
- [ ] Mobile bottom-sheet UX (Google Maps style)

---

## Common Tasks

### Adding a New Country Scraper
1. Create `src/scrapers/{country}.ts` implementing the `Scraper` interface
2. Add fuel type mappings to `src/lib/fuel-types.ts`
3. Add localized fuel names to `public/locales/{lang}.json`
4. Add cron schedule to scraper runner
5. Test with `npm run scraper:test -- --country={code}`
6. Add country to the `SUPPORTED_COUNTRIES` array in config

### Running Locally
```bash
# Start infrastructure
docker compose -f docker/docker-compose.yml up -d db valhalla photon

# Seed database with Spain data
npm run scraper:run -- --country=ES --once

# Start dev server
npm run dev
```

### Database Schema Changes
```bash
npx prisma db push          # Push schema to local DB
npx prisma generate          # Regenerate client
```

---

## Known Constraints

1. **Portugal data is non-commercial** — display with disclaimer, do not monetize Portuguese station data
2. **Spain API blocks cloud IPs** — scraper may need to run from residential IP or watchtower directly
3. **Italy coordinates are voluntary** — some stations lack lat/lon, geocode via Photon as fallback
4. **UK has 14 separate feeds** — each retailer has different JSON structure, needs individual parsers
5. **Germany Tankerkoenig has 5-min rate limit** — respect `max once per 5 min` for automated queries
6. **Valhalla tiles need rebuilding** when OSM data updates (monthly is sufficient)

---

## Checklist for AI Agents

Before completing a task, verify:
- [ ] Code follows TypeScript strict mode
- [ ] No secrets committed to repository
- [ ] Tests pass (if applicable)
- [ ] Linting passes (`npm run lint`)
- [ ] i18n: all user-facing strings use `useTranslations()`, never hardcoded
- [ ] Spatial queries use PostGIS indexes (GiST)
- [ ] API responses include proper error handling and Zod validation
- [ ] New fuel types use EU harmonized codes as internal keys

---

*Last updated: March 2026*
