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
  // Force MVP bundle when not cross-origin isolated (e.g. GitHub Pages)
  // to avoid SharedArrayBuffer requirement
  const bundle = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
    ? await duckdb.selectBundle(JSDELIVR_BUNDLES)
    : await duckdb.selectBundle({ mvp: JSDELIVR_BUNDLES.mvp });
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
    CREATE SEQUENCE IF NOT EXISTS action_log_seq START 1;
    CREATE TABLE IF NOT EXISTS action_log(
      id INT DEFAULT nextval('action_log_seq'),
      tick BIGINT,
      action VARCHAR,
      detail VARCHAR,
      x INT,
      y INT
    );
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
    CREATE TABLE IF NOT EXISTS guns(name VARCHAR PRIMARY KEY, category VARCHAR, bonus INT, equipped BOOLEAN DEFAULT FALSE);
    CREATE TABLE IF NOT EXISTS inventory(item VARCHAR PRIMARY KEY, qty INT DEFAULT 1);
    CREATE TABLE IF NOT EXISTS drugs(name VARCHAR PRIMARY KEY, qty INT DEFAULT 0, avg_price INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS vehicles(name VARCHAR PRIMARY KEY, stored INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS territories(district VARCHAR, city VARCHAR, owner VARCHAR DEFAULT 'Unaffiliated', PRIMARY KEY(district, city));
    CREATE TABLE IF NOT EXISTS businesses(name VARCHAR, city VARCHAR, type VARCHAR, daily_income INT, PRIMARY KEY(name, city));
    CREATE TABLE IF NOT EXISTS recruits(id INT DEFAULT nextval('recruit_id_seq'), name VARCHAR, strength INT, upkeep INT);
    CREATE TABLE IF NOT EXISTS gang_upgrades(name VARCHAR PRIMARY KEY, level INT DEFAULT 0);
    INSERT INTO gang_upgrades VALUES ('safe_house',0),('weapon_locker',0),('smuggling_routes',0) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS gang_relations(gang VARCHAR PRIMARY KEY, relation VARCHAR DEFAULT 'Hostile');
    CREATE TABLE IF NOT EXISTS heist_progress(heist_id INT PRIMARY KEY, step INT DEFAULT 0, completed BOOLEAN DEFAULT FALSE);
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
  await conn.query(PERKS.map(p => `INSERT INTO perks VALUES ('${p.name}', 0) ON CONFLICT DO NOTHING`).join(';'));
}

export async function initWorld() {
  const territoryVals = [];
  const heatVals = [];
  const gangUpdates = [];
  for (const [city, data] of Object.entries(CITIES)) {
    const safeC = city.replace(/'/g, "''");
    for (const d of data.districts) {
      const safeD = d.replace(/'/g, "''");
      territoryVals.push(`('${safeD}','${safeC}','Unaffiliated')`);
      heatVals.push(`('${safeD}','${safeC}',0)`);
    }
    const localGangs = GANGS[city];
    for (let i = 0; i < data.districts.length && i < localGangs.length * 2; i++) {
      const gang = localGangs[i % localGangs.length].replace(/'/g, "''");
      const dist = data.districts[i].replace(/'/g, "''");
      gangUpdates.push(`UPDATE territories SET owner='${gang}' WHERE district='${dist}' AND city='${safeC}'`);
    }
  }
  await conn.query(`INSERT INTO territories VALUES ${territoryVals.join(',')}`);
  await conn.query(`INSERT INTO district_heat VALUES ${heatVals.join(',')}`);
  if (gangUpdates.length > 0) await conn.query(gangUpdates.join(';'));
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
  const _ct = (charType || name).toLowerCase();
  const isOz = _ct === 'oz' || _ct === 'izzy';
  const ct = (charType || '').toLowerCase();

  // Character-specific starting cash (moderately generous)
  const CHAR_CASH = {
    cj: 2000, tommy: 3500, claude: 2500, niko: 2000, catalina: 3000
  };
  let cash = isOz ? 1000000 : CHAR_CASH[ct] || (bonus === 'cash' ? 3500 : 2000);

  const safeName = name.replace(/'/g, "''");
  const safeCity = startCity.replace(/'/g, "''");
  const district = (CITIES[startCity]?.districts[0] || 'Grove Street').replace(/'/g, "''");
  const tiles = generateCityMap(startCity);
  let startX = 5, startY = 5;
  for (const t of tiles) {
    if ((t.tile === T.ROAD_MAIN || t.tile === T.ROAD_SIDE) && t.x > 3 && t.y > 3) { startX = t.x; startY = t.y; break; }
  }
  const safeCharType = (charType || name).replace(/'/g, "''");
  const stmts = [
    `INSERT INTO player VALUES ('${safeName}','${safeCity}','${district}',${startX},${startY},${cash},100,0,0,'','',0,0,0,'${safeCharType}')`,
    `INSERT INTO game_clock VALUES (1,8)`
  ];
  if (bonus !== 'none' && bonus !== 'cash') {
    stmts.push(`UPDATE skills SET level = level + 2 WHERE name='${bonus}'`);
  }

  // Character-specific starting perks & gear
  if (!isOz) {
    switch (ct) {
      case 'cj':
        stmts.push(`UPDATE skills SET level = level + 2 WHERE name='charisma'`);
        stmts.push(`UPDATE player SET respect = 50`);
        break;
      case 'tommy':
        stmts.push(`INSERT INTO guns VALUES ('Hawk 9','Pistol',5,TRUE) ON CONFLICT DO NOTHING`);
        stmts.push(`UPDATE player SET armor = 50`);
        break;
      case 'claude':
        stmts.push(`UPDATE player SET respect = 100`);
        break;
      case 'niko':
        stmts.push(`UPDATE player SET armor = 75, respect = 75`);
        break;
      case 'catalina':
        stmts.push(`INSERT INTO guns VALUES ('Viper SMG','SMG',16,TRUE) ON CONFLICT DO NOTHING`);
        stmts.push(`UPDATE player SET respect = 25`);
        break;
    }
  }

  // Oz hacker: all weapons, max skills, armor
  if (isOz) {
    for (let gi = 0; gi < GUNS.length; gi++) {
      const gun = GUNS[gi];
      stmts.push(`INSERT INTO guns VALUES ('${gun.name.replace(/'/g,"''")}','${gun.cat}',${gun.bonus},${gi === 0 ? 'TRUE' : 'FALSE'}) ON CONFLICT DO NOTHING`);
    }
    stmts.push(`UPDATE skills SET level = 10`);
    stmts.push(`UPDATE player SET armor = 100, respect = 5000`);
  }
  await conn.query(stmts.join(';'));
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
export async function exec(sql) {
  await conn.query(sql);
}

export async function logAction(action, detail = '', x = null, y = null) {
  const tick = Date.now();
  const safeAction = action.replace(/'/g, "''");
  const safeDetail = String(detail).slice(0, 200).replace(/'/g, "''");
  await conn.query(`INSERT INTO action_log(tick, action, detail, x, y) VALUES (${tick}, '${safeAction}', '${safeDetail}', ${x ?? 'NULL'}, ${y ?? 'NULL'})`);
}

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
    const tables = ['player','game_clock','skills','guns','inventory','drugs','vehicles','territories','businesses','recruits','gang_upgrades','gang_relations','district_heat','perks','world_events','action_log'];
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

const VALID_TABLES = ['player','game_clock','skills','guns','inventory','drugs','vehicles','territories','businesses','recruits','gang_upgrades','gang_relations','district_heat','perks','world_events','action_log'];
const VALID_COLUMNS = {
  player: ['name','city','district','x','y','cash','health','armor','wanted_level','gang','gang_rank','respect','perk_points','adrenaline','char_type'],
  game_clock: ['day','hour'],
  skills: ['name','level'],
  guns: ['name','category','bonus'],
  inventory: ['item','qty'],
  drugs: ['name','qty','avg_price'],
  vehicles: ['name','stored'],
  territories: ['district','city','owner'],
  businesses: ['name','city','type','daily_income'],
  recruits: ['id','name','strength','upkeep'],
  gang_upgrades: ['name','level'],
  gang_relations: ['gang','relation'],
  district_heat: ['district','city','heat'],
  perks: ['name','unlocked'],
  world_events: ['id','day','hour','description'],
  action_log: ['id','tick','action','detail','x','y']
};

export async function loadGameData(callbacks, slotName) {
  const raw = slotName
    ? localStorage.getItem('dta_save_' + slotName)
    : localStorage.getItem('duck_theft_auto_save');
  if (!raw) { _dbLog('No save found!', 'c-red'); return false; }
  try {
    const saveData = JSON.parse(raw);
    await initSchema();
    for (const [table, rows] of Object.entries(saveData)) {
      if (!VALID_TABLES.includes(table)) continue;
      await conn.query(`DELETE FROM ${table}`);
      const validCols = VALID_COLUMNS[table] || [];
      for (const row of rows) {
        const cols = Object.keys(row).filter(c => validCols.includes(c));
        if (cols.length === 0) continue;
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
  const safeName = String(data.name || 'Unknown').slice(0, 32).replace(/'/g, "''");
  const safeChar = String(data.char || '').slice(0, 20).replace(/'/g, "''");

  // Validate numeric fields to prevent SQL injection via non-numeric values
  let x = Number(data.x);
  x = Number.isFinite(x) ? Math.floor(x) : 0;
  let y = Number(data.y);
  y = Number.isFinite(y) ? Math.floor(y) : 0;
  let health = Number(data.health);
  health = Number.isFinite(health) ? Math.max(0, Math.min(100, Math.floor(health))) : 100;
  let wanted = Number(data.wanted);
  wanted = Number.isFinite(wanted) ? Math.max(0, Math.min(5, Math.floor(wanted))) : 0;

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
