// 시뮬레이터 월드: 더미 · 소품(파괴 가능) · 더미 탄환 · 절단 조각 · 파편 · 플레이어 상태
import * as THREE from 'three';
const _cm = new THREE.Vector3();
const _cp = new THREE.Vector3();
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Dummy, DUMMY_TYPES } from './dummy.js';
import { RiggedEnemy } from './enemies.js';
import { Shatter, Slicer } from './slicer.js';
import { DomainClash } from './domainClash.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * 파괴 가능한 소품 (상자, 드럼통, 블록 등) — 상자 모양 강체.
 * 모양은 메시 경계 상자. 중력 · 바닥/벽 접촉(모서리 8개, 반발 + 마찰 + 회전) · 잠들기.
 * 서로 부딪히는 건 구 근사 (가볍게)
 */
const _c = new THREE.Vector3();
const _r = new THREE.Vector3();
const _vc = new THREE.Vector3();
const _t = new THREE.Vector3();
const _w = new THREE.Vector3();
const _qd = new THREE.Quaternion();
const CORNERS = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNERS.push(new THREE.Vector3(x, y, z));

export class Prop {
  constructor(world, obj, { radius = 0.35, halfH, mass = 2, hp = 40, color = 0x888888, fixed = false } = {}) {
    this.world = world;
    this.obj = obj;
    this.pos = obj.position;
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3(); // 각속도 (rad/s, 월드)
    this.radius = radius;
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
    // 모양: 로컬 경계 상자 (회전 전)
    const q0 = obj.quaternion.clone();
    obj.quaternion.identity();
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.quaternion.copy(q0);
    obj.updateMatrixWorld(true);
    const size = box.getSize(new THREE.Vector3());
    this.he = size.multiplyScalar(0.5); // 반 길이
    this.offset = box.getCenter(new THREE.Vector3()).sub(obj.position); // 몸 중심 - 원점 (로컬, 회전 전)
    this.halfH = halfH ?? this.he.y;
    // 관성 (상자) → 단순화한 스칼라
    this.invI = 3 / (mass * Math.max(0.01, this.he.lengthSq()));
    // 처음 놓인 바닥 높이 (보도 위 등). 멀리 밀려나면 땅(0)
    this.home = obj.position.clone();
    this.floor0 = Math.max(0, this._lowest());
  }

  _lowest() {
    let lo = Infinity;
    for (const c of CORNERS) {
      _c.set(c.x * this.he.x, c.y * this.he.y, c.z * this.he.z).add(this.offset).applyQuaternion(this.obj.quaternion).add(this.pos);
      lo = Math.min(lo, _c.y);
    }
    return lo;
  }

