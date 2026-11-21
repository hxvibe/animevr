// 쿠기사키 노바라 — 술식 「芻霊呪法(추령주법)」
//  · 망치: 오른손 주먹을 쥐면 망치가 쥐어진다. 휘둘러 치면 타격 (흑섬도 난다)
//  · 못: 왼손 엄지·검지를 꼬집듯 모으면 손가락 사이에 못 세 개 → 손을 펴며 위로 띄운다
//        → 공중에 뜬 못을 망치로 후려치면 주력을 실은 못이 바라본 대상에게 날아가 박힌다
//  · 簪(비녀): 왼손을 펴었다가 주먹을 꽉 쥐면, 박혀 있는 못에 주력이 터져 안에서부터 폭발한다
//  · 共鳴り(공명): 왼손바닥을 하늘로 펴면 짚인형이 놓인다 → 망치로 인형을 내리치면
//        못이 박힌(내 주력이 남은) 대상에게 그대로 울려 몸 안에서 가시가 터져 나온다
import * as THREE from 'three';
import { cool } from '../../core/cooldown.js';
import { Caster } from '../../core/caster.js';
import { HandAura, MeshAura } from '../../core/handAura.js';
import { getModel, loadModel } from '../../core/assets.js';
import { makeGlowSprite } from '../../core/fx.js';
import { bodyOf, gripPoint } from '../../core/body.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const DOLL_BELT = [-0.21, -0.03, 0.1]; // 짚인형: 왼쪽 옆구리 (살짝 뒤)
const UP = new THREE.Vector3(0, 1, 0);
const AURA = { glow: 0x3a7cff, hot: 0xc8e0ff, inner: 0x02040e, line: 0x000000 };
const CE = new THREE.Color(0x4a8cff); // 노바라의 주력 (푸른 빛)
const CE_HOT = new THREE.Color(0xd8ecff);
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (k) => k * k * (3 - 2 * k);

export const NOBARA_MODELS = ['wpn_hammer', 'wpn_strawdoll', 'wpn_nail'];

// ───────────────── 무기 모델 (스키닝 → 정적 메시, 방향 자동 정렬) ─────────────────
/**
 * 무기 모델을 바인드 자세 그대로 평범한 메시로 굽고, 긴 축을 +Y 로 세운다.
 *  headUp: 굵은 쪽(망치 머리)을 +Y 로. faceZ: 머리 부분이 가장 넓게 퍼진 가로축을 +Z 로 (망치의 때리는 면)
 *  grip: 손잡이 끝에서 이만큼(긴 축 길이 비율) 올라간 곳이 원점
 */
function bakeWeapon(name, { length, grip = 0.12, headUp = true, faceZ = true, outline = 0.004, axisHint = null, faceHint = null } = {}) {
  const src = getModel(name);
  if (!src) return null;
  src.updateMatrixWorld(true);
  const parts = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    if (o.isSkinnedMesh && o.skeleton?.bones.length) {
      // 화면 위치 = 뼈 월드 × 역바인드 × bindMatrix (양자화 배율이 역바인드에 들어 있다)
      const bm = new THREE.Matrix4().multiplyMatrices(o.skeleton.bones[0].matrixWorld, o.skeleton.boneInverses[0]).multiply(o.bindMatrix);
      g.applyMatrix4(bm);
    } else g.applyMatrix4(o.matrixWorld);
    // 양자화 속성은 그대로 두면 정규화 정수라 계산이 번거롭다 → 실수로
    for (const k of Object.keys(g.attributes)) {
      const a = g.attributes[k];
      if (a.isInterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array)) {
        const arr = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(i, c);
        g.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
      }
    }
    g.deleteAttribute('skinIndex');
    g.deleteAttribute('skinWeight');
    parts.push({ g, m: o.material });
  });
  if (!parts.length) return null;
  // 주축(PCA)
  const pts = [];
  for (const { g } of parts) {
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i += Math.max(1, Math.floor(P.count / 3000))) pts.push(new THREE.Vector3().fromBufferAttribute(P, i));
  }
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  c.divideScalar(pts.length);
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a * 3 + b] += d[a] * d[b];
  }
  // 거듭제곱법으로 가장 긴 축
  const axis = new THREE.Vector3(1, 1, 1).normalize();
  for (let it = 0; it < 40; it++) {
    const x = C[0] * axis.x + C[1] * axis.y + C[2] * axis.z;
    const y = C[3] * axis.x + C[4] * axis.y + C[5] * axis.z;
    const z = C[6] * axis.x + C[7] * axis.y + C[8] * axis.z;
    axis.set(x, y, z).normalize();
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const s = _v.subVectors(p, c).dot(axis);
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  // 굵은 쪽 찾기: 양 끝 20% 구간의 가로 퍼짐
  const spread = (from, to) => {
    let r = 0;
    let n = 0;
    for (const p of pts) {
      const s = _v.subVectors(p, c).dot(axis);
      if (s < from || s > to) continue;
      r += _v.addScaledVector(axis, -s).length();
      n++;
    }
    return n ? r / n : 0;
  };
  const L = hi - lo;
  // 모델 공간에서 머리 쪽을 알려 주면 그쪽으로 (짚인형: 벌어진 다리가 머리보다 넓어 굵기로는 못 가린다)
  if (axisHint) {
    if (axis.dot(_v.set(...axisHint)) < 0) {
      axis.negate();
      [lo, hi] = [-hi, -lo];
    }
  } else if (headUp && spread(lo, lo + L * 0.2) > spread(hi - L * 0.2, hi)) {
    axis.negate();
    [lo, hi] = [-hi, -lo];
  }
  // 머리 부분에서 가장 넓게 퍼진 가로축 (망치: 때리는 면 방향)
  let face = new THREE.Vector3(1, 0, 0);
  if (faceZ) {
    let best = -1;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI;
      const t1 = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
      const t2 = new THREE.Vector3().crossVectors(axis, t1);
      const d = t1.multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
      let e = 0;
      for (const p of pts) {
        const s = _v.subVectors(p, c).dot(axis);
        if (s < hi - L * 0.25) continue;
        e = Math.max(e, Math.abs(_v.dot(d)));
      }
      if (e > best) {
        best = e;
        face = d;
      }
    }
  } else if (faceHint) face.set(...faceHint).addScaledVector(axis, -axis.dot(_v.set(...faceHint))).normalize();
  else face.crossVectors(axis, Math.abs(axis.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
  const side = new THREE.Vector3().crossVectors(axis, face).normalize();
  face.crossVectors(side, axis).normalize();
  // 모델 → 무기 공간: X = side, Y = axis(머리 쪽), Z = face. 원점 = 손잡이 끝에서 grip 만큼
  const basis = new THREE.Matrix4().makeBasis(side, axis, face).invert();
  const origin = c.clone().addScaledVector(axis, lo + L * grip);
  const S = length ? length / L : 1;
  const xf = new THREE.Matrix4().makeScale(S, S, S).multiply(basis).multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
  const group = new THREE.Group();
  const outMat = new THREE.MeshBasicMaterial({ color: 0x050508, side: THREE.BackSide });
  for (const { g, m } of parts) {
    g.applyMatrix4(xf);
    g.computeVertexNormals();
    const mat = new THREE.MeshToonMaterial({ color: m.color ?? 0xffffff, map: m.map ?? null });
    if (m.alphaTest > 0 || m.transparent) {
      mat.alphaTest = 0.5;
      mat.side = THREE.DoubleSide;
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    group.add(mesh);
    if (outline > 0 && false) {
      // 먹선: 법선으로 부풀린 뒷면 (쓰지 않음)
      const og = g.clone();
      const P = og.attributes.position;
      const N = og.attributes.normal;
      for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) + N.getX(i) * outline, P.getY(i) + N.getY(i) * outline, P.getZ(i) + N.getZ(i) * outline);
      group.add(new THREE.Mesh(og, outMat));
    }
  }
  group.userData.len = L * S;
  group.userData.top = (1 - grip) * L * S; // 원점에서 머리 끝까지
  return group;
}

