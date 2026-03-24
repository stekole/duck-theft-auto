import * as THREE from 'three';
import { T, POI_DEFS, TILE_COLORS, MAP_SIZE } from './constants.js';
import { currentMapGrid } from './city.js';

const $ = id => document.getElementById(id);

// --------------------------------------------------------
//  THREE.JS GLOBALS
// --------------------------------------------------------
export let scene, camera, renderer, clock;
export let duckGroup, duckMixer;
export let sunLight, ambientLight, hemiLight;
let cityGroup;
export let poiMeshes = [];
export let gameActive = false;

// Phase 2: City life
let npcs = [];
let parkedCars = [];
export let streetLamps = [];
export let neonSigns = [];
export let particles = [];
export let playerVehicleMesh = null;
export let currentGameHour = 12;

// Camera settings (isometric-ish)
export let camHeight = 18;
export let camDist = 22;
export let camAngle = Math.PI / 4; // 45 degrees
export const CAM_ZOOM_MIN = 8;
export const CAM_ZOOM_MAX = 40;

// Duck movement
export let duckTargetX = 0, duckTargetZ = 0;
export let duckFacing = 0; // radians
let waddle = 0;

// Setters for mutable state accessed from game.js
export function setGameActive(v) { gameActive = v; }
export function setDuckTarget(x, z) { duckTargetX = x; duckTargetZ = z; }
export function setDuckFacing(v) { duckFacing = v; }
export function setCamDist(v) { camDist = v; }
export function setCamHeight(v) { camHeight = v; }
export function setCamAngle(v) { camAngle = v; }
export function setCurrentGameHour(v) { currentGameHour = v; }

// --------------------------------------------------------
//  THREE.JS INIT
// --------------------------------------------------------
export function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.FogExp2(0x1a1a2e, 0.025);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(camDist, camHeight, camDist);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas: $('three-canvas'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Lighting
  sunLight = new THREE.DirectionalLight(0xffeedd, 1.5);
  sunLight.position.set(20, 30, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 100;
  sunLight.shadow.camera.left = -30;
  sunLight.shadow.camera.right = 30;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  scene.add(sunLight);

  ambientLight = new THREE.AmbientLight(0x404060, 0.4);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x2a4a2a, 0.6);
  scene.add(hemiLight);

  clock = new THREE.Clock();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// --------------------------------------------------------
//  3D DUCK CHARACTER
// --------------------------------------------------------
export function createDuck() {
  duckGroup = new THREE.Group();

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.3, 16, 12);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, roughness: 0.6, metalness: 0.1 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(1, 0.8, 1.2);
  body.position.y = 0.3;
  body.castShadow = true;
  duckGroup.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.2, 16, 12);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffee33, roughness: 0.5 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0, 0.55, 0.15);
  head.castShadow = true;
  duckGroup.add(head);

  // Beak
  const beakGeo = new THREE.ConeGeometry(0.06, 0.18, 8);
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.4 });
  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.52, 0.35);
  duckGroup.add(beak);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.1, 0.6, 0.28);
  duckGroup.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.1, 0.6, 0.28);
  duckGroup.add(eyeR);

  // Eye whites
  const eyeWhiteGeo = new THREE.SphereGeometry(0.05, 8, 8);
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const eyeWL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  eyeWL.position.set(-0.1, 0.6, 0.26);
  duckGroup.add(eyeWL);
  const eyeWR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  eyeWR.position.set(0.1, 0.6, 0.26);
  duckGroup.add(eyeWR);

  // Feet
  const footGeo = new THREE.BoxGeometry(0.12, 0.03, 0.18);
  const footMat = new THREE.MeshStandardMaterial({ color: 0xff6600 });
  const footL = new THREE.Mesh(footGeo, footMat);
  footL.position.set(-0.1, 0.02, 0.05);
  footL.name = 'footL';
  duckGroup.add(footL);
  const footR = new THREE.Mesh(footGeo, footMat);
  footR.position.set(0.1, 0.02, 0.05);
  footR.name = 'footR';
  duckGroup.add(footR);

  // Tail
  const tailGeo = new THREE.ConeGeometry(0.08, 0.15, 6);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xeebb00 });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.rotation.x = Math.PI / 3;
  tail.position.set(0, 0.4, -0.3);
  duckGroup.add(tail);

  // Tiny hat (because GTA)
  const hatBrimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16);
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat);
  hatBrim.position.set(0, 0.72, 0.1);
  duckGroup.add(hatBrim);
  const hatTopGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.1, 16);
  const hatTop = new THREE.Mesh(hatTopGeo, hatMat);
  hatTop.position.set(0, 0.78, 0.1);
  duckGroup.add(hatTop);

  scene.add(duckGroup);
}

