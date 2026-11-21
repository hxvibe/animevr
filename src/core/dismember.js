// 살아 있는 적의 팔 · 다리 · 머리를 관절에서 떼어 낸다 (뜯기 · 약한 참격)
//  · 떨어진 부위는 소품(Prop)이 되어 굴러다니고, 잡아서 휘두르거나 던질 수 있다
//  · 단면은 번들거리는 피로 덮는다 — 몸 속(빈 껍데기)은 보이지 않는다
//  · 코드 모델/GLB 더미: 관절 그룹째로 떼어 낸다 · 스키닝 모델: 뼈 가중치로 삼각형을 나눠 굳힌다
import * as THREE from 'three';
import { RIG_MAPS } from './rigged.js';

// 관절 계층 (rigged.js · dummy.js 와 같다)
export const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', elL: 'shL', hdL: 'elL', shR: 'chest', elR: 'shR', hdR: 'elR', hpL: 'hips', knL: 'hpL', ftL: 'knL', hpR: 'hips', knR: 'hpR', ftR: 'knR' };
const ORDER = Object.keys(PARENT);
const OI = Object.fromEntries(ORDER.map((k, i) => [k, i]));
/** 떼어 낼 수 있는 부위 (그 관절부터 끝까지): 머리 · 팔 전체 · 아래팔 · 다리 전체 · 정강이 */
export const ROOTS = ['head', 'shL', 'elL', 'shR', 'elR', 'hpL', 'knL', 'hpR', 'knR'];
// 부위 방향(관절 → 다음 관절)과 단면 반지름(m, 키 1.8 기준)
const NEXT = { head: ['neck', 'head'], shL: ['shL', 'elL'], elL: ['elL', 'hdL'], shR: ['shR', 'elR'], elR: ['elR', 'hdR'], hpL: ['hpL', 'knL'], knL: ['knL', 'ftL'], hpR: ['hpR', 'knR'], knR: ['knR', 'ftR'] };
const CUT_R = { head: 0.07, shL: 0.072, shR: 0.072, elL: 0.052, elR: 0.052, hpL: 0.1, hpR: 0.1, knL: 0.068, knR: 0.068 };
// 떨어진 부위의 무게(kg 비슷한 단위) · 이름
const MASS = { head: 1.4, shL: 1.3, shR: 1.3, elL: 0.7, elR: 0.7, hpL: 2.6, hpR: 2.6, knL: 1.3, knR: 1.3 };
export const PART_NAME = { head: '머리', shL: '왼팔', shR: '오른팔', elL: '왼 아래팔', elR: '오른 아래팔', hpL: '왼다리', hpR: '오른다리', knL: '왼 정강이', knR: '오른 정강이' };

/** key 가 root 아래(자신 포함)인가 */
export function isUnder(key, root) {
  for (let k = key; k; k = PARENT[k]) if (k === root) return true;
  return false;
}

const BLOOD = new THREE.Color(0x5a0508);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ───────── 피 단면 ─────────
let CAP_GEO = null;
const CAP_MATS = new Map();
/** 반구(+Y가 바깥)를 울퉁불퉁하게: 가운데는 밝은 선홍, 가장자리는 검붉고 군데군데 엉긴 핏덩이 */
function capGeo() {
  if (CAP_GEO) return CAP_GEO;
  const g = new THREE.SphereGeometry(1, 22, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const hash = (x, y, z) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = hash(Math.round(x * 4), Math.round(y * 4), Math.round(z * 4));
    const n2 = hash(Math.round(x * 9) + 3, Math.round(y * 9), Math.round(z * 9) - 5);
    // 가장자리(y≈0)는 그대로 두어 몸 겉면과 이어지고, 위쪽만 울퉁불퉁
    const bump = y > 0.05 ? 1 + (n - 0.5) * 0.22 : 1;
    pos.setXYZ(i, x * bump, y * (0.85 + n2 * 0.3), z * bump);
    const rim = 1 - Math.min(1, y * 1.6); // 0 = 꼭대기, 1 = 가장자리
    c.setRGB(0.3, 0.012, 0.02).lerp(new THREE.Color(0.1, 0.0, 0.008), rim * 0.8);
    if (n2 > 0.78) c.multiplyScalar(0.5); // 엉긴 피
    else if (n > 0.8 && rim < 0.6) c.lerp(new THREE.Color(0.48, 0.03, 0.035), 0.55); // 번들거리는 선홍
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  CAP_GEO = g;
  return g;
}
function capMat(envMap) {
  let m = CAP_MATS.get(envMap ?? null);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.0, envMap: envMap ?? null, envMapIntensity: 0.55, emissive: 0x0a0001 });
    m.userData.noFlash = true;
    CAP_MATS.set(envMap ?? null, m);
  }
  return m;
}

