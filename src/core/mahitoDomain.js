// 「自閉円頓裹」 — 원작 애니(1기 13화)처럼: 거의 검은 보랏빛 허공에 마히토 자신의 손(모델에서 떼어 낸 손 · 아래팔째)이
//  · 한가운데: 손바닥을 맞대고 위아래로 깍지 낀 거대한 두 손 (앞에서 보면 엄지가 왼쪽) — 움직이지 않는다
//  · 그 둘레: 사방으로 뻗어 손가락을 꿈틀대는 손들
//  · 영역 겉 사방: 벽에서 안쪽으로 뻗은 손들 (손가락이 계속 움직인다, 아래팔은 벽 너머로 사라진다)
//  · 새장: 양 끝이 손뿐인 팔들이 이웃과 손가락을 엇갈려 자연스럽게 깍지 끼며, 대각선으로 기운 고리 여러 겹으로 영역을 공처럼 감싼다 (바닥 밑까지)
//  손목 · 팔꿈치의 잘린 끝은 다른 손 · 벽 · 팔 속에 묻혀 보이지 않게 둔다.
import * as THREE from 'three';
import { RiggedBody } from './rigged.js';
import { FingerRig } from './enemies.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

// 굽힘 단계 (엄지 · 검지 · 중지 · 약지 · 새끼): 펴짐 → 반쯤 → 깍지
const STAGES = [
  [0.02, 0.0, 0.02, 0.05, 0.08],
  [0.3, 0.4, 0.45, 0.5, 0.55],
  [0.55, 0.85, 0.9, 0.92, 0.92],
];

/**
 * 마히토 모델의 오른손(아래팔째)을 세 가지 굽힘으로 굽는다 — 정점 순서가 같아 셰이더에서 사이를 섞을 수 있다.
 *  손 좌표: 손목 = 원점, 손가락 = +Y, 손바닥이 보는 쪽 = +Z, 길이(손목→가운뎃손가락 끝) = 1
 *  반환: { geo(position=펴짐 · pMid · pClose · normal · nMid · nClose · aFinger), thumbX, elbowY, elbowR }
 */
