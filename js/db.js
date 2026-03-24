import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';
import { T, CITIES, GANGS, MAP_SIZE, PERKS, GUNS } from './constants.js';
import { generateCityMap, buildGridCache } from './city.js';
import { buildCity3D, spawnNPCs, duckGroup, setDuckTarget } from './renderer.js';

export let db, conn;

// --------------------------------------------------------
//  DATABASE INITIALIZATION
// --------------------------------------------------------
export async function initDB() {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
  );
  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  conn = await db.connect();
  URL.revokeObjectURL(worker_url);
}

export async function initSchema() {
  await conn.query(`
    CREATE SEQUENCE IF NOT EXISTS event_id_seq START 1;
    CREATE SEQUENCE IF NOT EXISTS recruit_id_seq START 1;
    CREATE TABLE IF NOT EXISTS player(
      name VARCHAR, city VARCHAR, district VARCHAR,
      x INT DEFAULT 5, y INT DEFAULT 5,
      cash INT DEFAULT 500, health INT DEFAULT 100,
      armor INT DEFAULT 0, wanted_level INT DEFAULT 0,
      gang VARCHAR DEFAULT '', gang_rank VARCHAR DEFAULT '',
      respect INT DEFAULT 0, perk_points INT DEFAULT 0,
      adrenaline INT DEFAULT 0,
      char_type VARCHAR DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS game_clock(day INT DEFAULT 1, hour INT DEFAULT 8);
    CREATE TABLE IF NOT EXISTS map(x INT, y INT, tile VARCHAR);
    CREATE TABLE IF NOT EXISTS skills(name VARCHAR PRIMARY KEY, level INT DEFAULT 1);
    INSERT INTO skills VALUES ('driving',1),('strength',1),('charisma',1),('stealth',1),('dealing',1) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS guns(name VARCHAR PRIMARY KEY, category VARCHAR, bonus INT);
    CREATE TABLE IF NOT EXISTS inventory(item VARCHAR PRIMARY KEY, qty INT DEFAULT 1);
    CREATE TABLE IF NOT EXISTS drugs(name VARCHAR PRIMARY KEY, qty INT DEFAULT 0, avg_price INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS vehicles(name VARCHAR PRIMARY KEY, stored INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS territories(district VARCHAR, city VARCHAR, owner VARCHAR DEFAULT 'Unaffiliated', PRIMARY KEY(district, city));
    CREATE TABLE IF NOT EXISTS businesses(name VARCHAR, city VARCHAR, type VARCHAR, daily_income INT, PRIMARY KEY(name, city));
    CREATE TABLE IF NOT EXISTS recruits(id INT DEFAULT nextval('recruit_id_seq'), name VARCHAR, strength INT, upkeep INT);
    CREATE TABLE IF NOT EXISTS gang_upgrades(name VARCHAR PRIMARY KEY, level INT DEFAULT 0);
    INSERT INTO gang_upgrades VALUES ('safe_house',0),('weapon_locker',0),('smuggling_routes',0) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS gang_relations(gang VARCHAR PRIMARY KEY, relation VARCHAR DEFAULT 'Hostile');
    CREATE TABLE IF NOT EXISTS district_heat(district VARCHAR, city VARCHAR, heat INT DEFAULT 0, PRIMARY KEY(district, city));
    CREATE TABLE IF NOT EXISTS perks(name VARCHAR PRIMARY KEY, unlocked INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS world_events(id INT DEFAULT nextval('event_id_seq'), day INT, hour INT, description VARCHAR);
    CREATE TABLE IF NOT EXISTS remote_players(
      peer_id VARCHAR PRIMARY KEY,
      name VARCHAR,
      char_type VARCHAR,
      x INT DEFAULT 0,
      y INT DEFAULT 0,
      health INT DEFAULT 100,
      wanted_level INT DEFAULT 0,
      last_update BIGINT DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS connection_log(
      ts TIMESTAMP DEFAULT now(),
      peer_id VARCHAR,
      remote_ip VARCHAR DEFAULT 'unknown',
      event VARCHAR
    );
  `);
  for (const p of PERKS) await conn.query(`INSERT INTO perks VALUES ('${p.name}', 0) ON CONFLICT DO NOTHING`);
}

