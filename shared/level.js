// Procedurally carves a winding corridor + gate rooms from a hand-authored centerline,
// so server and client always agree on exactly the same geometry (no hand-fudged wall math).
// Each level is built from its own centerline/rooms/doors via buildLevel(), so the carve
// and spawn-point math stay level-agnostic.
import { pointInRect } from './constants.js';

export const CELL = 2;
export const CORRIDOR_WIDTH = 7;

const PLAYER_SPAWNS = [
  { x: -3, z: 12 },
  { x: 3, z: 12 },
  { x: -3, z: 6 },
  { x: 3, z: 6 },
];

function distToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

function carve(path, rooms) {
  const margin = 6;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of path) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  for (const room of rooms) {
    minX = Math.min(minX, room.x - room.w / 2);
    maxX = Math.max(maxX, room.x + room.w / 2);
    minZ = Math.min(minZ, room.z - room.d / 2);
    maxZ = Math.max(maxZ, room.z + room.d / 2);
  }
  minX -= margin; maxX += margin; minZ -= margin; maxZ += margin;

  const cols = Math.ceil((maxX - minX) / CELL);
  const rows = Math.ceil((maxZ - minZ) / CELL);
  const open = new Uint8Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    const cz = minZ + (r + 0.5) * CELL;
    for (let c = 0; c < cols; c++) {
      const cx = minX + (c + 0.5) * CELL;
      let isOpen = false;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (distToSegment(cx, cz, a.x, a.z, b.x, b.z) <= CORRIDOR_WIDTH / 2) {
          isOpen = true;
          break;
        }
      }
      if (!isOpen) {
        for (const room of rooms) {
          if (pointInRect(cx, cz, room)) {
            isOpen = true;
            break;
          }
        }
      }
      open[r * cols + c] = isOpen ? 1 : 0;
    }
  }

  const walls = [];
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (!open[r * cols + c]) {
        const start = c;
        while (c < cols && !open[r * cols + c]) c++;
        const runLen = c - start;
        walls.push({
          x: minX + (start + runLen / 2) * CELL,
          z: minZ + (r + 0.5) * CELL,
          w: runLen * CELL,
          d: CELL,
        });
      } else {
        c++;
      }
    }
  }

  return { world: { minX, maxX, minZ, maxZ }, walls };
}

function segmentDir(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { dx: dx / len, dz: dz / len, len };
}

// Points just outside the corridor walls, spaced along each straight leg —
// enemies pop out of the wall here during ambient (non-gate) travel.
function generateAmbientSpawnPoints(path, spacing = 9) {
  const pts = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const { dx, dz, len } = segmentDir(a, b);
    const px = -dz;
    const pz = dx;
    const steps = Math.max(1, Math.floor(len / spacing));
    const offset = CORRIDOR_WIDTH / 2 + 0.5;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const cx = a.x + dx * len * t;
      const cz = a.z + dz * len * t;
      pts.push({ x: cx + px * offset, z: cz + pz * offset });
      pts.push({ x: cx - px * offset, z: cz - pz * offset });
    }
  }
  return pts;
}

function gateSpawnPoints(room) {
  const hw = room.w / 2 - 1.4;
  const hd = room.d / 2 - 1.4;
  return [
    { x: room.x - hw, z: room.z - hd * 0.6 },
    { x: room.x + hw, z: room.z - hd * 0.6 },
    { x: room.x - hw, z: room.z + hd * 0.3 },
    { x: room.x + hw, z: room.z + hd * 0.3 },
    { x: room.x, z: room.z + hd },
  ];
}

function buildLevel({ id, name, difficulty, path, rooms, doors, playerSpawns, nests = [] }) {
  const carved = carve(path, Object.values(rooms));
  const gates = doors.map((door) => ({
    door,
    room: door.room,
    spawnPoints: gateSpawnPoints(door.room),
  }));
  return {
    id,
    name,
    difficulty,
    checkpoints: path,
    rooms,
    doors,
    gates,
    playerSpawns,
    world: carved.world,
    walls: carved.walls,
    ambientSpawnPoints: generateAmbientSpawnPoints(path),
    endZone: rooms.end,
    nests,
  };
}

