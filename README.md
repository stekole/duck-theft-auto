# Duck Theft Auto

A GTA-style open-world crime game where all game state lives in DuckDB. Runs entirely in the browser — no server required.

Inspired by some fun projects I've enjoyed
- [duckdb-doom](https://github.com/nickvdyck/duckdb-doom)
- [Bash-Theft-Auto](https://github.com/eliasbenaddou/Bash-Theft-Auto)

## Play

Open `dist/index.html` in a browser. That's it.

Enter name "test" for $999,999 starting cash.

## How It Works

Every player action is a SQL query against DuckDB-WASM running in your browser. Player stats, inventory, gang territories, the game clock — all stored in SQL tables. No game objects, no classes, just rows and queries.

### Tables

| Table | What it stores |
|-------|---------------|
| `player` | Name, location, cash, health, armor, wanted level, gang, respect |
| `map` | 40x40 procedural city grid |
| `skills` | Driving, strength, charisma, stealth, dealing |
| `guns` | Owned weapons with crime success bonuses |
| `drugs` | Drug inventory with avg buy price |
| `vehicles` | Owned vehicles for free travel |
| `territories` | 50 districts across 5 cities with gang ownership |
| `businesses` | Owned properties generating daily income |
| `recruits` | Gang members with strength and daily upkeep |
| `game_clock` | Day and hour, advances with every action |

## Features

- **3D city** — Three.js isometric view with buildings, roads, trees, water, parked cars
- **3D duck character** — with hat, waddle animation, and vehicle display
- **Day/night cycle** — dynamic lighting, street lamps, neon signs
- **City life** — NPC pedestrians, particle effects, police sirens
- **5 cities** — Los Santos, San Fierro, Las Venturas, Vice City, Liberty City
- **12 legal jobs** with skill-based pay
- **8 crime types** — rob, burglary, heist, carjack, pickpocket, mug, arson, kidnap
- **Wanted system** — 0-5 stars, police encounters (run/bribe/surrender)
- **Gang empire** — join or create gangs, 7 ranks, territory wars, recruits, upgrades
- **Drug market** — buy/sell with dynamic pricing
- **Businesses** — car wash, nightclub, chop shop, drug lab, strip club
- **Hookers** — 3 service tiers for health restoration
- **Gambling** — slots, dice, poker
- **Street racing** — risk it all for cash
- **Vehicles** — buy or carjack, enables free travel
- **Perks** — 6 unlockable perks across 3 tiers
- **Save/Load** — persists to localStorage with auto-save every 5 minutes
- **AI gang wars** — rival gangs fight over territory in the background

## Data Persistence

All game state lives in **DuckDB-WASM**, an in-memory SQL database running entirely in your browser. There is no server — everything happens client-side.

**How saving works:**

1. During gameplay, all data (player stats, inventory, territories, etc.) exists as rows in DuckDB tables in memory
2. When you save (F5 or auto-save), every table is serialized to JSON and written to `localStorage`
3. When you load, the JSON is read back from `localStorage` and re-inserted into fresh DuckDB tables

**What this means:**

- Saves persist across page refreshes and browser restarts
- Auto-save runs every 5 minutes during gameplay
- Clearing your browser data / localStorage will delete your save
- Each browser profile has its own independent save
- Save data is stored under the key `duck_theft_auto_save` in localStorage
- There is one save slot — saving overwrites the previous save

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrow Keys | Move your duck around the 3D city |
| Enter | Interact with POI (glowing markers) |
| 1-9, 0 | Quick-select menu actions |
| Escape | Close any menu |
| Scroll wheel / +/- | Zoom in/out |
| Q / E | Rotate camera |

## Development

Source code is split into modules under `js/` for easier editing:

```
index.html          — HTML, CSS, module bootstrap (needs local server)
js/constants.js     — game data (cities, jobs, crimes, guns, drugs, gangs, perks)
js/city.js          — procedural city map generation
js/renderer.js      — Three.js 3D rendering (duck, city, NPCs, particles, lighting)
js/db.js            — DuckDB-WASM init, schema, queries, save/load
js/game.js          — all gameplay logic, menus, keyboard controls
build.sh            — builds dist/index.html from source files
dist/index.html     — single-file build (works with file://, no server needed)
```

To develop with split files, run a local server (`python3 -m http.server`) and open `index.html`.

After making changes, rebuild the playable single file:

```
./build.sh
```

## Tech

- **Three.js** v0.170.0 — 3D rendering (isometric camera, shadows, day/night cycle)
- **DuckDB-WASM** v1.28.0 — all game state stored in SQL tables
- Vanilla JS ES modules, zero npm dependencies
- CDN imports via import maps

## Changelog

- v3: Three.js 3D rendering, procedural cities, 3D duck character, NPCs, particles, day/night cycle
- v2: Canvas-based visual improvements
- v1: ASCII terminal-style rendering
