import * as THREE from 'three/webgpu';

class TracerPool {
  constructor() {
    this.active = [];
  }

  init(scene) {
    this.scene = scene;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });
  }

  spawn(x, z, dx, dz, dist) {
    const geom = new THREE.CylinderGeometry(0.02, 0.02, dist, 5);
    geom.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geom, this.mat);
    mesh.position.set(x + dx * dist / 2, 1.0, z + dz * dist / 2);
    mesh.lookAt(x + dx * dist, 1.0, z + dz * dist);
    this.scene.add(mesh);
    this.active.push({ mesh, life: 0.06 });
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        this.active.splice(i, 1);
      }
    }
  }
}

export const tracers = new TracerPool();
