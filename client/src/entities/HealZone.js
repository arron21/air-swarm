import * as THREE from 'three/webgpu';
import { HEAL_ZONE } from '@air-swarm/shared';

const COLOR = 0x4fd166;
const CROSS_COLOR = 0x6eff89;

let sharedCrossTexture = null;
function getCrossTexture() {
  if (sharedCrossTexture) return sharedCrossTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Radial soft glow behind the cross
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, 'rgba(79, 209, 102, 0.7)');
  glow.addColorStop(0.5, 'rgba(79, 209, 102, 0.25)');
  glow.addColorStop(1, 'rgba(79, 209, 102, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);

  // Sharp glowing medical cross in center
  ctx.fillStyle = '#6eff89';
  ctx.shadowColor = '#4fd166';
  ctx.shadowBlur = 6;
  ctx.fillRect(18, 26, 28, 12);
  ctx.fillRect(26, 18, 12, 28);

  sharedCrossTexture = new THREE.CanvasTexture(canvas);
  return sharedCrossTexture;
}

// A standing heal radius on the ground with dynamic heartbeat breathing,
// expanding ripple shockwaves, and floating bio-nanite medical crosses.
export class HealZone {
  constructor(id) {
    this.id = id;
    this.life = HEAL_ZONE.duration;
    this._pulseT = Math.random() * 10;
    this._waveT = 0;

    this.group = new THREE.Group();

    // 1. Base ground fill disc (with heartbeat pulse scaling)
    const fillGeom = new THREE.CircleGeometry(HEAL_ZONE.radius, 40);
    fillGeom.rotateX(-Math.PI / 2);
    this.fillMat = new THREE.MeshBasicMaterial({
      color: COLOR,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    this.fill = new THREE.Mesh(fillGeom, this.fillMat);
    this.fill.position.y = 0.03;
    this.group.add(this.fill);

    // 2. Main defined boundary rim
    const ringGeom = new THREE.RingGeometry(HEAL_ZONE.radius - 0.14, HEAL_ZONE.radius, 48);
    ringGeom.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: COLOR,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(ringGeom, this.ringMat);
    this.ring.position.y = 0.04;
    this.group.add(this.ring);

    // 3. Expanding concentric ripple waves (outward pulse waves)
    this.ripples = [];
    const rippleGeom = new THREE.RingGeometry(0.92, 1.0, 48);
    rippleGeom.rotateX(-Math.PI / 2);

    for (let i = 0; i < 2; i++) {
      const rMat = new THREE.MeshBasicMaterial({
        color: COLOR,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const rMesh = new THREE.Mesh(rippleGeom, rMat);
      rMesh.position.y = 0.035 + i * 0.002;
      this.group.add(rMesh);
      this.ripples.push({ mesh: rMesh, mat: rMat, offset: i * 0.5 });
    }

    // 4. Floating medical cross sprites (gently drift upwards and fade out)
    this.crosses = [];
    const crossTex = getCrossTexture();
    const crossCount = 5;
    for (let i = 0; i < crossCount; i++) {
      const crossMat = new THREE.SpriteMaterial({
        map: crossTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(crossMat);
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * (HEAL_ZONE.radius * 0.75);
      sprite.position.set(
        Math.cos(angle) * dist,
        0.2 + Math.random() * 1.2,
        Math.sin(angle) * dist,
      );
      sprite.scale.set(0.38, 0.38, 1);
      this.group.add(sprite);

      this.crosses.push({
        sprite,
        mat: crossMat,
        angle,
        dist,
        speedY: 0.55 + Math.random() * 0.35,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }

    // 5. Pulsing emerald point light
    this.light = new THREE.PointLight(COLOR, 1.2, HEAL_ZONE.radius * 2.2);
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
    // Fade out smoothly over the final 2 seconds of lifespan
    const fadeT = Math.min(1, this.life / 2);

    // 1. Heartbeat breathing pulse
    this._pulseT += dt * 3.4;
    const beat = Math.pow(Math.max(0, Math.sin(this._pulseT)), 2.5);

    // Subtle scale breathing for the ground disc and rim
    const scale = 1.0 + beat * 0.045;
    this.fill.scale.set(scale, 1, scale);
    this.fillMat.opacity = (0.13 + beat * 0.12) * fadeT;

    this.ringMat.opacity = (0.5 + beat * 0.38) * fadeT;
    this.ring.position.y = 0.04 + beat * 0.01;

    // Dynamic emerald light pulse
    this.light.intensity = (0.8 + beat * 1.6) * fadeT;

    // 2. Expanding ripple waves
    this._waveT = (this._waveT + dt * 0.8) % 1.0;
    for (const r of this.ripples) {
      const progress = (this._waveT + r.offset) % 1.0;
      const currentRadius = HEAL_ZONE.radius * Math.max(0.01, progress);
      r.mesh.scale.set(currentRadius, 1, currentRadius);
      // Fade in towards center and out towards the rim
      const alpha = Math.sin(progress * Math.PI) * 0.55;
      r.mat.opacity = alpha * fadeT;
    }

    // 3. Rising medical nano-crosses
    for (const c of this.crosses) {
      c.sprite.position.y += c.speedY * dt;
      c.wobblePhase += dt * 2.0;
      // Slight horizontal drift
      c.sprite.position.x = Math.cos(c.angle) * c.dist + Math.sin(c.wobblePhase) * 0.08;
      c.sprite.position.z = Math.sin(c.angle) * c.dist + Math.cos(c.wobblePhase) * 0.08;

      const progressY = (c.sprite.position.y - 0.2) / 1.4;
      if (progressY >= 1.0) {
        c.sprite.position.y = 0.2;
        c.angle = Math.random() * Math.PI * 2;
        c.dist = Math.sqrt(Math.random()) * (HEAL_ZONE.radius * 0.75);
      } else {
        // Curve opacity so it fades in near ground and fades out at top
        const crossAlpha = Math.sin(progressY * Math.PI) * 0.75;
        c.mat.opacity = crossAlpha * fadeT;
      }
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
