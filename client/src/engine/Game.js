import * as THREE from 'three/webgpu';
import {
  PLAYER, DOOR, REVIVE, CLASSES, ABILITY_COOLDOWN, ENEMY_TYPES,
  clampToWorld, resolveWallCollisions, LEVELS,
} from '@air-swarm/shared';
import { net } from '../net/NetClient.js';
import { input } from '../net/Input.js';
import { gamepad } from '../net/Gamepad.js';
import { touchControls, isTouchDevice } from '../net/TouchControls.js';
import { buildLevel } from './Level.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Pickup } from '../entities/Pickup.js';
import { HealZone } from '../entities/HealZone.js';
import { Turret } from '../entities/Turret.js';
import { Projectile } from '../entities/Projectile.js';
import { explosions } from '../entities/Explosions.js';
import { tracers } from '../entities/Tracers.js';
import { particles, FX } from '../entities/Particles.js';
import { mistZones } from '../entities/MistZones.js';
import { bloodSplatters } from '../entities/BloodSplatters.js';
import { Nest } from '../entities/Nest.js';
import { audio } from './Audio.js';
import { profile } from './Profile.js';
import { StimZone } from '../entities/StimZone.js';

function colorToRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function getMuzzleColor(cls) {
  if (cls === 'engineer') return [0.4, 0.88, 1.0];
  if (cls === 'heavy') return [1.0, 0.45, 0.15];
  if (cls === 'medic') return [0.3, 1.0, 0.65];
  return [1.0, 0.92, 0.55];
}

function getClosestPointOnBox(wx, wz, ww, wd, sx, sz) {
  const minX = wx - ww / 2;
  const maxX = wx + ww / 2;
  const minZ = wz - wd / 2;
  const maxZ = wz + wd / 2;

  let cx = Math.max(minX, Math.min(maxX, sx));
  let cz = Math.max(minZ, Math.min(maxZ, sz));

  if (cx === sx && cz === sz) {
    const dl = sx - minX;
    const dr = maxX - sx;
    const dt = sz - minZ;
    const db = maxZ - sz;
    const minDist = Math.min(dl, dr, dt, db);
    if (minDist === dl) cx = minX;
    else if (minDist === dr) cx = maxX;
    else if (minDist === dt) cz = minZ;
    else cz = maxZ;
  }

  return { x: cx, z: cz };
}

function getWallNormalAtPoint(walls, sx, sz) {
  let closestWall = null;
  let closestDist = Infinity;
  let closestPt = null;

  for (const w of walls) {
    const pt = getClosestPointOnBox(w.x, w.z, w.w, w.d, sx, sz);
    const dist = Math.hypot(sx - pt.x, sz - pt.z);
    if (dist < closestDist) {
      closestDist = dist;
      closestWall = w;
      closestPt = pt;
    }
  }

  if (closestWall && closestPt) {
    let ndx = sx - closestPt.x;
    let ndz = sz - closestPt.z;
    let dist = Math.hypot(ndx, ndz);

    if (dist < 1e-5) {
      ndx = sx - closestWall.x;
      ndz = sz - closestWall.z;
      dist = Math.hypot(ndx, ndz) || 1;
    }

    let nx = ndx / dist;
    let nz = ndz / dist;

    // Check if spawn coordinate is inside the wall box
    const wHalfW = closestWall.w / 2;
    const wHalfD = closestWall.d / 2;
    const isInside = (sx >= closestWall.x - wHalfW - 1e-4 && sx <= closestWall.x + wHalfW + 1e-4 &&
                      sz >= closestWall.z - wHalfD - 1e-4 && sz <= closestWall.z + wHalfD + 1e-4);

    if (isInside) {
      nx = -nx;
      nz = -nz;
    }

    return {
      pt: closestPt,
      nx,
      nz,
      dist: closestDist,
    };
  }

  return null;
}

function createNest(scene, closestPt, nx, nz) {
  const group = new THREE.Group();
  group.position.set(closestPt.x, 0, closestPt.z);
  group.lookAt(new THREE.Vector3(closestPt.x + nx * 5, 0, closestPt.z + nz * 5));

  // Materials
  const tunnelMat = new THREE.MeshBasicMaterial({ color: 0x030303, side: THREE.DoubleSide });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x3d1d11, // Organic dark brown-red
    roughness: 0.8,
    metalness: 0.1,
  });
  const growthMat = new THREE.MeshStandardMaterial({
    color: 0x1c2b18, // Moldy green organic shell
    roughness: 0.7,
  });
  const pustuleMat = new THREE.MeshStandardMaterial({
    color: 0xff8800,
    emissive: 0xff5500,
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });
  const slimeMat = new THREE.MeshStandardMaterial({
    color: 0x224411, // Wet shiny green slime puddle
    roughness: 0.15,
    transparent: true,
    opacity: 0.85,
  });

  // 1. Dark hollow tunnel going back into the wall
  const tunnelGeom = new THREE.CylinderGeometry(0.55, 0.45, 1.2, 8, 1, true);
  tunnelGeom.rotateX(Math.PI / 2); // orient along Z-axis
  const tunnelMesh = new THREE.Mesh(tunnelGeom, tunnelMat);
  tunnelMesh.position.set(0, 0.45, -0.5);
  group.add(tunnelMesh);

  // Cap at the back of the tunnel to hide void
  const capGeom = new THREE.CircleGeometry(0.45, 8);
  const capMesh = new THREE.Mesh(capGeom, tunnelMat);
  capMesh.position.set(0, 0.45, -1.1);
  capMesh.rotation.y = Math.PI;
  group.add(capMesh);

  // 2. Fleshy rim at the wall surface
  const rimGeom = new THREE.TorusGeometry(0.5, 0.15, 8, 16);
  const rimMesh = new THREE.Mesh(rimGeom, rimMat);
  rimMesh.position.set(0, 0.45, 0);
  rimMesh.castShadow = true;
  rimMesh.receiveShadow = true;
  group.add(rimMesh);

  // 3. Fleshy bulbs / pustules around opening
  const bulbCount = 6;
  for (let j = 0; j < bulbCount; j++) {
    const angle = (j / bulbCount) * Math.PI * 2;
    const r = 0.55 + Math.random() * 0.08;
    const bx = Math.cos(angle) * r;
    const by = 0.45 + Math.sin(angle) * r;
    const bz = -0.05 + Math.random() * 0.08;

    const bulbGeom = new THREE.SphereGeometry(0.09 + Math.random() * 0.1, 6, 6);
    const isGlowing = Math.random() > 0.4;
    const bulbMesh = new THREE.Mesh(bulbGeom, isGlowing ? pustuleMat : growthMat);
    bulbMesh.position.set(bx, by, bz);
    bulbMesh.castShadow = true;
    bulbMesh.receiveShadow = true;
    group.add(bulbMesh);
  }

  // 4. Shiny green slime puddle on floor in front of tunnel
  const puddleGeom = new THREE.PlaneGeometry(1.3, 0.9);
  const puddleMesh = new THREE.Mesh(puddleGeom, slimeMat);
  puddleMesh.rotation.x = -Math.PI / 2;
  puddleMesh.position.set(0, 0.006, 0.35); // offset Y slightly to prevent z-fighting
  puddleMesh.receiveShadow = true;
  group.add(puddleMesh);

  scene.add(group);
  return group;
}

