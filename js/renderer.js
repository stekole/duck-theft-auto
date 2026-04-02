import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
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
  sunLight.shadow.bias = -0.001;
  sunLight.target = new THREE.Object3D();
  scene.add(sunLight.target);
  scene.add(sunLight);

  ambientLight = new THREE.AmbientLight(0x404060, 0.4);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x2a4a2a, 0.6);
  scene.add(hemiLight);

  clock = new THREE.Clock();

  // Post-processing: bloom for emissive glow
  _composer = new EffectComposer(renderer);
  _composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.4,   // strength
    0.3,   // radius
    0.85   // threshold — only bright emissives bloom
  );
  _composer.addPass(bloomPass);
  _composer.addPass(new SMAAPass(window.innerWidth, window.innerHeight));

  // Generate environment cubemap for reflections
  _envMap = _generateEnvMap();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    _composer.setSize(window.innerWidth, window.innerHeight);
  });
}

let _composer = null;
let _envMap = null;

function _generateEnvMap() {
  // Simple gradient cubemap for reflections
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(0.5, '#ddeeff');
  gradient.addColorStop(1, '#2a4a2a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
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
  head.position.set(0, 0.58, 0.12);
  head.castShadow = castShadows;
  group.add(head);

  // Beak — slightly rounder
  const beakGeo = new THREE.ConeGeometry(0.07, 0.16, 10);
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.4 });
  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.54, 0.32);
  group.add(beak);

  // Eyes — slightly larger, better placed
  const eyeGeo = new THREE.SphereGeometry(0.038, 10, 10);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.09, 0.63, 0.26);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.09, 0.63, 0.26);
  group.add(eyeR);

  // Eye whites
  if (opts.eyeWhites) {
    const eyeWhiteGeo = new THREE.SphereGeometry(0.055, 10, 10);
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const eyeWL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    eyeWL.position.set(-0.09, 0.63, 0.24);
    group.add(eyeWL);
    const eyeWR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    eyeWR.position.set(0.09, 0.63, 0.24);
    group.add(eyeWR);
  }

  // Feet — webbed look
  const footGeo = new THREE.BoxGeometry(0.13, 0.025, 0.2);
  const footMat = new THREE.MeshStandardMaterial({ color: 0xff6600 });
  const footL = new THREE.Mesh(footGeo, footMat);
  footL.position.set(-0.1, 0.015, 0.05);
  footL.name = 'footL';
  group.add(footL);
  const footR = new THREE.Mesh(footGeo, footMat);
  footR.position.set(0.1, 0.015, 0.05);
  footR.name = 'footR';
  group.add(footR);

  // Tail — fluffier
  const tailGeo = new THREE.ConeGeometry(0.09, 0.14, 8);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xeebb00 });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.rotation.x = Math.PI / 3;
  tail.position.set(0, 0.38, -0.28);
  group.add(tail);

  // Hat (default) — properly centered on head
  if (opts.hat !== false) {
    const hatBrimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat);
    hatBrim.position.set(0, 0.75, 0.12);
    group.add(hatBrim);
    const hatTopGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.1, 16);
    const hatTop = new THREE.Mesh(hatTopGeo, hatMat);
    hatTop.position.set(0, 0.81, 0.12);
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
function _mk(mesh, props) {
  if (props.position) { mesh.position.copy(props.position); }
  if (props.rotation) { mesh.rotation.copy(props.rotation); }
  return mesh;
}

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

  // Character-colored ring at feet for visibility from distance
  const charColors = { cj: 0x44ff44, tommy: 0xff4488, claude: 0x4444ff, niko: 0x556644, catalina: 0xcc2222, oz: 0x00ff00, izzy: 0xff1493 };
  const ringColor = charColors[name];
  if (ringColor) {
    const ringGeo = new THREE.TorusGeometry(0.35, 0.02, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: ringColor, emissive: ringColor, emissiveIntensity: 0.8, transparent: true, opacity: 0.7 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    duckGroup.add(ring); characterAccessories.push(ring);
  }

  function _a(mesh) { duckGroup.add(mesh); characterAccessories.push(mesh); }

  if (name === 'cj') {
    // Green bandana with glow + knot
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const bandanaMat = new THREE.MeshStandardMaterial({ color: 0x44ff44, emissive: 0x22aa22, emissiveIntensity: 0.4 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.3), bandanaMat), { position: new THREE.Vector3(0, 0.7, 0.1) }));
    // Bandana tail + knot
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.22), bandanaMat);
    tail.position.set(0, 0.67, -0.12); tail.rotation.x = 0.3; _a(tail);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), bandanaMat);
    knot.position.set(0, 0.68, -0.02); _a(knot);
    // Big gold chain with $ pendant
    const chainMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.95, roughness: 0.05, emissive: 0xaa8800, emissiveIntensity: 0.4 });
    _a(_mk(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 24), chainMat), { rotation: new THREE.Euler(Math.PI/2,0,0), position: new THREE.Vector3(0, 0.35, 0.2) }));
    _a(_mk(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), chainMat), { position: new THREE.Vector3(0, 0.21, 0.34) }));
    // Tattoo sleeve (arm band)
    const tattooMat = new THREE.MeshStandardMaterial({ color: 0x228822, emissive: 0x114411, emissiveIntensity: 0.3, transparent: true, opacity: 0.6 });
    _a(_mk(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12), tattooMat), { position: new THREE.Vector3(0, 0.38, 0) }));
    // Shotgun on back
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });
    _a(_mk(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), gunMat), { position: new THREE.Vector3(0.12, 0.4, -0.15), rotation: new THREE.Euler(0.3, 0, 0.15) }));

  } else if (name === 'tommy') {
    // Slicked-back hair
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.3 });
    _a(_mk(new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI*2, 0, Math.PI*0.4), hairMat), { position: new THREE.Vector3(0, 0.68, -0.02) }));
    // Reflective aviators with gold frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xccaa44, metalness: 0.9, roughness: 0.1 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.065, 0.02), frameMat), { position: new THREE.Vector3(0, 0.6, 0.32) }));
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x1a1a44, emissive: 0x2244aa, emissiveIntensity: 0.5, metalness: 0.95, roughness: 0.05 });
    for (const sx of [-0.08, 0.08]) {
      _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.01), lensMat), { position: new THREE.Vector3(sx, 0.6, 0.34) }));
    }
    // Hawaiian shirt — vibrant with palm pattern
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0xff4488, emissive: 0x882244, emissiveIntensity: 0.2 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.3), shirtMat), { position: new THREE.Vector3(0, 0.2, 0.05) }));
    // Open collar V
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xffdd00, emissiveIntensity: 0.1 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.01), collarMat), { position: new THREE.Vector3(-0.04, 0.3, 0.2), rotation: new THREE.Euler(0, 0, 0.2) }));
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.01), collarMat), { position: new THREE.Vector3(0.04, 0.3, 0.2), rotation: new THREE.Euler(0, 0, -0.2) }));
    // Flower details on shirt
    const flowerColors = [0x44ddff, 0xffff44, 0x44ff88, 0xff8844];
    for (let i = 0; i < 5; i++) {
      const fc = flowerColors[i % flowerColors.length];
      const fm = new THREE.MeshStandardMaterial({ color: fc, emissive: fc, emissiveIntensity: 0.5 });
      const fx = (i % 3 - 1) * 0.09, fy = 0.14 + (i * 0.04), fz = 0.2;
      _a(_mk(new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), fm), { position: new THREE.Vector3(fx, fy, fz) }));
    }
    // Pistol in waistband
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.06), gunMat), { position: new THREE.Vector3(0.15, 0.15, 0.1) }));

  } else if (name === 'claude') {
    // Full leather jacket — dark, menacing
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.15, metalness: 0.5 });
    // Jacket body
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.32), leatherMat), { position: new THREE.Vector3(0, 0.2, 0.04) }));
    // High collar
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.3), leatherMat), { position: new THREE.Vector3(0, 0.44, 0.05) }));
    // Popped collar tips
    for (const sx of [-0.16, 0.16]) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.04), leatherMat);
      tip.position.set(sx, 0.48, 0.15); tip.rotation.z = sx > 0 ? -0.35 : 0.35; _a(tip);
    }
    // Chrome zipper
    const zipMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.95, roughness: 0.05 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.22, 0.01), zipMat), { position: new THREE.Vector3(0, 0.2, 0.21) }));
    // Zipper pull
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.015), zipMat), { position: new THREE.Vector3(0, 0.32, 0.22) }));
    // Menacing shadow over eyes
    const shadowMat = new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.4 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.02), shadowMat), { position: new THREE.Vector3(0, 0.63, 0.3) }));
    // Stubble (tiny dots on chin)
    const stubbleMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    for (const [sx,sy] of [[-0.04,0.47],[0.04,0.47],[0,0.46],[-0.02,0.48],[0.02,0.48]]) {
      _a(_mk(new THREE.Mesh(new THREE.SphereGeometry(0.008, 4, 4), stubbleMat), { position: new THREE.Vector3(sx, sy, 0.33) }));
    }

  } else if (name === 'niko') {
    // Military cap with insignia
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const capMat = new THREE.MeshStandardMaterial({ color: 0x556644, roughness: 0.8 });
    _a(_mk(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 16), capMat), { position: new THREE.Vector3(0, 0.72, 0.12) }));
    _a(_mk(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.13, 16), capMat), { position: new THREE.Vector3(0, 0.8, 0.1) }));
    // Cap insignia (gold star)
    const insigniaMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, emissive: 0xaa8800, emissiveIntensity: 0.6 });
    _a(_mk(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), insigniaMat), { position: new THREE.Vector3(0, 0.82, 0.23) }));
    // Battle scars (two crossing)
    const scarMat = new THREE.MeshStandardMaterial({ color: 0xcc6644, emissive: 0x662222, emissiveIntensity: 0.4 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.15, 0.01), scarMat), { position: new THREE.Vector3(0.14, 0.58, 0.3), rotation: new THREE.Euler(0, 0, 0.3) }));
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08, 0.01), scarMat), { position: new THREE.Vector3(0.16, 0.56, 0.3), rotation: new THREE.Euler(0, 0, -0.4) }));
    // Dog tags on chain
    const tagMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.85, roughness: 0.15 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.055, 0.008), tagMat), { position: new THREE.Vector3(0.05, 0.28, 0.25) }));
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.055, 0.008), tagMat), { position: new THREE.Vector3(0.06, 0.26, 0.25), rotation: new THREE.Euler(0, 0, 0.15) }));
    // Military jacket
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x445533, roughness: 0.9 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.28), jacketMat), { position: new THREE.Vector3(0, 0.2, 0.04) }));
    // Ammo belt across chest
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.7 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.04), beltMat), { position: new THREE.Vector3(0.08, 0.25, 0.18), rotation: new THREE.Euler(0, 0, -0.4) }));
    // Brass ammo rounds on belt
    const ammoMat = new THREE.MeshStandardMaterial({ color: 0xddaa44, metalness: 0.8 });
    for (let i = 0; i < 4; i++) {
      _a(_mk(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.03, 4), ammoMat), { position: new THREE.Vector3(0.05 + i * 0.02, 0.22 + i * 0.04, 0.2), rotation: new THREE.Euler(0, 0, -0.4) }));
    }
    // Combat knife on back
    const knifeMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.2, 0.01), knifeMat), { position: new THREE.Vector3(-0.1, 0.35, -0.18), rotation: new THREE.Euler(0.2, 0, -0.1) }));

  } else if (name === 'catalina') {
    // Wild hair + red beret tilted
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x331100, roughness: 0.6 });
    // Wild hair strands
    for (const [hx,hy,hz,rx] of [[-0.12,0.72,-0.05,0.3],[0.12,0.72,-0.05,-0.3],[0,0.75,-0.08,0.4],[-0.08,0.73,0.02,0.1],[0.08,0.73,0.02,-0.1]]) {
      _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.03), hairMat), { position: new THREE.Vector3(hx,hy,hz), rotation: new THREE.Euler(rx,0,0) }));
    }
    // Red beret
    const beretMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0x881111, emissiveIntensity: 0.3 });
    _a(_mk(new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI*2, 0, Math.PI/2), beretMat), { position: new THREE.Vector3(0.04, 0.73, 0.1), rotation: new THREE.Euler(0, 0, 0.2) }));
    // Huge gold hoop earrings
    const earMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.95, roughness: 0.05, emissive: 0xaa8800, emissiveIntensity: 0.5 });
    for (const sx of [-0.23, 0.23]) {
      _a(_mk(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 8, 20), earMat), { position: new THREE.Vector3(sx, 0.47, 0.16) }));
    }
    // Red lipstick
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.02), new THREE.MeshStandardMaterial({ color: 0xff1111, emissive: 0xff1111, emissiveIntensity: 0.4 })), { position: new THREE.Vector3(0, 0.5, 0.36) }));
    // Leather crop top
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26), new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.3, metalness: 0.3 })), { position: new THREE.Vector3(0, 0.25, 0.05) }));
    // Belt with buckle
    const buckMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, emissive: 0x886600, emissiveIntensity: 0.3 });
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.28), new THREE.MeshStandardMaterial({ color: 0x222222 })), { position: new THREE.Vector3(0, 0.14, 0.05) }));
    _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), buckMat), { position: new THREE.Vector3(0, 0.14, 0.2) }));
    // Dual pistols on hips
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 });
    for (const sx of [-0.17, 0.17]) {
      _a(_mk(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.04), gunMat), { position: new THREE.Vector3(sx, 0.12, 0.12) }));
    }

  } else if (name === 'oz') {
    // Dark hoodie over head
    for (const h of defaultHat) { duckGroup.remove(h); characterAccessories.push(h); }
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x0a0a18 });
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI*2, 0, Math.PI*0.6), hoodMat);
    hood.position.set(0, 0.6, 0.06); duckGroup.add(hood); characterAccessories.push(hood);
    // Glowing cyber visor
    const cyberMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1.2 });
    const cyber = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.045, 0.04), cyberMat);
    cyber.position.set(0, 0.6, 0.33); duckGroup.add(cyber); characterAccessories.push(cyber);
    // Matrix-style code drip (small glowing dots)
    const dotMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1.5 });
    for (const [dx,dy] of [[-0.1,0.55],[0.08,0.53],[0.0,0.5],[-0.05,0.47],[0.12,0.48]]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 4), dotMat);
      dot.position.set(dx, dy, 0.34); duckGroup.add(dot); characterAccessories.push(dot);
    }
    // Green glow light
    const glow = new THREE.PointLight(0x00ff00, 0.8, 3);
    glow.position.set(0, 0.6, 0.4); duckGroup.add(glow); characterAccessories.push(glow);
    // Hoodie body
    const hoodBody = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.28), new THREE.MeshStandardMaterial({ color: 0x0a0a18 }));
    hoodBody.position.set(0, 0.2, 0.05); duckGroup.add(hoodBody); characterAccessories.push(hoodBody);
  }
  // Default (unknown names) keep the standard hat — no changes

  // (character ring added at top of function)
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

  // Seeded RNG for deterministic world objects (parked cars, dock posts, etc.)
  const _cityRng = _renderSeededRNG(_npcSeed + 7919);

  // Ground plane with procedural noise texture
  const groundGeo = new THREE.PlaneGeometry(MAP_SIZE + 4, MAP_SIZE + 4);
  const gtCanvas = document.createElement('canvas');
  gtCanvas.width = 256; gtCanvas.height = 256;
  const gtCtx = gtCanvas.getContext('2d');
  gtCtx.fillStyle = '#1a2a1a';
  gtCtx.fillRect(0, 0, 256, 256);
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const n = (Math.sin(px * 0.3) * Math.cos(py * 0.3) + Math.random() * 0.4) * 12;
      const r = 26 + n, g = 42 + n, b = 26 + n * 0.5;
      gtCtx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
      gtCtx.fillRect(px, py, 1, 1);
    }
  }
  const groundTex = new THREE.CanvasTexture(gtCanvas);
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(8, 8);
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 });
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
  const plazaPositions = [];
  const parkingPositions = [];
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
        // Buildings taller near city center (downtown skyline)
        const cx = MAP_SIZE / 2, cz = MAP_SIZE / 2;
        const distToCenter = Math.sqrt((x - cx) * (x - cx) + (y - cz) * (y - cz));
        const centerBonus = Math.max(0, 1 - distToCenter / (MAP_SIZE * 0.35));
        const height = 0.5 + heightSeed * 0.2 + centerBonus * 3.5;
        const matIdx = heightSeed % 8;
        buildingGroups.get(matIdx).push({ x: wx, z: wz, height });

        // Windows on buildings taller than 1.0
        if (height > 1.0) {
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
      } else if (tile === T.PLAZA) {
        plazaPositions.push({ x: wx, z: wz });
      } else if (tile === T.PARKING) {
        parkingPositions.push({ x: wx, z: wz });
      }

      if (POI_DEFS[tile]) {
        poiTiles.push({ x: wx, z: wz, tile, poi: POI_DEFS[tile] });
      }
    }
  }

  // ---- PASS 2: Create InstancedMeshes for flat tiles ----
  const dummy = new THREE.Object3D();
  const flatGeo = new THREE.BoxGeometry(1, 0.02, 1);

  // Shared asphalt texture for roads
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 64; asphaltCanvas.height = 64;
  const asCtx = asphaltCanvas.getContext('2d');
  asCtx.fillStyle = '#444';
  asCtx.fillRect(0, 0, 64, 64);
  for (let py = 0; py < 64; py++) for (let px = 0; px < 64; px++) {
    const n = (Math.random() - 0.5) * 20;
    asCtx.fillStyle = `rgb(${68+n|0},${68+n|0},${68+n|0})`;
    asCtx.fillRect(px, py, 1, 1);
  }
  const asphaltTex = new THREE.CanvasTexture(asphaltCanvas);
  asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
  asphaltTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // Road main
  if (roadMainPositions.length > 0) {
    const mat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9 });
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
    const mat = new THREE.MeshStandardMaterial({ map: asphaltTex.clone(), color: 0xdddddd, roughness: 0.9 });
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
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x2266aa, transparent: true, opacity: 0.6,
      roughness: 0.05, metalness: 0.1,
      transmission: 0.3, thickness: 0.5,
      envMap: _envMap, envMapIntensity: 0.8,
      depthWrite: false
    });
    const inst = new THREE.InstancedMesh(flatGeo, waterMat, waterPositions.length);
    inst.name = 'waterMesh';
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
      if (_cityRng() < 0.3) posts.push(pos);
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

  // Plaza (flat open spaces with subtle pattern)
  if (plazaPositions.length > 0) {
    const plazaMat = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.95 });
    const inst = new THREE.InstancedMesh(flatGeo, plazaMat, plazaPositions.length);
    inst.receiveShadow = true;
    inst.castShadow = false;
    plazaPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.015, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
  }

  // Parking lots (dark asphalt with line markings)
  if (parkingPositions.length > 0) {
    const parkingMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
    const inst = new THREE.InstancedMesh(flatGeo, parkingMat, parkingPositions.length);
    inst.receiveShadow = true;
    inst.castShadow = false;
    parkingPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.012, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(inst);
    // Parking space line markings
    const lineGeo = new THREE.BoxGeometry(0.04, 0.02, 0.6);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const lines = parkingPositions.filter((_, i) => i % 2 === 0);
    if (lines.length > 0) {
      const lineInst = new THREE.InstancedMesh(lineGeo, lineMat, lines.length);
      lineInst.castShadow = false;
      lines.forEach((pos, i) => {
        dummy.position.set(pos.x + 0.3, 0.02, pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        lineInst.setMatrixAt(i, dummy.matrix);
      });
      cityGroup.add(lineInst);
    }
  }

  // ---- Sidewalks along roads ----
  const sidewalkPositions = [];
  for (let y = 1; y < MAP_SIZE - 1; y++) {
    for (let x = 1; x < MAP_SIZE - 1; x++) {
      const t = currentMapGrid[y][x];
      if (t !== T.GROUND && t !== T.PLAZA && t !== T.SAND) continue;
      const adj = [currentMapGrid[y-1]?.[x], currentMapGrid[y+1]?.[x], currentMapGrid[y]?.[x-1], currentMapGrid[y]?.[x+1]];
      if (adj.some(a => a === T.ROAD_MAIN || a === T.ROAD_SIDE)) {
        sidewalkPositions.push({ x: x + 0.5, z: y + 0.5 });
      }
    }
  }
  if (sidewalkPositions.length > 0) {
    const swMat = new THREE.MeshStandardMaterial({ color: 0x999088, roughness: 0.95 });
    const swGeo = new THREE.BoxGeometry(1, 0.04, 1);
    const swInst = new THREE.InstancedMesh(swGeo, swMat, sidewalkPositions.length);
    swInst.receiveShadow = true; swInst.castShadow = false;
    sidewalkPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.02, pos.z);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); swInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(swInst);
    // Curb strips (thin raised edge between sidewalk and road)
    const curbGeo = new THREE.BoxGeometry(1, 0.06, 0.08);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xaaa898 });
    const curbCount = Math.min(sidewalkPositions.length, 800);
    const curbInst = new THREE.InstancedMesh(curbGeo, curbMat, curbCount);
    curbInst.castShadow = false;
    for (let i = 0; i < curbCount; i++) {
      dummy.position.set(sidewalkPositions[i].x, 0.05, sidewalkPositions[i].z + 0.46);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); curbInst.setMatrixAt(i, dummy.matrix);
    }
    cityGroup.add(curbInst);
  }

  // ---- Crosswalks at road intersections ----
  const crosswalkPositions = [];
  for (let y = 2; y < MAP_SIZE - 2; y++) {
    for (let x = 2; x < MAP_SIZE - 2; x++) {
      if (currentMapGrid[y][x] !== T.ROAD_MAIN) continue;
      // Intersection: road in all 4 directions
      const n = currentMapGrid[y-1]?.[x], s = currentMapGrid[y+1]?.[x];
      const w = currentMapGrid[y]?.[x-1], e = currentMapGrid[y]?.[x+1];
      const isRoadTile = t => t === T.ROAD_MAIN || t === T.ROAD_SIDE;
      if (isRoadTile(n) && isRoadTile(s) && isRoadTile(w) && isRoadTile(e)) {
        crosswalkPositions.push({ x: x + 0.5, z: y + 0.5 });
      }
    }
  }
  if (crosswalkPositions.length > 0) {
    const cwGeo = new THREE.BoxGeometry(0.6, 0.025, 0.08);
    const cwMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const stripes = Math.min(crosswalkPositions.length * 4, 2000);
    const cwInst = new THREE.InstancedMesh(cwGeo, cwMat, stripes);
    cwInst.castShadow = false;
    let ci = 0;
    for (const pos of crosswalkPositions) {
      for (let s = -2; s <= 1; s++) {
        if (ci >= stripes) break;
        dummy.position.set(pos.x, 0.025, pos.z + s * 0.15);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix(); cwInst.setMatrixAt(ci++, dummy.matrix);
      }
    }
    cwInst.count = ci;
    cityGroup.add(cwInst);
  }

  // ---- Park benches ----
  const benchSpots = parkPositions.filter((_, i) => i % 18 === 0);
  if (benchSpots.length > 0) {
    const benchSeatGeo = new THREE.BoxGeometry(0.5, 0.04, 0.18);
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x664422, roughness: 0.9 });
    const benchBackGeo = new THREE.BoxGeometry(0.5, 0.2, 0.03);
    const seatInst = new THREE.InstancedMesh(benchSeatGeo, benchMat, benchSpots.length);
    const backInst = new THREE.InstancedMesh(benchBackGeo, benchMat, benchSpots.length);
    seatInst.castShadow = true; backInst.castShadow = true;
    benchSpots.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.18, pos.z);
      dummy.rotation.set(0, (i * 37) % 4 * Math.PI / 2, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); seatInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(pos.x, 0.3, pos.z - 0.08);
      dummy.updateMatrix(); backInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(seatInst);
    cityGroup.add(backInst);
  }

  // ---- Fountain in plazas ----
  const fountainSpots = plazaPositions.filter((_, i) => i % 25 === 0);
  for (const pos of fountainSpots) {
    const basinGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.15, 12);
    const basinMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.3 });
    const basin = new THREE.Mesh(basinGeo, basinMat);
    basin.position.set(pos.x, 0.1, pos.z);
    basin.castShadow = true;
    cityGroup.add(basin);
    const waterGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.04, 12);
    const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x4488cc, transparent: true, opacity: 0.5, roughness: 0.05 });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(pos.x, 0.14, pos.z);
    cityGroup.add(water);
    const spoutGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6);
    const spout = new THREE.Mesh(spoutGeo, basinMat);
    spout.position.set(pos.x, 0.35, pos.z);
    spout.castShadow = true;
    cityGroup.add(spout);
  }

  // ---- Hedge rows in parks ----
  const hedgeSpots = parkPositions.filter((p, i) => {
    if (i % 8 !== 0) return false;
    const gx = Math.floor(p.x), gz = Math.floor(p.z);
    return gx > 1 && gx < MAP_SIZE - 1 && currentMapGrid[gz]?.[gx] === T.PARK;
  });
  if (hedgeSpots.length > 0) {
    const hedgeGeo = new THREE.BoxGeometry(0.9, 0.25, 0.3);
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x1a5522, roughness: 0.9 });
    const hedgeInst = new THREE.InstancedMesh(hedgeGeo, hedgeMat, hedgeSpots.length);
    hedgeInst.castShadow = true;
    hedgeSpots.forEach((pos, i) => {
      dummy.position.set(pos.x, 0.14, pos.z);
      dummy.rotation.set(0, (i % 2) * Math.PI / 2, 0);
      dummy.scale.set(1, 0.8 + (i % 3) * 0.2, 1);
      dummy.updateMatrix(); hedgeInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(hedgeInst);
  }

  // ---- Buildings: InstancedMesh per material group ----
  const buildingMats = [];
  for (let i = 0; i < 8; i++) {
    const shade = 40 + i * 12;
    const hue = [10, 8, 12, 6, 15, 5, 20, 10][i]; // varied warm/cool tints
    buildingMats.push(new THREE.MeshStandardMaterial({ color: new THREE.Color(`rgb(${shade+hue},${shade+hue-2},${shade+20})`), roughness: 0.85, metalness: 0.05 }));
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

  // ---- Windows: InstancedMesh with variation (some dark) ----
  if (windowPositions.length > 0) {
    const winGeo = new THREE.BoxGeometry(0.06, 0.06, 0.01);
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffcc44, emissiveIntensity: 0.8 });
    const inst = new THREE.InstancedMesh(winGeo, winMat, windowPositions.length);
    inst.castShadow = false;
    const litColor = new THREE.Color(0xffeeaa);
    const darkColor = new THREE.Color(0x222233);
    windowPositions.forEach((w, i) => {
      dummy.position.set(w.x, w.y, w.z);
      dummy.rotation.set(0, w.rotated ? Math.PI / 2 : 0, 0);
      // ~35% of windows are dark — seeded by position for consistency
      const isLit = ((w.x * 17 + w.y * 31 + w.z * 7) | 0) % 100 > 35;
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, isLit ? litColor : darkColor);
    });
    inst.instanceColor.needsUpdate = true;
    cityGroup.add(inst);
  }

  // ---- Rooftop details: AC units, antennas on taller buildings ----
  const rooftopPositions = [];
  const antennaPositions = [];
  for (let matIdx = 0; matIdx < 8; matIdx++) {
    for (const b of buildingGroups.get(matIdx)) {
      if (b.height > 1.2 && ((b.x * 7 + b.z * 11) | 0) % 3 === 0) {
        rooftopPositions.push({ x: b.x + 0.15, y: b.height + 0.05, z: b.z + 0.15 });
      }
      if (b.height > 1.5 && ((b.x * 13 + b.z * 3) | 0) % 5 === 0) {
        antennaPositions.push({ x: b.x, y: b.height, z: b.z });
      }
    }
  }
  if (rooftopPositions.length > 0) {
    const acGeo = new THREE.BoxGeometry(0.18, 0.1, 0.18);
    const acMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.3 });
    const acInst = new THREE.InstancedMesh(acGeo, acMat, rooftopPositions.length);
    acInst.castShadow = false;
    rooftopPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); acInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(acInst);
  }
  if (antennaPositions.length > 0) {
    const antGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4);
    const antMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7 });
    const antInst = new THREE.InstancedMesh(antGeo, antMat, antennaPositions.length);
    antInst.castShadow = false;
    antennaPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.y + 0.25, pos.z);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); antInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(antInst);
    // Red beacon lights on antennas
    const beaconGeo = new THREE.SphereGeometry(0.025, 4, 4);
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0 });
    const beaconInst = new THREE.InstancedMesh(beaconGeo, beaconMat, antennaPositions.length);
    beaconInst.castShadow = false;
    antennaPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.y + 0.5, pos.z);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); beaconInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(beaconInst);
  }

  // ---- Building ground-floor details: doors, awnings, facade ledges ----
  const doorPositions = [];
  const awningPositions = [];
  const ledgePositions = [];
  const waterTankPositions = [];
  for (let matIdx = 0; matIdx < 8; matIdx++) {
    for (const b of buildingGroups.get(matIdx)) {
      const seed = (b.x * 7 + b.z * 11) | 0;
      // Door on road-facing side
      const gx = Math.floor(b.x), gz = Math.floor(b.z);
      if (gx > 0 && gx < MAP_SIZE - 1 && gz > 0 && gz < MAP_SIZE - 1) {
        const adjTiles = [
          { dx: 0, dz: 1, side: 'z+' }, { dx: 0, dz: -1, side: 'z-' },
          { dx: 1, dz: 0, side: 'x+' }, { dx: -1, dz: 0, side: 'x-' }
        ];
        for (const { dx, dz, side } of adjTiles) {
          const at = currentMapGrid[gz + dz]?.[gx + dx];
          if (at === T.ROAD_MAIN || at === T.ROAD_SIDE || at === T.PLAZA) {
            doorPositions.push({ x: b.x + dx * 0.45, z: b.z + dz * 0.45, side });
            if (seed % 3 === 0) {
              awningPositions.push({ x: b.x + dx * 0.45, z: b.z + dz * 0.45, side });
            }
            break;
          }
        }
      }
      // Facade ledge at mid-height on taller buildings
      if (b.height > 1.5 && seed % 2 === 0) {
        ledgePositions.push({ x: b.x, y: b.height * 0.5, z: b.z });
      }
      // Water tanks on tall buildings
      if (b.height > 3.0 && seed % 4 === 0) {
        waterTankPositions.push({ x: b.x - 0.15, y: b.height + 0.15, z: b.z - 0.15 });
      }
    }
  }

  // Doors
  if (doorPositions.length > 0) {
    const doorGeo = new THREE.BoxGeometry(0.18, 0.3, 0.02);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x443322, roughness: 0.8 });
    const doorInst = new THREE.InstancedMesh(doorGeo, doorMat, doorPositions.length);
    doorInst.castShadow = false;
    doorPositions.forEach((pos, i) => {
      const rotY = (pos.side === 'x+' || pos.side === 'x-') ? Math.PI / 2 : 0;
      dummy.position.set(pos.x, 0.16, pos.z);
      dummy.rotation.set(0, rotY, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); doorInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(doorInst);
  }

  // Awnings (colored overhangs above doors)
  if (awningPositions.length > 0) {
    const awnGeo = new THREE.BoxGeometry(0.3, 0.02, 0.15);
    const awnColors = [0xcc2222, 0x2255aa, 0x22aa44, 0xccaa22, 0xaa4488, 0xff6600];
    const awnMat = new THREE.MeshStandardMaterial({ color: 0xcc2222 });
    const awnInst = new THREE.InstancedMesh(awnGeo, awnMat, awningPositions.length);
    awnInst.castShadow = true;
    awningPositions.forEach((pos, i) => {
      const dx = pos.side === 'x+' ? 0.08 : pos.side === 'x-' ? -0.08 : 0;
      const dz = pos.side === 'z+' ? 0.08 : pos.side === 'z-' ? -0.08 : 0;
      const rotY = (pos.side === 'x+' || pos.side === 'x-') ? Math.PI / 2 : 0;
      dummy.position.set(pos.x + dx, 0.35, pos.z + dz);
      dummy.rotation.set(0, rotY, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); awnInst.setMatrixAt(i, dummy.matrix);
      awnInst.setColorAt(i, new THREE.Color(awnColors[i % awnColors.length]));
    });
    awnInst.instanceColor.needsUpdate = true;
    cityGroup.add(awnInst);
  }

  // Facade ledges (horizontal trim on building face)
  if (ledgePositions.length > 0) {
    const ledgeGeo = new THREE.BoxGeometry(0.95, 0.03, 0.95);
    const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x888078, roughness: 0.7 });
    const ledgeInst = new THREE.InstancedMesh(ledgeGeo, ledgeMat, ledgePositions.length);
    ledgeInst.castShadow = false;
    ledgePositions.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.y, pos.z);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); ledgeInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(ledgeInst);
  }

  // Water tanks on rooftops
  if (waterTankPositions.length > 0) {
    const tankGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x666655, roughness: 0.8 });
    const tankInst = new THREE.InstancedMesh(tankGeo, tankMat, waterTankPositions.length);
    tankInst.castShadow = true;
    // Tank legs
    const legGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 4);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 });
    const legInst = new THREE.InstancedMesh(legGeo, legMat, waterTankPositions.length * 4);
    legInst.castShadow = false;
    waterTankPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, pos.y + 0.06, pos.z);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); tankInst.setMatrixAt(i, dummy.matrix);
      // 4 legs
      for (let l = 0; l < 4; l++) {
        const lx = pos.x + (l < 2 ? -0.06 : 0.06);
        const lz = pos.z + (l % 2 === 0 ? -0.06 : 0.06);
        dummy.position.set(lx, pos.y - 0.06, lz);
        dummy.updateMatrix(); legInst.setMatrixAt(i * 4 + l, dummy.matrix);
      }
    });
    cityGroup.add(tankInst);
    cityGroup.add(legInst);
  }

  // ---- Trees: 2 InstancedMeshes (trunk + canopy) ----
  if (treePositions.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x553311 });
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    trunkInst.castShadow = true;
    treePositions.forEach((pos, i) => {
      const sc = 0.7 + ((pos.x * 17 + pos.z * 31) % 10) * 0.08;
      dummy.position.set(pos.x, 0.25 * sc, pos.z);
      dummy.rotation.set(0, ((pos.x * 7 + pos.z * 13) % 100) * 0.06, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
    });
    cityGroup.add(trunkInst);

    // Varied canopy — mix of round and cone shapes
    const canopyGeo = new THREE.SphereGeometry(0.3, 8, 6);
    const canopyColors = [0x228833, 0x1a7a2a, 0x2a9944, 0x336622, 0x1a6633];
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x228833, roughness: 0.8 });
    const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treePositions.length);
    canopyInst.castShadow = true;
    treePositions.forEach((pos, i) => {
      const sc = 0.7 + ((pos.x * 17 + pos.z * 31) % 10) * 0.08;
      const stretch = 0.8 + ((pos.x * 11 + pos.z * 23) % 10) * 0.05;
      dummy.position.set(pos.x, 0.55 * sc + 0.1, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(sc * stretch, sc * 1.1, sc / stretch);
      dummy.updateMatrix();
      canopyInst.setMatrixAt(i, dummy.matrix);
      // Vary color per instance
      const col = canopyColors[(i * 7) % canopyColors.length];
      canopyInst.setColorAt(i, new THREE.Color(col));
    });
    canopyInst.instanceColor.needsUpdate = true;
    cityGroup.add(canopyInst);
  }

  // ---- POI markers (individual meshes — small count, need animation) ----
  for (const { x: wx, z: wz, tile, poi } of poiTiles) {
    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: poi.colorHex, emissive: poi.colorHex, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.7, depthWrite: false
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
      if (_cityRng() > 0.06) continue;
      const adjWall = [[1,0],[-1,0],[0,1],[0,-1]].some(([ox,oz]) => {
        const t = currentMapGrid[y+oz]?.[x+ox];
        return t === T.WALL;
      });
      if (!adjWall) continue;
      const wx = x + 0.5, wz = y + 0.5;
      const colorIdx = Math.floor(_cityRng() * carColors.length);
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

  // NPC cars on main roads (stealable) — seeded for multiplayer sync
  const _carRng = _renderSeededRNG(_npcSeed + 1337);
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
  const npcCarCount = Math.min(30, Math.floor(mainRoadTiles.length / 20));
  for (let i = 0; i < npcCarCount; i++) {
    const rt = mainRoadTiles[Math.floor(_carRng() * mainRoadTiles.length)];
    const colorIdx = Math.floor(_carRng() * npcCarColors.length);
    const color = npcCarColors[colorIdx];
    const vName = npcCarNames[colorIdx];
    // Offset cars to one side of the road so player can pass
    const laneOffset = (_carRng() < 0.5 ? 0.25 : -0.25);
    const wx = rt.x + 0.5 + (_carRng() < 0.5 ? laneOffset : 0);
    const wz = rt.y + 0.5 + (_carRng() < 0.5 ? 0 : laneOffset);
    const carGroup = new THREE.Group();
    // Wider/sportier body
    const bodyW = 0.3 + _carRng() * 0.15;
    const bodyL = 0.6 + _carRng() * 0.2;
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
    const driveAxis = _carRng() < 0.5 ? 'x' : 'z';
    const driveDir = _carRng() < 0.5 ? 1 : -1;
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
      speed: 0.5 + _carRng() * 0.8,
      startX: wx, startZ: wz,
      driveAxis,
      driveDist: 20 + _carRng() * 40,
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

// Seeded PRNG (mulberry32) for deterministic NPC spawning across peers
function _renderSeededRNG(seed) {
  let s = seed | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------
//  NPC PEDESTRIANS
// --------------------------------------------------------
let _npcSeed = 42;
export function setNPCSeed(seed) { _npcSeed = seed; }
export function spawnNPCs() {
  for (const npc of npcs) { scene.remove(npc.group); }
  npcs = [];
  if (!currentMapGrid) { console.warn('spawnNPCs: no map grid'); return; }

  // Use seeded RNG so all multiplayer peers get identical NPC placement
  const rng = _renderSeededRNG(_npcSeed);

  const npcColors = [0xcc4444, 0x4444cc, 0x44cc44, 0xcccc44, 0xcc44cc, 0x44cccc, 0xff8844, 0x884422, 0xffffff, 0x888888];
  const roadTiles = [];
  for (let y = 3; y < MAP_SIZE - 3; y++) {
    for (let x = 3; x < MAP_SIZE - 3; x++) {
      if (currentMapGrid[y][x] === T.ROAD_MAIN || currentMapGrid[y][x] === T.ROAD_SIDE) roadTiles.push({x, y});
    }
  }

  const count = Math.max(60, Math.min(120, Math.floor(roadTiles.length / 15)));
  console.log(`spawnNPCs: ${roadTiles.length} road tiles, spawning ${count} NPCs (seed: ${_npcSeed})`);
  const skinTones = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x6b4226];
  const shirtColors = [0xcc4444, 0x4444cc, 0x44cc44, 0xcccc44, 0xcc44cc, 0x44cccc, 0xff8844, 0xffffff, 0x222222, 0xff6699, 0x6644aa, 0x44aa88];
  const pantColors = [0x222244, 0x333333, 0x443322, 0x224422, 0x111111, 0x444466];
  const shoeColors = [0x111111, 0x333333, 0x442211, 0x882222, 0xffffff];
  const hairColors = [0x332211, 0x663311, 0x111111, 0xaa6633, 0xcc8844, 0xeecc88];
  const hatStyles = ['none', 'none', 'none', 'none', 'cap', 'cap', 'beanie', 'glasses', 'bandana'];
  const hatColors = [0x222222, 0xcc2222, 0x2222cc, 0x22aa22, 0xffd700, 0xff6600, 0x8822aa];
  const accessoryTypes = ['none', 'none', 'backpack', 'bag', 'phone'];

  for (let i = 0; i < count; i++) {
    const rt = roadTiles[Math.floor(rng() * roadTiles.length)];
    const shirt = shirtColors[Math.floor(rng() * shirtColors.length)];
    const pants = pantColors[Math.floor(rng() * pantColors.length)];
    const skin = skinTones[Math.floor(rng() * skinTones.length)];
    const hairCol = hairColors[Math.floor(rng() * hairColors.length)];
    const shoeCol = shoeColors[Math.floor(rng() * shoeColors.length)];
    const isFemale = rng() < 0.4;
    const isTall = rng() < 0.3;
    const scale = isTall ? 1.15 : (0.85 + rng() * 0.3);
    const group = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.7 });
    const pantMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.8 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: shoeCol, roughness: 0.6 });

    // --- HEAD (box) ---
    const headW = 0.12, headH = 0.12, headD = 0.12;
    const head = new THREE.Mesh(new THREE.BoxGeometry(headW, headH, headD), skinMat);
    head.position.y = 0.56;
    head.castShadow = true;
    head.name = 'npcHead';
    group.add(head);

    // Eyes (two tiny dark boxes on face)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.01), eyeMat);
    eyeL.position.set(-0.03, 0.57, 0.065);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.01), eyeMat);
    eyeR.position.set(0.03, 0.57, 0.065);
    group.add(eyeR);

    // Hair (box on top/back of head)
    const hairMat = new THREE.MeshStandardMaterial({ color: hairCol, roughness: 0.9 });
    if (isFemale) {
      // Long hair — extends down back
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.08), hairMat);
      hair.position.set(0, 0.56, -0.06);
      group.add(hair);
    } else {
      // Short hair — flat on top
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.13), hairMat);
      hair.position.set(0, 0.635, 0);
      group.add(hair);
    }

    // --- TORSO (box) ---
    const torsoW = isFemale ? 0.13 : 0.15;
    const torsoH = 0.16;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, 0.1), shirtMat);
    torso.position.y = 0.42;
    torso.castShadow = true;
    torso.name = 'npcBody';
    group.add(torso);

    // --- ARMS (thin boxes, angled slightly out) ---
    const armGeo = new THREE.BoxGeometry(0.05, 0.18, 0.05);
    const armL = new THREE.Mesh(armGeo, skinMat);
    armL.position.set(-torsoW / 2 - 0.03, 0.4, 0);
    armL.rotation.z = 0.1;
    armL.name = 'armL';
    group.add(armL);
    const armR = new THREE.Mesh(armGeo, skinMat);
    armR.position.set(torsoW / 2 + 0.03, 0.4, 0);
    armR.rotation.z = -0.1;
    armR.name = 'armR';
    group.add(armR);

    // --- LEGS (box) ---
    const legGeo = new THREE.BoxGeometry(0.06, 0.2, 0.06);
    const legL = new THREE.Mesh(legGeo, pantMat);
    legL.position.set(-0.04, 0.2, 0);
    legL.name = 'legL';
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, pantMat);
    legR.position.set(0.04, 0.2, 0);
    legR.name = 'legR';
    group.add(legR);

    // --- SHOES (small boxes at feet) ---
    const shoeGeo = new THREE.BoxGeometry(0.065, 0.03, 0.09);
    const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
    shoeL.position.set(-0.04, 0.1, 0.01);
    group.add(shoeL);
    const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
    shoeR.position.set(0.04, 0.1, 0.01);
    group.add(shoeR);

    // --- HAT / ACCESSORY ---
    const hatStyle = hatStyles[Math.floor(rng() * hatStyles.length)];
    const hatCol = hatColors[Math.floor(rng() * hatColors.length)];
    if (hatStyle === 'cap') {
      const capMat = new THREE.MeshStandardMaterial({ color: hatCol });
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.015, 0.08), capMat);
      brim.position.set(0, 0.625, 0.04);
      group.add(brim);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.12), capMat);
      crown.position.set(0, 0.65, 0);
      group.add(crown);
    } else if (hatStyle === 'beanie') {
      const bMat = new THREE.MeshStandardMaterial({ color: hatCol });
      const beanie = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.13), bMat);
      beanie.position.set(0, 0.65, 0);
      group.add(beanie);
    } else if (hatStyle === 'glasses') {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x222244, metalness: 0.8 });
      const glassL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.01), glassMat);
      glassL.position.set(-0.03, 0.57, 0.07);
      group.add(glassL);
      const glassR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.01), glassMat);
      glassR.position.set(0.03, 0.57, 0.07);
      group.add(glassR);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.01), glassMat);
      bridge.position.set(0, 0.57, 0.07);
      group.add(bridge);
    } else if (hatStyle === 'bandana') {
      const bMat = new THREE.MeshStandardMaterial({ color: hatCol });
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.14), bMat);
      band.position.set(0, 0.61, 0);
      group.add(band);
    }

    // --- BACKPACK / BAG ---
    const accessory = accessoryTypes[Math.floor(rng() * accessoryTypes.length)];
    if (accessory === 'backpack') {
      const bpMat = new THREE.MeshStandardMaterial({ color: [0x444444, 0x884422, 0x224488, 0x228844][Math.floor(rng() * 4)] });
      const bp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.06), bpMat);
      bp.position.set(0, 0.42, -0.08);
      group.add(bp);
    } else if (accessory === 'bag') {
      const bagMat = new THREE.MeshStandardMaterial({ color: [0x886644, 0x444444, 0xcc8844][Math.floor(rng() * 3)] });
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.04), bagMat);
      bag.position.set(torsoW / 2 + 0.05, 0.35, 0);
      group.add(bag);
    } else if (accessory === 'phone') {
      const phoneMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x4488ff, emissiveIntensity: 0.3 });
      const phone = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.01), phoneMat);
      phone.position.set(torsoW / 2 + 0.04, 0.45, 0.04);
      group.add(phone);
    }

    // Apply height scale
    group.scale.set(1, scale, 1);

    // Hostile/friendly marker
    const isHostile = rng() < 0.25;
    const markerColor = isHostile ? 0xff4444 : 0x44ff44;
    const markerMat = new THREE.MeshStandardMaterial({ color: markerColor, emissive: markerColor, emissiveIntensity: 1.0 });
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), markerMat);
    marker.position.y = 0.72;
    group.add(marker);

    group.position.set(rt.x + 0.5, 0, rt.y + 0.5);
    scene.add(group);

    const dir = rng() < 0.5 ? 'x' : 'z';
    const speed = 0.3 + rng() * 0.4;
    const facing = rng() < 0.5 ? 1 : -1;
    group.rotation.y = dir === 'x' ? (facing > 0 ? Math.PI / 2 : -Math.PI / 2) : (facing > 0 ? 0 : Math.PI);

    npcs.push({
      group, dir, speed, facing, id: i,
      startX: rt.x + 0.5, startZ: rt.y + 0.5,
      walkDist: 3 + rng() * 6,
      walked: 0, phase: rng() * Math.PI * 2,
      hostile: isHostile,
      // Cached child references (avoid per-frame getObjectByName)
      _legL: legL, _legR: legR, _armL: armL, _armR: armR, _body: torso, _head: head
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
  const npcId = npc.id;
  scene.remove(npc.group);
  npc.group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); });
  const idx = npcs.indexOf(npc);
  if (idx >= 0) npcs.splice(idx, 1);
  return { ...pos, id: npcId };
}