let _set;
export function bakeHandSet() {
  if (_set !== undefined) return _set;
  _set = null;
  try {
    const body = new RiggedBody('mahito', { height: 1.8 }); // 숨긴 부품(칼날 팔 등 '-' 메시)은 빼고
    if (!body.ok) return _set;
    const fr = new FingerRig(body);
    const F = fr.hands.R;
    if (F.length < 4) return _set;
    body.model.updateMatrixWorld(true);
    const W = (b) => b.getWorldPosition(new THREE.Vector3());
    const wristB = F[2].bones[0].parent;
    const armB = wristB.parent?.isBone ? wristB.parent : wristB;
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
    const thumbX = W(F[0].bones[0]).sub(wrist).applyMatrix4(toHand).x;
    // 남길 뼈: 아래팔 · 손 · 손가락 / 손가락 번호
    const keep = new Set();
    armB.traverse((b) => b.isBone && keep.add(b));
    const fingerOf = new Map();
    F.forEach((fi, i) => fi.bones[0].traverse((b) => b.isBone && fingerOf.set(b, i)));
    // 메시마다 남길 삼각형 (한 번만)
    const parts = [];
    for (const o of body.meshes) {
      if (!o.isSkinnedMesh || !o.geometry.attributes.skinIndex || !o.visible || o.name.startsWith('-')) continue;
      const g = o.geometry;
      const si = g.attributes.skinIndex;
      const sw = g.attributes.skinWeight;
      const N = si.count;
      const best = new Int32Array(N);
      const ok = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        let bi = 0;
        let bw = -1;
        for (let c = 0; c < 4; c++) {
          const w = sw.getComponent(i, c);
          if (w > bw) {
            bw = w;
            bi = si.getComponent(i, c);
          }
        }
        best[i] = bi;
        ok[i] = keep.has(o.skeleton.bones[bi]) ? 1 : 0;
      }
      const src = g.index ? g.index.array : Array.from({ length: N }, (_, i) => i);
      const remap = new Int32Array(N).fill(-1);
      const verts = [];
      const ind = [];
      for (let t = 0; t < src.length; t += 3) {
        if (!(ok[src[t]] && ok[src[t + 1]] && ok[src[t + 2]])) continue;
        for (let k = 0; k < 3; k++) {
          const i = src[t + k];
          if (remap[i] < 0) {
            remap[i] = verts.length;
            verts.push(i);
          }
          ind.push(remap[i]);
        }
      }
      if (ind.length) parts.push({ o, verts, ind, finger: verts.map((i) => fingerOf.get(o.skeleton.bones[best[i]]) ?? 5) });
    }
    if (!parts.length) return _set;
    // 단계마다 정점 위치
    const v = new THREE.Vector3();
    const stagePos = STAGES.map((curls) => {
      fr.applyEach('R', curls);
      body.model.updateMatrixWorld(true);
      const out = [];
      for (const P of parts) {
        P.o.skeleton.update();
        for (const i of P.verts) {
          P.o.getVertexPosition(i, v);
          v.applyMatrix4(P.o.matrixWorld).sub(wrist).applyMatrix4(toHand).multiplyScalar(1 / len);
          out.push(v.x, v.y, v.z);
        }
      }
      return out;
    });
    // 이어 붙이기 + 같은 자리 정점 합치기 (펴진 손 기준)
    const index = [];
    const finger = [];
    let base = 0;
    for (const P of parts) {
      for (const i of P.ind) index.push(i + base);
      finger.push(...P.finger);
      base += P.verts.length;
    }
    const p0 = stagePos[0];
    const key = new Map();
    const re = new Int32Array(p0.length / 3);
    const keepV = [];
    for (let i = 0; i < re.length; i++) {
      const k = `${Math.round(p0[i * 3] * 3000)},${Math.round(p0[i * 3 + 1] * 3000)},${Math.round(p0[i * 3 + 2] * 3000)}`;
      let j = key.get(k);
      if (j === undefined) {
        j = keepV.length;
        key.set(k, j);
        keepV.push(i);
      }
      re[i] = j;
    }
    const idx2 = index.map((i) => re[i]);
    const pick = (arr) => {
      const o = new Float32Array(keepV.length * 3);
      keepV.forEach((i, j) => o.set([arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]], j * 3));
      return o;
    };
    const geo = new THREE.BufferGeometry();
    const normals = [];
    for (let s = 0; s < 3; s++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pick(stagePos[s]), 3));
      g.setIndex(idx2);
      g.computeVertexNormals();
      normals.push(g.attributes.normal);
      if (s === 0) geo.setAttribute('position', g.attributes.position);
      else geo.setAttribute(s === 1 ? 'pMid' : 'pClose', g.attributes.position);
    }
    geo.setAttribute('normal', normals[0]);
    geo.setAttribute('nMid', normals[1]);
    geo.setAttribute('nClose', normals[2]);
    geo.setAttribute('aFinger', new THREE.BufferAttribute(new Float32Array(keepV.map((i) => finger[i])), 1));
    geo.setIndex(idx2);
    geo.computeBoundingSphere();
    // 팔꿈치 쪽 잘린 끝: 높이 · 굵기
    const P0 = geo.attributes.position;
    let minY = 0;
    for (let i = 0; i < P0.count; i++) minY = Math.min(minY, P0.getY(i));
    let rs = 0;
    let rn = 0;
    for (let i = 0; i < P0.count; i++) {
      if (P0.getY(i) < minY + 0.06) {
        rs += Math.hypot(P0.getX(i), P0.getZ(i));
        rn++;
      }
    }
    _set = { geo, thumbX, elbowY: minY, elbowR: rn ? rs / rn : 0.06 };
  } catch (e) {
    console.warn('mahito hand bake', e);
    _set = null;
  }
  return _set;
}

/** 좌우 거울 (오른손 → 왼손): 위치 · 법선의 x 를 뒤집고 면 방향도 뒤집는다 */
function mirrorSet(S) {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(S.geo.attributes)) {
    const b = a.clone();
    if (a.itemSize === 3) for (let i = 0; i < b.count; i++) b.setX(i, -b.getX(i));
    g.setAttribute(k, b);
  }
  if (S.geo.index) {
    const idx = Array.from(S.geo.index.array);
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
  }
  g.computeBoundingSphere();
  return { ...S, geo: g, thumbX: -S.thumbX };
}

