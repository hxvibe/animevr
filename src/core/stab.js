// 꽂기: 날붙이를 칼끝으로 찔러(또는 칼끝부터 던져) 적 · 물체 · 바닥 · 벽에 꽂는다
//  · 적: 피가 나고(상처에서 계속 흐른다) 적은 빈손으로 그 자리를 부여잡는다 (서 있으면 팔을 IK로, 쓰러져 있으면 손 관절을 끌어다)
//        꽂힌 칼은 그 부위 뼈를 따라 움직인다 · 고죠(무하한)에겐 꽂히지 않는다 — 마허라가 무하한에 다 적응했을 때 퇴마의 검으로만
//  · 꽂힌 칼을 쥐면: 적이 칼에 꿰인 채 손을 따라 끌려온다 (적의 몸무게가 그대로 실려 굼뜨고, 들 힘이 모자라면 끌기만 한다)
//        칼을 칼자루 쪽으로 홱 잡아당기면 빠진다 (피가 뿜어진다)
//  · 물체: 가벼운 물체는 꽂힌 채 들고 다닐 수 있고, 무거운 물체 · 바닥 · 벽에 꽂힌 칼은 그 자리에 박혀 있다 → 칼자루 쪽으로 당겨 뽑는다
import * as THREE from 'three';
import { RAG } from './dummy.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _ray = new THREE.Raycaster();
const BLOOD = new THREE.Color(0x5a0508);
const RAG_I = Object.fromEntries(RAG.map((k, i) => [k, i]));

// 몸의 뼈대 선분 (앞 관절 뼈에 꽂힌다) · 두께
const SEGS = [
  ['hips', 'chest', 0.17], ['chest', 'neck', 0.15], ['neck', 'head', 0.1], ['head', 'head', 0.12],
  ['chest', 'shL', 0.12], ['shL', 'elL', 0.06], ['elL', 'hdL', 0.05], ['chest', 'shR', 0.12], ['shR', 'elR', 0.06], ['elR', 'hdR', 0.05],
  ['hips', 'hpL', 0.13], ['hpL', 'knL', 0.08], ['knL', 'ftL', 0.06], ['hips', 'hpR', 0.13], ['hpR', 'knR', 0.08], ['knR', 'ftR', 0.06],
];
const ARM_L = new Set(['shL', 'elL', 'hdL']);
const ARM_R = new Set(['shR', 'elR', 'hdR']);

function segDist(p, a, b, out) {
  const ab = _v4.subVectors(b, a);
  const L = ab.lengthSq();
  const t = L > 1e-9 ? THREE.MathUtils.clamp(_v3.subVectors(p, a).dot(ab) / L, 0, 1) : 0;
  out.copy(a).addScaledVector(ab, t);
  return out.distanceTo(p);
}

/** 점 p 가 적의 몸속인가 → { key(꽂힐 뼈), dist } */
export function bodyHit(d, p) {
  const J = d._jointMap?.();
  if (!J) return null;
  const s = d.scale ?? 1;
  const lost = d._lost?.().set;
  let best = null;
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  for (const [a, b, r] of SEGS) {
    if (!J[a] || !J[b]) continue;
    if (lost && (lost.has(RAG_I[a]) || lost.has(RAG_I[b]))) continue;
    J[a].getWorldPosition(A);
    J[b].getWorldPosition(B);
    if (a === 'head') A.y += 0.04 * s;
    const dd = segDist(p, A, B, C) - r * s;
    if (dd < 0 && (!best || dd < best.dist)) best = { key: a === 'chest' && b !== 'neck' ? 'chest' : a, dist: dd };
  }
  return best;
}

