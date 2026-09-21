import * as THREE from 'three/webgpu';
import { ENEMY_TYPES } from '@air-swarm/shared';

const FADE_IN_TIME = 0.9; // seconds to emerge from the mist to full visibility

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Helper to create a mesh, enable shadows, and register it to a parent group
function createMesh(geometry, material, parent, shadow = true) {
  const mesh = new THREE.Mesh(geometry, material);
  if (shadow) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  if (parent) {
    parent.add(mesh);
  }
  return mesh;
}

// Builders for each specific enemy type

function buildDroneModel(enemy, color, radius) {
  const bodyGroup = new THREE.Group();
  
  // Materials
  const bodyMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.4,
    metalness: 0.3,
    transparent: true,
    opacity: 0,
  });
  const detailMat = new THREE.MeshStandardMaterial({
    color: 0x18201b,
    roughness: 0.7,
    metalness: 0.1,
    transparent: true,
    opacity: 0,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x39ff14,
    emissiveIntensity: 1.8,
    transparent: true,
    opacity: 0,
  });

  // Thorax (central body)
  const thoraxGeom = new THREE.BoxGeometry(radius * 0.75, radius * 0.55, radius * 1.05);
  createMesh(thoraxGeom, bodyMat, bodyGroup);

  // Head
  const headGeom = new THREE.SphereGeometry(radius * 0.32, 8, 8);
  const head = createMesh(headGeom, bodyMat, bodyGroup);
  head.position.set(0, radius * 0.1, radius * 0.62);

  // Glowing eyes
  const eyeGeom = new THREE.SphereGeometry(radius * 0.08, 6, 6);
  const leftEye = createMesh(eyeGeom, eyeMat, head);
  leftEye.position.set(-radius * 0.14, radius * 0.1, radius * 0.22);
  const rightEye = createMesh(eyeGeom, eyeMat, head);
  rightEye.position.set(radius * 0.14, radius * 0.1, radius * 0.22);

  // Abdomen (tapered tail at the back)
  const abdomenGeom = new THREE.ConeGeometry(radius * 0.32, radius * 0.95, 5);
  const abdomen = createMesh(abdomenGeom, bodyMat, bodyGroup);
  abdomen.rotation.x = -Math.PI / 2.3; // point tail up and back
  abdomen.position.set(0, radius * 0.15, -radius * 0.65);

  // Mandibles (front pinchers)
  const mandibleGeom = new THREE.BoxGeometry(0.04, 0.04, radius * 0.45);
  
  const leftMandiblePivot = new THREE.Group();
  leftMandiblePivot.position.set(-radius * 0.12, 0, radius * 0.72);
  bodyGroup.add(leftMandiblePivot);
  const leftMandible = createMesh(mandibleGeom, detailMat, leftMandiblePivot);
  leftMandible.position.set(-radius * 0.04, 0, radius * 0.18);
  leftMandible.rotation.y = -Math.PI / 10;

  const rightMandiblePivot = new THREE.Group();
  rightMandiblePivot.position.set(radius * 0.12, 0, radius * 0.72);
  bodyGroup.add(rightMandiblePivot);
  const rightMandible = createMesh(mandibleGeom, detailMat, rightMandiblePivot);
  rightMandible.position.set(radius * 0.04, 0, radius * 0.18);
  rightMandible.rotation.y = Math.PI / 10;

  // 6 jointed legs
  const legPivots = [];
  const legSides = [-1, 1]; // Left, Right
  const legOffsetsZ = [radius * 0.35, 0, -radius * 0.35]; // Front, Middle, Back

  for (const side of legSides) {
    for (let i = 0; i < legOffsetsZ.length; i++) {
      const zOffset = legOffsetsZ[i];
      const legPivot = new THREE.Group();
      legPivot.position.set(side * radius * 0.35, 0, zOffset);
      bodyGroup.add(legPivot);

      // Upper leg segment (points out and up)
      const upperGeom = new THREE.BoxGeometry(0.045, 0.045, radius * 0.52);
      const upper = createMesh(upperGeom, bodyMat, legPivot);
      upper.position.set(side * radius * 0.22, radius * 0.15, 0);
      upper.rotation.z = side * Math.PI / 6;

      // Lower leg segment (points down to ground)
      const lowerGeom = new THREE.BoxGeometry(0.032, 0.032, radius * 0.75);
      const lower = createMesh(lowerGeom, detailMat, upper);
      lower.position.set(side * radius * 0.22, -radius * 0.32, 0);
      lower.rotation.z = -side * Math.PI / 3;

      legPivots.push({
        pivot: legPivot,
        side: side,
        index: i,
      });
    }
  }

  enemy.modelGroup = bodyGroup;
  enemy.animParts = {
    legPivots,
    leftMandiblePivot,
    rightMandiblePivot,
  };
  enemy.material = bodyMat;
}

