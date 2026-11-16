// 테스트 더미 (첨부 GLB 모델 사용, 로드 실패 시 코드로 만든 인간형)
// GLB의 본 계층을 그대로 쓰지 않고, 본 위치에 축 정렬 관절을 새로 만들어 부위별 메시를 붙인다.
import * as THREE from 'three';
import { getModel } from './assets.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export const DUMMY_TYPES = {
  basic: { label: '기본', color: null, scale: 1, ai: 'idle' },
  shooter: { label: '사격형', color: 0xc8261c, scale: 1, ai: 'shooter' },
  rusher: { label: '돌격형', color: 0xe8640c, scale: 1, ai: 'rusher' },
  giant: { label: '거대', color: 0x6a3ad0, scale: 1.45, ai: 'rusher' },
  sandbag: { label: '샌드백(∞)', color: 0xe8e8e8, scale: 1, ai: 'idle', infinite: true },
};

const NAMES = ['다나카 히로시', '스즈키 켄타', '야마다 타로', '사토 유이치', '이토 마사키', '와타나베 쇼', '나카무라 료', '고바야시 준', '카토 다이스케', '요시다 하루', '야마모토 렌', '마츠모토 카이', '이노우에 소타', '기무라 히나', '하야시 아오이', '시미즈 유키', '모리 겐지', '이케다 세나'];
let _nameIdx = Math.floor(Math.random() * NAMES.length);

// ───────── 래그돌 (위치 기반 물리) ─────────
// 관절 위치를 입자로 두고 거리 구속으로 몸을 유지한다. 잡은 부위는 손에 고정되고 나머지는 중력에 따라 늘어진다.
const RAG = ['hips', 'chest', 'neck', 'head', 'shL', 'elL', 'hdL', 'shR', 'elR', 'hdR', 'hpL', 'knL', 'ftL', 'hpR', 'knR', 'ftR'];
const RI = Object.fromEntries(RAG.map((k, i) => [k, i]));
const TORSO = ['hips', 'chest', 'neck', 'shL', 'shR', 'hpL', 'hpR'];
const LIMBS = [['neck', 'head'], ['shL', 'elL'], ['elL', 'hdL'], ['shR', 'elR'], ['elR', 'hdR'], ['hpL', 'knL'], ['knL', 'ftL'], ['hpR', 'knR'], ['knR', 'ftR']];
// 너무 접히지 않도록 하는 최소 거리 (팔꿈치·무릎·목)
const MINS = [['shL', 'hdL', 0.45], ['shR', 'hdR', 0.45], ['hpL', 'ftL', 0.55], ['hpR', 'ftR', 0.55], ['chest', 'head', 0.8], ['hips', 'knL', 0.5], ['hips', 'knR', 0.5]];
const RAD = { hips: 0.11, chest: 0.12, neck: 0.08, head: 0.1, shL: 0.06, shR: 0.06, elL: 0.045, elR: 0.045, hdL: 0.04, hdR: 0.04, hpL: 0.08, hpR: 0.08, knL: 0.06, knR: 0.06, ftL: 0.05, ftR: 0.05 };
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _m5 = new THREE.Matrix4();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();

// ───────── GLB 더미 템플릿 ─────────
const MODEL_H = 7.315;
const DUMMY_H = 1.8;
let TEMPLATE = null;

