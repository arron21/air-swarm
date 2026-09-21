import * as THREE from 'three/webgpu';

const MAX_SPLATTERS = 128;

export class BloodSplatters {
  constructor() {
    this.scene = null;
    this.splatters = [];
  }

  init(scene) {
    this.scene = scene;
  }

  spawnSplatter(x, z, color) {
    if (!this.scene) return;

    const group = new THREE.Group();
    // Tiny random offset in Y to prevent Z-fighting between splatters
    group.position.set(x, 0.02 + Math.random() * 0.01, z);

    // Create a main pool
    const mainRadius = 0.35 + Math.random() * 0.35;
    const mainGeom = new THREE.CircleGeometry(mainRadius, 8);
    mainGeom.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    const mainMesh = new THREE.Mesh(mainGeom, mat);
    group.add(mainMesh);

    // Create 2-4 smaller satellite drips
    const dripCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < dripCount; i++) {
      const dripRadius = 0.08 + Math.random() * 0.12;
      const dripGeom = new THREE.CircleGeometry(dripRadius, 6);
      dripGeom.rotateX(-Math.PI / 2);

      const dripMesh = new THREE.Mesh(dripGeom, mat);
      
      // Offset position
      const angle = Math.random() * Math.PI * 2;
      const dist = mainRadius * (0.6 + Math.random() * 0.8);
      dripMesh.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);

      group.add(dripMesh);
    }

    this.scene.add(group);
    this.splatters.push(group);

    // Keep pool limited
    if (this.splatters.length > MAX_SPLATTERS) {
      const oldest = this.splatters.shift();
      this.scene.remove(oldest);
      oldest.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
      mat.dispose();
    }
  }

  clear() {
    if (this.scene) {
      for (const group of this.splatters) {
        this.scene.remove(group);
        group.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
    }
    this.splatters = [];
  }
}

export const bloodSplatters = new BloodSplatters();