function buildBruteModel(enemy, color, radius) {
  const bodyGroup = new THREE.Group();

  // Materials
  const bodyMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.75,
    metalness: 0.1,
    transparent: true,
    opacity: 0,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x3d2217,
    roughness: 0.85,
    metalness: 0.25,
    transparent: true,
    opacity: 0,
  });
  const ventMat = new THREE.MeshStandardMaterial({
    color: 0x1f1a18,
    roughness: 0.7,
    transparent: true,
    opacity: 0,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xff3300,
    emissive: 0xff3300,
    emissiveIntensity: 2.2,
    transparent: true,
    opacity: 0,
  });

  // Humped Torso
  const torsoGeom = new THREE.DodecahedronGeometry(radius * 0.75, 0);
  const torso = createMesh(torsoGeom, bodyMat, bodyGroup);
  torso.scale.set(1.22, 0.92, 1.28);
  torso.position.y = radius * 0.85;

  // Carapace Back Plates (overlapping tiles)
  const plateCount = 3;
  const carapacePlates = [];
  for (let i = 0; i < plateCount; i++) {
    const scale = 1.0 - i * 0.12;
    const plateGeom = new THREE.BoxGeometry(radius * 1.32 * scale, radius * 0.2, radius * 0.48);
    const plate = createMesh(plateGeom, armorMat, bodyGroup);
    plate.position.set(0, radius * 1.25 - i * 0.12, -radius * 0.08 - i * 0.28);
    plate.rotation.x = -Math.PI / 12 - i * (Math.PI / 20);
    carapacePlates.push(plate);
  }

  // Low-slung tucked head
  const headGeom = new THREE.BoxGeometry(radius * 0.52, radius * 0.42, radius * 0.42);
  const head = createMesh(headGeom, bodyMat, bodyGroup);
  head.position.set(0, radius * 0.65, radius * 0.65);
  head.rotation.x = Math.PI / 10;

  // Red glowing visor slit
  const visorGeom = new THREE.BoxGeometry(radius * 0.42, 0.05, 0.05);
  const visor = createMesh(visorGeom, glowMat, head);
  visor.position.set(0, 0.04, radius * 0.21);

  // Massive Front Crushing Arms
  const armPivots = [];
  const armSides = [-1, 1];
  for (const side of armSides) {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * radius * 0.72, radius * 0.95, radius * 0.45);
    bodyGroup.add(armPivot);

    // Shoulder / Upper Arm
    const upperGeom = new THREE.BoxGeometry(radius * 0.38, radius * 0.75, radius * 0.38);
    const upper = createMesh(upperGeom, bodyMat, armPivot);
    upper.position.set(side * radius * 0.12, -radius * 0.28, 0);
    upper.rotation.z = side * Math.PI / 12;

    // Lower Arm / Giant Claw
    const clawPivot = new THREE.Group();
    clawPivot.position.set(side * radius * 0.08, -radius * 0.55, radius * 0.18);
    upper.add(clawPivot);

    const lowerGeom = new THREE.BoxGeometry(radius * 0.32, radius * 0.62, radius * 0.55);
    const lower = createMesh(lowerGeom, armorMat, clawPivot);
    lower.position.set(0, -radius * 0.2, radius * 0.12);

    // Inside claw pincer spike
    const pincerGeom = new THREE.ConeGeometry(radius * 0.08, radius * 0.32, 4);
    const pincer = createMesh(pincerGeom, armorMat, lower);
    pincer.position.set(-side * radius * 0.12, -radius * 0.18, radius * 0.32);
    pincer.rotation.x = Math.PI / 2;
    pincer.rotation.y = side * Math.PI / 6;

    armPivots.push({ pivot: armPivot, side });
  }

  // Squat heavy hind legs
  const legPivots = [];
  for (const side of armSides) {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * radius * 0.52, radius * 0.5, -radius * 0.52);
    bodyGroup.add(legPivot);

    const legGeom = new THREE.BoxGeometry(radius * 0.32, radius * 0.6, radius * 0.32);
    const leg = createMesh(legGeom, bodyMat, legPivot);
    leg.position.set(0, -radius * 0.18, 0);

    legPivots.push({ pivot: legPivot, side });
  }

  // Exhaust Vents on the upper back (pulse when moving)
  const vents = [];
  const ventOffsetsX = [-radius * 0.32, radius * 0.32];
  for (const xOffset of ventOffsetsX) {
    const ventPivot = new THREE.Group();
    ventPivot.position.set(xOffset, radius * 1.15, -radius * 0.42);
    ventPivot.rotation.x = -Math.PI / 4;
    bodyGroup.add(ventPivot);

    const ventGeom = new THREE.CylinderGeometry(radius * 0.08, radius * 0.09, radius * 0.38, 6);
    const vent = createMesh(ventGeom, ventMat, ventPivot);

    const fireGeom = new THREE.SphereGeometry(radius * 0.065, 6, 6);
    const fire = createMesh(fireGeom, glowMat, vent);
    fire.position.y = radius * 0.2;

    vents.push({ fire });
  }

  enemy.modelGroup = bodyGroup;
  enemy.animParts = {
    armPivots,
    legPivots,
    vents,
    carapacePlates,
  };
  enemy.material = glowMat;
}

