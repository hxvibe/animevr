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

/**
 * 천역모: 닿은 상대의 발동 중인 술식을 강제로 해제한다 — 무하한이 꺼지고(구멍이 뚫린 듯 · 6초), 펼치던 술식이 끊긴다
 */
export function nullify(ctx, d, at) {
  const W = ctx.world;
  const was = !!d.infinityOn;
  d.burnout = Math.max(d.burnout ?? 0, W.time + 6);
  d._cancel?.();
  ctx.fx.burst(at ?? d.center(new THREE.Vector3()), 22, new THREE.Color(0xffe0a0), 3, 0.03, 0.4);
  ctx.sfx.play?.('shatter_2', { at, vol: 0.5, rate: 0.7 });
  if (was || (ctx._toldNull ?? 0) < W.time) {
    ctx._toldNull = W.time + 20;
    ctx.ui.callout(was ? '천역모 — 무하한에 구멍이 뚫렸다 (술식 강제 해제)' : '천역모 — 발동 중인 술식이 강제로 해제된다', { color: '#ffe0a0', dur: 1.6 });
  }
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
    if ((d.def?.infinity || d.type === 'gojo') && !W.nullify) {
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
  // ── 물체 (다른 날붙이 제외 · 다른 손에 쥔 물체에도 꽂힌다)
  for (const o of world.props) {
    if (o === p || !o.alive || o.away || o.weapon) continue;
    if (o.held && hand && ctx.grab?.held?.[hand.side]?.t === o) continue;
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
  if (W.nullify) nullify(ctx, d, entry);
  d.damage((30 + Math.min(along, 12) * 7) * (W.dmg ?? 1), { type: 'pierce', dir: dir.clone(), point: entry.clone(), color: '#ff6060', soul: W.soul, vsInf: W.nullify ? 2 : undefined });
  if (d.alive) d.impulse?.(dir.clone().multiplyScalar(hand ? 1.2 : 2.5), 1);
  (d.stuckBy ??= new Set()).add(p);
  // 쥔 채로 찔렀으면 그대로 꿴다 (놓았다 다시 쥐지 않아도 적이 칼을 따라온다)
  if (p.held) onGrabStuck(ctx, p);
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
  W.stuck = { kind: 'world', pos: p.pos.clone(), quat: p.obj.quaternion.clone(), depth };
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
  if (S.pin) {
    // 적째 박혀 있다: 칼은 박힌 자리에, 적은 상처 자리가 칼에 꿰인 채
    p.pos.copy(S.pin.pos);
    p.obj.quaternion.copy(S.pin.quat);
    if (S.by && t.holders?.has(S.by)) afterHoldStuck(ctx, p, true);
    else S.pin = null;
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
  if (S.kind === 'prop' && S.carried) S.t.held = false;
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
  if (S.kind === 'dummy' && S.by && S.t.holders?.has(S.by)) return; // 이미 꿰여 있다 (적째 박힌 칼)
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
  // 박힌 채 움직이지 않는 곳: 바닥 · 벽 · 무거운 물체 · 다른 손이 쥔 물체(그 손을 따라간다)
  const otherHeld = S.kind === 'prop' && S.t.held && !S.carried;
  const heavy = S.kind === 'world' || (S.kind === 'prop' && (S.t.kg ?? 0) > lift) || (S.kind === 'prop' && S.t.fixed) || otherHeld;
  if (heavy || S.pin) {
    if (yank > 3.2) {
      unstick(ctx, p, true);
      h.pulse?.(0.8, 80);
      return false;
    }
    if (S.kind === 'world' || S.pin) {
      // 바닥 · 벽: 원하는 만큼 더 깊이 밀어 넣거나 뽑아낸다 — 적보다 단단해 천천히 (넣기 0.35m/s · 빼기 0.8m/s)
      const A = S.pin ?? S;
      const dt = ctx._dt ?? 0.016;
      const want = _v2.subVectors(target, A.pos).dot(dir);
      const step = THREE.MathUtils.clamp(want, -0.8 * dt, 0.35 * dt);
      const maxD = Math.max(0.05, (W.tip - W.base) * 0.95); // 칼날 밑동까지
      const nd = Math.min(maxD, A.depth + step);
      if (nd <= 0.004) {
        // 다 뽑혔다 (적과 함께 박혀 있었으면 적에게서는 아직 안 빠졌다)
        if (S.pin) {
          S.pin = null;
          ctx.sfx.whoosh?.(W.tipW, 0.3, 1.2);
          return false;
        }
        unstick(ctx, p, true);
        h.pulse?.(0.8, 80);
        return false;
      }
      if (Math.abs(nd - A.depth) > 1e-5) {
        A.pos.addScaledVector(dir, nd - A.depth);
        A.depth = nd;
        if (Math.random() < 0.3) h.pulse?.(0.25, 20);
      }
      p.pos.copy(A.pos);
      p.obj.quaternion.copy(A.quat);
      if (S.pin) afterHoldStuck(ctx, p, true);
    } else {
      // 무거운 물체 · 다른 손이 쥔 물체: 그 물체에 박힌 그대로, 칼자루 쪽으로 12cm 넘게 당기면 뽑힌다
      const pull = -_v2.subVectors(target, p.pos).dot(dir);
      if (pull > 0.12) {
        unstick(ctx, p, true);
        h.pulse?.(0.8, 80);
        return false;
      }
      followStuck(ctx, p);
    }
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
export function afterHoldStuck(ctx, p, pinned = false) {
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
      p.obj.updateMatrixWorld(true);
      const at = _v.copy(S.lpWound ?? (S.lpWound = woundLocal(p, S))).applyMatrix4(p.obj.matrixWorld);
      d.holdAt(at, S.by, p.obj.quaternion);
    }
    if (pinned) return;
    // 적을 꿴 채 칼끝이 바닥 · 벽까지 들어갔다 → 적째 박힌다 (놓아도 못 일어난다)
    if (S.by && !S.pin) {
      const W = p.weapon;
      p.obj.updateMatrixWorld(true);
      const tip = _v2.set(0, W.tip, 0).applyMatrix4(p.obj.matrixWorld);
      const dir = _v3.set(0, 1, 0).applyQuaternion(p.obj.quaternion);
      let into = tip.y < -0.015 ? -tip.y / Math.max(0.2, -dir.y) : 0;
      if (!into) {
        const G = ctx.env?.current?.group;
        const wp = S.wound ? S.wound.getWorldPosition(_v4) : null;
        if (G && wp && !ctx.env.hidden) {
          const len = tip.distanceTo(wp);
          _ray.set(wp, dir);
          _ray.far = len;
          const hh = _ray.intersectObject(G, true).find((x) => x.object.visible && !x.object.userData.isProp && x.face);
          if (hh) into = len - hh.distance;
        }
      }
      if (into > 0.02) {
        S.pin = { pos: p.pos.clone(), quat: p.obj.quaternion.clone(), depth: into };
        ctx.fx.burst(tip, 12, new THREE.Color(0xfff0c0), 2, 0.02, 0.25);
        ctx.sfx.play?.('shatter_2', { at: tip, vol: 0.45, rate: 1.3 });
        if (!ctx._toldPin) {
          ctx._toldPin = true;
          ctx.ui.callout('적째 바닥에 박았다 — 놓아도 못 일어난다 (칼을 뽑으면 풀린다)', { color: '#ff9a9a', dur: 2 });
        }
        return;
      }
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
    S.carried = true; // 칼에 매달려 들려 있다 (다른 손이 쥔 게 아니다)
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
  if (S.kind === 'dummy' && S.pin && S.by && S.t.holders?.has(S.by)) {
    // 적째 박혀 있다: 칼은 그 자리에, 적은 꿰인 채 (못 일어난다)
  } else if (S.kind === 'dummy') {
    if (S.by && S.t.holders?.has(S.by)) S.t.release(vel.clone().multiplyScalar(0.8), S.by);
    S.by = null;
    S.lpWound = null;
  } else if (S.kind === 'prop' && S.carried) {
    S.t.held = false;
    S.carried = false;
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

// ───────────── 칼이 물체 · 바닥 · 벽 · 적을 뚫지 못하게 ─────────────
const _cp = new THREE.Vector3();
const _pn = new THREE.Vector3();
const _push = new THREE.Vector3();
const _pts = Array.from({ length: 7 }, () => new THREE.Vector3());
const _A = new THREE.Vector3();
const _B = new THREE.Vector3();
const _C = new THREE.Vector3();

/** 점이 상자 소품에 파고든 깊이 (n: 소품 → 점 방향) */
function boxPen(o, pt, n, r) {
  const c = o.center(_cp);
  _q.copy(o.obj.quaternion).invert();
  const L = _v4.subVectors(pt, c).applyQuaternion(_q);
  const he = o.he;
  const dx = he.x - Math.abs(L.x);
  const dy = he.y - Math.abs(L.y);
  const dz = he.z - Math.abs(L.z);
  if (dx > 0 && dy > 0 && dz > 0) {
    if (dx <= dy && dx <= dz) n.set(Math.sign(L.x) || 1, 0, 0);
    else if (dy <= dz) n.set(0, Math.sign(L.y) || 1, 0);
    else n.set(0, 0, Math.sign(L.z) || 1);
    n.applyQuaternion(o.obj.quaternion);
    return Math.min(dx, dy, dz) + r;
  }
  o.closest(pt, _cp);
  n.subVectors(pt, _cp);
  const d = n.length();
  if (d >= r || d < 1e-6) return 0;
  n.divideScalar(d);
  return r - d;
}

/**
 * 칼(쥔 칼 포함)이 바닥 · 벽 · 물체 · 적 몸속으로 들어가면 밖으로 밀어낸다.
 *  · 크게 휘둘러 실제로 벤 적은 그대로 지나간다(베인 것) · 꽂힌 칼은 stab 이 맡는다
 *  · 가볍고 아무도 안 쥔 물체는 칼에 밀려나고, 그 밖엔 칼이 멈춘다 — 쥔 손의 보이는 손도 칼과 함께 (grab._block)
 *  · 날아가던 칼은 부딪힌 면에서 튕긴다
 */
export function collideWeapon(ctx, p, hand) {
  const W = p.weapon;
  const push = (W.push ??= new THREE.Vector3()).set(0, 0, 0);
  if (W.stuck || !p.alive) return;
  const { world } = ctx;
  p.obj.updateMatrixWorld(true);
  const n = _pts.length;
  for (let i = 0; i < n; i++) _pts[i].set(0, W.lo + ((W.tip - W.lo) * i) / (n - 1), 0).applyMatrix4(p.obj.matrixWorld);
  const R = 0.012; // 칼날 두께 (반)
  const add = (nv, d) => {
    // 같은 방향으로는 가장 깊은 것만 (겹쳐 더하지 않게)
    const along = push.dot(nv);
    if (along < d) push.addScaledVector(nv, d - along);
  };
  // ── 바닥 (쥔 칼만 — 놓인 칼은 소품 물리가 맡는다)
  if (hand) {
    let low = 0;
    for (const q of _pts) low = Math.max(low, R - q.y);
    if (low > 0) add(_pn.set(0, 1, 0), low);
  }
  // ── 벽 · 고정물 (배경): 칼자루 → 칼끝 광선이 면을 지나면 칼끝이 면에 닿을 때까지 민다
  const env = ctx.env;
  const G = env?.current?.group;
  if (G && !env.hidden) {
    const b = env.bounds;
    let near = false;
    for (const q of _pts) {
      if (b && (q.x < b.minX + 0.6 || q.x > b.maxX - 0.6 || q.z < b.minZ + 0.6 || q.z > b.maxZ - 0.6)) near = true;
      if (q.y < 0.08) near = true;
      for (const c of env.colliders ?? []) if (q.y < (c.maxY ?? 99) + 0.1 && q.x > c.minX - 0.15 && q.x < c.maxX + 0.15 && q.z > c.minZ - 0.15 && q.z < c.maxZ + 0.15) near = true;
      if (near) break;
    }
    if (near) {
      const a = _pts[0];
      const e = _pts[n - 1];
      const len = a.distanceTo(e);
      _ray.set(a, _v.subVectors(e, a).normalize());
      _ray.far = len;
      const h = _ray.intersectObject(G, true).find((x) => x.object.visible && !x.object.userData.isProp && x.face);
      if (h) {
        const nv = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        if (nv.dot(_ray.ray.direction) > 0) nv.negate();
        const d = _v2.subVectors(e, h.point).dot(nv) * -1 + R;
        if (d > 0 && !(nv.y > 0.6 && !hand)) add(nv, d);
      }
    }
  }
  // ── 물체
  const lift = ctx.grab?._liftKg?.() ?? 60;
  for (const o of world.props) {
    if (o === p || !o.alive || o.away || !o.obj || o.weapon?.stuck?.t === p) continue;
    if (o.weapon && !hand) continue; // 놓인 칼끼리는 소품 충돌로
    const reach = Math.max(o.he.x, o.he.y, o.he.z) + Math.abs(W.tip - W.lo) + 0.2;
    if (o.center(_C).distanceToSquared(p.pos) > reach * reach) continue;
    const movable = !o.held && !o.fixed && (o.kg ?? 0) <= Math.min(lift * 0.5, 30);
    for (const q of _pts) {
      const d = boxPen(o, q, _pn, R);
      if (d <= 0) continue;
      if (movable && hand) {
        o.pos.addScaledVector(_pn, -d);
        const vn = -(W.tipVel?.dot(_pn) ?? 0);
        if (vn > 0) o.vel.addScaledVector(_pn, (-vn * 1.2 * 4) / (4 + (o.kg ?? 1)));
        o.asleep = false;
      } else add(_pn, d);
    }
  }
  // ── 적 몸 (방금 실제로 벤 적은 지나간다)
  for (const d of world.dummies) {
    if (!d.alive || d.dying) continue;
    if (world.time - (W.hits.get(d) ?? -9) < 0.25) continue;
    if (d.center(_C).distanceTo(p.pos) > 1.2 * (d.scale ?? 1) + Math.abs(W.tip - W.lo)) continue;
    const J = d._jointMap?.();
    if (!J) continue;
    const s = d.scale ?? 1;
    const lost = d._lost?.().set;
    for (const [a, b, r] of SEGS) {
      if (!J[a] || !J[b] || (lost && (lost.has(RAG_I[a]) || lost.has(RAG_I[b])))) continue;
      J[a].getWorldPosition(_A);
      J[b].getWorldPosition(_B);
      for (const q of _pts) {
        const dist = segDist(q, _A, _B, _C);
        const pen = r * s + R - dist;
        if (pen <= 0 || dist < 1e-6) continue;
        add(_pn.subVectors(q, _C).divideScalar(dist), pen);
      }
    }
  }
  // 쥔 칼: 막힌 만큼을 기억해 두고 손 목표에 더한다 (매 프레임 파고들었다 밀려나며 떨지 않게) · 안 막히면 서서히 풀린다
  const block = (W.block ??= new THREE.Vector3());
  if (!hand) block.set(0, 0, 0);
  if (push.lengthSq() < 1e-8) {
    block.multiplyScalar(0.85);
    return;
  }
  push.clampLength(0, 0.25);
  p.pos.add(push);
  W.prevTip?.add(push); // 밀려난 건 휘두른 속도가 아니다
  if (hand) block.add(push).clampLength(0, 0.4);
  if (!hand) {
    // 날아가던 칼: 부딪힌 면에서 튕긴다
    _pn.copy(push).normalize();
    const vn = p.vel.dot(_pn);
    if (vn < 0) p.vel.addScaledVector(_pn, -vn * 1.35);
    p.spin.multiplyScalar(0.85);
  }
}
