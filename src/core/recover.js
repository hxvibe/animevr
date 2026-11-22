// 쓰러진 적이 일어나기 · 놓인 적이 발로 착지하기
//  관절 회전은 J(더미 관절)의 오일러(x 앞뒤 · y 비틀기 · z 옆)로 — 어깨 −x 앞으로 들기, 엉덩이 −x 접기, 무릎 +x 굽히기
//  T 자세 모델은 팔을 restZ 만큼 내린 것이 '차렷'이다 (어깨 z 에 늘 더한다)
import * as THREE from 'three';

const D2R = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;

// 관절 반지름 (바닥 접촉: 가장 낮은 관절이 바닥에 닿게) — dummy.js 의 RAD 와 같다
const RAD = { hips: 0.15, chest: 0.16, neck: 0.09, head: 0.12, shL: 0.09, shR: 0.09, elL: 0.06, elR: 0.06, hdL: 0.05, hdR: 0.05, hpL: 0.1, hpR: 0.1, knL: 0.075, knR: 0.075, ftL: 0.07, ftR: 0.07 };
const JOINTS = Object.keys(RAD);

/**
 * 일어나기 키프레임: t(초) · pitch(몸통 기울기°, +앞으로 엎드림 / −뒤로 누움) · sup(이 구간 동안 바닥에 고정되는 지점) · j(관절 오일러)
 *  엎드림: 팔을 어깨 밑에 → 팔굽혀 상체를 든다 → 무릎을 배 밑으로 → 한쪽 무릎을 세워 디딘다 → 일어선다
 */
const PRONE = [
  { t: 0.0, pitch: 88, sup: ['hips'], j: { head: [-0.55, 0, 0], shL: [-1.5, 0, 0.35], shR: [-1.5, 0, -0.35], elL: [-1.75, 0, 0], elR: [-1.75, 0, 0], ftL: [0.6, 0, 0], ftR: [0.6, 0, 0] } },
  { t: 0.55, pitch: 42, sup: ['hips'], j: { spine: [-0.15, 0, 0], head: [-0.35, 0, 0], shL: [-0.75, 0, 0.15], shR: [-0.75, 0, -0.15], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0], ftL: [0.6, 0, 0], ftR: [0.6, 0, 0] } },
  { t: 1.05, pitch: 62, sup: ['hdL', 'hdR'], j: { head: [-0.25, 0, 0], shL: [-1.25, 0, 0.1], shR: [-1.25, 0, -0.1], elL: [-0.15, 0, 0], elR: [-0.15, 0, 0], hpL: [-1.05, 0, 0], hpR: [-1.05, 0, 0], knL: [1.6, 0, 0], knR: [1.6, 0, 0], ftL: [0.45, 0, 0], ftR: [0.45, 0, 0] } },
  { t: 1.5, pitch: 12, sup: ['knR'], j: { spine: [0.15, 0, 0], hpL: [-1.75, 0, 0], knL: [1.6, 0, 0], ftL: [0.1, 0, 0], hpR: [-0.2, 0, 0], knR: [1.6, 0, 0], ftR: [0.6, 0, 0], shL: [-0.55, 0, 0.05], elL: [-0.9, 0, 0], shR: [-0.15, 0, 0], elR: [-0.3, 0, 0] } },
  { t: 1.95, pitch: 5, sup: ['ftL'], j: { spine: [0.1, 0, 0], hpL: [-0.55, 0, 0], knL: [0.6, 0, 0], hpR: [-0.15, 0, 0], knR: [0.5, 0, 0], ftR: [0.15, 0, 0], shL: [-0.2, 0, 0], elL: [-0.4, 0, 0], elR: [-0.25, 0, 0] } },
  { t: 2.3, pitch: 0, sup: ['ftL', 'ftR'], j: { elL: [-0.28, 0, 0], elR: [-0.28, 0, 0] } },
];
/** 누움: 손을 뒤로 짚고 윗몸을 일으켜 무릎을 세운다 → 앞으로 굴러 쪼그려 앉는다 → 일어선다 */
const SUPINE = [
  { t: 0.0, pitch: -88, sup: ['hips'], j: { head: [0.35, 0, 0], shL: [0.1, 0, 0.1], shR: [0.1, 0, -0.1] } },
  { t: 0.55, pitch: -30, sup: ['hips'], j: { spine: [0.35, 0, 0], head: [0.25, 0, 0], hpL: [-1.95, 0, 0], hpR: [-1.95, 0, 0], knL: [2.0, 0, 0], knR: [2.0, 0, 0], ftL: [-0.2, 0, 0], ftR: [-0.2, 0, 0], shL: [0.75, 0, 0.25], shR: [0.75, 0, -0.25], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0] } },
  { t: 1.05, pitch: 38, sup: ['ftL', 'ftR'], j: { spine: [0.3, 0, 0], head: [-0.2, 0, 0], hpL: [-2.05, 0, 0], hpR: [-2.05, 0, 0], knL: [2.3, 0, 0], knR: [2.3, 0, 0], ftL: [-0.55, 0, 0], ftR: [-0.55, 0, 0], shL: [-1.2, 0, 0.1], shR: [-1.2, 0, -0.1], elL: [-0.3, 0, 0], elR: [-0.3, 0, 0] } },
  { t: 1.6, pitch: 18, sup: ['ftL', 'ftR'], j: { spine: [0.15, 0, 0], hpL: [-1.0, 0, 0], hpR: [-1.0, 0, 0], knL: [1.3, 0, 0], knR: [1.3, 0, 0], ftL: [-0.3, 0, 0], ftR: [-0.3, 0, 0], shL: [-0.6, 0, 0], shR: [-0.6, 0, 0], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0] } },
  { t: 2.1, pitch: 0, sup: ['ftL', 'ftR'], j: { elL: [-0.28, 0, 0], elR: [-0.28, 0, 0] } },
];
const BLEND_IN = 0.35; // 쓰러진 자세 → 첫 키프레임