/** 모델이 없을 때: 둥근 손 + 아래팔 (굽힘 없음) */
function fallbackSet() {
  const parts = [];
  const cap = (r, l, x, y, z, rx = 0, rz = 0) => parts.push(new THREE.CapsuleGeometry(r, l, 4, 8).translate(0, l / 2 + r, 0).rotateX(rx).rotateZ(rz).translate(x, y, z));
  parts.push(new THREE.SphereGeometry(1, 14, 10).scale(0.24, 0.27, 0.08).translate(0, 0.27, 0));
  [-0.15, -0.05, 0.05, 0.15].forEach((x, i) => cap(0.045, [0.3, 0.36, 0.34, 0.27][i], x, 0.48, 0, 0.15));
  cap(0.05, 0.22, 0.2, 0.18, 0.04, 0.2, -0.8);
  parts.push(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 10).translate(0, -0.5, 0));
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of flat) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const g of flat) {
    pos.set(g.attributes.position.array, o);
    o += g.attributes.position.array.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  geo.setAttribute('pMid', geo.attributes.position);
  geo.setAttribute('pClose', geo.attributes.position);
  geo.setAttribute('nMid', geo.attributes.normal);
  geo.setAttribute('nClose', geo.attributes.normal);
  geo.setAttribute('aFinger', new THREE.BufferAttribute(new Float32Array(n).fill(5), 1));
  geo.computeBoundingSphere();
  return { geo, thumbX: 1, elbowY: -1.05, elbowR: 0.1 };
}

// 손가락 굽힘을 셰이더에서: 인스턴스마다 aAnim = (기본 굽힘, 흔들 폭, 위상)
const HAND_VERT_HEAD = /* glsl */ `
attribute vec3 pMid; attribute vec3 pClose; attribute vec3 nMid; attribute vec3 nClose; attribute float aFinger; attribute vec3 aAnim;
uniform float uHandT;
float handCurl() {
  float c = aAnim.x;
  if (aFinger < 4.5) c += aAnim.y * (0.6 * sin(uHandT * (1.3 + 0.27 * aFinger) + aAnim.z + aFinger * 1.17) + 0.4 * sin(uHandT * 2.9 + aAnim.z * 2.0 + aFinger * 2.3));
  return clamp(c, 0.0, 1.0);
}
vec3 handMix(vec3 a, vec3 b, vec3 c, float k) { return k < 0.5 ? mix(a, b, k * 2.0) : mix(b, c, k * 2.0 - 1.0); }`;

// 셀 그늘: 밝은 연보라 · 짙은 청보라 두 단 (원작 영역 속 손처럼)
let _grad = null;
function toonGrad() {
  if (_grad) return _grad;
  _grad = new THREE.DataTexture(new Uint8Array([60, 60, 60, 255, 125, 125, 125, 255, 205, 205, 205, 255]), 3, 1);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
  _grad.needsUpdate = true;
  return _grad;
}
function handMaterials(T) {
  const skin = new THREE.MeshToonMaterial({ color: 0xc8bcff, emissive: 0x1a1048, emissiveIntensity: 0.6, gradientMap: toonGrad() });
  skin.onBeforeCompile = (sh) => {
    sh.uniforms.uHandT = T;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + HAND_VERT_HEAD)
      .replace('#include <beginnormal_vertex>', 'float hc = handCurl();\nvec3 objectNormal = normalize(handMix(normal, nMid, nClose, hc));')
      .replace('#include <begin_vertex>', 'vec3 transformed = handMix(position, pMid, pClose, hc);');
  };
  skin.customProgramCacheKey = () => 'mahitoHand';
  const line = new THREE.MeshBasicMaterial({ color: 0x0b0616, side: THREE.BackSide });
  line.onBeforeCompile = (sh) => {
    sh.uniforms.uHandT = T;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + HAND_VERT_HEAD)
      .replace('#include <begin_vertex>', 'float hc = handCurl();\nvec3 transformed = handMix(position, pMid, pClose, hc) + normalize(handMix(normal, nMid, nClose, hc)) * 0.011;');
  };
  line.customProgramCacheKey = () => 'mahitoHandLine';
  return { skin, line };
}

