// 주술회전 게임 모델로 만든 적: 더미 몸(래그돌·잡기·절단)은 그대로 쓰고,
//  · 손가락: 가만히 있을 땐 살짝, 걸을 땐 조금 더 구부리고, 칠 땐 주먹을 쥔다
//  · 대기 동작: 숨쉬기 · 무게중심 옮기기 · 두리번거리기 (적마다 버릇이 다르다)
//  · 능력에 맞는 공격을 여러 가지 고른다
//      주저사(봉투 가면): 복제술 말고는 술식이 없어 체술만 — 잽 · 스트레이트 · 훅 · 앞차기 · 연타
//      마히토: 무위전변으로 몸을 바꾼다 — 칼날 팔 · 드릴 팔 · 늘어나는 팔 · 거대한 주먹 · 영혼을 만지는 손
//      죠고: 불 — 불덩이 · 발밑 분화 · 불벌레 · 화염 방사 (거리를 둔다)
//      손가락 보유자: 빠른 연타 · 두 주먹 내려찍기 · 돌진 할퀴기 · 앞차기
//      쿠치사케온나: 「나, 예뻐?」 거대한 가위 · 칼 베기 · 달려들기
//      단안(효수) 주령: 짓밟기 · 두 주먹 내려치기 · 팔 휩쓸기
import * as THREE from 'three';
import { Dummy } from './dummy.js';
import { GiantScissors } from '../characters/geto/vfx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const lerp = THREE.MathUtils.lerp;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sm = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const rnd = (a, b) => a + Math.random() * (b - a);
const ORDER = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'hdL', 'shR', 'elR', 'hdR', 'hpL', 'knL', 'ftL', 'hpR', 'knR', 'ftR'];

// ───────────────── 손가락 ─────────────────
const FINGER_SETS = {
  jjk: (s) => [['thumbfinger', 3, true], ['indexfinger', 3], ['middlefinger', 3], ['ringfinger', 3], ['littlefinger', 3]].map(([f, n, th]) => ({ thumb: !!th, bones: 'ABC'.slice(0, n).split('').map((c) => `${s}_${f}_${c}`) })),
  bip: (s) => [0, 1, 2, 3, 4].map((i) => ({ thumb: i === 0, bones: [`Bip001_${s}_Finger${i}`, `Bip001_${s}_Finger${i}1`, `Bip001_${s}_Finger${i}2`] })),
};

/** 손가락 굽히기: 바인드 때 손바닥 방향을 구해, 손가락마다 손바닥 쪽으로 접는 축을 뼈 로컬로 둔다 */
export class FingerRig {
  constructor(body) {
    this.hands = { L: [], R: [] };
    this.curl = { L: 0.35, R: 0.35 };
    const set = FINGER_SETS[body.mapId];
    if (!set) return;
    body.clone.updateMatrixWorld(true);
    const P = (n) => body.bones[n]?.getWorldPosition(new THREE.Vector3());
    for (const s of ['L', 'R']) {
      const fingers = set(s).map((f) => ({ ...f, bones: f.bones.map((n) => body.bones[n]).filter(Boolean) })).filter((f) => f.bones.length);
      if (fingers.length < 4) continue;
      const wrist = fingers[2].bones[0].parent.getWorldPosition(new THREE.Vector3());
      const idx = fingers[1].bones[0].getWorldPosition(new THREE.Vector3());
      const pin = fingers[4].bones[0].getWorldPosition(new THREE.Vector3());
      const mid = fingers[2].bones[0].getWorldPosition(new THREE.Vector3());
      const a = idx.clone().sub(wrist);
      const b = pin.clone().sub(wrist);
      // 손바닥이 향하는 쪽 (WebXR 손과 같은 규칙)
      const n = s === 'L' ? new THREE.Vector3().crossVectors(b, a) : new THREE.Vector3().crossVectors(a, b);
      n.normalize();
      const palmC = mid.clone().addScaledVector(n, 0.02);
      for (const f of fingers) {
        f.rest = f.bones.map((bn) => bn.quaternion.clone());
        f.axes = f.bones.map((bn, i) => {
          const p0 = bn.getWorldPosition(new THREE.Vector3());
          const p1 = i < f.bones.length - 1 ? f.bones[i + 1].getWorldPosition(new THREE.Vector3()) : (bn.children[0]?.getWorldPosition(new THREE.Vector3()) ?? p0.clone().add(mid.clone().sub(wrist).normalize().multiplyScalar(0.02)));
          const d = p1.clone().sub(p0).normalize();
          const toward = f.thumb ? palmC.clone().sub(p0).normalize() : n;
          const ax = new THREE.Vector3().crossVectors(d, toward).normalize();
          // 월드 축 → 뼈 로컬 축
          const qi = bn.getWorldQuaternion(new THREE.Quaternion()).invert();
          return ax.applyQuaternion(qi);
        });
        this.hands[s].push(f);
      }
    }
    void P;
  }

  /** curl: 0 폄 ~ 1 주먹, spread: 손가락 벌리기(쓰지 않음) */
  apply(dt, want = { L: 0.35, R: 0.35 }) {
    for (const s of ['L', 'R']) {
      this.curl[s] += (want[s] - this.curl[s]) * Math.min(1, dt * 14);
      const c = this.curl[s];
      for (const f of this.hands[s]) {
        f.bones.forEach((bn, i) => {
          const ang = f.thumb ? [0.25, 0.45, 0.5][i] * c : [0.95, 1.25, 0.8][i] * c;
          bn.quaternion.copy(f.rest[i]).multiply(_q.setFromAxisAngle(f.axes[i], ang));
        });
      }
    }
  }
}

