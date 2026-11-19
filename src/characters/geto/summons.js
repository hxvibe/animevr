// 주령조술로 부리는 주령들. 검은 소용돌이 구멍에서 나와 싸우고, 끝나면 주령구가 되어 게토에게 돌아간다.
//  · 지네 주령: 땅을 기어 달려가 물고 조인다 (여러 마리)
//  · 큰코 주령: 대상 앞에서 솟아 거대한 손으로 내려친다
//  · 데스웜: 대상 발밑에서 솟구쳐 삼켰다가 땅에 내리꽂는다
//  · 홍룡: 하늘의 구멍에서 나와 일직선으로 꿰뚫는다 (게토가 가진 주령 중 가장 단단하다)
//  · 화신 타마모노마에: 여우불을 흩뿌린다
//  · 효수 주령 · 쿠치사케온나 · 거둔 주령(마히토·죠고·손가락 보유자): 인간형 — 직접 걸어가 싸운다
import * as THREE from 'three';
import { Dummy, DUMMY_TYPES } from '../../core/dummy.js';
import { RiggedBody, ChainBody } from '../../core/rigged.js';
import { GiantScissors } from './vfx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (k) => k * k * (3 - 2 * k);

// 주령 목록: 이름 · 주령구 색 · 부르는 데 드는 주력 · 등급
export const CURSES = {
  centipede: { label: '지네 주령', color: 0xd8552a, cost: 8, grade: '2급' },
  bignose: { label: '큰코 주령', color: 0x8ad8c8, cost: 15, grade: '1급' },
  worm: { label: '데스웜', color: 0xf0e2c8, cost: 22, grade: '1급' },
  cyclops: { label: '효수 주령', color: 0x58b4ff, cost: 18, grade: '1급' },
  kuchisake: { label: '쿠치사케온나', color: 0xf0c890, cost: 20, grade: '가상원령' },
  dragon: { label: '홍룡', color: 0xe8f0ff, cost: 30, grade: '특급', rainbow: true },
  tamamo: { label: '타마모노마에', color: 0xff6a3a, cost: 35, grade: '특급' },
  mahito: { label: '마히토', color: 0x8fc4d8, cost: 30, grade: '특급' },
  jogo: { label: '죠고', color: 0xff7a2a, cost: 30, grade: '특급' },
  fingerBearer: { label: '손가락 보유자', color: 0xd8203a, cost: 30, grade: '특급' },
};

function groundOf(t, out) {
  if (t.root) out.copy(t.root.position);
  else if (t.pos) out.copy(t.pos);
  else t.center(out);
  out.y = 0;
  return out;
}

function hurt(t, amount, info, push = null) {
  if (!t?.alive) return;
  t.damage(amount, info);
  if (push && t.alive) t.impulse?.(push, push.length() > 6 ? 4 : 0);
}

// ───────────────── 공통 ─────────────────
class Summon {
  constructor(geto, id) {
    this.g = geto;
    this.ctx = geto.ctx;
    this.id = id;
    this.def = CURSES[id];
    this.alive = true;
    this.t = 0;
    this.mode = 'rise';
    this.modeT = 0;
  }

  setMode(m) {
    this.mode = m;
    this.modeT = 0;
  }

  /** 대상이 없거나 쓰러졌으면 가까운 다른 대상 */
  retarget(from, maxD = 14) {
    if (this.target?.alive && !this.target.dying) return this.target;
    this.target = this.g.nearestEnemy(from, maxD);
    return this.target;
  }

  /** 끝: 주령구가 되어 게토에게 돌아간다 */
  finish(at) {
    if (!this.alive) return;
    this.alive = false;
    this.g.returnCurse(this.id, at);
    this.dispose();
  }

  dispose() {}
}

// ───────────────── 지네 주령 ─────────────────
const CENTI_BONES = ['head', 'waist', 'hip', ...'ABCDEFGHIJKLMN'.split('').map((c) => 'leg_' + c)];

export class CentipedeCurse extends Summon {
  constructor(geto, at, target) {
    super(geto, 'centipede');
    this.C = new ChainBody('centipede', CENTI_BONES, { length: rnd(3.0, 3.8), outline: 0.012 });
    this.target = target;
    this.base = at.clone().setY(0);
    this.head = this.base.clone().setY(-0.4);
    this.dir = new THREE.Vector3();
    if (target?.alive) this.dir.subVectors(groundOf(target, _v), this.base).setY(0);
    if (this.dir.lengthSq() < 1e-3) this.dir.copy(geto.flatFwd());
    this.dir.normalize();
    this.heading = Math.atan2(this.dir.x, this.dir.z);
    this.portal = geto.portals.open(this.base, 0.55, { color: 0x7a3a2a });
    this.phase = Math.random() * 6;
    if (this.C.ok) {
      this.ctx.scene.add(this.C.root);
      this.C.tailDir.set(0, -1, 0);
      this.C.setHead(this.head, true);
    }
    this.ctx.sfx.play('whoosh_2', { at, vol: 0.5, rate: 1.4 });
    this.life = 8;
  }

