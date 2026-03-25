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
let npcCars = [];
export let streetLamps = [];
export let neonSigns = [];
export let particles = [];
export let playerVehicleMesh = null;
export let currentGameHour = 12;

// Camera settings (isometric-ish)
export let camHeight = 22;
export let camDist = 28;
export let camAngle = Math.PI / 4; // 45 degrees
export const CAM_ZOOM_MIN = 8;
export const CAM_ZOOM_MAX = 60;

// Duck movement
export let duckTargetX = 0, duckTargetZ = 0;
export let duckFacing = 0; // radians
let waddle = 0;
let _duckFootL = null, _duckFootR = null;

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
  scene.fog = new THREE.FogExp2(0x1a1a2e, 0.018);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
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
//  3D DUCK CHARACTER (shared factory)
// --------------------------------------------------------
function _buildDuckGroup(opts = {}) {
  const group = new THREE.Group();
  const castShadows = opts.castShadows !== false;

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.3, 16, 12);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, roughness: 0.6, metalness: 0.1 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(1, 0.8, 1.2);
  body.position.y = 0.3;
  body.castShadow = castShadows;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.2, 16, 12);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffee33, roughness: 0.5 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0, 0.55, 0.15);
  head.castShadow = castShadows;
  group.add(head);

  // Beak
  const beakGeo = new THREE.ConeGeometry(0.06, 0.18, 8);
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.4 });
  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.52, 0.35);
  group.add(beak);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.1, 0.6, 0.28);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.1, 0.6, 0.28);
  group.add(eyeR);

  // Eye whites (only on local duck for detail)
  if (opts.eyeWhites) {
    const eyeWhiteGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const eyeWL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    eyeWL.position.set(-0.1, 0.6, 0.26);
    group.add(eyeWL);
    const eyeWR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    eyeWR.position.set(0.1, 0.6, 0.26);
    group.add(eyeWR);
  }

  // Feet
  const footGeo = new THREE.BoxGeometry(0.12, 0.03, 0.18);
  const footMat = new THREE.MeshStandardMaterial({ color: 0xff6600 });
  const footL = new THREE.Mesh(footGeo, footMat);
  footL.position.set(-0.1, 0.02, 0.05);
  footL.name = 'footL';
  group.add(footL);
  const footR = new THREE.Mesh(footGeo, footMat);
  footR.position.set(0.1, 0.02, 0.05);
  footR.name = 'footR';
  group.add(footR);

  // Tail
  const tailGeo = new THREE.ConeGeometry(0.08, 0.15, 6);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xeebb00 });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.rotation.x = Math.PI / 3;
  tail.position.set(0, 0.4, -0.3);
  group.add(tail);

  // Hat (default)
  if (opts.hat !== false) {
    const hatBrimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat);
    hatBrim.position.set(0, 0.72, 0.1);
    group.add(hatBrim);
    const hatTopGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.1, 16);
    const hatTop = new THREE.Mesh(hatTopGeo, hatMat);
    hatTop.position.set(0, 0.78, 0.1);
    group.add(hatTop);
  }

  return { group, footL, footR };
}

export function createDuck() {
  const { group, footL, footR } = _buildDuckGroup({ eyeWhites: true, castShadows: true });
  duckGroup = group;
  _duckFootL = footL;
  _duckFootR = footR;
  scene.add(duckGroup);
}

