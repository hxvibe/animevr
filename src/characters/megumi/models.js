// 식신 GLB 모델 (스키닝) 불러오기 · 복제 · 뼈 조종
// 모델은 모두 +Z가 앞, +Y가 위, 바닥이 y=0 이고 애니메이션이 없다 → 뼈를 코드로 움직인다
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel, getModel } from '../../core/assets.js';

// 키 → { 파일, 원본 높이(바인드 자세 기준 m) }
export const SHIKI_MODELS = {
  dogWhite: { file: 'shiki_dog_white', h: 2.443 },
  dogBlack: { file: 'shiki_dog_black', h: 2.443 },
  nue: { file: 'shiki_nue', h: 1.395 },
  toad: { file: 'shiki_toad', h: 1.904 },
  serpent: { file: 'shiki_serpent', h: 0.614 },
  elephant: { file: 'shiki_elephant', h: 3.32 },
  rabbit: { file: 'shiki_rabbit', h: 1.585 },
  mahoraga: { file: 'shiki_mahoraga', h: 3.781 },
  ox: { file: 'shiki_ox', h: 1.501 },
  dogTotality: { file: 'shiki_dog_totality', h: 2.211 },
};

export function preloadShikigami() {
  return Promise.all(Object.values(SHIKI_MODELS).map((m) => loadModel(m.file)));
}

let _grad = null;
function gradient() {
  if (_grad) return _grad;
  const t = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  _grad = t;
  return t;
}

