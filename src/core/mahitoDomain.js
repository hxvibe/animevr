// 「自閉円頓裹」의 손 구조물 — 밤하늘 같은 남색 허공에, 셀 수 없는 창백한 손이 엮여 거대한 입(아가리)을 이룬다.
//  펼쳐질 때: 가운데의 손 모양(마름모 인)이 꽃처럼 피어 손들이 사방으로 흩어지며 제자리에 박힌다.
//  안: 머리 위를 덮은 손 지붕 · 이빨처럼 아래로 뻗은 손가락 고리 · 바깥으로 길게 뻗어 꿈틀대는 팔들.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** 손 하나 (손가락이 +Y, 손바닥이 +Z 를 본다). 각진 마디로 — 크기 1 ≈ 손 길이 1.9 */
let _handGeo = null;
function handGeometry() {
  if (_handGeo) return _handGeo;
  const parts = [];
  const box = (w, h, d, x, y, z, rx = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    g.rotateX(rx);
    g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
  };
  box(0.9, 0.95, 0.26, 0, -0.1, 0); // 손바닥
  box(0.8, 0.35, 0.3, 0, -0.42, 0); // 손목
  const fx = [-0.33, -0.11, 0.11, 0.33];
  const fl = [0.55, 0.68, 0.64, 0.5];
  fx.forEach((x, i) => {
    const L = fl[i];
    box(0.19, L * 0.55, 0.2, x, 0.85, 0, 0.12);
    // 끝마디: 살짝 안으로 굽는다
    const g = new THREE.BoxGeometry(0.17, L * 0.5, 0.18);
    g.translate(0, L * 0.25, 0);
    g.rotateX(0.35);
    g.translate(x, 0.85 + L * 0.54, 0.06);
    parts.push(g);
  });
  box(0.22, 0.5, 0.22, -0.48, 0.0, 0.08, 0.2, 0.75); // 엄지
  _handGeo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  _handGeo.computeVertexNormals();
  return _handGeo;
}

export const HAND_SKIN = 0xd4d2fa;

