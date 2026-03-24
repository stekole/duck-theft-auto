# Duck Theft Auto

A GTA-style open-world crime game where all game state lives in DuckDB. Runs entirely in the browser as a single HTML file — no server, no build process.

Inspired by some fun projects I've enjoyed
- [duckdb-doom](https://github.com/nickvdyck/duckdb-doom) 
- [Bash-Theft-Auto](https://github.com/eliasbenaddou/Bash-Theft-Auto)

## Play

Open `index.html` in a browser. That's it.

Enter name "test" for $999,999 starting cash.

## How It Works

Every player action is a SQL query against DuckDB-WASM running in your browser. Player stats, inventory, gang territories, the game clock — all stored in SQL tables. No game objects, no classes, just rows and queries.

### Tables

| Table | What it stores |
|-------|---------------|
| `player` | Name, location, cash, health, armor, wanted level, gang, respect |
| `map` | 20x20 ASCII city grid |
| `skills` | Driving, strength, charisma, stealth, dealing |
| `guns` | Owned weapons with crime success bonuses |
| `drugs` | Drug inventory with avg buy price |
| `vehicles` | Owned vehicles for free travel |
| `territories` | 50 districts across 5 cities with gang ownership |
| `businesses` | Owned properties generating daily income |
| `recruits` | Gang members with strength and daily upkeep |
| `game_clock` | Day and hour, advances with every action |

## Features

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
- **Save/Load** — persists to localStorage
- **AI gang wars** — rival gangs fight over territory in the background

## Controls

- **WASD / Arrow Keys** — move on the city map
- **Mouse** — click action buttons
- All gameplay is menu-driven

## Tech

- DuckDB-WASM v1.28.0
- Vanilla JS + HTML + CSS
- Zero dependencies, zero build steps

# Changelog
- Adding visual graphic updates v2