export async function initWorld() {
  for (const [city, data] of Object.entries(CITIES)) {
    for (const d of data.districts) {
      const safeD = d.replace(/'/g, "''");
      const safeC = city.replace(/'/g, "''");
      await conn.query(`INSERT INTO territories VALUES ('${safeD}','${safeC}','Unaffiliated')`);
      await conn.query(`INSERT INTO district_heat VALUES ('${safeD}','${safeC}',0)`);
    }
    const localGangs = GANGS[city];
    for (let i = 0; i < data.districts.length && i < localGangs.length * 2; i++) {
      const gang = localGangs[i % localGangs.length].replace(/'/g, "''");
      const dist = data.districts[i].replace(/'/g, "''");
      const safeC = city.replace(/'/g, "''");
      await conn.query(`UPDATE territories SET owner='${gang}' WHERE district='${dist}' AND city='${safeC}'`);
    }
  }
}

export async function loadCityMap(cityName) {
  await conn.query(`DELETE FROM map`);
  const tiles = generateCityMap(cityName);
  const chunkSize = 200;
  for (let i = 0; i < tiles.length; i += chunkSize) {
    const chunk = tiles.slice(i, i + chunkSize);
    const values = chunk.map(t => `(${t.x},${t.y},'${t.tile}')`).join(',');
    await conn.query(`INSERT INTO map VALUES ${values}`);
  }
  buildGridCache(tiles);
  buildCity3D();
  spawnNPCs();
}

export async function initPlayer(name, startCity = 'Los Santos', bonus = 'none', charType = '') {
  const isOz = (charType || name).toLowerCase() === 'oz';
  let cash = isOz ? 1000000 : bonus === 'cash' ? 750 : 500;
  const safeName = name.replace(/'/g, "''");
  const safeCity = startCity.replace(/'/g, "''");
  const district = (CITIES[startCity]?.districts[0] || 'Grove Street').replace(/'/g, "''");
  const tiles = generateCityMap(startCity);
  let startX = 5, startY = 5;
  for (const t of tiles) {
    if ((t.tile === T.ROAD_MAIN || t.tile === T.ROAD_SIDE) && t.x > 3 && t.y > 3) { startX = t.x; startY = t.y; break; }
  }
  const safeCharType = (charType || name).replace(/'/g, "''");
  await conn.query(`INSERT INTO player VALUES ('${safeName}','${safeCity}','${district}',${startX},${startY},${cash},100,0,0,'','',0,0,0,'${safeCharType}')`);
  await conn.query(`INSERT INTO game_clock VALUES (1,8)`);
  if (bonus !== 'none' && bonus !== 'cash') {
    await conn.query(`UPDATE skills SET level = level + 2 WHERE name='${bonus}'`);
  }
  // Oz hacker: all weapons, max skills, armor
  if (isOz) {
    for (const gun of GUNS) {
      await conn.query(`INSERT INTO guns VALUES ('${gun.name.replace(/'/g,"''")}','${gun.cat}',${gun.bonus}) ON CONFLICT DO NOTHING`);
    }
    await conn.query(`UPDATE skills SET level = 10`);
    await conn.query(`UPDATE player SET armor = 100, respect = 5000`);
  }
  await loadCityMap(startCity);

  // Position duck
  setDuckTarget(startX + 0.5, startY + 0.5);
  if (duckGroup) {
    duckGroup.position.x = startX + 0.5;
    duckGroup.position.z = startY + 0.5;
  }
}

// --------------------------------------------------------
//  QUERY HELPERS
// --------------------------------------------------------
export async function q(sql) {
  const result = await conn.query(sql);
  return result.toArray().map(row => {
    const obj = {};
    for (const field of result.schema.fields) {
      let val = row[field.name];
      if (typeof val === 'bigint') val = Number(val);
      obj[field.name] = val;
    }
    return obj;
  });
}
export async function q1(sql) { const rows = await q(sql); return rows[0] || null; }
export async function qv(sql) { const row = await q1(sql); if (!row) return null; return Object.values(row)[0]; }

// --------------------------------------------------------
//  SAVE / LOAD
// --------------------------------------------------------
export async function saveGame() {
  try {
    const tables = ['player','game_clock','skills','guns','inventory','drugs','vehicles','territories','businesses','recruits','gang_upgrades','gang_relations','district_heat','perks','world_events'];
    const saveData = {};
    for (const t of tables) saveData[t] = await q(`SELECT * FROM ${t}`);
    // Save to named slot and legacy key
    const player = saveData.player?.[0];
    const slotName = player ? player.name : 'Unknown';
    localStorage.setItem('duck_theft_auto_save', JSON.stringify(saveData));
    // Save index of all sessions
    const indexRaw = localStorage.getItem('dta_save_index');
    const index = indexRaw ? JSON.parse(indexRaw) : {};
    index[slotName] = {
      name: slotName,
      city: player?.city || '?',
      cash: player?.cash || 0,
      day: saveData.game_clock?.[0]?.day || 1,
      timestamp: Date.now()
    };
    localStorage.setItem('dta_save_index', JSON.stringify(index));
    localStorage.setItem('dta_save_' + slotName, JSON.stringify(saveData));
    _dbLog('Game saved!', 'c-green');
  } catch (e) { _dbLog('Save failed: ' + e.message, 'c-red'); }
}

export function getSaveIndex() {
  const raw = localStorage.getItem('dta_save_index');
  return raw ? JSON.parse(raw) : {};
}

export async function loadGameData(callbacks, slotName) {
  const raw = slotName
    ? localStorage.getItem('dta_save_' + slotName)
    : localStorage.getItem('duck_theft_auto_save');
  if (!raw) { _dbLog('No save found!', 'c-red'); return false; }
  try {
    const saveData = JSON.parse(raw);
    await initSchema();
    for (const [table, rows] of Object.entries(saveData)) {
      await conn.query(`DELETE FROM ${table}`);
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map(c => {
          const v = row[c];
          if (v === null || v === undefined) return 'NULL';
          if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
          return v;
        });
        await conn.query(`INSERT INTO ${table}(${cols.join(',')}) VALUES (${vals.join(',')})`);
      }
    }
    const p = await q1('SELECT city, x, y FROM player');
    await loadCityMap(p.city);
    setDuckTarget(p.x + 0.5, p.y + 0.5);
    if (duckGroup) { duckGroup.position.x = p.x + 0.5; duckGroup.position.z = p.y + 0.5; }
    const $ = id => document.getElementById(id);
    $('title-screen').style.display = 'none';
    $('game-ui').style.display = 'block';
    callbacks.setGameActive(true);
    await callbacks.updateHUD();
    await callbacks.checkPOI();
    callbacks.showMainActions();
    _dbLog('Game loaded!', 'c-green');
    return true;
  } catch (e) { _dbLog('Load failed: ' + e.message, 'c-red'); return false; }
}

// Multiplayer: log connection events
export async function logConnection(peerId, remoteIp, event) {
  const safePeer = peerId.replace(/'/g, "''");
  const safeIp = (remoteIp || 'unknown').replace(/'/g, "''");
  const safeEvent = event.replace(/'/g, "''");
  await conn.query(`INSERT INTO connection_log(peer_id, remote_ip, event) VALUES ('${safePeer}','${safeIp}','${safeEvent}')`);
}

// Multiplayer: update remote player position
export async function upsertRemotePlayer(peerId, data) {
  const safePeer = peerId.replace(/'/g, "''");
  const safeName = (data.name || 'Unknown').replace(/'/g, "''");
  const safeChar = (data.char || '').replace(/'/g, "''");
  const x = data.x ?? 0;
  const y = data.y ?? 0;
  const health = data.health ?? 100;
  const wanted = data.wanted ?? 0;
  // Delete + insert since DuckDB WASM doesn't support ON CONFLICT UPDATE well
  await conn.query(`DELETE FROM remote_players WHERE peer_id='${safePeer}'`);
  await conn.query(`INSERT INTO remote_players VALUES ('${safePeer}','${safeName}','${safeChar}',${x},${y},${health},${wanted},${Date.now()})`);
}

// Multiplayer: remove remote player
export async function removeRemotePlayer(peerId) {
  const safePeer = peerId.replace(/'/g, "''");
  await conn.query(`DELETE FROM remote_players WHERE peer_id='${safePeer}'`);
}

// Multiplayer: get all remote players
export async function getRemotePlayers() {
  return await q('SELECT * FROM remote_players');
}

// log is injected after game.js loads
let _dbLog = () => {};
export function setLogFn(fn) { _dbLog = fn; }
