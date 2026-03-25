# Architecture — Duck Theft Auto

## Why DuckDB?

Every game engine has a state model — objects, components, entity systems. This game takes a different approach: **all game state is SQL tables in DuckDB-WASM, running entirely in the browser.**

Why this works:

| Traditional Game Engine | Duck Theft Auto |
|------------------------|-----------------|
| State in JS objects/classes | State in SQL rows |
| Mutation via method calls | Mutation via UPDATE/INSERT |
| Save = serialize object graph | Save = dump tables to JSON |
| Query state = traverse objects | Query state = SELECT with WHERE/JOIN |
| Relationships via references | Relationships via foreign keys |

**DuckDB-WASM specifically** (not just any SQL):
- **Analytical engine** — aggregations, joins, GROUP BY are fast even on thousands of rows
- **In-browser WASM** — no server, no install, runs from `file://`
- **10-100x faster** than sql.js, Arquero, and Lovefield on analytical queries
- **Zero dependencies** — single CDN import, no npm
- **Columnar storage** — memory-efficient for tables with many rows of few columns (like map, territories, world_events)

The tradeoff: ~20-30 MB baseline memory for the WASM engine. For a browser game that's already loading Three.js, this is acceptable.

---

## Scaling Limits

### How Long Can You Play?

| Metric | Value |
|--------|-------|
| **Initial save size** | ~8 KB (116 rows across 15 tables) |
| **Growth rate** | ~270 bytes/in-game day (world_events dominates) |
| **At 100 days** | ~27 KB, ~230 rows |
| **At 1,000 days** | ~196 KB, ~1,750 rows |
| **Days until 5 MB localStorage fills** | **~9,200 days** (single save slot) |
| **Days with 5 save slots** | **~1,840 days** per slot |

The only unbounded table is `world_events` (~1.5 rows/day, ~120 bytes each). All other tables are bounded by game constants (13 guns max, 4 drug types, 50 districts, etc.).

**Bottom line: a single save can run for thousands of in-game days without hitting any limit.**

If long-running saves ever become an issue, a simple fix:
```sql
DELETE FROM world_events WHERE id NOT IN (SELECT id FROM world_events ORDER BY id DESC LIMIT 500)
```

### Memory Budget

| Component | RAM Usage |
|-----------|-----------|
| DuckDB-WASM engine | ~20-30 MB (fixed baseline) |
| Game data (1,000 days) | ~250 KB (trivial) |
| Map table (40x40, in-memory only) | ~50 KB |
| Three.js scene | ~30-80 MB (geometry, textures, NPCs) |
| **Total per tab** | **~60-120 MB** |

DuckDB-WASM operates within a 4 GB WASM memory ceiling (wasm32). The game uses <1% of this.

### Browser Storage Limits

| Storage | Chrome | Firefox | Safari |
|---------|--------|---------|--------|
| localStorage | 5 MB | 5 MB | 5-10 MB |
| IndexedDB | 60% of disk | 10 GB or 10% of disk | 60% of disk* |

*Safari has 7-day eviction on IndexedDB if no user interaction.

Current save system uses localStorage (synchronous, simple). If needed, IndexedDB is the upgrade path — async, binary blobs, effectively unlimited storage.

### Multiplayer Scaling

| Topology | Max Players | Why |
|----------|------------|-----|
| **P2P Mesh** (current) | **4-6 players** | Each peer connects to every other peer; CPU/bandwidth scales quadratically |
| **Star** (host relays) | **8-12 players** | Host is bottleneck but connections scale linearly |
| **SFU server** | **50-100+** | Requires hosted infrastructure (breaks zero-cost goal) |

**WebRTC hard limits:**
- Chrome: 500 RTCPeerConnection objects per page
- Data channel message size: ~16 KB (chunk larger payloads)
- Realistic mesh: 4 participants before bandwidth/CPU strain

**Each player runs their own DuckDB instance.** In a 4-player mesh, that's 4 independent WASM instances across 4 browser tabs — no shared memory pressure.

### Query Performance