const CLASS_TAGS = { marine: 'MAR', engineer: 'ENG', heavy: 'HVY', medic: 'MED' };
const ABILITY_LABELS = {
  healthPack: 'DEPLOY HEAL ZONE',
  turret: 'DEPLOY TURRET',
  landMine: 'DEPLOY LAND MINE',
  stimPack: 'DEPLOY STIM FIELD',
};
// Icons stand in for keyboard-key references ("[E]", "Q") on touch devices, which have
// no such keys — shown on the touch buttons themselves and in the door/revive hints.
const ABILITY_ICONS = {
  healthPack: '➕',
  turret: '🛡️',
  landMine: '💣',
  stimPack: '⚡',
};
const INTERACT_ICONS = { engineer: '🔧', medic: '❤️', marine: '❤️', heavy: '❤️' };

const SMOOTH_RATE = 12; // higher = snappier interpolation for remote entities
const RECONCILE_RATE = 6;

class GameEngine {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();

    this.players = new Map(); // id -> Player
    this.enemies = new Map(); // id -> Enemy
    this.pickups = new Map(); // id -> Pickup
    this.healZones = new Map(); // id -> HealZone
    this.stimZones = new Map(); // id -> StimZone
    this.turrets = new Map(); // id -> Turret
    this.projectiles = new Map(); // id -> Projectile
    this.grenadesMap = new Map(); // id -> THREE.Group
    this.landMinesMap = new Map(); // id -> THREE.Group
    this.remoteTargets = new Map(); // id -> {x,z,angle} latest server value for players
    this.enemyTargets = new Map();

    this.localId = null;
    this.localCls = 'marine';
    this.predicted = { x: 0, z: 0 };
    this.reconcileTarget = null;

    this.world = null;
    this.walls = [];
    this.doorDefs = new Map(); // id -> static def {x,z,w,d}
    this.doorMeshes = new Map(); // id -> mesh refs
    this.doorStates = new Map(); // id -> latest {hp,maxHp,open,hackProgress,hackers}
    this.floor = null;
    this.grid = null;
    this.wallsMesh = null;
    this.teleporter = null;
    this.guideLights = [];
    this.nests = [];
    this.alienNests = new Map();
    this.currentLevelId = null;