  update(dt) {
    if (!this.alive) return false;
    if (!this.C.ok) {
      this.finish(this.base);
      return false;
    }
    this.t += dt;
    this.modeT += dt;
    const H = this.head;
    const t = this.retarget(H, 16);
    if (this.mode === 'rise') {
      // 구멍에서 머리를 내밀고 앞으로 기어 나온다
      H.y = Math.min(0.1, H.y + dt * 2.5);
      H.addScaledVector(this.dir, dt * 2.5);
      if (H.y >= 0.1) this.setMode('crawl');
    } else if (this.mode === 'crawl') {
      // 좌우로 몸을 흔들며 빠르게 기어간다
      if (t) {
        const want = _v.subVectors(groundOf(t, _v2), H).setY(0);
        const d = want.length();
        const a = Math.atan2(want.x, want.z);
        let da = a - this.heading;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        this.heading += da * Math.min(1, dt * 5);
        if (d < 0.75 * (t.scale ?? 1) + 0.3) this.setMode('strike');
      } else if (this.modeT > 1.2) this.setMode('back');
      const wig = Math.sin(this.t * 13 + this.phase) * 0.75;
      const hd = this.heading + wig;
      H.x += Math.sin(hd) * dt * 6.5;
      H.z += Math.cos(hd) * dt * 6.5;
      H.y = 0.1;
      if (Math.random() < 0.3) this.ctx.fx.spawnDark(_v.copy(H).setY(0.03), _v2.set(rnd(-0.3, 0.3), 0.3, rnd(-0.3, 0.3)), new THREE.Color(0x6a6058), 0.05, 0.4, 2, 0);
    } else if (this.mode === 'strike') {
      // 몸을 일으켜 물고 조인다
      if (!t) {
        this.setMode('back');
      } else {
        const c = t.center(_v);
        if (!this.held && t.kind === 'dummy' && t.grab && !t.heldBy && !t.dying) {
          t.grab(this, c);
          this.held = t;
        }
        const k = Math.min(1, this.modeT / 0.25);
        const tgt = _v2.copy(c).add(_v3.set(0, 0.25, 0));
        H.lerp(tgt, k * Math.min(1, dt * 12));
        this._bite = (this._bite ?? 0) - dt;
        if (this._bite <= 0) {
          this._bite = 0.32;
          hurt(t, 14, { type: 'punch', silent: true, color: '#ffb080' });
          this.ctx.sfx.play('punch_2', { at: H, vol: 0.35, rate: 1.5 });
          this.ctx.fx.burst(H, 6, new THREE.Color(0x400808), 1.5, 0.03, 0.3, { dark: true });
        }
        if (this.modeT > 1.6) {
          if (this.held?.alive) this.held.release(_v.copy(this.dir).multiplyScalar(2).setY(2));
          this.held = null;
          this.setMode('back');
        }
      }
    } else if (this.mode === 'back') {
      // 구멍으로 돌아가 파고든다
      const to = _v.copy(this.base);
      to.y = this.modeT > 0.3 ? -2 : 0.1;
      const d = _v2.subVectors(to, H);
      const L = d.length();
      if (L > 1e-3) H.addScaledVector(d, Math.min(1, (dt * 7) / L));
      if (H.y < -1.2 || this.modeT > 2.2) {
        this.finish(this.base);
        return false;
      }
    }
    if (this.held?.alive) this.held.holdAt(_v.copy(H).add(_v2.set(0, -0.15, 0)));
    this.life -= dt;
    if (this.life <= 0 && this.mode !== 'back') this.setMode('back');
    this.C.setHead(H);
    this.C.pose(UP);
    return true;
  }

  drop() {
    this.held = null;
  }

  dispose() {
    if (this.held?.alive) this.held.release(new THREE.Vector3());
    this.portal?.close();
    this.C.dispose?.(this.ctx.scene);
  }
}

// ───────────────── 데스웜 ─────────────────
const WORM_BONES = ['shachong_shenti12', 'shachong_shenti11', 'shachong_shenti10', 'shachong_shenti13', 'shachong_shenti07', 'shachong_shenti09', 'shachong_shenti08', 'shachong_shenti05', 'shachong_shenti04', 'shachong_shenti03', 'shachong_shenti02', 'shachong_shenti01', 'shachong_shenti06'];
const WORM_LIPS = ['shachong_zui05', 'shachong_zui06', 'shachong_zui07', 'shachong_zui08'];

export class WormCurse extends Summon {
  constructor(geto, at, target) {
    super(geto, 'worm');
    this.C = new ChainBody('worm', WORM_BONES, { length: 8.5, outline: 0.03 });
    this.target = target;
    this.base = (target?.alive ? groundOf(target, new THREE.Vector3()) : at.clone()).setY(0);
    this.away = _v.subVectors(this.base, geto.ctx.input.head).setY(0);
    if (this.away.lengthSq() < 1e-3) this.away.copy(geto.flatFwd());
    this.away = this.away.clone().normalize();
    this.head = this.base.clone().setY(-4);
    this.portal = geto.portals.open(this.base, 1.7, { color: 0x6a5040 });
    this.mode = 'warn';
    if (this.C.ok) {
      this.ctx.scene.add(this.C.root);
      this.C.tailDir.set(0, -1, 0);
      this.C.setHead(this.head, true);
    }
    this.ctx.sfx.rumble(1.2, 0.5);
    this.open = 0;
  }

