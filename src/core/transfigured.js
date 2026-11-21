// 개조인간 (마히토의 무위전변으로 빚은 벌레 모양 인간) — 쏘아 보내는 투사체
//  손(입)에서 끄집어내면 몸을 늘이며 날아가 입을 벌리고 물어뜯은 뒤, 바닥을 기다가 흩어진다.
//  owner: 'player' 면 적을 노리고, 'enemy' 면 플레이어를 노린다.
import * as THREE from 'three';
import { ChainBody } from './rigged.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const FLESH = new THREE.Color(0xc8c4bc);
const SPINE = ['head', 'waist', 'A_hip', 'A_leg_A', 'A_leg_B', 'A_leg_C', 'A_leg_D', 'A_leg_E', 'A_leg_F', 'A_leg_G', 'A_leg_H', 'A_leg_I', 'A_leg_J', 'A_leg_K'];
const rnd = (a, b) => a + Math.random() * (b - a);

export class TransfiguredWorm {
  /**
   * @param ctx 게임 컨텍스트
   * @param from 나오는 곳
   * @param o { owner: 'player'|'enemy', target, dir, length, dmg, src }
   */
  constructor(ctx, from, o = {}) {
    this.ctx = ctx;
    this.owner = o.owner ?? 'player';
    this.target = o.target ?? null;
    this.src = o.src ?? null;
    this.dmg = o.dmg ?? 60;
    this.speed = o.speed ?? 13;
    this.C = new ChainBody('transfigured', SPINE, { length: o.length ?? 3.2, outline: 0.012 });
    this.ok = this.C.ok;
    this.t = 0;
    this.mode = 'emerge';
    this.modeT = 0;
    this.alive = true;
    this.head = from.clone();
    this.dir = (o.dir ?? new THREE.Vector3(0, 0, -1)).clone().normalize();
    this.vel = this.dir.clone().multiplyScalar(this.speed * 0.4);
    this.hit = new Set();
    if (!this.ok) return;
    const B = this.C.body;
    this.jaws = ['T_jaw', 'U_jaw'].map((n) => B.bones[n]).filter(Boolean).map((b) => ({ b, q0: b.quaternion.clone(), s: b.name === 'T_jaw' ? -1 : 1 }));
    // 나오기 전엔 꼬리가 아래(바닥 밑)로 늘어져 보이지 않는다
    //  grow: 던진 스톡(체스 말만 한 개조인간)이 공중에서 풀려나 제 크기로 자라난다 → 꼬리는 뒤로
    this.growT = o.grow ? 0 : -1;
    if (o.grow) this.C.grow = 0.03;
    this.C.tailDir.copy(o.grow ? this.dir.clone().negate() : new THREE.Vector3(0, -1, 0));
    this.C.setHead(this.head, true);
    this.C.root.position.copy(this.head);
    ctx.scene.add(this.C.root);
    this.C.pose(UP);
    ctx.fx.burst(from, 22, FLESH, 2.5, 0.05, 0.5);
    ctx.sfx.play('grab', { at: from, vol: 0.8, rate: 0.6 });
  }

  setMode(m) {
    this.mode = m;
    this.modeT = 0;
  }

  _aim(out) {
    const inp = this.ctx.input;
    if (this.owner === 'enemy') return inp.bodyCenter ? inp.bodyCenter(out) : out.copy(inp.head).add(_v2.set(0, -0.35, 0));
    const t = this.target;
    if (t?.alive && !t.dying) return t.center(out);
    return null;
  }