// Character-specific accessories for the 3D duck
let characterAccessories = [];
export function applyCharacterSkin(charName) {
  // Remove old accessories
  for (const obj of characterAccessories) {
    if (obj.parent) obj.parent.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }
  characterAccessories = [];
  if (!duckGroup) return;

  // Remove default hat for characters that have their own headgear
  const defaultHat = duckGroup.children.filter(c =>
    c.geometry && c.geometry.type === 'CylinderGeometry' &&
    c.position.y > 0.7
  );

  const name = (charName || '').toLowerCase();

  if (name === 'cj') {
    // Green bandana replacing hat
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const bandanaGeo = new THREE.BoxGeometry(0.36, 0.06, 0.28);
    const bandanaMat = new THREE.MeshStandardMaterial({ color: 0x44ff44 });
    const bandana = new THREE.Mesh(bandanaGeo, bandanaMat);
    bandana.position.set(0, 0.7, 0.1);
    duckGroup.add(bandana);
    characterAccessories.push(bandana);
    // Gold chain
    const chainGeo = new THREE.TorusGeometry(0.12, 0.015, 8, 16);
    const chainMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 });
    const chain = new THREE.Mesh(chainGeo, chainMat);
    chain.rotation.x = Math.PI / 2;
    chain.position.set(0, 0.35, 0.2);
    duckGroup.add(chain);
    characterAccessories.push(chain);

  } else if (name === 'tommy') {
    // Sunglasses
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const glassGeo = new THREE.BoxGeometry(0.28, 0.05, 0.04);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5 });
    const glasses = new THREE.Mesh(glassGeo, glassMat);
    glasses.position.set(0, 0.6, 0.32);
    duckGroup.add(glasses);
    characterAccessories.push(glasses);
    // Hawaiian shirt color on body
    const shirtGeo = new THREE.BoxGeometry(0.35, 0.15, 0.25);
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0xff4488 });
    const shirt = new THREE.Mesh(shirtGeo, shirtMat);
    shirt.position.set(0, 0.2, 0.05);
    duckGroup.add(shirt);
    characterAccessories.push(shirt);

  } else if (name === 'claude') {
    // Leather jacket collar
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const collarGeo = new THREE.BoxGeometry(0.38, 0.08, 0.3);
    const collarMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(0, 0.42, 0.05);
    duckGroup.add(collar);
    characterAccessories.push(collar);

  } else if (name === 'niko') {
    // Military cap (olive) replacing default hat
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const capBrimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x556644 });
    const capBrim = new THREE.Mesh(capBrimGeo, capMat);
    capBrim.position.set(0, 0.72, 0.1);
    duckGroup.add(capBrim);
    characterAccessories.push(capBrim);
    const capTopGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.1, 16);
    const capTop = new THREE.Mesh(capTopGeo, capMat);
    capTop.position.set(0, 0.78, 0.1);
    duckGroup.add(capTop);
    characterAccessories.push(capTop);
    // Scar on face
    const scarGeo = new THREE.BoxGeometry(0.01, 0.12, 0.01);
    const scarMat = new THREE.MeshStandardMaterial({ color: 0xcc6644 });
    const scar = new THREE.Mesh(scarGeo, scarMat);
    scar.position.set(0.15, 0.58, 0.3);
    scar.rotation.z = 0.3;
    duckGroup.add(scar);
    characterAccessories.push(scar);

  } else if (name === 'catalina') {
    // Red beret replacing hat
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const beretGeo = new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const beretMat = new THREE.MeshStandardMaterial({ color: 0xcc2222 });
    const beret = new THREE.Mesh(beretGeo, beretMat);
    beret.position.set(0, 0.72, 0.1);
    duckGroup.add(beret);
    characterAccessories.push(beret);
    // Hoop earrings
    const earGeo = new THREE.TorusGeometry(0.06, 0.01, 8, 12);
    const earMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 });
    for (const sx of [-0.2, 0.2]) {
      const earring = new THREE.Mesh(earGeo, earMat);
      earring.position.set(sx, 0.5, 0.2);
      duckGroup.add(earring);
      characterAccessories.push(earring);
    }

  } else if (name === 'oz') {
    // Hoodie over head
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const hoodGeo = new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.position.set(0, 0.6, 0.08);
    duckGroup.add(hood);
    characterAccessories.push(hood);
    // Glowing green glasses
    const cyberGeo = new THREE.BoxGeometry(0.28, 0.04, 0.04);
    const cyberMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.8 });
    const cyber = new THREE.Mesh(cyberGeo, cyberMat);
    cyber.position.set(0, 0.6, 0.33);
    duckGroup.add(cyber);
    characterAccessories.push(cyber);
    // Glow light
    const glow = new THREE.PointLight(0x00ff00, 0.5, 2);
    glow.position.set(0, 0.6, 0.4);
    duckGroup.add(glow);
    characterAccessories.push(glow);
  }
  // Default (unknown names) keep the standard hat — no changes
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
  invalidateMinimapCache();

  if (!currentMapGrid) return;

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(MAP_SIZE + 4, MAP_SIZE + 4);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(MAP_SIZE / 2, -0.01, MAP_SIZE / 2);
  ground.receiveShadow = true;
  cityGroup.add(ground);

  // ---- PASS 1: Collect tile positions by type ----
  const roadMainPositions = [];
  const roadSidePositions = [];
  const waterPositions = [];
  const parkPositions = [];
  const sandPositions = [];
  const treePositions = [];
  const bridgePositions = [];
  const dockPositions = [];
  const industrialPositions = [];
  const highwayPositions = [];
  const roadMarkPositions = []; // every 8th main road tile
  // Buildings grouped by material index
  const buildingGroups = new Map(); // matIdx -> [{x, z, height}]
  for (let i = 0; i < 8; i++) buildingGroups.set(i, []);
  // Windows collected for instancing
  const windowPositions = [];
  // POI data collected for individual meshes (small count)
  const poiTiles = [];

  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = currentMapGrid[y][x];
      const wx = x + 0.5;
      const wz = y + 0.5;

      if (tile === T.ROAD_MAIN) {
        roadMainPositions.push({ x: wx, z: wz });
        if ((x + y) % 8 === 0) {
          roadMarkPositions.push({ x: wx, z: wz });
        }
      } else if (tile === T.ROAD_SIDE) {
        roadSidePositions.push({ x: wx, z: wz });
      } else if (tile === T.WALL) {
        const heightSeed = (x * 7 + y * 13) % 10;
        const height = 0.8 + heightSeed * 0.4;
        const matIdx = heightSeed % 8;
        buildingGroups.get(matIdx).push({ x: wx, z: wz, height });

        // Windows only on tall buildings (height > 2.0), reduced probability
        if (height > 2.0) {
          const wSide = ((x * 31 + y * 17) % 2 === 0) ? 0.46 : -0.46;
          for (let wy = 0.4; wy < height - 0.2; wy += 0.35) {
            if (((x * 11 + y * 7 + Math.floor(wy * 100)) % 100) < 30) {
              windowPositions.push({
                x: wx + wSide,
                y: wy,
                z: wz + (((x * 37 + y * 53 + Math.floor(wy * 10)) % 100) / 100 - 0.5) * 0.5,
                rotated: Math.abs(wSide) > 0.4
              });
            }
          }
        }
      } else if (tile === T.WATER) {
        waterPositions.push({ x: wx, z: wz });
      } else if (tile === T.TREE) {
        treePositions.push({ x: wx, z: wz });
      } else if (tile === T.PARK) {
        parkPositions.push({ x: wx, z: wz });
      } else if (tile === T.SAND) {
        sandPositions.push({ x: wx, z: wz });
      } else if (tile === T.BRIDGE) {
        bridgePositions.push({ x: wx, z: wz });
      } else if (tile === T.DOCK) {
        dockPositions.push({ x: wx, z: wz });
      } else if (tile === T.INDUSTRIAL) {
        // Low squat buildings
        const height = 0.4 + ((x * 7 + y * 13) % 5) * 0.15;
        const matIdx = ((x * 7 + y * 13) % 10) % 8;
        buildingGroups.get(matIdx).push({ x: wx, z: wz, height });
      } else if (tile === T.HIGHWAY) {
        highwayPositions.push({ x: wx, z: wz });
      }

      if (POI_DEFS[tile]) {
        poiTiles.push({ x: wx, z: wz, tile, poi: POI_DEFS[tile] });
      }
    }
  }

  // ---- PASS 2: Create InstancedMeshes for flat tiles ----
  const dummy = new THREE.Object3D();
  const flatGeo = new THREE.BoxGeometry(1, 0.02, 1);

  // Road main
  if (roadMainPositions.length > 0) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 });
    const inst = new THREE.InstancedMesh(flatGeo, mat, roadMainPositions.length);
    inst.receiveShadow = true;
    inst.castShadow = false;
    roadMainPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.01, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
  }

  // Road side
  if (roadSidePositions.length > 0) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
    const inst = new THREE.InstancedMesh(flatGeo, mat, roadSidePositions.length);
    inst.receiveShadow = true;
    inst.castShadow = false;
    roadSidePositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.01, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
  }

  // Road markings (every 8 tiles instead of every 3)
  if (roadMarkPositions.length > 0) {
    const markGeo = new THREE.BoxGeometry(0.08, 0.025, 0.4);
    const markMat = new THREE.MeshStandardMaterial({ color: 0xaaaa00, emissive: 0x333300 });
    const inst = new THREE.InstancedMesh(markGeo, markMat, roadMarkPositions.length);
    inst.castShadow = false;
    roadMarkPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.025, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
  }

  // Water
  if (waterPositions.length > 0) {
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2266aa, transparent: true, opacity: 0.7, roughness: 0.2, metalness: 0.3
    });
    const inst = new THREE.InstancedMesh(flatGeo, waterMat, waterPositions.length);
    inst.receiveShadow = true;
    inst.castShadow = false;
    waterPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, -0.05, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
  }

  // Park
  if (parkPositions.length > 0) {
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 1 });
    const inst = new THREE.InstancedMesh(flatGeo, parkMat, parkPositions.length);
    inst.receiveShadow = true;
    inst.castShadow = false;
    parkPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.01, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
  }

  // Sand
  if (sandPositions.length > 0) {
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xaa8844, roughness: 1 });
    const inst = new THREE.InstancedMesh(flatGeo, sandMat, sandPositions.length);
    inst.receiveShadow = true;
    inst.castShadow = false;
    sandPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.01, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
  }

  // Bridge (raised wooden planks over water)
  if (bridgePositions.length > 0) {
    const bridgeGeo = new THREE.BoxGeometry(1, 0.08, 1);
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.9 });
    const inst = new THREE.InstancedMesh(bridgeGeo, bridgeMat, bridgePositions.length);
    inst.receiveShadow = true;
    inst.castShadow = true;
    bridgePositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.15, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
    // Bridge railings
    const railGeo = new THREE.BoxGeometry(0.05, 0.3, 1);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 });
    const railInst = new THREE.InstancedMesh(railGeo, railMat, bridgePositions.length * 2);
    railInst.castShadow = false;
    bridgePositions.forEach((pos, i) => {
      dummy.position.set(pos.x - 0.45, 0.3, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      railInst.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(pos.x + 0.45, 0.3, pos.z);
      dummy.updateMatrix();
      railInst.setMatrixAt(i * 2 + 1, dummy.matrix);
    });
    cityGroup.add(railInst);
  }

  // Dock (wooden planks at water level)
  if (dockPositions.length > 0) {
    const dockGeo = new THREE.BoxGeometry(1, 0.06, 1);
    const dockMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 1 });
    const inst = new THREE.InstancedMesh(dockGeo, dockMat, dockPositions.length);
    inst.receiveShadow = true;
    inst.castShadow = false;
    dockPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.04, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
    // Dock posts
    const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.4, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x443322 });
    const posts = [];
    dockPositions.forEach(pos => {
      if (Math.random() < 0.3) posts.push(pos);
    });
    if (posts.length > 0) {
      const postInst = new THREE.InstancedMesh(postGeo, postMat, posts.length);
      postInst.castShadow = true;
      posts.forEach((pos, i) => {
        dummy.position.set(pos.x + 0.35, 0.2, pos.z + 0.35);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        postInst.setMatrixAt(i, dummy.matrix);
      });
      cityGroup.add(postInst);
    }
  }

  // Highway (wider, slightly raised, darker road)
  if (highwayPositions.length > 0) {
    const hwGeo = new THREE.BoxGeometry(1, 0.06, 1);
    const hwMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 });
    const inst = new THREE.InstancedMesh(hwGeo, hwMat, highwayPositions.length);
    inst.receiveShadow = true;
    inst.castShadow = false;
    highwayPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.05, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
    // Highway lane markings (yellow center line)
    const hwMarkGeo = new THREE.BoxGeometry(0.06, 0.07, 0.5);
    const hwMarkMat = new THREE.MeshStandardMaterial({ color: 0xdddd00, emissive: 0x555500 });
    const marks = highwayPositions.filter((_, i) => i % 3 === 0);
    if (marks.length > 0) {
      const markInst = new THREE.InstancedMesh(hwMarkGeo, hwMarkMat, marks.length);
      markInst.castShadow = false;
      marks.forEach((pos, i) => {
        dummy.position.set(pos.x, 0.065, pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        markInst.setMatrixAt(i, dummy.matrix);
      });
      cityGroup.add(markInst);
    }
  }

  // ---- Buildings: InstancedMesh per material group ----
  const buildingMats = [];
  for (let i = 0; i < 8; i++) {
    const shade = 40 + i * 12;
    buildingMats.push(new THREE.MeshStandardMaterial({ color: new THREE.Color(`rgb(${shade+10},${shade+10},${shade+20})`), roughness: 0.8 }));
  }
  // Base building geo is 0.9 x 1.0 x 0.9 (height=1 will be scaled per instance)
  const buildGeo = new THREE.BoxGeometry(0.9, 1, 0.9);
  for (let matIdx = 0; matIdx < 8; matIdx++) {
    const group = buildingGroups.get(matIdx);
    if (group.length === 0) continue;
    const inst = new THREE.InstancedMesh(buildGeo, buildingMats[matIdx], group.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    group.forEach((b, i) => {
      dummy.position.set(b.x, b.height / 2, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, b.height, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
  }

  // ---- Windows: InstancedMesh ----
  if (windowPositions.length > 0) {
    const winGeo = new THREE.BoxGeometry(0.06, 0.06, 0.01);
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffcc44, emissiveIntensity: 0.8 });
    const inst = new THREE.InstancedMesh(winGeo, winMat, windowPositions.length);
    inst.castShadow = false;
    windowPositions.forEach((w, i) => {
      dummy.position.set(w.x, w.y, w.z);
      dummy.rotation.set(0, w.rotated ? Math.PI / 2 : 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
  }

  // ---- Trees: 2 InstancedMeshes (trunk + canopy) ----
  if (treePositions.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x553311 });
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    trunkInst.castShadow = true;
    treePositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.25, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(trunkInst);

    const canopyGeo = new THREE.SphereGeometry(0.3, 8, 6);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x228833, roughness: 0.8 });
    const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treePositions.length);
    canopyInst.castShadow = true;
    treePositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.65, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      canopyInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(canopyInst);
  }

  // ---- POI markers (individual meshes — small count, need animation) ----
  for (const { x: wx, z: wz, tile, poi } of poiTiles) {
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
    // No PointLight — emissive materials provide the visual glow
  }

  // ---- Street lamps: InstancedMesh for posts and heads, NO PointLights ----
  streetLamps = [];
  const lampPostPositions = [];
  const lampHeadPositions = [];

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
          lampPostPositions.push({ x: wx, z: wz });
          lampHeadPositions.push({ x: wx, z: wz });
          break;
        }
      }
    }
  }

  // Shared material for all lamp heads — toggle emissiveIntensity globally for night
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 0.3 });

  if (lampPostPositions.length > 0) {
    const lampPostGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.5, 6);
    const lampPostMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6 });
    const postInst = new THREE.InstancedMesh(lampPostGeo, lampPostMat, lampPostPositions.length);
    postInst.castShadow = false;
    lampPostPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.75, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(postInst);

    const lampHeadGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const headInst = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lampHeadPositions.length);
    headInst.castShadow = false;
    lampHeadPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 1.55, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      headInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(headInst);
  }

  // Store reference to shared material for night toggling
  // streetLamps now just holds the shared material and positions for compatibility
  streetLamps = lampHeadPositions.map(pos => ({ x: pos.x, z: pos.z }));
  streetLamps._sharedHeadMat = lampHeadMat;

  // ---- Parked cars on side roads (max 40, no castShadow) ----
  parkedCars = [];
  const carBodyGeo = new THREE.BoxGeometry(0.35, 0.2, 0.65);
  const carTopGeo = new THREE.BoxGeometry(0.28, 0.15, 0.35);
  const carColors = [0xcc2222, 0x2244cc, 0x22aa22, 0xcccc22, 0xeeeeee, 0x222222, 0xcc6600, 0x8822aa];
  const carBodyPositions = [];
  const carTopPositions = [];
  const carWheelPositions = [];
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
      const colorIdx = Math.floor(Math.random() * carColors.length);
      carBodyPositions.push({ x: wx, z: wz, colorIdx });
      carTopPositions.push({ x: wx, z: wz - 0.05, colorIdx });
      for (const [sx, sz] of [[-0.18, -0.2], [0.18, -0.2], [-0.18, 0.2], [0.18, 0.2]]) {
        carWheelPositions.push({ x: wx + sx, z: wz + sz });
      }
      parkedCars.push({ x: wx, z: wz });
      carCount++;
    }
  }

  // Parked car bodies — one InstancedMesh per color
  const carsByColor = new Map();
  carBodyPositions.forEach((pos) => {
    if (!carsByColor.has(pos.colorIdx)) carsByColor.set(pos.colorIdx, { bodies: [], tops: [] });
    carsByColor.get(pos.colorIdx).bodies.push(pos);
  });
  carTopPositions.forEach((pos) => {
    if (carsByColor.has(pos.colorIdx)) carsByColor.get(pos.colorIdx).tops.push(pos);
  });

  for (const [colorIdx, data] of carsByColor) {
    const color = carColors[colorIdx];
    const carMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
    if (data.bodies.length > 0) {
      const bodyInst = new THREE.InstancedMesh(carBodyGeo, carMat, data.bodies.length);
      bodyInst.castShadow = false;
      bodyInst.receiveShadow = true;
      data.bodies.forEach((pos, i) => {
        dummy.position.set(pos.x, 0.12, pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(i, dummy.matrix);
      });
      cityGroup.add(bodyInst);
    }
    if (data.tops.length > 0) {
      const topInst = new THREE.InstancedMesh(carTopGeo, carMat, data.tops.length);
      topInst.castShadow = false;
      topInst.receiveShadow = true;
      data.tops.forEach((pos, i) => {
        dummy.position.set(pos.x, 0.27, pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        topInst.setMatrixAt(i, dummy.matrix);
      });
      cityGroup.add(topInst);
    }
  }

  // Parked car wheels — single InstancedMesh
  if (carWheelPositions.length > 0) {
    const wheelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const wheelInst = new THREE.InstancedMesh(wheelGeo, wheelMat, carWheelPositions.length);
    wheelInst.castShadow = false;
    carWheelPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.05, pos.z);
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      wheelInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(wheelInst);
  }

  // NPC cars on main roads (stealable)
  npcCars = [];
  const npcCarColors = [
    0xff00ff, 0x00ffff, 0xff4400, 0x44ff00, 0xffff00, 0xff0066,
    0x6600ff, 0x00ff88, 0xff8800, 0x0088ff, 0xcc00cc, 0x00cccc
  ];
  const npcCarNames = [
    'Neon Blaze', 'Midnight Cruiser', 'Flame Runner', 'Volt Racer',
    'Gold Rush', 'Pink Panther', 'Shadow Drift', 'Jade Fury',
    'Sunset Rider', 'Ice Storm', 'Purple Haze', 'Aqua Bullet'
  ];
  const mainRoadTiles = [];
  for (let y = 4; y < MAP_SIZE - 4; y++) {
    for (let x = 4; x < MAP_SIZE - 4; x++) {
      if (currentMapGrid[y][x] === T.ROAD_MAIN) mainRoadTiles.push({x, y});
    }
  }
  const npcCarCount = Math.min(18, Math.floor(mainRoadTiles.length / 30));
  for (let i = 0; i < npcCarCount; i++) {
    const rt = mainRoadTiles[Math.floor(Math.random() * mainRoadTiles.length)];
    const colorIdx = Math.floor(Math.random() * npcCarColors.length);
    const color = npcCarColors[colorIdx];
    const vName = npcCarNames[colorIdx];
    const wx = rt.x + 0.5, wz = rt.y + 0.5;
    const carGroup = new THREE.Group();
    // Wider/sportier body
    const bodyW = 0.3 + Math.random() * 0.15;
    const bodyL = 0.6 + Math.random() * 0.2;
    const cBodyGeo = new THREE.BoxGeometry(bodyW, 0.2, bodyL);
    const cBodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.5 });
    const cBody = new THREE.Mesh(cBodyGeo, cBodyMat);
    cBody.position.y = 0.12;
    cBody.castShadow = true;
    carGroup.add(cBody);
    const cTopGeo = new THREE.BoxGeometry(bodyW * 0.75, 0.14, bodyL * 0.5);
    const cTop = new THREE.Mesh(cTopGeo, cBodyMat);
    cTop.position.set(0, 0.26, -0.02);
    carGroup.add(cTop);
    // Glowing trim
    const trimGeo = new THREE.BoxGeometry(bodyW + 0.04, 0.02, bodyL + 0.04);
    const trimMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.y = 0.03;
    carGroup.add(trim);
    // Wheels
    const cwGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8);
    const cwMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const hw = bodyW / 2 + 0.02;
    const hl = bodyL / 2 - 0.08;
    for (const [sx, sz] of [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]]) {
      const w = new THREE.Mesh(cwGeo, cwMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx, 0.06, sz);
      carGroup.add(w);
    }
    // Headlights
    const hlGeo = new THREE.SphereGeometry(0.03, 6, 6);
    const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.6 });
    for (const sx of [-bodyW * 0.3, bodyW * 0.3]) {
      const hl = new THREE.Mesh(hlGeo, hlMat);
      hl.position.set(sx, 0.12, bodyL / 2);
      carGroup.add(hl);
    }
    carGroup.position.set(wx, 0, wz);
    const driveAxis = Math.random() < 0.5 ? 'x' : 'z';
    const driveDir = Math.random() < 0.5 ? 1 : -1;
    // Align car rotation with drive direction
    if (driveAxis === 'x') {
      carGroup.rotation.y = driveDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      carGroup.rotation.y = driveDir > 0 ? 0 : Math.PI;
    }
    scene.add(carGroup);
    npcCars.push({
      group: carGroup, x: wx, z: wz, name: vName,
      color: '#' + color.toString(16).padStart(6, '0'),
      dir: driveDir,
      speed: 0.5 + Math.random() * 0.8,
      startX: wx, startZ: wz,
      driveAxis,
      driveDist: 6 + Math.random() * 14,
      driven: 0
    });
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
  if (!currentMapGrid) { console.warn('spawnNPCs: no map grid'); return; }

  const npcColors = [0xcc4444, 0x4444cc, 0x44cc44, 0xcccc44, 0xcc44cc, 0x44cccc, 0xff8844, 0x884422, 0xffffff, 0x888888];
  const roadTiles = [];
  for (let y = 3; y < MAP_SIZE - 3; y++) {
    for (let x = 3; x < MAP_SIZE - 3; x++) {
      if (currentMapGrid[y][x] === T.ROAD_MAIN || currentMapGrid[y][x] === T.ROAD_SIDE) roadTiles.push({x, y});
    }
  }

  const count = Math.max(25, Math.min(50, Math.floor(roadTiles.length / 30)));
  console.log(`spawnNPCs: ${roadTiles.length} road tiles, spawning ${count} NPCs`);
  for (let i = 0; i < count; i++) {
    const rt = roadTiles[Math.floor(Math.random() * roadTiles.length)];
    const color = npcColors[Math.floor(Math.random() * npcColors.length)];
    const group = new THREE.Group();

    // Body - bigger and more visible
    const bodyGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.45, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: color, emissiveIntensity: 0.15 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.35;
    body.castShadow = true;
    body.name = 'npcBody';
    group.add(body);

    // Head - bigger
    const headGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const skinColor = Math.random() < 0.5 ? 0xddaa77 : 0x885533;
    const headMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6, emissive: 0xffddaa, emissiveIntensity: 0.1 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.65;
    head.name = 'npcHead';
    group.add(head);

    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222244 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.06, 0.12, 0);
    legL.name = 'legL';
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.06, 0.12, 0);
    legR.name = 'legR';
    group.add(legR);

    // Small marker light above NPC head so they're always visible
    const markerGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const isHostile = Math.random() < 0.25;
    const markerColor = isHostile ? 0xff4444 : 0x44ff44;
    const markerMat = new THREE.MeshStandardMaterial({ color: markerColor, emissive: markerColor, emissiveIntensity: 1.0 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.y = 0.85;
    group.add(marker);

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
      walked: 0, phase: Math.random() * Math.PI * 2,
      hostile: isHostile,
      // Cached child references (avoid per-frame getObjectByName)
      _legL: legL, _legR: legR, _body: body, _head: head
    });
  }
}

