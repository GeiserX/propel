# Propel — Roadmap

## Vision

The world's first open-source energy route planner that works for ALL vehicle types — fuel, electric, hybrid, hydrogen. Find the cheapest place to refuel or recharge along any route, with intelligent detour and range-aware recommendations.

---

## Phase 0: Foundation

**Goal**: Map with real fuel prices for Spain. Prove the core works.

### 0.1 — Project Scaffolding
- [x] Repository setup (GitHub, AGENTS.md, README)
- [x] Next.js 15 + App Router + TypeScript strict
- [x] Tailwind CSS + shadcn/ui setup
- [x] MapLibre GL JS + react-map-gl integration
- [x] OpenFreeMap as tile provider (Liberty style)
- [x] Basic responsive layout (map fills viewport)
- [x] Docker Compose for production (PostGIS + app via Portainer GitOps)

### 0.2 — Database + Spain Scraper
- [x] PostGIS schema via Prisma (stations, fuel_prices tables)
- [x] GiST spatial index on station geometry
- [x] Spain MITECO scraper (`src/scrapers/spain.ts`)
  - Fetch all ~12,000 stations + prices from `EstacionesTerrestres/`
  - Map 15 Spanish fuel types to EU harmonized codes (E5, E10, E5_98, B7, B7_PREMIUM, B_AGRICULTURAL, HVO, LPG, CNG, LNG, H2, ADBLUE, etc.)
  - Store with proper lat/lon geometry
- [x] Scraper CLI: `npx tsx src/scrapers/cli.ts --country=ES --once`
- [ ] Seed script for development

### 0.3 — Map View (Default Page)
- [x] Map centered on configurable country on first load (env vars: `PROPEL_DEFAULT_COUNTRY`)
- [x] Station markers from PostGIS via bbox API: `GET /api/stations?bbox=...&fuel=B7`
- [x] MapLibre GeoJSON source with `cluster: true` (GPU clustering, clusterMaxZoom=9, clusterRadius=45)
- [x] Color-coded markers: P5/P95 percentile-based 7-color rainbow gradient (green→red→purple) with dynamic price legend
- [x] Click marker → popup with: brand (bold heading), address + city, large price, fuel type + relative time ("Actualizado hace Xh")
- [x] Fuel type selector dropdown (15 types, grouped: Diésel, Gasolina, Gas, Hidrógeno, Otros)
- [x] Price filter: max price slider (bottom-right, real-time filtering, shows station count)