  update(dt) {
    if (!this.alive) return false;
    if (!this.ok) return (this.alive = false);
    this.t += dt;
    this.modeT += dt;
    let open = 0;
    const { world, fx, sfx } = this.ctx;
    if (this.growT >= 0) {
      this.growT += dt;
      const k = Math.min(1, this.growT / 0.32);
      this.C.grow = 0.03 + 0.97 * (1 - Math.pow(1 - k, 3));
      if (k >= 1) this.growT = -1;
    }
    if (this.mode === 'emerge') {
      // 손에서 끄집어내며 몸을 늘인다
      this.head.addScaledVector(this.dir, dt * 4);
      open = 0.2;
      if (this.modeT > 0.22) this.setMode('fly');
    } else if (this.mode === 'fly') {
      const aim = this._aim(_v);
      const want = aim ? _v2.subVectors(aim, this.head).normalize() : _v2.copy(this.dir);
      this.vel.lerp(want.multiplyScalar(this.speed), Math.min(1, dt * 3.5));
      this.head.addScaledVector(this.vel, dt);
      // 몸이 바닥에 끌리면 위로
      if (this.head.y < 0.3) this.head.y = 0.3;
      const d = aim ? aim.distanceTo(this.head) : Infinity;
      open = THREE.MathUtils.clamp(1.6 - d * 0.5, 0.15, 1);
      if (Math.random() < 0.3) fx.spawn(this.head, _v2.set(rnd(-0.3, 0.3), rnd(-0.1, 0.3), rnd(-0.3, 0.3)), FLESH, 0.04, 0.4, 1, 1);
      if (this._bite() || this.modeT > 1.8) this.setMode('crawl');
    } else if (this.mode === 'crawl') {
      // 바닥으로 떨어져 꿈틀대며 긴다
      this.vel.y -= 14 * dt;
      this.vel.x *= 1 - dt * 2;
      this.vel.z *= 1 - dt * 2;
      this.head.addScaledVector(this.vel, dt);
      if (this.head.y < 0.22) {
        this.head.y = 0.22;
        this.vel.y = 0;
      }
      const side = _v2.set(-this.vel.z, 0, this.vel.x).normalize();
      this.head.addScaledVector(side, Math.sin(this.t * 12) * dt * 0.8);
      open = 0.35 + Math.sin(this.t * 9) * 0.25;
      if (this.owner === 'player') this._bite();
      if (this.modeT > 1.3) this.setMode('die');
    } else if (this.mode === 'die') {
      // 흩어지며 사라진다
      this.head.y -= dt * 0.6;
      if (Math.random() < 0.8) {
        const p = this.C.pts[Math.floor(Math.random() * this.C.pts.length)];
        fx.spawn(p, _v2.set(rnd(-0.5, 0.5), rnd(0.2, 1), rnd(-0.5, 0.5)), FLESH, 0.06, 0.6, 1, 2);
      }
      if (this.modeT > 0.6) {
        fx.burst(this.head, 30, FLESH, 2, 0.06, 0.6);
        sfx.play('shatter', { at: this.head, vol: 0.4, rate: 0.6 });
        this.dispose();
        return false;
      }
    }
    this.C.setHead(this.head);
    // 사슬 밖의 뼈(뿌리)가 원점에 남아 살을 늘이지 않도록 모델 뿌리도 머리를 따라간다
    this.C.root.position.copy(this.head);
    this.C.pose(UP, this.mode === 'crawl' ? (k, P) => {
      P.y = Math.max(0.2, P.y);
      _v.set(-this.vel.z, 0, this.vel.x).normalize();
      P.addScaledVector(_v, Math.sin(this.t * 10 - k * 0.9) * 0.08);
    } : null);
    this._mouth(open);
    void world;
    return true;
  }

  /** 입을 벌린다: 위턱은 위로, 아래턱은 아래로 (머리의 좌우 축으로) */
  _mouth(open) {
    if (!this.jaws.length) return;
    const head = this.C.chain[0];
    if (!head) return;
    head.updateMatrixWorld(true);
    head.getWorldQuaternion(_q);
    const right = _v.set(1, 0, 0).applyQuaternion(_q);
    for (const J of this.jaws) {
      J.b.quaternion.copy(J.q0);
      J.b.parent.getWorldQuaternion(_q2);
      const worldRot = new THREE.Quaternion().setFromAxisAngle(right, J.s * open * 0.7);
      // 부모 공간으로 옮겨 곱한다
      const local = _q2.clone().invert().multiply(worldRot).multiply(_q2);
      J.b.quaternion.premultiply(local);
      J.b.updateMatrixWorld(true);
    }
  }

  /** 물기: 맞으면 true */
  _bite() {
    const { world, fx, sfx } = this.ctx;
    if (this.owner === 'enemy') {
      const inp = this.ctx.input;
      const c = inp.bodyCenter ? inp.bodyCenter(_v) : _v.copy(inp.head);
      if (this.hit.size === 0 && (c.distanceTo(this.head) < 0.6 || inp.head.distanceTo(this.head) < 0.5)) {
        this.hit.add('player');
        world.hitPlayer(this.dmg, { type: 'bite', src: this.src });
        fx.burst(this.head, 18, new THREE.Color(0x802030), 3, 0.04, 0.4);
        sfx.punch(this.head);
        return true;
      }
      return false;
    }
    let any = false;
    for (const t of world.enemies()) {
      if (!t.alive || this.hit.has(t)) continue;
      const r = 0.45 * (t.scale ?? 1);
      if (t.center(_v).distanceTo(this.head) < r + 0.25) {
        this.hit.add(t);
        t.damage(this.dmg, { type: 'punch', dir: this.vel.clone().normalize() });
        if (t.alive) t.impulse?.(_v2.copy(this.vel).setY(0).normalize().multiplyScalar(6).add(_v.set(0, 3, 0)), 4);
        fx.burst(this.head, 18, new THREE.Color(0x802030), 3, 0.04, 0.4);
        sfx.punch(this.head);
        any = true;
      }
    }
    return any;
  }

