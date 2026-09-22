import * as THREE from 'three/webgpu';
import { FX } from './Particles.js';

class ExplosionPool {
  constructor() {
    this.active = [];
  }

  init(scene) {
    this.scene = scene;
  }

  spawn(x, z, radius) {
    FX.explosionDebris(x, z, radius);

    const geom = new THREE.RingGeometry(0.1, radius, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.15, z);
    this.scene.add(mesh);

    const light = new THREE.PointLight(0xff8a3d, 3, radius * 2.5);
    light.position.set(x, 1, z);
    this.scene.add(light);

    this.active.push({ mesh, light, life: 0.35, maxLife: 0.35, radius });
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.life -= dt;
      const t = 1 - Math.max(0, e.life) / e.maxLife;
      e.mesh.scale.setScalar(0.3 + t * 0.7);
      e.mesh.material.opacity = 0.85 * (1 - t);
      e.light.intensity = 3 * (1 - t);
      if (e.life <= 0) {
        this.scene.remove(e.mesh, e.light);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.active.splice(i, 1);
      }
    }
  }
}

export const explosions = new ExplosionPool();
