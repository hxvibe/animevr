// 시뮬레이터 월드: 더미 · 소품(파괴 가능) · 더미 탄환 · 절단 조각 · 파편 · 플레이어 상태
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Dummy } from './dummy.js';
import { Shatter, Slicer } from './slicer.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();

/** 파괴 가능한 소품 (상자, 드럼통, 블록 등) */
export class Prop {
  constructor(world, obj, { radius = 0.35, halfH, mass = 2, hp = 40, color = 0x888888, fixed = false } = {}) {
    this.world = world;
    this.obj = obj;
    this.pos = obj.position;
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.radius = radius;
    this.halfH = halfH ?? radius;
    this.mass = mass;
    this.hp = this.maxHp = hp;
    this.color = new THREE.Color(color);
    this.alive = true;
    this.asleep = true;
    this.restT = 0;
    this.kind = 'prop';
    this.fixed = fixed;
    this.crush = 0;
    this.scale = 1;
    this.baseScale = obj.scale.clone();
  }

  center(out = new THREE.Vector3()) {
    return out.copy(this.pos);
  }

  distanceTo(p) {
    return this.pos.distanceTo(p) - this.radius;
  }

  impulse(v) {
    if (!this.alive || this.fixed || this.held) return;
    this.vel.add(v);
    this.asleep = false;
    this.restT = 0;
    if (v.lengthSq() > 4) this.spin.add(_v.randomDirection().multiplyScalar(Math.min(10, v.length())));
  }

  damage(amount, info = {}) {
    if (!this.alive || amount <= 0) return 0;
    this.hp -= amount;
    if (this.hp <= 0) this.kill(info);
    return amount;
  }

  kill(info = {}) {
    if (!this.alive) return;
    this.alive = false;
    const W = this.world;
    const type = info.type ?? 'shatter';
    if ((type === 'slash' || type === 'cleave') && (info.plane || info.planes)) {
      W.slicer.slice(this.obj, info.plane ?? info.planes[0], { color: this.color, vel: this.vel, center: this.pos.clone(), radius: this.radius * 0.7, sep: 1 });
    } else if (type === 'erase') {
      W.ctx.fx.burst(this.pos, 16, new THREE.Color(0xc07bff), 1.5, 0.05, 0.5, { spread: this.radius });
      this.obj.parent?.remove(this.obj);
    } else {
      W.shatter.emit(this.pos, 26, info.burn ? 0x2a1a14 : this.color, { spread: this.radius, speed: 3, dir: info.dir, dirAmt: 2, size: 0.07 });
      this.obj.parent?.remove(this.obj);
    }
  }
}

