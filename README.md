<p align="center">
  <img src="docs/images/banner.svg" alt="Propel banner" width="900"/>
</p>

<h1 align="center">Propel</h1>

<p align="center">
  <strong>Open-source energy route planner for fuel and electric vehicles. Self-hostable.</strong>
</p>

<p align="center">
  <a href="https://propel.geiser.cloud"><img src="https://img.shields.io/badge/🌐_Website-propel.geiser.cloud-22c55e?style=flat-square" alt="Website"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/📜_License-GPL--3.0-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/GeiserX/propel"><img src="https://img.shields.io/github/stars/GeiserX/propel?style=flat-square&logo=github" alt="GitHub Stars"></a>
  <a href="https://hub.docker.com/r/drumsergio/propel"><img src="https://img.shields.io/docker/pulls/drumsergio/propel?style=flat-square&logo=docker&label=Docker%20Pulls" alt="Docker Pulls"></a>
</p>

<br>

---

**No app in the world combines route planning with real-time energy prices, detour time calculation, and smart refueling recommendations. Propel does.**

## Features

- Real-time fuel prices from government open data APIs (Spain, France, Germany, Italy, UK, Austria, Portugal)
- Interactive map with 65,000+ stations across Europe
- Route planning with geocoding autocomplete and corridor station filtering
- "Cheapest within N minutes detour" — calculates if a detour is worth it (planned)
- Smart refuel/recharge advisor based on your remaining range (planned)
- EV charging integration (planned)
- Multi-language, multi-currency, multi-unit support
- Fully self-hostable with Docker Compose
- 100% open source (GPL-3.0)

## Self-Hosting

### Requirements

| Resource | First-time build | Steady state |
|---|---|---|
| **RAM** | 16 GB (Valhalla tile build) | 4-5 GB |
| **Disk** | ~15 GB | ~10 GB |
| **CPU** | Multi-core recommended | Any |

> **Important**: On first start, Valhalla builds routing tiles from OpenStreetMap data (~20 min) and Photon imports geocoding data (~30 min). These are one-time operations — data persists across restarts. **Run them sequentially** (Valhalla first, then Photon) to avoid memory pressure.

### Quick Start

1. Clone and configure:

```bash
git clone https://github.com/GeiserX/propel.git
cd propel
cp .env.example .env
# Edit .env — set DATABASE_URL and optionally PROPEL_DEFAULT_COUNTRY
```

2. Start the stack:

```bash
docker compose up -d
```

3. Wait for the first-time setup to complete:

```bash
# Watch Valhalla build routing tiles (~20 min)
docker logs -f propel-valhalla

# Watch Photon download geocoding data (~30 min)
docker logs -f propel-photon
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
| **Valhalla** | Downloads Spain OSM PBF from Geofabrik (~1.4 GB), builds routing tiles with 20 threads. Enhance stage peaks at ~12 GB RAM. | Loads pre-built tiles instantly (~500 MB RAM) |
| **Photon** | Downloads Photon 1.0.1 JAR (~92 MB) + Spain geocoding dump (~490 MB). Imports ~5.6M documents (~12 min). | Starts OpenSearch with existing index (~1 GB RAM) |
| **PostGIS** | Creates database schema | Ready immediately |
| **App** | Ready immediately | Ready immediately |

### Docker Compose Services

| Service | Image | Steady-state RAM | Internal Port |
|---|---|---|---|
| app | `drumsergio/propel` | 512 MB | 3000 (exposed as 3200) |
| db | `postgis/postgis:17-3.4` | 2 GB | 5432 |
| valhalla | `ghcr.io/gis-ops/docker-valhalla/valhalla:3.5.1` | 512 MB | 8002 |
| photon | `eclipse-temurin:21-jre` + Photon 1.0.1 JAR | 1 GB | 2322 |

### Disk Usage (Spain)

| Directory | Size | Contents |
|---|---|---|
| `valhalla/` | ~3.5 GB | Spain PBF + routing tiles + tar |
| `photon/` | ~4 GB | Photon JAR + OpenSearch index |
| `pgdata/` | ~1 GB | PostGIS database |
| **Total** | **~8.5 GB** | |

### Configuration

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostGIS connection string | Required |
| `PROPEL_DEFAULT_COUNTRY` | ISO code for initial map view | `ES` |
| `PROPEL_ENABLED_COUNTRIES` | Comma-separated ISO codes | All |
| `VALHALLA_URL` | Valhalla routing endpoint | `http://propel-valhalla:8002` |
| `PHOTON_URL` | Photon geocoding endpoint | `http://propel-photon:2322` |

### Using a Different Country

Valhalla and Photon can be configured for any country:

1. **Valhalla**: Change `tile_urls` to the country PBF from [Geofabrik](https://download.geofabrik.de/)
2. **Photon**: Change `-country-codes es` to your country code in the docker-compose entrypoint
3. **App**: Set `PROPEL_DEFAULT_COUNTRY` and `PROPEL_ENABLED_COUNTRIES`

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

Next.js 15, React 19, MapLibre GL JS, Tailwind CSS, PostGIS 17, Valhalla 3.5.1, Photon 1.0.1, OpenFreeMap.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full plan — from fuel prices to EV charging to global expansion.

## License

GPL-3.0 — see [LICENSE](LICENSE)