function buildTemplate(src) {
  src = src.clone(true);
  src.updateMatrixWorld(true);
  const find = (prefix) => {
    let r = null;
    src.traverse((o) => {
      if (!r && o.name.startsWith(prefix)) r = o;
    });
    return r;
  };
  const wp = (prefix) => find(prefix).getWorldPosition(new THREE.Vector3());
  const P = {
    hips: wp('Bone_41'), spine: wp('Bone001'), chest: wp('Bone002'), neck: wp('Bone003'), head: wp('Bone004'),
    shL: wp('Bone005'), elL: wp('Bone006'), hdL: wp('Bone007'),
    shR: wp('Bone011'), elR: wp('Bone012'), hdR: wp('Bone013'),
    hpL: wp('Bone008'), knL: wp('Bone009'), ftL: wp('Bone010'),
  };
  // 오른다리는 리깅이 없어 왼다리 관절을 좌우 반전해 사용
  const mx = P.hips.x * 2 + 0.02;
  P.hpR = new THREE.Vector3(mx - P.hpL.x, P.hpL.y, P.hpL.z);
  P.knR = new THREE.Vector3(mx - P.knL.x, P.knL.y, P.knL.z);
  P.ftR = new THREE.Vector3(mx - P.ftL.x, P.ftL.y, P.ftL.z);

  const origin = new THREE.Vector3(P.hips.x, 0.026, P.hips.z);
  const s = DUMMY_H / MODEL_H;
  const model = new THREE.Group();
  model.name = 'dummyModel';
  model.scale.setScalar(s);
  const joints = {};
  const parentOf = {};
  const mk = (key, parentKey) => {
    const g = new THREE.Group();
    g.name = 'J_' + key;
    g.position.subVectors(P[key], parentKey ? P[parentKey] : origin);
    (parentKey ? joints[parentKey] : model).add(g);
    joints[key] = g;
    parentOf[key] = parentKey;
  };
  mk('hips');
  mk('spine', 'hips');
  mk('chest', 'spine');
  mk('neck', 'chest');
  mk('head', 'neck');
  mk('shL', 'chest'); mk('elL', 'shL'); mk('hdL', 'elL');
  mk('shR', 'chest'); mk('elR', 'shR'); mk('hdR', 'elR');
  mk('hpL', 'hips'); mk('knL', 'hpL'); mk('ftL', 'knL');
  mk('hpR', 'hips'); mk('knR', 'hpR'); mk('ftR', 'knR');

  const boneToJoint = { Bone_41: 'hips', Bone001: 'spine', Bone002: 'chest', Bone003: 'neck', Bone004: 'head', Bone005: 'shL', Bone006: 'elL', Bone007: 'hdL', Bone011: 'shR', Bone012: 'elR', Bone013: 'hdR' };
  const meshes = [];
  src.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  for (const o of meshes) {
    let p = o.parent;
    let bone = null;
    while (p) {
      if (/^Bone/.test(p.name)) {
        const head = p.name.split('_')[0];
        bone = head === 'Bone' ? 'Bone_41' : head;
        break;
      }
      p = p.parent;
    }
    const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    let key = boneToJoint[bone];
    if (!key) {
      const side = bone ? 'L' : 'R';
      if (bone === 'Bone010' || c.y < P['ft' + side].y) key = 'ft' + side;
      else if (c.y > P['kn' + side].y) key = 'hp' + side;
      else key = 'kn' + side;
    }
    // 관절의 모델 공간 위치 = P[key]
    const jw = P[key];
    const local = new THREE.Matrix4().makeTranslation(-jw.x, -jw.y, -jw.z).multiply(o.matrixWorld);
    const m = new THREE.Mesh(o.geometry, o.material);
    local.decompose(m.position, m.quaternion, m.scale);
    joints[key].add(m);
  }
  return { model, scale: s };
}

export function dummyTemplate() {
  if (TEMPLATE) return TEMPLATE;
  const src = getModel('dummy');
  if (!src) return null;
  TEMPLATE = buildTemplate(src);
  return TEMPLATE;
}

// ───────── 코드로 만든 대체 모델 ─────────
let G = null;
function geos() {
  if (G) return G;
  const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  G = {
    pelvis: new THREE.BoxGeometry(0.3, 0.16, 0.18), torso: cyl(0.14, 0.19, 0.5, 6), head: new THREE.IcosahedronGeometry(0.115, 1),
    neck: cyl(0.045, 0.05, 0.08, 5), upperArm: cyl(0.055, 0.045, 0.3, 5), forearm: cyl(0.045, 0.038, 0.27, 5),
    hand: new THREE.BoxGeometry(0.07, 0.1, 0.035), thigh: cyl(0.08, 0.06, 0.45, 6), shin: cyl(0.06, 0.045, 0.42, 6), foot: new THREE.BoxGeometry(0.09, 0.06, 0.22),
  };
  for (const k of ['torso', 'upperArm', 'forearm', 'thigh', 'shin', 'neck']) G[k].translate(0, -G[k].parameters.height / 2, 0);
  G.torso.rotateX(Math.PI);
  return G;
}

export class Dummy {
  constructor(world, type = 'basic', hp = 100, pos = new THREE.Vector3()) {
    this.world = world;
    this.type = type;
    const def = DUMMY_TYPES[type] ?? DUMMY_TYPES.basic;
    this.def = def;
    this.scale = def.scale;
    this.infinite = !!def.infinite || hp === Infinity;
    this.hp = this.maxHp = this.infinite ? 1e9 : hp;
    this.alive = true;
    this.kind = 'dummy';
    this.name = NAMES[_nameIdx++ % NAMES.length];
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.root.scale.setScalar(this.scale);
    const tpl = dummyTemplate();
    if (tpl) this._buildFromTemplate(tpl);
    else this._buildProcedural();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.state = 'stand';
    this.stateT = 0;
    this.frozen = false;
    this.flash = 0;
    this.t = Math.random() * 10;
    this.shootT = 1.5 + Math.random() * 2;
    this.punchT = 0;
    this.punchCd = 0;
    this.totalDamage = 0;
    this.dpsWindow = [];
    this.radius = 0.24 * this.scale;
    this.mass = 3 * this.scale * this.scale;
    this.yaw = 0;
    this.heldBy = null;
    this.dying = false;
    this._upright = new THREE.Quaternion();
    this.faceTo(world.ctx.input.head);
    world.scene.add(this.root);
  }

