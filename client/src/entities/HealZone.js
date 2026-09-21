import * as THREE from 'three/webgpu';
import { HEAL_ZONE } from '@air-swarm/shared';

const COLOR = 0x4fd166;

// A standing heal radius on the ground — a soft filled disc plus a brighter rim at the
// exact radius players need to stand within, so the playable area is unambiguous.
export class HealZone {
  constructor(id) {
    this.id = id;
    this.life = HEAL_ZONE.duration;
    this._pulseT = Math.random() * 10;

    this.group = new THREE.Group();

    const fillGeom = new THREE.CircleGeometry(HEAL_ZONE.radius, 32);
    fillGeom.rotateX(-Math.PI / 2);
    this.fillMat = new THREE.MeshBasicMaterial({
      color: COLOR, transparent: true, opacity: 0.16, depthWrite: false,
    });
    this.fill = new THREE.Mesh(fillGeom, this.fillMat);
    this.fill.position.y = 0.03;
    this.group.add(this.fill);

    const ringGeom = new THREE.RingGeometry(HEAL_ZONE.radius - 0.12, HEAL_ZONE.radius, 48);
    ringGeom.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: COLOR, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(ringGeom, this.ringMat);
    this.ring.position.y = 0.04;
    this.group.add(this.ring);

    this.light = new THREE.PointLight(COLOR, 1.0, HEAL_ZONE.radius * 2);
    this.light.position.y = 1.0;
    this.group.add(this.light);
  }

  setPosition(x, z) {
    this.group.position.set(x, 0, z);
  }

  setLife(life) {
    this.life = life;
  }

  update(dt) {
    this._pulseT += dt * 2.5;
    const pulse = 0.5 + Math.sin(this._pulseT) * 0.5;
    this.ringMat.opacity = 0.45 + pulse * 0.3;
    this.light.intensity = 0.7 + pulse * 0.5;

    // Fade out over the last couple seconds so its disappearance isn't a hard cut.
    const fadeT = Math.min(1, this.life / 2);
    this.fillMat.opacity = 0.16 * fadeT;
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}
