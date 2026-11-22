// 마히토 — 「無為転変(무위전변)」 영혼의 형태를 바꾸면 몸이 따라 바뀐다
//  · 맨손바닥으로 상대를 만지면 영혼을 비틀어 개조 인간으로 (변형한 손이나 주먹으로는 발동하지 않는다)
//  · 자기 몸은 마음대로: 손날을 세우면 칼날 팔 · 주먹을 앞으로 겨누면 드릴 팔 · 검지로 찌르면 팔이 늘어난다
//  · 개조 인간 스톡: 몸속에 체스 말만 하게 줄여 넣어 둔 개조 인간을 입에서 꺼내 던지면 풀려나 벌레 같은 개조 인간이 된다
//  · 다중혼 「撥体(발체)」: 스톡 8개를 꺼내 두 손 사이에 모아 영혼을 합친다 → 밀면 8마리가 한 덩어리로 꼬여 튀어나간다
//  · 영역전개 「自閉円頓裹(자폐원돈과)」: 손으로 가득한 영역 — 안의 모든 영혼에 무위전변이 필중
import * as THREE from 'three';
import { cool, coolLeft } from '../../core/cooldown.js';
import { Caster } from '../../core/caster.js';
import { HandAura } from '../../core/handAura.js';
import { ShellDomain } from '../../core/shellDomain.js';
import { TransfiguredWorm, StockPiece, MergedWorms } from '../../core/transfigured.js';
import { HandMaw, VOID_WALL, bakeHandSet } from '../../core/mahitoDomain.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const AURA = { glow: 0x5a9ab0, hot: 0xc8f0ff, inner: 0x061418, line: 0x000000 };
const SOUL = new THREE.Color(0x7ad8ff);
const FLESH = 0xc8c0bc;
const FLESH_C = new THREE.Color(0xc08070);
const _q = new THREE.Quaternion();
const rnd = (a, b) => a + Math.random() * (b - a);

// 영역 「自閉円頓裹」: 셀 수 없는 손이 빽빽한 안쪽
const HANDS_GLSL = /* glsl */ `
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdCap(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float handSdf(vec2 p) {
  float d = sdBox(p - vec2(0.0, -0.08), vec2(0.12, 0.13)) - 0.04;
  d = min(d, sdCap(p, vec2(-0.1, 0.06), vec2(-0.15, 0.29), 0.032));
  d = min(d, sdCap(p, vec2(-0.035, 0.08), vec2(-0.05, 0.37), 0.035));
  d = min(d, sdCap(p, vec2(0.035, 0.08), vec2(0.05, 0.35), 0.034));
  d = min(d, sdCap(p, vec2(0.1, 0.06), vec2(0.16, 0.26), 0.03));
  d = min(d, sdCap(p, vec2(0.13, -0.12), vec2(0.29, 0.0), 0.038));
  return d;
}
// 손 무늬 한 겹: x = 덮임(0~1), y = 테두리
vec2 handLayer(vec2 uv, float t, float seed) {
  vec2 id = floor(uv);
  vec2 f = fract(uv) - 0.5;
  float r = dh(vec3(id, seed));
  float ang = (r - 0.5) * 3.0 + sin(t * 0.7 + r * 6.0) * 0.18;
  mat2 m = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  float s = 0.7 + 0.4 * dh(vec3(id, seed + 1.0));
  vec2 q = m * (f + (vec2(dh(vec3(id, seed + 2.0)), dh(vec3(id, seed + 3.0))) - 0.5) * 0.2) / s;
  float d = handSdf(q);
  return vec2(1.0 - smoothstep(-0.005, 0.01, d), 1.0 - smoothstep(0.0, 0.025, abs(d)));
}
vec3 handsColor(vec2 uv, float t) {
  vec3 bg = mix(vec3(0.05, 0.04, 0.06), vec3(0.16, 0.11, 0.14), dfbm(vec3(uv * 0.6, t * 0.05)));
  vec3 col = bg;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 L = handLayer(uv * (1.0 + fi * 0.37) + vec2(fi * 0.31, fi * 0.17), t, fi * 7.0);
    vec3 skin = mix(vec3(0.62, 0.66, 0.7), vec3(0.85, 0.88, 0.9), dh(vec3(floor(uv * (1.0 + fi * 0.37)), fi)));
    skin *= 0.55 + 0.45 * (1.0 - fi * 0.25);
    col = mix(col, skin, L.x);
    col = mix(col, vec3(0.01), L.y * 0.9);
  }
  return col;
}
`;

// ───────────────── 손에 붙는 변형 ─────────────────
function bladeGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.035, 0);
  s.lineTo(0.035, 0);
  s.quadraticCurveTo(0.05, 0.4, 0.0, 0.78);
  s.quadraticCurveTo(-0.02, 0.4, -0.035, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
  g.translate(0, 0, -0.006);
  g.rotateX(-Math.PI / 2); // +Y → -Z (손끝 방향)
  return g;
}
function drillGeo() {
  const g = new THREE.ConeGeometry(0.09, 0.5, 14, 6, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const r = Math.hypot(p.getX(i), p.getZ(i));
    const rr = r * (1 + 0.18 * Math.sin(a * 3 + y * 40));
    p.setXYZ(i, Math.cos(a) * rr, y, Math.sin(a) * rr);
  }
  g.computeVertexNormals();
  g.translate(0, 0.25, 0);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** 손 틀: 손바닥 위치, -Z = 손끝, Y = 손등 */
function handMatrix(h, out) {
  const F = _v.copy(h.fingersDir).normalize();
  const N = _v2.copy(h.palmNormal).negate();
  N.addScaledVector(F, -N.dot(F)).normalize();
  const X = _v3.crossVectors(N, F.clone().negate()).normalize();
  out.makeBasis(X, N, F.clone().negate());
  out.setPosition(h.palm);
  return out;
}

class HandForm {
  constructor(ctx) {
    this.ctx = ctx;
    const mat = new THREE.MeshToonMaterial({ color: FLESH });
    const bone = new THREE.MeshToonMaterial({ color: 0xe8e2d8 });
    this.mats = [mat, bone];
    this.blade = new THREE.Mesh(bladeGeo(), bone);
    this.drill = new THREE.Mesh(drillGeo(), mat);
    this.group = new THREE.Group();
    this.group.add(this.blade, this.drill);
    for (const m of [this.blade, this.drill]) {
      const ol = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide }));
      ol.scale.setScalar(1.06);
      ol.visible = false; // 먹선 없음
      m.add(ol);
      this.mats.push(ol.material);
      m.visible = false;
      m.scale.setScalar(0.01);
    }
    ctx.scene.add(this.group);
    this.form = null;
    this.k = 0;
  }

  set(form) {
    if (form === this.form) return;
    this.form = form;
    this.k = 0;
    if (form) {
      this.ctx.sfx.play('grab', { at: this.group.position, vol: 0.5, rate: 0.6 });
      this.ctx.fx.burst(this.group.position, 10, new THREE.Color(FLESH), 1.5, 0.03, 0.3);
    }
  }

  update(dt, h) {
    this.k = Math.min(1, this.k + dt * 6);
    const on = !!this.form && h?.active;
    this.group.visible = on;
    if (!on) return;
    handMatrix(h, _m);
    _m.decompose(this.group.position, this.group.quaternion, this.group.scale);
    this.group.scale.setScalar(1);
    const e = 1 - Math.pow(1 - this.k, 3);
    this.blade.visible = this.form === 'blade';
    this.drill.visible = this.form === 'drill';
    this.blade.scale.setScalar(Math.max(0.01, e));
    this.drill.scale.setScalar(Math.max(0.01, e));
    this.blade.position.set(0, 0.02, -0.05);
    this.drill.position.set(0, 0, 0.0);
    if (this.form === 'drill') this.drill.rotation.z += dt * 30;
  }

  /** 칼날·드릴 끝 (월드) */
  tip(out) {
    const L = this.form === 'blade' ? 0.82 : 0.55;
    return out.set(0, 0, -L).applyQuaternion(this.group.quaternion).add(this.group.position);
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    for (const m of this.mats) m.dispose();
    this.blade.geometry.dispose();
    this.drill.geometry.dispose();
  }
}

