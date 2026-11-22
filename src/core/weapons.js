// 날붙이 소품 (메구미의 주구 등): 진짜 물체처럼 떨어지고 · 던지면 돌며 날아가고 · 받아 쥘 수 있다
//  · 모델 원점 = 기본으로 쥐는 곳, +Y = 칼끝, +X = 날
//  · 쥔 채 크게 휘두르거나, 던져서 칼날이 빠르게 닿으면 벤다 (자른 면은 칼날이 지나간 면)
//  · 잡기(grab.js)가 손잡이·칼날 어디든 손이 닿은 자리를 쥐게 하고, 칼끝은 언제나 엄지 쪽(앞)으로 — 두 손으로도 쥔다
import * as THREE from 'three';
import { tryStick, followStuck } from './stab.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const TRAIL = 14;

/** 소품을 날붙이로: def { tip, base, lo, dmg, color } (원점 기준 +Y 길이 · lo = 손잡이 끝(음수)) */
export function makeWeapon(p, def) {
  p.weapon = { ...def, tipW: new THREE.Vector3(), baseW: new THREE.Vector3(), prevTip: null, tipVel: new THREE.Vector3(), arc: 0, hits: new Map(), trail: [], mesh: null, swish: 0 };
  p.big = true; // 길쭉하니 상자로 거리를 잰다
  p.unbreakable = true; // 주구는 부서지지 않는다
  return p;
}

function trailMesh(scene, color) {
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
  tg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(TRAIL * 2), 1));
  const idx = [];
  for (let i = 0; i < TRAIL - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  tg.setIndex(idx);
  const c = new THREE.Color(color ?? 0x8c9ef2);
  const m = new THREE.Mesh(tg, new THREE.ShaderMaterial({
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)}, vA * 0.45); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

/** 매 프레임: 칼끝 속도 · 궤적 · 베기. hand = 쥔 손(없으면 날아가는 중) */
export function stepWeapon(ctx, p, dt, hand = null, time = 0) {
  const W = p.weapon;
  if (!p.alive || p.away) {
    disposeWeaponFx(ctx, p);
    return;
  }
  // 꽂혀 있으면 박힌 곳을 따라간다 (쥔 동안은 grab.js 가)
  if (W.stuck && !hand) followStuck(ctx, p, dt);
  p.obj.updateMatrixWorld(true);
  W.baseW.set(0, W.base, 0).applyMatrix4(p.obj.matrixWorld);
  W.tipW.set(0, W.tip, 0).applyMatrix4(p.obj.matrixWorld);
  let speed = 0;
  if (W.prevTip && dt > 0) {
    W.tipVel.subVectors(W.tipW, W.prevTip).divideScalar(dt);
    speed = W.tipVel.length();
  }
  (W.prevTip ??= new THREE.Vector3()).copy(W.tipW);
  W.arc = speed > 1.8 ? W.arc + speed * dt : W.arc * Math.max(0, 1 - dt * 10);
  if (W.stuck) {
    if (W.mesh) W.mesh.visible = false;
    W.trail.length = 0;
    return;
  }
  // 궤적 (빠를 때만 보인다)
  if (speed > 2.5 || W.trail.length) {
    W.mesh ??= trailMesh(ctx.scene, W.color);
    W.trail.unshift({ a: W.baseW.clone(), b: W.tipW.clone(), s: speed });
    if (W.trail.length > TRAIL) W.trail.pop();
    if (W.trail.every((t) => t.s < 2.5) && W.trail.length >= TRAIL) W.trail.length = 0;
    const P = W.mesh.geometry.attributes.position;
    const A = W.mesh.geometry.attributes.alpha;
    for (let i = 0; i < TRAIL; i++) {
      const t = W.trail[Math.min(i, W.trail.length - 1)];
      if (!t) break;
      P.setXYZ(i * 2, t.a.x, t.a.y, t.a.z);
      P.setXYZ(i * 2 + 1, t.b.x, t.b.y, t.b.z);
      const a = THREE.MathUtils.clamp((t.s - 2.5) / 5, 0, 1) * (1 - i / TRAIL);
      A.setX(i * 2, a * 0.2);
      A.setX(i * 2 + 1, a);
    }
    P.needsUpdate = true;
    A.needsUpdate = true;
    W.mesh.visible = W.trail.length > 0;
  }
  // 베기: 쥐고 크게 휘두를 때 · 던져서 빠르게 날아갈 때
  const desk = hand?.source === 'desktop';
  // 칼끝으로 찌르면(칼끝부터 던지면) 꽂힌다 — 꽂히면 베지 않는다
  if (!desk && tryStick(ctx, p, hand)) return;
  const big = hand ? (desk ? speed > 2.6 : speed > 4 && W.arc > 0.4) : speed > 6;
  if (big) slash(ctx, p, speed, hand, time);
}

function slash(ctx, p, speed, hand, time) {
  const W = p.weapon;
  const { world, fx, sfx } = ctx;
  const dir = _v4.subVectors(W.tipW, W.baseW).normalize();
  for (const t of world.targets()) {
    if (t === p || !t.alive || t.dying || t.held) continue;
    if (time - (W.hits.get(t) ?? -10) < 0.4) continue;
    const c = t.center(_v);
    const dummy = t.kind === 'dummy';
    const s = t.scale ?? 1;
    const r = (dummy ? 0.22 * s : t.big ? 0.03 : t.radius ?? 0.3) + 0.04;
    const g0 = dummy ? (t.root?.position.y ?? 0) + 0.25 * s : 0;
    const g1 = dummy ? (t.root?.position.y ?? 0) + 1.75 * s : 0;
    let best = Infinity;
    const near = _v3;
    for (let i = 0; i <= 6; i++) {
      const q = _v2.lerpVectors(W.baseW, W.tipW, i / 6);
      const dd = dummy ? q.distanceTo(new THREE.Vector3(c.x, THREE.MathUtils.clamp(q.y, g0, g1), c.z)) : t.big ? t.distanceTo(q) : q.distanceTo(c);
      if (dd < best) {
        best = dd;
        near.copy(q);
      }
    }
    if (best > r) continue;
    if (dummy) c.y = THREE.MathUtils.clamp(near.y, g0 + 0.2 * s, g1 - 0.1 * s);
    else if (t.big) c.copy(near);
    W.hits.set(t, time);
    const n = _v2.crossVectors(dir, W.tipVel).normalize();
    if (n.lengthSq() < 0.5) n.set(0, 1, 0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, c);
    const push = W.tipVel.clone().normalize().multiplyScalar(1.5);
    fx.burst(near, 12, new THREE.Color(0xc8d0ff), 2.5, 0.03, 0.3, { dir: push, dirAmt: 1 });
    sfx.cut(near);
    t.damage((28 + Math.min(speed, 14) * 8) * (W.dmg ?? 1), { type: 'slash', plane, push });
    if (t.alive) t.impulse?.(push.multiplyScalar(1.2), 2);
    hand?.pulse?.(0.8, 60);
    if (hand) ctx.game.hitstop = Math.max(ctx.game.hitstop ?? 0, 0.03);
    else p.vel.multiplyScalar(0.6); // 던진 칼은 베고 나면 힘이 빠진다
  }
  if (W.swish < time) {
    W.swish = time + 0.25;
    sfx.slash(W.tipW, 1.1);
  }
}

export function disposeWeaponFx(ctx, p) {
  const W = p.weapon;
  if (!W?.mesh) return;
  ctx.scene.remove(W.mesh);
  W.mesh.geometry.dispose();
  W.mesh.material.dispose();
  W.mesh = null;
  W.trail.length = 0;
}