/** 상처: 뼈에 붙은 빈 물체 (피가 나오는 자리 · 부여잡는 자리) · +Y = 상처 밖으로 */
export function addWound(ctx, d, key, point, outDir, { dur = 6, rate = 16 } = {}) {
  const bone = d._jointMap?.()[key];
  if (!bone) return null;
  const w = new THREE.Object3D();
  bone.add(w);
  bone.updateMatrixWorld(true);
  w.position.copy(bone.worldToLocal(point.clone()));
  bone.getWorldQuaternion(_q).invert();
  w.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _v2.copy(outDir).normalize()).premultiply(_q);
  w.userData.r = 0.03;
  w.userData.key = key;
  w.userData.t = 0;
  w.userData.life = dur + 4;
  (d.wounds ??= []).push(w);
  ctx.world.bleed(w, dur, rate);
  return w;
}

/** 날붙이가 꽂힐까 (stepWeapon 이 매 프레임) */
export function tryStick(ctx, p, hand) {
  const W = p.weapon;
  if (W.stuck || W.noStickT > ctx.world.time) return false;
  const dir = _v.subVectors(W.tipW, W.baseW).normalize();
  const along = W.tipVel.dot(dir); // 칼끝이 칼날 방향으로 나아가는 속도
  if (along < (hand ? 2.2 : 4.5)) return false;
  const { world } = ctx;
  // ── 적
  for (const d of world.dummies) {
    if (!d.alive) continue;
    if (d.center(_v2).distanceTo(W.tipW) > 1.4 * (d.scale ?? 1)) continue;
    const hit = bodyHit(d, W.tipW);
    if (!hit) continue;
    if (d.def?.infinity || d.type === 'gojo') {
      // 무하한: 칼끝이 닿기 직전에 멈춘다
      if ((W.infT ?? 0) < world.time) {
        W.infT = world.time + 0.6;
        ctx.fx.burst(W.tipW, 12, new THREE.Color(0x9fe8ff), 2, 0.03, 0.3);
        ctx.sfx.play?.('shatter_2', { at: W.tipW, vol: 0.3, rate: 1.6 });
        if (!p.held) p.vel.multiplyScalar(-0.3);
        if (!ctx._toldInfStab) {
          ctx._toldInfStab = true;
          ctx.ui.callout('무하한 — 칼끝이 닿지 않는다 (마허라가 다 적응하면 퇴마의 검으로는 꽂힌다)', { color: '#9fe8ff', dur: 2 });
        }
      }
      return false;
    }
    stickDummy(ctx, p, d, hit.key, along, hand, dir);
    return true;
  }
  // ── 물체 (다른 날붙이 · 쥔 물체 제외)
  for (const o of world.props) {
    if (o === p || !o.alive || o.away || o.weapon || o.held) continue;
    if (o.center(_v2).distanceTo(W.tipW) > Math.max(o.he.x, o.he.y, o.he.z) + 0.3) continue;
    if (o.closest(W.tipW, _v3).distanceToSquared(W.tipW) > 1e-6) continue; // 칼끝이 상자 안
    stickProp(ctx, p, o, along);
    return true;
  }
  // ── 바닥 · 벽 (배경): 칼날 선 위에서 표면을 지났는가
  const G = ctx.env?.current?.group;
  if (G && !ctx.env.hidden) {
    const len = W.baseW.distanceTo(W.tipW);
    _ray.set(W.baseW, dir);
    _ray.far = len;
    const hits = _ray.intersectObject(G, true);
    const h = hits.find((x) => x.object.visible && !x.object.userData.isProp && x.face);
    if (h) {
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (n.dot(dir) > 0) n.negate();
      if (-n.dot(dir) > 0.35) {
        stickWorld(ctx, p, h.point, dir, along);
        return true;
      }
    }
    // 땅(y=0)
    if (W.tipW.y < 0.0 && W.baseW.y > 0 && dir.y < -0.35) {
      const k = W.baseW.y / (W.baseW.y - W.tipW.y);
      stickWorld(ctx, p, _v2.lerpVectors(W.baseW, W.tipW, k), dir, along);
      return true;
    }
  }
  return false;
}

