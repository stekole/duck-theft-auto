import {
  T, POI_DEFS, CITIES, GANGS, JOBS, CRIMES, GUNS, VEHICLES,
  DRUGS, RANK_THRESHOLDS, PERKS, ITEMS, MAP_SIZE, HEISTS
} from './constants.js';
import { currentMapGrid, setMapSeed } from './city.js';
import {
  duckGroup, gameActive, setGameActive, setDuckTarget, setDuckFacing,
  camDist, camHeight, camAngle, setCamDist, setCamHeight, setCamAngle,
  CAM_ZOOM_MIN, CAM_ZOOM_MAX, setCurrentGameHour,
  updateLighting, updatePlayerVehicle, renderMinimap,
  spawnParticlesAtDuck, spawnParticles, startSiren, stopSiren,
  buildCity3D, spawnNPCs,
  spawnPoliceNPC, clearPoliceNPCs, getPoliceNPCs, removePoliceNPC,
  getNearestNPC, getNearestPoliceNPC, killNPC, damagePoliceNPC,
  spawnMuzzleFlash, fireProjectile,
  applyCharacterSkin,
  getNearestNPCCar, removeNPCCar, getNearestPoliceCar,
  updateRemoteDuck, despawnRemoteDuck, getNearestRemoteDuck,
  getRemoteDucks, setNPCSeed, killNPCById,
  setPoliceAttackCallback, spawnPoliceNPCAt, killPoliceById
} from './renderer.js';
import {
  conn, exec, q, q1, qv, saveGame, logAction,
  initSchema, initPlayer, initWorld, loadCityMap, loadGameData, getSaveIndex, setLogFn
} from './db.js';
import {
  isMultiplayer, getIsHost, broadcastMove, broadcastShoot, broadcastChat,
  broadcastAction, broadcastWorldSync, setCallbacks, getPeers,
  getLocalPeerId, setCurrentCity
} from './multiplayer.js';

const $ = id => document.getElementById(id);

// HTML escape helper — prevents XSS via innerHTML
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Sanitize peer numeric input
function safeInt(v, min, max, fallback = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

// Per-peer cooldown map for incoming PvP shots (H2 security fix)
const peerShootTimestamps = new Map();

// NPC seed for deterministic spawning across multiplayer peers
let _npcSeedValue = Math.floor(Math.random() * 2147483647);
let _mpCityOverride = null; // set by worldSync so joiner uses host's city
const _activeBounties = new Map(); // peerId -> { amount, placedBy, placedByName }
let _lastAttackerPeerId = null;

// --------------------------------------------------------
//  EVENT LOG
// --------------------------------------------------------
const LOG_MAX = 100;
export function log(msg, cls = 'c-white') {
  const el = $('event-log');
  const div = document.createElement('div');
  div.className = 'log-entry ' + cls;
  div.textContent = msg;
  el.appendChild(div);
  // Remove oldest entries beyond limit
  while (el.childElementCount > LOG_MAX) {
    el.removeChild(el.firstChild);
  }
  el.scrollTop = el.scrollHeight;
}

// Inject log into db.js so saveGame can use it
setLogFn(log);

// --------------------------------------------------------
//  ENCRYPTED CHEAT CODE SYSTEM
//  Codes are AES-GCM encrypted — the cheat code IS the key.
//  Use: node tools/encrypt-cheat.mjs <CODE> <js-code>
// --------------------------------------------------------
const CHEAT_BLOBS = [
  'DPvFaprnmEcf54KgzruPMOd+axll5TjACZGWroyeYxZZC7qia52SOHXrlNhlqvl9gd8FAIGrt/KPmPdARGqc4UmqmoIg1avfmbd8Ja0doZAtCtPK+ZxSQGt/DFijpvRhAQElSOSRRu2eTXVRFkFBPxraFOoETY9DTEhXWa7BgtRdQVvQPnEUcl9jKMNkpyYjwAppYOT1mBx83TN44Lg=',
  '3JBQt9Rdnwp3TzxY/CjNk7HrxhxxQYTZnSL/mWWM+1REylDPs/V3A74YZHMBb/dS8q0rkyQlWMQK3Ra5Dr1Lhcl/6dKAz93WNRjszicXmvrbbImkvUnt7ZlHLwnRvAUIBqwO3XW5XfuvngZGTIAzrIBYsW0fF3/p4Y8BWQSTPv+QT+dFjyHWifOJC82GMV/2t3LgumpgbhuzgDZPYSJL0d36RzGYgvpdljGdIrL4PUG4zH4s30Mj0F4Zug==',
  '+/Gl2Utg7YsPETQQdIflp8LEHsMLBAD0HJwyWZcFr4RsvoMcCv1dnVp78gpjY3xgnn7ZxDtDWOwIVKX9RfFZYNZlRMM95fk26j+iKH3ImcNW9536XMHW9XoUFA6RbLhs78ddQ3godorcZjwKnruipX/VfPv8ou4BFeblKQgfv7r0CnySTts3A5hmPYu91TmCJaAB3MkIxIzWWQL5mLB39QamsDIpAmR8irOBlotqxGsHkTj4UlGMY41QCxKf4KOrRXhiI5ri4/1G7oB/8gjdbmRCq400Z5Iwautbr9/lEPhHV7Nro4npkIBxS7mG91Sqrjflq2CFxPOw09QzLVDMM43UHBVMZl2dncgSn/aoHBm4HHhPkaFHEjHCFFCwlcqa+SD7z8pgiET8rYEgCbePH8dhE6U=',
  'GJ5l5S8nU4oVAtPHrgGPn34qSjB8sLBe8FlFgsIfc2nThNgBEOzouDnY/SQpgHAu/F4WwrRUr6rG3Wieaax691WYM3czhzxTjl7EvO/WiiX2gekQgoMfMZoWRnzE73yg+8Ob+NZNwJuNaY8iZ4M+KUSkbnm9OonhWotCGYieLDkkjsBuvb7c5jN30wMejJ9nSYVJYne7f8pvN7r2vjQk9/HCpam2cdhm1R8D6yjEdimC0PjO3Y7gywzkWNXuD8WWnfCl9aD2OdHqYEwvMP1cThbnIiJwmM8HSHQ=',
  'TWOlyP1ZUbKcumHd2U1IFISkcF24pt9Gr+88nnAPEIQXYYMJ91hxbfUZHoz/izpoFgAVUPeacvnNCRf2tqa+iahT5cf/js5emgbcIxglwtm8ulRmwAjHJc+3KlcYRw3umdxIANpA+UjGF96vg4Z63TiOteq3otGOq6/qXJ0FbwIEcOKPFiDxDk36rFA='
];

async function _deriveCheatKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('duck-theft-auto-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
}

async function _tryCheatCode(code) {
  const upper = code.toUpperCase().trim();
  if (!upper) return false;
  const key = await _deriveCheatKey(upper);
  for (const blob of CHEAT_BLOBS) {
    try {
      const raw = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
      const iv = raw.slice(0, 12);
      const ciphertext = raw.slice(12);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      const js = new TextDecoder().decode(decrypted);
      // Execute the decrypted code in the game context
      const fn = new Function('conn', 'exec', 'q', 'q1', 'qv', 'logAction', 'log', 'updateHUD', 'spawnParticlesAtDuck',
        'clearPoliceNPCs', 'stopSiren', 'GUNS', 'advanceTime', 'processWorldEvents',
        `return (async () => { ${js} })();`);
      await fn(conn, exec, q, q1, qv, logAction, log, updateHUD, spawnParticlesAtDuck,
        clearPoliceNPCs, stopSiren, GUNS, advanceTime, processWorldEvents);
      return true;
    } catch (_) { /* wrong key for this blob, try next */ }
  }
  return false;
}

function _openCheatInput() {
  let existing = $('cheat-input');
  if (existing) { existing.remove(); return; }
  const input = document.createElement('input');
  input.id = 'cheat-input';
  input.type = 'text';
  input.maxLength = 30;
  input.placeholder = 'Enter cheat code...';
  input.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:200;background:#111;border:2px solid #ff00ff;color:#ff00ff;font-family:"Courier New",monospace;font-size:16px;padding:10px 16px;width:280px;text-align:center;text-transform:uppercase;outline:none;letter-spacing:2px;';
  document.body.appendChild(input);
  input.focus();
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { input.remove(); return; }
    if (e.key === 'Enter') {
      const code = input.value;
      input.remove();
      if (!code.trim()) return;
      log(`Trying code: ${'*'.repeat(code.length)}...`, 'c-magenta');
      const ok = await _tryCheatCode(code);
      if (!ok) {
        log('Invalid code.', 'c-red');
      }
    }
  });
}

// Wire up police attack callback from renderer
setPoliceAttackCallback(handlePoliceAttack);

// Wire up multiplayer callbacks
setCallbacks({
  logFn: (msg) => log(msg, 'c-cyan'),
  onRemoteMove: (peerId, data) => {
    updateRemoteDuck(peerId, data.x, data.y, data);
  },
  onPeerJoin: async (peerId, data) => {
    // Host sends world state to new peer
    if (getIsHost() && conn) {
      // Wait until game is active (tables exist) before sending world sync
      const waitForGame = () => new Promise(resolve => {
        if (gameActive) return resolve();
        const iv = setInterval(() => { if (gameActive) { clearInterval(iv); resolve(); } }, 200);
        setTimeout(() => { clearInterval(iv); resolve(); }, 10000); // timeout after 10s
      });
      await waitForGame();
      try {
        const p = await q1('SELECT * FROM player');
        const clk = await q1('SELECT * FROM game_clock');
        const worldData = {
          city: p.city,
          day: clk.day,
          hour: clk.hour,
          npcSeed: _npcSeedValue,
          hostPlayer: { name: p.name, char: p.char_type, x: p.x, y: p.y, health: p.health, wanted: p.wanted_level }
        };
        // Include all currently connected peers' positions
        const peerPositions = {};
        for (const [pid, info] of getPeers()) {
          if (pid !== peerId) {
            peerPositions[pid] = { name: info.name, char: info.char, x: info.x || 0, y: info.y || 0 };
          }
        }
        worldData.peers = peerPositions;
        broadcastWorldSync(worldData, peerId);
        log(`Sent world sync to ${data.name || peerId.slice(0, 8)}`, 'c-cyan');
      } catch (e) {
        console.error('World sync failed:', e);
      }
    }
  },
  onPeerLeave: (peerId) => {
    despawnRemoteDuck(peerId);
  },
  onRemoteChat: (peerId, data) => {
    const name = getPeers().get(peerId)?.name || peerId.slice(0, 8);
    log(`[${name}] ${data.msg}`, 'c-yellow');
  },
  onRemoteAction: (peerId, data) => {
    // Host broadcast game_start → joiner auto-starts or re-syncs
    if (data.action === 'game_start' && !getIsHost()) {
      if (data.npcSeed != null) {
        _npcSeedValue = data.npcSeed;
        setNPCSeed(data.npcSeed);
        setMapSeed(data.npcSeed);
      }
      if (!gameActive) {
        log('Host started the game!', 'c-cyan');
        if (data.city) _mpCityOverride = data.city;
        window.startNewGame().then(() => { _mpCityOverride = null; });
      }
      return;
    }
    // Display remote player actions in the log
    const name = getPeers().get(peerId)?.name || peerId.slice(0, 8);
    switch (data.action) {
      case 'crime': log(`${name} committed ${data.crime || 'a crime'}!`, 'c-red'); break;
      case 'rob': log(`${name} robbed ${data.place || 'a location'}!`, 'c-red'); break;
      case 'police': log(`${name} has cops on them!`, 'c-yellow'); break;
      case 'death': {
        log(`${name} was WASTED!`, 'c-red');
        const rd = getRemoteDucks().get(peerId);
        if (rd) spawnParticles(rd.group.position.x, rd.group.position.z, 0xff0000, 25, 2, 2);
        // Check if WE killed them and there's a bounty
        const localId = getLocalPeerId();
        if (data.killedBy === localId && _activeBounties.has(peerId)) {
          const bounty = _activeBounties.get(peerId);
          _activeBounties.delete(peerId);
          (async () => {
            await exec(`UPDATE player SET cash=cash+${bounty.amount}`);
            log(`BOUNTY COLLECTED: $${bounty.amount.toLocaleString()} for killing ${name}!`, 'c-gold');
            spawnParticlesAtDuck(0xffd700, 20, 2, 2);
            broadcastAction({ action: 'bounty_claimed', targetId: peerId, targetName: name, amount: bounty.amount });
            await updateHUD();
          })();
        }
        break;
      }
      case 'gang_join': log(`${name} joined your gang: ${data.gang}!`, 'c-magenta'); break;
      case 'bounty_placed': {
        if (data.targetId && data.amount > 0) {
          _activeBounties.set(data.targetId, { amount: data.amount, placedBy: peerId, placedByName: name });
          const targetName = data.targetId === getLocalPeerId() ? 'YOU' : (getPeers().get(data.targetId)?.name || 'someone');
          log(`BOUNTY: ${name} placed $${data.amount.toLocaleString()} on ${targetName}!`, 'c-red');
          if (data.targetId === getLocalPeerId()) {
            log('There\'s a price on your head! Watch your back!', 'c-red');
          }
        }
        break;
      }
      case 'bounty_claimed': {
        log(`BOUNTY CLAIMED: ${name} collected $${data.amount?.toLocaleString() || '?'} for killing ${data.targetName || 'someone'}!`, 'c-gold');
        _activeBounties.delete(data.targetId);
        break;
      }
      case 'race_challenge': {
        const buyIn = safeInt(data.buyIn, 0, 100000);
        if (buyIn <= 0) break;
        log(`${name} challenges everyone to a STREET RACE! $${buyIn} buy-in — 10 seconds to join!`, 'c-yellow');
        // Auto-prompt to join if we have a vehicle and cash
        (async () => {
          const hv = await qv(`SELECT COUNT(*) FROM vehicles WHERE stored=0`);
          const cash = await qv('SELECT cash FROM player');
          if (hv && cash >= buyIn) {
            showSubMenu(`RACE CHALLENGE from ${esc(name)}! $${buyIn} buy-in`, [
              { label: `Join Race ($${buyIn})`, action: async () => {
                await exec(`UPDATE player SET cash=cash-${buyIn}`);
                broadcastAction({ action: 'race_accept', name: (await q1('SELECT name FROM player')).name, buyIn });
                log(`Joined the race! $${buyIn} on the line.`, 'c-cyan');
                hideSubMenu(); await updateHUD();
              }},
              { label: 'Pass', action: () => { hideSubMenu(); showMainActions(); }}
            ]);
            // Auto-close after 10s
            setTimeout(() => { if ($('sub-menu').style.display !== 'none') { hideSubMenu(); showMainActions(); } }, 10000);
          }
        })();
        break;
      }
      case 'race_accept': {
        log(`${name} joined the race!`, 'c-cyan');
        _raceAcceptors.push({ name, peerId });
        break;
      }
      case 'race_result': {
        log(`Race over! Winner: ${data.winner} (pot: $${data.pot})`, data.winner === name ? 'c-green' : 'c-yellow');
        break;
      }
      case 'npc_kill': {
        log(`${name} killed an NPC nearby!`, 'c-gray');
        if (data.npcId != null) {
          const pos = killNPCById(data.npcId);
          if (pos) spawnParticles(pos.x, pos.z, 0xff2222, 10, 1.5, 1);
        }
        break;
      }
      case 'police_spawn': {
        if (data.copId != null) {
          spawnPoliceNPCAt(data.x, data.z, data.inVehicle, data.copId);
          if (!_policeActive) { startSiren(); _policeActive = true; }
        }
        break;
      }
      case 'cop_kill': {
        if (data.copId != null) {
          const pos = killPoliceById(data.copId);
          if (pos) spawnParticles(pos.x, pos.z, 0xff2222, 12, 1.5, 1);
        }
        break;
      }
      case 'police_clear': {
        clearPoliceNPCs();
        stopSiren();
        _policeActive = false;
        break;
      }
      case 'time_sync': {
        if (data.day != null && data.hour != null && gameActive) {
          exec(`UPDATE game_clock SET day=${parseInt(data.day)}, hour=${parseInt(data.hour)}`);
          setCurrentGameHour(parseInt(data.hour));
          updateLighting(parseInt(data.hour));
          $('hud-day').textContent = data.day;
          $('hud-hour').textContent = String(parseInt(data.hour)).padStart(2, '0');
        }
        break;
      }
      default: log(`${name}: ${data.action}`, 'c-gray');
    }
  },
  onRemoteShoot: async (peerId, data) => {
    // Check if we are the target
    const localId = getLocalPeerId();
    // Match by localId, or accept if we're the only other peer (ID may not be known to self)
    const isTargeted = data.target === localId || (!localId && data.target && data.target !== peerId);
    console.log('[PvP] Shot received:', { target: data.target, localId, from: peerId, isTargeted });
    if (isTargeted) {
      // Dead player guard — don't apply damage during respawn
      const preCheck = await qv('SELECT health FROM player');
      if (preCheck <= 0) return;

      // H2: Per-peer cooldown — reject shots faster than 200ms
      const now = Date.now();
      const lastShot = peerShootTimestamps.get(peerId) || 0;
      if (now - lastShot < 200) return;
      peerShootTimestamps.set(peerId, now);

      // H2: Range check — reject if Manhattan distance > 8
      const peerInfo = getPeers().get(peerId);
      if (peerInfo && peerInfo.x !== undefined) {
        const p = await q1('SELECT x, y FROM player');
        const dist = Math.abs(peerInfo.x - p.x) + Math.abs(peerInfo.y - p.y);
        if (dist > 8) return;
      }

      // H1: Sanitize damage — must be positive integer, clamped 1–50
      const dmg = safeInt(data.damage, 1, 50, 15);
      // Armor absorbs damage first, remainder goes to health
      const p = await q1('SELECT health, armor FROM player');
      const armorAbsorb = Math.min(p.armor, dmg);
      const healthDmg = dmg - armorAbsorb;
      await exec(`UPDATE player SET health=GREATEST(0,health-${healthDmg}), armor=GREATEST(0,armor-${armorAbsorb})`);
      spawnParticlesAtDuck(0xff2222, 10, 1.5, 1);
      const shooterName = getPeers().get(peerId)?.name || peerId.slice(0, 8);
      log(`${shooterName} shot you! -${dmg} DMG${armorAbsorb > 0 ? ` (${armorAbsorb} absorbed by armor)` : ''}`, 'c-red');
      _lastAttackerPeerId = peerId;
      await checkDeath();
      await updateHUD();
    } else {
      const shooterName = getPeers().get(peerId)?.name || peerId.slice(0, 8);
      log(`${shooterName} opened fire!`, 'c-red');
    }
  },
  onWorldSyncReceived: async (peerId, data) => {
    // Client receives world state from host
    if (getIsHost()) return; // host doesn't apply sync from others
    log(`Received world sync — ${data.city}, Day ${data.day}`, 'c-cyan');

    // Apply seeds from host so map and NPCs are identical
    if (data.npcSeed != null) {
      _npcSeedValue = data.npcSeed;
      setNPCSeed(data.npcSeed);
      setMapSeed(data.npcSeed);
    }

    // Override city so joiner plays on same map as host
    if (data.city) _mpCityOverride = data.city;

    // Auto-start the client's game if not already running
    if (!gameActive) {
      await window.startNewGame();
      _mpCityOverride = null;
    }

    // Sync time from host (after game started so tables exist)
    if (data.day != null && data.hour != null && gameActive) {
      await exec(`UPDATE game_clock SET day=${parseInt(data.day)}, hour=${parseInt(data.hour)}`);
      setCurrentGameHour(parseInt(data.hour));
      updateLighting(parseInt(data.hour));
    }

    // Spawn host's duck
    if (data.hostPlayer) {
      const hp = data.hostPlayer;
      updateRemoteDuck(peerId, hp.x, hp.y, { name: hp.name, char: hp.char });
    }

    // Spawn other peers' ducks
    if (data.peers) {
      for (const [pid, info] of Object.entries(data.peers)) {
        updateRemoteDuck(pid, info.x, info.y, info);
      }
    }
  }
});