// ───────────────── 동작 도우미 ─────────────────
/** 주먹 지르기 (0~1): 끌어당김 → 뻗기 → 회수 */
function punchCurve(k, a = 0.35, b = 0.5) {
  const wind = k < a ? k / a : Math.max(0, 1 - (k - a) / (b - a));
  const ext = k < a ? 0 : k < b ? (k - a) / (b - a) : Math.max(0, 1 - (k - b) / (1 - b));
  return { wind, ext };
}

function punchPose(T, e, side, k, { a = 0.35, b = 0.5, power = 1 } = {}) {
  const { wind, ext } = punchCurve(k, a, b);
  const S = side === 'R' ? 'R' : 'L';
  const sg = S === 'R' ? -1 : 1;
  T['sh' + S] = [0.45 * wind - 1.55 * ext, 0, e.restZ * sg * (1 - ext) - sg * 0.12 * ext];
  T['el' + S] = [-1.5 * wind - 0.1 * ext, 0, 0];
  T.chest[1] += sg * (-0.3 * wind + 0.45 * ext) * power;
  T.chest[0] += 0.12 * ext * power;
  T.hips[1] += sg * 0.12 * ext * power;
  return ext;
}

function guardPose(T, e, amt = 1) {
  for (const [S, sg] of [['L', 1], ['R', -1]]) {
    T['sh' + S] = [lerp(T['sh' + S][0], -0.75, amt), 0, lerp(T['sh' + S][2], e.restZ * sg * 0.4, amt)];
    T['el' + S] = [lerp(T['el' + S][0], -1.9, amt), 0, 0];
  }
  T.knL[0] += 0.12 * amt;
  T.knR[0] += 0.12 * amt;
}

/** 플레이어에게 근접 공격 (무하한·식신 대신 맞기 처리 포함) */
function hitAt(e, p, dmg, r = 0.7, type = 'punch') {
  const W = e.world;
  if (W.meleeShield && W.meleeShield(e, p)) return false;
  if (W.absorbMelee && W.absorbMelee(e, p, dmg)) return true;
  const inp = W.ctx.input;
  const bc = inp.bodyCenter(_v3);
  if (p.distanceTo(bc) < r || p.distanceTo(inp.head) < r * 0.75) {
    W.hitPlayer(dmg, { type, src: e });
    return true;
  }
  return false;
}

/** 범위 공격: 바닥 기준 수평 거리 */
function aoe(e, p, r, dmg, type = 'impact') {
  const W = e.world;
  const inp = W.ctx.input;
  if (W.meleeShield && W.meleeShield(e, _v3.copy(inp.head))) return false;
  if (Math.hypot(inp.head.x - p.x, inp.head.z - p.z) < r) {
    W.hitPlayer(dmg, { type, src: e });
    return true;
  }
  return false;
}

const bonePos = (e, name, out = new THREE.Vector3()) => (e.rig?.bones[name] ? e.rig.bones[name].getWorldPosition(out) : null);
function handPos(e, S, out = new THREE.Vector3()) {
  const j = e.rig.J['hd' + S];
  return j.getWorldPosition(out);
}
function footPos(e, S, out = new THREE.Vector3()) {
  return e.rig.J['ft' + S].getWorldPosition(out);
}
function fwdOf(e, out = new THREE.Vector3()) {
  return out.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
}

