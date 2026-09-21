import * as THREE from 'three/webgpu';

export class Nest {
  constructor(id, x, z, isWallTunnel, walls) {
    this.id = id;
    this.isWallTunnel = !!isWallTunnel;

    this.group = new THREE.Group();

    if (this.isWallTunnel) {
      // Find closest wall face normal to align the tunnel
      const wallInfo = getWallNormalAtPoint(walls, x, z);
      if (wallInfo) {
        this.group.position.set(wallInfo.pt.x, 0, wallInfo.pt.z);
        this.group.lookAt(new THREE.Vector3(wallInfo.pt.x + wallInfo.nx * 5, 0, wallInfo.pt.z + wallInfo.nz * 5));
      } else {
        this.group.position.set(x, 0, z);
      }

      // Materials for wall tunnel
      this.tunnelMat = new THREE.MeshBasicMaterial({ color: 0x030303, side: THREE.DoubleSide });
      this.rimMat = new THREE.MeshStandardMaterial({
        color: 0x3d1d11, // Organic dark brown-red
        roughness: 0.8,
        metalness: 0.1,
      });
      this.growthMat = new THREE.MeshStandardMaterial({
        color: 0x1c2b18, // Moldy green organic shell
        roughness: 0.7,
      });
      this.pustuleMat = new THREE.MeshStandardMaterial({
        color: 0xff8800,
        emissive: 0xff5500,
        emissiveIntensity: 1.5,
        roughness: 0.3,
      });
      this.slimeMat = new THREE.MeshStandardMaterial({
        color: 0x224411, // Wet shiny green slime puddle
        roughness: 0.15,
        transparent: true,
        opacity: 0.85,
      });

      // 1. Dark hollow tunnel going back into the wall
      const tunnelGeom = new THREE.CylinderGeometry(0.55, 0.45, 1.2, 8, 1, true);
      tunnelGeom.rotateX(Math.PI / 2);
      const tunnelMesh = new THREE.Mesh(tunnelGeom, this.tunnelMat);
      tunnelMesh.position.set(0, 0.45, -0.5);
      this.group.add(tunnelMesh);

      // Cap at the back
      const capGeom = new THREE.CircleGeometry(0.45, 8);
      const capMesh = new THREE.Mesh(capGeom, this.tunnelMat);
      capMesh.position.set(0, 0.45, -1.1);
      capMesh.rotation.y = Math.PI;
      this.group.add(capMesh);

      // 2. Fleshy rim
      const rimGeom = new THREE.TorusGeometry(0.5, 0.15, 8, 16);
      const rimMesh = new THREE.Mesh(rimGeom, this.rimMat);
      rimMesh.position.set(0, 0.45, 0);
      rimMesh.castShadow = true;
      rimMesh.receiveShadow = true;
      this.group.add(rimMesh);

      // 3. Fleshy bulbs / pustules around opening
      const bulbCount = 6;
      for (let j = 0; j < bulbCount; j++) {
        const angle = (j / bulbCount) * Math.PI * 2;
        const r = 0.55 + Math.random() * 0.08;
        const bx = Math.cos(angle) * r;
        const by = 0.45 + Math.sin(angle) * r;
        const bz = -0.05 + Math.random() * 0.08;

        const bulbGeom = new THREE.SphereGeometry(0.09 + Math.random() * 0.1, 6, 6);
        const isGlowing = Math.random() > 0.4;
        const bulbMesh = new THREE.Mesh(bulbGeom, isGlowing ? this.pustuleMat : this.growthMat);
        bulbMesh.position.set(bx, by, bz);
        bulbMesh.castShadow = true;
        bulbMesh.receiveShadow = true;
        this.group.add(bulbMesh);
      }

      // 4. Slime puddle on floor
      const puddleGeom = new THREE.PlaneGeometry(1.3, 0.9);
      const puddleMesh = new THREE.Mesh(puddleGeom, this.slimeMat);
      puddleMesh.rotation.x = -Math.PI / 2;
      puddleMesh.position.set(0, 0.006, 0.35);
      puddleMesh.receiveShadow = true;
      this.group.add(puddleMesh);

      // Health bar (placed higher for wall tunnel)
      this.barBg = makeBarMesh(0x222222);
      this.barBg.position.set(0, 1.45, 0);
      this.barBg.visible = false;
      this.group.add(this.barBg);

      this.barFg = makeBarMesh(0xff4488);
      this.barFg.position.set(0, 1.45, 0.01);
      this.barFg.visible = false;
      this.group.add(this.barFg);

    } else {
      // Floor mound nest
      this.group.position.set(x, 0, z);

      this.material = new THREE.MeshStandardMaterial({
        color: 0x3d0e49,
        roughness: 0.8,
        metalness: 0.1,
        emissive: 0x1f0326,
        emissiveIntensity: 0.4,
      });

      const mainGeom = new THREE.SphereGeometry(0.7, 12, 12);
      const mainMesh = new THREE.Mesh(mainGeom, this.material);
      mainMesh.scale.set(1.0, 0.7, 1.0);
      mainMesh.position.set(0, 0.35, 0);
      mainMesh.castShadow = true;
      mainMesh.receiveShadow = true;
      this.group.add(mainMesh);

      const lumpCoords = [
        { r: 0.42, x: 0.4, y: 0.25, z: 0.3 },
        { r: 0.46, x: -0.4, y: 0.28, z: -0.2 },
        { r: 0.38, x: 0.1, y: 0.2, z: -0.5 },
      ];

      for (const c of lumpCoords) {
        const geom = new THREE.SphereGeometry(c.r, 8, 8);
        const mesh = new THREE.Mesh(geom, this.material);
        mesh.position.set(c.x, c.y, c.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }

      this.barBg = makeBarMesh(0x222222);
      this.barBg.position.set(0, 1.3, 0);
      this.barBg.visible = false;
      this.group.add(this.barBg);

      this.barFg = makeBarMesh(0xff4488);
      this.barFg.position.set(0, 1.3, 0.01);
      this.barFg.visible = false;
      this.group.add(this.barFg);
    }
  }

  setHp(hp, maxHp) {
    const pct = Math.max(0, hp) / maxHp;
    const damaged = pct < 1.0;

    this.barBg.visible = damaged;
    this.barFg.visible = damaged;

    if (damaged) {
      this.barFg.scale.x = pct;
      this.barFg.position.x = -0.5 * (1 - pct);
    }
  }

  update(dt) {
    if (this.isWallTunnel) {
      // Pulse wall tunnel pustules
      const pulse = 1.0 + Math.sin(performance.now() * 0.0035) * 0.5;
      if (this.pustuleMat) this.pustuleMat.emissiveIntensity = pulse;
    } else {
      // Breathing emissive pulsing effect for floor nests
      const pulse = 0.3 + Math.sin(performance.now() * 0.0035) * 0.2;
      if (this.material) this.material.emissiveIntensity = pulse;
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
    });

    if (this.isWallTunnel) {
      this.tunnelMat.dispose();
      this.rimMat.dispose();
      this.growthMat.dispose();
      this.pustuleMat.dispose();
      this.slimeMat.dispose();
    } else {
      this.material.dispose();
    }
    
    this.barBg.material.dispose();
    this.barFg.material.dispose();
  }
}

function makeBarMesh(color) {
  const geom = new THREE.PlaneGeometry(1.0, 0.12);
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
  return new THREE.Mesh(geom, mat);
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

function getWallNormalAtPoint(walls, sx, sz) {
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

  if (closestWall && closestPt) {
    let ndx = sx - closestPt.x;
    let ndz = sz - closestPt.z;
    let dist = Math.hypot(ndx, ndz);

    if (dist < 1e-5) {
      ndx = sx - closestWall.x;
      ndz = sz - closestWall.z;
      dist = Math.hypot(ndx, ndz) || 1;
    }

    let nx = ndx / dist;
    let nz = ndz / dist;

    const wHalfW = closestWall.w / 2;
    const wHalfD = closestWall.d / 2;
    const isInside = (sx >= closestWall.x - wHalfW - 1e-4 && sx <= closestWall.x + wHalfW + 1e-4 &&
                      sz >= closestWall.z - wHalfD - 1e-4 && sz <= closestWall.z + wHalfD + 1e-4);

    if (isInside) {
      nx = -nx;
      nz = -nz;
    }

    return {
      pt: closestPt,
      nx,
      nz,
      dist: closestDist,
    };
  }

  return null;
}