  _buildFromTemplate(tpl) {
    this.glb = true;
    const model = tpl.model.clone(true);
    this.root.add(model);
    const map = new Map();
    this.mats = [];
    const tint = this.def.color;
    model.traverse((o) => {
      if (!o.isMesh) return;
      let m = map.get(o.material);
      if (!m) {
        m = o.material.clone();
        const dark = m.color.r + m.color.g + m.color.b < 0.1;
        if (tint !== null && !dark) m.color.set(tint);
        m.envMap = this.world.envMap;
        m.envMapIntensity = 0.6;
        m.userData.baseEmissive = m.emissive.clone();
        map.set(o.material, m);
        this.mats.push(m);
      }
      o.material = m;
    });
    this.mat = this.mats.find((m) => m.color.r + m.color.g + m.color.b > 0.1) ?? this.mats[0];
    this.color = this.mat.color.clone();
    const J = (k) => model.getObjectByName('J_' + k);
    this.hips = J('hips');
    this.spine = J('chest');
    this.neck = J('neck');
    this.head = J('head');
    this.armL = { sh: J('shL'), el: J('elL'), hd: J('hdL') };
    this.armR = { sh: J('shR'), el: J('elR'), hd: J('hdR') };
    this.legL = { hp: J('hpL'), kn: J('knL'), ft: J('ftL') };
    this.legR = { hp: J('hpR'), kn: J('knR'), ft: J('ftR') };
    this.restZ = 0;
    this.unit = 1 / tpl.scale;
    if (this.def.ai === 'shooter') this._addGun();
  }