function buildSpitterModel(enemy, color, radius) {
  const bodyGroup = new THREE.Group();

  // Materials
  const bodyMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.45,
    metalness: 0.15,
    transparent: true,
    opacity: 0,
  });
  const detailMat = new THREE.MeshStandardMaterial({
    color: 0x1a0f2b,
    roughness: 0.75,
    metalness: 0.1,
    transparent: true,
    opacity: 0,
  });
  const sacMat = new THREE.MeshStandardMaterial({
    color: 0x9400d3,
    emissive: 0x9400d3,
    emissiveIntensity: 1.3,
    transparent: true,
    opacity: 0,
  });
  sacMat.userData.baseOpacity = 0.85;

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xda70d6,
    emissive: 0xda70d6,
    emissiveIntensity: 2.2,
    transparent: true,
    opacity: 0,
  });

  // Raised thorax
  const thoraxGeom = new THREE.IcosahedronGeometry(radius * 0.46, 1);
  const thorax = createMesh(thoraxGeom, bodyMat, bodyGroup);
  thorax.position.y = radius * 1.15;

  // Glowing Purple Venom Sac
  const sacGeom = new THREE.SphereGeometry(radius * 0.62, 12, 12);
  const sac = createMesh(sacGeom, sacMat, bodyGroup);
  sac.position.set(0, radius * 1.35, -radius * 0.38);
  sac.scale.set(1.0, 0.9, 1.25);

  // Spitting Snout Tube
  const snoutPivot = new THREE.Group();
  snoutPivot.position.set(0, radius * 1.22, radius * 0.32);
  bodyGroup.add(snoutPivot);

  const snoutGeom = new THREE.CylinderGeometry(radius * 0.08, radius * 0.18, radius * 0.85, 8);
  const snout = createMesh(snoutGeom, bodyMat, snoutPivot);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0, radius * 0.32);

  // glowing bio-core inside nozzle
  const fireGeom = new THREE.SphereGeometry(radius * 0.08, 6, 6);
  const fire = createMesh(fireGeom, glowMat, snout);
  fire.position.y = radius * 0.42;

  // Thin Feelers
  const feelerPivots = [];
  const feelerSides = [-1, 1];
  for (const side of feelerSides) {
    const fPivot = new THREE.Group();
    fPivot.position.set(side * radius * 0.12, radius * 1.35, radius * 0.32);
    fPivot.rotation.set(-Math.PI / 6, side * Math.PI / 10, 0);
    bodyGroup.add(fPivot);

    const fGeom = new THREE.CylinderGeometry(0.015, 0.015, radius * 0.65, 4);
    const feeler = createMesh(fGeom, detailMat, fPivot);
    feeler.position.y = radius * 0.28;

    feelerPivots.push(fPivot);
  }

  // 4 Arching Spider Legs (Raise the body off the ground)
  const legPivots = [];
  const legSides = [-1, 1];
  const legAngles = [Math.PI / 3.8, 3.2 * Math.PI / 4]; // Angles for front and back leg arches

  for (const side of legSides) {
    for (const baseAngle of legAngles) {
      const angle = side === 1 ? baseAngle : Math.PI - baseAngle;
      const legPivot = new THREE.Group();
      legPivot.position.set(side * radius * 0.32, radius * 1.12, Math.cos(angle) * radius * 0.32);
      bodyGroup.add(legPivot);

      // Upper arch leg
      const upperGeom = new THREE.BoxGeometry(0.04, 0.04, radius * 0.9);
      const upper = createMesh(upperGeom, bodyMat, legPivot);
      upper.position.set(side * radius * 0.28, radius * 0.22, 0);
      upper.rotation.z = side * Math.PI / 4;
      upper.rotation.y = angle - side * Math.PI / 2;

      // Lower pointer leg
      const lowerGeom = new THREE.BoxGeometry(0.03, 0.03, radius * 1.38);
      const lower = createMesh(lowerGeom, detailMat, upper);
      lower.position.set(side * radius * 0.18, -radius * 0.62, 0);
      lower.rotation.z = -side * Math.PI / 2.3;

      legPivots.push({ pivot: legPivot, side, angle });
    }
  }

  enemy.modelGroup = bodyGroup;
  enemy.animParts = {
    legPivots,
    feelerPivots,
    sac,
    glowCore: fire,
  };
  enemy.material = sacMat;
}

