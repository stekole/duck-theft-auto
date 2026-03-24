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
  spawnParticlesAtDuck, startSiren, stopSiren,
  buildCity3D, spawnNPCs
} from './renderer.js';
import {
  conn, q, q1, qv, saveGame,
  initSchema, initPlayer, initWorld, loadCityMap, loadGameData, setLogFn
} from './db.js';

const $ = id => document.getElementById(id);

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

// --------------------------------------------------------
//  GAME CLOCK
// --------------------------------------------------------
async function advanceTime(hours) {
  const clk = await q1('SELECT * FROM game_clock');
  let h = clk.hour + hours;
  let d = clk.day;
  while (h >= 24) { h -= 24; d++; await dailyPayout(); await decayHeat(); }
  await conn.query(`UPDATE game_clock SET day=${d}, hour=${h}`);
}

async function dailyPayout() {
  const p = await q1('SELECT * FROM player');
  if (!p.gang) return;
  const tCount = await qv(`SELECT COUNT(*) FROM territories WHERE owner='${p.gang.replace(/'/g,"''")}'`);
  const tIncome = (tCount || 0) * 150;
  const bIncome = (await qv(`SELECT COALESCE(SUM(daily_income),0) FROM businesses`)) || 0;
  const smugLevel = await qv(`SELECT level FROM gang_upgrades WHERE name='smuggling_routes'`);
  const smugBonus = (smugLevel || 0) * 100;
  const upkeep = (await qv(`SELECT COALESCE(SUM(upkeep),0) FROM recruits`)) || 0;
  const net = tIncome + bIncome + smugBonus - upkeep;
  if (net !== 0) {
    await conn.query(`UPDATE player SET cash = cash + ${net}`);
    log(`Daily report: Territory $${tIncome} + Business $${bIncome} + Smuggling $${smugBonus} - Upkeep $${upkeep} = Net $${net}`, net >= 0 ? 'c-gold' : 'c-red');
  }
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

  const hasVehicle = await qv('SELECT COUNT(*) FROM vehicles');
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
  if (!poi) return;
  const menuFn = menuFunctions[poi.menu];
  if (menuFn) menuFn();
}

