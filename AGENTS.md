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
propel.geiser.cloud (Caddy reverse proxy on watchtower)
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

---

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

**Spain (MITECO)** — Base: `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/`. `EstacionesTerrestres/` returns all stations + prices. No auth. Cloud IPs sometimes blocked. Schedule: `0 8,20 * * *`

**France (Opendatasoft)** — Base: `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records`. JSON, proper lat/lon. Updates every 10 min. Schedule: `*/30 * * * *`

**Germany (Tankerkoenig)** — Base: `https://creativecommons.tankerkoenig.de/json/`. Free API key required. 5-min rate limit. Schedule: `*/5 * * * *`

**Italy (MIMIT)** — CSV downloads (pipe-delimited). Coordinates voluntary. Schedule: `0 9 * * *`

**UK (CMA Feeds)** — 14 separate JSON endpoints per retailer. Prices in pence. Schedule: `0 */4 * * *`

**Austria (E-Control)** — Base: `https://api.e-control.at/sprit/1.0/`. Real-time. Schedule: `*/15 * * * *`

**Portugal (DGEG)** — Base: `https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/`. Commercial use prohibited. Schedule: `0 10 * * *`

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

| Service | Image | RAM | Port |
|---|---|---|---|
| app | `drumsergio/propel:x.y.z` | 512 MB | 3100 |
| db | `postgis/postgis:16-3.4` | 2-4 GB | 5433 |
| valhalla | `ghcr.io/gis-ops/docker-valhalla` | 2-4 GB | 8002 |
| photon | `komoot/photon` | ~1 GB | 2322 |
| scraper | `drumsergio/propel-scraper:x.y.z` | 256 MB | — |

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
5. **Germany Tankerkoenig has 5-min rate limit**
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

*Last updated: March 2026*