/** 키프레임 하나의 관절 회전 (팔은 restZ 만큼 내린 차렷 기준) */
function keyQuat(d, key, name, out) {
  const a = key.j[name];
  const rz = d.restZ ?? 0;
  const z = (a ? a[2] : 0) + (name === 'shL' ? rz : name === 'shR' ? -rz : 0);
  return out.setFromEuler(_e.set(a ? a[0] : 0, a ? a[1] : 0, z));
}

/** 지금 자세의 여러 관절 중점 (월드) */
function midOf(J, names, out) {
  out.set(0, 0, 0);
  for (const n of names) out.add(J[n].getWorldPosition(_v2));
  return out.divideScalar(names.length);
}

/** 가장 낮은 관절이 바닥에 닿게 root 높이를 맞춘다 */
function restOnFloor(d, J, only = null) {
  d.root.updateMatrixWorld(true);
  let low = Infinity;
  const lost = d._lost?.().keys;
  for (const n of only ?? JOINTS) {
    if (lost?.has(n) || !J[n]) continue;
    low = Math.min(low, J[n].getWorldPosition(_v2).y - RAD[n] * d.scale);
  }
  if (low < Infinity) d.root.position.y -= low;
}

/** 쓰러진 자세에서 일어나기 시작 */
export function startGetup(d) {
  const J = d._jointMap();
  // 몸통 앞(가슴) · 위(머리 쪽) 방향으로 엎드림/누움을 가린다
  const f = _v.set(0, 0, 1).applyQuaternion(d.root.quaternion);
  const u = new THREE.Vector3(0, 1, 0).applyQuaternion(d.root.quaternion);
  const prone = f.y < 0;
  const keys = prone ? PRONE : SUPINE;
  // 얼굴 방향: 엎드리면 머리 쪽, 누우면 발 쪽을 보고 일어난다
  const hx = prone ? u.x : -u.x;
  const hz = prone ? u.z : -u.z;
  if (hx * hx + hz * hz > 1e-4) d.yaw = Math.atan2(hx, hz);
  d._gu = {
    keys,
    prone,
    t: 0,
    speed: 0.9 + Math.random() * 0.2,
    q0: d.root.quaternion.clone(),
    j0: Object.fromEntries(Object.entries(J).map(([k, j]) => [k, j.quaternion.clone()])),
    seg: null, // 첫 프레임에 받침점을 잰다 (-1 로 두면 첫 구간의 받침점이 원점(0,0,0)으로 남아 맵 가운데로 순간이동했다)
    anchor: new THREE.Vector3(),
  };
}