// --------------------------------------------------------
//  ACTIVITY STATUS
// --------------------------------------------------------
let statusTimer = null;
function setStatus(msg, duration = 0) {
  $('hud-status').textContent = msg;
  $('hud-status').className = 'c-yellow';
  if (statusTimer) clearTimeout(statusTimer);
  if (duration > 0) {
    statusTimer = setTimeout(() => {
      $('hud-status').textContent = 'Idle';
      $('hud-status').className = 'c-cyan';
      statusTimer = null;
    }, duration);
  }
}
function clearStatus() {
  if (statusTimer) clearTimeout(statusTimer);
  $('hud-status').textContent = 'Idle';
  $('hud-status').className = 'c-cyan';
  statusTimer = null;
}

// --------------------------------------------------------
//  GAME CLOCK
// --------------------------------------------------------
async function advanceTime(hours) {
  try {
    const clk = await q1('SELECT * FROM game_clock');
    if (!clk) { log('ERROR: No game clock found!', 'c-red'); return; }
    const oldDay = clk.day;
    const oldHour = clk.hour;
    let h = clk.hour + hours;
    let d = clk.day;
    const daysAdvanced = [];
    while (h >= 24) {
      h -= 24;
      d++;
      daysAdvanced.push(d);
      try { await dailyPayout(); } catch (e) { log('Daily payout error: ' + e.message, 'c-red'); }
      try { await decayHeat(); } catch (e) { /* ignore */ }
      try { await pruneWorldEvents(); } catch (e) { /* ignore */ }
    }
    await exec(`UPDATE game_clock SET day=${d}, hour=${h}`);
    if (daysAdvanced.length > 0) {
      log(`════════════ DAY ${d} ════════════`, 'c-gold');
      log(`[Day ${oldDay} ${String(oldHour).padStart(2,'0')}:00 → Day ${d} ${String(h).padStart(2,'0')}:00] (${hours}h passed)`, 'c-gray');
    } else if (hours > 0) {
      log(`[${String(oldHour).padStart(2,'0')}:00 → ${String(h).padStart(2,'0')}:00] (${hours}h passed)`, 'c-gray');
    }
    // Sync time across multiplayer peers
    if (isMultiplayer()) broadcastAction({ action: 'time_sync', day: d, hour: h });
  } catch (e) {
    log('Time advance error: ' + e.message, 'c-red');
    console.error('advanceTime error:', e);
  }
}

async function dailyPayout() {
  const p = await q1('SELECT name, health, wanted_level, gang FROM player');
  if (!p) return;
  // Passive heal overnight
  if (p.health < 100) {
    const heal = Math.min(10, 100 - p.health);
    await exec(`UPDATE player SET health = LEAST(100, health + ${heal})`);
    log(`Rested overnight: +${heal} HP`, 'c-green');
  }
  // Wanted level decays slightly each day
  if (p.wanted_level > 0) {
    await exec(`UPDATE player SET wanted_level = GREATEST(0, wanted_level - 1)`);
    log('Heat dies down overnight. -1 Wanted.', 'c-green');
  }
  if (!p.gang) return;
  const safeGang = p.gang.replace(/'/g, "''");
  const tCount = (await qv(`SELECT COUNT(*) FROM territories WHERE owner='${safeGang}'`)) || 0;
  const tIncome = tCount * 150;
  // Allied gangs share 10% of their territory income
  const alliedGangs = await q(`SELECT gang FROM gang_relations WHERE relation='Allied'`);
  let allyIncome = 0;
  for (const ag of alliedGangs) {
    const allyTerr = (await qv(`SELECT COUNT(*) FROM territories WHERE owner='${ag.gang.replace(/'/g,"''")}'`)) || 0;
    allyIncome += Math.floor(allyTerr * 150 * 0.1);
  }
  const bIncome = Number((await qv(`SELECT COALESCE(SUM(daily_income),0) FROM businesses`)) || 0);
  const smugLevel = Number((await qv(`SELECT level FROM gang_upgrades WHERE name='smuggling_routes'`)) || 0);
  const smugBonus = smugLevel * 100;
  const upkeep = Number((await qv(`SELECT COALESCE(SUM(upkeep),0) FROM recruits`)) || 0);
  const net = tIncome + allyIncome + bIncome + smugBonus - upkeep;
  if (net !== 0) {
    await exec(`UPDATE player SET cash = cash + ${net}`);
  }
  const allyStr = allyIncome > 0 ? ` + Alliance $${allyIncome}` : '';
  log(`Daily income: Territory $${tIncome}${allyStr} + Business $${bIncome} + Smuggling $${smugBonus} - Upkeep $${upkeep} = Net $${net}`, net >= 0 ? 'c-gold' : 'c-red');
}

async function decayHeat() { await exec(`UPDATE district_heat SET heat = GREATEST(0, heat - 1)`); }

async function pruneWorldEvents() {
  const count = await qv('SELECT COUNT(*) FROM world_events');
  if (count > 500) {
    await exec(`DELETE FROM world_events WHERE id IN (SELECT id FROM world_events ORDER BY id ASC LIMIT ${count - 500})`);
  }
}

// --------------------------------------------------------
//  RANDOM HELPERS
// --------------------------------------------------------
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function chance(pct) { return Math.random() * 100 < pct; }

function seededRand(seed, min, max) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  const r = x - Math.floor(x);
  return Math.floor(r * (max - min + 1)) + min;
}

// --------------------------------------------------------
//  HUD UPDATE
// --------------------------------------------------------
export async function updateHUD() {
  const p = await q1('SELECT * FROM player');
  const clk = await q1('SELECT * FROM game_clock');
  if (!p || !clk) return;

  $('hud-day').textContent = clk.day;
  $('hud-hour').textContent = String(clk.hour).padStart(2, '0');
  $('hud-name').textContent = p.name;
  $('hud-location').textContent = `${p.city} - ${p.district}`;
  $('hud-cash').textContent = `$${p.cash.toLocaleString()}`;

  $('hud-health-bar').style.width = p.health + '%';
  $('hud-health-bar').style.background = p.health > 60 ? 'linear-gradient(90deg, #338833, #44ff44)' :
    p.health > 30 ? 'linear-gradient(90deg, #888833, #ffcc00)' : 'linear-gradient(90deg, #883333, #ff4444)';
  $('hud-health-txt').textContent = p.health;

  $('hud-armor-bar').style.width = p.armor + '%';
  $('hud-armor-txt').textContent = p.armor;

  const stars = $('hud-wanted').querySelectorAll('.star');
  stars.forEach((s, i) => s.classList.toggle('active', i < p.wanted_level));

  $('hud-gang').textContent = p.gang || 'None';
  $('hud-rank').textContent = p.gang_rank || '-';
  $('hud-respect').textContent = p.respect;

  const heat = await qv(`SELECT heat FROM district_heat WHERE district='${p.district.replace(/'/g,"''")}' AND city='${p.city.replace(/'/g,"''")}'`);
  $('hud-heat').textContent = heat || 0;

  setDuckTarget(p.x + 0.5, p.y + 0.5);
  setCurrentGameHour(clk.hour);
  updateLighting(clk.hour);

  const activeVehicle = await q1(`SELECT name FROM vehicles WHERE stored=0 LIMIT 1`);
  updatePlayerVehicle(!!activeVehicle, activeVehicle?.name);

  renderMinimap(p.x, p.y);
}

// --------------------------------------------------------
//  POI DETECTION
// --------------------------------------------------------
async function checkPOI() {
  const p = await q1('SELECT x,y FROM player');
  if (!currentMapGrid) return;
  const tile = currentMapGrid[p.y][p.x];
  const poi = POI_DEFS[tile];
  const indicator = $('poi-indicator');
  if (poi) {
    indicator.style.display = 'block';
    indicator.textContent = `Press ENTER to visit: ${poi.name}`;
  } else {
    indicator.style.display = 'none';
  }
}

async function enterPOI() {
  const p = await q1('SELECT x,y FROM player');
  if (!currentMapGrid) return;
  const tile = currentMapGrid[p.y][p.x];
  const poi = POI_DEFS[tile];
  if (poi) {
    const menuFn = menuFunctions[poi.menu];
    if (menuFn) menuFn();
    return;
  }
  // No POI — try NPC interaction
  const npc = getNearestNPC(2);
  if (npc) {
    await interactNPC(npc);
    return;
  }
  // Try police car interaction
  const policeCar = getNearestPoliceCar(2);
  if (policeCar) {
    await carjackPoliceCar(policeCar);
    return;
  }
  // Try NPC car interaction
  const npcCar = getNearestNPCCar(2);
  if (npcCar) {
    await carjackNPCCar(npcCar);
  }
}

async function carjackNPCCar(car) {
  const p = await q1('SELECT * FROM player');
  const drivingSkill = await getSkill('driving');
  const stealthSkill = await getSkill('stealth');
  let successChance = 40 + drivingSkill * 4 + stealthSkill * 3;
  successChance = Math.min(successChance, 90);
  showSubMenu(`Steal ${car.name}?`, [
    { label: `Jack it! (${successChance}% chance)`, action: async () => {
      setStatus(`Carjacking ${car.name}...`);
      if (chance(successChance)) {
        // Check if already owned
        const exists = await qv(`SELECT COUNT(*) FROM vehicles WHERE name='${car.name.replace(/'/g,"''")}'`);
        if (!exists) {
          await exec(`INSERT INTO vehicles VALUES ('${car.name.replace(/'/g,"''")}',0)`);
        }
        removeNPCCar(car);
        await exec(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`);
        log(`Jacked a ${car.name}! +1 Wanted.`, 'c-green');
        spawnParticlesAtDuck(0x44ff44, 12, 2, 1.5);
        await maybeSkillUp('driving');
      } else {
        const dmg = rand(10, 30);
        await exec(`UPDATE player SET health=GREATEST(0,health-${dmg}), wanted_level=LEAST(5,wanted_level+1)`);
        log(`Failed to steal ${car.name}! The owner fought back. -${dmg} HP, +1 Wanted.`, 'c-red');
        spawnParticlesAtDuck(0xff2222, 10, 1.5, 1);
        await checkDeath();
      }
      clearStatus();
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Walk away', action: () => { hideSubMenu(); showMainActions(); }}
  ]);
}

async function carjackPoliceCar(cop) {
  const drivingSkill = await getSkill('driving');
  const stealthSkill = await getSkill('stealth');
  let successChance = 25 + drivingSkill * 3 + stealthSkill * 2;
  successChance = Math.min(successChance, 75);
  showSubMenu('Steal Police Cruiser?', [
    { label: `Jack it! (${successChance}% chance)`, action: async () => {
      setStatus('Stealing police car...');
      if (chance(successChance)) {
        const exists = await qv(`SELECT COUNT(*) FROM vehicles WHERE name='Police Cruiser'`);
        if (!exists) {
          await exec(`INSERT INTO vehicles VALUES ('Police Cruiser',0)`);
        }
        cop.alive = false;
        removePoliceNPC(cop);
        if (isMultiplayer()) broadcastAction({ action: 'cop_kill', copId: cop.id });
        await exec(`UPDATE player SET wanted_level=LEAST(5,wanted_level+2)`);
        log('Stole a police cruiser! +2 Wanted!', 'c-green');
        spawnParticlesAtDuck(0x4444ff, 15, 2, 1.5);
        await maybeSkillUp('driving');
      } else {
        const dmg = rand(15, 40);
        await exec(`UPDATE player SET health=GREATEST(0,health-${dmg}), wanted_level=LEAST(5,wanted_level+2)`);
        log(`Failed! The cop shot you! -${dmg} HP, +2 Wanted.`, 'c-red');
        spawnParticlesAtDuck(0xff2222, 10, 1.5, 1);
        await checkDeath();
      }
      clearStatus();
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Walk away', action: () => { hideSubMenu(); showMainActions(); }}
  ]);
}

async function interactNPC(npc) {
  const clk = await q1('SELECT hour FROM game_clock');
  const isNight = clk.hour < 5 || clk.hour > 21;
  const drugs = await q('SELECT * FROM drugs WHERE qty > 0');
  const options = [];

  // Sell drugs to NPC
  if (drugs.length > 0) {
    for (const d of drugs) {
      const sellPrice = rand(Math.floor(d.avg_price * 0.8), Math.floor(d.avg_price * 2.5));
      options.push({
        label: `Sell ${d.name} ($${sellPrice}) [${d.qty} owned]`,
        action: async () => {
          // NPC may fight you instead of buying
          if (chance(isNight ? 30 : 10)) {
            const dmg = rand(10, 25);
            await exec(`UPDATE player SET health=GREATEST(0,health-${dmg})`);
            log(`The buyer turned on you! -${dmg} HP`, 'c-red');
            spawnParticlesAtDuck(0xff2222, 10, 1.5, 1);
            await checkDeath();
          } else {
            await exec(`UPDATE player SET cash=cash+${sellPrice}`);
            await exec(`UPDATE drugs SET qty=qty-1 WHERE name='${d.name}'`);
            await exec(`DELETE FROM drugs WHERE qty <= 0`);
            log(`Sold ${d.name} to a stranger for $${sellPrice}.`, 'c-green');
            if (chance(20)) {
              await exec(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`);
              log('A narc spotted the deal! Cops are coming!', 'c-red');
              await checkPolice();
            }
            await maybeSkillUp('dealing');
          }
          hideSubMenu(); await updateHUD(); showMainActions();
        }
      });
    }
  }

  // Night hostile NPC may fight
  if (isNight && npc.hostile) {
    options.push({
      label: 'This person looks aggressive...',
      action: async () => {
        const dmg = rand(15, 35);
        await exec(`UPDATE player SET health=GREATEST(0,health-${dmg})`);
        const pos = killNPC(npc);
        spawnParticles(pos.x, pos.z, 0xff4444, 8, 1.5, 1);
        log(`Jumped by a thug! -${dmg} HP`, 'c-red');
        if (isMultiplayer()) broadcastAction({ action: 'npc_kill', npcId: pos.id });
        await checkDeath();
        hideSubMenu(); await updateHUD(); showMainActions();
      }
    });
  }

  if (options.length === 0) {
    log('Nothing to do with this person.', 'c-gray');
    return;
  }
  showSubMenu(isNight ? 'Shady Encounter' : 'Street Deal', options);
}

// --------------------------------------------------------
//  POLICE SYSTEM — Persistent zombie-style cops
// --------------------------------------------------------
let _policeActive = false; // tracks if police are currently on the map
let _lastPoliceSpawnCheck = 0;

// Update police presence based on wanted level + district heat
async function updatePolicePresence() {
  // In multiplayer, only host spawns police and broadcasts to clients
  if (isMultiplayer() && !getIsHost()) return;

  const p = await q1('SELECT wanted_level, district, city FROM player');
  const wanted = p.wanted_level;
  const currentCops = getPoliceNPCs().filter(c => c.alive).length;

  if (wanted <= 0) {
    if (currentCops > 0) {
      clearPoliceNPCs();
      if (isMultiplayer()) broadcastAction({ action: 'police_clear' });
      stopSiren();
      _policeActive = false;
      setStatus('Idle');
    }
    return;
  }

  // District heat adds bonus cops: +1 at heat 5, +2 at heat 10+
  const heat = (await qv(`SELECT heat FROM district_heat WHERE district='${p.district.replace(/'/g,"''")}' AND city='${p.city.replace(/'/g,"''")}'`)) || 0;
  const heatBonus = heat >= 10 ? 2 : heat >= 5 ? 1 : 0;
  // Target cop count based on wanted level: 1/2/3/4/6 + heat bonus
  const targetCops = Math.min(8, (wanted <= 2 ? wanted : wanted <= 4 ? wanted + 1 : 6) + heatBonus);

  if (currentCops < targetCops) {
    const now = Date.now();
    if (now - _lastPoliceSpawnCheck > 3000) { // spawn new cops every 3s max
      _lastPoliceSpawnCheck = now;
      const toSpawn = Math.min(2, targetCops - currentCops);
      for (let i = 0; i < toSpawn; i++) {
        // Wanted 4+: spawn cops in patrol cars (faster, tougher)
        const useVehicle = wanted >= 4 && Math.random() < 0.6;
        const cop = spawnPoliceNPC(duckGroup.position.x, duckGroup.position.z, useVehicle);
        if (isMultiplayer()) {
          broadcastAction({ action: 'police_spawn', x: cop.group.position.x, z: cop.group.position.z, inVehicle: useVehicle, copId: cop.id });
        }
      }
      if (!_policeActive) {
        startSiren();
        _policeActive = true;
        log('Cops are on you! Run or fight! (Space/F to shoot)', 'c-red');
        setStatus('WANTED');
      }
    }
  }
}

// Periodically spawn new cops while wanted (even if not moving)
let _policePresenceInterval = null;
function startPolicePresenceLoop() {
  if (_policePresenceInterval) return;
  _policePresenceInterval = setInterval(async () => {
    if (!gameActive) return;
    await updatePolicePresence();
  }, 4000);
}

// Called by renderer when a cop attacks the player
let _policeAttackCooldown = false;
function handlePoliceAttack(type, cop, dist) {
  if (_policeAttackCooldown) return;
  _policeAttackCooldown = true;
  setTimeout(() => _policeAttackCooldown = false, 300);

  (async () => {
    if (type === 'melee') {
      // Cops beating the player on contact
      const dmg = rand(3, 8);
      const p = await q1('SELECT armor FROM player');
      const armorAbsorb = Math.min(p.armor, dmg);
      const healthDmg = dmg - armorAbsorb;
      await exec(`UPDATE player SET health=GREATEST(0,health-${healthDmg}), armor=GREATEST(0,armor-${armorAbsorb})`);
      spawnParticlesAtDuck(0x4444ff, 4, 1, 0.5);
      await checkDeath();
      await updateHUD();
    } else if (type === 'shoot') {
      // Cop bullet — misses most of the time at range, more accurate up close
      const hitChance = dist < 3 ? 40 : dist < 5 ? 25 : 15;
      if (chance(hitChance)) {
        const dmg = rand(5, 12);
        const p = await q1('SELECT armor FROM player');
        const armorAbsorb = Math.min(p.armor, dmg);
        const healthDmg = dmg - armorAbsorb;
        await exec(`UPDATE player SET health=GREATEST(0,health-${healthDmg}), armor=GREATEST(0,armor-${armorAbsorb})`);
        spawnParticlesAtDuck(0xff2222, 6, 1.2, 0.8);
        log(`Police shot you! -${dmg} DMG${armorAbsorb > 0 ? ` (${armorAbsorb} absorbed)` : ''}`, 'c-red');
        await checkDeath();
        await updateHUD();
      }
    }
  })();
}

// Legacy compatibility functions
async function checkPolice() {
  await updatePolicePresence();
}

async function checkPoliceOnMove() {
  await updatePolicePresence();
}

async function checkNightAttack() {
  const clk = await q1('SELECT hour FROM game_clock');
  const isNight = clk.hour < 5 || clk.hour > 21;
  if (!isNight) return;
  const npc = getNearestNPC(3);
  if (!npc || !npc.hostile) return;
  if (!chance(8)) return;
  const dmg = rand(5, 20);
  await exec(`UPDATE player SET health=GREATEST(0,health-${dmg})`);
  const pos = killNPC(npc);
  spawnParticles(pos.x, pos.z, 0xff4444, 8, 1.5, 1);
  log(`A thug attacked you in the dark! -${dmg} HP`, 'c-red');
  if (isMultiplayer()) broadcastAction({ action: 'npc_kill', npcId: pos.id });
  await checkDeath();
  await updateHUD();
}