// ───────────────── 기술 목록 ─────────────────
// 기술: { range: [최소, 최대](m, 키에 비례), cd, w(고를 확률), dur(초), pose(T, e, k, m), tick(e, k, m, dt) }
const JAB = {
  name: '잽', range: [0, 1.0], cd: 1.2, w: 3, dur: 0.38,
  pose: (T, e, k) => punchPose(T, e, 'L', k, { a: 0.25, b: 0.42, power: 0.6 }),
  tick: (e, k, m) => { if (!m.hit && k > 0.42) { m.hit = true; hitAt(e, handPos(e, 'L'), e.dmg(7)); } },
  fist: { L: 1, R: 1 },
};
const CROSS = {
  name: '스트레이트', range: [0, 1.1], cd: 1.8, w: 2, dur: 0.55,
  pose: (T, e, k) => punchPose(T, e, 'R', k),
  tick: (e, k, m) => { if (!m.hit && k > 0.5) { m.hit = true; hitAt(e, handPos(e, 'R'), e.dmg(12)); } },
  fist: { L: 1, R: 1 },
};
const HOOK = {
  name: '훅', range: [0, 1.0], cd: 2.2, w: 1.5, dur: 0.6,
  pose: (T, e, k) => {
    const { wind, ext } = punchCurve(k, 0.35, 0.55);
    T.shR = [-1.2 * (wind + ext * 0.8), 0, -0.3 * wind + 1.1 * ext];
    T.elR = [-1.6, 0, 0];
    T.chest[1] += -0.5 * wind + 0.7 * ext;
    T.hips[1] += 0.2 * ext;
  },
  tick: (e, k, m) => { if (!m.hit && k > 0.52) { m.hit = true; hitAt(e, handPos(e, 'R'), e.dmg(13), 0.8); } },
  fist: { L: 1, R: 1 },
};
const KICK = {
  name: '앞차기', range: [0.3, 1.5], cd: 2.6, w: 1.5, dur: 0.75,
  pose: (T, e, k) => {
    const chamber = sm(0, 0.35, k) * (1 - sm(0.45, 0.6, k));
    const ext = sm(0.35, 0.5, k) * (1 - sm(0.65, 1, k));
    T.hpR = [-1.5 * (chamber + ext), 0, 0];
    T.knR = [1.9 * chamber * (1 - ext) + 0.1, 0, 0];
    T.ftR = [-0.6 * ext, 0, 0];
    T.knL[0] += 0.25;
    T.chest[0] -= 0.25 * ext;
    guardPose(T, e, 0.8);
  },
  tick: (e, k, m) => { if (!m.hit && k > 0.48) { m.hit = true; hitAt(e, footPos(e, 'R'), e.dmg(14), 0.75, 'kick'); } },
  fist: { L: 1, R: 1 },
};
const COMBO = {
  name: '연타', range: [0, 1.0], cd: 4, w: 1.2, dur: 1.4,
  pose: (T, e, k) => {
    const i = Math.min(2, Math.floor(k * 3));
    const kk = k * 3 - i;
    if (i === 2) KICK.pose(T, e, kk);
    else punchPose(T, e, i ? 'R' : 'L', kk, { a: 0.3, b: 0.45 });
  },
  tick: (e, k, m) => {
    const i = Math.min(2, Math.floor(k * 3));
    const kk = k * 3 - i;
    m.hits ??= [false, false, false];
    if (!m.hits[i] && kk > (i === 2 ? 0.48 : 0.45)) {
      m.hits[i] = true;
      hitAt(e, i === 2 ? footPos(e, 'R') : handPos(e, i ? 'R' : 'L'), e.dmg(i === 2 ? 14 : 8), 0.75);
    }
  },
  fist: { L: 1, R: 1 },
};
const SLAM = {
  name: '내려찍기', range: [0, 1.4], cd: 4.5, w: 1.2, dur: 1.0,
  pose: (T, e, k) => {
    const up = sm(0, 0.45, k) * (1 - sm(0.45, 0.55, k));
    const down = sm(0.45, 0.55, k) * (1 - sm(0.7, 1, k));
    for (const [S, sg] of [['L', 1], ['R', -1]]) {
      T['sh' + S] = [-2.9 * up - 1.0 * down, 0, sg * (0.25 * up - 0.15 * down)];
      T['el' + S] = [-0.5 * up - 0.2 * down, 0, 0];
    }
    T.chest[0] += -0.35 * up + 0.6 * down;
    T.spine[0] += 0.25 * down;
    T.knL[0] += 0.5 * down;
    T.knR[0] += 0.5 * down;
    T.hpL[0] -= 0.3 * down;
    T.hpR[0] -= 0.3 * down;
  },
  tick: (e, k, m) => {
    if (!m.hit && k > 0.55) {
      m.hit = true;
      const p = e.root.localToWorld(_v.set(0, 0, 0.75)).setY(0.05);
      const { fx, sfx } = e.world.ctx;
      fx.shockwave(p.clone(), 0x2a2a2a, 2.2 * e.scale, 0.45, { dark: true, opacity: 0.6 });
      fx.burst(p, 18, new THREE.Color(0x5a5550), 3, 0.05, 0.5, { dark: true, up: 1 });
      sfx.explosion(p, 0.35 * e.scale);
      aoe(e, p, 1.8 * e.scale, e.dmg(22));
    }
  },
  fist: { L: 1, R: 1 },
};
const STOMP = {
  name: '짓밟기', range: [0, 2.2], cd: 5, w: 1.5, dur: 1.2,
  pose: (T, e, k) => {
    const up = sm(0, 0.5, k) * (1 - sm(0.5, 0.6, k));
    const down = sm(0.5, 0.6, k) * (1 - sm(0.8, 1, k));
    T.hpR = [-1.1 * up - 0.2 * down, 0, 0.15 * up];
    T.knR = [1.5 * up + 0.3 * down, 0, 0];
    T.knL[0] += 0.25 * up + 0.45 * down;
    T.hips[2] += 0.1 * up;
    T.chest[0] += 0.3 * down;
    T.shL[0] += -0.4 * up;
    T.shR[0] += -0.4 * up;
  },
  tick: (e, k, m) => {
    if (!m.hit && k > 0.6) {
      m.hit = true;
      const p = footPos(e, 'R', new THREE.Vector3()).setY(0.05);
      const { fx, sfx } = e.world.ctx;
      fx.shockwave(p.clone(), 0x333333, 4 * e.scale * 0.6, 0.6, { dark: true, opacity: 0.6 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        fx.fire.smoke(_v.set(p.x + Math.cos(a) * 0.5, 0.2, p.z + Math.sin(a) * 0.5), _v2.set(Math.cos(a) * 4, 0.4, Math.sin(a) * 4), { size0: 0.4, size1: 1.4, life: 1.2, shade: 0.55, lit: 0, opacity: 0.4, drag: 2.5, rise: 0.3 });
      }
      sfx.explosion(p, 0.7);
      sfx.rumble(0.5, 0.5);
      aoe(e, p, 3.2, e.dmg(20));
    }
  },
};
const SWIPE = {
  name: '휩쓸기', range: [0, 1.9], cd: 3.5, w: 1.3, dur: 0.9,
  pose: (T, e, k) => {
    const wind = sm(0, 0.4, k) * (1 - sm(0.4, 0.5, k));
    const sweep = sm(0.4, 0.62, k) * (1 - sm(0.75, 1, k));
    T.shR = [-1.2 * (wind + sweep), 0, -1.3 * wind + 0.8 * sweep];
    T.elR = [-0.3, 0, 0];
    T.chest[1] += -0.6 * wind + 0.8 * sweep;
  },
  tick: (e, k, m) => {
    if (!m.hit && k > 0.52) {
      m.hit = true;
      const inp = e.world.ctx.input;
      const rel = _v.subVectors(inp.head, e.root.position).setY(0);
      if (rel.length() < 2.2 * e.scale && rel.normalize().dot(fwdOf(e, _v2)) > 0.2) hitAt(e, inp.bodyCenter(new THREE.Vector3()), e.dmg(16), 5);
      e.world.ctx.sfx.whoosh(e.root.position, 0.7, 0.6);
    }
  },
};
const LUNGE = {
  name: '돌진', range: [1.6, 5.5], cd: 4, w: 1.4, dur: 0.8,
  start: (e, m) => { m.from = e.root.position.clone(); m.dir = fwdOf(e, new THREE.Vector3()); },
  pose: (T, e, k) => {
    const dash = sm(0.15, 0.5, k);
    T.chest[0] += 0.45 * dash * (1 - sm(0.7, 1, k));
    T.shR = [-1.8 * sm(0.3, 0.5, k) * (1 - sm(0.7, 1, k)), 0, 0.6 * sm(0.45, 0.6, k)];
    T.elR = [-0.5, 0, 0];
    T.knL[0] += 0.3;
    T.knR[0] += 0.3;
  },
  tick: (e, k, m, dt) => {
    if (k > 0.15 && k < 0.5) {
      const inp = e.world.ctx.input;
      const d = Math.hypot(inp.head.x - e.root.position.x, inp.head.z - e.root.position.z);
      if (d > 0.7 * e.scale) e.root.position.addScaledVector(m.dir, dt * 9);
    }
    if (!m.hit && k > 0.5) {
      m.hit = true;
      hitAt(e, handPos(e, 'R'), e.dmg(16), 0.9, 'slash');
      e.world.ctx.sfx.slash(e.root.position, 1.2);
    }
  },
  fist: { L: 0.6, R: 0.1 },
};

// 마히토: 무위전변으로 팔을 바꾼다
const morph = (part) => ({ start: (e) => e.morph(part), end: (e) => e.morph(null) });
const M_BLADE = {
  name: '칼날 팔', range: [0, 1.4], cd: 2.4, w: 2, dur: 0.75, ...morph('ArmsBlades'),
  pose: SWIPE.pose,
  tick: (e, k, m) => {
    if (!m.hit && k > 0.5) {
      m.hit = true;
      const inp = e.world.ctx.input;
      const rel = _v.subVectors(inp.head, e.root.position).setY(0);
      if (rel.length() < 1.6 && rel.normalize().dot(fwdOf(e, _v2)) > 0.3) hitAt(e, inp.bodyCenter(new THREE.Vector3()), e.dmg(15), 5, 'slash');
      e.world.ctx.sfx.slash(e.root.position, 1.4);
    }
  },
  fist: { L: 0.3, R: 0 },
};
const M_DRILL = {
  name: '드릴 팔', range: [0.4, 1.7], cd: 3, w: 1.5, dur: 0.8, ...morph('ArmDrill'),
  pose: (T, e, k) => punchPose(T, e, 'R', k, { a: 0.4, b: 0.55, power: 1.2 }),
  tick: (e, k, m) => {
    if (k > 0.5 && k < 0.75) {
      m.t2 = (m.t2 ?? 0) + 1;
      if (m.t2 % 3 === 0) e.world.ctx.fx.burst(handPos(e, 'R'), 3, new THREE.Color(0xc0c8d0), 2, 0.02, 0.2);
    }
    if (!m.hit && k > 0.55) {
      m.hit = true;
      hitAt(e, handPos(e, 'R').addScaledVector(fwdOf(e, _v2), 0.5), e.dmg(18), 0.8, 'pierce');
    }
  },
};
const M_STRETCH = {
  name: '늘어나는 팔', range: [1.2, 3.4], cd: 3.5, w: 1.5, dur: 0.9,
  pose: (T, e, k) => punchPose(T, e, 'R', k, { a: 0.35, b: 0.5 }),
  tick: (e, k, m) => {
    const s = 1 + 1.6 * sm(0.38, 0.5, k) * (1 - sm(0.6, 0.95, k));
    e.boneScale('R_elbow', s);
    e.boneScale('R_hand', 1 / Math.sqrt(s));
    if (!m.hit && k > 0.5) {
      m.hit = true;
      hitAt(e, handPos(e, 'R'), e.dmg(13), 0.8);
    }
  },
  end: (e) => { e.boneScale('R_elbow', 1); e.boneScale('R_hand', 1); },
  fist: { L: 0.4, R: 1 },
};
const M_BIGFIST = {
  name: '거대한 주먹', range: [0, 1.6], cd: 5, w: 1.2, dur: 1.1,
  pose: (T, e, k) => {
    const up = sm(0, 0.45, k) * (1 - sm(0.45, 0.55, k));
    const down = sm(0.45, 0.55, k) * (1 - sm(0.75, 1, k));
    T.shR = [-2.8 * up - 1.1 * down, 0, -0.2 * up];
    T.elR = [-0.6 * up, 0, 0];
    T.chest[0] += -0.3 * up + 0.5 * down;
    T.chest[1] += 0.3 * up - 0.2 * down;
  },
  tick: (e, k, m) => {
    e.boneScale('R_hand', 1 + 2.2 * sm(0.1, 0.4, k) * (1 - sm(0.8, 1, k)));
    if (!m.hit && k > 0.56) {
      m.hit = true;
      const p = handPos(e, 'R', new THREE.Vector3()).setY(0.05);
      e.world.ctx.fx.shockwave(p.clone(), 0x2a3038, 2.2, 0.45, { dark: true, opacity: 0.55 });
      e.world.ctx.sfx.explosion(p, 0.4);
      aoe(e, p, 1.5, e.dmg(22));
    }
  },
  end: (e) => e.boneScale('R_hand', 1),
  fist: { L: 0.4, R: 1 },
};
const M_TOUCH = {
  name: '무위전변', range: [0, 1.1], cd: 7, w: 0.8, dur: 1.2,
  pose: (T, e, k) => {
    const reach = sm(0.3, 0.75, k) * (1 - sm(0.85, 1, k));
    T.shR = [-1.5 * reach, 0, e.restZ * -1 * (1 - reach)];
    T.elR = [-0.2, 0, 0];
    T.chest[0] += 0.2 * reach;
    T.head[0] += 0.2 * reach;
  },
  tick: (e, k, m) => {
    const hp = handPos(e, 'R');
    if (k < 0.8) e.world.ctx.fx.spawn(hp, _v2.set(rnd(-0.2, 0.2), rnd(0, 0.4), rnd(-0.2, 0.2)), new THREE.Color(0x7ad8ff), 0.05, 0.4, 1, 0);
    if (!m.hit && k > 0.7) {
      m.hit = true;
      if (hitAt(e, hp, e.dmg(30), 0.6, 'soul')) e.world.ctx.ui.callout('무위전변 — 영혼을 만졌다', { color: '#7ad8ff' });
    }
  },
  fist: { L: 0.3, R: 0 },
};

// 죠고: 불
const J_FIREBALL = {
  name: '불덩이', range: [1.5, 15], cd: 2.2, w: 2, dur: 0.7,
  pose: (T, e, k) => {
    const raise = sm(0, 0.5, k) * (1 - sm(0.75, 1, k));
    T.shR = [-1.55 * raise, 0, e.restZ * -1 * (1 - raise)];
    T.elR = [-0.15, 0, 0];
  },
  tick: (e, k, m) => {
    if (k < 0.5) e.world.ctx.fx.spawn(handPos(e, 'R'), _v2.set(0, 0.5, 0), new THREE.Color(0xff8020), 0.08, 0.3, 1, -1);
    if (!m.hit && k > 0.5) {
      m.hit = true;
      e.world.spawnBullet(handPos(e, 'R', new THREE.Vector3()).addScaledVector(fwdOf(e, _v2), 0.2), e.world.ctx.input.head, e, 'fire');
    }
  },
  fist: { L: 0.4, R: 0 },
};
const J_ERUPT = {
  name: '분화', range: [2.5, 14], cd: 6, w: 1.4, dur: 1.5,
  start: (e, m) => { m.at = e.world.ctx.input.head.clone().setY(0); },
  pose: (T, e, k) => {
    const up = sm(0, 0.3, k);
    const slam = sm(0.55, 0.65, k);
    for (const [S, sg] of [['L', 1], ['R', -1]]) T['sh' + S] = [-2.6 * up * (1 - slam) - 0.6 * slam, 0, sg * 0.4 * up];
    T.chest[0] += 0.4 * slam;
  },
  tick: (e, k, m) => {
    const { fx, sfx } = e.world.ctx;
    // 발밑이 달아오른다 (예고)
    if (k < 0.65) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.3 * Math.sqrt(Math.random());
      fx.spawn(_v.set(m.at.x + Math.cos(a) * r, 0.04, m.at.z + Math.sin(a) * r), _v2.set(0, 0.6, 0), new THREE.Color().setHSL(0.03, 1, 0.5), 0.12, 0.4, 1, -0.5);
      if (!m.warned) {
        m.warned = true;
        fx.shockwave(_v.copy(m.at).setY(0.03), 0xff4010, 1.4, 0.9, { opacity: 0.5 });
        sfx.rumble(0.8, 0.3);
      }
    }
    if (!m.hit && k > 0.65) {
      m.hit = true;
      fx.fire.explosion(_v.copy(m.at).setY(0.3), 1.1, { height: 4.5, colR: 0.7 });
      sfx.play('fire_explode', { at: m.at, vol: 0.9 });
      aoe(e, m.at, 1.4, e.dmg(26), 'fire');
    }
  },
  fist: { L: 0, R: 0 },
};
const J_INSECTS = {
  name: '불벌레', range: [1.5, 12], cd: 7, w: 1.1, dur: 0.9,
  pose: (T, e, k) => {
    const sweep = sm(0.2, 0.6, k) * (1 - sm(0.8, 1, k));
    T.shR = [-1.2 * sweep, 0, -0.2 + 1.0 * sweep];
    T.shL = [-1.2 * sweep, 0, 0.2 - 1.0 * sweep];
  },
  tick: (e, k, m) => {
    if (!m.hit && k > 0.5) {
      m.hit = true;
      const from = e.root.localToWorld(new THREE.Vector3(0, 1.2, 0.4));
      for (let i = 0; i < 6; i++) e.proj.push({ kind: 'bug', p: from.clone(), v: new THREE.Vector3(rnd(-3, 3), rnd(1, 3), rnd(-1, 2)).add(fwdOf(e, _v2).multiplyScalar(2)), life: 4.5, delay: i * 0.12 });
      e.world.ctx.sfx.play('fire_whoosh', { at: from, vol: 0.6, rate: 1.4 });
    }
  },
  fist: { L: 0, R: 0 },
};
const J_FLAME = {
  name: '화염 방사', range: [0, 3.2], cd: 5, w: 1.4, dur: 1.4,
  pose: (T, e, k) => {
    const on = sm(0, 0.2, k) * (1 - sm(0.85, 1, k));
    T.shR = [-1.5 * on, 0, -0.05];
    T.elR = [-0.1, 0, 0];
    T.shL = [-1.3 * on, 0, 0.15];
    T.chest[0] += 0.1 * on;
  },
  tick: (e, k, m, dt) => {
    if (k < 0.2 || k > 0.85) return;
    const { fx } = e.world.ctx;
    const from = handPos(e, 'R', new THREE.Vector3());
    const dir = _v2.subVectors(e.world.ctx.input.head, from).normalize();
    for (let i = 0; i < 2; i++) fx.fire.flame(from, _v.copy(dir).multiplyScalar(rnd(6, 9)).add(_v3.set(rnd(-0.6, 0.6), rnd(-0.3, 0.6), rnd(-0.6, 0.6))), { size0: 0.15, size1: 0.7, life: 0.45, rise: 1 });
    m.tick2 = (m.tick2 ?? 0) - dt;
    if (m.tick2 <= 0) {
      m.tick2 = 0.12;
      const inp = e.world.ctx.input;
      const rel = _v.subVectors(inp.head, from);
      if (rel.length() < 3.6 && rel.normalize().dot(fwdOf(e, _v3)) > 0.75) e.world.hitPlayer(e.dmg(3), { type: 'fire', src: e });
    }
  },
  fist: { L: 0.2, R: 0 },
};