    this.hud = {};
    this.state = 'JOIN'; // JOIN | PLAYING
    this._bannerTimeout = null;
    this._levelBuilt = false;
    this.selectedLevelId = 1;
    this.screenShakeIntensity = 0.0;
  }

  async init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0c10);
    this.scene.fog = new THREE.Fog(0x0b0c10, 24, 60);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);

    this.renderer = new THREE.WebGPURenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0x445566, 0x050505, 0.06);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0x556677, 0.05);
    dir.position.set(8, 20, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -20;
    dir.shadow.camera.right = 20;
    dir.shadow.camera.top = 20;
    dir.shadow.camera.bottom = -20;
    this.scene.add(dir);

    tracers.init(this.scene);
    explosions.init(this.scene);
    particles.init(this.scene);
    mistZones.init(this.scene);
    bloodSplatters.init(this.scene);

    this.cacheHud();
    this.setupJoinUI();
    audio.init();
    this.updateProfileSelectionUI();

    window.addEventListener('resize', () => this.onResize());

    net.onWelcome = (msg) => this.onWelcome(msg);
    net.onState = (msg) => this.onState(msg);
    net.onGameOver = () => this.onGameOver();
    net.onVictory = () => this.onVictory();

    await this.renderer.init();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // Enemy spawn points are level-specific, so the mist pockets are built from the
  // server's welcome data (once we know which level is actually running) rather than
  // a static import — different sessions can be playing different levels.
  buildSpawnMist(ambientSpawnPoints, gates) {
    this.nests = this.nests || [];

    // Ambient spawn points
    for (const pt of ambientSpawnPoints) {
      const wallInfo = getWallNormalAtPoint(this.walls, pt.x, pt.z);
      if (wallInfo) {
        const nest = createNest(this.scene, wallInfo.pt, wallInfo.nx, wallInfo.nz);
        this.nests.push(nest);
      }
    }

    // Note: Gate spawn points are now live destroyable nests managed via server state
  }

  cacheHud() {
    this.hud.levelSelectScreen = document.getElementById('level-select-screen');
    this.hud.selectedLevelLabel = document.getElementById('selected-level-label');
    this.hud.levelBadge = document.getElementById('level-badge');
    this.hud.joinScreen = document.getElementById('join-screen');
    this.hud.nameInput = document.getElementById('name-input');
    this.hud.joinBtn = document.getElementById('join-btn');
    this.hud.hpFill = document.getElementById('hp-fill');
    this.hud.hpText = document.getElementById('hp-text');
    this.hud.waveText = document.getElementById('wave-text');
    this.hud.playerList = document.getElementById('player-list');
    this.hud.deadOverlay = document.getElementById('dead-overlay');
    this.hud.hudOverlay = document.getElementById('hud-overlay');
    this.hud.damageVignette = document.getElementById('damage-vignette');
    this.hud.profileName = document.getElementById('profile-name');
    this.hud.profilePoints = document.getElementById('profile-points');
    this.hud.doorHint = document.getElementById('door-hint');
    this.hud.reviveHint = document.getElementById('revive-hint');
    this.hud.banner = document.getElementById('banner');
    this.hud.abilityLabel = document.getElementById('ability-label');
    this.hud.abilityFill = document.getElementById('ability-fill');
    this.hud.abilityHud = document.getElementById('ability-hud');
    this.hud.grenadeLabel = document.getElementById('grenade-label');
    this.hud.grenadeFill = document.getElementById('grenade-fill');
    this.hud.grenadeHud = document.getElementById('grenade-hud');
    this.hud.stimTag = document.getElementById('stim-tag');
    this.hud.deadSubtitle = document.getElementById('dead-subtitle');
    this.hud.deadReviveFill = document.getElementById('dead-revive-fill');
    this.hud.gameoverScreen = document.getElementById('gameover-screen');
    this.hud.gameoverBtn = document.getElementById('gameover-btn');
    this.hud.gamepadStatus = document.getElementById('gamepad-status');
    this.hud.victoryScreen = document.getElementById('victory-screen');
    this.hud.victoryBtn = document.getElementById('victory-btn');
  }

  cycleClass(direction) {
    const radios = [...document.querySelectorAll('input[name="cls"]')];
    if (radios.length === 0) return;
    const idx = radios.findIndex((r) => r.checked);
    const next = (((idx + direction) % radios.length) + radios.length) % radios.length;
    radios[next].checked = true;
  }

  // Gamepad input only makes sense on the join screen (name/class picking is keyboard/mouse
  // territory otherwise) — A confirms, bumpers cycle the class selection.
  updateJoinScreenGamepad() {
    if (!this.hud.gamepadStatus) return;
    this.hud.gamepadStatus.classList.toggle('hidden', !gamepad.connected);

    if (!this.hud.gameoverScreen.classList.contains('hidden')) {
      if (gamepad.consumeConfirmPress()) this.hud.gameoverBtn.click();
      return;
    }
    if (!this.hud.victoryScreen.classList.contains('hidden')) {
      if (gamepad.consumeConfirmPress()) this.hud.victoryBtn.click();
      return;
    }
    if (this.hud.joinScreen.classList.contains('hidden')) return;

    const cycle = gamepad.consumeClassCycle();
    if (cycle !== 0) this.cycleClass(cycle);
    if (gamepad.consumeConfirmPress()) this.doJoin();
  }

  setupJoinUI() {
    for (const card of document.querySelectorAll('.level-card')) {
      card.addEventListener('click', () => this.selectLevel(card));
    }
    this.hud.joinBtn.addEventListener('click', () => this.doJoin());
    this.hud.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.doJoin();
    });
    this.hud.gameoverBtn.addEventListener('click', () => {
      this.hud.gameoverScreen.classList.add('hidden');
      this.hud.levelSelectScreen.classList.remove('hidden');
      this.updateProfileSelectionUI();
      net.disconnect();
      audio.setMusicState('menu');
    });
    this.hud.victoryBtn.addEventListener('click', () => {
      this.hud.victoryScreen.classList.add('hidden');
      this.hud.levelSelectScreen.classList.remove('hidden');
      this.updateProfileSelectionUI();
      net.disconnect();
      audio.setMusicState('menu');
    });
  }

  selectLevel(card) {
    if (card.classList.contains('locked')) {
      audio.playSFX('doorHit');
      return;
    }
    this.selectedLevelId = parseInt(card.dataset.level, 10) || 1;
    const name = card.querySelector('.level-card-name').textContent;
    const difficulty = card.querySelector('.level-card-difficulty').textContent;
    if (this.hud.selectedLevelLabel) {
      this.hud.selectedLevelLabel.innerText = `${name} — ${difficulty}`;
    }
    this.hud.levelSelectScreen.classList.add('hidden');
    this.hud.joinScreen.classList.remove('hidden');
  }

  updateProfileSelectionUI() {
    if (this.hud.profileName) this.hud.profileName.innerText = profile.name;
    if (this.hud.profilePoints) this.hud.profilePoints.innerText = profile.points;
    if (this.hud.nameInput) this.hud.nameInput.value = profile.name;

    const clsRadio = document.querySelector(`input[name="cls"][value="${profile.cls}"]`);
    if (clsRadio) clsRadio.checked = true;

    const cards = document.querySelectorAll('.level-card');
    for (const card of cards) {
      const lvl = parseInt(card.dataset.level, 10);
      const isUnlocked = lvl === 1 || profile.highestLevelCompleted >= lvl - 1;
      card.classList.toggle('locked', !isUnlocked);
    }
  }

  // Every joined player was downed at once — the server has already reset the mission
  // and un-joined everyone. Freeze locally and show the mission-failed screen; the
  // player has to explicitly hit "return to main menu" and rejoin to play again.
  onGameOver() {
    this.state = 'JOIN';
    input.reset();
    this.hud.hudOverlay.classList.add('hidden');
    this.hud.deadOverlay.classList.add('hidden');
    this.hud.joinScreen.classList.add('hidden');
    this.hud.gameoverScreen.classList.remove('hidden');
    audio.playDefeatTheme();
  }

  onVictory() {
    this.state = 'JOIN';
    input.reset();
    this.hud.hudOverlay.classList.add('hidden');
    this.hud.deadOverlay.classList.add('hidden');
    this.hud.joinScreen.classList.add('hidden');
    this.hud.victoryScreen.classList.remove('hidden');
    audio.playVictoryTheme();

    if (this.localScore) {
      profile.points += this.localScore;
    }
    if (this.currentLevelId && this.currentLevelId > profile.highestLevelCompleted) {
      profile.highestLevelCompleted = this.currentLevelId;
    }
    profile.save();
  }

  doJoin() {
    const name = this.hud.nameInput.value.trim() || 'Marine';
    const clsInput = document.querySelector('input[name="cls"]:checked');
    const cls = clsInput ? clsInput.value : 'marine';
    this.localCls = cls;

    // Save choices to local profile
    profile.name = name;
    profile.cls = cls;
    profile.save();

    net.connect(name, cls, this.selectedLevelId);
    this.hud.joinScreen.classList.add('hidden');
    this.hud.hudOverlay.classList.remove('hidden');
    input.setup(this.renderer.domElement, this.camera);
    if (isTouchDevice()) {
      touchControls.init();
      this.applyTouchIcons();
    }
    this.state = 'PLAYING';
    audio.setMusicState('explore');
  }

  // Swaps the touch buttons' text for icons matching the player's actual class ability —
  // there's no physical "E" or "Q" key on a touchscreen to reference. The interact
  // button only does something for engineer (hack) / medic (revive), so hide it for
  // classes that can't use it rather than show a button that silently does nothing.
  applyTouchIcons() {
    const abilityBtn = document.getElementById('touch-ability-btn');
    const ability = CLASSES[this.localCls]?.ability;
    if (abilityBtn && ability) abilityBtn.textContent = ABILITY_ICONS[ability] || '';

    const interactBtn = document.getElementById('touch-interact-btn');
    if (interactBtn) {
      const icon = INTERACT_ICONS[this.localCls];
      if (icon) {
        interactBtn.textContent = icon;
        interactBtn.classList.remove('hidden');
      } else {
        interactBtn.classList.add('hidden');
      }
    }
  }

  clearLevel() {
    if (this.floor) {
      this.scene.remove(this.floor);
      this.floor.geometry.dispose();
      this.floor.material.dispose();
      this.floor = null;
    }
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.dispose();
      this.grid = null;
    }
    if (this.wallsMesh) {
      this.scene.remove(this.wallsMesh);
      this.wallsMesh.geometry.dispose();
      this.wallsMesh.material.dispose();
      this.wallsMesh = null;
    }
    if (this.doorMeshes) {
      for (const d of this.doorMeshes.values()) {
        this.scene.remove(d.group);
        if (d.doorMesh) {
          d.doorMesh.geometry.dispose();
          d.doorMesh.material.dispose();
        }
        if (d.frame) {
          d.frame.geometry.dispose();
          d.frame.material.dispose();
        }
        if (d.barBg) {
          d.barBg.geometry.dispose();
          d.barBg.material.dispose();
        }
        if (d.barFg) {
          d.barFg.geometry.dispose();
          d.barFg.material.dispose();
        }
      }
      this.doorMeshes.clear();
    }
    if (this.teleporter) {
      this.teleporter.dispose(this.scene);
      this.teleporter = null;
    }
    if (this.guideLights) {
      for (const gl of this.guideLights) {
        this.scene.remove(gl);
        gl.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
      this.guideLights = [];
    }
    if (this.nests) {
      for (const nest of this.nests) {
        this.scene.remove(nest);
        nest.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
      this.nests = [];
    }
    if (this.alienNests) {
      for (const nest of this.alienNests.values()) {
        nest.dispose(this.scene);
      }
      this.alienNests.clear();
    }
    if (this.grenadesMap) {
      for (const mesh of this.grenadesMap.values()) {
        this.scene.remove(mesh);
        mesh.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
      this.grenadesMap.clear();
    }
    if (this.stimZones) {
      for (const z of this.stimZones.values()) {
        z.dispose(this.scene);
      }
      this.stimZones.clear();
    }
    if (this.landMinesMap) {
      for (const mesh of this.landMinesMap.values()) {
        this.scene.remove(mesh);
        mesh.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
      this.landMinesMap.clear();
    }
    this.doorDefs.clear();
    this.doorStates.clear();
    mistZones.clear();
    bloodSplatters.clear();
    this._levelBuilt = false;
    this.currentLevelId = null;
  }

  onWelcome(msg) {
    if (this.currentLevelId !== msg.level.id) {
      this.clearLevel();
      this.currentLevelId = msg.level.id;
    }

    this.localId = msg.id;
    this.localScore = 0;
    this.world = msg.world;
    this.walls = msg.walls;
    for (const d of msg.doors) this.doorDefs.set(d.id, d);

    if (!this._levelBuilt) {
      const levelDef = LEVELS[msg.level.id];
      const { floor, grid, wallsMesh, doorMeshes, teleporter, guideLights } = buildLevel(
        this.scene, msg.world, msg.walls, msg.doors, levelDef.endZone, levelDef.checkpoints
      );
      this.floor = floor;
      this.grid = grid;
      this.wallsMesh = wallsMesh;
      this.doorMeshes = doorMeshes;
      this.teleporter = teleporter;
      this.guideLights = guideLights;
      this.buildSpawnMist(msg.ambientSpawnPoints, msg.gates);
      this._levelBuilt = true;
    }

    if (this.hud.levelBadge && msg.level) {
      this.hud.levelBadge.innerText = `LEVEL ${msg.level.id}: ${msg.level.name.toUpperCase()} (${msg.level.difficulty})`;
    }

    const spawn = PLAYER_SPAWN_FALLBACK;
    this.predicted.x = spawn.x;
    this.predicted.z = spawn.z;
    const localPlayer = this.getOrCreatePlayer(msg.id, true);
    localPlayer.setTransform(this.predicted.x, this.predicted.z, 0);
  }

  getOrCreatePlayer(id, isLocal) {
    let p = this.players.get(id);
    if (!p) {
      p = new Player(id, isLocal);
      this.scene.add(p.group);
      this.players.set(id, p);
    }
    return p;
  }

  getOrCreateEnemy(id, type) {
    let e = this.enemies.get(id);
    if (!e) {
      e = new Enemy(id, type);
      this.scene.add(e.group);
      this.enemies.set(id, e);
    }
    return e;
  }

  getOrCreateProjectile(id) {
    let p = this.projectiles.get(id);
    if (!p) {
      p = new Projectile(id);
      this.scene.add(p.group);
      this.projectiles.set(id, p);
    }
    return p;
  }

  getOrCreatePickup(id, type) {
    let p = this.pickups.get(id);
    if (!p) {
      p = new Pickup(id, type);
      this.scene.add(p.group);
      this.pickups.set(id, p);
    }
    return p;
  }

  getOrCreateHealZone(id) {
    let z = this.healZones.get(id);
    if (!z) {
      z = new HealZone(id);
      this.scene.add(z.group);
      this.healZones.set(id, z);
    }
    return z;
  }

  getOrCreateTurret(id) {
    let t = this.turrets.get(id);
    if (!t) {
      t = new Turret(id);
      this.scene.add(t.group);
      this.turrets.set(id, t);
    }
    return t;
  }

  getOrCreateAlienNest(id, x, z, isWallTunnel, walls) {
    let n = this.alienNests.get(id);
    if (!n) {
      n = new Nest(id, x, z, isWallTunnel, walls);
      this.scene.add(n.group);
      this.alienNests.set(id, n);
    }
    return n;
  }

  getOrCreateStimZone(id) {
    let z = this.stimZones.get(id);
    if (!z) {
      z = new StimZone(id);
      this.scene.add(z.group);
      this.stimZones.set(id, z);
    }
    return z;
  }

  getOrCreateLandMineMesh(id) {
    let mesh = this.landMinesMap.get(id);
    if (!mesh) {
      mesh = new THREE.Group();

      // Base disc
      const discGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.06, 16);
      const discMat = new THREE.MeshStandardMaterial({ color: 0x3e424b, roughness: 0.5, metalness: 0.8 });
      const disc = new THREE.Mesh(discGeom, discMat);
      disc.position.y = 0.03;
      disc.castShadow = true;
      disc.receiveShadow = true;
      mesh.add(disc);

      // Glowing center indicator
      const capGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
      const capMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const cap = new THREE.Mesh(capGeom, capMat);
      cap.position.y = 0.05;
      mesh.add(cap);

      this.scene.add(mesh);
      this.landMinesMap.set(id, mesh);
    }
    return mesh;
  }

  getOrCreateGrenadeMesh(id) {
    let mesh = this.grenadesMap.get(id);
    if (!mesh) {
      mesh = new THREE.Group();
      
      const sphereGeom = new THREE.SphereGeometry(0.18, 8, 8);
      const sphereMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5, metalness: 0.8 });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      sphere.castShadow = true;
      mesh.add(sphere);

      const pinGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.1, 4);
      const pinMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const pin = new THREE.Mesh(pinGeom, pinMat);
      pin.position.y = 0.15;
      mesh.add(pin);

      this.scene.add(mesh);
      this.grenadesMap.set(id, mesh);
    }
    return mesh;
  }

  // Static walls plus any door that isn't open, plus alive alien nests — mirrors the server's blocking-rect logic
  // so client-side prediction doesn't walk through geometry the server will reject.
  getBlockingRects() {
    const closedDoors = [];
    for (const [id, state] of this.doorStates) {
      if (state.open) continue;
      const def = this.doorDefs.get(id);
      if (def) closedDoors.push(def);
    }
    const aliveNests = [];
    for (const n of this.alienNests.values()) {
      aliveNests.push({ x: n.x, z: n.z, w: 1.3, d: 1.3 });
    }
    let res = this.walls;
    if (closedDoors.length) res = res.concat(closedDoors);
    if (aliveNests.length) res = res.concat(aliveNests);
    return res;
  }

  onState(msg) {
    const seenPlayers = new Set();
    const listLines = [];
    for (const ps of msg.players) {
      seenPlayers.add(ps.id);
      const p = this.getOrCreatePlayer(ps.id, ps.id === this.localId);
      p.cls = ps.cls;
      p.hp = ps.hp;
      p.alive = ps.alive;
      p.reviveProgress = ps.reviveProgress || 0;
      p.setDowned(!ps.alive);
      p.setReviveProgress(p.reviveProgress);
      p.setInvulnerable(!!ps.invuln);
      const clsTag = CLASS_TAGS[ps.cls] || 'MAR';
      const stimTag = ps.stim ? ' ⚡' : '';
      const downedTag = !ps.alive ? ' [DOWN]' : '';
      listLines.push(`[${clsTag}] ${ps.name}: ${Math.round(Math.max(0, ps.hp))} hp — ${ps.score} pts${stimTag}${downedTag}`);

      if (ps.id === this.localId) {
        this.reconcileTarget = { x: ps.x, z: ps.z };
        this.updateLocalHud(ps);
      } else {
        this.remoteTargets.set(ps.id, { x: ps.x, z: ps.z, angle: ps.angle });
      }
    }
    for (const id of [...this.players.keys()]) {
      if (!seenPlayers.has(id)) {
        this.players.get(id).dispose(this.scene);
        this.players.delete(id);
        this.remoteTargets.delete(id);
      }
    }
    if (this.hud.playerList) this.hud.playerList.innerText = listLines.join('\n');

    const seenEnemies = new Set();
    for (const es of msg.enemies) {
      seenEnemies.add(es.id);
      this.getOrCreateEnemy(es.id, es.type);
      this.enemyTargets.set(es.id, { x: es.x, z: es.z, angle: es.angle });
    }
    for (const id of [...this.enemies.keys()]) {
      if (!seenEnemies.has(id)) {
        this.enemies.get(id).dispose(this.scene);
        this.enemies.delete(id);
        this.enemyTargets.delete(id);
      }
    }

    const seenProjectiles = new Set();
    for (const ps of msg.projectiles) {
      seenProjectiles.add(ps.id);
      const p = this.getOrCreateProjectile(ps.id);
      p.setPosition(ps.x, ps.z);
    }
    for (const id of [...this.projectiles.keys()]) {
      if (!seenProjectiles.has(id)) {
        this.projectiles.get(id).dispose(this.scene);
        this.projectiles.delete(id);
      }
    }

    const seenPickups = new Set();
    for (const ps of msg.pickups) {
      seenPickups.add(ps.id);
      const p = this.getOrCreatePickup(ps.id, ps.type);
      p.setPosition(ps.x, ps.z);
    }
    for (const id of [...this.pickups.keys()]) {
      if (!seenPickups.has(id)) {
        this.pickups.get(id).dispose(this.scene);
        this.pickups.delete(id);
      }
    }

    const seenHealZones = new Set();
    for (const zs of msg.healZones) {
      seenHealZones.add(zs.id);
      const z = this.getOrCreateHealZone(zs.id);
      z.setPosition(zs.x, zs.z);
      z.setLife(zs.life);
    }
    for (const id of [...this.healZones.keys()]) {
      if (!seenHealZones.has(id)) {
        this.healZones.get(id).dispose(this.scene);
        this.healZones.delete(id);
      }
    }

    const seenTurrets = new Set();
    for (const ts of msg.turrets) {
      seenTurrets.add(ts.id);
      const t = this.getOrCreateTurret(ts.id);
      t.setPosition(ts.x, ts.z);
    }
    for (const id of [...this.turrets.keys()]) {
      if (!seenTurrets.has(id)) {
        this.turrets.get(id).dispose(this.scene);
        this.turrets.delete(id);
      }
    }

    const seenNests = new Set();
    if (msg.nests) {
      for (const ns of msg.nests) {
        seenNests.add(ns.id);
        const nest = this.getOrCreateAlienNest(ns.id, ns.x, ns.z, ns.isWallTunnel, this.walls);
        nest.setHp(ns.hp, ns.maxHp);
      }
    }
    for (const id of [...this.alienNests.keys()]) {
      if (!seenNests.has(id)) {
        this.alienNests.get(id).dispose(this.scene);
        this.alienNests.delete(id);
      }
    }

    const seenGrenades = new Set();
    if (msg.grenades) {
      for (const gs of msg.grenades) {
        seenGrenades.add(gs.id);
        const gMesh = this.getOrCreateGrenadeMesh(gs.id);
        const arcY = 0.15 + Math.sin((gs.t / gs.life) * Math.PI) * 1.5;
        gMesh.position.set(gs.x, arcY, gs.z);
        gMesh.rotation.x += 0.08;
        gMesh.rotation.y += 0.05;
      }
    }
    for (const id of [...this.grenadesMap.keys()]) {
      if (!seenGrenades.has(id)) {
        const mesh = this.grenadesMap.get(id);
        this.scene.remove(mesh);
        mesh.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.grenadesMap.delete(id);
      }
    }

    const seenStimZones = new Set();
    if (msg.stimZones) {
      for (const zs of msg.stimZones) {
        seenStimZones.add(zs.id);
        const z = this.getOrCreateStimZone(zs.id);
        z.setPosition(zs.x, zs.z);
        z.setLife(zs.life);
      }
    }
    for (const id of [...this.stimZones.keys()]) {
      if (!seenStimZones.has(id)) {
        this.stimZones.get(id).dispose(this.scene);
        this.stimZones.delete(id);
      }
    }

    const seenMines = new Set();
    if (msg.landMines) {
      for (const ms of msg.landMines) {
        seenMines.add(ms.id);
        const m = this.getOrCreateLandMineMesh(ms.id);
        m.position.set(ms.x, 0, ms.z);
      }
    }
    for (const id of [...this.landMinesMap.keys()]) {
      if (!seenMines.has(id)) {
        const mesh = this.landMinesMap.get(id);
        this.scene.remove(mesh);
        mesh.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.landMinesMap.delete(id);
      }
    }

    let anyLocked = false;
    for (const d of msg.doors) {
      const wasOpen = this.doorStates.get(d.id)?.open;
      this.doorStates.set(d.id, d);
      if (!d.open) anyLocked = true;
      this.updateDoorVisual(d);
      if (!wasOpen && d.open) {
        this.showBanner('DOOR UNLOCKED');
        audio.playSFX('doorUnlocked');
      }
    }
    if (this.hud.waveText) {
      this.hud.waveText.innerText = anyLocked ? 'HOLD THE LINE' : 'MOVE OUT';
    }

    if (this.state === 'PLAYING') {
      const hasEnemies = msg.enemies.length > 0;
      if (anyLocked || hasEnemies) {
        audio.setMusicState('combat');
      } else {
        audio.setMusicState('explore');
      }
    }

    for (const ev of msg.events) {
      if (ev.type === 'shot') {
        const shooter = this.players.get(ev.playerId);
        const cls = shooter ? shooter.cls : 'marine';

        let shotFromTurret = false;
        for (const t of this.turrets.values()) {
          if (Math.hypot(t.group.position.x - ev.x, t.group.position.z - ev.z) < 0.8) {
            t.triggerMuzzleFlash();
            shotFromTurret = true;
            break;
          }
        }
        if (!shotFromTurret && shooter) {
          shooter.triggerMuzzleFlash(cls);
        }

        tracers.spawn(ev.x, ev.z, ev.dx, ev.dz, ev.dist);
        FX.muzzleFlash(ev.x, ev.z, ev.dx, ev.dz, shotFromTurret ? [0.4, 0.88, 1.0] : getMuzzleColor(cls));
        FX.impactSpark(ev.x + ev.dx * ev.dist, ev.z + ev.dz * ev.dist);
        audio.playSFX('shoot', shotFromTurret ? 'engineer' : cls);
      } else if (ev.type === 'enemyShot') {
        FX.muzzleFlash(ev.x, ev.z, ev.dx, ev.dz, [0.3, 1.0, 0.4]);
        audio.playSFX('enemyShot');
      } else if (ev.type === 'enemyDeath') {
        const color = ENEMY_TYPES[ev.enemyType]?.color;
        const rgb = color != null ? colorToRgb(color) : [0.2, 0.6, 0.2];
        FX.enemyDeath(ev.x, ev.z, rgb);
        bloodSplatters.spawnSplatter(ev.x, ev.z, color != null ? color : 0x2f8f3a);
        audio.playSFX('enemyDeath');
      } else if (ev.type === 'enemyHit') {
        const color = ENEMY_TYPES[ev.enemyType]?.color;
        const rgb = color != null ? colorToRgb(color) : [0.2, 0.6, 0.2];
        FX.enemyHit(ev.x, ev.z, rgb);
        bloodSplatters.spawnSplatter(ev.x, ev.z, color != null ? color : 0x2f8f3a);
        audio.playSFX('enemyHit');
      } else if (ev.type === 'enemySpawn') {
        const color = ENEMY_TYPES[ev.enemyType]?.color;
        FX.enemySpawn(ev.x, ev.z, color != null ? colorToRgb(color) : [0.6, 0.6, 0.6]);
        audio.playSFX('enemySpawn');
      } else if (ev.type === 'playerHit') {
        if (Number.isFinite(ev.x) && Number.isFinite(ev.z)) FX.playerHit(ev.x, ev.z);
        audio.playSFX('playerHit');
        if (ev.playerId === this.localId) {
          this.screenShakeIntensity = 0.35;
        }
      } else if (ev.type === 'doorHit') {
        const def = this.doorDefs.get(ev.doorId);
        if (def) FX.doorSpark(def.x, 1.6, def.z);
        audio.playSFX('doorHit');
      } else if (ev.type === 'nestHit') {
        FX.enemyHit(ev.x, ev.z, [0.6, 0.15, 0.7]);
        bloodSplatters.spawnSplatter(ev.x, ev.z, 0x3d0e49);
        audio.playSFX('enemyHit');
      } else if (ev.type === 'nestDeath') {
        FX.enemyDeath(ev.x, ev.z, [0.6, 0.15, 0.7]);
        bloodSplatters.spawnSplatter(ev.x, ev.z, 0x3d0e49);
        audio.playSFX('enemyDeath');
      } else if (ev.type === 'pickupUsed') {
        if (ev.kind === 'stim') FX.pickupStim(ev.x, ev.z);
        audio.playSFX('ability', ev.kind);
      } else if (ev.type === 'abilityUsed') {
        if (ev.ability === 'turret') FX.turretDeploy(ev.x, ev.z);
        else if (ev.ability === 'shotgunBlast') FX.shotgunBlast(ev.x, ev.z, ev.angle);
        else if (ev.ability === 'healthPack') FX.pickupHeal(ev.x, ev.z);
        else if (ev.ability === 'stimPack') FX.pickupStim(ev.x, ev.z);
        if (ev.playerId === this.localId) this.showBanner(ABILITY_LABELS[ev.ability] || 'ABILITY USED');
        audio.playSFX('ability', ev.ability);
      } else if (ev.type === 'explosion') {
        explosions.spawn(ev.x, ev.z, ev.radius);
        audio.playSFX('explosion');
      } else if (ev.type === 'playerRevived') {
        const revived = this.players.get(ev.playerId);
        if (revived) FX.pickupHeal(revived.x, revived.z);
        if (ev.playerId === this.localId) this.showBanner('REVIVED');
        audio.playSFX('ability', 'revive');
      }
    }

    this.updateDoorHint();
    this.updateReviveHint();
  }

  updateDoorVisual(state) {
    const mesh = this.doorMeshes.get(state.id);
    if (!mesh) return;
    const pct = Math.max(0, state.hp) / state.maxHp;
    mesh.barFg.scale.x = pct;
    mesh.barFg.position.x = -1.2 * (1 - pct);

    if (state.open) {
      mesh.doorMesh.position.y = mesh.baseHeight * 1.6; // slide up out of the way
      mesh.doorMesh.material.opacity = 0.25;
      mesh.doorMesh.material.transparent = true;
      mesh.barFg.visible = false;
      mesh.barBg.visible = false;
    } else {
      mesh.doorMesh.position.y = mesh.baseHeight / 2; // closed height
      mesh.doorMesh.material.opacity = 1.0;
      mesh.doorMesh.material.transparent = false;
      mesh.barFg.visible = true;
      mesh.barBg.visible = true;
    }
  }

  updateDoorHint() {
    if (!this.hud.doorHint || !this.localId) return;
    const localPlayer = this.players.get(this.localId);
    if (!localPlayer) return;

    let nearest = null;
    let nearestDist = Infinity;
    for (const [id, def] of this.doorDefs) {
      const state = this.doorStates.get(id);
      if (!state || state.open) continue;
      const dist = Math.hypot(def.x - this.predicted.x, def.z - this.predicted.z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { def, state };
      }
    }

    if (!nearest || nearestDist > 9) {
      this.hud.doorHint.classList.add('hidden');
      return;
    }

    const { state } = nearest;
    const hpPct = Math.round((Math.max(0, state.hp) / state.maxHp) * 100);
    const hackPct = Math.round(Math.min(1, state.hackProgress) * 100);
    const canHack = this.localCls === 'engineer' && nearestDist <= DOOR.hackRange;

    this.hud.doorHint.classList.remove('hidden');
    this.hud.doorHint.innerHTML = `
      <div class="door-title">LOCKED DOOR</div>
      <div class="door-bar"><div class="door-bar-fill" style="width:${hpPct}%"></div></div>
      <div class="door-action">Shoot to damage (${hpPct}% hp)</div>
      <div class="door-bar"><div class="door-bar-fill hack" style="width:${hackPct}%"></div></div>
      <div class="door-action">${canHack ? `HOLD ${this.interactPrompt('engineer')} TO HACK` : `Hack progress ${hackPct}%${this.localCls !== 'engineer' ? ' — engineers hack faster' : ''}`}</div>
    `;
  }

  // "HOLD [E]" makes no sense on a touchscreen with no E key — swap it for the icon
  // shown on the actual touch button the player would press.
  interactPrompt(cls) {
    return isTouchDevice() ? INTERACT_ICONS[cls] : '[E]';
  }

  updateReviveHint() {
    if (!this.hud.reviveHint || !this.localId) return;

    let nearest = null;
    let nearestDist = Infinity;
    for (const [id, p] of this.players) {
      if (id === this.localId || p.alive) continue;
      const dist = Math.hypot(p.x - this.predicted.x, p.z - this.predicted.z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = p;
      }
    }

    if (!nearest || nearestDist > REVIVE.range + 4) {
      this.hud.reviveHint.classList.add('hidden');
      return;
    }

    const pct = Math.round(Math.min(1, nearest.reviveProgress || 0) * 100);
    const canRevive = nearestDist <= REVIVE.range;

    this.hud.reviveHint.classList.remove('hidden');
    this.hud.reviveHint.innerHTML = `
      <div class="door-title">DOWNED TEAMMATE</div>
      <div class="door-bar"><div class="door-bar-fill hack" style="width:${pct}%"></div></div>
      <div class="door-action">${canRevive ? `HOLD ${this.interactPrompt(this.localCls)} TO REVIVE` : `Revive progress ${pct}% — get closer`}</div>
    `;
  }

  showBanner(text) {
    if (!this.hud.banner) return;
    this.hud.banner.innerText = text;
    this.hud.banner.classList.remove('hidden');
    this.hud.banner.style.opacity = '1';
    clearTimeout(this._bannerTimeout);
    this._bannerTimeout = setTimeout(() => {
      this.hud.banner.style.opacity = '0';
    }, 2500);
  }

  updateLocalHud(ps) {
    this.localScore = ps.score || 0;
    const roundedHp = Math.round(Math.max(0, ps.hp));
    const pct = Math.round(roundedHp / PLAYER.maxHp * 100);
    if (this.hud.hpFill) this.hud.hpFill.style.width = `${pct}%`;
    if (this.hud.hpText) this.hud.hpText.innerText = `${roundedHp} / ${PLAYER.maxHp}`;
    if (this.hud.deadOverlay) {
      this.hud.deadOverlay.classList.toggle('hidden', ps.alive);
    }
    if (!ps.alive && this.hud.deadSubtitle) {
      const revivePct = Math.round(Math.min(1, ps.reviveProgress || 0) * 100);
      this.hud.deadSubtitle.innerText = ps.revivers > 0
        ? `Being revived by ${ps.revivers} teammate${ps.revivers > 1 ? 's' : ''}... ${revivePct}%`
        : `Awaiting a teammate to hold ${this.interactPrompt(ps.cls)} at your body...`;
      if (this.hud.deadReviveFill) this.hud.deadReviveFill.style.width = `${revivePct}%`;
    }
    if (this.hud.stimTag) {
      this.hud.stimTag.classList.toggle('hidden', !ps.stim);
    }

    if (this.hud.damageVignette) {
      const hpRatio = Math.max(0, Math.min(PLAYER.maxHp, ps.hp)) / PLAYER.maxHp;
      let vignetteOpacity = 0.0;
      if (hpRatio < 0.7) {
        vignetteOpacity = (1.0 - (hpRatio / 0.7)) * 0.85;
      }
      if (!ps.alive) vignetteOpacity = 0.85;
      this.hud.damageVignette.style.opacity = vignetteOpacity;

      const isCritical = hpRatio > 0 && hpRatio <= 0.3 && ps.alive;
      if (isCritical) {
        this.hud.damageVignette.style.setProperty('--vignette-base-opacity', vignetteOpacity);
        this.hud.damageVignette.classList.add('pulse');
      } else {
        this.hud.damageVignette.classList.remove('pulse');
      }
    }

    const ability = CLASSES[ps.cls]?.ability;
    if (ability && this.hud.abilityHud) {
      this.hud.abilityHud.classList.remove('hidden');
      const maxCd = ABILITY_COOLDOWN[ability];
      const ready = ps.abilityCooldown <= 0;
      if (this.hud.abilityLabel) {
        this.hud.abilityLabel.innerText = ready
          ? `[Q] ${ABILITY_LABELS[ability]}`
          : `${ABILITY_LABELS[ability]} — ${ps.abilityCooldown.toFixed(1)}s`;
      }
      if (this.hud.abilityFill) {
        const readyPct = (1 - ps.abilityCooldown / maxCd) * 100;
        this.hud.abilityFill.style.width = `${Math.max(0, Math.min(100, readyPct))}%`;
        this.hud.abilityFill.classList.toggle('ready', ready);
      }
    }
    if (this.hud.grenadeHud) {
      this.hud.grenadeHud.classList.remove('hidden');
      const hasGrenade = ps.grenades > 0;
      if (this.hud.grenadeLabel) {
        this.hud.grenadeLabel.innerText = hasGrenade ? '[G] GRENADE' : 'GRENADE (DEPLETED)';
      }
      if (this.hud.grenadeFill) {
        this.hud.grenadeFill.style.width = hasGrenade ? '100%' : '0%';
        this.hud.grenadeFill.classList.toggle('ready', hasGrenade);
      }
    }
    audio.setLowpass(!ps.alive);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    gamepad.poll();

    if (this.screenShakeIntensity > 0) {
      this.screenShakeIntensity = Math.max(0, this.screenShakeIntensity - dt * 2.2);
    }

    if (this.state === 'JOIN') {
      this.updateJoinScreenGamepad();
    }

    if (this.state === 'PLAYING' && net.connected && this.localId != null && this.world) {
      this.updateLocalPlayer(dt);
      this.smoothRemoteEntities(dt);
      this.updateCamera(dt);
    }

    tracers.update(dt);
    explosions.update(dt);
    particles.update(dt);
    mistZones.update(dt);
    if (this.teleporter) this.teleporter.update(dt);
    for (const p of this.pickups.values()) p.update(dt);
    for (const z of this.healZones.values()) z.update(dt);
    for (const z of this.stimZones.values()) z.update(dt);
    for (const t of this.turrets.values()) t.update(dt);
    for (const e of this.enemies.values()) e.update(dt);
    for (const p of this.players.values()) p.update(dt);
    for (const n of this.alienNests.values()) n.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateLocalPlayer(dt) {
    const localPlayer = this.players.get(this.localId);
    if (!localPlayer) return;

    const move = touchControls.moveVector || gamepad.moveVector || input.moveVector;
    const aim = this.computeAimAngle();
    const blockingRects = this.getBlockingRects();

    const len = Math.hypot(move.x, move.z);
    if (len > 0) {
      const inputLen = Math.min(1, len);
      const nx = move.x / len;
      const nz = move.z / len;
      let x = this.predicted.x + nx * PLAYER.speed * inputLen * dt;
      let z = this.predicted.z + nz * PLAYER.speed * inputLen * dt;
      [x, z] = clampToWorld(x, z, PLAYER.radius, this.world);
      [x, z] = resolveWallCollisions(x, z, PLAYER.radius, blockingRects);
      this.predicted.x = x;
      this.predicted.z = z;
    }

    if (this.reconcileTarget) {
      const dx = this.reconcileTarget.x - this.predicted.x;
      const dz = this.reconcileTarget.z - this.predicted.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.5) {
        this.predicted.x = this.reconcileTarget.x;
        this.predicted.z = this.reconcileTarget.z;
      } else if (dist > 0.02) {
        const t = Math.min(1, RECONCILE_RATE * dt);
        this.predicted.x += dx * t;
        this.predicted.z += dz * t;
      }
    }

    localPlayer.setTransform(this.predicted.x, this.predicted.z, aim);

    const firing = input.firing || gamepad.firing || touchControls.firing;
    const hacking = input.hacking || gamepad.interacting || touchControls.interacting;
    net.sendInput(move.x, move.z, aim, firing, hacking);
    if (input.consumeAbilityPress() || gamepad.consumeAbilityPress() || touchControls.consumeAbilityPress()) net.sendAbility();
    if (input.consumeGrenadePress()) net.sendGrenade();
  }

  computeAimAngle() {
    const localPlayer = this.players.get(this.localId);
    if (!localPlayer) return 0;

    const touchAim = touchControls.aimVector;
    if (touchAim) return Math.atan2(touchAim.x, touchAim.z);

    const gpAim = gamepad.aimVector;
    if (gpAim) return Math.atan2(gpAim.x, gpAim.z);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(input.pointerNdc || { x: 0, y: 0 }, this.camera);
    const groundY = 0;
    const dirY = raycaster.ray.direction.y;
    if (Math.abs(dirY) < 1e-6) return localPlayer.angle;
    const t = (groundY - raycaster.ray.origin.y) / dirY;
    if (t < 0) return localPlayer.angle;
    const hit = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, t);

    const dx = hit.x - this.predicted.x;
    const dz = hit.z - this.predicted.z;
    if (Math.hypot(dx, dz) < 0.01) return localPlayer.angle;
    return Math.atan2(dx, dz);
  }

  smoothRemoteEntities(dt) {
    const t = 1 - Math.exp(-SMOOTH_RATE * dt);

    for (const [id, target] of this.remoteTargets) {
      const p = this.players.get(id);
      if (!p) continue;
      const x = p.x + (target.x - p.x) * t;
      const z = p.z + (target.z - p.z) * t;
      p.setTransform(x, z, target.angle);
    }

    for (const [id, target] of this.enemyTargets) {
      const e = this.enemies.get(id);
      if (!e) continue;
      const x = e.x + (target.x - e.x) * t;
      const z = e.z + (target.z - e.z) * t;
      e.setTransform(x, z, target.angle);
    }
  }

  updateCamera(dt) {
    const targetPos = new THREE.Vector3(this.predicted.x, 17, this.predicted.z + 10);
    const targetLook = new THREE.Vector3(this.predicted.x, 0, this.predicted.z);
    this.camera.position.lerp(targetPos, Math.min(1, dt * 6));
    if (!this._lookAt) this._lookAt = targetLook.clone();
    this._lookAt.lerp(targetLook, Math.min(1, dt * 8));

    if (this.screenShakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.screenShakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.screenShakeIntensity;
      this.camera.position.z += (Math.random() - 0.5) * this.screenShakeIntensity;
    }

    this.camera.lookAt(this._lookAt);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

const PLAYER_SPAWN_FALLBACK = { x: 0, z: 9 };

export const game = new GameEngine();
export default game;