// --------------------------------------------------------
//  NPC INTERACTION (shooting)
// --------------------------------------------------------
export function getNearestNPC(maxDist = 4) {
  if (!duckGroup) return null;
  let best = null, bestDist = maxDist;
  for (const npc of npcs) {
    const dx = npc.group.position.x - duckGroup.position.x;
    const dz = npc.group.position.z - duckGroup.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) { best = npc; bestDist = dist; }
  }
  return best;
}

export function getNearestPoliceNPC(maxDist = 5) {
  if (!duckGroup) return null;
  let best = null, bestDist = maxDist;
  for (const cop of policeNPCs) {
    if (!cop.alive) continue;
    const dx = cop.group.position.x - duckGroup.position.x;
    const dz = cop.group.position.z - duckGroup.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) { best = cop; bestDist = dist; }
  }
  return best;
}

export function killNPC(npc) {
  const pos = { x: npc.group.position.x, z: npc.group.position.z };
  scene.remove(npc.group);
  npc.group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); });
  const idx = npcs.indexOf(npc);
  if (idx >= 0) npcs.splice(idx, 1);
  return pos;
}

export function damagePoliceNPC(cop, dmg) {
  cop.health -= dmg;
  if (cop.health <= 0) {
    cop.alive = false;
    const pos = { x: cop.group.position.x, z: cop.group.position.z };
    removePoliceNPC(cop);
    return pos;
  }
  return null;
}

