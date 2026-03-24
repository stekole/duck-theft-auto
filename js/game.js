import {
  T, POI_DEFS, CITIES, GANGS, JOBS, CRIMES, GUNS as GUN_LIST, VEHICLES as VEHICLE_LIST,
  DRUGS, RANK_THRESHOLDS, PERKS, ITEMS, MAP_SIZE
} from './constants.js';
import { currentMapGrid } from './city.js';
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
  getNearestNPCCar, removeNPCCar,
  updateRemoteDuck, despawnRemoteDuck, getNearestRemoteDuck
} from './renderer.js';
import {
  conn, q, q1, qv, saveGame,
  initSchema, initPlayer, initWorld, loadCityMap, loadGameData, getSaveIndex, setLogFn
} from './db.js';
import {
  isMultiplayer, getIsHost, broadcastMove, broadcastShoot, broadcastChat,
  broadcastAction, broadcastWorldSync, setCallbacks as setMPCallbacks, getPeers,
  getLocalPeerId
} from './multiplayer.js';

const $ = id => document.getElementById(id);

// Per-peer cooldown map for incoming PvP shots (H2 security fix)
const peerShootTimestamps = new Map();

// --------------------------------------------------------
//  EVENT LOG
// --------------------------------------------------------
const logEntries = [];
export function log(msg, cls = 'c-white') {
  logEntries.push({ msg, cls });
  if (logEntries.length > 100) logEntries.shift();
  const el = $('event-log');
  el.innerHTML = '';
  for (const e of logEntries) {
    const div = document.createElement('div');
    div.className = 'log-entry ' + e.cls;
    div.textContent = e.msg;
    el.appendChild(div);
  }
  el.scrollTop = el.scrollHeight;
}

// Inject log into db.js so saveGame can use it
setLogFn(log);

