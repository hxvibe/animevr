// 스키닝 캐릭터 모델(주술회전 게임에서 옮긴 GLB)을 더미의 관절 체계로 움직인다.
// 더미는 축 정렬 관절(J_hips, J_shL …)을 돌려 걷고·치고·래그돌로 쓰러진다.
// 여기서는 같은 이름의 관절을 뼈 위치에 만들고, 매 프레임 관절의 회전을 실제 뼈에 옮긴다.
//  → 더미 AI·잡기·래그돌·일어서기·절단이 모델에 그대로 먹힌다.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { getModel, loadModel } from './assets.js';

// 더미 관절 → 뼈 이름 (GLTFLoader는 이름의 공백을 _ 로 바꾼다)
const SIDE = (p, map) => Object.fromEntries(Object.entries(map).flatMap(([k, v]) => [[k + 'L', v.replace('%', 'L')], [k + 'R', v.replace('%', 'R')]]).map(([k, v]) => [k, p + v]));
export const RIG_MAPS = {
  // 주술회전 전화향명(JJKCC) 계열
  jjk: { hips: 'hip', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head', ...SIDE('', { sh: '%_arm', el: '%_elbow', hd: '%_hand', hp: '%_leg', kn: '%_knee', ft: '%_ankle' }) },
  // 3ds Max Biped (팬텀 퍼레이드 · Tokyo Saga)
  bip: { hips: 'Bip001_Pelvis', spine: 'Bip001_Spine', chest: 'Bip001_Spine2', neck: 'Bip001_Neck', head: 'Bip001_Head', ...SIDE('Bip001_', { sh: '%_UpperArm', el: '%_Forearm', hd: '%_Hand', hp: '%_Thigh', kn: '%_Calf', ft: '%_Foot' }) },
};
const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', elL: 'shL', hdL: 'elL', shR: 'chest', elR: 'shR', hdR: 'elR', hpL: 'hips', knL: 'hpL', ftL: 'knL', hpR: 'hips', knR: 'hpR', ftR: 'knR' };
const ORDER = Object.keys(PARENT);

// 모델 목록: 파일 · 이 높이(m)로 맞춘다 · 처음에 숨길 메시(이름 일부)
export const CHAR_MODELS = {
  geto: { file: 'chr_geto' },
  toji: { file: 'chr_toji' },
  nobara: { file: 'chr_nobara' },
  yuta: { file: 'chr_yuta' },
  gojo: { file: 'chr_gojo' },
  yaga: { file: 'npc_yaga' },
  cathy: { file: 'npc_cathy' },
  tsukamoto: { file: 'npc_tsukamoto' },
  bagmask: { file: 'enemy_bagmask' },
  mahito: { file: 'curse_mahito' },
  jogo: { file: 'curse_jogo' },
  fingerBearer: { file: 'curse_finger_bearer' },
  kuchisake: { file: 'curse_kuchisake' },
  cyclops: { file: 'curse_cyclops' },
  tamamo: { file: 'curse_tamamo' },
  rika: { file: 'curse_rika' },
  bignose: { file: 'curse_bignose' },
  centipede: { file: 'curse_centipede' },
  worm: { file: 'curse_worm' },
  dragon: { file: 'curse_rainbow_dragon' },
  inventory: { file: 'curse_inventory' },
};

export function preloadChars(keys) {
  return Promise.all(keys.map((k) => loadModel(CHAR_MODELS[k].file)));
}

let _grad = null;
export function toonGradient() {
  if (_grad) return _grad;
  const t = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  _grad = t;
  return t;
}

// 스키닝을 따라가는 먹선
const OUTLINE_VERT = /* glsl */ `
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
const OUTLINE_FRAG = 'uniform vec3 uC; uniform float uO; void main(){ gl_FragColor = vec4(uC, uO); }';

/** 원본 재질 → 셀 셰이딩 재질 (인스턴스마다 새로: 맞을 때 번쩍이게) */
function toonFrom(src) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, map: src.map ?? null, gradientMap: toonGradient() });
  if (!src.map && src.color) m.color.copy(src.color);
  if (src.alphaTest > 0 || src.transparent) {
    m.alphaTest = 0.5;
    m.side = THREE.DoubleSide;
  }
  m.userData.baseEmissive = new THREE.Color(0);
  return m;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** 뼈 이름으로 리그 종류 알아내기 */
function detectMap(model) {
  for (const [id, map] of Object.entries(RIG_MAPS)) if (model.getObjectByName(map.hips) && model.getObjectByName(map.hdL)) return id;
  return null;
}

/**
 * 스키닝 모델 하나 (복제본). 높이를 맞추고 더미 관절을 만든다.
 * @param key CHAR_MODELS 키
 * @param opts { height: 더미 관절 기준 높이(m, 기본 1.8) · outline · hide: [메시 이름 일부] }
 */
export class RiggedBody {
  constructor(key, { height = 1.8, length = 0, outline = 0.011, hide = ['-'], tint = null } = {}) {
    const def = CHAR_MODELS[key];
    const src = def && getModel(def.file);
    this.ok = !!src;
    if (!src) return;
    this.key = key;
    const clone = skClone(src);
    this.model = new THREE.Group(); // 더미 관절과 모델을 함께 담는 그릇 (스케일)
    this.model.name = 'rigModel';
    this.model.add(clone);
    this.clone = clone;
    clone.updateMatrixWorld(true);
    // 바인드 자세 높이: 머리 뼈 + 머리 크기 대신 메시 경계를 쓴다 (스키닝 경계 = 바인드)
    const box = new THREE.Box3();
    this.meshes = [];
    clone.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = true;
      // 스키닝 메시는 뼈를 적용한 경계 (지오메트리 단위가 뼈 스케일과 다를 수 있다)
      if (o.isSkinnedMesh) {
        o.computeBoundingBox();
        box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
      } else {
        o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      }
      this.meshes.push(o);
    });
    this.box = box;
    this.mapId = detectMap(clone);
    const map = RIG_MAPS[this.mapId] ?? null;
    // 관절 위치(모델 공간)
    const headB = map && clone.getObjectByName(map.head);
    const top = headB ? Math.max(box.max.y, headB.getWorldPosition(_v).y) : box.max.y;
    this.srcH = top - Math.max(0, box.min.y);
    // 긴 몸(지네·용)은 길이로 맞춘다
    const S = length > 0 ? length / (box.max.z - box.min.z) : height / this.srcH;
    this.scale = S;
    this.model.scale.setScalar(S);
    // 재질: 셀 셰이딩
    const mats = new Map();
    for (const o of this.meshes) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const nl = list.map((m) => {
        if (!mats.has(m)) {
          const t = toonFrom(m);
          if (tint !== null) t.color.set(tint);
          mats.set(m, t);
        }
        return mats.get(m);
      });
      o.material = Array.isArray(o.material) ? nl : nl[0];
      if (hide.some((h) => o.name.includes(h))) o.visible = false;
    }
    this.mats = [...mats.values()];
    // 먹선
    this.outlines = [];
    if (outline > 0) {
      const mat = new THREE.ShaderMaterial({ uniforms: { uT: { value: outline / S }, uC: { value: new THREE.Color(0x060408) }, uO: { value: 1 } }, vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG, side: THREE.BackSide });
      this.outlineMat = mat;
      for (const o of this.meshes) {
        if (!o.isSkinnedMesh || /line|eye|pupil|shine|lash|teeth|tongue|mouth|button|ring/i.test(o.name)) continue;
        const ol = new THREE.SkinnedMesh(o.geometry, mat);
        ol.bind(o.skeleton, o.bindMatrix);
        ol.frustumCulled = false;
        ol.position.copy(o.position);
        ol.quaternion.copy(o.quaternion);
        ol.scale.copy(o.scale);
        ol.visible = o.visible;
        ol.userData.of = o;
        o.parent.add(ol);
        this.outlines.push(ol);
      }
    }
    this.bones = {};
    clone.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
    });
    if (map) this._buildJoints(map);
  }

  /** 더미와 같은 이름의 축 정렬 관절 (J_hips …). 모델 공간 = 바인드 자세 */
  _buildJoints(map) {
    const clone = this.clone;
    const model = this.model;
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const qInv = model.getWorldQuaternion(new THREE.Quaternion()).invert();
    const P = {};
    for (const k of ORDER) {
      const b = clone.getObjectByName(map[k]);
      if (!b) continue;
      P[k] = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    }
    // 오른쪽이 없으면 왼쪽을 좌우 반전
    for (const k of ORDER) if (!P[k] && k.endsWith('R') && P[k.slice(0, -1) + 'L']) P[k] = P[k.slice(0, -1) + 'L'].clone().setX(-P[k.slice(0, -1) + 'L'].x);
    this.P = P;
    const J = {};
    const origin = new THREE.Vector3(P.hips.x, 0, P.hips.z);
    for (const k of ORDER) {
      if (!P[k]) continue;
      const g = new THREE.Group();
      g.name = 'J_' + k;
      const pk = PARENT[k];
      g.position.subVectors(P[k], pk ? P[pk] : origin);
      (pk ? J[pk] : model).add(g);
      J[k] = g;
    }
    // 모델 원점이 엉덩이 바로 밑에 오도록
    clone.position.x -= origin.x;
    clone.position.z -= origin.z;
    J.hips.position.x = 0;
    J.hips.position.z = 0;
    this.J = J;
    // 뼈마다: 바인드 때의 모델 공간 회전, 가장 가까운 연결된 조상까지의 회전
    model.updateMatrixWorld(true);
    const mq = (o) => qInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
    const boneToKey = new Map();
    for (const k of ORDER) {
      const b = clone.getObjectByName(map[k]);
      if (b && J[k]) boneToKey.set(b, k);
    }
    const ent = [];
    for (const [b, k] of boneToKey) {
      let anc = b.parent;
      let depth = 0;
      while (anc && anc !== model && !boneToKey.has(anc)) anc = anc.parent;
      for (let p = b; p && p !== model; p = p.parent) depth++;
      const ancKey = anc && anc !== model ? boneToKey.get(anc) : null;
      const b0 = mq(b);
      const pq = mq(b.parent);
      const chain = ancKey ? mq(anc).invert().multiply(pq) : pq;
      ent.push({ b, k, b0, chain, ancKey, depth, desired: new THREE.Quaternion() });
    }
    ent.sort((a, b) => a.depth - b.depth);
    this.ent = ent;
    this.byKey = Object.fromEntries(ent.map((e) => [e.k, e]));
    this._jq = Object.fromEntries(ORDER.map((k) => [k, new THREE.Quaternion()]));
  }

  /** 관절 회전 → 뼈 */
  sync() {
    if (!this.ent) return;
    const J = this.J;
    const jq = this._jq;
    for (const k of ORDER) {
      if (!J[k]) continue;
      const pk = PARENT[k];
      if (pk && J[pk]) jq[k].multiplyQuaternions(jq[pk], J[k].quaternion);
      else jq[k].copy(J[k].quaternion);
    }
    for (const e of this.ent) {
      e.desired.multiplyQuaternions(jq[e.k], e.b0);
      _q.copy(e.chain);
      if (e.ancKey) _q.premultiply(this.byKey[e.ancKey].desired);
      e.b.quaternion.copy(_q.invert().multiply(e.desired));
    }
  }

  /** 메시 보이기/숨기기 (이름 일부) — 먹선도 함께 */
  show(part, on) {
    for (const o of this.meshes) if (o.name.includes(part)) o.visible = on;
    for (const ol of this.outlines) ol.visible = ol.userData.of.visible;
  }

  /** 뼈를 월드 축 기준으로 돌린다 (이미 자세를 잡은 뒤 덧붙이는 움직임: 턱 벌리기 등) */
  rotWorld(name, axis, angle) {
    const b = this.bones[name];
    if (!b || !angle) return;
    b.parent.updateWorldMatrix(true, false);
    b.updateMatrixWorld(false);
    b.matrixWorld.decompose(_v, _q, _sc);
    _q.premultiply(_q2.setFromAxisAngle(axis, angle));
    _m.compose(_v, _q, _sc);
    b.matrix.copy(b.parent.matrixWorld).invert().multiply(_m);
    b.matrix.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);
  }

  setEmissive(c) {
    for (const m of this.mats) m.emissive.copy(c);
  }

  /** 지금 자세를 굳힌 일반 메시로 바꾼다 (절단 조각이 원래 뼈에 묶여 제자리에 남지 않게) */
  bake() {
    const v = new THREE.Vector3();
    this.clone.updateMatrixWorld(true);
    for (const ol of this.outlines) ol.parent?.remove(ol);
    this.outlines = [];
    for (const o of this.meshes) {
      if (!o.isSkinnedMesh || !o.visible || !o.parent) continue;
      o.skeleton.update();
      const g = o.geometry.clone();
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(o.geometry.attributes.position, i);
        o.applyBoneTransform(i, v);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.deleteAttribute('skinIndex');
      g.deleteAttribute('skinWeight');
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, o.material);
      m.position.copy(o.position);
      m.quaternion.copy(o.quaternion);
      m.scale.copy(o.scale);
      m.castShadow = true;
      o.parent.add(m);
      o.parent.remove(o);
    }
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.outlineMat?.dispose();
  }
}

/** 뼈 하나의 월드 위치 */
export function bonePos(body, name, out = new THREE.Vector3()) {
  const b = body.bones[name];
  return b ? b.getWorldPosition(out) : null;
}

/**
 * 뼈 사슬을 점들 위에 세운다 (지네·데스웜·홍룡처럼 긴 몸).
 * chain: 머리 → 꼬리 순서의 뼈, pts[i]: 그 뼈가 있을 월드 위치, up(i, T, out): 등 방향.
 * 부모가 자식보다 먼저 놓이도록 깊이 순서로 적용한다.
 */
const _T = new THREE.Vector3();
const _U = new THREE.Vector3();
const _X = new THREE.Vector3();
const _M = new THREE.Matrix4();
export function layChain(chain, pts, up) {
  const n = chain.length;
  if (!chain._order) {
    const depth = (b) => {
      let d = 0;
      for (let p = b; p; p = p.parent) d++;
      return d;
    };
    chain._order = chain.map((b, i) => [i, b ? depth(b) : 0]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    chain._target = chain.map(() => new THREE.Matrix4());
  }
  for (let k = 0; k < n; k++) {
    const b = chain[k];
    if (!b) continue;
    if (k === 0) _T.subVectors(pts[0], pts[1]);
    else if (k === n - 1) _T.subVectors(pts[k - 1], pts[k]);
    else _T.subVectors(pts[k - 1], pts[k + 1]);
    if (_T.lengthSq() < 1e-10) _T.set(0, 0, 1);
    _T.normalize();
    if (typeof up === 'function') up(k, _T, _U);
    else _U.copy(up);
    _U.addScaledVector(_T, -_U.dot(_T));
    if (_U.lengthSq() < 1e-6) _U.set(1, 0, 0).addScaledVector(_T, -_T.x);
    _U.normalize();
    _X.crossVectors(_U, _T).normalize();
    _M.makeBasis(_X, _U, _T);
    _q.setFromRotationMatrix(_M).multiply(b.userData.bindRel);
    chain._target[k].compose(pts[k], _q, b.userData.worldScale);
  }
  for (const k of chain._order) {
    const b = chain[k];
    if (!b) continue;
    b.parent.updateWorldMatrix(true, false);
    b.matrix.copy(b.parent.matrixWorld).invert().multiply(chain._target[k]);
    b.matrix.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);
  }
}

/** layChain 전에 한 번: 사슬 뼈의 "앞=fwd, 위=up" 기준에 대한 바인드 회전과 월드 크기 */
export function prepChain(body, chain, fwd = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0)) {
  body.model.updateMatrixWorld(true);
  const X = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const Uu = new THREE.Vector3().crossVectors(fwd, X).normalize();
  _M.makeBasis(X, Uu, fwd.clone().normalize());
  const base = new THREE.Quaternion().setFromRotationMatrix(_M).invert();
  for (const b of chain) {
    if (!b) continue;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    b.matrixWorld.decompose(p, q, s);
    b.userData.bindRel = base.clone().multiply(q);
    b.userData.worldScale = s;
  }
}

/**
 * 머리가 지나간 길을 몸이 그대로 따라오는 긴 몸 (뱀처럼).
 * names: 머리 → 꼬리 뼈 이름. setHead(p) 로 머리를 옮기고 pose() 로 뼈를 세운다.
 */
export class ChainBody {
  constructor(key, names, { length = 0, height = 0, outline = 0.02 } = {}) {
    this.body = new RiggedBody(key, { length, height: height || 1.8, outline, hide: [] });
    this.ok = this.body.ok;
    if (!this.ok) return;
    const B = this.body;
    this.chain = names.map((n) => B.bones[n] ?? null);
    B.model.updateMatrixWorld(true);
    // 바인드 때 머리에서 각 뼈까지의 거리 (월드 = 스케일 적용)
    this.dist = [];
    let acc = 0;
    let prev = null;
    for (const b of this.chain) {
      const p = b ? b.getWorldPosition(new THREE.Vector3()) : prev;
      if (prev && p) acc += p.distanceTo(prev);
      this.dist.push(acc);
      prev = p;
    }
    this.length = acc;
    prepChain(B, this.chain);
    this.trail = []; // 머리가 지나온 점 (최신이 앞)
    this.tailDir = new THREE.Vector3(0, 0, -1); // 길이 모자라면 이 방향으로 뻗는다
    this.pts = this.chain.map(() => new THREE.Vector3());
    this.root = B.model;
  }

  /** 머리 위치를 정한다. reset: 길을 지우고 tailDir 로 곧게 편다 */
  setHead(p, reset = false) {
    const tr = this.trail;
    if (reset) tr.length = 0;
    if (!tr.length || tr[0].distanceToSquared(p) > 0.0004 * this.length) tr.unshift(p.clone());
    else tr[0].copy(p);
    // 몸길이보다 긴 길은 버린다
    let acc = 0;
    for (let i = 1; i < tr.length; i++) {
      acc += tr[i].distanceTo(tr[i - 1]);
      if (acc > this.length * 1.15 + 1) {
        tr.length = i + 1;
        break;
      }
    }
  }

  /** 길 위의 점들에 뼈를 놓는다. warp(i, P): 점마다 덧붙일 흔들림 */
  pose(up = new THREE.Vector3(0, 1, 0), warp = null) {
    const tr = this.trail;
    if (!tr.length) return;
    let seg = 0;
    let acc = 0;
    for (let k = 0; k < this.chain.length; k++) {
      const d = this.dist[k];
      const P = this.pts[k];
      while (seg < tr.length - 1 && acc + tr[seg].distanceTo(tr[seg + 1]) < d) {
        acc += tr[seg].distanceTo(tr[seg + 1]);
        seg++;
      }
      if (seg < tr.length - 1) {
        const L = tr[seg].distanceTo(tr[seg + 1]);
        P.lerpVectors(tr[seg], tr[seg + 1], L > 1e-6 ? (d - acc) / L : 0);
      } else {
        // 길이 끝났다: 마지막 방향(없으면 tailDir)으로 곧게
        const last = tr[tr.length - 1];
        const dir = tr.length > 1 ? _v.subVectors(last, tr[tr.length - 2]).normalize() : _v.copy(this.tailDir);
        if (dir.lengthSq() < 1e-6) dir.copy(this.tailDir);
        P.copy(last).addScaledVector(dir, d - acc);
      }
      if (warp) warp(k, P);
    }
    layChain(this.chain, this.pts, up);
  }

  dispose(scene) {
    scene?.remove(this.root);
    this.body.dispose();
  }
}