/**
 * 피 단면 하나 (타원: 긴 반지름 rx · 짧은 반지름 rz · 부푼 높이 h, 월드 크기). +Y 가 바깥.
 *  sink: 밑면을 살갗 안쪽으로 묻는 깊이 (울퉁불퉁한 구멍 가장자리까지 덮이게)
 */
export function makeCap(rx, envMap, rz = rx, h = rx * 0.32, sink = rx * 0.06) {
  const g = new THREE.Group();
  g.name = 'bloodCap';
  const m = new THREE.Mesh(capGeo(), capMat(envMap));
  m.scale.set(rx, h, rz);
  m.position.y = -sink;
  m.castShadow = false;
  g.add(m);
  g.userData.r = Math.max(rx, rz);
  return g;
}

/** 단면 방향: +Y = normal, +X = 긴 축 */
function capQuat(normal, major, out = new THREE.Quaternion()) {
  const Y = normal.clone().normalize();
  const X = (major ?? new THREE.Vector3(1, 0, 0)).clone().addScaledVector(Y, -(major ?? _v.set(1, 0, 0)).dot(Y));
  if (X.lengthSq() < 1e-6) X.set(1, 0, 0).addScaledVector(Y, -Y.x);
  if (X.lengthSq() < 1e-6) X.set(0, 0, 1);
  X.normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}

/** 월드 위치 · 방향(월드 회전)으로 parent 아래에 붙인다 */
function attachCap(cap, parent, at, quat) {
  parent.updateWorldMatrix(true, false);
  parent.matrixWorld.decompose(_v2, _q, _s);
  cap.position.copy(parent.worldToLocal(at.clone()));
  cap.quaternion.copy(_q).invert().multiply(quat);
  cap.scale.set(1 / _s.x, 1 / _s.y, 1 / _s.z);
  parent.add(cap);
  return cap;
}

/** 점들의 주성분: 중심 · 축 셋(분산 큰 순) · 분산 */
function pca(pts) {
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  c.divideScalar(pts.length);
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i][j] += d[i] * d[j];
  }
  // 야코비 회전
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 12; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(A[p][q]) < 1e-12) continue;
      const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      for (let k = 0; k < 3; k++) {
        const akp = A[k][p];
        const akq = A[k][q];
        A[k][p] = cs * akp - sn * akq;
        A[k][q] = sn * akp + cs * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = A[p][k];
        const aqk = A[q][k];
        A[p][k] = cs * apk - sn * aqk;
        A[q][k] = sn * apk + cs * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k][p];
        const vkq = V[k][q];
        V[k][p] = cs * vkp - sn * vkq;
        V[k][q] = sn * vkp + cs * vkq;
      }
    }
  }
  const ax = [0, 1, 2].map((i) => ({ v: new THREE.Vector3(V[0][i], V[1][i], V[2][i]).normalize(), s: A[i][i] / pts.length }));
  ax.sort((a, b) => b.s - a.s);
  return { c, ax };
}

/**
 * 몸 안쪽(뒷면)을 피로 칠한다: 구멍 가장자리 틈으로 속이 빈 껍데기 · 반대편 살갗이 보이지 않게.
 *  양면 재질(머리카락 등)은 원래 뒷면이 보여야 하니 건드리지 않는다
 */
