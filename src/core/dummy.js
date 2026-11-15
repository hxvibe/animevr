// SUPERHOT VR 느낌의 붉은 유리질 인간형 더미
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export const DUMMY_TYPES = {
  basic: { label: '기본', color: 0xd8160a, scale: 1, ai: 'idle' },
  shooter: { label: '사격형', color: 0xc20f08, scale: 1, ai: 'shooter' },
  rusher: { label: '돌격형', color: 0xe0300a, scale: 1, ai: 'rusher' },
  giant: { label: '거대', color: 0x9a0a06, scale: 1.45, ai: 'rusher' },
  sandbag: { label: '샌드백(∞)', color: 0xe85040, scale: 1, ai: 'idle', infinite: true },
};

// 공유 지오메트리 (각진 로우폴리)
let G = null;
function geos() {
  if (G) return G;
  const cyl = (rt, rb, h, seg = 6) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
    return g;
  };
  G = {
    pelvis: new THREE.BoxGeometry(0.3, 0.16, 0.18),
    torso: cyl(0.14, 0.19, 0.5, 6),
    head: new THREE.IcosahedronGeometry(0.115, 1),
    neck: cyl(0.045, 0.05, 0.08, 5),
    upperArm: cyl(0.055, 0.045, 0.3, 5),
    forearm: cyl(0.045, 0.038, 0.27, 5),
    hand: new THREE.BoxGeometry(0.07, 0.1, 0.035),
    thigh: cyl(0.08, 0.06, 0.45, 6),
    shin: cyl(0.06, 0.045, 0.42, 6),
    foot: new THREE.BoxGeometry(0.09, 0.06, 0.22),
    gun: new THREE.BoxGeometry(0.035, 0.07, 0.2),
  };
  for (const k of ['torso', 'upperArm', 'forearm', 'thigh', 'shin', 'neck']) G[k].translate(0, -G[k].parameters.height / 2, 0);
  G.torso.rotateX(Math.PI); // 위로 향하게
  return G;
}

export class Dummy {
  constructor(world, type = 'basic', hp = 100, pos = new THREE.Vector3()) {
    this.world = world;
    this.type = type;
    const def = DUMMY_TYPES[type] ?? DUMMY_TYPES.basic;
    this.def = def;
    this.scale = def.scale;
    this.infinite = !!def.infinite || hp === Infinity;
    this.hp = this.maxHp = this.infinite ? 1e9 : hp;
    this.alive = true;
    this.kind = 'dummy';
    this.color = new THREE.Color(def.color);
    this.mat = new THREE.MeshStandardMaterial({
      color: this.color, roughness: 0.08, metalness: 0.25, flatShading: true,
      envMap: world.envMap, envMapIntensity: 1.0, emissive: new THREE.Color(def.color).multiplyScalar(0.18),
    });
    this.baseEmissive = this.mat.emissive.clone();
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.root.scale.setScalar(this.scale);
    this._build();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.state = 'stand';
    this.stateT = 0;
    this.frozen = false;
    this.flash = 0;
    this.t = Math.random() * 10;
    this.shootT = 1.5 + Math.random() * 2;
    this.punchT = 0;
    this.punchCd = 0;
    this.totalDamage = 0;
    this.dpsWindow = [];
    this.lastHitBy = null;
    this.radius = 0.24 * this.scale;
    this.mass = 3 * this.scale * this.scale;
    this.yaw = 0;
    this._upright = new THREE.Quaternion();
    this.faceTo(world.ctx.input.head);
    world.scene.add(this.root);
  }