export class HandMaw {
  /**
   * @param R 영역 반지름(m)
   * @param o { seed }
   */
  constructor(R, o = {}) {
    this.R = R;
    this.group = new THREE.Group();
    this.t = 0;
    this.open = 0;
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0, emissive: 0x14164a, emissiveIntensity: 0.35, flatShading: true });
    this.mat.userData.shared = false;
    const items = [];
    const add = (pos, quat, scale, kind = 0) => items.push({ pos: pos.clone(), quat: quat.clone(), s: scale, kind, delay: rnd(0, 0.55), ph: Math.random() * 6.28, wob: rnd(0.02, 0.07) });
    const look = (pos, fingers, palm) => {
      // fingers 방향을 +Y, palm 방향을 +Z 로
      const yv = fingers.clone().normalize();
      const zv = palm.clone().addScaledVector(yv, -palm.dot(yv)).normalize();
      const xv = new THREE.Vector3().crossVectors(yv, zv);
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xv, yv, zv));
    };
    // 구조물은 영역 가장자리 쪽(+Z 로 입을 벌린 채)에 우뚝 선다 — 그 앞의 것은 아가리 속에 든 셈
    const C0 = new THREE.Vector3(0, R * 0.42, 0);
    const RX = R * 0.3;
    const RY = R * 0.3;
    const RZ = R * 0.2;
    // 1) 머리: 손바닥이 겹겹이 붙은 덩어리 (뒤 · 위 · 옆)
    for (let i = 0; i < 70; i++) {
      // 피보나치 구면 — 앞(입) 쪽은 비운다
      const y = 1 - (i + 0.5) / 70 * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.39996;
      const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
      if (d.z > 0.35 && Math.abs(d.y) < 0.55) continue; // 아가리
      const pos = new THREE.Vector3(d.x * RX, d.y * RY, d.z * RZ).add(C0);
      const tang = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y);
      add(pos, look(pos, tang.lengthSq() > 0.01 ? tang : new THREE.Vector3(1, 0, 0), d), rnd(1.3, 1.8));
    }
    // 2) 이빨: 윗니는 손가락을 아래로, 아랫니는 위로 — 활처럼 휜 줄
    const nT = 9;
    for (let i = 0; i < nT; i++) {
      const u = (i / (nT - 1)) * 2 - 1;
      const x = u * RX * 0.85;
      const bow = 1 - u * u;
      const top = new THREE.Vector3(x, C0.y + RY * (0.45 - 0.15 * bow), RZ * (0.75 + 0.25 * bow));
      add(top, look(top, new THREE.Vector3(0, -1, 0.25), new THREE.Vector3(0, -0.3, 1)), rnd(0.95, 1.2), 1);
      const bot = new THREE.Vector3(x * 0.92, C0.y - RY * (0.5 - 0.12 * bow), RZ * (0.7 + 0.25 * bow));
      add(bot, look(bot, new THREE.Vector3(0, 1, 0.25), new THREE.Vector3(0, 0.3, 1)), rnd(0.9, 1.1), 1);
    }
    // 3) 양옆으로 활짝 핀 손 부채 (나비 날개처럼)
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 15 - 0.5) * 2.4;
        const out = new THREE.Vector3(sx * Math.cos(a), Math.sin(a), -0.15).normalize();
        const ring = i % 2 ? 1.0 : 1.35;
        const pos = C0.clone().addScaledVector(out, RX * ring).add(new THREE.Vector3(0, 0, -RZ * 0.3));
        add(pos, look(pos, out, new THREE.Vector3(0, 0, 1)), rnd(1.3, 1.9), 2);
      }
    }
    // 4) 정수리에 꽃처럼 핀 손
    for (let i = 0; i < 12; i++) {
      const az = (i / 12) * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(az) * 0.6, 1, Math.sin(az) * 0.6).normalize();
      const pos = C0.clone().add(new THREE.Vector3(0, RY * 1.05, 0)).addScaledVector(out, 0.8);
      add(pos, look(pos, out, new THREE.Vector3(Math.cos(az), 0, Math.sin(az))), rnd(1.1, 1.5), 2);
    }
    this.items = items;
    // 목구멍: 손 틈새로 보이는 어두운 안쪽
    this.throat = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x080a2a }));
    this.throat.position.copy(C0);
    this.throatS = new THREE.Vector3(RX * 0.8, RY * 0.75, RZ * 0.75);
    this.throat.scale.setScalar(0.001);
    this.group.add(this.throat);
    this.hands = new THREE.InstancedMesh(handGeometry(), this.mat, items.length + 14);
    this.hands.frustumCulled = false;
    this.hands.castShadow = false;
    this.group.add(this.hands);
    // 4) 뻗은 팔: 지붕 가장자리에서 바깥·아래로 길게 뻗어 꿈틀대는 팔 (마디 + 끝의 손)
    this.arms = [];
    const nA = 14;
    const SEG = 9;
    this.C0 = C0;
    this.armMat = this.mat;
    this.segs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.16, 1, 6).translate(0, 0.5, 0), this.mat, nA * SEG);
    this.segs.frustumCulled = false;
    this.group.add(this.segs);
    for (let i = 0; i < nA; i++) {
      // 머리에서 앞 · 옆 · 위로 길게 뻗는다 (뒤로는 안 뻗는다)
      const az = -Math.PI * 0.1 + (i / (nA - 1)) * Math.PI * 1.2;
      const el = rnd(-0.35, 0.7);
      const out = new THREE.Vector3(Math.cos(az), el, Math.sin(az)).normalize();
      const base = C0.clone().add(new THREE.Vector3(out.x * RX * 0.8, out.y * RY * 0.8, out.z * RZ * 0.8));
      this.arms.push({ base, out, len: R * rnd(0.35, 0.6), ph: Math.random() * 6.28, side: new THREE.Vector3().crossVectors(out, Y).normalize(), hand: items.length + i });
    }
    this.SEG = SEG;
    this.center = C0.clone(); // 손 모양(마름모 인)이 맺히는 곳 → 여기서 꽃처럼 피어난다
    // 손마다 살짝 다른 살빛 (깊이감)
    const col = new THREE.Color();
    for (let i = 0; i < this.hands.count; i++) this.hands.setColorAt(i, col.setHSL(0.68 + rnd(-0.02, 0.02), rnd(0.35, 0.6), rnd(0.72, 0.86)));
    for (let i = 0; i < this.segs.count; i++) this.segs.setColorAt(i, col.setHSL(0.68, 0.45, rnd(0.7, 0.8)));
    this.update(0, 0);
  }

  /** open: 0 → 1 펼쳐짐 (1 이상이면 다 펼쳐진 뒤의 시간) */
  update(dt, open) {
    this.t += dt;
    const t = this.t;
    const R = this.R;
    // 펼침: 가운데에서 꽃처럼 피어 흩어진다 (조금씩 늦게 도착)
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const k = THREE.MathUtils.clamp((open - it.delay * 0.6) / 0.45, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      // 흩어지는 길: 가운데 → 바깥으로 부풀며
      _p.lerpVectors(this.center, it.pos, e);
      _p.addScaledVector(_b.subVectors(it.pos, this.center).normalize(), Math.sin(e * Math.PI) * R * 0.08);
      // 숨 쉬듯 꿈틀
      const w = Math.sin(t * 1.3 + it.ph) * it.wob;
      _e.set(w, Math.sin(t * 0.9 + it.ph) * it.wob, w * 0.5);
      _q.copy(it.quat).multiply(_q2.setFromEuler(_e));
      if (k < 1) _q.slerp(_q2.setFromAxisAngle(Y, it.ph).multiply(new THREE.Quaternion().setFromAxisAngle(Z, it.ph)), (1 - e) * 0.6);
      const sc = it.s * (0.15 + 0.85 * e);
      _m.compose(_p, _q, _s.setScalar(sc));
      this.hands.setMatrixAt(i, _m);
    }
    // 팔: 기둥 마디를 이어 붙인다
    const SEG = this.SEG;
    const ak = THREE.MathUtils.clamp((open - 0.45) / 0.5, 0, 1);
    this.arms.forEach((A, ai) => {
      const L = A.len * (1 - Math.pow(1 - ak, 2));
      _a.copy(A.base);
      for (let s = 0; s < SEG; s++) {
        const u = (s + 1) / SEG;
        _b.copy(A.base).addScaledVector(A.out, L * u)
          .addScaledVector(A.side, Math.sin(t * 1.4 + A.ph + u * 3.5) * u * R * 0.05)
          .add(_p.set(0, Math.sin(t * 1.1 + A.ph * 2 + u * 2.5) * u * R * 0.04 - u * u * R * 0.05, 0));
        const d = _p.subVectors(_b, _a);
        const len = Math.max(0.001, d.length());
        _q.setFromUnitVectors(Y, d.normalize());
        _m.compose(_a, _q, _s.set(1.3 - u * 0.4, len, 1.3 - u * 0.4).multiplyScalar(ak > 0 ? 1 : 0.0001));
        this.segs.setMatrixAt(ai * SEG + s, _m);
        _a.copy(_b);
      }
      // 끝의 손: 무언가를 움켜쥐려는 듯
      _q.setFromUnitVectors(Y, _p.subVectors(_b, A.base).normalize());
      _q.multiply(_q2.setFromAxisAngle(Y, Math.sin(t * 2 + A.ph) * 0.6));
      _m.compose(_a, _q, _s.setScalar(Math.max(0.0001, 0.9 * ak)));
      this.hands.setMatrixAt(A.hand, _m);
    });
    const tk = THREE.MathUtils.clamp((open - 0.3) / 0.5, 0, 1);
    this.throat.scale.copy(this.throatS).multiplyScalar(Math.max(0.001, tk));
    this.hands.instanceMatrix.needsUpdate = true;
    this.segs.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.hands.dispose();
    this.segs.geometry.dispose();
    this.segs.dispose();
    this.mat.dispose();
    this.throat.geometry.dispose();
    this.throat.material.dispose();
  }
}

// 남색 밤하늘 허공 (벽) · 연보랏빛 손 무늬 바닥 — GLSL 조각 (dh/dn/dfbm 필요)
export const VOID_WALL = /* glsl */ `
vec3 mahitoVoid(vec3 d, float t) {
  vec3 top = vec3(0.02, 0.03, 0.16);
  vec3 hor = vec3(0.05, 0.06, 0.32);
  vec3 c = mix(hor, top, smoothstep(-0.1, 0.8, d.y));
  c += vec3(0.08, 0.06, 0.22) * dfbm(d * 3.0 + vec3(0.0, t * 0.02, 0.0)) * 0.6;
  vec3 g = floor(d * 170.0);
  float star = step(0.9972, dh(g));
  c += vec3(0.85, 0.88, 1.0) * star * (0.55 + 0.45 * sin(t * 2.5 + dh(g) * 40.0));
  return c;
}`;
