# FuelMap

Open-source fuel price comparison + intelligent route planner. Self-hostable.

**No app in the world combines route planning with real-time fuel prices, detour time calculation, and smart refueling recommendations. This one does.**

## Features

- Real-time fuel prices from government open data APIs (Spain, France, Germany, Italy, UK, Austria, Portugal)
- Interactive map with 65,000+ stations across Europe
- Route planning with fuel station filtering along the route
- "Cheapest within N minutes detour" — calculates if a detour is worth it
- Smart refuel advisor based on your remaining fuel range
- Multi-language, multi-currency, multi-unit support
- Self-hostable with Docker Compose
- 100% open source (MIT)

## Quick Start

```bash
# Clone
git clone https://github.com/GeiserX/fuel.git
cd fuel

# Start infrastructure
docker compose -f docker/docker-compose.yml up -d

# Install dependencies
npm install

# Seed database with Spain data
npm run scraper:run -- --country=ES --once

# Start dev server
npm run dev
```

Open http://localhost:3000

## Self-Hosting

See [docker/docker-compose.yml](docker/docker-compose.yml) for the full stack:
- **Next.js app** — the web application
- **PostGIS** — spatial database for stations and prices
- **Valhalla** — self-hosted routing engine (needs pre-built tiles)
- **Photon** — geocoding / address autocomplete
- **Scraper** — cron-based price data collection

Total requirements: ~6-10 GB RAM, ~80 GB disk for Europe.

## Data Sources

All fuel price data comes from official government open data APIs:

| Country | Source | Stations | Update |
|---|---|---|---|
| Spain | MITECO | ~12,000 | Daily |
| France | prix-carburants.gouv.fr | ~9,800 | 10 min |
| Germany | Tankerkoenig (MTS-K) | ~14,000 | 4 min |
| Italy | MIMIT | ~22,000 | Daily |
| UK | CMA Open Data | ~8,000 | Varies |
| Austria | E-Control | All | Real-time |
| Portugal | DGEG | ~3,500 | Daily |

## Tech Stack

- **Frontend**: Next.js 15, React 19, MapLibre GL JS, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma, PostGIS, Zod
- **Routing**: Valhalla (self-hosted, MIT license)
- **Maps**: OpenFreeMap (free vector tiles) + Protomaps (self-hosted fallback)
- **Geocoding**: Photon (OSM-based, self-hostable)
- **i18n**: next-intl (10+ languages)

## License

MIT
