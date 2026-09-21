import * as THREE from 'three/webgpu';

const STIM_COLOR = 0x4fd1c5;

// Only the medic's stim pack goes through this consumable-pickup path now — the
// marine's heal ability is a standing zone (see HealZone.js), not a one-shot pickup.
export class Pickup {
  constructor(id, type) {
    this.id = id;
    this.type = type;

    this.group = new THREE.Group();

    const baseGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.7 });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.08;
    this.group.add(base);

    this.icon = new THREE.Group();
    this.icon.position.y = 0.55;
    this.group.add(this.icon);

    const iconMat = new THREE.MeshStandardMaterial({ color: STIM_COLOR, emissive: STIM_COLOR, emissiveIntensity: 0.6 });
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.35, 4, 8), iconMat);
    capsule.rotation.z = Math.PI / 2.2;
    this.icon.add(capsule);

    const light = new THREE.PointLight(STIM_COLOR, 1.2, 3);
    light.position.y = 0.6;
    this.group.add(light);
  }

  setPosition(x, z) {
    this.group.position.set(x, 0, z);
  }

  update(dt) {
    this.icon.rotation.y += dt * 2.2;
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}