// --------------------------------------------------------
//  BUILD 3D CITY
// --------------------------------------------------------
export function buildCity3D() {
  if (cityGroup) {
    scene.remove(cityGroup);
    cityGroup.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) { if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose()); else obj.material.dispose(); } });
  }
  cityGroup = new THREE.Group();
  poiMeshes = [];

  if (!currentMapGrid) return;

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(MAP_SIZE + 4, MAP_SIZE + 4);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(MAP_SIZE / 2, -0.01, MAP_SIZE / 2);
  ground.receiveShadow = true;
  cityGroup.add(ground);

  // Reusable geometries
  const roadGeo = new THREE.BoxGeometry(1, 0.02, 1);
  const buildingMats = [];
  for (let i = 0; i < 8; i++) {
    const shade = 40 + i * 12;
    buildingMats.push(new THREE.MeshStandardMaterial({ color: new THREE.Color(`rgb(${shade+10},${shade+10},${shade+20})`), roughness: 0.8 }));
  }

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = currentMapGrid[y][x];
      const wx = x + 0.5;
      const wz = y + 0.5;

      if (tile === T.ROAD_MAIN || tile === T.ROAD_SIDE) {
        const roadMat = new THREE.MeshStandardMaterial({
          color: tile === T.ROAD_MAIN ? 0x444444 : 0x3a3a3a,
          roughness: 0.9
        });
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.position.set(wx, 0.01, wz);
        road.receiveShadow = true;
        cityGroup.add(road);

        if (tile === T.ROAD_MAIN && (x + y) % 3 === 0) {
          const markGeo = new THREE.BoxGeometry(0.08, 0.025, 0.4);
          const markMat = new THREE.MeshStandardMaterial({ color: 0xaaaa00, emissive: 0x333300 });
          const mark = new THREE.Mesh(markGeo, markMat);
          mark.position.set(wx, 0.025, wz);
          cityGroup.add(mark);
        }
      } else if (tile === T.WALL) {
        const heightSeed = (x * 7 + y * 13) % 10;
        const height = 0.8 + heightSeed * 0.4;
        const bGeo = new THREE.BoxGeometry(0.9, height, 0.9);
        const bMat = buildingMats[heightSeed % buildingMats.length];
        const building = new THREE.Mesh(bGeo, bMat);
        building.position.set(wx, height / 2, wz);
        building.castShadow = true;
        building.receiveShadow = true;
        cityGroup.add(building);

        if (height > 1.2) {
          const windowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.01);
          const windowMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffcc44, emissiveIntensity: 0.8 });
          const wSide = Math.random() < 0.5 ? 0.46 : -0.46;
          for (let wy = 0.4; wy < height - 0.2; wy += 0.35) {
            if (Math.random() < 0.6) {
              const win = new THREE.Mesh(windowGeo, windowMat);
              win.position.set(wx + wSide, wy, wz + (Math.random() - 0.5) * 0.5);
              if (Math.abs(wSide) > 0.4) win.rotation.y = Math.PI / 2;
              cityGroup.add(win);
            }
          }
        }
      } else if (tile === T.WATER) {
        const waterGeo = new THREE.BoxGeometry(1, 0.05, 1);
        const waterMat = new THREE.MeshStandardMaterial({
          color: 0x2266aa, transparent: true, opacity: 0.7, roughness: 0.2, metalness: 0.3
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.position.set(wx, -0.05, wz);
        water.receiveShadow = true;
        cityGroup.add(water);
      } else if (tile === T.TREE) {
        const trunkGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x553311 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(wx, 0.25, wz);
        trunk.castShadow = true;
        cityGroup.add(trunk);

        const canopyGeo = new THREE.SphereGeometry(0.3, 8, 6);
        const canopyMat = new THREE.MeshStandardMaterial({ color: 0x228833, roughness: 0.8 });
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.set(wx, 0.65, wz);
        canopy.castShadow = true;
        cityGroup.add(canopy);
      } else if (tile === T.PARK) {
        const parkGeo = new THREE.BoxGeometry(1, 0.02, 1);
        const parkMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 1 });
        const park = new THREE.Mesh(parkGeo, parkMat);
        park.position.set(wx, 0.01, wz);
        park.receiveShadow = true;
        cityGroup.add(park);
      } else if (tile === T.SAND) {
        const sandGeo = new THREE.BoxGeometry(1, 0.02, 1);
        const sandMat = new THREE.MeshStandardMaterial({ color: 0xaa8844, roughness: 1 });
        const sand = new THREE.Mesh(sandGeo, sandMat);
        sand.position.set(wx, 0.01, wz);
        sand.receiveShadow = true;
        cityGroup.add(sand);
      }

      // POI markers
      if (POI_DEFS[tile]) {
        const poi = POI_DEFS[tile];
        const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8);
        const pillarMat = new THREE.MeshStandardMaterial({
          color: poi.colorHex, emissive: poi.colorHex, emissiveIntensity: 0.6,
          transparent: true, opacity: 0.7
        });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(wx, 0.6, wz);
        pillar.castShadow = false;
        pillar.userData = { poiType: tile, baseY: 0.6 };
        cityGroup.add(pillar);
        poiMeshes.push(pillar);

        const diamGeo = new THREE.OctahedronGeometry(0.12, 0);
        const diamMat = new THREE.MeshStandardMaterial({
          color: poi.colorHex, emissive: poi.colorHex, emissiveIntensity: 1.0
        });
        const diamond = new THREE.Mesh(diamGeo, diamMat);
        diamond.position.set(wx, 1.3, wz);
        diamond.userData = { baseY: 1.3 };
        cityGroup.add(diamond);
        poiMeshes.push(diamond);

        const poiLight = new THREE.PointLight(poi.colorHex, 0.5, 3);
        poiLight.position.set(wx, 1.0, wz);
        cityGroup.add(poiLight);
      }
    }
  }

  // Street lamps on main roads (every 4 tiles)
  streetLamps = [];
  const lampPostGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.5, 6);
  const lampPostMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6 });
  const lampHeadGeo = new THREE.SphereGeometry(0.1, 8, 6);
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 0.3 });

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (currentMapGrid[y][x] !== T.ROAD_MAIN) continue;
      if ((x + y) % 5 !== 0) continue;
      const offsets = [[1,0],[-1,0],[0,1],[0,-1]];
      for (const [ox, oz] of offsets) {
        const nx = x + ox, nz = y + oz;
        if (nx < 0 || nx >= MAP_SIZE || nz < 0 || nz >= MAP_SIZE) continue;
        const adj = currentMapGrid[nz][nx];
        if (adj === T.GROUND || adj === T.SAND || adj === T.PARK) {
          const wx = nx + 0.5, wz = nz + 0.5;
          const post = new THREE.Mesh(lampPostGeo, lampPostMat);
          post.position.set(wx, 0.75, wz);
          post.castShadow = true;
          cityGroup.add(post);
          const head = new THREE.Mesh(lampHeadGeo, lampHeadMat.clone());
          head.position.set(wx, 1.55, wz);
          cityGroup.add(head);
          const light = new THREE.PointLight(0xffeeaa, 0, 5);
          light.position.set(wx, 1.5, wz);
          cityGroup.add(light);
          streetLamps.push({ head, light, x: wx, z: wz });
          break;
        }
      }
    }
  }

  // Parked cars on side roads
  parkedCars = [];
  const carBodyGeo = new THREE.BoxGeometry(0.35, 0.2, 0.65);
  const carTopGeo = new THREE.BoxGeometry(0.28, 0.15, 0.35);
  const carColors = [0xcc2222, 0x2244cc, 0x22aa22, 0xcccc22, 0xeeeeee, 0x222222, 0xcc6600, 0x8822aa];
  let carCount = 0;
  for (let y = 2; y < MAP_SIZE - 2 && carCount < 40; y++) {
    for (let x = 2; x < MAP_SIZE - 2 && carCount < 40; x++) {
      if (currentMapGrid[y][x] !== T.ROAD_SIDE) continue;
      if (Math.random() > 0.06) continue;
      const adjWall = [[1,0],[-1,0],[0,1],[0,-1]].some(([ox,oz]) => {
        const t = currentMapGrid[y+oz]?.[x+ox];
        return t === T.WALL;
      });
      if (!adjWall) continue;
      const wx = x + 0.5, wz = y + 0.5;
      const color = carColors[Math.floor(Math.random() * carColors.length)];
      const carMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
      const body = new THREE.Mesh(carBodyGeo, carMat);
      body.position.set(wx, 0.12, wz);
      body.castShadow = true;
      cityGroup.add(body);
      const top = new THREE.Mesh(carTopGeo, carMat);
      top.position.set(wx, 0.27, wz - 0.05);
      top.castShadow = true;
      cityGroup.add(top);
      const wheelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
      for (const [sx, sz] of [[-0.18, -0.2], [0.18, -0.2], [-0.18, 0.2], [0.18, 0.2]]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx + sx, 0.05, wz + sz);
        cityGroup.add(wheel);
      }
      parkedCars.push({ x: wx, z: wz });
      carCount++;
    }
  }

  // Neon signs above POIs
  neonSigns = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = currentMapGrid[y][x];
      if (!POI_DEFS[tile]) continue;
      const poi = POI_DEFS[tile];
      const wx = x + 0.5, wz = y + 0.5;
      const signGeo = new THREE.BoxGeometry(0.8, 0.25, 0.05);
      const signMat = new THREE.MeshStandardMaterial({
        color: poi.colorHex, emissive: poi.colorHex, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.9
      });
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(wx, 1.8, wz);
      cityGroup.add(sign);
      const borderGeo = new THREE.BoxGeometry(0.85, 0.3, 0.02);
      const borderMat = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: poi.colorHex, emissiveIntensity: 0.2,
        transparent: true, opacity: 0.5
      });
      const border = new THREE.Mesh(borderGeo, borderMat);
      border.position.set(wx, 1.8, wz + 0.04);
      cityGroup.add(border);
      neonSigns.push({ sign, border, poi, x: wx, z: wz });
    }
  }

  scene.add(cityGroup);
}