  dispose() {
    this.alive = false;
    if (this.ok) this.C.dispose(this.ctx.scene);
  }
}

// ───────────────── 개조 인간 스톡 ─────────────────
//  마히토가 몸속에 넣어 두는, 체스 말만 하게 줄여 늘인 개조 인간. 살아 있고 의식도 있다.
//  보라색으로 길쭉한 몸 · 가면 같은 하얀 얼굴 · 꿰맨 자국. 입에서 꺼내 던지면 풀려나 원래(벌레 모양) 크기로 돌아온다.
const STOCK_H = 0.085;
let _stockGeo = null;
function stockParts() {
  if (_stockGeo) return _stockGeo;
  // 몸: 길쭉한 폰 모양 (아래가 넓고, 목이 잘록하고, 머리가 길다)
  const prof = [[0, 0], [0.5, 0], [0.52, 0.05], [0.38, 0.1], [0.3, 0.22], [0.26, 0.42], [0.2, 0.55], [0.17, 0.6], [0.24, 0.68], [0.27, 0.8], [0.24, 0.92], [0.14, 0.99], [0, 1]].map(([r, y]) => new THREE.Vector2(r * STOCK_H * 0.42, y * STOCK_H));
  const body = new THREE.LatheGeometry(prof, 14);
  // 가면 얼굴: 머리 앞에 납작한 타원
  const face = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(Math.PI / 2).scale(STOCK_H * 0.095, STOCK_H * 0.14, STOCK_H * 0.05).translate(0, STOCK_H * 0.81, STOCK_H * 0.085);
  const eye = new THREE.SphereGeometry(1, 8, 6).scale(STOCK_H * 0.03, STOCK_H * 0.012, STOCK_H * 0.01);
  const mouth = new THREE.BoxGeometry(STOCK_H * 0.07, STOCK_H * 0.008, STOCK_H * 0.01);
  const stitch = new THREE.TorusGeometry(STOCK_H * 0.105, STOCK_H * 0.008, 4, 18).rotateX(Math.PI / 2);
  _stockGeo = { body, face, eye, mouth, stitch };
  return _stockGeo;
}
export function makeStockPiece() {
  const G = stockParts();
  const g = new THREE.Group();
  const purple = new THREE.MeshStandardMaterial({ color: 0x5b2f7a, roughness: 0.45, metalness: 0.05, emissive: 0x1a0828, emissiveIntensity: 0.6 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xe8e0e8, roughness: 0.6 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x120814 });
  const thread = new THREE.MeshStandardMaterial({ color: 0x2a1030, roughness: 0.9 });
  g.add(new THREE.Mesh(G.body, purple), new THREE.Mesh(G.face, pale));
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(G.eye, dark);
    e.position.set(sx * STOCK_H * 0.04, STOCK_H * 0.84, STOCK_H * 0.13);
    e.rotation.z = sx * 0.35;
    g.add(e);
  }
  const m = new THREE.Mesh(G.mouth, dark);
  m.position.set(0, STOCK_H * 0.75, STOCK_H * 0.128);
  g.add(m);
  for (const y of [0.3, 0.62]) {
    const st = new THREE.Mesh(G.stitch, thread);
    st.position.y = STOCK_H * y;
    st.scale.setScalar(y > 0.5 ? 0.8 : 1.1);
    g.add(st);
  }
  g.userData.mats = [purple, pale, dark, thread];
  return g;
}

/**
 * 스톡 하나: 입에서 꺼내(pull) → 손에 쥐고(held) → 던지면(thrown) 날아가다 → 풀려나 개조인간이 된다(onPop).
 * hold(): 손 위치(없으면 null), from: 꺼내는 곳(입)
 */