function buildBoomerModel(enemy, color, radius) {
  const bodyGroup = new THREE.Group();

  // Materials
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x422f12, // Dark chemical-stained chitin
    roughness: 0.72,
    transparent: true,
    opacity: 0,
  });
  const sacMat = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.65,
    roughness: 0.45,
    metalness: 0.15,
    transparent: true,
    opacity: 0,
  });
  const pustuleMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xff9900,
    emissiveIntensity: 1.6,
    roughness: 0.3,
    transparent: true,
    opacity: 0,
  });

  // Tiny face mouth
  const headGeom = new THREE.ConeGeometry(radius * 0.24, radius * 0.48, 6);
  const head = createMesh(headGeom, bodyMat, bodyGroup);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, radius * 0.25, radius * 0.58);

  // Swollen chemical balloon
  const sacGeom = new THREE.SphereGeometry(radius * 0.95, 12, 12);
  const sac = createMesh(sacGeom, sacMat, bodyGroup);
  sac.position.y = radius * 0.75;
  sac.scale.set(1.12, 1.0, 1.12);

  // Clustered volatile pustules
  const pustules = [];
  const pustuleConfigs = [
    { pos: [-radius * 0.38, radius * 1.25, -radius * 0.18], r: 0.18 },
    { pos: [radius * 0.38, radius * 1.25, -radius * 0.18], r: 0.16 },
    { pos: [0, radius * 1.5, -radius * 0.08], r: 0.22 },
    { pos: [-radius * 0.55, radius * 0.88, -radius * 0.45], r: 0.16 },
    { pos: [radius * 0.55, radius * 0.88, -radius * 0.45], r: 0.15 },
    { pos: [0, radius * 1.1, -radius * 0.72], r: 0.2 },
    { pos: [-radius * 0.58, radius * 0.75, radius * 0.08], r: 0.14 },
    { pos: [radius * 0.58, radius * 0.75, radius * 0.08], r: 0.14 },
  ];

  for (const cfg of pustuleConfigs) {
    const pGeom = new THREE.SphereGeometry(cfg.r * radius, 8, 8);
    const pMesh = createMesh(pGeom, pustuleMat, bodyGroup);
    pMesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    pustules.push(pMesh);
  }

  // 6 short scurrying legs
  const legPivots = [];
  const legSides = [-1, 1];
  const legOffsetsZ = [radius * 0.38, 0, -radius * 0.38];

  for (const side of legSides) {
    for (let i = 0; i < legOffsetsZ.length; i++) {
      const zOffset = legOffsetsZ[i];
      const legPivot = new THREE.Group();
      legPivot.position.set(side * radius * 0.52, radius * 0.15, zOffset);
      bodyGroup.add(legPivot);

      const legGeom = new THREE.CylinderGeometry(0.028, 0.018, radius * 0.32, 4);
      const leg = createMesh(legGeom, bodyMat, legPivot);
      leg.position.y = -radius * 0.08;
      leg.rotation.z = side * Math.PI / 6;

      legPivots.push({ pivot: legPivot, side, index: i });
    }
  }

  enemy.modelGroup = bodyGroup;
  enemy.animParts = {
    legPivots,
    sac,
    pustules,
  };
  enemy.material = sacMat;
}

