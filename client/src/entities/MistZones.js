import * as THREE from 'three/webgpu';

let sharedTexture = null;
function getMistTexture() {
  if (sharedTexture) return sharedTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(220,225,235,0.9)');
  grad.addColorStop(0.5, 'rgba(200,205,215,0.4)');
  grad.addColorStop(1, 'rgba(200,205,215,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

// Permanent, gently-drifting fog pockets sitting over every enemy spawn point so
// enemies emerge from concealment instead of popping into an empty corridor.
export class MistZones {
  constructor() {
    this.zones = [];
  }

  init(scene) {
    this.scene = scene;
    this.texture = getMistTexture();
  }

  spawnZone(x, z, radius = 2.2) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const puffCount = 4;
    const puffs = [];
    for (let i = 0; i < puffCount; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.texture,
        transparent: true,
        opacity: 0.3 + Math.random() * 0.15,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const scale = radius * (0.7 + Math.random() * 0.6);
      sprite.scale.set(scale, scale * 0.6, 1);
      sprite.position.set(
        (Math.random() - 0.5) * radius,
        0.4 + Math.random() * 0.6,
        (Math.random() - 0.5) * radius,
      );
      group.add(sprite);
      puffs.push({
        sprite,
        baseY: sprite.position.y,
        phase: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.15,
      });
    }

    this.scene.add(group);
    const zone = { group, puffs, t: Math.random() * 10 };
    this.zones.push(zone);
    return zone;
  }

  update(dt) {
    for (const zone of this.zones) {
      zone.t += dt;
      for (const p of zone.puffs) {
        p.sprite.position.y = p.baseY + Math.sin(zone.t * 0.5 + p.phase) * 0.15;
        p.sprite.material.opacity = 0.25 + Math.sin(zone.t * 0.3 + p.phase) * 0.1;
        p.sprite.material.rotation += p.rotSpeed * dt;
      }
      zone.group.rotation.y += dt * 0.03;
    }
  }

  clear() {
    if (this.scene) {
      for (const zone of this.zones) {
        this.scene.remove(zone.group);
        zone.group.traverse((child) => {
          if (child.material) child.material.dispose();
        });
      }
    }
    this.zones = [];
  }
}

export const mistZones = new MistZones();