// --------------------------------------------------------
//  DEATH CHECK
// --------------------------------------------------------
async function checkDeath() {
  const health = await qv('SELECT health FROM player');
  if (health <= 0) {
    const respLoss = rand(25, 50);
    // Stop any active police
    stopSiren(); clearPoliceNPCs(); _policeActive = false; clearStatus();

    // Dramatic WASTED screen flash
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(255,0,0,0.6);z-index:100;display:flex;align-items:center;justify-content:center;pointer-events:none;transition:opacity 2.5s;';
    overlay.innerHTML = '<div style="color:#fff;font-size:64px;font-weight:bold;text-shadow:0 0 30px #ff0000,0 0 60px #ff0000;font-family:Impact,sans-serif;letter-spacing:12px">WASTED</div>';
    document.body.appendChild(overlay);

    await exec(`UPDATE player SET health = 100, cash = GREATEST(0, cash - 200), respect = GREATEST(0, respect - ${respLoss}), wanted_level = 0, armor = 0`);
    logAction('death', `-$200 -${respLoss}resp`);
    spawnParticlesAtDuck(0xff0000, 30, 3, 2);

    // Relocate to a road tile (hospital spawn)
    const p = await q1('SELECT city FROM player');
    if (p && currentMapGrid) {
      for (let y = 5; y < MAP_SIZE - 5; y++) {
        for (let x = 5; x < MAP_SIZE - 5; x++) {
          if (currentMapGrid[y][x] === T.POI_HOSPITAL) {
            await exec(`UPDATE player SET x=${x}, y=${y}`);
            _cachedPos = { x, y };
            setDuckTarget(x + 0.5, y + 0.5);
            if (duckGroup) { duckGroup.position.x = x + 0.5; duckGroup.position.z = y + 0.5; }
            y = MAP_SIZE; break;
          }
        }
      }
    }

    await advanceTime(3);
    log('', 'c-white');
    log('╔══════════════════════════════════════╗', 'c-red');
    log('║          *** WASTED ***              ║', 'c-red');
    log('║  You wake up at the hospital.        ║', 'c-red');
    log(`║  Lost $200 and ${respLoss} Respect.          ║`, 'c-red');
    log('║  Wanted level cleared.               ║', 'c-red');
    log('╚══════════════════════════════════════╝', 'c-red');
    if (isMultiplayer()) {
      const mp = await q1('SELECT name, char_type, x, y, health, wanted_level, gang FROM player');
      broadcastAction({ action: 'death', name: mp.name, killedBy: _lastAttackerPeerId });
      _lastAttackerPeerId = null;
      // Broadcast new position so peers see respawn at hospital (with small delay so death particles show first)
      setTimeout(() => {
        broadcastMove({ x: mp.x, y: mp.y, name: mp.name, char: mp.char_type, health: mp.health, wanted: mp.wanted_level, gang: mp.gang || '' });
      }, 500);
    }
    await updateRank();
    await updateHUD();

    // Fade out the wasted overlay (hold longer for dramatic effect)
    setTimeout(() => { overlay.style.opacity = '0'; }, 4000);
    setTimeout(() => { overlay.remove(); }, 6500);
  }
}

// --------------------------------------------------------
//  RANK UPDATE
// --------------------------------------------------------
async function updateRank() {
  const p = await q1('SELECT respect, gang, gang_rank, perk_points FROM player');
  if (!p.gang) return;
  let newRank = 'Outsider';
  for (const r of RANK_THRESHOLDS) { if (p.respect >= r.respect) newRank = r.rank; }
  if (newRank !== p.gang_rank) {
    await exec(`UPDATE player SET gang_rank = '${newRank}'`);
    log(`Rank up! You are now: ${newRank}`, 'c-magenta');
  }
  const expectedPP = Math.floor(p.respect / 1000);
  if (expectedPP > p.perk_points) {
    const gain = expectedPP - p.perk_points;
    await exec(`UPDATE player SET perk_points = ${expectedPP}`);
    log(`Earned ${gain} perk point(s)! Visit the Perks menu.`, 'c-gold');
  }
}

