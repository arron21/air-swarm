// Shared between server (authoritative sim) and client (prediction/rendering).
// Keep this file dependency-free (no THREE, no Node built-ins).

export const TICK_RATE = 30; // Hz
export const TICK_DT = 1 / TICK_RATE;

export const MAX_PLAYERS = 4;

export const CLASSES = {
  marine: {
    hackRate: 0,
    ability: 'healthPack',
    weaponName: 'Assault Rifle',
    weapon: { damage: 12, fireInterval: 0.14, range: 30, spread: 0.02 },
  },
  engineer: {
    hackRate: 1,
    ability: 'turret',
    weaponName: 'Volt Carbine',
    weapon: { damage: 8, fireInterval: 0.09, range: 22, spread: 0.06 },
  },
  heavy: {
    hackRate: 0,
    ability: 'landMine',
    weaponName: 'Heavy Repeater',
    weapon: { damage: 24, fireInterval: 0.22, range: 35, spread: 0.05 },
  },
  medic: {
    hackRate: 0,
    ability: 'stimPack',
    weaponName: 'Needler Carbine',
    weapon: { damage: 15, fireInterval: 0.18, range: 25, spread: 0.005 },
  },
};
export const DEFAULT_CLASS = 'marine';

export const ABILITY_COOLDOWN = {
  healthPack: 15,
  turret: 25,
  landMine: 12,
  stimPack: 15,
};

// A standing healing zone rather than a one-shot pickup: it persists on the ground for
// `duration` seconds, and any player standing within `radius` heals continuously at a
// rate calibrated so `healTime` seconds of exposure takes them from 0 HP to full.
export const HEAL_ZONE = {
  radius: 3.0,
  duration: 10,
  healTime: 6,
};

export const STIM_ZONE = {
  radius: 3.0,
  duration: 10,
};

export const LAND_MINE = {
  damage: 300,
  radius: 3.5,
  triggerRadius: 1.5,
};

export const STIM_PACK = {
  fireRateMultiplier: 0.45, // multiplies fireInterval, so lower = faster shooting
  duration: 8,
  radius: 1.2,
  lifespan: 25,
};

export const TURRET = {
  range: 14,
  damage: 9,
  fireInterval: 0.35,
  lifespan: 25,
  radius: 0.5,
};

export const SHOTGUN_BLAST = {
  range: 6.5,
  halfAngle: (55 * Math.PI) / 180,
  damage: 45,
};

export const PLAYER = {
  radius: 0.5,
  speed: 6.0, // units/sec
  maxHp: 100,
  invulnTime: 2.5, // grace period after revive so a hold-the-line room can't insta-kill on spawn
};

// Downed players don't auto-respawn — a medic must hold [E] at their body.
export const REVIVE = {
  range: 3.0,
  time: 15.0, // seconds for one medic to revive solo
  reduction: 0.55, // each additional simultaneous reviver multiplies remaining time by this
};

// Fields shared across every enemy type regardless of behavior.
export const ENEMY = {
  separationRadius: 1.1,
  aggroRange: 40,
};

// Per-type stats. `behavior` picks the AI branch in World.updateEnemies:
//   'melee'   — walk to contact range, hit on a cooldown (drone, brute)
//   'ranged'  — hold a stand-off distance and fire projectiles (spitter)
//   'explode' — rush in and detonate an AoE burst on contact (boomer)
export const ENEMY_TYPES = {
  drone: {
    behavior: 'melee',
    radius: 0.45, speed: 3.2, maxHp: 30,
    contactDamage: 8, contactCooldown: 0.8,
    scoreValue: 100, color: 0x2f8f3a,
  },
  brute: {
    behavior: 'melee',
    radius: 0.8, speed: 1.7, maxHp: 110,
    contactDamage: 22, contactCooldown: 1.1,
    scoreValue: 250, color: 0x7a3b23,
  },
  spitter: {
    behavior: 'ranged',
    radius: 0.5, speed: 2.4, maxHp: 22,
    standRange: 9, fireInterval: 1.6,
    scoreValue: 160, color: 0x6a3fb0,
  },
  boomer: {
    behavior: 'explode',
    radius: 0.55, speed: 3.9, maxHp: 16,
    explodeRadius: 3.5, explodeDamage: 32,
    scoreValue: 180, color: 0xd7972d,
  },
};