/** 못 한 개 (코드로): +Z 가 뾰족한 끝, 원점 = 못대가리 */
let _nailGeo = null;
function nailGeometry() {
  if (_nailGeo) return _nailGeo;
  const shaft = new THREE.CylinderGeometry(0.0035, 0.0035, 0.1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.05);
  const tip = new THREE.ConeGeometry(0.0035, 0.018, 6).rotateX(Math.PI / 2).translate(0, 0, 0.109);
  const head = new THREE.CylinderGeometry(0.011, 0.011, 0.004, 12).rotateX(Math.PI / 2).translate(0, 0, 0.0);
  const merged = [shaft, tip, head];
  const pos = [];
  const idx = [];
  let off = 0;
  for (const g of merged) {
    const gi = g.toNonIndexed();
    pos.push(...gi.attributes.position.array);
    for (let i = 0; i < gi.attributes.position.count; i++) idx.push(off + i);
    off += gi.attributes.position.count;
  }
  _nailGeo = new THREE.BufferGeometry();
  _nailGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  _nailGeo.computeVertexNormals();
  return _nailGeo;
}
const nailMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.85, roughness: 0.3 });

// 못: 받은 못 모델(wpn_nail)을 +Z = 뾰족한 끝, 원점 = 못대가리로 맞춰 한 번 굽고 복제해 쓴다
let _nailTpl;
function makeNail() {
  if (_nailTpl === undefined) {
    _nailTpl = null;
    const w = bakeWeapon('wpn_nail', { length: 0.125, grip: 0, faceZ: false, outline: 0.0015 });
    if (w) {
      const g = new THREE.Group();
      w.rotation.x = -Math.PI / 2; // 머리(+Y) → -Z
      w.position.z = w.userData.len; // 머리를 원점으로
      g.add(w);
      _nailTpl = g;
    }
  }
  if (_nailTpl) {
    const m = _nailTpl.clone(true);
    m.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    return m;
  }
  const m = new THREE.Mesh(nailGeometry(), nailMat);
  m.castShadow = true;
  return m;
}

// ───────────────── 망치 ─────────────────
class Hammer {
  constructor(ctx) {
    this.ctx = ctx;
    this.g = new THREE.Group();
    this.g.visible = false;
    ctx.scene.add(this.g);
    this.k = 0;
    this.head = new THREE.Vector3(); // 망치 머리(때리는 곳) 월드 위치
    this.prevHead = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.speed = 0;
    this.axis = new THREE.Vector3(0, 1, 0); // 손잡이 → 머리
    this.face = new THREE.Vector3(0, 0, -1); // 때리는 면
    this.hasPrev = false;
    this.headDist = 0.27;
  }

