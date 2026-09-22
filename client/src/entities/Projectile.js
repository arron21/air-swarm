import * as THREE from 'three/webgpu';
import { FX } from './Particles.js';

export class Projectile {
  constructor(id) {
    this.id = id;
    const geom = new THREE.SphereGeometry(0.16, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xb388ff });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.y = 0.9;

    const light = new THREE.PointLight(0xb388ff, 1.0, 2.5);
    light.position.y = 0.9;

    this.group = new THREE.Group();
    this.group.add(this.mesh, light);
  }

  setPosition(x, z) {
    this.group.position.x = x;
    this.group.position.z = z;
    FX.acidTrail(x, 0.9, z);
  }

  dispose(scene) {
    FX.acidSplash(this.group.position.x, this.group.position.z);
    scene.remove(this.group);
  }
}

