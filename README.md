# Duck Theft Auto

A GTA-style open-world crime game where **all game state lives in SQL tables** powered by DuckDB-WASM. Runs entirely in the browser — no server required. P2P multiplayer via WebRTC.

Inspired by [duckdb-doom](https://github.com/nickvdyck/duckdb-doom) and [Bash-Theft-Auto](https://github.com/eliasbenaddou/Bash-Theft-Auto).

## Play

Open `dist/index.html` in a browser. Or visit the [live demo](https://stekole.github.io/duck-theft-auto/).

## Why DuckDB as a Game Engine?

Every game engine has a state model — objects, components, entity systems. This game takes a radically different approach: **every player action is a SQL query against DuckDB-WASM running in your browser.**

| Traditional Game Engine | Duck Theft Auto |
|------------------------|-----------------|
| State in JS objects/classes | State in SQL rows |
| Mutation via method calls | Mutation via `UPDATE`/`INSERT` |
| Save = serialize object graph | Save = dump tables to JSON |
| Query state = traverse objects | Query state = `SELECT` with `WHERE`/`JOIN` |
| Relationships via references | Relationships via foreign keys |

**Why DuckDB-WASM specifically:**
- **Analytical engine** — aggregations, joins, GROUP BY are fast even on thousands of rows
- **In-browser WASM** — no server, no install, works from `file://`
- **10-100x faster** than sql.js on analytical queries
- **Zero dependencies** — single CDN import, no npm
- **Columnar storage** — memory-efficient for tables with many rows

The tradeoff: ~20-30 MB baseline memory for WASM. For a browser game already loading Three.js, this is acceptable.

### SQL Tables

| Table | Purpose |
|-------|---------|
| `player` | Name, location, cash, health, armor, wanted level, gang, respect |
| `map` | 120x120 procedural city grid |
| `skills` | Driving, strength, charisma, stealth, dealing |
| `guns` | Owned weapons with damage bonuses, equipped state |
| `drugs` | Drug inventory with average buy price |
| `vehicles` | Owned vehicles, active/garaged state |
| `territories` | Districts across 5 cities with gang ownership |
| `businesses` | Properties generating daily income |
| `heist_progress` | Multi-step heist mission state |
| `game_clock` | Day and hour, advances with actions |
| `action_log` | Every player action timestamped for analytics |

### Performance

| Dataset | Query Speed |
|---------|-------------|
| Game data (~200-2000 rows) | Sub-millisecond |
| 100K rows | ~10ms |
| 1M rows | ~100ms |

The game's queries are effectively instant. DuckDB is overkill for the data volume — but that's the point: SQL as a game state interface.

## Architecture

```
index.html          — HTML, CSS, module bootstrap
js/constants.js     — game data (cities, jobs, crimes, guns, drugs, gangs, heists)
js/city.js          — procedural city map generation (120x120, seeded RNG)
js/renderer.js      — Three.js 3D rendering (duck, city, NPCs, vehicles, particles)
js/db.js            — DuckDB-WASM init, schema, queries, save/load
js/multiplayer.js   — P2P multiplayer (Trystero/Nostr, WebRTC)
js/game.js          — all gameplay logic, menus, keyboard controls
build.sh            — builds dist/index.html single-file (works offline)
```

**Key design choices:**
- ES modules, no npm, CDN imports via import maps
- All state queries go through `exec()`, `q()`, `q1()`, `qv()` helpers
- Save/Load: serialize all tables to JSON → localStorage
- Procedural city generation uses seeded PRNG for multiplayer determinism
- Single-file dist build via shell script (perl for import stripping)

## Multiplayer

P2P via [Trystero](https://github.com/dmotz/trystero) using Nostr relay signaling → WebRTC data channels.

- **Lobby discovery** — hosts announce via Nostr relays, joiners see available games
- **Deterministic maps** — seeded PRNG ensures all peers get identical city layouts
- **Synced state** — player positions, NPC kills, police spawns, time of day, race challenges
- **PvP** — shoot other players, place bounties
- **Optional room passwords** — AES-GCM encrypted signaling

| Topology | Max Players | Notes |
|----------|------------|-------|
| P2P Mesh (current) | 4-6 | Connections scale quadratically |
| Star (host relays) | 8-12 | Future upgrade path |

Each player runs their own DuckDB instance. No shared memory pressure.

## Features

- **3D city** — Three.js isometric view with downtown skyline, parks, bridges, docks
- **7 characters** — CJ, Tommy, Claude, Niko, Catalina + god-mode Oz & Izzy
- **52 heists** — 5 tiers from petty theft to legendary multi-step operations
- **Crime system** — robberies, drug dealing, carjacking, gang wars
- **Police** — persistent cops that chase, shoot, and spawn based on wanted level
- **Wanted decay** — level drops over time, or lay low at gang hangout/strip club
- **PvP bounties** — place cash bounties on other players in multiplayer
- **Vehicles** — 19 styles with unique speeds, steal cop cars or NPC cars
- **Day/night cycle** — dynamic lighting, street lamps, neon signs
- **Street racing** — solo or multiplayer with buy-ins
- **Territory system** — capture districts, manage alliances, earn daily income
- **Stats dashboard** — SQL analytics with crime streaks, K/D ratio, play time
- **Parquet export** — save games as shareable .dta files via DuckDB Parquet

## Controls

| Key | Action |
|-----|--------|
| WASD/Arrows | Move |
| Space/F | Shoot |
| Enter | Interact (NPCs, cars, POIs) |
| Q/E | Rotate camera |
| Z/C | Zoom in/out |
| 1-9, 0 | Quick menu access |
| J | Heists |
| B | Bounties (multiplayer) |
| T | Chat (multiplayer) |
| ` | Cheat console |
| F5 | Save game |
| Esc | Close menu |

## Build

```bash
bash build.sh
# Creates dist/index.html — single file, works offline, works with file://
```

GitHub Actions auto-deploys to GitHub Pages on push to main.