// ---- Level 1: Landing Zone (easy) — short, one gate. ----
const level1Rooms = {
  start: { x: 0, z: 9, w: 18, d: 14 },
  gate1: { x: 14, z: -26, w: 18, d: 16 },
  end: { x: 14, z: -52, w: 18, d: 14 },
};
const level1Path = [
  { x: 0, z: 9 },
  { x: 0, z: -10 },
  { x: 14, z: -10 },
  { x: 14, z: -26 }, // gate 1 room
  { x: 14, z: -40 }, // past door 1
  { x: 14, z: -52 }, // end room
];
const level1Doors = [
  { id: 1, x: 14, z: -34, w: 10, d: 1.4, maxHp: 420, room: level1Rooms.gate1 },
];
const LEVEL_1 = buildLevel({
  id: 1, name: 'Landing Zone', difficulty: 'EASY',
  path: level1Path, rooms: level1Rooms, doors: level1Doors, playerSpawns: PLAYER_SPAWNS,
  nests: [
    { id: 101, x: 5, z: -10 },
    { id: 102, x: 14, z: -46 },
  ],
});

// ---- Level 2: Deep Corridor (medium) — the original winding two-gate route. ----
const level2Rooms = {
  start: { x: 0, z: 9, w: 18, d: 14 },
  gate1: { x: 18, z: -34, w: 18, d: 16 },
  gate2: { x: 14, z: -88, w: 18, d: 16 },
  end: { x: 14, z: -105, w: 18, d: 14 },
};
const level2Path = [
  { x: 0, z: 9 },
  { x: 0, z: -16 },
  { x: 18, z: -16 },
  { x: 18, z: -34 }, // gate 1 room
  { x: 18, z: -48 }, // past door 1
  { x: -8, z: -48 },
  { x: -8, z: -70 },
  { x: 14, z: -70 },
  { x: 14, z: -88 }, // gate 2 room
  { x: 14, z: -105 }, // end room
];
const level2Doors = [
  { id: 1, x: 18, z: -42, w: 10, d: 1.4, maxHp: 700, room: level2Rooms.gate1 },
  { id: 2, x: 14, z: -96, w: 10, d: 1.4, maxHp: 1100, room: level2Rooms.gate2 },
];
const LEVEL_2 = buildLevel({
  id: 2, name: 'Deep Corridor', difficulty: 'MEDIUM',
  path: level2Path, rooms: level2Rooms, doors: level2Doors, playerSpawns: PLAYER_SPAWNS,
  nests: [
    { id: 201, x: 9, z: -16 },
    { id: 202, x: 7, z: -48 },
    { id: 203, x: -8, z: -62 },
    { id: 204, x: 14, z: -98 },
  ],
});

// ---- Level 3: The Gauntlet (hard) — longer route, three gates, tougher doors. ----
const level3Rooms = {
  start: { x: 0, z: 9, w: 18, d: 14 },
  gate1: { x: 18, z: -34, w: 18, d: 16 },
  gate2: { x: 14, z: -88, w: 18, d: 16 },
  gate3: { x: 12, z: -140, w: 18, d: 16 },
  end: { x: 12, z: -157, w: 18, d: 14 },
};
const level3Path = [
  { x: 0, z: 9 },
  { x: 0, z: -16 },
  { x: 18, z: -16 },
  { x: 18, z: -34 }, // gate 1 room
  { x: 18, z: -48 }, // past door 1
  { x: -8, z: -48 },
  { x: -8, z: -70 },
  { x: 14, z: -70 },
  { x: 14, z: -88 }, // gate 2 room
  { x: 14, z: -104 }, // past door 2
  { x: -10, z: -104 },
  { x: -10, z: -124 },
  { x: 12, z: -124 },
  { x: 12, z: -140 }, // gate 3 room
  { x: 12, z: -157 }, // end room
];
const level3Doors = [
  { id: 1, x: 18, z: -42, w: 10, d: 1.4, maxHp: 900, room: level3Rooms.gate1 },
  { id: 2, x: 14, z: -96, w: 10, d: 1.4, maxHp: 1300, room: level3Rooms.gate2 },
  { id: 3, x: 12, z: -148, w: 10, d: 1.4, maxHp: 1700, room: level3Rooms.gate3 },
];
const LEVEL_3 = buildLevel({
  id: 3, name: 'The Gauntlet', difficulty: 'HARD',
  path: level3Path, rooms: level3Rooms, doors: level3Doors, playerSpawns: PLAYER_SPAWNS,
  nests: [
    { id: 301, x: 9, z: -16 },
    { id: 302, x: 6, z: -48 },
    { id: 303, x: 3, z: -70 },
    { id: 304, x: 0, z: -104 },
    { id: 305, x: 2, z: -124 },
    { id: 306, x: 12, z: -148 },
  ],
});

export const LEVELS = { 1: LEVEL_1, 2: LEVEL_2, 3: LEVEL_3 };
export const LEVEL_LIST = [LEVEL_1, LEVEL_2, LEVEL_3];