  update(dt) {
    if (!this.alive) return false;
    if (!this.C.ok) {
      this.finish(this.base);
      return false;
    }
    this.t += dt;
    this.modeT += dt;
    const { fx, sfx } = this.ctx;
    const H = this.head;
    const B = this.base;
    let open = 0;
    if (this.mode === 'warn') {
      // 땅이 흔들리고 흙먼지가 인다
      if (Math.random() < 0.6) fx.spawnDark(_v.copy(B).add(_v2.set(rnd(-1.4, 1.4), 0.05, rnd(-1.4, 1.4))), _v3.set(0, rnd(0.5, 1.5), 0), new THREE.Color(0x5a4a3a), 0.12, 0.6, 2, 2);
      if (this.modeT > 0.45) {
        this.setMode('burst');
        sfx.play('explosion_small', { at: B, vol: 0.9, rate: 0.6 });
        fx.shockwave(_v.copy(B).setY(0.05), 0x3a2a20, 3, 0.5, { dark: true, opacity: 0.6 });
      }
    } else if (this.mode === 'burst') {
      const k = Math.min(1, this.modeT / 0.5);
      H.set(B.x + this.away.x * k * 0.6, -4 + 10.5 * (1 - Math.pow(1 - k, 3)), B.z + this.away.z * k * 0.6);
      open = 1;
      const t = this.target;
      if (!this.held && t?.alive && t.kind === 'dummy' && !t.heldBy && !t.dying && H.y > 0) {
        t.grab(this, t.center(_v));
        this.held = t;
        hurt(t, 40, { type: 'punch' });
      } else if (!this.held && t?.alive && t.kind !== 'dummy' && H.y > 0.5) hurt(t, 40, { type: 'impact' }, _v.set(0, 10, 0));
      if (k >= 1) this.setMode('chew');
    } else if (this.mode === 'chew') {
      H.set(B.x + this.away.x * 0.6 + Math.sin(this.t * 20) * 0.08, 6.5 + Math.sin(this.modeT * 10) * 0.15, B.z + this.away.z * 0.6);
      open = 0.15 + Math.max(0, Math.sin(this.modeT * 9)) * 0.35;
      this._tick = (this._tick ?? 0) - dt;
      if (this._tick <= 0 && this.held?.alive) {
        this._tick = 0.3;
        this.held.damage(12, { type: 'impact', silent: true });
        sfx.play('punch_3', { at: H, vol: 0.4, rate: 0.6 });
      }
      if (this.modeT > 1.1) {
        this.setMode('dive');
        this.from = H.clone();
        this.to = _v.copy(B).addScaledVector(this.away, 4.5).setY(-5).clone();
      }
    } else if (this.mode === 'dive') {
      // 머리를 꺾어 앞쪽 땅으로 내리꽂는다
      const k = Math.min(1, this.modeT / 0.75);
      H.lerpVectors(this.from, this.to, k * k);
      H.y += Math.sin(k * Math.PI) * 2.5;
      open = 0.4;
      if (this.held && H.y < 1.2) {
        const h = this.held;
        this.held = null;
        if (h.alive) {
          h.release(_v.copy(this.away).multiplyScalar(3).setY(-14));
          h.damage(45, { type: 'impact' });
        }
        fx.shockwave(_v.copy(H).setY(0.05), 0x2a2018, 4.5, 0.6, { dark: true, opacity: 0.7 });
        sfx.explosion(H, 0.8);
        sfx.rumble(0.6, 0.5);
      }
      if (k >= 1) this.setMode('sink');
    } else if (this.mode === 'sink') {
      H.addScaledVector(_v.subVectors(this.to, this.from).normalize(), dt * 12);
      H.y -= dt * 6;
      if (this.modeT > this.C.length / 12 + 0.3) {
        this.finish(B);
        return false;
      }
    }
    if (this.held?.alive) this.held.holdAt(_v.copy(H).add(_v2.set(0, 0.1, 0)));
    this.open += (open - this.open) * Math.min(1, dt * 12);
    this.C.setHead(H);
    // 등은 게토 반대쪽을 향한다
    const away = this.away;
    this.C.pose((k, T, out) => out.copy(UP).addScaledVector(away, 1.2 * (1 - Math.abs(T.y)) + Math.abs(T.y) * 1.5));
    this._mouth();
    return true;
  }

  _mouth() {
    const B = this.C.body;
    const P = this.C.pts;
    const T = _v3.subVectors(P[0], P[1]).normalize();
    for (const n of WORM_LIPS) {
      const b = B.bones[n];
      if (!b) continue;
      const r = b.getWorldPosition(_v).sub(P[0]);
      r.addScaledVector(T, -r.dot(T));
      if (r.lengthSq() < 1e-6) continue;
      const axis = _v4.crossVectors(r.normalize(), T).normalize();
      B.rotWorld(n, axis, -this.open * 1.1);
    }
  }

  drop() {
    this.held = null;
  }

  dispose() {
    if (this.held?.alive) this.held.release(new THREE.Vector3());
    this.portal?.close();
    this.C.dispose?.(this.ctx.scene);
  }
}

// ───────────────── 홍룡 ─────────────────
const DRAGON_BONES = ['head', 'neck', 'waist', 'A_hip', ...'ABCDEFGHIJKLMNOPQRSTUVW'.split('').map((c) => 'A_leg_' + c)];

