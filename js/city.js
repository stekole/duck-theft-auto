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
    for (let x = 0; x < S; x++) { grid[S-1][x] = T.WATER; grid[S-2][x] = T.WATER; grid[S-3][x] = T.SAND; }
  } else if (city.waterSide === 'west') {
    for (let y = 0; y < S; y++) { grid[y][0] = T.WATER; grid[y][1] = T.WATER; }
  } else if (city.waterSide === 'east') {
    for (let y = 0; y < S; y++) { grid[y][S-1] = T.WATER; grid[y][S-2] = T.WATER; }
  } else if (city.waterSide === 'surround') {
    for (let i = 0; i < S; i++) {
      grid[0][i] = T.WATER; grid[1][i] = T.WATER;
      grid[S-1][i] = T.WATER; grid[S-2][i] = T.WATER;
      grid[i][0] = T.WATER; grid[i][1] = T.WATER;
      grid[i][S-1] = T.WATER; grid[i][S-2] = T.WATER;
    }
    for (let x = 18; x <= 22; x++) { grid[0][x] = T.ROAD_MAIN; grid[1][x] = T.ROAD_MAIN; grid[S-1][x] = T.ROAD_MAIN; grid[S-2][x] = T.ROAD_MAIN; }
    for (let y = 18; y <= 22; y++) { grid[y][0] = T.ROAD_MAIN; grid[y][1] = T.ROAD_MAIN; grid[y][S-1] = T.ROAD_MAIN; grid[y][S-2] = T.ROAD_MAIN; }
  }

  if (cityName === 'Los Santos') {
    for (let i = 1; i < S-1; i++) { grid[20][i] = T.ROAD_MAIN; grid[i][20] = T.ROAD_MAIN; }
    for (let i = 1; i < S-1; i++) { grid[10][i] = T.ROAD_SIDE; grid[30][i] = T.ROAD_SIDE; grid[i][10] = T.ROAD_SIDE; grid[i][30] = T.ROAD_SIDE; }
    for (let i = 1; i < S-1; i++) { if (i % 5 === 0) { for (let j = 1; j < S-1; j++) if (grid[i][j] === T.GROUND) grid[i][j] = T.ROAD_SIDE; } }
    for (let y = 3; y <= 7; y++) for (let x = 3; x <= 7; x++) grid[y][x] = T.PARK;
    grid[5][5] = T.TREE; grid[4][4] = T.TREE; grid[6][6] = T.TREE; grid[3][6] = T.TREE;
    for (let y = 2; y <= 6; y++) for (let x = 28; x <= 36; x++) if (grid[y][x] === T.GROUND && Math.random() < 0.4) grid[y][x] = T.TREE;
  } else if (cityName === 'San Fierro') {
    for (let i = 2; i < S-1; i++) { grid[20][i] = T.ROAD_MAIN; grid[i][20] = T.ROAD_MAIN; }
    for (let i = 3; i < S-3; i++) { const j = Math.min(S-2, Math.max(1, i + 5)); if (grid[i][j] !== T.WATER) grid[i][j] = T.ROAD_SIDE; }
    for (let i = 2; i < S-1; i++) { grid[12][i] = T.ROAD_SIDE; grid[28][i] = T.ROAD_SIDE; grid[i][8] = T.ROAD_SIDE; grid[i][32] = T.ROAD_SIDE; }
    for (let y = 14; y <= 18; y++) for (let x = 4; x <= 14; x++) { grid[y][x] = T.PARK; if (Math.random() < 0.3) grid[y][x] = T.TREE; }
  } else if (cityName === 'Las Venturas') {
    for (let i = 1; i < S-1; i++) { grid[i][20] = T.ROAD_MAIN; grid[i][21] = T.ROAD_MAIN; }
    for (let i = 1; i < S-1; i++) { grid[13][i] = T.ROAD_SIDE; grid[27][i] = T.ROAD_SIDE; grid[i][10] = T.ROAD_SIDE; grid[i][30] = T.ROAD_SIDE; }
    for (let i = 1; i < S-1; i++) { grid[20][i] = T.ROAD_MAIN; }
    for (let y = 1; y < S-1; y++) for (let x = 1; x < 4; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.SAND;
    for (let y = 1; y < S-1; y++) for (let x = S-4; x < S-1; x++) if (grid[y][x] === T.GROUND) grid[y][x] = T.SAND;
  } else if (cityName === 'Vice City') {
    for (let i = 2; i < S-2; i++) { grid[20][i] = T.ROAD_MAIN; grid[i][20] = T.ROAD_MAIN; }
    for (let i = 2; i < S-2; i++) { grid[10][i] = T.ROAD_SIDE; grid[30][i] = T.ROAD_SIDE; grid[i][10] = T.ROAD_SIDE; grid[i][30] = T.ROAD_SIDE; }
    for (let y = 2; y < S-2; y++) for (let x = 2; x < S-2; x++) {
      if (grid[y][x] === T.GROUND && (y <= 3 || y >= S-4 || x <= 3 || x >= S-4)) grid[y][x] = T.SAND;
    }
    for (let y = 3; y < S-3; y++) for (let x = 3; x < S-3; x++) {
      if (grid[y][x] === T.SAND && Math.random() < 0.15) grid[y][x] = T.TREE;
    }
  } else if (cityName === 'Liberty City') {
    for (let i = 1; i < S-1; i++) { grid[i][20] = T.ROAD_MAIN; grid[20][i] = T.ROAD_MAIN; }
    for (let r = 4; r < S-1; r += 4) for (let i = 1; i < S-1; i++) { if (grid[r][i] === T.GROUND) grid[r][i] = T.ROAD_SIDE; }
    for (let c = 4; c < S-1; c += 4) for (let i = 1; i < S-1; i++) { if (grid[i][c] === T.GROUND) grid[i][c] = T.ROAD_SIDE; }
    for (let y = 10; y <= 30; y++) for (let x = S-5; x < S-2; x++) { if (grid[y][x] === T.GROUND) grid[y][x] = T.WALL; }
  }

  for (let y = 2; y < S-2; y++) {
    for (let x = 2; x < S-2; x++) {
      if (grid[y][x] !== T.GROUND) continue;
      const isInterior = grid[y-1][x] !== T.ROAD_MAIN && grid[y-1][x] !== T.ROAD_SIDE &&
                          grid[y+1][x] !== T.ROAD_MAIN && grid[y+1][x] !== T.ROAD_SIDE &&
                          grid[y][x-1] !== T.ROAD_MAIN && grid[y][x-1] !== T.ROAD_SIDE &&
                          grid[y][x+1] !== T.ROAD_MAIN && grid[y][x+1] !== T.ROAD_SIDE;
      if (isInterior && Math.random() < 0.55) grid[y][x] = T.WALL;
    }
  }

  const poiTypes = [T.POI_AMMO, T.POI_HOSPITAL, T.POI_HOOKER, T.POI_GAMBLING, T.POI_DRUG, T.POI_SHOP, T.POI_VEHICLE, T.POI_WORK, T.POI_GANG];
  const roadAdjacentSpots = [];
  for (let y = 2; y < S-2; y++) {
    for (let x = 2; x < S-2; x++) {
      if (grid[y][x] !== T.GROUND && grid[y][x] !== T.SAND) continue;
      const adjRoad = [grid[y-1][x], grid[y+1][x], grid[y][x-1], grid[y][x+1]].some(t => t === T.ROAD_MAIN || t === T.ROAD_SIDE);
      if (adjRoad) roadAdjacentSpots.push([x, y]);
    }
  }
  for (let i = roadAdjacentSpots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roadAdjacentSpots[i], roadAdjacentSpots[j]] = [roadAdjacentSpots[j], roadAdjacentSpots[i]];
  }
  let spotIdx = 0;
  for (const poi of poiTypes) {
    if (spotIdx < roadAdjacentSpots.length) { const [px, py] = roadAdjacentSpots[spotIdx++]; grid[py][px] = poi; }
  }
  const extraPOIs = [T.POI_SHOP, T.POI_WORK, T.POI_HOOKER, T.POI_DRUG, T.POI_GAMBLING];
  for (const poi of extraPOIs) {
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