// --------------------------------------------------------
//  WORLD EVENTS
// --------------------------------------------------------
async function processWorldEvents() {
  const clk = await q1('SELECT * FROM game_clock');
  if (clk.hour % 3 !== 0) return;
  if (!chance(40)) return;

  const allGangs = Object.values(GANGS).flat();
  const allCities = Object.keys(CITIES);
  const eventType = rand(1, 8);

  try {
    if (eventType <= 3) {
      // Gang territory war
      const attacker = allGangs[rand(0, allGangs.length - 1)].replace(/'/g, "''");
      const targets = await q(`SELECT district, city, owner FROM territories WHERE owner != '${attacker}' AND owner != 'Unaffiliated' ORDER BY random() LIMIT 1`);
      if (targets.length > 0) {
        const t = targets[0];
        if (chance(40)) {
          await exec(`UPDATE territories SET owner='${attacker}' WHERE district='${t.district.replace(/'/g,"''")}' AND city='${t.city.replace(/'/g,"''")}'`);
          const desc = `${attacker} seized ${t.district} from ${t.owner}!`;
          await exec(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
          log(`NEWS: ${desc}`, 'c-orange');
        }
      }
    } else if (eventType === 4) {
      // Drug bust — raises heat in target district
      const city = allCities[rand(0, allCities.length - 1)];
      const districts = CITIES[city].districts;
      const district = districts[rand(0, districts.length - 1)];
      const desc = `Major drug bust in ${district}, ${city}! Several dealers arrested.`;
      await exec(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
      await exec(`UPDATE district_heat SET heat=LEAST(15, heat+3) WHERE district='${district.replace(/'/g,"''")}' AND city='${city.replace(/'/g,"''")}'`);
      log(`NEWS: ${desc}`, 'c-orange');
    } else if (eventType === 5) {
      // Police raid — gang loses a territory
      const city = allCities[rand(0, allCities.length - 1)];
      const gang = allGangs[rand(0, allGangs.length - 1)];
      const raidTarget = await q1(`SELECT district FROM territories WHERE owner='${gang.replace(/'/g,"''")}' AND city='${city.replace(/'/g,"''")}' ORDER BY random() LIMIT 1`);
      if (raidTarget) {
        await exec(`UPDATE territories SET owner='Unaffiliated' WHERE district='${raidTarget.district.replace(/'/g,"''")}' AND city='${city.replace(/'/g,"''")}'`);
        const desc = `Police raided ${gang} in ${raidTarget.district}, ${city}. Territory seized!`;
        await exec(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
        log(`NEWS: ${desc}`, 'c-orange');
      } else {
        const desc = `Police raided ${gang} hideout in ${city}. Weapons seized.`;
        await exec(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
        log(`NEWS: ${desc}`, 'c-orange');
      }
    } else if (eventType === 6) {
      // Celebrity sighting — boosts respect if in same city
      const celebs = ['Madd Dogg', 'OG Loc', 'Kent Paul', 'Maccer', 'Lazlow', 'Love Fist', 'Fernando Martinez'];
      const celeb = celebs[rand(0, celebs.length - 1)];
      const city = allCities[rand(0, allCities.length - 1)];
      const desc = `${celeb} spotted partying in ${city}!`;
      await exec(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
      const playerCity = await qv('SELECT city FROM player');
      if (playerCity === city) {
        await exec(`UPDATE player SET respect=respect+15`);
        log(`NEWS: ${desc} You rubbed shoulders with them! +15 Respect`, 'c-gold');
      } else {
        log(`NEWS: ${desc}`, 'c-orange');
      }
    } else if (eventType === 7) {
      // Market crash / boom — actually modify district heat (proxy for economic activity)
      const isBoom = chance(50);
      if (isBoom) {
        // Boom: reduce heat everywhere (police focus on other things)
        await exec(`UPDATE district_heat SET heat=GREATEST(0, heat-2)`);
        const desc = `Drug prices surging! Street dealers reporting record profits. Police distracted.`;
        await exec(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
        log(`NEWS: ${desc}`, 'c-orange');
      } else {
        // Crash: raise heat everywhere (desperate dealers attract cops)
        await exec(`UPDATE district_heat SET heat=LEAST(15, heat+2)`);
        const desc = `Market crash! Drug prices plummeting. Desperate dealers everywhere — cops on high alert.`;
        await exec(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
        log(`NEWS: ${desc}`, 'c-orange');
      }
    } else {
      // Crime wave / crackdown — affects player's city heat
      const city = allCities[rand(0, allCities.length - 1)];
      const isCrimeWave = chance(60);
      if (isCrimeWave) {
        const events = [
          `Shooting spree reported in downtown ${city}. Stay indoors.`,
          `Armored truck heist in ${city} — suspects still at large.`,
          `Car bombing rocks ${city} — gang rivalry suspected.`,
          `Underground street racing circuit busted in ${city}.`
        ];
        const desc = events[rand(0, events.length - 1)];
        // Crime wave raises heat across the city
        const districts = CITIES[city].districts;
        for (const d of districts) {
          await exec(`UPDATE district_heat SET heat=LEAST(15, heat+1) WHERE district='${d.replace(/'/g,"''")}' AND city='${city.replace(/'/g,"''")}'`);
        }
        await exec(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
        log(`NEWS: ${desc}`, 'c-orange');
      } else {
        const desc = `${city} mayor announces crackdown amnesty. Heat reduced across the city.`;
        const districts = CITIES[city].districts;
        for (const d of districts) {
          await exec(`UPDATE district_heat SET heat=GREATEST(0, heat-2) WHERE district='${d.replace(/'/g,"''")}' AND city='${city.replace(/'/g,"''")}'`);
        }
        await exec(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
        log(`NEWS: ${desc}`, 'c-orange');
      }
    }
  } catch (e) {
    // Don't let news errors block gameplay
    console.error('World event error:', e);
  }
}

// --------------------------------------------------------
//  SKILL / GUN HELPERS
// --------------------------------------------------------
async function getSkill(name) { return (await qv(`SELECT level FROM skills WHERE name='${name}'`)) || 1; }
async function maybeSkillUp(name) {
  if (chance(25)) {
    await exec(`UPDATE skills SET level = level + 1 WHERE name='${name}'`);
    const newLvl = await getSkill(name);
    log(`${name} skill increased to ${newLvl}!`, 'c-cyan');
  }
}
async function getGunBonus() {
  const gun = await getEquippedGun();
  const base = gun ? gun.bonus : 0;
  // Weapon locker upgrade adds +3 damage per level
  const wlLevel = (await qv(`SELECT level FROM gang_upgrades WHERE name='weapon_locker'`)) || 0;
  return base + wlLevel * 3;
}

async function menuSwitchGun() {
  const guns = await q('SELECT * FROM guns');
  if (guns.length === 0) { log('No weapons! Visit Ammu-Nation [4].', 'c-red'); showMainActions(); return; }
  const equipped = await getEquippedGun();
  const options = guns.map(g => ({
    label: `${g.name} (${g.category}, +${g.bonus} dmg)${equipped && equipped.name === g.name ? ' [EQUIPPED]' : ''}`,
    action: async () => {
      await exec(`UPDATE guns SET equipped=FALSE`);
      await exec(`UPDATE guns SET equipped=TRUE WHERE name='${g.name.replace(/'/g,"''")}'`);
      log(`Equipped ${g.name}.`, 'c-green');
      hideSubMenu(); await updateHUD(); showMainActions();
    }
  }));
  if (guns.length > 1) {
    options.push({ label: 'Fists (unarmed)', action: async () => {
      await exec(`UPDATE guns SET equipped=FALSE`);
      log('Going unarmed. Fists only.', 'c-yellow');
      hideSubMenu(); await updateHUD(); showMainActions();
    }});
  }
  showSubMenu(`Switch Weapon${equipped ? ' — ' + equipped.name : ''}`, options);
}

// --------------------------------------------------------
//  SHOOTING
// --------------------------------------------------------
let shootCooldown = false;
async function getEquippedGun() {
  return await q1(`SELECT * FROM guns WHERE equipped=TRUE LIMIT 1`) || await q1(`SELECT * FROM guns ORDER BY bonus DESC LIMIT 1`);
}
async function getShootCooldown() {
  const gun = await getEquippedGun();
  if (!gun) return 400;
  const cooldowns = { 'Pistol': 400, 'Shotgun': 500, 'SMG': 200, 'Rifle': 300, 'Heavy': 150, 'Sniper': 600, 'Melee': 350 };
  return cooldowns[gun.category] || 400;
}
async function playerShoot() {
  if (shootCooldown) return;
  const gunCount = await qv('SELECT COUNT(*) FROM guns');
  if (!gunCount || gunCount <= 0) { log('No weapon! Visit Ammu-Nation [4].', 'c-red'); return; }
  const gunBonus = await getGunBonus();

  const cooldown = await getShootCooldown();
  shootCooldown = true;
  setTimeout(() => shootCooldown = false, cooldown);

  spawnMuzzleFlash();

  // Priority: police NPCs first, then civilian NPCs
  const cop = getNearestPoliceNPC(7);
  if (cop) {
    // Fire visible projectile toward the cop
    fireProjectile(cop.group.position.x, cop.group.position.z);
    const dmg = 20 + gunBonus;
    const killPos = damagePoliceNPC(cop, dmg);
    if (killPos) {
      spawnParticles(killPos.x, killPos.z, 0xff2222, 15, 2, 1.2);
      const loot = rand(50, 150);
      await exec(`UPDATE player SET cash=cash+${loot}`);
      log(`Killed a cop! Looted $${loot}. Heat is rising!`, 'c-red');
      logAction('kill_cop', `+$${loot}`);
      await exec(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`);
      if (isMultiplayer()) broadcastAction({ action: 'cop_kill', copId: cop.id });
    } else {
      spawnParticles(cop.group.position.x, cop.group.position.z, 0xff4444, 8, 1.5, 0.8);
      log(`Hit police officer! (${cop.health} HP left)`, 'c-yellow');
    }
    await maybeSkillUp('strength');
    await updateHUD();
    return;
  }

  const npc = getNearestNPC(6);
  if (npc) {
    // Fire visible projectile toward the NPC
    fireProjectile(npc.group.position.x, npc.group.position.z);
    const pos = killNPC(npc);
    spawnParticles(pos.x, pos.z, 0xff2222, 15, 2, 1.2);
    const loot = rand(5, 50);
    await exec(`UPDATE player SET cash=cash+${loot}, wanted_level=LEAST(5,wanted_level+1), respect=respect+1`);
    log(`Shot a civilian! Looted $${loot}. +1 Wanted.`, 'c-red');
    logAction('kill_npc', `+$${loot}`);
    if (isMultiplayer()) broadcastAction({ action: 'npc_kill', npcId: pos.id, name: (await q1('SELECT name FROM player')).name });
    const p = await q1('SELECT district, city FROM player');
    await exec(`UPDATE district_heat SET heat=heat+2 WHERE district='${p.district.replace(/'/g,"''")}' AND city='${p.city.replace(/'/g,"''")}'`);
    await maybeSkillUp('strength');
    await updateHUD();
    return;
  }

  // PvP: check for nearby remote player ducks
  if (isMultiplayer()) {
    const remoteDuck = getNearestRemoteDuck(7);
    if (remoteDuck) {
      fireProjectile(remoteDuck.entry.group.position.x, remoteDuck.entry.group.position.z);
      spawnParticles(remoteDuck.entry.group.position.x, remoteDuck.entry.group.position.z, 0xff4444, 10, 1.5, 1);
      const dmg = 15 + gunBonus;
      // Broadcast the shot to peers — host will validate
      broadcastShoot({ target: remoteDuck.peerId, damage: dmg, name: (await q1('SELECT name FROM player')).name });
      log(`Shot at ${getPeers().get(remoteDuck.peerId)?.name || 'player'}!`, 'c-red');
      await maybeSkillUp('strength');
      await updateHUD();
      return;
    }
  }

  // No target — fire bullet in facing direction
  if (duckGroup) {
    const facingAngle = duckGroup.rotation.y;
    const shotDist = 8;
    fireProjectile(
      duckGroup.position.x + Math.sin(facingAngle) * shotDist,
      duckGroup.position.z + Math.cos(facingAngle) * shotDist
    );
  }
  log('No target in range.', 'c-gray');
}

// --------------------------------------------------------
//  MOVEMENT
// --------------------------------------------------------
// Cached player position (avoids DB read on every move)
let _cachedPos = null; // { x, y }
export function invalidatePlayerCache() { _cachedPos = null; }

let moveDebounce = false;
async function movePlayer(dx, dy) {
  if (moveDebounce) return;
  moveDebounce = true;
  const activeVehicle = await q1(`SELECT name FROM vehicles WHERE stored=0 LIMIT 1`);
  const hasVehicle = !!activeVehicle;
  // Look up vehicle speed from constants
  let vehSpeed = 2;
  if (hasVehicle) {
    const vDef = VEHICLES.find(v => v.name === activeVehicle.name);
    if (vDef) vehSpeed = vDef.speed || 2;
  }
  const debounceMs = hasVehicle ? Math.max(30, 80 - vehSpeed * 10) : 80;
  setTimeout(() => moveDebounce = false, debounceMs);

  if (!_cachedPos) {
    const p = await q1('SELECT x,y FROM player');
    _cachedPos = { x: p.x, y: p.y };
  }

  // Vehicle speed determines tiles per keypress (1 on foot)
  const steps = hasVehicle ? vehSpeed : 1;
  let nx = _cachedPos.x, ny = _cachedPos.y;
  for (let s = 0; s < steps; s++) {
    const tx = nx + dx, ty = ny + dy;
    if (tx < 0 || tx >= MAP_SIZE || ty < 0 || ty >= MAP_SIZE) break;
    if (!currentMapGrid) break;
    const tile = currentMapGrid[ty][tx];
    if (tile === T.WALL || tile === T.WATER) break;
    nx = tx; ny = ty;
  }
  if (nx === _cachedPos.x && ny === _cachedPos.y) return;
  _cachedPos.x = nx;
  _cachedPos.y = ny;
  await exec(`UPDATE player SET x=${nx}, y=${ny}`);

  if (dx !== 0 || dy !== 0) {
    setDuckFacing(Math.atan2(dx, dy));
  }
  setDuckTarget(nx + 0.5, ny + 0.5);

  // Broadcast position to peers (use cached pos + single query for other fields)
  if (isMultiplayer()) {
    const mp = await q1('SELECT name, char_type, health, wanted_level, gang FROM player');
    broadcastMove({ x: nx, y: ny, name: mp.name, char: mp.char_type, health: mp.health, wanted: mp.wanted_level, gang: mp.gang || '' });
  }

  await updateDistrict(nx, ny);
  await checkPOI();
  await checkPoliceOnMove();
  await checkNightAttack();
  await updateHUD();
}

async function updateDistrict(x, y) {
  const p = await q1('SELECT city FROM player');
  const districts = CITIES[p.city]?.districts;
  if (!districts) return;
  const cols = Math.ceil(Math.sqrt(districts.length));
  const rows = Math.ceil(districts.length / cols);
  const cellW = MAP_SIZE / cols;
  const cellH = MAP_SIZE / rows;
  const col = Math.min(Math.floor(x / cellW), cols - 1);
  const row = Math.min(Math.floor(y / cellH), rows - 1);
  const idx = Math.min(row * cols + col, districts.length - 1);
  const district = districts[idx].replace(/'/g, "''");
  await exec(`UPDATE player SET district='${district}'`);
}

// --------------------------------------------------------
//  SUB-MENU HELPERS
// --------------------------------------------------------
let currentSubOptions = [];
let subMenuSelection = -1;

function showSubMenu(title, options) {
  currentSubOptions = options;
  subMenuSelection = -1;
  const el = $('sub-menu');
  const backdrop = $('sub-menu-backdrop');
  el.style.display = 'block';
  backdrop.style.display = 'block';
  let html = `<h4>${title} <span class="c-gray" style="font-size:10px">[1-${Math.min(options.length,9)} to pick, Esc=back]</span></h4><div class="sub-options">`;
  options.forEach((opt, i) => {
    const key = i < 9 ? (i + 1) : '';
    html += `<button class="btn sub-btn" data-idx="${i}">${key ? `<span class="key">[${key}]</span> ` : ''}${opt.label}</button> `;
  });
  html += `<button class="btn sub-btn" id="btn-back"><span class="key">[Esc]</span> Back</button></div>`;
  el.innerHTML = html;
  const btns = el.querySelectorAll('.sub-btn');
  options.forEach((opt, i) => btns[i].addEventListener('click', opt.action));
  el.querySelector('#btn-back').addEventListener('click', () => { hideSubMenu(); showMainActions(); });
  backdrop.addEventListener('click', () => { hideSubMenu(); showMainActions(); }, { once: true });
}

function showSubMenuHTML(title, html) {
  const el = $('sub-menu');
  const backdrop = $('sub-menu-backdrop');
  el.style.display = 'block';
  backdrop.style.display = 'block';
  el.innerHTML = `<h4 style="position:sticky;top:0;background:rgba(10,10,10,0.98);padding-bottom:4px;z-index:1">${title}</h4><div style="overflow-y:auto;max-height:calc(80vh - 80px);padding-right:4px">${html}</div><div style="margin-top:8px;position:sticky;bottom:0;background:rgba(10,10,10,0.98);padding-top:4px"><button class="btn" id="btn-back">Back</button></div>`;
  el.querySelector('#btn-back').addEventListener('click', () => { hideSubMenu(); showMainActions(); });
  backdrop.addEventListener('click', () => { hideSubMenu(); showMainActions(); }, { once: true });
}

function hideSubMenu() { $('sub-menu').style.display = 'none'; $('sub-menu').innerHTML = ''; $('sub-menu-backdrop').style.display = 'none'; currentSubOptions = []; subMenuSelection = -1; }

// Quick vehicle enter/exit toggle
async function toggleVehicle() {
  const active = await q1('SELECT name FROM vehicles WHERE stored=0 LIMIT 1');
  if (active) {
    await exec(`UPDATE vehicles SET stored=1 WHERE stored=0`);
    log(`Exited ${active.name}.`, 'c-cyan');
  } else {
    const best = await q1('SELECT name FROM vehicles ORDER BY name LIMIT 1');
    if (!best) { log('No vehicles owned.', 'c-gray'); return; }
    await exec(`UPDATE vehicles SET stored=0 WHERE name='${best.name.replace(/'/g,"''")}'`);
    log(`Got in ${best.name}.`, 'c-green');
  }
  await updateHUD();
}

// Quick garage — just vehicles
async function menuGarage() {
  const vehicles = await q('SELECT * FROM vehicles');
  const active = vehicles.find(v => !v.stored);
  const options = [];
  options.push({ label: active ? `Exit ${active.name}` : 'On Foot', action: async () => {
    await exec(`UPDATE vehicles SET stored=1 WHERE stored=0`);
    log('Going on foot.', 'c-cyan');
    hideSubMenu(); await updateHUD(); showMainActions();
  }});
  for (const v of vehicles) {
    options.push({ label: `${v.name} ${v.stored ? '' : '[driving]'}`, action: async () => {
      await exec(`UPDATE vehicles SET stored=1 WHERE stored=0`);
      await exec(`UPDATE vehicles SET stored=0 WHERE name='${v.name.replace(/'/g,"''")}'`);
      log(`Switched to ${v.name}.`, 'c-green');
      hideSubMenu(); await updateHUD(); showMainActions();
    }});
  }
  if (vehicles.length === 0) {
    log('No vehicles. Steal or buy one.', 'c-gray');
    return;
  }
  showSubMenu(`Garage${active ? ' — ' + active.name : ''}`, options);
}

// --------------------------------------------------------
//  MAIN ACTIONS
// --------------------------------------------------------
function showMainActions() {
  hideSubMenu();
  $('action-title').textContent = 'What do you want to do?';
  const actions = [
    { key: '1', label: 'Travel',        action: menuTravel },
    { key: '2', label: 'Work (Legal)',   action: menuJobs },
    { key: '3', label: 'Crime',          action: menuCrime },
    { key: '4', label: 'Ammu-Nation',    action: menuGuns },
    { key: '5', label: 'Hospital',       action: menuHospital },
    { key: '6', label: 'Shops',          action: menuShops },
    { key: '7', label: 'Drug Market',    action: menuDrugs },
    { key: '8', label: 'Gang & Empire',  action: menuGang },
    { key: '9', label: 'Perks (beta)',    action: menuPerks },
    { key: '0', label: 'Inventory',      action: menuInventory },
    { key: 'H', label: 'Hookers',        action: menuHookers },
    { key: 'N', label: 'News',           action: menuNews },
    { key: 'L', label: 'Stats',          action: menuStats },
    { key: 'X', label: 'Strip Club',     action: menuStripClub },
    { key: 'R', label: 'Street Race',    action: menuStreetRace },
    { key: 'J', label: 'Heists',         action: menuHeists },
    { key: 'V', label: 'Enter/Exit Car', action: toggleVehicle },
    { key: 'G', label: 'Garage',         action: menuGarage },
    ...(isMultiplayer() ? [{ key: 'B', label: 'Bounties',       action: menuBounties }] : []),
    { key: '?', label: 'Help/Settings',  action: menuHelp }
  ];
  const el = $('actions');
  el.innerHTML = '';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.innerHTML = `<span class="key">[${a.key}]</span> ${a.label}`;
    btn.addEventListener('click', a.action);
    el.appendChild(btn);
  }
}

// --------------------------------------------------------
//  TRAVEL
// --------------------------------------------------------
async function menuTravel() {
  const p = await q1('SELECT city, cash FROM player');
  const hasVehicle = await qv(`SELECT COUNT(*) FROM vehicles WHERE stored=0`);
  const options = [];
  for (const city of Object.keys(CITIES)) {
    if (city === p.city) continue;
    const cost = hasVehicle > 0 ? 0 : rand(50, 200);
    options.push({
      label: `${city} ${cost > 0 ? '($' + cost + ')' : '(Free - own vehicle)'}`,
      action: async () => {
        if (p.cash < cost) { log('Not enough cash to travel!', 'c-red'); return; }
        setStatus(`Traveling to ${city}...`);
        await exec(`UPDATE player SET city='${city}', cash=cash-${cost}, district='${CITIES[city].districts[0].replace(/'/g,"''")}'`);
        await loadCityMap(city);
        let sx = 5, sy = 5;
        for (let y = 3; y < MAP_SIZE-3; y++) for (let x = 3; x < MAP_SIZE-3; x++) {
          if (currentMapGrid[y][x] === T.ROAD_MAIN || currentMapGrid[y][x] === T.ROAD_SIDE) { sx = x; sy = y; y = MAP_SIZE; break; }
        }
        await exec(`UPDATE player SET x=${sx}, y=${sy}`);
        _cachedPos = { x: sx, y: sy };
        setDuckTarget(sx + 0.5, sy + 0.5);
        if (duckGroup) { duckGroup.position.x = sx + 0.5; duckGroup.position.z = sy + 0.5; }
        await advanceTime(2); await processWorldEvents(); await checkPolice();
        log(`Traveled to ${city}!`, 'c-cyan');
        logAction('travel', city, sx, sy);
        if (isMultiplayer()) {
          const mp = await q1('SELECT name, char_type, health, wanted_level, gang FROM player');
          broadcastMove({ x: sx, y: sy, name: mp.name, char: mp.char_type, health: mp.health, wanted: mp.wanted_level, gang: mp.gang || '' });
        }
        clearStatus();
        hideSubMenu(); await updateHUD(); await checkPOI(); showMainActions();
      }
    });
  }
  const cityDistricts = CITIES[p.city].districts;
  const cols = Math.ceil(Math.sqrt(cityDistricts.length));
  const rows = Math.ceil(cityDistricts.length / cols);
  const cellW = Math.floor(MAP_SIZE / cols);
  const cellH = Math.floor(MAP_SIZE / rows);
  for (let di = 0; di < cityDistricts.length; di++) {
    const d = cityDistricts[di];
    const col = di % cols;
    const row = Math.floor(di / cols);
    options.push({
      label: `[Local] ${d}`,
      action: async () => {
        // Teleport to the center of the district zone
        const targetX = Math.floor(col * cellW + cellW / 2);
        const targetY = Math.floor(row * cellH + cellH / 2);
        // Find nearest walkable tile from target center
        let sx = targetX, sy = targetY;
        if (currentMapGrid) {
          let found = false;
          for (let r = 0; r < 15 && !found; r++) {
            for (let dy = -r; dy <= r && !found; dy++) {
              for (let dx = -r; dx <= r && !found; dx++) {
                const tx = targetX+dx, ty = targetY+dy;
                if (tx < 1 || tx >= MAP_SIZE-1 || ty < 1 || ty >= MAP_SIZE-1) continue;
                const t = currentMapGrid[ty][tx];
                if (t !== T.WALL && t !== T.WATER) { sx = tx; sy = ty; found = true; }
              }
            }
          }
        }
        await exec(`UPDATE player SET x=${sx}, y=${sy}, district='${d.replace(/'/g,"''")}'`);
        _cachedPos = { x: sx, y: sy };
        setDuckTarget(sx + 0.5, sy + 0.5);
        if (duckGroup) { duckGroup.position.x = sx + 0.5; duckGroup.position.z = sy + 0.5; }
        await advanceTime(1); await processWorldEvents(); await checkPolice();
        log(`Traveled to ${d}.`, 'c-white');
        hideSubMenu(); await updateHUD(); await checkPOI(); showMainActions();
      }
    });
  }
  showSubMenu(`Travel from ${p.city}`, options);
}

// --------------------------------------------------------
//  LEGAL JOBS
// --------------------------------------------------------
async function menuJobs() {
  const options = [];
  for (const job of JOBS) {
    const skill = await getSkill(job.skill);
    const bonus = skill * 5;
    const maxEarn = job.max + bonus;
    options.push({
    label: `${job.name} (${job.hours}h, $${job.min + bonus}-${maxEarn}, ${job.skill} skill)`,
    action: async () => {
      setStatus(`Working as ${job.name}...`);
      const skill = await getSkill(job.skill);
      const base = rand(job.min, job.max);
      const bonus = skill * 5;
      const earnings = base + bonus;
      await exec(`UPDATE player SET cash = cash + ${earnings}`);
      await advanceTime(job.hours); await maybeSkillUp(job.skill);
      if (chance(25)) { await exec(`UPDATE player SET wanted_level = GREATEST(0, wanted_level - 1)`); log('Keeping a low profile... wanted level decreased.', 'c-green'); }
      log(`Worked as ${job.name}: earned $${earnings} (base $${base} + skill $${bonus})`, 'c-green');
      logAction('job', `${job.name} +$${earnings}`);
      clearStatus();
      await processWorldEvents(); await checkPolice();
      hideSubMenu(); await updateHUD(); showMainActions();
    }
  });
  }
  showSubMenu('Legal Jobs (safe income, builds skills, may reduce wanted level)', options);
}

// --------------------------------------------------------
//  CRIME
// --------------------------------------------------------
async function menuCrime() {
  const p = await q1('SELECT * FROM player');
  const gunBonus = await getGunBonus();
  const districtHeat = (await qv(`SELECT heat FROM district_heat WHERE district='${p.district.replace(/'/g,"''")}' AND city='${p.city.replace(/'/g,"''")}'`)) || 0;
  const heatPenalty = Math.floor(districtHeat * 1.5);
  let html = '<div class="c-gray" style="margin-bottom:6px;font-size:10px">Success depends on your skills, weapons, and luck. Higher risk = higher reward.</div>';
  if (districtHeat >= 5) html += `<div class="c-red" style="margin-bottom:4px;font-size:10px">District heat: ${districtHeat} — crime success reduced by ${heatPenalty}%. Move to a cooler district!</div>`;
  html += '<table><tr><th>Crime</th><th>Chance</th><th>Reward</th><th>Risk</th><th>Time</th><th></th></tr>';
  for (const crime of CRIMES) {
    const skill = await getSkill(crime.skill);
    const minChance = Math.min(95, crime.baseMin + skill * 3 + gunBonus - heatPenalty);
    const maxChance = Math.min(95, crime.baseMax + skill * 3 + gunBonus - heatPenalty);
    const avgChance = Math.max(5, Math.floor((minChance + maxChance) / 2));
    const chanceColor = avgChance >= 60 ? 'c-green' : avgChance >= 35 ? 'c-yellow' : 'c-red';
    const maxLoot = crime.lootMax + skill * crime.lootMul;
    const riskLevel = crime.failWanted >= 2 ? 'HIGH' : crime.heat >= 5 ? 'MED' : 'LOW';
    const riskColor = riskLevel === 'HIGH' ? 'c-red' : riskLevel === 'MED' ? 'c-yellow' : 'c-green';
    html += `<tr>`;
    html += `<td>${crime.name}<br><span class="c-gray" style="font-size:9px">${crime.skill}</span></td>`;
    html += `<td class="${chanceColor}">${avgChance}%</td>`;
    html += `<td class="c-gold">$${crime.lootMin}-${maxLoot}</td>`;
    html += `<td class="${riskColor}">${riskLevel}</td>`;
    html += `<td>${crime.hours}h</td>`;
    html += `<td><button class="btn do-crime" data-idx="${CRIMES.indexOf(crime)}">Go</button></td>`;
    html += `</tr>`;
  }
  html += '</table>';
  if (p.adrenaline > 0) html += '<div class="c-cyan" style="margin-top:4px">Adrenaline active: +20% success on next crime!</div>';
  showSubMenuHTML('Criminal Activities', html);
  $('sub-menu').querySelectorAll('.do-crime').forEach(btn => {
    btn.addEventListener('click', async () => {
      const crime = CRIMES[parseInt(btn.dataset.idx)];
      await commitCrime(crime);
    });
  });
}

async function commitCrime(crime) {
  setStatus(`Committing ${crime.name}...`);
  const p = await q1('SELECT * FROM player');
  const skill = await getSkill(crime.skill);
  const gunBonus = await getGunBonus();
  const hasDisguise = await qv(`SELECT unlocked FROM perks WHERE name='Master of Disguise'`);
  const hasAdrenaline = p.adrenaline > 0;
  // District heat penalizes crime success — more cops = more eyes
  const districtHeat = (await qv(`SELECT heat FROM district_heat WHERE district='${p.district.replace(/'/g,"''")}' AND city='${p.city.replace(/'/g,"''")}'`)) || 0;
  const heatPenalty = Math.floor(districtHeat * 1.5); // -1.5% per heat level
  let successChance = rand(crime.baseMin, crime.baseMax) + skill * 3 + gunBonus - heatPenalty;
  if (hasAdrenaline) { successChance += 20; await exec(`UPDATE player SET adrenaline = 0`); }
  successChance = Math.min(successChance, 95);
  await advanceTime(crime.hours);
  if (chance(successChance)) {
    const loot = rand(crime.lootMin, crime.lootMax) + skill * crime.lootMul;
    const dmg = rand(crime.dmgMin, crime.dmgMax);
    const respect = rand(crime.respectMin, crime.respectMax);
    const actualDmg = p.armor > 0 ? Math.floor(dmg / 2) : dmg;
    const crimeWanted = crime.heat >= 15 ? 2 : crime.heat >= 5 ? 1 : 0;
    await exec(`UPDATE player SET cash=cash+${loot}, health=GREATEST(0,health-${actualDmg}), respect=respect+${respect}, armor=GREATEST(0,armor-${dmg}), wanted_level=LEAST(5,wanted_level+${crimeWanted})`);
    const safeD = p.district.replace(/'/g, "''"); const safeC = p.city.replace(/'/g, "''");
    await exec(`UPDATE district_heat SET heat=heat+${crime.heat} WHERE district='${safeD}' AND city='${safeC}'`);
    if (crime.name === 'Carjack') {
      const v = VEHICLES[rand(0, VEHICLES.length - 1)];
      const exists = await qv(`SELECT COUNT(*) FROM vehicles WHERE name='${v.name}'`);
      if (!exists) { await exec(`INSERT INTO vehicles VALUES ('${v.name}',0)`); log(`Jacked a ${v.name}!`, 'c-cyan'); }
    }
    log(`SUCCESS: ${crime.name} - Earned $${loot}, +${respect} Respect${actualDmg > 0 ? ', -' + actualDmg + '% HP' : ''}`, 'c-green');
    logAction('crime_success', `${crime.name} +$${loot} +${respect}resp`, p.x, p.y);
    spawnParticlesAtDuck(0xffdd00, 15, 2, 1.5);
    await maybeSkillUp(crime.skill); await updateRank();
  } else {
    let wantedGain = crime.failWanted;
    if (hasDisguise) wantedGain = Math.max(0, wantedGain - 1);
    const fine = rand(crime.failFineMin, crime.failFineMax);
    const dmg = rand(crime.failDmgMin, crime.failDmgMax);
    const actualDmg = p.armor > 0 ? Math.floor(dmg / 2) : dmg;
    await exec(`UPDATE player SET cash=GREATEST(0,cash-${fine}), health=GREATEST(0,health-${actualDmg}), wanted_level=LEAST(5,wanted_level+${wantedGain}), armor=GREATEST(0,armor-${dmg})`);
    log(`FAILED: ${crime.name} - Fined $${fine}, -${actualDmg}% HP, +${wantedGain} Wanted`, 'c-red');
    logAction('crime_fail', `${crime.name} -$${fine}`, p.x, p.y);
    spawnParticlesAtDuck(0xff2222, 12, 1.5, 1);
  }
  clearStatus();
  await checkDeath(); await processWorldEvents();
  // High-heat crimes trigger immediate police spawns
  if (crime.heat >= 15) {
    const pp = await q1('SELECT wanted_level FROM player');
    if (pp.wanted_level <= 0) await exec(`UPDATE player SET wanted_level=1`);
    log('Sirens everywhere! The cops are on you!', 'c-red');
  }
  await updatePolicePresence();
  hideSubMenu(); await updateHUD(); showMainActions();
}

// --------------------------------------------------------
//  AMMU-NATION
// --------------------------------------------------------
async function menuGuns() {
  // Weapon locker discount: -10% per level
  const wlLevel = (await qv(`SELECT level FROM gang_upgrades WHERE name='weapon_locker'`)) || 0;
  const discount = wlLevel * 0.1;
  let html = '';
  if (wlLevel > 0) html += `<div class="c-cyan" style="margin-bottom:4px;font-size:10px">Weapon Locker Lv.${wlLevel}: ${Math.floor(discount * 100)}% discount + ${wlLevel * 3} bonus damage</div>`;
  html += '<table><tr><th>Gun</th><th>Type</th><th>Bonus</th><th>Price</th><th></th></tr>';
  const owned = await q('SELECT name FROM guns');
  const ownedSet = new Set(owned.map(g => g.name));
  for (const gun of GUNS) {
    const isOwned = ownedSet.has(gun.name);
    const discountedPrice = Math.floor(gun.price * (1 - discount));
    html += `<tr><td>${gun.name}</td><td>${gun.cat}</td><td>+${gun.bonus}%</td><td>$${discountedPrice}${discount > 0 ? ` <span class="c-gray" style="text-decoration:line-through">$${gun.price}</span>` : ''}</td>`;
    html += `<td>${isOwned ? '<span class="c-green">OWNED</span>' : `<button class="btn buy-gun" data-name="${gun.name}" data-price="${discountedPrice}" data-cat="${gun.cat}" data-bonus="${gun.bonus}">Buy</button>`}</td></tr>`;
  }
  html += '</table>';
  html += '<div style="margin-top:6px"><button class="btn rob-ammo">*** Rob Ammu-Nation ***</button></div>';
  showSubMenuHTML('Ammu-Nation', html);
  $('sub-menu').querySelector('.rob-ammo')?.addEventListener('click', () => robLocation('Ammu-Nation', 100, 500, 15, 5));
  $('sub-menu').querySelectorAll('.buy-gun').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name; const price = parseInt(btn.dataset.price);
      const cash = await qv('SELECT cash FROM player');
      if (cash < price) { log('Not enough cash!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-${price}`);
      const hadGuns = await qv('SELECT COUNT(*) FROM guns');
      await exec(`INSERT INTO guns VALUES ('${name.replace(/'/g,"''")}','${btn.dataset.cat}',${btn.dataset.bonus},${hadGuns ? 'FALSE' : 'TRUE'})`);
      if (!hadGuns) log(`Purchased and equipped ${name} for $${price}!`, 'c-green');
      else log(`Purchased ${name} for $${price}! Switch with [0].`, 'c-green');
      logAction('buy_gun', `${name} $${price}`);
      await updateHUD(); await menuGuns();
    });
  });
}

// --------------------------------------------------------
//  HOSPITAL
// --------------------------------------------------------
async function menuHospital() {
  showSubMenu('Hospital', [
    { label: 'Full Treatment ($200)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 200) { log('Not enough cash!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-200, health=100`);
      log('Fully healed at the hospital.', 'c-green');
      spawnParticlesAtDuck(0x44ff44, 12, 1.5, 1.5);
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Buy Health Pack ($50)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 50) { log('Not enough cash!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-50`);
      await exec(`INSERT INTO inventory VALUES ('Health Pack',1) ON CONFLICT(item) DO UPDATE SET qty=qty+1`);
      log('Bought a Health Pack.', 'c-green');
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Buy Body Armor ($100)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 100) { log('Not enough cash!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-100, armor=100`);
      log('Equipped body armor!', 'c-green');
      hideSubMenu(); await updateHUD(); showMainActions();
    }}
  ]);
}

// --------------------------------------------------------
//  SHOPS
// --------------------------------------------------------
async function menuShops() {
  const items = Object.entries(ITEMS);
  const options = items.map(([name, info]) => ({
    label: `${name} - $${info.price} (${info.desc})`,
    action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < info.price) { log('Not enough cash!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-${info.price}`);
      // Immediate-effect items
      if (name === 'Adrenaline Shot') { await exec(`UPDATE player SET adrenaline = 1`); }
      else if (name === 'Bulletproof Vest') { await exec(`UPDATE player SET armor=LEAST(100,armor+100)`); }
      else if (name === 'Gold Watch') { await exec(`UPDATE player SET respect=respect+50`); }
      else if (name === 'Jetpack Fuel') {
        // Instant travel to random district
        log('Jetpack activated! Choose a district from Travel menu.', 'c-cyan');
      }
      else if (name === 'Smoke Grenade' && (await qv('SELECT wanted_level FROM player')) > 0) {
        await exec(`UPDATE player SET wanted_level=0`);
        clearPoliceNPCs(); stopSiren();
        log('Smoke grenade deployed! Cops lost you!', 'c-green');
      }
      else { await exec(`INSERT INTO inventory VALUES ('${name}',1) ON CONFLICT(item) DO UPDATE SET qty=qty+1`); }
      log(`Bought ${name} for $${info.price}.`, 'c-green');
      await updateHUD();
    }
  }));
  options.push({ label: '*** Rob This Store ***', action: () => robLocation('Convenience Store', 50, 250, 10, 2) });
  showSubMenu('Convenience Store', options);
}

async function robLocation(placeName, lootMin, lootMax, lootMul, heat) {
  setStatus(`Robbing ${placeName}...`);
  const p = await q1('SELECT * FROM player');
  const skill = await getSkill('stealth');
  const gunBonus = await getGunBonus();
  let successChance = rand(20, 55) + skill * 3 + gunBonus;
  successChance = Math.min(successChance, 90);
  await advanceTime(1);
  if (chance(successChance)) {
    const loot = rand(lootMin, lootMax) + skill * lootMul;
    const respect = rand(5, 20);
    await exec(`UPDATE player SET cash=cash+${loot}, respect=respect+${respect}, wanted_level=LEAST(5,wanted_level+1)`);
    const safeD = p.district.replace(/'/g, "''"); const safeC = p.city.replace(/'/g, "''");
    await exec(`UPDATE district_heat SET heat=heat+${heat} WHERE district='${safeD}' AND city='${safeC}'`);
    log(`Robbed ${placeName}! Got $${loot}, +${respect} Respect. +1 Wanted.`, 'c-green');
    logAction('rob_success', `${placeName} +$${loot}`);
    if (isMultiplayer()) broadcastAction({ action: 'rob', place: placeName, name: p.name });
    spawnParticlesAtDuck(0xffdd00, 15, 2, 1.5);
    await maybeSkillUp('stealth'); await updateRank();
  } else {
    const fine = rand(100, 400);
    const dmg = rand(10, 35);
    await exec(`UPDATE player SET cash=GREATEST(0,cash-${fine}), health=GREATEST(0,health-${dmg}), wanted_level=LEAST(5,wanted_level+2)`);
    log(`Failed to rob ${placeName}! Fined $${fine}, -${dmg} HP, +2 Wanted.`, 'c-red');
    logAction('rob_fail', `${placeName} -$${fine}`);
    spawnParticlesAtDuck(0xff2222, 12, 1.5, 1);
  }
  clearStatus();
  await checkDeath(); await checkPolice();
  hideSubMenu(); await updateHUD(); showMainActions();
}

// --------------------------------------------------------
//  DRUG MARKET
// --------------------------------------------------------
async function menuDrugs() {
  const dealSkill = await getSkill('dealing');
  const clock = await q1('SELECT day, hour FROM game_clock');
  const p = await q1('SELECT district, city FROM player');
  const districtHeat = (await qv(`SELECT heat FROM district_heat WHERE district='${p.district.replace(/'/g,"''")}' AND city='${p.city.replace(/'/g,"''")}'`)) || 0;
  const priceSeed = clock.day * 100 + Math.floor(clock.hour / 6);
  // High heat = higher drug prices (risk premium) — +3% per heat level
  const heatMul = 1 + districtHeat * 0.03;
  let html = `<table><tr><th>Drug</th><th>Buy</th><th>Sell</th><th>Owned</th><th></th></tr>`;
  if (districtHeat >= 5) html = `<div class="c-red" style="margin-bottom:4px;font-size:10px">High heat district! Drug prices ${districtHeat >= 10 ? 'much ' : ''}higher but riskier.</div>` + html;
  for (let di = 0; di < DRUGS.length; di++) {
    const drug = DRUGS[di];
    const buyPrice = Math.floor((drug.basePrice + seededRand(priceSeed + di, -20, 30)) * heatMul);
    const sellMul = 1.2 + (dealSkill * 0.1) + (seededRand(priceSeed + di + 100, 0, 50) / 100);
    const sellPrice = Math.floor(drug.basePrice * sellMul * heatMul);
    const owned = (await qv(`SELECT qty FROM drugs WHERE name='${drug.name}'`)) || 0;
    html += `<tr><td>${drug.name}</td><td>$${buyPrice}</td><td>$${sellPrice}</td><td>${owned}</td>`;
    html += `<td><button class="btn buy-drug" data-name="${drug.name}" data-price="${buyPrice}">Buy</button> `;
    html += `<button class="btn sell-drug" data-name="${drug.name}" data-price="${sellPrice}">Sell</button></td></tr>`;
  }
  html += '</table>';
  showSubMenuHTML('Drug Market', html);
  $('sub-menu').querySelectorAll('.buy-drug').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name; const price = parseInt(btn.dataset.price);
      const cash = await qv('SELECT cash FROM player');
      if (cash < price) { log('Not enough cash!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-${price}`);
      const exists = await qv(`SELECT COUNT(*) FROM drugs WHERE name='${name}'`);
      if (exists > 0) { await exec(`UPDATE drugs SET qty=qty+1, avg_price=${price} WHERE name='${name}'`); }
      else { await exec(`INSERT INTO drugs VALUES ('${name}',1,${price})`); }
      log(`Bought 1 ${name} for $${price}.`, 'c-green');
      logAction('drug_buy', `${name} $${price}`);
      await maybeSkillUp('dealing'); await updateHUD(); await menuDrugs();
    });
  });
  $('sub-menu').querySelectorAll('.sell-drug').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name; const price = parseInt(btn.dataset.price);
      const qty = (await qv(`SELECT qty FROM drugs WHERE name='${name}'`)) || 0;
      if (qty <= 0) { log(`No ${name} to sell!`, 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash+${price}`);
      await exec(`UPDATE drugs SET qty=qty-1 WHERE name='${name}'`);
      log(`Sold 1 ${name} for $${price}.`, 'c-green');
      logAction('drug_sell', `${name} $${price}`);
      await maybeSkillUp('dealing');
      if (chance(15)) { log('A narc spotted you dealing!', 'c-red'); await exec(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`); }
      await updateHUD(); await menuDrugs();
    });
  });
}