export class RainbowDragon extends Summon {
  constructor(geto, at, target) {
    super(geto, 'dragon');
    const inp = geto.ctx.input;
    const fwd = geto.flatFwd();
    this.C = new ChainBody('dragon', DRAGON_BONES, { length: 15, outline: 0.04 });
    // 출발: 게토 뒤 위쪽의 구멍
    const start = inp.head.clone().addScaledVector(fwd, -1.5).add(_v.set(0, 2.6, 0));
    const aim = target?.alive ? target.center(new THREE.Vector3()) : at.clone().setY(Math.max(1.2, at.y));
    const dir = _v2.subVectors(aim, start).normalize();
    const end = aim.clone().addScaledVector(dir.clone().setY(0).normalize(), 14).add(_v.set(0, 9, 0));
    this.curve = new THREE.CatmullRomCurve3([
      start,
      start.clone().addScaledVector(dir, 3).add(_v.set(0, 0.6, 0)),
      aim.clone().add(_v.set(0, 0.25, 0)),
      aim.clone().addScaledVector(dir.clone().setY(0).normalize(), 7).add(_v.set(0, 2.2, 0)),
      end,
    ]);
    this.curve.updateArcLengths();
    this.len = this.curve.getLength();
    this.s = 0;
    this.speed = 20;
    this.startN = _v.subVectors(this.curve.getPointAt(0.02), start).normalize().clone();
    this.endN = this.curve.getTangentAt(1).clone();
    this.portalA = geto.portals.open(start, 2.2, { normal: this.startN, color: 0x7a6ab0 });
    this.portalB = null;
    this.head = start.clone();
    this.hit = new Set();
    // 구멍 앞쪽만 보이게 자른다
    this.clipA = new THREE.Plane().setFromNormalAndCoplanarPoint(this.startN, start);
    this.clipB = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
    if (this.C.ok) {
      this.ctx.scene.add(this.C.root);
      this.C.tailDir.copy(this.startN).negate();
      this.C.setHead(this.head, true);
      for (const m of [...this.C.body.mats, this.C.body.outlineMat].filter(Boolean)) m.clippingPlanes = [this.clipA, this.clipB];
    }
    this.ctx.sfx.play('whoosh_3', { at: start, vol: 1, rate: 0.5 });
    this.ctx.sfx.rumble(1.5, 0.35);
    this.mode = 'fly';
  }

  update(dt) {
    if (!this.alive) return false;
    if (!this.C.ok) {
      this.finish(this.head);
      return false;
    }
    this.t += dt;
    const { fx, sfx } = this.ctx;
    const H = this.head;
    this.s += this.speed * dt * (this.t < 0.3 ? 0.4 + this.t * 2 : 1);
    if (this.s <= this.len) {
      this.curve.getPointAt(this.s / this.len, H);
      // 몸을 비틀며 난다
      H.y += Math.sin(this.t * 6) * 0.15;
    } else {
      if (!this.portalB) {
        const e = this.curve.getPointAt(1);
        this.portalB = this.g.portals.open(e, 2.2, { normal: _v.copy(this.endN).negate(), color: 0x7a6ab0 });
        this.clipB.setFromNormalAndCoplanarPoint(_v.copy(this.endN).negate(), e);
      }
      H.addScaledVector(this.endN, this.speed * dt);
    }
    // 머리가 지나가는 길의 모든 것을 꿰뚫는다
    for (const t of this.g.ctx.world.enemies()) {
      if (this.hit.has(t) || !t.alive) continue;
      const c = t.center(_v);
      const r = (t.kind === 'dummy' ? 0.5 * (t.scale ?? 1) : t.radius ?? 0.4) + 0.9;
      if (c.distanceTo(H) < r) {
        this.hit.add(t);
        const push = _v2.copy(this.curve.getTangentAt(Math.min(1, this.s / this.len))).multiplyScalar(12).add(_v3.set(0, 4, 0));
        hurt(t, 85, { type: 'impact', dir: push.clone().normalize() }, push);
        fx.burst(c, 30, new THREE.Color(0xe8f0ff), 5, 0.06, 0.5);
        sfx.play('punch_3', { at: c, vol: 1, rate: 0.5 });
        this.g.ctx.game.hitstop = Math.max(this.g.ctx.game.hitstop, 0.05);
      }
    }
    // 무지갯빛 비늘 반짝임
    if (Math.random() < 0.7) {
      const k = Math.floor(Math.random() * this.C.pts.length);
      fx.spawn(this.C.pts[k], _v.set(rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(-0.3, 0.3)), new THREE.Color().setHSL(Math.random(), 0.8, 0.7), 0.08, 0.5, 1, 0);
    }
    this.C.setHead(H);
    this.C.pose((k, T, out) => out.copy(UP).applyAxisAngle(T, Math.sin(this.t * 3 - k * 0.3) * 0.25));
    if (this.s > this.len + this.C.length + 1) {
      this.finish(this.curve.getPointAt(1));
      return false;
    }
    return true;
  }

  dispose() {
    this.portalA?.close();
    this.portalB?.close();
    this.C.dispose?.(this.ctx.scene);
  }
}