export class StockPiece {
  constructor(ctx, from, hold, o = {}) {
    this.ctx = ctx;
    this.hold = hold;
    this.mesh = makeStockPiece();
    this.mesh.scale.setScalar(o.scale ?? 1);
    this.mesh.position.copy(from);
    ctx.scene.add(this.mesh);
    this.from = from.clone();
    this.state = 'pull';
    this.t = 0;
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.alive = true;
    this.onPop = null;
    ctx.sfx.play('grab', { at: from, vol: 0.45, rate: 1.6 });
  }

  /** 던진다: vel(m/s) · popAfter 초 뒤(또는 무언가에 닿으면) 풀려난다 */
  throw(vel, onPop, popAfter = 0.2) {
    if (this.state === 'thrown') return;
    this.state = 'thrown';
    this.t = 0;
    this.vel.copy(vel);
    this.spin.set(rnd(-14, 14), rnd(-6, 6), rnd(-14, 14));
    this.onPop = onPop;
    this.popAfter = popAfter;
    this.ctx.sfx.whoosh?.(this.mesh.position, 0.5, 1.6);
  }

  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const M = this.mesh;
    if (this.state === 'pull' || this.state === 'held') {
      const h = this.hold?.();
      if (!h) return this.dispose(), false;
      // 입 → 손: 0.15초 동안 끌려 나온다
      const k = this.state === 'pull' ? Math.min(1, this.t / 0.15) : 1;
      M.position.lerpVectors(this.from, h, k * k * (3 - 2 * k));
      if (k >= 1) this.state = 'held';
      // 손안에서 꿈틀 (살아 있다)
      M.rotation.set(Math.sin(this.t * 13) * 0.25, this.t * 0.8, Math.sin(this.t * 9) * 0.2);
      return true;
    }
    // 날아간다
    this.vel.y -= 9.8 * dt;
    M.position.addScaledVector(this.vel, dt);
    M.rotation.x += this.spin.x * dt;
    M.rotation.y += this.spin.y * dt;
    M.rotation.z += this.spin.z * dt;
    if (Math.random() < 0.5) this.ctx.fx.spawn(M.position, _v2.set(0, 0.1, 0), new THREE.Color(0x8a5ab0), 0.02, 0.25, 1, 0);
    if (this.t > this.popAfter || M.position.y < 0.12) {
      M.position.y = Math.max(0.3, M.position.y);
      this.ctx.fx.burst(M.position, 26, new THREE.Color(0x8a5ab0), 2.5, 0.04, 0.4);
      this.ctx.fx.burst(M.position, 16, FLESH, 3, 0.05, 0.4);
      this.ctx.sfx.play('grab', { at: M.position, vol: 0.9, rate: 0.5 });
      this.onPop?.(M.position.clone(), this.vel.clone().normalize());
      this.dispose();
      return false;
    }
    return true;
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.ctx.scene.remove(this.mesh);
    for (const m of this.mesh.userData.mats) m.dispose();
  }
}

/**
 * 다중혼 「撥体」: 여러 개조 인간(기본 8)의 영혼을 하나로 뭉쳐 질량을 폭발적으로 키운다.
 *  8마리의 벌레 같은 개조 인간이 한 덩어리로 꼬이며 앞으로 거대하게 부풀어 나간다.
 */
export class MergedWorms {
  constructor(ctx, from, dir, o = {}) {
    this.ctx = ctx;
    this.from = from.clone();
    this.dir = dir.clone().normalize();
    this.len = o.len ?? 11;
    this.onHit = o.onHit ?? null;
    this.owner = o.owner ?? 'player';
    this.n = o.n ?? 8;
    this.t = 0;
    this.hit = new Set();
    this.side = new THREE.Vector3().crossVectors(this.dir, UP);
    if (this.side.lengthSq() < 1e-4) this.side.set(1, 0, 0);
    this.side.normalize();
    this.up2 = new THREE.Vector3().crossVectors(this.side, this.dir).normalize();
    this.worms = [];
    for (let i = 0; i < this.n; i++) {
      const C = new ChainBody('transfigured', SPINE, { length: rnd(4.2, 5.6) * (o.scale ?? 1), outline: 0.012 });
      if (!C.ok) continue;
      C.grow = 0.03;
      C.tailDir.copy(this.dir).negate();
      const a = (i / this.n) * Math.PI * 2;
      const W = { C, a, r: rnd(0.25, 0.55), ph: Math.random() * 6, head: from.clone(), jaws: [] };
      W.jaws = ['T_jaw', 'U_jaw'].map((nm) => C.body.bones[nm]).filter(Boolean).map((b) => ({ b, q0: b.quaternion.clone(), s: b.name === 'T_jaw' ? -1 : 1 }));
      C.setHead(from, true);
      C.root.position.copy(from);
      ctx.scene.add(C.root);
      this.worms.push(W);
    }
    this.ok = this.worms.length > 0;
    ctx.fx.burst(from, 60, FLESH, 4, 0.07, 0.6);
    ctx.sfx.play('whoosh_3', { at: from, vol: 1, rate: 0.5 });
    ctx.sfx.play('punch_3', { at: from, vol: 0.7, rate: 0.45 });
  }