// --------------------------------------------------------
//  VEHICLES
// --------------------------------------------------------
async function menuVehicles() {
  const owned = await q('SELECT name FROM vehicles');
  const ownedSet = new Set(owned.map(v => v.name));
  let html = '<table><tr><th>Vehicle</th><th>Price</th><th></th></tr>';
  for (const v of VEHICLES) {
    const isOwned = ownedSet.has(v.name);
    html += `<tr><td>${v.name}</td><td>$${v.price}</td>`;
    html += `<td>${isOwned ? '<span class="c-green">OWNED</span>' : `<button class="btn buy-vehicle" data-name="${v.name}" data-price="${v.price}">Buy</button>`}</td></tr>`;
  }
  html += '</table>';
  if (owned.length > 0) html += `<div style="margin-top:8px" class="c-cyan">Your rides: ${owned.map(v=>v.name).join(', ')}</div>`;
  showSubMenuHTML('Vehicle Dealership', html);
  $('sub-menu').querySelectorAll('.buy-vehicle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name; const price = parseInt(btn.dataset.price);
      const cash = await qv('SELECT cash FROM player');
      if (cash < price) { log('Not enough cash!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-${price}`);
      await exec(`INSERT INTO vehicles VALUES ('${name}',0)`);
      log(`Bought a ${name} for $${price}!`, 'c-green');
      logAction('buy_vehicle', `${name} $${price}`);
      await updateHUD(); await menuVehicles();
    });
  });
}

// --------------------------------------------------------
//  HOOKERS
// --------------------------------------------------------
async function menuHookers() {
  const p = await q1('SELECT cash, health FROM player');
  showSubMenu('Street Services', [
    { label: 'Quick Fix - $50 (+10 HP)', action: async () => {
      if (p.cash < 50) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await exec(`UPDATE player SET cash=cash-50, health=LEAST(100,health+10)`);
      await advanceTime(1);
      log('Spent some quality time on the street. +10 HP.', 'c-magenta');
      spawnParticlesAtDuck(0xff44ff, 8, 1, 1.5);
      await checkPolice(); hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Full Service - $100 (+25 HP)', action: async () => {
      if (p.cash < 100) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await exec(`UPDATE player SET cash=cash-100, health=LEAST(100,health+25)`);
      await advanceTime(2);
      log('A night to remember. +25 HP. Worth every dollar.', 'c-magenta');
      spawnParticlesAtDuck(0xff44ff, 12, 1.5, 1.5);
      await checkPolice(); hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'VIP Experience - $250 (+50 HP, -1 Wanted)', action: async () => {
      if (p.cash < 250) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await exec(`UPDATE player SET cash=cash-250, health=LEAST(100,health+50), wanted_level=GREATEST(0,wanted_level-1)`);
      await advanceTime(3);
      log('The VIP treatment. +50 HP, stress relief lowered your wanted level.', 'c-magenta');
      spawnParticlesAtDuck(0xff44ff, 18, 2, 2);
      await checkPolice(); hideSubMenu(); await updateHUD(); showMainActions();
    }}
  ]);
}

// --------------------------------------------------------
//  GANG & EMPIRE
// --------------------------------------------------------
async function menuGang() {
  const p = await q1('SELECT gang, gang_rank, respect, city FROM player');
  if (!p.gang) {
    const localGangs = GANGS[p.city] || [];
    const options = localGangs.map(g => ({
      label: `Join ${g} - Gain territory, recruit crew, earn daily income`,
      action: async () => {
        await exec(`UPDATE player SET gang='${g.replace(/'/g,"''")}', gang_rank='Outsider'`);
        log(`Joined ${g}! Visit Gang & Empire [9] to manage territory, recruit crew, and build your empire.`, 'c-magenta');
        hideSubMenu(); await updateHUD(); showMainActions();
      }
    }));
    // In multiplayer, show other players' gangs to join
    if (isMultiplayer()) {
      const seenGangs = new Set(localGangs);
      for (const [, info] of getPeers()) {
        if (info.gang && !seenGangs.has(info.gang)) {
          seenGangs.add(info.gang);
          const g = info.gang;
          const owner = info.name || '?';
          options.push({
            label: `Join ${g} (${owner}'s crew) - Multiplayer gang`,
            action: async () => {
              await exec(`UPDATE player SET gang='${g.replace(/'/g,"''")}', gang_rank='Outsider'`);
              log(`Joined ${owner}'s gang: ${g}!`, 'c-magenta');
              if (isMultiplayer()) broadcastAction({ action: 'gang_join', gang: g, name: (await q1('SELECT name FROM player')).name });
              hideSubMenu(); await updateHUD(); showMainActions();
            }
          });
        }
      }
    }
    if (p.respect >= 1500) {
      options.push({ label: 'Create Your Own Gang (1500+ Respect)', action: async () => {
        const rawName = prompt('Enter gang name:');
        if (!rawName) return;
        const name = rawName.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 30);
        if (!name) { log('Invalid gang name.', 'c-red'); return; }
        await exec(`UPDATE player SET gang='${name}', gang_rank='Boss'`);
        log(`Created gang: ${name}! You are the Boss.`, 'c-magenta');
        hideSubMenu(); await updateHUD(); showMainActions();
      }});
    }
    showSubMenu(`Join a Gang in ${p.city}`, options); return;
  }
  const tCount = await qv(`SELECT COUNT(*) FROM territories WHERE owner='${p.gang.replace(/'/g,"''")}'`);
  const recruitCount = (await qv('SELECT COUNT(*) FROM recruits')) || 0;
  const bizCount = (await qv(`SELECT COUNT(*) FROM businesses WHERE city='${p.city.replace(/'/g,"''")}'`)) || 0;
  let gangInfo = `<div style="margin-bottom:6px">`;
  gangInfo += `<span class="c-cyan">Territories: ${tCount || 0}</span> | `;
  gangInfo += `<span class="c-cyan">Crew: ${recruitCount}</span> | `;
  gangInfo += `<span class="c-cyan">Businesses: ${bizCount}</span> | `;
  gangInfo += `<span class="c-gold">Respect: ${p.respect}</span>`;
  gangInfo += `</div>`;
  const gangOptions = [];
  if (p.wanted_level > 0) {
    gangOptions.push({ label: `Lay Low at the Hangout (-${Math.min(p.wanted_level, 3)} Wanted, 3 hrs)`, action: async () => {
      const drop = Math.min(Number(p.wanted_level), 3);
      await exec(`UPDATE player SET wanted_level=GREATEST(0,wanted_level-${drop})`);
      await advanceTime(3);
      const newWanted = await qv('SELECT wanted_level FROM player');
      if (newWanted <= 0) { stopSiren(); clearPoliceNPCs(); _policeActive = false; if (isMultiplayer()) broadcastAction({ action: 'police_clear' }); }
      log(`Laid low at the gang hangout. Your crew covered for you. -${drop} Wanted.`, 'c-green');
      spawnParticlesAtDuck(0x44ff44, 12, 1.5, 1.5);
      hideSubMenu(); await updateHUD(); showMainActions();
    }});
  }
  showSubMenu(`${esc(p.gang)} - ${esc(p.gang_rank)}`, [...gangOptions,
    { label: 'Territory Map - See who controls each district', action: menuTerritoryMap },
    { label: 'Attack Territory - Fight rival gangs for turf ($150/day per territory)', action: menuAttackTerritory },
    { label: 'Diplomacy - Manage alliances with other gangs', action: menuDiplomacy },
    { label: `Recruit Members - Hire crew (have ${recruitCount})`, action: menuRecruit },
    { label: 'Upgrades - Safe house, weapons, smuggling routes', action: menuGangUpgrades },
    { label: `Buy Business - Earn passive daily income (own ${bizCount})`, action: menuBusiness },
    { label: `View Recruits - See your crew (${recruitCount} members)`, action: menuViewRecruits },
    { label: 'Leave Gang', action: async () => {
      showSubMenu('Leave Gang?', [
        { label: 'Yes, leave', action: async () => {
          await exec(`UPDATE player SET gang='', gang_rank=''`);
          log('Left the gang.', 'c-yellow');
          hideSubMenu(); await updateHUD(); showMainActions();
        }},
        { label: 'Cancel', action: () => { hideSubMenu(); showMainActions(); }}
      ]);
    }}
  ]);
  // Inject gang stats above the options
  const gangMenu = $('sub-menu');
  const gangStats = document.createElement('div');
  gangStats.style.cssText = 'margin-bottom:6px;font-size:11px';
  gangStats.innerHTML = gangInfo;
  gangMenu.insertBefore(gangStats, gangMenu.querySelector('.sub-options'));
}

async function menuTerritoryMap() {
  const p = await q1('SELECT city, gang FROM player');
  const territories = await q(`SELECT district, owner FROM territories WHERE city='${p.city.replace(/'/g,"''")}'`);
  const alliedGangs = new Set((await q(`SELECT gang FROM gang_relations WHERE relation='Allied'`)).map(r => r.gang));
  let html = '<table><tr><th>District</th><th>Owner</th><th>Status</th></tr>';
  for (const t of territories) {
    const isOwn = t.owner === p.gang;
    const isAlly = alliedGangs.has(t.owner);
    const color = isOwn ? 'c-green' : isAlly ? 'c-cyan' : t.owner === 'Unaffiliated' ? 'c-gray' : 'c-red';
    const status = isOwn ? 'YOURS' : isAlly ? 'ALLY' : t.owner === 'Unaffiliated' ? '-' : 'RIVAL';
    html += `<tr><td>${esc(t.district)}</td><td class="${color}">${esc(t.owner)}</td><td class="${color}">${status}</td></tr>`;
  }
  html += '</table>';
  showSubMenuHTML(`Territory - ${p.city}`, html);
}

async function menuDiplomacy() {
  const p = await q1('SELECT gang, city, respect FROM player');
  const localGangs = GANGS[p.city] || [];
  const otherGangs = localGangs.filter(g => g !== p.gang);
  if (otherGangs.length === 0) { log('No other gangs in this city.', 'c-yellow'); return; }
  const relations = await q('SELECT gang, relation FROM gang_relations');
  const relMap = {};
  for (const r of relations) relMap[r.gang] = r.relation;
  const options = [];
  for (const g of otherGangs) {
    const rel = relMap[g] || 'Hostile';
    const color = rel === 'Allied' ? 'c-green' : rel === 'Neutral' ? 'c-yellow' : 'c-red';
    const tCount = await qv(`SELECT COUNT(*) FROM territories WHERE owner='${g.replace(/'/g,"''")}'`);
    options.push({
      label: `${g} [${rel}] — ${tCount || 0} territories`,
      action: async () => {
        const actions = [];
        if (rel !== 'Allied' && p.respect >= 500) {
          actions.push({ label: `Propose Alliance ($1000, 500+ respect)`, action: async () => {
            const cash = await qv('SELECT cash FROM player');
            if (cash < 1000) { log('Need $1000 for diplomatic overtures!', 'c-red'); return; }
            if (chance(40 + Math.floor(p.respect / 200))) {
              await exec(`UPDATE player SET cash=cash-1000`);
              await exec(`DELETE FROM gang_relations WHERE gang='${g.replace(/'/g,"''")}'`);
              await exec(`INSERT INTO gang_relations VALUES ('${g.replace(/'/g,"''")}','Allied')`);
              log(`Alliance formed with ${g}! Allied territories share income.`, 'c-green');
              logAction('alliance', g);
              spawnParticlesAtDuck(0x44ff44, 15, 2, 1.5);
            } else {
              await exec(`UPDATE player SET cash=cash-1000`);
              log(`${g} rejected your alliance proposal. Money wasted.`, 'c-red');
            }
            hideSubMenu(); await updateHUD(); showMainActions();
          }});
        }
        if (rel !== 'Neutral') {
          actions.push({ label: `Set Neutral`, action: async () => {
            await exec(`DELETE FROM gang_relations WHERE gang='${g.replace(/'/g,"''")}'`);
            await exec(`INSERT INTO gang_relations VALUES ('${g.replace(/'/g,"''")}','Neutral')`);
            log(`Relations with ${g} set to Neutral.`, 'c-yellow');
            hideSubMenu(); await updateHUD(); showMainActions();
          }});
        }
        if (rel !== 'Hostile') {
          actions.push({ label: `Declare Hostile`, action: async () => {
            await exec(`DELETE FROM gang_relations WHERE gang='${g.replace(/'/g,"''")}'`);
            await exec(`INSERT INTO gang_relations VALUES ('${g.replace(/'/g,"''")}','Hostile')`);
            log(`Declared ${g} as hostile! Their territory is now fair game.`, 'c-red');
            hideSubMenu(); await updateHUD(); showMainActions();
          }});
        }
        if (rel === 'Allied') {
          actions.push({ label: `(Allied: +10% shared territory income, can't attack their turf)`, action: () => {} });
        }
        actions.push({ label: 'Back', action: () => menuDiplomacy() });
        showSubMenu(`${g} — ${rel}`, actions);
      }
    });
  }
  showSubMenu('Gang Diplomacy', options);
}