// --------------------------------------------------------
//  NPC PEDESTRIANS
// --------------------------------------------------------
export function spawnNPCs() {
  for (const npc of npcs) { scene.remove(npc.group); }
  npcs = [];
  if (!currentMapGrid) return;

  const npcColors = [0xcc4444, 0x4444cc, 0x44cc44, 0xcccc44, 0xcc44cc, 0x44cccc, 0xff8844, 0x884422, 0xffffff, 0x888888];
  const roadTiles = [];
  for (let y = 3; y < MAP_SIZE - 3; y++) {
    for (let x = 3; x < MAP_SIZE - 3; x++) {
      if (currentMapGrid[y][x] === T.ROAD_MAIN || currentMapGrid[y][x] === T.ROAD_SIDE) roadTiles.push({x, y});
    }
  }

  const count = Math.min(30, Math.floor(roadTiles.length / 20));
  for (let i = 0; i < count; i++) {
    const rt = roadTiles[Math.floor(Math.random() * roadTiles.length)];
    const color = npcColors[Math.floor(Math.random() * npcColors.length)];
    const group = new THREE.Group();

    const bodyGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.35, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.3;
    body.castShadow = true;
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const skinColor = Math.random() < 0.5 ? 0xddaa77 : 0x885533;
    const headMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.55;
    group.add(head);

    const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222244 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.04, 0.1, 0);
    legL.name = 'legL';
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.04, 0.1, 0);
    legR.name = 'legR';
    group.add(legR);

    group.position.set(rt.x + 0.5, 0, rt.y + 0.5);
    scene.add(group);

    const dir = Math.random() < 0.5 ? 'x' : 'z';
    const speed = 0.3 + Math.random() * 0.4;
    const facing = Math.random() < 0.5 ? 1 : -1;
    group.rotation.y = dir === 'x' ? (facing > 0 ? Math.PI / 2 : -Math.PI / 2) : (facing > 0 ? 0 : Math.PI);

    npcs.push({
      group, dir, speed, facing,
      startX: rt.x + 0.5, startZ: rt.y + 0.5,
      walkDist: 3 + Math.random() * 6,
      walked: 0, phase: Math.random() * Math.PI * 2
    });
  }
}