/** 칼 원점의 자세를 기준(뼈 · 물체)에 대한 상대 자세로 기억 */
function anchorTo(p, obj) {
  obj.updateMatrixWorld(true);
  const lp = obj.worldToLocal(p.pos.clone());
  obj.getWorldQuaternion(_q).invert();
  const lq = _q.clone().multiply(p.obj.quaternion);
  return { lp, lq };
}

function stickDummy(ctx, p, d, key, along, hand, dir) {
  const W = p.weapon;
  const { world, fx, sfx, ui } = ctx;
  const bone = d._jointMap()[key];
  // 조금 더 깊이 (칼끝이 몸속 6cm)
  p.pos.addScaledVector(dir, 0.04);
  p.obj.updateMatrixWorld(true);
  const tip = W.tipW.clone().addScaledVector(dir, 0.04);
  const a = anchorTo(p, bone);
  W.stuck = { kind: 'dummy', t: d, key, bone, ...a, dir0: dir.clone() };
  p.fixed = true;
  p.vel.set(0, 0, 0);
  p.spin.set(0, 0, 0);
  // 상처 · 피
  const entry = tip.clone().addScaledVector(dir, -0.08);
  W.stuck.wound = addWound(ctx, d, key, entry, dir.clone().negate(), { dur: 8, rate: 14 });
  fx.burst(entry, 26, BLOOD, 2.8, 0.05, 0.6, { dark: true, grav: 9, dir: dir.clone().negate(), dirAmt: 0.8 });
  sfx.cut?.(entry);
  sfx.play?.('punch_3', { at: entry, vol: 0.6, rate: 1.3 });
  d.damage((30 + Math.min(along, 12) * 7) * (W.dmg ?? 1), { type: 'pierce', dir: dir.clone(), point: entry.clone(), color: '#ff6060' });
  if (d.alive) d.impulse?.(dir.clone().multiplyScalar(hand ? 1.2 : 2.5), 1);
  (d.stuckBy ??= new Set()).add(p);
  hand?.pulse?.(0.9, 90);
  ctx.game.hitstop = Math.max(ctx.game.hitstop ?? 0, 0.05);
  if (!ctx._toldStab) {
    ctx._toldStab = true;
    ui.callout('꽂혔다 — 칼을 쥐면 적이 꿰인 채 끌려오고, 칼자루 쪽으로 홱 당기면 빠진다', { color: '#ff9a9a', dur: 2.2 });
  }
}

function stickProp(ctx, p, o, along) {
  const W = p.weapon;
  const a = anchorTo(p, o.obj);
  W.stuck = { kind: 'prop', t: o, ...a };
  p.fixed = true;
  p.vel.set(0, 0, 0);
  p.spin.set(0, 0, 0);
  o.damage?.(Math.min(along, 12) * 2);
  o.impulse?.(_v.subVectors(W.tipW, W.baseW).normalize().multiplyScalar(Math.min(4, along * 0.4)));
  ctx.fx.burst(W.tipW, 10, new THREE.Color(o.color ?? 0xcccccc), 2, 0.03, 0.3);
  ctx.sfx.play?.('punch_3', { at: W.tipW, vol: 0.45, rate: 1.5 });
}

function stickWorld(ctx, p, at, dir, along) {
  const W = p.weapon;
  // 칼끝이 표면 안 8~14cm 에 박힌다 (세게 찌를수록 깊게)
  const depth = 0.06 + Math.min(0.08, along * 0.008);
  p.pos.addScaledVector(dir, depth - _v.subVectors(W.tipW, at).dot(dir));
  p.obj.updateMatrixWorld(true);
  W.stuck = { kind: 'world', pos: p.pos.clone(), quat: p.obj.quaternion.clone() };
  p.fixed = true;
  p.vel.set(0, 0, 0);
  p.spin.set(0, 0, 0);
  ctx.fx.burst(at, 14, new THREE.Color(0xfff0c0), 2.5, 0.02, 0.25);
  ctx.world.shatter?.emit(at, 8, 0x8c877e, { spread: 0.05, speed: 2, dir: dir.clone().negate(), dirAmt: 1.4, size: 0.025 });
  ctx.sfx.play?.('shatter_2', { at, vol: 0.4, rate: 1.4 });
}