// ───────────────── 큰코 주령 ─────────────────
export class BigNoseCurse extends Summon {
  constructor(geto, at, target) {
    super(geto, 'bignose');
    this.B = new RiggedBody('bignose', { height: 2.5, outline: 0.02, hide: [] });
    this.target = target;
    const head = geto.ctx.input.head;
    let pos = at.clone().setY(0);
    if (target?.alive) {
      // 대상과 게토 사이, 대상 쪽으로
      const g = groundOf(target, _v);
      const d = _v2.subVectors(head, g).setY(0).normalize();
      pos = g.clone().addScaledVector(d, 1.6).setY(0);
    }
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.face(target?.alive ? target.center(_v) : _v.copy(pos).addScaledVector(geto.flatFwd(), 2));
    this.portal = geto.portals.open(pos, 1.5, { color: 0x3a7a70 });
    if (this.B.ok) {
      this.root.add(this.B.model);
      this.ctx.scene.add(this.root);
      this.B.model.position.y = -2.6;
    }
    this.slams = 0;
    this.ctx.sfx.play('whoosh_2', { at: pos, vol: 0.7, rate: 0.6 });
  }

  face(p) {
    const d = _v4.subVectors(p, this.root.position).setY(0);
    if (d.lengthSq() > 1e-4) this.root.rotation.y = Math.atan2(d.x, d.z);
  }

  update(dt) {
    if (!this.alive) return false;
    if (!this.B.ok) {
      this.finish(this.root.position);
      return false;
    }
    this.t += dt;
    this.modeT += dt;
    const J = this.B.J;
    const M = this.B.model;
    let raise = 0;
    let lean = 0;
    if (this.mode === 'rise') {
      const k = Math.min(1, this.modeT / 0.5);
      M.position.y = -2.6 * Math.pow(1 - k, 2);
      if (k >= 1) this.setMode('raise');
    } else if (this.mode === 'raise') {
      const t = this.retarget(this.root.position, 6);
      if (t) this.face(t.center(_v));
      const k = ease(Math.min(1, this.modeT / 0.45));
      raise = k;
      lean = -0.15 * k;
      if (this.modeT > 0.55) this.setMode('slam');
    } else if (this.mode === 'slam') {
      const k = Math.min(1, this.modeT / 0.16);
      raise = 1 - k * 1.4;
      lean = -0.15 + k * 0.55;
      if (k >= 1 && !this._hit) {
        this._hit = true;
        this._impact();
      }
      if (this.modeT > 0.45) {
        this._hit = false;
        this.slams++;
        this.setMode(this.slams >= 3 ? 'sink' : 'raise');
      }
    } else if (this.mode === 'sink') {
      const k = Math.min(1, this.modeT / 0.6);
      M.position.y = -2.8 * k * k;
      raise = -0.4 * (1 - k);
      if (k >= 1) {
        this.finish(this.root.position);
        return false;
      }
    }
    // 팔: 머리 위로 들었다가 앞으로 내려친다 (A자 바인드 기준)
    for (const [sh, el, s] of [[J.shL, J.elL, 1], [J.shR, J.elR, -1]]) {
      if (!sh) continue;
      sh.rotation.set(-0.4 - raise * 1.9, 0, s * (-0.2 + raise * 0.25));
      el.rotation.set(-0.3 - Math.max(0, raise) * 0.6, 0, 0);
    }
    if (J.chest) J.chest.rotation.x = lean;
    if (J.head) J.head.rotation.x = -lean * 0.5 + Math.sin(this.t * 2) * 0.05;
    this.B.sync();
    return true;
  }

  _impact() {
    const { fx, sfx, world } = this.ctx;
    const p = this.root.localToWorld(_v.set(0, 0, 1.4)).setY(0.05);
    fx.shockwave(p.clone(), 0x2a2a2a, 3.2, 0.5, { dark: true, opacity: 0.6 });
    fx.burst(p, 26, new THREE.Color(0x4a4a44), 4, 0.07, 0.6, { dark: true, up: 1 });
    sfx.explosion(p, 0.55);
    sfx.rumble(0.35, 0.4);
    world.forEachEnemy(p, 2.0, (t, d, c) => {
      const push = _v2.subVectors(c, p).setY(0).normalize().multiplyScalar(3).add(_v3.set(0, -2, 0));
      hurt(t, 42 * (1 - Math.min(0.6, d / 4)), { type: 'impact' }, push);
    });
    this.ctx.game.hitstop = Math.max(this.ctx.game.hitstop, 0.04);
  }

  dispose() {
    this.portal?.close();
    this.ctx.scene.remove(this.root);
    this.B.dispose?.();
  }
}

// ───────────────── 화신 타마모노마에 ─────────────────
class FoxFire {
  constructor(ctx, from, target, dir) {
    this.ctx = ctx;
    this.p = from.clone();
    this.v = dir.clone().multiplyScalar(4).add(_v.set(rnd(-1.5, 1.5), rnd(1, 3), rnd(-1.5, 1.5)));
    this.target = target;
    this.life = 3;
    this.alive = true;
  }

