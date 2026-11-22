// 테스트 더미 (첨부 GLB 모델 사용, 로드 실패 시 코드로 만든 인간형)
// GLB의 본 계층을 그대로 쓰지 않고, 본 위치에 축 정렬 관절을 새로 만들어 부위별 메시를 붙인다.
import * as THREE from 'three';
import { getModel } from './assets.js';
import { RiggedBody } from './rigged.js';
import { sever as severPart, regrow as regrowParts, lostKeys, PARENT as JPARENT } from './dismember.js';
import { startGetup, stepGetup, tryLand, stepDrop, stepLand } from './recover.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const lerpN = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));

export const DUMMY_TYPES = {
  basic: { label: '기본', color: null, scale: 1, ai: 'idle' },
  shooter: { label: '사격형', color: 0xc8261c, scale: 1, ai: 'shooter' },
  rusher: { label: '돌격형', color: 0xe8640c, scale: 1, ai: 'rusher' },
  giant: { label: '거대', color: 0x6a3ad0, scale: 1.45, ai: 'rusher' },
  sandbag: { label: '샌드백(∞)', color: 0xe8e8e8, scale: 1, ai: 'idle', infinite: true },
  // ── 주령 · 주저사 (주술회전 게임 모델). hp 는 체력 메뉴 100 기준, h 는 키(m)
  // curse: 주령조술로 거둘 수 있다 · orb: 주령구 색 · grade: 등급
  mahito: { rct: 'reshape', label: '마히토', model: 'mahito', h: 1.78, hp: 600, ai: 'rusher', speed: 2.2, punch: 14, curse: true, grade: '특급', orb: 0x8fc4d8, shard: 0x9aa8b0, blade: true, domain: true },
  jogo: { rct: 'regen', label: '죠고', model: 'jogo', h: 1.5, hp: 500, ai: 'shooter', bullet: 'fire', shootCd: 1.6, curse: true, grade: '특급', orb: 0xff7a2a, shard: 0xd8c8a8, domain: true },
  fingerBearer: { rct: 'regen', domain: true, label: '손가락 보유자', model: 'fingerBearer', h: 1.95, hp: 700, ai: 'rusher', speed: 2.6, punch: 16, curse: true, grade: '특급', orb: 0xd8203a, shard: 0xe0e0e0 },
  kuchisake: { label: '쿠치사케온나', model: 'kuchisake', h: 1.82, hp: 260, ai: 'rusher', speed: 1.6, punch: 10, curse: true, grade: '1급', orb: 0xf0c890, shard: 0xd8c0a0 },
  cyclops: { label: '단안 주령', model: 'cyclops', h: 4.0, hp: 500, ai: 'rusher', speed: 1.3, punch: 20, curse: true, grade: '1급', orb: 0x50c0ff, shard: 0xe8e0e0 },
  // 고죠 사토루: 무하한(영역의 필중이 아니면 거의 닿지 않는다) · 아오/아카/무라사키 · 무량공처
  gojo: { rct: 'rct', label: '고죠 사토루', model: 'gojo', h: 1.9, hp: 1400, ai: 'rusher', speed: 2.4, punch: 16, grade: '특급 술사', shard: 0xe8e8f0, domain: true, infinity: true },
  bagmask: { label: '주저사(봉투)', model: 'bagmask', h: 1.85, hp: 160, ai: 'rusher', speed: 2.0, punch: 9, grade: '주저사', shard: 0xc8a070 },
};

const NAMES = ['다나카 히로시', '스즈키 켄타', '야마다 타로', '사토 유이치', '이토 마사키', '와타나베 쇼', '나카무라 료', '고바야시 준', '카토 다이스케', '요시다 하루', '야마모토 렌', '마츠모토 카이', '이노우에 소타', '기무라 히나', '하야시 아오이', '시미즈 유키', '모리 겐지', '이케다 세나'];
let _nameIdx = Math.floor(Math.random() * NAMES.length);