/** 꽂혀 있는 동안 (쥐지 않았으면): 박힌 곳을 따라 움직인다 */
export function followStuck(ctx, p, dt = 0.016) {
  const S = p.weapon.stuck;
  if (!S) return;
  if (S.kind === 'world') return;
  const t = S.t;
  // 박힌 대상이 사라졌다 → 떨어진다
  const gone = !t.alive && (S.kind === 'prop' || !t.root?.parent);
  if (gone || (S.kind === 'dummy' && !S.bone.parent)) {
    unstick(ctx, p, false);
    return;
  }
  const obj = S.kind === 'dummy' ? S.bone : t.obj;
  obj.updateMatrixWorld(true);
  p.pos.copy(S.lp).applyMatrix4(obj.matrixWorld);
  obj.getWorldQuaternion(_q);
  p.obj.quaternion.copy(_q).multiply(S.lq);
  // 꽂힌 채로 피해가 조금씩 (1초마다)
  if (S.kind === 'dummy' && t.alive && !t.dying) {
    S.acc = (S.acc ?? 0) + dt;
    if (S.acc >= 1) {
      S.acc = 0;
      t.damage(3, { type: 'bleed' });
    }
  }
}

/** 뺀다 */
export function unstick(ctx, p, pulled = true) {
  const W = p.weapon;
  const S = W.stuck;
  if (!S) return;
  W.stuck = null;
  W.noStickT = ctx.world.time + 0.4;
  p.fixed = false;
  p.asleep = false;
  if (S.kind === 'dummy') {
    S.t.stuckBy?.delete(p);
    if (S.by && S.t.holders?.has(S.by)) S.t.release(new THREE.Vector3(), S.by);
    if (pulled && S.wound) {
      // 뽑으면 피가 뿜어진다 (상처는 남아 계속 흐른다)
      S.wound.getWorldPosition(_v);
      _v2.set(0, 1, 0).applyQuaternion(S.wound.getWorldQuaternion(_q));
      ctx.fx.burst(_v, 34, BLOOD, 3.4, 0.05, 0.7, { dark: true, grav: 9, dir: _v2.clone(), dirAmt: 0.9 });
      ctx.world.bleed(S.wound, 5, 22);
      ctx.sfx.cut?.(_v);
    }
  }
  if (pulled) ctx.sfx.whoosh?.(p.pos, 0.4, 1.4);
}

/** 꽂힌 칼을 쥐었다: 적에 꽂혀 있으면 적을 칼에 꿴 채로 쥔다 */
export function onGrabStuck(ctx, p) {
  const S = p.weapon.stuck;
  if (!S) return;
  p.fixed = false;
  if (S.kind === 'dummy' && S.t.alive && !S.t.dying) {
    S.by = { side: 'weapon', drop: () => (S.by = null), onLimb: () => {} };
    const ok = S.t.grab(S.by, S.wound ? S.wound.getWorldPosition(new THREE.Vector3()) : p.weapon.tipW, S.key);
    if (!ok) S.by = null;
  }
}

/**
 * 쥔 손이 꽂힌 칼을 움직이려 한다 (grab.js 가 손 기준 목표 자세를 넘긴다).
 *  돌려주는 값: true = 칼은 박힌 그대로 (손이 움직일 수 없다) · false = 칼이 손을 따라간다 (적 · 가벼운 물체가 함께)
 *  extra: 칼에 함께 실린 무게(kg) — 손이 따라오는 굼뜸에 더한다
 */