| Dataset Size | Query Speed |
|-------------|-------------|
| Hundreds of rows (this game) | Sub-millisecond |
| 100K rows | ~10ms |
| 1M rows | ~100ms |
| 3.2M rows (GROUP BY + ORDER BY) | ~800ms |

The game's queries (~200-2000 rows) are effectively instant. DuckDB is massive overkill for the data volume — but that's the point: SQL as a game state interface, with room to grow.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (per player)                     │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────┐ │
│  │constants │  │ city.js  │  │renderer.js │  │multiplayer.js│ │
│  │  .js     │  │          │  │ (Three.js)  │  │ (Trystero)   │ │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘  └──────┬───────┘ │
│       │              │              │                 │         │
│       └──────────────┴──────┬───────┴─────────────────┘         │
│                             │                                   │
│                      ┌──────┴──────┐                            │
│                      │  game.js    │ ← all gameplay logic       │
│                      └──────┬──────┘                            │
│                             │                                   │
│                      ┌──────┴──────┐                            │
│                      │   db.js     │                            │
│                      │ (DuckDB-   │                            │
│                      │   WASM)     │                            │
│                      └──────┬──────┘                            │
│                             │                                   │
│                      ┌──────┴──────┐                            │
│                      │localStorage │ ← save/load                │
│                      └─────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Module Dependency Graph

```
constants.js ──→ (no dependencies)
city.js ────────→ constants.js
renderer.js ───→ constants.js, city.js, THREE (CDN)
db.js ─────────→ constants.js, city.js, renderer.js, DuckDB-WASM (CDN)
multiplayer.js → db.js, Trystero (CDN)
game.js ───────→ constants.js, city.js, renderer.js, db.js, multiplayer.js
index.html ────→ renderer.js, db.js, game.js, multiplayer.js (bootstrap)
```

No circular dependencies. `game.js` is the hub — it imports from everything else, nothing imports from it.

## Data Flow

### Single Player

```
Keyboard Input → game.js → SQL Query → DuckDB-WASM (in-memory)
                    │                        │
                    │                        ↓
                    │                   Query Result
                    │                        │
                    ↓                        ↓
              renderer.js              Update HUD/Menus
              (3D scene)
```

### Multiplayer

```
                    ┌──── Nostr Relays ────┐
                    │  (signaling only)    │
                    └───┬─────────────┬────┘
                        │             │
                   SDP offer      SDP answer
                   (encrypted     (encrypted
                    if password)   if password)
                        │             │
              ┌─────────┴──┐   ┌──────┴────────┐
              │  HOST       │   │  CLIENT        │
              │             │   │                │
              │  game.js    │   │  game.js       │
              │    ↓        │   │    ↓           │
              │  DuckDB     │   │  DuckDB        │
              │  (truth)    │   │  (local copy)  │
              │    ↓        │   │    ↑           │
              │  broadcast ─┼───┼→ receive       │
              │    ↑        │   │    ↓           │
              │  receive  ←─┼───┼─ send action   │
              │             │   │                │
              └─────────────┘   └────────────────┘
                        │             │
                        └─── WebRTC ──┘
                         (direct P2P,
                          DTLS encrypted)
```

## State Model

All game state is SQL tables in DuckDB-WASM. There are no JavaScript objects that hold game state — every read goes through SQL, every mutation is an UPDATE/INSERT.

### Tables

| Table | Rows | Growth | Synced in MP? |
|-------|------|--------|---------------|
| `player` | 1 (always) | Fixed | Own stats broadcast via move events |
| `map` | 1,600 (40x40) | Fixed, not saved | Same city name = same deterministic map |
| `game_clock` | 1 (always) | Fixed | Sent in worldSync |
| `skills` | 5 | Fixed | Not synced |
| `guns` | 0-13 | Capped at 13 | Not synced |
| `inventory` | 0-4 | Capped by item types | Not synced |
| `drugs` | 0-4 | Capped by drug types | Not synced |
| `vehicles` | 0-6 | Capped by vehicle names | Not synced |
| `territories` | 50 | Fixed (5 cities x 10) | Not yet synced (future) |
| `businesses` | 0-15 | Slow growth | Not synced |
| `recruits` | 0-30+ | Slow growth | Not synced |
| `gang_upgrades` | 3 | Fixed | Not synced |
| `gang_relations` | 0-5 | Slow growth | Not synced |
| `district_heat` | 50 | Fixed (5 cities x 10) | Not synced |
| `perks` | 6 | Fixed | Not synced |
| `world_events` | **Unbounded** | ~1.5 rows/day | Not synced |
| `remote_players` | 0-6 | Per connected peer | Updated on every move event |
| `connection_log` | Grows | Per join/leave | Local only |