// NPC car interaction
export function getNearestNPCCar(maxDist = 2) {
  if (!duckGroup) return null;
  let best = null, bestDist = maxDist;
  for (const car of npcCars) {
    const dx = car.group.position.x - duckGroup.position.x;
    const dz = car.group.position.z - duckGroup.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) { best = car; bestDist = dist; }
  }
  return best;
}

export function removeNPCCar(car) {
  scene.remove(car.group);
  car.group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); });
  const idx = npcCars.indexOf(car);
  if (idx >= 0) npcCars.splice(idx, 1);
}

// Shared particle pool (used by particles + bullet trails)
const _particleGeo = new THREE.SphereGeometry(0.05, 4, 4);
const _particleMatCache = new Map(); // color -> MeshBasicMaterial

function _getParticleMat(color) {
  let mat = _particleMatCache.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    _particleMatCache.set(color, mat);
  }
  return mat;
}

// Projectile system
let projectiles = [];

export function spawnMuzzleFlash() {
  if (!duckGroup) return;
  // Big muzzle flash
  const flashGeo = new THREE.SphereGeometry(0.2, 8, 6);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 1 });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.set(0, 0.45, 0.4);
  duckGroup.add(flash);
  // Flash light
  const flashLight = new THREE.PointLight(0xffaa00, 3, 5);
  flashLight.position.set(0, 0.5, 0.5);
  duckGroup.add(flashLight);
  setTimeout(() => {
    duckGroup.remove(flash);
    duckGroup.remove(flashLight);
    flashGeo.dispose();
    flashMat.dispose();
    flashLight.dispose();
  }, 100);
}