/** 손 무리 하나 (같은 기하 · 인스턴스마다 자리와 굽힘) */
class HandGroup {
  constructor(set, items, mats, { outline = true } = {}) {
    this.items = items;
    const n = Math.max(1, items.length);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    items.forEach((it, i) => anim.setXYZ(i, it.curl ?? 0.2, it.amp ?? 0, it.ph ?? Math.random() * 6.28));
    const geo = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(set.geo.attributes)) geo.setAttribute(k, a);
    if (set.geo.index) geo.setIndex(set.geo.index);
    geo.setAttribute('aAnim', anim);
    geo.boundingSphere = set.geo.boundingSphere;
    this.geo = geo;
    this.mesh = new THREE.InstancedMesh(geo, mats.skin, n);
    this.mesh.frustumCulled = false;
    this.line = outline ? new THREE.InstancedMesh(geo, mats.line, n) : null;
    if (this.line) this.line.frustumCulled = false;
  }
  add(parent) {
    parent.add(this.mesh);
    if (this.line) parent.add(this.line);
  }
  set(i, m) {
    this.mesh.setMatrixAt(i, m);
    this.line?.setMatrixAt(i, m);
  }
  flush() {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.line) this.line.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.mesh.dispose();
    this.line?.dispose();
  }
}

/** fingers(+Y) · palm(+Z) 방향으로 손 좌표를 세우는 회전 */
function look(fingers, palm) {
  const yv = fingers.clone().normalize();
  const zv = palm.clone().addScaledVector(yv, -palm.dot(yv)).normalize();
  const xv = new THREE.Vector3().crossVectors(yv, zv);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xv, yv, zv));
}