// 쿠치사케온나
const K_SNIP = {
  name: '나, 예뻐?', range: [0.6, 8], cd: 5, w: 1.6, dur: 1.4,
  start: (e, m) => {
    if (!e._asked) {
      e._asked = true;
      e.world.ctx.ui.manga({ main: '私、キレイ?', ruby: '나, 예뻐?', color: '#f0c890' });
    }
  },
  pose: (T, e, k) => {
    const up = sm(0, 0.3, k) * (1 - sm(0.7, 1, k));
    T.shR = [-2.0 * up, 0, -0.3 * up];
    T.elR = [-0.7 * up, 0, 0];
    T.head[2] += 0.35;
  },
  tick: (e, k, m) => {
    if (!m.made && k > 0.3) {
      m.made = true;
      const inp = e.world.ctx.input;
      const at = inp.head.clone().add(_v.set(0, -0.35, 0));
      const dir = _v2.subVectors(at, e.root.position).setY(0).normalize();
      const s = new GiantScissors(e.world.ctx, at, _v3.set(-dir.z, 0, dir.x), 1.4, () => {
        const c = e.world.ctx.input.bodyCenter(new THREE.Vector3());
        if (c.distanceTo(at) < 0.9) e.world.hitPlayer(e.dmg(26), { type: 'slash', src: e });
      });
      // 예고 시간: 가위가 벌어지는 동안 피할 수 있다
      s.t = -0.35;
      e.fxs.push(s);
    }
  },
  fist: { L: 0.3, R: 0.6 },
};
const K_SLASH = {
  name: '칼 베기', range: [0, 1.3], cd: 2, w: 2, dur: 0.9,
  pose: (T, e, k) => {
    const i = k < 0.5 ? 0 : 1;
    const kk = (k - i * 0.5) * 2;
    const wind = sm(0, 0.4, kk) * (1 - sm(0.4, 0.5, kk));
    const cut = sm(0.4, 0.6, kk) * (1 - sm(0.75, 1, kk));
    const sg = i ? -1 : 1;
    T.shR = [-2.2 * wind - 0.6 * cut, 0, sg * (-0.6 * wind + 0.5 * cut)];
    T.elR = [-0.9 * wind, 0, 0];
    T.chest[1] += sg * (-0.3 * wind + 0.4 * cut);
  },
  tick: (e, k, m) => {
    m.hits ??= [false, false];
    const i = k < 0.5 ? 0 : 1;
    if (!m.hits[i] && (k - i * 0.5) * 2 > 0.55) {
      m.hits[i] = true;
      hitAt(e, handPos(e, 'R'), e.dmg(10), 0.85, 'slash');
      e.world.ctx.sfx.slash(e.root.position, 1.5);
    }
  },
  fist: { L: 0.3, R: 0.9 },
};

