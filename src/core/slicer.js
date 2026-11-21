// 절단(클리핑 평면) 조각과 SUPERHOT풍 유리 파편
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

const MAX_SHARDS = 900;
const MAX_PIECES = 36;

export class Shatter {
  constructor(scene, envMap) {
    const geo = new THREE.TetrahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1, flatShading: true, envMap, envMapIntensity: 1.2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_SHARDS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHARDS * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = MAX_SHARDS;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.items.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), size: 0 });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.cursor = 0;
    this.color = new THREE.Color();
  }

  /** 반경 안에서 파편을 흩뿌림 */
  emit(center, count, color, opts = {}) {
    const c = this.color.set(color);
    const spread = opts.spread ?? 0.4;
    const speed = opts.speed ?? 3;
    const size = opts.size ?? 0.06;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_SHARDS;
      const it = this.items[i];
      it.pos.copy(center).add(_v.randomDirection().multiplyScalar(Math.random() * spread));
      if (opts.box) it.pos.set(center.x + (Math.random() - 0.5) * opts.box.x, center.y + (Math.random() - 0.5) * opts.box.y, center.z + (Math.random() - 0.5) * opts.box.z);
      it.vel.copy(_v.randomDirection()).multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      if (opts.dir) it.vel.addScaledVector(opts.dir, opts.dirAmt ?? speed);
      it.vel.y += opts.up ?? 1.5;
      it.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      it.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      it.size = size * (0.4 + Math.random() * 1.0);
      it.life = it.maxLife = (opts.life ?? 3) * (0.7 + Math.random() * 0.5);
      it.grav = opts.grav ?? 9.8;
      const shade = 0.75 + Math.random() * 0.35;
      this.mesh.instanceColor.setXYZ(i, c.r * shade, c.g * shade, c.b * shade);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX_SHARDS; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      any = true;
      it.life -= dt;
      it.vel.y -= it.grav * dt;
      it.pos.addScaledVector(it.vel, dt);
      if (it.pos.y < it.size * 0.5) {
        it.pos.y = it.size * 0.5;
        it.vel.y = Math.abs(it.vel.y) * 0.25;
        it.vel.x *= 0.7;
        it.vel.z *= 0.7;
        it.spin.multiplyScalar(0.7);
      }
      it.rot.x += it.spin.x * dt;
      it.rot.y += it.spin.y * dt;
      it.rot.z += it.spin.z * dt;
      const k = it.life <= 0 ? 0 : Math.min(1, it.life / 0.6);
      _q.setFromEuler(it.rot);
      _s.setScalar(it.size * k);
      this.mesh.setMatrixAt(i, _m.compose(it.pos, _q, _s));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.items[i].life = 0;
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * 평면으로 물체를 둘로 자른다. 원본 Object3D의 복제본 두 개에
 * 각자 반대쪽을 잘라내는 클리핑 평면을 붙여 "조각"으로 만든다.
 */
export class Slicer {
  constructor(scene, shatter) {
    this.scene = scene;
    this.shatter = shatter;
    this.pieces = [];
  }

  /**
   * @param {THREE.Object3D} obj 자를 대상(장면에 붙어 있어야 함)
   * @param {THREE.Plane} plane 월드 좌표 절단면
   * @param {object} o { color, vel, localPlanes(기존 조각이면), center }
   * @returns 생성된 조각 배열
   */
  slice(obj, plane, o = {}) {
    obj.updateMatrixWorld(true);
    // 조각이 너무 많으면 가장 오래된 것부터 파편으로 흩어 자리를 만든다
    //  (예전엔 그냥 돌아가서, 자르려던 원본(죽은 더미)이 장면에 그대로 남아 사라지지 않았다)
    while (this.pieces.length >= MAX_PIECES - 1) this.shatterPiece(this.pieces[0], 8);
    const center = o.center ? o.center.clone() : new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    const out = [];
    // 바닥 충돌용 표본점: 모든 메시의 꼭짓점 일부 (obj 로컬 좌표) — 조각마다 남는 쪽만 골라 쓴다
    const invObj = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const all = [];
    obj.traverse((m) => {
      if (!m.isMesh || !m.geometry?.attributes?.position) return;
      const n = m.geometry.attributes.position.count;
      const step = Math.max(1, Math.ceil(n / 300));
      for (let i = 0; i < n; i += step) {
        const v = new THREE.Vector3();
        try {
          if (m.getVertexPosition) m.getVertexPosition(i, v);
          else v.fromBufferAttribute(m.geometry.attributes.position, i);
        } catch (_) {
          v.fromBufferAttribute(m.geometry.attributes.position, i);
        }
        all.push(v.applyMatrix4(m.matrixWorld).applyMatrix4(invObj));
      }
    });
    for (const s of [1, -1]) {
      const clone = obj.clone(true);
      const matMap = new Map();
      const worldPlanes = [];
      const localPlanes = [];
      // 기존 조각이 가진 절단면 유지
      for (const lp of o.localPlanes ?? []) {
        localPlanes.push(lp.clone());
        worldPlanes.push(new THREE.Plane());
      }
      const p = plane.clone();
      if (s < 0) p.negate();
      // 월드 평면 → obj 로컬 좌표 평면
      const inv = _m.copy(obj.matrixWorld).invert();
      localPlanes.push(p.clone().applyMatrix4(inv));
      worldPlanes.push(new THREE.Plane());
      clone.traverse((m) => {
        if (!m.isMesh) return;
        const src = m.material;
        let cm = matMap.get(src);
        if (!cm) {
          cm = src.clone();
          cm.side = THREE.DoubleSide;
          cm.clippingPlanes = worldPlanes;
          cm.clipShadows = false;
          matMap.set(src, cm);
        }
        m.material = cm;
      });
      // 조각 중심을 피벗으로 사용
      const pivot = new THREE.Group();
      const pc = center.clone().addScaledVector(plane.normal, 0.18 * s);
      pivot.position.copy(pc);
      this.scene.add(pivot);
      // clone을 피벗 아래에 동일한 월드 변환으로 배치
      obj.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
      clone.position.sub(pc);
      pivot.add(clone);
      const piece = {
        pivot,
        obj: clone,
        localPlanes,
        worldPlanes,
        materials: [...matMap.values()],
        vel: (o.vel ? o.vel.clone() : new THREE.Vector3()).addScaledVector(plane.normal, s * (o.sep ?? 1.6)).add(_v.set(0, 1.2, 0)),
        spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
        life: o.life ?? 6,
        color: o.color ?? 0xff3311,
        radius: o.radius ?? 0.3,
        grounded: false,
        samples: pickSamples(all, localPlanes),
      };
      this._updatePlanes(piece);
      this.pieces.push(piece);
      out.push(piece);
    }
    // 원본 제거
    obj.parent?.remove(obj);
    return out;
  }

  /** 이미 존재하는 조각을 다시 자르기 */
  sliceAgain(piece, plane, o = {}) {
    this.remove(piece, false);
    piece.pivot.updateMatrixWorld(true);
    const res = this.slice(piece.obj, plane, { ...o, localPlanes: piece.localPlanes, color: piece.color, vel: piece.vel, center: piece.pivot.position });
    this.scene.remove(piece.pivot);
    for (const m of piece.materials) m.dispose();
    return res;
  }

  _updatePlanes(piece) {
    piece.pivot.updateMatrixWorld(true);
    const mw = piece.obj.matrixWorld;
    for (let i = 0; i < piece.localPlanes.length; i++) piece.worldPlanes[i].copy(piece.localPlanes[i]).applyMatrix4(mw);
  }

  remove(piece, dispose = true) {
    const i = this.pieces.indexOf(piece);
    if (i >= 0) this.pieces.splice(i, 1);
    if (dispose) {
      this.scene.remove(piece.pivot);
      for (const m of piece.materials) m.dispose();
    }
  }

  /** 조각을 파편으로 만들어 제거 */
  shatterPiece(piece, count = 18) {
    this.shatter.emit(piece.pivot.position, count, piece.color, { spread: piece.radius, speed: 2 });
    this.remove(piece);
  }

  clear() {
    for (const p of [...this.pieces]) this.remove(p);
  }

  update(dt, forceFn) {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.shatterPiece(p, 14);
        continue;
      }
      if (forceFn) forceFn(p, dt);
      p.vel.y -= 9.8 * dt;
      p.pivot.position.addScaledVector(p.vel, dt);
      _e.set(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt);
      p.pivot.quaternion.multiply(_q.setFromEuler(_e));
      if (p.wspin) {
        const w = p.wspin.length();
        if (w > 1e-4) p.pivot.quaternion.premultiply(_q.setFromAxisAngle(_v2.copy(p.wspin).divideScalar(w), w * dt));
        p.wspin.multiplyScalar(Math.max(0, 1 - dt * 5));
      }
      // 바닥: 실제 남은 조각의 가장 낮은 점이 땅 위에 오도록 (조각이 땅에 박히지 않게)
      let low = null;
      if (p.samples?.length) {
        p.pivot.updateMatrixWorld(true);
        const mw = p.obj.matrixWorld;
        let minY = Infinity;
        for (const q of p.samples) {
          _v2.copy(q).applyMatrix4(mw);
          if (_v2.y < minY) {
            minY = _v2.y;
            low = _v.copy(_v2);
          }
        }
        if (minY < 0) p.pivot.position.y -= minY;
        else low = null;
      } else if (p.pivot.position.y < p.radius * 0.6) {
        p.pivot.position.y = p.radius * 0.6;
        low = _v.copy(p.pivot.position).setY(0);
      }
      if (low) {
        if (p.vel.y < 0) p.vel.y = -p.vel.y * 0.2;
        if (Math.abs(p.vel.y) < 0.4) p.vel.y = 0;
        // 마찰
        p.vel.x *= Math.max(0, 1 - dt * 6);
        p.vel.z *= Math.max(0, 1 - dt * 6);
        // 넘어짐: 닿은 점을 축으로 무게중심이 아래로 가도록 돈다
        const rx = p.pivot.position.x - low.x;
        const rz = p.pivot.position.z - low.z;
        p.wspin ??= new THREE.Vector3();
        p.wspin.x += rz * 40 * dt;
        p.wspin.z -= rx * 40 * dt;
        p.spin.multiplyScalar(Math.max(0, 1 - dt * 6));
        // 지면을 구르는 만큼만 미끄러진다
        p.grounded = true;
      }
      this._updatePlanes(p);
    }
  }
}

/** 남는 쪽(모든 절단면의 앞)에 있는 표본만, 최대 96개 */
function pickSamples(all, planes) {
  const keep = [];
  for (const v of all) {
    let ok = true;
    for (const pl of planes) {
      if (pl.distanceToPoint(v) < -0.002) {
        ok = false;
        break;
      }
    }
    if (ok) keep.push(v);
  }
  if (keep.length <= 96) return keep;
  const out = [];
  const step = keep.length / 96;
  for (let i = 0; i < 96; i++) out.push(keep[Math.floor(i * step)]);
  return out;
}

export { MAX_PIECES };
void _v2;