  update(dt) {
    this.life -= dt;
    const { fx } = this.ctx;
    const t = this.target;
    if (t?.alive) {
      const want = _v.subVectors(t.center(_v2), this.p).normalize().multiplyScalar(13);
      this.v.lerp(want, Math.min(1, dt * 3.2));
      if (this.p.distanceTo(_v2) < 0.45) {
        hurt(t, 24, { type: 'fire', burn: true, color: '#9fd0ff' }, _v3.copy(this.v).normalize().multiplyScalar(2));
        fx.burst(this.p, 16, new THREE.Color(0x8ac8ff), 2.5, 0.05, 0.35);
        this.ctx.sfx.play('fire_ignite', { at: this.p, vol: 0.4, rate: 1.4 });
        this.alive = false;
        return false;
      }
    }
    this.p.addScaledVector(this.v, dt);
    fx.spawn(this.p, _v.set(0, 0.3, 0), new THREE.Color().setHSL(0.55 + Math.random() * 0.05, 1, 0.65), 0.11, 0.25, 2, -1);
    fx.spawn(this.p, _v.set(0, 0, 0), new THREE.Color(0xffffff), 0.05, 0.12, 0, 0);
    if (this.life <= 0 || this.p.y < 0) this.alive = false;
    return this.alive;
  }
}

export class TamamoCurse extends Summon {
  constructor(geto, at, target) {
    super(geto, 'tamamo');
    this.B = new RiggedBody('tamamo', { height: 3.3, outline: 0.02, hide: [] });
    this.target = target;
    const inp = geto.ctx.input;
    const fwd = geto.flatFwd();
    // 게토 오른쪽 뒤에 선다
    const pos = inp.head.clone().addScaledVector(fwd, -0.6).add(_v.set(-fwd.z, 0, fwd.x).multiplyScalar(1.8)).setY(0);
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.root.rotation.y = Math.atan2(fwd.x, fwd.z);
    this.portal = geto.portals.open(pos, 1.3, { color: 0xa04a30 });
    if (this.B.ok) {
      this.root.add(this.B.model);
      this.ctx.scene.add(this.root);
      this.B.model.position.y = -3.4;
    }
    this.fires = [];
    this.volleys = 0;
    this.ctx.sfx.play('shimmer', { at: pos, vol: 0.8, rate: 0.7 });
  }

  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    this.modeT += dt;
    const M = this.B.ok ? this.B.model : null;
    if (this.mode === 'rise') {
      const k = Math.min(1, this.modeT / 0.7);
      if (M) M.position.y = -3.4 * Math.pow(1 - k, 2);
      if (k >= 1) this.setMode('cast');
    } else if (this.mode === 'cast') {
      if (M) M.position.y = 0.25 + Math.sin(this.t * 1.5) * 0.08;
      if (this.modeT > 0.6) {
        this.modeT = 0;
        this._volley();
        if (++this.volleys >= 3) this.setMode('wait');
      }
    } else if (this.mode === 'wait') {
      if (M) M.position.y = 0.25 + Math.sin(this.t * 1.5) * 0.08;
      if (this.modeT > 1.6 && !this.fires.length) this.setMode('sink');
    } else if (this.mode === 'sink') {
      const k = Math.min(1, this.modeT / 0.7);
      if (M) M.position.y = 0.25 - 3.6 * k * k;
      if (k >= 1) {
        this.finish(this.root.position);
        return false;
      }
    }
    if (M) M.rotation.z = Math.sin(this.t * 1.1) * 0.03;
    this.fires = this.fires.filter((f) => f.update(dt));
    return true;
  }

  _volley() {
    const from = this.root.localToWorld(_v.set(0, 2.6, 0.6)).clone();
    const enemies = this.g.enemies(from, 22);
    const fwd = this.g.flatFwd();
    for (let i = 0; i < 5; i++) {
      const t = enemies.length ? enemies[i % enemies.length] : null;
      this.fires.push(new FoxFire(this.ctx, from, t, fwd));
    }
    this.ctx.sfx.play('fire_whoosh', { at: from, vol: 0.6, rate: 1.3 });
    this.ctx.fx.burst(from, 20, new THREE.Color(0x8ac8ff), 2, 0.06, 0.4);
  }

  dispose() {
    this.portal?.close();
    this.ctx.scene.remove(this.root);
    this.B.dispose?.();
  }
}

// ───────────────── 인간형 주령 (더미 몸을 빌려 걷고 싸운다) ─────────────────
const ALLY = {
  cyclops: { type: 'cyclops', h: 3.6, dmg: 30, reach: 1.3, speed: 2.2, stomp: true },
  kuchisake: { type: 'kuchisake', dmg: 16, reach: 0.9, speed: 2.8, scissors: true },
  mahito: { type: 'mahito', dmg: 26, reach: 1.0, speed: 3.4, blade: true },
  jogo: { type: 'jogo', dmg: 30, reach: 0, speed: 2.2, fire: true },
  fingerBearer: { type: 'fingerBearer', dmg: 34, reach: 1.0, speed: 3.6 },
};

export class AllyCurse extends Dummy {
  constructor(geto, id, at, target) {
    const A = ALLY[id];
    super(geto.ctx.world, A.type, 1e9, at.clone().setY(0));
    this.g = geto;
    this.ctx = geto.ctx;
    this.id = id;
    this.A = A;
    this.ally = true;
    this.infinite = true;
    this.target = target;
    this.life = id === 'kuchisake' ? 11 : 13;
    this.mode = 'rise';
    this.modeT = 0;
    this.portal = geto.portals.open(at.clone().setY(0), 0.9 * this.scale, { color: 0x4a2a6a });
    this.rootY = -2 * this.scale;
    this.root.position.y = this.rootY;
    this.fires = [];
    this.hitCd = 0;
    if (target?.alive) this.faceTo(target.center(_v));
    else this.faceTo(_v.copy(this.root.position).addScaledVector(geto.flatFwd(), 2));
  }