async function menuAttackTerritory() {
  const p = await q1('SELECT city, gang, respect FROM player');
  const safeGang = p.gang.replace(/'/g,"''");
  const safeCity = p.city.replace(/'/g,"''");
  // Filter out allied gangs — can't attack allies
  const alliedGangs = (await q(`SELECT gang FROM gang_relations WHERE relation='Allied'`)).map(r => r.gang);
  const allTargets = await q(`SELECT district, owner FROM territories WHERE city='${safeCity}' AND owner != '${safeGang}' AND owner != 'Unaffiliated'`);
  const targets = allTargets.filter(t => !alliedGangs.includes(t.owner));
  const unclaimed = await q(`SELECT district FROM territories WHERE city='${safeCity}' AND owner='Unaffiliated'`);
  if (targets.length === 0 && unclaimed.length === 0) {
    log('No territories to attack or claim here.', 'c-yellow');
    hideSubMenu(); showMainActions();
    return;
  }
  const options = [];
  for (const t of targets) {
    options.push({
      label: `Attack ${t.district} (${t.owner})`,
      action: async () => {
        setStatus(`Attacking ${t.district}...`);
        const recruitCount = (await qv('SELECT COUNT(*) FROM recruits')) || 0;
        const upgrades = (await qv(`SELECT COALESCE(SUM(level),0) FROM gang_upgrades`)) || 0;
        const strength = recruitCount * 2 + upgrades * 5;
        await advanceTime(3);
        if (chance(Math.min(40 + strength, 85))) {
          await exec(`UPDATE territories SET owner='${safeGang}' WHERE district='${t.district.replace(/'/g,"''")}' AND city='${safeCity}'`);
          const respect = rand(25, 100);
          await exec(`UPDATE player SET respect=respect+${respect}`);
          log(`Victory! Took ${t.district} from ${t.owner}! +${respect} Respect`, 'c-green');
          spawnParticlesAtDuck(0x44ff44, 20, 2, 2);
          await updateRank();
        } else {
          const dmg = rand(20, 50);
          await exec(`UPDATE player SET health=GREATEST(0,health-${dmg}), respect=GREATEST(0,respect-75)`);
          log(`Defeat! Failed to take ${t.district}. -${dmg} HP, -75 Respect.`, 'c-red');
          spawnParticlesAtDuck(0xff2222, 15, 1.5, 1);
          await checkDeath();
        }
        clearStatus();
        await processWorldEvents(); await checkPolice();
        hideSubMenu(); await updateHUD(); showMainActions();
      }
    });
  }
  for (const t of unclaimed) {
    options.push({
      label: `Claim ${t.district} (Unclaimed)`,
      action: async () => {
        await exec(`UPDATE territories SET owner='${safeGang}' WHERE district='${t.district.replace(/'/g,"''")}' AND city='${safeCity}'`);
        const respect = rand(10, 30);
        await exec(`UPDATE player SET respect=respect+${respect}`);
        log(`Claimed ${t.district} for ${p.gang}! +${respect} Respect`, 'c-green');
        spawnParticlesAtDuck(0x44ff44, 12, 1.5, 1.5);
        await advanceTime(2); await processWorldEvents();
        await updateRank();
        hideSubMenu(); await updateHUD(); showMainActions();
      }
    });
  }
  showSubMenu('Attack / Claim Territory', options);
}

async function menuRecruit() {
  const p = await q1('SELECT cash, gang FROM player');
  const recruitCount = (await qv('SELECT COUNT(*) FROM recruits')) || 0;
  const safeLevel = (await qv(`SELECT level FROM gang_upgrades WHERE name='safe_house'`)) || 0;
  const maxRecruits = 2 + safeLevel * 2;
  if (recruitCount >= maxRecruits) { log(`Max recruits (${maxRecruits}). Upgrade safe house for more.`, 'c-yellow'); return; }
  let cost = rand(200, 500);
  const hasPerk = await qv(`SELECT unlocked FROM perks WHERE name='Charismatic Leader'`);
  if (hasPerk) cost = Math.floor(cost * 0.75);
  if (p.cash < cost) { log(`Need $${cost} to recruit!`, 'c-red'); return; }
  const names = ['Rico','Smoke','Ryder','Sweet','Cesar','Woozie','Catalina','T-Bone','8-Ball','Salvatore'];
  const name = names[rand(0, names.length - 1)];
  const str = rand(3, 10); const upkeep = rand(20, 60);
  await exec(`UPDATE player SET cash=cash-${cost}`);
  await exec(`INSERT INTO recruits(name,strength,upkeep) VALUES ('${name}',${str},${upkeep})`);
  log(`Recruited ${name} (Strength: ${str}, Upkeep: $${upkeep}/day) for $${cost}!`, 'c-cyan');
  await updateHUD();
}

async function menuGangUpgrades() {
  const upgrades = await q('SELECT * FROM gang_upgrades');
  const options = upgrades.map(u => ({
    label: `${u.name} (Lv.${u.level}) - $${(u.level + 1) * 500}`,
    action: async () => {
      const cost = (u.level + 1) * 500;
      const cash = await qv('SELECT cash FROM player');
      if (cash < cost) { log('Not enough cash!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-${cost}`);
      await exec(`UPDATE gang_upgrades SET level=level+1 WHERE name='${u.name}'`);
      log(`Upgraded ${u.name} to level ${u.level + 1}!`, 'c-green');
      await updateHUD(); await menuGangUpgrades();
    }
  }));
  showSubMenu('Gang Upgrades', options);
}

async function menuBusiness() {
  const p = await q1('SELECT city, cash FROM player');
  const bizTypes = [
    { name: 'Car Wash', type: 'Legal', income: 200, price: 5000 },
    { name: 'Nightclub', type: 'Legal', income: 350, price: 8000 },
    { name: 'Chop Shop', type: 'IllegalFront', income: 500, price: 10000 },
    { name: 'Drug Lab', type: 'IllegalFront', income: 700, price: 15000 },
    { name: 'Strip Club', type: 'Legal', income: 400, price: 7000 }
  ];
  const owned = await q(`SELECT name FROM businesses WHERE city='${p.city.replace(/'/g,"''")}'`);
  const ownedSet = new Set(owned.map(b => b.name));
  let html = '<table><tr><th>Business</th><th>Type</th><th>$/day</th><th>Price</th><th></th></tr>';
  for (const biz of bizTypes) {
    const isOwned = ownedSet.has(biz.name);
    html += `<tr><td>${biz.name}</td><td>${biz.type}</td><td>$${biz.income}</td><td>$${biz.price}</td>`;
    html += `<td>${isOwned ? '<span class="c-green">OWNED</span>' : `<button class="btn buy-biz" data-name="${biz.name}" data-type="${biz.type}" data-income="${biz.income}" data-price="${biz.price}">Buy</button>`}</td></tr>`;
  }
  html += '</table>';
  showSubMenuHTML(`Businesses - ${p.city}`, html);
  $('sub-menu').querySelectorAll('.buy-biz').forEach(btn => {
    btn.addEventListener('click', async () => {
      const price = parseInt(btn.dataset.price);
      const cash = await qv('SELECT cash FROM player');
      if (cash < price) { log('Not enough cash!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-${price}`);
      await exec(`INSERT INTO businesses VALUES ('${btn.dataset.name}','${p.city.replace(/'/g,"''")}','${btn.dataset.type}',${btn.dataset.income})`);
      log(`Bought ${btn.dataset.name} for $${price}! Income: $${btn.dataset.income}/day`, 'c-green');
      await updateHUD(); await menuBusiness();
    });
  });
}

async function menuViewRecruits() {
  const recruits = await q('SELECT * FROM recruits');
  if (recruits.length === 0) { log('No recruits yet.', 'c-yellow'); return; }
  let html = '<table><tr><th>Name</th><th>Str</th><th>$/day</th></tr>';
  for (const r of recruits) html += `<tr><td>${r.name}</td><td>${r.strength}</td><td>$${r.upkeep}</td></tr>`;
  html += '</table>';
  showSubMenuHTML('Your Crew', html);
}

// --------------------------------------------------------
//  STRIP CLUB
// --------------------------------------------------------
async function menuStripClub() {
  const p = await q1('SELECT cash, health, wanted_level, city FROM player');
  const ownsClub = await qv(`SELECT COUNT(*) FROM businesses WHERE type='strip_club' AND city='${p.city.replace(/'/g,"''")}'`);
  const stripOptions = [];
  if (ownsClub > 0) {
    stripOptions.push({ label: 'Hide out in the back office (Heal, lose cops)', action: async () => {
      stopSiren(); clearPoliceNPCs(); _policeActive = false;
      await exec(`UPDATE player SET wanted_level=0, health=LEAST(100,health+30)`);
      await advanceTime(3);
      log('Hid out in your own club. Cops lost your trail. +30 HP, wanted cleared.', 'c-green');
      spawnParticlesAtDuck(0x44ff44, 10, 1.5, 1.5);
      hideSubMenu(); await updateHUD(); showMainActions();
    }});
  }
  showSubMenu(ownsClub > 0 ? 'Your Strip Club' : 'Strip Club', [...stripOptions,
    { label: 'Lap Dance - $75 (+15 HP)', action: async () => {
      if (p.cash < 75) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await exec(`UPDATE player SET cash=cash-75, health=LEAST(100,health+15)`);
      await advanceTime(1);
      log('Enjoyed a lap dance. Feeling relaxed. +15 HP.', 'c-magenta');
      spawnParticlesAtDuck(0xff66aa, 8, 1, 1.5);
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'VIP Room - $200 (+30 HP, -1 Wanted)', action: async () => {
      if (p.cash < 200) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await exec(`UPDATE player SET cash=cash-200, health=LEAST(100,health+30), wanted_level=GREATEST(0,wanted_level-1)`);
      await advanceTime(2);
      log('VIP treatment. Nobody looks for you here. +30 HP, -1 Wanted.', 'c-magenta');
      spawnParticlesAtDuck(0xff66aa, 15, 1.5, 2);
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Champagne Room - $500 (+50 HP, +10 Respect, -3 Wanted)', action: async () => {
      if (p.cash < 500) { log('Not enough cash for the high life!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await exec(`UPDATE player SET cash=cash-500, health=LEAST(100,health+50), respect=respect+10, wanted_level=GREATEST(0,wanted_level-3)`);
      await advanceTime(3);
      const newWanted = await qv('SELECT wanted_level FROM player');
      if (newWanted <= 0) { stopSiren(); clearPoliceNPCs(); _policeActive = false; if (isMultiplayer()) broadcastAction({ action: 'police_clear' }); }
      log('Big spender! The whole club knows your name. +50 HP, +10 Respect, -3 Wanted.', 'c-gold');
      spawnParticlesAtDuck(0xffd700, 20, 2, 2);
      await maybeSkillUp('charisma');
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Buy Drinks & Hang Out - $30 (-1 Wanted)', action: async () => {
      if (p.cash < 30) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await exec(`UPDATE player SET cash=cash-30, wanted_level=GREATEST(0,wanted_level-1)`);
      await advanceTime(2);
      log('Laid low at the strip club for a while. -1 Wanted.', 'c-cyan');
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    ...(p.wanted_level >= 2 ? [{ label: `Lay Low in the Back - $150 (-${Math.min(p.wanted_level, 3)} Wanted, 4 hrs)`, action: async () => {
      if (p.cash < 150) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      const drop = Math.min(Number(p.wanted_level), 3);
      await exec(`UPDATE player SET cash=cash-150, wanted_level=GREATEST(0,wanted_level-${drop})`);
      await advanceTime(4);
      const newWanted = await qv('SELECT wanted_level FROM player');
      if (newWanted <= 0) { stopSiren(); clearPoliceNPCs(); _policeActive = false; if (isMultiplayer()) broadcastAction({ action: 'police_clear' }); }
      log(`Hid in the back rooms for hours. The heat died down. -${drop} Wanted.`, 'c-green');
      spawnParticlesAtDuck(0xff66aa, 12, 1.5, 1.5);
      hideSubMenu(); await updateHUD(); showMainActions();
    }}] : [])
  ]);
}

// --------------------------------------------------------
//  GAMBLING
// --------------------------------------------------------
async function menuGambling() {
  // Check if at gambling POI or nighttime
  const clk = await q1('SELECT hour FROM game_clock');
  const p = await q1('SELECT x, y FROM player');
  const isNight = clk.hour < 5 || clk.hour > 21;
  const atGamblingPOI = currentMapGrid && currentMapGrid[p.y][p.x] === T.POI_GAMBLING;
  if (!isNight && !atGamblingPOI) {
    log('Gambling is only available at night or at a Gambling Den [B].', 'c-yellow');
    return;
  }
  showSubMenu(atGamblingPOI ? 'Gambling Den' : 'Street Gambling (Night)', [
    { label: 'Slot Machine ($100)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 100) { log('Need $100 to play!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-100`);
      const symbols = ['7','7','7','$','$','$','*','*','#','#','!','@'];
      const r1 = symbols[rand(0, symbols.length-1)], r2 = symbols[rand(0, symbols.length-1)], r3 = symbols[rand(0, symbols.length-1)];
      log(`[ ${r1} | ${r2} | ${r3} ]`, 'c-yellow');
      if (r1 === r2 && r2 === r3) {
        const win = r1 === '7' ? 25000 : r1 === '$' ? 5000 : 2000;
        await exec(`UPDATE player SET cash=cash+${win}`); log(`JACKPOT! Won $${win}!`, 'c-gold'); spawnParticlesAtDuck(0xffd700, 25, 3, 2);
      } else if (r1 === r2 || r2 === r3) {
        await exec(`UPDATE player SET cash=cash+300`); log('Partial match! Won $300.', 'c-green');
      } else { log('No luck this time.', 'c-gray'); }
      await updateHUD();
    }},
    { label: 'Dice Roll ($250)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 250) { log('Need $250 to play!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-250`);
      const d1 = rand(1,6), d2 = rand(1,6), total = d1 + d2;
      log(`Rolled: [${d1}] [${d2}] = ${total}`, 'c-yellow');
      if (total === 7 || total === 11) { await exec(`UPDATE player SET cash=cash+1000`); log('Winner! +$1,000!', 'c-green'); }
      else if (total === 2 || total === 12) { await exec(`UPDATE player SET cash=cash+2500`); log('Snake eyes / boxcars! +$2,500!', 'c-gold'); }
      else { log('House wins.', 'c-gray'); }
      await updateHUD();
    }},
    { label: 'High Stakes Poker ($1,000)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 1000) { log('Need $1,000 for the big table!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-1000`);
      const charisma = await getSkill('charisma');
      if (chance(30 + charisma * 3)) {
        const win = rand(3000, 10000);
        await exec(`UPDATE player SET cash=cash+${win}`); log(`Read them like a book. Won $${win.toLocaleString()}!`, 'c-gold');
        await maybeSkillUp('charisma');
      } else { log('Poker face failed. Lost your buy-in.', 'c-red'); }
      await updateHUD();
    }},
    { label: '*** Rob the Gambling Den ***', action: () => robLocation('Gambling Den', 200, 800, 20, 8) }
  ]);
}

// --------------------------------------------------------
//  STREET RACING
// --------------------------------------------------------
let _raceTimeout = null;
let _raceActive = false;

async function menuStreetRace() {
  const hasVehicle = await qv(`SELECT COUNT(*) FROM vehicles WHERE stored=0`);
  if (!hasVehicle) { log('You need a vehicle to street race!', 'c-red'); return; }
  if (_raceActive) { log('A race is already in progress!', 'c-yellow'); return; }
  const drivingSkill = await getSkill('driving');
  const buyIn = rand(200, 1000);
  const cash = await qv('SELECT cash FROM player');
  if (cash < buyIn) { log(`Need $${buyIn} buy-in for the race!`, 'c-red'); return; }

  if (isMultiplayer()) {
    // Multiplayer race — broadcast challenge, 5 second window
    showSubMenu(`Street Race Challenge - $${buyIn} buy-in`, [
      { label: `Challenge all players ($${buyIn} buy-in, 10s to join, losers forfeit)`, action: async () => {
        await exec(`UPDATE player SET cash=cash-${buyIn}`);
        _raceActive = true;
        const playerName = (await q1('SELECT name FROM player')).name;
        broadcastAction({ action: 'race_challenge', name: playerName, buyIn });
        log(`Race challenge sent! $${buyIn} buy-in. Waiting 10 seconds for racers...`, 'c-yellow');
        hideSubMenu(); await updateHUD();
        // Wait 10s then resolve race
        _raceTimeout = setTimeout(async () => {
          const racers = _raceAcceptors || [];
          const totalPot = buyIn * (racers.length + 1);
          log(`Race starts! ${racers.length + 1} racer${racers.length ? 's' : ''}, pot: $${totalPot}`, 'c-cyan');
          await advanceTime(1);
          // Calculate win — driving skill + vehicle speed + randomness
          const activeV = await q1(`SELECT name FROM vehicles WHERE stored=0 LIMIT 1`);
          const vDef = activeV ? VEHICLES.find(v => v.name === activeV.name) : null;
          const myScore = drivingSkill * 5 + (vDef?.speed || 2) * 10 + rand(0, 50);
          let won = true;
          for (const r of racers) {
            const opScore = rand(10, 60) + rand(0, 40); // NPC-like randomness for peers
            if (opScore > myScore) { won = false; break; }
          }
          if (racers.length === 0) {
            // Solo race against NPCs
            won = chance(30 + drivingSkill * 5 + (vDef?.speed || 2) * 5);
          }
          if (won) {
            await exec(`UPDATE player SET cash=cash+${totalPot}`);
            log(`YOU WON THE RACE! Prize: $${totalPot}!`, 'c-green');
            spawnParticlesAtDuck(0xffd700, 25, 3, 2);
            broadcastAction({ action: 'race_result', winner: playerName, pot: totalPot });
            await maybeSkillUp('driving');
          } else {
            log(`You lost the race! Forfeited $${buyIn}.`, 'c-red');
            broadcastAction({ action: 'race_result', winner: 'someone else', pot: totalPot });
            spawnParticlesAtDuck(0xff2222, 15, 2, 1);
          }
          if (chance(25)) await exec(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`);
          _raceActive = false;
          _raceAcceptors = [];
          await updateHUD(); showMainActions();
        }, 10000);
      }},
      { label: 'Solo Race (vs NPCs)', action: () => _soloRace(buyIn, drivingSkill) }
    ]);
  } else {
    // Single player — just solo race
    showSubMenu(`Street Race - $${buyIn} buy-in`, [
      { label: 'Enter Race', action: () => _soloRace(buyIn, drivingSkill) }
    ]);
  }
}

let _raceAcceptors = [];

async function _soloRace(buyIn, drivingSkill) {
  setStatus('Street racing...');
  await exec(`UPDATE player SET cash=cash-${buyIn}`);
  await advanceTime(1);
  const activeV = await q1(`SELECT name FROM vehicles WHERE stored=0 LIMIT 1`);
  const vDef = activeV ? VEHICLES.find(v => v.name === activeV.name) : null;
  const winChance = 25 + drivingSkill * 5 + (vDef?.speed || 2) * 5;
  if (chance(winChance)) {
    const prize = buyIn * 3;
    await exec(`UPDATE player SET cash=cash+${prize}`);
    log(`Won the race! Prize: $${prize}!`, 'c-green');
    spawnParticlesAtDuck(0xffd700, 20, 3, 2);
    await maybeSkillUp('driving');
  } else if (chance(50)) {
    log('Came in second. Got your buy-in back.', 'c-yellow');
    await exec(`UPDATE player SET cash=cash+${buyIn}`);
  } else {
    const dmg = rand(5, 20);
    await exec(`UPDATE player SET health=GREATEST(0,health-${dmg})`);
    log(`Crashed out! Lost $${buyIn} and ${dmg}% HP.`, 'c-red'); await checkDeath();
  }
  if (chance(30)) await exec(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`);
  clearStatus();
  await checkPolice(); hideSubMenu(); await updateHUD(); showMainActions();
}

// --------------------------------------------------------
//  PERKS
// --------------------------------------------------------
async function menuPerks() {
  const p = await q1('SELECT perk_points FROM player');
  const perks = await q('SELECT * FROM perks');
  const perkMap = {}; for (const pk of perks) perkMap[pk.name] = pk.unlocked;
  let html = `<div class="c-yellow">Perk Points: ${p.perk_points}</div><table><tr><th>Perk</th><th>Tier</th><th>Cost</th><th>Effect</th><th></th></tr>`;
  for (const perk of PERKS) {
    const unlocked = perkMap[perk.name];
    html += `<tr><td>${perk.name}</td><td>${perk.tier}</td><td>${perk.cost}pt</td><td>${perk.desc}</td>`;
    html += `<td>${unlocked ? '<span class="c-green">UNLOCKED</span>' : `<button class="btn unlock-perk" data-name="${perk.name}" data-cost="${perk.cost}">Unlock</button>`}</td></tr>`;
  }
  html += '</table>';
  showSubMenuHTML('Perks', html);
  $('sub-menu').querySelectorAll('.unlock-perk').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cost = parseInt(btn.dataset.cost);
      const pp = (await qv('SELECT perk_points FROM player')) || 0;
      if (pp < cost) { log('Not enough perk points!', 'c-red'); return; }
      await exec(`UPDATE player SET perk_points=perk_points-${cost}`);
      await exec(`UPDATE perks SET unlocked=1 WHERE name='${btn.dataset.name.replace(/'/g,"''")}'`);
      log(`Unlocked perk: ${btn.dataset.name}!`, 'c-magenta');
      await updateHUD(); await menuPerks();
    });
  });
}