export function fireProjectile(targetX, targetZ) {
  if (!duckGroup) return;
  const startX = duckGroup.position.x;
  const startZ = duckGroup.position.z;
  const startY = 0.45;

  const dx = targetX - startX;
  const dz = targetZ - startZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;
  const nx = dx / dist;
  const nz = dz / dist;
  const speed = 18;

  // Main bullet — bright glowing orb
  const bulletGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 1 });
  const bullet = new THREE.Mesh(bulletGeo, bulletMat);
  bullet.position.set(startX + nx * 0.5, startY, startZ + nz * 0.5);
  scene.add(bullet);

  // Bullet glow light
  const bulletLight = new THREE.PointLight(0xffaa00, 2, 3);
  bulletLight.position.copy(bullet.position);
  scene.add(bulletLight);

  projectiles.push({
    mesh: bullet,
    light: bulletLight,
    vx: nx * speed,
    vz: nz * speed,
    life: dist / speed + 0.1,
    maxLife: dist / speed + 0.1,
    targetX, targetZ,
    trailTimer: 0
  });
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      scene.remove(p.light);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      p.light.dispose();
      projectiles.splice(i, 1);
      continue;
    }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.z += p.vz * dt;
    p.light.position.copy(p.mesh.position);

    // Spawn trail particles behind bullet
    p.trailTimer += dt;
    if (p.trailTimer > 0.02) {
      p.trailTimer = 0;
      const trailMat = _getParticleMat(0xff6600).clone();
      trailMat.opacity = 0.8;
      const trail = new THREE.Mesh(_particleGeo, trailMat);
      trail.position.copy(p.mesh.position);
      scene.add(trail);
      particles.push({
        mesh: trail,
        vx: (Math.random() - 0.5) * 0.3,
        vy: Math.random() * 0.5,
        vz: (Math.random() - 0.5) * 0.3,
        life: 0.3,
        maxLife: 0.3,
        gravity: 1
      });
    }

    // Fade bullet slightly as it travels
    p.mesh.material.opacity = Math.max(0.4, p.life / p.maxLife);
  }
}

