import * as THREE from 'three/webgpu';

const POOL_SIZE = 40;

class TracerPool {
  constructor() {
    this.pool = [];
    this.poolIndex = 0;
  }

  init(scene) {
    this.scene = scene;
    // Single shared unit-length cylinder geometry oriented along the Z axis
    const geom = new THREE.CylinderGeometry(0.03, 0.03, 1, 5);
    geom.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffea60 });

    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.scale.set(0, 0, 0);
      mesh.position.set(0, -100, 0);
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push({ mesh, life: 0 });
    }
  }

  spawn(x, z, dx, dz, dist) {
    if (!this.pool.length || dist < 0.2) return;
    const item = this.pool[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % POOL_SIZE;

    item.life = 0.10; // 100ms: visible across multiple frames without dropping
    item.mesh.position.set(x + (dx * dist) / 2, 1.0, z + (dz * dist) / 2);
    item.mesh.lookAt(x + dx * (dist + 2.0), 1.0, z + dz * (dist + 2.0));
    item.mesh.scale.set(1, 1, dist);
  }

  update(dt) {
    for (let i = 0; i < this.pool.length; i++) {
      const item = this.pool[i];
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) {
        item.mesh.scale.set(0, 0, 0);
        item.mesh.position.set(0, -100, 0);
      }
    }
  }
}

export const tracers = new TracerPool();