// ───────── 래그돌 (위치 기반 물리) ─────────
// 관절 위치를 입자로 두고 거리 구속으로 몸을 유지한다. 잡은 부위는 손에 고정되고 나머지는 중력에 따라 늘어진다.
export const RAG = ['hips', 'chest', 'neck', 'head', 'shL', 'elL', 'hdL', 'shR', 'elR', 'hdR', 'hpL', 'knL', 'ftL', 'hpR', 'knR', 'ftR'];
const RI = Object.fromEntries(RAG.map((k, i) => [k, i]));
const TORSO = ['hips', 'chest', 'neck', 'shL', 'shR', 'hpL', 'hpR'];
const TORSO_I = new Set(TORSO.map((k) => RAG.indexOf(k)));
const LIMBS = [['neck', 'head'], ['shL', 'elL'], ['elL', 'hdL'], ['shR', 'elR'], ['elR', 'hdR'], ['hpL', 'knL'], ['knL', 'ftL'], ['hpR', 'knR'], ['knR', 'ftR']];
// 너무 접히지 않도록 하는 최소 거리 (팔꿈치·무릎·목)
const MINS = [['shL', 'hdL', 0.45], ['shR', 'hdR', 0.45], ['hpL', 'ftL', 0.55], ['hpR', 'ftR', 0.55], ['chest', 'head', 0.8], ['hips', 'knL', 0.5], ['hips', 'knR', 0.5]];
// 관절 둘레 반지름: 쓰러졌을 때 몸 겉면이 바닥을 뚫지 않게 실제 두께에 맞춘다
const RAD = { hips: 0.15, chest: 0.16, neck: 0.09, head: 0.12, shL: 0.09, shR: 0.09, elL: 0.06, elR: 0.06, hdL: 0.05, hdR: 0.05, hpL: 0.1, hpR: 0.1, knL: 0.075, knR: 0.075, ftL: 0.07, ftR: 0.07 };
// ── 선분 사이 가장 가까운 점 (캡슐 충돌) ──
const _sd1 = new THREE.Vector3();
const _sd2 = new THREE.Vector3();
const _sr = new THREE.Vector3();
const _sq1 = new THREE.Vector3();
const _sq2 = new THREE.Vector3();
const _cs = { s: 0, t: 0, d: 0, n: new THREE.Vector3() };
/** p1→q1(끝을 e1 만큼 늘임) 과 p2→q2(e2) 의 가장 가까운 점: s,t (늘인 선분 기준 0~1), 거리 d, n(2→1 방향) */
function closestSeg(p1, q1, e1, p2, q2, e2) {
  const d1 = _sd1.subVectors(q1, p1).multiplyScalar(1 + e1);
  const d2 = _sd2.subVectors(q2, p2).multiplyScalar(1 + e2);
  const r = _sr.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s;
  let t;
  if (a < 1e-10 && e < 1e-10) {
    s = t = 0;
  } else if (a < 1e-10) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e < 1e-10) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const den = a * e - b * b;
      s = den > 1e-10 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  _sq1.copy(p1).addScaledVector(d1, s);
  _sq2.copy(p2).addScaledVector(d2, t);
  _cs.n.subVectors(_sq1, _sq2);
  _cs.d = _cs.n.length();
  if (_cs.d > 1e-6) _cs.n.divideScalar(_cs.d);
  else {
    // 정확히 겹쳤다: 두 선분에 수직인 방향으로
    _cs.n.crossVectors(d1, d2);
    if (_cs.n.lengthSq() < 1e-10) _cs.n.set(0, 1, 0);
    _cs.n.normalize();
  }
  _cs.s = s;
  _cs.t = t;
  return _cs;
}
/** 기본 자세(크기 반영)에서 두 캡슐 선분의 거리 */
function segDist(P, A, B) {
  return closestSeg(P[A.a], P[A.b], A.ext, P[B.a], P[B.b], B.ext).d;
}

