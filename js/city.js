import { T, CITIES, MAP_SIZE } from './constants.js';

// --------------------------------------------------------
//  CITY MAP GENERATORS
// --------------------------------------------------------
const cityMapCache = {};
export let currentMapGrid = null;

export function generateCityMap(cityName) {
  if (cityMapCache[cityName]) return cityMapCache[cityName];
  const S = MAP_SIZE;
  const grid = Array.from({length: S}, () => Array(S).fill(T.GROUND));
  const city = CITIES[cityName];

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
    for (let x = 36; x <= 44; x++) { grid[0][x] = T.ROAD_MAIN; grid[1][x] = T.ROAD_MAIN; grid[2][x] = T.ROAD_MAIN; grid[S-1][x] = T.ROAD_MAIN; grid[S-2][x] = T.ROAD_MAIN; grid[S-3][x] = T.ROAD_MAIN; }
    for (let y = 36; y <= 44; y++) { grid[y][0] = T.ROAD_MAIN; grid[y][1] = T.ROAD_MAIN; grid[y][2] = T.ROAD_MAIN; grid[y][S-1] = T.ROAD_MAIN; grid[y][S-2] = T.ROAD_MAIN; grid[y][S-3] = T.ROAD_MAIN; }
  }

  if (cityName === 'Los Santos') {
    for (let i = 1; i < S-1; i++) { grid[40][i] = T.ROAD_MAIN; grid[i][40] = T.ROAD_MAIN; }
    for (let i = 1; i < S-1; i++) { grid[20][i] = T.ROAD_SIDE; grid[60][i] = T.ROAD_SIDE; grid[i][20] = T.ROAD_SIDE; grid[i][60] = T.ROAD_SIDE; }
    for (let i = 1; i < S-1; i++) { if (i % 8 === 0) { for (let j = 1; j < S-1; j++) if (grid[i][j] === T.GROUND) grid[i][j] = T.ROAD_SIDE; } }
    // Highway along the top
    for (let x = 1; x < S-1; x++) { grid[3][x] = T.HIGHWAY; grid[4][x] = T.HIGHWAY; }
    // Park with trees
    for (let y = 5; y <= 14; y++) for (let x = 5; x <= 14; x++) grid[y][x] = T.PARK;
    grid[10][10] = T.TREE; grid[8][8] = T.TREE; grid[12][12] = T.TREE; grid[6][12] = T.TREE; grid[7][9] = T.TREE; grid[13][7] = T.TREE;
    // Forest area
    for (let y = 4; y <= 12; y++) for (let x = 56; x <= 72; x++) if (grid[y][x] === T.GROUND && Math.random() < 0.4) grid[y][x] = T.TREE;
    // Docks along the beach
    for (let x = 20; x <= 30; x++) { grid[S-6][x] = T.DOCK; grid[S-7][x] = T.DOCK; }
    // Industrial zone east
    for (let y = 55; y <= 68; y++) for (let x = 62; x <= 75; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.INDUSTRIAL;
  } else if (cityName === 'San Fierro') {
    for (let i = 4; i < S-1; i++) { grid[40][i] = T.ROAD_MAIN; grid[i][40] = T.ROAD_MAIN; }
    for (let i = 5; i < S-5; i++) { const j = Math.min(S-2, Math.max(1, i + 10)); if (grid[i][j] !== T.WATER) grid[i][j] = T.ROAD_SIDE; }
    for (let i = 4; i < S-1; i++) { grid[24][i] = T.ROAD_SIDE; grid[56][i] = T.ROAD_SIDE; grid[i][16] = T.ROAD_SIDE; grid[i][64] = T.ROAD_SIDE; }
    // Large park with trees
    for (let y = 28; y <= 36; y++) for (let x = 8; x <= 28; x++) { grid[y][x] = T.PARK; if (Math.random() < 0.3) grid[y][x] = T.TREE; }
    // Bridge over water on the west side
    for (let y = 30; y <= 50; y++) { grid[y][4] = T.BRIDGE; grid[y][5] = T.BRIDGE; }
    // Docks at waterfront
    for (let y = 55; y <= 65; y++) { grid[y][4] = T.DOCK; grid[y][5] = T.DOCK; grid[y][6] = T.DOCK; }
    // Industrial near docks
    for (let y = 55; y <= 68; y++) for (let x = 7; x <= 15; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.INDUSTRIAL;
    // Highway across the north
    for (let x = 4; x < S-1; x++) { grid[6][x] = T.HIGHWAY; grid[7][x] = T.HIGHWAY; }
  } else if (cityName === 'Las Venturas') {
    for (let i = 1; i < S-1; i++) { grid[i][40] = T.ROAD_MAIN; grid[i][41] = T.ROAD_MAIN; }
    for (let i = 1; i < S-1; i++) { grid[26][i] = T.ROAD_SIDE; grid[54][i] = T.ROAD_SIDE; grid[i][20] = T.ROAD_SIDE; grid[i][60] = T.ROAD_SIDE; }
    for (let i = 1; i < S-1; i++) { grid[40][i] = T.ROAD_MAIN; }
    // The Strip — wide boulevard (already main road at 40/41)
    // Desert edges
    for (let y = 1; y < S-1; y++) for (let x = 1; x < 7; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.SAND;
    for (let y = 1; y < S-1; y++) for (let x = S-7; x < S-1; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.SAND;
    // Highway loop around the city
    for (let x = 1; x < S-1; x++) { grid[8][x] = T.HIGHWAY; grid[S-9][x] = T.HIGHWAY; }
    for (let y = 8; y <= S-9; y++) { grid[y][8] = T.HIGHWAY; grid[y][S-9] = T.HIGHWAY; }
    // Park/oasis in the NW
    for (let y = 12; y <= 18; y++) for (let x = 12; x <= 18; x++) { grid[y][x] = T.PARK; if (Math.random() < 0.25) grid[y][x] = T.TREE; }
  } else if (cityName === 'Vice City') {
    for (let i = 3; i < S-3; i++) { grid[40][i] = T.ROAD_MAIN; grid[i][40] = T.ROAD_MAIN; }
    for (let i = 3; i < S-3; i++) { grid[20][i] = T.ROAD_SIDE; grid[60][i] = T.ROAD_SIDE; grid[i][20] = T.ROAD_SIDE; grid[i][60] = T.ROAD_SIDE; }
    for (let y = 3; y < S-3; y++) for (let x = 3; x < S-3; x++) {
      if (grid[y][x] === T.GROUND && (y <= 6 || y >= S-7 || x <= 6 || x >= S-7)) grid[y][x] = T.SAND;
    }
    for (let y = 5; y < S-5; y++) for (let x = 5; x < S-5; x++) {
      if (grid[y][x] === T.SAND && Math.random() < 0.15) grid[y][x] = T.TREE;
    }
    // Bridges connecting the island to the edges
    for (let x = 36; x <= 44; x++) { grid[3][x] = T.BRIDGE; grid[S-4][x] = T.BRIDGE; }
    for (let y = 36; y <= 44; y++) { grid[y][3] = T.BRIDGE; grid[y][S-4] = T.BRIDGE; }
    // Marina/docks
    for (let x = 55; x <= 68; x++) { grid[4][x] = T.DOCK; grid[5][x] = T.DOCK; }
    // Highway ring
    for (let x = 8; x < S-8; x++) { grid[10][x] = T.HIGHWAY; grid[S-11][x] = T.HIGHWAY; }
  } else if (cityName === 'Liberty City') {
    for (let i = 1; i < S-1; i++) { grid[i][40] = T.ROAD_MAIN; grid[40][i] = T.ROAD_MAIN; }
    for (let r = 6; r < S-1; r += 6) for (let i = 1; i < S-1; i++) { if (grid[r][i] === T.GROUND) grid[r][i] = T.ROAD_SIDE; }
    for (let c = 6; c < S-1; c += 6) for (let i = 1; i < S-1; i++) { if (grid[i][c] === T.GROUND) grid[i][c] = T.ROAD_SIDE; }
    // Dense high-rise core (east side)
    for (let y = 20; y <= 60; y++) for (let x = S-9; x < S-4; x++) { if (grid[y][x] === T.GROUND) grid[y][x] = T.WALL; }
    // Bridge over the east river
    for (let y = 35; y <= 45; y++) { grid[y][S-4] = T.BRIDGE; grid[y][S-3] = T.BRIDGE; grid[y][S-2] = T.BRIDGE; }
    // Industrial docks north
    for (let x = 5; x <= 20; x++) for (let y = 3; y <= 8; y++) { if (grid[y][x] === T.GROUND) grid[y][x] = T.INDUSTRIAL; }
    for (let x = 5; x <= 15; x++) { grid[3][x] = T.DOCK; grid[4][x] = T.DOCK; }
    // Highway
    for (let y = 1; y < S-1; y++) { grid[y][10] = T.HIGHWAY; }
    // Park in the center
    for (let y = 30; y <= 38; y++) for (let x = 25; x <= 35; x++) { grid[y][x] = T.PARK; if (Math.random() < 0.2) grid[y][x] = T.TREE; }
  }

  const isRoad = t => t === T.ROAD_MAIN || t === T.ROAD_SIDE || t === T.HIGHWAY;
  for (let y = 2; y < S-2; y++) {
    for (let x = 2; x < S-2; x++) {
      if (grid[y][x] !== T.GROUND) continue;
      const isInterior = !isRoad(grid[y-1][x]) && !isRoad(grid[y+1][x]) && !isRoad(grid[y][x-1]) && !isRoad(grid[y][x+1]);
      if (isInterior && Math.random() < 0.55) grid[y][x] = T.WALL;
    }
  }

  const poiTypes = [T.POI_AMMO, T.POI_HOSPITAL, T.POI_HOOKER, T.POI_GAMBLING, T.POI_DRUG, T.POI_SHOP, T.POI_VEHICLE, T.POI_WORK, T.POI_GANG, T.POI_STRIP];
  const roadAdjacentSpots = [];
  for (let y = 2; y < S-2; y++) {
    for (let x = 2; x < S-2; x++) {
      if (grid[y][x] !== T.GROUND && grid[y][x] !== T.SAND) continue;
      const adjRoad = [grid[y-1][x], grid[y+1][x], grid[y][x-1], grid[y][x+1]].some(t => isRoad(t));
      if (adjRoad) roadAdjacentSpots.push([x, y]);
    }
  }
  for (let i = roadAdjacentSpots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roadAdjacentSpots[i], roadAdjacentSpots[j]] = [roadAdjacentSpots[j], roadAdjacentSpots[i]];
  }
  let spotIdx = 0;
  // Place one of each POI type first
  for (const poi of poiTypes) {
    if (spotIdx < roadAdjacentSpots.length) { const [px, py] = roadAdjacentSpots[spotIdx++]; grid[py][px] = poi; }
  }
  // Place 2 more of each POI type (3 total per type = 30)
  for (let round = 0; round < 2; round++) {
    for (const poi of poiTypes) {
      if (spotIdx < roadAdjacentSpots.length) { const [px, py] = roadAdjacentSpots[spotIdx++]; grid[py][px] = poi; }
    }
  }
  // Extra copies of common POIs (~15 more, total ~45)
  const commonPOIs = [T.POI_SHOP, T.POI_SHOP, T.POI_SHOP, T.POI_WORK, T.POI_WORK, T.POI_WORK, T.POI_DRUG, T.POI_DRUG, T.POI_HOOKER, T.POI_HOOKER, T.POI_GAMBLING, T.POI_GAMBLING, T.POI_AMMO, T.POI_HOSPITAL, T.POI_VEHICLE];
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