export function holdStuck(ctx, p, h, target, lift) {
  const W = p.weapon;
  const S = W.stuck;
  if (!S) return false;
  const dir = _v.set(0, 1, 0).applyQuaternion(p.obj.quaternion);
  // 칼자루 쪽으로 홱 당기기 (손 속도의 칼날 반대 방향 성분)
  const yank = -h.vel.dot(dir);
  const heavy = S.kind === 'world' || (S.kind === 'prop' && (S.t.kg ?? 0) > lift) || (S.kind === 'prop' && S.t.fixed);
  if (heavy) {
    // 박힌 그대로: 손이 칼자루 쪽으로 12cm 넘게 빠지면 뽑힌다
    const pull = -_v2.subVectors(target, p.pos).dot(dir);
    if (pull > 0.12 || yank > 3) {
      unstick(ctx, p, true);
      h.pulse?.(0.8, 80);
      return false;
    }
    if (S.kind === 'world') {
      p.pos.copy(S.pos);
      p.obj.quaternion.copy(S.quat);
    } else followStuck(ctx, p);
    p.vel.set(0, 0, 0);
    return true;
  }
  if (yank > 2.6) {
    unstick(ctx, p, true);
    h.pulse?.(0.9, 100);
    return false;
  }
  W.extraKg = S.kind === 'dummy' ? 75 * (S.t.scale ?? 1) ** 3 : S.t.kg ?? 0;
  // 들 힘이 모자라면 들어 올리지 못하고 끌기만 한다
  const total = (p.kg ?? 0) + W.extraKg;
  if (total > lift) {
    const k = (lift / total) ** 2;
    target.y = p.pos.y + Math.min(0, target.y - p.pos.y) + Math.max(0, target.y - p.pos.y) * k;
  }
  return false;
}

/** 칼이 손을 따라 움직인 뒤: 꿰인 적 · 꽂힌 물체가 칼을 따라온다 */
export function afterHoldStuck(ctx, p) {
  const S = p.weapon.stuck;
  if (!S) return;
  if (S.kind === 'dummy') {
    const d = S.t;
    if (!d.alive) {
      unstick(ctx, p, false);
      return;
    }
    if (S.by && d.holders?.has(S.by)) {
      // 칼끝 가까이(상처 자리)를 칼과 함께 움직인다
      const at = _v.copy(S.lpWound ?? (S.lpWound = woundLocal(p, S))).applyMatrix4(p.obj.matrixWorld);
      d.holdAt(at, S.by, p.obj.quaternion);
    }
    // 뼈 기준 자세를 새로 잰다 (놓으면 그 자리에 꽂힌 채)
    Object.assign(S, anchorTo(p, S.bone));
  } else if (S.kind === 'prop') {
    // 꽂힌 물체를 칼에 매단 채
    const o = S.t;
    p.obj.updateMatrixWorld(true);
    _q2.copy(S.lq).invert();
    o.obj.quaternion.copy(p.obj.quaternion).multiply(_q2);
    o.obj.updateMatrixWorld(true);
    const off = _v2.copy(S.lp).applyQuaternion(o.obj.quaternion);
    const prev = _v3.copy(o.pos);
    o.pos.copy(p.pos).sub(off);
    o.vel.subVectors(o.pos, prev).divideScalar(Math.max(1e-3, ctx._dt ?? 0.016));
    o.held = true;
    o.asleep = false;
  }
}

function woundLocal(p, S) {
  p.obj.updateMatrixWorld(true);
  const w = S.wound ? S.wound.getWorldPosition(new THREE.Vector3()) : p.weapon.tipW.clone();
  return p.obj.worldToLocal(w);
}

/** 쥔 손이 꽂힌 칼을 놓았다 */
export function onReleaseStuck(ctx, p, vel) {
  const S = p.weapon.stuck;
  if (!S) return false;
  p.weapon.extraKg = 0;
  if (S.kind === 'dummy') {
    if (S.by && S.t.holders?.has(S.by)) S.t.release(vel.clone().multiplyScalar(0.8), S.by);
    S.by = null;
    S.lpWound = null;
  } else if (S.kind === 'prop') {
    S.t.held = false;
    S.t.vel.copy(vel).clampLength(0, 12);
  }
  p.fixed = true;
  p.vel.set(0, 0, 0);
  p.spin.set(0, 0, 0);
  return true;
}