  _build() {
    if (this.inner) return;
    const w = bakeWeapon('wpn_hammer', { length: 0.34, grip: 0.14 });
    if (w) {
      this.inner = w;
      this.headDist = w.userData.top * 0.9;
    } else {
      // 모델이 없으면 코드로 만든 망치
      const g = new THREE.Group();
      const wood = new THREE.MeshToonMaterial({ color: 0x6a4a2a });
      const steel = new THREE.MeshToonMaterial({ color: 0x9aa0a8 });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.3).translate(0, 0.1, 0), wood));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12).rotateX(Math.PI / 2).translate(0, 0.24, 0), steel));
      this.inner = g;
      this.headDist = 0.24;
    }
    this.g.add(this.inner);
  }

  /** h: 손. want: 꺼내기. 반환: 머리 속도 */
  update(dt, h, want, holster = null) {
    this.k = THREE.MathUtils.clamp(this.k + (want ? dt * 7 : -dt * 5), 0, 1);
    if (!want && holster) {
      // 허리춤에 차 둔다
      this._build();
      this.k = 0;
      this.g.visible = true;
      this.g.position.copy(holster.pos);
      this.g.quaternion.copy(holster.quat);
      this.g.scale.setScalar(1);
      this.hasPrev = false;
      this.speed = 0;
      return 0;
    }
    this.g.visible = this.k > 0.01;
    if (!this.g.visible) {
      this.hasPrev = false;
      this.speed = 0;
      return 0;
    }
    this._build();
    const inp = this.ctx.input;
    // 손잡이: 주먹의 엄지 쪽으로 (손끝 쪽으로 살짝). 때리는 면: 주먹이 지르는 방향(손가락 마디)
    if (h.source === 'hand') {
      const F = _v.copy(h.fingersDir).normalize();
      const N = _v2.copy(h.palmNormal).normalize();
      const thumb = _v3.crossVectors(F, N);
      if (h.side === 'left') thumb.negate();
      this.axis.copy(thumb).normalize(); // 주먹을 꿰뚫는 축 그대로 (주먹에 수직)
      this.face.copy(F).addScaledVector(this.axis, -F.dot(this.axis)).normalize();
    } else if (h.source === 'controller') {
      // 컨트롤러: 손잡이는 위로 세우고 머리는 가리키는 쪽
      this.axis.copy(UP).applyQuaternion(h.quat).normalize();
      this.face.copy(h.dir).addScaledVector(this.axis, -h.dir.dot(this.axis)).normalize();
    } else {
      this.axis.set(0, 1, 0).applyQuaternion(inp.headQuat).normalize();
      this.face.copy(inp.headDir);
    }
    if (this.face.lengthSq() < 0.5) this.face.copy(inp.headDir);
    const side = _v.crossVectors(this.axis, this.face).normalize();
    _m.makeBasis(side, this.axis, _v2.crossVectors(side, this.axis));
    this.g.quaternion.setFromRotationMatrix(_m);
    if (h.source === 'hand') gripPoint(h, this.ctx.rig, this.g.position);
    else this.g.position.copy(h.palm);
    if (this.swingK > 0) {
      // 데스크톱: 내리치는 동작 (손목을 앞으로 꺾는다)
      this.g.rotateOnAxis(_v.set(1, 0, 0), -Math.sin(this.swingK * Math.PI) * 1.3);
    }
    this.g.scale.setScalar(Math.max(0.01, ease(this.k)));
    this.g.updateMatrixWorld(true);
    this.head.set(0, this.headDist * this.k, 0).applyMatrix4(this.g.matrixWorld);
    if (this.hasPrev && dt > 0) {
      this.vel.subVectors(this.head, this.prevHead).divideScalar(dt);
      this.speed = this.vel.length();
    } else this.speed = 0;
    this.prevHead.copy(this.head);
    this.hasPrev = true;
    return this.speed;
  }

  dispose() {
    this.ctx.scene.remove(this.g);
  }
}

// ───────────────── 짚인형 ─────────────────
class StrawDoll {
  constructor(ctx) {
    this.ctx = ctx;
    this.g = new THREE.Group();
    this.g.visible = false;
    ctx.scene.add(this.g);
    this.k = 0; // 손에 들고 앞으로 내민 정도 (공명은 1 근처에서)
    this.pos = new THREE.Vector3();
    this.nails = [];
    this.heldBy = null; // 허리춤 → 왼손
  }

  _build() {
    if (this.inner) return;
    // 받은 짚인형 모델: 머리 = 모델 +Z, 앞면 = 모델 +Y → 인형 공간 Y = 머리, Z = 앞면, 원점 = 발끝
    const w = bakeWeapon('wpn_strawdoll', { length: 0.2, grip: 0.0, faceZ: false, axisHint: [0, 0, 1], faceHint: [0, 1, 0], outline: 0.002 });
    if (w) this.inner = w;
    else {
      const straw = new THREE.MeshToonMaterial({ color: 0xc8a860 });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.12).translate(0, 0.07, 0), straw));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8).translate(0, 0.16, 0), straw));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13).rotateZ(Math.PI / 2).translate(0, 0.1, 0), straw));
      this.inner = g;
    }
    this.g.add(this.inner);
  }

  /**
   * h: 왼손 · grab: 지금 쥐는 동작(주먹·집게) · hold: 쥐고 있음 · belt: 허리춤 자리(BodyFrame) · fallback: 데스크톱 자리
   *  허리춤에 꽂혀 있다가 → 왼손으로 쥐어 뽑으면 손에 세워 들린다 (앞면이 나를 향해 못을 박기 좋게) → 손을 펴면 허리춤으로
   */
  update(dt, h, { grab, hold, belt, deskShow, fallback, rig }) {
    this._build();
    this.g.visible = true;
    const near = h?.active && belt && Math.min(h.palm.distanceTo(belt.at), h.indexTip.distanceTo(belt.at)) < 0.13;
    if (!this.heldBy && grab && near) {
      this.heldBy = 'left';
      this.ctx.sfx.play('click', { at: belt.at, vol: 0.4, rate: 0.7 });
      h.pulse?.(0.4, 30);
    } else if (this.heldBy && !hold) {
      this.heldBy = null;
      this.ctx.sfx.play('click', { at: this.g.position, vol: 0.3, rate: 0.6 });
    }
    const inHand = this.heldBy && h?.active;
    const want = inHand || deskShow;
    this.k = THREE.MathUtils.clamp(this.k + (want ? dt * 6 : -dt * 6), 0, 1);
    if (!want) {
      for (const n of this.nails) this.g.remove(n);
      this.nails.length = 0;
    }
    if (inHand) {
      // 주먹을 꿰뚫는 축 = 인형의 몸 (머리는 엄지 쪽), 앞면은 내 머리 쪽으로
      const up = _v2;
      if (h.source === 'hand') up.crossVectors(h.fingersDir, h.palmNormal).negate(); // 왼손 엄지 쪽
      else up.copy(h.dir);
      up.normalize();
      const toMe = _v.subVectors(this.ctx.input.head, h.palm);
      const face = toMe.addScaledVector(up, -toMe.dot(up)).normalize();
      const side = _v3.crossVectors(up, face).normalize();
      _m.makeBasis(side, up, face);
      this.g.quaternion.setFromRotationMatrix(_m);
      // 허리를 쥔다: 발끝에서 6cm 위가 주먹 속
      gripPoint(h, rig, this.g.position).addScaledVector(up, -0.06);
    } else if (deskShow) {
      this.g.position.copy(fallback);
      _m.makeBasis(_v3.set(1, 0, 0).applyQuaternion(this.ctx.input.headQuat), _v2.set(0, 1, 0), _v.set(0, 0, 1).applyQuaternion(this.ctx.input.headQuat).setY(0).normalize());
      this.g.quaternion.setFromRotationMatrix(_m);
    } else if (belt) {
      // 허리춤: 왼쪽 옆구리에 머리를 위로 꽂아 둔다 (앞면은 바깥)
      this.g.position.copy(belt.at);
      this.g.quaternion.copy(belt.quat);
    }
    this.g.scale.setScalar(1);
    this.g.updateMatrixWorld(true);
    this.pos.set(0, 0.11, 0.015).applyMatrix4(this.g.matrixWorld); // 가슴
  }

  /** 인형 가슴에 못을 박는다 */
  nailIt() {
    const n = makeNail();
    n.position.set(rnd(-0.012, 0.012), 0.11 + rnd(-0.015, 0.015), 0.07);
    n.rotation.set(0, Math.PI, 0); // 못 끝(+Z)이 인형 속(-Z)으로
    n.scale.setScalar(0.9);
    this.g.add(n);
    this.nails.push(n);
  }

  dispose() {
    this.ctx.scene.remove(this.g);
  }
}