// --------------------------------------------------------
//  PVP BOUNTIES
// --------------------------------------------------------
async function menuBounties() {
  if (!isMultiplayer()) { log('Bounties are multiplayer only.', 'c-gray'); showMainActions(); return; }
  const p = await q1('SELECT cash, name FROM player');
  const peers = getPeers();
  const localId = getLocalPeerId();
  let html = '';

  // Show active bounties
  if (_activeBounties.size > 0) {
    html += '<div class="c-red" style="margin-bottom:6px">--- Active Bounties ---</div>';
    for (const [targetId, bounty] of _activeBounties) {
      const targetName = targetId === localId ? 'YOU' : (peers.get(targetId)?.name || targetId.slice(0, 8));
      html += `<div style="color:#ff8800;margin:2px 0">$${bounty.amount.toLocaleString()} on ${targetName} (placed by ${bounty.placedByName})</div>`;
    }
  } else {
    html += '<div class="c-gray" style="margin-bottom:6px">No active bounties.</div>';
  }

  // Place bounty options
  html += '<div class="c-yellow" style="margin-top:8px">--- Place a Bounty ---</div>';
  if (peers.size === 0) {
    html += '<div class="c-gray">No other players to target.</div>';
  } else {
    for (const [pid, info] of peers) {
      const amounts = [500, 1000, 5000, 10000];
      for (const amt of amounts) {
        if (p.cash >= amt) {
          html += `<div style="margin:2px 0"><button class="btn place-bounty" data-target="${pid}" data-amount="${amt}" data-name="${info.name || pid.slice(0, 8)}">$${amt.toLocaleString()} on ${info.name || pid.slice(0, 8)}</button></div>`;
        }
      }
    }
  }

  showSubMenuHTML('Bounty Board', html);
  $('sub-menu').querySelectorAll('.place-bounty').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.dataset.target;
      const amount = parseInt(btn.dataset.amount);
      const targetName = btn.dataset.name;
      const cash = await qv('SELECT cash FROM player');
      if (cash < amount) { log('Not enough cash!', 'c-red'); return; }
      await exec(`UPDATE player SET cash=cash-${amount}`);
      _activeBounties.set(targetId, { amount, placedBy: localId, placedByName: p.name });
      broadcastAction({ action: 'bounty_placed', targetId, amount, targetName });
      log(`Placed $${amount.toLocaleString()} bounty on ${targetName}!`, 'c-red');
      hideSubMenu(); await updateHUD(); showMainActions();
    });
  });
}

// --------------------------------------------------------
//  HEISTS
// --------------------------------------------------------
async function menuHeists() {
  const p = await q1('SELECT city, cash, respect FROM player');
  const completed = await q('SELECT heist_id, step, completed FROM heist_progress');
  const completedMap = new Map(completed.map(h => [h.heist_id, h]));

  // Available heists: in current city, not completed, meets skill req
  const available = [];
  const inProgress = [];
  const done = [];
  for (const h of HEISTS) {
    const prog = completedMap.get(h.id);
    if (prog?.completed) { done.push(h); continue; }
    if (h.city !== p.city) continue;
    const skill = await getSkill(h.skill);
    if (skill < h.skillReq) continue;
    if (prog && prog.step > 0) { inProgress.push({ heist: h, step: prog.step }); continue; }
    available.push(h);
  }

  const tierNames = { 1: 'Petty', 2: 'Small Job', 3: 'Professional', 4: 'Major', 5: 'Legendary' };
  const tierColors = { 1: '#aaa', 2: '#4488ff', 3: '#ff8800', 4: '#ff4444', 5: '#ff00ff' };
  let html = `<div class="c-gray" style="font-size:10px;margin-bottom:6px">${done.length}/${HEISTS.length} heists completed</div>`;

  if (inProgress.length > 0) {
    html += '<div class="c-yellow">--- In Progress ---</div>';
    for (const { heist: h, step } of inProgress) {
      html += `<div style="margin:3px 0"><button class="btn heist-continue" data-id="${h.id}" style="text-align:left;width:100%">`;
      html += `<span style="color:${tierColors[h.tier]}">[${tierNames[h.tier]}]</span> ${h.name} — Step ${step + 1}/${h.steps.length}: ${h.steps[step]}`;
      html += `</button></div>`;
    }
  }

  if (available.length > 0) {
    html += '<div class="c-yellow" style="margin-top:6px">--- Available ---</div>';
    for (const h of available) {
      const payRange = `$${(h.payout[0]/1000).toFixed(0)}K-$${(h.payout[1]/1000).toFixed(0)}K`;
      const crewTxt = h.crew > 0 ? `, ${h.crew} crew` : '';
      const costTxt = h.setupCost > 0 ? `, $${h.setupCost.toLocaleString()} setup` : '';
      html += `<div style="margin:3px 0"><button class="btn heist-start" data-id="${h.id}" style="text-align:left;width:100%">`;
      html += `<span style="color:${tierColors[h.tier]}">[${tierNames[h.tier]}]</span> ${h.name} — ${payRange}${crewTxt}${costTxt}`;
      html += `</button></div>`;
    }
  } else if (inProgress.length === 0) {
    html += '<div class="c-gray" style="margin-top:6px">No heists available here. Travel to another city or level up skills.</div>';
  }

  if (done.length > 0) {
    html += `<div class="c-gray" style="margin-top:6px;font-size:10px">Completed: ${done.map(h => h.name).join(', ')}</div>`;
  }

  showSubMenuHTML(`Heists — ${p.city}`, html);

  $('sub-menu').querySelectorAll('.heist-start').forEach(btn => {
    btn.addEventListener('click', async () => {
      const h = HEISTS.find(x => x.id === parseInt(btn.dataset.id));
      if (!h) return;
      const cash = await qv('SELECT cash FROM player');
      if (cash < h.setupCost) { log(`Need $${h.setupCost.toLocaleString()} for setup costs!`, 'c-red'); return; }
      const recruits = (await qv('SELECT COUNT(*) FROM recruits')) || 0;
      if (h.crew > 0 && recruits < h.crew) { log(`Need ${h.crew} crew members! Recruit at Gang HQ [8].`, 'c-red'); return; }
      hideSubMenu();
      if (h.setupCost > 0) await exec(`UPDATE player SET cash=cash-${h.setupCost}`);
      await exec(`INSERT INTO heist_progress VALUES (${h.id}, 0, FALSE) ON CONFLICT(heist_id) DO UPDATE SET step=0, completed=FALSE`);
      log(`Started heist: ${h.name}`, 'c-gold');
      log(`Step 1/${h.steps.length}: ${h.steps[0]}`, 'c-yellow');
      logAction('heist_start', h.name);
      await _executeHeistStep(h, 0);
    });
  });

  $('sub-menu').querySelectorAll('.heist-continue').forEach(btn => {
    btn.addEventListener('click', async () => {
      const h = HEISTS.find(x => x.id === parseInt(btn.dataset.id));
      if (!h) return;
      const prog = await q1(`SELECT step FROM heist_progress WHERE heist_id=${h.id}`);
      if (!prog) return;
      hideSubMenu();
      await _executeHeistStep(h, prog.step);
    });
  });
}

async function _executeHeistStep(heist, stepIdx) {
  const step = heist.steps[stepIdx];
  const skill = await getSkill(heist.skill);
  const baseChance = 50 + skill * 4 - heist.tier * 5;
  const successChance = Math.min(95, Math.max(20, baseChance));

  setStatus(`Heist: ${step}...`);
  await advanceTime(1);

  if (chance(successChance)) {
    // Step succeeded
    if (stepIdx >= heist.steps.length - 1) {
      // HEIST COMPLETE!
      const payout = rand(heist.payout[0], heist.payout[1]);
      await exec(`UPDATE player SET cash=cash+${payout}, wanted_level=LEAST(5,wanted_level+${heist.wanted}), respect=respect+${heist.tier * 50}`);
      await exec(`UPDATE heist_progress SET step=${stepIdx + 1}, completed=TRUE WHERE heist_id=${heist.id}`);
      log(`HEIST COMPLETE: ${heist.name}!`, 'c-gold');
      log(`Payout: $${payout.toLocaleString()} | +${heist.tier * 50} Respect | +${heist.wanted} Wanted`, 'c-green');
      spawnParticlesAtDuck(0xffd700, 30, 3, 2);
      logAction('heist_complete', `${heist.name} +$${payout}`);
      await maybeSkillUp(heist.skill);
    } else {
      // Advance to next step
      await exec(`UPDATE heist_progress SET step=${stepIdx + 1} WHERE heist_id=${heist.id}`);
      log(`Step ${stepIdx + 1}/${heist.steps.length} complete: ${step}`, 'c-green');
      log(`Next: ${heist.steps[stepIdx + 1]}`, 'c-yellow');
      spawnParticlesAtDuck(0x44ff44, 10, 1.5, 1);
    }
  } else {
    // Step failed
    const dmg = rand(5, 15) * heist.tier;
    const lostCash = rand(100, 500) * heist.tier;
    await exec(`UPDATE player SET health=GREATEST(0,health-${dmg}), cash=GREATEST(0,cash-${lostCash}), wanted_level=LEAST(5,wanted_level+${Math.ceil(heist.wanted/2)})`);
    log(`Heist step FAILED: ${step}`, 'c-red');
    log(`-${dmg} HP, -$${lostCash}, +${Math.ceil(heist.wanted/2)} Wanted. Try again from this step.`, 'c-red');
    spawnParticlesAtDuck(0xff2222, 15, 2, 1);
    logAction('heist_fail', `${heist.name} step ${stepIdx + 1}`);
    await checkDeath();
  }
  clearStatus();
  await updateHUD();
  showMainActions();
}

// --------------------------------------------------------
//  INVENTORY
// --------------------------------------------------------
async function menuInventory() {
  const guns = await q('SELECT * FROM guns');
  const items = await q('SELECT * FROM inventory');
  const drugs = await q('SELECT * FROM drugs WHERE qty > 0');
  const vehicles = await q('SELECT * FROM vehicles');
  const skills = await q('SELECT * FROM skills');
  const active = vehicles.find(v => !v.stored);

  let html = '';

  // Quick vehicle status bar at top
  html += `<div style="background:#111;padding:6px 8px;border-radius:4px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">`;
  html += `<span style="color:#888;font-size:10px">${active ? `Driving: <span class="c-green">${active.name}</span>` : '<span class="c-gray">On foot</span>'}</span>`;
  html += `<button class="btn switch-vehicle" data-name="" style="font-size:9px;padding:2px 8px">${active ? 'Exit Vehicle' : 'On Foot'}</button>`;
  html += `</div>`;

  // Guns
  html += '<div class="c-yellow">Weapons</div>';
  if (guns.length === 0) html += '<div class="c-gray" style="font-size:10px">None — visit Ammu-Nation [4]</div>';
  else {
    for (const g of guns) {
      const eq = g.equipped ? ' <span class="c-green">equipped</span>' : '';
      html += `<div style="margin:2px 0"><button class="btn equip-gun" data-name="${g.name}" style="text-align:left;width:100%">${g.name} <span class="c-gray">(${g.category} +${g.bonus})</span>${eq}</button></div>`;
    }
  }

  // Items
  if (items.length > 0) {
    html += '<div class="c-yellow" style="margin-top:8px">Items</div>';
    for (const i of items) {
      html += `<div style="margin:2px 0;display:flex;align-items:center;justify-content:space-between"><span class="c-white">${i.item} <span class="c-gray">x${i.qty}</span></span>`;
      if (i.item === 'Health Pack' || i.item === 'Fake ID') html += `<button class="btn use-item" data-item="${i.item}" style="font-size:9px;padding:2px 8px">Use</button>`;
      html += '</div>';
    }
  }

  // Drugs
  if (drugs.length > 0) {
    html += '<div class="c-yellow" style="margin-top:8px">Drugs</div><table>';
    for (const d of drugs) html += `<tr><td>${d.name}</td><td class="c-gray">x${d.qty}</td></tr>`;
    html += '</table>';
  }

  // Garage
  html += '<div class="c-yellow" style="margin-top:8px">Garage</div>';
  if (vehicles.length === 0) html += '<div class="c-gray" style="font-size:10px">No vehicles — steal or buy one</div>';
  else {
    for (const v of vehicles) {
      const isActive = !v.stored;
      html += `<div style="margin:2px 0;display:flex;gap:4px;align-items:center">`;
      html += `<button class="btn switch-vehicle" data-name="${v.name}" data-stored="${v.stored}" style="flex:1;text-align:left">${v.name} ${isActive ? '<span class="c-green">[driving]</span>' : '<span class="c-gray">(garaged)</span>'}</button>`;
      html += `<button class="btn sell-vehicle" data-name="${v.name}" style="font-size:9px;padding:2px 6px;color:#ff4444">Sell</button>`;
      html += `</div>`;
    }
  }

  // Skills (collapsed)
  html += '<div class="c-yellow" style="margin-top:8px">Skills</div><div style="display:flex;flex-wrap:wrap;gap:6px">';
  for (const s of skills) html += `<span class="c-white" style="font-size:10px">${s.name} <span class="c-cyan">Lv.${s.level}</span></span>`;
  html += '</div>';

  showSubMenuHTML('Inventory', html);
  $('sub-menu').querySelectorAll('.use-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.dataset.item;
      const qty = (await qv(`SELECT qty FROM inventory WHERE item='${item}'`)) || 0;
      if (qty <= 0) { log(`No ${item} left!`, 'c-red'); return; }
      if (item === 'Health Pack') {
        const hasPerk = await qv(`SELECT unlocked FROM perks WHERE name='Back Alley Surgeon'`);
        const heal = hasPerk ? 50 : 40;
        await exec(`UPDATE player SET health=LEAST(100,health+${heal})`);
        log(`Used Health Pack. +${heal} HP.`, 'c-green');
      } else if (item === 'Fake ID') {
        await exec(`UPDATE player SET wanted_level=GREATEST(0,wanted_level-1)`);
        log('Used Fake ID. Wanted level reduced by 1.', 'c-green');
      }
      await exec(`UPDATE inventory SET qty=qty-1 WHERE item='${item}'`);
      await exec(`DELETE FROM inventory WHERE qty <= 0`);
      await updateHUD(); await menuInventory();
    });
  });
  $('sub-menu').querySelectorAll('.switch-vehicle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      if (!name) {
        // Go on foot — store all active vehicles
        await exec(`UPDATE vehicles SET stored=1 WHERE stored=0`);
        log('Going on foot. All vehicles stored.', 'c-cyan');
      } else {
        const isStored = btn.dataset.stored === '1';
        if (isStored) {
          // Take out of garage and make active
          await exec(`UPDATE vehicles SET stored=1 WHERE stored=0`); // store current
          await exec(`UPDATE vehicles SET stored=0 WHERE name='${name.replace(/'/g,"''")}'`);
          log(`Switched to ${name}. Other vehicles stored.`, 'c-green');
        } else {
          log(`Already driving ${name}.`, 'c-gray');
        }
      }
      await updateHUD(); await menuInventory();
    });
  });
  $('sub-menu').querySelectorAll('.equip-gun').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      await exec(`UPDATE guns SET equipped=FALSE`);
      await exec(`UPDATE guns SET equipped=TRUE WHERE name='${name.replace(/'/g,"''")}'`);
      log(`Equipped ${name}.`, 'c-green');
      await updateHUD(); await menuInventory();
    });
  });
  $('sub-menu').querySelectorAll('.sell-vehicle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      const vDef = VEHICLES.find(v => v.name === name);
      const sellPrice = vDef ? Math.floor(vDef.price * 0.4) : rand(200, 1000);
      await exec(`DELETE FROM vehicles WHERE name='${name.replace(/'/g,"''")}'`);
      await exec(`UPDATE player SET cash=cash+${sellPrice}`);
      log(`Sold ${name} for $${sellPrice.toLocaleString()}.`, 'c-green');
      await updateHUD(); await menuInventory();
    });
  });
}

// --------------------------------------------------------
//  NEWS
// --------------------------------------------------------
async function menuNews() {
  const events = await q('SELECT * FROM world_events ORDER BY id DESC LIMIT 15');
  if (events.length === 0) { showSubMenuHTML('News Feed', '<div class="c-gray">No news yet...</div>'); return; }
  let html = '';
  for (const e of events) html += `<div class="c-orange">Day ${e.day} ${String(e.hour).padStart(2,'0')}:00 - ${e.description}</div>`;
  showSubMenuHTML('News Feed', html);
}

// --------------------------------------------------------
//  STATS & LEADERBOARD (SQL analytics over action_log)
// --------------------------------------------------------
async function menuStats() {
  const totalActions = (await qv('SELECT COUNT(*) FROM action_log')) || 0;
  if (totalActions === 0) { showSubMenuHTML('Stats Dashboard', '<div class="c-gray">No stats yet — play the game first!</div>'); return; }

  const p = await q1('SELECT * FROM player');
  const clk = await q1('SELECT * FROM game_clock');

  // Core stats via SQL analytics
  const crimeSuccesses = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='crime_success'`)) || 0;
  const crimeFails = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='crime_fail'`)) || 0;
  const crimeTotal = crimeSuccesses + crimeFails;
  const crimeRate = crimeTotal > 0 ? Math.round(crimeSuccesses / crimeTotal * 100) : 0;

  const kills = (await qv(`SELECT COUNT(*) FROM action_log WHERE action IN ('kill_npc','kill_cop')`)) || 0;
  const copKills = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='kill_cop'`)) || 0;
  const deaths = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='death'`)) || 0;
  const kd = deaths > 0 ? (kills / deaths).toFixed(1) : kills > 0 ? 'INF' : '0';

  const robSuccesses = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='rob_success'`)) || 0;
  const robFails = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='rob_fail'`)) || 0;

  const jobCount = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='job'`)) || 0;
  const drugBuys = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='drug_buy'`)) || 0;
  const drugSells = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='drug_sell'`)) || 0;
  const travels = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='travel'`)) || 0;
  const gunsBought = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='buy_gun'`)) || 0;
  const vehiclesBought = (await qv(`SELECT COUNT(*) FROM action_log WHERE action='buy_vehicle'`)) || 0;

  // Streaks — consecutive crimes without dying (window function)
  let bestStreak = 0;
  try {
    bestStreak = (await qv(`
      WITH numbered AS (
        SELECT action, SUM(CASE WHEN action='death' THEN 1 ELSE 0 END) OVER (ORDER BY id) AS death_group
        FROM action_log WHERE action IN ('crime_success','death')
      )
      SELECT COALESCE(MAX(cnt), 0) FROM (
        SELECT death_group, COUNT(*) AS cnt FROM numbered WHERE action='crime_success' GROUP BY death_group
      )
    `)) || 0;
  } catch (_) { /* older saves may not have enough data */ }

  // Most committed crime
  let favCrime = 'None';
  try {
    const fc = await q1(`SELECT detail, COUNT(*) AS cnt FROM action_log WHERE action='crime_success' GROUP BY detail ORDER BY cnt DESC LIMIT 1`);
    if (fc) favCrime = fc.detail.split(' +')[0];
  } catch (_) {}

  // Session duration (first to last action)
  let sessionTime = '';
  try {
    const first = (await qv(`SELECT MIN(tick) FROM action_log`)) || 0;
    const last = (await qv(`SELECT MAX(tick) FROM action_log`)) || 0;
    if (first && last) {
      const mins = Math.floor((last - first) / 60000);
      sessionTime = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
    }
  } catch (_) {}

  let html = `
