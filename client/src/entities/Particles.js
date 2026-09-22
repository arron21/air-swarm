import * as THREE from 'three/webgpu';
import { attribute, pointUV, float, length, smoothstep } from 'three/tsl';

const MAX_PARTICLES = 1500;

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
    this.drag = new Float32Array(MAX_PARTICLES);
    this.growth = new Float32Array(MAX_PARTICLES);
    this.bounce = new Float32Array(MAX_PARTICLES);
    this.baseSize = new Float32Array(MAX_PARTICLES);
    this.active = new Uint8Array(MAX_PARTICLES);

    this.activeList = [];
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
  //           dir:{x,z} optional bias direction, life:[min,max], size:[min,max], gravity, drag, growth, bounce,
  //           posJitter:{x,y,z}, vyBias }
  spawnBurst(x, y, z, config) {
    const {
      count = 10,
      color = [1, 1, 1],
      speed = [2, 5],
      spread = 1,
      dir = null,
      life = [0.3, 0.6],
      size = [0.08, 0.18],
      gravity = 4,
      drag = 0,
      growth = 0,
      bounce = 0,
      posJitter = null,
      vyBias = 0.4,
    } = config;

    for (let i = 0; i < count; i++) {
      const idx = this._cursor;
      this._cursor = (this._cursor + 1) % MAX_PARTICLES;

      if (!this.active[idx]) {
        this.active[idx] = 1;
        this.activeList.push(idx);
      }

      let vx; let vy; let vz;
      if (dir) {
        const coneAngle = spread * Math.PI;
        const theta = (Math.random() - 0.5) * coneAngle;
        const phi = (Math.random() - 0.5) * coneAngle;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        vx = dir.x * cos - (dir.z || 0) * sin;
        vz = (dir.x || 0) * sin + (dir.z || 0) * cos;
        vy = Math.sin(phi) * 0.6 + vyBias;
      } else {
        const a = Math.random() * Math.PI * 2;
        const el = (Math.random() - 0.5) * Math.PI * spread;
        vx = Math.cos(a) * Math.cos(el);
        vz = Math.sin(a) * Math.cos(el);
        vy = Math.sin(el) + vyBias;
      }

      const spd = speed[0] + Math.random() * (speed[1] - speed[0]);
      this.velocities[idx * 3] = vx * spd;
      this.velocities[idx * 3 + 1] = vy * spd;
      this.velocities[idx * 3 + 2] = vz * spd;

      let px = x;
      let py = y;
      let pz = z;
      if (posJitter) {
        px += (Math.random() - 0.5) * (posJitter.x || 0);
        py += (Math.random() - 0.5) * (posJitter.y || 0);
        pz += (Math.random() - 0.5) * (posJitter.z || 0);
      }

      this.positions[idx * 3] = px;
      this.positions[idx * 3 + 1] = py;
      this.positions[idx * 3 + 2] = pz;

      this.colors[idx * 3] = color[0];
      this.colors[idx * 3 + 1] = color[1];
      this.colors[idx * 3 + 2] = color[2];

      const l = life[0] + Math.random() * (life[1] - life[0]);
      this.life[idx] = l;
      this.maxLife[idx] = l;
      this.gravity[idx] = gravity;
      this.drag[idx] = drag;
      this.growth[idx] = growth;
      this.bounce[idx] = bounce;
      this.baseSize[idx] = size[0] + Math.random() * (size[1] - size[0]);
      this.sizes[idx] = this.baseSize[idx];
      this.alphas[idx] = 1;
    }

    if (this.points) {
      this.points.geometry.attributes.aColor.needsUpdate = true;
    }
  }

  update(dt) {
    const len = this.activeList.length;
    if (len === 0) return;

    for (let j = len - 1; j >= 0; j--) {
      const i = this.activeList[j];
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.active[i] = 0;
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        // Fast swap-pop removal O(1)
        this.activeList[j] = this.activeList[this.activeList.length - 1];
        this.activeList.pop();
        continue;
      }

      const dragFactor = this.drag[i] > 0 ? Math.max(0, 1 - this.drag[i] * dt) : 1;
      this.velocities[i * 3] *= dragFactor;
      this.velocities[i * 3 + 1] = (this.velocities[i * 3 + 1] - this.gravity[i] * dt) * dragFactor;
      this.velocities[i * 3 + 2] *= dragFactor;

      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;

      // Floor bounce and dampening
      if (this.positions[i * 3 + 1] <= 0.04) {
        if (this.bounce[i] > 0) {
          this.positions[i * 3 + 1] = 0.04;
          this.velocities[i * 3 + 1] = -this.velocities[i * 3 + 1] * this.bounce[i];
          this.velocities[i * 3] *= 0.65;
          this.velocities[i * 3 + 2] *= 0.65;
        } else {
          this.positions[i * 3 + 1] = Math.max(0, this.positions[i * 3 + 1]);
        }
      }

      const t = this.life[i] / this.maxLife[i];
      this.alphas[i] = t;
      if (this.growth[i] > 0) {
        const age = 1 - t;
        this.sizes[i] = this.baseSize[i] * (1.0 + age * this.growth[i]) * Math.min(1, t * 2.5);
      } else {
        this.sizes[i] = this.baseSize[i] * (0.4 + 0.6 * t);
      }
    }

    if (this.points) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.aSize.needsUpdate = true;
      this.points.geometry.attributes.aAlpha.needsUpdate = true;
    }
  }
}