/** 한 프레임: 끝나면 true */
export function stepGetup(d, dt) {
  const G = d._gu;
  if (!G) return true;
  const J = d._jointMap();
  G.t += dt * G.speed;
  const keys = G.keys;
  const yawQ = _q2.setFromAxisAngle(UP, d.yaw);
  const tt = G.t - BLEND_IN;
  let seg;
  let u;
  if (tt < 0) {
    // 쓰러진 자세에서 첫 자세로
    seg = -1;
    u = ease(Math.max(0, G.t / BLEND_IN));
    const k0 = keys[0];
    d.root.quaternion.copy(yawQ).multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), k0.pitch * D2R));
    d.root.quaternion.slerpQuaternions(G.q0, d.root.quaternion.clone(), u);
    for (const [n, j] of Object.entries(J)) j.quaternion.slerpQuaternions(G.j0[n], keyQuat(d, k0, n, _q), u);
  } else {
    seg = keys.length - 2;
    for (let i = 0; i < keys.length - 1; i++) {
      if (tt < keys[i + 1].t) {
        seg = i;
        break;
      }
    }
    const A = keys[seg];
    const B = keys[seg + 1];
    u = ease(THREE.MathUtils.clamp((tt - A.t) / (B.t - A.t), 0, 1));
    const pitch = lerp(A.pitch, B.pitch, u) * D2R;
    d.root.quaternion.copy(yawQ).multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), pitch));
    const qa = new THREE.Quaternion();
    for (const [n, j] of Object.entries(J)) j.quaternion.slerpQuaternions(keyQuat(d, A, n, qa), keyQuat(d, B, n, _q), u);
  }
  // 받침점: 구간이 바뀌는 순간의 위치에 고정 (그 점을 축으로 몸이 움직인다 — 미끄러지지 않게)
  const sup = seg < 0 ? keys[0].sup : keys[seg].sup;
  d.root.updateMatrixWorld(true);
  if (seg !== G.seg) {
    G.seg = seg;
    midOf(J, sup, G.anchor);
  }
  const now = midOf(J, sup, _v);
  d.root.position.x += G.anchor.x - now.x;
  d.root.position.z += G.anchor.z - now.z;
  restOnFloor(d, J);
  const last = keys[keys.length - 1];
  if (tt >= last.t) {
    d._gu = null;
    for (const [n, j] of Object.entries(J)) j.quaternion.copy(keyQuat(d, last, n, _q));
    d.root.quaternion.setFromAxisAngle(UP, d.yaw);
    d.root.updateMatrixWorld(true);
    restOnFloor(d, J, ['ftL', 'ftR']);
    d.root.position.y = Math.max(0, Math.min(d.root.position.y, 0.05));
    return true;
  }
  return false;
}

// ───────── 놓였을 때 발로 서기 ─────────
/**
 * 놓인 순간: 몸이 서 있는 자세에 가깝고(가슴이 엉덩이 위), 세게 던진 게 아니면
 *  · 발이 땅 가까이 → 그 자리에 디디고 선다 (살짝 무릎 굽힘)
 *  · 공중(2.2m 이하) → 선 자세로 떨어져 발로 착지 (높을수록 깊게 굽힘 · 너무 세게 떨어지면 무너진다)
 * @returns true 면 래그돌 대신 이 방식으로 처리한다
 */
export function tryLand(d) {
  const R = d.rag;
  if (!R || d.dying || d.frozen || d.legless || !d.alive) return false;
  const P = R.p;
  const I = (k) => d._ragIndex().indexOf(k);
  const up = _v.subVectors(P[I('chest')], P[I('hips')]).normalize();
  if (up.y < 0.75) return false; // 거꾸로 · 옆으로 누운 채면 무너진다
  const v = d.vel;
  if (Math.hypot(v.x, v.z) > 3.2 || v.y > 3) return false; // 던졌다
  const feet = Math.min(P[I('ftL')].y, P[I('ftR')].y) - RAD.ftL * d.scale;
  if (feet > 2.2 * d.scale) return false;
  // 얼굴 방향 = 몸통 앞
  const f = _v2.set(0, 0, 1).applyQuaternion(d.root.quaternion).setY(0);
  if (f.lengthSq() > 1e-4) d.yaw = Math.atan2(f.x, f.z);
  const J = d._jointMap();
  d._ld = { q0: d.root.quaternion.clone(), j0: Object.fromEntries(Object.entries(J).map(([k, j]) => [k, j.quaternion.clone()])), t: 0, dip: 0.25, land: 0 };
  d.rag = null;
  d.angVel.set(0, 0, 0);
  if (feet < 0.12 * d.scale) {
    d.vel.set(v.x * 0.3, 0, v.z * 0.3);
    d.state = 'land';
  } else d.state = 'drop';
  d.stateT = 0;
  return true;
}