  _buildProcedural() {
    this.glb = false;
    this.color = new THREE.Color(this.def.color ?? 0xd8a010);
    this.mat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.3, metalness: 0.1, flatShading: true, envMap: this.world.envMap, envMapIntensity: 0.6 });
    this.mat.userData.baseEmissive = new THREE.Color(0);
    this.mats = [this.mat];
    const g = geos();
    const m = this.mat;
    const mk = (geo, parent, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const J = (parent, x, y, z) => {
      const j = new THREE.Group();
      j.position.set(x, y, z);
      parent.add(j);
      return j;
    };
    this.hips = J(this.root, 0, 0.92, 0);
    mk(g.pelvis, this.hips, 0, 0.02, 0);
    this.spine = J(this.hips, 0, 0.08, 0);
    mk(g.torso, this.spine);
    this.neck = J(this.spine, 0, 0.52, 0);
    mk(g.neck, this.neck, 0, 0.08, 0).rotation.x = Math.PI;
    this.head = J(this.neck, 0, 0.14, 0);
    mk(g.head, this.head);
    const arm = (s) => {
      const sh = J(this.spine, 0.22 * s, 0.45, 0);
      mk(g.upperArm, sh);
      const el = J(sh, 0, -0.3, 0);
      mk(g.forearm, el);
      const hd = J(el, 0, -0.29, 0);
      mk(g.hand, hd, 0, -0.04, 0);
      return { sh, el, hd };
    };
    this.armL = arm(1);
    this.armR = arm(-1);
    const leg = (s) => {
      const hp = J(this.hips, 0.1 * s, -0.02, 0);
      mk(g.thigh, hp);
      const kn = J(hp, 0, -0.45, 0);
      mk(g.shin, kn);
      const ft = J(kn, 0, -0.43, 0);
      mk(g.foot, ft, 0, 0, 0.05);
      return { hp, kn, ft };
    };
    this.legL = leg(1);
    this.legR = leg(-1);
    this.restZ = 0.08;
    this.unit = 1;
    if (this.def.ai === 'shooter') this._addGun();
  }

  _addGun() {
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, flatShading: true }));
    gun.scale.setScalar(this.unit);
    gun.position.set(0, -0.09 * this.unit, 0.08 * this.unit);
    this.armR.hd.add(gun);
    this.gun = gun;
  }

  faceTo(p) {
    _v.subVectors(p, this.root.position).setY(0);
    if (_v.lengthSq() < 1e-4) return;
    this.yaw = Math.atan2(_v.x, _v.z);
    if (this.state === 'stand') this.root.quaternion.setFromAxisAngle(UP, this.yaw);
  }

  center(out = new THREE.Vector3()) {
    return this.root.localToWorld(out.set(0, 1.05, 0));
  }

  headPos(out = new THREE.Vector3()) {
    return this.root.localToWorld(out.set(0, 1.62, 0));
  }

  distanceTo(p) {
    const a = this.root.localToWorld(_v2.set(0, 0.25, 0));
    const b = this.root.localToWorld(_v3.set(0, 1.65, 0));
    const ab = _v.subVectors(b, a);
    const t = THREE.MathUtils.clamp(_v3.subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
    return a.addScaledVector(ab, t).distanceTo(p) - this.radius;
  }

  impulse(v, spin = 0) {
    if (!this.alive || this.state === 'held') return;
    this.vel.add(v);
    if (this.frozen) return;
    if (v.length() > 2.2 * Math.sqrt(this.scale) || this.vel.y > 1.5) {
      if (this.state !== 'air' && this.state !== 'heart') {
        const v0 = this.vel.clone().sub(v);
        this.state = 'air';
        this.stateT = 0;
        if (!this.dying) {
          this._ragStart(v0);
          this.rag.vel.copy(v0); // 이번 충격량은 다음 단계에서 전 입자에 더해진다
        }
      }
      if (spin) this.angVel.add(_v.randomDirection().multiplyScalar(spin));
    }
  }

  damage(amount, info = {}) {
    if (!this.alive || amount <= 0) return 0;
    this.flash = 0.1;
    this.totalDamage += amount;
    this.dpsWindow.push([this.world.time, amount]);
    this.world.onDamage?.(this, amount, info);
    if (this.infinite) return amount;
    this.hp -= amount;
    if (this.hp <= 0) this.kill(info);
    return amount;
  }

  // ── 잡기 / 던지기 ──
  /**
   * @param by { drop() }
   * @param at 잡은 지점(월드). 가장 가까운 관절이 손에 고정된다. 없으면 가슴
   * @returns 잡은 관절 위치 - at (손에 붙일 오프셋)
   */
  grab(by, at = null) {
    if (!this.alive || this.dying) return false;
    this.heldBy = by;
    if (!this.rag) this._ragStart(this.state === 'air' ? this.vel : _v.set(0, 0, 0));
    this.state = 'held';
    this.stateT = 0;
    const R = this.rag;
    let pin = RI.chest;
    if (at) {
      let bd = Infinity;
      for (let i = 0; i < RAG.length; i++) {
        const d = R.p[i].distanceToSquared(at);
        if (d < bd) {
          bd = d;
          pin = i;
        }
      }
    }
    R.pin = pin;
    R.pinTarget.copy(R.p[pin]);
    this.angVel.set(0, 0, 0);
    return at ? R.p[pin].clone().sub(at) : new THREE.Vector3();
  }

  /** 잡고 있는 동안 고정 관절이 따라갈 위치 */
  holdAt(p) {
    if (this.rag) this.rag.pinTarget.copy(p);
  }

  release(vel) {
    this.heldBy = null;
    if (!this.alive) return;
    this.state = 'air';
    this.stateT = 0;
    if (this.rag) {
      this.rag.pin = -1;
      // 손의 움직임으로 생긴 흔들림은 유지하고, 던진 속도를 더한다
      this.rag.vel.copy(this.vel);
      this.vel.add(vel);
      if (vel.lengthSq() < 0.01) this.vel.copy(this.rag.vel);
    } else {
      this.vel.copy(vel);
    }
  }

  // ── 래그돌 ──
  _jointMap() {
    if (this._jm) return this._jm;
    const m = {
      hips: this.hips, chest: this.spine, neck: this.neck, head: this.head,
      shL: this.armL.sh, elL: this.armL.el, hdL: this.armL.hd, shR: this.armR.sh, elR: this.armR.el, hdR: this.armR.hd,
      hpL: this.legL.hp, knL: this.legL.kn, ftL: this.legL.ft, hpR: this.legR.hp, knR: this.legR.kn, ftR: this.legR.ft,
    };
    this._jm = m;
    // GLB: 엉덩이와 가슴 사이의 중간 관절
    this._spineLow = this.root.getObjectByName('J_spine') ?? null;
    return m;
  }

  /** 기본 자세(모든 관절 회전 0)에서의 관절 위치 (root 로컬) */
  _ragRestPose() {
    if (this._rest) return this._rest;
    const J = this._jointMap();
    const all = [...Object.values(J), this._spineLow].filter(Boolean);
    const saved = all.map((j) => j.quaternion.clone());
    const rq = this.root.quaternion.clone();
    const rp = this.root.position.clone();
    for (const j of all) j.quaternion.identity();
    this.root.quaternion.identity();
    this.root.position.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    const rest = RAG.map((k) => J[k].getWorldPosition(new THREE.Vector3()).divideScalar(this.scale));
    all.forEach((j, i) => j.quaternion.copy(saved[i]));
    this.root.quaternion.copy(rq);
    this.root.position.copy(rp);
    this.root.updateMatrixWorld(true);
    const len = (a, b) => rest[RI[a]].distanceTo(rest[RI[b]]) * this.scale;
    const cons = [];
    for (let i = 0; i < TORSO.length; i++) for (let j = i + 1; j < TORSO.length; j++) cons.push([RI[TORSO[i]], RI[TORSO[j]], len(TORSO[i], TORSO[j]), 1]);
    for (const [a, b] of LIMBS) cons.push([RI[a], RI[b], len(a, b), 1]);
    const mins = MINS.map(([a, b, f]) => [RI[a], RI[b], len(a, b) * f]);
    // 다리 관절의 자식 방향(로컬)
    const dir0 = {};
    for (const [a, b] of LIMBS) dir0[a] = J[b].position.clone().normalize();
    this._rest = { rest, cons, mins, dir0 };
    return this._rest;
  }

  _ragStart(vel) {
    const RP = this._ragRestPose();
    this.root.updateMatrixWorld(true);
    const J = this._jointMap();
    const p = [];
    const v = [];
    for (const k of RAG) {
      p.push(J[k].getWorldPosition(new THREE.Vector3()));
      v.push(new THREE.Vector3().copy(vel));
    }
    this.rag = { p, v, prev: p.map((x) => x.clone()), pin: -1, pinTarget: new THREE.Vector3(), vel: new THREE.Vector3().copy(vel), still: 0, rest: RP };
  }

  _ragStep(dt) {
    const R = this.rag;
    const { cons, mins } = R.rest;
    const n = RAG.length;
    // 외부에서 바뀐 속도(충격·인력 등)를 모든 입자에 반영
    _v.subVectors(this.vel, R.vel);
    if (_v.lengthSq() > 1e-8) for (let i = 0; i < n; i++) if (i !== R.pin) R.v[i].add(_v);
    const g = 9.8 * (this.frozen ? 0.15 : 1);
    const damp = this.frozen ? 6 : 0.25;
    const sub = Math.min(4, Math.max(1, Math.ceil(dt / (1 / 90))));
    const h = dt / sub;
    const b = this.world.ctx.env.bounds;
    let impact = 0;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < n; i++) {
        R.prev[i].copy(R.p[i]);
        if (i === R.pin) {
          R.p[i].lerp(R.pinTarget, 1 - Math.exp(-h * 40));
          continue;
        }
        R.v[i].y -= g * h;
        R.v[i].multiplyScalar(Math.max(0, 1 - damp * h));
        R.p[i].addScaledVector(R.v[i], h);
      }
      for (let it = 0; it < 6; it++) {
        for (const [a, c, L] of cons) this._ragSolve(a, c, L, 0);
        for (const [a, c, L] of mins) this._ragSolve(a, c, L, -1);
        for (let i = 0; i < n; i++) {
          const P = R.p[i];
          const r = RAD[RAG[i]] * this.scale;
          if (P.y < r) {
            if (it === 0) impact = Math.max(impact, -R.v[i].y);
            P.y = r;
          }
          if (b) {
            P.x = THREE.MathUtils.clamp(P.x, b.minX, b.maxX);
            P.z = THREE.MathUtils.clamp(P.z, b.minZ, b.maxZ);
          }
        }
      }
      for (let i = 0; i < n; i++) {
        R.v[i].subVectors(R.p[i], R.prev[i]).divideScalar(h);
        const r = RAD[RAG[i]] * this.scale;
        if (R.p[i].y <= r + 0.002) {
          // 바닥 마찰
          const f = Math.max(0, 1 - 12 * h);
          R.v[i].x *= f;
          R.v[i].z *= f;
          if (R.v[i].y > 0) R.v[i].y *= 0.3;
        }
      }
    }
    if (impact > 9 && this.state === 'air') this.damage((impact - 9) * 4, { type: 'impact' });
    // 평균 속도 = 몸 전체 속도
    this.vel.set(0, 0, 0);
    for (let i = 0; i < n; i++) this.vel.add(R.v[i]);
    this.vel.divideScalar(n);
    R.vel.copy(this.vel);
    this._ragApply();
  }

  /** 거리 구속. mode 0: 정확히 L, -1: 최소 L */
  _ragSolve(a, c, L, mode) {
    const R = this.rag;
    const pa = R.p[a];
    const pc = R.p[c];
    _v2.subVectors(pc, pa);
    const d = _v2.length();
    if (d < 1e-6) return;
    if (mode < 0 && d >= L) return;
    const wa = a === R.pin ? 0 : 1;
    const wc = c === R.pin ? 0 : 1;
    const w = wa + wc;
    if (!w) return;
    const k = (d - L) / (d * w);
    pa.addScaledVector(_v2, k * wa);
    pc.addScaledVector(_v2, -k * wc);
  }

  /** 입자 위치 → 몸통 방향 + 팔다리 관절 회전 */
  _ragApply() {
    const R = this.rag;
    const { rest, dir0 } = R.rest;
    const P = R.p;
    const J = this._jointMap();
    // 몸통 기준축 (현재 / 기본 자세)
    const basis = (hips, chest, shL, shR, out) => {
      _by.subVectors(chest, hips).normalize();
      _bx.subVectors(shL, shR);
      _bx.addScaledVector(_by, -_bx.dot(_by)).normalize();
      _bz.crossVectors(_bx, _by);
      return out.makeBasis(_bx, _by, _bz);
    };
    basis(P[RI.hips], P[RI.chest], P[RI.shL], P[RI.shR], _m4);
    basis(rest[RI.hips], rest[RI.chest], rest[RI.shL], rest[RI.shR], _m5);
    _m4.multiply(_m5.transpose());
    const Q = this.root.quaternion.setFromRotationMatrix(_m4);
    this.root.position.copy(P[RI.hips]).sub(_v.copy(rest[RI.hips]).multiplyScalar(this.scale).applyQuaternion(Q));
    this.hips.quaternion.identity();
    this.spine.quaternion.identity();
    this._spineLow?.quaternion.identity();
    // 팔다리·목: 부모 월드 회전 기준으로 자식 관절을 입자 쪽으로 향하게
    const chain = (a, b, parentQ) => {
      _v.subVectors(P[RI[b]], P[RI[a]]);
      if (_v.lengthSq() < 1e-8) return parentQ;
      _v.normalize().applyQuaternion(_qa.copy(parentQ).invert());
      J[a].quaternion.setFromUnitVectors(dir0[a], _v);
      return _qb.copy(parentQ).multiply(J[a].quaternion);
    };
    for (const [a, b, c] of [['shL', 'elL', 'hdL'], ['shR', 'elR', 'hdR'], ['hpL', 'knL', 'ftL'], ['hpR', 'knR', 'ftR']]) {
      const q1 = chain(a, b, Q).clone();
      chain(b, c, q1);
      J[c].quaternion.identity();
    }
    chain('neck', 'head', Q);
    J.head.quaternion.identity();
  }

  // ── 데스노트: 심장마비 ──
  heartAttack() {
    if (!this.alive || this.dying) return;
    this.dying = true;
    this.heldBy?.drop?.();
    this.heldBy = null;
    this.state = 'heart';
    this.stateT = 0;
    this.vel.set(0, 0, 0);
  }

  kill(info = {}) {
    if (!this.alive) return;
    this.alive = false;
    this.heldBy?.drop?.();
    this.world.onKill?.(this, info);
    const W = this.world;
    const c = this.center();
    this.root.updateMatrixWorld(true);
    const type = info.type ?? 'shatter';
    if (type === 'slash' && info.plane) {
      W.slicer.slice(this.root, info.plane, { color: this.color, vel: this.vel.clone().add(info.push ?? _v.set(0, 0, 0)), center: c, radius: 0.35 * this.scale, sep: 1.2 });
      W.shatter.emit(info.plane.projectPoint(c, new THREE.Vector3()), 12, this.color, { spread: 0.3, speed: 2.5, size: 0.04 });
      this._dispose();
    } else if (type === 'cleave' && info.planes?.length) {
      let pieces = W.slicer.slice(this.root, info.planes[0], { color: this.color, vel: this.vel.clone(), center: c, radius: 0.32 * this.scale, sep: 0.8 });
      for (let i = 1; i < Math.min(3, info.planes.length); i++) {
        const next = [];
        for (const p of pieces) next.push(...W.slicer.sliceAgain(p, info.planes[i], { sep: 0.6, radius: 0.22 * this.scale }));
        pieces = next;
      }
      if (info.planes.length > 3) {
        for (const p of pieces) W.slicer.shatterPiece(p, 30);
        W.shatter.emit(c, 60, this.color, { box: _v.set(0.5, 1.6, 0.4).multiplyScalar(this.scale), speed: 1.5, size: 0.035, up: 0.5 });
      }
      this._dispose();
    } else if (type === 'erase') {
      W.ctx.fx.burst(c, 50, new THREE.Color(0xc07bff), 2, 0.05, 0.7, { spread: 0.5 * this.scale, drag: 3 });
      W.scene.remove(this.root);
      this._dispose();
    } else if (type === 'fade') {
      W.ctx.fx.burst(c, 60, new THREE.Color(0x222222), 1.2, 0.06, 1.4, { dark: true, spread: 0.6, up: 1, grav: -0.5, drag: 1.5 });
      W.scene.remove(this.root);
      this._dispose();
    } else {
      W.shatter.emit(c, Math.round(70 * this.scale), info.burn ? 0x2a1a14 : this.color, {
        box: _v2.set(0.45, 1.7, 0.35).multiplyScalar(this.scale), speed: info.speed ?? 3.5, dir: info.dir ?? _v.set(0, 0, 0), dirAmt: info.dirAmt ?? 3, size: 0.055 * this.scale,
      });
      W.scene.remove(this.root);
      this._dispose();
    }
  }

  _dispose() {
    for (const m of this.mats) m.dispose();
    this.gun?.material.dispose();
  }

  get dps() {
    const now = this.world.time;
    this.dpsWindow = this.dpsWindow.filter((d) => now - d[0] < 2);
    let s = 0;
    for (const d of this.dpsWindow) s += d[1];
    return s / 2;
  }

  _setEmissive(c) {
    for (const m of this.mats) m.emissive.copy(c);
  }

  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    this.stateT += dt;
    if (this.flash > 0) {
      this.flash -= dt;
      this._setEmissive(_c.setRGB(1, 1, 1).multiplyScalar(Math.max(0, this.flash) * 5));
      if (this.flash <= 0) for (const m of this.mats) m.emissive.copy(m.userData.baseEmissive);
    }
    if (this.state === 'held') {
      if (!this.rag) this._ragStart(_v.set(0, 0, 0));
      this._ragStep(dt);
      return;
    }
    if (this.state === 'air' && this.rag) {
      this._ragStep(dt);
      if (this.frozen) {
        if (this.flash <= 0) this._setEmissive(_c.setHSL(0.58, 0.8, 0.08 + Math.random() * 0.1));
        return;
      }
      // 거의 멈추면 쓰러진 자세 그대로 'down'
      let maxV = 0;
      let low = true;
      for (let i = 0; i < RAG.length; i++) {
        maxV = Math.max(maxV, this.rag.v[i].lengthSq());
        if (i === RI.hips && this.rag.p[i].y > 0.45 * this.scale) low = false;
      }
      this.rag.still = maxV < 0.25 ? this.rag.still + dt : 0;
      if ((this.rag.still > 0.35 && (low || this.stateT > 3)) || this.stateT > 8) {
        this.rag = null;
        this.vel.set(0, 0, 0);
        this.angVel.set(0, 0, 0);
        this.state = 'down';
        this.stateT = 0;
      }
      if (this.root.position.lengthSq() > 250 * 250 || this.root.position.y < -20) this.kill({ type: 'erase' });
      return;
    }
    if (this.frozen) {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.angVel.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.head.rotation.z = (Math.random() - 0.5) * 0.15;
      this.armL.sh.rotation.x = (Math.random() - 0.5) * 0.1;
      this.armR.sh.rotation.x = (Math.random() - 0.5) * 0.1;
      if (this.flash <= 0) this._setEmissive(_c.setHSL(0.58, 0.8, 0.08 + Math.random() * 0.1));
      if (this.state === 'air') this._integrate(dt, 0.15);
      return;
    }
    if (this.state === 'heart') {
      const k = Math.min(1, this.stateT / 1.1);
      this._pose(dt, 'clutch', k);
      if (this.stateT > 1.4) {
        this.state = 'air';
        this.stateT = 0;
        this.angVel.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(2.2);
      }
      return;
    }
    if (this.state === 'stand') {
      this._ai(dt);
      this.root.position.addScaledVector(this.vel, dt);
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.root.position.y = Math.max(0, this.root.position.y);
    } else if (this.state === 'air') {
      this._integrate(dt, 1);
      if (this.dying) this._pose(dt, 'clutch', 1);
      if (this.grounded && this.vel.lengthSq() < 0.3 && this.angVel.lengthSq() < 1 && this.stateT > 0.8) {
        this.state = 'down';
        this.stateT = 0;
      }
    } else if (this.state === 'down') {
      this.vel.set(0, 0, 0);
      if (this.dying) {
        if (this.stateT > 2.5) this.kill({ type: 'fade' });
        return;
      }
      if (this.stateT > 1.2) {
        this.state = 'getup';
        this.stateT = 0;
        this._getupFrom = this.root.quaternion.clone();
        this._getupPos = this.root.position.clone();
        _v.set(0, 0, 1).applyQuaternion(this.root.quaternion).setY(0);
        if (_v.lengthSq() > 1e-3) this.yaw = Math.atan2(_v.x, _v.z);
        this._upright.setFromAxisAngle(UP, this.yaw);
        const J = this._jointMap();
        this._getupJ = Object.values(J).map((j) => [j, j.quaternion.clone()]);
      }
    } else if (this.state === 'getup') {
      const k = Math.min(1, this.stateT / 0.7);
      const e = k * k * (3 - 2 * k);
      // 래그돌로 꺾인 관절을 기본 자세로 되돌린다
      if (this._getupJ) for (const [j, q0] of this._getupJ) j.quaternion.slerpQuaternions(q0, _q.identity(), e);
      if (k >= 1) this._getupJ = null;
      this.root.quaternion.slerpQuaternions(this._getupFrom, this._upright, e);
      this.root.position.copy(this._getupPos).lerp(_v.set(this._getupPos.x, 0, this._getupPos.z), e);
      if (k >= 1) {
        this.state = 'stand';
        this.stateT = 0;
      }
    }
    if (this.root.position.lengthSq() > 250 * 250 || this.root.position.y < -20) this.kill({ type: 'erase' });
  }

  _pose(dt, kind, k = 1) {
    const L = (o, axis, v, sp = 8) => (o.rotation[axis] = THREE.MathUtils.lerp(o.rotation[axis], v, Math.min(1, dt * sp)));
    if (kind === 'limp') {
      const sw = Math.sin(this.t * 3) * 0.25;
      L(this.armL.sh, 'x', -0.3 + sw);
      L(this.armR.sh, 'x', -0.3 - sw);
      L(this.armL.el, 'x', -0.4);
      L(this.armR.el, 'x', -0.4);
      L(this.legL.hp, 'x', 0.3 + sw * 0.5);
      L(this.legR.hp, 'x', 0.1 - sw * 0.5);
      L(this.legL.kn, 'x', 0.5);
      L(this.legR.kn, 'x', 0.3);
      L(this.head, 'x', 0.4);
    } else if (kind === 'clutch') {
      L(this.armR.sh, 'x', -1.3 * k);
      L(this.armR.sh, 'z', 0.6 * k);
      L(this.armR.el, 'x', -1.6 * k);
      L(this.armL.sh, 'x', -1.1 * k);
      L(this.armL.sh, 'z', -0.5 * k);
      L(this.armL.el, 'x', -1.4 * k);
      L(this.spine, 'x', 0.35 * k);
      L(this.head, 'x', 0.3 * k + (Math.random() - 0.5) * 0.1 * k);
      L(this.legL.kn, 'x', 0.6 * k);
      L(this.legR.kn, 'x', 0.6 * k);
      L(this.legL.hp, 'x', -0.3 * k);
      L(this.legR.hp, 'x', -0.3 * k);
    }
  }

  _integrate(dt, gScale) {
    this.vel.y -= 9.8 * dt * gScale;
    if (this.vel.lengthSq() > 30 * 30) this.vel.setLength(30);
    const c = this.center(_v3);
    const ang = this.angVel.length();
    if (ang > 1e-4) {
      _q.setFromAxisAngle(_v.copy(this.angVel).divideScalar(ang), ang * dt);
      this.root.quaternion.premultiply(_q);
      this.root.position.sub(c).applyQuaternion(_q).add(c);
    }
    this.root.position.addScaledVector(this.vel, dt);
    this.grounded = false;
    for (const y of [0.05, 1.75, 1.0]) {
      const p = this.root.localToWorld(_v.set(0, y, 0));
      const r = y === 1.0 ? 0.2 * this.scale : 0.1 * this.scale;
      if (p.y < r) {
        this.root.position.y += r - p.y;
        this.grounded = true;
      }
    }
    // 배경 경계(벽)에서 튕김
    const b = this.world.ctx.env.bounds;
    if (b) {
      const P = this.root.position;
      if (P.x < b.minX) { P.x = b.minX; this.vel.x = Math.abs(this.vel.x) * 0.4; }
      if (P.x > b.maxX) { P.x = b.maxX; this.vel.x = -Math.abs(this.vel.x) * 0.4; }
      if (P.z < b.minZ) { P.z = b.minZ; this.vel.z = Math.abs(this.vel.z) * 0.4; }
      if (P.z > b.maxZ) { P.z = b.maxZ; this.vel.z = -Math.abs(this.vel.z) * 0.4; }
    }
    if (this.grounded) {
      if (this.vel.y < 0) {
        const imp = -this.vel.y;
        if (imp > 9) this.damage((imp - 9) * 4, { type: 'impact' });
        this.vel.y = imp * 0.25;
      }
      this.vel.x *= Math.max(0, 1 - dt * 4);
      this.vel.z *= Math.max(0, 1 - dt * 4);
      this.angVel.multiplyScalar(Math.max(0, 1 - dt * 5));
      _v.set(0, 1, 0).applyQuaternion(this.root.quaternion);
      if (_v.y > 0.3) this.angVel.add(_v2.crossVectors(_v, UP).normalize().multiplyScalar(-dt * 10));
    }
  }

  _ai(dt) {
    const W = this.world;
    const head = W.ctx.input.head;
    const ai = W.settings.dummyAI ? this.def.ai : 'idle';
    this.spine.rotation.x = Math.sin(this.t * 1.6) * 0.02;
    this.spine.rotation.z = THREE.MathUtils.lerp(this.spine.rotation.z, 0, dt * 5);
    this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, 0, dt * 5);
    this.head.rotation.y = Math.sin(this.t * 0.4) * 0.15;
    const rest = (arm, s) => {
      arm.sh.rotation.x = THREE.MathUtils.lerp(arm.sh.rotation.x, 0, dt * 6);
      arm.sh.rotation.z = THREE.MathUtils.lerp(arm.sh.rotation.z, this.restZ * s, dt * 6);
      arm.el.rotation.x = THREE.MathUtils.lerp(arm.el.rotation.x, -0.1, dt * 6);
    };
    if (ai === 'idle') {
      rest(this.armL, 1);
      rest(this.armR, -1);
      this._legs(0, dt);
      return;
    }
    this.faceTo(head);
    const flat = _v.subVectors(head, this.root.position).setY(0);
    const dist = flat.length();
    if (ai === 'shooter') {
      rest(this.armL, 1);
      this._legs(0, dt);
      this.shootT -= dt;
      const aiming = this.shootT < 0.7;
      this.armR.sh.rotation.x = THREE.MathUtils.lerp(this.armR.sh.rotation.x, aiming ? -Math.PI / 2 : 0, dt * 8);
      this.armR.el.rotation.x = THREE.MathUtils.lerp(this.armR.el.rotation.x, 0, dt * 8);
      if (this.shootT <= 0) {
        this.shootT = 2.2 + Math.random() * 1.5;
        W.spawnBullet(this.gun.localToWorld(_v2.set(0, 0, 0.12)), head);
      }
    } else if (ai === 'rusher') {
      const reach = 0.85 * this.scale;
      this.punchCd -= dt;
      if (this.punchT > 0) {
        this.punchT -= dt;
        const k = 1 - this.punchT / 0.45;
        const ext = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
        this.armR.sh.rotation.x = (-Math.PI / 2) * ext;
        this.armR.el.rotation.x = -0.2 * (1 - ext);
        if (!this._punchHit && k > 0.38) {
          this._punchHit = true;
          W.dummyMelee(this, this.armR.hd.getWorldPosition(_v2), 8);
        }
        this._legs(0, dt);
      } else if (dist > reach) {
        const sp = 1.7 * Math.sqrt(this.scale);
        flat.normalize();
        this.root.position.addScaledVector(flat, sp * dt);
        this._legs(sp, dt);
        this.armR.sh.rotation.x = Math.sin(this.t * 7) * 0.4;
        this.armL.sh.rotation.x = -Math.sin(this.t * 7) * 0.4;
      } else {
        this._legs(0, dt);
        if (this.punchCd <= 0) {
          this.punchT = 0.45;
          this.punchCd = 1.1;
          this._punchHit = false;
        }
      }
    }
  }

  _legs(speed, dt) {
    const a = speed > 0 ? Math.sin(this.t * 7) * 0.55 : 0;
    const lerp = (o, v) => (o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, v, Math.min(1, dt * 10)));
    lerp(this.legL.hp, a);
    lerp(this.legR.hp, -a);
    lerp(this.legL.kn, speed > 0 ? Math.max(0, -a) * 1.2 + 0.1 : 0);
    lerp(this.legR.kn, speed > 0 ? Math.max(0, a) * 1.2 + 0.1 : 0);
  }
}