// --------------------------------------------------------
//  PARTICLE SYSTEM
// --------------------------------------------------------
export function spawnParticles(worldX, worldZ, color, count, speed, life, gravity) {
  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      worldX + (Math.random() - 0.5) * 0.3,
      0.5 + Math.random() * 0.5,
      worldZ + (Math.random() - 0.5) * 0.3
    );
    scene.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random() - 0.5) * speed,
      vy: Math.random() * speed * 1.5,
      vz: (Math.random() - 0.5) * speed,
      life,
      maxLife: life,
      gravity: gravity || 2
    });
  }
}

export function spawnParticlesAtDuck(color, count, speed, life) {
  if (!duckGroup) return;
  spawnParticles(duckGroup.position.x, duckGroup.position.z, color, count, speed || 1.5, life || 1.5);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.vy -= p.gravity * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.material.opacity = p.life / p.maxLife;
    if (p.mesh.position.y < 0) p.mesh.position.y = 0;
  }
}

// Police siren effect
let sirenActive = false;
let sirenLights = [];
export function startSiren() {
  if (sirenActive) return;
  sirenActive = true;
  if (!duckGroup) return;
  const redLight = new THREE.PointLight(0xff0000, 2, 8);
  const blueLight = new THREE.PointLight(0x0044ff, 2, 8);
  redLight.position.set(-1, 2, 0);
  blueLight.position.set(1, 2, 0);
  duckGroup.add(redLight);
  duckGroup.add(blueLight);
  sirenLights = [redLight, blueLight];
}
export function stopSiren() {
  sirenActive = false;
  for (const l of sirenLights) {
    if (l.parent) l.parent.remove(l);
    l.dispose();
  }
  sirenLights = [];
}