// 스키닝을 따라가는 먹선 (뒷면을 법선 방향으로 부풀림)
const outlineVert = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uT;
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * uT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}`;
const outlineFrag = 'void main(){ gl_FragColor = vec4(0.02, 0.015, 0.025, 1.0); }';

const _toonCache = new Map();
function toonOf(src) {
  if (_toonCache.has(src)) return _toonCache.get(src);
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, map: src.map ?? null, gradientMap: gradient() });
  if (!src.map && src.color) m.color.copy(src.color);
  m.userData.shared = true;
  _toonCache.set(src, m);
  return m;
}

/**
 * 모델 하나를 복제해 높이를 맞춘다. 아직 안 불러왔으면 null
 * @returns {{ root: THREE.Group, model: THREE.Object3D, rig: BoneRig, scale: number, meshes: THREE.SkinnedMesh[] }}
 */
export function makeShiki(key, height, { outline = 0.012, toonShade = true, skip = [] } = {}) {
  const def = SHIKI_MODELS[key];
  const src = def && getModel(def.file);
  if (!src) return null;
  const model = skClone(src);
  const root = new THREE.Group();
  const S = height / def.h;
  root.add(model);
  model.scale.setScalar(S);
  const meshes = [];
  const outlines = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // 뼈를 움직이면 경계 상자가 맞지 않는다
    if (toonShade) o.material = toonOf(o.material);
    o.castShadow = true;
    meshes.push(o);
  });
  if (outline > 0) {
    const mat = new THREE.ShaderMaterial({ uniforms: { uT: { value: outline / S } }, vertexShader: outlineVert, fragmentShader: outlineFrag, side: THREE.BackSide });
    for (const o of meshes) {
      if (!o.isSkinnedMesh || skip.some((s) => o.name.includes(s))) continue;
      const ol = new THREE.SkinnedMesh(o.geometry, mat);
      ol.bind(o.skeleton, o.bindMatrix);
      ol.frustumCulled = false;
      o.parent.add(ol);
      ol.position.copy(o.position);
      ol.quaternion.copy(o.quaternion);
      ol.scale.copy(o.scale);
      outlines.push(ol);
    }
  }
  root.updateMatrixWorld(true);
  return { root, model, rig: new BoneRig(model), scale: S, meshes, outlines };
}

const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _mi = new THREE.Matrix4();

/**
 * 뼈 조종: rot(이름, 모델 공간 축, 각도). 매 프레임 begin() 으로 쉬는 자세에서 다시 시작한다.
 * 축은 부모 뼈의 바인드 공간으로 옮겨 돌린다 (좌우 반전된 뼈도 같은 방향으로 돈다).
 * 같은 뼈에 여러 번 부르면 부른 순서대로 쌓인다 (먼저 부른 회전이 먼저 적용)
 */
export class BoneRig {
  constructor(model) {
    this.model = model;
    this.bones = {};
    this.rest = new Map();
    this.pInv = new Map(); // 부모의 모델 공간 행렬의 역
    this.pSign = new Map(); // 부모가 거울 반전이면 -1
    this.bindW = new Map(); // 모델 공간에서의 바인드 회전 (오로치처럼 월드 행렬을 직접 쓸 때)
    model.updateMatrixWorld(true);
    _mi.copy(model.matrixWorld).invert();
    const qm = model.getWorldQuaternion(new THREE.Quaternion()).invert();
    model.traverse((o) => {
      if (!o.isBone) return;
      this.bones[o.name] = o;
      this.rest.set(o, { q: o.quaternion.clone(), p: o.position.clone(), s: o.scale.clone() });
      const pm = new THREE.Matrix4().multiplyMatrices(_mi, o.parent.matrixWorld);
      this.pSign.set(o, pm.determinant() < 0 ? -1 : 1);
      this.pInv.set(o, pm.invert());
      this.bindW.set(o, qm.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion())));
    });
    this.touched = new Set();
  }

  get(name) {
    return this.bones[name] ?? null;
  }

  begin() {
    for (const b of this.touched) {
      const r = this.rest.get(b);
      b.quaternion.copy(r.q);
      b.position.copy(r.p);
      b.scale.copy(r.s);
    }
    this.touched.clear();
  }

  rot(name, axis, angle) {
    const b = this.bones[name];
    if (!b || !angle) return;
    _a.copy(axis).transformDirection(this.pInv.get(b));
    _q.setFromAxisAngle(_a, angle * this.pSign.get(b));
    b.quaternion.premultiply(_q);
    this.touched.add(b);
  }

  scale(name, s) {
    const b = this.bones[name];
    if (!b) return;
    b.scale.setScalar(s);
    this.touched.add(b);
  }

  /** 뼈의 월드 위치 */
  pos(name, out = new THREE.Vector3()) {
    const b = this.bones[name];
    return b ? b.getWorldPosition(out) : null;
  }
}

export const AX = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };

// ───────────────── 네발짐승 걸음새 ─────────────────
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (s) => s * s * (3 - 2 * s);
// 다리별 위상 (0~1): 걷기 = 뒷다리→같은 쪽 앞다리 순 (측대 순서), 속보 = 대각선 짝, 질주 = 회전 갤럽
const GAITS = {
  walk: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75, duty: 0.64 },
  trot: { LF: 0, RH: 0, RF: 0.5, LH: 0.5, duty: 0.44 },
  gallop: { LH: 0, RH: 0.1, RF: 0.45, LF: 0.57, duty: 0.3 },
};

function legAngles(p, duty, A) {
  // 지지(stance): 앞(+A)에서 뒤(-A)로 밀어낸다 / 들기(swing): 들어 올려 앞으로 휘두른다
  if (p < duty) {
    const s = p / duty;
    return { fw: A * (1 - 2 * s), lift: 0, load: Math.sin(s * Math.PI) };
  }
  const s = (p - duty) / (1 - duty);
  return { fw: -A + 2 * A * ease(s), lift: Math.sin(s * Math.PI), load: 0 };
}

/**
 * N: { LF, RF, LH, RH: { upper, lower, foot }, spine: [..], neck, head, tail: [..] }
 * g: 유지 상태 { phase }. 반환: 몸통 흔들림 { bob, pitch }
 */
export function quadGait(R, N, g, dt, { speed = 0, stride = 1.2, gallopAt = 4.5, trotAt = 1.6, legLift = 1, strideMax = 0.8, maxFreq = 3.4 } = {}) {
  g.phase ??= 0;
  g.w ??= { walk: 1, trot: 0, gallop: 0 };
  // 속도에 따라 걸음새를 부드럽게 바꾼다
  const want = speed < trotAt ? 'walk' : speed < gallopAt ? 'trot' : 'gallop';
  for (const k in g.w) g.w[k] += ((k === want ? 1 : 0) - g.w[k]) * Math.min(1, dt * 4);
  const moving = speed > 0.08;
  // 보폭은 속도와 함께 늘고, 걸음 빈도는 보폭으로 나눈 값
  const L = stride * (0.7 + Math.min(1.6, speed * 0.22));
  const freq = moving ? Math.min(maxFreq, Math.max(0.7, speed / L)) : 0;
  g.phase = (g.phase + dt * freq) % 1;
  g.amp = (g.amp ?? 0) + ((moving ? Math.min(strideMax, 0.22 + speed * 0.09) : 0) - (g.amp ?? 0)) * Math.min(1, dt * 6);
  const A = g.amp;
  const out = { bob: 0, pitch: 0, flex: 0 };
  for (const leg of ['LF', 'RF', 'LH', 'RH']) {
    const n = N[leg];
    if (!n) continue;
    let fw = 0;
    let lift = 0;
    let load = 0;
    for (const k in GAITS) {
      const w = g.w[k];
      if (w < 0.01) continue;
      const G = GAITS[k];
      const a = legAngles((g.phase + G[leg]) % 1, G.duty, A);
      fw += a.fw * w;
      lift += a.lift * w;
      load += a.load * w;
    }
    const front = leg[1] === 'F';
    const ll = lift * legLift * Math.min(1, A * 2.2);
    R.rot(n.upper, AX.X, -fw);
    if (front) {
      // 앞다리: 들 때 팔꿈치·발목을 뒤로 접는다
      R.rot(n.lower, AX.X, ll * 0.6 + load * 0.05);
      R.rot(n.foot, AX.X, ll * 1.1);
    } else {
      // 뒷다리: 무릎은 앞으로, 비절(뒤꿈치)은 뒤로 접혀 발을 끌어올린다
      R.rot(n.lower, AX.X, ll * 0.7 + load * 0.08);
      R.rot(n.foot, AX.X, -ll * 0.75);
    }
  }
  const ph = g.phase * Math.PI * 2;
  // 걷기·속보는 한 주기에 두 번 오르내리고, 질주는 한 번 크게 흔들며 등을 굽혔다 편다
  out.bob = moving ? (-Math.cos(ph * 2) * 0.018 * (g.w.walk + g.w.trot * 1.6) + Math.sin(ph) * 0.06 * g.w.gallop) * Math.min(1.5, speed * 0.4) : 0;
  out.pitch = moving ? Math.sin(ph) * 0.07 * g.w.gallop : 0;
  out.flex = moving ? Math.sin(ph + 0.6) * 0.16 * g.w.gallop : 0;
  if (N.spine) N.spine.forEach((s, i) => R.rot(s, AX.X, out.flex * (i ? -0.6 : 1)));
  // 머리는 몸과 반대로 끄덕여 시선을 안정시킨다
  if (N.neck) R.rot(N.neck, AX.X, -out.pitch * 0.8 + (moving ? Math.cos(ph * 2) * 0.04 * g.w.walk : 0));
  out.freq = freq;
  out.w = g.w;
  return out;
}

/** 꼬리: 몸 흔들림을 늦게 따라가는 2차 움직임 + 꼬리 흔들기 */
export function tailFollow(R, bones, g, dt, { wag = 0, lift = 0, sway = 0 }) {
  g.tailLag ??= 0;
  g.tailLag += (sway - g.tailLag) * Math.min(1, dt * 5);
  g.tailT = (g.tailT ?? 0) + dt;
  bones.forEach((b, i) => {
    const k = (i + 1) / bones.length;
    R.rot(b, AX.Y, Math.sin(g.tailT * 9 - i * 0.6) * wag * (0.4 + k) + g.tailLag * 0.6);
    R.rot(b, AX.X, -lift * 0.25);
  });
}
