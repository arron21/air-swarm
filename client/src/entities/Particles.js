import * as THREE from 'three/webgpu';
import { attribute, pointUV, float, length, smoothstep } from 'three/tsl';

const MAX_PARTICLES = 1000;

class ParticlePool {
  constructor() {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.alphas = new Float32Array(MAX_PARTICLES);

    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.gravity = new Float32Array(MAX_PARTICLES);
    this.baseSize = new Float32Array(MAX_PARTICLES);
    this.active = new Uint8Array(MAX_PARTICLES);

    this._cursor = 0;
  }

  init(scene) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geom.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geom.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geom.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    const aColor = attribute('aColor', 'vec3');
    const aAlpha = attribute('aAlpha', 'float');
    const aSize = attribute('aSize', 'float');

    const d = length(pointUV.sub(0.5));
    const falloff = smoothstep(float(0.5), float(0.0), d);

    const mat = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mat.colorNode = aColor;
    mat.opacityNode = aAlpha.mul(falloff);
    mat.sizeNode = aSize.mul(25.0);

    this.points = new THREE.Points(geom, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  // config: { count, color:[r,g,b], speed:[min,max], spread (0-1 = full sphere, small = narrow cone),
  //           dir:{x,z} optional bias direction, life:[min,max], size:[min,max], gravity }
  spawnBurst(x, y, z, config) {
    const {
      count = 12,
      color = [1, 1, 1],
      speed = [2, 5],
      spread = 1,
      dir = null,
      life = [0.3, 0.6],
      size = [0.08, 0.18],
      gravity = 4,
    } = config;

    for (let i = 0; i < count; i++) {
      const idx = this._cursor;
      this._cursor = (this._cursor + 1) % MAX_PARTICLES;

      let vx; let vy; let vz;
      if (dir) {
        const coneAngle = spread * Math.PI;
        const theta = (Math.random() - 0.5) * coneAngle;
        const phi = (Math.random() - 0.5) * coneAngle;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        vx = dir.x * cos - dir.z * sin;
        vz = dir.x * sin + dir.z * cos;
        vy = Math.sin(phi) * 0.6 + 0.3;
      } else {
        const a = Math.random() * Math.PI * 2;
        const el = (Math.random() - 0.5) * Math.PI * spread;
        vx = Math.cos(a) * Math.cos(el);
        vz = Math.sin(a) * Math.cos(el);
        vy = Math.sin(el) + 0.4;
      }

      const spd = speed[0] + Math.random() * (speed[1] - speed[0]);
      this.velocities[idx * 3] = vx * spd;
      this.velocities[idx * 3 + 1] = vy * spd;
      this.velocities[idx * 3 + 2] = vz * spd;

      this.positions[idx * 3] = x;
      this.positions[idx * 3 + 1] = y;
      this.positions[idx * 3 + 2] = z;

      this.colors[idx * 3] = color[0];
      this.colors[idx * 3 + 1] = color[1];
      this.colors[idx * 3 + 2] = color[2];

      const l = life[0] + Math.random() * (life[1] - life[0]);
      this.life[idx] = l;
      this.maxLife[idx] = l;
      this.gravity[idx] = gravity;
      this.baseSize[idx] = size[0] + Math.random() * (size[1] - size[0]);
      this.sizes[idx] = this.baseSize[idx];
      this.alphas[idx] = 1;
      this.active[idx] = 1;
    }
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this.active[i]) continue;
      dirty = true;

      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.active[i] = 0;
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }

      this.velocities[i * 3 + 1] -= this.gravity[i] * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      if (this.positions[i * 3 + 1] < 0) this.positions[i * 3 + 1] = 0;

      const t = this.life[i] / this.maxLife[i];
      this.alphas[i] = t;
      this.sizes[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }

    if (dirty && this.points) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.aColor.needsUpdate = true;
      this.points.geometry.attributes.aSize.needsUpdate = true;
      this.points.geometry.attributes.aAlpha.needsUpdate = true;
    }
  }
}

export const particles = new ParticlePool();

// Named presets so call sites read like intent, not magic numbers.
export const FX = {
  muzzleFlash: (x, z, dx, dz, color = [1, 0.92, 0.55]) => particles.spawnBurst(x, 1.0, z, {
    count: 14, color, speed: [4, 9], life: [0.06, 0.14], size: [0.12, 0.22], gravity: 1, dir: { x: dx, z: dz }, spread: 0.35,
  }),
  impactSpark: (x, z, hitColor = [1, 0.85, 0.4]) => particles.spawnBurst(x, 1.0, z, {
    count: 8, color: hitColor, speed: [2, 5], life: [0.15, 0.3], size: [0.06, 0.12], gravity: 6,
  }),
  enemyDeath: (x, z, color) => particles.spawnBurst(x, 0.7, z, {
    count: 22, color, speed: [2, 6], life: [0.35, 0.7], size: [0.1, 0.22], gravity: 8, spread: 1,
  }),
  enemyHit: (x, z, color) => particles.spawnBurst(x, 0.8, z, {
    count: 7, color, speed: [1.5, 4.5], life: [0.18, 0.38], size: [0.08, 0.14], gravity: 7,
  }),
  playerHit: (x, z) => particles.spawnBurst(x, 1.1, z, {
    count: 10, color: [0.9, 0.15, 0.15], speed: [1.5, 4], life: [0.25, 0.45], size: [0.08, 0.15], gravity: 5,
  }),
  doorSpark: (x, y, z) => particles.spawnBurst(x, y, z, {
    count: 10, color: [1, 0.75, 0.3], speed: [2, 5], life: [0.15, 0.3], size: [0.06, 0.12], gravity: 6,
  }),
  pickupHeal: (x, z) => particles.spawnBurst(x, 0.6, z, {
    count: 16, color: [0.35, 0.9, 0.6], speed: [1, 3], life: [0.4, 0.7], size: [0.08, 0.16], gravity: -2,
  }),
  pickupStim: (x, z) => particles.spawnBurst(x, 0.6, z, {
    count: 16, color: [0.3, 0.82, 0.77], speed: [1, 3], life: [0.4, 0.7], size: [0.08, 0.16], gravity: -2,
  }),
  turretDeploy: (x, z) => particles.spawnBurst(x, 0.3, z, {
    count: 18, color: [0.6, 0.5, 0.75], speed: [1.5, 3.5], life: [0.3, 0.55], size: [0.1, 0.2], gravity: 3,
  }),
  shotgunBlast: (x, z, angle) => particles.spawnBurst(x, 1.0, z, {
    count: 30, color: [1, 0.55, 0.2], speed: [5, 11], life: [0.15, 0.35], size: [0.12, 0.24], gravity: 1,
    dir: { x: Math.sin(angle), z: Math.cos(angle) }, spread: 0.75,
  }),
  enemySpawn: (x, z, color) => particles.spawnBurst(x, 0.5, z, {
    count: 14, color, speed: [1.5, 4], life: [0.25, 0.5], size: [0.1, 0.18], gravity: 2,
  }),
};