/** 떨어지며 착지 준비: 몸을 세우고 무릎을 살짝 굽힌다 */
const READY = { hpL: [-0.35, 0, 0], hpR: [-0.25, 0, 0], knL: [0.55, 0, 0], knR: [0.45, 0, 0], ftL: [-0.15, 0, 0], ftR: [-0.15, 0, 0], shL: [-0.35, 0, 0.45], shR: [-0.35, 0, -0.45], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0], spine: [0.1, 0, 0] };

export function stepDrop(d, dt) {
  const L = d._ld;
  const J = d._jointMap();
  L.t += dt;
  const k = 1 - Math.exp(-dt * 9);
  const upQ = _q2.setFromAxisAngle(UP, d.yaw);
  d.root.quaternion.slerp(upQ, k);
  for (const [n, j] of Object.entries(J)) j.quaternion.slerp(keyQuat(d, { j: READY }, n, _q), k);
  d.vel.y -= 9.8 * dt;
  d.root.position.addScaledVector(d.vel, dt);
  d.world.collideActor?.(d.root.position, 0.28 * d.scale, { height: 1.7 * d.scale, who: d });
  d.root.updateMatrixWorld(true);
  let low = Infinity;
  for (const n of ['ftL', 'ftR']) low = Math.min(low, J[n].getWorldPosition(_v).y - RAD[n] * d.scale);
  if (low <= 0) {
    d.root.position.y -= low;
    const impact = -d.vel.y;
    if (impact > 9) return 'crumple';
    L.dip = THREE.MathUtils.clamp(impact / 6.5, 0.3, 1);
    L.t = 0;
    for (const [n, j] of Object.entries(J)) L.j0[n] = j.quaternion.clone(); // 착지 굽힘은 지금 자세에서 이어진다
    d.vel.set(d.vel.x * 0.25, 0, d.vel.z * 0.25);
    d.world.ctx.sfx?.play?.('punch_1', { at: d.root.position, vol: 0.25 + L.dip * 0.4, rate: 0.6 });
    return 'land';
  }
  return null;
}

/** 착지: 무릎을 굽혀 충격을 받았다가 편다 → 선다 */
export function stepLand(d, dt) {
  const L = d._ld;
  const J = d._jointMap();
  L.t += dt;
  const dur = 0.35 + 0.35 * L.dip;
  const k = Math.min(1, L.t / dur);
  // 굽힘: 금방 깊어졌다가 천천히 편다
  const bend = L.dip * (k < 0.3 ? ease(k / 0.3) : 1 - ease((k - 0.3) / 0.7));
  const blend = Math.min(1, L.t / 0.15);
  d.root.quaternion.slerp(_q2.setFromAxisAngle(UP, d.yaw), Math.min(1, blend + dt * 10));
  const pose = {
    hpL: [-1.0 * bend, 0, 0], hpR: [-0.9 * bend, 0, 0], knL: [1.7 * bend, 0, 0], knR: [1.6 * bend, 0, 0], ftL: [-0.7 * bend, 0, 0], ftR: [-0.7 * bend, 0, 0],
    spine: [0.35 * bend, 0, 0], shL: [-0.5 * bend, 0, 0.3 * bend], shR: [-0.5 * bend, 0, -0.3 * bend], elL: [-0.28 - 0.4 * bend, 0, 0], elR: [-0.28 - 0.4 * bend, 0, 0],
  };
  for (const [n, j] of Object.entries(J)) {
    const target = keyQuat(d, { j: pose }, n, _q);
    if (blend < 1 && L.j0[n]) j.quaternion.slerpQuaternions(L.j0[n], target, blend);
    else j.quaternion.copy(target);
  }
  d.root.position.addScaledVector(d.vel, dt);
  d.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
  d.world.collideActor?.(d.root.position, 0.28 * d.scale, { height: 1.7 * d.scale, who: d });
  restOnFloor(d, J, ['ftL', 'ftR']);
  if (k >= 1) {
    d._ld = null;
    d.root.position.y = Math.max(0, Math.min(d.root.position.y, 0.05));
    return true;
  }
  return false;
}