// 기술 묶음 · 버릇
const KITS = {
  bagmask: { moves: [JAB, CROSS, HOOK, KICK, COMBO], stance: 'boxer', keep: [0, 1.0] },
  mahito: { moves: [M_BLADE, M_DRILL, M_STRETCH, M_BIGFIST, M_TOUCH], stance: 'loose', keep: [0, 1.4] },
  jogo: { moves: [J_FIREBALL, J_ERUPT, J_INSECTS, J_FLAME], stance: 'volcano', keep: [3.5, 8] },
  fingerBearer: { moves: [COMBO, SLAM, LUNGE, KICK], stance: 'beast', keep: [0, 1.1] },
  kuchisake: { moves: [K_SNIP, K_SLASH, LUNGE], stance: 'creep', keep: [0, 1.3] },
  cyclops: { moves: [STOMP, SLAM, SWIPE], stance: 'heavy', keep: [0, 1.6] },
};

// ───────────────── 적 ─────────────────
export class RiggedEnemy extends Dummy {
  constructor(world, type, hp, pos) {
    super(world, type, hp, pos);
    this.kit = KITS[this.def.model] ?? KITS.bagmask;
    this.cds = {};
    this.cur = null;
    this.proj = [];
    this.fxs = [];
    this.walkPh = Math.random();
    this.lookT = 0;
    this.look = 0;
    this.flinch = 0;
    this.decide = rnd(0.3, 0.8);
    this.pose = Object.fromEntries(ORDER.map((k) => [k, [0, 0, 0]]));
    this.fingers = this.rig ? new FingerRig(this.rig) : null;
    this.scaled = new Set();
  }