// 늘어나는 팔
class StretchArm {
  constructor(ctx, side = 'right') {
    this.ctx = ctx;
    this.side = side;
    this.mat = new THREE.MeshToonMaterial({ color: FLESH });
    // 팔: +Z 로 길이 1 (앞으로 늘어난다) — 손목 쪽이 살짝 가늘다
    this.tube = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.048, 1, 12, 8, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), this.mat);
    this.hand = this._makeHand();
    this.tube.visible = this.hand.visible = false;
    this.tube.frustumCulled = this.hand.frustumCulled = false;
    ctx.scene.add(this.tube, this.hand);
    this.t = -1;
  }

  /** 마히토 손(주먹)을 모델에서 구워 쓴다 — 없으면 둥근 주먹으로 */
  _makeHand() {
    const S = bakeHandSet();
    if (!S) return new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10).scale(1, 0.85, 1.2), this.mat);
    const g = new THREE.BufferGeometry();
    const P = S.geo.attributes.pClose.clone();
    const N = S.geo.attributes.nClose.clone();
    const idx = Array.from(S.geo.index.array);
    if (this.side === 'left') {
      // 오른손 → 왼손: x 를 뒤집고 면 방향도 뒤집는다
      for (let i = 0; i < P.count; i++) {
        P.setX(i, -P.getX(i));
        N.setX(i, -N.getX(i));
      }
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    }
    g.setAttribute('position', P);
    g.setAttribute('normal', N);
    g.setIndex(idx);
    // 손 좌표(손목 원점 · 손가락 +Y · 손바닥 +Z · 길이 1) → 실제 크기 (마히토는 손이 조금 크다)
    g.scale(0.2, 0.2, 0.2);
    this.elbowY = S.elbowY * 0.2;
    return new THREE.Mesh(g, this.mat);
  }

  fire(from, dir, len, onHit) {
    this.from = from.clone();
    this.dir = dir.clone().normalize();
    this.len = len;
    this.onHit = onHit;
    this.t = 0;
    this.hit = false;
    this.ctx.sfx.whoosh(from, 0.6, 1.5);
  }

  get active() {
    return this.t >= 0;
  }

  update(dt, h) {
    if (this.t < 0) return;
    this.t += dt;
    const out = 0.16;
    const hold = 0.08;
    const back = 0.25;
    let k;
    if (this.t < out) k = this.t / out;
    else if (this.t < out + hold) {
      k = 1;
      if (!this.hit) {
        this.hit = true;
        this.onHit?.(this.from.clone().addScaledVector(this.dir, this.len));
      }
    } else k = Math.max(0, 1 - (this.t - out - hold) / back);
    if (h?.active) this.from.copy(h.palm).addScaledVector(h.fingersDir ?? this.dir, -0.08); // 손목 언저리에서 뻗는다
    const L = Math.max(0.05, this.len * (1 - Math.pow(1 - k, 2)));
    this.tube.position.copy(this.from);
    this.tube.lookAt(_v.copy(this.from).add(this.dir));
    const wob = 1 + Math.sin(this.t * 40) * 0.08;
    this.tube.scale.set(wob, wob, L);
    // 손: 손가락(+Y)을 뻗는 방향으로, 손바닥(+Z)은 아래로 — 주먹 쥔 손등이 위
    const y = _v.copy(this.dir);
    const z = _v2.set(0, -1, 0).addScaledVector(y, y.y).normalize();
    if (z.lengthSq() < 0.01) z.set(0, 0, 1);
    const x = _v3.crossVectors(y, z).normalize();
    z.crossVectors(x, y);
    this.hand.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, z));
    this.hand.position.copy(this.from).addScaledVector(this.dir, L);
    this.tube.visible = this.hand.visible = true;
    if (this.t > out + hold + back) {
      this.t = -1;
      this.tube.visible = this.hand.visible = false;
    }
  }

  dispose() {
    this.ctx.scene.remove(this.tube, this.hand);
    this.tube.geometry.dispose();
    this.hand.geometry.dispose();
    this.mat.dispose();
  }
}

