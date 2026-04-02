import { T, CITIES, MAP_SIZE } from './constants.js';

// Seeded PRNG (mulberry32) for deterministic map generation across peers
function _seededRNG(seed) {
  let s = seed | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return hash;
}

// --------------------------------------------------------
//  CITY MAP GENERATORS
// --------------------------------------------------------
const cityMapCache = {};
export let currentMapGrid = null;
let _mapSeed = 42;
export function setMapSeed(seed) { _mapSeed = seed; cityMapCache[Symbol.for('_clear')] = true; for (const k in cityMapCache) delete cityMapCache[k]; }

export function generateCityMap(cityName) {
  if (cityMapCache[cityName]) return cityMapCache[cityName];
  // Deterministic RNG: same seed + city name = same map on every client
  const rng = _seededRNG(_mapSeed + _hashString(cityName));
  const S = MAP_SIZE;
  const grid = Array.from({length: S}, () => Array(S).fill(T.GROUND));
  const city = CITIES[cityName];
  const H = Math.floor(S / 2); // midpoint
  const Q = Math.floor(S / 4); // quarter

  for (let i = 0; i < S; i++) {
    grid[0][i] = T.WALL; grid[S-1][i] = T.WALL;
    grid[i][0] = T.WALL; grid[i][S-1] = T.WALL;
  }

  if (city.waterSide === 'south') {
    for (let x = 0; x < S; x++) { grid[S-1][x] = T.WATER; grid[S-2][x] = T.WATER; grid[S-3][x] = T.WATER; grid[S-4][x] = T.WATER; grid[S-5][x] = T.SAND; grid[S-6][x] = T.SAND; }
  } else if (city.waterSide === 'west') {
    for (let y = 0; y < S; y++) { grid[y][0] = T.WATER; grid[y][1] = T.WATER; grid[y][2] = T.WATER; grid[y][3] = T.WATER; }
  } else if (city.waterSide === 'east') {
    for (let y = 0; y < S; y++) { grid[y][S-1] = T.WATER; grid[y][S-2] = T.WATER; grid[y][S-3] = T.WATER; grid[y][S-4] = T.WATER; }
  } else if (city.waterSide === 'surround') {
    for (let i = 0; i < S; i++) {
      grid[0][i] = T.WATER; grid[1][i] = T.WATER; grid[2][i] = T.WATER;
      grid[S-1][i] = T.WATER; grid[S-2][i] = T.WATER; grid[S-3][i] = T.WATER;
      grid[i][0] = T.WATER; grid[i][1] = T.WATER; grid[i][2] = T.WATER;
      grid[i][S-1] = T.WATER; grid[i][S-2] = T.WATER; grid[i][S-3] = T.WATER;
    }
    for (let x = H-4; x <= H+4; x++) { grid[0][x] = T.ROAD_MAIN; grid[1][x] = T.ROAD_MAIN; grid[2][x] = T.ROAD_MAIN; grid[S-1][x] = T.ROAD_MAIN; grid[S-2][x] = T.ROAD_MAIN; grid[S-3][x] = T.ROAD_MAIN; }
    for (let y = H-4; y <= H+4; y++) { grid[y][0] = T.ROAD_MAIN; grid[y][1] = T.ROAD_MAIN; grid[y][2] = T.ROAD_MAIN; grid[y][S-1] = T.ROAD_MAIN; grid[y][S-2] = T.ROAD_MAIN; grid[y][S-3] = T.ROAD_MAIN; }
  }

  // Main roads: cross pattern + grid
  if (cityName === 'Los Santos') {
    for (let i = 1; i < S-1; i++) { grid[H][i] = T.ROAD_MAIN; grid[i][H] = T.ROAD_MAIN; }

    for (let i = 1; i < S-1; i++) { grid[Q][i] = T.ROAD_SIDE; grid[S-Q][i] = T.ROAD_SIDE; grid[i][Q] = T.ROAD_SIDE; grid[i][S-Q] = T.ROAD_SIDE; }
    // Extra grid roads every 10
    for (let i = 1; i < S-1; i++) { if (i % 10 === 0 && i !== H && i !== Q && i !== S-Q) { for (let j = 1; j < S-1; j++) if (grid[i][j] === T.GROUND) grid[i][j] = T.ROAD_SIDE; } }
    for (let x = 1; x < S-1; x++) { grid[3][x] = T.HIGHWAY; grid[4][x] = T.HIGHWAY; }
    // Parks
    for (let y = 5; y <= 18; y++) for (let x = 5; x <= 18; x++) grid[y][x] = T.PARK;
    for (let n = 0; n < 10; n++) { const py = 5+Math.floor(rng()*14); const px = 5+Math.floor(rng()*14); grid[py][px] = T.TREE; }
    // Large park in south-center
    for (let y = S-25; y <= S-15; y++) for (let x = H-8; x <= H+8; x++) { if (grid[y][x] === T.GROUND) { grid[y][x] = T.PARK; if (rng() < 0.2) grid[y][x] = T.TREE; } }
    // Forest NE
    for (let y = 4; y <= 16; y++) for (let x = S-30; x <= S-8; x++) if (grid[y][x] === T.GROUND && rng() < 0.35) grid[y][x] = T.TREE;
    // Docks along the beach
    for (let x = Q; x <= Q+15; x++) { grid[S-6][x] = T.DOCK; grid[S-7][x] = T.DOCK; }
    // Industrial east
    for (let y = S-30; y <= S-12; y++) for (let x = S-25; x <= S-8; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.INDUSTRIAL;
    // Second industrial NW
    for (let y = 20; y <= 35; y++) for (let x = 5; x <= 18; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.INDUSTRIAL;
  } else if (cityName === 'San Fierro') {
    for (let i = 4; i < S-1; i++) { grid[H][i] = T.ROAD_MAIN; grid[i][H] = T.ROAD_MAIN; }

    for (let i = 5; i < S-5; i++) { const j = Math.min(S-2, Math.max(1, i + Math.floor(S/8))); if (grid[i][j] !== T.WATER) grid[i][j] = T.ROAD_SIDE; }
    for (let i = 4; i < S-1; i++) { grid[Q][i] = T.ROAD_SIDE; grid[S-Q][i] = T.ROAD_SIDE; grid[i][Math.floor(S/5)]=T.ROAD_SIDE; grid[i][S-Math.floor(S/5)]=T.ROAD_SIDE; }
    // Extra roads
    for (let i = 10; i < S-10; i += 12) for (let j = 4; j < S-1; j++) if (grid[i][j] === T.GROUND) grid[i][j] = T.ROAD_SIDE;
    // Large park
    for (let y = Q; y <= Q+12; y++) for (let x = 8; x <= Q+4; x++) { grid[y][x] = T.PARK; if (rng() < 0.25) grid[y][x] = T.TREE; }
    // Bridge west
    for (let y = Q+5; y <= S-Q-5; y++) { grid[y][4] = T.BRIDGE; grid[y][5] = T.BRIDGE; }
    // Docks
    for (let y = S-Q-5; y <= S-10; y++) { grid[y][4] = T.DOCK; grid[y][5] = T.DOCK; grid[y][6] = T.DOCK; }
    // Industrial
    for (let y = S-Q-5; y <= S-10; y++) for (let x = 7; x <= 20; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.INDUSTRIAL;
    for (let y = 10; y <= 25; y++) for (let x = S-25; x <= S-10; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.INDUSTRIAL;
    for (let x = 4; x < S-1; x++) { grid[6][x] = T.HIGHWAY; grid[7][x] = T.HIGHWAY; }
    // Southern park
    for (let y = S-20; y <= S-10; y++) for (let x = H-6; x <= H+6; x++) if (grid[y][x] === T.GROUND) { grid[y][x] = T.PARK; if (rng()<0.2) grid[y][x]=T.TREE; }
  } else if (cityName === 'Las Venturas') {
    for (let i = 1; i < S-1; i++) { grid[i][H] = T.ROAD_MAIN; grid[i][H+1] = T.ROAD_MAIN; grid[H][i] = T.ROAD_MAIN; }

    for (let i = 1; i < S-1; i++) { grid[Q][i] = T.ROAD_SIDE; grid[S-Q][i] = T.ROAD_SIDE; grid[i][Q] = T.ROAD_SIDE; grid[i][S-Q] = T.ROAD_SIDE; }
    // Extra grid
    for (let i = 12; i < S-12; i += 15) for (let j = 1; j < S-1; j++) if (grid[i][j] === T.GROUND) grid[i][j] = T.ROAD_SIDE;
    // Desert edges
    for (let y = 1; y < S-1; y++) for (let x = 1; x < 8; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.SAND;
    for (let y = 1; y < S-1; y++) for (let x = S-8; x < S-1; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.SAND;
    for (let y = 1; y < 8; y++) for (let x = 1; x < S-1; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.SAND;
    for (let y = S-8; y < S-1; y++) for (let x = 1; x < S-1; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.SAND;
    // Highway loop
    for (let x = 1; x < S-1; x++) { grid[10][x] = T.HIGHWAY; grid[S-11][x] = T.HIGHWAY; }
    for (let y = 10; y <= S-11; y++) { grid[y][10] = T.HIGHWAY; grid[y][S-11] = T.HIGHWAY; }
    // Park/oasis NW
    for (let y = 14; y <= 24; y++) for (let x = 14; x <= 24; x++) { grid[y][x] = T.PARK; if (rng()<0.25) grid[y][x]=T.TREE; }
    // Park SE
    for (let y = S-28; y <= S-18; y++) for (let x = S-28; x <= S-18; x++) if (grid[y][x]===T.GROUND) { grid[y][x]=T.PARK; if(rng()<0.2) grid[y][x]=T.TREE; }
    // Industrial south
    for (let y = S-25; y <= S-14; y++) for (let x = 14; x <= 30; x++) if (grid[y][x]===T.GROUND) grid[y][x]=T.INDUSTRIAL;
  } else if (cityName === 'Vice City') {
    for (let i = 3; i < S-3; i++) { grid[H][i] = T.ROAD_MAIN; grid[i][H] = T.ROAD_MAIN; }

    for (let i = 3; i < S-3; i++) { grid[Q][i] = T.ROAD_SIDE; grid[S-Q][i] = T.ROAD_SIDE; grid[i][Q] = T.ROAD_SIDE; grid[i][S-Q] = T.ROAD_SIDE; }
    // Extra roads
    for (let i = 15; i < S-15; i += 12) for (let j = 3; j < S-3; j++) if (grid[i][j]===T.GROUND) grid[i][j]=T.ROAD_SIDE;
    // Sandy beaches around the water
    for (let y = 3; y < S-3; y++) for (let x = 3; x < S-3; x++) {
      if (grid[y][x] === T.GROUND && (y <= 7 || y >= S-8 || x <= 7 || x >= S-8)) grid[y][x] = T.SAND;
    }
    for (let y = 5; y < S-5; y++) for (let x = 5; x < S-5; x++) {
      if (grid[y][x] === T.SAND && rng() < 0.12) grid[y][x] = T.TREE;
    }
    // Bridges
    for (let x = H-4; x <= H+4; x++) { grid[3][x] = T.BRIDGE; grid[S-4][x] = T.BRIDGE; }
    for (let y = H-4; y <= H+4; y++) { grid[y][3] = T.BRIDGE; grid[y][S-4] = T.BRIDGE; }
    // Marina/docks
    for (let x = S-Q; x <= S-Q+15; x++) { if (x<S-1) { grid[4][x] = T.DOCK; grid[5][x] = T.DOCK; } }
    for (let y = S-Q; y <= S-Q+10; y++) { if (y<S-1) { grid[y][4] = T.DOCK; grid[y][5] = T.DOCK; } }
    // Highway ring
    for (let x = 10; x < S-10; x++) { grid[12][x] = T.HIGHWAY; grid[S-13][x] = T.HIGHWAY; }
    // Central park
    for (let y = H-8; y <= H-2; y++) for (let x = H-8; x <= H-2; x++) if (grid[y][x]===T.GROUND) { grid[y][x]=T.PARK; if (rng()<0.2) grid[y][x]=T.TREE; }
  } else if (cityName === 'Liberty City') {
    for (let i = 1; i < S-1; i++) { grid[i][H] = T.ROAD_MAIN; grid[H][i] = T.ROAD_MAIN; }

    // Dense grid
    for (let r = 6; r < S-1; r += 6) for (let i = 1; i < S-1; i++) { if (grid[r][i] === T.GROUND) grid[r][i] = T.ROAD_SIDE; }
    for (let c = 6; c < S-1; c += 6) for (let i = 1; i < S-1; i++) { if (grid[i][c] === T.GROUND) grid[i][c] = T.ROAD_SIDE; }
    // Dense high-rise core (east side near water)
    for (let y = Q; y <= S-Q; y++) for (let x = S-12; x < S-4; x++) { if (grid[y][x] === T.GROUND) grid[y][x] = T.WALL; }
    // Bridge over east river
    for (let y = H-6; y <= H+6; y++) { grid[y][S-4] = T.BRIDGE; grid[y][S-3] = T.BRIDGE; grid[y][S-2] = T.BRIDGE; }
    // Industrial docks north
    for (let x = 5; x <= 30; x++) for (let y = 3; y <= 10; y++) { if (grid[y][x] === T.GROUND) grid[y][x] = T.INDUSTRIAL; }
    for (let x = 5; x <= 20; x++) { grid[3][x] = T.DOCK; grid[4][x] = T.DOCK; }
    // Industrial south
    for (let x = 5; x <= 25; x++) for (let y = S-12; y <= S-5; y++) if (grid[y][x]===T.GROUND) grid[y][x]=T.INDUSTRIAL;
    // Highway
    for (let y = 1; y < S-1; y++) { grid[y][12] = T.HIGHWAY; }
    for (let x = 12; x < S-4; x++) { grid[S-14][x] = T.HIGHWAY; }
    // Parks
    for (let y = H-6; y <= H+4; y++) for (let x = H-8; x <= H-1; x++) { if (grid[y][x]===T.GROUND) { grid[y][x]=T.PARK; if (rng()<0.2) grid[y][x]=T.TREE; } }
    for (let y = 14; y <= 22; y++) for (let x = H+5; x <= H+14; x++) if (grid[y][x]===T.GROUND) { grid[y][x]=T.PARK; if (rng()<0.15) grid[y][x]=T.TREE; }
  }

  // Add open plazas (flat walkable spaces between buildings)
  const plazaCount = 6 + Math.floor(rng() * 6);
  for (let p = 0; p < plazaCount; p++) {
    const cx = 10 + Math.floor(rng() * (S - 20));
    const cy = 10 + Math.floor(rng() * (S - 20));
    const w = 3 + Math.floor(rng() * 5);
    const h = 3 + Math.floor(rng() * 5);
    for (let y = cy; y < cy + h && y < S - 2; y++) {
      for (let x = cx; x < cx + w && x < S - 2; x++) {
        if (grid[y][x] === T.GROUND) grid[y][x] = T.PLAZA;
      }
    }
  }

  // Add parking lots near roads
  const parkingCount = 5 + Math.floor(rng() * 4);
  for (let p = 0; p < parkingCount; p++) {
    const cx = 8 + Math.floor(rng() * (S - 16));
    const cy = 8 + Math.floor(rng() * (S - 16));
    const w = 3 + Math.floor(rng() * 4);
    const h = 2 + Math.floor(rng() * 3);
    for (let y = cy; y < cy + h && y < S - 2; y++) {
      for (let x = cx; x < cx + w && x < S - 2; x++) {
        if (grid[y][x] === T.GROUND) grid[y][x] = T.PARKING;
      }
    }
  }

  const isRoad = t => t === T.ROAD_MAIN || t === T.ROAD_SIDE || t === T.HIGHWAY;
  for (let y = 2; y < S-2; y++) {
    for (let x = 2; x < S-2; x++) {
      if (grid[y][x] !== T.GROUND) continue;
      const isInterior = !isRoad(grid[y-1][x]) && !isRoad(grid[y+1][x]) && !isRoad(grid[y][x-1]) && !isRoad(grid[y][x+1]);
      if (isInterior && rng() < 0.30) grid[y][x] = T.WALL;
    }
  }

  const poiTypes = [T.POI_AMMO, T.POI_HOSPITAL, T.POI_HOOKER, T.POI_GAMBLING, T.POI_DRUG, T.POI_SHOP, T.POI_VEHICLE, T.POI_WORK, T.POI_GANG, T.POI_STRIP, T.POI_MODSHOP];
  const roadAdjacentSpots = [];
  for (let y = 2; y < S-2; y++) {
    for (let x = 2; x < S-2; x++) {
      if (grid[y][x] !== T.GROUND && grid[y][x] !== T.SAND && grid[y][x] !== T.PLAZA) continue;
      const adjRoad = [grid[y-1][x], grid[y+1][x], grid[y][x-1], grid[y][x+1]].some(t => isRoad(t));
      if (adjRoad) roadAdjacentSpots.push([x, y]);
    }
  }
  for (let i = roadAdjacentSpots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [roadAdjacentSpots[i], roadAdjacentSpots[j]] = [roadAdjacentSpots[j], roadAdjacentSpots[i]];
  }
  let spotIdx = 0;
  // Place one of each POI type first
  for (const poi of poiTypes) {
    if (spotIdx < roadAdjacentSpots.length) { const [px, py] = roadAdjacentSpots[spotIdx++]; grid[py][px] = poi; }
  }
  // Place 3 more of each POI type (4 total per type = 40)
  for (let round = 0; round < 3; round++) {
    for (const poi of poiTypes) {
      if (spotIdx < roadAdjacentSpots.length) { const [px, py] = roadAdjacentSpots[spotIdx++]; grid[py][px] = poi; }
    }
  }
  // Extra copies of common POIs (~25 more, total ~65)
  const commonPOIs = [
    T.POI_SHOP, T.POI_SHOP, T.POI_SHOP, T.POI_SHOP, T.POI_SHOP,
    T.POI_WORK, T.POI_WORK, T.POI_WORK, T.POI_WORK,
    T.POI_DRUG, T.POI_DRUG, T.POI_DRUG,
    T.POI_HOOKER, T.POI_HOOKER, T.POI_HOOKER,
    T.POI_GAMBLING, T.POI_GAMBLING, T.POI_GAMBLING,
    T.POI_AMMO, T.POI_AMMO, T.POI_AMMO,
    T.POI_HOSPITAL, T.POI_HOSPITAL,
    T.POI_VEHICLE, T.POI_VEHICLE
  ];
  for (const poi of commonPOIs) {
    if (spotIdx < roadAdjacentSpots.length) { const [px, py] = roadAdjacentSpots[spotIdx++]; grid[py][px] = poi; }
  }

  const tiles = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) tiles.push({ x, y, tile: grid[y][x] });
  cityMapCache[cityName] = tiles;
  return tiles;
}

export function buildGridCache(mapData) {
  currentMapGrid = Array.from({length: MAP_SIZE}, () => Array(MAP_SIZE).fill(T.GROUND));
  for (const t of mapData) currentMapGrid[t.y][t.x] = t.tile;
}