// Player vehicle display
export function updatePlayerVehicle(hasVehicle) {
  if (playerVehicleMesh) {
    scene.remove(playerVehicleMesh);
    playerVehicleMesh = null;
  }
  if (!hasVehicle || !duckGroup) return;
  const vGroup = new THREE.Group();
  const bodyGeo = new THREE.BoxGeometry(0.5, 0.25, 0.8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcc6600, roughness: 0.3, metalness: 0.4 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.15;
  body.castShadow = true;
  vGroup.add(body);
  const topGeo = new THREE.BoxGeometry(0.4, 0.18, 0.45);
  const top = new THREE.Mesh(topGeo, bodyMat);
  top.position.set(0, 0.32, -0.05);
  vGroup.add(top);
  const wGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8);
  const wMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const [sx, sz] of [[-0.25, -0.28], [0.25, -0.28], [-0.25, 0.28], [0.25, 0.28]]) {
    const w = new THREE.Mesh(wGeo, wMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx, 0.07, sz);
    vGroup.add(w);
  }
  const hlGeo = new THREE.SphereGeometry(0.035, 6, 6);
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.8 });
  for (const sx of [-0.15, 0.15]) {
    const hl = new THREE.Mesh(hlGeo, hlMat);
    hl.position.set(sx, 0.15, 0.4);
    vGroup.add(hl);
  }
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 });
  for (const sx of [-0.15, 0.15]) {
    const tl = new THREE.Mesh(hlGeo, tlMat);
    tl.position.set(sx, 0.15, -0.4);
    vGroup.add(tl);
  }
  playerVehicleMesh = vGroup;
  scene.add(vGroup);
}