// Per-level difficulty tuning: how many enemies can be alive at once and how fast they
// spawn (ambient corridor travel vs. the heavier gate "hold the line" fights), plus the
// relative spawn-weight mix — higher levels lean harder into brutes/boomers over drones.
export const DIFFICULTY = {
  1: {
    wave: { maxConcurrent: 4, spawnInterval: 1.6 },
    gateWave: { maxConcurrent: 6, spawnInterval: 1.0 },
    enemyWeights: { drone: 65, brute: 8, spitter: 15, boomer: 12 },
  },
  2: {
    wave: { maxConcurrent: 6, spawnInterval: 1.2 },
    gateWave: { maxConcurrent: 10, spawnInterval: 0.7 },
    enemyWeights: { drone: 50, brute: 12, spitter: 20, boomer: 18 },
  },
  3: {
    wave: { maxConcurrent: 9, spawnInterval: 0.85 },
    gateWave: { maxConcurrent: 14, spawnInterval: 0.5 },
    enemyWeights: { drone: 35, brute: 22, spitter: 20, boomer: 23 },
  },
};

// Keeps enemy spawning from ambushing players who haven't had a chance to react —
// no enemy should pop into existence right next to someone.
export const SPAWN_SAFETY = {
  minDistanceFromPlayers: 9, // ambient corridor spawns won't pick a point this close to anyone alive
  gateMinDistanceFromPlayers: 3.5, // lighter floor for gate "hold the line" spawns, which are meant to be tense
  graceTime: 4, // seconds after a match starts (or resets after a wipe) before ambient spawning begins
};

export const PROJECTILE = {
  speed: 13,
  damage: 9,
  radius: 0.3,
  range: 14,
};

export const WEAPON = {
  rifle: {
    damage: 12,
    fireInterval: 0.14,
    range: 30,
    spread: 0.02,
  },
};

export const DOOR = {
  hackRange: 3.0,
  hackTime: 9.0, // seconds for one engineer to hack solo
  hackReduction: 0.55, // each additional simultaneous hacker multiplies remaining time by this
};

export const TELEPORTER = {
  radius: 1.5,
};

// Clamp a point to the level's outer bounds. `world` is {minX,maxX,minZ,maxZ}.
export function clampToWorld(x, z, radius, world) {
  const minX = world.minX + radius;
  const maxX = world.maxX - radius;
  const minZ = world.minZ + radius;
  const maxZ = world.maxZ - radius;
  return [Math.max(minX, Math.min(maxX, x)), Math.max(minZ, Math.min(maxZ, z))];
}

// Resolve circle-vs-AABB collision by pushing (x,z) out of any overlapping rect in `rects`.
// `rects` is any list of {x,z,w,d} — static level walls, plus closed doors, concatenated by the caller.
export function resolveWallCollisions(x, z, radius, rects) {
  for (const wall of rects) {
    const hw = wall.w / 2 + radius;
    const hd = wall.d / 2 + radius;
    const dx = x - wall.x;
    const dz = z - wall.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const overlapX = hw - Math.abs(dx);
      const overlapZ = hd - Math.abs(dz);
      if (overlapX < overlapZ) {
        x = wall.x + Math.sign(dx || 1) * hw;
      } else {
        z = wall.z + Math.sign(dz || 1) * hd;
      }
    }
  }
  return [x, z];
}

// Slab (ray-vs-AABB) occlusion test — used so gunfire can be blocked by walls/closed doors.
export function rayHitsRectBefore(ox, oz, dx, dz, maxT, rects) {
  for (const rect of rects) {
    const minX = rect.x - rect.w / 2;
    const maxX = rect.x + rect.w / 2;
    const minZ = rect.z - rect.d / 2;
    const maxZ = rect.z + rect.d / 2;

    let tMin = 0;
    let tMax = maxT;

    if (Math.abs(dx) < 1e-9) {
      if (ox < minX || ox > maxX) continue;
    } else {
      let t1 = (minX - ox) / dx;
      let t2 = (maxX - ox) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    }

    if (Math.abs(dz) < 1e-9) {
      if (oz < minZ || oz > maxZ) continue;
    } else {
      let t1 = (minZ - oz) / dz;
      let t2 = (maxZ - oz) / dz;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    }

    if (tMin <= tMax && tMin < maxT && tMax > 0) return true;
  }
  return false;
}

export function pointInRect(x, z, rect) {
  return Math.abs(x - rect.x) <= rect.w / 2 && Math.abs(z - rect.z) <= rect.d / 2;
}
