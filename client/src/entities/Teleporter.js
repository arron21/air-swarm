import * as THREE from 'three/webgpu';
import { TELEPORTER } from '@air-swarm/shared';

const COLOR_PRIMARY = 0x00ffff;
const COLOR_SECONDARY = 0x4fd1c5;

export class Teleporter {
  constructor(x, z) {
    this._pulseT = Math.random() * 10;

    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);

    // 1. Dark metal base
    const baseGeom = new THREE.CylinderGeometry(TELEPORTER.radius * 1.1, TELEPORTER.radius * 1.2, 0.25, 24);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1f232b,
      metalness: 0.8,
      roughness: 0.3,
    });
    this.base = new THREE.Mesh(baseGeom, baseMat);
    this.base.position.y = 0.125;
    this.base.receiveShadow = true;
    this.group.add(this.base);

    // 2. Glowing inner ring
    const ringGeom = new THREE.RingGeometry(TELEPORTER.radius * 0.8, TELEPORTER.radius * 0.9, 32);
    ringGeom.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: COLOR_PRIMARY,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeom, this.ringMat);
    this.ring.position.y = 0.26;
    this.group.add(this.ring);

    // 3. Outer column of light (primary beam)
    const beam1Geom = new THREE.CylinderGeometry(TELEPORTER.radius * 0.8, TELEPORTER.radius * 0.8, 3.5, 24, 1, true);
    this.beam1Mat = new THREE.MeshBasicMaterial({
      color: COLOR_PRIMARY,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beam1 = new THREE.Mesh(beam1Geom, this.beam1Mat);
    this.beam1.position.y = 1.75;
    this.group.add(this.beam1);

    // 4. Inner concentric column of light (secondary beam)
    const beam2Geom = new THREE.CylinderGeometry(TELEPORTER.radius * 0.65, TELEPORTER.radius * 0.65, 3.2, 16, 1, true);
    this.beam2Mat = new THREE.MeshBasicMaterial({
      color: COLOR_SECONDARY,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beam2 = new THREE.Mesh(beam2Geom, this.beam2Mat);
    this.beam2.position.y = 1.6;
    this.group.add(this.beam2);

    // 5. Point Light
    this.light = new THREE.PointLight(COLOR_PRIMARY, 1.5, TELEPORTER.radius * 4);
    this.light.position.y = 1.5;
    this.group.add(this.light);
  }

  update(dt) {
    this._pulseT += dt * 3.0;
    const pulse = 0.5 + Math.sin(this._pulseT) * 0.5;

    // Animate light intensity and beam opacities
    this.light.intensity = 1.0 + pulse * 0.8;
    this.beam1Mat.opacity = 0.1 + pulse * 0.08;
    this.beam2Mat.opacity = 0.06 + (1 - pulse) * 0.06;

    // Rotate columns in opposite directions
    this.beam1.rotation.y += dt * 0.3;
    this.beam2.rotation.y -= dt * 0.45;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((child) => {
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
}