export class HandMaw {
  /** R: 영역(벽) 반지름(m) */
  constructor(R) {
    this.R = R;
    this.t = 0;
    this.T = { value: 0 };
    this.group = new THREE.Group(); // 영역 중심
    this.cluster = new THREE.Group(); // 가운데 손 무더기 (가장자리 쪽에 세운다, +Z 가 영역 가운데 쪽)
    this.group.add(this.cluster);
    const set = bakeHandSet() ?? fallbackSet();
    const mir = mirrorSet(set);
    this.mats = handMaterials(this.T);
    const FA = -set.elbowY; // 아래팔 길이 (손 길이 단위)

    // ── 1) 한가운데: 손바닥을 위아래로 맞댄 거대한 두 손 (움직이지 않는다) — 원작처럼 주먹 쥔 듯 앞(영역 가운데)을 향한다
    //  위 손: 손바닥이 아래 · 손가락이 앞쪽으로 뻗어 아래로 감긴다 / 아래 손: 손바닥이 위 · 손가락이 위로 감긴다
    //  아래팔은 뒤(무더기 속)로 들어가 보이지 않는다. 앞에서 볼 때 두 엄지가 모두 왼쪽에 오게 손마다 오른손/왼손을 고른다
    const C0 = new THREE.Vector3(0, R * 0.4, 0);
    this.C0 = C0;
    const big = R * 0.3;
    const thumbLeft = (fingers, palm) => {
      // 손 좌표 +X 가 화면(앞에서 본) 오른쪽(+X)으로 가는지
      const xv = new THREE.Vector3().crossVectors(fingers.clone().normalize(), palm.clone().normalize());
      const right = xv.x > 0;
      return (set.thumbX > 0) === right ? mir : set;
    };
    const upF = new THREE.Vector3(0, -0.15, 1);
    const upP = new THREE.Vector3(0, -1, 0.1);
    const loF = new THREE.Vector3(0, 0.15, 1);
    const loP = new THREE.Vector3(0, 1, 0.1);
    this.pairs = [
      new HandGroup(thumbLeft(upF, upP), [{ pos: C0.clone().add(new THREE.Vector3(0, big * 0.1, -big * 0.05)), quat: look(upF, upP), s: big, curl: 0.8, amp: 0, delay: 0 }], this.mats),
      new HandGroup(thumbLeft(loF, loP), [{ pos: C0.clone().add(new THREE.Vector3(0, -big * 0.1, -big * 0.05)), quat: look(loF, loP), s: big, curl: 0.8, amp: 0, delay: 0.04 }], this.mats),
    ];
    for (const G of this.pairs) G.add(this.cluster);

    // ── 2) 둘레: 사방으로 뻗어 손가락을 꿈틀대는 손 (아래팔은 무더기 안쪽 · 뒤로 묻힌다) ──
    const ring = [];
    const addRing = (n, beta0, beta1, back, s0, s1) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd(-0.15, 0.15);
        const b = rnd(beta0, beta1);
        const d = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.sin(b) * Math.sin(a), Math.cos(b)).normalize();
        const s = big * rnd(s0, s1);
        const pos = C0.clone().addScaledVector(d, big * 0.5).add(new THREE.Vector3(0, 0, -back * big));
        const palm = new THREE.Vector3(0, 0, 1).addScaledVector(d, -0.4).add(new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.3, 0.3), 0));
        ring.push({ pos, quat: look(d, palm), s, curl: rnd(0.1, 0.35), amp: rnd(0.22, 0.38), delay: 0.1 + Math.random() * 0.25 });
      }
    };
    addRing(16, 0.95, 1.3, 0.4, 0.55, 0.75);
    addRing(14, 1.25, 1.65, 0.7, 0.7, 0.95);
    this.ring = new HandGroup(set, ring, this.mats);
    this.ring.add(this.cluster);

    // ── 3) 영역 겉 사방: 벽에서 안쪽으로 뻗은 손 (손가락이 계속 움직인다 · 아래팔은 벽 너머로) ──
    const shell = [];
    const NS = 54;
    for (let i = 0; i < NS; i++) {
      const y = 1 - ((i + 0.5) / NS) * 1.75; // 위 → 바닥 밑 조금
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * 2.39996;
      const u = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
      const sHand = R * rnd(0.1, 0.13);
      const pos = u.clone().multiplyScalar(R * 0.98 - sHand * 0.85);
      const inward = u.clone().negate().add(new THREE.Vector3(rnd(-0.35, 0.35), rnd(-0.35, 0.35), rnd(-0.35, 0.35))).normalize();
      const palm = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
      shell.push({ pos, quat: look(inward, palm), s: sHand, curl: rnd(0.05, 0.3), amp: rnd(0.25, 0.42), delay: 0.25 + (1 - y) * 0.15 });
    }
    this.shell = new HandGroup(set, shell, this.mats, { outline: false });
    this.shell.add(this.group);

    // ── 4) 새장: 대각선으로 기운 큰 고리들 — 이음매마다 양쪽 팔의 손이 손가락을 엇갈려 깍지 낀다 (움직이지 않는다) ──
    const HL = R * 0.065; // 손 길이(m)
    const reach = (0.42 + FA) * HL; // 이음매 → 팔꿈치
    const clasp = [];
    this.bridges = [];
    const NC = 6;
    for (let k = 0; k < NC; k++) {
      const az = (k / NC) * Math.PI * 2;
      const tilt = 0.78; // 약 45°
      const nrm = new THREE.Vector3(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)).normalize();
      const e1 = new THREE.Vector3().crossVectors(nrm, Y).normalize();
      const e2 = new THREE.Vector3().crossVectors(nrm, e1).normalize();
      const Rc = R * 0.78 + (k % 2 ? 0.35 : -0.35) * (1 + k * 0.15); // 고리끼리 엇갈리는 곳에서 부딪치지 않게
      const L = 2 * Math.PI * Rc;
      const nJ = Math.max(6, Math.round(L / (2 * reach + HL * 1.6)));
      const P = (t) => new THREE.Vector3().addScaledVector(e1, Math.cos(t * Math.PI * 2) * Rc).addScaledVector(e2, Math.sin(t * Math.PI * 2) * Rc);
      const joints = [];
      for (let j = 0; j < nJ; j++) {
        const t = (j + k * 0.37) / nJ;
        const p = P(t);
        const tan = P(t + 0.001).sub(P(t - 0.001)).normalize();
        const radial = p.clone().normalize();
        const side = new THREE.Vector3().crossVectors(tan, radial).normalize();
        const delay = 0.3 + (p.y / Rc + 1) * 0.25;
        // 깍지: 손바닥끼리 맞대고(옆을 보게), 한 손은 손가락 반 마디만큼 비껴 손가락이 서로 사이로 들어가 상대 손등을 감는다
        const off = 0.06 * HL;
        const wa = p.clone().addScaledVector(tan, -0.4 * HL).addScaledVector(side, -off);
        const wb = p.clone().addScaledVector(tan, 0.4 * HL).addScaledVector(side, off).addScaledVector(radial, 0.052 * HL);
        clasp.push({ pos: wa, quat: look(tan, side), s: HL, curl: 0.92, amp: 0, delay });
        clasp.push({ pos: wb, quat: look(tan.clone().negate(), side.clone().negate()), s: HL, curl: 0.92, amp: 0, delay });
        joints.push({ p, delay, ea: wa.clone().addScaledVector(tan, -FA * HL), eb: wb.clone().addScaledVector(tan, FA * HL) });
      }
      // 팔: 앞 이음매 손의 팔꿈치 → 다음 이음매 손의 팔꿈치 (아래팔 둘이 이어진, 양 끝이 손뿐인 팔)
      for (let j = 0; j < joints.length; j++) {
        const A = joints[j];
        const B = joints[(j + 1) % joints.length];
        this.bridges.push({ a: A.eb, b: B.ea, delay: Math.max(A.delay, B.delay), r: set.elbowR * HL * 1.05 });
      }
    }
    this.cage = new HandGroup(set, clasp, this.mats, { outline: false });
    this.cage.add(this.group);
    const prof = [[0.0, -0.06], [0.9, -0.06], [1.0, 0.1], [1.12, 0.5], [1.0, 0.9], [0.9, 1.06], [0.0, 1.06]].map(([r, y]) => new THREE.Vector2(r, y));
    const brGeo = new THREE.LatheGeometry(prof, 10);
    brGeo.deleteAttribute('uv');
    this.armMat = new THREE.MeshToonMaterial({ color: 0xc8bcff, emissive: 0x1a1048, emissiveIntensity: 0.6, gradientMap: toonGrad() });
    this.armMesh = new THREE.InstancedMesh(brGeo, this.armMat, Math.max(1, this.bridges.length));
    this.armMesh.frustumCulled = false;
    this.group.add(this.armMesh);
    this.update(0, 0);
  }

  /** 손 무더기를 둘 자리: 영역 중심 기준 위치와, 앞(+Z)이 향할 방향 */
  place(pos, yaw) {
    this.cluster.position.copy(pos);
    this.cluster.rotation.y = yaw;
  }

  _put(G, open, span, bloomFrom) {
    G.items.forEach((it, i) => {
      const k = THREE.MathUtils.clamp((open - it.delay) / span, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      if (bloomFrom) _p.lerpVectors(bloomFrom, it.pos, e);
      else _p.copy(it.pos);
      _m.compose(_p, it.quat, _s.setScalar(Math.max(0.0001, it.s * (bloomFrom ? 0.15 + 0.85 * e : e))));
      G.set(i, _m);
    });
    G.flush();
  }

  update(dt, open) {
    this.t += dt;
    this.T.value = this.t;
    for (const G of this.pairs) this._put(G, open, 0.45, this.C0);
    this._put(this.ring, open, 0.5, this.C0);
    this._put(this.shell, open, 0.45, null);
    this._put(this.cage, open, 0.3, null);
    this.bridges.forEach((A, i) => {
      const k = THREE.MathUtils.clamp((open - A.delay) / 0.3, 0, 1);
      const d = _a.subVectors(A.b, A.a);
      const L = d.length();
      _q.setFromUnitVectors(Y, d.normalize());
      const r = Math.max(0.0001, A.r * k);
      _m.compose(A.a, _q, _s.set(r, Math.max(0.0001, L * k), r));
      this.armMesh.setMatrixAt(i, _m);
    });
    this.armMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const G of [...this.pairs, this.ring, this.shell, this.cage]) G.dispose();
    this.armMesh.geometry.dispose();
    this.armMesh.dispose();
    this.armMat.dispose();
    this.mats.skin.dispose();
    this.mats.line.dispose();
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