// 몸끼리 뚫지 않게: 부위마다 캡슐 [시작, 끝, 반지름(키 1.8 기준), 끝을 더 늘이는 비율(손 · 발 · 머리통)]
const SEGS = [
  ['hips', 'chest', 0.13, 0], // 몸통 가운데
  ['shL', 'hpL', 0.06, 0], // 몸통 옆
  ['shR', 'hpR', 0.06, 0],
  ['neck', 'head', 0.1, 1.0], // 머리통 (머리 관절은 두개골 밑이라 위로 늘인다)
  ['shL', 'elL', 0.055, 0],
  ['elL', 'hdL', 0.05, 0.4], // 아래팔 + 손
  ['shR', 'elR', 0.055, 0],
  ['elR', 'hdR', 0.05, 0.4],
  ['hpL', 'knL', 0.08, 0],
  ['knL', 'ftL', 0.06, 0.15], // 정강이 + 발
  ['hpR', 'knR', 0.08, 0],
  ['knR', 'ftR', 0.06, 0.15],
];
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
    this.name = def.model ? def.label : NAMES[_nameIdx++ % NAMES.length];
    if (def.h) this.scale = def.h / DUMMY_H;
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.root.scale.setScalar(this.scale);
    const tpl = dummyTemplate();
    if (def.model && this._buildFromRig(def)) { /* 스키닝 모델 */ }
    else if (tpl) this._buildFromTemplate(tpl);
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
    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
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

  /** 주술회전 게임 모델: 뼈 위치에 더미 관절을 세우고 매 프레임 뼈로 옮긴다 (rigged.js) */
  _buildFromRig(def) {
    const body = new RiggedBody(def.model, { height: DUMMY_H, outline: 0.011 / this.scale });
    if (!body.ok || !body.J) return false;
    this.glb = true;
    this.rig = body;
    this.root.add(body.model);
    this.mats = body.mats;
    this.mat = this.mats[0];
    this.color = new THREE.Color(def.shard ?? 0x9a9a9a);
    const J = body.J;
    this.hips = J.hips;
    this.spine = J.chest;
    this.neck = J.neck;
    this.head = J.head;
    this.armL = { sh: J.shL, el: J.elL, hd: J.hdL };
    this.armR = { sh: J.shR, el: J.elR, hd: J.hdR };
    this.legL = { hp: J.hpL, kn: J.knL, ft: J.ftL };
    this.legR = { hp: J.hpR, kn: J.knR, ft: J.ftR };
    // 바인드는 A자 자세 → 팔을 내린 각도를 쉬는 자세로
    const P = body.P;
    const a = Math.atan2(P.elL.x - P.shL.x, P.shL.y - P.elL.y);
    this.restZ = -Math.max(0, a - 0.12);
    this.armL.sh.rotation.z = this.restZ;
    this.armR.sh.rotation.z = -this.restZ;
    this.unit = 1 / body.scale;
    return true;
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

  /** 버티는 힘 (맷집): 이게 다 깎이거나 아주 센 한 방이어야 쓰러진다 */
  get maxPoise() {
    if (this.def.poise) return this.def.poise;
    if (this.infinite) return 60;
    return Math.min(180, 40 + this.maxHp * 0.12);
  }

  /**
   * 팔다리 맷집: 이보다 약한 참격으로는 팔다리가 잘려 나가지 않는다 (강한 적은 약한 참격에 버틴다)
   *  머리는 이 두 배가 넘어야 떨어진다
   */
  get limbGuard() {
    if (this.def.limbGuard != null) return this.def.limbGuard;
    const g = this.def.grade;
    const base = g === '특급 술사' ? 260 : g === '특급' ? 140 : g === '1급' ? 60 : g === '주저사' ? 22 : 6;
    return base * Math.pow(Math.max(1, this.scale), 1.5);
  }

  /** 잃은 관절 (래그돌 입자 번호 · 그 입자가 따라붙을 남은 관절) */
  _lost() {
    if (this._lostIdx) return this._lostIdx;
    const keys = lostKeys(this);
    const set = new Set();
    const anchor = new Map();
    for (const k of keys) {
      if (RI[k] === undefined) continue;
      set.add(RI[k]);
      let a = JPARENT[k];
      while (a && (keys.has(a) || RI[a] === undefined)) a = JPARENT[a];
      anchor.set(RI[k], RI[a ?? 'hips']);
    }
    this._lostIdx = { set, anchor, keys };
    return this._lostIdx;
  }

  _ragIndex() {
    return RAG;
  }

  /** 다리(무릎 아래라도)를 잃어 설 수 없다 */
  get legless() {
    const k = this._lost().keys;
    return k.has('knL') || k.has('knR');
  }

  /** 그 손을 잃었다 (S: 'L' | 'R') */
  handless(S) {
    return this._lost().keys.has('hd' + S);
  }

  /** 관절에서 부위를 떼어 낸다 (dismember.js). 반전술식 · 재생이 있으면 잠시 뒤 되살린다 */
  sever(root, opts = {}) {
    const p = severPart(this, root, opts);
    if (p && !this.dying) {
      const kind = this.infinite ? 'sandbag' : this.def.rct;
      const delay = { sandbag: 3, rct: 2.5, reshape: 1.5, regen: 4 }[kind];
      if (delay) this._regrowAt = this.world.time + delay;
    }
    return p;
  }

  /** 피를 쏟으며 쓰러져 죽는다 (머리를 잃었을 때 · 뜯겨 숨이 다했을 때) */
  bleedOut() {
    if (!this.alive || this.dying) return;
    this.dying = true;
    this.hp = Math.min(this.hp, 0);
    this._dropAll();
    this.heldBy = null;
    if (this.state !== 'air' || !this.rag) this._ragStart(this.vel);
    this.state = 'air';
    this.stateT = 0;
  }

  /** 참격(평면)이 팔다리 · 목을 지나면 그 부위가 잘려 나간다 — 팔다리 맷집(limbGuard)보다 세야 한다 */
  _slashSever(amount, info) {
    const guard = this.limbGuard;
    if (amount < guard || this.world.time < (this._sevT ?? 0)) return;
    const planes = info.planes?.length ? info.planes.slice(0, 3) : info.plane ? [info.plane] : [];
    if (!planes.length) return;
    this.root.updateMatrixWorld(true);
    const J = this._jointMap();
    const lost = this._lost().keys;
    const sc = this.scale;
    const SEGS = [['head', 'neck', 'head', 0.9], ['shL', 'shL', 'elL', 0], ['elL', 'elL', 'hdL', 0.35], ['shR', 'shR', 'elR', 0], ['elR', 'elR', 'hdR', 0.35], ['hpL', 'hpL', 'knL', 0], ['knL', 'knL', 'ftL', 0.1], ['hpR', 'hpR', 'knR', 0], ['knR', 'knR', 'ftR', 0.1]];
    const cands = [];
    for (const pl of planes) {
      const anchor = info.point ?? info.at ?? pl.projectPoint(this.center(_v3), new THREE.Vector3());
      for (const [root, a, b, ext] of SEGS) {
        if (lost.has(root) || lost.has(b)) continue;
        if (root === 'head' && amount < guard * 2) continue;
        const pa = J[a].getWorldPosition(new THREE.Vector3());
        const pb = J[b].getWorldPosition(new THREE.Vector3());
        if (ext) pb.addScaledVector(_v.subVectors(pb, pa), ext);
        const da = pl.distanceToPoint(pa);
        const db = pl.distanceToPoint(pb);
        if (da * db >= 0) continue;
        const x = pa.clone().lerp(pb, da / (da - db));
        const dist = x.distanceTo(anchor);
        if (dist > 0.95 * sc) continue;
        cands.push({ root, dist, side: db > 0 ? 1 : -1, n: pl.normal });
      }
    }
    cands.sort((p, q) => p.dist - q.dist);
    const done = new Set();
    let n = 0;
    for (const c of cands) {
      const limb = c.root === 'head' ? 'head' : c.root.slice(2); // 'L' | 'R' 팔 · 다리 구분
      const grp = c.root === 'head' ? 'head' : (c.root[0] === 's' || c.root[0] === 'e' ? 'arm' : 'leg') + limb;
      if (done.has(grp)) continue;
      done.add(grp);
      const vel = (info.push ? info.push.clone().multiplyScalar(0.8) : new THREE.Vector3()).addScaledVector(c.n, c.side * 1.6).add(_v.set(0, 1.4, 0));
      if (this.sever(c.root, { vel, cause: 'slash', spurt: 1.2, spin: 7 })) n++;
      if (n >= 2 || !this.alive || this.dying) break;
    }
    if (n) this._sevT = this.world.time + 0.2;
  }

  impulse(v, spin = 0) {
    if (!this.alive || this.state === 'held') return;
    // 서 있을 때 맞으면: 맷집으로 버티며 움찔하고 조금 밀린다 (쓰러지지 않는다)
    const s = v.length() / Math.sqrt(this.scale);
    if (this.state === 'stand' && !this.dying && !this.frozen && s > 1.2 && !this.heldBy) {
      const P = (this._poise ??= { v: this.maxPoise, t: -10 });
      const cost = s * 5;
      if (s < 11 && P.v - cost > 0) {
        P.v -= cost;
        P.t = this.world.time;
        _v.copy(v).setY(0).clampLength(0, 1.4 + s * 0.08);
        this.vel.add(_v);
        const dir = v.clone().setY(0);
        if (dir.lengthSq() < 1e-4) dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
        this.recoil = { t: 0, dir: dir.normalize(), k: Math.min(1, 0.35 + s / 8) };
        this.onFlinch?.(s);
        return;
      }
      P.v = this.maxPoise; // 무너졌다 → 쓰러지고, 일어나면 다시 가득
      this.world.ctx?.ui?.callout?.('무너졌다!', { color: '#ffd080', size: 34, dur: 0.6 });
    }
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
    this._hurtT = this.world.time;
    const cut = (info.type === 'slash' || info.type === 'cleave') && (info.plane || info.planes) && !this.dying;
    if (this.infinite) {
      if (cut) this._slashSever(amount, info);
      return amount;
    }
    this.hp -= amount;
    if (this.hp <= 0) this.kill(info);
    else if (cut) this._slashSever(amount, info);
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
    // 두 손으로 잡기: 이미 다른 손이 잡고 있으면 다른 관절을 하나 더 붙잡는다
    this.holders ??= new Map();
    if (this.holders.size && this.holders.has(by)) return false;
    if (!this.holders.size) this.heldBy = by;
    if (!this.rag) this._ragStart(this.state === 'air' ? this.vel : _v.set(0, 0, 0));
    this.state = 'held';
    this.stateT = 0;
    const R = this.rag;
    R.pins ??= new Map();
    let pin = RI.chest;
    if (at) {
      let bd = Infinity;
      const lost = this._lost().set;
      for (let i = 0; i < RAG.length; i++) {
        if (R.pins.has(i) || lost.has(i)) continue;
        const d = R.p[i].distanceToSquared(at);
        if (d < bd) {
          bd = d;
          pin = i;
        }
      }
    }
    R.pins.set(pin, R.p[pin].clone());
    // 손 회전을 따라가는 몸통 (몸통을 잡았을 때만): 첫 holdAt 에서 손 기준 자세를 잰다
    R.grip ??= new Map();
    R.grip.set(pin, { q: null, offs: null });
    this.holders.set(by, pin);
    R.pin = [...R.pins.keys()][0];
    R.pinTarget.copy(R.pins.get(R.pin));
    this.angVel.set(0, 0, 0);
    return at ? R.p[pin].clone().sub(at) : new THREE.Vector3();
  }

  _dropAll() {
    const hs = this.holders?.size ? [...this.holders.keys()] : this.heldBy ? [this.heldBy] : [];
    this.holders?.clear();
    this.rag?.pins?.clear();
    this.rag?.grip?.clear();
    for (const b of hs) b?.drop?.();
  }

  /** 지금 잡고 있는 손 수 */
  holdCount() {
    return this.holders?.size ?? (this.heldBy ? 1 : 0);
  }

  /** 잡고 있는 동안 고정 관절이 따라갈 위치 (by: 어느 손 — 없으면 첫 손) */
  holdAt(p, by = null, q = null) {
    if (!this.rag) return;
    const pin = by && this.holders?.has(by) ? this.holders.get(by) : this.rag.pin;
    if (this.rag.pins?.has(pin)) this.rag.pins.get(pin).copy(p);
    if (pin === this.rag.pin) this.rag.pinTarget.copy(p);
    // 손의 회전: 몸통을 쥐었으면 몸통이 손을 따라 돌고, 손이 안 돌면 몸도 안 돈다
    const G = this.rag.grip?.get(pin);
    if (G && q) (G.q ??= new THREE.Quaternion()).copy(q);
  }

  /**
   * 잡힌 동안: 몸통을 쥔 손마다 몸통 관절들이 손 기준 자리(쥔 순간의 자세)를 지키게 한다.
   *  팔·다리는 그대로 늘어지고 흔들린다. 손 회전을 모르면(데스크톱) 쥔 순간의 방향을 지킨다
   */
  _gripTorso(k) {
    const R = this.rag;
    if (!R.grip?.size || !R.pins?.size) return;
    const lost = this._lostIdx?.set;
    // 발이 땅에 닿아 있으면 팔·머리를 잡혀도 버티고 서 있다 (들어 올리면 그때부터 늘어진다)
    let feet = Infinity;
    for (const k of ['ftL', 'ftR']) if (!lost?.has(RI[k])) feet = Math.min(feet, R.p[RI[k]].y);
    const standing = feet < (RAD.ftL + 0.06) * this.scale;
    for (const [pin, G] of R.grip) {
      if (!R.pins.has(pin)) continue;
      if (!TORSO_I.has(pin) && !standing) {
        G.offs = null; // 다시 땅을 디디면 그때 자세로 다시 잰다
        continue;
      }
      const q = G.q ?? (G.q0 ??= new THREE.Quaternion());
      if (!G.offs) {
        // 쥔 순간: 몸통 관절의 위치를 손 기준으로 기억
        _qa.copy(q).invert();
        G.offs = new Map();
        for (const i of TORSO_I) if (i !== pin) G.offs.set(i, R.p[i].clone().sub(R.p[pin]).applyQuaternion(_qa));
      }
      const base = R.p[pin];
      for (const [i, off] of G.offs) {
        if (R.pins.has(i) || lost?.has(i)) continue;
        _v3.copy(off).applyQuaternion(q).add(base);
        R.p[i].lerp(_v3, k);
      }
    }
  }

  /** 관절 하나의 지금 위치 (잡은 손이 다른 부위를 뜯어낼 때 쓴다) */
  pinPos(by) {
    const pin = this.holders?.get(by);
    return pin !== undefined && this.rag ? this.rag.p[pin] : null;
  }

  release(vel, by = null) {
    // 한 손만 놓으면 다른 손은 계속 잡고 있다
    if (by && this.holders?.has(by) && this.holders.size > 1) {
      const pin = this.holders.get(by);
      this.holders.delete(by);
      this.rag?.pins?.delete(pin);
      this.rag?.grip?.delete(pin);
      const [nb, np] = [...this.holders.entries()][0];
      this.heldBy = nb;
      if (this.rag) {
        this.rag.pin = np;
        this.rag.pinTarget.copy(this.rag.pins.get(np));
        this.vel.add(vel.clone().multiplyScalar(0.3));
      }
      return;
    }
    this.holders?.clear();
    this.rag?.pins?.clear();
    this.rag?.grip?.clear();
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
      // 선 자세에 가깝고 세게 던진 게 아니면 무너지지 않고 발로 선다 (recover.js)
      tryLand(this);
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
    // 몸끼리 충돌: 관절을 나누지 않는 부위 쌍마다 (몸통끼리는 거리 구속이 이미 붙잡는다)
    //  충돌 거리 = 두 반지름의 합, 단 기본 자세에서 이미 그보다 가까우면 그 거리의 90% (기본 자세가 서로 밀어내지 않게)
    const segs = SEGS.map(([a, b, r, ext]) => ({ a: RI[a], b: RI[b], r: r * this.scale, ext }));
    const pairs = [];
    const restP = rest.map((p) => p.clone().multiplyScalar(this.scale));
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const A = segs[i];
        const B = segs[j];
        if (i < 3 && j < 3) continue;
        if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue;
        const d = segDist(restP, A, B);
        const thr = Math.min(A.r + B.r, d * 0.9);
        if (thr > 0.01 * this.scale) pairs.push([i, j, thr]);
      }
    }
    this._rest = { rest, cons, mins, dir0, segs, pairs };
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
    const pins = R.pins?.size ? R.pins : null;
    const pinned = (i) => (pins ? pins.has(i) : i === R.pin);
    if (_v.lengthSq() > 1e-8) for (let i = 0; i < n; i++) if (!pinned(i)) R.v[i].add(_v);
    const g = 9.8 * (this.frozen ? 0.15 : 1);
    const damp = this.frozen ? 6 : 0.25;
    // 잡힌 동안: 손에 대한 상대 운동(흔들림 · 빙글빙글 돌기)을 줄인다 — 손을 멈추면 몸도 곧 멈춘다.
    //  손째 움직이는 것은 줄이지 않는다 (들고 휘두르기 · 던지기는 그대로)
    let relDamp = 0;
    const vPin = _v4.set(0, 0, 0);
    if (pins) {
      R.pinPrev ??= new Map();
      let n0 = 0;
      for (const [i, t] of pins) {
        const pv = R.pinPrev.get(i);
        if (pv && dt > 0) {
          vPin.add(_v.subVectors(t, pv).divideScalar(dt));
          n0++;
        }
        R.pinPrev.set(i, (pv ?? new THREE.Vector3()).copy(t));
      }
      if (n0) vPin.divideScalar(n0);
      // 손이 거의 멈췄으면 더 세게 (금방 가만히)
      relDamp = vPin.length() < 0.25 ? 7 : 2.5;
    } else R.pinPrev?.clear();
    const sub = Math.min(4, Math.max(1, Math.ceil(dt / (1 / 90))));
    const h = dt / sub;
    const b = this.world.ctx.env.bounds;
    let impact = 0;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < n; i++) {
        R.prev[i].copy(R.p[i]);
        if (pinned(i)) {
          R.p[i].lerp(pins ? pins.get(i) : R.pinTarget, 1 - Math.exp(-h * 40));
          continue;
        }
        R.v[i].y -= g * h;
        R.v[i].multiplyScalar(Math.max(0, 1 - damp * h));
        if (relDamp) R.v[i].sub(vPin).multiplyScalar(Math.max(0, 1 - relDamp * h)).add(vPin);
        R.p[i].addScaledVector(R.v[i], h);
      }
      for (let it = 0; it < 6; it++) {
        if (pins) this._gripTorso(0.3);
        for (const [a, c, L] of cons) this._ragSolve(a, c, L, 0);
        for (const [a, c, L] of mins) this._ragSolve(a, c, L, -1);
        if (this.world.ragSelf !== false) this._ragSelf();
        this._ragHands();
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
      const LS = this._lost();
      if (LS.set.size) for (const [i, a] of LS.anchor) R.p[i].copy(R.p[a]);
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

  /**
   * 몸끼리 뚫지 않기: 부위 캡슐 쌍의 가장 가까운 두 점이 충돌 거리보다 가까우면 벌린다.
   *  밀어낸 양은 각 캡슐의 두 끝 관절에 가까운 쪽일수록 많이 나눈다. 손에 잡힌 관절은 움직이지 않는다 (대신 몸이 밀린다)
   */
  _ragSelf() {
    const R = this.rag;
    const { segs, pairs } = R.rest;
    if (!pairs) return;
    const P = R.p;
    const lost = this._lostIdx?.set;
    const pins = R.pins?.size ? R.pins : null;
    const wOf = (i) => ((pins ? pins.has(i) : i === R.pin) ? 0 : 1);
    for (const [i, j, thr] of pairs) {
      const A = segs[i];
      const B = segs[j];
      if (lost?.size && (lost.has(A.a) || lost.has(A.b) || lost.has(B.a) || lost.has(B.b))) continue;
      const c = closestSeg(P[A.a], P[A.b], A.ext, P[B.a], P[B.b], B.ext);
      if (c.d >= thr) continue;
      // 끝을 늘인 캡슐: 늘인 부분은 끝 관절이 맡는다
      const u = Math.min(1, c.s * (1 + A.ext));
      const v = Math.min(1, c.t * (1 + B.ext));
      const w0 = wOf(A.a) * (1 - u);
      const w1 = wOf(A.b) * u;
      const w2 = wOf(B.a) * (1 - v);
      const w3 = wOf(B.b) * v;
      const W = w0 * (1 - u) + w1 * u + w2 * (1 - v) + w3 * v;
      if (W < 1e-6) continue;
      const lam = ((thr - c.d) / W) * 0.8;
      P[A.a].addScaledVector(c.n, lam * w0);
      P[A.b].addScaledVector(c.n, lam * w1);
      P[B.a].addScaledVector(c.n, -lam * w2);
      P[B.b].addScaledVector(c.n, -lam * w3);
    }
  }

  /**
   * 플레이어의 손(마허라의 큰 손 포함)이 래그돌 몸을 뚫지 못하게: 손바닥을 구로 보고 부위 캡슐을 밀어낸다.
   *  그 손이 쥔 관절에 붙은 부위는 빼고 (쥔 자리는 손바닥 겉면에 있다), 쥔 관절 자체는 움직이지 않는다
   */
  _ragHands() {
    const R = this.rag;
    const inp = this.world.ctx.input;
    const { segs } = R.rest;
    if (!segs || !inp?.hands) return;
    const P = R.p;
    const lost = this._lostIdx?.set;
    const pins = R.pins?.size ? R.pins : null;
    const wOf = (i) => ((pins ? pins.has(i) : i === R.pin) ? 0 : 1);
    const big = this.world.ctx.character?.possessed ? 1.9 : 1;
    for (const h of inp.hands) {
      if (!h.active || h.source === 'desktop') continue;
      const rh = 0.055 * big;
      // 이 손이 쥔 관절
      let mine = -1;
      if (this.holders) for (const [by, pin] of this.holders) if (by?.side === h.side) mine = pin;
      for (let si = 0; si < segs.length; si++) {
        const S = segs[si];
        if (S.a === mine || S.b === mine) continue;
        // 이 적을 쥐지 않은 손은 몸통만 막는다 (팔·다리·머리를 밀어내면 손목·발목·머리를 붙잡을 수 없다)
        if (mine < 0 && si > 2) continue;
        if (lost?.size && (lost.has(S.a) || lost.has(S.b))) continue;
        const c = closestSeg(P[S.a], P[S.b], S.ext, h.palm, h.palm, 0);
        const thr = S.r + rh;
        if (c.d >= thr) continue;
        const u = Math.min(1, c.s * (1 + S.ext));
        const w0 = wOf(S.a) * (1 - u);
        const w1 = wOf(S.b) * u;
        const W = w0 * (1 - u) + w1 * u;
        if (W < 1e-6) continue;
        const lam = (thr - c.d) / W;
        P[S.a].addScaledVector(c.n, lam * w0);
        P[S.b].addScaledVector(c.n, lam * w1);
      }
    }
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
    if (this._lostIdx?.set.size && (this._lostIdx.set.has(a) || this._lostIdx.set.has(c))) return;
    const wa = (R.pins?.size ? R.pins.has(a) : a === R.pin) ? 0 : 1;
    const wc = (R.pins?.size ? R.pins.has(c) : c === R.pin) ? 0 : 1;
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
    this._dropAll();
    this.heldBy = null;
    this.state = 'heart';
    this.stateT = 0;
    this.vel.set(0, 0, 0);
  }

  kill(info = {}) {
    if (!this.alive) return;
    this.alive = false;
    this._dropAll();
    this.world.onKill?.(this, info);
    const W = this.world;
    const c = this.center();
    this.root.updateMatrixWorld(true);
    const type = info.type ?? 'shatter';
    // 주령조술: 쓰러뜨린 주령은 주령구가 된다 (게토)
    if (this.def.curse && W.captureCurse?.(this, info)) {
      W.scene.remove(this.root);
      this._dispose();
      return;
    }
    if (this.rig && (type === 'slash' || type === 'cleave')) this.rig.bake();
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
    } else if (type === 'stock') {
      // 무위전변: 몸은 개조 인간 스톡으로 오그라드는 연출(mahito.js)이 가져간다 — 거기서 치우고 버린다
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
    this.rig?.dispose();
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
    this._step(dt);
    if (this.rig && this.alive) this.rig.sync();
  }

  _step(dt) {
    if (!this.alive) return;
    this.t += dt;
    this.stateT += dt;
    if (this.flash > 0) {
      this.flash -= dt;
      this._setEmissive(_c.setRGB(1, 1, 1).multiplyScalar(Math.max(0, this.flash) * 5));
      if (this.flash <= 0) for (const m of this.mats) m.emissive.copy(m.userData.baseEmissive);
    }
    // 뜯기는 중: 힘줄이 당겨지며 몸이 붉게 달아오른다 (grab.js 가 _strain 을 채운다)
    if (this._strain > 0) {
      this._strain = Math.max(0, this._strain - dt * 4);
      if (this.flash <= 0) {
        if (this._strain > 0) this._setEmissive(_c.setRGB(0.55, 0.03, 0.02).multiplyScalar(this._strain * 0.28));
        else for (const m of this.mats) m.emissive.copy(m.userData.baseEmissive);
      }
    }
    // 반전술식 · 재생: 잘린 팔다리를 되살린다
    if (this._regrowAt && this.world.time > this._regrowAt && !this.dying && this.state !== 'held') {
      this._regrowAt = 0;
      if (regrowParts(this)) {
        const kind = this.def.rct;
        const W = this.world;
        W.ctx.sfx.play('shimmer', { at: this.center(_v), vol: 0.4, rate: 1.2 });
        if (kind && (this._regrowMsgT ?? 0) < W.time) {
          this._regrowMsgT = W.time + 15;
          W.ctx.ui.callout(`${this.def.label} — ${kind === 'rct' ? '반전술식으로 잘린 팔다리를 되살린다' : kind === 'reshape' ? '무위전변으로 몸을 다시 빚는다' : '잘린 몸이 다시 자라난다'}`, { color: '#ffd0d0', size: 34, dur: 1.4 });
        }
      }
    }
    // 다리를 잃으면 설 수 없다
    if (this.legless && (this.state === 'stand' || this.state === 'getup' || this.state === 'drop' || this.state === 'land') && !this.frozen) {
      this._getupJ = null;
      this._hipLocal = null;
      this.state = 'air';
      this.stateT = 0;
      this._ragStart(this.vel);
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
    // 놓였을 때: 선 자세로 떨어져 발로 착지 → 무릎으로 받고 선다 (recover.js)
    if (this.state === 'drop') {
      const r = stepDrop(this, dt);
      if (r === 'crumple') {
        this._ld = null;
        this.state = 'air';
        this.stateT = 0;
        this._ragStart(this.vel);
      } else if (r === 'land') {
        this.state = 'land';
        this.stateT = 0;
      }
      return;
    }
    if (this.state === 'land') {
      if (stepLand(this, dt)) {
        this.state = 'stand';
        this.stateT = 0;
      }
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
      // 연출(마허라 조복 의식) 동안엔 아무도 공격하지 않는다: 제자리에서 숨만 쉰다
      if (this.world.cinematic) this._idleCine?.(dt);
      else this._ai(dt);
      this.root.position.addScaledVector(this.vel, dt);
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.root.position.y = Math.max(0, this.root.position.y);
      // 벽 · 물체를 통과하지 못한다
      this.world.collideActor(this.root.position, 0.28 * this.scale, { height: 1.7 * this.scale, who: this });
      // 맷집 회복 (1.2초 동안 안 맞으면)
      const P = this._poise;
      if (P && this.world.time - P.t > 1.2) P.v = Math.min(this.maxPoise, P.v + this.maxPoise * 0.5 * dt);
      // 움찔: 맞은 쪽 반대로 몸이 젖혀졌다 돌아온다
      const F = this.recoil;
      if (F && typeof F === 'object') {
        F.t += dt;
        const u = Math.min(1, F.t / 0.32);
        const k = Math.sin(Math.PI * u) * (1 - u * 0.3) * F.k;
        _v.crossVectors(UP, F.dir).normalize();
        _q.setFromAxisAngle(_v, 0.32 * k);
        this.root.quaternion.setFromAxisAngle(UP, this.yaw).premultiply(_q);
        if (u >= 1) {
          this.recoil = null;
          this.root.quaternion.setFromAxisAngle(UP, this.yaw);
        }
      }
    } else if (this.state === 'air') {
      this._integrate(dt, 1);
      if (this.dying) this._pose(dt, 'clutch', 1);
      if (this.grounded && this.vel.lengthSq() < 0.3 && this.angVel.lengthSq() < 1 && this.stateT > 0.8) {
        this.state = 'down';
        this.stateT = 0;
      }
    } else if (this.state === 'down') {
      this.vel.set(0, 0, 0);
      this._keepAboveFloor();
      if (this.dying) {
        if (this.stateT > 2.5) this.kill({ type: 'fade' });
        return;
      }
      if (this.stateT > 1.2 && !this.legless) {
        // 엎드렸는지 누웠는지에 따라 다른 동작으로 일어난다 (recover.js)
        this.state = 'getup';
        this.stateT = 0;
        startGetup(this);
      }
    } else if (this.state === 'getup') {
      if (!this._gu) startGetup(this);
      if (stepGetup(this, dt)) {
        this.state = 'stand';
        this.stateT = 0;
      }
    }
    if (this.root.position.lengthSq() > 250 * 250 || this.root.position.y < -20) this.kill({ type: 'erase' });
  }

  /** 쓰러진 자세의 관절이 바닥 아래면 몸 전체를 들어 올린다 */
  _keepAboveFloor() {
    const J = this._jointMap();
    let pen = 0;
    for (const k of RAG) {
      const p = J[k].getWorldPosition(_v);
      pen = Math.max(pen, RAD[k] * this.scale - p.y);
    }
    if (pen > 0.002) this.root.position.y += pen;
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
    for (const y of [0.05, 0.5, 1.0, 1.35, 1.72]) {
      const p = this.root.localToWorld(_v.set(0, y, 0));
      const r = (y === 0.05 ? 0.08 : y === 1.72 ? 0.13 : 0.18) * this.scale;
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
    // 미끼(메구미의 탈토 등)가 있으면 그쪽을 노린다
    const head = W.decoy?.(this) ?? W.ctx.input.head;
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
      if (this.shootT <= 0 && !this.handless('R')) {
        const cd = this.def.shootCd ?? 2.2;
        this.shootT = cd + Math.random() * cd * 0.7;
        const from = this.gun ? this.gun.localToWorld(_v2.set(0, 0, 0.12)) : this.armR.hd.getWorldPosition(_v2).addScaledVector(_v3.subVectors(head, this.armR.hd.getWorldPosition(_v3)).normalize(), 0.15);
        W.spawnBullet(from, head, this, this.def.bullet);
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
          if (!this.handless('R')) W.dummyMelee(this, this.armR.hd.getWorldPosition(_v2), this.def.punch ?? 8);
        }
        // 마히토: 치는 동안 팔을 칼날로 바꾼다 (무위전변)
        if (this.def.blade && this.rig) {
          const on = this.punchT > 0.05;
          if (on !== this._blade) {
            this._blade = on;
            this.rig.show('ArmsNormal', !on);
            this.rig.show('ArmsBlades', on);
          }
        }
        this._legs(0, dt);
      } else if (dist > reach) {
        const sp = (this.def.speed ?? 1.7) * Math.sqrt(this.scale);
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