export function killNPCById(npcId) {
  const npc = npcs.find(n => n.id === npcId);
  if (npc) return killNPC(npc);
  return null;
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

export function fireProjectile(targetX, targetZ, srcX, srcZ, color) {
  const startX = srcX != null ? srcX : (duckGroup ? duckGroup.position.x : 0);
  const startZ = srcZ != null ? srcZ : (duckGroup ? duckGroup.position.z : 0);
  const startY = 0.45;
  const bulletColor = color || 0xffff00;

  const dx = targetX - startX;
  const dz = targetZ - startZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;
  const nx = dx / dist;
  const nz = dz / dist;
  const speed = 18;

  // Main bullet — bright glowing orb
  const bulletGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const bulletMat = new THREE.MeshBasicMaterial({ color: bulletColor, transparent: true, opacity: 1 });
  const bullet = new THREE.Mesh(bulletGeo, bulletMat);
  bullet.position.set(startX + nx * 0.5, startY, startZ + nz * 0.5);
  scene.add(bullet);

  // Bullet glow light
  const bulletLight = new THREE.PointLight(bulletColor, 2, 3);
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
let _nextPoliceId = 0;

export function spawnPoliceNPC(nearX, nearZ, inVehicle = false) {
  const group = new THREE.Group();

  if (inVehicle) {
    // Police car — black & white cruiser with siren bar
    const carBody = new THREE.BoxGeometry(0.55, 0.25, 0.9);
    const carMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.5 });
    const body = new THREE.Mesh(carBody, carMat);
    body.position.y = 0.15;
    body.castShadow = true;
    group.add(body);
    // White door panels
    const panelGeo = new THREE.BoxGeometry(0.56, 0.12, 0.35);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 0.17, -0.05);
    group.add(panel);
    // Cabin
    const topGeo = new THREE.BoxGeometry(0.42, 0.18, 0.45);
    const topMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.set(0, 0.33, -0.05);
    group.add(top);
    // Siren bar (red + blue)
    const barGeo = new THREE.BoxGeometry(0.35, 0.04, 0.08);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(0, 0.44, -0.05);
    group.add(bar);
    const sRed = new THREE.SphereGeometry(0.03, 6, 6);
    const sRedMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.5 });
    const sirenR = new THREE.Mesh(sRed, sRedMat);
    sirenR.position.set(-0.1, 0.46, -0.05);
    sirenR.name = 'siren';
    group.add(sirenR);
    const sBlueMat = new THREE.MeshStandardMaterial({ color: 0x0044ff, emissive: 0x0044ff, emissiveIntensity: 1.5 });
    const sirenB = new THREE.Mesh(sRed, sBlueMat);
    sirenB.position.set(0.1, 0.46, -0.05);
    sirenB.name = 'siren2';
    group.add(sirenB);
    // Wheels
    const wGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8);
    const wMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (const [sx, sz] of [[-0.28, -0.3], [0.28, -0.3], [-0.28, 0.3], [0.28, 0.3]]) {
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx, 0.07, sz);
      group.add(w);
    }
    // Headlights
    const hlGeo = new THREE.SphereGeometry(0.035, 6, 6);
    const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 1.0 });
    for (const sx of [-0.17, 0.17]) {
      const hl = new THREE.Mesh(hlGeo, hlMat);
      hl.position.set(sx, 0.15, 0.45);
      group.add(hl);
    }
  } else {
    // Foot cop — existing design
    const bodyGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.38, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2233aa, roughness: 0.7 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.3;
    body.castShadow = true;
    group.add(body);
    const headGeo = new THREE.SphereGeometry(0.08, 8, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xddaa77, roughness: 0.6 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.57;
    group.add(head);
    const capGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.04, 8);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x111155 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 0.65;
    group.add(cap);
    const badgeGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const badgeMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.8 });
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.position.set(0, 0.4, 0.1);
    group.add(badge);
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
    const sirenGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const sirenMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0 });
    const siren = new THREE.Mesh(sirenGeo, sirenMat);
    siren.position.y = 0.7;
    siren.name = 'siren';
    group.add(siren);
  }

  // Spawn further from player so they're visible approaching
  const angle = Math.random() * Math.PI * 2;
  const dist = 10 + Math.random() * 5;
  group.position.set(nearX + Math.cos(angle) * dist, 0, nearZ + Math.sin(angle) * dist);

  const legL = group.getObjectByName('legL');
  const legR = group.getObjectByName('legR');
  const siren = group.getObjectByName('siren');
  const siren2 = group.getObjectByName('siren2');

  scene.add(group);
  const id = _nextPoliceId++;
  const cop = {
    group, id, phase: Math.random() * Math.PI * 2,
    speed: inVehicle ? 1.8 + Math.random() * 0.5 : 0.8 + Math.random() * 0.5,
    health: inVehicle ? 150 : 100, alive: true, inVehicle,
    nextShootTime: performance.now() + 3000 + Math.random() * 3000,
    lastMeleeTime: 0,
    _legL: legL, _legR: legR, _siren: siren, _siren2: siren2
  };
  policeNPCs.push(cop);
  return cop;
}