function buildModel(enemy, type, color, radius) {
  switch (type) {
    case 'brute':
      buildBruteModel(enemy, color, radius);
      break;
    case 'spitter':
      buildSpitterModel(enemy, color, radius);
      break;
    case 'boomer':
      buildBoomerModel(enemy, color, radius);
      break;
    case 'drone':
    default:
      buildDroneModel(enemy, color, radius);
      break;
  }
}

export class Enemy {
  constructor(id, type = 'drone') {
    this.id = id;
    this.type = type;
    this.x = 0;
    this.z = 0;
    this.angle = 0;

    const def = ENEMY_TYPES[type] || ENEMY_TYPES.drone;
    this.def = def;

    this._pulseT = Math.random() * 10;
    this._age = 0;
    this._faded = false;
    this._animTime = Math.random() * 100;

    this.group = new THREE.Group();
    this.animParts = {};
    this.modelGroup = null;
    this.material = null; // Defined by builder

    buildModel(this, type, def.color, def.radius);

    // Keep reference for compatibility with mesh accesses
    this.mesh = this.modelGroup;

    // Scale set to 0.3 initially, fades/emerges up to 1.0
    this.modelGroup.scale.setScalar(0.3);
    this.group.add(this.modelGroup);
  }

  setTransform(x, z, angle) {
    this.x = x;
    this.z = z;
    this.angle = angle;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = angle;
  }