// --------------------------------------------------------
//  PARTICLE SYSTEM (pooled geometry + materials)
// --------------------------------------------------------
export function spawnParticles(worldX, worldZ, color, count, speed, life, gravity) {
  const baseMat = _getParticleMat(color);
  for (let i = 0; i < count; i++) {
    // Clone material so each particle can fade independently
    const mat = baseMat.clone();
    const mesh = new THREE.Mesh(_particleGeo, mat);
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
      // Only dispose cloned materials, not the shared geometry
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

// Police NPCs
let policeNPCs = [];

export function spawnPoliceNPC(nearX, nearZ) {
  const group = new THREE.Group();

  // Body (blue uniform)
  const bodyGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.38, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2233aa, roughness: 0.7 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.3;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.08, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xddaa77, roughness: 0.6 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 0.57;
  group.add(head);

  // Police cap
  const capGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.04, 8);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x111155 });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.y = 0.65;
  group.add(cap);

  // Badge glow
  const badgeGeo = new THREE.SphereGeometry(0.02, 6, 6);
  const badgeMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.8 });
  const badge = new THREE.Mesh(badgeGeo, badgeMat);
  badge.position.set(0, 0.4, 0.1);
  group.add(badge);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x111133 });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.04, 0.1, 0);
  legL.name = 'legL';
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.04, 0.1, 0);
  legR.name = 'legR';
  group.add(legR);

  // Siren light on top
  const sirenGeo = new THREE.SphereGeometry(0.04, 6, 6);
  const sirenMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0 });
  const siren = new THREE.Mesh(sirenGeo, sirenMat);
  siren.position.y = 0.7;
  siren.name = 'siren';
  group.add(siren);

  // Spawn offset from player
  const angle = Math.random() * Math.PI * 2;
  const dist = 3 + Math.random() * 3;
  group.position.set(nearX + Math.cos(angle) * dist, 0, nearZ + Math.sin(angle) * dist);

  scene.add(group);
  policeNPCs.push({
    group, phase: Math.random() * Math.PI * 2,
    speed: 1.2 + Math.random() * 0.6,
    health: 100, alive: true,
    // Cached child references
    _legL: legL, _legR: legR, _siren: siren
  });
  return policeNPCs[policeNPCs.length - 1];
}