  /** 주령조술 아군: 더미 갱신을 그대로 쓰되 AI만 바꾼다 */
  tick(dt) {
    this.modeT += dt;
    this.hitCd -= dt;
    if (this.mode === 'rise') {
      const k = Math.min(1, this.modeT / 0.55);
      this.root.position.y = this.rootY * Math.pow(1 - k, 2);
      if (k >= 1) {
        this.mode = 'fight';
        this.modeT = 0;
        this.portal?.close();
        this.portal = null;
        if (this.A.scissors) this._question();
      }
      if (this.rig) this.rig.sync();
      return true;
    }
    if (this.mode === 'sink') {
      const k = Math.min(1, this.modeT / 0.55);
      this.root.position.y = this.rootY * k * k;
      if (this.rig) this.rig.sync();
      if (k >= 1) {
        this.portal?.close();
        this.alive = false;
        this.ctx.scene.remove(this.root);
        this._dispose();
        this.g.returnCurse(this.id, this.root.position.clone().setY(0));
        return false;
      }
      return true;
    }
    this.life -= dt;
    if (this.life <= 0) {
      this.mode = 'sink';
      this.modeT = 0;
      this.portal = this.g.portals.open(this.root.position.clone().setY(0), 0.9 * this.scale, { color: 0x4a2a6a });
    }
    this.update(dt);
    this.fires = this.fires.filter((f) => f.update(dt));
    this.domain?.update(dt);
    return true;
  }

  dismiss() {
    if (this.mode === 'sink') return;
    this.life = 0;
  }

  _ai(dt) {
    const t = this.target?.alive && !this.target.dying ? this.target : (this.target = this.g.nearestEnemy(this.root.position, 18));
    const restArm = (arm, s) => {
      arm.sh.rotation.x = THREE.MathUtils.lerp(arm.sh.rotation.x, 0, dt * 6);
      arm.sh.rotation.z = THREE.MathUtils.lerp(arm.sh.rotation.z, this.restZ * s, dt * 6);
      arm.el.rotation.x = THREE.MathUtils.lerp(arm.el.rotation.x, -0.1, dt * 6);
    };
    this.spine.rotation.x = Math.sin(this.t * 1.6) * 0.02;
    if (!t || this._busy > 0) {
      this._busy = (this._busy ?? 0) - dt;
      restArm(this.armL, 1);
      if (this.punchT <= 0) restArm(this.armR, -1);
      this._legs(0, dt);
      if (this.punchT > 0) this._swing(dt, t);
      return;
    }
    const c = t.center(_v);
    this.faceTo(c);
    const flat = _v2.subVectors(c, this.root.position).setY(0);
    const dist = flat.length() - (t.kind === 'dummy' ? 0.3 * (t.scale ?? 1) : t.radius ?? 0.3);
    if (this.A.fire) {
      // 죠고: 거리를 두고 불덩이
      restArm(this.armL, 1);
      this._legs(0, dt);
      this.shootT -= dt;
      this.armR.sh.rotation.x = THREE.MathUtils.lerp(this.armR.sh.rotation.x, this.shootT < 0.5 ? -Math.PI / 2 : 0, dt * 8);
      if (dist > 9) {
        flat.normalize();
        this.root.position.addScaledVector(flat, this.A.speed * dt);
        this._legs(this.A.speed, dt);
      }
      if (this.shootT <= 0) {
        this.shootT = 0.9;
        const from = this.armR.hd.getWorldPosition(new THREE.Vector3());
        this.fires.push(new Fireball(this.ctx, from, t, this.A.dmg));
      }
      return;
    }
    if (this.punchT > 0) {
      this._swing(dt, t);
      this._legs(0, dt);
      return;
    }
    if (dist > this.A.reach * this.scale) {
      const sp = this.A.speed * Math.sqrt(this.scale);
      flat.normalize();
      this.root.position.addScaledVector(flat, sp * dt);
      this._legs(sp, dt);
      this.armR.sh.rotation.x = Math.sin(this.t * 7) * 0.4;
      this.armL.sh.rotation.x = -Math.sin(this.t * 7) * 0.4;
    } else {
      this._legs(0, dt);
      if (this.hitCd <= 0) {
        this.punchT = 0.4;
        this.hitCd = this.A.stomp ? 1.1 : 0.7;
        this._punchHit = false;
      }
    }
  }