// Wire up multiplayer callbacks
setMPCallbacks({
  logFn: (msg) => log(msg, 'c-cyan'),
  onRemoteMove: (peerId, data) => {
    updateRemoteDuck(peerId, data.x, data.y, data);
  },
  onPeerJoin: async (peerId, data) => {
    // Host sends world state to new peer
    if (getIsHost() && conn) {
      try {
        const p = await q1('SELECT * FROM player');
        const clk = await q1('SELECT * FROM game_clock');
        const worldData = {
          city: p.city,
          day: clk.day,
          hour: clk.hour,
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
        broadcastWorldSync(worldData);
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
    // Display remote player actions in the log
    const name = getPeers().get(peerId)?.name || peerId.slice(0, 8);
    switch (data.action) {
      case 'crime': log(`${name} committed ${data.crime || 'a crime'}!`, 'c-red'); break;
      case 'rob': log(`${name} robbed ${data.place || 'a location'}!`, 'c-red'); break;
      case 'police': log(`${name} has cops on them!`, 'c-yellow'); break;
      case 'death': log(`${name} was WASTED!`, 'c-red'); break;
      case 'npc_kill': log(`${name} killed an NPC nearby!`, 'c-gray'); break;
      default: log(`${name}: ${data.action}`, 'c-gray');
    }
  },
  onRemoteShoot: async (peerId, data) => {
    // Check if we are the target
    const localId = getLocalPeerId();
    if (data.target === localId) {
      // H2: Per-peer cooldown — reject shots faster than 200ms
      const now = Date.now();
      const lastShot = peerShootTimestamps.get(peerId) || 0;
      if (now - lastShot < 200) return;
      peerShootTimestamps.set(peerId, now);

      // H2: Range check — reject if Manhattan distance > 8
      const peerInfo = getPeers().get(peerId);
      if (peerInfo) {
        const p = await q1('SELECT x, y FROM player');
        const dist = Math.abs((peerInfo.x || 0) - p.x) + Math.abs((peerInfo.y || 0) - p.y);
        if (dist > 8) return;
      }

      // H1: Sanitize damage — must be positive integer, clamped 1–50
      const dmg = Math.max(1, Math.min(Math.floor(Number(data.damage)) || 15, 50));
      await conn.query(`UPDATE player SET health=GREATEST(0,health-${dmg}), armor=GREATEST(0,armor-${dmg})`);
      spawnParticlesAtDuck(0xff2222, 10, 1.5, 1);
      const shooterName = getPeers().get(peerId)?.name || peerId.slice(0, 8);
      log(`${shooterName} shot you! -${dmg} HP`, 'c-red');
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
    }
    await conn.query(`UPDATE game_clock SET day=${d}, hour=${h}`);
    if (daysAdvanced.length > 0) {
      log(`════════════ DAY ${d} ════════════`, 'c-gold');
      log(`[Day ${oldDay} ${String(oldHour).padStart(2,'0')}:00 → Day ${d} ${String(h).padStart(2,'0')}:00] (${hours}h passed)`, 'c-gray');
    } else if (hours > 0) {
      log(`[${String(oldHour).padStart(2,'0')}:00 → ${String(h).padStart(2,'0')}:00] (${hours}h passed)`, 'c-gray');
    }
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
    await conn.query(`UPDATE player SET health = LEAST(100, health + ${heal})`);
    log(`Rested overnight: +${heal} HP`, 'c-green');
  }
  // Wanted level decays slightly each day
  if (p.wanted_level > 0) {
    await conn.query(`UPDATE player SET wanted_level = GREATEST(0, wanted_level - 1)`);
    log('Heat dies down overnight. -1 Wanted.', 'c-green');
  }
  if (!p.gang) return;
  const safeGang = p.gang.replace(/'/g, "''");
  const tCount = (await qv(`SELECT COUNT(*) FROM territories WHERE owner='${safeGang}'`)) || 0;
  const tIncome = tCount * 150;
  const bIncome = Number((await qv(`SELECT COALESCE(SUM(daily_income),0) FROM businesses`)) || 0);
  const smugLevel = Number((await qv(`SELECT level FROM gang_upgrades WHERE name='smuggling_routes'`)) || 0);
  const smugBonus = smugLevel * 100;
  const upkeep = Number((await qv(`SELECT COALESCE(SUM(upkeep),0) FROM recruits`)) || 0);
  const net = tIncome + bIncome + smugBonus - upkeep;
  if (net !== 0) {
    await conn.query(`UPDATE player SET cash = cash + ${net}`);
  }
  log(`Daily income: Territory $${tIncome} + Business $${bIncome} + Smuggling $${smugBonus} - Upkeep $${upkeep} = Net $${net}`, net >= 0 ? 'c-gold' : 'c-red');
}

async function decayHeat() { await conn.query(`UPDATE district_heat SET heat = GREATEST(0, heat - 1)`); }

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

  const hasVehicle = await qv(`SELECT COUNT(*) FROM vehicles WHERE stored=0`);
  updatePlayerVehicle(hasVehicle > 0);

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
          await conn.query(`INSERT INTO vehicles VALUES ('${car.name.replace(/'/g,"''")}',0)`);
        }
        removeNPCCar(car);
        await conn.query(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`);
        log(`Jacked a ${car.name}! +1 Wanted.`, 'c-green');
        spawnParticlesAtDuck(0x44ff44, 12, 2, 1.5);
        await maybeSkillUp('driving');
      } else {
        const dmg = rand(10, 30);
        await conn.query(`UPDATE player SET health=GREATEST(0,health-${dmg}), wanted_level=LEAST(5,wanted_level+1)`);
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
            await conn.query(`UPDATE player SET health=GREATEST(0,health-${dmg})`);
            log(`The buyer turned on you! -${dmg} HP`, 'c-red');
            spawnParticlesAtDuck(0xff2222, 10, 1.5, 1);
            await checkDeath();
          } else {
            await conn.query(`UPDATE player SET cash=cash+${sellPrice}`);
            await conn.query(`UPDATE drugs SET qty=qty-1 WHERE name='${d.name}'`);
            await conn.query(`DELETE FROM drugs WHERE qty <= 0`);
            log(`Sold ${d.name} to a stranger for $${sellPrice}.`, 'c-green');
            if (chance(20)) {
              await conn.query(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`);
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
        await conn.query(`UPDATE player SET health=GREATEST(0,health-${dmg})`);
        const pos = killNPC(npc);
        spawnParticles(pos.x, pos.z, 0xff4444, 8, 1.5, 1);
        log(`Jumped by a thug! -${dmg} HP`, 'c-red');
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
//  POLICE ENCOUNTER
// --------------------------------------------------------
let policeEncounterActive = false;

async function checkPolice() {
  if (policeEncounterActive) return;
  const p = await q1('SELECT * FROM player');
  if (p.wanted_level <= 0) { clearPoliceNPCs(); return; }
  if (!chance(p.wanted_level * 8)) return;
  await triggerPoliceEncounter(p);
}

async function checkPoliceOnMove() {
  const p = await q1('SELECT * FROM player');
  if (p.wanted_level <= 0) return;
  if (policeEncounterActive) return;
  const moveChance = p.wanted_level * 1.5 + 1;
  if (!chance(moveChance)) return;
  await triggerPoliceEncounter(p);
}

async function checkNightAttack() {
  const clk = await q1('SELECT hour FROM game_clock');
  const isNight = clk.hour < 5 || clk.hour > 21;
  if (!isNight) return;
  if (policeEncounterActive) return;
  const npc = getNearestNPC(3);
  if (!npc || !npc.hostile) return;
  if (!chance(8)) return; // 8% chance per move at night near hostile NPC
  const dmg = rand(5, 20);
  await conn.query(`UPDATE player SET health=GREATEST(0,health-${dmg})`);
  const pos = killNPC(npc);
  spawnParticles(pos.x, pos.z, 0xff4444, 8, 1.5, 1);
  log(`A thug attacked you in the dark! -${dmg} HP`, 'c-red');
  await checkDeath();
  await updateHUD();
}

async function triggerPoliceEncounter(p) {
  policeEncounterActive = true;
  setStatus('Police encounter!');

  // Close any open menus first
  hideSubMenu();

  // Spawn cops visually
  const copCount = Math.max(1, Math.min(3, Math.ceil(p.wanted_level / 2)));
  for (let i = 0; i < copCount; i++) {
    spawnPoliceNPC(duckGroup.position.x, duckGroup.position.z);
  }

  startSiren();
  spawnParticlesAtDuck(0x4444ff, 10, 2, 2);

  // Flash the screen blue/red briefly
  const policeFlash = document.createElement('div');
  policeFlash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:49;pointer-events:none;animation:police-flash 0.3s ease 3;';
  policeFlash.innerHTML = '<style>@keyframes police-flash{0%{background:rgba(255,0,0,0.3)}50%{background:rgba(0,0,255,0.3)}100%{background:transparent}}</style>';
  document.body.appendChild(policeFlash);
  setTimeout(() => policeFlash.remove(), 1000);

  log('>>> POLICE ENCOUNTER! <<<', 'c-red');
  if (p.wanted_level >= 3) log('Heavy resistance expected!', 'c-red');
  if (p.wanted_level >= 4) log('Shoot to kill orders!', 'c-red');
  if (p.wanted_level === 5) log('SWAT deployed!', 'c-red');

  // Brief delay so player sees the cops before menu appears
  await new Promise(r => setTimeout(r, 800));

  showSubMenu(`Police! (${copCount} officer${copCount > 1 ? 's' : ''})`, [
    { label: 'Run', action: () => policeRun(p) },
    { label: 'Bribe', action: () => policeBribe(p) },
    { label: 'Fight Back (if armed)', action: () => policeFight(p) },
    { label: 'Surrender', action: () => policeSurrender(p) }
  ]);
}

async function policeRun(p) {
  const drivingSkill = (await qv(`SELECT level FROM skills WHERE name='driving'`)) || 1;
  const stealthSkill = (await qv(`SELECT level FROM skills WHERE name='stealth'`)) || 1;
  const hasPerk = await qv(`SELECT unlocked FROM perks WHERE name='Pro Driver'`);
  let escapeChance = 40 + drivingSkill * 5 + stealthSkill * 3;
  if (hasPerk) escapeChance += 15;
  escapeChance = Math.min(escapeChance, 85);
  if (chance(escapeChance)) {
    log(`You escaped the cops! (${escapeChance}% chance)`, 'c-green');
    spawnParticlesAtDuck(0x44ff44, 8, 2, 1);
  } else {
    const fine = rand(100, 500); const dmg = rand(10, 30);
    await conn.query(`UPDATE player SET cash = GREATEST(0, cash - ${fine}), health = GREATEST(0, health - ${dmg}), wanted_level = GREATEST(0, wanted_level - 1)`);
    log(`Busted! Fined $${fine}, took ${dmg}% damage.`, 'c-red');
    spawnParticlesAtDuck(0xff2222, 15, 1.5, 1);
    await checkDeath();
  }
  stopSiren(); clearStatus(); clearPoliceNPCs(); policeEncounterActive = false;
  hideSubMenu(); await updateHUD();
}

async function policeFight(p) {
  const gunBonus = await getGunBonus();
  if (gunBonus <= 0) {
    log("You don't have any weapons to fight with!", 'c-red');
    return;
  }
  const strengthSkill = await getSkill('strength');
  const cops = getPoliceNPCs();
  const copCount = cops.length;
  let winChance = 20 + gunBonus + strengthSkill * 3 - copCount * 10 - p.wanted_level * 5;
  winChance = Math.max(5, Math.min(70, winChance));

  log(`Fighting ${copCount} cop${copCount > 1 ? 's' : ''}... (${winChance}% win chance)`, 'c-yellow');
  spawnParticlesAtDuck(0xff8800, 15, 2, 1);

  if (chance(winChance)) {
    const loot = rand(50, 200) * copCount;
    const respect = rand(10, 30);
    const dmg = rand(10, 30);
    await conn.query(`UPDATE player SET cash=cash+${loot}, health=GREATEST(0,health-${dmg}), respect=respect+${respect}, wanted_level=LEAST(5,wanted_level+1)`);
    log(`Took down the cops! Looted $${loot}, +${respect} Respect, -${dmg} HP. Wanted level increased!`, 'c-green');
    spawnParticlesAtDuck(0x44ff44, 20, 2, 2);
    await maybeSkillUp('strength');
  } else {
    const fine = rand(200, 800);
    const dmg = rand(25, 60) + p.wanted_level * 5;
    await conn.query(`UPDATE player SET cash=GREATEST(0,cash-${fine}), health=GREATEST(0,health-${dmg}), wanted_level=LEAST(5,wanted_level+1)`);
    log(`Overpowered! Fined $${fine}, took ${dmg} damage. Wanted level increased!`, 'c-red');
    spawnParticlesAtDuck(0xff2222, 20, 2, 1);
    await checkDeath();
  }
  stopSiren(); clearStatus(); clearPoliceNPCs(); policeEncounterActive = false;
  hideSubMenu(); await updateHUD();
}

async function policeBribe(p) {
  let cost = rand(150, 750);
  const hasPerk = await qv(`SELECT unlocked FROM perks WHERE name='Street Negotiator'`);
  if (hasPerk) cost = Math.floor(cost * 0.9);
  if (p.cash >= cost) {
    await conn.query(`UPDATE player SET cash = cash - ${cost}, wanted_level = GREATEST(0, wanted_level - 2)`);
    log(`Bribed the cops for $${cost}. Wanted level reduced.`, 'c-yellow');
  } else {
    log(`Not enough cash to bribe ($${cost} needed). They arrest you!`, 'c-red');
    await conn.query(`UPDATE player SET wanted_level = 0, cash = GREATEST(0, cash - 200), health = GREATEST(0, health - 15)`);
  }
  stopSiren(); clearStatus(); clearPoliceNPCs(); policeEncounterActive = false;
  hideSubMenu(); await updateHUD();
}

async function policeSurrender(p) {
  const fine = rand(200, 800);
  await conn.query(`UPDATE player SET wanted_level = 0, cash = GREATEST(0, cash - ${fine})`);
  await advanceTime(2);
  log(`Surrendered. Spent time in jail, fined $${fine}. Wanted level cleared.`, 'c-yellow');
  stopSiren(); clearStatus(); clearPoliceNPCs(); policeEncounterActive = false;
  hideSubMenu(); await updateHUD();
}

// --------------------------------------------------------
//  DEATH CHECK
// --------------------------------------------------------
async function checkDeath() {
  const health = await qv('SELECT health FROM player');
  if (health <= 0) {
    const respLoss = rand(25, 50);
    // Stop any active encounters
    stopSiren(); clearPoliceNPCs(); policeEncounterActive = false; clearStatus();

    // Dramatic WASTED screen flash
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(255,0,0,0.6);z-index:100;display:flex;align-items:center;justify-content:center;pointer-events:none;transition:opacity 2s;';
    overlay.innerHTML = '<div style="color:#fff;font-size:64px;font-weight:bold;text-shadow:0 0 30px #ff0000,0 0 60px #ff0000;font-family:Impact,sans-serif;letter-spacing:12px">WASTED</div>';
    document.body.appendChild(overlay);

    await conn.query(`UPDATE player SET health = 100, cash = GREATEST(0, cash - 200), respect = GREATEST(0, respect - ${respLoss}), wanted_level = 0, armor = 0`);
    spawnParticlesAtDuck(0xff0000, 30, 3, 2);

    // Relocate to a road tile (hospital spawn)
    const p = await q1('SELECT city FROM player');
    if (p && currentMapGrid) {
      for (let y = 5; y < MAP_SIZE - 5; y++) {
        for (let x = 5; x < MAP_SIZE - 5; x++) {
          if (currentMapGrid[y][x] === T.POI_HOSPITAL) {
            await conn.query(`UPDATE player SET x=${x}, y=${y}`);
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
    if (isMultiplayer()) broadcastAction({ action: 'death', name: (await q1('SELECT name FROM player')).name });
    await updateRank();
    await updateHUD();

    // Fade out the wasted overlay
    setTimeout(() => { overlay.style.opacity = '0'; }, 1500);
    setTimeout(() => { overlay.remove(); }, 3500);
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
    await conn.query(`UPDATE player SET gang_rank = '${newRank}'`);
    log(`Rank up! You are now: ${newRank}`, 'c-magenta');
  }
  const expectedPP = Math.floor(p.respect / 1000);
  if (expectedPP > p.perk_points) {
    const gain = expectedPP - p.perk_points;
    await conn.query(`UPDATE player SET perk_points = ${expectedPP}`);
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
          await conn.query(`UPDATE territories SET owner='${attacker}' WHERE district='${t.district.replace(/'/g,"''")}' AND city='${t.city.replace(/'/g,"''")}'`);
          const desc = `${attacker} seized ${t.district} from ${t.owner}!`;
          await conn.query(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
          log(`NEWS: ${desc}`, 'c-orange');
        }
      }
    } else if (eventType === 4) {
      // Drug bust
      const city = allCities[rand(0, allCities.length - 1)];
      const districts = CITIES[city].districts;
      const district = districts[rand(0, districts.length - 1)];
      const desc = `Major drug bust in ${district}, ${city}! Several dealers arrested.`;
      await conn.query(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
      log(`NEWS: ${desc}`, 'c-orange');
    } else if (eventType === 5) {
      // Police raid
      const city = allCities[rand(0, allCities.length - 1)];
      const gang = allGangs[rand(0, allGangs.length - 1)];
      const desc = `Police raided ${gang} hideout in ${city}. Weapons seized.`;
      await conn.query(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
      log(`NEWS: ${desc}`, 'c-orange');
    } else if (eventType === 6) {
      // Celebrity sighting
      const celebs = ['Madd Dogg', 'OG Loc', 'Kent Paul', 'Maccer', 'Lazlow', 'Love Fist', 'Fernando Martinez'];
      const celeb = celebs[rand(0, celebs.length - 1)];
      const city = allCities[rand(0, allCities.length - 1)];
      const desc = `${celeb} spotted partying in ${city}!`;
      await conn.query(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
      log(`NEWS: ${desc}`, 'c-orange');
    } else if (eventType === 7) {
      // Market crash / boom
      const isBoom = chance(50);
      const desc = isBoom
        ? `Drug prices surging! Street dealers reporting record profits.`
        : `Market crash! Drug prices plummeting across all cities.`;
      await conn.query(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
      log(`NEWS: ${desc}`, 'c-orange');
    } else {
      // Random crime wave / peace
      const city = allCities[rand(0, allCities.length - 1)];
      const events = [
        `Shooting spree reported in downtown ${city}. Stay indoors.`,
        `${city} mayor announces crackdown on street crime.`,
        `Armored truck heist in ${city} — suspects still at large.`,
        `Car bombing rocks ${city} — gang rivalry suspected.`,
        `Underground street racing circuit busted in ${city}.`,
        `${city} police chief fired amid corruption scandal.`
      ];
      const desc = events[rand(0, events.length - 1)];
      await conn.query(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
      log(`NEWS: ${desc}`, 'c-orange');
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
    await conn.query(`UPDATE skills SET level = level + 1 WHERE name='${name}'`);
    const newLvl = await getSkill(name);
    log(`${name} skill increased to ${newLvl}!`, 'c-cyan');
  }
}
async function getGunBonus() { return (await qv(`SELECT COALESCE(MAX(bonus),0) FROM guns`)) || 0; }

// --------------------------------------------------------
//  SHOOTING
// --------------------------------------------------------
let shootCooldown = false;
async function getShootCooldown() {
  // Better guns shoot faster: check best gun category owned
  const bestGun = await q1(`SELECT category, bonus FROM guns ORDER BY bonus DESC LIMIT 1`);
  if (!bestGun) return 400;
  const cooldowns = { 'Pistol': 400, 'Shotgun': 500, 'SMG': 200, 'Rifle': 300, 'Heavy': 150, 'Sniper': 600 };
  return cooldowns[bestGun.category] || 400;
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
      await conn.query(`UPDATE player SET cash=cash+${loot}`);
      log(`Killed a cop! Looted $${loot}. Heat is rising!`, 'c-red');
      await conn.query(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`);
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
    await conn.query(`UPDATE player SET cash=cash+${loot}, wanted_level=LEAST(5,wanted_level+1), respect=respect+1`);
    log(`Shot a civilian! Looted $${loot}. +1 Wanted.`, 'c-red');
    if (isMultiplayer()) broadcastAction({ action: 'npc_kill', name: (await q1('SELECT name FROM player')).name });
    const p = await q1('SELECT district, city FROM player');
    await conn.query(`UPDATE district_heat SET heat=heat+2 WHERE district='${p.district.replace(/'/g,"''")}' AND city='${p.city.replace(/'/g,"''")}'`);
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
let moveDebounce = false;
async function movePlayer(dx, dy) {
  if (moveDebounce) return;
  moveDebounce = true;
  setTimeout(() => moveDebounce = false, 80);

  const p = await q1('SELECT x,y FROM player');
  const nx = p.x + dx;
  const ny = p.y + dy;
  if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) return;
  if (!currentMapGrid) return;
  const tile = currentMapGrid[ny][nx];
  if (tile === T.WALL || tile === T.WATER) return;
  await conn.query(`UPDATE player SET x=${nx}, y=${ny}`);

  if (dx !== 0 || dy !== 0) {
    setDuckFacing(Math.atan2(dx, dy));
  }
  setDuckTarget(nx + 0.5, ny + 0.5);

  // Broadcast position to peers
  if (isMultiplayer()) {
    const mp = await q1('SELECT name, char_type, health, wanted_level FROM player');
    broadcastMove({ x: nx, y: ny, name: mp.name, char: mp.char_type, health: mp.health, wanted: mp.wanted_level });
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
  await conn.query(`UPDATE player SET district='${district}'`);
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
  el.innerHTML = `<h4>${title}</h4>${html}<div style="margin-top:8px"><button class="btn" id="btn-back">Back</button></div>`;
  el.querySelector('#btn-back').addEventListener('click', () => { hideSubMenu(); showMainActions(); });
  backdrop.addEventListener('click', () => { hideSubMenu(); showMainActions(); }, { once: true });
}

function hideSubMenu() { $('sub-menu').style.display = 'none'; $('sub-menu').innerHTML = ''; $('sub-menu-backdrop').style.display = 'none'; currentSubOptions = []; subMenuSelection = -1; }

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
    { key: '8', label: 'Vehicles',       action: menuVehicles },
    { key: '9', label: 'Gang & Empire',  action: menuGang },
    { key: '0', label: 'Gambling',       action: menuGambling },
    { key: 'H', label: 'Hookers',        action: menuHookers },
    { key: 'P', label: 'Perks',          action: menuPerks },
    { key: 'I', label: 'Inventory',      action: menuInventory },
    { key: 'N', label: 'News',           action: menuNews },
    { key: 'G', label: 'Garage',         action: menuGarage },
    { key: 'F5', label: 'Save Game',     action: saveGame },
    { key: 'R', label: 'Street Race',    action: menuStreetRace },
    { key: 'T', label: 'Wait/Rest',     action: menuWait },
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
        await conn.query(`UPDATE player SET city='${city}', cash=cash-${cost}, district='${CITIES[city].districts[0].replace(/'/g,"''")}'`);
        await loadCityMap(city);
        let sx = 5, sy = 5;
        for (let y = 3; y < MAP_SIZE-3; y++) for (let x = 3; x < MAP_SIZE-3; x++) {
          if (currentMapGrid[y][x] === T.ROAD_MAIN || currentMapGrid[y][x] === T.ROAD_SIDE) { sx = x; sy = y; y = MAP_SIZE; break; }
        }
        await conn.query(`UPDATE player SET x=${sx}, y=${sy}`);
        setDuckTarget(sx + 0.5, sy + 0.5);
        if (duckGroup) { duckGroup.position.x = sx + 0.5; duckGroup.position.z = sy + 0.5; }
        await advanceTime(2); await processWorldEvents(); await checkPolice();
        log(`Traveled to ${city}!`, 'c-cyan');
        clearStatus();
        hideSubMenu(); await updateHUD(); await checkPOI(); showMainActions();
      }
    });
  }
  const cityDistricts = CITIES[p.city].districts;
  for (const d of cityDistricts) {
    options.push({
      label: `[Local] ${d}`,
      action: async () => {
        await conn.query(`UPDATE player SET district='${d.replace(/'/g,"''")}'`);
        await advanceTime(1); await processWorldEvents(); await checkPolice();
        log(`Moved to ${d}.`, 'c-white');
        hideSubMenu(); await updateHUD(); showMainActions();
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
      await conn.query(`UPDATE player SET cash = cash + ${earnings}`);
      await advanceTime(job.hours); await maybeSkillUp(job.skill);
      if (chance(25)) { await conn.query(`UPDATE player SET wanted_level = GREATEST(0, wanted_level - 1)`); log('Keeping a low profile... wanted level decreased.', 'c-green'); }
      log(`Worked as ${job.name}: earned $${earnings} (base $${base} + skill $${bonus})`, 'c-green');
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
  let html = '<div class="c-gray" style="margin-bottom:6px;font-size:10px">Success depends on your skills, weapons, and luck. Higher risk = higher reward.</div>';
  html += '<table><tr><th>Crime</th><th>Chance</th><th>Reward</th><th>Risk</th><th>Time</th><th></th></tr>';
  for (const crime of CRIMES) {
    const skill = await getSkill(crime.skill);
    const minChance = Math.min(95, crime.baseMin + skill * 3 + gunBonus);
    const maxChance = Math.min(95, crime.baseMax + skill * 3 + gunBonus);
    const avgChance = Math.floor((minChance + maxChance) / 2);
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
  let successChance = rand(crime.baseMin, crime.baseMax) + skill * 3 + gunBonus;
  if (hasAdrenaline) { successChance += 20; await conn.query(`UPDATE player SET adrenaline = 0`); }
  successChance = Math.min(successChance, 95);
  await advanceTime(crime.hours);
  if (chance(successChance)) {
    const loot = rand(crime.lootMin, crime.lootMax) + skill * crime.lootMul;
    const dmg = rand(crime.dmgMin, crime.dmgMax);
    const respect = rand(crime.respectMin, crime.respectMax);
    const actualDmg = p.armor > 0 ? Math.floor(dmg / 2) : dmg;
    const crimeWanted = crime.heat >= 15 ? 2 : crime.heat >= 5 ? 1 : 0;
    await conn.query(`UPDATE player SET cash=cash+${loot}, health=GREATEST(0,health-${actualDmg}), respect=respect+${respect}, armor=GREATEST(0,armor-${dmg}), wanted_level=LEAST(5,wanted_level+${crimeWanted})`);
    const safeD = p.district.replace(/'/g, "''"); const safeC = p.city.replace(/'/g, "''");
    await conn.query(`UPDATE district_heat SET heat=heat+${crime.heat} WHERE district='${safeD}' AND city='${safeC}'`);
    if (crime.name === 'Carjack') {
      const v = VEHICLE_LIST[rand(0, VEHICLE_LIST.length - 1)];
      const exists = await qv(`SELECT COUNT(*) FROM vehicles WHERE name='${v.name}'`);
      if (!exists) { await conn.query(`INSERT INTO vehicles VALUES ('${v.name}',0)`); log(`Jacked a ${v.name}!`, 'c-cyan'); }
    }
    log(`SUCCESS: ${crime.name} - Earned $${loot}, +${respect} Respect${actualDmg > 0 ? ', -' + actualDmg + '% HP' : ''}`, 'c-green');
    spawnParticlesAtDuck(0xffdd00, 15, 2, 1.5);
    await maybeSkillUp(crime.skill); await updateRank();
  } else {
    let wantedGain = crime.failWanted;
    if (hasDisguise) wantedGain = Math.max(0, wantedGain - 1);
    const fine = rand(crime.failFineMin, crime.failFineMax);
    const dmg = rand(crime.failDmgMin, crime.failDmgMax);
    const actualDmg = p.armor > 0 ? Math.floor(dmg / 2) : dmg;
    await conn.query(`UPDATE player SET cash=GREATEST(0,cash-${fine}), health=GREATEST(0,health-${actualDmg}), wanted_level=LEAST(5,wanted_level+${wantedGain}), armor=GREATEST(0,armor-${dmg})`);
    log(`FAILED: ${crime.name} - Fined $${fine}, -${actualDmg}% HP, +${wantedGain} Wanted`, 'c-red');
    spawnParticlesAtDuck(0xff2222, 12, 1.5, 1);
  }
  clearStatus();
  await checkDeath(); await processWorldEvents();
  // High-heat crimes always trigger police
  if (crime.heat >= 15 && !policeEncounterActive) {
    const pp = await q1('SELECT * FROM player');
    // Force at least 1 wanted for the encounter
    if (pp.wanted_level <= 0) await conn.query(`UPDATE player SET wanted_level=1`);
    const pp2 = await q1('SELECT * FROM player');
    log('Sirens everywhere! The cops are on you!', 'c-red');
    await triggerPoliceEncounter(pp2);
    return;
  }
  await checkPolice();
  hideSubMenu(); await updateHUD(); showMainActions();
}

// --------------------------------------------------------
//  AMMU-NATION
// --------------------------------------------------------
async function menuGuns() {
  let html = '<table><tr><th>Gun</th><th>Type</th><th>Bonus</th><th>Price</th><th></th></tr>';
  const owned = await q('SELECT name FROM guns');
  const ownedSet = new Set(owned.map(g => g.name));
  for (const gun of GUN_LIST) {
    const isOwned = ownedSet.has(gun.name);
    html += `<tr><td>${gun.name}</td><td>${gun.cat}</td><td>+${gun.bonus}%</td><td>$${gun.price}</td>`;
    html += `<td>${isOwned ? '<span class="c-green">OWNED</span>' : `<button class="btn buy-gun" data-name="${gun.name}" data-price="${gun.price}" data-cat="${gun.cat}" data-bonus="${gun.bonus}">Buy</button>`}</td></tr>`;
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
      await conn.query(`UPDATE player SET cash=cash-${price}`);
      await conn.query(`INSERT INTO guns VALUES ('${name.replace(/'/g,"''")}','${btn.dataset.cat}',${btn.dataset.bonus})`);
      log(`Purchased ${name} for $${price}!`, 'c-green');
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
      await conn.query(`UPDATE player SET cash=cash-200, health=100`);
      log('Fully healed at the hospital.', 'c-green');
      spawnParticlesAtDuck(0x44ff44, 12, 1.5, 1.5);
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Buy Health Pack ($50)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 50) { log('Not enough cash!', 'c-red'); return; }
      await conn.query(`UPDATE player SET cash=cash-50`);
      await conn.query(`INSERT INTO inventory VALUES ('Health Pack',1) ON CONFLICT(item) DO UPDATE SET qty=qty+1`);
      log('Bought a Health Pack.', 'c-green');
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Buy Body Armor ($100)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 100) { log('Not enough cash!', 'c-red'); return; }
      await conn.query(`UPDATE player SET cash=cash-100, armor=100`);
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
      await conn.query(`UPDATE player SET cash=cash-${info.price}`);
      if (name === 'Adrenaline Shot') { await conn.query(`UPDATE player SET adrenaline = 1`); }
      else { await conn.query(`INSERT INTO inventory VALUES ('${name}',1) ON CONFLICT(item) DO UPDATE SET qty=qty+1`); }
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
    await conn.query(`UPDATE player SET cash=cash+${loot}, respect=respect+${respect}, wanted_level=LEAST(5,wanted_level+1)`);
    const safeD = p.district.replace(/'/g, "''"); const safeC = p.city.replace(/'/g, "''");
    await conn.query(`UPDATE district_heat SET heat=heat+${heat} WHERE district='${safeD}' AND city='${safeC}'`);
    log(`Robbed ${placeName}! Got $${loot}, +${respect} Respect. +1 Wanted.`, 'c-green');
    if (isMultiplayer()) broadcastAction({ action: 'rob', place: placeName, name: p.name });
    spawnParticlesAtDuck(0xffdd00, 15, 2, 1.5);
    await maybeSkillUp('stealth'); await updateRank();
  } else {
    const fine = rand(100, 400);
    const dmg = rand(10, 35);
    await conn.query(`UPDATE player SET cash=GREATEST(0,cash-${fine}), health=GREATEST(0,health-${dmg}), wanted_level=LEAST(5,wanted_level+2)`);
    log(`Failed to rob ${placeName}! Fined $${fine}, -${dmg} HP, +2 Wanted.`, 'c-red');
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
  const priceSeed = clock.day * 100 + Math.floor(clock.hour / 6);
  let html = '<table><tr><th>Drug</th><th>Buy</th><th>Sell</th><th>Owned</th><th></th></tr>';
  for (let di = 0; di < DRUGS.length; di++) {
    const drug = DRUGS[di];
    const buyPrice = drug.basePrice + seededRand(priceSeed + di, -20, 30);
    const sellMul = 1.2 + (dealSkill * 0.1) + (seededRand(priceSeed + di + 100, 0, 50) / 100);
    const sellPrice = Math.floor(drug.basePrice * sellMul);
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
      await conn.query(`UPDATE player SET cash=cash-${price}`);
      const exists = await qv(`SELECT COUNT(*) FROM drugs WHERE name='${name}'`);
      if (exists > 0) { await conn.query(`UPDATE drugs SET qty=qty+1, avg_price=${price} WHERE name='${name}'`); }
      else { await conn.query(`INSERT INTO drugs VALUES ('${name}',1,${price})`); }
      log(`Bought 1 ${name} for $${price}.`, 'c-green');
      await maybeSkillUp('dealing'); await updateHUD(); await menuDrugs();
    });
  });
  $('sub-menu').querySelectorAll('.sell-drug').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name; const price = parseInt(btn.dataset.price);
      const qty = (await qv(`SELECT qty FROM drugs WHERE name='${name}'`)) || 0;
      if (qty <= 0) { log(`No ${name} to sell!`, 'c-red'); return; }
      await conn.query(`UPDATE player SET cash=cash+${price}`);
      await conn.query(`UPDATE drugs SET qty=qty-1 WHERE name='${name}'`);
      log(`Sold 1 ${name} for $${price}.`, 'c-green');
      await maybeSkillUp('dealing');
      if (chance(15)) { log('A narc spotted you dealing!', 'c-red'); await conn.query(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`); }
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
  for (const v of VEHICLE_LIST) {
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
      await conn.query(`UPDATE player SET cash=cash-${price}`);
      await conn.query(`INSERT INTO vehicles VALUES ('${name}',0)`);
      log(`Bought a ${name} for $${price}!`, 'c-green');
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
      await conn.query(`UPDATE player SET cash=cash-50, health=LEAST(100,health+10)`);
      await advanceTime(1);
      log('Spent some quality time on the street. +10 HP.', 'c-magenta');
      spawnParticlesAtDuck(0xff44ff, 8, 1, 1.5);
      await checkPolice(); hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Full Service - $100 (+25 HP)', action: async () => {
      if (p.cash < 100) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await conn.query(`UPDATE player SET cash=cash-100, health=LEAST(100,health+25)`);
      await advanceTime(2);
      log('A night to remember. +25 HP. Worth every dollar.', 'c-magenta');
      spawnParticlesAtDuck(0xff44ff, 12, 1.5, 1.5);
      await checkPolice(); hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'VIP Experience - $250 (+50 HP, -1 Wanted)', action: async () => {
      if (p.cash < 250) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await conn.query(`UPDATE player SET cash=cash-250, health=LEAST(100,health+50), wanted_level=GREATEST(0,wanted_level-1)`);
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
        await conn.query(`UPDATE player SET gang='${g.replace(/'/g,"''")}', gang_rank='Outsider'`);
        log(`Joined ${g}! Visit Gang & Empire [9] to manage territory, recruit crew, and build your empire.`, 'c-magenta');
        hideSubMenu(); await updateHUD(); showMainActions();
      }
    }));
    if (p.respect >= 1500) {
      options.push({ label: 'Create Your Own Gang (1500+ Respect)', action: async () => {
        const rawName = prompt('Enter gang name:');
        if (!rawName) return;
        const name = rawName.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 30);
        if (!name) { log('Invalid gang name.', 'c-red'); return; }
        await conn.query(`UPDATE player SET gang='${name}', gang_rank='Boss'`);
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
  showSubMenu(`${p.gang} - ${p.gang_rank}`, [
    { label: 'Territory Map - See who controls each district', action: menuTerritoryMap },
    { label: 'Attack Territory - Fight rival gangs for turf ($150/day per territory)', action: menuAttackTerritory },
    { label: `Recruit Members - Hire crew (have ${recruitCount})`, action: menuRecruit },
    { label: 'Upgrades - Safe house, weapons, smuggling routes', action: menuGangUpgrades },
    { label: `Buy Business - Earn passive daily income (own ${bizCount})`, action: menuBusiness },
    { label: `View Recruits - See your crew (${recruitCount} members)`, action: menuViewRecruits },
    { label: 'Leave Gang', action: async () => {
      showSubMenu('Leave Gang?', [
        { label: 'Yes, leave', action: async () => {
          await conn.query(`UPDATE player SET gang='', gang_rank=''`);
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
  let html = '<table><tr><th>District</th><th>Owner</th></tr>';
  for (const t of territories) {
    const color = t.owner === p.gang ? 'c-green' : t.owner === 'Unaffiliated' ? 'c-gray' : 'c-red';
    html += `<tr><td>${t.district}</td><td class="${color}">${t.owner}</td></tr>`;
  }
  html += '</table>';
  showSubMenuHTML(`Territory - ${p.city}`, html);
}

async function menuAttackTerritory() {
  const p = await q1('SELECT city, gang, respect FROM player');
  const safeGang = p.gang.replace(/'/g,"''");
  const safeCity = p.city.replace(/'/g,"''");
  const targets = await q(`SELECT district, owner FROM territories WHERE city='${safeCity}' AND owner != '${safeGang}' AND owner != 'Unaffiliated'`);
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
          await conn.query(`UPDATE territories SET owner='${safeGang}' WHERE district='${t.district.replace(/'/g,"''")}' AND city='${safeCity}'`);
          const respect = rand(25, 100);
          await conn.query(`UPDATE player SET respect=respect+${respect}`);
          log(`Victory! Took ${t.district} from ${t.owner}! +${respect} Respect`, 'c-green');
          spawnParticlesAtDuck(0x44ff44, 20, 2, 2);
          await updateRank();
        } else {
          const dmg = rand(20, 50);
          await conn.query(`UPDATE player SET health=GREATEST(0,health-${dmg}), respect=GREATEST(0,respect-75)`);
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
        await conn.query(`UPDATE territories SET owner='${safeGang}' WHERE district='${t.district.replace(/'/g,"''")}' AND city='${safeCity}'`);
        const respect = rand(10, 30);
        await conn.query(`UPDATE player SET respect=respect+${respect}`);
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
  await conn.query(`UPDATE player SET cash=cash-${cost}`);
  await conn.query(`INSERT INTO recruits(name,strength,upkeep) VALUES ('${name}',${str},${upkeep})`);
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
      await conn.query(`UPDATE player SET cash=cash-${cost}`);
      await conn.query(`UPDATE gang_upgrades SET level=level+1 WHERE name='${u.name}'`);
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
      await conn.query(`UPDATE player SET cash=cash-${price}`);
      await conn.query(`INSERT INTO businesses VALUES ('${btn.dataset.name}','${p.city.replace(/'/g,"''")}','${btn.dataset.type}',${btn.dataset.income})`);
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
      stopSiren(); clearPoliceNPCs(); policeEncounterActive = false;
      await conn.query(`UPDATE player SET wanted_level=0, health=LEAST(100,health+30)`);
      await advanceTime(3);
      log('Hid out in your own club. Cops lost your trail. +30 HP, wanted cleared.', 'c-green');
      spawnParticlesAtDuck(0x44ff44, 10, 1.5, 1.5);
      hideSubMenu(); await updateHUD(); showMainActions();
    }});
  }
  showSubMenu(ownsClub > 0 ? 'Your Strip Club' : 'Strip Club', [...stripOptions,
    { label: 'Lap Dance - $75 (+15 HP)', action: async () => {
      if (p.cash < 75) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await conn.query(`UPDATE player SET cash=cash-75, health=LEAST(100,health+15)`);
      await advanceTime(1);
      log('Enjoyed a lap dance. Feeling relaxed. +15 HP.', 'c-magenta');
      spawnParticlesAtDuck(0xff66aa, 8, 1, 1.5);
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'VIP Room - $200 (+30 HP, -1 Wanted)', action: async () => {
      if (p.cash < 200) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await conn.query(`UPDATE player SET cash=cash-200, health=LEAST(100,health+30), wanted_level=GREATEST(0,wanted_level-1)`);
      await advanceTime(2);
      log('VIP treatment. Nobody looks for you here. +30 HP, -1 Wanted.', 'c-magenta');
      spawnParticlesAtDuck(0xff66aa, 15, 1.5, 2);
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Champagne Room - $500 (+50 HP, +10 Respect)', action: async () => {
      if (p.cash < 500) { log('Not enough cash for the high life!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await conn.query(`UPDATE player SET cash=cash-500, health=LEAST(100,health+50), respect=respect+10`);
      await advanceTime(3);
      log('Big spender! The whole club knows your name. +50 HP, +10 Respect.', 'c-gold');
      spawnParticlesAtDuck(0xffd700, 20, 2, 2);
      await maybeSkillUp('charisma');
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Buy Drinks & Hang Out - $30 (-1 Wanted)', action: async () => {
      if (p.cash < 30) { log('Not enough cash!', 'c-red'); hideSubMenu(); showMainActions(); return; }
      await conn.query(`UPDATE player SET cash=cash-30, wanted_level=GREATEST(0,wanted_level-1)`);
      await advanceTime(2);
      log('Laid low at the strip club for a while. -1 Wanted.', 'c-cyan');
      hideSubMenu(); await updateHUD(); showMainActions();
    }}
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
    { label: 'Slot Machine ($50)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 50) { log('Need $50 to play!', 'c-red'); return; }
      await conn.query(`UPDATE player SET cash=cash-50`);
      const symbols = ['7','7','7','$','$','$','*','*','#','#','!','@'];
      const r1 = symbols[rand(0, symbols.length-1)], r2 = symbols[rand(0, symbols.length-1)], r3 = symbols[rand(0, symbols.length-1)];
      log(`[ ${r1} | ${r2} | ${r3} ]`, 'c-yellow');
      if (r1 === r2 && r2 === r3) {
        const win = r1 === '7' ? 5000 : r1 === '$' ? 1000 : 500;
        await conn.query(`UPDATE player SET cash=cash+${win}`); log(`JACKPOT! Won $${win}!`, 'c-gold'); spawnParticlesAtDuck(0xffd700, 25, 3, 2);
      } else if (r1 === r2 || r2 === r3) {
        await conn.query(`UPDATE player SET cash=cash+100`); log('Partial match! Won $100.', 'c-green');
      } else { log('No luck this time.', 'c-gray'); }
      await updateHUD();
    }},
    { label: 'Dice Roll ($100)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 100) { log('Need $100 to play!', 'c-red'); return; }
      await conn.query(`UPDATE player SET cash=cash-100`);
      const d1 = rand(1,6), d2 = rand(1,6), total = d1 + d2;
      log(`Rolled: [${d1}] [${d2}] = ${total}`, 'c-yellow');
      if (total === 7 || total === 11) { await conn.query(`UPDATE player SET cash=cash+300`); log('Winner! +$300!', 'c-green'); }
      else if (total === 2 || total === 12) { await conn.query(`UPDATE player SET cash=cash+500`); log('Snake eyes / boxcars! +$500!', 'c-gold'); }
      else { log('House wins.', 'c-gray'); }
      await updateHUD();
    }},
    { label: 'High Stakes Poker ($500)', action: async () => {
      const cash = await qv('SELECT cash FROM player');
      if (cash < 500) { log('Need $500 for the big table!', 'c-red'); return; }
      await conn.query(`UPDATE player SET cash=cash-500`);
      const charisma = await getSkill('charisma');
      if (chance(30 + charisma * 3)) {
        const win = rand(800, 2500);
        await conn.query(`UPDATE player SET cash=cash+${win}`); log(`Read them like a book. Won $${win}!`, 'c-gold');
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
async function menuStreetRace() {
  const hasVehicle = await qv(`SELECT COUNT(*) FROM vehicles WHERE stored=0`);
  if (!hasVehicle) { log('You need a vehicle to street race!', 'c-red'); return; }
  const drivingSkill = await getSkill('driving');
  const buyIn = rand(100, 500);
  const cash = await qv('SELECT cash FROM player');
  if (cash < buyIn) { log(`Need $${buyIn} buy-in for the race!`, 'c-red'); return; }
  showSubMenu(`Street Race - $${buyIn} buy-in`, [
    { label: 'Enter Race', action: async () => {
      setStatus('Street racing...');
      await conn.query(`UPDATE player SET cash=cash-${buyIn}`);
      await advanceTime(2);
      const winChance = 30 + drivingSkill * 5;
      if (chance(winChance)) {
        const prize = buyIn * 3;
        await conn.query(`UPDATE player SET cash=cash+${prize}`); log(`Won the race! Prize: $${prize}!`, 'c-green');
        await maybeSkillUp('driving');
      } else if (chance(50)) {
        log('Came in second. Got your buy-in back.', 'c-yellow');
        await conn.query(`UPDATE player SET cash=cash+${buyIn}`);
      } else {
        const dmg = rand(5, 20);
        await conn.query(`UPDATE player SET health=GREATEST(0,health-${dmg})`);
        log(`Crashed out! Lost $${buyIn} and ${dmg}% HP.`, 'c-red'); await checkDeath();
      }
      if (chance(30)) await conn.query(`UPDATE player SET wanted_level=LEAST(5,wanted_level+1)`);
      clearStatus();
      await checkPolice(); hideSubMenu(); await updateHUD(); showMainActions();
    }}
  ]);
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
      await conn.query(`UPDATE player SET perk_points=perk_points-${cost}`);
      await conn.query(`UPDATE perks SET unlocked=1 WHERE name='${btn.dataset.name.replace(/'/g,"''")}'`);
      log(`Unlocked perk: ${btn.dataset.name}!`, 'c-magenta');
      await updateHUD(); await menuPerks();
    });
  });
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
  let html = '<div class="c-yellow">--- Skills ---</div><table>';
  for (const s of skills) html += `<tr><td>${s.name}</td><td>Lv.${s.level}</td></tr>`;
  html += '</table>';
  html += '<div class="c-yellow" style="margin-top:6px">--- Guns ---</div>';
  if (guns.length === 0) html += '<div class="c-gray">None</div>';
  else { html += '<table>'; for (const g of guns) html += `<tr><td>${g.name}</td><td>${g.category}</td><td>+${g.bonus}%</td></tr>`; html += '</table>'; }
  html += '<div class="c-yellow" style="margin-top:6px">--- Items ---</div>';
  if (items.length === 0) html += '<div class="c-gray">None</div>';
  else {
    html += '<table>';
    for (const i of items) {
      html += `<tr><td>${i.item} x${i.qty}</td><td>`;
      if (i.item === 'Health Pack' || i.item === 'Fake ID') html += `<button class="btn use-item" data-item="${i.item}">Use</button>`;
      html += '</td></tr>';
    }
    html += '</table>';
  }
  html += '<div class="c-yellow" style="margin-top:6px">--- Drugs ---</div>';
  if (drugs.length === 0) html += '<div class="c-gray">None</div>';
  else { html += '<table>'; for (const d of drugs) html += `<tr><td>${d.name}</td><td>x${d.qty}</td></tr>`; html += '</table>'; }
  html += '<div class="c-yellow" style="margin-top:6px">--- Vehicles ---</div>';
  if (vehicles.length === 0) html += '<div class="c-gray">None</div>';
  else {
    html += '<div style="margin:4px 0"><button class="btn switch-vehicle" data-name="">Go on Foot</button></div>';
    for (const v of vehicles) {
      const status = v.stored ? ' (garaged)' : '';
      html += `<div style="margin:2px 0"><button class="btn switch-vehicle" data-name="${v.name}" data-stored="${v.stored}">${v.name}${status}</button></div>`;
    }
  }
  showSubMenuHTML('Inventory', html);
  $('sub-menu').querySelectorAll('.use-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const item = btn.dataset.item;
      const qty = (await qv(`SELECT qty FROM inventory WHERE item='${item}'`)) || 0;
      if (qty <= 0) { log(`No ${item} left!`, 'c-red'); return; }
      if (item === 'Health Pack') {
        const hasPerk = await qv(`SELECT unlocked FROM perks WHERE name='Back Alley Surgeon'`);
        const heal = hasPerk ? 50 : 40;
        await conn.query(`UPDATE player SET health=LEAST(100,health+${heal})`);
        log(`Used Health Pack. +${heal} HP.`, 'c-green');
      } else if (item === 'Fake ID') {
        await conn.query(`UPDATE player SET wanted_level=GREATEST(0,wanted_level-1)`);
        log('Used Fake ID. Wanted level reduced by 1.', 'c-green');
      }
      await conn.query(`UPDATE inventory SET qty=qty-1 WHERE item='${item}'`);
      await conn.query(`DELETE FROM inventory WHERE qty <= 0`);
      await updateHUD(); await menuInventory();
    });
  });
  $('sub-menu').querySelectorAll('.switch-vehicle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      if (!name) {
        // Go on foot — store all active vehicles
        await conn.query(`UPDATE vehicles SET stored=1 WHERE stored=0`);
        log('Going on foot. All vehicles stored.', 'c-cyan');
      } else {
        const isStored = btn.dataset.stored === '1';
        if (isStored) {
          // Take out of garage and make active
          await conn.query(`UPDATE vehicles SET stored=1 WHERE stored=0`); // store current
          await conn.query(`UPDATE vehicles SET stored=0 WHERE name='${name.replace(/'/g,"''")}'`);
          log(`Switched to ${name}. Other vehicles stored.`, 'c-green');
        } else {
          log(`Already driving ${name}.`, 'c-gray');
        }
      }
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
//  WAIT / REST
// --------------------------------------------------------
async function menuWait() {
  const clk = await q1('SELECT * FROM game_clock');
  const safeHouseLevel = await qv(`SELECT level FROM gang_upgrades WHERE name='safe_house'`) || 0;
  const ownedBiz = await qv(`SELECT COUNT(*) FROM businesses`) || 0;
  const canHideOut = safeHouseLevel > 0 || ownedBiz > 0;
  const options = [
    { label: 'Wait 1 hour', action: async () => {
      await advanceTime(1); await processWorldEvents();
      if (chance(15)) { await conn.query(`UPDATE player SET wanted_level = GREATEST(0, wanted_level - 1)`); log('Laying low... wanted level decreased.', 'c-green'); }
      log('Waited 1 hour.', 'c-gray');
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Wait until dawn (6:00)', action: async () => {
      const h = clk.hour >= 6 ? (24 - clk.hour + 6) : (6 - clk.hour);
      await advanceTime(h); await processWorldEvents();
      log(`Rested ${h} hours until dawn.`, 'c-cyan');
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Wait until noon (12:00)', action: async () => {
      const h = clk.hour >= 12 ? (24 - clk.hour + 12) : (12 - clk.hour);
      await advanceTime(h); await processWorldEvents();
      log(`Waited ${h} hours until noon.`, 'c-cyan');
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Wait until dusk (18:00)', action: async () => {
      const h = clk.hour >= 18 ? (24 - clk.hour + 18) : (18 - clk.hour);
      await advanceTime(h); await processWorldEvents();
      log(`Waited ${h} hours until dusk.`, 'c-cyan');
      hideSubMenu(); await updateHUD(); showMainActions();
    }},
    { label: 'Wait until midnight (0:00)', action: async () => {
      const h = clk.hour === 0 ? 24 : (24 - clk.hour);
      await advanceTime(h); await processWorldEvents();
      log(`Waited ${h} hours until midnight.`, 'c-cyan');
      hideSubMenu(); await updateHUD(); showMainActions();
    }}
  ];
  if (canHideOut) {
    options.unshift({
      label: `Rest at ${safeHouseLevel > 0 ? 'Safe House' : 'your Business'} (Sleep, heal, lose cops)`,
      action: async () => {
        const hoursToMorning = clk.hour >= 8 ? (24 - clk.hour + 8) : (8 - clk.hour);
        const restHours = Math.max(hoursToMorning, 4);
        stopSiren(); clearPoliceNPCs(); policeEncounterActive = false;
        await conn.query(`UPDATE player SET wanted_level=0, health=LEAST(100,health+40)`);
        await advanceTime(restHours); await processWorldEvents();
        log(`Laid low and rested for ${restHours} hours. Wanted level cleared, +40 HP.`, 'c-green');
        spawnParticlesAtDuck(0x44ff44, 10, 1.5, 1.5);
        hideSubMenu(); await updateHUD(); showMainActions();
      }
    });
  }
  showSubMenu(`Current time: Day ${clk.day}, ${String(clk.hour).padStart(2,'0')}:00`, options);
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
<div class="c-white">- Pick Oz at character select for hacker mode ($1M, all weapons).</div>

<div class="c-yellow" style="margin:8px 0 6px">--- Camera Settings ---</div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
  <button class="btn cam-btn" data-dist="10" data-height="8">Close-Up</button>
  <button class="btn cam-btn" data-dist="18" data-height="14">Medium</button>
  <button class="btn cam-btn" data-dist="22" data-height="18">Default</button>
  <button class="btn cam-btn" data-dist="32" data-height="26">Far</button>
  <button class="btn cam-btn" data-dist="40" data-height="32">Overview</button>
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
async function menuGarage() {
  const safeHouseLevel = await qv(`SELECT level FROM gang_upgrades WHERE name='safe_house'`);
  if (!safeHouseLevel || safeHouseLevel < 1) {
    log('You need a Safe House upgrade to store vehicles! Join a gang and upgrade.', 'c-red');
    return;
  }
  const maxSlots = safeHouseLevel * 3;
  const allVehicles = await q('SELECT * FROM vehicles');
  const stored = allVehicles.filter(v => v.stored);
  const active = allVehicles.filter(v => !v.stored);
  const options = [];
  // Store active vehicles
  for (const v of active) {
    options.push({
      label: `Store: ${v.name} (driving)`,
      action: async () => {
        if (stored.length >= maxSlots) { log(`Garage full! Max ${maxSlots} slots (upgrade safe house for more).`, 'c-red'); return; }
        await conn.query(`UPDATE vehicles SET stored=1 WHERE name='${v.name.replace(/'/g,"''")}'`);
        log(`Stored ${v.name} in your garage.`, 'c-green');
        await updateHUD(); await menuGarage();
      }
    });
  }
  // Retrieve stored vehicles
  for (const v of stored) {
    options.push({
      label: `Take out: ${v.name} (garaged)`,
      action: async () => {
        await conn.query(`UPDATE vehicles SET stored=0 WHERE name='${v.name.replace(/'/g,"''")}'`);
        log(`Took ${v.name} out of the garage.`, 'c-green');
        await updateHUD(); await menuGarage();
      }
    });
  }
  if (options.length === 0) {
    log('No vehicles to manage. Buy or steal some cars first!', 'c-yellow');
    return;
  }
  showSubMenu(`Garage (${stored.length}/${maxSlots} stored)`, options);
}

// --------------------------------------------------------
//  MENU FUNCTION MAP
// --------------------------------------------------------
const menuFunctions = {
  menuGuns, menuHospital, menuHookers, menuGambling, menuDrugs,
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
    { key: '7', action: menuDrugs }, { key: '8', action: menuVehicles }, { key: '9', action: menuGang },
    { key: '0', action: menuGambling }, { key: 'h', action: menuHookers }, { key: 'p', action: menuPerks },
    { key: 'i', action: menuInventory }, { key: 'n', action: menuNews }, { key: 'f5', action: saveGame },
    { key: 'r', action: menuStreetRace }, { key: 't', action: menuWait }, { key: 'g', action: menuGarage }, { key: '/', action: menuHelp }
  ];
  for (const a of actions) mainActionKeys[a.key] = a.action;
}
rebuildActionKeys();

document.addEventListener('keydown', async (e) => {
  // Don't capture keys when not in game (e.g. title screen, typing in input)
  if (!gameActive) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

  if (e.key === 'Escape' || e.key === 'Backspace') {
    e.preventDefault();
    if (policeEncounterActive) return; // Can't escape police encounters
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
  const startCity = selectedCard.dataset.city;
  const bonus = selectedCard.dataset.bonus;
  await initSchema();
  await initPlayer(name, startCity, bonus, charType);
  applyCharacterSkin(charType);
  await initWorld();
  $('title-screen').style.display = 'none';
  $('game-ui').style.display = 'block';
  setGameActive(true);
  log(`Welcome to Duck Theft Auto, ${name}!`, 'c-gold');
  if (startCity !== 'Los Santos') log(`Starting in ${startCity}.`, 'c-cyan');
  if (charType.toLowerCase() === 'oz') {
    log('HACKER MODE: $1,000,000 | All weapons unlocked | Max skills | Full armor', 'c-magenta');
    log('Oz is strapped and ready. No one stands a chance.', 'c-magenta');
  } else if (bonus === 'cash') {
    log('Street smart bonus: extra starting cash!', 'c-yellow');
  } else if (bonus !== 'none') {
    log(`Character bonus: +2 ${bonus} skill!`, 'c-cyan');
  }
  log('Move: WASD/Arrows | Shoot: Space/F | Interact: ENTER | Save: F5', 'c-cyan');
  log('[1] Travel  [2] Work  [3] Crime  [4] Guns  [5] Hospital  [6] Shops', 'c-gray');
  log('[7] Drugs  [8] Vehicles  [9] Gang & Empire  [0] Gambling', 'c-gray');
  const isOzChar = charType.toLowerCase() === 'oz';
  const startCash = isOzChar ? '1,000,000' : bonus === 'cash' ? '750' : '500';
  log('Starting cash: $' + startCash + '. Earn respect, join a gang, build your empire.', 'c-white');
  if (!isOzChar) log('Tip: Start with legal jobs [2] to earn cash safely, then try crime [3] for bigger payoffs.', 'c-yellow');
  await updateHUD(); await checkPOI();
  showMainActions();
  if (!window._autoSaveInterval) window._autoSaveInterval = setInterval(() => { if (gameActive) saveGame(); }, 5 * 60 * 1000);
};

window.loadGame = async function(slotName) {
  const loaded = await loadGameData({
    setGameActive,
    updateHUD,
    checkPOI,
    showMainActions
  }, slotName);
  if (!loaded) { alert('No save game found. Starting new game.'); return; }
  // Apply character skin from saved char_type
  const p = await q1('SELECT name, char_type FROM player');
  if (p) applyCharacterSkin(p.char_type || p.name);
  if (!window._autoSaveInterval) window._autoSaveInterval = setInterval(() => { if (gameActive) saveGame(); }, 5 * 60 * 1000);
};