// Spawn police at exact position (for multiplayer sync from host)
export function spawnPoliceNPCAt(x, z, inVehicle, copId) {
  const cop = spawnPoliceNPC(0, 0, inVehicle);
  cop.group.position.set(x, 0, z);
  cop.id = copId;
  return cop;
}

export function killPoliceById(copId) {
  const cop = policeNPCs.find(c => c.id === copId);
  if (cop) {
    const pos = { x: cop.group.position.x, z: cop.group.position.z };
    cop.alive = false;
    removePoliceNPC(cop);
    return pos;
  }
  return null;
}

// Get nearest police car for stealing
export function getNearestPoliceCar(maxDist = 2) {
  if (!duckGroup) return null;
  let best = null, bestDist = maxDist;
  for (const cop of policeNPCs) {
    if (!cop.alive || !cop.inVehicle) continue;
    const dx = cop.group.position.x - duckGroup.position.x;
    const dz = cop.group.position.z - duckGroup.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) { best = cop; bestDist = dist; }
  }
  return best;
}

export function clearPoliceNPCs() {
  for (const cop of policeNPCs) {
    scene.remove(cop.group);
    cop.group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); });
  }
  policeNPCs = [];
}

export function getPoliceNPCs() { return policeNPCs; }

// Callback for police attacks (set by game.js)
let _onPoliceAttack = null;
export function setPoliceAttackCallback(fn) { _onPoliceAttack = fn; }

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