  _swing(dt, t) {
    this.punchT -= dt;
    const k = 1 - this.punchT / 0.4;
    const ext = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
    this.armR.sh.rotation.x = (-Math.PI / 2) * ext;
    this.armR.el.rotation.x = -0.2 * (1 - ext);
    if (this.A.blade && this.rig) {
      const on = this.punchT > 0.05;
      if (on !== this._blade) {
        this._blade = on;
        this.rig.show('ArmsNormal', !on);
        this.rig.show('ArmsBlades', on);
      }
    }
    if (!this._punchHit && k > 0.38 && t?.alive) {
      this._punchHit = true;
      const fist = this.armR.hd.getWorldPosition(_v3);
      const c = t.center(_v4);
      const fwd = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      if (fist.distanceTo(c) < 1.1 * this.scale || this.A.stomp) {
        if (this.A.blade) {
          // 마히토: 팔을 칼날로 바꿔 벤다
          const n = _v2.crossVectors(fwd, UP).applyAxisAngle(fwd, rnd(-0.6, 0.6)).normalize();
          hurt(t, this.A.dmg, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, c) }, fwd.clone().multiplyScalar(2));
          this.ctx.sfx.slash(c, 1.2);
        } else {
          hurt(t, this.A.dmg, { type: 'punch', dir: fwd.clone() }, fwd.clone().multiplyScalar(this.A.stomp ? 7 : 4).add(_v2.set(0, 2, 0)));
          this.ctx.sfx.play('punch_3', { at: c, vol: 0.8, rate: this.A.stomp ? 0.6 : 1 });
        }
        this.ctx.fx.burst(c, 12, new THREE.Color(0xffffff), 3, 0.04, 0.3);
        if (this.A.stomp) {
          const p = this.root.localToWorld(_v.set(0, 0, 0.7)).setY(0.05);
          this.ctx.fx.shockwave(p, 0x333333, 3, 0.45, { dark: true, opacity: 0.5 });
          this.ctx.world.forEachEnemy(p, 2.2, (o) => o !== t && hurt(o, 14, { type: 'impact' }, _v2.set(0, 3, 0)));
        }
      }
    }
  }

  /** 쿠치사케온나: 「나, 예뻐?」 — 간이영역에 끌려 들어온 모두에게 거대한 가위 */
  _question() {
    const { ui, world } = this.ctx;
    ui.manga({ main: '私、キレイ?', ruby: '나, 예뻐?', color: '#f0c890', side: 'right' });
    const c = this.root.position.clone().setY(0);
    this.g.portals.open(c, 5, { color: 0xc8905a, life: 2.0, ring: true });
    this._busy = 1.6;
    this.ctx.sfx.play('shimmer', { at: c, vol: 0.8, rate: 0.6 });
    setTimeoutSim(this.g, 1.1, () => {
      if (!this.alive) return;
      for (const t of world.enemies()) {
        if (!t.alive || t.center(_v).distanceTo(c) > 5.5) continue;
        const tc = t.center(new THREE.Vector3());
        const dir = _v2.subVectors(tc, c).setY(0);
        if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
        dir.normalize();
        const s = new GiantScissors(this.ctx, tc, _v3.set(-dir.z, 0, dir.x), 1.6 * (t.scale ?? 1), () => {
          if (!t.alive) return;
          const n = _v4.set(0, 1, 0).applyAxisAngle(dir, rnd(-0.35, 0.35));
          hurt(t, 70, { type: 'cleave', planes: [new THREE.Plane().setFromNormalAndCoplanarPoint(n, tc)] });
        });
        this.g.fxList.push(s);
      }
    });
  }

  _dispose() {
    super._dispose();
    for (const f of this.fires) f.dispose?.();
  }
}

/** 시뮬레이션 시간으로 늦게 실행 (히트스톱·일시정지와 맞게) */
function setTimeoutSim(geto, sec, fn) {
  geto.pending.push({ t: sec, fn });
}

class Fireball {
  constructor(ctx, from, target, dmg) {
    this.ctx = ctx;
    this.p = from.clone();
    this.target = target;
    this.dmg = dmg;
    this.v = target.center(_v).sub(from).normalize().multiplyScalar(10).clone();
    this.life = 2.5;
    ctx.sfx.play('fire_whoosh', { at: from, vol: 0.5, rate: 1.1 });
  }

  update(dt) {
    const { fx } = this.ctx;
    this.life -= dt;
    const t = this.target;
    if (t?.alive) this.v.lerp(_v.subVectors(t.center(_v2), this.p).normalize().multiplyScalar(11), Math.min(1, dt * 2));
    this.p.addScaledVector(this.v, dt);
    fx.fire.flame?.(this.p, _v.set(0, 0.5, 0), { size0: 0.25, size1: 0.1, life: 0.25 });
    fx.spawn(this.p, _v.randomDirection().multiplyScalar(0.5), new THREE.Color().setHSL(0.06, 1, 0.55), 0.14, 0.3, 1, -1);
    if (t?.alive && this.p.distanceTo(t.center(_v)) < 0.55) {
      hurt(t, this.dmg, { type: 'fire', burn: true }, _v2.copy(this.v).normalize().multiplyScalar(4).add(_v3.set(0, 2, 0)));
      fx.sphereBlast(this.p, 0xff6a10, 1.2, 0.35);
      fx.burst(this.p, 24, new THREE.Color(0xff8a20), 4, 0.07, 0.4);
      this.ctx.sfx.play('fire_explode', { at: this.p, vol: 0.6 });
      return false;
    }
    return this.life > 0 && this.p.y > 0;
  }
}

export function makeSummon(geto, id, at, target) {
  if (ALLY[id]) {
    if (!DUMMY_TYPES[ALLY[id].type]) return null;
    return new AllyCurse(geto, id, at, target);
  }
  if (id === 'centipede') return new CentipedeCurse(geto, at, target);
  if (id === 'worm') return new WormCurse(geto, at, target);
  if (id === 'dragon') return new RainbowDragon(geto, at, target);
  if (id === 'bignose') return new BigNoseCurse(geto, at, target);
  if (id === 'tamamo') return new TamamoCurse(geto, at, target);
  return null;
}

void _v4;
