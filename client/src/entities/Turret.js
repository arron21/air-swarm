import * as THREE from 'three/webgpu';

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

export class Turret {
  constructor(id) {
    this.id = id;
    this.group = new THREE.Group();
    
    this.life = 25.0; // tracks the turret's 25-second lifespan
    this._pulseT = 0;
    this._animTime = Math.random() * 100;

    // Materials
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x2e3440, // Industrial charcoal steel
      roughness: 0.55,
      metalness: 0.6,
    });
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x805ad5, // Purple plating matching engineer class styling
      roughness: 0.5,
      metalness: 0.3,
    });
    const detailMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c23, // Matte black structural components
      roughness: 0.75,
      metalness: 0.1,
    });
    this.statusMat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc, // Glowing status indicator (teal)
      emissive: 0x00ffcc,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });

    // 1. Central Tripod Hub
    const hubGeom = new THREE.CylinderGeometry(0.18, 0.22, 0.15, 8);
    const hub = createMesh(hubGeom, baseMat, this.group);
    hub.position.y = 0.075;

    // 2. Three robotic tripod support legs (spaced 120 degrees apart)
    const legAngles = [
      Math.PI / 2,                  // Back leg
      Math.PI / 2 + (2 * Math.PI / 3), // Front-Right leg
      Math.PI / 2 - (2 * Math.PI / 3), // Front-Left leg
    ];
    for (const angle of legAngles) {
      const legPivot = new THREE.Group();
      legPivot.position.set(0, 0.05, 0);
      legPivot.rotation.y = angle;
      this.group.add(legPivot);

      // Thigh segment (angles out and up)
      const thighGeom = new THREE.BoxGeometry(0.08, 0.08, 0.35);
      const thigh = createMesh(thighGeom, baseMat, legPivot);
      thigh.position.set(0, 0.08, 0.16);
      thigh.rotation.x = -Math.PI / 10;

      // Shin/Foot segment (angles down to the ground)
      const shinGeom = new THREE.BoxGeometry(0.06, 0.06, 0.4);
      const shin = createMesh(shinGeom, detailMat, thigh);
      shin.position.set(0, -0.12, 0.15);
      shin.rotation.x = Math.PI / 4;
    }

    // 3. Vertical Swivel Shaft (connects base to head)
    const shaftGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.32, 8);
    createMesh(shaftGeom, detailMat, this.group).position.y = 0.28;

    // 4. Rotating Turret Head Group
    this.head = new THREE.Group();
    this.head.position.y = 0.44;
    this.group.add(this.head);

    // Armored Head Casing
    const headCasingGeom = new THREE.BoxGeometry(0.38, 0.28, 0.44);
    const headCasing = createMesh(headCasingGeom, armorMat, this.head);
    headCasing.position.set(0, 0.14, 0);

    // Side Sensor Pods
    const podGeom = new THREE.SphereGeometry(0.09, 8, 8);
    createMesh(podGeom, detailMat, this.head).position.set(-0.22, 0.14, 0.05);
    createMesh(podGeom, detailMat, this.head).position.set(0.22, 0.14, 0.05);

    // Status Dome on top of head (indicates battery/lifespan)
    const domeGeom = new THREE.SphereGeometry(0.07, 8, 8);
    const statusDome = createMesh(domeGeom, this.statusMat, this.head);
    statusDome.position.set(0, 0.28, -0.05);
    statusDome.scale.set(1, 0.7, 1); // squash sphere to form a dome

    // 5. Dual Alternating Gun Barrels
    const barrelGeom = new THREE.CylinderGeometry(0.032, 0.032, 0.55, 8);
    barrelGeom.rotateX(Math.PI / 2); // align along Z-axis
    const tipGeom = new THREE.CylinderGeometry(0.038, 0.038, 0.08, 8);
    tipGeom.rotateX(Math.PI / 2);

    // Left barrel assembly
    this.leftBarrelGroup = new THREE.Group();
    this.leftBarrelGroup.position.set(-0.13, 0.11, 0.18);
    this.head.add(this.leftBarrelGroup);
    createMesh(barrelGeom, baseMat, this.leftBarrelGroup).position.set(0, 0, 0.2);
    createMesh(tipGeom, detailMat, this.leftBarrelGroup).position.set(0, 0, 0.48);

    // Right barrel assembly
    this.rightBarrelGroup = new THREE.Group();
    this.rightBarrelGroup.position.set(0.13, 0.11, 0.18);
    this.head.add(this.rightBarrelGroup);
    createMesh(barrelGeom, baseMat, this.rightBarrelGroup).position.set(0, 0, 0.2);
    createMesh(tipGeom, detailMat, this.rightBarrelGroup).position.set(0, 0, 0.48);

    // 6. Dynamic status PointLight
    this.light = new THREE.PointLight(0x00ffcc, 1.2, 5.0);
    this.light.position.set(0, 0.6, 0);
    this.group.add(this.light);

    // 7. Muzzle Flash
    this.turretMuzzleFlash = new THREE.Group();
    this.turretMuzzleFlashMat = new THREE.MeshBasicMaterial({
      color: 0x66e0ff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const tFlashGeom1 = new THREE.PlaneGeometry(0.32, 0.32);
    this.turretMuzzleFlash.add(new THREE.Mesh(tFlashGeom1, this.turretMuzzleFlashMat));
    const tFlashGeom2 = new THREE.PlaneGeometry(0.22, 0.22);
    tFlashGeom2.rotateZ(Math.PI / 4);
    this.turretMuzzleFlash.add(new THREE.Mesh(tFlashGeom2, this.turretMuzzleFlashMat));

    const tSpikeGeom = new THREE.ConeGeometry(0.06, 0.22, 6);
    tSpikeGeom.rotateX(Math.PI / 2);
    tSpikeGeom.translate(0, 0, 0.11);
    this.turretMuzzleFlash.add(new THREE.Mesh(tSpikeGeom, this.turretMuzzleFlashMat));

    this.head.add(this.turretMuzzleFlash);
    this.turretMuzzleFlash.visible = false;
    this.turretMuzzleTimer = 0;
    this._barrelSide = 0;
  }

  setPosition(x, z) {
    this.group.position.set(x, 0, z);
  }

  triggerMuzzleFlash() {
    this.turretMuzzleTimer = 0.06;
    this.turretMuzzleFlash.visible = true;
    this._barrelSide = 1 - this._barrelSide;
    const xOff = this._barrelSide === 0 ? -0.13 : 0.13;
    this.turretMuzzleFlash.position.set(xOff, 0.11, 0.72);
    this.turretMuzzleFlash.rotation.z = Math.random() * Math.PI * 2;
  }

  update(dt) {
    if (this.turretMuzzleTimer > 0) {
      this.turretMuzzleTimer -= dt;
      if (this.turretMuzzleTimer <= 0) {
        this.turretMuzzleFlash.visible = false;
      }
    }

    // 1. Scan/rotate sentry head
    this.head.rotation.y += dt * 1.4;

    // 2. Alternating reciprocating barrel animations
    this._animTime += dt * 18.0;
    this.leftBarrelGroup.position.z = 0.18 - Math.abs(Math.sin(this._animTime)) * 0.08;
    this.rightBarrelGroup.position.z = 0.18 - Math.abs(Math.cos(this._animTime)) * 0.08;

    // 3. Lifespan tracking & battery light indicator
    this.life = Math.max(0, this.life - dt);
    const pct = this.life / 25.0;

    let colorHex = 0x00ffcc; // Teal (Healthy)
    let lightIntensity = 1.2;

    if (pct > 0.5) {
      colorHex = 0x00ffcc;
    } else if (pct > 0.2) {
      colorHex = 0xffd700; // Yellow (Low Battery)
    } else {
      // Flashes Red (Critical / Exploding)
      this._pulseT += dt * 12.0;
      const flash = Math.sin(this._pulseT) > 0;
      colorHex = flash ? 0xff3300 : 0x220500;
      lightIntensity = flash ? 1.5 : 0;
    }

    if (this.statusMat) {
      this.statusMat.color.setHex(colorHex);
      this.statusMat.emissive.setHex(colorHex);
      this.statusMat.emissiveIntensity = lightIntensity;
    }
    if (this.light) {
      this.light.color.setHex(colorHex);
      this.light.intensity = lightIntensity;
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    
    // Traverse and dispose of all child geometries and materials to prevent memory leaks
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