export const particles = new ParticlePool();

// Named presets so call sites read like intent, not magic numbers.
export const FX = {
  muzzleFlash: (x, z, dx, dz, color = [1, 0.92, 0.55]) => particles.spawnBurst(x, 1.0, z, {
    count: 8, color, speed: [4, 8], life: [0.05, 0.11], size: [0.1, 0.18], gravity: 1, dir: { x: dx, z: dz }, spread: 0.3,
  }),
  shellCasing: (x, y = 0.9, z, angle) => {
    const rightX = Math.cos(angle);
    const rightZ = -Math.sin(angle);
    particles.spawnBurst(x, y, z, {
      count: 1,
      color: [0.95, 0.78, 0.25],
      speed: [2.0, 3.5],
      dir: { x: rightX, z: rightZ },
      spread: 0.2,
      vyBias: 1.4,
      gravity: 12,
      bounce: 0.42,
      life: [0.6, 1.0],
      size: [0.07, 0.1],
    });
  },
  wallRicochet: (x, y = 1.0, z, nx = 0, nz = 0) => {
    // 1. High velocity fiery ricochet sparks
    particles.spawnBurst(x, y, z, {
      count: 5,
      color: [1.0, 0.88, 0.45],
      speed: [3.0, 6.5],
      dir: (nx !== 0 || nz !== 0) ? { x: nx, z: nz } : null,
      spread: 0.35,
      gravity: 7,
      bounce: 0.3,
      life: [0.12, 0.28],
      size: [0.06, 0.1],
    });
    // 2. Concrete pulverized debris chips
    particles.spawnBurst(x, y, z, {
      count: 4,
      color: [0.45, 0.45, 0.42],
      speed: [1.2, 3.0],
      dir: (nx !== 0 || nz !== 0) ? { x: nx, z: nz } : null,
      spread: 0.5,
      gravity: 9,
      bounce: 0.2,
      drag: 1.2,
      growth: 0.8,
      life: [0.25, 0.45],
      size: [0.07, 0.13],
    });
  },
  impactSpark: (x, z, hitColor = [1, 0.85, 0.4]) => particles.spawnBurst(x, 1.0, z, {
    count: 6, color: hitColor, speed: [2, 4.5], life: [0.12, 0.25], size: [0.06, 0.11], gravity: 6,
  }),
  enemyDeath: (x, z, color) => particles.spawnBurst(x, 0.7, z, {
    count: 18, color, speed: [2, 5], life: [0.3, 0.6], size: [0.1, 0.2], gravity: 8, spread: 1,
  }),
  enemyHit: (x, z, color) => particles.spawnBurst(x, 0.8, z, {
    count: 6, color, speed: [1.5, 4.0], life: [0.15, 0.32], size: [0.07, 0.13], gravity: 7,
  }),
  playerHit: (x, z) => particles.spawnBurst(x, 1.1, z, {
    count: 8, color: [0.9, 0.15, 0.15], speed: [1.5, 3.5], life: [0.2, 0.4], size: [0.08, 0.14], gravity: 5,
  }),
  doorSpark: (x, y, z) => particles.spawnBurst(x, y, z, {
    count: 8, color: [1, 0.75, 0.3], speed: [2, 4.5], life: [0.12, 0.25], size: [0.06, 0.11], gravity: 6,
  }),
  pickupHeal: (x, z) => particles.spawnBurst(x, 0.6, z, {
    count: 12, color: [0.35, 0.9, 0.6], speed: [1, 2.5], life: [0.35, 0.6], size: [0.08, 0.15], gravity: -2,
  }),
  pickupStim: (x, z) => particles.spawnBurst(x, 0.6, z, {
    count: 12, color: [0.3, 0.82, 0.77], speed: [1, 2.5], life: [0.35, 0.6], size: [0.08, 0.15], gravity: -2,
  }),
  turretDeploy: (x, z) => particles.spawnBurst(x, 0.3, z, {
    count: 14, color: [0.6, 0.5, 0.75], speed: [1.5, 3.0], life: [0.25, 0.45], size: [0.09, 0.18], gravity: 3,
  }),
  shotgunBlast: (x, z, angle) => particles.spawnBurst(x, 1.0, z, {
    count: 20, color: [1, 0.55, 0.2], speed: [4, 9], life: [0.12, 0.28], size: [0.1, 0.2], gravity: 1,
    dir: { x: Math.sin(angle), z: Math.cos(angle) }, spread: 0.65,
  }),
  enemySpawn: (x, z, color) => particles.spawnBurst(x, 0.5, z, {
    count: 10, color, speed: [1.2, 3.5], life: [0.2, 0.4], size: [0.09, 0.16], gravity: 2,
  }),

  // Multi-stage explosion: fireball + billowing smoke + hot embers
  explosionDebris: (x, z, radius = 2.0) => {
    particles.spawnBurst(x, 0.6, z, {
      count: 16,
      color: [1.0, 0.65, 0.18],
      speed: [radius * 1.8, radius * 3.8],
      spread: 1,
      gravity: 1,
      drag: 3.2,
      growth: 2.5,
      life: [0.2, 0.38],
      size: [0.18, 0.35],
    });
    particles.spawnBurst(x, 0.8, z, {
      count: 12,
      color: [0.24, 0.22, 0.2],
      speed: [1.0, 2.8],
      spread: 1,
      gravity: -0.8,
      drag: 2.2,
      growth: 2.8,
      life: [0.45, 0.85],
      size: [0.22, 0.4],
    });
    particles.spawnBurst(x, 0.7, z, {
      count: 16,
      color: [1.0, 0.88, 0.35],
      speed: [radius * 2.0, radius * 5.0],
      spread: 1,
      gravity: 9,
      bounce: 0.4,
      life: [0.35, 0.7],
      size: [0.07, 0.13],
    });
  },

  // Caustic acid spit projectile trails & impact splash
  acidTrail: (x, y = 0.9, z) => {
    particles.spawnBurst(x, y, z, {
      count: 1,
      color: [0.45, 0.95, 0.25],
      speed: [0.2, 0.8],
      spread: 1,
      gravity: 1.8,
      drag: 1.2,
      growth: 0.8,
      life: [0.2, 0.4],
      size: [0.08, 0.14],
    });
  },
  acidSplash: (x, z) => {
    particles.spawnBurst(x, 0.4, z, {
      count: 12,
      color: [0.4, 1.0, 0.28],
      speed: [2.2, 5.0],
      spread: 1,
      gravity: 8,
      bounce: 0.25,
      life: [0.2, 0.4],
      size: [0.09, 0.18],
    });
  },

  // Player movement & state FX
  footstep: (x, z) => {
    particles.spawnBurst(x, 0.05, z, {
      count: 2,
      color: [0.38, 0.38, 0.4],
      speed: [0.3, 0.8],
      spread: 1,
      gravity: -0.2,
      drag: 2.5,
      growth: 1.2,
      life: [0.15, 0.3],
      size: [0.08, 0.14],
    });
  },
  stimTrail: (x, z) => {
    particles.spawnBurst(x, 0.5, z, {
      count: 2,
      color: [0.25, 0.95, 0.9],
      speed: [0.5, 1.5],
      spread: 1,
      gravity: -1.0,
      drag: 1.5,
      life: [0.15, 0.3],
      size: [0.07, 0.13],
    });
  },
  criticalDamage: (x, z) => {
    particles.spawnBurst(x, 0.9, z, {
      count: 2,
      color: [0.4, 0.85, 1.0],
      speed: [1.8, 3.8],
      spread: 1,
      gravity: 6,
      bounce: 0.3,
      life: [0.08, 0.2],
      size: [0.05, 0.1],
    });
    particles.spawnBurst(x, 0.8, z, {
      count: 1,
      color: [0.85, 0.12, 0.12],
      speed: [0.4, 1.2],
      spread: 1,
      gravity: 2,
      life: [0.2, 0.4],
      size: [0.08, 0.14],
    });
  },

  // Atmospheric & Environmental FX
  ambientDust: (cx, cz, count = 1) => {
    particles.spawnBurst(cx, 1.2, cz, {
      count,
      posJitter: { x: 14, y: 2.0, z: 14 },
      color: [0.38, 0.42, 0.48],
      speed: [0.05, 0.2],
      spread: 1,
      gravity: -0.05,
      drag: 0.2,
      life: [2.0, 4.0],
      size: [0.05, 0.09],
    });
  },
  steamVent: (x, y, z, nx = 0, nz = 0) => {
    particles.spawnBurst(x, y, z, {
      count: 5,
      color: [0.55, 0.6, 0.65],
      speed: [2.8, 4.8],
      dir: (nx !== 0 || nz !== 0) ? { x: nx, z: nz } : null,
      spread: 0.28,
      gravity: -1.0,
      drag: 2.2,
      growth: 2.4,
      life: [0.35, 0.7],
      size: [0.14, 0.25],
    });
  },
  electricalSparks: (x, y, z) => {
    particles.spawnBurst(x, y, z, {
      count: 4,
      color: [0.45, 0.85, 1.0],
      speed: [2.0, 5.0],
      spread: 1,
      gravity: 7,
      bounce: 0.35,
      life: [0.08, 0.2],
      size: [0.05, 0.12],
    });
  },
  hackStream: (startX, startY, startZ, targetX, targetY, targetZ) => {
    const dx = targetX - startX;
    const dy = targetY - startY;
    const dz = targetZ - startZ;
    const dist = Math.hypot(dx, dy, dz) || 1;
    particles.spawnBurst(startX, startY, startZ, {
      count: 2,
      color: [0.2, 1.0, 0.75],
      speed: [dist * 2.0, dist * 3.2],
      dir: { x: dx / dist, z: dz / dist },
      vyBias: (dy / dist) * 1.5,
      spread: 0.15,
      gravity: 0,
      drag: 0.2,
      life: [0.2, 0.4],
      size: [0.06, 0.11],
    });
  },
  teleporterVortex: (x, z, radius = 1.6) => {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * radius * 0.8;
    const px = x + Math.cos(angle) * r;
    const pz = z + Math.sin(angle) * r;
    const tanX = -Math.sin(angle);
    const tanZ = Math.cos(angle);
    particles.spawnBurst(px, 0.25, pz, {
      count: 1,
      color: [0.15, 0.95, 0.9],
      speed: [1.0, 2.2],
      dir: { x: tanX, z: tanZ },
      vyBias: 2.0,
      spread: 0.2,
      gravity: -3.0,
      drag: 0.5,
      life: [0.4, 0.75],
      size: [0.08, 0.15],
    });
  },
};