<div class="c-yellow" style="margin-bottom:6px">--- ${esc(p.name)} | Day ${clk.day} | ${esc(p.city)} ---</div>
<table>
  <tr><td class="c-cyan">Cash</td><td class="c-gold">$${p.cash.toLocaleString()}</td><td class="c-cyan">Respect</td><td>${p.respect.toLocaleString()}</td></tr>
  <tr><td class="c-cyan">Health</td><td>${p.health}</td><td class="c-cyan">Armor</td><td>${p.armor}</td></tr>
  <tr><td class="c-cyan">Gang</td><td>${esc(p.gang || 'None')}</td><td class="c-cyan">Rank</td><td>${esc(p.gang_rank || '-')}</td></tr>
</table>

<div class="c-yellow" style="margin:8px 0 4px">--- Combat ---</div>
<table>
  <tr><td>Total Kills</td><td class="c-red">${kills}</td><td>Cop Kills</td><td class="c-red">${copKills}</td></tr>
  <tr><td>Deaths</td><td>${deaths}</td><td>K/D Ratio</td><td class="${kd === 'INF' || parseFloat(kd) >= 1 ? 'c-green' : 'c-red'}">${kd}</td></tr>
</table>

<div class="c-yellow" style="margin:8px 0 4px">--- Crime ---</div>
<table>
  <tr><td>Crimes Attempted</td><td>${crimeTotal}</td><td>Success Rate</td><td class="${crimeRate >= 50 ? 'c-green' : 'c-red'}">${crimeRate}%</td></tr>
  <tr><td>Robberies</td><td>${robSuccesses}/${robSuccesses + robFails}</td><td>Best Streak</td><td class="c-gold">${bestStreak}</td></tr>
  <tr><td>Favorite Crime</td><td colspan="3" class="c-cyan">${favCrime}</td></tr>
</table>

<div class="c-yellow" style="margin:8px 0 4px">--- Economy ---</div>
<table>
  <tr><td>Jobs Worked</td><td class="c-green">${jobCount}</td><td>Drugs Bought</td><td>${drugBuys}</td></tr>
  <tr><td>Drugs Sold</td><td>${drugSells}</td><td>Guns Bought</td><td>${gunsBought}</td></tr>
  <tr><td>Vehicles Bought</td><td>${vehiclesBought}</td><td>Cities Visited</td><td>${travels}</td></tr>
</table>

<div class="c-yellow" style="margin:8px 0 4px">--- Career ---</div>
<table>
  <tr><td>Total Actions</td><td>${totalActions}</td><td>Play Time</td><td class="c-cyan">${sessionTime || '?'}</td></tr>
</table>
`;

  // Multiplayer leaderboard — compare with peers
  if (isMultiplayer()) {
    const peers = getPeers();
    if (peers.size > 0) {
      html += `<div class="c-yellow" style="margin:8px 0 4px">--- Multiplayer Leaderboard ---</div><table><tr><th>Player</th><th>HP</th><th>Wanted</th><th>Gang</th></tr>`;
      // Add self
      html += `<tr><td class="c-green">${esc(p.name)} (you)</td><td>${p.health}</td><td>${'*'.repeat(p.wanted_level)}</td><td>${esc(p.gang || '-')}</td></tr>`;
      for (const [, info] of peers) {
        html += `<tr><td>${esc(info.name || '?')}</td><td>${safeInt(info.health, 0, 100, 0)}</td><td>${'*'.repeat(safeInt(info.wanted, 0, 5, 0))}</td><td>${esc(info.gang || '-')}</td></tr>`;
      }
      html += '</table>';
    }
  }

  showSubMenuHTML('Stats & Leaderboard', html);
}

// --------------------------------------------------------
//  HELP / SETTINGS
// --------------------------------------------------------
function menuHelp() {
  let html = `
<div class="c-yellow" style="margin-bottom:6px">--- Controls ---</div>
<table>
  <tr><td class="c-cyan">WASD / Arrows</td><td>Move your duck</td></tr>
  <tr><td class="c-cyan">Enter</td><td>Interact with POI (glowing markers)</td></tr>
  <tr><td class="c-cyan">1-9, 0</td><td>Quick action keys (shown in brackets)</td></tr>
  <tr><td class="c-cyan">F5</td><td>Quick save</td></tr>
  <tr><td class="c-cyan">Esc</td><td>Close menu / go back</td></tr>
  <tr><td class="c-cyan">Space / F</td><td>Shoot (requires weapon)</td></tr>
  <tr><td class="c-cyan">Scroll Wheel</td><td>Zoom in / out</td></tr>
  <tr><td class="c-cyan">+ / -</td><td>Zoom in / out (keyboard)</td></tr>
  <tr><td class="c-cyan">Q / E</td><td>Rotate camera left / right</td></tr>
</table>

<div class="c-yellow" style="margin:8px 0 6px">--- How to Play ---</div>
<table>
  <tr><td class="c-green">Walk to glowing markers</td><td>Visit shops, hospitals, dealers, etc.</td></tr>
  <tr><td class="c-green">Work legal jobs</td><td>Earn safe cash, build skills</td></tr>
  <tr><td class="c-green">Commit crimes</td><td>High risk, high reward, raises wanted level</td></tr>
  <tr><td class="c-green">Join a gang</td><td>Attack territories, recruit members, buy businesses</td></tr>
  <tr><td class="c-green">Buy weapons</td><td>Increase crime success, enables shooting (Space/F)</td></tr>
  <tr><td class="c-green">Buy vehicles</td><td>Free travel between cities</td></tr>
  <tr><td class="c-green">Visit hookers</td><td>Restore health (+HP)</td></tr>
  <tr><td class="c-green">Drug market</td><td>Buy low, sell high, build dealing skill</td></tr>
</table>

<div class="c-yellow" style="margin:8px 0 6px">--- Tips ---</div>
<div class="c-white">- Wanted level triggers police encounters. Work legal jobs to reduce it.</div>
<div class="c-white">- Use Fake IDs from shops to instantly reduce wanted level.</div>
<div class="c-white">- Gang territory generates daily income. More territory = more cash.</div>
<div class="c-white">- Upgrade your safe house to recruit more gang members.</div>
<div class="c-white">- Adrenaline Shots give +20% crime success for one crime.</div>
<div class="c-white">- Earn perk points every 1000 respect. Unlock powerful bonuses.</div>
<div class="c-white">- Pick Oz or Izzy at character select for god mode ($1M, all weapons).</div>

<div class="c-yellow" style="margin:8px 0 6px">--- Camera Settings ---</div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
  <button class="btn cam-btn" data-dist="10" data-height="8">Close-Up</button>
  <button class="btn cam-btn" data-dist="18" data-height="14">Medium</button>
  <button class="btn cam-btn" data-dist="28" data-height="22">Default</button>
  <button class="btn cam-btn" data-dist="40" data-height="32">Far</button>
  <button class="btn cam-btn" data-dist="55" data-height="44">Overview</button>
</div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
  <button class="btn cam-angle-btn" data-angle="0">North</button>
  <button class="btn cam-angle-btn" data-angle="${Math.PI/4}">NE (default)</button>
  <button class="btn cam-angle-btn" data-angle="${Math.PI/2}">East</button>
  <button class="btn cam-angle-btn" data-angle="${Math.PI}">South</button>
  <button class="btn cam-angle-btn" data-angle="${Math.PI*1.5}">West</button>
</div>

<div class="c-yellow" style="margin:8px 0 6px">--- Map Legend ---</div>
<table>
  <tr><td style="color:#ff3333">A</td><td>Ammu-Nation (buy weapons)</td></tr>
  <tr><td style="color:#ffffff">+</td><td>Hospital (heal, armor, health packs)</td></tr>
  <tr><td style="color:#ff44ff">K</td><td>Street Corner (hookers)</td></tr>
  <tr><td style="color:#ffd700">B</td><td>Gambling Den (slots, dice, poker)</td></tr>
  <tr><td style="color:#44ffff">D</td><td>Drug Dealer (buy/sell drugs)</td></tr>
  <tr><td style="color:#4488ff">$</td><td>Convenience Store (items)</td></tr>
  <tr><td style="color:#ff8800">V</td><td>Vehicle Dealer</td></tr>
  <tr><td style="color:#44ff44">W</td><td>Job Center (legal work)</td></tr>
  <tr><td style="color:#aa44ff">G</td><td>Gang HQ (join gang, territories)</td></tr>
  <tr><td style="color:#ff66aa">X</td><td>Strip Club (health, respect, lay low)</td></tr>
</table>

<div class="c-gray" style="margin-top:8px;font-size:10px">All game state is stored in DuckDB-WASM. Every action is a SQL query.</div>
`;
  showSubMenuHTML('Help & Settings', html);

  $('sub-menu').querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setCamDist(parseFloat(btn.dataset.dist));
      setCamHeight(parseFloat(btn.dataset.height));
    });
  });
  $('sub-menu').querySelectorAll('.cam-angle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setCamAngle(parseFloat(btn.dataset.angle));
    });
  });
}

// --------------------------------------------------------
//  GARAGE
// --------------------------------------------------------
// --------------------------------------------------------
//  MENU FUNCTION MAP
// --------------------------------------------------------
const menuFunctions = {
  menuGuns, menuHospital, menuHookers, menuGambling, menuSwitchGun, menuDrugs,
  menuShops, menuVehicles, menuJobs, menuGang, menuStripClub
};

// --------------------------------------------------------
//  KEYBOARD CONTROLS
// --------------------------------------------------------
const mainActionKeys = {};
function rebuildActionKeys() {
  const actions = [
    { key: '1', action: menuTravel }, { key: '2', action: menuJobs }, { key: '3', action: menuCrime },
    { key: '4', action: menuGuns }, { key: '5', action: menuHospital }, { key: '6', action: menuShops },
    { key: '7', action: menuDrugs }, { key: '8', action: menuGang }, { key: '9', action: menuPerks },
    { key: '0', action: menuInventory }, { key: 'h', action: menuHookers },
    { key: 'n', action: menuNews }, { key: 'l', action: menuStats },
    { key: 'x', action: menuStripClub }, { key: 'r', action: menuStreetRace }, { key: 'j', action: menuHeists },
    { key: 'v', action: toggleVehicle }, { key: 'g', action: menuGarage }, { key: 'b', action: menuBounties }, { key: '/', action: menuHelp }
  ];
  for (const a of actions) mainActionKeys[a.key] = a.action;
}
rebuildActionKeys();

// Blur buttons after click so keyboard control returns to document
document.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON' || e.target.classList.contains('btn')) {
    setTimeout(() => { if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur(); }, 0);
  }
});
// Clicking the canvas should also reclaim focus
document.getElementById('three-canvas')?.addEventListener('click', () => {
  if (document.activeElement?.tagName === 'BUTTON' || document.activeElement?.tagName === 'INPUT') {
    document.activeElement.blur();
  }
});

document.addEventListener('keydown', async (e) => {
  // Don't capture keys when not in game (e.g. title screen, typing in input)
  if (!gameActive) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

  if (e.key === 'Escape' || e.key === 'Backspace') {
    e.preventDefault();
    // Police are persistent now — Escape just closes menus
    stopSiren();
    hideSubMenu();
    showMainActions();
    return;
  }

  if (e.key === 'F5') {
    e.preventDefault();
    saveGame();
    return;
  }

  if (e.key === '+' || e.key === '=') { e.preventDefault(); setCamDist(Math.max(CAM_ZOOM_MIN, camDist - 2)); setCamHeight(camDist * 0.8); return; }
  if (e.key === '-' || e.key === '_') { e.preventDefault(); setCamDist(Math.min(CAM_ZOOM_MAX, camDist + 2)); setCamHeight(camDist * 0.8); return; }

  const inSubMenu = $('sub-menu').style.display === 'block';

  if (inSubMenu) {
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9 && num <= currentSubOptions.length) {
      e.preventDefault();
      currentSubOptions[num - 1].action();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      subMenuSelection = Math.max(0, subMenuSelection - 1);
      highlightSubOption();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      subMenuSelection = Math.min(currentSubOptions.length - 1, subMenuSelection + 1);
      highlightSubOption();
      return;
    }
    if (e.key === 'Enter' && subMenuSelection >= 0 && subMenuSelection < currentSubOptions.length) {
      e.preventDefault();
      currentSubOptions[subMenuSelection].action();
      return;
    }
    return;
  }

  // Cheat code input (backtick ` key)
  if (e.key === '`') {
    e.preventDefault();
    _openCheatInput();
    return;
  }

  // Multiplayer chat (T key)
  if (e.key === 't' && isMultiplayer()) {
    e.preventDefault();
    const chatInput = $('mp-chat-input');
    if (chatInput) {
      chatInput.style.display = 'block';
      chatInput.value = '';
      chatInput.focus();
    }
    return;
  }

  switch (e.key) {
    case 'ArrowUp':    case 'w': e.preventDefault(); await movePlayer(0, -1); return;
    case 'ArrowDown':  case 's': e.preventDefault(); await movePlayer(0, 1); return;
    case 'ArrowLeft':  case 'a': e.preventDefault(); await movePlayer(-1, 0); return;
    case 'ArrowRight': case 'd': e.preventDefault(); await movePlayer(1, 0); return;
    case 'Enter': e.preventDefault(); await enterPOI(); return;
    case ' ': case 'f': e.preventDefault(); await playerShoot(); return;
    case 'q': e.preventDefault(); setCamAngle(camAngle - 0.15); return;
    case 'e': e.preventDefault(); setCamAngle(camAngle + 0.15); return;
  }

  const lk = e.key.toLowerCase();
  if (mainActionKeys[lk]) {
    e.preventDefault();
    mainActionKeys[lk]();
    return;
  }
});

function highlightSubOption() {
  const btns = $('sub-menu').querySelectorAll('.sub-btn[data-idx]');
  btns.forEach((btn, i) => {
    btn.style.background = i === subMenuSelection ? '#003300' : '#1a1a1a';
    btn.style.borderColor = i === subMenuSelection ? '#44ff44' : '#00ff00';
  });
}

// Scroll wheel zoom
document.addEventListener('wheel', (e) => {
  if ($('game-ui').style.display === 'none') return;
  e.preventDefault();
  const zoomSpeed = 1.5;
  if (e.deltaY > 0) {
    setCamDist(Math.min(CAM_ZOOM_MAX, camDist + zoomSpeed));
  } else {
    setCamDist(Math.max(CAM_ZOOM_MIN, camDist - zoomSpeed));
  }
  setCamHeight(camDist * 0.8);
}, { passive: false });

// --------------------------------------------------------
//  GAME START
// --------------------------------------------------------
window.startNewGame = async function() {
  const selectedCard = document.querySelector('.char-card.selected');
  if (!selectedCard) { alert('Select a character first!'); return; }
  const charType = selectedCard.dataset.name;
  const customName = $('player-name-input').value.trim();
  const name = customName || charType;
  const startCity = _mpCityOverride || selectedCard.dataset.city;
  const bonus = selectedCard.dataset.bonus;
  await initSchema();
  // Set seeds for deterministic spawning (host generates, clients receive via worldSync)
  setNPCSeed(_npcSeedValue);
  setMapSeed(_npcSeedValue);
  window._npcSeedValue = _npcSeedValue; // expose for multiplayer bootstrap
  await initPlayer(name, startCity, bonus, charType);
  applyCharacterSkin(charType);
  await initWorld();
  setCurrentCity(startCity);
  $('title-screen').style.display = 'none';
  $('game-ui').style.display = 'block';
  setGameActive(true);
  log(`Welcome to Duck Theft Auto, ${name}!`, 'c-gold');
  if (startCity !== 'Los Santos') log(`Starting in ${startCity}.`, 'c-cyan');
  const ct = charType.toLowerCase();
  if (ct === 'oz' || ct === 'izzy') {
    log('GOD MODE: $1,000,000 | All weapons unlocked | Max skills | Full armor', 'c-magenta');
    if (ct === 'izzy') log('Izzy doesn\'t play nice. Vice City won\'t know what hit it.', 'c-magenta');
    else log('Oz is strapped and ready. No one stands a chance.', 'c-magenta');
  } else if (ct === 'cj') {
    log('CJ: $2,000 | +2 charisma | Starting respect', 'c-yellow');
  } else if (ct === 'tommy') {
    log('Tommy: $3,500 | Hawk 9 pistol | Body armor', 'c-yellow');
  } else if (ct === 'claude') {
    log('Claude: $2,500 | +2 stealth | Underworld respect', 'c-yellow');
  } else if (ct === 'niko') {
    log('Niko: $2,000 | +2 strength | Heavy armor | Street respect', 'c-yellow');
  } else if (ct === 'catalina') {
    log('Catalina: $3,000 | +2 driving | Viper SMG', 'c-yellow');
  } else if (bonus !== 'none') {
    log(`Character bonus: +2 ${bonus} skill!`, 'c-cyan');
  }
  log('Move: WASD/Arrows | Shoot: Space/F | Interact: ENTER | Save: F5', 'c-cyan');
  log('[1] Travel  [2] Work  [3] Crime  [4] Guns  [5] Hospital  [6] Shops', 'c-gray');
  log('[7] Drugs  [8] Gang & Empire  [9] Perks  [0] Inventory', 'c-gray');
  if (ct !== 'oz' && ct !== 'izzy') log('Tip: Start with legal jobs [2] to earn cash safely, then try crime [3] for bigger payoffs.', 'c-yellow');
  await updateHUD(); await checkPOI();
  showMainActions();
  if (!window._autoSaveInterval) window._autoSaveInterval = setInterval(() => { if (gameActive) saveGame(); }, 5 * 60 * 1000);
  // Wanted decay: -1 every 2 minutes of play
  if (!window._wantedDecayInterval) window._wantedDecayInterval = setInterval(async () => {
    if (!gameActive) return;
    const wanted = await qv('SELECT wanted_level FROM player');
    if (wanted > 0) {
      await exec('UPDATE player SET wanted_level = wanted_level - 1');
      const newW = await qv('SELECT wanted_level FROM player');
      if (newW <= 0) {
        clearPoliceNPCs(); stopSiren(); _policeActive = false;
        if (isMultiplayer()) broadcastAction({ action: 'police_clear' });
        log('Cops lost your trail. Wanted level cleared.', 'c-green');
      } else {
        log(`Laying low... wanted level dropped to ${newW}.`, 'c-cyan');
      }
      await updateHUD();
    }
  }, 120000);
  // Passive clock: advance 1 game hour every 60 seconds of real time
  if (!window._passiveClockInterval) window._passiveClockInterval = setInterval(async () => {
    if (!gameActive) return;
    const clk = await q1('SELECT day, hour FROM game_clock');
    if (!clk) return;
    let h = clk.hour + 1, d = clk.day;
    if (h >= 24) { h = 0; d++; }
    await exec(`UPDATE game_clock SET day=${d}, hour=${h}`);
    setCurrentGameHour(h);
    updateLighting(h);
    $('hud-day').textContent = d;
    $('hud-hour').textContent = String(h).padStart(2, '0');
    if (h === 0) log(`════════════ DAY ${d} ════════════`, 'c-gold');
    if (isMultiplayer()) broadcastAction({ action: 'time_sync', day: d, hour: h });
  }, 60000);
  startPolicePresenceLoop();
};

window.loadGame = async function(slotName) {
  const loaded = await loadGameData({
    setGameActive,
    updateHUD,
    checkPOI,
    showMainActions
  }, slotName);
  if (!loaded) { alert('No save game found. Starting new game.'); return; }
  // Comeback cash bonus on load
  const comebackBonus = 1000;
  await exec(`UPDATE player SET cash = cash + ${comebackBonus}`);
  log(`Welcome back! +$${comebackBonus.toLocaleString()} comeback bonus.`, 'c-gold');
  // Apply character skin from saved char_type
  const p = await q1('SELECT name, char_type FROM player');
  if (p) applyCharacterSkin(p.char_type || p.name);
  if (!window._autoSaveInterval) window._autoSaveInterval = setInterval(() => { if (gameActive) saveGame(); }, 5 * 60 * 1000);
};