export function clearPoliceNPCs() {
  for (const cop of policeNPCs) {
    scene.remove(cop.group);
    cop.group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); });
  }
  policeNPCs = [];
}

export function getPoliceNPCs() { return policeNPCs; }

export function removePoliceNPC(cop) {
  scene.remove(cop.group);
  cop.group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); });
  const idx = policeNPCs.indexOf(cop);
  if (idx >= 0) policeNPCs.splice(idx, 1);
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
  // Shorter night: day is 5-21, night is 21-5
  if (hour >= 5 && hour <= 21) {
    const progress = (hour - 5) / 16;
    const sunAngle = progress * Math.PI;
    sunLight.position.set(Math.cos(sunAngle) * 30, Math.sin(sunAngle) * 25 + 5, 20);
    sunLight.intensity = 1.2 + Math.sin(sunAngle) * 0.5;
    sunLight.color.setHex(hour <= 6 || hour >= 20 ? 0xffaa55 : 0xffeedd);
    ambientLight.intensity = 0.4;
    hemiLight.intensity = 0.6;
    scene.background.setHex(hour <= 6 || hour >= 20 ? 0x2a2040 : 0x4477aa);
    scene.fog.color.copy(scene.background);
    renderer.toneMappingExposure = 1.0;
  } else {
    sunLight.position.set(-20, 12, 15);
    sunLight.intensity = 0.3;
    sunLight.color.setHex(0x6688cc);
    ambientLight.intensity = 0.3;
    hemiLight.intensity = 0.3;
    scene.background.setHex(0x0f1528);
    scene.fog.color.copy(scene.background);
    renderer.toneMappingExposure = 0.8;
  }
}

// --------------------------------------------------------
//  MINIMAP (2D canvas in corner) — cached background
// --------------------------------------------------------
const minimapCanvas = document.getElementById('minimap');
const mctx = minimapCanvas.getContext('2d');
const MCELL = minimapCanvas.width / MAP_SIZE;

// Offscreen canvas for tile background (rebuilt only when city changes)
let _minimapBg = null;

export function invalidateMinimapCache() { _minimapBg = null; }

function _buildMinimapBg() {
  if (!currentMapGrid) return;
  const offscreen = document.createElement('canvas');
  offscreen.width = minimapCanvas.width;
  offscreen.height = minimapCanvas.height;
  const ctx = offscreen.getContext('2d');
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const tile = currentMapGrid[y][x];
      let color = TILE_COLORS[tile] || TILE_COLORS[T.GROUND];
      if (POI_DEFS[tile]) color = POI_DEFS[tile].color;
      ctx.fillStyle = color;
      ctx.fillRect(x * MCELL, y * MCELL, MCELL, MCELL);
    }
  }
  _minimapBg = offscreen;
}

export function renderMinimap(px, py) {
  if (!currentMapGrid) return;
  if (!_minimapBg) _buildMinimapBg();

  mctx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  mctx.drawImage(_minimapBg, 0, 0);

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
// --------------------------------------------------------
//  REMOTE PLAYER DUCKS (Multiplayer)
// --------------------------------------------------------
const remoteDucks = new Map(); // peerId -> { group, targetX, targetZ, label }

export function spawnRemoteDuck(peerId, charType, name) {
  if (remoteDucks.has(peerId)) return remoteDucks.get(peerId);

  const { group, footL, footR } = _buildDuckGroup({ eyeWhites: false, castShadows: true, hat: false });

  // Name label (sprite)
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(name || peerId.slice(0, 8), 128, 40);
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const label = new THREE.Sprite(spriteMat);
  label.position.set(0, 1.1, 0);
  label.scale.set(1.5, 0.4, 1);
  group.add(label);

  scene.add(group);

  const entry = { group, targetX: 0, targetZ: 0, label, waddle: 0, _footL: footL, _footR: footR };
  remoteDucks.set(peerId, entry);

  // Apply character skin if available
  if (charType) {
    _applyRemoteSkin(group, charType);
  }

  return entry;
}

function _applyRemoteSkin(group, charName) {
  // Simplified skin: just tint the body based on character
  const skinColors = {
    cj: 0x44aa44, tommy: 0x4488ff, claude: 0x888888,
    niko: 0xaa6644, catalina: 0xff4488, oz: 0xaa44ff
  };
  const color = skinColors[charName.toLowerCase()] || 0xffdd00;
  const body = group.children[0]; // first child is body
  if (body && body.material) {
    body.material.color.setHex(color);
  }
}

export function updateRemoteDuck(peerId, x, y, data) {
  let entry = remoteDucks.get(peerId);
  if (!entry) {
    entry = spawnRemoteDuck(peerId, data?.char, data?.name);
  }
  entry.targetX = x + 0.5;
  entry.targetZ = y + 0.5;
}

function _disposeGroup(group) {
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });
}