// ───────────────── 날아가는 / 박힌 못 ─────────────────
class Nail {
  constructor(nobara, pos) {
    this.n = nobara;
    this.ctx = nobara.ctx;
    this.mesh = makeNail();
    this.ctx.scene.add(this.mesh);
    this.p = pos.clone();
    this.v = new THREE.Vector3();
    this.state = 'held'; // held → float(띄움) → fly(맞음) → stuck(박힘) / drop
    this.t = 0;
    this.dir = new THREE.Vector3(0, 0, -1);
    this.target = null;
    this.off = new THREE.Vector3();
    this.glow = makeGlowSprite(CE, 0.05);
    this.glow.material.opacity = 0;
    this.mesh.add(this.glow);
    // 못 자체를 주력 오라가 감싼다
    nobara.nailAura?.attach(this.mesh);
    this.trail = [];
    this.alive = true;
  }

  /** 띄우기: 손을 펴며 위로 */
  toss(v) {
    this.state = 'float';
    this.t = 0;
    this.v.copy(v);
    this.spin = new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
  }

  /** 망치에 맞았다: dir 로 날아간다 (주력이 실린다) */
  strike(dir, target) {
    this.state = 'fly';
    this.t = 0;
    this.dir.copy(dir).normalize();
    this.v.copy(this.dir).multiplyScalar(30);
    this.target = target;
    this.glow.material.opacity = 1;
    this.glow.scale.setScalar(0.12);
    this._orient(this.dir);
  }

  _orient(d) {
    _q.setFromUnitVectors(_v.set(0, 0, 1), _v2.copy(d).normalize());
    this.mesh.quaternion.copy(_q);
  }

  /** 박힌 자리 (대상이 움직이면 따라간다) */
  where(out) {
    if (this.target?.alive) return this.target.center(out).add(this.off);
    return out.copy(this.p);
  }

  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const { fx, world } = this.ctx;
    if (this.state === 'float') {
      // 위로 살짝 떴다가 거의 멈춘 듯 천천히 떨어진다 (때릴 틈)
      this.v.multiplyScalar(Math.exp(-dt * 4));
      this.v.y -= 1.2 * dt;
      this.p.addScaledVector(this.v, dt);
      this.mesh.rotation.x += this.spin.x * dt * Math.exp(-this.t * 2);
      this.mesh.rotation.y += this.spin.y * dt * Math.exp(-this.t * 2);
      this.mesh.position.copy(this.p);
      if (this.t > 1.6 || this.p.y < 0.05) this._drop();
      return this.alive;
    }
    if (this.state === 'fly') {
      // 대상 쪽으로 살짝 휘어 간다
      if (this.target?.alive) {
        const want = this.target.center(_v).sub(this.p).normalize();
        this.dir.lerp(want, Math.min(1, dt * 6)).normalize();
        this.v.copy(this.dir).multiplyScalar(30);
      }
      const from = _v3.copy(this.p);
      this.p.addScaledVector(this.v, dt);
      this._orient(this.dir);
      this.mesh.position.copy(this.p);
      fx.spawn(this.p, _v.set(0, 0, 0), CE, 0.03, 0.18, 0, 0);
      // 맞았나: 지나온 선분과 대상
      const hit = world.nearestTarget(this.p, 0.12, (x) => x !== this.n && !x.dying);
      if (hit) {
        this._stick(hit, from);
        return true;
      }
      if (this.p.y <= 0.01) {
        this.p.y = 0.02;
        this._stick(null, from);
        return true;
      }
      if (this.t > 1.5) this._drop();
      return this.alive;
    }
    if (this.state === 'stuck') {
      this.where(_v);
      this.mesh.position.copy(_v);
      this.glow.material.opacity = 0.35 + Math.sin(this.t * 8) * 0.15;
      // 대상이 쓰러지면 바닥에 떨어진다
      if (this.target && !this.target.alive) {
        this.target = null;
        this._drop();
      }
      if (this.t > 25) this._drop();
      return this.alive;
    }
    if (this.state === 'drop') {
      this.v.y -= 9.8 * dt;
      this.p.addScaledVector(this.v, dt);
      if (this.p.y < 0.01) {
        this.p.y = 0.01;
        this.v.set(0, 0, 0);
      }
      this.mesh.position.copy(this.p);
      if (this.t > 1.2) this.dispose();
      return this.alive;
    }
    return true;
  }

  _stick(target, from) {
    const { fx, sfx } = this.ctx;
    this.state = 'stuck';
    this.t = 0;
    this.target = target;
    const at = this.p.clone();
    if (target) {
      // 몸 겉면쯤에 박는다
      const c = target.center(_v);
      const r = (target.kind === 'dummy' ? 0.17 * (target.scale ?? 1) : target.radius ?? 0.2) * 0.8;
      const back = _v2.subVectors(from, c);
      back.y *= 0.5;
      const hit = c.clone().addScaledVector(back.normalize(), r);
      this.off.subVectors(hit, c);
      this.p.copy(hit);
      target.damage(14, { type: 'pierce', dir: this.dir.clone(), color: '#8ab4ff' });
      target.impulse?.(_v.copy(this.dir).multiplyScalar(2.5), 2);
      this.n.marked.set(target, this.ctx.world.time);
      this.n.lastMarked = target;
    }
    this.mesh.position.copy(this.p);
    fx.burst(at, 10, CE_HOT, 2.5, 0.025, 0.25);
    sfx.play('punch_3', { at, vol: 0.55, rate: 1.6, jitter: 0.1 });
  }

  _drop() {
    this.state = 'drop';
    this.t = 0;
    this.v.set(rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3));
    this.glow.material.opacity = 0;
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.ctx.scene.remove(this.mesh);
    this.glow.material.dispose();
  }
}