export class World {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.settings = ctx.settings;
    const pmrem = new THREE.PMREMGenerator(ctx.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.shatter = new Shatter(this.scene, this.envMap);
    this.slicer = new Slicer(this.scene, this.shatter);
    this.dummies = [];
    this.props = [];
    this.bullets = [];
    this.time = 0;
    this.kills = 0;
    this.shield = null; // (obj, dt, center) => void : 캐릭터가 설정 (무하한 등)
    this.meleeShield = null; // (dummy, fistPos) => bool
    this.domain = null; // { center, radius, freeze }
    this.pieceForce = null;
    this.player = { hp: 100, maxHp: 100, lastHit: -10 };
    this.onDamage = (d, amount, info) => ctx.ui?.damageNumber(d, amount, info);
    this.onKill = () => this.kills++;
    this.bulletGeo = new THREE.CapsuleGeometry(0.018, 0.12, 3, 6);
    this.bulletGeo.rotateX(Math.PI / 2);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xff2a10 });
  }

  // ── 더미 ──
  spawnDummy(type, hp, pos) {
    const d = new Dummy(this, type, hp, pos);
    this.dummies.push(d);
    this.ctx.fx.burst(d.center(), 24, new THREE.Color(0xffffff), 2, 0.04, 0.5);
    return d;
  }

  /** 플레이어 앞쪽에 부채꼴로 배치 */
  spawnDummies(type, hp, count = 1) {
    const inp = this.ctx.input;
    const fwd = _v.copy(inp.headDir).setY(0);
    if (fwd.lengthSq() < 1e-3) fwd.set(0, 0, -1);
    fwd.normalize();
    const base = Math.atan2(fwd.x, fwd.z);
    const bounds = this.ctx.env.bounds;
    const out = [];
    for (let i = 0; i < count; i++) {
      const spread = count === 1 ? 0 : (i / (count - 1) - 0.5) * Math.min(1.6, count * 0.35);
      const dist = (type === 'giant' ? 5 : 3.6) + (count > 3 ? (i % 2) * 1.2 : 0);
      const a = base + spread;
      const p = new THREE.Vector3(inp.head.x + Math.sin(a) * dist, 0, inp.head.z + Math.cos(a) * dist);
      if (bounds) {
        p.x = THREE.MathUtils.clamp(p.x, bounds.minX + 0.6, bounds.maxX - 0.6);
        p.z = THREE.MathUtils.clamp(p.z, bounds.minZ + 0.6, bounds.maxZ - 0.6);
      }
      out.push(this.spawnDummy(type, hp, p));
    }
    return out;
  }

  clearDummies() {
    for (const d of this.dummies) if (d.alive) {
      d.alive = false;
      this.scene.remove(d.root);
      d._dispose();
    }
    this.dummies = [];
    for (const b of this.bullets) this.scene.remove(b.mesh);
    this.bullets = [];
  }

  clearDebris() {
    this.slicer.clear();
    this.shatter.clear();
  }

  // ── 소품 ──
  addProp(obj, opts) {
    const p = new Prop(this, obj, opts);
    this.props.push(p);
    return p;
  }

  clearProps() {
    for (const p of this.props) p.obj.parent?.remove(p.obj);
    this.props = [];
  }

  /** 반경 안의 모든 대상(더미+소품): fn(target, dist, center) */
  forEachTarget(center, r, fn) {
    for (const d of this.dummies) {
      if (!d.alive) continue;
      const c = d.center(new THREE.Vector3());
      const dist = c.distanceTo(center);
      if (dist < r + 0.5 * d.scale) fn(d, dist, c);
    }
    for (const p of this.props) {
      if (!p.alive) continue;
      const dist = p.pos.distanceTo(center);
      if (dist < r + p.radius) fn(p, dist, p.pos);
    }
  }

  targets() {
    return [...this.dummies.filter((d) => d.alive), ...this.props.filter((p) => p.alive)];
  }

  /** 점에 가장 가까운 대상 (몸 표면까지 거리) */
  nearestTarget(p, maxDist, filter) {
    let best = null;
    let bd = maxDist;
    for (const t of this.targets()) {
      if (filter && !filter(t)) continue;
      const d = t.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  // ── 더미 공격 ──
  spawnBullet(from, to) {
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    mesh.position.copy(from);
    const dir = _v.subVectors(to, from).add(_v2.set(0, -0.15, 0)).normalize();
    mesh.lookAt(_v2.copy(from).add(dir));
    this.scene.add(mesh);
    this.bullets.push({ mesh, pos: mesh.position, vel: dir.clone().multiplyScalar(9), life: 6, alive: true, stall: 0 });
    this.ctx.sfx.gunshot(from);
    this.ctx.fx.burst(from, 6, new THREE.Color(0xffaa60), 1.5, 0.03, 0.15);
  }

  removeBullet(b, burst = true) {
    if (!b.alive) return;
    b.alive = false;
    this.scene.remove(b.mesh);
    if (burst) this.shatter.emit(b.pos, 5, 0xff2a10, { spread: 0.03, speed: 1.5, size: 0.02, life: 1.2 });
  }

  dummyMelee(dummy, fist, dmg) {
    if (this.meleeShield && this.meleeShield(dummy, fist)) return;
    const bc = this.ctx.input.bodyCenter(_v);
    if (fist.distanceTo(bc) < 0.65 || fist.distanceTo(this.ctx.input.head) < 0.45) this.hitPlayer(dmg);
  }

  hitPlayer(amount) {
    const P = this.player;
    this.ctx.sfx.hit();
    this.ctx.ui.damageFlash(amount);
    this.ctx.input.left.pulse(0.6, 80);
    this.ctx.input.right.pulse(0.6, 80);
    P.lastHit = this.time;
    if (this.settings.invincible) return;
    P.hp = Math.max(0, P.hp - amount);
    if (P.hp <= 0) {
      P.hp = P.maxHp;
      this.ctx.ui.callout('쓰러졌다… 반전술식으로 회복', { color: '#ff8a8a' });
    }
  }

  update(dt) {
    const ctx = this.ctx;
    this.time += dt;
    const bc = ctx.input.bodyCenter(new THREE.Vector3());
    const dom = this.domain;

    // 반전술식: 피격 2초 후 회복
    const P = this.player;
    if (P.hp < P.maxHp && this.time - P.lastHit > 2) P.hp = Math.min(P.maxHp, P.hp + 10 * dt);

    for (const d of this.dummies) {
      if (!d.alive) continue;
      d.frozen = !!(dom && dom.freeze && d.center(_v).distanceTo(dom.center) < dom.radius);
      d.update(dt);
      if (this.shield && d.alive && d.state === 'air' && d.vel.lengthSq() > 4) this.shield(d, dt, bc);
    }

    // 소품 물리
    for (const p of this.props) {
      if (!p.alive || p.asleep || p.fixed || p.held) continue;
      p.vel.y -= 9.8 * dt;
      if (p.vel.lengthSq() > 900) p.vel.setLength(30);
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.halfH) {
        p.pos.y = p.halfH;
        if (p.vel.y < 0) {
          const imp = -p.vel.y;
          if (imp > 9) p.damage((imp - 9) * 3);
          p.vel.y = imp > 1 ? imp * 0.3 : 0;
        }
        p.vel.x *= Math.max(0, 1 - dt * 3);
        p.vel.z *= Math.max(0, 1 - dt * 3);
        p.spin.multiplyScalar(Math.max(0, 1 - dt * 4));
      }
      p.obj.rotation.x += p.spin.x * dt;
      p.obj.rotation.y += p.spin.y * dt;
      p.obj.rotation.z += p.spin.z * dt;
      p.obj.scale.copy(p.baseScale).multiplyScalar(1 - p.crush * 0.6);
      if (p.pos.y <= p.halfH + 0.02 && p.vel.lengthSq() < 0.04) {
        p.restT += dt;
        if (p.restT > 1) {
          p.asleep = true;
          p.vel.set(0, 0, 0);
        }
      } else p.restT = 0;
      if (this.shield && p.vel.lengthSq() > 4) this.shield(p, dt, bc);
      if (p.pos.lengthSq() > 250 * 250) p.kill({ type: 'erase' });
    }
    // 소품끼리 / 소품-더미 충돌 (구 근사)
    const props = this.props;
    for (let i = 0; i < props.length; i++) {
      const a = props[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < props.length; j++) {
        const c = props[j];
        if (!c.alive || (a.asleep && c.asleep)) continue;
        this._collide(a, c);
      }
      if (a.asleep) continue;
      for (const d of this.dummies) {
        if (!d.alive) continue;
        const dc = d.center(_v2);
        _n.subVectors(a.pos, dc);
        const dist = _n.length();
        const rr = a.radius + 0.35 * d.scale;
        if (dist < rr && dist > 0) {
          _n.divideScalar(dist);
          const rel = a.vel.dot(_n);
          if (rel < -6) {
            d.damage((-rel - 6) * 4, { type: 'impact' });
            d.impulse(_v.copy(_n).multiplyScalar(rel * 0.4 * a.mass / d.mass));
          }
          a.pos.addScaledVector(_n, rr - dist);
          if (rel < 0) a.vel.addScaledVector(_n, -rel * 1.2);
        }
      }
    }

    // 더미 탄환
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.life -= dt;
      if (dom && dom.freeze && b.pos.distanceTo(dom.center) < dom.radius) b.vel.multiplyScalar(Math.max(0, 1 - dt * 5));
      if (this.shield) this.shield(b, dt, bc);
      b.pos.addScaledVector(b.vel, dt);
      if (b.vel.lengthSq() > 0.01) b.mesh.lookAt(_v.copy(b.pos).add(b.vel));
      if (Math.random() < 0.6) ctx.fx.spawn(b.pos, _v.set(0, 0, 0), new THREE.Color(0xff3a20), 0.02, 0.2, 0, 0);
      if (b.vel.lengthSq() < 0.05) {
        b.stall += dt;
        if (b.stall > 2.5) this.removeBullet(b);
      }
      if (b.life <= 0 || b.pos.y < 0) {
        this.removeBullet(b);
        continue;
      }
      if (b.pos.distanceTo(bc) < 0.38 || b.pos.distanceTo(ctx.input.head) < 0.2) {
        this.removeBullet(b);
        this.hitPlayer(10);
      }
    }

    this.slicer.update(dt, this.pieceForce);
    this.shatter.update(dt);

    if (this.dummies.some((d) => !d.alive)) this.dummies = this.dummies.filter((d) => d.alive);
    if (this.props.some((p) => !p.alive)) this.props = this.props.filter((p) => p.alive);
    if (this.bullets.some((b) => !b.alive)) this.bullets = this.bullets.filter((b) => b.alive);
  }

  _collide(a, c) {
    _v.subVectors(c.pos, a.pos);
    const rr = a.radius + c.radius;
    const d2 = _v.lengthSq();
    if (d2 >= rr * rr || d2 === 0) return;
    const d = Math.sqrt(d2);
    _n.copy(_v).divideScalar(d);
    const relV = _v2.subVectors(c.vel, a.vel).dot(_n);
    if ((a.asleep || c.asleep) && -relV > 1.2) {
      a.asleep = c.asleep = false;
    }
    const ia = a.asleep || a.fixed ? 0 : 1 / a.mass;
    const ic = c.asleep || c.fixed ? 0 : 1 / c.mass;
    const sum = ia + ic;
    if (sum === 0) return;
    const pen = rr - d;
    a.pos.addScaledVector(_n, -pen * (ia / sum));
    c.pos.addScaledVector(_n, pen * (ic / sum));
    if (relV < 0) {
      const j = (-1.25 * relV) / sum;
      a.vel.addScaledVector(_n, -j * ia);
      c.vel.addScaledVector(_n, j * ic);
      if (-relV > 8) {
        a.damage((-relV - 8) * 3);
        c.damage((-relV - 8) * 3);
      }
    }
  }
}