export function bloodInside(mat) {
  if (!mat || mat.userData.bloodInside || mat.side === THREE.DoubleSide || mat.transparent || mat.alphaTest > 0) return mat;
  mat.userData.bloodInside = true;
  mat.side = THREE.DoubleSide;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    const code = `
  if (!gl_FrontFacing) {
    vec2 bq = floor(gl_FragCoord.xy * 0.02);
    float bn = fract(sin(dot(bq, vec2(12.9898, 78.233))) * 43758.5453);
    gl_FragColor = vec4(mix(vec3(0.17, 0.0, 0.012), vec3(0.22, 0.006, 0.016), bn), 1.0);
  }
`;
    const f = sh.fragmentShader;
    const k = f.lastIndexOf('}');
    sh.fragmentShader = f.slice(0, k) + code + f.slice(k);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|bloodIn';
  mat.needsUpdate = true;
  return mat;
}

// ───────── 스키닝 모델: 정점마다 어느 관절 마디에 속하는지 ─────────
const SEG_CACHE = new WeakMap(); // 원본 지오메트리 → Uint8Array(정점 → ORDER 번호)

function boneSegMap(rig, skeleton) {
  const map = RIG_MAPS[rig.mapId] ?? {};
  const byName = new Map(Object.entries(map).map(([k, n]) => [n, k]));
  return skeleton.bones.map((b) => {
    let hair = false;
    for (let p = b; p; p = p.parent) {
      if (/hair/i.test(p.name)) hair = true;
      const k = byName.get(p.name);
      // 목에 달린 긴 머리카락은 머리와 함께 떨어진다
      if (k) return OI[k === 'neck' && hair ? 'head' : k];
    }
    return OI.hips;
  });
}

function vertexSegs(rig, o, geo) {
  const cached = SEG_CACHE.get(geo);
  if (cached) return cached;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const n = geo.attributes.position.count;
  const out = new Uint8Array(n);
  const b2s = boneSegMap(rig, o.skeleton);
  const acc = new Float32Array(ORDER.length);
  for (let i = 0; i < n; i++) {
    acc.fill(0);
    for (let j = 0; j < 4; j++) {
      const w = sw.getComponent(i, j);
      if (w > 0) acc[b2s[si.getComponent(i, j)] ?? 0] += w;
    }
    let best = 0;
    for (let s = 1; s < acc.length; s++) if (acc[s] > acc[best]) best = s;
    out[i] = best;
  }
  SEG_CACHE.set(geo, out);
  return out;
}

/** 스키닝 메시 준비: 지오메트리를 제 것으로 복제하고 정점 마디 · 원래 삼각형 목록을 기억 */
function prepSkinned(d) {
  if (d._dm) return d._dm;
  const list = [];
  const acc = [];
  for (const o of d.rig.meshes) {
    if (o.isSkinnedMesh && o.geometry.attributes.skinIndex) {
      const src = o.geometry;
      const seg = vertexSegs(d.rig, o, src);
      const geo = src.clone();
      o.geometry = geo;
      const tri = geo.index ? Uint32Array.from(geo.index.array) : Uint32Array.from({ length: geo.attributes.position.count }, (_, i) => i);
      list.push({ o, seg, tri, groups: geo.groups.map((g) => ({ ...g })) });
    } else if (o.isMesh) {
      // 뼈에 붙은 장식(스키닝 아님): 가장 가까운 매핑 뼈의 마디
      const map = RIG_MAPS[d.rig.mapId] ?? {};
      const byName = new Map(Object.entries(map).map(([k, n]) => [n, k]));
      let k = 'hips';
      for (let p = o.parent; p; p = p.parent) {
        if (byName.has(p.name)) {
          k = byName.get(p.name);
          break;
        }
      }
      acc.push({ o, key: k, vis: o.visible });
    }
  }
  for (const m of d.rig.mats ?? []) bloodInside(m);
  d._dm = { list, acc };
  return d._dm;
}