// Vehicle visual configs by name pattern
const VEHICLE_STYLES = {
  'Motorcycle':     { color: 0x222222, bodyW: 0.25, bodyH: 0.2, bodyL: 0.7, topW: 0, noTop: true, wheelR: 0.08 },
  'Dirt Bike':      { color: 0x886622, bodyW: 0.25, bodyH: 0.2, bodyL: 0.7, topW: 0, noTop: true, wheelR: 0.09 },
  'Pickup Truck':   { color: 0x445588, bodyW: 0.55, bodyH: 0.3, bodyL: 1.0, topW: 0.4, topL: 0.35, topOff: 0.15 },
  'Monster Truck':  { color: 0x338833, bodyW: 0.6, bodyH: 0.35, bodyL: 1.0, topW: 0.45, topL: 0.4, wheelR: 0.14, liftY: 0.1 },
  'Tank':           { color: 0x556644, bodyW: 0.7, bodyH: 0.3, bodyL: 1.1, topW: 0.35, topL: 0.35, wheelR: 0.06, barrel: true },
  'Helicopter':     { color: 0x888888, bodyW: 0.5, bodyH: 0.35, bodyL: 0.9, topW: 0.4, topL: 0.5, noWheels: true, rotor: true, liftY: 0.5 },
  'Race Car':       { color: 0xcc0000, bodyW: 0.48, bodyH: 0.18, bodyL: 0.9, topW: 0.3, topL: 0.3, topH: 0.12, low: true },
  'Lamborduckni':   { color: 0xffcc00, bodyW: 0.5, bodyH: 0.16, bodyL: 0.95, topW: 0.35, topL: 0.35, topH: 0.12, low: true },
  'Sports Car':     { color: 0xdd2200, bodyW: 0.48, bodyH: 0.2, bodyL: 0.85, topW: 0.34, topL: 0.35, topH: 0.14 },
  'Muscle Car':     { color: 0x333333, bodyW: 0.52, bodyH: 0.25, bodyL: 0.9, topW: 0.38, topL: 0.4 },
  'SUV':            { color: 0x224466, bodyW: 0.55, bodyH: 0.35, bodyL: 0.9, topW: 0.48, topL: 0.55, wheelR: 0.09 },
  'Gold Plated SUV':{ color: 0xddaa00, bodyW: 0.55, bodyH: 0.35, bodyL: 0.9, topW: 0.48, topL: 0.55, wheelR: 0.09, metalness: 0.9 },
  'Lowrider':       { color: 0x660066, bodyW: 0.5, bodyH: 0.22, bodyL: 0.85, topW: 0.38, topL: 0.4, low: true },
  'Luxury Sedan':   { color: 0x111111, bodyW: 0.5, bodyH: 0.25, bodyL: 0.9, topW: 0.4, topL: 0.5, metalness: 0.7 },
  'Armored Limo':   { color: 0x111111, bodyW: 0.5, bodyH: 0.28, bodyL: 1.1, topW: 0.42, topL: 0.6, metalness: 0.6 },
  'Delivery Van':   { color: 0xeeeeee, bodyW: 0.55, bodyH: 0.4, bodyL: 0.9, topW: 0.52, topL: 0.7, topH: 0.35 },
  'Taxi Cab':       { color: 0xddcc00, bodyW: 0.5, bodyH: 0.25, bodyL: 0.8, topW: 0.4, topL: 0.45 },
  'Convertible':    { color: 0xcc4444, bodyW: 0.48, bodyH: 0.22, bodyL: 0.85, topW: 0, noTop: true },
  'Jet Ski':        { color: 0x0066cc, bodyW: 0.3, bodyH: 0.2, bodyL: 0.7, topW: 0, noTop: true, noWheels: true },
};
const DEFAULT_STYLE = { color: 0xcc6600, bodyW: 0.5, bodyH: 0.25, bodyL: 0.8, topW: 0.4, topL: 0.45 };