// ───────────── 부여잡기 ─────────────
const _e = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _dq2 = new THREE.Quaternion();
const _bq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const IDQ = new THREE.Quaternion();

/** 2관절 CCD: 어깨 · 팔꿈치를 돌려 손이 target 에 닿게 (w: 섞는 정도) */
function reach(sh, el, hd, target, w) {
  for (let it = 0; it < 3; it++) {
    for (const b of [el, sh]) {
      hd.getWorldPosition(_e);
      b.getWorldPosition(_b);
      const toE = _e.sub(_b);
      const toT = _t.copy(target).sub(_b);
      if (toE.lengthSq() < 1e-6 || toT.lengthSq() < 1e-6) continue;
      _dq2.setFromUnitVectors(toE.normalize(), toT.normalize());
      _dq.copy(IDQ).slerp(_dq2, w);
      b.getWorldQuaternion(_bq);
      b.parent.getWorldQuaternion(_pq).invert();
      b.quaternion.copy(_pq.multiply(_dq.multiply(_bq)));
      b.updateMatrixWorld(true);
    }
  }
}

/** 상처가 있는 적: 빈손으로 그 자리를 부여잡는다 (world 가 적을 움직인 뒤 매 프레임) */
export function updateWounds(ctx, d, dt) {
  const ws = d.wounds;
  if (!ws?.length) return;
  for (const w of ws) w.userData.t += dt;
  // 오래된 상처는 정리 (칼이 꽂혀 있으면 그대로)
  d.wounds = ws.filter((w) => {
    const stuck = [...(d.stuckBy ?? [])].some((p) => p.weapon?.stuck?.wound === w);
    if (stuck || w.userData.t < w.userData.life) return true;
    w.parent?.remove(w);
    return false;
  });
  if (!d.alive || !d.wounds.length) return;
  const w = d.wounds[d.wounds.length - 1];
  const key = w.userData.key;
  const lostR = d.lostRoots ?? new Set();
  // 상처 반대쪽 팔 (그 팔이 없으면 다른 팔, 팔에 난 상처면 반대 팔)
  let side = ARM_L.has(key) ? 'R' : ARM_R.has(key) ? 'L' : null;
  if (!side) {
    const J = d._jointMap();
    w.getWorldPosition(_v);
    side = J.shL.getWorldPosition(_v2).distanceTo(_v) < J.shR.getWorldPosition(_v3).distanceTo(_v) ? 'L' : 'R';
  }
  if (lostR.has('sh' + side)) side = side === 'L' ? 'R' : 'L';
  if (lostR.has('sh' + side)) return;
  // 손바닥이 상처 위에 얹히게: 상처에서 바깥으로 4cm
  const target = w.getWorldPosition(_v).add(_v2.set(0, 1, 0).applyQuaternion(w.getWorldQuaternion(_q)).multiplyScalar(0.04 * (d.scale ?? 1)));
  w.userData.k = Math.min(1, (w.userData.k ?? 0) + dt * 2.5);
  const k = w.userData.k;
  if (d.rag && d.state !== 'stand' && d.state !== 'getup') {
    // 래그돌: 손 관절을 상처로 끌어다 둔다
    const i = RAG_I['hd' + side];
    if (i !== undefined && !d.rag.pins?.has(i)) d.rag.p[i].lerp(target, 0.25 * k);
  } else {
    const J = d._jointMap();
    const sh = J['sh' + side];
    const el = J['el' + side];
    const hd = J['hd' + side];
    if (sh?.parent && el && hd) reach(sh, el, hd, target, 0.85 * k);
  }
}