/** 지금 잃은 마디를 빼고 삼각형 목록을 다시 만든다 (정점 셋 중 둘 이상이 잃은 마디면 뺀다) */
function rebuildIndex(d) {
  const lost = lostSegMask(d);
  for (const E of d._dm.list) {
    const { o, seg, tri } = E;
    const keep = [];
    const geo = o.geometry;
    // 재질 묶음(그룹)이 있으면 그룹별로 다시 센다
    const groups = E.groups.length ? E.groups : [{ start: 0, count: tri.length, materialIndex: 0 }];
    const ng = [];
    for (const g of groups) {
      const s0 = keep.length;
      for (let i = g.start; i < g.start + g.count; i += 3) {
        const a = tri[i];
        const b = tri[i + 1];
        const c = tri[i + 2];
        if (lost[seg[a]] + lost[seg[b]] + lost[seg[c]] >= 2) continue;
        keep.push(a, b, c);
      }
      ng.push({ start: s0, count: keep.length - s0, materialIndex: g.materialIndex });
    }
    const n = geo.attributes.position.count;
    geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1));
    if (E.groups.length) {
      geo.clearGroups();
      for (const g of ng) geo.addGroup(g.start, g.count, g.materialIndex);
    }
  }
  for (const A of d._dm.acc) A.o.visible = A.vis && !lostKeys(d).has(A.key);
}

/** 잃은 마디 (ORDER 번호 → 0/1) */
function lostSegMask(d) {
  const m = new Uint8Array(ORDER.length);
  for (const k of lostKeys(d)) m[OI[k]] = 1;
  return m;
}

/** 잃은 관절 이름 전부 */
export function lostKeys(d) {
  const out = new Set();
  for (const r of d.lostRoots ?? []) for (const k of ORDER) if (isUnder(k, r)) out.add(k);
  return out;
}

/** 굳힌(월드) 정점 위치 */
function bakedWorld(o, i, out) {
  out.fromBufferAttribute(o.geometry.attributes.position, i);
  o.applyBoneTransform(i, out);
  return out.applyMatrix4(o.matrixWorld);
}

