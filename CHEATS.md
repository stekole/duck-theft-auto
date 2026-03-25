# Duck Theft Auto — Cheat Codes

## How to Use

1. During gameplay, press **backtick (`)** to open the cheat input
2. Type the code and press **Enter**
3. Press **Escape** to cancel

Codes are case-insensitive.

## Active Cheat Codes

| Code | Effect |
|------|--------|
| `QUACKGOD` | 999 HP + Full Armor |
| `DUCKRICH` | +$1,000,000 |
| `QUACKBOOM` | Unlock ALL weapons (including Plasma Rifle, Minigun, etc.) |
| `QUACKCOPS` | Clear wanted level instantly, despawn all police |
| `QUACKTIME` | Skip 6 hours (admin-only time advance) |

## How to Add New Cheats

Cheats are AES-256-GCM encrypted. The cheat code itself IS the decryption key. Without the code, the encrypted blob in the source is unreadable.

### 1. Generate an encrypted blob

```bash
node tools/encrypt-cheat.mjs "YOURCODE" "javascript code here"
```

The JS code runs in the game context with access to:
- `conn` — DuckDB connection
- `q(sql)`, `q1(sql)`, `qv(sql)` — query helpers
- `log(msg, cls)` — event log
- `updateHUD()` — refresh HUD
- `spawnParticlesAtDuck(color, count, speed, life)` — visual effects
- `clearPoliceNPCs()`, `stopSiren()` — police control
- `GUN_LIST` — all gun definitions from constants
- `advanceTime(hours)`, `processWorldEvents()` — time control

### 2. Add the blob to game.js

Open `js/game.js`, find the `CHEAT_BLOBS` array, and add the new blob string.

### Example

```bash
node tools/encrypt-cheat.mjs "DUCKFLY" "await conn.query(\"UPDATE player SET cash=cash+50000\"); log('You found a briefcase! +\$50,000', 'c-magenta'); spawnParticlesAtDuck(0xffd700, 20, 3, 2); await updateHUD();"
```

Then paste the output into `CHEAT_BLOBS`:

```js
const CHEAT_BLOBS = [
  // ... existing blobs ...
  'paste-new-blob-here'
];
```

## Security Notes

- Cheat codes use PBKDF2 (100K iterations) + AES-256-GCM
- The encrypted blob cannot be decrypted without the exact code
- Someone reading source sees random base64 — meaningless without the passphrase
- This is NOT DRM-level security — a determined reverse-engineer could intercept the decrypted JS at runtime via DevTools. It's designed for easter eggs and fun, not for protecting secrets from skilled attackers.