  floorAt() {
    // 처음에 다른 소품 위에 쌓여 있었다면 그건 바닥이 아니다 (보도·단상 위일 때만 높은 바닥)
    if (this._supported === undefined) {
      this._supported = this.world.props.some((o) => o !== this && Math.hypot(o.home.x - this.home.x, o.home.z - this.home.z) < this.he.x + this.he.z && o.home.y < this.home.y - 0.05);
      if (this._supported) this.floor0 = 0;
    }
    return Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) < 1.2 ? this.floor0 : 0;
  }

  center(out = new THREE.Vector3()) {
    return out.copy(this.offset).applyQuaternion(this.obj.quaternion).add(this.pos);
  }

  distanceTo(p) {
    return this.center(_t).distanceTo(p) - this.radius;
  }

  impulse(v) {
    if (!this.alive || this.fixed || this.held) return;
    this.vel.addScaledVector(v, Math.min(1, 2 / Math.max(0.5, this.mass)) + 0.5);
    this.asleep = false;
    this.restT = 0;
    if (v.lengthSq() > 4) this.spin.add(_v.randomDirection().multiplyScalar(Math.min(8, v.length()) / Math.sqrt(this.mass)));
  }

  damage(amount, info = {}) {
    if (!this.alive || amount <= 0) return 0;
    this.hp -= amount;
    if (this.hp <= 0) this.kill(info);
    return amount;
  }

  /** 한 스텝 물리 (월드가 부른다) */
  step(dt, bounds) {
    const g = 9.8;
    this.vel.y -= g * dt;
    if (this.vel.lengthSq() > 900) this.vel.setLength(30);
    if (this.spin.lengthSq() > 400) this.spin.setLength(20);
    this.pos.addScaledVector(this.vel, dt);
    // 회전 적분
    const w = this.spin;
    _qd.set(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 0).multiply(this.obj.quaternion);
    const q = this.obj.quaternion;
    q.set(q.x + _qd.x, q.y + _qd.y, q.z + _qd.z, q.w + _qd.w).normalize();
    // 바닥: 땅에 들어간 모서리마다 밀어내고, 접촉점에 반발·마찰 충격량
    const floor = this.floorAt();
    const C = this.center(_w).clone();
    let pen = 0;
    let contacts = 0;
    let impact = 0;
    for (const c of CORNERS) {
      _c.set(c.x * this.he.x, c.y * this.he.y, c.z * this.he.z).add(this.offset).applyQuaternion(q).add(this.pos);
      const d = floor - _c.y;
      if (d <= 0) continue;
      pen = Math.max(pen, d);
      contacts++;
      _r.subVectors(_c, C);
      // 접촉점 속도 = v + ω × r
      _vc.crossVectors(w, _r).add(this.vel);
      if (_vc.y < 0) {
        impact = Math.max(impact, -_vc.y);
        // 법선 (위) 충격량
        const rn = _t.crossVectors(_r, UP_);
        const k = 1 / this.mass + rn.lengthSq() * this.invI;
        const j = (-(1 + (_vc.y < -2 ? 0.25 : 0.05)) * _vc.y) / k / 2; // 모서리 여러 개가 나눠 받는다
        this.vel.y += j / this.mass;
        w.addScaledVector(_t.crossVectors(_r, UP_), j * this.invI);
        // 마찰: 미끄러지는 방향 반대로
        _vc.crossVectors(w, _r).add(this.vel);
        _vc.y = 0;
        const sl = _vc.length();
        if (sl > 1e-4) {
          const jt = Math.min(sl / (1 / this.mass + this.invI * _r.lengthSq() * 0.5), j * 0.7);
          _vc.divideScalar(sl);
          this.vel.addScaledVector(_vc, -jt / this.mass);
          w.addScaledVector(_t.crossVectors(_r, _vc), -jt * this.invI);
        }
      }
    }
    if (pen > 0) {
      this.pos.y += pen;
      // 땅에 닿아 있으면 구르는 기운도 서서히 줄어든다
      this.spin.multiplyScalar(Math.max(0, 1 - dt * (contacts >= 4 ? 6 : 1.5)));
      this.vel.x *= Math.max(0, 1 - dt * (contacts >= 4 ? 3 : 0.8));
      this.vel.z *= Math.max(0, 1 - dt * (contacts >= 4 ? 3 : 0.8));
      if (impact > 9) this.damage((impact - 9) * 3);
    }
    // 벽
    if (bounds) {
      const r = Math.max(this.he.x, this.he.z);
      if (this.pos.x < bounds.minX + r) { this.pos.x = bounds.minX + r; this.vel.x = Math.abs(this.vel.x) * 0.3; }
      if (this.pos.x > bounds.maxX - r) { this.pos.x = bounds.maxX - r; this.vel.x = -Math.abs(this.vel.x) * 0.3; }
      if (this.pos.z < bounds.minZ + r) { this.pos.z = bounds.minZ + r; this.vel.z = Math.abs(this.vel.z) * 0.3; }
      if (this.pos.z > bounds.maxZ - r) { this.pos.z = bounds.maxZ - r; this.vel.z = -Math.abs(this.vel.z) * 0.3; }
    }
    this.obj.scale.copy(this.baseScale).multiplyScalar(1 - this.crush * 0.6);
    // 잠들기
    if (pen > 0 && this.vel.lengthSq() < 0.02 && this.spin.lengthSq() < 0.05) {
      this.restT += dt;
      if (this.restT > 0.5) {
        this.asleep = true;
        this.vel.set(0, 0, 0);
        this.spin.set(0, 0, 0);
      }
    } else this.restT = 0;
    if (this.pos.lengthSq() > 250 * 250) this.kill({ type: 'erase' });
  }

  kill(info = {}) {
    if (!this.alive) return;
    this.alive = false;
    const W = this.world;
    const type = info.type ?? 'shatter';
    const c = this.center(new THREE.Vector3());
    if ((type === 'slash' || type === 'cleave') && (info.plane || info.planes)) {
      W.slicer.slice(this.obj, info.plane ?? info.planes[0], { color: this.color, vel: this.vel, center: c, radius: this.radius * 0.7, sep: 1 });
    } else if (type === 'erase') {
      W.ctx.fx.burst(c, 16, new THREE.Color(0xc07bff), 1.5, 0.05, 0.5, { spread: this.radius });
      this.obj.parent?.remove(this.obj);
    } else {
      W.shatter.emit(c, 26, info.burn ? 0x2a1a14 : this.color, { spread: this.radius, speed: 3, dir: info.dir, dirAmt: 2, size: 0.07 });
      this.obj.parent?.remove(this.obj);
    }
  }
}
const UP_ = new THREE.Vector3(0, 1, 0);

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
    // 더미·소품 말고 칠 수 있는 것 (메구미의 조복 의식 중인 마허라 등). { alive, pos, radius, center(), distanceTo(), damage(), noGrab }
    this.extraTargets = [];
    this.bullets = [];
    this.time = 0;
    this.kills = 0;
    this.shield = null; // (obj, dt, center) => void : 캐릭터가 설정 (무하한 등)
    this.meleeShield = null; // (dummy, fistPos) => bool
    this.domain = null; // { center, radius, freeze }
    this.pieceForce = null;
    this.player = { hp: 100, maxHp: 100, lastHit: -10, paralyzed: false };
    this.clash = new DomainClash(ctx); // 적의 영역전개 · 영역 싸움
    this.onDamage = (d, amount, info) => ctx.ui?.damageNumber(d, amount, info);
    this.onKill = () => this.kills++;
    this.bulletGeo = new THREE.CapsuleGeometry(0.018, 0.12, 3, 6);
    this.bulletGeo.rotateX(Math.PI / 2);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xff2a10 });
  }

  // ── 더미 ──
  spawnDummy(type, hp, pos) {
    // 주령은 체력 메뉴의 100을 기본(def.hp)으로 본다
    const def = DUMMY_TYPES[type];
    if (def?.hp && hp !== Infinity) hp = def.hp * (hp / 100);
    const d = def?.model ? new RiggedEnemy(this, type, hp, pos) : new Dummy(this, type, hp, pos);
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
      const big = type === 'giant' || (DUMMY_TYPES[type]?.h ?? 0) > 2.5;
      const dist = (big ? 5.5 : 3.6) + (count > 3 ? (i % 2) * 1.2 : 0);
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

  /** 영역 싸움 중(중첩)이면 플레이어 영역의 필중 효과가 사라진다 — 영역 효과를 주는 곳에서 확인 */
  sureHitBlocked(t) {
    void t;
    return this.clash.sureHitBlocked();
  }

  clearDummies() {
    this.clash.reset();
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
    obj.traverse((o) => (o.userData.noCollide = true)); // 움직이는 소품은 고정물 상자가 아니다 (소품 충돌로 따로)
    const p = new Prop(this, obj, opts);
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.userData.isProp = true;
      }
    });
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
    for (const x of this.extraTargets) {
      if (!x.alive) continue;
      const c = x.center(new THREE.Vector3());
      const dist = c.distanceTo(center);
      if (dist < r + x.radius) fn(x, dist, c);
    }
  }

  /** 식신·주령이 노리는 대상: 소품(상자·드럼통 등)은 빼고 */
  enemies() {
    return [...this.dummies.filter((d) => d.alive), ...this.extraTargets.filter((x) => x.alive)];
  }

  forEachEnemy(center, r, fn) {
    this.forEachTarget(center, r, (t, d, c) => {
      if (t.kind !== 'prop') fn(t, d, c);
    });
  }

  targets() {
    return [...this.dummies.filter((d) => d.alive), ...this.props.filter((p) => p.alive), ...this.extraTargets.filter((x) => x.alive)];
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
  /** style: 없음 = 총탄 · 'fire' = 죠고의 불덩이 (느리고 크고 아프다) */
  spawnBullet(from, to, src = null, style = null) {
    const fire = style === 'fire';
    if (fire && !this.fireGeo) {
      this.fireGeo = new THREE.IcosahedronGeometry(0.11, 2);
      this.fireMat = new THREE.MeshBasicMaterial({ color: 0xffb040 });
    }
    const mesh = new THREE.Mesh(fire ? this.fireGeo : this.bulletGeo, fire ? this.fireMat : this.bulletMat);
    mesh.position.copy(from);
    const dir = _v.subVectors(to, from).add(_v2.set(0, fire ? -0.05 : -0.15, 0)).normalize();
    mesh.lookAt(_v2.copy(from).add(dir));
    this.scene.add(mesh);
    this.bullets.push({ mesh, pos: mesh.position, vel: dir.clone().multiplyScalar(fire ? 6.5 : 9), life: 6, alive: true, stall: 0, src, fire, dmg: fire ? 16 : 10 });
    if (fire) {
      this.ctx.sfx.play?.('whoosh_2', { at: from, vol: 0.7, rate: 0.7 });
      this.ctx.fx.burst(from, 14, new THREE.Color(0xff7a20), 2, 0.05, 0.3);
    } else {
      this.ctx.sfx.gunshot(from);
      this.ctx.fx.burst(from, 6, new THREE.Color(0xffaa60), 1.5, 0.03, 0.15);
    }
  }

  removeBullet(b, burst = true) {
    if (!b.alive) return;
    b.alive = false;
    this.scene.remove(b.mesh);
    if (burst) this.shatter.emit(b.pos, 5, 0xff2a10, { spread: 0.03, speed: 1.5, size: 0.02, life: 1.2 });
  }

  dummyMelee(dummy, fist, dmg) {
    if (this.meleeShield && this.meleeShield(dummy, fist)) return;
    // 식신 등이 대신 맞는다
    if (this.absorbMelee && this.absorbMelee(dummy, fist, dmg)) return;
    const bc = this.ctx.input.bodyCenter(_v);
    if (fist.distanceTo(bc) < 0.65 || fist.distanceTo(this.ctx.input.head) < 0.45) this.hitPlayer(dmg, { type: 'punch', src: dummy });
  }

  /** info: { type, src } — 마허라 법진 같은 적응이 피해를 줄일 수 있다 */
  hitPlayer(amount, info = {}) {
    if (this.cinematic) return; // 연출 중엔 아무도 다치지 않는다
    const P = this.player;
    if (this.playerDamageMul) amount *= this.playerDamageMul(info.type ?? 'punch', info);
    if (amount <= 0.01) return;
    this.ctx.sfx.hit();
    this.ctx.ui.damageFlash(amount);
    this.ctx.input.left.pulse(0.6, 80);
    this.ctx.input.right.pulse(0.6, 80);
    P.lastHit = this.time;
    if (this.settings.invincible) return;
    P.hp = Math.max(0, P.hp - amount);
    if (P.hp <= 0) {
      P.hp = P.maxHp;
      // 캐릭터가 쓰러짐을 따로 다룰 수 있다 (예: 조복 전 마허라에게 쓰러지면 술사가 마허라가 된다)
      if (this.ctx.character?.onPlayerDown?.(info)) return;
      this.ctx.ui.callout(this.ctx.character?.reviveText ?? '쓰러졌다… 반전술식으로 회복', { color: '#ff8a8a' });
    }
  }

  /**
   * 원(바닥 xz) 충돌: pos 를 벽(경계) · 고정물 · 소품 밖으로 민다 (사람 · 적이 물체를 통과하지 못하게)
   *  가벼운 소품(상자·콘)은 밀려나고, 무거운 소품(차)은 버틴다. 반환: 밀린 양(xz)
   */
  collideActor(pos, r, { height = 1.7, push = true } = {}) {
    const ox = pos.x;
    const oz = pos.z;
    const env = this.ctx.env;
    for (const b of env.colliders ?? []) {
      if (b.maxY < pos.y + 0.15) continue; // 위로 넘어갈 만큼 낮다
      const cx = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) {
        // 상자 속: 가장 가까운 면으로
        const pen = [pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z];
        const k = pen.indexOf(Math.min(...pen));
        if (k === 0) pos.x = b.minX - r;
        else if (k === 1) pos.x = b.maxX + r;
        else if (k === 2) pos.z = b.minZ - r;
        else pos.z = b.maxZ + r;
        continue;
      }
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    }
    for (const p of this.props) {
      if (!p.alive || p.held) continue;
      const pc = p.pos;
      const top = pc.y + (p.halfH ?? p.radius);
      if (top < pos.y + 0.2 || pc.y - (p.halfH ?? p.radius) > pos.y + height) continue;
      let dx = pos.x - pc.x;
      let dz = pos.z - pc.z;
      const R = r + p.radius * 0.85;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 1e-4;
      if (d2 < 1e-8) dx = 1;
      const over = R - d;
      const light = !p.fixed && p.mass < 4 && push;
      const share = light ? 0.35 : 1;
      pos.x += (dx / d) * over * share;
      pos.z += (dz / d) * over * share;
      if (light) {
        // 가벼운 소품은 밀린다
        pc.x -= (dx / d) * over * (1 - share);
        pc.z -= (dz / d) * over * (1 - share);
        p.asleep = false;
        p.restT = 0;
      }
    }
    const B = env.bounds;
    if (B) {
      pos.x = THREE.MathUtils.clamp(pos.x, B.minX + r, B.maxX - r);
      pos.z = THREE.MathUtils.clamp(pos.z, B.minZ + r, B.maxZ - r);
    }
    return _cm.set(pos.x - ox, 0, pos.z - oz);
  }

  /** 플레이어: 머리(몸통) 위치가 벽·물체에 들어가면 리그를 밀어낸다 (걸어도, 실제로 움직여도) */
  collidePlayer() {
    const inp = this.ctx.input;
    if (!this.ctx.character || inp.mode === 'none') return;
    _cp.copy(inp.head);
    _cp.y = Math.max(0, inp.head.y - 1.6);
    const d = this.collideActor(_cp, 0.25, { height: 1.8 });
    if (d.lengthSq() > 1e-10) {
      this.ctx.rig.position.x += d.x;
      this.ctx.rig.position.z += d.z;
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
      // 영역의 정지 효과 또는 주언(움직이지 마) 같은 속박
      d.frozen = !!(dom && dom.freeze && !this.clash.neutral && d.center(_v).distanceTo(dom.center) < dom.radius) || (d.stunUntil ?? 0) > this.time;
      d.update(dt);
      if (this.shield && d.alive && d.state === 'air' && d.vel.lengthSq() > 4) this.shield(d, dt, bc);
    }

    // 소품 물리 (상자 강체)
    const bnd = ctx.env.bounds;
    for (const p of this.props) {
      if (!p.alive || p.asleep || p.fixed || p.held) continue;
      const sub = p.vel.lengthSq() > 25 || p.spin.lengthSq() > 25 ? 2 : 1;
      for (let i = 0; i < sub; i++) p.step(dt / sub, bnd);
      if (this.shield && p.vel.lengthSq() > 4) this.shield(p, dt, bc);
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
      if (b.fire) {
        ctx.fx.spawn(b.pos, _v.randomDirection().multiplyScalar(0.4), new THREE.Color().setHSL(0.05 + Math.random() * 0.06, 1, 0.55), 0.09, 0.35, 0, 0);
        b.mesh.scale.setScalar(0.9 + Math.sin(this.time * 40) * 0.12);
      } else if (Math.random() < 0.6) ctx.fx.spawn(b.pos, _v.set(0, 0, 0), new THREE.Color(0xff3a20), 0.02, 0.2, 0, 0);
      if (b.vel.lengthSq() < 0.05) {
        b.stall += dt;
        if (b.stall > 2.5) this.removeBullet(b);
      }
      if (b.life <= 0 || b.pos.y < 0) {
        this.removeBullet(b);
        continue;
      }
      if (this.absorbBullet && this.absorbBullet(b)) {
        this.removeBullet(b);
        continue;
      }
      if (b.pos.distanceTo(bc) < (b.fire ? 0.45 : 0.38) || b.pos.distanceTo(ctx.input.head) < (b.fire ? 0.3 : 0.2)) {
        this.removeBullet(b);
        if (b.fire) ctx.fx.burst(b.pos, 20, new THREE.Color(0xff6a10), 2.5, 0.06, 0.4);
        this.hitPlayer(b.dmg ?? 10, { type: b.fire ? 'fire' : 'bullet', src: b.src });
      }
    }

    this.clash.update(dt);
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