// 다중혼 「발체」: 뭉친 영혼 덩어리가 길게 뻗어 나간다
class BodyRepel {
  constructor(ctx, from, dir, len, onHit) {
    this.ctx = ctx;
    this.from = from.clone();
    this.dir = dir.clone().normalize();
    this.len = len;
    this.onHit = onHit;
    this.t = 0;
    const N = 46;
    this.mat = new THREE.MeshToonMaterial({ color: 0xb8a8a4 });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.mat, N);
    this.mesh.frustumCulled = false;
    this.seeds = Array.from({ length: N }, () => ({ r: rnd(0.25, 0.55), o: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.35), s: Math.random() }));
    ctx.scene.add(this.mesh);
    this.hit = new Set();
    ctx.sfx.play('whoosh_3', { at: from, vol: 1, rate: 0.5 });
    ctx.sfx.play('punch_3', { at: from, vol: 0.6, rate: 0.5 });
  }

  update(dt) {
    this.t += dt;
    const grow = Math.min(1, this.t / 0.35);
    const fade = this.t > 0.9 ? Math.max(0, 1 - (this.t - 0.9) / 0.4) : 1;
    const head = this.len * (1 - Math.pow(1 - grow, 3));
    const Q = new THREE.Quaternion();
    const M = new THREE.Matrix4();
    this.seeds.forEach((s, i) => {
      const u = i / (this.seeds.length - 1);
      const p = _v.copy(this.from).addScaledVector(this.dir, u * head).add(_v2.copy(s.o).multiplyScalar(1 + u));
      const r = s.r * (0.6 + u * 0.8) * fade * (1 + Math.sin(this.t * 20 + i) * 0.08);
      Q.setFromEuler(new THREE.Euler(s.s * 6, this.t * 2 + i, 0));
      M.compose(p, Q, _v3.setScalar(Math.max(0.001, r)));
      this.mesh.setMatrixAt(i, M);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    // 길 위의 대상
    for (const t of this.ctx.world.targets()) {
      if (!t.alive || this.hit.has(t)) continue;
      const c = t.center(_v);
      const along = _v2.subVectors(c, this.from).dot(this.dir);
      if (along < 0 || along > head) continue;
      const off = _v2.subVectors(c, this.from).addScaledVector(this.dir, -along).length();
      if (off < 0.9) {
        this.hit.add(t);
        this.onHit?.(t);
      }
    }
    if (this.t > 1.3) {
      this.ctx.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mat.dispose();
      return false;
    }
    return true;
  }
}

// ───────────────── 무위전변: 영혼을 비튼다 ─────────────────
const TWIST_JJK = ['head', 'L_arm', 'R_arm', 'L_elbow', 'R_elbow', 'L_hand', 'R_hand', 'chest', 'spine', 'L_leg', 'R_leg', 'L_knee', 'R_knee', 'neck'];
const TWIST_BIP = ['Bip001_Head', 'Bip001_L_UpperArm', 'Bip001_R_UpperArm', 'Bip001_L_Forearm', 'Bip001_R_Forearm', 'Bip001_L_Hand', 'Bip001_R_Hand', 'Bip001_Spine2', 'Bip001_Spine1', 'Bip001_L_Thigh', 'Bip001_R_Thigh', 'Bip001_L_Calf', 'Bip001_R_Calf', 'Bip001_Neck'];

class Transfig {
  constructor(ctx, t, { kill = true, quiet = false } = {}) {
    this.ctx = ctx;
    this.t = t;
    this.k = 0;
    this.kill = kill;
    if (quiet) {
      // 부위 고르기만 (SoulStock 이 쓴다)
      const parts = [];
      if (t.rig) {
        const names = t.rig.mapId === 'bip' ? TWIST_BIP : TWIST_JJK;
        for (const n of names) if (t.rig.bones[n]) parts.push(t.rig.bones[n]);
      } else if (t.armL) parts.push(t.head, t.armL.sh, t.armR.sh, t.armL.el, t.armR.el, t.legL.kn, t.legR.kn, t.spine);
      this.parts = parts.filter(Boolean).sort(() => Math.random() - 0.5).slice(0, 6).map((o) => ({ o, s0: o.scale.clone(), s1: new THREE.Vector3(rnd(0.3, 2.2), rnd(0.4, 2.4), rnd(0.3, 2.2)) }));
      return;
    }
    // 비틀 부위: 뼈(스키닝 모델) 또는 관절(더미)
    const parts = [];
    if (t.rig) {
      const names = t.rig.mapId === 'bip' ? TWIST_BIP : TWIST_JJK;
      for (const n of names) if (t.rig.bones[n]) parts.push(t.rig.bones[n]);
    } else if (t.armL) parts.push(t.head, t.armL.sh, t.armR.sh, t.armL.el, t.armR.el, t.legL.kn, t.legR.kn, t.spine);
    this.parts = parts.filter(Boolean).sort(() => Math.random() - 0.5).slice(0, 6).map((o) => ({ o, s0: o.scale.clone(), s1: new THREE.Vector3(rnd(0.3, 2.2), rnd(0.4, 2.4), rnd(0.3, 2.2)) }));
    ctx.fx.burst(t.center(_v), 24, SOUL, 2, 0.04, 0.6, { spread: 0.3 });
    ctx.sfx.play('shimmer', { at: _v, vol: 0.8, rate: 0.5 });
    if (kill) {
      t.heartAttack?.();
      if (!t.heartAttack) t.damage(9999, { type: 'fade' });
    } else t.damage(220, { type: 'soul', color: '#7ad8ff' });
  }

  update(dt) {
    const t = this.t;
    this.k = Math.min(1, this.k + dt / (this.kill ? 1.1 : 0.6));
    const e = this.kill ? this.k : Math.sin(this.k * Math.PI);
    if (!t.alive) return false;
    for (const p of this.parts) p.o.scale.lerpVectors(p.s0, p.s1, e);
    if (Math.random() < 0.4) this.ctx.fx.spawn(t.center(_v).add(_v2.randomDirection().multiplyScalar(0.3)), _v3.set(0, 0.4, 0), SOUL, 0.05, 0.4, 1, 0);
    if (!this.kill && this.k >= 1) {
      for (const p of this.parts) p.o.scale.copy(p.s0);
      return false;
    }
    return this.k < 1 || t.alive;
  }
}

/**
 * 무위전변 → 개조 인간 스톡: 붙잡은 상대의 영혼을 비틀어(몸이 일그러진다) 체스 말만 하게 오그라뜨린다.
 *  손에 쥐고 있었으면 그 손에 스톡이 남고(던지면 풀려난다), 아니면(영역 필중 · 데스크톱) 마히토가 삼켜 비축한다
 */
class SoulStock {
  constructor(ctx, mahito, t, side = null) {
    this.ctx = ctx;
    this.m = mahito;
    this.t = t;
    this.side = side;
    this.k = 0;
    this.phase = 'twist';
    const tw = new Transfig(ctx, t, { kill: false, quiet: true });
    this.parts = tw.parts;
    for (const p of this.parts) p.s1.multiplyScalar(1.15);
  }

  update(dt) {
    const { fx } = this.ctx;
    const t = this.t;
    this.k += dt;
    if (this.phase === 'twist') {
      // 영혼을 비튼다: 부위가 제멋대로 부풀고 오그라든다 (붙잡힌 채)
      if (!t.alive) return false;
      const e = Math.min(1, this.k / 0.8);
      for (const p of this.parts) p.o.scale.lerpVectors(p.s0, p.s1, e * e);
      if (Math.random() < 0.6) fx.spawn(t.center(_v).add(_v2.randomDirection().multiplyScalar(0.3)), _v3.set(0, 0.5, 0), SOUL, 0.05, 0.4, 1, 0);
      if (this.k < 0.8) return true;
      // 몸을 세상에서 빼고(처치) 껍데기를 오그라뜨린다
      t.root.updateMatrixWorld(true);
      this.c0 = t.center(new THREE.Vector3());
      this.p0 = t.root.position.clone();
      this.q0 = t.root.quaternion.clone();
      this.s0 = t.root.scale.clone();
      t.kill({ type: 'stock' });
      this.phase = 'squeeze';
      this.k = 0;
      this.ctx.sfx.play('grab', { at: this.c0, vol: 1, rate: 0.45 });
      return true;
    }
    // 오그라들며 손(또는 입) 쪽으로 빨려 든다
    const h = this.side ? this.ctx.input[this.side] : null;
    const dest = h?.active ? h.palm : this.m.mouthPos(new THREE.Vector3());
    const e = Math.min(1, this.k / 0.55);
    const ee = e * e * (3 - 2 * e);
    const s = THREE.MathUtils.lerp(1, 0.03, ee);
    const R = t.root;
    R.scale.copy(this.s0).multiplyScalar(s);
    R.quaternion.copy(this.q0).premultiply(_q.setFromAxisAngle(UP, ee * 9));
    // 몸 가운데가 목적지로 모이도록
    const c = _v.copy(this.c0).lerp(dest, ee);
    R.position.copy(this.p0).sub(this.c0).multiplyScalar(s).add(c);
    if (Math.random() < 0.8) fx.spawn(c, _v2.randomDirection().multiplyScalar(0.6), Math.random() < 0.5 ? SOUL : FLESH_C, 0.04, 0.35, 2, 0);
    if (e < 1) return true;
    // 다 오그라들었다 → 스톡
    R.parent?.remove(R);
    t._dispose?.();
    fx.burst(c, 22, new THREE.Color(0x8a5ab0), 2, 0.04, 0.35);
    this.m._gotStock(this.side, c);
    return false;
  }
}

// ───────────────── 캐릭터 ─────────────────
export class Mahito extends Caster {
  constructor(ctx) {
    super(ctx, { id: 'mahito', name: '마히토' });
    this.domainLabel = '영역전개';
    this.reviveText = '몸이 부서졌다… 영혼의 형태를 다시 빚는다';
    this.aura = new HandAura(ctx, AURA);
    this.forms = { left: new HandForm(ctx), right: new HandForm(ctx) };
    this.arms = { left: new StretchArm(ctx, 'left'), right: new StretchArm(ctx, 'right') };
    this.effects = [];
    this.stocks = { left: null, right: null, desk: null }; // 손에 쥔 개조 인간 스톡
    this.bank = 0; // 무위전변으로 만들어 삼켜 둔 스톡 (꺼낼 때 주력이 들지 않는다)
    this.stockFx = [];
    this.twists = [];
    this.cuts = new Map(); // 같은 대상을 한 번 휘두를 때 한 번만
    this.touchCd = 0;
    this.cds = {};
    this._keys = {};
    // 영역 「自閉円頓裹」: 남색 밤하늘 허공에 손이 엮인 거대한 아가리 (가운데 손 모양에서 꽃처럼 피어난다)
    this.maw = new HandMaw(16);
    this.shell = new ShellDomain(ctx, {
      radius: 16,
      glsl: HANDS_GLSL + VOID_WALL,
      wall: `vec3 n = normalize(vP); col = mahitoVoid(n, uTime); col = mix(vec3(0.0), col, uOpen);`,
      // 바닥: 손 그림 없이 비쳐 보이는 어둠 — 바닥 밑으로 이어진 새장(깍지 낀 팔들)이 보인다
      floor: `float r = length(vP.xz); col = vec3(0.05, 0.035, 0.09) + vec3(0.12, 0.08, 0.22) * smoothstep(0.9, 1.0, r) * 0.6;
              alpha = mix(0.5, 0.12, smoothstep(0.0, 1.0, r)) * uOpen;`,
      lights: { hemi: 0xe8e0ff, ground: 0x2a2080, hemiI: 0.9, sunI: 0.7, sun: 0xf4f0ff, fog: 0x0a0610, fogNear: 24, fogFar: 70, exposure: 1.0 },
      anim: (dt, sh) => {
        const M = this.maw;
        if (sh.state === 'opening' && !this._mawK) {
          // 아가리는 바라보는 쪽(상대 쪽) 가장자리에 서서 이쪽으로 입을 벌린다 — 그 사이의 적은 아가리 속
          const f = this.ctx.input.headDir;
          const fl = Math.hypot(f.x, f.z) || 1;
          M.place(new THREE.Vector3((f.x / fl) * 16 * 0.55, 0, (f.z / fl) * 16 * 0.55), Math.atan2(-f.x, -f.z));
        }
        if (sh.state === 'opening' || sh.state === 'active') this._mawK = Math.min(1.2, (this._mawK ?? 0) + dt / 1.6);
        else this._mawK = Math.max(0, Math.min(1, this._mawK ?? 0) - dt / 0.7);
        M.update(dt, this._mawK);
      },
    });
    this.shell.group.add(this.maw.group);
    this.shell.floorMat.transparent = true;
    this.shell.floorMat.depthWrite = false;
  }

  // ───── 공통 ─────
  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '무위전변 — 영혼 비틀기', demo: 'common.grab', color: '#7ad8ff', text: '상대를 붙잡고(주먹) 0.7초 쥐고 있으면 영혼을 비틀어 체스 말만 한 개조 인간 스톡으로 오그라뜨린다 (특급은 버티고 큰 피해만)\n스톡은 그 손에 남는다: 휘두르며 손을 펴면 던져 풀려나고, 가만히 펴면 삼켜 비축 (입에서 꺼낼 때 주력이 들지 않는다)' },
        { head: '칼날 팔', demo: 'mahito.blade', color: '#e8e2d8', text: '검지·중지를 곧게 펴 칼처럼 세우고(손바닥을 옆으로) 0.35초 → 손이 칼날로 바뀐다 → 휘둘러 베기\n주먹을 쥐면 되돌아온다' },
        { head: '드릴 팔', demo: 'mahito.drill', color: '#c8c0bc', text: '주먹을 앞으로 겨누고 0.35초 → 드릴 → 앞으로 찌르면 꿰뚫는다' },
        { head: '늘어나는 팔', demo: 'mahito.stretch', color: '#c8c0bc', text: '검지로 앞을 빠르게 찌르면 팔이 7m까지 늘어나 때리고 끌어당긴다' },
        { head: '개조인간 발사', demo: 'mahito.launch', color: '#c8c4bc', text: '주먹을 입에 0.25초 → 입에서 개조 인간 스톡(체스 말만 하게 줄여 둔 개조 인간)을 꺼내 쥔다 → 앞으로 던지면\n풀려나 벌레 같은 개조 인간으로 자라나 바라본 적을 물어뜯는다' },
        { head: '다중혼 「撥体」', demo: 'mahito.repel', color: '#b8a8a4', text: '두 손바닥을 가슴 앞에서 맞대 0.4초 → 입에서 스톡 8개가 나와 두 손 사이에 모인다 (영혼을 합친다)\n두 손을 앞으로 밀면 개조 인간 8명이 한 덩어리로 꼬여 튀어나간다' },
        { head: '영역전개 「自閉円頓裹」', demo: 'mahito.domain', color: '#9fd8ff', text: '두 손 검지 끝을 맞대고 엄지 끝도 맞대 손가락을 위로 (마름모) 1.2초\n안의 모든 영혼에 무위전변이 필중 · 메뉴에서도 발동' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴' },
        { head: '무위전변', color: '#7ad8ff', text: 'T 로 상대를 붙잡고 E → 개조 인간 스톡 (삼켜 비축 · 5 로 던진다)' },
        { head: '몸 변형', color: '#e8e2d8', text: '1 칼날 베기 · 2 드릴 찌르기 · 3 늘어나는 팔 · 4 다중혼 발체 · 5 개조인간 발사 · Q 1.2초 영역전개' },
      ];
    }
    return [
      { head: '무위전변', color: '#7ad8ff', text: '맨손(변형 전) 그립으로 상대를 붙잡고 0.7초 · 또는 쥔 채 트리거 → 개조 인간 스톡이 그 손에 · 그립을 놓으며 휘두르면 던지고, 가만히 놓으면 삼켜 비축' },
      { head: '몸 변형', color: '#e8e2d8', text: '오른쪽 그립: 칼날 팔 (휘두르기) · 왼쪽 그립: 드릴 팔 (찌르기) · A: 늘어나는 팔 · X: 스톡 꺼내기 → 떼면 던지기 · 양쪽 그립을 모으고 밀기: 발체' },
      { head: '영역전개', color: '#9fd8ff', text: '양쪽 스틱을 눌러 1.2초' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const d = this.domain;
    const dom = this.shell.state === 'active' ? `전개 중 ${Math.max(0, Math.ceil(d.duration - d.t))}s` : d.cd > 0 ? `재사용 ${Math.ceil(d.cd)}s` : '준비';
    return [
      { label: '주력', bar: this.energy / this.maxEnergy, color: '#7ad8ff' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff9fa0' },
      { label: '변형', text: ['left', 'right'].map((s) => ({ blade: '칼날', drill: '드릴' }[this.forms[s].form] ?? '맨손')).join(' / ') },
      { label: '스톡', text: `${this.bank}` },
      { label: '영역', text: dom },
      { label: '처치', text: `${w.kills}` },
    ];
  }

  // ───── 메인 ─────
  update(dt) {
    const { input: inp, ui } = this.ctx;
    this.tickCommon(dt, 11);
    this.touchCd -= dt;
    // 무위전변으로 몸을 고쳐 빚는다: 빠른 회복
    const P = this.ctx.world.player;
    if (P.hp < P.maxHp && this.ctx.world.time - P.lastHit > 1) P.hp = Math.min(P.maxHp, P.hp + 6 * dt);
    if (!ui.menuOpen) {
      for (const h of [inp.left, inp.right]) if (h.active && !h.uiBlock) this._hand(h, dt);
      this._repel(dt);
      this._domainSign(dt);
      if (inp.mode === 'desktop') this._desktop();
    }
    // 몸을 바꾼 손(칼날 · 드릴 · 늘어나는 팔)은 플레이어 손을 숨긴다
    inp.hideHand ??= { left: false, right: false };
    for (const s of ['left', 'right']) {
      this.forms[s].update(dt, inp[s]);
      this.arms[s].update(dt, inp[s]);
      inp.hideHand[s] = !!this.forms[s].form || this.arms[s].active;
    }
    this.effects = this.effects.filter((e) => e.update(dt));
    this.worms = (this.worms ?? []).filter((w) => w.update(dt));
    this.stockFx = this.stockFx.filter((S) => S.update(dt));
    this._tickIsomer(dt);
    this.twists = this.twists.filter((t) => t.update(dt));
    if (this.runDomain(this.shell, dt)) this._domainTick(dt);
    this.aura.update(dt);
  }

  _hand(h, dt) {
    const inp = this.ctx.input;
    const F = this.forms[h.side];
    const g = h.gesture;
    const ctrl = h.source === 'controller';
    const fwd = this.flatFwd(_v3);
    const G = this.ctx.grab?.held[h.side];
    const holding = !!G;
    // 손 모양을 바꾸면 변형이 풀린다
    if (F.form === 'blade' && (ctrl ? !h.btn.grip : (g === 'fist' || g === 'pinch') && h.gestureTime > 0.25)) F.set(null);
    if (F.form === 'drill' && (ctrl ? !h.btn.grip : g !== 'fist' && h.gestureTime > 0.25)) F.set(null);
    // 칼날: 검지·중지를 곧게 모아 세운 칼 손(손바닥을 옆으로) 유지 — 그냥 편 손으로는 바뀌지 않는다
    const knife = ctrl ? h.side === 'right' && h.btn.grip && !this._ctrlBoth() : g === 'two' && Math.abs(h.palmNormal.y) < 0.6 && h.speed < 1.0;
    if (!F.form && this.held(h.side + 'blade', knife && !holding, dt, ctrl ? 0.05 : 0.35)) F.set('blade');
    // 드릴: 주먹을 앞으로 겨눈다
    //  입에서 스톡을 꺼내는 주먹(입 가까이 · 스톡을 쥔 채 · 방금 입에 댔던 손)은 드릴이 되지 않는다
    const mouthD = h.palm.distanceTo(this.mouthPos(_v));
    const sideKey = h.side + 'mouthT';
    if (g === 'fist' && mouthD < 0.22) this.cds[sideKey] = 1.0;
    this.cds[sideKey] = (this.cds[sideKey] ?? 0) - dt;
    const nearStock = !!this.stocks[h.side] || this.cds[sideKey] > 0 || mouthD < 0.32 || this.holdK(h.side + 'pull', 0.25) > 0;
    const aimFist = ctrl ? h.side === 'left' && h.btn.grip && !this._ctrlBoth() : g === 'fist' && !nearStock && h.fingersDir.dot(fwd) > 0.45 && h.speed < 1.0 && h.palm.distanceTo(inp.head) > 0.22;
    if (!F.form && this.held(h.side + 'drill', aimFist && !holding, dt, ctrl ? 0.05 : 0.35)) F.set('drill');
    if (F.form && !F.k) this.aura.set(h.side, 0.6);
    // 휘두르기 / 찌르기
    if (F.form === 'blade' && h.speed > 2.2) this._bladeSweep(h, F);
    if (F.form === 'drill' && h.vel.dot(h.fingersDir) > 2.0) this._drillThrust(h, F);
    // 늘어나는 팔: 검지로 빠르게 찌르기
    const poke = ctrl ? h.side === 'right' && h.pressed('a') : g === 'point' && h.thrust > 2.2;
    const ck = h.side + 'stretch';
    this.cds[ck] = (this.cds[ck] ?? 0) - dt;
    if (poke && this.cds[ck] <= 0) {
      this.cds[ck] = 0.8;
      this._stretch(h);
    }
    // 무위전변: 닿기만 해선 안 된다 — 상대를 실제로 붙잡아 0.7초 쥐고 있으면(컨트롤러는 쥔 채 트리거로 바로)
    //  영혼을 비틀어 개조 인간 스톡으로 오그라뜨린다 → 그 손에 스톡이 남는다
    const gt = G?.t;
    const soulT = gt?.kind === 'dummy' && gt.alive && !gt.dying && !this.twists.some((x) => x.t === gt) ? gt : null;
    const fire = this.held(h.side + 'soul', !!soulT && this.touchCd <= 0, dt, 0.7) || (soulT && ctrl && h.pressed('trigger') && this.touchCd <= 0);
    if (soulT) this.aura.set(h.side, 0.3 + this.holdK(h.side + 'soul', 0.7) * 0.7);
    if (fire && soulT) this.transfigure(soulT, h);
    // 개조 인간 스톡: 주먹을 입에 대 0.25초 → 입에서 스톡(체스 말만 한 개조 인간)을 꺼내 쥔다 → 던지면 풀려난다
    const mouth = this.mouthPos(_v);
    const ak = h.side + 'pull';
    const S = this.stocks[h.side];
    if (S?.fromGrab && S.state !== 'thrown') {
      // 무위전변으로 만든 스톡: 쥔 손을 펴면 놓는다 — 휘두르며 펴면 던지고(풀려난다), 가만히 펴면 삼켜 비축한다
      this.aura.set(h.side, 0.45);
      const open = ctrl ? !h.btn.grip : g !== 'fist';
      if (open && S.t > 0.25) {
        this.stocks[h.side] = null;
        if (h.speed > 1.6) S.throw(_v2.copy(h.vel).multiplyScalar(1.3).addScaledVector(inp.headDir, 3).add(_v3.set(0, 0.8, 0)), (pos, dir) => this._releaseWorm(pos, dir), 0.18);
        else this._swallow(S);
      }
      return;
    }
    if (ctrl) {
      // 왼쪽 A 를 누르면 입에서 꺼내 쥐고, 떼면 던진다 (1.5초 넘게 쥐고 있으면 저절로)
      if (h.side === 'left' && h.pressed('a') && !S) this.pullStock(h);
      if (S && S.state !== 'thrown' && (!h.btn.a || S.t > 1.5)) this.throwStock(h, _v2.copy(inp.headDir).multiplyScalar(11).addScaledVector(h.vel, 0.5).add(_v3.set(0, 1.2, 0)));
    } else {
      if (!S && this.held(ak, g === 'fist' && h.palm.distanceTo(mouth) < 0.14, dt, 0.25)) {
        if (this.pullStock(h)) h.pulse?.(0.4, 40);
      }
      if (S && S.state !== 'thrown') {
        this.aura.set(h.side, 0.4);
        // 입에서 떼고 앞으로 휘두르면 손을 떠난다 (3초 안에 안 던지면 도로 삼킨다)
        if (h.palm.distanceTo(mouth) > 0.2 && h.vel.dot(inp.headDir) > 2.0) this.throwStock(h, _v2.copy(h.vel).multiplyScalar(1.3).addScaledVector(inp.headDir, 4));
        else if (S.t > 3) {
          S.dispose();
          this.stocks[h.side] = null;
        }
      }
    }
    if (S && !S.alive) this.stocks[h.side] = null;
  }

  /** 입 (스톡을 꺼내는 곳) */
  mouthPos(out) {
    const inp = this.ctx.input;
    out.copy(inp.head).addScaledVector(inp.headDir, 0.07);
    out.y -= 0.09; // (임시 벡터를 쓰지 않는다 — 부르는 쪽의 _v3 를 덮어쓰지 않게)
    return out;
  }

  /** 입에서 스톡을 하나 꺼내 손에 쥔다 */
  pullStock(h) {
    // 비축한 스톡(무위전변으로 만든 것)이 있으면 그것부터 — 주력 · 재사용 대기 없이
    if (this.bank > 0) this.bank--;
    else if (!cool(this.ctx, 'worm', 2.5, '개조 인간') || !this.spend(12)) return null;
    const hp = new THREE.Vector3();
    const S = new StockPiece(this.ctx, this.mouthPos(new THREE.Vector3()), () => (h.active ? hp.copy(h.palm).addScaledVector(h.palmNormal ?? UP, 0.02) : null));
    this.stocks[h.side] = S;
    this.stockFx.push(S);
    this.ctx.ui.callout('개조 인간 스톡 — 입에서 꺼냈다', { color: '#b088d8', dur: 1 });
    return S;
  }

  /** 쥔 스톡을 던진다 → 풀려나 벌레 같은 개조 인간이 되어 바라본 적을 문다 */
  throwStock(h, vel) {
    const S = this.stocks[h.side];
    if (!S) return;
    this.stocks[h.side] = null;
    S.throw(vel, (pos, dir) => this._releaseWorm(pos, dir), 0.18);
  }

  _releaseWorm(pos, dir) {
    const inp = this.ctx.input;
    const t = this.gazeTarget(inp.head, inp.headDir, 0.35, 25, false) ?? this.gazeTarget(pos, dir, 0.4, 25, false);
    const w = new TransfiguredWorm(this.ctx, pos, { owner: 'player', target: t, dir: dir.lengthSq() > 0.1 ? dir : inp.headDir, dmg: 70, grow: true });
    if (!w.ok) return;
    (this.worms ??= []).push(w);
    this.ctx.ui.manga({ main: '改造人間', ruby: 'かいぞうにんげん', color: '#c8c4bc', dur: 0.8 });
  }

  /** 데스크톱: 입에서 스톡을 꺼내 잠깐 쥐었다가 앞으로 던진다 */
  launchWorm(from, dir) {
    if (this.stocks.desk) return;
    const inp = this.ctx.input;
    const hold = new THREE.Vector3();
    const S = (() => {
      if (this.bank > 0) this.bank--;
      else if (!cool(this.ctx, 'worm', 2.5, '개조 인간') || !this.spend(12)) return null;
      return new StockPiece(this.ctx, this.mouthPos(new THREE.Vector3()), () => hold.copy(inp.head).addScaledVector(inp.headDir, 0.4).add(_v2.set(0, -0.15, 0)).addScaledVector(_v3.crossVectors(inp.headDir, UP).normalize(), 0.15));
    })();
    if (!S) return;
    this.stocks.desk = S;
    this.stockFx.push(S);
    this.ctx.ui.callout('개조 인간 스톡 — 입에서 꺼냈다', { color: '#b088d8', dur: 1 });
    this.later(0.35, () => {
      this.stocks.desk = null;
      S.throw(_v.copy(dir).multiplyScalar(11).add(_v2.set(0, 1.5, 0)), (pos, d) => this._releaseWorm(pos, d), 0.18);
    });
    void from;
  }

  /**
   * 무위전변: 영혼에 손을 댔다 (붙잡은 손 · 영역 필중 · 데스크톱 E)
   *  보통 상대 → 영혼을 비틀어 개조 인간 스톡으로 (손 h 가 있으면 그 손에, 없으면 삼켜 비축)
   *  특급 · 샌드백 → 영혼이 버틴다: 몸이 잠깐 일그러지고 큰 피해만
   */
  transfigure(t, h = null) {
    if (!t?.alive || t.dying || this.twists.some((x) => x.t === t)) return;
    const strong = (t.def?.hp ?? 0) >= 500 || t.infinite;
    this.touchCd = strong ? 1.5 : 0.6; // 특급을 붙잡은 채로는 1.5초마다 다시 비튼다
    if (strong) this.twists.push(new Transfig(this.ctx, t, { kill: false }));
    else {
      this.twists.push(new SoulStock(this.ctx, this, t, h?.side ?? null));
      this.ctx.sfx.play('shimmer', { at: t.center(_v), vol: 0.9, rate: 0.5 });
      if (!this._toldStock) {
        this._toldStock = true;
        this.ctx.ui.callout('영혼을 비틀어 개조 인간 스톡으로 — 쥔 손을 휘두르며 펴면 던지고, 가만히 펴면 삼켜 비축한다', { color: '#b088d8', dur: 2.2 });
      }
    }
    this.ctx.ui.manga({ main: '無為転変', ruby: 'むいてんぺん', color: '#7ad8ff', side: h?.side });
    h?.pulse?.(0.8, 80);
  }

  /** 상대가 스톡이 되었다: 그 손에 쥐어 준다 (손이 없거나 이미 쥐었으면 삼킨다) */
  _gotStock(side, at) {
    const h = side ? this.ctx.input[side] : null;
    if (h?.active && !this.stocks[side]) {
      const hp = new THREE.Vector3();
      const S = new StockPiece(this.ctx, at, () => (h.active ? hp.copy(h.palm).addScaledVector(h.palmNormal ?? UP, 0.02) : null));
      S.fromGrab = true;
      this.stocks[side] = S;
      this.stockFx.push(S);
      h.pulse?.(0.6, 60);
      this.ctx.ui.callout('개조 인간 스톡', { color: '#b088d8', dur: 0.9 });
      return;
    }
    this.bank++;
    this.ctx.ui.callout(`개조 인간 스톡 — 삼켜 비축 (${this.bank})`, { color: '#b088d8', dur: 1 });
  }

  /** 쥔 스톡을 입으로 가져가 삼킨다 → 비축 */
  _swallow(S) {
    S.state = 'pull';
    S.t = 0;
    S.from = S.mesh.position.clone();
    const mouth = new THREE.Vector3();
    S.hold = () => this.mouthPos(mouth);
    this.later(0.18, () => {
      S.dispose();
      this.bank++;
      this.ctx.sfx.play('grab', { at: this.mouthPos(_v), vol: 0.5, rate: 0.7 });
      this.ctx.ui.callout(`삼켜 비축 — 스톡 ${this.bank}`, { color: '#b088d8', dur: 0.8 });
    });
  }

  /** 손이 바쁘면 잡기를 하지 않는다 (칼날 · 드릴 · 늘어나는 팔 · 스톡을 쥔 손) */
  handBusy(side) {
    return !!this.forms[side]?.form || !!this.arms[side]?.active || !!this.stocks[side];
  }

  _bladeSweep(h, F) {
    const tip = F.tip(new THREE.Vector3());
    const base = h.palm.clone();
    const now = this.ctx.world.time;
    const dir = new THREE.Vector3().subVectors(tip, base).normalize();
    for (const t of this.ctx.world.targets()) {
      if (!t.alive || (this.cuts.get(t) ?? -1) > now - 0.4) continue;
      const c = t.center(_v3);
      const ab = _v.subVectors(tip, base);
      const k = THREE.MathUtils.clamp(_v2.subVectors(c, base).dot(ab) / ab.lengthSq(), 0, 1);
      const p = base.clone().addScaledVector(ab, k);
      const r = (t.kind === 'dummy' ? 0.3 * (t.scale ?? 1) : t.radius ?? 0.3) + 0.12;
      if (p.distanceTo(c) > r + 0.25) continue;
      this.cuts.set(t, now);
      const n = new THREE.Vector3().crossVectors(dir, h.vel).normalize();
      if (n.lengthSq() < 0.5) n.set(0, 1, 0);
      t.damage(32 + h.speed * 4, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, c), push: h.vel.clone().multiplyScalar(0.3) });
      this.ctx.sfx.slash(c, 1.3);
      this.ctx.fx.burst(c, 10, new THREE.Color(0xffffff), 3, 0.03, 0.3);
      h.pulse?.(0.6, 50);
    }
  }

  /** 컨트롤러 두 개를 그립으로 쥐고 가슴 앞에서 맞댔다 (다중혼) — 칼날·드릴보다 먼저 본다 */
  _ctrlBoth() {
    const { left: L, right: R } = this.ctx.input;
    return L.active && R.active && L.source === 'controller' && R.source === 'controller' && L.btn.grip && R.btn.grip && L.palm.distanceTo(R.palm) < 0.26;
  }

  _drillThrust(h, F) {
    const now = this.ctx.world.time;
    if ((this._drillT ?? -1) > now - 0.5) return;
    const tip = F.tip(_v.clone());
    const { t } = this.rayTarget(h.palm, h.fingersDir.clone().normalize(), 1.4, 0.2);
    if (!t) return;
    this._drillT = now;
    t.damage(48, { type: 'pierce', dir: h.fingersDir.clone() });
    t.impulse?.(_v2.copy(h.fingersDir).multiplyScalar(6).add(_v3.set(0, 1.5, 0)), 4);
    this.ctx.fx.burst(tip, 18, new THREE.Color(0xd8d0c8), 3, 0.04, 0.4);
    this.ctx.sfx.play('punch_3', { at: tip, vol: 0.8, rate: 1.4 });
    h.pulse?.(0.9, 90);
  }

  _stretch(h) {
    const dir = (h.source === 'controller' ? h.dir : h.dir).clone().normalize();
    const { t, d } = this.rayTarget(h.palm, dir, 7, 0.25);
    const len = t ? Math.max(0.5, d - 0.15) : 7;
    if (!this.spend(4)) return;
    this.arms[h.side].fire(h.palm, dir, len, (p) => {
      if (t?.alive) {
        t.damage(28, { type: 'punch', dir });
        // 끌어당긴다
        t.impulse?.(_v.copy(dir).multiplyScalar(-6).add(_v2.set(0, 2.5, 0)), 3);
        this.ctx.fx.burst(p, 14, new THREE.Color(0xffffff), 2.5, 0.04, 0.3);
        this.ctx.sfx.punch(p);
        h.pulse?.(0.7, 60);
      }
    });
  }

  _repel(dt) {
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    const ok = L.active && R.active;
    let together = false;
    // 컨트롤러로 흉내 낸 손은 몸체끼리 부딪혀 손바닥이 완전히 맞닿지 못한다 → 넉넉히
    const em = L.emulated || R.emulated;
    if (ok && L.source === 'hand' && R.source === 'hand') together = L.palm.distanceTo(R.palm) < (em ? 0.2 : 0.09) && L.palmNormal.dot(R.palmNormal) < (em ? -0.15 : -0.5) && L.gesture !== 'fist' && R.gesture !== 'fist' && L.fingersDir.y < 0.7;
    else if (ok && L.source === 'controller') together = this._ctrlBoth();
    if (this.held('repelArm', together, dt, 0.4) && !this._isomer) {
      // 입에서 스톡 8개를 꺼내 두 손 사이로 모은다
      const mid = new THREE.Vector3();
      this._gatherIsomer(() => (L.active && R.active ? mid.lerpVectors(L.palm, R.palm, 0.5) : null), 1.6);
      L.pulse?.(0.5, 40);
      R.pulse?.(0.5, 40);
    }
    const I = this._isomer;
    if (I && !I.auto) {
      this.aura.set('left', 0.7);
      this.aura.set('right', 0.7);
      const push = (L.vel.dot(inp.headDir) + R.vel.dot(inp.headDir)) / 2;
      if (push > 1.5 && I.t > 0.2) this.bodyRepel();
    }
  }

  /** 다중혼: 스톡 8개를 입에서 꺼내 한 점(hold) 둘레로 모은다 (영혼을 합치는 중). life 초 안에 밀지 않으면 삼킨다 */
  _gatherIsomer(hold, life, auto = false) {
    if (this._isomer) return this._isomer;
    if (coolLeft(this.ctx, 'repel') > 0) return cool(this.ctx, 'repel', 7, '撥体'), null;
    if (this.energy < 25) return null;
    const I = { stocks: [], t: 0, life, auto, hold };
    for (let i = 0; i < 8; i++) {
      const o = new THREE.Vector3();
      const a = (i / 8) * Math.PI * 2;
      const S = new StockPiece(this.ctx, this.mouthPos(new THREE.Vector3()), () => {
        const c = hold();
        if (!c) return null;
        // 둘레를 돌며 점점 한데 뭉친다
        const r = 0.09 * Math.max(0.25, 1 - I.t * 0.8);
        const ang = a + I.t * 7;
        return o.set(Math.cos(ang) * r, Math.sin(ang * 1.3) * 0.03, Math.sin(ang) * r).add(c);
      }, { scale: 0.8 });
      S.t = -i * 0.03; // 하나씩 줄줄이 나온다
      I.stocks.push(S);
    }
    this._isomer = I;
    this.ctx.ui.callout('다중혼 — 개조 인간 8명의 영혼을 합친다', { color: '#b8a8a4', dur: 1.4 });
    this.ctx.sfx.play('grab', { at: hold() ?? this.ctx.input.head, vol: 0.7, rate: 0.8 });
    return I;
  }

  _tickIsomer(dt) {
    const I = this._isomer;
    if (!I) return;
    I.t += dt;
    for (const S of I.stocks) S.update(dt);
    const c = I.hold();
    if (c && Math.random() < 0.4) this.ctx.fx.spawn(c, _v2.set(rnd(-0.2, 0.2), rnd(0, 0.2), rnd(-0.2, 0.2)), SOUL, 0.03, 0.3, 1, 0);
    if (I.auto && I.t > 0.45) this.bodyRepel();
    else if (!c || I.t > I.life) {
      for (const S of I.stocks) S.dispose();
      this._isomer = null;
    }
  }

  /** 다중혼 「撥体」: 모은 스톡 8개의 영혼을 합쳐 한 덩어리로 내뿜는다 (스톡을 아직 안 모았으면 먼저 꺼내 모은다) */
  bodyRepel() {
    const inp = this.ctx.input;
    if (!this._isomer) {
      const p = new THREE.Vector3();
      this._gatherIsomer(() => p.copy(inp.head).add(_v3.set(0, -0.3, 0)).addScaledVector(inp.headDir, 0.4), 2, true);
      return;
    }
    if (!cool(this.ctx, 'repel', 7, '撥体') || !this.spend(25)) return;
    const I = this._isomer;
    this._isomer = null;
    const from = (I.hold() ?? inp.head.clone().add(_v.set(0, -0.3, 0)).addScaledVector(inp.headDir, 0.5)).clone();
    for (const S of I.stocks) {
      this.ctx.fx.burst(S.mesh.position, 6, new THREE.Color(0x8a5ab0), 2, 0.03, 0.3);
      S.dispose();
    }
    const onHit = (t) => {
      t.damage(65, { type: 'impact', dir: inp.headDir.clone() });
      t.impulse?.(_v.copy(inp.headDir).multiplyScalar(11).add(_v2.set(0, 4, 0)), 6);
    };
    const M = new MergedWorms(this.ctx, from, inp.headDir, { len: 11, onHit });
    this.effects.push(M.ok ? M : new BodyRepel(this.ctx, from, inp.headDir, 11, onHit));
    this.ctx.ui.manga({ main: '多重魂 撥体', ruby: 'たじゅうこん ばったい', color: '#b8a8a4' });
  }

  // ───── 영역전개 ─────
  _domainSign(dt) {
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    let sign = false;
    if (inp.mode === 'desktop') sign = inp.keyDown('KeyQ');
    else if (L.active && R.active && L.source === 'hand' && R.source === 'hand' && this.ctx.settings.domainGesture) {
      // 마름모: 검지 끝끼리 · 엄지 끝끼리 맞대고 손가락을 위로
      const li = L.joints?.['index-finger-tip'];
      const ri = R.joints?.['index-finger-tip'];
      const lt = L.joints?.['thumb-tip'];
      const rt = R.joints?.['thumb-tip'];
      sign = !!(li && ri && lt && rt) && li.distanceTo(ri) < 0.05 && lt.distanceTo(rt) < 0.06 && li.y - lt.y > 0.03 && L.fingersDir.y > 0.35 && R.fingersDir.y > 0.35 && L.speed < 0.6 && R.speed < 0.6;
    } else if (L.source === 'controller' && R.source === 'controller') sign = L.btn.stick && R.btn.stick;
    if (this.ctx.settings.domainGesture && inp.ctrlMudra === 'mahito.domain') sign = true;
    if (this.shell.state !== 'idle') return;
    if (this.held('domain', sign, dt, 1.2)) this.castDomain();
    const k = this.holdK('domain', 1.2);
    if (k > 0) {
      this.aura.set('left', 0.2 + k * 0.8);
      this.aura.set('right', 0.2 + k * 0.8);
    }
  }

  castDomain() {
    if (this.openDomain(this.shell, { cost: 50, name: '自閉円頓裹', ruby: 'じへいえんどんか', color: '#9fd8ff', duration: 14 })) {
      this._sure = 0.6;
    }
  }

  _domainTick(dt) {
    // 필중: 안의 영혼을 하나씩 비튼다
    this._sure -= dt;
    if (this._sure > 0) return;
    this._sure = 0.7;
    const list = this.inDomain(this.shell).filter((t) => t.kind !== 'prop' && !this.twists.some((x) => x.t === t));
    if (list.length) this.transfigure(list[Math.floor(Math.random() * list.length)]);
  }

  cancelDomain() {
    this.closeDomain(this.shell);
  }

  _desktop() {
    const inp = this.ctx.input;
    const press = (code) => {
      const d = inp.keyDown(code);
      const p = d && !this._keys[code];
      this._keys[code] = d;
      return p;
    };
    const t = this.gazeTarget(inp.head, inp.headDir, 0.25, 3);
    if (press('KeyE')) {
      // 붙잡아야 한다: T 로 잡은 상대의 영혼을 비튼다 (스톡은 삼켜 비축 → 5 로 던진다)
      const n = this.ctx.grab?.desk?.t;
      if (n?.kind === 'dummy') this.transfigure(n);
      else this.ctx.ui.callout('무위전변은 상대를 붙잡아야 한다 — T 로 잡고 E', { color: '#7ad8ff', dur: 1.2 });
    }
    if (press('Digit1') && t) {
      const c = t.center(new THREE.Vector3());
      t.damage(40, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(_v.set(Math.random() - 0.5, 1, Math.random() - 0.5).normalize(), c) });
      this.ctx.sfx.slash(c, 1.3);
    }
    if (press('Digit2') && t) {
      t.damage(48, { type: 'pierce', dir: inp.headDir.clone() });
      t.impulse?.(_v.copy(inp.headDir).multiplyScalar(6), 4);
    }
    if (press('Digit3')) this._stretch(inp.right);
    if (press('Digit4')) this.bodyRepel();
    if (press('Digit5')) this.launchWorm(inp.head.clone().addScaledVector(inp.headDir, 0.4).add(_v2.set(0.15, -0.2, 0)), inp.headDir.clone());
  }

  dispose() {
    if (this.ctx.input.hideHand) this.ctx.input.hideHand = { left: false, right: false };
    this.cancelDomain();
    this.shell.dispose();
    this.maw.dispose();
    for (const s of ['left', 'right']) {
      this.forms[s].dispose();
      this.arms[s].dispose();
    }
    for (const w of this.worms ?? []) w.dispose();
    for (const S of this.stockFx ?? []) S.dispose();
    for (const S of this._isomer?.stocks ?? []) S.dispose();
    this._isomer = null;
    this.aura.dispose();
  }
}
