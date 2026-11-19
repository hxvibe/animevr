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
    this.C.tailDir.set(0, -1, 0);
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