  /** 기본 공격력 × 몸집 */
  dmg(x) {
    return x * (this.def.dmgMul ?? 1);
  }

  morph(part) {
    if (!this.rig) return;
    this.rig.show('ArmsNormal', !part);
    this.rig.show('ArmsBlades', part === 'ArmsBlades');
    this.rig.show('ArmDrill', part === 'ArmDrill');
  }

  boneScale(name, s) {
    const b = this.rig?.bones[name];
    if (!b) return;
    b.scale.setScalar(s);
    if (s !== 1) this.scaled.add(b);
    else this.scaled.delete(b);
  }

  damage(amount, info = {}) {
    const r = super.damage(amount, info);
    if (r > 0) this.flinch = Math.min(1, this.flinch + 0.5 + amount / 60);
    return r;
  }

  update(dt) {
    super.update(dt);
    if (!this.alive) return;
    // 손가락: 대기 · 이동 · 공격에 맞게 (래그돌로 날아갈 땐 힘이 빠진다)
    if (this.fingers) {
      let want = { L: 0.32, R: 0.32 };
      if (this.state !== 'stand') want = { L: 0.15, R: 0.15 };
      else if (this.cur?.def.fist) want = this.cur.def.fist;
      else if (this._moving) want = { L: 0.5, R: 0.5 };
      else if (this.kit.stance === 'boxer' && this._guard > 0.5) want = { L: 1, R: 1 };
      else if (this.kit.stance === 'beast') want = { L: 0.55, R: 0.55 };
      this.fingers.apply(dt, want);
    }
    this._updateProj(dt);
  }