/** 삼각형 목록 → 조각 지오메트리 (쓰는 정점만, 조각 뿌리 기준 좌표) */
function compactGeo(o, tris, inv) {
  const src = o.geometry;
  const remap = new Map();
  const order = [];
  for (const i of tris) if (!remap.has(i)) {
    remap.set(i, order.length);
    order.push(i);
  }
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(order.length * 3);
  for (let j = 0; j < order.length; j++) {
    bakedWorld(o, order[j], _v).applyMatrix4(inv);
    pos[j * 3] = _v.x;
    pos[j * 3 + 1] = _v.y;
    pos[j * 3 + 2] = _v.z;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (const [name, attr] of Object.entries(src.attributes)) {
    if (name === 'position' || name === 'normal' || name === 'skinIndex' || name === 'skinWeight' || name === 'tangent') continue;
    const k = attr.itemSize;
    const arr = new Float32Array(order.length * k);
    for (let j = 0; j < order.length; j++) for (let c = 0; c < k; c++) arr[j * k + c] = attr.getComponent(order[j], c);
    g.setAttribute(name, new THREE.BufferAttribute(arr, k, attr.normalized));
  }
  g.setIndex(tris.map((i) => remap.get(i)));
  g.computeVertexNormals();
  return g;
}

// ───────── 떼어 내기 ─────────
/**
 * @param d 더미 · root: ROOTS 중 하나
 * @param opts { vel: 조각 속도, dmg: 덧붙일 피해, cause: 'tear'|'slash', spurt: 피 분출 세기 }
 * @returns 조각(Prop) 또는 null
 */
export function sever(d, root, opts = {}) {
  if (!d.alive || !ROOTS.includes(root)) return null;
  d.lostRoots ??= new Set();
  const before = lostKeys(d);
  if (before.has(root)) return null;
  const W = d.world;
  const J = d._jointMap();
  d.root.updateMatrixWorld(true);
  if (d.rig) d.rig.sync?.();
  d.root.updateMatrixWorld(true);
  const sc = d.scale ?? 1;
  const [ka, kb] = NEXT[root];
  const pa = J[ka].getWorldPosition(new THREE.Vector3());
  const pb = J[kb].getWorldPosition(new THREE.Vector3());
  const dir = pb.clone().sub(pa);
  if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
  dir.normalize();
  const jp = J[root].getWorldPosition(new THREE.Vector3());
  const newSet = new Set();
  for (const k of ORDER) if (isUnder(k, root) && !before.has(k)) newSet.add(k);

  // 단면: 중심 C · 바깥 방향 N(몸 → 떨어지는 쪽) · 긴 축 · 타원 반지름 · 높이
  const R0 = CUT_R[root] * sc;
  const mid = root === 'head' ? pb.clone().addScaledVector(dir, 0.1 * sc) : pa.clone().lerp(pb, 0.5);
  const cut = { C: jp.clone(), N: dir.clone(), major: null, rx: R0 * 1.1, rz: R0 * 1.1, h: R0 * 0.35, sink: R0 * 0.06 };
  if (!d.rig) {
    // 관절 그룹 모델: 구멍이 없다 → 관절 자리에 붙인다 (어깨는 옆으로, 팔꿈치·무릎은 윗마디 방향)
    const P = (k) => J[k].getWorldPosition(new THREE.Vector3());
    if (root === 'shL' || root === 'shR') cut.N.copy(P(root).sub(P('chest')).normalize()).addScaledVector(dir, 0.6).normalize();
    else if (root.startsWith('el') || root.startsWith('kn')) cut.N.copy(P(root).sub(P(PARENT[root]))).normalize();
  }
  const pieceRoot = new THREE.Group();
  pieceRoot.name = 'limb_' + root;
  if (d.rig) {
    const dm = prepSkinned(d);
    // 경계 정점: 떼는 마디와 남는 마디에 함께 걸친 삼각형의 정점 (관절 근처만)
    const ring = [];
    const lim = R0 * 2.8;
    for (const E of dm.list) {
      if (!E.o.visible) continue;
      const { o, seg, tri } = E;
      const isNew = (i) => newSet.has(ORDER[seg[i]]);
      const isLost = (i) => before.has(ORDER[seg[i]]);
      for (let i = 0; i < tri.length && ring.length < 900; i += 3) {
        const a = tri[i];
        const b = tri[i + 1];
        const c = tri[i + 2];
        if (isLost(a) + isLost(b) + isLost(c) >= 2) continue;
        const nn = isNew(a) + isNew(b) + isNew(c);
        if (nn === 0 || nn === 3) continue;
        for (const v of [a, b, c]) {
          const p = bakedWorld(o, v, new THREE.Vector3());
          if (p.distanceTo(jp) < lim) ring.push(p);
        }
      }
    }
    if (ring.length >= 8) {
      const { c, ax } = pca(ring);
      const N = ax[2].v.clone();
      if (N.dot(_v.subVectors(mid, c)) < 0) N.negate();
      const devs = ring.map((p) => Math.abs(_v.subVectors(p, c).dot(N))).sort((x, y) => x - y);
      const dev = devs[Math.floor(devs.length * 0.85)];
      cut.C.copy(c);
      cut.N.copy(N);
      cut.major = ax[0].v.clone();
      cut.rx = THREE.MathUtils.clamp(Math.sqrt(2 * ax[0].s), R0 * 0.5, R0 * 2.6) * 1.2;
      cut.rz = THREE.MathUtils.clamp(Math.sqrt(2 * ax[1].s), R0 * 0.4, R0 * 2.2) * 1.2;
      const r = Math.max(cut.rx, cut.rz);
      cut.sink = Math.min(dev * 0.8, r * 0.4);
      cut.h = THREE.MathUtils.clamp(dev * 2.4, r * 0.3, r * 0.6);
    }
  }
  const C = cut.C;
  const capQ = capQuat(cut.N, cut.major);
  const newCap = () => makeCap(cut.rx, W.envMap, cut.rz, cut.h, cut.sink);

  // 조각 뿌리: 단면 중심, +Y = 부위 방향
  pieceRoot.position.copy(C);
  pieceRoot.quaternion.setFromUnitVectors(UP, dir);
  pieceRoot.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(pieceRoot.matrixWorld).invert();
  const mats = new Map();
  const cloneMat = (m) => {
    if (Array.isArray(m)) return m.map(cloneMat);
    let c = mats.get(m);
    if (!c) {
      c = m.clone();
      if (c.emissive && m.userData.baseEmissive) c.emissive.copy(m.userData.baseEmissive);
      mats.set(m, c);
    }
    return c;
  };

  if (d.rig) {
    const dm = d._dm;
    for (const E of dm.list) {
      const { o, seg, tri } = E;
      if (!o.visible) continue;
      const groups = E.groups.length ? E.groups : [{ start: 0, count: tri.length, materialIndex: 0 }];
      for (const g of groups) {
        const tris = [];
        for (let i = g.start; i < g.start + g.count; i += 3) {
          const a = tri[i];
          const b = tri[i + 1];
          const c = tri[i + 2];
          const L = before.has(ORDER[seg[a]]) + before.has(ORDER[seg[b]]) + before.has(ORDER[seg[c]]);
          const N = newSet.has(ORDER[seg[a]]) + newSet.has(ORDER[seg[b]]) + newSet.has(ORDER[seg[c]]);
          if (L < 2 && N >= 2) tris.push(a, b, c);
        }
        if (!tris.length) continue;
        const mat = Array.isArray(o.material) ? o.material[g.materialIndex] : o.material;
        const m = new THREE.Mesh(compactGeo(o, tris, inv), cloneMat(mat));
        m.castShadow = true;
        pieceRoot.add(m);
      }
    }
    for (const A of dm.acc) {
      if (!A.o.visible || !newSet.has(A.key)) continue;
      const c = A.o.clone(false);
      c.material = cloneMat(A.o.material);
      _m.multiplyMatrices(inv, A.o.matrixWorld).decompose(c.position, c.quaternion, c.scale);
      pieceRoot.add(c);
    }
    // 앞서 생긴 단면(예: 아래팔을 먼저 잃은 팔꿈치)이 이번 조각에 딸려 가면 조각으로 옮긴다
    for (const cap of d._caps ?? []) {
      if (!newSet.has(cap.userData.on) || !cap.visible) continue;
      const c2 = cap.clone(true);
      cap.updateWorldMatrix(true, false);
      _m.multiplyMatrices(inv, cap.matrixWorld).decompose(c2.position, c2.quaternion, c2.scale);
      pieceRoot.add(c2);
      cap.visible = false;
    }
  } else {
    // 관절 그룹째: 지금 자세 그대로 복제
    const src = J[root];
    const c = src.clone(true);
    c.traverse((o) => {
      if (o.isMesh) o.material = cloneMat(o.material);
    });
    _m.multiplyMatrices(inv, src.matrixWorld).decompose(c.position, c.quaternion, c.scale);
    pieceRoot.add(c);
  }
  // 조각 쪽 단면 (몸 쪽을 향한다): 같은 타원을 뒤집어
  const pc = newCap();
  pc.quaternion.copy(pieceRoot.quaternion).invert().multiply(capQuat(cut.N.clone().negate(), cut.major));
  pc.position.copy(C).applyMatrix4(inv);
  pieceRoot.add(pc);

  // 몸에서 지운다
  d.lostRoots.add(root);
  if (d.rig) rebuildIndex(d);
  else J[root].visible = false;
  d._lostIdx = null;
  // 몸 쪽 단면: 부모 관절에 붙어 함께 움직인다
  const parentKey = PARENT[root];
  const bc = attachCap(newCap(), J[parentKey], C, capQ);
  bc.userData.on = parentKey;
  bc.userData.root = root;
  d._caps ??= [];
  d._caps.push(bc);

  // 장면에 놓고 소품으로
  W.scene.add(pieceRoot);
  const len = pa.distanceTo(pb) * (root === 'head' ? 1.6 : root.startsWith('el') || root.startsWith('kn') ? 1.3 : 2);
  const prop = W.addProp(pieceRoot, { radius: Math.max(0.09 * sc, len * 0.32), mass: MASS[root] * sc * sc, hp: 60 * sc, color: 0x6a0c0c });
  prop.floor0 = 0; // 떨어진 높이를 바닥으로 여기지 않게
  prop._supported = false;
  prop.limb = root;
  prop.debris = true;
  prop.from = d;
  prop.ignoreD = d;
  prop.ignoreUntil = W.time + 0.6;
  prop.label = `${d.name} · ${PART_NAME[root]}`;
  const v = opts.vel ? opts.vel.clone() : dir.clone().multiplyScalar(1.2).add(_v.set(0, 1.2, 0));
  prop.vel.copy(v).add(d.vel ?? _v.set(0, 0, 0));
  prop.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(opts.spin ?? 4);
  prop.asleep = false;
  W.addLimb?.(prop);

  // 피: 분출 + 한동안 흘린다 (몸 쪽 · 조각 쪽)
  const fx = W.ctx.fx;
  const k = opts.spurt ?? 1;
  fx.burst(C, Math.round(26 * k), BLOOD, 2.6 * k, 0.035 * sc, 0.8, { dark: true, dir: cut.N, dirAmt: 1.2, grav: 9, drag: 0.6, spread: cut.rx * 0.5 });
  W.bleed?.(bc, 2.6 + k, 26 * k);
  W.bleed?.(pc, 1.6, 12);
  W.shatter?.emit(C, Math.round(6 * k), 0x4a0408, { spread: cut.rx, speed: 1.6 * k, size: 0.018 * sc, life: 1.4, dir: cut.N, dirAmt: 1 });

  // 잡고 있던 손: 그 부위를 잡은 손은 이제 떨어진 조각을 쥔다
  const R2 = d.rag;
  const idx = d._ragIndex?.();
  if (d.holders?.size && R2 && idx) {
    for (const [by, pin] of [...d.holders]) {
      if (!newSet.has(idx[pin])) continue;
      d.holders.delete(by);
      R2.pins?.delete(pin);
      if (d.heldBy === by) d.heldBy = d.holders.size ? [...d.holders.keys()][0] : null;
      if (R2.pin === pin) {
        const nx = d.holders.size ? [...d.holders.values()][0] : -1;
        R2.pin = nx;
        if (nx >= 0) R2.pinTarget.copy(R2.pins.get(nx));
      }
      by.onLimb?.(prop, root);
    }
    if (!d.holders.size && d.state === 'held') {
      d.state = 'air';
      d.stateT = 0;
      if (d.rag) d.rag.vel.copy(d.vel);
    }
  }
  // 피해 (뜯기)
  if (opts.dmg && !d.infinite) {
    d.hp -= opts.dmg;
    d.totalDamage += opts.dmg;
    W.onDamage?.(d, opts.dmg, { type: opts.cause ?? 'tear' });
    d._hurtT = W.time;
  }
  d.onSever?.(root, prop, opts);
  if (!opts.noDeath && (root === 'head' || (!d.infinite && d.hp <= 0))) d.bleedOut?.();
  return prop;
}

/** 잃은 부위를 모두 되살린다 (반전술식 · 재생) */
export function regrow(d) {
  if (!d.lostRoots?.size) return false;
  const J = d._jointMap();
  const fx = d.world.ctx.fx;
  for (const cap of d._caps ?? []) {
    cap.updateWorldMatrix(true, false);
    if (cap.visible) fx.burst(cap.getWorldPosition(_v), 8, new THREE.Color(0xffffff), 0.8, 0.04, 0.6, { up: 1 });
    cap.parent?.remove(cap);
  }
  d._caps = [];
  if (!d.rig) for (const r of d.lostRoots) J[r].visible = true;
  d.lostRoots.clear();
  if (d.rig && d._dm) rebuildIndex(d);
  d._lostIdx = null;
  return true;
}
