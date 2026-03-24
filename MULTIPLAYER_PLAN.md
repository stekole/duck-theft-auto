# Multiplayer P2P Implementation Plan

Branch: `feature-multiplayer-p2p` (off `refector-split-files-idea`)

## Architecture

- Fully P2P via WebRTC using Trystero (Nostr signaling strategy)
- Zero cost, no servers, works from file:// or GitHub Pages
- One player is "host" (source of truth for world state), others are clients
- Each player runs their own DuckDB-WASM instance
- Clients send actions to host, host validates and broadcasts results
- Host role = first player to create room (can migrate if host disconnects)

```
        HOST (Player A)                    CLIENT (Player B)
   +----------------------+          +----------------------+
   |  DuckDB = THE truth  |          |  DuckDB = local copy |
   |  - NPCs              |  ------> |  - NPCs (from host)  |
   |  - shops             |  events  |  - shops (from host)  |
   |  - time              |  <------ |  - time (from host)   |
   |  - all players       |  actions |  - all players        |
   +----------------------+          +----------------------+
```

Signaling: Free Nostr public relays (decentralized, no account)
Game data: Direct WebRTC data channels between players
Hosting: GitHub Pages, local file://, or any static host

## Tech Stack

- Trystero (nostr strategy) - ~4KB, ES module, CDN import
- Web Crypto API for Ed25519 key pairs (security phase)
- DuckDB-WASM for local state (already in use)
- Three.js for rendering remote players (already in use)

## Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `js/multiplayer.js` | CREATE | Trystero room management, event send/receive, lobby logic |
| `js/renderer.js` | MODIFY | Add/update/remove remote player duck meshes |
| `js/game.js` | MODIFY | Broadcast events on move/shoot/crime, multiplayer menu |
| `js/db.js` | MODIFY | Add remote_players + connection_log tables |
| `index.html` | MODIFY | Add trystero to import map, lobby UI elements |
| `build.sh` | MODIFY | Include multiplayer.js in single-file build |

---

## Phase 1: Lobby & Connections

### 1a - Trystero setup (js/multiplayer.js)
- Add trystero/nostr to import map in index.html
- Create js/multiplayer.js:
  - joinRoom() / leaveRoom() with appId 'duck-theft-auto'
  - Room ID from passphrase (user enters a code)
  - makeAction for: 'move', 'shoot', 'crime', 'chat', 'world_sync', 'player_join'
  - onPeerJoin / onPeerLeave handlers
  - Track isHost flag (first player = host)
  - Export: hostGame(), joinGame(), sendMove(), sendShoot(), sendChat(), isMultiplayer()

### 1b - Lobby UI (index.html)
- Add to title screen (below character select, or as alternative flow):
  - "Host Game" button -> generates room code, shows lobby
  - "Join Game" button -> prompts for room code, connects
  - Lobby overlay: room code display, connected player list, "Start" button (host only)
- Multiplayer is optional - existing single-player flow unchanged

### 1c - DB tables (js/db.js)
```sql
CREATE TABLE remote_players (
  peer_id VARCHAR PRIMARY KEY,
  name VARCHAR,
  char_type VARCHAR,
  x INTEGER,
  y INTEGER,
  health INTEGER DEFAULT 100,
  wanted_level INTEGER DEFAULT 0,
  last_update TIMESTAMP DEFAULT now()
);

CREATE TABLE connection_log (
  ts TIMESTAMP DEFAULT now(),
  peer_id VARCHAR,
  remote_ip VARCHAR,
  event VARCHAR  -- 'joined', 'left', 'kicked'
);
```

---

## Phase 2: Game Sync

### 2a - Broadcast local player state (js/game.js)
- On every move, call sendMove({ x, y, name, char_type, health, wanted_level })
- On crimes/actions that change visible state, broadcast update
- Only broadcast if isMultiplayer() is true (zero overhead in single-player)

### 2b - Remote player rendering (js/renderer.js)
- New functions: spawnRemotePlayer(peerId, charType), updateRemotePlayer(peerId, x, y), removeRemotePlayer(peerId)
- Reuse duck mesh + applyCharacterSkin() for remote players
- Add name label above remote ducks (simple sprite text)
- Different colored name labels per player

### 2c - Host world sync
- When a new peer joins and host receives 'player_join':
  - Host sends full snapshot: { mapSeed, npcs: [...], time, shops, players }
  - Client receives snapshot, clears and rebuilds local DuckDB tables
  - Client spawns all existing remote players
- After initial sync, only deltas flow:
  - Host broadcasts: NPC state changes, time ticks, shop states
  - Clients broadcast: their own position and actions

---

## Phase 3: Interactions

### 3a - PvP combat
- Shooting checks proximity to remote players (reuse existing proximity logic)
- Attacker sends { action: 'shoot', target: peerId, damage: X } to host
- Host validates (proximity, cooldown, gun owned) and broadcasts damage
- Target's client applies damage locally
- WASTED overlay if killed by another player

### 3b - Shared world events
- Host broadcasts on:
  - NPC killed -> all clients remove NPC
  - Shop robbed -> all clients mark shop robbed
  - Police triggered -> all clients in area see police
  - Time advance -> all clients update clock
- Clients never modify world state directly, only request via host

### 3c - In-game chat
- makeAction('chat') sends { name, message }
- Messages appear in game log with player name prefix
- Simple text input (Enter to open, Enter to send, Esc to cancel)

---

## Phase 4: Security

### 4a - Event signing
- On first launch, generate Ed25519 keypair via Web Crypto API
- Store public key in localStorage, share with peers on connect
- Sign all outgoing events with private key
- Verify signature on all incoming events, reject invalid

### 4b - Anti-cheat
- Monotonic tick counter per peer (reject old/duplicate ticks)
- Host validates all actions (can't shoot without gun, can't teleport)
- Periodic state hash comparison between host and clients
- Desync detection -> request full resync from host

### 4c - Peer management
- Kick vote system (majority of players agree)
- Host can force-kick suspicious peers
- Connection logging with remote IPs (from RTCPeerConnection.getStats())
- Rate limiting on actions (prevent spam)

---

## Event Protocol

All events are JSON objects sent over WebRTC data channels:

```json
{ "type": "move", "x": 12, "y": 8, "name": "CJ", "char": "cj", "health": 85, "wanted": 2, "tick": 4501 }
{ "type": "shoot", "target": "peer-abc123", "gun": "pistol", "tick": 4502 }
{ "type": "crime", "crime": "rob_shop", "district": "Downtown", "tick": 4503 }
{ "type": "chat", "name": "CJ", "msg": "watch out cops!", "tick": 4504 }
{ "type": "world_sync", "seed": 42, "npcs": [...], "time": 14, "shops": [...] }
{ "type": "player_join", "name": "Tommy", "char": "tommy" }
{ "type": "player_leave", "peer": "peer-abc123" }
```

---

## Sync on Join Flow

1. New player selects character, enters room code, clicks "Join"
2. Trystero connects via WebRTC (Nostr signaling)
3. New player sends: { type: 'player_join', name, char }
4. Host receives, sends back: { type: 'world_sync', ... } with full state
5. Client applies world state to local DuckDB
6. Client renders all existing remote players
7. Host broadcasts to all others: new player joined
8. All clients spawn new player's duck
9. Game begins - deltas only from here

---

## Testing

- Open two browser tabs pointing to same local file or hosted URL
- Tab 1: Host Game -> get room code
- Tab 2: Join Game -> enter room code
- Verify: both players see each other's ducks on the map
- Verify: movement syncs in near-real-time
- Verify: host leaving triggers host migration or disconnect notice
