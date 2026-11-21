// 「自閉円頓裹」 — 원작 애니(1기 13화)처럼: 거의 검은 보랏빛 허공, 마히토 자신의 손(모델에서 떼어 낸 손)이
//  뒤에서 거대하게 피어오르고, 양 끝에 손만 달린 팔들이 서로 깍지를 끼며 길게 이어져 영역 전체를 공 모양으로 두른다.
//  펼쳐질 때: 손이 먼저 피어나고 → 깍지 낀 팔의 사슬이 바닥에서 정수리 쪽으로 자라 올라간다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RiggedBody } from './rigged.js';
import { FingerRig } from './enemies.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _a = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

// 손 모양들 (엄지 · 검지 · 중지 · 약지 · 새끼 굽힘)
const POSES = {
  open: [0.05, 0, 0.02, 0.05, 0.1], // 활짝
  relax: [0.25, 0.22, 0.3, 0.38, 0.45], // 힘을 뺀
  claw: [0.35, 0.5, 0.55, 0.6, 0.65], // 움켜쥐려는
  clasp: [0.55, 0.78, 0.82, 0.85, 0.85], // 깍지 낀
};
const POSE_KEYS = Object.keys(POSES);

/**
 * 마히토 모델의 오른손을 떼어 고정된 기하로 굽는다 (손가락 굽힘 포함).
 *  손 좌표: 손목 = 원점, 손가락 = +Y, 손바닥이 보는 쪽 = +Z, 길이(손목→가운뎃손가락 끝) = 1
 */
const _baked = new Map();
export function bakeHand(pose) {
  if (_baked.has(pose)) return _baked.get(pose);
  let out = null;
  try {
    const body = new RiggedBody('mahito', { height: 1.8, hide: [] });
    if (body.ok) {
      const fr = new FingerRig(body);
      const F = fr.hands.R;
      if (F.length >= 4) {
        body.model.updateMatrixWorld(true);
        const W = (b) => b.getWorldPosition(new THREE.Vector3());
        const wristB = F[2].bones[0].parent;
        const wrist = W(wristB);
        const mid = W(F[2].bones[0]);
        const idx = W(F[1].bones[0]);
        const pin = W((F[4] ?? F[3]).bones[0]);
        const mb = F[2].bones;
        const last = mb[mb.length - 1];
        const tip = last.children[0]?.isBone ? W(last.children[0]) : W(last).addScaledVector(W(last).sub(W(mb[Math.max(0, mb.length - 2)])).normalize(), 0.02);
        const f = mid.clone().sub(wrist).normalize();
        const n = new THREE.Vector3().crossVectors(idx.clone().sub(wrist), pin.clone().sub(wrist));
        n.addScaledVector(f, -n.dot(f)).normalize();
        const sd = new THREE.Vector3().crossVectors(f, n);
        const toHand = new THREE.Matrix4().makeBasis(sd, f, n).invert();
        const len = tip.distanceTo(wrist);
        const thumbX = W(F[0].bones[F[0].bones.length - 1]).sub(wrist).applyMatrix4(toHand).x;
        fr.applyEach('R', POSES[pose]);
        body.model.updateMatrixWorld(true);
        const keep = new Set();
        wristB.traverse((b) => b.isBone && keep.add(b));
        const parts = [];
        for (const o of body.meshes) {
          if (!o.isSkinnedMesh || !o.geometry.attributes.skinIndex) continue;
          o.skeleton.update();
          const g = o.geometry;
          const si = g.attributes.skinIndex;
          const sw = g.attributes.skinWeight;
          const N = si.count;
          const ok = new Uint8Array(N);
          for (let i = 0; i < N; i++) {
            let best = 0;
            let bw = -1;
            for (let c = 0; c < 4; c++) {
              const w = sw.getComponent(i, c);
              if (w > bw) {
                bw = w;
                best = si.getComponent(i, c);
              }
            }
            ok[i] = keep.has(o.skeleton.bones[best]) ? 1 : 0;
          }
          const src = g.index ? g.index.array : Array.from({ length: N }, (_, i) => i);
          const remap = new Int32Array(N).fill(-1);
          const pos = [];
          const ind = [];
          const v = new THREE.Vector3();
          for (let t = 0; t < src.length; t += 3) {
            if (!(ok[src[t]] && ok[src[t + 1]] && ok[src[t + 2]])) continue;
            for (let k = 0; k < 3; k++) {
              const i = src[t + k];
              if (remap[i] < 0) {
                o.getVertexPosition(i, v);
                v.applyMatrix4(o.matrixWorld).sub(wrist).applyMatrix4(toHand).multiplyScalar(1 / len);
                remap[i] = pos.length / 3;
                pos.push(v.x, v.y, v.z);
              }
              ind.push(remap[i]);
            }
          }
          if (!ind.length) continue;
          const pg = new THREE.BufferGeometry();
          pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          pg.setIndex(ind);
          parts.push(pg);
        }
        if (parts.length) {
          out = mergeVerts(parts.length > 1 ? mergeGeometries(parts) : parts[0]);
          out.computeVertexNormals();
          out.computeBoundingSphere();
          out.userData.thumbX = thumbX;
        }
      }
    }
  } catch (e) {
    console.warn('mahito hand bake', e);
    out = null;
  }
  _baked.set(pose, out);
  return out;
}