### Save/Load Cycle

```
DuckDB Tables → JSON (all rows) → localStorage (per-slot by player name)
                                        │
                                        ↓ (on load)
localStorage → JSON → validate table/column names → INSERT into DuckDB
```

Saved tables: 15 (excludes `map`, `remote_players`, `connection_log`).
Map is regenerated from city name on load — deterministic generation means no need to save 1,600 rows.

## Multiplayer Architecture

### Host-Authoritative Model

```
HOST's responsibilities:
├── Owns world state (NPCs, time, shops)
├── Validates incoming actions from clients
├── Sends worldSync snapshot to new peers
└── Broadcasts world events to all clients

CLIENT's responsibilities:
├── Owns own player state (health, cash, inventory)
├── Sends actions to host for validation
├── Renders remote players from move events
└── Applies worldSync from host on join
```

### P2P Connection Lifecycle

```
1. HOST calls joinRoom(config, roomId)
   → Trystero publishes encrypted signaling to Nostr relays

2. CLIENT calls joinRoom(config, roomId) with same code + password
   → Trystero finds host's signaling on Nostr
   → WebRTC SDP exchange (encrypted if password set)
   → DTLS handshake → data channel open

3. room.onPeerJoin fires on both sides
   → Exchange playerJoin messages (name, character)
   → Host sends worldSync (city, time, player positions)
   → Client spawns remote ducks

4. Gameplay: events flow over data channels
   → move, shoot, chat, action messages
   → Each validated: kicked? → rate limit → tick → type check → range check

5. Disconnect: room.onPeerLeave fires
   → Remove remote duck, clean up DB, log connection
```

### Event Protocol

All messages are JSON over WebRTC data channels:

```
move:        { x, y, name, char, health, wanted, tick }
shoot:       { target, damage, tick }
chat:        { msg, name, tick }
action:      { action, [crime|place|name], tick }
worldSync:   { city, day, hour, hostPlayer, peers }
playerJoin:  { name, char }
playerLeave: { }
```

### Security Layers

```
INCOMING PEER MESSAGE
        │
        ↓
[1] kickedPeers check ─── blocked? → DROP
        │
        ↓
[2] Rate limit (30/sec) ── exceeded? → DROP
        │
        ↓
[3] Tick validation ────── stale/missing/non-numeric? → DROP
        │
        ↓
[4] Type validation ────── non-numeric x/y? → DROP (SQL injection prevention)
        │
        ↓
[5] Move validation ────── teleport (>3 tiles)? → DROP
        │
        ↓
[6] Range validation ───── shoot from too far (>8 tiles)? → DROP
        │
        ↓
[7] Damage clamping ────── negative or >50? → CLAMP to 1-50
        │
        ↓
[8] Cooldown check ─────── <200ms since last shot? → DROP
        │
        ↓
[9] Name resolution ────── use peerId lookup, not self-reported name
        │
        ↓
  ACCEPT → process event
```

## Threat Model for Open Source

### What is NOT a secret

These values are in the source code and known to any attacker:

| Value | Location | Impact of exposure |
|-------|----------|-------------------|
| `appId: 'duck-theft-auto'` | multiplayer.js | Attacker knows the Nostr topic namespace |
| Room code alphabet | multiplayer.js | Attacker knows code format (31^6 = ~887M combos) |
| Rate limit thresholds | multiplayer.js | Attacker knows exactly how much spam is allowed |
| Damage cap (1-50) | game.js | Attacker knows max damage per shot |
| Validation rules | multiplayer.js | Attacker knows what moves pass validation |
| All game constants | constants.js | Attacker knows all items, prices, probabilities |