// ───────────────── 노바라 ─────────────────
export class Nobara extends Caster {
  constructor(ctx) {
    super(ctx, { id: 'nobara', name: '쿠기사키 노바라' });
    this.domainLabel = '영역전개';
    this.reviveText = '이 정도로 쓰러질 내가 아니야';
    this.aura = new HandAura(ctx, AURA);
    this.nailAura = new MeshAura(AURA, 0.4);
    this.hammer = new Hammer(ctx);
    this.doll = new StrawDoll(ctx);
    this.nails = []; // 모든 못 (손에 쥔 것 포함)
    this.held = []; // 왼손에 쥔 못
    this.marked = new Map(); // 못이 박힌 대상 → 마지막으로 박힌 때 (공명 대상)
    this.lastMarked = null;
    this.cds = {};
    this._keys = {};
    this.desk = { swing: 0 };
    this.holdHand = { lost: 0 };
    this.hammerDrawn = false;
    this.holster = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), grip: new THREE.Vector3() };
    this.pouch = this._makePouch();
    for (const n of NOBARA_MODELS) loadModel(n);
  }

  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '망치', demo: 'nobara.hammer', color: '#8ab4ff', text: '오른쪽 허리춤에 걸린 망치 손잡이에 손을 대고 주먹을 쥐면 뽑힌다 · 휘둘러 치기 (흑섬도 난다)\n손을 펴면 망치가 허리로 돌아간다' },
        { head: '못 → 망치로 쏘기', demo: 'nobara.nails', color: '#c8dcff', text: '왼쪽 허리춤 못 주머니에 손을 대고 엄지·검지를 꼬집듯 모으면 못 세 개 → 손을 펴며 위로 띄운다\n떠 있는 못을 망치로 후려치면 바라본 대상에게 날아가 박힌다' },
        { head: '簪 비녀', demo: 'nobara.kanzashi', color: '#4a8cff', text: '못이 박혀 있을 때 왼손을 활짝 폈다가 주먹을 꽉 쥐기 → 박힌 못에서 주력이 터진다' },
        { head: '共鳴り 공명', demo: 'nobara.resonance', color: '#ff8aa0', text: '왼쪽 옆구리에 꽂힌 짚인형을 왼손 주먹으로 쥐어 뽑는다 → 망치로 인형 가슴을 내리치기 · 손을 펴면 다시 꽂힌다\n못이 박힌 대상(내 주력이 남은 대상)에게 그대로 울려 몸 안에서 가시가 터진다' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴' },
        { head: '추령주법', color: '#8ab4ff', text: '1 못 띄우고 망치로 쏘기 · 2 簪 · 3 共鳴り · V 망치로 치기' },
      ];
    }
    return [
      { head: '망치 · 못', color: '#8ab4ff', text: '오른쪽 그립: 망치 · 왼쪽 트리거 누르기 → 못, 떼면 띄운다 → 망치로 후려치기\n(오른쪽 트리거: 떠 있는 못을 바로 쏘기)' },
      { head: '簪 · 共鳴り', color: '#4a8cff', text: '왼쪽 그립: 簪 · 왼쪽 옆구리의 짚인형에 대고 왼쪽 그립 → 들고 망치로 내리치면 共鳴り' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const stuck = this.nails.filter((n) => n.state === 'stuck').length;
    const res = (this.cds.res ?? 0) > 0 ? `재사용 ${Math.ceil(this.cds.res)}s` : this._resTargets().length ? '준비' : '대상 없음';
    return [
      { label: '주력', bar: this.energy / this.maxEnergy, color: '#7aa8ff' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff9fa0' },
      { label: '박힌 못', text: `${stuck}` },
      { label: '공명', text: res },
      { label: '처치', text: `${w.kills}` },
    ];
  }

  update(dt) {
    const { input: inp, ui } = this.ctx;
    this.tickCommon(dt, 12);
    for (const k in this.cds) this.cds[k] -= dt;
    const L = inp.left;
    const R = inp.right;
    const blocked = ui.menuOpen;
    // 허리춤: 오른쪽엔 망치(머리를 아래로 걸어 둠), 왼쪽엔 못 주머니
    this._placeBelt(dt);
    // 망치: 오른쪽 허리춤의 망치 손잡이에 손을 대고 주먹을 쥐면 뽑힌다 → 손을 펴면 허리로 돌아간다 · 데스크톱은 늘
    const desk = inp.mode === 'desktop';
    const rFist = R.active && !R.uiBlock && (R.source === 'hand' ? R.gesture === 'fist' || (this.hammer.k > 0.5 && R.gesture !== 'open' && R.gesture !== 'none') : R.btn.grip);
    if (!desk && !blocked) {
      if (!this.hammerDrawn && rFist && R.palm.distanceTo(this.holster.grip) < 0.14) {
        this.hammerDrawn = true;
        this.hammer.k = 1;
        this.ctx.sfx.play('click', { at: R.palm, vol: 0.6, rate: 0.6 });
        R.pulse?.(0.5, 50);
      }
      if (this.hammerDrawn && !rFist) {
        this._holsterT = (this._holsterT ?? 0) + dt;
        if (this._holsterT > 0.15) this.hammerDrawn = false;
      } else this._holsterT = 0;
    }
    const wantHammer = !blocked && (desk || (this.hammerDrawn && rFist));
    if (desk) this.hammer.swingK = this.desk.swing > 0 ? 1 - this.desk.swing / 0.3 : 0;
    this.hammer.update(dt, R, wantHammer, desk ? null : this.holster);
    if (!blocked) {
      this._leftHand(dt, L);
      if (inp.mode === 'desktop') this._desktop(dt);
    }
    // 짚인형: 왼쪽 옆구리에 꽂혀 있다 → 왼손으로 쥐어 뽑는다 (못을 쥐고 있지 않을 때)
    const Lclosed = L.active && (L.source === 'hand' ? L.gesture === 'fist' || L.gesture === 'pinch' : L.btn.grip);
    const Lgrab = !blocked && !L.uiBlock && !this.held.length && (L.source === 'hand' ? L.gesture === 'fist' && L.gestureTime < 0.3 : L.pressed('grip')); // 주먹으로만 (집게는 못 주머니)
    const B = bodyOf(this.ctx);
    const belt = desk ? null : { at: B.point(...DOLL_BELT, _v4), quat: _q2.copy(B.quat).multiply(_q3.setFromAxisAngle(_v5.set(0, 1, 0), -Math.PI / 2)).multiply(_q3.setFromAxisAngle(_v5.set(1, 0, 0), 0.25)) };
    const deskDoll = desk && (this.cds.dollShow ?? 0) > 0;
    this.doll.update(dt, L, { grab: Lgrab, hold: Lclosed, belt, deskShow: deskDoll, fallback: _v.copy(inp.head).add(_v2.set(-0.1, -0.35, -0.35).applyQuaternion(inp.headQuat)), rig: this.ctx.rig });
    this.doll.g.visible = !desk || deskDoll;
    // 망치로 치기: 떠 있는 못 · 인형 · 대상
    if (this.hammer.k > 0.8) this._hammerHits(dt, R);
    // 쥔 못을 손가락 사이에
    this._placeHeld(L);
    this.nails = this.nails.filter((n) => n.update(dt));
    for (const [t, time] of this.marked) if (!t.alive || this.ctx.world.time - time > 30) this.marked.delete(t);
    this.aura.set('right', this.hammer.k > 0.5 ? 0.25 + Math.min(0.6, this.hammer.speed * 0.08) : 0);
    // 못에 주력을 싣는다: 쥔 못 · 날아가는 못이 오라에 감싸인다
    const flying = this.nails.some((n) => n.state === 'fly' || n.state === 'float');
    this.nailAura.set(flying ? 1 : this.held.length ? 0.7 : this.nails.length ? 0.35 : 0);
    this.nailAura.update(dt);
    this.aura.update(dt);
  }

  // ───────────────── 허리춤 ─────────────────
  _makePouch() {
    const g = new THREE.Group();
    const leather = new THREE.MeshToonMaterial({ color: 0x5a3a22 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.045), leather);
    box.castShadow = true;
    const ol = new THREE.Mesh(box.geometry, new THREE.MeshBasicMaterial({ color: 0x050508, side: THREE.BackSide }));
    ol.scale.setScalar(1.08);
    ol.visible = false; // 먹선 없음
    g.add(box, ol);
    // 위로 삐죽 나온 못대가리
    for (let i = 0; i < 4; i++) {
      const n = makeNail();
      n.rotation.x = Math.PI / 2; // 끝이 아래로
      n.position.set(-0.025 + i * 0.016, 0.06, rnd(-0.008, 0.008));
      g.add(n);
    }
    this.ctx.scene.add(g);
    return g;
  }

  _placeBelt(dt) {
    const B = bodyOf(this.ctx).update(dt);
    const desk = this.ctx.input.mode === 'desktop';
    // 망치: 오른쪽 허리, 머리가 아래 · 때리는 면이 앞
    const axis = B.dir(0, -1, 0.12, _v);
    const face = B.dir(0, 0, -1, _v2);
    const side = _v3.crossVectors(axis, face).normalize();
    face.crossVectors(side, axis).normalize();
    _m.makeBasis(side, axis, face);
    this.holster.quat.setFromRotationMatrix(_m);
    B.point(0.21, 0.06, -0.07, this.holster.pos);
    this.holster.grip.copy(this.holster.pos);
    // 못 주머니: 왼쪽 허리
    B.point(-0.2, -0.02, -0.08, this.pouch.position);
    this.pouch.quaternion.copy(B.quat);
    this.pouch.visible = !desk;
  }

  // ───────────────── 왼손: 못 · 簪 ─────────────────
  _leftHand(dt, L) {
    if (!L.active || L.uiBlock) {
      if (this.held.length && (this.holdHand.lost += dt) > 0.4) this._tossHeld(_v.set(0, 1.2, 0));
      return;
    }
    this.holdHand.lost = 0;
    const ctrl = L.source === 'controller';
    const pinch = ctrl ? L.btn.trigger : L.gesture === 'pinch' || L.pinching;
    // 못 꺼내기: 왼쪽 허리춤 못 주머니에 손을 대고 엄지·검지를 모은다
    const atPouch = L.palm.distanceTo(this.pouch.position) < 0.16 || L.indexTip.distanceTo(this.pouch.position) < 0.12;
    if (pinch && atPouch && !this.held.length && (this.cds.nails ?? 0) <= 0 && this.doll.k < 0.2) {
      if (this.spend(6)) {
        this.cds.nails = 0.5;
        for (let i = 0; i < 3; i++) {
          const n = new Nail(this, L.palm);
          this.nails.push(n);
          this.held.push(n);
        }
        this.ctx.sfx.play('click', { at: L.palm, vol: 0.6, rate: 1.8 });
        L.pulse?.(0.3, 30);
      }
    }
    // 손을 펴면(트리거를 떼면) 띄운다
    if (this.held.length && !pinch && (ctrl || L.gesture === 'open' || L.gesture === 'none' || L.gestureTime > 0.12)) {
      const v = _v.copy(L.vel).multiplyScalar(0.45);
      v.y = Math.max(v.y, 0) + 1.1;
      this._tossHeld(v);
    }
    // 簪: 펴었다가 주먹을 꽉 (컨트롤러: 왼쪽 그립)
    const clench = ctrl ? L.pressed('grip') : L.gesture === 'fist' && L.prevGesture === 'open' && L.gestureTime < 0.05;
    if (clench) this.kanzashi();
  }

  _placeHeld(L) {
    if (!this.held.length) return;
    // 엄지·검지 사이에서 부채꼴로
    const F = L.active ? (L.source === 'hand' ? L.fingersDir : L.dir) : this.ctx.input.headDir;
    const base = L.active ? (L.source === 'hand' ? _v3.copy(L.palm).lerp(L.indexTip, 0.6) : L.palm) : this.ctx.input.head;
    this.held.forEach((n, i) => {
      const spread = (i - 1) * 0.35;
      const d = _v.copy(F).applyAxisAngle(L.palmNormal, spread).normalize();
      n.p.copy(base).addScaledVector(d, 0.02);
      n._orient(d);
      n.mesh.position.copy(n.p);
    });
  }

  _tossHeld(v) {
    this.held.forEach((n, i) => n.toss(_v2.copy(v).add(_v3.set(rnd(-0.25, 0.25), (i - 1) * 0.15, rnd(-0.25, 0.25)))));
    this.held = [];
    this.ctx.sfx.whoosh?.(this.ctx.input.left.palm, 0.3, 1.8);
  }

  // ───────────────── 망치로 치기 ─────────────────
  _hammerHits(dt, R) {
    const H = this.hammer;
    const inp = this.ctx.input;
    const fast = H.speed > 1.5 || (R.source === 'controller' && R.pressed('trigger')) || this.desk.swing > 0;
    if (!fast) return;
    // 1) 떠 있는 못
    const floats = this.nails.filter((n) => n.state === 'float' && (n.p.distanceTo(H.head) < 0.17 || (R.source === 'controller' && R.pressed('trigger')) || this.desk.fire));
    if (floats.length) {
      const target = this.gazeTarget(inp.head, inp.headDir, 0.35, 40, false);
      const swingDir = H.vel.lengthSq() > 1 ? _v.copy(H.vel).normalize() : _v.copy(inp.headDir);
      floats.forEach((n, i) => {
        // 겨눈 대상이 있으면 그쪽, 없으면 바라본 쪽과 휘두른 쪽 사이
        const aim = target ? target.center(_v2).sub(n.p).normalize() : _v2.copy(inp.headDir).lerp(swingDir, 0.3).normalize();
        aim.add(_v3.set(rnd(-0.03, 0.03), rnd(-0.03, 0.03), rnd(-0.03, 0.03))).normalize();
        n.strike(aim, target);
        void i;
      });
      this.desk.fire = false;
      const { fx, sfx } = this.ctx;
      fx.burst(H.head, 18, CE_HOT, 4, 0.03, 0.25);
      fx.starFlare(H.head, CE, 0.35, 0.25);
      fx.shockwave(H.head, CE, 0.5, 0.25, { faceDir: _v.copy(inp.headDir) });
      sfx.play('punch_2', { at: H.head, vol: 0.9, rate: 1.4 });
      sfx.play('zap', { at: H.head, vol: 0.35, rate: 1.6 });
      R.pulse?.(0.8, 60);
      this.ctx.ui.manga({ main: '芻霊呪法', ruby: 'すうれいじゅほう', color: '#8ab4ff', side: 'right' });
      return;
    }
    // 2) 망치 머리로 대상을 직접 친다 (근접 판정은 손바닥 기준이라 머리 쪽은 따로)
    if (H.speed > 2.2 && (this.cds.hammerHit ?? 0) <= 0 && R.source !== 'desktop') {
      const t = this.ctx.world.nearestTarget(H.head, 0.12, (x) => !x.heldBy && !x.held);
      if (t) {
        this.cds.hammerHit = 0.3;
        this.meleeHit(t, H.head.clone(), _v.copy(H.vel).normalize(), H.speed, R);
        return;
      }
    }
    // 3) 짚인형 → 공명
    if (this.doll.k > 0.7 && (H.head.distanceTo(this.doll.pos) < 0.16 || this.desk.doll) && (H.vel.y < -0.5 || R.source !== 'hand' || this.desk.doll)) {
      this.desk.doll = false;
      this.resonance();
    }
  }

  /** 오른손(망치)으로 직접 친다: 기본 근접 대신 망치 타격 */
  meleeHit(target, pos, dir, speed, hand) {
    if (hand?.side !== 'right' || this.hammer.k < 0.5) return false;
    const melee = this.ctx.melee;
    const p = this.hammer.head.clone();
    if (Math.random() < (this.ctx.settings.blackFlashChance ?? 0.2)) melee.blackFlash(target, p, dir, 14 + speed * 4, hand, { mul: 1.1 });
    else {
      melee.normalHit(target, p, dir, 16 + speed * 4, speed, hand, { mul: 1.2, push: 1.3 });
      this.ctx.sfx.play('punch_3', { at: p, vol: 0.7, rate: 0.85 });
    }
    // 망치에 실린 주력도 남는다 → 공명할 수 있다
    this.marked.set(target, this.ctx.world.time);
    this.lastMarked = target;
    return true;
  }

  // ───────────────── 簪 ─────────────────
  kanzashi() {
    const stuck = this.nails.filter((n) => n.state === 'stuck');
    if (!stuck.length) return;
    if ((this.cds.kan ?? 0) > 0) return;
    if (!cool(this.ctx, 'kanzashi', 2.5, '簪') || !this.spend(10)) return;
    this.cds.kan = 0.6;
    const { fx, sfx, ui, world } = this.ctx;
    ui.manga({ main: '簪', ruby: 'かんざし', color: '#4a8cff', side: 'left' });
    stuck.forEach((n, i) => {
      this.later(0.04 * i + 0.05, () => {
        if (!n.alive || n.state !== 'stuck') return;
        const at = n.where(new THREE.Vector3());
        // 못에서 푸른 가시가 사방으로
        fx.burst(at, 26, CE, 5, 0.05, 0.45);
        fx.burst(at, 18, new THREE.Color(0x02030a), 3, 0.05, 0.4, { dark: true });
        fx.sphereBlast(at, CE, 0.7, 0.25);
        fx.flash(at, CE, 6, 0.25);
        sfx.explosion(at, 0.6);
        if (n.target?.alive) {
          n.target.damage(34, { type: 'impact', dir: n.dir.clone(), color: '#4a8cff' });
          n.target.impulse?.(_v.copy(n.dir).multiplyScalar(4).add(_v2.set(0, 2.5, 0)), 4);
        }
        // 주변도 휩쓸린다
        world.forEachEnemy(at, 0.9, (t) => {
          if (t !== n.target) t.damage(12, { type: 'impact', color: '#4a8cff' });
        });
        n.dispose();
      });
    });
    this.ctx.input.left.pulse?.(1, 120);
  }

  // ───────────────── 共鳴り ─────────────────
  _resTargets() {
    return [...this.marked.keys()].filter((t) => t.alive && !t.dying);
  }

  resonance() {
    const { fx, sfx, ui, input: inp } = this.ctx;
    if ((this.cds.res ?? 0) > 0) return;
    const list = this._resTargets();
    // 인형에 못을 박는 건 늘 (소리·불꽃)
    this.doll.nailIt();
    fx.burst(this.doll.pos, 16, CE_HOT, 2.5, 0.03, 0.3);
    sfx.play('punch_3', { at: this.doll.pos, vol: 0.9, rate: 1.1 });
    inp.right.pulse?.(0.9, 80);
    inp.left.pulse?.(0.9, 80);
    if (!list.length) {
      ui.callout('공명할 대상이 없다 — 못이나 망치로 먼저 주력을 남겨라', { color: '#ffb0c0', size: 40, dur: 1.5 });
      return;
    }
    if (!cool(this.ctx, 'resonance', 6, '共鳴り') || !this.spend(25)) return;
    this.cds.res = 3.5;
    ui.manga({ main: '共鳴り', ruby: 'ともなり', color: '#ff6a8a', big: true });
    sfx.play('black_flash', { vol: 0.5, rate: 1.3 });
    for (const t of list) {
      const stuck = this.nails.filter((n) => n.state === 'stuck' && n.target === t).length;
      const c = t.center(new THREE.Vector3());
      const dmg = 55 + stuck * 12;
      // 몸 안에서 가시가 터져 나온다
      this.later(0.12, () => {
        if (!t.alive) return;
        t.damage(dmg, { type: 'pierce', color: '#ff6a8a' });
        t.impulse?.(_v.set(0, 3, 0), 3);
        this._spikes(t.center(new THREE.Vector3()), t.scale ?? 1);
        sfx.explosion(c, 0.7);
        sfx.play('slash', { at: c, vol: 0.8, rate: 0.7 });
      });
    }
  }

  /** 대상 몸에서 바깥으로 뻗는 검푸른 가시 */
  _spikes(c, s) {
    const { fx } = this.ctx;
    const mat = new THREE.MeshBasicMaterial({ color: 0x0a0c18, transparent: true });
    const glow = new THREE.MeshBasicMaterial({ color: 0x4a8cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const g = new THREE.Group();
    g.position.copy(c);
    for (let i = 0; i < 14; i++) {
      const len = rnd(0.35, 0.8) * s;
      const geo = new THREE.ConeGeometry(0.035 * s, len, 5).translate(0, len / 2, 0);
      const m = new THREE.Mesh(geo, i % 3 ? mat : glow);
      m.quaternion.setFromUnitVectors(UP, _v.randomDirection());
      g.add(m);
    }
    fx.addTransient(g, 0.7, (k) => {
      const e = k < 0.15 ? k / 0.15 : 1;
      g.scale.setScalar(Math.max(0.01, ease(e)) * (1 + k * 0.1));
      mat.opacity = glow.opacity = 1 - Math.max(0, (k - 0.6) / 0.4);
    }, () => {
      g.traverse((o) => o.geometry?.dispose());
      mat.dispose();
      glow.dispose();
    });
    fx.burst(c, 30, new THREE.Color(0xff3050), 4, 0.04, 0.4);
    fx.flash(c, new THREE.Color(0xff4060), 6, 0.3);
  }

  // ───────────────── 데스크톱 ─────────────────
  _desktop(dt) {
    const inp = this.ctx.input;
    const press = (code) => {
      const d = inp.keyDown(code);
      const p = d && !this._keys[code];
      this._keys[code] = d;
      return p;
    };
    this.desk.swing = Math.max(0, this.desk.swing - dt);
    // 1: 못 셋을 앞에 띄우고 곧바로 망치로 친다
    if (press('Digit1') && !this.nails.some((n) => n.state === 'float') && this.spend(6)) {
      const at = _v.copy(inp.head).add(_v2.set(0.05, -0.12, -0.4).applyQuaternion(inp.headQuat));
      for (let i = 0; i < 3; i++) {
        const n = new Nail(this, at.clone().add(_v3.set((i - 1) * 0.04, 0, 0).applyQuaternion(inp.headQuat)));
        n.toss(_v3.set(0, 0.6, 0));
        this.nails.push(n);
      }
      this.later(0.3, () => {
        this.desk.swing = 0.3;
        this.desk.fire = true;
      });
    }
    if (press('Digit2')) this.kanzashi();
    if (press('Digit3') && (this.cds.res ?? 0) <= 0) {
      this.cds.dollShow = 1.2;
      this.later(0.35, () => {
        this.desk.swing = 0.3;
        this.desk.doll = true;
      });
    }
  }

  cancelDomain() {}

  dispose() {
    for (const n of this.nails) n.dispose();
    this.nails = [];
    this.held = [];
    this.hammer.dispose();
    this.doll.dispose();
    this.ctx.scene.remove(this.pouch);
    this.aura.dispose();
  }
}
