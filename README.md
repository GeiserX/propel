# Propel

Open-source energy route planner for fuel and electric vehicles. Self-hostable.

**No app in the world combines route planning with real-time energy prices, detour time calculation, and smart refueling recommendations. Propel does.**

## Features

- Real-time fuel prices from government open data APIs (Spain, France, Germany, Italy, UK, Austria, Portugal)
- Interactive map with 65,000+ stations across Europe
- Route planning with energy station filtering along the route
- "Cheapest within N minutes detour" — calculates if a detour is worth it
- Smart refuel/recharge advisor based on your remaining range
- EV charging integration (planned)
- Multi-language, multi-currency, multi-unit support
- Self-hostable with Docker Compose
- 100% open source (MIT)

## Quick Start

```bash
git clone https://github.com/GeiserX/propel.git
cd propel
docker compose -f docker/docker-compose.yml up -d
npm install
npm run scraper:run -- --country=ES --once
npm run dev
```

Open http://localhost:3000

## Self-Hosting

See [docker/docker-compose.yml](docker/docker-compose.yml) for the full stack. Total requirements: ~6-10 GB RAM, ~80 GB disk for Europe.

## Data Sources

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

Next.js 15, React 19, MapLibre GL JS, Tailwind CSS, PostGIS, Valhalla, OpenFreeMap, Photon, next-intl.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full plan — from fuel prices to EV charging to global expansion.

## License

MIT