let _currentVehicleName = null;

// Player vehicle display
export function updatePlayerVehicle(hasVehicle, vehicleName) {
  // Skip rebuild if same vehicle
  if (playerVehicleMesh && vehicleName === _currentVehicleName && hasVehicle) return;
  if (playerVehicleMesh) {
    scene.remove(playerVehicleMesh);
    playerVehicleMesh = null;
  }
  _currentVehicleName = hasVehicle ? vehicleName : null;
  if (!hasVehicle || !duckGroup) return;

  const s = VEHICLE_STYLES[vehicleName] || DEFAULT_STYLE;
  const vGroup = new THREE.Group();
  const liftY = s.liftY || 0;

  // Body
  const bodyGeo = new THREE.BoxGeometry(s.bodyW, s.bodyH, s.bodyL);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: s.color, roughness: s.metalness ? 0.1 : 0.25, metalness: s.metalness || 0.4,
    clearcoat: 0.8, clearcoatRoughness: 0.1,
    envMap: _envMap, envMapIntensity: 0.6
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = (s.low ? 0.1 : 0.15) + liftY;
  body.castShadow = true;
  vGroup.add(body);

  // Top/cabin
  if (!s.noTop && s.topW > 0) {
    const topH = s.topH || 0.18;
    const topGeo = new THREE.BoxGeometry(s.topW, topH, s.topL || 0.45);
    const top = new THREE.Mesh(topGeo, bodyMat);
    top.position.set(0, (s.low ? 0.1 : 0.15) + s.bodyH / 2 + topH / 2 + liftY, -0.05);
    vGroup.add(top);
  }

  // Wheels
  if (!s.noWheels) {
    const wr = s.wheelR || 0.07;
    const wGeo = new THREE.CylinderGeometry(wr, wr, 0.1, 8);
    const wMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const wz = s.bodyL * 0.35;
    const wx = s.bodyW * 0.5;
    for (const [sx, sz] of [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]]) {
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx, wr + liftY, sz);
      vGroup.add(w);
    }
  }

  // Headlights
  const hlGeo = new THREE.SphereGeometry(0.035, 6, 6);
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.8 });
  for (const sx of [-s.bodyW * 0.3, s.bodyW * 0.3]) {
    const hl = new THREE.Mesh(hlGeo, hlMat);
    hl.position.set(sx, 0.15 + liftY, s.bodyL * 0.5);
    vGroup.add(hl);
  }

  // Taillights
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 });
  for (const sx of [-s.bodyW * 0.3, s.bodyW * 0.3]) {
    const tl = new THREE.Mesh(hlGeo, tlMat);
    tl.position.set(sx, 0.15 + liftY, -s.bodyL * 0.5);
    vGroup.add(tl);
  }

  // Tank barrel
  if (s.barrel) {
    const barrelGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.6, 6);
    const barrelMesh = new THREE.Mesh(barrelGeo, bodyMat);
    barrelMesh.rotation.x = Math.PI / 2;
    barrelMesh.position.set(0, 0.4 + liftY, 0.5);
    vGroup.add(barrelMesh);
  }

  // Helicopter rotor
  if (s.rotor) {
    const rotorGeo = new THREE.BoxGeometry(1.2, 0.02, 0.06);
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
    rotorMesh.position.set(0, 0.55 + s.bodyH + liftY, 0);
    rotorMesh.name = 'rotor';
    vGroup.add(rotorMesh);
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

    // Golden hour: warm tones at sunrise (5-7) and sunset (19-21)
    const isGoldenHour = hour <= 7 || hour >= 19;
    const isDawnDusk = hour <= 6 || hour >= 20;
    sunLight.color.setHex(isDawnDusk ? 0xff8833 : isGoldenHour ? 0xffbb66 : 0xffeedd);
    ambientLight.intensity = isGoldenHour ? 0.35 : 0.4;
    hemiLight.intensity = 0.6;

    if (isDawnDusk) {
      scene.background.setHex(0x2a1830);
      renderer.toneMappingExposure = 0.9;
    } else if (isGoldenHour) {
      scene.background.setHex(hour < 12 ? 0x664488 : 0x885533);
      renderer.toneMappingExposure = 1.1;
    } else {
      scene.background.setHex(0x4477aa);
      renderer.toneMappingExposure = 1.0;
    }
    scene.fog.color.copy(scene.background);
    scene.fog.density = 0.018;
  } else {
    sunLight.position.set(-20, 12, 15);
    sunLight.intensity = 0.5;
    sunLight.color.setHex(0x6688cc);
    ambientLight.intensity = 0.4;
    hemiLight.intensity = 0.35;
    scene.background.setHex(0x141828);
    scene.fog.color.copy(scene.background);
    scene.fog.density = 0.018;
    renderer.toneMappingExposure = 0.9;
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

  // Police NPCs (red dots)
  for (const cop of policeNPCs) {
    if (!cop.alive) continue;
    const cx = cop.group.position.x * MCELL;
    const cz = cop.group.position.z * MCELL;
    mctx.fillStyle = cop.inVehicle ? '#ff4444' : '#ff0000';
    mctx.beginPath();
    mctx.arc(cx, cz, cop.inVehicle ? 2.5 : 1.5, 0, Math.PI * 2);
    mctx.fill();
  }

  // Remote players (cyan dots)
  for (const [, rd] of remoteDucks) {
    const rx = rd.group.position.x * MCELL;
    const rz = rd.group.position.z * MCELL;
    mctx.fillStyle = '#00ffff';
    mctx.beginPath();
    mctx.arc(rx, rz, 2.5, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = '#006666';
    mctx.lineWidth = 0.5;
    mctx.stroke();
  }

  // Player (yellow dot with black border)
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
  const name = (charName || '').toLowerCase();
  // Remove default hat
  const defaultHat = group.children.filter(c =>
    c.geometry && c.geometry.type === 'CylinderGeometry' && c.position.y > 0.7
  );

  // Character-colored ring at feet
  const charColors = { cj: 0x44ff44, tommy: 0xff4488, claude: 0x4444ff, niko: 0x556644, catalina: 0xcc2222, oz: 0x00ff00, izzy: 0xff1493 };
  const ringColor = charColors[name];
  if (ringColor) {
    const ringGeo = new THREE.TorusGeometry(0.35, 0.02, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: ringColor, emissive: ringColor, emissiveIntensity: 0.8, transparent: true, opacity: 0.7 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);
  }

  function _add(mesh) { group.add(mesh); }

  if (name === 'cj') {
    for (const h of defaultHat) group.remove(h);
    const bandana = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.28), new THREE.MeshStandardMaterial({ color: 0x44ff44, emissive: 0x22aa22, emissiveIntensity: 0.3 }));
    bandana.position.set(0, 0.7, 0.1); _add(bandana);
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 8, 16), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1, emissive: 0xaa8800, emissiveIntensity: 0.3 }));
    chain.rotation.x = Math.PI / 2; chain.position.set(0, 0.35, 0.2); _add(chain);
  } else if (name === 'tommy') {
    for (const h of defaultHat) group.remove(h);
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.04), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.1 }));
    glasses.position.set(0, 0.6, 0.32); _add(glasses);
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.25), new THREE.MeshStandardMaterial({ color: 0xff4488, emissive: 0x882244, emissiveIntensity: 0.2 }));
    shirt.position.set(0, 0.2, 0.05); _add(shirt);
  } else if (name === 'claude') {
    for (const h of defaultHat) group.remove(h);
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.4 }));
    collar.position.set(0, 0.42, 0.05); _add(collar);
    const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.01), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 }));
    zipper.position.set(0, 0.42, 0.2); _add(zipper);
  } else if (name === 'niko') {
    for (const h of defaultHat) group.remove(h);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x556644 });
    const capBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16), capMat);
    capBrim.position.set(0, 0.72, 0.1); _add(capBrim);
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 16), capMat);
    capTop.position.set(0, 0.78, 0.1); _add(capTop);
    const scar = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.12, 0.01), new THREE.MeshStandardMaterial({ color: 0xcc6644, emissive: 0x662222, emissiveIntensity: 0.3 }));
    scar.position.set(0.15, 0.58, 0.3); scar.rotation.z = 0.3; _add(scar);
  } else if (name === 'catalina') {
    for (const h of defaultHat) group.remove(h);
    const beret = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0x661111, emissiveIntensity: 0.2 }));
    beret.position.set(0, 0.72, 0.1); _add(beret);
    const earMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.95, roughness: 0.05, emissive: 0xaa8800, emissiveIntensity: 0.3 });
    for (const sx of [-0.2, 0.2]) {
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 12), earMat);
      ear.position.set(sx, 0.5, 0.2); _add(ear);
    }
  } else if (name === 'oz') {
    for (const h of defaultHat) group.remove(h);
    // Hoodie
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI*2, 0, Math.PI*0.6), new THREE.MeshStandardMaterial({ color: 0x1a1a2e }));
    hood.position.set(0, 0.63, 0.06); _add(hood);
    // Cyber visor — pushed out from face, thicker
    const cyberMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 });
    const cyberL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.03), cyberMat);
    cyberL.position.set(-0.07, 0.63, 0.34); _add(cyberL);
    const cyberR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.03), cyberMat);
    cyberR.position.set(0.07, 0.63, 0.34); _add(cyberR);
    // Bridge
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.02), cyberMat);
    bridge.position.set(0, 0.63, 0.34); _add(bridge);
  } else if (name === 'izzy') {
    for (const h of defaultHat) group.remove(h);
    // Pink mohawk — taller center spikes
    const mohawkMat = new THREE.MeshStandardMaterial({ color: 0xff1493, emissive: 0xff1493, emissiveIntensity: 0.3 });
    for (let i = -2; i <= 2; i++) {
      const h = 0.2 - Math.abs(i) * 0.03;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, h, 6), mohawkMat);
      spike.position.set(i * 0.04, 0.84 + (2 - Math.abs(i)) * 0.03, 0.12);
      _add(spike);
    }
    // Leather jacket
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.4 });
    const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.3), jacketMat);
    jacket.position.set(0, 0.2, 0.04); _add(jacket);
    // Jacket collar
    const collarMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.01), collarMat);
    collarL.position.set(-0.04, 0.31, 0.2); collarL.rotation.z = 0.2; _add(collarL);
    const collarR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.01), collarMat);
    collarR.position.set(0.04, 0.31, 0.2); collarR.rotation.z = -0.2; _add(collarR);
    // Zipper
    const zipMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 });
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.01), zipMat);
    zip.position.set(0, 0.2, 0.2); _add(zip);
    // Pink pin
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff1493, emissive: 0xff1493, emissiveIntensity: 0.5 }));
    pin.position.set(0.1, 0.28, 0.18); _add(pin);
    // Gold earring
    const earMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9 });
    const earring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 12), earMat);
    earring.position.set(-0.2, 0.55, 0.12); _add(earring);
    // Knife strapped to back
    const knifeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.18, 0.01), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9 }));
    knifeBlade.position.set(0.08, 0.35, -0.16); knifeBlade.rotation.z = -0.15; _add(knifeBlade);
    const knifeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.015), new THREE.MeshStandardMaterial({ color: 0x442211 }));
    knifeHandle.position.set(0.07, 0.24, -0.16); knifeHandle.rotation.z = -0.15; _add(knifeHandle);
    // Eyeliner
    const linerMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const linerL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.01), linerMat);
    linerL.position.set(-0.09, 0.62, 0.28); _add(linerL);
    const linerR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.01), linerMat);
    linerR.position.set(0.09, 0.62, 0.28); _add(linerR);
  }

  // Glow ring for remote ducks — colored halo for character identification
  const _remoteGlowColors = { cj: 0x44ff44, tommy: 0xff4488, claude: 0x8888aa, niko: 0x88aa44, catalina: 0xff2244, oz: 0x00ff00 };
  const rc = _remoteGlowColors[name];
  if (rc) {
    const rGeo = new THREE.RingGeometry(0.35, 0.5, 24);
    const rMat = new THREE.MeshStandardMaterial({ color: rc, emissive: rc, emissiveIntensity: 0.8, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const rRing = new THREE.Mesh(rGeo, rMat);
    rRing.rotation.x = -Math.PI / 2; rRing.position.y = 0.02;
    _add(rRing);
  }
}

export function updateRemoteDuck(peerId, x, y, data) {
  let entry = remoteDucks.get(peerId);
  if (!entry) {
    entry = spawnRemoteDuck(peerId, data?.char, data?.name);
  }
  entry.targetX = x + 0.5;
  entry.targetZ = y + 0.5;

  // Apply character skin if not yet applied (or char type changed)
  if (data?.char && data.char !== entry._appliedChar) {
    entry._appliedChar = data.char;
    _applyRemoteSkin(entry.group, data.char);
  }

  // Update wanted stars indicator
  const wanted = data?.wanted || 0;
  if (wanted !== (entry._lastWanted || 0)) {
    entry._lastWanted = wanted;
    // Remove old indicator
    if (entry._wantedSprite) {
      entry.group.remove(entry._wantedSprite);
      if (entry._wantedSprite.material.map) entry._wantedSprite.material.map.dispose();
      entry._wantedSprite.material.dispose();
      entry._wantedSprite = null;
    }
    if (wanted > 0) {
      const wCanvas = document.createElement('canvas');
      wCanvas.width = 128; wCanvas.height = 32;
      const wCtx = wCanvas.getContext('2d');
      wCtx.fillStyle = '#ff2222';
      wCtx.font = '24px sans-serif';
      wCtx.textAlign = 'center';
      wCtx.fillText('\u2605'.repeat(wanted), 64, 24);
      const wTex = new THREE.CanvasTexture(wCanvas);
      const wMat = new THREE.SpriteMaterial({ map: wTex, transparent: true, depthTest: false });
      const wSprite = new THREE.Sprite(wMat);
      wSprite.position.set(0, 1.4, 0);
      wSprite.scale.set(1.2, 0.3, 1);
      entry.group.add(wSprite);
      entry._wantedSprite = wSprite;
    }
  }
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

// --------------------------------------------------------
//  WEATHER SYSTEM — rain via Points (1 draw call)
// --------------------------------------------------------
const RAIN_COUNT = 600;
let _rainPoints = null;
let _rainPositions = null;
let _rainVelocities = null;
let _rainActive = false;

function _initRain() {
  const geo = new THREE.BufferGeometry();
  _rainPositions = new Float32Array(RAIN_COUNT * 3);
  _rainVelocities = new Float32Array(RAIN_COUNT);
  for (let i = 0; i < RAIN_COUNT; i++) {
    _rainPositions[i * 3] = (Math.random() - 0.5) * 40;
    _rainPositions[i * 3 + 1] = Math.random() * 12;
    _rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    _rainVelocities[i] = 10 + Math.random() * 6;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(_rainPositions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xaabbdd, size: 0.08, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  _rainPoints = new THREE.Points(geo, mat);
  _rainPoints.frustumCulled = false;
  _rainPoints.visible = false;
  scene.add(_rainPoints);
}

function _updateWeather(dt, elapsed, isNight) {
  if (!duckGroup) return;
  if (!_rainPoints) _initRain();
  const shouldRain = isNight && Math.sin(elapsed * 0.05) > 0.3;

  if (shouldRain !== _rainActive) {
    _rainActive = shouldRain;
    _rainPoints.visible = shouldRain;
  }
  if (!shouldRain) return;

  // Center rain on player
  _rainPoints.position.set(duckGroup.position.x, 0, duckGroup.position.z);

  // Animate drops
  for (let i = 0; i < RAIN_COUNT; i++) {
    _rainPositions[i * 3 + 1] -= _rainVelocities[i] * dt;
    if (_rainPositions[i * 3 + 1] < 0) {
      _rainPositions[i * 3] = (Math.random() - 0.5) * 40;
      _rainPositions[i * 3 + 1] = 10 + Math.random() * 4;
      _rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
  }
  _rainPoints.geometry.attributes.position.needsUpdate = true;

  // Thicken fog during rain
  scene.fog.density = 0.025;
}

export function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (!gameActive) { if (_composer) _composer.render(); else renderer.render(scene, camera); return; }

  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Duck position interpolation — frame-rate independent smoothing
  const lerpFactor = 1 - Math.pow(0.001, dt); // ~0.93 at 60fps, smooth at any rate
  const remoteLerp = 1 - Math.pow(0.003, dt);
  if (duckGroup) {
    duckGroup.position.x += (duckTargetX - duckGroup.position.x) * lerpFactor;
    duckGroup.position.z += (duckTargetZ - duckGroup.position.z) * lerpFactor;

    const targetRot = duckFacing;
    let rotDiff = targetRot - duckGroup.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    duckGroup.rotation.y += rotDiff * lerpFactor;

    const moving = Math.abs(duckTargetX - duckGroup.position.x) > 0.01 || Math.abs(duckTargetZ - duckGroup.position.z) > 0.01;
    if (moving) {
      waddle += dt * 14;
      if (_duckFootL) _duckFootL.position.z = 0.05 + Math.sin(waddle) * 0.1;
      if (_duckFootR) _duckFootR.position.z = 0.05 + Math.sin(waddle + Math.PI) * 0.1;
      duckGroup.position.y = Math.sin(waddle * 2) * 0.025;
    } else {
      duckGroup.position.y *= 0.9; // ease back to ground
    }
  }

  // Remote duck interpolation (multiplayer)
  for (const [, rd] of remoteDucks) {
    const g = rd.group;
    const dx = rd.targetX - g.position.x;
    const dz = rd.targetZ - g.position.z;
    g.position.x += dx * remoteLerp;
    g.position.z += dz * remoteLerp;
    const moving = Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01;
    if (moving) {
      g.rotation.y = Math.atan2(dx, dz);
      rd.waddle += dt * 14;
      if (rd._footL) rd._footL.position.z = 0.05 + Math.sin(rd.waddle) * 0.1;
      if (rd._footR) rd._footR.position.z = 0.05 + Math.sin(rd.waddle + Math.PI) * 0.1;
      g.position.y = Math.sin(rd.waddle * 2) * 0.025;
    } else {
      g.position.y *= 0.9;
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

    if (npc._legL) npc._legL.rotation.x = Math.sin(npc.phase) * 0.5;
    if (npc._legR) npc._legR.rotation.x = Math.sin(npc.phase + Math.PI) * 0.5;
    if (npc._armL) npc._armL.rotation.x = Math.sin(npc.phase + Math.PI) * 0.4;
    if (npc._armR) npc._armR.rotation.x = Math.sin(npc.phase) * 0.4;

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

  // NPC car driving — stay on roads, avoid player
  for (const car of npcCars) {
    let step = car.speed * dt;
    // Slow down / stop near player to avoid blocking
    if (duckGroup) {
      const cdx = car.group.position.x - duckGroup.position.x;
      const cdz = car.group.position.z - duckGroup.position.z;
      const playerDist = Math.sqrt(cdx * cdx + cdz * cdz);
      if (playerDist < 1.5) step *= 0.1; // nearly stop
      else if (playerDist < 3) step *= 0.4; // slow down
    }
    if (car.driveAxis === 'x') {
      car.group.position.x += car.dir * step;
    } else {
      car.group.position.z += car.dir * step;
    }
    car.driven += step;
    const gx = Math.floor(car.group.position.x);
    const gz = Math.floor(car.group.position.z);
    // Reverse if off-road, at map edge, or past drive distance
    let shouldReverse = car.driven >= car.driveDist;
    if (gx < 2 || gx >= MAP_SIZE - 2 || gz < 2 || gz >= MAP_SIZE - 2) {
      shouldReverse = true;
    } else if (currentMapGrid) {
      const tile = currentMapGrid[gz]?.[gx];
      if (tile !== T.ROAD_MAIN && tile !== T.ROAD_SIDE && tile !== T.HIGHWAY) {
        shouldReverse = true;
      }
    }
    if (shouldReverse) {
      car.driven = 0;
      car.driveDist = 20 + Math.random() * 40;
      // Try to turn at intersection instead of reversing
      let turned = false;
      if (currentMapGrid && gx > 2 && gx < MAP_SIZE - 2 && gz > 2 && gz < MAP_SIZE - 2) {
        const crossAxis = car.driveAxis === 'x' ? 'z' : 'x';
        const checkDir = Math.random() < 0.5 ? 1 : -1;
        const cx = crossAxis === 'x' ? gx + checkDir : gx;
        const cz = crossAxis === 'z' ? gz + checkDir : gz;
        const crossTile = currentMapGrid[cz]?.[cx];
        if (crossTile === T.ROAD_MAIN || crossTile === T.ROAD_SIDE || crossTile === T.HIGHWAY) {
          car.driveAxis = crossAxis;
          car.dir = checkDir;
          turned = true;
        }
      }
      if (!turned) {
        car.dir *= -1;
      }
      // Set rotation to match direction
      if (car.driveAxis === 'x') {
        car.group.rotation.y = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.group.rotation.y = car.dir > 0 ? 0 : Math.PI;
      }
      // Nudge forward
      if (car.driveAxis === 'x') car.group.position.x += car.dir * 0.3;
      else car.group.position.z += car.dir * 0.3;
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

  // Police NPC chase + shoot + melee
  const now = performance.now();
  for (const cop of policeNPCs) {
    if (!cop.alive || !duckGroup) continue;
    const dx = duckGroup.position.x - cop.group.position.x;
    const dz = duckGroup.position.z - cop.group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Chase player (zombie-walk toward them)
    if (dist > 0.6) {
      const nx = dx / dist, nz = dz / dist;
      cop.group.position.x += nx * cop.speed * dt;
      cop.group.position.z += nz * cop.speed * dt;
      cop.group.rotation.y = Math.atan2(nx, nz);
    }

    // Melee: beat player when touching (within 0.8 units)
    if (dist < 0.8 && now - cop.lastMeleeTime > 1200) {
      cop.lastMeleeTime = now;
      if (_onPoliceAttack) _onPoliceAttack('melee', cop, 0);
    }

    // Ranged: fire projectile when within 8 units, every 2.5-4s
    if (dist < 8 && dist > 0.8 && now > cop.nextShootTime) {
      cop.nextShootTime = now + 2500 + Math.random() * 1500;
      // Fire visible projectile toward the player
      fireProjectile(
        duckGroup.position.x + (Math.random() - 0.5) * 1.5,
        duckGroup.position.z + (Math.random() - 0.5) * 1.5,
        cop.group.position.x, cop.group.position.z, 0x4444ff
      );
      if (_onPoliceAttack) _onPoliceAttack('shoot', cop, dist);
    }

    cop.phase += dt * 8;
    if (!cop.inVehicle) {
      if (cop._legL) cop._legL.rotation.x = Math.sin(cop.phase) * 0.5;
      if (cop._legR) cop._legR.rotation.x = Math.sin(cop.phase + Math.PI) * 0.5;
    }
    if (cop._siren) {
      const flash = Math.sin(elapsed * 10 + cop.phase) > 0;
      cop._siren.material.color.setHex(flash ? 0xff0000 : 0x0044ff);
      cop._siren.material.emissive.setHex(cop._siren.material.color.getHex());
    }
    // Police car siren2 alternates opposite (cached at spawn)
    const siren2 = cop._siren2;
    if (siren2) {
      const flash2 = Math.sin(elapsed * 10 + cop.phase) > 0;
      siren2.material.color.setHex(flash2 ? 0x0044ff : 0xff0000);
      siren2.material.emissive.setHex(siren2.material.color.getHex());
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
    // Animate helicopter rotor
    const rotor = playerVehicleMesh.getObjectByName('rotor');
    if (rotor) rotor.rotation.y += 0.3;
  }

  // Water animation — gentle wave
  const waterMesh = scene.getObjectByName('waterMesh');
  if (waterMesh) {
    waterMesh.position.y = -0.05 + Math.sin(elapsed * 0.8) * 0.02;
  }

  // Weather — rain at night, light particles during storms
  _updateWeather(dt, elapsed, isNight);

  // Particles
  updateParticles(dt);
  updateProjectiles(dt);

  if (_composer) _composer.render(); else renderer.render(scene, camera);
}
