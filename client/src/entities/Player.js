import * as THREE from 'three/webgpu';
import { FX } from './Particles.js';

const COLORS = [0x4fd1c5, 0xf6ad55, 0x9f7aea, 0xf56565];

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

export class Player {
  constructor(id, isLocal) {
    this.id = id;
    this.isLocal = isLocal;
    this.x = 0;
    this.z = 0;
    this.angle = 0;
    this.hp = 100;
    this.alive = true;
    this.downed = false;

    const color = COLORS[(id - 1) % COLORS.length];
    this.group = new THREE.Group();

    // Materials
    const armorMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isLocal ? 0.25 : 0.1,
      roughness: 0.55,
      metalness: 0.3,
      transparent: true,
    });
    const detailMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d24, // Industrial black undersuit
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff, // Glowing cyan visor
      emissive: 0x00ffff,
      emissiveIntensity: 1.5,
      roughness: 0.15,
      transparent: true,
    });
    const weaponMat = new THREE.MeshStandardMaterial({
      color: 0x2e3440, // Weapon carbon steel
      roughness: 0.6,
      metalness: 0.7,
      transparent: true,
    });

    // 1. Chibi Marine Body Group
    this.body = new THREE.Group();
    this.body.position.y = 0.9;
    this.group.add(this.body);
    this.bodyStandY = 0.9;
    this.bodyColor = color;

    // Torso Armor
    const torsoGeom = new THREE.BoxGeometry(0.38, 0.38, 0.32);
    const torso = createMesh(torsoGeom, armorMat, this.body);
    torso.position.set(0, -0.2, 0);
    torso.userData.isArmor = true;

    // Undersuit Belt/Waist
    const beltGeom = new THREE.CylinderGeometry(0.15, 0.15, 0.08, 8);
    const belt = createMesh(beltGeom, detailMat, this.body);
    belt.position.set(0, -0.4, 0);

    // Life-Support Backpack
    const packGeom = new THREE.BoxGeometry(0.3, 0.38, 0.16);
    const pack = createMesh(packGeom, armorMat, this.body);
    pack.position.set(0, -0.15, -0.18);
    pack.userData.isArmor = true;

    // Thruster nozzles
    const nozzleGeom = new THREE.CylinderGeometry(0.04, 0.03, 0.12, 6);
    nozzleGeom.rotateX(Math.PI / 6);
    createMesh(nozzleGeom, detailMat, pack).position.set(-0.1, 0.12, -0.06);
    createMesh(nozzleGeom, detailMat, pack).position.set(0.1, 0.12, -0.06);

    // Oversized Helmet (Chibi head)
    const helmetGeom = new THREE.SphereGeometry(0.28, 10, 10);
    const helmet = createMesh(helmetGeom, armorMat, this.body);
    helmet.position.set(0, 0.15, 0);
    helmet.userData.isArmor = true;

    // Glowing Cyan Visor
    const visorGeom = new THREE.BoxGeometry(0.32, 0.1, 0.1);
    const visor = createMesh(visorGeom, visorMat, helmet);
    visor.position.set(0, 0.04, 0.2);
    visor.userData.isVisor = true;

    // Helmet Side Vents
    const earGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 6);
    earGeom.rotateZ(Math.PI / 2);
    createMesh(earGeom, detailMat, helmet).position.set(-0.25, 0, 0);
    createMesh(earGeom, detailMat, helmet).position.set(0.25, 0, 0);

    // Shoulder Pauldrons & Stubby Arms
    const pauldronGeom = new THREE.SphereGeometry(0.12, 8, 8);
    const armGeom = new THREE.BoxGeometry(0.06, 0.06, 0.18);

    // Left Arm
    const leftPauldron = createMesh(pauldronGeom, armorMat, this.body);
    leftPauldron.position.set(-0.26, -0.12, 0.02);
    leftPauldron.userData.isArmor = true;
    const leftArm = createMesh(armGeom, detailMat, leftPauldron);
    leftArm.position.set(0.02, -0.08, 0.08);
    leftArm.rotation.x = Math.PI / 6;

    // Right Arm
    const rightPauldron = createMesh(pauldronGeom, armorMat, this.body);
    rightPauldron.position.set(0.26, -0.12, 0.02);
    rightPauldron.userData.isArmor = true;
    const rightArm = createMesh(armGeom, detailMat, rightPauldron);
    rightArm.position.set(-0.02, -0.08, 0.08);
    rightArm.rotation.x = Math.PI / 6;

    // Stubby Legs & Boots
    const legGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.22, 6);
    const bootGeom = new THREE.BoxGeometry(0.12, 0.1, 0.18);

    // Left leg
    const leftLeg = createMesh(legGeom, detailMat, this.body);
    leftLeg.position.set(-0.12, -0.52, 0);
    const leftBoot = createMesh(bootGeom, armorMat, leftLeg);
    leftBoot.position.set(0, -0.12, 0.04);
    leftBoot.userData.isArmor = true;

    // Right leg
    const rightLeg = createMesh(legGeom, detailMat, this.body);
    rightLeg.position.set(0.12, -0.52, 0);
    const rightBoot = createMesh(bootGeom, armorMat, rightLeg);
    rightBoot.position.set(0, -0.12, 0.04);
    rightBoot.userData.isArmor = true;

    // 2. Assault Rifle (Serves as aiming/facing indicator)
    this.facing = new THREE.Group();
    this.facing.position.set(0, 0.72, 0.18);
    this.group.add(this.facing);

    // Gun body
    const gunBodyGeom = new THREE.BoxGeometry(0.07, 0.1, 0.38);
    const gunBody = createMesh(gunBodyGeom, weaponMat, this.facing);
    gunBody.position.set(0.12, 0, 0.15); // held in right arm extension

    // Gun barrel
    const barrelGeom = new THREE.CylinderGeometry(0.022, 0.022, 0.28, 6);
    barrelGeom.rotateX(Math.PI / 2);
    const barrel = createMesh(barrelGeom, detailMat, gunBody);
    barrel.position.set(0, 0.02, 0.28);

    // Ammo clip
    const clipGeom = new THREE.BoxGeometry(0.04, 0.12, 0.06);
    const clip = createMesh(clipGeom, detailMat, gunBody);
    clip.position.set(0, -0.1, 0.08);
    clip.rotation.x = -Math.PI / 12;

    // Muzzle Flash
    this.muzzleFlash = new THREE.Group();
    this.muzzleFlash.position.set(0, 0.02, 0.44);
    gunBody.add(this.muzzleFlash);

    this.muzzleFlashMat = new THREE.MeshBasicMaterial({
      color: 0xffea60,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const starGeom1 = new THREE.PlaneGeometry(0.36, 0.36);
    this.muzzleFlash.add(new THREE.Mesh(starGeom1, this.muzzleFlashMat));

    const starGeom2 = new THREE.PlaneGeometry(0.26, 0.26);
    starGeom2.rotateZ(Math.PI / 4);
    this.muzzleFlash.add(new THREE.Mesh(starGeom2, this.muzzleFlashMat));

    const spikeGeom = new THREE.ConeGeometry(0.07, 0.26, 6);
    spikeGeom.rotateX(Math.PI / 2);
    spikeGeom.translate(0, 0, 0.13);
    this.muzzleFlash.add(new THREE.Mesh(spikeGeom, this.muzzleFlashMat));

    this.muzzleLight = new THREE.PointLight(0xffcc44, 0, 5.5);
    this.muzzleLight.position.set(0, 0, 0.15);
    this.muzzleFlash.add(this.muzzleLight);

    this.muzzleFlash.visible = false;
    this.muzzleFlashTimer = 0;

    // 3. Name Label Sprite
    this.nameSprite = makeLabel(isLocal ? 'YOU' : `P${id}`);
    this.nameSprite.position.y = 1.9;
    this.group.add(this.nameSprite);

    // 4. Downed state beacon column and lights
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.7 }),
    );
    this.beacon.position.y = 1.5;
    this.beacon.visible = false;
    this.group.add(this.beacon);

    this.beaconLight = new THREE.PointLight(0xff4d4d, 0, 5);
    this.beaconLight.position.y = 0.6;
    this.group.add(this.beaconLight);

    // 5. Revive Progress Bars
    this.reviveBarBg = makeBar(0x222222);
    this.reviveBarBg.position.y = 3.2;
    this.reviveBarBg.visible = false;
    this.group.add(this.reviveBarBg);

    this.reviveBarFg = makeBar(0x4fd1c5);
    this.reviveBarFg.position.set(0, 3.2, 0.01);
    this.reviveBarFg.visible = false;
    this.group.add(this.reviveBarFg);

    // 6. Flashlight Spotlight
    this.flashlight = new THREE.SpotLight(0xf0f5ff, 28.0, 32, Math.PI / 4, 0.4, 0.9);
    this.flashlight.position.set(0, 0.9, 0.3);
    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, 0.9, 5.0);
    this.flashlight.target = this.flashlightTarget;
    this.group.add(this.flashlight);
    this.group.add(this.flashlightTarget);

    if (isLocal) {
      this.flashlight.castShadow = true;
      this.flashlight.shadow.mapSize.width = 512;
      this.flashlight.shadow.mapSize.height = 512;
      this.flashlight.shadow.camera.near = 0.5;
      this.flashlight.shadow.camera.far = 32;
    }

    this._pulseT = 0;
  }

  setTransform(x, z, angle) {
    this.x = x;
    this.z = z;
    this.angle = angle;
    this.group.position.set(x, 0, z);
    if (!this.downed) this.group.rotation.y = angle;
  }

  setVisible(v) {
    this.group.visible = v;
  }

  setInvulnerable(v) {
    const opacity = v ? 0.5 + Math.sin(performance.now() * 0.02) * 0.25 : 1;
    this.body.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.transparent = true;
        child.material.opacity = opacity;
      }
    });
    this.facing.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.transparent = true;
        child.material.opacity = opacity;
      }
    });
  }

  setDowned(downed) {
    if (this.downed === downed) return;
    this.downed = downed;

    if (downed) {
      if (this.muzzleFlash) {
        this.muzzleFlash.visible = false;
        this.muzzleLight.intensity = 0;
        this.muzzleFlashTimer = 0;
      }
      // Downed state: fall over, gray out armor, disable visor glow, hide gun
      this.body.rotation.z = Math.PI / 2;
      this.body.position.y = 0.45;
      
      this.body.traverse((child) => {
        if (child.isMesh && child.material) {
          if (child.userData.isArmor) {
            child.material.color.setHex(0x3a3f46); // dead gray armor
            child.material.emissive.setHex(0x000000);
          }
          if (child.userData.isVisor) {
            child.material.color.setHex(0x131518); // visor turns off
            child.material.emissive.setHex(0x000000);
          }
        }
      });

      this.facing.visible = false;
      this.beacon.visible = true;
      this.beaconLight.intensity = 1.5;
      if (this.flashlight) this.flashlight.visible = false;
    } else {
      // Revived: stand up, restore slot colors, restore glowing visor, show gun
      this.body.rotation.z = 0;
      this.body.position.y = this.bodyStandY;

      const colorHex = this.bodyColor;
      const isLocal = this.isLocal;
      this.body.traverse((child) => {
        if (child.isMesh && child.material) {
          if (child.userData.isArmor) {
            child.material.color.setHex(colorHex);
            child.material.emissive.setHex(colorHex);
            child.material.emissiveIntensity = isLocal ? 0.25 : 0.1;
          }
          if (child.userData.isVisor) {
            child.material.color.setHex(0x00ffff);
            child.material.emissive.setHex(0x00ffff);
            child.material.emissiveIntensity = 1.5;
          }
        }
      });

      this.facing.visible = true;
      this.beacon.visible = false;
      this.beaconLight.intensity = 0;
      this.setReviveProgress(0);
      if (this.flashlight) this.flashlight.visible = true;
    }
  }

  setReviveProgress(pct) {
    const active = this.downed && pct > 0;
    this.reviveBarBg.visible = active;
    this.reviveBarFg.visible = active;
    if (active) {
      this.reviveBarFg.scale.x = Math.max(0.001, pct);
      this.reviveBarFg.position.x = -1.0 * (1 - pct);
    }
  }

  triggerMuzzleFlash(cls = 'marine') {
    if (this.downed || !this.muzzleFlash) return;
    this.muzzleFlashTimer = 0.06;
    this.muzzleFlash.visible = true;

    this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    const scale = 0.85 + Math.random() * 0.35;
    this.muzzleFlash.scale.set(scale, scale, scale);

    let flashColor = 0xffea60;
    let lightColor = 0xffcc44;
    let lightIntensity = 4.5;

    if (cls === 'engineer') {
      flashColor = 0x66e0ff;
      lightColor = 0x22ccff;
      lightIntensity = 4.0;
    } else if (cls === 'heavy') {
      flashColor = 0xff6622;
      lightColor = 0xff4400;
      lightIntensity = 6.0;
      this.muzzleFlash.scale.multiplyScalar(1.3);
    } else if (cls === 'medic') {
      flashColor = 0x44ffaa;
      lightColor = 0x20e080;
      lightIntensity = 3.8;
    }

    this.muzzleFlashMat.color.setHex(flashColor);
    this.muzzleLight.color.setHex(lightColor);
    this.muzzleLight.intensity = lightIntensity;
  }

  update(dt) {
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        if (this.muzzleFlash) this.muzzleFlash.visible = false;
        if (this.muzzleLight) this.muzzleLight.intensity = 0;
      }
    }

    if (this.downed) {
      this._pulseT += dt * 4;
      this.beacon.material.opacity = 0.5 + Math.sin(this._pulseT) * 0.3;
      this.beaconLight.intensity = 1.2 + Math.sin(this._pulseT) * 0.6;
    } else {
      // 1. Footstep dust puffs when moving
      const moved = Math.hypot(this.x - (this._lastX ?? this.x), this.z - (this._lastZ ?? this.z));
      if (moved > 0.005) {
        this._stepTimer = (this._stepTimer || 0) + dt;
        if (this._stepTimer >= 0.16) {
          FX.footstep(this.x, this.z);
          this._stepTimer = 0;
        }
      }

      // 2. Stim speed streaks
      if (this.stim) {
        this._stimTimer = (this._stimTimer || 0) + dt;
        if (this._stimTimer >= 0.07) {
          FX.stimTrail(this.x, this.z);
          this._stimTimer = 0;
        }
      }

      // 3. Critical damage suit sparks & blood vapor (< 30% HP)
      if (this.hp < 30 && this.hp > 0) {
        this._critTimer = (this._critTimer || 0) + dt;
        if (this._critTimer >= 0.28) {
          FX.criticalDamage(this.x, this.z);
          this._critTimer = 0;
        }
      }
    }

    this._lastX = this.x;
    this._lastZ = this.z;
  }

  dispose(scene) {
    scene.remove(this.group);
    
    // WebGL resource cleanup to avoid memory leaks
    this.group.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
}

function makeBar(color) {
  const geom = new THREE.PlaneGeometry(2.0, 0.22);
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
  return new THREE.Mesh(geom, mat);
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 64, 22);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.2, 0.3, 1);
  return sprite;
}
