import {
  TICK_RATE, TICK_DT, MAX_PLAYERS, CLASSES, DEFAULT_CLASS,
  PLAYER, ENEMY, ENEMY_TYPES, DIFFICULTY, PROJECTILE, WEAPON, DOOR, REVIVE, SPAWN_SAFETY,
  ABILITY_COOLDOWN, HEAL_ZONE, STIM_ZONE, LAND_MINE, STIM_PACK, TURRET, SHOTGUN_BLAST, TELEPORTER,
  clampToWorld, resolveWallCollisions, rayHitsRectBefore, pointInRect,
  LEVELS,
} from '@air-swarm/shared';

let nextPlayerId = 1;
let nextEnemyId = 1;
let nextPickupId = 1;
let nextTurretId = 1;
let nextProjectileId = 1;
let nextHealZoneId = 1;
let nextGrenadeId = 1;
let nextStimZoneId = 1;
let nextLandMineId = 1;

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Ray-vs-AABB entry distance along (ox,oz)+(dx,dz)*t, or null if it misses within [0,maxT].
function rayRectEntryT(ox, oz, dx, dz, maxT, rect) {
  const minX = rect.x - rect.w / 2;
  const maxX = rect.x + rect.w / 2;
  const minZ = rect.z - rect.d / 2;
  const maxZ = rect.z + rect.d / 2;

  let tMin = 0;
  let tMax = maxT;

  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return null;
  } else {
    let t1 = (minX - ox) / dx;
    let t2 = (maxX - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  if (Math.abs(dz) < 1e-9) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    let t1 = (minZ - oz) / dz;
    let t2 = (maxZ - oz) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  if (tMin > tMax || tMax < 0 || tMin > maxT) return null;
  return Math.max(tMin, 0);
}

export class World {
  constructor(levelId) {
    this.level = LEVELS[levelId] || LEVELS[1];
    this.difficulty = DIFFICULTY[this.level.id] || DIFFICULTY[1];

    this.enemyTypeEntries = Object.entries(this.difficulty.enemyWeights);
    this.enemyTypeWeightTotal = this.enemyTypeEntries.reduce((sum, [, w]) => sum + w, 0);

    this.players = new Map(); // id -> player state
    this.enemies = new Map(); // id -> enemy state
    this.pickups = new Map(); // id -> {id,type,x,z,radius,life}
    this.healZones = new Map(); // id -> {id,ownerId,x,z,life}
    this.stimZones = new Map(); // id -> {id,ownerId,x,z,life}
    this.turrets = new Map(); // id -> {id,ownerId,x,z,life,fireCooldown}
    this.projectiles = new Map(); // id -> {id,x,z,dx,dz,traveled}
    this.grenades = new Map();
    this.landMines = new Map(); // id -> {id,ownerId,x,z,life}
    this.tick = 0;
    this.spawnTimer = 0;
    this.matchElapsed = 0;
    this.events = [];
    this._interval = null;
    this.gameOver = false;

    this.doors = new Map();
    for (const g of this.level.gates) {
      const state = { ...g.door, hp: g.door.maxHp, open: false, hackProgress: 0, hackers: 0 };
      this.doors.set(state.id, state);
    }

    this.nests = new Map();
    if (this.level.nests) {
      for (const n of this.level.nests) {
        this.nests.set(n.id, {
          id: n.id,
          x: n.x,
          z: n.z,
          w: 1.3,
          d: 1.3,
          hp: 120,
          maxHp: 120,
        });
      }
    }

    this.gates = [];
    for (const g of this.level.gates) {
      const spawnNests = [];
      let index = 0;
      for (const pt of g.spawnPoints) {
        const nestId = 1000 * g.door.id + index;
        index++;

        this.nests.set(nestId, {
          id: nestId,
          x: pt.x,
          z: pt.z,
          w: 1.3,
          d: 1.3,
          hp: 120,
          maxHp: 120,
          isWallTunnel: true,
        });
        spawnNests.push({ id: nestId, x: pt.x, z: pt.z });
      }

      this.gates.push({
        room: g.room,
        spawnPoints: spawnNests,
        door: this.doors.get(g.door.id),
      });
    }
  }

  pickEnemyType() {
    let roll = Math.random() * this.enemyTypeWeightTotal;
    for (const [type, weight] of this.enemyTypeEntries) {
      roll -= weight;
      if (roll <= 0) return type;
    }
    return this.enemyTypeEntries[0][0];
  }

  // Candidates near the lead player, but never so close to ANY alive player that an
  // enemy would pop into existence right on top of someone.
  ambientSpawnPointsNear(leadPlayer, alivePlayers, count = 4) {
    const minDistSq = SPAWN_SAFETY.minDistanceFromPlayers ** 2;
    const safe = this.level.ambientSpawnPoints.filter((pt) => alivePlayers.every(
      (p) => (pt.x - p.x) ** 2 + (pt.z - p.z) ** 2 >= minDistSq,
    ));
    return safe
      .map((pt) => ({ pt, d: (pt.x - leadPlayer.x) ** 2 + (pt.z - leadPlayer.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, count)
      .map((e) => e.pt);
  }

  addPlayer(ws) {
    if (this.players.size >= MAX_PLAYERS) {
      ws.close(4000, 'server full');
      return null;
    }
    const id = nextPlayerId++;
    const spawn = this.level.playerSpawns[(id - 1) % this.level.playerSpawns.length];
    const player = {
      id,
      ws,
      name: `Marine-${id}`,
      cls: DEFAULT_CLASS,
      x: spawn.x,
      z: spawn.z,
      angle: 0,
      hp: PLAYER.maxHp,
      alive: true,
      reviveProgress: 0,
      revivers: 0,
      invulnTimer: PLAYER.invulnTime,
      lastInputSeq: 0,
      moveX: 0,
      moveZ: 0,
      firing: false,
      hacking: false,
      fireCooldown: 0,
      abilityCooldown: 0,
      stimTimer: 0,
      score: 0,
      grenades: 1,
      joined: false,
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(player) {
    if (!player) return;
    this.players.delete(player.id);
  }

  onMessage(player, msg) {
    if (!player) return;
    if (msg.t === 'join') {
      player.name = String(msg.name || player.name).slice(0, 16);
      player.cls = CLASSES[msg.cls] ? msg.cls : DEFAULT_CLASS;
      player.joined = true;
      player.grenades = 1;
      player.invulnTimer = PLAYER.invulnTime; // grace period so a fresh join/rejoin can't be instantly swarmed
      this.send(player, {
        t: 'welcome',
        id: player.id,
        world: this.level.world,
        walls: this.level.walls,
        doors: [...this.doors.values()],
        rooms: this.gates.map((g) => g.room),
        gates: this.gates.map((g) => ({ doorId: g.door.id, spawnPoints: g.spawnPoints })),
        ambientSpawnPoints: this.level.ambientSpawnPoints,
        level: { id: this.level.id, name: this.level.name, difficulty: this.level.difficulty },
        tickRate: TICK_RATE,
      });
    } else if (msg.t === 'input') {
      if (!player.joined) return;
      player.moveX = clampNum(msg.moveX, -1, 1);
      player.moveZ = clampNum(msg.moveZ, -1, 1);
      player.angle = Number.isFinite(msg.angle) ? msg.angle : player.angle;
      player.firing = !!msg.firing;
      player.hacking = !!msg.hacking;
      player.lastInputSeq = msg.seq | 0;
    } else if (msg.t === 'ability') {
      if (!player.joined) return;
      this.useAbility(player);
    } else if (msg.t === 'grenade') {
      if (!player.joined) return;
      this.throwGrenade(player);
    }
  }

  send(player, obj) {
    if (player.ws.readyState === 1) {
      player.ws.send(JSON.stringify(obj));
    }
  }

  broadcast(obj) {
    const raw = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p.ws.readyState === 1) p.ws.send(raw);
    }
  }

  start() {
    this._interval = setInterval(() => this.step(TICK_DT), 1000 / TICK_RATE);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }

  // Static walls plus any door that isn't open yet, plus alive alien nests — the current blocking set.
  getBlockingRects() {
    const rects = this.level.walls;
    const closedDoors = [];
    for (const door of this.doors.values()) {
      if (!door.open) closedDoors.push(door);
    }
    const aliveNests = [];
    for (const nest of this.nests.values()) {
      if (nest.hp > 0) aliveNests.push(nest);
    }
    let res = rects;
    if (closedDoors.length) res = res.concat(closedDoors);
    if (aliveNests.length) res = res.concat(aliveNests);
    return res;
  }

  step(dt) {
    this.tick++;
    this.matchElapsed += dt;
    this.events = [];

    const blockingRects = this.getBlockingRects();
    this.updatePlayers(dt, blockingRects);
    this.updateRevives(dt);
    this.updateDoors(dt);
    this.updateNests(dt);
    this.updateWaveDirector(dt);
    this.updateEnemies(dt, blockingRects);
    this.updatePickups(dt);
    this.updateHealZones(dt);
    this.updateStimZones(dt);
    this.updateTurrets(dt, blockingRects);
    this.updateGrenades(dt);
    this.updateLandMines(dt);
    this.checkVictory();
    this.checkTeamWipe();
    this.broadcastState();
  }

  // If every joined player is downed at once, the mission fails: notify everyone,
  // wipe the run state clean, and un-join players so they land back at the main menu
  // until they explicitly rejoin.
  checkTeamWipe() {
    if (this.gameOver) return;
    const joinedPlayers = [...this.players.values()].filter((p) => p.joined);
    if (joinedPlayers.length === 0) return;
    if (!joinedPlayers.every((p) => !p.alive)) return;

    this.gameOver = true;
    this.broadcast({ t: 'gameOver' });
    this.resetMission();
    this.gameOver = false;
  }

  checkVictory() {
    if (this.gameOver) return;
    const alivePlayers = [...this.players.values()].filter((p) => p.joined && p.alive);
    if (alivePlayers.length === 0) return;

    const tx = this.level.endZone.x;
    const tz = this.level.endZone.z;

    for (const p of alivePlayers) {
      const dist = Math.hypot(p.x - tx, p.z - tz);
      if (dist <= TELEPORTER.radius) {
        this.triggerVictory();
        break;
      }
    }
  }

  triggerVictory() {
    this.gameOver = true;
    this.broadcast({ t: 'victory' });
    this.resetMission();
    this.gameOver = false;
  }

  resetMission() {
    this.enemies.clear();
    this.projectiles.clear();
    this.pickups.clear();
    this.healZones.clear();
    this.stimZones.clear();
    this.turrets.clear();
    this.grenades.clear();
    this.landMines.clear();
    this.spawnTimer = 0;
    this.matchElapsed = 0;

    this.nests.clear();
    if (this.level.nests) {
      for (const n of this.level.nests) {
        this.nests.set(n.id, {
          id: n.id,
          x: n.x,
          z: n.z,
          w: 1.3,
          d: 1.3,
          hp: 120,
          maxHp: 120,
        });
      }
    }
    for (const g of this.gates) {
      for (const pt of g.spawnPoints) {
        this.nests.set(pt.id, {
          id: pt.id,
          x: pt.x,
          z: pt.z,
          w: 1.3,
          d: 1.3,
          hp: 120,
          maxHp: 120,
          isWallTunnel: true,
        });
      }
    }

    for (const door of this.doors.values()) {
      door.hp = door.maxHp;
      door.open = false;
      door.hackProgress = 0;
      door.hackers = 0;
    }

    let i = 0;
    for (const p of this.players.values()) {
      const spawn = this.level.playerSpawns[i % this.level.playerSpawns.length];
      i++;
      p.x = spawn.x;
      p.z = spawn.z;
      p.hp = PLAYER.maxHp;
      p.alive = true;
      p.invulnTimer = PLAYER.invulnTime;
      p.reviveProgress = 0;
      p.revivers = 0;
      p.score = 0;
      p.grenades = 1;
      p.abilityCooldown = 0;
      p.stimTimer = 0;
      p.moveX = 0;
      p.moveZ = 0;
      p.firing = false;
      p.hacking = false;
      p.joined = false;
    }
  }

  updatePlayers(dt, blockingRects) {
    for (const p of this.players.values()) {
      if (!p.joined) continue;

      if (!p.alive) continue;

      p.invulnTimer = Math.max(0, p.invulnTimer - dt);
      p.abilityCooldown = Math.max(0, p.abilityCooldown - dt);
      p.stimTimer = Math.max(0, p.stimTimer - dt);

      const inputLen = Math.min(1, Math.hypot(p.moveX, p.moveZ));
      const dirLen = Math.hypot(p.moveX, p.moveZ) || 1;
      const nx = p.moveX / dirLen;
      const nz = p.moveZ / dirLen;
      let x = p.x + nx * PLAYER.speed * inputLen * dt;
      let z = p.z + nz * PLAYER.speed * inputLen * dt;

      [x, z] = clampToWorld(x, z, PLAYER.radius, this.level.world);
      [x, z] = resolveWallCollisions(x, z, PLAYER.radius, blockingRects);
      p.x = x;
      p.z = z;

      p.fireCooldown = Math.max(0, p.fireCooldown - dt);
      if (p.firing && p.fireCooldown <= 0) {
        const weapon = CLASSES[p.cls]?.weapon || CLASSES.marine.weapon;
        p.fireCooldown = weapon.fireInterval * (p.stimTimer > 0 ? STIM_PACK.fireRateMultiplier : 1);
        this.fireRifle(p, blockingRects);
      }
    }
  }

  fireRifle(player, blockingRects) {
    const weapon = CLASSES[player.cls]?.weapon || CLASSES.marine.weapon;
    const dx = Math.sin(player.angle);
    const dz = Math.cos(player.angle);
    const spread = weapon.spread * (Math.random() - 0.5) * 2;
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const rdx = dx * cos - dz * sin;
    const rdz = dx * sin + dz * cos;

    let closestT = weapon.range;
    let hitEnemy = null;
    let hitDoor = null;
    let hitNest = null;
    let hitWallRect = null;

    // 1. Intersect with all environment blocking rects (walls, doors, nests)
    for (const rect of blockingRects) {
      const t = rayRectEntryT(player.x, player.z, rdx, rdz, closestT, rect);
      if (t !== null && t < closestT) {
        closestT = t;
        hitWallRect = rect;
      }
    }

    // 2. Intersect with enemies
    for (const e of this.enemies.values()) {
      const ex = e.x - player.x;
      const ez = e.z - player.z;
      const t = ex * rdx + ez * rdz;
      if (t < 0 || t > closestT) continue;
      const px = player.x + rdx * t;
      const pz = player.z + rdz * t;
      const eRadius = ENEMY_TYPES[e.type].radius;
      const distSq = (px - e.x) ** 2 + (pz - e.z) ** 2;
      if (distSq <= eRadius * eRadius) {
        closestT = t;
        hitEnemy = e;
        hitWallRect = null;
      }
    }

    // 3. Resolve environment hit targets
    if (hitWallRect) {
      if (hitWallRect.open !== undefined) {
        hitDoor = this.doors.get(hitWallRect.id);
      } else if (this.nests.has(hitWallRect.id)) {
        hitNest = this.nests.get(hitWallRect.id);
      }
    }

    this.events.push({
      type: 'shot',
      playerId: player.id,
      x: player.x,
      z: player.z,
      dx: rdx,
      dz: rdz,
      dist: (hitEnemy || hitDoor || hitNest || hitWallRect) ? closestT : weapon.range,
    });

    if (hitEnemy) {
      hitEnemy.hp -= weapon.damage;
      this.events.push({ type: 'enemyHit', enemyId: hitEnemy.id, hp: hitEnemy.hp, x: hitEnemy.x, z: hitEnemy.z, enemyType: hitEnemy.type });
      if (hitEnemy.hp <= 0) {
        this.enemies.delete(hitEnemy.id);
        player.score += ENEMY_TYPES[hitEnemy.type].scoreValue;
        this.events.push({ type: 'enemyDeath', enemyId: hitEnemy.id, x: hitEnemy.x, z: hitEnemy.z, enemyType: hitEnemy.type });
      }
    } else if (hitDoor) {
      hitDoor.hp -= weapon.damage;
      this.events.push({ type: 'doorHit', doorId: hitDoor.id, hp: hitDoor.hp });
      if (hitDoor.hp <= 0) {
        this.openDoor(hitDoor);
      }
    } else if (hitNest) {
      hitNest.hp -= weapon.damage;
      this.events.push({ type: 'nestHit', nestId: hitNest.id, hp: hitNest.hp, x: hitNest.x, z: hitNest.z });
      if (hitNest.hp <= 0) {
        player.score += 150;
        this.events.push({ type: 'nestDeath', nestId: hitNest.id, x: hitNest.x, z: hitNest.z });
      }
    }
  }

  useAbility(player) {
    if (!player.alive || player.abilityCooldown > 0) return;
    const ability = CLASSES[player.cls]?.ability;
    if (!ability) return;

    if (ability === 'healthPack') {
      this.healZones.set(nextHealZoneId, {
        id: nextHealZoneId, ownerId: player.id, x: player.x, z: player.z,
        life: HEAL_ZONE.duration,
      });
      nextHealZoneId++;
    } else if (ability === 'stimPack') {
      this.stimZones.set(nextStimZoneId, {
        id: nextStimZoneId, ownerId: player.id, x: player.x, z: player.z,
        life: STIM_ZONE.duration,
      });
      nextStimZoneId++;
    } else if (ability === 'turret') {
      for (const [id, t] of this.turrets) {
        if (t.ownerId === player.id) this.turrets.delete(id);
      }
      this.turrets.set(nextTurretId, {
        id: nextTurretId, ownerId: player.id, x: player.x, z: player.z,
        life: TURRET.lifespan, fireCooldown: 0.3,
      });
      nextTurretId++;
    } else if (ability === 'landMine') {
      this.landMines.set(nextLandMineId, {
        id: nextLandMineId, ownerId: player.id, x: player.x, z: player.z,
        life: 60,
      });
      nextLandMineId++;
    }

    player.abilityCooldown = ABILITY_COOLDOWN[ability];
    this.events.push({ type: 'abilityUsed', playerId: player.id, ability, x: player.x, z: player.z, angle: player.angle });
  }



  throwGrenade(player) {
    if (!player.alive || player.grenades <= 0) return;
    player.grenades--;

    const angle = player.angle;
    const facingX = Math.sin(angle);
    const facingZ = Math.cos(angle);

    const dist = 6.0;
    let targetX = player.x + facingX * dist;
    let targetZ = player.z + facingZ * dist;

    const blockingRects = this.getBlockingRects();
    [targetX, targetZ] = clampToWorld(targetX, targetZ, 0.4, this.level.world);
    [targetX, targetZ] = resolveWallCollisions(targetX, targetZ, 0.4, blockingRects);

    const grenadeId = nextGrenadeId++;
    this.grenades.set(grenadeId, {
      id: grenadeId,
      ownerId: player.id,
      x: player.x,
      z: player.z,
      startX: player.x,
      startZ: player.z,
      targetX,
      targetZ,
      t: 0,
      life: 1.2,
    });
  }

  updateGrenades(dt) {
    for (const g of [...this.grenades.values()]) {
      g.t += dt;
      if (g.t >= g.life) {
        this.explodeGrenade(g);
        this.grenades.delete(g.id);
        continue;
      }

      const pct = g.t / g.life;
      g.x = g.startX + (g.targetX - g.startX) * pct;
      g.z = g.startZ + (g.targetZ - g.startZ) * pct;
    }
  }

  explodeGrenade(g) {
    const radius = 3.0;
    const damage = 250;

    // Damage enemies
    for (const e of [...this.enemies.values()]) {
      const dist = Math.hypot(e.x - g.targetX, e.z - g.targetZ);
      if (dist <= radius) {
        e.hp -= damage;
        this.events.push({ type: 'enemyHit', enemyId: e.id, hp: e.hp, x: e.x, z: e.z, enemyType: e.type });
        if (e.hp <= 0) {
          this.enemies.delete(e.id);
          const owner = this.players.get(g.ownerId);
          if (owner) owner.score += ENEMY_TYPES[e.type].scoreValue;
          this.events.push({ type: 'enemyDeath', enemyId: e.id, x: e.x, z: e.z, enemyType: e.type });
        }
      }
    }

    // Damage nests
    for (const nest of [...this.nests.values()]) {
      if (nest.hp <= 0) continue;
      const dist = Math.hypot(nest.x - g.targetX, nest.z - g.targetZ);
      if (dist <= radius) {
        nest.hp -= damage;
        this.events.push({ type: 'nestHit', nestId: nest.id, hp: nest.hp, x: nest.x, z: nest.z });
        if (nest.hp <= 0) {
          const owner = this.players.get(g.ownerId);
          if (owner) owner.score += 150;
          this.events.push({ type: 'nestDeath', nestId: nest.id, x: nest.x, z: nest.z });
        }
      }
    }

    this.events.push({ type: 'explosion', x: g.targetX, z: g.targetZ, radius });
  }

  updateLandMines(dt) {
    for (const mine of [...this.landMines.values()]) {
      mine.life -= dt;
      if (mine.life <= 0) {
        this.landMines.delete(mine.id);
        continue;
      }

      let triggered = false;
      for (const e of this.enemies.values()) {
        const dist = Math.hypot(e.x - mine.x, e.z - mine.z);
        if (dist <= LAND_MINE.triggerRadius) {
          triggered = true;
          break;
        }
      }

      if (triggered) {
        this.explodeLandMine(mine);
      }
    }
  }

  explodeLandMine(mine) {
    const damage = LAND_MINE.damage;
    const radius = LAND_MINE.radius;

    for (const e of [...this.enemies.values()]) {
      const dist = Math.hypot(e.x - mine.x, e.z - mine.z);
      if (dist <= radius) {
        e.hp -= damage;
        this.events.push({ type: 'enemyHit', enemyId: e.id, hp: e.hp, x: e.x, z: e.z, enemyType: e.type });
        if (e.hp <= 0) {
          this.enemies.delete(e.id);
          const owner = this.players.get(mine.ownerId);
          if (owner) owner.score += ENEMY_TYPES[e.type].scoreValue;
          this.events.push({ type: 'enemyDeath', enemyId: e.id, x: e.x, z: e.z, enemyType: e.type });
        }
      }
    }

    for (const nest of [...this.nests.values()]) {
      if (nest.hp <= 0) continue;
      const dist = Math.hypot(nest.x - mine.x, nest.z - mine.z);
      if (dist <= radius) {
        nest.hp -= damage;
        this.events.push({ type: 'nestHit', nestId: nest.id, hp: nest.hp, x: nest.x, z: nest.z });
        if (nest.hp <= 0) {
          const owner = this.players.get(mine.ownerId);
          if (owner) owner.score += 150;
          this.events.push({ type: 'nestDeath', nestId: nest.id, x: nest.x, z: nest.z });
        }
      }
    }

    this.events.push({ type: 'explosion', x: mine.x, z: mine.z, radius });
    this.landMines.delete(mine.id);
  }

  updatePickups(dt) {
    for (const pickup of [...this.pickups.values()]) {
      pickup.life -= dt;
      if (pickup.life <= 0) {
        this.pickups.delete(pickup.id);
        continue;
      }

      for (const p of this.players.values()) {
        if (!p.joined || !p.alive) continue;
        const dist = Math.hypot(p.x - pickup.x, p.z - pickup.z);
        if (dist > pickup.radius) continue;

        p.stimTimer = STIM_PACK.duration;
        this.events.push({ type: 'pickupUsed', pickupId: pickup.id, playerId: p.id, kind: pickup.type, x: pickup.x, z: pickup.z });
        this.pickups.delete(pickup.id);
        break;
      }
    }
  }

  // Standing heal zone: doesn't get consumed — anyone inside its radius heals
  // continuously (at a rate that takes a fresh-spawned player exactly HEAL_ZONE.healTime
  // seconds to top off) for as long as both they and the zone remain.
  updateHealZones(dt) {
    const healRate = PLAYER.maxHp / HEAL_ZONE.healTime;
    for (const zone of [...this.healZones.values()]) {
      zone.life -= dt;
      if (zone.life <= 0) {
        this.healZones.delete(zone.id);
        continue;
      }

      for (const p of this.players.values()) {
        if (!p.joined || !p.alive || p.hp >= PLAYER.maxHp) continue;
        const dist = Math.hypot(p.x - zone.x, p.z - zone.z);
        if (dist > HEAL_ZONE.radius) continue;
        p.hp = Math.min(PLAYER.maxHp, p.hp + healRate * dt);
      }
    }
  }

  updateStimZones(dt) {
    for (const zone of [...this.stimZones.values()]) {
      zone.life -= dt;
      if (zone.life <= 0) {
        this.stimZones.delete(zone.id);
        continue;
      }

      for (const p of this.players.values()) {
        if (!p.joined || !p.alive) continue;
        const dist = Math.hypot(p.x - zone.x, p.z - zone.z);
        if (dist <= STIM_ZONE.radius) {
          p.stimTimer = Math.max(p.stimTimer, 0.2);
        }
      }
    }
  }

  updateTurrets(dt, blockingRects) {
    for (const turret of this.turrets.values()) {
      turret.life -= dt;
      if (turret.life <= 0) {
        this.turrets.delete(turret.id);
        continue;
      }

      turret.fireCooldown = Math.max(0, turret.fireCooldown - dt);
      if (turret.fireCooldown > 0) continue;

      let nearest = null;
      let nearestDistSq = Infinity;
      for (const e of this.enemies.values()) {
        const distSq = (e.x - turret.x) ** 2 + (e.z - turret.z) ** 2;
        if (distSq < nearestDistSq && distSq <= TURRET.range * TURRET.range) {
          nearestDistSq = distSq;
          nearest = e;
        }
      }
      if (!nearest) continue;

      const dist = Math.sqrt(nearestDistSq) || 1;
      const dx = (nearest.x - turret.x) / dist;
      const dz = (nearest.z - turret.z) / dist;
      if (rayHitsRectBefore(turret.x, turret.z, dx, dz, dist, blockingRects)) continue;

      turret.fireCooldown = TURRET.fireInterval;
      nearest.hp -= TURRET.damage;
      this.events.push({
        type: 'shot', playerId: turret.ownerId, x: turret.x, z: turret.z, dx, dz, dist,
      });
      this.events.push({ type: 'enemyHit', enemyId: nearest.id, hp: nearest.hp, x: nearest.x, z: nearest.z, enemyType: nearest.type });
      if (nearest.hp <= 0) {
        this.enemies.delete(nearest.id);
        const owner = this.players.get(turret.ownerId);
        if (owner) owner.score += Math.round(ENEMY_TYPES[nearest.type].scoreValue / 2);
        this.events.push({ type: 'enemyDeath', enemyId: nearest.id, x: nearest.x, z: nearest.z, enemyType: nearest.type });
      }
    }
  }

  updateRevives(dt) {
    const downed = [...this.players.values()].filter((p) => p.joined && !p.alive);
    if (downed.length === 0) return;

    for (const victim of downed) {
      let revivers = 0;
      for (const p of this.players.values()) {
        if (!p.joined || !p.alive || !p.hacking) continue;
        const dist = Math.hypot(p.x - victim.x, p.z - victim.z);
        if (dist <= REVIVE.range) revivers++;
      }

      victim.revivers = revivers;
      if (revivers > 0) {
        let multiplier = 1;
        for (let i = 1; i < revivers; i++) multiplier += REVIVE.reduction ** i;
        victim.reviveProgress += (multiplier / REVIVE.time) * dt;
        if (victim.reviveProgress >= 1) {
          this.revivePlayer(victim);
        }
      }
    }
  }

  revivePlayer(player) {
    player.alive = true;
    player.hp = PLAYER.maxHp;
    player.invulnTimer = PLAYER.invulnTime;
    player.reviveProgress = 0;
    player.revivers = 0;
    this.events.push({ type: 'playerRevived', playerId: player.id });
  }

  openDoor(door) {
    if (door.open) return;
    door.open = true;
    door.hp = 0;
    door.hackProgress = 1;
    this.events.push({ type: 'doorOpen', doorId: door.id });
  }

  updateDoors(dt) {
    for (const door of this.doors.values()) {
      if (door.open) continue;

      let hackers = 0;
      for (const p of this.players.values()) {
        if (!p.joined || !p.alive || p.cls !== 'engineer' || !p.hacking) continue;
        const dist = Math.hypot(p.x - door.x, p.z - door.z);
        if (dist <= DOOR.hackRange) hackers++;
      }

      door.hackers = hackers;
      if (hackers > 0) {
        let multiplier = 1;
        for (let i = 1; i < hackers; i++) multiplier += DOOR.hackReduction ** i;
        door.hackProgress += (multiplier / DOOR.hackTime) * dt;
        if (door.hackProgress >= 1) {
          this.openDoor(door);
        }
      }
    }
  }

  updateNests(dt) {
    const alivePlayers = [...this.players.values()].filter((p) => p.joined && p.alive);
    if (alivePlayers.length === 0) return;

    for (const nest of this.nests.values()) {
      if (nest.hp <= 0) continue;

      if (nest.spawnCooldown === undefined) {
        nest.spawnCooldown = 4.0 + Math.random() * 6.0;
      }

      nest.spawnCooldown -= dt;
      if (nest.spawnCooldown <= 0) {
        nest.spawnCooldown = 9.0 + Math.random() * 6.0;

        const type = this.pickEnemyType();
        const id = nextEnemyId++;
        const def = ENEMY_TYPES[type];

        const sx = nest.x + (Math.random() - 0.5) * 1.5;
        const sz = nest.z + (Math.random() - 0.5) * 1.5;

        this.enemies.set(id, {
          id,
          type,
          x: sx,
          z: sz,
          angle: Math.random() * Math.PI * 2,
          hp: def.maxHp,
          attackCooldown: 0,
          fireCooldown: def.behavior === 'ranged' ? Math.random() * def.fireInterval : 0,
        });

        this.events.push({ type: 'enemySpawn', x: sx, z: sz, enemyType: type });
      }
    }
  }

  updateWaveDirector(dt) {
    const alivePlayers = [...this.players.values()].filter((p) => p.joined && p.alive);
    if (alivePlayers.length === 0) return;
    if (this.matchElapsed < SPAWN_SAFETY.graceTime) return;

    let activeGate = null;
    for (const gate of this.gates) {
      if (gate.door.open) continue;
      if (alivePlayers.some((p) => pointInRect(p.x, p.z, gate.room))) {
        activeGate = gate;
        break;
      }
    }

    this.spawnTimer += dt;
    const { wave, gateWave } = this.difficulty;

    if (activeGate) {
      if (this.enemies.size < gateWave.maxConcurrent && this.spawnTimer >= gateWave.spawnInterval) {
        this.spawnTimer = 0;
        const aliveSpawns = activeGate.spawnPoints.filter((pt) => {
          const nest = this.nests.get(pt.id);
          return nest && nest.hp > 0;
        });

        if (aliveSpawns.length > 0) {
          const gateMinDistSq = SPAWN_SAFETY.gateMinDistanceFromPlayers ** 2;
          const safeGateSpawns = aliveSpawns.filter((pt) => alivePlayers.every(
            (p) => (pt.x - p.x) ** 2 + (pt.z - p.z) ** 2 >= gateMinDistSq,
          ));
          this.spawnEnemyAt(pickRandom(safeGateSpawns.length ? safeGateSpawns : aliveSpawns));
        }
      }
    } else if (this.enemies.size < wave.maxConcurrent && this.spawnTimer >= wave.spawnInterval) {
      this.spawnTimer = 0;
      const lead = alivePlayers.reduce((a, b) => (b.z < a.z ? b : a));
      const candidates = this.ambientSpawnPointsNear(lead, alivePlayers);
      if (candidates.length) this.spawnEnemyAt(pickRandom(candidates));
    }
  }

  spawnEnemyAt(point) {
    const id = nextEnemyId++;
    const type = this.pickEnemyType();
    const def = ENEMY_TYPES[type];
    this.enemies.set(id, {
      id,
      type,
      x: point.x + (Math.random() - 0.5) * 1.2,
      z: point.z + (Math.random() - 0.5) * 1.2,
      angle: 0,
      hp: def.maxHp,
      attackCooldown: 0,
      fireCooldown: def.behavior === 'ranged' ? Math.random() * def.fireInterval : 0,
    });
    this.events.push({ type: 'enemySpawn', x: point.x, z: point.z, enemyType: type });
  }

  updateEnemies(dt, blockingRects) {
    const alivePlayers = [...this.players.values()].filter((p) => p.joined && p.alive);
    if (alivePlayers.length === 0) return;

    for (const e of [...this.enemies.values()]) {
      const def = ENEMY_TYPES[e.type];

      let nearest = null;
      let nearestDistSq = Infinity;
      for (const p of alivePlayers) {
        const distSq = (p.x - e.x) ** 2 + (p.z - e.z) ** 2;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearest = p;
        }
      }
      if (!nearest) continue;

      const dist = Math.sqrt(nearestDistSq);
      let dx = (nearest.x - e.x) / (dist || 1);
      let dz = (nearest.z - e.z) / (dist || 1);

      for (const other of this.enemies.values()) {
        if (other === e) continue;
        const odx = e.x - other.x;
        const odz = e.z - other.z;
        const odSq = odx * odx + odz * odz;
        if (odSq > 0 && odSq < ENEMY.separationRadius * ENEMY.separationRadius) {
          const od = Math.sqrt(odSq);
          dx += (odx / od) * 0.6;
          dz += (odz / od) * 0.6;
        }
      }

      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;

      e.angle = Math.atan2(dx, dz);
      e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      e.fireCooldown = Math.max(0, e.fireCooldown - dt);

      if (def.behavior === 'ranged') {
        if (dist > def.standRange) {
          this.stepEnemyToward(e, dx, dz, def, dt, blockingRects);
        } else if (e.fireCooldown <= 0) {
          e.fireCooldown = def.fireInterval;
          this.fireEnemyProjectile(e, nearest, blockingRects);
        }
        continue;
      }

      const contactRange = def.radius + PLAYER.radius + 0.15;
      if (dist > contactRange) {
        this.stepEnemyToward(e, dx, dz, def, dt, blockingRects);
        continue;
      }

      if (def.behavior === 'explode') {
        this.explodeEnemy(e, def);
        continue;
      }

      if (e.attackCooldown <= 0 && nearest.invulnTimer <= 0) {
        e.attackCooldown = def.contactCooldown;
        nearest.hp -= def.contactDamage;
        this.events.push({ type: 'playerHit', playerId: nearest.id, hp: nearest.hp, x: nearest.x, z: nearest.z });
        if (nearest.hp <= 0) {
          nearest.alive = false;
          this.events.push({ type: 'playerDeath', playerId: nearest.id });
        }
      }
    }

    this.updateProjectiles(dt, blockingRects);
  }

  stepEnemyToward(e, dx, dz, def, dt, blockingRects) {
    let x = e.x + dx * def.speed * dt;
    let z = e.z + dz * def.speed * dt;
    [x, z] = clampToWorld(x, z, def.radius, this.level.world);
    [x, z] = resolveWallCollisions(x, z, def.radius, blockingRects);
    e.x = x;
    e.z = z;
  }

  explodeEnemy(e, def) {
    this.enemies.delete(e.id);
    for (const p of this.players.values()) {
      if (!p.joined || !p.alive || p.invulnTimer > 0) continue;
      const dist = Math.hypot(p.x - e.x, p.z - e.z);
      if (dist > def.explodeRadius) continue;
      p.hp -= def.explodeDamage;
      this.events.push({ type: 'playerHit', playerId: p.id, hp: p.hp, x: p.x, z: p.z });
      if (p.hp <= 0) {
        p.alive = false;
        this.events.push({ type: 'playerDeath', playerId: p.id });
      }
    }
    this.events.push({ type: 'explosion', x: e.x, z: e.z, radius: def.explodeRadius });
  }

  fireEnemyProjectile(e, target, blockingRects) {
    const dist = Math.hypot(target.x - e.x, target.z - e.z) || 1;
    const dx = (target.x - e.x) / dist;
    const dz = (target.z - e.z) / dist;
    if (rayHitsRectBefore(e.x, e.z, dx, dz, dist, blockingRects)) return;

    const id = nextProjectileId++;
    this.projectiles.set(id, { id, x: e.x, z: e.z, dx, dz, traveled: 0 });
    this.events.push({ type: 'enemyShot', x: e.x, z: e.z, dx, dz });
  }

  updateProjectiles(dt, blockingRects) {
    const alivePlayers = [...this.players.values()].filter((p) => p.joined && p.alive);

    for (const proj of [...this.projectiles.values()]) {
      const step = PROJECTILE.speed * dt;
      const nx = proj.x + proj.dx * step;
      const nz = proj.z + proj.dz * step;
      proj.traveled += step;

      const [rx, rz] = resolveWallCollisions(nx, nz, 0, blockingRects);
      if (rx !== nx || rz !== nz) {
        this.projectiles.delete(proj.id);
        continue;
      }

      let hitPlayer = null;
      for (const p of alivePlayers) {
        if (p.invulnTimer > 0) continue;
        const distSq = (p.x - nx) ** 2 + (p.z - nz) ** 2;
        if (distSq <= (PLAYER.radius + PROJECTILE.radius) ** 2) {
          hitPlayer = p;
          break;
        }
      }

      if (hitPlayer) {
        hitPlayer.hp -= PROJECTILE.damage;
        this.events.push({ type: 'playerHit', playerId: hitPlayer.id, hp: hitPlayer.hp, x: hitPlayer.x, z: hitPlayer.z });
        if (hitPlayer.hp <= 0) {
          hitPlayer.alive = false;
          this.events.push({ type: 'playerDeath', playerId: hitPlayer.id });
        }
        this.projectiles.delete(proj.id);
        continue;
      }

      if (proj.traveled >= PROJECTILE.range) {
        this.projectiles.delete(proj.id);
        continue;
      }

      proj.x = nx;
      proj.z = nz;
    }
  }

  broadcastState() {
    const players = [...this.players.values()]
      .filter((p) => p.joined)
      .map((p) => ({
        id: p.id, name: p.name, cls: p.cls, x: p.x, z: p.z, angle: p.angle,
        hp: p.hp, alive: p.alive, invuln: p.invulnTimer > 0, score: p.score, ackSeq: p.lastInputSeq,
        abilityCooldown: p.abilityCooldown, stim: p.stimTimer > 0,
        reviveProgress: p.reviveProgress, revivers: p.revivers,
        grenades: p.grenades,
      }));

    const enemies = [...this.enemies.values()].map((e) => ({
      id: e.id, type: e.type, x: e.x, z: e.z, angle: e.angle, hp: e.hp,
    }));

    const projectiles = [...this.projectiles.values()].map((pr) => ({
      id: pr.id, x: pr.x, z: pr.z,
    }));

    const doors = [...this.doors.values()].map((d) => ({
      id: d.id, hp: d.hp, maxHp: d.maxHp, open: d.open,
      hackProgress: d.hackProgress, hackers: d.hackers,
    }));

    const pickups = [...this.pickups.values()].map((p) => ({ id: p.id, type: p.type, x: p.x, z: p.z }));
    const healZones = [...this.healZones.values()].map((z) => ({ id: z.id, x: z.x, z: z.z, life: z.life }));
    const stimZones = [...this.stimZones.values()].map((z) => ({ id: z.id, x: z.x, z: z.z, life: z.life }));
    const turrets = [...this.turrets.values()].map((t) => ({ id: t.id, ownerId: t.ownerId, x: t.x, z: t.z, life: t.life }));
    const nests = [...this.nests.values()]
      .filter((n) => n.hp > 0)
      .map((n) => ({
        id: n.id, x: n.x, z: n.z, hp: n.hp, maxHp: n.maxHp, isWallTunnel: !!n.isWallTunnel,
      }));

    const grenades = [...this.grenades.values()].map((g) => ({
      id: g.id, x: g.x, z: g.z, t: g.t, life: g.life,
    }));
    const landMines = [...this.landMines.values()].map((m) => ({
      id: m.id, x: m.x, z: m.z,
    }));

    this.broadcast({
      t: 'state',
      tick: this.tick,
      players,
      enemies,
      doors,
      pickups,
      healZones,
      stimZones,
      turrets,
      projectiles,
      nests,
      grenades,
      landMines,
      events: this.events,
    });
  }
}

function clampNum(v, min, max) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(min, Math.min(max, v));
}