// --------------------------------------------------------
//  DAY/NIGHT LIGHTING
// --------------------------------------------------------
export function updateLighting(hour) {
  if (!sunLight) return;
  if (hour >= 6 && hour <= 18) {
    const progress = (hour - 6) / 12;
    const sunAngle = progress * Math.PI;
    sunLight.position.set(Math.cos(sunAngle) * 30, Math.sin(sunAngle) * 25 + 5, 20);
    sunLight.intensity = 1.2 + Math.sin(sunAngle) * 0.5;
    sunLight.color.setHex(hour <= 7 || hour >= 17 ? 0xffaa55 : 0xffeedd);
    ambientLight.intensity = 0.4;
    hemiLight.intensity = 0.6;
    scene.background.setHex(hour <= 7 || hour >= 17 ? 0x2a2040 : 0x4477aa);
    scene.fog.color.copy(scene.background);
    renderer.toneMappingExposure = 1.0;
  } else {
    const nightProgress = hour >= 19 ? (hour - 19) / 5 : hour <= 5 ? (5 - hour) / 5 : 0;
    sunLight.position.set(-20, 10 + nightProgress * 5, 15);
    sunLight.intensity = 0.4;
    sunLight.color.setHex(0x6688cc);
    ambientLight.intensity = 0.35;
    hemiLight.intensity = 0.35;
    scene.background.setHex(0x0f1528);
    scene.fog.color.copy(scene.background);
    renderer.toneMappingExposure = 0.85;
  }
}

// --------------------------------------------------------
//  MINIMAP (2D canvas in corner)
// --------------------------------------------------------
const minimapCanvas = document.getElementById('minimap');
const mctx = minimapCanvas.getContext('2d');
const MCELL = minimapCanvas.width / MAP_SIZE;

export function renderMinimap(px, py) {
  if (!currentMapGrid) return;
  mctx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = currentMapGrid[y][x];
      let color = TILE_COLORS[tile] || TILE_COLORS[T.GROUND];
      if (POI_DEFS[tile]) color = POI_DEFS[tile].color;
      mctx.fillStyle = color;
      mctx.fillRect(x * MCELL, y * MCELL, MCELL, MCELL);
    }
  }

  mctx.fillStyle = '#ffdd00';
  mctx.beginPath();
  mctx.arc(px * MCELL + MCELL / 2, py * MCELL + MCELL / 2, 3, 0, Math.PI * 2);
  mctx.fill();
  mctx.strokeStyle = '#000';
  mctx.lineWidth = 1;
  mctx.stroke();
}

