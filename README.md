<p align="center">
  <img src="docs/images/banner.svg" alt="Pumperly banner" width="900"/>
</p>

<h1 align="center">Pumperly</h1>

<p align="center">
  <strong>Open-source energy route planner for fuel and electric vehicles. Self-hostable.</strong>
</p>

<p align="center">
  <a href="https://pumperly.com"><img src="https://img.shields.io/badge/🌐_Website-pumperly.com-22c55e?style=flat-square" alt="Website"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/📜_License-GPL--3.0-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/GeiserX/pumperly"><img src="https://img.shields.io/github/stars/GeiserX/pumperly?style=flat-square&logo=github" alt="GitHub Stars"></a>
  <a href="https://hub.docker.com/r/drumsergio/pumperly"><img src="https://img.shields.io/docker/pulls/drumsergio/pumperly?style=flat-square&logo=docker&label=Docker%20Pulls" alt="Docker Pulls"></a>
</p>

<br>

---

**No app in the world combines route planning with real-time energy prices, detour time calculation, and smart refueling recommendations. Pumperly does.**

## Features

- Real-time fuel prices from government open data APIs across 15 European countries
- Interactive map with 84,000+ stations across Europe
- Route planning with geocoding autocomplete, alternative routes, and corridor station filtering
- "Cheapest within N minutes detour" — filters stations by detour time with price comparison
- Smart refuel/recharge advisor based on your remaining range (planned)
- EV charging integration (planned)
- Multi-language, multi-currency, multi-unit support
- Fully self-hostable with Docker Compose
- 100% open source (GPL-3.0)

## Self-Hosting

### Requirements

| Resource | First-time build | Steady state |
|---|---|---|
| **RAM** | 24 GB (Valhalla 15-country tile build) | 6-8 GB |
| **Disk** | ~250 GB (15-country Photon + Valhalla) | ~80 GB |
| **CPU** | Multi-core recommended | Any |

> **Important**: On first start, Valhalla builds routing tiles from OpenStreetMap data (3-6 hours for 15 countries) and Photon imports geocoding data (20+ hours for 15 countries). These are one-time operations — data persists across restarts.

### Quick Start

1. Clone and configure:

```bash
git clone https://github.com/GeiserX/pumperly.git
cd pumperly
cp .env.example .env
# Edit .env — set DATABASE_URL and optionally PUMPERLY_DEFAULT_COUNTRY
```

2. Start the stack:

```bash
docker compose up -d
```

3. Wait for the first-time setup to complete:

```bash
# Watch Valhalla build routing tiles (~20 min)
docker logs -f pumperly-valhalla

# Watch Photon download geocoding data (~30 min)
docker logs -f pumperly-photon
```

4. Seed station data:

```bash
npm install
npx prisma generate
npm run scraper:run -- --country=ES --once
```

5. Open http://localhost:3000

### What Happens on First Start

| Service | First start | Subsequent starts |
|---|---|---|
| **Valhalla** | Builds routing tiles from 15-country merged PBF (~20 GB). Uses 8 threads, peaks at ~15 GB RAM. Takes 3-6 hours. | Loads pre-built tiles instantly (~2 GB RAM) |
| **Photon** | Downloads Photon 1.0.1 JAR (~92 MB) + 15 country geocoding dumps. Imports 200M+ documents (20+ hours). | Starts with existing index (~3 GB RAM) |
| **PostGIS** | Creates database schema | Ready immediately |
| **App** | Ready immediately | Ready immediately |

### Docker Compose Services

| Service | Image | Steady-state RAM | Internal Port |
|---|---|---|---|
| app | `drumsergio/pumperly` | 512 MB | 3000 (exposed as 3200) |
| db | `postgis/postgis:17-3.4` | 2 GB | 5432 |
| valhalla | `ghcr.io/gis-ops/docker-valhalla/valhalla:3.5.1` | 512 MB | 8002 |
| photon | `eclipse-temurin:21-jre` + Photon 1.0.1 JAR | 1 GB | 2322 |

### Disk Usage (15 countries)

| Directory | Size | Contents |
|---|---|---|
| `valhalla/` | ~30 GB | 15-country merged PBF + routing tiles |
| `photon/` | ~250 GB | Combined JSONL + OpenSearch index |
| `pgdata/` | ~2 GB | PostGIS database (84K+ stations) |
| **Total** | **~280 GB** | |

### Configuration

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostGIS connection string | Required |
| `PUMPERLY_DEFAULT_COUNTRY` | ISO code for initial map view | `ES` |
| `PUMPERLY_ENABLED_COUNTRIES` | Comma-separated ISO codes | All |
| `PUMPERLY_DEFAULT_FUEL` | Override default fuel type | Per-country |
| `PUMPERLY_CLUSTER_STATIONS` | Enable map marker clustering | `true` |
| `PUMPERLY_CORRIDOR_KM` | Route corridor width in km (0.5–50) | `5` |
| `VALHALLA_URL` | Valhalla routing endpoint | `http://pumperly-valhalla:8002` |
| `PHOTON_URL` | Photon geocoding endpoint | `http://pumperly-photon:2322` |

### Using a Different Country

Valhalla and Photon can be configured for any country:

1. **Valhalla**: Change `tile_urls` to the country PBF from [Geofabrik](https://download.geofabrik.de/)
2. **Photon**: Change `-country-codes es` to your country code in the docker-compose entrypoint
3. **App**: Set `PUMPERLY_DEFAULT_COUNTRY` and `PUMPERLY_ENABLED_COUNTRIES`

## Data Sources

| Country | Source | Stations | Update |
|---|---|---|---|
| Italy | MIMIT | ~23,600 | Daily |
| Germany | Tankerkoenig (MTS-K) | ~14,300 | Hourly |
| Spain | MITECO | ~12,200 | Daily |
| France | prix-carburants.gouv.fr | ~9,900 | Daily |
| Netherlands | ANWB | ~3,900 | Daily |
| UK | CMA Open Data | ~3,500 | Daily |
| Portugal | DGEG | ~3,200 | Daily |
| Belgium | ANWB | ~3,200 | Daily |
| Greece | FuelGR | ~3,100 | Daily |
| Austria | E-Control | ~2,700 | Real-time |
| Romania | Peco Online | ~1,400 | Daily |
| Ireland | Pick A Pump | ~1,300 | Daily |
| Croatia | MZOE | ~900 | Daily |
| Slovenia | goriva.si | ~550 | Daily |
| Luxembourg | ANWB | ~240 | Daily |

## Tech Stack

Next.js 15, React 19, MapLibre GL JS, Tailwind CSS, PostGIS 17, Valhalla 3.5.1, Photon 1.0.1, OpenFreeMap.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full plan — from fuel prices to EV charging to global expansion.

## License

GPL-3.0 — see [LICENSE](LICENSE)