**This is fine.** Security through obscurity is not security. All protections work even with full knowledge of the code. This follows Kerckhoffs's principle: the system must be secure even if the attacker has the source code.

### What IS a secret (per-session, never in code)

| Secret | How it's created | Who knows it |
|--------|-----------------|-------------|
| Room code | Generated per-game, crypto-random | Host shares out-of-band |
| Room password | User-chosen, optional | Players share out-of-band |
| WebRTC DTLS keys | Generated per-connection by browser | Only the two connected peers |
| Trystero peer IDs | Generated per-session | Only connected peers |

### The Fundamental Open Source P2P Problem

> **You cannot prevent a modified client from sending arbitrary messages over a WebRTC data channel.**

This is not a solvable problem in pure P2P without a trusted server. It's the same problem every P2P game faces (Minecraft, Among Us with mods, etc.).

**What you CAN do (and we do):**

1. **Validate everything on receive.** Every field, every type, every range. A malicious payload is silently dropped, not processed.

2. **Minimize the damage radius.** A cheater can:
   - Move faster than normal → caught by move validation (3 tile max)
   - Deal more damage → capped at 50, cooldown enforced, range checked
   - Spam messages → rate limited to 30/sec
   - Send garbage → type validation drops it
   - Impersonate others → names resolved from peerId, not payload

3. **Make cheating visible.** Other players see suspicious behavior and can vote-kick.

4. **Make the room private.** Password-encrypted signaling means only invited players can connect.

**What you CANNOT prevent (without a server):**

| Attack | Why it's unavoidable | Mitigation |
|--------|---------------------|------------|
| Subtle speed hacks | Client controls their own tick rate | Move validation catches large jumps |
| Wallhacks | Client has full map data | Inherent to client-side rendering |
| Auto-aim | Client chooses targets locally | Range check limits effectiveness |
| Modified game logic | Client runs their own code | Can't prevent, can only validate inputs |
| Forged player stats | Client reports own health/cash | Other players can't verify private state |

### If You Need Stronger Guarantees

The only way to fully prevent cheating is to move to a **server-authoritative model** where a trusted server runs all game logic and clients are thin renderers. This would require:

- A hosted server (breaks the "zero cost" requirement)
- OR a consensus mechanism where N peers must agree on every action (adds latency, complexity)

For a fun open-source browser game, the current model is the right tradeoff: **easy to play, hard to grief, impossible to fully cheat-proof.**

## CDN Dependencies

| Library | Version | CDN | Size | Purpose |
|---------|---------|-----|------|---------|
| Three.js | 0.170.0 | cdn.jsdelivr.net | ~600 KB | 3D rendering |
| DuckDB-WASM | 1.28.0 | cdn.jsdelivr.net | ~10 MB | SQL database engine |
| Trystero | latest | esm.run | ~4 KB | P2P matchmaking |

All loaded via import maps. No npm, no bundler, no build step for development. `build.sh` inlines everything into a single `dist/index.html`.

Versions are pinned for Three.js and DuckDB-WASM. Trystero loads latest via esm.run. Import maps do not support SRI (Subresource Integrity) — self-hosting is the long-term mitigation.

## Build Pipeline

```
js/constants.js ─┐
js/city.js ──────┤
js/renderer.js ──┤
js/db.js ────────┤──→ build.sh (perl strips imports/exports) ──→ dist/index.html
js/multiplayer.js┤                                                (single file,
js/game.js ──────┤                                                 works offline*
index.html ──────┘                                                 via file://)

* Multiplayer requires internet for Nostr signaling.
  Single-player works fully offline.
```

Key build detail: `build.sh` uses **perl** (not sed) to strip multi-line `import {...} from` statements. Single-line stripping with sed breaks multi-line imports in game.js and db.js.