// --------------------------------------------------------
//  GAME LOOP
// --------------------------------------------------------
export function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (!gameActive) { renderer.render(scene, camera); return; }

  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Duck position interpolation
  if (duckGroup) {
    duckGroup.position.x += (duckTargetX - duckGroup.position.x) * 0.2;
    duckGroup.position.z += (duckTargetZ - duckGroup.position.z) * 0.2;

    const targetRot = duckFacing;
    let rotDiff = targetRot - duckGroup.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    duckGroup.rotation.y += rotDiff * 0.15;

    const moving = Math.abs(duckTargetX - duckGroup.position.x) > 0.02 || Math.abs(duckTargetZ - duckGroup.position.z) > 0.02;
    if (moving) {
      waddle += dt * 12;
      const footL = duckGroup.getObjectByName('footL');
      const footR = duckGroup.getObjectByName('footR');
      if (footL) footL.position.z = 0.05 + Math.sin(waddle) * 0.08;
      if (footR) footR.position.z = 0.05 + Math.sin(waddle + Math.PI) * 0.08;
      duckGroup.position.y = Math.sin(waddle * 2) * 0.02;
    } else {
      duckGroup.position.y = 0;
    }
  }

  // Camera follow (isometric)
  if (duckGroup) {
    const targetCamX = duckGroup.position.x + camDist * Math.cos(camAngle);
    const targetCamZ = duckGroup.position.z + camDist * Math.sin(camAngle);
    camera.position.x += (targetCamX - camera.position.x) * 0.08;
    camera.position.y += (camHeight - camera.position.y) * 0.08;
    camera.position.z += (targetCamZ - camera.position.z) * 0.08;
    camera.lookAt(duckGroup.position.x, 1, duckGroup.position.z);

    sunLight.target.position.copy(duckGroup.position);
    sunLight.target.updateMatrixWorld();
  }

  // POI animations
  for (const mesh of poiMeshes) {
    if (mesh.userData.baseY !== undefined) {
      mesh.position.y = mesh.userData.baseY + Math.sin(elapsed * 2 + mesh.position.x) * 0.1;
      mesh.rotation.y = elapsed * 1.5;
    }
  }

  // NPC walking
  for (const npc of npcs) {
    const step = npc.speed * dt;
    if (npc.dir === 'x') {
      npc.group.position.x += npc.facing * step;
    } else {
      npc.group.position.z += npc.facing * step;
    }
    npc.walked += step;
    npc.phase += dt * 8;

    const legL = npc.group.getObjectByName('legL');
    const legR = npc.group.getObjectByName('legR');
    if (legL) legL.rotation.x = Math.sin(npc.phase) * 0.4;
    if (legR) legR.rotation.x = Math.sin(npc.phase + Math.PI) * 0.4;

    if (npc.walked >= npc.walkDist) {
      npc.facing *= -1;
      npc.walked = 0;
      npc.group.rotation.y += Math.PI;
    }

    const gx = Math.floor(npc.group.position.x);
    const gz = Math.floor(npc.group.position.z);
    if (gx < 1 || gx >= MAP_SIZE - 1 || gz < 1 || gz >= MAP_SIZE - 1) {
      npc.facing *= -1;
      npc.walked = 0;
      npc.group.rotation.y += Math.PI;
    }
  }

  // Street lamp glow
  const isNight = currentGameHour < 6 || currentGameHour > 18;
  for (const lamp of streetLamps) {
    lamp.light.intensity = isNight ? 1.2 : 0;
    lamp.head.material.emissiveIntensity = isNight ? 1.5 : 0.3;
  }

  // Neon sign pulse
  for (const ns of neonSigns) {
    const pulse = 0.3 + Math.sin(elapsed * 3 + ns.x * 2) * 0.2;
    const nightBoost = isNight ? 1.5 : 1.0;
    ns.sign.material.emissiveIntensity = pulse * nightBoost;
    ns.border.material.emissiveIntensity = (pulse * 0.5) * nightBoost;
  }

  // Police siren flash
  if (sirenActive && sirenLights.length === 2) {
    sirenLights[0].intensity = Math.sin(elapsed * 12) > 0 ? 3 : 0;
    sirenLights[1].intensity = Math.sin(elapsed * 12) > 0 ? 0 : 3;
  }

  // Player vehicle follows duck
  if (playerVehicleMesh && duckGroup) {
    playerVehicleMesh.position.set(
      duckGroup.position.x + 1.2,
      0,
      duckGroup.position.z + 0.5
    );
    playerVehicleMesh.rotation.y = duckGroup.rotation.y;
  }

  // Particles
  updateParticles(dt);

  renderer.render(scene, camera);
}