  _build() {
    const g = geos();
    const m = this.mat;
    const mk = (geo, parent, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const J = (parent, x, y, z) => {
      const j = new THREE.Group();
      j.position.set(x, y, z);
      parent.add(j);
      return j;
    };
    const R = this.root;
    this.hips = J(R, 0, 0.92, 0);
    mk(g.pelvis, this.hips, 0, 0.02, 0);
    this.spine = J(this.hips, 0, 0.08, 0);
    mk(g.torso, this.spine, 0, 0, 0);
    this.neck = J(this.spine, 0, 0.52, 0);
    mk(g.neck, this.neck, 0, 0.08, 0).rotation.x = Math.PI;
    this.head = J(this.neck, 0, 0.14, 0);
    mk(g.head, this.head);
    const arm = (s) => {
      const sh = J(this.spine, 0.22 * s, 0.45, 0);
      mk(g.upperArm, sh);
      const el = J(sh, 0, -0.3, 0);
      mk(g.forearm, el);
      const hd = J(el, 0, -0.29, 0);
      mk(g.hand, hd, 0, -0.04, 0);
      sh.rotation.z = 0.08 * s;
      return { sh, el, hd };
    };
    this.armL = arm(-1);
    this.armR = arm(1);
    const leg = (s) => {
      const hp = J(this.hips, 0.1 * s, -0.02, 0);
      mk(g.thigh, hp);
      const kn = J(hp, 0, -0.45, 0);
      mk(g.shin, kn);
      const ft = J(kn, 0, -0.43, 0);
      mk(g.foot, ft, 0, 0, 0.05);
      return { hp, kn, ft };
    };
    this.legL = leg(-1);
    this.legR = leg(1);
    if (this.def.ai === 'shooter') {
      const gun = new THREE.Mesh(g.gun, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, flatShading: true }));
      gun.position.set(0, -0.07, 0.07);
      this.armR.hd.add(gun);
      this.gun = gun;
    }
  }

  faceTo(p) {
    _v.subVectors(p, this.root.position).setY(0);
    if (_v.lengthSq() < 1e-4) return;
    this.yaw = Math.atan2(_v.x, _v.z);
    if (this.state === 'stand') this.root.quaternion.setFromAxisAngle(UP, this.yaw);
  }

  /** 몸통 중심 (월드) */
  center(out = new THREE.Vector3()) {
    return this.root.localToWorld(out.set(0, 1.05, 0));
  }

  headPos(out = new THREE.Vector3()) {
    return this.head.getWorldPosition(out);
  }

  /** 점에서 몸(캡슐)까지 거리 */
  distanceTo(p) {
    const a = this.root.localToWorld(_v2.set(0, 0.25, 0));
    const b = this.root.localToWorld(_v3.set(0, 1.65, 0));
    const ab = _v.subVectors(b, a);
    const t = THREE.MathUtils.clamp(_v3.subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
    const closest = a.addScaledVector(ab, t);
    return closest.distanceTo(p) - this.radius;
  }

  /** 선분(p0→p1)과 몸의 최단거리 */
  segmentDistance(p0, p1) {
    // 간단 샘플링
    let best = Infinity;
    for (let i = 0; i <= 6; i++) {
      _v.lerpVectors(p0, p1, i / 6);
      best = Math.min(best, this.distanceTo(_v));
    }
    return best;
  }

  impulse(v, spin = 0) {
    if (!this.alive) return;
    this.vel.add(v);
    if (this.frozen) return;
    if (v.length() > 2.2 * Math.sqrt(this.scale) || this.vel.y > 1.5) {
      if (this.state !== 'air') {
        this.state = 'air';
        this.stateT = 0;
      }
      if (spin) this.angVel.add(_v.randomDirection().multiplyScalar(spin));
    }
  }

  /** @returns 실제 적용된 피해 */
  damage(amount, info = {}) {
    if (!this.alive || amount <= 0) return 0;
    this.flash = 0.1;
    this.lastHitBy = info.type;
    this.totalDamage += amount;
    this.dpsWindow.push([this.world.time, amount]);
    this.world.onDamage?.(this, amount, info);
    if (this.infinite) return amount;
    this.hp -= amount;
    if (this.hp <= 0) this.kill(info);
    return amount;
  }

  kill(info = {}) {
    if (!this.alive) return;
    this.alive = false;
    this.world.onKill?.(this, info);
    const W = this.world;
    const c = this.center();
    this.root.updateMatrixWorld(true);
    const type = info.type ?? 'shatter';
    if (type === 'slash' && info.plane) {
      const pieces = W.slicer.slice(this.root, info.plane, { color: this.color, vel: this.vel.clone().add(info.push ?? _v.set(0, 0, 0)), center: c, radius: 0.35 * this.scale, sep: 1.2 });
      W.shatter.emit(info.plane.projectPoint(c, new THREE.Vector3()), 14, this.color, { spread: 0.3, speed: 2.5, size: 0.04 });
      this._disposeLater(pieces);
    } else if (type === 'cleave' && info.planes?.length) {
      let pieces = W.slicer.slice(this.root, info.planes[0], { color: this.color, vel: this.vel.clone(), center: c, radius: 0.32 * this.scale, sep: 0.8 });
      for (let i = 1; i < Math.min(3, info.planes.length); i++) {
        const next = [];
        for (const p of pieces) next.push(...W.slicer.sliceAgain(p, info.planes[i], { sep: 0.6, radius: 0.22 * this.scale }));
        pieces = next;
      }
      if (info.planes.length > 3) {
        // 격하의 상대는 먼지가 될 때까지 썰린다
        for (const p of pieces) W.slicer.shatterPiece(p, 30);
        W.shatter.emit(c, 60, this.color, { box: _v.set(0.5, 1.6, 0.4).multiplyScalar(this.scale), speed: 1.5, size: 0.035, up: 0.5 });
      }
      this._disposeLater([]);
    } else if (type === 'erase') {
      W.ctx.fx.burst(c, 50, new THREE.Color(0xc07bff), 2, 0.05, 0.7, { spread: 0.5 * this.scale, drag: 3 });
      W.scene.remove(this.root);
      this._dispose();
    } else {
      const dir = info.dir ?? _v.set(0, 0, 0);
      W.shatter.emit(c, Math.round(70 * this.scale), info.burn ? 0x2a1a14 : this.color, {
        box: _v2.set(0.45, 1.7, 0.35).multiplyScalar(this.scale), speed: info.speed ?? 3.5, dir, dirAmt: info.dirAmt ?? 3, size: 0.055 * this.scale,
      });
      W.scene.remove(this.root);
      this._dispose();
    }
  }

  _disposeLater() {
    // 조각들이 재질을 복제해 쓰므로 원본 재질만 정리
    this._dispose();
  }

  _dispose() {
    this.mat.dispose();
    this.gun?.material.dispose();
  }

  /** 최근 2초 DPS */
  get dps() {
    const now = this.world.time;
    this.dpsWindow = this.dpsWindow.filter((d) => now - d[0] < 2);
    let s = 0;
    for (const d of this.dpsWindow) s += d[1];
    return s / 2;
  }

  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    this.stateT += dt;
    const W = this.world;
    if (this.flash > 0) {
      this.flash -= dt;
      this.mat.emissive.setRGB(1, 1, 1).multiplyScalar(Math.max(0, this.flash) * 6);
      if (this.flash <= 0) this.mat.emissive.copy(this.baseEmissive);
    }
    if (this.frozen) {
      // 무량공처: 미세한 경련
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.angVel.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.head.rotation.z = (Math.random() - 0.5) * 0.15;
      this.armL.sh.rotation.x = (Math.random() - 0.5) * 0.1;
      this.armR.sh.rotation.x = (Math.random() - 0.5) * 0.1;
      if (this.flash <= 0) this.mat.emissive.setHSL(0.58, 0.8, 0.1 + Math.random() * 0.15);
      if (this.state === 'air') this._integrate(dt, 0.15);
      return;
    }

    if (this.state === 'stand') {
      this._ai(dt);
      // 남은 속도는 미끄러지듯 감쇠
      this.root.position.addScaledVector(this.vel, dt);
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.root.position.y = Math.max(0, this.root.position.y);
    } else if (this.state === 'air') {
      this._integrate(dt, 1);
      if (this.grounded && this.vel.lengthSq() < 0.3 && this.angVel.lengthSq() < 1) {
        if (this.stateT > 0.8) {
          this.state = 'down';
          this.stateT = 0;
        }
      }
    } else if (this.state === 'down') {
      this.vel.set(0, 0, 0);
      if (this.stateT > 1.2) {
        this.state = 'getup';
        this.stateT = 0;
        this._getupFrom = this.root.quaternion.clone();
        this._getupPos = this.root.position.clone();
        // 넘어진 방향의 yaw 유지
        _v.set(0, 0, 1).applyQuaternion(this.root.quaternion).setY(0);
        if (_v.lengthSq() > 1e-3) this.yaw = Math.atan2(_v.x, _v.z);
        this._upright.setFromAxisAngle(UP, this.yaw);
      }
    } else if (this.state === 'getup') {
      const k = Math.min(1, this.stateT / 0.7);
      const e = k * k * (3 - 2 * k);
      this.root.quaternion.slerpQuaternions(this._getupFrom, this._upright, e);
      // 발이 바닥에 오도록 높이 보정
      this.root.position.copy(this._getupPos).lerp(_v.set(this._getupPos.x, 0, this._getupPos.z), e);
      if (k >= 1) {
        this.state = 'stand';
        this.stateT = 0;
      }
    }
    // 아레나 밖으로 너무 멀리 가면 제거
    if (this.root.position.lengthSq() > 250 * 250 || this.root.position.y < -20) this.kill({ type: 'erase' });
  }

  _integrate(dt, gScale) {
    this.vel.y -= 9.8 * dt * gScale;
    if (this.vel.lengthSq() > 30 * 30) this.vel.setLength(30);
    const c = this.center(_v3);
    // 중심 기준 회전
    const ang = this.angVel.length();
    if (ang > 1e-4) {
      _q.setFromAxisAngle(_v.copy(this.angVel).divideScalar(ang), ang * dt);
      this.root.quaternion.premultiply(_q);
      this.root.position.sub(c).applyQuaternion(_q).add(c);
    }
    this.root.position.addScaledVector(this.vel, dt);
    // 바닥: 발과 머리 두 점으로 판정
    this.grounded = false;
    for (const y of [0.05, 1.75, 1.0]) {
      const p = this.root.localToWorld(_v.set(0, y, 0));
      const r = y === 1.0 ? 0.2 * this.scale : 0.1 * this.scale;
      if (p.y < r) {
        this.root.position.y += r - p.y;
        this.grounded = true;
      }
    }
    if (this.grounded) {
      if (this.vel.y < 0) {
        const imp = -this.vel.y;
        if (imp > 9) this.damage((imp - 9) * 4, { type: 'impact' });
        this.vel.y = imp * 0.25;
      }
      this.vel.x *= Math.max(0, 1 - dt * 4);
      this.vel.z *= Math.max(0, 1 - dt * 4);
      this.angVel.multiplyScalar(Math.max(0, 1 - dt * 5));
      // 눕도록 유도: 위쪽 축을 수평으로
      _v.set(0, 1, 0).applyQuaternion(this.root.quaternion);
      if (_v.y > 0.3) this.angVel.add(_v2.crossVectors(_v, UP).normalize().multiplyScalar(-dt * 10));
    }
  }

  _ai(dt) {
    const W = this.world;
    const ctx = W.ctx;
    const head = ctx.input.head;
    const ai = W.settings.dummyAI ? this.def.ai : 'idle';
    const breathe = Math.sin(this.t * 1.6) * 0.02;
    this.spine.rotation.x = breathe;
    this.head.rotation.y = Math.sin(this.t * 0.4) * 0.15;
    // 기본 자세
    const rest = (arm, s) => {
      arm.sh.rotation.x = THREE.MathUtils.lerp(arm.sh.rotation.x, 0, dt * 6);
      arm.sh.rotation.z = THREE.MathUtils.lerp(arm.sh.rotation.z, 0.08 * s, dt * 6);
      arm.el.rotation.x = THREE.MathUtils.lerp(arm.el.rotation.x, -0.15, dt * 6);
    };
    if (ai === 'idle') {
      rest(this.armL, -1);
      rest(this.armR, 1);
      this._legs(0, dt);
      return;
    }
    this.faceTo(head);
    const flat = _v.subVectors(head, this.root.position).setY(0);
    const dist = flat.length();
    if (ai === 'shooter') {
      rest(this.armL, -1);
      this._legs(0, dt);
      this.shootT -= dt;
      const aiming = this.shootT < 0.7;
      // 팔을 들어 조준
      const target = aiming ? -Math.PI / 2 : 0;
      this.armR.sh.rotation.x = THREE.MathUtils.lerp(this.armR.sh.rotation.x, target, dt * 8);
      this.armR.el.rotation.x = THREE.MathUtils.lerp(this.armR.el.rotation.x, 0, dt * 8);
      if (this.shootT <= 0) {
        this.shootT = 2.2 + Math.random() * 1.5;
        const muzzle = this.gun.localToWorld(_v2.set(0, 0, 0.12));
        W.spawnBullet(muzzle, head);
      }
    } else if (ai === 'rusher') {
      const reach = 0.85 * this.scale;
      this.punchCd -= dt;
      if (this.punchT > 0) {
        // 주먹질
        this.punchT -= dt;
        const k = 1 - this.punchT / 0.45;
        const ext = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
        this.armR.sh.rotation.x = -Math.PI / 2 * ext;
        this.armR.el.rotation.x = -0.2 * (1 - ext);
        if (!this._punchHit && k > 0.38) {
          this._punchHit = true;
          const fist = this.armR.hd.getWorldPosition(_v2);
          W.dummyMelee(this, fist, 8);
        }
        this._legs(0, dt);
      } else if (dist > reach) {
        const sp = 1.7 * Math.sqrt(this.scale);
        flat.normalize();
        this.root.position.addScaledVector(flat, sp * dt);
        this._legs(sp, dt);
        rest(this.armL, -1);
        this.armR.sh.rotation.x = Math.sin(this.t * 7) * 0.4;
        this.armL.sh.rotation.x = -Math.sin(this.t * 7) * 0.4;
      } else {
        this._legs(0, dt);
        if (this.punchCd <= 0) {
          this.punchT = 0.45;
          this.punchCd = 1.1;
          this._punchHit = false;
        }
      }
    }
  }

  _legs(speed, dt) {
    const a = speed > 0 ? Math.sin(this.t * 7) * 0.55 : 0;
    const lerp = (o, v) => (o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, v, Math.min(1, dt * 10)));
    lerp(this.legL.hp, a);
    lerp(this.legR.hp, -a);
    lerp(this.legL.kn, speed > 0 ? Math.max(0, -a) * 1.2 + 0.1 : 0);
    lerp(this.legR.kn, speed > 0 ? Math.max(0, a) * 1.2 + 0.1 : 0);
  }
}

void _e;