  /** 지금 덩어리 앞머리까지의 거리 */
  reach() {
    const g = Math.min(1, this.t / 0.45);
    return this.len * (1 - Math.pow(1 - g, 3));
  }

  update(dt) {
    this.t += dt;
    const head = this.reach();
    const grow = Math.min(1, this.t / 0.4);
    const fade = this.t > 1.05 ? Math.max(0.02, 1 - (this.t - 1.05) / 0.4) : 1;
    for (const W of this.worms) {
      // 한 덩어리로 꼬인다: 축을 따라 나선으로 감기며 앞으로
      const tw = W.a + this.t * 5 + W.ph * 0.2;
      const rr = W.r * (0.5 + grow * 0.9);
      const p = _v.copy(this.from).addScaledVector(this.dir, head * (0.85 + 0.15 * Math.sin(W.ph)))
        .addScaledVector(this.side, Math.cos(tw) * rr).addScaledVector(this.up2, Math.sin(tw) * rr);
      W.head.copy(p);
      W.C.grow = (0.03 + 0.97 * grow) * fade;
      W.C.setHead(W.head);
      W.C.root.position.copy(W.head);
      W.C.pose(UP, (k, P) => {
        // 몸통도 서로 감긴다
        const u = k / SPINE.length;
        const tw2 = tw - u * 4;
        P.addScaledVector(this.side, Math.cos(tw2) * 0.18 * grow).addScaledVector(this.up2, Math.sin(tw2) * 0.18 * grow);
      });
      // 입을 크게 벌린다
      const open = 0.6 + Math.sin(this.t * 10 + W.ph) * 0.35;
      const hb = W.C.chain[0];
      if (hb && W.jaws.length) {
        hb.getWorldQuaternion(_q);
        const right = _v2.set(1, 0, 0).applyQuaternion(_q);
        for (const J of W.jaws) {
          J.b.quaternion.copy(J.q0);
          J.b.parent.getWorldQuaternion(_q2);
          const wr = new THREE.Quaternion().setFromAxisAngle(right, J.s * open * 0.7);
          J.b.quaternion.premultiply(_q2.clone().invert().multiply(wr).multiply(_q2));
          J.b.updateMatrixWorld(true);
        }
      }
    }
    if (Math.random() < 0.6) this.ctx.fx.spawn(_v.copy(this.from).addScaledVector(this.dir, head * Math.random()), _v2.set(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)), FLESH, 0.06, 0.5, 1, 1);
    // 길 위의 대상
    if (this.owner === 'player') {
      for (const t of this.ctx.world.targets()) {
        if (!t.alive || this.hit.has(t)) continue;
        const c = t.center(_v);
        const along = _v2.subVectors(c, this.from).dot(this.dir);
        if (along < 0 || along > head + 0.4) continue;
        const off = _v2.subVectors(c, this.from).addScaledVector(this.dir, -along).length();
        if (off < 1.0) {
          this.hit.add(t);
          this.onHit?.(t);
        }
      }
    } else if (!this.hit.size) {
      const inp = this.ctx.input;
      const c = inp.bodyCenter ? inp.bodyCenter(_v) : _v.copy(inp.head);
      const along = _v2.subVectors(c, this.from).dot(this.dir);
      if (along > 0 && along < head + 0.3 && _v2.subVectors(c, this.from).addScaledVector(this.dir, -along).length() < 0.9) {
        this.hit.add('player');
        this.onHit?.('player');
      }
    }
    if (this.t > 1.45) {
      this.ctx.fx.burst(_v.copy(this.from).addScaledVector(this.dir, head), 40, FLESH, 2, 0.06, 0.6);
      this.dispose();
      return false;
    }
    return true;
  }

  dispose() {
    for (const W of this.worms) W.C.dispose(this.ctx.scene);
    this.worms.length = 0;
  }
}
