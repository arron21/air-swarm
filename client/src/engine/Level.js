import * as THREE from 'three/webgpu';
import { Teleporter } from '../entities/Teleporter.js';

export function buildLevel(scene, world, walls, doorDefs, endZone, path) {
  const width = world.maxX - world.minX;
  const depth = world.maxZ - world.minZ;
  const centerX = (world.minX + world.maxX) / 2;
  const centerZ = (world.minZ + world.maxZ) / 2;

  const floorGeom = new THREE.PlaneGeometry(width, depth);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.95 });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = null;

  const wallsMesh = buildWallInstances(scene, walls);

  const doorMeshes = new Map();
  for (const d of doorDefs) {
    doorMeshes.set(d.id, buildDoorMesh(scene, d));
  }

  const teleporter = new Teleporter(endZone.x, endZone.z);
  scene.add(teleporter.group);

  // Spacing guide lights along the centerline path to help players navigate
  const guideLights = [];
  const lightSpacing = 9.0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const ndx = dx / len;
    const ndz = dz / len;

    const px = -ndz;
    const pz = ndx;

    const steps = Math.max(1, Math.floor(len / lightSpacing));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const cx_line = a.x + ndx * len * t;
      const cz_line = a.z + ndz * len * t;

      // Alternate sides of the corridor
      const side = (s % 2 === 0) ? -1 : 1;

      // Candidate position offset towards the wall
      const sx = cx_line + px * (3.85 * side);
      const sz = cz_line + pz * (3.85 * side);

      // Find closest wall box
      let closestWall = null;
      let closestDist = Infinity;
      let closestPt = null;

      for (const w of walls) {
        const pt = getClosestPointOnBox(w.x, w.z, w.w, w.d, sx, sz);
        const dist = Math.hypot(sx - pt.x, sz - pt.z);
        if (dist < closestDist) {
          closestDist = dist;
          closestWall = w;
          closestPt = pt;
        }
      }

      // If there is a wall nearby (within 1.2 units), spawn the sconce on it!
      if (closestWall && closestDist <= 1.2) {
        const ndx_wall = sx - closestPt.x;
        const ndz_wall = sz - closestPt.z;
        const dist_wall = Math.hypot(ndx_wall, ndz_wall) || 1;
        const nx = ndx_wall / dist_wall;
        const nz = ndz_wall / dist_wall;

        const sconceX = closestPt.x + nx * 0.12;
        const sconceZ = closestPt.z + nz * 0.12;

        const group = new THREE.Group();
        group.position.set(sconceX, 1.4, sconceZ);
        group.lookAt(new THREE.Vector3(sconceX + nx * 5, 1.4, sconceZ + nz * 5));

        // Sconce bracket (flat against wall)
        const bracketGeom = new THREE.BoxGeometry(0.18, 0.32, 0.08);
        const bracketMat = new THREE.MeshStandardMaterial({ color: 0x22252c, roughness: 0.8 });
        const bracket = new THREE.Mesh(bracketGeom, bracketMat);
        bracket.position.set(0, 0, -0.04);
        group.add(bracket);

        // Glowing bulb (extending out)
        const bulbGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.16, 8);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
        const bulb = new THREE.Mesh(bulbGeom, bulbMat);
        bulb.position.set(0, 0, 0.06);
        group.add(bulb);

        // Dim PointLight
        const light = new THREE.PointLight(0xffaa44, 0.45, 8.0);
        light.position.set(0, 0, 0.08);
        group.add(light);

        scene.add(group);
        guideLights.push(group);
      }
    }
  }

  return { floor, grid, wallsMesh, doorMeshes, teleporter, guideLights };
}

function buildWallInstances(scene, walls) {
  const wallHeight = 2.6;
  const geom = new THREE.BoxGeometry(1, wallHeight, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x363b46, roughness: 0.85 });
  const mesh = new THREE.InstancedMesh(geom, mat, walls.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    pos.set(w.x, wallHeight / 2, w.z);
    scale.set(w.w, 1, w.d);
    m.compose(pos, quat, scale);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

function buildDoorMesh(scene, def) {
  const group = new THREE.Group();
  group.position.set(def.x, 0, def.z);

  const height = 3.0;
  const doorGeom = new THREE.BoxGeometry(def.w, height, def.d);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xf6ad55, emissive: 0x552a06, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.5 });
  const doorMesh = new THREE.Mesh(doorGeom, doorMat);
  doorMesh.position.y = height / 2;
  doorMesh.castShadow = true;
  group.add(doorMesh);

  const frameGeom = new THREE.BoxGeometry(def.w + 0.6, height + 0.4, def.d + 0.6);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x21242c, roughness: 0.9, wireframe: true });
  const frame = new THREE.Mesh(frameGeom, frameMat);
  frame.position.y = height / 2;
  group.add(frame);

  const barBg = makeBar(0x222222);
  barBg.position.set(0, height + 0.9, 0);
  group.add(barBg);
  const barFg = makeBar(0xff5555);
  barFg.position.set(0, height + 0.9, 0.01);
  group.add(barFg);

  scene.add(group);

  return { group, doorMesh, barBg, barFg, baseHeight: height };
}

function makeBar(color) {
  const geom = new THREE.PlaneGeometry(2.4, 0.28);
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const mesh = new THREE.Mesh(geom, mat);
  return mesh;
}

function getClosestPointOnBox(wx, wz, ww, wd, sx, sz) {
  const minX = wx - ww / 2;
  const maxX = wx + ww / 2;
  const minZ = wz - wd / 2;
  const maxZ = wz + wd / 2;

  let cx = Math.max(minX, Math.min(maxX, sx));
  let cz = Math.max(minZ, Math.min(maxZ, sz));

  if (cx === sx && cz === sz) {
    const dl = sx - minX;
    const dr = maxX - sx;
    const dt = sz - minZ;
    const db = maxZ - sz;
    const minDist = Math.min(dl, dr, dt, db);
    if (minDist === dl) cx = minX;
    else if (minDist === dr) cx = maxX;
    else if (minDist === dt) cz = minZ;
    else cz = maxZ;
  }

  return { x: cx, z: cz };
}