  update(dt) {
    // Fade in / Emergence transition
    if (!this._faded) {
      this._age += dt;
      const t = Math.min(1, this._age / FADE_IN_TIME);
      const eased = smoothstep(t);
      
      // Update opacity on all child meshes
      this.modelGroup.traverse((child) => {
        if (child.isMesh && child.material) {
          const baseOp = child.userData.baseOpacity !== undefined ? child.userData.baseOpacity : 1.0;
          child.material.opacity = eased * baseOp;
        }
      });

      this.modelGroup.scale.setScalar(0.3 + eased * 0.7);
      if (t >= 1) this._faded = true;
    }

    // Accumulate animation time scaled by enemy's default speed
    const speedScale = this.def.speed || 3.0;
    this._animTime += dt * speedScale * 4.2;

    // Animate parts based on enemy type
    if (this.type === 'drone') {
      // 1. Scuttle legs
      if (this.animParts.legPivots) {
        this.animParts.legPivots.forEach((leg) => {
          const phaseOffset = leg.side * Math.PI / 4 + leg.index * Math.PI / 2;
          const tVal = this._animTime + phaseOffset;
          // scuttle Y rotation
          leg.pivot.rotation.y = Math.sin(tVal) * 0.35;
          // step Z rotation
          leg.pivot.rotation.z = Math.max(-0.15, Math.cos(tVal) * 0.25) * leg.side;
        });
      }
      // 2. Pinch mandibles
      if (this.animParts.leftMandiblePivot && this.animParts.rightMandiblePivot) {
        const pinch = Math.sin(this._animTime * 0.4) * 0.18;
        this.animParts.leftMandiblePivot.rotation.y = pinch;
        this.animParts.rightMandiblePivot.rotation.y = -pinch;
      }
    } else if (this.type === 'brute') {
      // 1. Swing heavy arm shoulders
      if (this.animParts.armPivots) {
        this.animParts.armPivots.forEach((arm) => {
          const phase = this._animTime * 0.65 + (arm.side === 1 ? 0 : Math.PI);
          arm.pivot.rotation.x = Math.sin(phase) * 0.42;
          arm.pivot.rotation.z = (Math.PI / 12 + Math.cos(phase) * 0.08) * arm.side;
        });
      }
      // 2. Heavy hind leg step
      if (this.animParts.legPivots) {
        this.animParts.legPivots.forEach((leg) => {
          const phase = this._animTime * 0.65 + (leg.side === 1 ? Math.PI : 0);
          leg.pivot.rotation.x = Math.sin(phase) * 0.32;
        });
      }
      // 3. Vent exhaust pulses
      this._pulseT += dt * 3.5;
      const pulseIntensity = 1.2 + Math.sin(this._pulseT) * 0.8;
      this.modelGroup.traverse((child) => {
        if (child.isMesh && child.material && child.material.emissive && child.material.color.getHex() === 0xff3300) {
          child.material.emissiveIntensity = pulseIntensity;
        }
      });
    } else if (this.type === 'spitter') {
      // 1. Arching spider leg walk
      if (this.animParts.legPivots) {
        this.animParts.legPivots.forEach((leg) => {
          const phaseOffset = leg.side * Math.PI / 3 + Math.atan2(Math.sin(leg.angle), Math.cos(leg.angle)) * 2;
          const tVal = this._animTime * 0.8 + phaseOffset;
          leg.pivot.rotation.y = Math.sin(tVal) * 0.22;
          leg.pivot.rotation.z = (Math.max(0, Math.cos(tVal)) * 0.28) * leg.side;
        });
      }
      // 2. Venom sac breathing
      if (this.animParts.sac) {
        const pulse = 1.0 + Math.sin(this._animTime * 0.12) * 0.06;
        this.animParts.sac.scale.set(pulse, pulse * 0.9, pulse * 1.25);
      }
      // 3. Antennae twitching
      if (this.animParts.feelerPivots) {
        this.animParts.feelerPivots.forEach((fPivot, idx) => {
          const side = idx === 0 ? -1 : 1;
          fPivot.rotation.z = side * Math.PI / 10 + Math.sin(this._animTime * 1.2) * 0.08;
          fPivot.rotation.x = -Math.PI / 6 + Math.cos(this._animTime * 1.5) * 0.08;
        });
      }
      // 4. Glow core pulsation
      if (this.animParts.glowCore) {
        this.animParts.glowCore.material.emissiveIntensity = 1.4 + Math.sin(this._animTime * 0.6) * 0.7;
      }
    } else if (this.type === 'boomer') {
      // 1. Rapid top-heavy waddle
      const waddleSpeed = this._animTime * 1.15;
      this.modelGroup.position.y = Math.abs(Math.sin(waddleSpeed)) * 0.12;
      this.modelGroup.rotation.z = Math.sin(waddleSpeed) * 0.14;
      this.modelGroup.rotation.y = Math.cos(waddleSpeed * 0.5) * 0.08;

      // 2. Tiny scuttling legs
      if (this.animParts.legPivots) {
        this.animParts.legPivots.forEach((leg) => {
          const phaseOffset = leg.side * Math.PI / 3 + leg.index * Math.PI / 2;
          const tVal = waddleSpeed * 1.6 + phaseOffset;
          leg.pivot.rotation.x = Math.sin(tVal) * 0.5;
        });
      }
      // 3. Chemical swelling sac and pustules
      this._pulseT += dt * 6.8;
      const pulseFactor = 0.5 + Math.sin(this._pulseT) * 0.4;
      const sacScale = 1.0 + pulseFactor * 0.14;
      if (this.animParts.sac) {
        this.animParts.sac.scale.set(sacScale * 1.12, sacScale * 1.0, sacScale * 1.12);
      }
      if (this.animParts.pustules) {
        this.animParts.pustules.forEach((pMesh, idx) => {
          const individualPhase = idx * Math.PI / 4;
          const pScale = 1.0 + (0.5 + Math.sin(this._pulseT * 1.2 + individualPhase) * 0.4) * 0.3;
          pMesh.scale.setScalar(pScale);
        });
      }
      // 4. Update emissive intensities
      if (this.material) {
        this.material.emissiveIntensity = 0.4 + pulseFactor * 0.65;
      }
      this.modelGroup.traverse((child) => {
        if (child.isMesh && child.material && child.material.color.getHex() === 0xffaa00) {
          child.material.emissiveIntensity = 1.0 + pulseFactor * 1.2;
        }
      });
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    
    // Explicitly clean up geometry and material memory to prevent WebGL memory leaks
    this.group.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
}