/** 같은 자리의 정점을 합친다 (이음매가 갈라지지 않은 매끈한 법선) */
function mergeVerts(g) {
  const p = g.attributes.position;
  const map = new Map();
  const keep = [];
  const remap = new Uint32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 2000)},${Math.round(p.getY(i) * 2000)},${Math.round(p.getZ(i) * 2000)}`;
    let j = map.get(k);
    if (j === undefined) {
      j = keep.length / 3;
      map.set(k, j);
      keep.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    remap[i] = j;
  }
  const idx = g.index ? Array.from(g.index.array, (i) => remap[i]) : Array.from(remap);
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  o.setIndex(idx);
  return o;
}

/** 모델이 없을 때의 둥근 손 (캡슐 손가락) */
let _fallback = null;
function fallbackHand() {
  if (_fallback) return _fallback;
  const parts = [];
  const cap = (r, l, x, y, z, rx = 0, rz = 0) => parts.push(new THREE.CapsuleGeometry(r, l, 4, 8).translate(0, l / 2 + r, 0).rotateX(rx).rotateZ(rz).translate(x, y, z));
  parts.push(new THREE.SphereGeometry(1, 14, 10).scale(0.24, 0.27, 0.08).translate(0, 0.27, 0));
  [-0.15, -0.05, 0.05, 0.15].forEach((x, i) => cap(0.045, [0.3, 0.36, 0.34, 0.27][i], x, 0.48, 0, 0.15));
  cap(0.05, 0.22, -0.2, 0.18, 0.04, 0.2, 0.8);
  _fallback = mergeVerts(mergeGeometries(parts.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(x.attributes)) if (k !== 'position') x.deleteAttribute(k);
    return x;
  })));
  _fallback.computeVertexNormals();
  return _fallback;
}

/** 좌우 거울 (오른손 → 왼손): 면 방향도 뒤집는다 */
function mirrorX(g) {
  const o = g.clone();
  const p = o.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  const idx = o.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  o.index.needsUpdate = true;
  o.computeVertexNormals();
  return o;
}

/** 법선 쪽으로 부풀린 외곽선용 기하 (뒷면을 검게 그려 애니 느낌의 윤곽선) */
function inflate(g, d) {
  const o = g.clone();
  const p = o.attributes.position;
  const n = o.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
  return o;
}

// 살빛: 원작 영역 속 손처럼 창백한 연보랏빛 · 그늘은 짙은 자주
const SKIN = 0x9c8494;

export class HandMaw {
  /** R: 영역 반지름(m) */
  constructor(R) {
    this.R = R;
    this.group = new THREE.Group(); // 영역 중심
    this.cluster = new THREE.Group(); // 피어오른 손 무더기 (가장자리 쪽에 세운다)
    this.group.add(this.cluster);
    this.t = 0;
    this.mat = new THREE.MeshToonMaterial({ color: SKIN, emissive: 0x1c1024, emissiveIntensity: 0.5 });
    this.lineMat = new THREE.MeshBasicMaterial({ color: 0x120a16, side: THREE.BackSide });
    this.items = [];
    const add = (pos, quat, s, pose, delay, chain = false) => this.items.push({ pos: pos.clone(), quat: quat.clone(), s, pose, delay, ph: Math.random() * 6.28, wob: chain ? 0 : rnd(0.03, 0.08), chain });
    const look = (fingers, palm) => {
      const yv = fingers.clone().normalize();
      const zv = palm.clone().addScaledVector(yv, -palm.dot(yv)).normalize();
      const xv = new THREE.Vector3().crossVectors(yv, zv);
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xv, yv, zv));
    };

    // ── 1) 피어오른 손 무더기 (무더기 좌표: +Z 가 영역 가운데 쪽) ──
    const C0 = new THREE.Vector3(0, R * 0.36, 0);
    this.C0 = C0;
    const big = R * 0.32;
    // 가운데 손 둘레를 겹겹이 두른 큰 손 (뒤쪽)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(a), Math.sin(a), -0.35).normalize();
      const pos = C0.clone().addScaledVector(out, big * 0.5).add(new THREE.Vector3(0, 0, -big * 0.15));
      add(pos, look(out, new THREE.Vector3(0, 0, 1)), big * 0.6, i % 2 ? 'claw' : 'relax', 0.15 + i * 0.02);
    }
    // 둘레로 사방에 피어난 손
    const NB = 44;
    for (let i = 0; i < NB; i++) {
      const y = 1 - ((i + 0.5) / NB) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.39996;
      const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r * 0.6 - 0.45).normalize();
      const pos = C0.clone().addScaledVector(d, big * 0.55);
      add(pos, look(d, new THREE.Vector3(0, 0, 1).addScaledVector(d, -0.5)), big * rnd(0.45, 0.62), POSE_KEYS[i % 3], 0.12 + Math.random() * 0.25);
    }

    // ── 2) 깍지 낀 팔의 사슬: 가로로 여러 겹 둘러 영역을 공 모양으로 감싼다 ──
    const Rs = R * 0.9;
    const HL = 1.25; // 손 길이(m)
    this.arms = [];
    const paths = [];
    [0.1, 0.28, 0.46, 0.63, 0.78, 0.9].forEach((f, li) => {
      const ringH = Rs * f;
      const ringR = Math.sqrt(Rs * Rs - ringH * ringH);
      const off = li * 0.37;
      paths.push({ ring: true, li, L: 2 * Math.PI * ringR, P: (t) => new THREE.Vector3(Math.cos(t * Math.PI * 2 + off) * ringR, ringH, Math.sin(t * Math.PI * 2 + off) * ringR) });
    });
    for (const { ring, li, L, P } of paths) {
      const nJ = Math.max(3, Math.round(L / 4.6));
      const joints = [];
      for (let j = 0; j < nJ; j++) {
        const t = ring ? j / nJ : (j + 0.5) / nJ;
        const p = P(t);
        if (p.y < 0.6) continue;
        const tan = P(t + 0.002).sub(P(t - 0.002)).normalize();
        joints.push({ p, tan, delay: 0.35 + li * 0.09 + (j / nJ) * 0.12 });
      }
      for (const J of joints) {
        // 깍지: 두 손이 손바닥을 맞대고 손가락을 서로의 손등으로 감는다
        const inward = J.p.clone().negate().normalize();
        const side = new THREE.Vector3().crossVectors(J.tan, inward).normalize();
        J.wa = J.p.clone().addScaledVector(J.tan, -HL * 0.5).addScaledVector(side, -0.07);
        J.wb = J.p.clone().addScaledVector(J.tan, HL * 0.5).addScaledVector(side, 0.07);
        add(J.wa, look(J.tan, side), HL, 'clasp', J.delay, true);
        add(J.wb, look(J.tan.clone().negate(), side.clone().negate()), HL, 'clasp', J.delay, true);
      }
      // 팔: 앞 깍지의 손목 → 다음 깍지의 손목 (양 끝에 손만 달린 팔)
      for (let ji = 0; ji < joints.length - (ring ? 0 : 1); ji++) {
        const A = joints[ji];
        const B = joints[(ji + 1) % joints.length];
        this.arms.push({ a: A.wb, b: B.wa, delay: Math.max(A.delay, B.delay) - 0.05 });
      }
    }

    // ── 메시: 손 모양마다 InstancedMesh (+ 윤곽선) ──
    this.meshes = {};
    const counts = {};
    for (const it of this.items) counts[it.pose] = (counts[it.pose] ?? 0) + 1;
    for (const k of POSE_KEYS) {
      const n = counts[k] ?? 0;
      if (!n) continue;
      const geo = bakeHand(k) ?? fallbackHand();
      const m = new THREE.InstancedMesh(geo, this.mat, n);
      const o = new THREE.InstancedMesh(inflate(geo, 0.012), this.lineMat, n);
      for (const x of [m, o]) {
        x.frustumCulled = false;
        x.castShadow = false;
        this.group.add(x);
      }
      this.meshes[k] = { m, o, i: 0 };
    }
    for (const it of this.items) {
      it.mesh = this.meshes[it.pose];
      it.idx = it.mesh.i++;
    }
    // ── 3) 한가운데: 손바닥을 위아래로 맞댄 거대한 두 손 (영역전개의 손 모양 — 앞에서 보면 엄지가 왼쪽) ──
    //  앞 손: 오른손, 손가락이 위 · 손등이 앞 / 뒤 손: 왼손(거울), 손가락이 아래 · 손바닥이 앞 손의 손바닥에 닿는다
    const pairL = big * 1.05;
    // 앞에서 볼 때 엄지가 왼쪽: 두 손 모두 손 좌표 +X 가 왼쪽으로 가므로, 엄지가 −X 인 모델이면 거울로
    const g0 = bakeHand('open') ?? fallbackHand();
    const gR = (g0.userData.thumbX ?? 1) > 0 ? g0 : mirrorX(g0);
    const gL = gR;
    this.pair = [];
    const mk = (geo, fingers, palm, wristY, z) => {
      const m = new THREE.Mesh(geo, this.mat);
      const o = new THREE.Mesh(inflate(geo, 0.01), this.lineMat);
      const q = look(fingers, palm);
      const wrist = C0.clone().add(new THREE.Vector3(0, wristY * pairL, z * pairL + big * 0.22));
      for (const x of [m, o]) {
        x.frustumCulled = false;
        this.cluster.add(x);
      }
      this.pair.push({ m, o, q, wrist });
    };
    mk(gR, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), -0.42, 0.045);
    mk(gL, new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), 0.42, -0.045);
    this.pairL = pairL;

    // 팔: 손목에서 굵어졌다 다시 손목으로 가늘어지는 아래팔
    const prof = [[0.0, 0], [0.62, 0.0], [0.8, 0.1], [1.0, 0.3], [1.0, 0.7], [0.8, 0.9], [0.62, 1], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y));
    const armGeo = new THREE.LatheGeometry(prof, 12);
    armGeo.deleteAttribute('uv');
    this.armMesh = new THREE.InstancedMesh(armGeo, this.mat, Math.max(1, this.arms.length));
    this.armMesh.frustumCulled = false;
    this.group.add(this.armMesh);
    this.update(0, 0);
  }

  /** 손 무더기를 둘 자리: 영역 중심 기준 위치와, 앞(+Z)이 향할 방향 */
  place(pos, yaw) {
    this.cluster.position.copy(pos);
    this.cluster.rotation.y = yaw;
  }

  update(dt, open) {
    this.t += dt;
    const t = this.t;
    this.cluster.updateMatrix();
    const cm = this.cluster.matrix;
    const cq = this.cluster.quaternion;
    for (const it of this.items) {
      const k = THREE.MathUtils.clamp((open - it.delay) / (it.chain ? 0.3 : 0.5), 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      if (it.chain) {
        _p.copy(it.pos);
        _q.copy(it.quat);
      } else {
        // 가운데에서 피어나며 바깥으로 · 숨 쉬듯 꿈틀
        _p.lerpVectors(this.C0, it.pos, e).applyMatrix4(cm);
        const w = Math.sin(t * 1.2 + it.ph) * it.wob;
        _e.set(w, Math.sin(t * 0.8 + it.ph) * it.wob, w * 0.6);
        _q.copy(cq).multiply(it.quat).multiply(_q2.setFromEuler(_e));
      }
      _m.compose(_p, _q, _s.setScalar(Math.max(0.0001, it.s * (it.chain ? e : 0.1 + 0.9 * e))));
      it.mesh.m.setMatrixAt(it.idx, _m);
      it.mesh.o.setMatrixAt(it.idx, _m);
    }
    // 가운데 두 손: 가장 먼저 맺힌다 (숨 쉬듯 아주 조금 떨린다)
    const pk = THREE.MathUtils.clamp(open / 0.45, 0, 1);
    const pe = 1 - Math.pow(1 - pk, 3);
    for (const P of this.pair ?? []) {
      const sc = Math.max(0.0001, this.pairL * (0.2 + 0.8 * pe));
      for (const x of [P.m, P.o]) {
        x.position.copy(this.C0).lerp(P.wrist, pe);
        x.position.y += Math.sin(t * 0.9) * 0.05;
        x.quaternion.copy(P.q);
        x.scale.setScalar(sc);
      }
    }
    this.arms.forEach((A, i) => {
      const k = THREE.MathUtils.clamp((open - A.delay) / 0.3, 0, 1);
      const d = _a.subVectors(A.b, A.a);
      const L = d.length();
      _q.setFromUnitVectors(Y, d.normalize());
      const r = Math.max(0.0001, 0.17 * k);
      _m.compose(A.a, _q, _s.set(r, Math.max(0.0001, L * k), r));
      this.armMesh.setMatrixAt(i, _m);
    });
    for (const k in this.meshes) {
      this.meshes[k].m.instanceMatrix.needsUpdate = true;
      this.meshes[k].o.instanceMatrix.needsUpdate = true;
    }
    this.armMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const k in this.meshes) {
      this.meshes[k].m.dispose();
      this.meshes[k].o.geometry.dispose();
      this.meshes[k].o.dispose();
    }
    this.armMesh.geometry.dispose();
    this.armMesh.dispose();
    for (const P of this.pair ?? []) P.o.geometry.dispose();
    this.mat.dispose();
    this.lineMat.dispose();
  }
}

// 거의 검은 보랏빛 허공 (원작) — GLSL 조각 (dh/dn/dfbm 필요)
export const VOID_WALL = /* glsl */ `
vec3 mahitoVoid(vec3 d, float t) {
  vec3 c = mix(vec3(0.035, 0.022, 0.06), vec3(0.012, 0.008, 0.022), smoothstep(-0.1, 0.9, d.y));
  float haze = dfbm(d * 2.2 + vec3(0.0, t * 0.015, 0.0));
  c += vec3(0.18, 0.09, 0.28) * smoothstep(0.45, 0.85, haze) * 0.55;
  vec3 g = floor(d * 150.0);
  float star = step(0.9984, dh(g));
  c += vec3(0.75, 0.7, 0.9) * star * (0.4 + 0.3 * sin(t * 2.0 + dh(g) * 40.0));
  return c;
}`;