### 0.3b — Navbar & Stats (bonus, not in original plan)
- [x] Dark navbar (#0c111b, 44px) with Propel logo (emerald-to-cyan gradient bolt + wordmark)
- [x] Stats dropdown: station/price totals, per-country breakdown with flags, last update timestamps
- [x] "Made with ♥ by Sergio Fernández" footer + GitHub Sponsors button
- [x] GitHub Actions CI/CD: lint, typecheck, Docker build+push to Docker Hub (`drumsergio/propel`)

### 0.4 — Geolocation + Nearby
- [x] Browser geolocation API (with consent prompt)
- [x] "Center on me" button (top-right, flies to location at zoom 12)
- [x] Auto-zoom to user area if geolocation granted
- [x] Fallback: env-var-based country center (configurable via `PROPEL_DEFAULT_COUNTRY`)

**Deliverable**: A working map at `propel.geiser.cloud` showing all ~12,000 Spanish fuel stations with real prices for 15 fuel types, P5/P95 color scale, clustered map, dark navbar with stats.

---

## Phase 1: Route Planning

**Goal**: Plan a route A→B and see fuel stations along it.

### 1.1 — Valhalla Integration
- [ ] Docker Compose: add Valhalla service with Spain-only tiles (~1.3GB PBF, ~1-2GB RAM)
- [ ] Valhalla API client (`src/lib/valhalla.ts`)
- [ ] Route endpoint: `POST /api/route` (origin, destination, optional waypoints)
- [ ] Returns: polyline (GeoJSON), distance, duration, legs

### 1.2 — Search / Geocoding
- [ ] Photon geocoding client (`src/lib/photon.ts`)
- [ ] Route search component: origin + destination inputs with typeahead autocomplete
- [ ] Debounced Photon requests (300ms)
- [ ] Geo-biased results (user location passed as lat/lon)
- [ ] "Add waypoint" button (up to 5 intermediate stops)
- [ ] Swap origin/destination button

### 1.3 — Route Display
- [ ] Draw route polyline on map (MapLibre `addLayer` type `line`)
- [ ] Blue route line with outline for visibility
- [ ] Auto-fit map bounds to show full route
- [ ] Route info panel: total distance, total duration, number of legs
- [ ] Alternative routes via Valhalla `alternates` parameter (show as grey lines)

### 1.4 — Stations Along Route
- [ ] Corridor query using Turf.js `buffer()`:
  - Buffer the route polyline by 5km (configurable)
  - Convert to PostGIS polygon
  - `SELECT * FROM stations WHERE ST_Within(geom, corridor_polygon)`
- [ ] Show corridor stations on map with fuel prices
- [ ] Station list panel: sorted by position along route (not distance from user)
- [ ] Highlight stations that are directly on the route vs requiring detour

**Deliverable**: Plan a route Madrid→Barcelona, see all fuel stations within 5km of the route with prices.

---

## Phase 2: Smart Features

**Goal**: The killer features no competitor has.

### 2.1 — Detour Calculation
- [ ] For each station along route, calculate exact detour time:
  ```
  detour = time(prev_waypoint → station) + time(station → next_waypoint)
           - time(prev_waypoint → next_waypoint)
  ```
- [ ] Use Valhalla matrix API (many-to-many in single call)
- [ ] Display detour time badge on each station marker (+2 min, +5 min, etc.)
- [ ] `POST /api/detour` endpoint

### 2.2 — "Cheapest Within N Minutes Detour" Mode
- [ ] Detour slider in route panel (1-15 min, default 5)
- [ ] Algorithm:
  1. Get route polyline
  2. `turf.buffer(route, corridorKm)` — km derived from detour time
  3. PostGIS spatial query: stations in corridor for selected fuel type
  4. Valhalla matrix: compute detour for each candidate
  5. Filter by max detour
  6. Rank by price ascending
  7. Return top 5
- [ ] "Best deal" badge on the cheapest-with-acceptable-detour station
- [ ] Show savings comparison: "Save 4.20 EUR vs route average, +3 min detour"

### 2.3 — "Best Station in Area" Mode
- [ ] User taps/draws on a section of the route
- [ ] Or selects a city name from the route's passing-through cities
- [ ] Query stations in that geographic box
- [ ] Rank by price, show detour from route
- [ ] Useful for: "I want to refuel somewhere near Lyon"

### 2.4 — "Smart Refuel by Range" Mode
- [ ] User inputs: remaining range (km) and tank capacity (liters)
- [ ] Sweet zone algorithm:
  ```
  Zone           | Range %   | Multiplier | Behavior
  too_early      | 0-25%     | 0.3        | Low value, tank still full
  sweet_spot     | 25-65%    | 1.0        | Ideal — best options, no rush
  getting_late   | 65-80%    | 0.7        | Acceptable, fewer options
  danger_zone    | 80-90%    | 0.2        | Emergency fallback only
  never          | 90-100%   | 0.0        | Never recommend — stranding risk
  ```
- [ ] Score function: `(price_savings * fill_amount) - (detour_penalty * time_value) * zone_multiplier`
- [ ] Present top 3 recommendations with reasoning:
  - "Best value: Shell A-30 km 142 — 1.389 EUR/L, 3 min detour, saves 4.20 EUR"
  - "Closest cheap: Repsol Albacete — 1.399 EUR/L, on route"
  - "Cheapest overall: Plenoil Bonete — 1.359 EUR/L, 7 min detour"
- [ ] Visual: highlight sweet zone on route as green segment, danger as red

**Deliverable**: Full smart refueling system — the feature that makes Propel unique worldwide.

---

## Phase 3: Multi-Country Expansion

**Goal**: Cover 7 European countries with ~65,000 stations.

### 3.1 — Scraper Framework
- [ ] Abstract base scraper with shared logic (upsert, dedup, error handling)
- [ ] Scraper health monitoring (last successful run, station count, error rate)
- [ ] Scraper Docker image with cron scheduler

### 3.2 — Country Scrapers
- [ ] France scraper (Opendatasoft API, ~9,800 stations, every 30 min)
- [ ] Germany scraper (Tankerkoenig, ~14,000 stations, every 5 min, API key)
- [ ] Austria scraper (E-Control, real-time, every 15 min)
- [ ] Italy scraper (MIMIT CSV, ~22,000 stations, daily)
- [ ] UK scraper (CMA 14 retailer feeds, every 4 hours)
- [ ] Portugal scraper (DGEG API, daily, non-commercial disclaimer)

### 3.3 — Valhalla Europe Tiles
- [ ] Build Europe tiles on Hetzner CCX33 (~3 EUR one-time)
- [ ] Transfer to watchtower NVMe
- [ ] Update Docker Compose to mount Europe tiles

### 3.4 — Internationalization
- [ ] next-intl v4 setup with App Router
- [ ] Locale files: `es`, `en`, `fr`, `de`, `it`, `pt`, `nl`, `pl`
- [ ] Localized URL pathnames: `/es/gasolineras`, `/de/tankstellen`, `/fr/stations-service`
- [ ] Auto-detect locale from browser `Accept-Language` header
- [ ] Currency formatting per locale (EUR, GBP, PLN)
- [ ] Unit switching: km/miles, liters/gallons
- [ ] Fuel type names localized per country

### 3.5 — Cross-Border Routing
- [ ] Routes spanning multiple countries (e.g., Madrid → Paris)
- [ ] Show price differences at borders ("Diesel is 15c/L cheaper in Spain")
- [ ] Currency conversion for comparison (always show in user's preferred currency)
- [ ] Border-crossing fuel strategy recommendations

**Deliverable**: Full European coverage, 7 countries, 65K+ stations, 8 languages.

---

## Phase 4: Polish & UX

**Goal**: Production-quality UX that rivals Google Maps.

### 4.1 — Mobile UX
- [ ] Bottom sheet pattern for station details (swipe up/down, like Google Maps)
- [ ] Mobile-optimized route search (full-screen search overlay)
- [ ] Touch-friendly controls (larger tap targets, swipe gestures)
- [ ] Responsive sidebar → bottom panel transition at mobile breakpoint

### 4.2 — Station Detail Pages
- [ ] `/{locale}/station/{id}` — ISR pages (revalidate every 30 min)
- [ ] SEO: "Gasolinera Repsol Murcia — Gasoleo A 1.389 EUR/L"
- [ ] Price history chart (last 30 days, 90 days, 1 year)
- [ ] Opening hours
- [ ] Amenities (car wash, shop, restaurant, toilets)
- [ ] User reviews/ratings (future)
- [ ] "Navigate here" button (deep link to Google Maps / Waze / Apple Maps)

### 4.3 — Vehicle Profile
- [ ] Save vehicle details: fuel type, tank capacity, avg consumption (L/100km or kWh/100km)
- [ ] Auto-calculate range from tank level
- [ ] Route fuel cost estimation using vehicle profile
- [ ] Local storage (no account needed)

### 4.4 — Visual Polish
- [ ] Dark mode (Tailwind `dark:` + MapLibre dark style)
- [ ] Smooth animations for panel transitions
- [ ] Loading skeletons for map + panels
- [ ] Empty states and error boundaries
- [ ] Price change indicators (arrow up/down vs yesterday)

### 4.5 — PWA + Offline
- [ ] @serwist/next service worker
- [ ] App shell caching
- [ ] Offline base map via PMTiles (regional extract in IndexedDB)
- [ ] Offline station data cache (last known prices)
- [ ] Add-to-homescreen prompt
- [ ] Background sync for price updates when back online

**Deliverable**: A polished, mobile-first PWA that users actually want to install.

---

## Phase 5: EV Charging Integration

**Goal**: Extend Propel to electric vehicles — the ABRP killer.

### 5.1 — EV Data Sources
- [ ] Research and integrate EV charging APIs:
  - Open Charge Map (OCM) — open source, global, 270K+ chargers
  - OCPI (Open Charge Point Interface) — standard protocol
  - National APIs (e.g., UK National Chargepoint Registry)
- [ ] `ev_chargers` table: connector type, power (kW), price per kWh, network, availability
- [ ] Station type: `fuel`, `ev_charger`, or `both`

### 5.2 — EV Route Planning
- [ ] Battery level input (% or kWh remaining)
- [ ] Vehicle profile: battery capacity, consumption (kWh/100km), max charge speed
- [ ] Range prediction along route (accounting for elevation, speed, weather)
- [ ] Smart charging stop recommendations:
  - Minimize total trip time (balance charge speed vs detour)
  - Minimize cost (compare charger prices)
  - Ensure sufficient range buffer at all points
- [ ] Charging time estimation per stop (based on SoC curve + charger power)

### 5.3 — Hybrid View
- [ ] Toggle between fuel stations, EV chargers, or both on map
- [ ] Combined route planning for PHEVs (plug-in hybrids)
- [ ] Hydrogen station layer (for FCEV support)

**Deliverable**: Propel becomes the first app that optimizes energy stops for ANY vehicle type.

---

## Phase 6: Community & Data Quality

### 6.1 — Crowdsourced Prices
- [ ] "Report price" button (no account needed, rate-limited by IP)
- [ ] Community price validation (flag outdated government data)
- [ ] Trust scoring for reports

### 6.2 — Price Alerts
- [ ] "Notify me when diesel drops below X in my area"
- [ ] Web Push notifications (no email, no accounts)
- [ ] Daily price digest (optional)

### 6.3 — API for Developers
- [ ] Public REST API: `/api/v1/stations`, `/api/v1/prices`, `/api/v1/route`
- [ ] Rate limiting (100 req/min free)
- [ ] OpenAPI/Swagger docs
- [ ] Encourage third-party apps and integrations

---

## Phase 7: Global Expansion

### 7.1 — More European Countries
- [ ] Belgium (Carbu.com unofficial API)
- [ ] Netherlands
- [ ] Poland
- [ ] Switzerland
- [ ] Nordics (Norway, Sweden, Denmark, Finland)

### 7.2 — Outside Europe
- [ ] USA — no single official API, explore:
  - GasBuddy (no public API, scraping TOS issues)
  - OPIS (commercial)
  - State-level data sources
  - Crowdsourced as primary
- [ ] Canada
- [ ] Australia (FuelWatch WA is open, others vary by state)
- [ ] Latin America

### 7.3 — Commercial Data Fallback
- [ ] TomTom Fuel Prices API (global, freemium)
- [ ] HERE Fuel Prices API (global, freemium)
- [ ] Use commercial APIs to fill gaps where no government data exists

---

## Technical Debt & Infrastructure

### Ongoing
- [ ] Valhalla tile rebuilds (monthly cron, or triggered by Geofabrik update)
- [ ] PostGIS vacuum and index maintenance
- [ ] Scraper error monitoring and alerting
- [ ] Performance monitoring (response times, map load times)
- [ ] Database backups (pg_dump to NAS)

### Future Infrastructure
- [ ] CDN for static assets (Cloudflare)
- [ ] Protomaps PMTiles on Cloudflare R2 for global tile delivery
- [ ] Consider Hetzner VPS if watchtower becomes resource-constrained
- [ ] Rate limiting on API routes (middleware)

---

## Performance Targets

| Operation | Target | Expected |
|---|---|---|
| Route calculation | < 2s | 100-500ms (Valhalla NVMe) |
| Station corridor search | < 1s | 50-200ms (PostGIS GiST) |
| Detour matrix calculation | < 1s | 50-200ms (Valhalla matrix) |
| Full smart refuel pipeline | < 3s | 500ms-1.5s |
| Map tile loading | < 500ms | 50-200ms (local PMTiles) |
| First Contentful Paint | < 1.5s | ~1s (SSR + streaming) |
| Time to Interactive | < 3s | ~2s |

---

## Competitive Position

| Feature | Propel | GasBuddy | Waze | ViaMichelin | ABRP |
|---|---|---|---|---|---|
| Route planning | Yes | Yes | Yes (nav) | Yes | Yes |
| Real-time prices along route | Yes | Yes | Limited | No (estimates) | N/A (EV) |
| **Detour time calculation** | **Yes** | No | No | No | N/A |
| **Smart refuel by range** | **Yes** | No | No | No | Yes (EV) |
| Multi-country Europe | Yes (7+) | No (US/CA) | Partial | Partial | Yes (EV) |
| Fuel + EV support | Yes | No | No | No | EV only |
| Open source | Yes | No | No | No | No |
| Self-hostable | Yes | No | No | No | No |

---

*Last updated: March 2026*