// --------------------------------------------------------
//  POLICE ENCOUNTER
// --------------------------------------------------------
async function checkPolice() {
  const p = await q1('SELECT * FROM player');
  if (p.wanted_level <= 0) return;
  if (!chance(p.wanted_level * 15)) return;
  log('>>> POLICE ENCOUNTER! <<<', 'c-red');
  startSiren();
  spawnParticlesAtDuck(0x4444ff, 10, 2, 2);
  showSubMenu('Police!', [
    { label: 'Run', action: () => policeRun(p) },
    { label: 'Bribe', action: () => policeBribe(p) },
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
  stopSiren();
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
  stopSiren();
  hideSubMenu(); await updateHUD();
}

async function policeSurrender(p) {
  const fine = rand(200, 800);
  await conn.query(`UPDATE player SET wanted_level = 0, cash = GREATEST(0, cash - ${fine})`);
  await advanceTime(4);
  log(`Surrendered. Spent time in jail, fined $${fine}. Wanted level cleared.`, 'c-yellow');
  stopSiren();
  hideSubMenu(); await updateHUD();
}

// --------------------------------------------------------
//  DEATH CHECK
// --------------------------------------------------------
async function checkDeath() {
  const health = await qv('SELECT health FROM player');
  if (health <= 0) {
    const respLoss = rand(25, 50);
    await conn.query(`UPDATE player SET health = 100, cash = GREATEST(0, cash - 200), respect = GREATEST(0, respect - ${respLoss}), wanted_level = 0, armor = 0`);
    await advanceTime(6);
    log('*** WASTED *** You wake up at the hospital. -$200, -' + respLoss + ' Respect.', 'c-red');
    spawnParticlesAtDuck(0xff0000, 25, 3, 2);
    await updateRank();
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
  if (clk.hour % 4 !== 0) return;
  if (!chance(25)) return;
  const allGangs = Object.values(GANGS).flat();
  const attacker = allGangs[rand(0, allGangs.length - 1)].replace(/'/g, "''");
  const targets = await q(`SELECT district, city, owner FROM territories WHERE owner != '${attacker}' AND owner != 'Unaffiliated' ORDER BY random() LIMIT 1`);
  if (targets.length === 0) return;
  const t = targets[0];
  if (chance(40)) {
    await conn.query(`UPDATE territories SET owner='${attacker}' WHERE district='${t.district.replace(/'/g,"''")}' AND city='${t.city.replace(/'/g,"''")}'`);
    const desc = `${attacker} seized ${t.district} from ${t.owner}!`;
    await conn.query(`INSERT INTO world_events(day,hour,description) VALUES (${clk.day},${clk.hour},'${desc.replace(/'/g,"''")}')`);
    log(`NEWS: ${desc}`, 'c-orange');
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

  await updateDistrict(nx, ny);
  await checkPOI();
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
  el.style.display = 'block';
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
}

function showSubMenuHTML(title, html) {
  const el = $('sub-menu');
  el.style.display = 'block';
  el.innerHTML = `<h4>${title}</h4>${html}<div style="margin-top:8px"><button class="btn" id="btn-back">Back</button></div>`;
  el.querySelector('#btn-back').addEventListener('click', () => { hideSubMenu(); showMainActions(); });
}

function hideSubMenu() { $('sub-menu').style.display = 'none'; $('sub-menu').innerHTML = ''; currentSubOptions = []; subMenuSelection = -1; }

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
    { key: 'S', label: 'Save Game',      action: saveGame },
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
  const hasVehicle = await qv('SELECT COUNT(*) FROM vehicles');
  const options = [];
  for (const city of Object.keys(CITIES)) {
    if (city === p.city) continue;
    const cost = hasVehicle > 0 ? 0 : rand(50, 200);
    options.push({
      label: `${city} ${cost > 0 ? '($' + cost + ')' : '(Free - own vehicle)'}`,
      action: async () => {
        if (p.cash < cost) { log('Not enough cash to travel!', 'c-red'); return; }
        await conn.query(`UPDATE player SET city='${city}', cash=cash-${cost}, district='${CITIES[city].districts[0].replace(/'/g,"''")}'`);
        await loadCityMap(city);
        let sx = 5, sy = 5;
        for (let y = 3; y < MAP_SIZE-3; y++) for (let x = 3; x < MAP_SIZE-3; x++) {
          if (currentMapGrid[y][x] === T.ROAD_MAIN || currentMapGrid[y][x] === T.ROAD_SIDE) { sx = x; sy = y; y = MAP_SIZE; break; }
        }
        await conn.query(`UPDATE player SET x=${sx}, y=${sy}`);
        setDuckTarget(sx + 0.5, sy + 0.5);
        if (duckGroup) { duckGroup.position.x = sx + 0.5; duckGroup.position.z = sy + 0.5; }
        await advanceTime(4); await processWorldEvents(); await checkPolice();
        log(`Traveled to ${city}!`, 'c-cyan');
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
  const options = JOBS.map(job => ({
    label: `${job.name} (${job.hours}h, $${job.min}-${job.max})`,
    action: async () => {
      const skill = await getSkill(job.skill);
      const base = rand(job.min, job.max);
      const bonus = skill * 5;
      const earnings = base + bonus;
      await conn.query(`UPDATE player SET cash = cash + ${earnings}`);
      await advanceTime(job.hours); await maybeSkillUp(job.skill);
      if (chance(25)) { await conn.query(`UPDATE player SET wanted_level = GREATEST(0, wanted_level - 1)`); log('Keeping a low profile... wanted level decreased.', 'c-green'); }
      log(`Worked as ${job.name}: earned $${earnings} (base $${base} + skill $${bonus})`, 'c-green');
      await processWorldEvents(); await checkPolice();
      hideSubMenu(); await updateHUD(); showMainActions();
    }
  }));
  showSubMenu('Legal Jobs', options);
}

// --------------------------------------------------------
//  CRIME
// --------------------------------------------------------
async function menuCrime() {
  const options = CRIMES.map(crime => ({
    label: `${crime.name} (${crime.hours}h)`,
    action: async () => { await commitCrime(crime); }
  }));
  showSubMenu('Criminal Activities', options);
}

async function commitCrime(crime) {
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
    await conn.query(`UPDATE player SET cash=cash+${loot}, health=GREATEST(0,health-${actualDmg}), respect=respect+${respect}, armor=GREATEST(0,armor-${dmg})`);
    const safeD = p.district.replace(/'/g, "''"); const safeC = p.city.replace(/'/g, "''");
    await conn.query(`UPDATE district_heat SET heat=heat+${crime.heat} WHERE district='${safeD}' AND city='${safeC}'`);
    if (crime.name === 'Carjack') {
      const v = VEHICLE_LIST[rand(0, VEHICLE_LIST.length - 1)];
      const exists = await qv(`SELECT COUNT(*) FROM vehicles WHERE name='${v.name}'`);
      if (!exists) { await conn.query(`INSERT INTO vehicles VALUES ('${v.name}')`); log(`Jacked a ${v.name}!`, 'c-cyan'); }
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
  await checkDeath(); await processWorldEvents(); await checkPolice();
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
  showSubMenuHTML('Ammu-Nation', html);
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
  showSubMenu('Convenience Store', options);
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
      await conn.query(`INSERT INTO vehicles VALUES ('${name}')`);
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
      label: `Join ${g}`,
      action: async () => {
        await conn.query(`UPDATE player SET gang='${g.replace(/'/g,"''")}', gang_rank='Outsider'`);
        log(`Joined ${g}!`, 'c-magenta');
        hideSubMenu(); await updateHUD(); showMainActions();
      }
    }));
    if (p.respect >= 1500) {
      options.push({ label: 'Create Your Own Gang', action: async () => {
        const rawName = prompt('Enter gang name:');
        if (!rawName) return;
        const name = rawName.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 30);
        if (!name) { log('Invalid gang name.', 'c-red'); return; }
        await conn.query(`UPDATE player SET gang='${name}', gang_rank='Boss'`);
        log(`Created gang: ${name}! You are the Boss.`, 'c-magenta');
        hideSubMenu(); await updateHUD(); showMainActions();
      }});
    }
    showSubMenu('Join a Gang', options); return;
  }
  showSubMenu(`${p.gang} - ${p.gang_rank}`, [
    { label: 'Territory Map', action: menuTerritoryMap },
    { label: 'Attack Territory', action: menuAttackTerritory },
    { label: 'Recruit Members', action: menuRecruit },
    { label: 'Upgrades', action: menuGangUpgrades },
    { label: 'Buy Business', action: menuBusiness },
    { label: 'View Recruits', action: menuViewRecruits },
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
  const targets = await q(`SELECT district, owner FROM territories WHERE city='${p.city.replace(/'/g,"''")}' AND owner != '${p.gang.replace(/'/g,"''")}' AND owner != 'Unaffiliated'`);
  if (targets.length === 0) {
    const unclaimed = await q(`SELECT district FROM territories WHERE city='${p.city.replace(/'/g,"''")}' AND owner='Unaffiliated'`);
    if (unclaimed.length === 0) { log('No territories to attack or claim here.', 'c-yellow'); return; }
    const options = unclaimed.map(t => ({
      label: `Claim ${t.district}`,
      action: async () => {
        await conn.query(`UPDATE territories SET owner='${p.gang.replace(/'/g,"''")}' WHERE district='${t.district.replace(/'/g,"''")}' AND city='${p.city.replace(/'/g,"''")}'`);
        log(`Claimed ${t.district} for ${p.gang}!`, 'c-green');
        await advanceTime(2); hideSubMenu(); await updateHUD(); showMainActions();
      }
    }));
    showSubMenu('Claim Territory', options); return;
  }
  const options = targets.map(t => ({
    label: `Attack ${t.district} (${t.owner})`,
    action: async () => {
      const recruitCount = (await qv('SELECT COUNT(*) FROM recruits')) || 0;
      const upgrades = (await qv(`SELECT COALESCE(SUM(level),0) FROM gang_upgrades`)) || 0;
      const strength = recruitCount * 2 + upgrades * 5;
      await advanceTime(3);
      if (chance(Math.min(40 + strength, 85))) {
        await conn.query(`UPDATE territories SET owner='${p.gang.replace(/'/g,"''")}' WHERE district='${t.district.replace(/'/g,"''")}' AND city='${p.city.replace(/'/g,"''")}'`);
        const respect = rand(25, 100);
        await conn.query(`UPDATE player SET respect=respect+${respect}`);
        log(`Victory! Took ${t.district} from ${t.owner}! +${respect} Respect`, 'c-green');
        await updateRank();
      } else {
        const dmg = rand(20, 50);
        await conn.query(`UPDATE player SET health=GREATEST(0,health-${dmg}), respect=GREATEST(0,respect-75)`);
        log(`Defeat! Failed to take ${t.district}. -${dmg} HP, -75 Respect.`, 'c-red');
        await checkDeath();
      }
      hideSubMenu(); await updateHUD(); showMainActions();
    }
  }));
  showSubMenu('Attack Territory', options);
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
//  GAMBLING
// --------------------------------------------------------
async function menuGambling() {
  showSubMenu('Gambling Den', [
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
    }}
  ]);
}

// --------------------------------------------------------
//  STREET RACING
// --------------------------------------------------------
async function menuStreetRace() {
  const hasVehicle = await qv('SELECT COUNT(*) FROM vehicles');
  if (!hasVehicle) { log('You need a vehicle to street race!', 'c-red'); return; }
  const drivingSkill = await getSkill('driving');
  const buyIn = rand(100, 500);
  const cash = await qv('SELECT cash FROM player');
  if (cash < buyIn) { log(`Need $${buyIn} buy-in for the race!`, 'c-red'); return; }
  showSubMenu(`Street Race - $${buyIn} buy-in`, [
    { label: 'Enter Race', action: async () => {
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
  else { for (const v of vehicles) html += `<div class="c-cyan">${v.name}</div>`; }
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
  showSubMenu(`Current time: Day ${clk.day}, ${String(clk.hour).padStart(2,'0')}:00`, [
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
  ]);
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
  <tr><td class="c-green">Buy weapons</td><td>Increase crime success chance</td></tr>
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
<div class="c-white">- Enter name "test" at start for $999,999.</div>

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
//  MENU FUNCTION MAP
// --------------------------------------------------------
const menuFunctions = {
  menuGuns, menuHospital, menuHookers, menuGambling, menuDrugs,
  menuShops, menuVehicles, menuJobs, menuGang
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
    { key: 'i', action: menuInventory }, { key: 'n', action: menuNews }, { key: 's', action: saveGame },
    { key: 'r', action: menuStreetRace }, { key: 't', action: menuWait }, { key: '/', action: menuHelp }
  ];
  for (const a of actions) mainActionKeys[a.key] = a.action;
}
rebuildActionKeys();

document.addEventListener('keydown', async (e) => {
  if ($('game-ui').style.display === 'none') return;

  if (e.key === 'Escape' || e.key === 'Backspace') {
    e.preventDefault();
    stopSiren();
    hideSubMenu();
    showMainActions();
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

  switch (e.key) {
    case 'ArrowUp':    case 'w': e.preventDefault(); await movePlayer(0, -1); return;
    case 'ArrowDown':  case 's': e.preventDefault(); await movePlayer(0, 1); return;
    case 'ArrowLeft':  case 'a': e.preventDefault(); await movePlayer(-1, 0); return;
    case 'ArrowRight': case 'd': e.preventDefault(); await movePlayer(1, 0); return;
    case 'Enter': e.preventDefault(); await enterPOI(); return;
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
  const name = $('player-name-input').value.trim() || 'CJ';
  await initSchema();
  await initPlayer(name);
  await initWorld();
  $('title-screen').style.display = 'none';
  $('game-ui').style.display = 'block';
  setGameActive(true);
  log(`Welcome to Duck Theft Auto, ${name}!`, 'c-gold');
  log('All game state is stored in DuckDB. Every action is a SQL query.', 'c-cyan');
  log('Walk with WASD/Arrows. Press ENTER on glowing markers to visit locations.', 'c-white');
  log('You start in Los Santos with $' + (name.toLowerCase() === 'test' ? '999,999' : '500') + '. Good luck.', 'c-white');
  await updateHUD(); await checkPOI();
  showMainActions();
  if (!window._autoSaveInterval) window._autoSaveInterval = setInterval(() => { if (gameActive) saveGame(); }, 5 * 60 * 1000);
};

window.loadGame = async function() {
  const loaded = await loadGameData({
    setGameActive,
    updateHUD,
    checkPOI,
    showMainActions
  });
  if (!loaded) { alert('No save game found. Starting new game.'); return; }
  if (!window._autoSaveInterval) window._autoSaveInterval = setInterval(() => { if (gameActive) saveGame(); }, 5 * 60 * 1000);
};