export function despawnRemoteDuck(peerId) {
  const entry = remoteDucks.get(peerId);
  if (entry) {
    scene.remove(entry.group);
    _disposeGroup(entry.group);
    if (entry.label?.material?.map) entry.label.material.map.dispose();
    remoteDucks.delete(peerId);
  }
}

export function clearRemoteDucks() {
  for (const [, entry] of remoteDucks) {
    scene.remove(entry.group);
    _disposeGroup(entry.group);
    if (entry.label?.material?.map) entry.label.material.map.dispose();
  }
  remoteDucks.clear();
}

export function getRemoteDucks() { return remoteDucks; }

export function getNearestRemoteDuck(maxDist = 6) {
  if (!duckGroup) return null;
  let nearest = null, nearestDist = maxDist;
  for (const [peerId, entry] of remoteDucks) {
    const dx = entry.group.position.x - duckGroup.position.x;
    const dz = entry.group.position.z - duckGroup.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = { peerId, entry, dist };
    }
  }
  return nearest;
}

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
      if (_duckFootL) _duckFootL.position.z = 0.05 + Math.sin(waddle) * 0.08;
      if (_duckFootR) _duckFootR.position.z = 0.05 + Math.sin(waddle + Math.PI) * 0.08;
      duckGroup.position.y = Math.sin(waddle * 2) * 0.02;
    } else {
      duckGroup.position.y = 0;
    }
  }

  // Remote duck interpolation (multiplayer)
  for (const [, rd] of remoteDucks) {
    const g = rd.group;
    const dx = rd.targetX - g.position.x;
    const dz = rd.targetZ - g.position.z;
    g.position.x += dx * 0.15;
    g.position.z += dz * 0.15;
    const moving = Math.abs(dx) > 0.02 || Math.abs(dz) > 0.02;
    if (moving) {
      g.rotation.y = Math.atan2(dx, dz);
      rd.waddle += dt * 12;
      if (rd._footL) rd._footL.position.z = 0.05 + Math.sin(rd.waddle) * 0.08;
      if (rd._footR) rd._footR.position.z = 0.05 + Math.sin(rd.waddle + Math.PI) * 0.08;
      g.position.y = Math.sin(rd.waddle * 2) * 0.02;
    } else {
      g.position.y = 0;
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

  // Night check (used by multiple sections)
  const isNight = currentGameHour < 5 || currentGameHour > 21;

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

    if (npc._legL) npc._legL.rotation.x = Math.sin(npc.phase) * 0.4;
    if (npc._legR) npc._legR.rotation.x = Math.sin(npc.phase + Math.PI) * 0.4;

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

    // Night glow — make NPCs visible in the dark
    const nightGlow = isNight ? 0.4 : 0;
    if (npc._body) npc._body.material.emissiveIntensity = nightGlow;
    if (npc._head) npc._head.material.emissiveIntensity = nightGlow;
  }

  // NPC car driving
  for (const car of npcCars) {
    const step = car.speed * dt;
    if (car.driveAxis === 'x') {
      car.group.position.x += car.dir * step;
    } else {
      car.group.position.z += car.dir * step;
    }
    car.driven += step;
    if (car.driven >= car.driveDist) {
      car.dir *= -1;
      car.driven = 0;
      car.group.rotation.y += Math.PI;
    }
    const gx = Math.floor(car.group.position.x);
    const gz = Math.floor(car.group.position.z);
    if (gx < 2 || gx >= MAP_SIZE - 2 || gz < 2 || gz >= MAP_SIZE - 2) {
      car.dir *= -1;
      car.driven = 0;
      car.group.rotation.y += Math.PI;
    }
  }

  // Street lamp glow — toggle shared material emissive for night
  if (streetLamps._sharedHeadMat) {
    streetLamps._sharedHeadMat.emissiveIntensity = isNight ? 2.0 : 0.3;
  }

  // Neon sign pulse — brighter at night
  for (const ns of neonSigns) {
    const pulse = 0.3 + Math.sin(elapsed * 3 + ns.x * 2) * 0.2;
    const nightBoost = isNight ? 2.0 : 1.0;
    ns.sign.material.emissiveIntensity = pulse * nightBoost;
    ns.border.material.emissiveIntensity = (pulse * 0.5) * nightBoost;
  }

  // Parked car headlights at night — removed for performance (no PointLights)

  // Police siren flash
  if (sirenActive && sirenLights.length === 2) {
    sirenLights[0].intensity = Math.sin(elapsed * 12) > 0 ? 3 : 0;
    sirenLights[1].intensity = Math.sin(elapsed * 12) > 0 ? 0 : 3;
  }

  // Police NPC chase + siren flash
  for (const cop of policeNPCs) {
    if (!cop.alive || !duckGroup) continue;
    const dx = duckGroup.position.x - cop.group.position.x;
    const dz = duckGroup.position.z - cop.group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.5) {
      const nx = dx / dist, nz = dz / dist;
      cop.group.position.x += nx * cop.speed * dt;
      cop.group.position.z += nz * cop.speed * dt;
      cop.group.rotation.y = Math.atan2(nx, nz);
    }
    cop.phase += dt * 8;
    if (cop._legL) cop._legL.rotation.x = Math.sin(cop.phase) * 0.5;
    if (cop._legR) cop._legR.rotation.x = Math.sin(cop.phase + Math.PI) * 0.5;
    if (cop._siren) {
      cop._siren.material.color.setHex(Math.sin(elapsed * 10 + cop.phase) > 0 ? 0xff0000 : 0x0044ff);
      cop._siren.material.emissive.setHex(cop._siren.material.color.getHex());
    }
  }

  // Player vehicle follows duck (duck rides on top)
  if (playerVehicleMesh && duckGroup) {
    playerVehicleMesh.position.set(
      duckGroup.position.x,
      0,
      duckGroup.position.z
    );
    playerVehicleMesh.rotation.y = duckGroup.rotation.y;
  }

  // Particles
  updateParticles(dt);
  updateProjectiles(dt);

  renderer.render(scene, camera);
}