  _dispose() {
    super._dispose();
    for (const f of this.fxs) f.dispose?.();
    this.fxs = [];
    this.proj = [];
  }

  /** 공격 중 날아가거나 쓰러지면 변신·늘린 뼈를 되돌린다 */
  _cancel() {
    if (!this.cur) return;
    this.cur.def.end?.(this, this.cur);
    this.cur = null;
    for (const b of this.scaled) b.scale.setScalar(1);
    this.scaled.clear();
    this.morph(null);
  }

  _step(dt) {
    if (this.state !== 'stand' && this.cur) this._cancel();
    super._step(dt);
  }

  _ai(dt) {
    const W = this.world;
    const ctx = W.ctx;
    const T = this.pose;
    const e = this;
    const aiOn = W.settings.dummyAI;
    // 1) 기본 자세 (팔은 내리고 팔꿈치는 살짝)
    for (const k of ORDER) T[k][0] = T[k][1] = T[k][2] = 0;
    T.shL = [0, 0, this.restZ];
    T.shR = [0, 0, -this.restZ];
    T.elL = [-0.15, 0, 0];
    T.elR = [-0.15, 0, 0];
    // 2) 숨쉬기 · 무게중심 · 두리번
    const t = this.t;
    const breathe = Math.sin(t * 1.7);
    T.chest[0] += breathe * 0.025;
    T.shL[2] += breathe * 0.02;
    T.shR[2] -= breathe * 0.02;
    const shift = Math.sin(t * 0.55);
    T.hips[2] += shift * 0.035;
    T.spine[2] -= shift * 0.03;
    T.knL[0] += 0.06 + Math.max(0, shift) * 0.08;
    T.knR[0] += 0.06 + Math.max(0, -shift) * 0.08;
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = rnd(1.2, 3.5);
      this.look = rnd(-0.6, 0.6);
    }
    // 3) 대상
    const head = W.decoy?.(this) ?? ctx.input.head;
    const flat = _v.subVectors(head, this.root.position).setY(0);
    const dist = flat.length();
    const S = this.scale;
    this._moving = false;
    // 버릇 (자세)
    const st = this.kit.stance;
    const engaged = aiOn && dist < 7 * S;
    this._guard = lerp(this._guard ?? 0, engaged ? 1 : 0, Math.min(1, dt * 3));
    const gK = this._guard;
    if (st === 'boxer') {
      guardPose(T, e, gK);
      T.chest[0] += 0.1 * gK;
      T.hips[1] += 0.25 * gK;
      T.chest[1] -= 0.2 * gK;
      T.knL[0] += Math.abs(Math.sin(t * 6)) * 0.05 * gK; // 가볍게 스텝
    } else if (st === 'loose') {
      T.head[2] += Math.sin(t * 0.8) * 0.18; // 장난스럽게 고개를 갸웃
      T.shL[0] += Math.sin(t * 0.9) * 0.1;
      T.shR[0] -= Math.sin(t * 0.9) * 0.1;
    } else if (st === 'beast') {
      T.chest[0] += 0.3;
      T.spine[0] += 0.15;
      T.neck[0] -= 0.25;
      T.shL[2] += 0.35;
      T.shR[2] -= 0.35;
      T.elL[0] -= 0.5;
      T.elR[0] -= 0.5;
      T.knL[0] += 0.3;
      T.knR[0] += 0.3;
      T.hpL[0] -= 0.2;
      T.hpR[0] -= 0.2;
    } else if (st === 'creep') {
      T.head[2] += 0.35 + Math.sin(t * 0.6) * 0.08; // 고개를 꺾은 채
      T.chest[0] += 0.12;
      T.shL[0] += Math.sin(t * 0.5) * 0.06;
    } else if (st === 'volcano') {
      // 죠고: 팔짱 끼듯 몸 앞으로 모으고 화가 나면 머리에서 연기
      T.shL = [-0.55, 0, 0.55];
      T.shR = [-0.55, 0, -0.55];
      T.elL = [-1.9, 0.3, 0];
      T.elR = [-1.9, -0.3, 0];
      if (Math.random() < 0.3) ctx.fx.fire.smoke(this.headPos(_v2).add(_v3.set(0, 0.25 * S, 0)), _v3.set(0, 0.8, 0), { size0: 0.08, size1: 0.35, life: 1.2, shade: 0.3, opacity: 0.5, rise: 0.8 });
    } else if (st === 'heavy') {
      T.chest[0] += 0.08 + breathe * 0.03;
      T.shL[0] += breathe * 0.04;
      T.shR[0] += breathe * 0.04;
    }
    T.head[1] += this.look * (1 - gK * 0.8);
    // 맞으면 움찔
    this.flinch = Math.max(0, this.flinch - dt * 3);
    T.chest[0] -= this.flinch * 0.35;
    T.head[0] -= this.flinch * 0.3;
    // 4) 공격 중
    if (this.cur) {
      const m = this.cur;
      m.t += dt;
      const k = Math.min(1, m.t / m.def.dur);
      if (m.def.track !== false && k < 0.4) this.faceTo(head);
      m.def.pose?.(T, e, k, m);
      m.def.tick?.(e, k, m, dt);
      if (k >= 1) {
        m.def.end?.(e, m);
        this.cur = null;
        this.decide = rnd(0.25, 0.7) / Math.max(0.6, this.def.aggro ?? 1);
      }
      this._applyPose(dt, 18);
      return;
    }
    if (!aiOn) {
      this._applyPose(dt, 8);
      return;
    }
    // 5) 고르기: 사거리 안의 기술 중에서 무작위 (자주 쓴 건 쉰다)
    for (const k in this.cds) this.cds[k] -= dt;
    this.decide -= dt;
    this.faceToward(head, dt);
    const [kMin, kMax] = this.kit.keep;
    if (this.decide <= 0 && dist < 16 * S) {
      const ok = this.kit.moves.filter((mv) => (this.cds[mv.name] ?? 0) <= 0 && dist >= mv.range[0] * S && dist <= mv.range[1] * S + 0.35);
      if (ok.length) {
        let r = Math.random() * ok.reduce((a, mv) => a + mv.w, 0);
        const mv = ok.find((x) => (r -= x.w) <= 0) ?? ok[0];
        this.cds[mv.name] = mv.cd;
        this.cur = { def: mv, t: 0, hit: false };
        mv.start?.(e, this.cur);
        this._applyPose(dt, 18);
        return;
      }
      this.decide = 0.2;
    }
    // 6) 거리 맞추기: 다가가거나(근접) 물러난다(죠고)
    let speed = 0;
    let dir = 0;
    if (dist > kMax * S + 0.3) dir = 1;
    else if (dist < kMin * S) dir = -1;
    if (dir) {
      speed = (this.def.speed ?? 1.7) * Math.sqrt(S) * (dir < 0 ? 0.7 : dist > 5 ? 1.3 : 1);
      flat.normalize();
      this.root.position.addScaledVector(flat, dir * speed * dt);
      this._moving = true;
    }
    this._walk(T, speed * dir, dt);
    this._applyPose(dt, 10);
  }

  /** 몸을 대상 쪽으로 천천히 돌린다 */
  faceToward(p, dt) {
    const dx = p.x - this.root.position.x;
    const dz = p.z - this.root.position.z;
    if (dx * dx + dz * dz < 1e-4) return;
    let d = Math.atan2(dx, dz) - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 6);
    if (this.state === 'stand') this.root.quaternion.setFromAxisAngle(_v2.set(0, 1, 0), this.yaw);
  }

  /** 걸음: 허벅지 앞뒤 · 무릎은 들 때 접고 · 팔은 반대로 · 상체는 비튼다 */
  _walk(T, v, dt) {
    const sp = Math.abs(v);
    const a = Math.min(1, sp / 2.2);
    this._walkA = lerp(this._walkA ?? 0, sp > 0.05 ? a : 0, Math.min(1, dt * 8));
    const A = this._walkA;
    if (A < 0.01) return;
    const stride = 1.1 * this.scale;
    this.walkPh += (dt * sp) / stride * (v < 0 ? -1 : 1);
    const ph = this.walkPh * Math.PI * 2;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    T.hpL[0] += -s * 0.55 * A;
    T.hpR[0] += s * 0.55 * A;
    T.knL[0] += Math.max(0, c) * 0.95 * A + 0.08 * A;
    T.knR[0] += Math.max(0, -c) * 0.95 * A + 0.08 * A;
    T.ftL[0] += -Math.max(0, c) * 0.35 * A;
    T.ftR[0] += -Math.max(0, -c) * 0.35 * A;
    if (this.kit.stance !== 'boxer' && this.kit.stance !== 'volcano') {
      T.shL[0] += s * 0.45 * A;
      T.shR[0] += -s * 0.45 * A;
      T.elL[0] -= 0.3 * A;
      T.elR[0] -= 0.3 * A;
    }
    T.chest[1] += s * 0.1 * A;
    T.hips[1] -= s * 0.08 * A;
    T.chest[0] += 0.06 * A + (sp > 2.5 ? 0.12 : 0);
  }

  /** 목표 자세로 관절을 부드럽게 옮긴다 */
  _applyPose(dt, rate) {
    const J = this.rig?.J;
    if (!J) return;
    const k = Math.min(1, dt * rate);
    for (const n of ORDER) {
      const j = J[n];
      if (!j) continue;
      const p = this.pose[n];
      j.rotation.x += (p[0] - j.rotation.x) * k;
      j.rotation.y += (p[1] - j.rotation.y) * k;
      j.rotation.z += (p[2] - j.rotation.z) * k;
    }
  }

  // 불벌레 같은 투사체
  _updateProj(dt) {
    if (this.fxs.length) this.fxs = this.fxs.filter((f) => f.update(dt));
    if (!this.proj.length) return;
    const W = this.world;
    const { fx } = W.ctx;
    const inp = W.ctx.input;
    const bc = inp.bodyCenter(_v3);
    for (const p of this.proj) {
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.life -= dt;
      const want = _v.subVectors(bc, p.p).normalize().multiplyScalar(5.5);
      p.v.lerp(want, Math.min(1, dt * 1.8));
      p.v.y += Math.sin(p.life * 13) * 0.3;
      p.p.addScaledVector(p.v, dt);
      fx.spawn(p.p, _v2.set(0, 0, 0), new THREE.Color().setHSL(0.06, 1, 0.55), 0.07, 0.2, 0, 0);
      if (p.p.distanceTo(bc) < 0.35 || p.p.distanceTo(inp.head) < 0.25) {
        p.life = 0;
        fx.burst(p.p, 10, new THREE.Color(0xff6a10), 2, 0.04, 0.3);
        if (!(W.meleeShield && W.meleeShield(this, p.p))) W.hitPlayer(this.dmg(5), { type: 'fire', src: this });
      }
      if (p.p.y < 0) p.life = 0;
    }
    this.proj = this.proj.filter((p) => p.life > 0);
  }
}

void bonePos;
void clamp01;
