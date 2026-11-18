// 십종영법술 식신: 그림자에서 솟아올라 싸우고, 다시 그림자로 가라앉는다
//  옥견(玉犬 白·黒) · 누에(鵺) · 가마(蝦蟇) · 오로치(大蛇) · 만상(満象) · 탈토(脱兎) · 마허라(魔虚羅)
// 모두 코드로 만든 셀 셰이딩 모델 + 먹선 테두리
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Bolts } from '../../core/fx.js';
import { dummyTemplate, DUMMY_TYPES } from '../../core/dummy.js';
import { shadowSplash } from './vfx.js';
import { makeShiki, AX, SHIKI_MODELS, quadGait, tailFollow } from './models.js';
import { getModel } from '../../core/assets.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q2 = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion();
const _pp = new THREE.Vector3();
const _pt = new THREE.Vector3();
const _pu = new THREE.Vector3();
const _px = new THREE.Vector3();
const _ps = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = THREE.MathUtils.lerp;
const damp = (a, b, k, dt) => a + (b - a) * Math.min(1, k * dt);

// ── 재료: 3단 셀 셰이딩 + 먹선 ──
let _grad = null;
function gradient() {
  if (_grad) return _grad;
  const t = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  _grad = t;
  return t;
}
function toon(color, o = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient(), ...o });
}
const _outlines = new Map();
function outlineMat(th) {
  const key = th.toFixed(4);
  if (_outlines.has(key)) return _outlines.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: { value: th } },
    vertexShader: 'uniform float uT; void main(){ vec3 p = position + normal * uT; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'void main(){ gl_FragColor = vec4(0.015, 0.012, 0.02, 1.0); }',
    side: THREE.BackSide,
  });
  m.userData.shared = true;
  _outlines.set(key, m);
  return m;
}
function part(parent, geo, mat, p = [0, 0, 0], r = [0, 0, 0], th = 0.012) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  if (th > 0) m.add(new THREE.Mesh(geo, outlineMat(th)));
  parent.add(m);
  return m;
}
function joint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
const sph = (r, sx = 1, sy = 1, sz = 1, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h).scale(sx, sy, sz);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(0, -h / 2, 0);

/** 대상 위치(바닥) */
const _ca = new THREE.Vector3();
const _cb = new THREE.Vector3();
const _cp = new THREE.Vector3();
/** 점 p 에서 선분 ab 까지의 거리 */
function segDist(p, a, b) {
  const ab = _cp.subVectors(b, a);
  const L2 = ab.lengthSq();
  const t = L2 > 1e-8 ? THREE.MathUtils.clamp(_v4.subVectors(p, a).dot(ab) / L2, 0, 1) : 0;
  return _v4.copy(a).addScaledVector(ab, t).distanceTo(p);
}
const _v4 = new THREE.Vector3();

function groundOf(t, out = new THREE.Vector3()) {
  if (t.root) out.copy(t.root.position);
  else out.copy(t.pos);
  out.y = 0;
  return out;
}

// ───────────────── 공통: 그림자에서 솟고 가라앉기 ─────────────────
class Shiki {
  constructor(owner, { height = 1, riseDur = 0.45, sinkDur = 0.45, poolR = 1 } = {}) {
    this.owner = owner;
    this.ctx = owner.ctx;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // 애니메이션용 (root는 위치·방향)
    this.root.add(this.body);
    this.height = height;
    this.riseDur = riseDur;
    this.sinkDur = sinkDur;
    this.poolR = poolR;
    this.state = 'rise';
    this.t = 0;
    this.alive = true;
    this.yaw = 0;
    this.life = 30;
    // 피격: maxHp 0 이면 맞지 않는다. 몸은 뿌리에서 hitH 높이까지의 캡슐(반지름 hitR)
    this.maxHp = 0;
    this.hp = 0;
    this.hitH = height * 0.8;
    this.hitR = 0.45;
    this.hurtK = 0;
    this.ctx.scene.add(this.root);
  }

  setHp(hp, hitH = this.hitH, hitR = this.hitR) {
    this.maxHp = this.hp = hp;
    this.hitH = hitH;
    this.hitR = hitR;
  }

  get hittable() {
    return this.maxHp > 0 && this.alive && this.state === 'act';
  }

  hitCapsule(a, b) {
    const P = this.root.position;
    const k = this.body.scale.y;
    a.set(P.x, P.y + 0.25 * k, P.z);
    b.set(P.x, P.y + this.hitH * k, P.z);
    return this.hitR * k;
  }

  /** 몸 겉면까지의 거리 */
  hitDist(p) {
    const r = this.hitCapsule(_ca, _cb);
    return segDist(p, _ca, _cb) - r;
  }

  /** 더미가 노리는 점 (몸 가운데 조금 위) */
  aimPoint(out = new THREE.Vector3()) {
    this.hitCapsule(_ca, _cb);
    return out.lerpVectors(_ca, _cb, 0.6);
  }

  /** 더미의 주먹·총탄, 마허라의 칼에 맞는다 */
  hurt(amount, info = {}) {
    if (!this.hittable || amount <= 0) return 0;
    this.hp -= amount;
    this.hurtK = Math.min(1, this.hurtK + 0.6);
    const c = this.aimPoint(_v4);
    this.ctx.fx.burst(c, 10, new THREE.Color(0x15151c), 2.2, 0.045, 0.45);
    this.ctx.sfx.play('punch', { at: c, vol: 0.35, rate: 1.4, jitter: 0.1 });
    if (this.hp <= 0) this.shatter(info);
    return amount;
  }

  /** 파괴: 그림자 조각으로 흩어진다 (십종영법술의 식신은 파괴되면 다시 부를 수 없다) */
  shatter(info = {}) {
    if (!this.alive) return;
    const { fx, sfx } = this.ctx;
    const c = this.aimPoint(new THREE.Vector3());
    fx.burst(c, 46, new THREE.Color(0x0c0c12), 4.5, 0.07, 0.9, { spread: this.hitR });
    fx.burst(c, 16, new THREE.Color(0x6f86ff), 3, 0.03, 0.5);
    shadowSplash(fx, this.root.position.clone().setY(0), this.poolR, 30);
    sfx.play('punch_3', { at: c, vol: 0.8, rate: 0.6 });
    this.broken = true;
    void info;
    this.pool?.close();
    this.destroy();
    this.owner.onShikiBroken?.(this);
  }

  emerge(pos, yaw = 0) {
    this.root.position.set(pos.x, 0, pos.z);
    this.body.position.y = -this.height;
    this.setYaw(yaw, true);
    this.pool = this.owner.pools.open(pos, this.poolR, { grow: 0.18 });
    shadowSplash(this.ctx.fx, pos, this.poolR * 0.8, 24);
    this.ctx.sfx.play('whoosh_2', { at: pos, vol: 0.5, rate: 0.7 });
  }

  setYaw(y, snap = false) {
    let d = y - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw = snap ? y : this.yaw + d * 0.2;
    this.root.quaternion.setFromAxisAngle(UP, this.yaw);
  }

  faceTo(p, snap = false) {
    const dx = p.x - this.root.position.x;
    const dz = p.z - this.root.position.z;
    if (dx * dx + dz * dz > 1e-4) this.setYaw(Math.atan2(dx, dz), snap);
  }

  dismiss() {
    if (this.state === 'sink' || !this.alive) return;
    this.state = 'sink';
    this.t = 0;
    this.pool?.close();
    this.pool = this.owner.pools.open(this.root.position, this.poolR, { grow: 0.12 });
    shadowSplash(this.ctx.fx, this.root.position, this.poolR * 0.7, 16);
    this.onDismiss?.();
  }

  /** false 를 돌려주면 끝난 것 */
  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    this.hurtK = Math.max(0, this.hurtK - dt * 3);
    if (this.state === 'rise') {
      const k = Math.min(1, this.t / this.riseDur);
      this.body.position.y = -this.height * Math.pow(1 - k, 2);
      if (k >= 1) {
        this.state = 'act';
        this.t = 0;
        this.pool?.close();
        this.pool = null;
      }
    } else if (this.state === 'sink') {
      const k = Math.min(1, this.t / this.sinkDur);
      this.body.position.y = -this.height * k * k;
      if (k >= 1) {
        this.pool?.close();
        this.destroy();
        return false;
      }
    } else if (!this.owner.domainActive) {
      this.life -= dt;
      if (this.life <= 0) this.dismiss();
    }
    return true;
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this.ctx.scene.remove(this.root);
    this.onDestroy?.();
    const mats = new Set();
    this.root.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && !o.material.userData.shared) mats.add(o.material);
    });
    for (const m of mats) m.dispose();
  }
}

// ───────────────── 옥견 (玉犬) ─────────────────
const bip = (p) => ({
  LF: { upper: `${p}_L_UpperArm`, lower: `${p}_L_Forearm`, foot: `${p}_L_Hand` },
  RF: { upper: `${p}_R_UpperArm`, lower: `${p}_R_Forearm`, foot: `${p}_R_Hand` },
  LH: { upper: `${p}_L_Thigh`, lower: `${p}_L_Calf`, foot: `${p}_L_HorseLink` },
  RH: { upper: `${p}_R_Thigh`, lower: `${p}_R_Calf`, foot: `${p}_R_HorseLink` },
  spine: [`${p}_Spine`, `${p}_Spine1`],
  neck: `${p}_Neck`,
  head: `${p}_Head`,
});
const DOG_BONES = { ...bip('Bip002'), tail: ['Bone017', 'Bone018', 'Bone019', 'Bone020', 'Bone021'] };
const OX_BONES = { ...bip('Bip001'), tail: ['Bone001', 'Bone002', 'Bone003', 'Bone004'] };
const ELE_BONES = { ...bip('Bip001'), LH: { upper: 'Bip001_L_Thigh', lower: 'Bip001_L_Calf', foot: 'Bip001_L_Foot' }, RH: { upper: 'Bip001_R_Thigh', lower: 'Bip001_R_Calf', foot: 'Bip001_R_Foot' }, spine: ['Bip001_Spine', 'Bip001_Spine1'], tail: ['Bone002', 'Bone003', 'Bone004', 'Bone005'] };
export class DivineDog extends Shiki {
  constructor(owner, white, slot) {
    super(owner, { height: 1.6, riseDur: 0.4, poolR: 0.9 });
    this.white = white;
    this.slot = slot; // 대상 양옆에서 문다 (-1 / 1)
    this.name = white ? '옥견 白' : '옥견 黒';
    this.setHp(110, 1.15, 0.42);
    const fur = toon(white ? 0xf1f0ec : 0x1c1b22);
    const mark = toon(white ? 0x15141a : 0xe8e6e0);
    const dark = toon(0x0b0a0e);
    const B = this.body;
    this.M = makeShiki(white ? 'dogWhite' : 'dogBlack', 1.55);
    if (this.M) B.add(this.M.root);
    if (!this.M) {
      // 몸통
      part(B, new THREE.CapsuleGeometry(0.23, 0.72, 6, 12).rotateX(Math.PI / 2), fur, [0, 0.86, -0.05]);
      part(B, sph(0.3, 1, 1.12, 1.05), fur, [0, 0.9, 0.34]);
      part(B, cyl(0.15, 0.21, 0.42).rotateX(-0.75), fur, [0, 1.17, 0.5]);
      // 머리
      const head = joint(B, 0, 1.22, 0.68);
      part(head, sph(0.19, 1, 0.9, 1.15), fur, [0, 0, 0]);
      part(head, cyl(0.075, 0.115, 0.3).rotateX(-Math.PI / 2), fur, [0, -0.04, 0.12]);
      part(head, sph(0.05), dark, [0, -0.02, 0.43], [0, 0, 0], 0.006);
      for (const s of [-1, 1]) {
        part(head, new THREE.ConeGeometry(0.075, 0.22, 4), fur, [0.1 * s, 0.2, -0.05], [-0.25, 0, -0.25 * s]);
        part(head, sph(0.028), dark, [0.1 * s, 0.05, 0.15], [0, 0, 0], 0);
        // 눈두덩 위 문양
        part(head, new THREE.BoxGeometry(0.1, 0.02, 0.04), mark, [0.08 * s, 0.11, 0.12], [0, 0, 0.35 * s], 0);
      }
      // 이마의 둥근 문양 (玉)
      part(head, new THREE.TorusGeometry(0.05, 0.012, 6, 16), mark, [0, 0.13, 0.08], [-0.9, 0, 0], 0);
      const jaw = joint(head, 0, -0.1, 0.06);
      part(jaw, new THREE.BoxGeometry(0.13, 0.05, 0.3).translate(0, 0, 0.12), fur, [0, 0, 0]);
      // 다리 (어깨 → 무릎 → 발)
      this.legs = [];
      for (const [x, z, front] of [[-0.16, 0.36, 1], [0.16, 0.36, 1], [-0.15, -0.42, 0], [0.15, -0.42, 0]]) {
        const hip = joint(B, x, 0.86, z);
        part(hip, cyl(0.085, 0.065, 0.42), fur, [0, 0, 0]);
        const knee = joint(hip, 0, -0.42, 0);
        part(knee, cyl(0.06, 0.05, 0.36), fur, [0, 0, 0]);
        part(knee, sph(0.07, 1, 0.7, 1.3), white ? fur : dark, [0, -0.37, 0.03]);
        this.legs.push({ hip, knee, front });
      }
      // 꼬리
      this.tail = joint(B, 0, 1.0, -0.6);
      part(this.tail, new THREE.ConeGeometry(0.07, 0.5, 8).translate(0, 0.25, 0), fur, [0, 0, 0], [-2.1, 0, 0]);
      this.head = head;
      this.jaw = jaw;
      B.scale.setScalar(0.88);
    }
    this.phase = Math.random() * 6;
    this.speed = 0;
    this.target = null;
    this.retarget = 0;
    this.biteT = 0;
    this.biteCd = 0.2;
    this.bites = 0;
  }

  update(dt) {
    if (!super.update(dt)) return false;
    const { input: inp, world, fx, sfx } = this.ctx;
    const P = this.root.position;
    let moveSpeed = 0;
    if (this.state === 'act') {
      this.retarget -= dt;
      if (!this.target || !this.target.alive || this.target.heldBy || this.retarget <= 0) {
        this.target = this.owner.pickTarget(P, 20);
        this.retarget = 1.2;
      }
      const t = this.target;
      if (t) {
        const tp = groundOf(t, _v);
        // 대상의 양옆 (플레이어에서 본 좌우)
        const ax = tp.x - inp.head.x;
        const az = tp.z - inp.head.z;
        const al = Math.hypot(ax, az) || 1;
        const ring = 0.75 * (t.scale ?? 1);
        const want = _v2.set(tp.x + (-az / al) * ring * this.slot, 0, tp.z + (ax / al) * ring * this.slot);
        const to = _v3.subVectors(want, P).setY(0);
        const dist = to.length();
        const flying = t.state === 'air' || t.state === 'held';
        if (this.biteT > 0) {
          this.biteT -= dt;
          const k = 1 - this.biteT / 0.28;
          const lunge = Math.sin(Math.min(1, k) * Math.PI);
          this.lunge = lunge;
          this.jawK = k < 0.5 ? k * 1.4 : (1 - k) * 1.4;
          if (!this.M) {
            this.head.position.z = 0.68 + lunge * 0.25;
            this.head.rotation.x = lunge * 0.35;
            this.jaw.rotation.x = this.jawK;
          }
          if (!this._hit && k > 0.5) {
            this._hit = true;
            this._bite(t);
          }
          this.faceTo(tp);
        } else if (dist > 0.22) {
          moveSpeed = Math.min(7.5, 2 + dist * 3);
          P.addScaledVector(to.normalize(), Math.min(dist, moveSpeed * dt));
          this.faceTo(flying ? tp : _v2.copy(P).add(to));
        } else {
          this.faceTo(tp);
          this.biteCd -= dt;
          if (this.biteCd <= 0 && !flying) {
            this.biteT = 0.28;
            this.biteCd = 0.5 + Math.random() * 0.2;
            this._hit = false;
          }
        }
      } else {
        // 플레이어 옆으로 돌아와 앉는다
        const fwd = _v2.copy(inp.headDir).setY(0);
        if (fwd.lengthSq() < 1e-3) fwd.set(0, 0, -1);
        fwd.normalize();
        const want = _v3.set(inp.head.x + fwd.x * 0.7 - fwd.z * 1.0 * this.slot, 0, inp.head.z + fwd.z * 0.7 + fwd.x * 1.0 * this.slot);
        const to = want.sub(P).setY(0);
        const dist = to.length();
        if (dist > 0.3) {
          moveSpeed = Math.min(6, 1.5 + dist * 2.5);
          P.addScaledVector(to.normalize(), Math.min(dist, moveSpeed * dt));
          this.faceTo(_v.copy(P).add(to));
        } else this.faceTo(_v.copy(P).add(fwd));
      }
      // 플레이어 몸을 뚫고 지나가지 않게
      const hx = P.x - inp.head.x;
      const hz = P.z - inp.head.z;
      const hd = Math.hypot(hx, hz);
      if (hd < 0.7 && hd > 1e-3) P.set(inp.head.x + (hx / hd) * 0.7, P.y, inp.head.z + (hz / hd) * 0.7);
    }
    this.speed = damp(this.speed, moveSpeed, 10, dt);
    this._animate(dt);
    void world;
    void fx;
    void sfx;
    return true;
  }

  _bite(t) {
    const { fx, sfx, input: inp } = this.ctx;
    if (!t.alive) return;
    this.bites++;
    const c = t.center(new THREE.Vector3());
    const dir = _v.subVectors(c, inp.head).setY(0).normalize();
    const big = this.bites % 4 === 0;
    t.damage(big ? 28 : 13, { type: 'punch', dir, color: this.white ? '#ffffff' : '#b0b0c0' });
    t.impulse?.(dir.multiplyScalar(big ? 3 : 0.6).add(_v2.set(0, big ? 4 : 0.3, 0)), big ? 5 : 0);
    fx.burst(c, big ? 20 : 8, new THREE.Color(0xff2a30), 2, 0.03, 0.3);
    sfx.play('punch_3', { at: c, vol: 0.5, rate: 1.3, jitter: 0.15 });
    if (Math.random() < 0.35) sfx.tone({ type: 'sawtooth', f0: 180, f1: 90, dur: 0.18, vol: 0.12, at: c });
  }

  _animateModel(dt) {
    const R = this.M.rig;
    R.begin();
    const sp = this.speed;
    if (this.biteT <= 0) {
      this.lunge = damp(this.lunge ?? 0, 0, 8, dt);
      this.jawK = damp(this.jawK ?? 0, 0, 8, dt);
    }
    this.gait ??= {};
    const N = DOG_BONES;
    const out = quadGait(R, N, this.gait, dt, { speed: sp, stride: 1.0, trotAt: 1.8, gallopAt: 4.6, strideMax: 0.85 });
    // 방향 전환 시 몸을 안쪽으로 기울인다
    const yawRate = this._prevYaw === undefined ? 0 : Math.atan2(Math.sin(this.yaw - this._prevYaw), Math.cos(this.yaw - this._prevYaw)) / Math.max(dt, 1e-3);
    this._prevYaw = this.yaw;
    this.roll = damp(this.roll ?? 0, THREE.MathUtils.clamp(-yawRate * sp * 0.02, -0.25, 0.25), 6, dt);
    this.body.rotation.z = this.roll;
    this.body.rotation.x = -out.pitch;
    if (this.state === 'act') this.body.position.y = out.bob * 0.8;
    // 숨: 가슴이 오르내리고, 뛸 땐 헐떡이며 입을 벌린다
    this.breath = (this.breath ?? 0) + dt * (sp > 3 ? 9 : 2.2);
    R.rot('Bip002_Spine1', AX.X, Math.sin(this.breath) * 0.015);
    const pant = sp > 3 || this.biteCd > 0.3 ? 0.18 + Math.sin(this.breath) * 0.08 : 0.03;
    // 대상을 향해 고개를 돌린다 (몸 기준 각도, 제한)
    let look = 0;
    if (this.target?.alive) {
      const tp = this.target.center(_v);
      const want = Math.atan2(tp.x - this.root.position.x, tp.z - this.root.position.z);
      look = THREE.MathUtils.clamp(Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)), -0.7, 0.7);
    }
    this.look = damp(this.look ?? 0, look, 6, dt);
    R.rot('Bip002_Neck', AX.Y, this.look * 0.6);
    R.rot('Bip002_Head', AX.Y, this.look * 0.4);
    // 물기: 앞다리를 버티며 머리를 낮게 내밀고 턱을 크게 벌렸다가 닫는다
    const L = this.lunge;
    R.rot('Bip002_Neck', AX.X, L * 0.35);
    R.rot('Bip002_Head', AX.X, -L * 0.2 - sp * 0.02);
    R.rot('Bone015', AX.X, Math.max(pant, this.jawK) * 0.8);
    if (L > 0.05) {
      for (const sd of ['L', 'R']) {
        R.rot(`Bip002_${sd}_UpperArm`, AX.X, -L * 0.35);
        R.rot(`Bip002_${sd}_Thigh`, AX.X, L * 0.25);
      }
      this.body.rotation.x += L * 0.12;
    }
    this.M.root.position.z = L * 0.35;
    // 꼬리: 뛰면 뒤로 뻗고, 서 있으면 흔든다
    tailFollow(R, N.tail, this.gait, dt, { wag: sp < 1 ? 0.35 : 0.08, lift: Math.min(1, sp / 6), sway: -this.roll * 2 + out.flex });
  }

  _animate(dt) {
    if (this.M) return this._animateModel(dt);
    const sp = this.speed;
    const run = Math.min(1, sp / 5);
    this.phase += dt * (4 + sp * 1.6);
    const ph = this.phase;
    for (const L of this.legs) {
      const off = L.front ? 0 : Math.PI * 0.9;
      const side = L.hip.position.x > 0 ? 0.25 : 0;
      const s = Math.sin(ph + off + side);
      L.hip.rotation.x = s * 0.75 * run;
      L.knee.rotation.x = (L.front ? -1 : 1) * Math.max(0, -s) * 0.9 * run + (L.front ? -0.05 : 0.15);
    }
    this.body.position.y = this.state === 'act' ? Math.abs(Math.sin(ph)) * 0.06 * run : this.body.position.y;
    this.body.rotation.x = Math.sin(ph * 2) * 0.04 * run;
    this.tail.rotation.z = Math.sin(this.t * (run > 0.2 ? 6 : 10)) * 0.4;
    if (this.biteT <= 0) {
      this.head.position.z = damp(this.head.position.z, 0.68, 8, dt);
      this.head.rotation.x = damp(this.head.rotation.x, run * 0.15, 8, dt);
      this.jaw.rotation.x = damp(this.jaw.rotation.x, run * 0.3, 8, dt);
    }
  }
}

// ───────────────── 옥견・혼 (玉犬・渾) ─────────────────
// 파괴된 옥견의 힘을 남은 옥견이 이어받아 섞인 모습. 두 발로 서는 거대한 늑대 — 발톱 연속 베기와 덮치기
export class DogTotality extends Shiki {
  constructor(owner) {
    super(owner, { height: 2.7, riseDur: 0.5, poolR: 1.4 });
    this.name = '옥견 혼';
    this.setHp(260, 2.2, 0.6);
    this.M = makeShiki('dogTotality', 2.7, { outline: 0.016 });
    if (this.M) this.body.add(this.M.root);
    else {
      // 대체 몸: 검은 늑대 실루엣
      const fur = toon(0x1a1a22);
      const B = this.body;
      part(B, new THREE.CapsuleGeometry(0.4, 0.9, 6, 12), fur, [0, 1.5, 0], [0.5, 0, 0], 0.02);
      part(B, sph(0.3, 1, 0.9, 1.3), fur, [0, 2.2, 0.45], [0, 0, 0], 0.02);
      for (const sd of [-1, 1]) part(B, cyl(0.13, 0.09, 1.1), fur, [0.45 * sd, 1.3, 0.35], [0.4, 0, 0], 0.015);
      for (const sd of [-1, 1]) part(B, cyl(0.16, 0.1, 1.0), fur, [0.22 * sd, 0.55, -0.1], [0, 0, 0], 0.015);
    }
    this.speed = 0;
    this.phase = 0;
    this.target = null;
    this.retarget = 0;
    this.atk = null; // { kind, t, dur, hit }
    this.atkCd = 0.3;
    this.combo = 0;
    this.leapCd = 0.5;
    this.G = { lean: 0, bob: 0, twist: 0, lunge: 0, crouch: 0 };
    this.life = 22;
  }

  update(dt) {
    if (!super.update(dt)) return false;
    const { input: inp } = this.ctx;
    const P = this.root.position;
    let move = 0;
    if (this.state === 'act') {
      this.retarget -= dt;
      this.atkCd -= dt;
      this.leapCd -= dt;
      if (!this.atk && (!this.target || !this.target.alive || this.target.heldBy || this.retarget <= 0)) {
        this.target = this.owner.pickTarget(P, 24);
        this.retarget = 1.5;
      }
      const t = this.target;
      if (this.atk) this._attack(dt);
      else if (t) {
        const tp = groundOf(t, _v);
        const to = _v2.subVectors(tp, P).setY(0);
        const d = to.length();
        const reach = 1.25 + 0.35 * (t.scale ?? 1);
        this.faceTo(tp);
        if (d > 3.2 && d < 9 && this.leapCd <= 0) this._start('leap', t);
        else if (d > reach) {
          move = Math.min(8.5, 2 + (d - reach) * 2.2);
          P.addScaledVector(to.normalize(), Math.min(d - reach, move * dt));
        } else if (this.atkCd <= 0) {
          const seq = ['R', 'L', 'R', 'L', 'leap'];
          this._start(seq[this.combo++ % seq.length], t);
        }
      } else {
        // 술사 곁으로 돌아와 몸을 낮추고 기다린다
        const fwd = _v2.copy(inp.headDir).setY(0);
        if (fwd.lengthSq() < 1e-3) fwd.set(0, 0, -1);
        fwd.normalize();
        const want = _v3.set(inp.head.x + fwd.x * 1.2 + fwd.z * 1.4, 0, inp.head.z + fwd.z * 1.2 - fwd.x * 1.4);
        const to = want.sub(P).setY(0);
        const d = to.length();
        if (d > 0.4) {
          move = Math.min(6, 1.2 + d * 2);
          P.addScaledVector(to.normalize(), Math.min(d, move * dt));
          this.faceTo(_v.copy(P).add(to));
        } else this.faceTo(_v.copy(P).add(fwd));
      }
      const hx = P.x - inp.head.x;
      const hz = P.z - inp.head.z;
      const hd = Math.hypot(hx, hz);
      if (hd < 0.9 && hd > 1e-3 && !this.atk) P.set(inp.head.x + (hx / hd) * 0.9, P.y, inp.head.z + (hz / hd) * 0.9);
    }
    this.speed = damp(this.speed, move, 8, dt);
    if (this.M) this._animateModel(dt);
    return true;
  }

  _start(kind, t) {
    const dur = kind === 'leap' ? 1.15 : 0.5;
    this.atk = { kind, t: 0, dur, hit: false, target: t, from: this.root.position.clone(), to: groundOf(t, new THREE.Vector3()) };
    if (kind === 'leap') {
      // 대상 바로 앞에 떨어지도록
      const back = _v.subVectors(this.atk.from, this.atk.to).setY(0);
      const L = back.length();
      if (L > 1e-3) this.atk.to.addScaledVector(back.normalize(), Math.min(L, 1.1));
      this.leapCd = 4;
      this.ctx.sfx.play('whoosh_3', { at: this.root.position, vol: 0.6, rate: 0.8 });
    } else this.ctx.sfx.play('whoosh', { at: this.root.position, vol: 0.5, rate: 1.2, jitter: 0.1 });
  }

  _attack(dt) {
    const A = this.atk;
    A.t += dt;
    const k = A.t / A.dur;
    const P = this.root.position;
    if (A.kind === 'leap') {
      // 웅크림(0~0.25) → 도약(0.25~0.72) → 내려찍기(0.72) → 회복
      const air = THREE.MathUtils.clamp((k - 0.25) / 0.47, 0, 1);
      if (k > 0.25 && k < 0.72) {
        P.lerpVectors(A.from, A.to, air);
        P.y = Math.sin(air * Math.PI) * (1.2 + A.from.distanceTo(A.to) * 0.15);
      } else if (k >= 0.72) P.set(A.to.x, 0, A.to.z);
      this.faceTo(A.to);
      if (!A.hit && k >= 0.72) {
        A.hit = true;
        this._slam();
      }
    } else {
      if (A.target?.alive) this.faceTo(groundOf(A.target, _v));
      if (!A.hit && k > 0.46) {
        A.hit = true;
        this._claw(A.kind === 'R' ? 1 : -1);
      }
    }
    if (k >= 1) {
      this.atk = null;
      this.atkCd = A.kind === 'leap' ? 0.5 : 0.12;
      P.y = 0;
    }
  }

  /** 발톱: 대각선으로 세 줄 할퀸다 */
  _claw(side) {
    const { world, fx, sfx } = this.ctx;
    const P = this.root.position;
    const fwd = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = _v2.set(-fwd.z, 0, fwd.x);
    // 오른손은 오른쪽 위 → 왼쪽 아래, 왼손은 반대
    const along = new THREE.Vector3().copy(right).multiplyScalar(-side).add(_v3.set(0, -0.8, 0)).normalize();
    const n = new THREE.Vector3().crossVectors(along, fwd).normalize();
    let any = false;
    for (const t of world.targets()) {
      if (t.heldBy) continue;
      const c = t.center(new THREE.Vector3());
      const rel = _v3.subVectors(c, P).setY(0);
      const a = rel.dot(fwd);
      if (a < -0.2 || a > 2.4 || Math.abs(rel.dot(right)) > 1.5) continue;
      any = true;
      t.damage(34, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, c), push: fwd.clone().multiplyScalar(1.5), color: '#c8c8ff' });
      t.impulse?.(fwd.clone().multiplyScalar(2.5).add(_v4.set(0, 1.2, 0)), 3);
      const slashes = this.owner.slashes;
      if (slashes) for (let i = -1; i <= 1; i++) slashes.add(_v4.copy(c).addScaledVector(n, i * 0.13), along, n, 1.1, 0.02, 0.22);
      fx.burst(c, 12, new THREE.Color(0xff2a30), 2.5, 0.03, 0.3, { dir: along, dirAmt: 1 });
    }
    if (any) sfx.slash(P, 1.1);
  }

  /** 덮쳐 내려찍기: 주위를 짓누르는 충격 */
  _slam() {
    const { world, fx, sfx, input: inp } = this.ctx;
    const P = this.root.position;
    const fwd = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const c = _v2.copy(P).addScaledVector(fwd, 0.9).setY(0);
    world.forEachTarget(_v3.copy(c).setY(0.8), 2.0, (t, d) => {
      const k = Math.max(0.3, 1 - d / 2.4);
      t.damage(75 * k, { type: 'impact', dir: fwd.clone(), color: '#c8c8ff' });
      t.impulse?.(_v4.subVectors(t.center(new THREE.Vector3()), c).setY(0).normalize().multiplyScalar(4 * k).add(new THREE.Vector3(0, 4 * k, 0)), 5);
    });
    fx.shockwave(_v3.copy(c).setY(0.05), 0x22222a, 3.2, 0.45, { dark: true, opacity: 0.6 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      fx.fire.smoke(_v3.set(c.x + Math.cos(a) * 0.5, 0.2, c.z + Math.sin(a) * 0.5), _v4.set(Math.cos(a) * 4, 0.4, Math.sin(a) * 4), { size0: 0.3, size1: 1.1, life: 1.2, shade: 0.55, lit: 0, opacity: 0.4, drag: 2.5, rise: 0.3 });
    }
    sfx.explosion(c, 0.5);
    sfx.rumble(0.4, 0.35);
    inp.left.pulse?.(0.5, 60);
    inp.right.pulse?.(0.5, 60);
  }

  /**
   * 두 발 짐승의 몸놀림: 웅크린 자세로 상체를 숙이고, 빨라질수록 보폭·무릎 접기·앞기울기가 커지며 공중에 뜨는 순간이 생긴다.
   * 팔(앞발)은 다리와 엇갈려 크게 흔들고, 꼬리는 몸을 늦게 따라온다
   */
  _animateModel(dt) {
    const R = this.M.rig;
    R.begin();
    const G = this.G;
    const sp = this.speed;
    const moving = sp > 0.15;
    const run = Math.min(1, sp / 7);
    const stride = 1.6 + run * 1.6;
    this.phase = (this.phase + (dt * sp) / stride) % 1;
    const duty = lerp(0.6, 0.36, run);
    const A = moving ? lerp(0.32, 0.7, run) : 0;
    const leg = (p) => {
      if (p < duty) {
        const s = p / duty;
        return { hp: A * (1 - 2 * s), kn: Math.sin(s * Math.PI) * 0.2, an: lerp(-0.1, 0.4, s) };
      }
      const s = (p - duty) / (1 - duty);
      const e = s * s * (3 - 2 * s);
      return { hp: -A + 2 * A * e, kn: Math.sin(s * Math.PI) * lerp(0.9, 1.7, run), an: lerp(0.4, -0.2, e) };
    };
    const lL = leg(this.phase);
    const lR = leg((this.phase + 0.5) % 1);
    const ph = this.phase * Math.PI * 2;
    // 기본 자세 (+ 공격 동작)
    let lean = moving ? lerp(0.25, 0.6, run) : 0.18;
    let twist = 0;
    let crouch = 0;
    let lunge = 0;
    let armR = { x: moving ? lL.hp * -1.0 : -0.25, z: 0, el: moving ? -0.4 - run * 0.5 : -0.5 };
    let armL = { x: moving ? lR.hp * -1.0 : -0.25, z: 0, el: armR.el };
    const at = this.atk;
    if (at) {
      const k = at.t / at.dur;
      const sm = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
      if (at.kind === 'leap') {
        crouch = sm(0, 0.22, k) * (1 - sm(0.22, 0.3, k)) + sm(0.7, 0.76, k) * (1 - sm(0.8, 1, k)) * 0.8;
        const air = sm(0.25, 0.35, k) * (1 - sm(0.68, 0.74, k));
        const slam = sm(0.68, 0.74, k) * (1 - sm(0.85, 1, k));
        lean = lerp(lean, 0.55, crouch) - air * 0.25 + slam * 0.5;
        for (const a of [armR, armL]) {
          a.x = lerp(a.x, 0.5, crouch) * (1 - air - slam) + air * -2.7 + slam * -0.5;
          a.el = lerp(a.el, -0.3, air);
        }
        // 공중에서 다리를 접어 올린다
        lL.kn = lerp(lL.kn, 1.4, air);
        lR.kn = lerp(lR.kn, 1.4, air);
        lL.hp = lerp(lL.hp, 0.5, air);
        lR.hp = lerp(lR.hp, 0.3, air);
      } else {
        const sd = at.kind === 'R' ? 1 : -1;
        const wind = sm(0, 0.4, k) * (1 - sm(0.4, 0.5, k));
        const strike = sm(0.4, 0.52, k) * (1 - sm(0.7, 1, k));
        const a = sd > 0 ? armR : armL;
        const o = sd > 0 ? armL : armR;
        // 들어 올려 뒤로 젖혔다가 → 몸 앞을 가로질러 내리긋는다
        a.x = -2.3 * wind - 0.5 * strike;
        a.z = -0.55 * wind + 0.45 * strike;
        a.el = -0.9 * wind - 0.1 * strike;
        o.x = -0.6 * wind + 0.3 * strike;
        o.el = -0.8;
        twist = (-0.45 * wind + 0.6 * strike) * sd;
        lean += -0.1 * wind + 0.35 * strike;
        lunge = 0.5 * strike;
      }
    }
    G.lean = damp(G.lean, lean, 12, dt);
    G.twist = damp(G.twist, twist, 18, dt);
    G.crouch = damp(G.crouch, crouch, 16, dt);
    G.lunge = damp(G.lunge, lunge, 14, dt);
    const bob = moving ? -Math.cos(ph * 2) * lerp(0.04, 0.1, run) : Math.sin(this.t * 2) * 0.01;
    G.bob = damp(G.bob, bob - G.crouch * 0.35, 16, dt);
    if (!at || at.kind !== 'leap' || this.root.position.y <= 0.01) this.body.position.y = this.state === 'act' ? G.bob : this.body.position.y;
    this.body.position.z = G.lunge;
    // 다리
    for (const [sd, l] of [['L', lL], ['R', lR]]) {
      R.rot(sd + '_leg', AX.X, -(l.hp + G.crouch * 0.7));
      R.rot(sd + '_knee', AX.X, l.kn + G.crouch * 1.1);
      R.rot(sd + '_ankle', AX.X, l.an * (moving ? 1 : 0) - G.crouch * 0.4);
    }
    R.rot('hip', AX.Y, moving ? Math.sin(ph + Math.PI / 2) * 0.12 : 0);
    // 몸통: 숙이고, 공격 땐 비튼다
    R.rot('waist', AX.X, G.lean * 0.3);
    R.rot('spine', AX.X, G.lean * 0.35);
    R.rot('chest', AX.X, G.lean * 0.35 + Math.sin(this.t * (moving ? 6 : 1.8)) * 0.02 - this.hurtK * 0.3);
    R.rot('spine', AX.Y, G.twist * 0.5 - (moving ? Math.sin(ph + Math.PI / 2) * 0.1 : 0));
    R.rot('chest', AX.Y, G.twist * 0.5);
    // 머리는 앞을 향해 들어 올린다 (상체를 숙여도 시선은 대상에게)
    R.rot('neck', AX.X, -G.lean * 0.55);
    R.rot('head', AX.X, -G.lean * 0.3 + (moving ? Math.cos(ph * 2) * 0.04 : 0));
    R.rot('jaw', AX.X, at || run > 0.6 ? 0.35 : 0.06 + Math.max(0, Math.sin(this.t * 3)) * 0.04);
    // 팔 (바인드가 A자 자세 → 내린 뒤 앞뒤로)
    R.rot('L_arm', AX.Z, -0.6 + armL.z);
    R.rot('L_arm', AX.X, armL.x);
    R.rot('R_arm', AX.Z, 0.6 - armR.z);
    R.rot('R_arm', AX.X, armR.x);
    R.rot('L_elbow', AX.X, armL.el);
    R.rot('R_elbow', AX.X, armR.el);
    // 발톱을 세운다
    for (const sd of ['L', 'R']) for (const f of ['indexfinger', 'middlefinger', 'ringfinger']) R.rot(`${sd}_${f}_A`, AX.X, at ? -0.2 : 0.35);
    // 귀 · 꼬리
    R.rot('L_ear', AX.X, Math.sin(this.t * 0.7) * 0.08 - run * 0.3);
    R.rot('R_ear', AX.X, Math.sin(this.t * 0.9 + 1) * 0.08 - run * 0.3);
    this.tailT = (this.tailT ?? 0) + dt;
    ['tail_A', 'tail_B', 'tail_C', 'tail_D', 'tail_E', 'tail_F'].forEach((b, i) => {
      R.rot(b, AX.Y, Math.sin(this.tailT * (moving ? 7 : 2) - i * 0.6) * (0.06 + i * 0.02) - G.twist * 0.25);
      // 꼬리는 바인드에서 뒤로 곧게 뻗어 있다 → 아래로 늘어뜨려 휘게 하고, 달리면 뒤로 흩날린다
      R.rot(b, AX.X, (i ? -0.13 : -0.62) * (1 - run * 0.6) + Math.sin(this.tailT * 2.2 - i * 0.7) * 0.03);
    });
  }
}

// ───────────────── 누에 (鵺) ─────────────────
export class Nue extends Shiki {
  constructor(owner) {
    super(owner, { height: 2.4, riseDur: 0.55, poolR: 1.1 });
    this.name = '누에';
    this.setHp(70, 0, 0.65);
    const feather = toon(0x17151f);
    const sheen = toon(0x2c2840);
    const mask = toon(0xefe9dd);
    const dark = toon(0x080709);
    const B = this.body;
    const core = joint(B, 0, 0, 0);
    this.core = core;
    this.wings = [];
    this.M = makeShiki('nue', 0.62, { outline: 0.01 });
    if (this.M) {
      core.add(this.M.root);
      this.M.root.position.y = -0.55;
    }
    if (!this.M) {
      part(core, sph(0.3, 1, 0.85, 1.45), feather, [0, 0, 0]);
      part(core, sph(0.22, 1.05, 1.0, 1.0), feather, [0, 0.16, 0.38]);
      // 가면 (눈구멍 · 이마의 문양)
      part(core, sph(0.2, 1.1, 1.15, 0.45), mask, [0, 0.17, 0.52], [0, 0, 0], 0.01);
      for (const s of [-1, 1]) part(core, sph(0.045, 1.3, 0.8, 0.4), dark, [0.08 * s, 0.2, 0.6], [0, 0, 0.3 * s], 0);
      part(core, new THREE.ConeGeometry(0.05, 0.16, 6).rotateX(Math.PI / 2), mask, [0, 0.06, 0.66], [0, 0, 0], 0.006);
      // 날개 (어깨 → 팔꿈치 → 칼깃)
      for (const s of [-1, 1]) {
        const sh = joint(core, 0.24 * s, 0.1, 0.12);
        part(sh, new THREE.BoxGeometry(0.85, 0.05, 0.48).translate(0.42 * s, 0, -0.05), feather, [0, 0, 0]);
        const el = joint(sh, 0.84 * s, 0, 0);
        part(el, new THREE.BoxGeometry(0.55, 0.04, 0.42).translate(0.27 * s, 0, -0.1), sheen, [0, 0, 0]);
        for (let i = 0; i < 5; i++) {
          const len = 0.55 + i * 0.07;
          part(el, new THREE.BoxGeometry(len, 0.025, 0.11).translate((len / 2) * s, 0, 0), feather, [0.45 * s, 0, 0.08 - i * 0.12], [0, (0.15 + i * 0.13) * s, 0], 0.008);
        }
        this.wings.push({ sh, el, s });
      }
      // 꽁지깃
      for (let i = -1; i <= 1; i++) part(core, new THREE.BoxGeometry(0.12, 0.03, 0.6).translate(0, 0, -0.3), feather, [i * 0.1, 0, -0.38], [0.1, i * 0.25, 0], 0.008);
      // 다리와 발톱
      for (const s of [-1, 1]) {
        const leg = joint(core, 0.1 * s, -0.2, 0.05);
        part(leg, cyl(0.035, 0.025, 0.28), dark, [0, 0, 0], [0, 0, 0], 0.006);
        for (const a of [-0.5, 0, 0.5]) part(leg, new THREE.ConeGeometry(0.018, 0.12, 5), mask, [0, -0.3, 0.02], [1.7, a, 0], 0);
      }
    }
    core.scale.setScalar(1.25);
    this.bolts = new Bolts(this.ctx.scene, { count: 8, segs: 9, color: 0xcfe2ff, width: 0.014 });
    this.bolts.hide();
    this.boltT = 0;
    this.mode = 'hover';
    this.modeT = 0;
    this.diveCd = 0.4;
    this.vel = new THREE.Vector3();
    this.target = null;
    this.flap = 0;
    this.orbit = Math.random() * Math.PI * 2;
    this.pos = new THREE.Vector3();
  }

  emerge(pos, yaw) {
    super.emerge(pos, yaw);
    this.pos.copy(pos).setY(0);
  }

  hitCapsule(a, b) {
    a.copy(this.root.position);
    b.copy(this.root.position);
    return this.hitR;
  }

  update(dt) {
    const { input: inp, world } = this.ctx;
    if (this.state === 'rise') {
      // 그림자에서 날개를 펴며 솟구친다
      this.t += dt;
      const k = Math.min(1, this.t / this.riseDur);
      this.root.position.y = lerp(-1.2, inp.head.y + 0.9, 1 - Math.pow(1 - k, 2));
      this.body.position.y = 0;
      if (k >= 1) {
        this.state = 'act';
        this.t = 0;
        this.pool?.close();
        this.pool = null;
        this.pos.copy(this.root.position);
      }
      this._animate(dt, 1);
      return true;
    }
    if (this.state === 'sink') {
      // 그림자 속으로 곤두박질
      this.t += dt;
      const k = Math.min(1, this.t / this.sinkDur);
      this.root.position.y = lerp(this.pos.y, -1.5, k * k);
      this._animate(dt, 0.3);
      if (k >= 1) {
        this.pool?.close();
        this.destroy();
        return false;
      }
      return true;
    }
    if (!this.owner.domainActive) {
      this.life -= dt;
      if (this.life <= 0) {
        this.pos.copy(this.root.position);
        this.dismiss();
        return true;
      }
    }
    this.t += dt;
    this.modeT += dt;
    const P = this.pos;
    if (this.mode === 'hover') {
      // 플레이어 머리 위를 맴돈다
      this.orbit += dt * 0.9;
      const want = _v.set(inp.head.x + Math.cos(this.orbit) * 2.2, inp.head.y + 1.4 + Math.sin(this.t * 1.7) * 0.2, inp.head.z + Math.sin(this.orbit) * 2.2);
      this.vel.lerp(_v2.subVectors(want, P).multiplyScalar(2.2), Math.min(1, dt * 3));
      this.diveCd -= dt;
      if (this.diveCd <= 0) {
        this.target = this.owner.pickTarget(P, 22);
        if (this.target) {
          this.mode = 'dive';
          this.modeT = 0;
          this.ctx.sfx.play('whoosh_3', { at: P, vol: 0.6, rate: 0.9 });
        } else this.diveCd = 0.5;
      }
    } else if (this.mode === 'dive') {
      const t = this.target;
      if (!t || !t.alive || this.modeT > 2.5) {
        this.mode = 'climb';
        this.modeT = 0;
      } else {
        const c = t.center(_v);
        const to = _v2.subVectors(c, P);
        const d = to.length();
        this.vel.lerp(to.normalize().multiplyScalar(15), Math.min(1, dt * 6));
        // 내리꽂는 동안 몸에 전기가 휘감긴다
        this.boltT -= dt;
        if (this.boltT <= 0) {
          this.boltT = 0.05;
          this.bolts.regen(P, 0.45, inp.head, 1.4, 4);
          this.bolts.mat.uniforms.uOpacity.value = 0.8;
        }
        if (d < 0.55) this._strike(t);
      }
    } else {
      // 다시 높이 올라간다
      this.vel.lerp(_v.set(0, 6, 0).addScaledVector(_v2.subVectors(inp.head, P).setY(0).normalize(), 2), Math.min(1, dt * 3));
      if (this.modeT > 0.7 || P.y > inp.head.y + 1.6) {
        this.mode = 'hover';
        this.modeT = 0;
        this.diveCd = 1.1;
        this.bolts.hide();
      }
    }
    P.addScaledVector(this.vel, dt);
    P.y = Math.max(0.6, P.y);
    this.root.position.copy(P);
    // 진행 방향을 바라보고, 속도에 따라 기운다
    const flat = _v.copy(this.vel).setY(0);
    if (flat.lengthSq() > 0.05) this.setYaw(Math.atan2(flat.x, flat.z));
    const flare = this.W?.flare ?? 0;
    this.core.rotation.x = damp(this.core.rotation.x, THREE.MathUtils.clamp(-this.vel.y * 0.08, -0.9, 0.6) * (1 - flare) - flare * 0.75, 6, dt);
    // 선회할 때 안쪽으로 몸을 눕힌다 (뱅크)
    const yawNow = this.yaw;
    let dy = yawNow - (this.prevYaw ?? yawNow);
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.prevYaw = yawNow;
    this.core.rotation.z = damp(this.core.rotation.z, THREE.MathUtils.clamp(-dy / Math.max(dt, 1e-3) * 0.35, -0.7, 0.7), 4, dt);
    this._animate(dt, this.mode === 'dive' ? 0.25 : 1);
    void world;
    return true;
  }

  _strike(t) {
    const { fx, sfx, input: inp } = this.ctx;
    const c = t.center(new THREE.Vector3());
    const dir = _v.copy(this.vel).normalize();
    t.damage(34, { type: 'punch', dir, color: '#bcd8ff' });
    t.impulse?.(dir.clone().multiplyScalar(3).add(_v2.set(0, 3.5, 0)), 6);
    // 대상에서 사방으로 튀는 번개
    const list = [];
    for (let i = 0; i < 8; i++) list.push([c.clone().add(_v2.randomDirection().multiplyScalar(0.1)), c.clone().add(_v3.randomDirection().multiplyScalar(0.6 + Math.random() * 0.9)), 0.15]);
    list[0] = [this.pos.clone(), c.clone(), 0.2];
    this.bolts.regenBetween(list, inp.head);
    this.bolts.mat.uniforms.uOpacity.value = 1;
    fx.burst(c, 30, new THREE.Color(0xbfd8ff), 4, 0.03, 0.3);
    fx.flash(c, new THREE.Color(0x9fc0ff), 8, 0.2, 10);
    sfx.zap(c);
    this.mode = 'climb';
    this.modeT = 0;
    this.vel.multiplyScalar(-0.3);
  }

  /**
   * 새의 날갯짓: 빠른 내려치기(전체 주기의 40%, 날개를 활짝 펴고 앞으로 쓸며 깃 앞전을 숙인다)
   * → 느린 올려치기(팔꿈치·손목을 접어 날개 폭을 줄이고 깃을 비틀어 공기를 흘려보낸다).
   * 순항은 몇 번 치고 미끄러지는 '치고-활공', 상승·이륙은 쉼 없이 크게, 급강하는 날개를 접어 뒤로 붙이고,
   * 낚아채기 직전엔 날개를 앞으로 펼쳐 제동하며 발톱을 내민다.
   */
  _wingPose(dt, rate) {
    const W = (this.W ??= { ph: 0, flapW: 1, amp: 1, freq: 3.4, fold: 0, stoop: 0, flare: 0, talon: 0, bout: 4, glideT: 0, prevE: 0, tip: 0, bob: 0 });
    const act = this.state === 'act';
    let freq = 3.3;
    let amp = 0.9;
    let flapW = 1;
    let stoop = 0;
    let flare = 0;
    if (this.state === 'rise') {
      freq = 4.3;
      amp = 1.15;
    } else if (this.state === 'sink') {
      flapW = 0;
      stoop = 1;
    } else if (this.mode === 'dive') {
      // 멀리선 날개를 접고 내리꽂다가, 가까워지면 날개를 앞으로 펼쳐 브레이크
      const d = this.target?.alive ? this.target.center(_v3).distanceTo(this.pos) : 9;
      flare = THREE.MathUtils.smoothstep(3.2 - d, 0, 1.9);
      stoop = 1 - flare;
      flapW = flare * 0.85;
      freq = 4.8;
      amp = 0.75;
    } else if (this.mode === 'climb') {
      freq = 4.6;
      amp = 1.2;
    } else if (act) {
      // 순항: 치고-활공. 위로 올라가야 하면 쉬지 않고 친다
      const climbing = this.vel.y > 0.6;
      if (W.glideT > 0) {
        W.glideT -= dt;
        flapW = 0;
        if (climbing || W.glideT <= 0) {
          W.glideT = 0;
          W.bout = 3 + Math.floor(Math.random() * 4);
        }
      }
      amp = climbing ? 1.05 : 0.85;
      freq = climbing ? 3.9 : 3.2;
    }
    W.freq = damp(W.freq, freq, 4, dt);
    W.amp = damp(W.amp, amp, 4, dt);
    W.flapW = damp(W.flapW, flapW, flapW > W.flapW ? 10 : 5, dt);
    W.stoop = damp(W.stoop, stoop, 7, dt);
    W.flare = damp(W.flare, flare, 9, dt);
    W.talon = damp(W.talon, this.mode === 'dive' ? flare : 0, 10, dt);
    const prev = W.ph;
    if (W.flapW > 0.02 || flapW > 0) W.ph = (W.ph + dt * W.freq * rate) % 1;
    if (W.ph < prev && act && this.mode === 'hover' && W.glideT <= 0 && --W.bout <= 0 && this.vel.y < 0.6) W.glideT = 0.45 + Math.random() * 0.6;
    const D = 0.4; // 내려치기 비율
    const ph = W.ph;
    const ease = (x) => x * x * (3 - 2 * x);
    const UP = 0.95 * W.amp;
    const DN = -0.72 * W.amp;
    let e;
    let fold;
    let sweep;
    let twist;
    if (ph < D) {
      const s = ph / D;
      e = UP + (DN - UP) * ease(s);
      fold = 0.15 * (1 - s) * (1 - s);
      sweep = -0.18 * Math.sin(s * Math.PI);
      twist = 0.22 * Math.sin(s * Math.PI);
    } else {
      const s = (ph - D) / (1 - D);
      e = DN + (UP - DN) * ease(s);
      fold = Math.pow(Math.sin(s * Math.PI), 0.7) * 0.85;
      sweep = 0.22 * Math.sin(s * Math.PI);
      twist = -0.4 * Math.sin(s * Math.PI);
    }
    // 활공: 날개를 수평보다 조금 올려(상반각) 편 채로 둔다
    const fw = W.flapW;
    e = lerp(0.14, e, fw);
    fold *= fw;
    sweep *= fw;
    twist *= fw;
    // 급강하 자세 / 제동 자세
    e = lerp(e, 0.32, W.stoop);
    fold = lerp(fold, 0.75, W.stoop);
    sweep = lerp(sweep, 0.75, W.stoop) - W.flare * 0.35;
    e += W.flare * 0.25;
    // 깃 끝은 날개 움직임에 끌려 반대로 휜다 (공기 저항)
    const ev = (e - W.prevE) / Math.max(dt, 1e-3);
    W.prevE = e;
    W.tip = damp(W.tip, THREE.MathUtils.clamp(-ev * 0.035, -0.4, 0.4), 18, dt);
    // 몸은 내려칠 때 솟고 올려칠 때 가라앉는다
    W.bob = damp(W.bob, -e * 0.05 * fw, 10, dt);
    return { e, fold, sweep, twist, tip: W.tip, W };
  }

  _animate(dt, rate) {
    const { e, fold, sweep, twist, tip, W } = this._wingPose(dt, rate);
    for (const w of this.wings) {
      w.sh.rotation.z = e * w.s;
      w.sh.rotation.y = sweep * 1.2 * w.s;
      w.sh.rotation.x = twist;
      w.el.rotation.y = -fold * 1.1 * w.s;
      w.el.rotation.z = tip * w.s;
    }
    if (this.M) {
      const R = this.M.rig;
      R.begin();
      for (const [side, s] of [['L', 1], ['R', -1]]) {
        R.rot(side + '_arm', AX.X, twist);
        R.rot(side + '_arm', AX.Y, (sweep + fold * 0.45) * s);
        R.rot(side + '_arm', AX.Z, e * s);
        // 올려칠 때: 팔꿈치는 앞으로, 손목은 뒤로 접혀 날개가 'ㄹ'자로 줄어든다
        R.rot(side + '_elbow', AX.Y, -fold * 1.05 * s);
        R.rot(side + '_elbow', AX.Z, -fold * 0.2 * s);
        R.rot(side + '_hand', AX.Y, fold * 1.25 * s);
        R.rot(side + '_hand', AX.Z, tip * 0.5 * s);
        for (const k of ['B', 'C', 'D']) {
          R.rot(`${side}_wing_${k}1`, AX.X, twist * 0.8);
          R.rot(`${side}_wing_${k}2`, AX.Z, tip * 0.7 * s);
        }
        R.rot(`${side}_wing_A1`, AX.X, twist * 0.5);
        // 다리: 날 때는 뒤로 접어 붙이고, 낚아챌 땐 앞으로 내밀어 발가락을 벌린다
        R.rot(side + '_leg', AX.X, lerp(1.25, -0.85, W.talon));
        R.rot(side + '_knee', AX.X, lerp(-0.25, 0.25, W.talon));
        for (const toe of ['bigtoe', 'secondtoe', 'thirdtoe', 'fourthtoe']) R.rot(`${side}_${toe}_A`, AX.X, lerp(0.5, -0.35, W.talon));
      }
      // 몸이 오르내려도 머리는 제자리에 (새의 머리 안정화)
      const pitch = this.core.rotation.x;
      R.rot('neck', AX.X, -pitch * 0.5 + W.bob * 2);
      R.rot('head', AX.X, -pitch * 0.35);
      // 꼬리: 날갯짓에 맞춰 늦게 출렁이고, 제동 땐 아래로 펼친다
      ['tail_A', 'tail_B', 'tail_C'].forEach((b, i) => {
        R.rot(b, AX.X, Math.sin(W.ph * Math.PI * 2 - 1 - i * 0.7) * 0.09 * W.flapW + W.flare * 0.25);
        R.rot(b, AX.Y, Math.sin(this.t * 1.6 - i * 0.8) * 0.06);
      });
      this.M.root.position.y = -0.55 + W.bob;
    } else this.core.position.y = W.bob;
    if (this.mode !== 'dive' && this.bolts.mat.uniforms.uOpacity.value > 0) {
      this.bolts.mat.uniforms.uOpacity.value = Math.max(0, this.bolts.mat.uniforms.uOpacity.value - dt * 4);
      if (this.bolts.mat.uniforms.uOpacity.value <= 0) this.bolts.hide();
    }
  }

  onDestroy() {
    this.bolts.dispose(this.ctx.scene);
  }
}

// ───────────────── 가마 (蝦蟇) ─────────────────
export class Toad extends Shiki {
  constructor(owner) {
    super(owner, { height: 1.5, riseDur: 0.4, poolR: 1.2 });
    this.name = '가마';
    this.setHp(110, 1.3, 0.6);
    const skin = toon(0x45523f);
    const belly = toon(0xc4b998);
    const dark = toon(0x0c0d0a);
    const eye = toon(0xe8d470);
    const B = this.body;
    this.M = makeShiki('toad', 2.2, { outline: 0.014, skip: ['eyeshine'] });
    if (this.M) B.add(this.M.root);
    if (!this.M) {
      part(B, sph(0.7, 1.25, 0.72, 1.1), skin, [0, 0.66, -0.1], [0, 0, 0], 0.016);
      part(B, sph(0.55, 1.2, 0.68, 0.95), skin, [0, 0.8, 0.42], [0, 0, 0], 0.016);
      part(B, sph(0.5, 1.2, 0.6, 0.9), belly, [0, 0.5, 0.42], [0, 0, 0], 0);
      // 등의 거울 문양 (십종신보)
      part(B, new THREE.TorusGeometry(0.22, 0.03, 6, 24), belly, [0, 1.1, -0.15], [-Math.PI / 2 + 0.25, 0, 0], 0);
      for (const s of [-1, 1]) {
        part(B, sph(0.16), skin, [0.36 * s, 1.18, 0.55]);
        part(B, sph(0.11), eye, [0.38 * s, 1.24, 0.63], [0, 0, 0], 0);
        part(B, sph(0.05, 0.6, 1.4, 0.6), dark, [0.39 * s, 1.25, 0.72], [0, 0, 0], 0);
        // 앞다리 · 접힌 뒷다리
        part(B, cyl(0.1, 0.08, 0.5), skin, [0.55 * s, 0.5, 0.62], [0.2, 0, 0.15 * s]);
        part(B, sph(0.28, 1, 0.75, 1.4), skin, [0.72 * s, 0.38, -0.35]);
        part(B, sph(0.14, 1.6, 0.4, 1), skin, [0.8 * s, 0.06, -0.05]);
      }
      // 입 선
      part(B, new THREE.TorusGeometry(0.5, 0.018, 4, 24, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI), dark, [0, 0.72, 0.5], [0, 0, 0], 0);
    }
    this.mouth = this.M ? new THREE.Vector3(0, 1.8, 1.0) : new THREE.Vector3(0, 0.72, 0.95);
    // 혀
    const tongueMat = toon(0xd2707a);
    this.tongue = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1, 10, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5), tongueMat);
    this.tongue.add(new THREE.Mesh(this.tongue.geometry, outlineMat(0.01)));
    this.tip = new THREE.Mesh(sph(0.13, 1, 0.8, 1), tongueMat);
    this.tongue.visible = this.tip.visible = false;
    this.ctx.scene.add(this.tongue, this.tip);
    this.tipPos = new THREE.Vector3();
    this.mode = 'wait';
    this.modeT = 0;
    this.target = null;
    this.held = null;
    this.life = 8;
  }

  update(dt) {
    if (!super.update(dt)) return false;
    const { input: inp } = this.ctx;
    this.body.scale.y = 1 + Math.sin(this.t * 3) * 0.03; // 숨쉬기
    if (this.M) {
      // 모델의 혀는 입속에 접어 두고 코드로 만든 혀를 쓴다. 팔은 내리고, 혀를 뻗을 땐 입을 벌린다
      const R = this.M.rig;
      R.begin();
      R.scale('tongue_A', 0.01);
      R.rot('L_arm', AX.Z, -1.0);
      R.rot('R_arm', AX.Z, 1.0);
      R.rot('L_elbow', AX.X, -0.5);
      R.rot('R_elbow', AX.X, -0.5);
      this.jawK = damp(this.jawK ?? 0, this.mode === 'out' || this.mode === 'in' ? 0.55 : 0, 12, dt);
      R.rot('jaw', AX.X, this.jawK);
      // 자세: 혀를 쏘기 전 몸을 낮추고 웅크렸다가 → 쏠 때 앞으로 튀어나가듯 숙이고 → 끌어올 땐 뒤로 버틴다
      const m = this.mode;
      const lean = m === 'wait' ? -0.18 : m === 'out' ? 0.32 : m === 'in' ? (this.held ? -0.28 : -0.12) : 0;
      const crouch = m === 'wait' ? 1 : m === 'out' ? 0.3 : m === 'in' ? 0.6 : 0;
      this.leanK = damp(this.leanK ?? 0, lean, m === 'out' ? 22 : 8, dt);
      this.crouchK = damp(this.crouchK ?? 0, crouch, 10, dt);
      R.rot('spine', AX.X, this.leanK * 0.5);
      R.rot('chest', AX.X, this.leanK * 0.5);
      R.rot('head', AX.X, -this.leanK * 0.3 - this.crouchK * 0.1);
      // 무거운 것을 끌 땐 몸이 부르르 떨린다
      if (this.held) R.rot('chest', AX.Y, Math.sin(this.t * 31) * 0.04);
      for (const [sd, s] of [['L', 1], ['R', -1]]) {
        R.rot(sd + '_leg', AX.X, -this.crouchK * 0.25);
        R.rot(sd + '_knee', AX.X, this.crouchK * 0.35);
        // 앞발로 땅을 짚어 버틴다
        R.rot(sd + '_arm', AX.X, -this.leanK * 0.6);
        R.rot(sd + '_arm', AX.Z, -this.crouchK * 0.15 * s);
      }
      // 개구리 목주머니: 빠르게 벌렁이고, 삼킨 뒤엔 크게 부푼다
      const gulp = m === 'done' ? Math.sin(Math.min(1, this.modeT / 0.5) * Math.PI) : 0;
      const throat = Math.max(0, Math.sin(this.t * 17)) * 0.08 + gulp * 0.45;
      R.rot('undermouth_A', AX.X, -throat);
      R.rot('undermouth_B', AX.X, -throat * 0.6);
      this.body.position.y = this.state === 'act' ? -this.crouchK * 0.08 + gulp * 0.04 : this.body.position.y;
    }
    if (this.state !== 'act') return true;
    this.modeT += dt;
    const mouthW = this.root.localToWorld(_v3.copy(this.mouth));
    if (this.mode === 'wait') {
      this.target = this.owner.pickTarget(inp.head, 14, true);
      if (this.target) this.faceTo(this.target.center(_v));
      if (this.modeT > 0.15) {
        this.mode = 'out';
        this.modeT = 0;
        this.tipPos.copy(mouthW);
        this.ctx.sfx.play('whoosh', { at: mouthW, vol: 0.6, rate: 1.6 });
        if (!this.target) this.blind = mouthW.clone().addScaledVector(_v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 5);
      }
    } else if (this.mode === 'out') {
      const goal = this.target?.alive ? this.target.center(_v) : this.blind ?? mouthW;
      const to = _v2.subVectors(goal, this.tipPos);
      const d = to.length();
      this.tipPos.addScaledVector(to.normalize(), Math.min(d, 28 * dt));
      if (d < 0.3 || this.modeT > 0.8) {
        const t = this.target;
        if (t?.alive && t.kind === 'dummy' && !t.heldBy && t.grab) {
          t.grab(this, this.tipPos);
          this.held = t;
          this.ctx.sfx.play('grab', { at: this.tipPos, vol: 0.8 });
        } else if (t?.alive) t.impulse?.(_v.subVectors(mouthW, this.tipPos).normalize().multiplyScalar(6));
        this.mode = 'in';
        this.modeT = 0;
      }
    } else if (this.mode === 'in') {
      // 혀가 대상을 붙잡아 입 앞(플레이어 쪽)으로 끌어온다
      const front = _v.copy(mouthW).add(_v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(0.5));
      const to = _v2.subVectors(front, this.tipPos);
      const d = to.length();
      this.tipPos.addScaledVector(to.normalize(), Math.min(d, 16 * dt));
      if (this.held) {
        if (!this.held.alive) this.held = null;
        else this.held.holdAt(this.tipPos);
      }
      if (d < 0.05 || this.modeT > 1.2) {
        if (this.held) {
          // 플레이어 앞에 툭 떨군다 → 바로 칠 수 있다
          const h = this.held;
          this.held = null;
          h.release(_v.set(0, -1, 0));
          h.damage(10, { type: 'punch' });
        }
        this.mode = 'done';
        this.modeT = 0;
      }
    } else if (this.mode === 'done' && this.modeT > 1.0) this.dismiss();
    const show = this.mode === 'out' || this.mode === 'in';
    this.tongue.visible = this.tip.visible = show;
    if (show) {
      const L = mouthW.distanceTo(this.tipPos);
      this.tongue.position.copy(mouthW);
      this.tongue.lookAt(this.tipPos);
      this.tongue.scale.set(1, 1, Math.max(0.01, L));
      this.tip.position.copy(this.tipPos);
    }
    return true;
  }

  /** 잡은 대상이 죽으면 더미가 부른다 */
  drop() {
    this.held = null;
  }

  onDismiss() {
    if (this.held) {
      this.held.release(_v.set(0, 0, 0));
      this.held = null;
    }
    this.tongue.visible = this.tip.visible = false;
  }

  onDestroy() {
    this.ctx.scene.remove(this.tongue, this.tip);
    this.tongue.geometry.dispose();
    this.tip.geometry.dispose();
  }
}

// 곡선을 따라 매 프레임 다시 짜는 굵기가 변하는 관 (뱀 몸통)
class SnakeTube {
  constructor(scene, S = 72, R = 12, colA = 0xeeeae0, colB = 0x2a2830) {
    this.S = S;
    this.R = R;
    const n = (S + 1) * (R + 1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const A = new THREE.Color(colA);
    const B = new THREE.Color(colB);
    for (let i = 0; i <= S; i++) {
      // 몇 마디마다 검은 띠 무늬
      const band = i % 9 >= 6 && i < S - 2;
      const c = band ? B : A;
      for (let j = 0; j <= R; j++) col.set([c.r, c.g, c.b], (i * (R + 1) + j) * 3);
    }
    const idx = [];
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < R; j++) {
        const a = i * (R + 1) + j;
        const b = a + R + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, toon(0xffffff, { vertexColors: true }));
    this.mesh.add(new THREE.Mesh(g, outlineMat(0.025)));
    this.mesh.frustumCulled = false;
    this.mesh.children[0].frustumCulled = false;
    scene.add(this.mesh);
    this._t = new THREE.Vector3();
    this._n = new THREE.Vector3(1, 0, 0);
    this._b = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  update(curve, radius) {
    const { S, R, pos, nor } = this;
    const T = this._t;
    const N = this._n;
    const Bv = this._b;
    const P = this._p;
    curve.getTangentAt(0, T);
    N.set(1, 0, 0);
    if (Math.abs(T.x) > 0.9) N.set(0, 0, 1);
    N.addScaledVector(T, -N.dot(T)).normalize();
    for (let i = 0; i <= S; i++) {
      const u = i / S;
      curve.getPointAt(u, P);
      curve.getTangentAt(u, _v3);
      // 평행 이동 틀: 이전 법선을 새 접선에 수직이 되게만 바로잡는다 (꼬임 방지)
      N.addScaledVector(_v3, -N.dot(_v3)).normalize();
      T.copy(_v3);
      Bv.crossVectors(T, N);
      const r = radius(u);
      for (let j = 0; j <= R; j++) {
        const a = (j / R) * Math.PI * 2;
        const cx = Math.cos(a);
        const sy = Math.sin(a);
        const nx = N.x * cx + Bv.x * sy;
        const ny = N.y * cx + Bv.y * sy;
        const nz = N.z * cx + Bv.z * sy;
        const k = (i * (R + 1) + j) * 3;
        pos[k] = P.x + nx * r;
        pos[k + 1] = P.y + ny * r;
        pos[k + 2] = P.z + nz * r;
        nor[k] = nx;
        nor[k + 1] = ny;
        nor[k + 2] = nz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

// ───────────────── 오로치 (大蛇) ─────────────────
export class Orochi extends Shiki {
  constructor(owner, target) {
    super(owner, { height: 0, riseDur: 0.01, sinkDur: 0.6, poolR: 1.4 });
    this.name = '오로치';
    this.target = target;
    const scale = toon(0xeeeae0);
    const band = toon(0x2a2830);
    const dark = toon(0x0a090c);
    // 뱀 모델: 0.8m 간격으로 늘어선 등뼈를 곡선을 따라 세운다
    this.M = makeShiki('serpent', 0.95, { outline: 0.03 });
    if (this.M) {
      this.ctx.scene.add(this.M.root);
      const names = ['Bone030'];
      for (let i = 31; i <= 60; i++) names.push('Bone0' + i);
      this.spine = names.map((n) => this.M.rig.get(n)).filter(Boolean);
      this.segLen = 0.8 * this.M.scale;
    } else this.tube = new SnakeTube(this.ctx.scene);
    // 머리 (위턱 · 아래턱)
    this.head = new THREE.Group();
    const skull = joint(this.head, 0, 0, 0);
    part(skull, sph(0.42, 0.85, 0.55, 1.25), scale, [0, 0.05, 0.2], [0, 0, 0], 0.02);
    part(skull, new THREE.TorusGeometry(0.1, 0.02, 6, 16), band, [0, 0.27, 0.15], [-Math.PI / 2, 0, 0], 0);
    for (const s of [-1, 1]) part(skull, sph(0.06), dark, [0.24 * s, 0.14, 0.42], [0, 0, 0], 0);
    this.lowJaw = joint(this.head, 0, -0.12, 0.05);
    part(this.lowJaw, sph(0.34, 0.8, 0.3, 1.2), scale, [0, -0.05, 0.25], [0, 0, 0], 0.02);
    if (!this.M) this.ctx.scene.add(this.head);
    this.curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    this.base = new THREE.Vector3();
    this.headPos = new THREE.Vector3();
    this.mode = 'wait';
    this.modeT = 0;
    this.held = null;
    this.sway = new THREE.Vector3();
    this.life = 9;
  }

  emerge(pos, yaw) {
    super.emerge(pos, yaw);
    this.base.copy(pos).setY(0);
    this.headPos.copy(this.base).setY(-2);
    // 휘어 오르는 방향: 플레이어 반대쪽으로 살짝
    const away = _v.subVectors(this.base, this.ctx.input.head).setY(0).normalize();
    this.sway.copy(away).multiplyScalar(1.6);
    this.ctx.sfx.rumble(0.8, 0.35);
  }

  update(dt) {
    this.t += dt;
    this.modeT += dt;
    const { fx, sfx } = this.ctx;
    const B = this.base;
    const t = this.target;
    let H = 0;
    if (this.mode === 'wait') {
      if (this.modeT > 0.22) {
        this.mode = 'rise';
        this.modeT = 0;
        sfx.play('whoosh_3', { at: B, vol: 0.9, rate: 0.6 });
      }
    } else if (this.mode === 'rise') {
      const k = Math.min(1, this.modeT / 0.38);
      H = 6.5 * (1 - Math.pow(1 - k, 3));
      this.headPos.set(B.x + this.sway.x * k * 0.4, H, B.z + this.sway.z * k * 0.4);
      // 솟구치며 대상을 물어 올린다
      if (!this.held && t?.alive && k > 0.12) {
        if (t.kind === 'dummy' && t.grab && !t.heldBy) {
          t.grab(this, t.center(_v));
          this.held = t;
        } else t.impulse?.(_v.set(0, 12, 0));
        t.damage?.(25, { type: 'punch', dir: UP.clone() });
        shadowSplash(fx, B, 1.3, 30);
      }
      if (k >= 1) {
        this.mode = 'squeeze';
        this.modeT = 0;
      }
    } else if (this.mode === 'squeeze') {
      // 공중에서 몸으로 휘감아 조인다
      H = 6.5 + Math.sin(this.modeT * 12) * 0.08;
      this.headPos.set(B.x + this.sway.x * 0.4 + Math.sin(this.modeT * 9) * 0.1, H, B.z + this.sway.z * 0.4);
      this._tick = (this._tick ?? 0) - dt;
      if (this._tick <= 0 && this.held?.alive) {
        this._tick = 0.25;
        this.held.damage(14, { type: 'impact' });
        sfx.play('punch_2', { at: this.headPos, vol: 0.35, rate: 0.6 });
      }
      if (this.modeT > 1.0) {
        this.mode = 'slam';
        this.modeT = 0;
        this.slamFrom = this.headPos.clone();
        this.slamTo = B.clone().addScaledVector(this.sway, 2.2).setY(0.6);
      }
    } else if (this.mode === 'slam') {
      const k = Math.min(1, this.modeT / 0.3);
      const e = k * k;
      this.headPos.lerpVectors(this.slamFrom, this.slamTo, e);
      this.headPos.y += Math.sin(k * Math.PI) * 1.5;
      if (k >= 1) {
        // 땅에 내리꽂는다
        const h = this.held;
        this.held = null;
        if (h?.alive) {
          h.release(_v.set(0, -16, 0));
          h.damage(45, { type: 'impact' });
        }
        fx.shockwave(_v.copy(this.slamTo).setY(0.05), 0x222222, 3.5, 0.5, { dark: true, opacity: 0.6 });
        fx.fire.explosion && this._dust(this.slamTo);
        sfx.explosion(this.slamTo, 0.7);
        sfx.rumble(0.5, 0.4);
        this.mode = 'retreat';
        this.modeT = 0;
        this.dismiss();
      }
    }
    if (this.state === 'sink') {
      // 꼬리부터 그림자로 빨려 들어간다
      const k = Math.min(1, this.t / this.sinkDur);
      this.headPos.lerp(_v.copy(B).setY(-3), Math.min(1, dt * 6));
      if (k >= 1) {
        this.pool?.close();
        this.destroy();
        return false;
      }
    }
    if (this.held?.alive) {
      // 모델은 머리 끝(주둥이)에 물고 있다
      const snout = this.M ? this.M.rig.pos('Bone022', _v) : null;
      this.held.holdAt(snout ? snout.add(_v2.set(0, -0.4, 0)) : _v.copy(this.headPos).add(_v2.set(0, -0.3, 0)).addScaledVector(this.sway, 0.12));
    }
    this._pose();
    // 턱
    if (this.M) return true;
    const open = this.mode === 'rise' ? 0.6 : this.mode === 'squeeze' ? 0.15 + Math.sin(this.modeT * 14) * 0.08 : 0.3;
    this.lowJaw.rotation.x = open;
    return true;
  }

  _dust(p) {
    const fire = this.ctx.fx.fire;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      fire.smoke(_v.set(p.x + Math.cos(a) * 0.4, 0.2, p.z + Math.sin(a) * 0.4), _v2.set(Math.cos(a) * 5, 0.4, Math.sin(a) * 5), { size0: 0.3, size1: 1.2, life: 1.6, shade: 0.55, lit: 0, opacity: 0.45, drag: 2.5, rise: 0.3 });
    }
  }

  _poseModel() {
    const B = this.base;
    const Hp = this.headPos;
    const c = this.curve.points;
    const wob = Math.sin(this.t * 3) * 0.25;
    c[0].set(B.x, -3, B.z);
    c[1].set(B.x, 0.1, B.z);
    c[2].set(lerp(B.x, Hp.x, 0.35) - this.sway.x * 0.25 + wob, Math.max(0.4, Hp.y * 0.4), lerp(B.z, Hp.z, 0.35) - this.sway.z * 0.25);
    c[3].set(lerp(B.x, Hp.x, 0.75) + this.sway.x * 0.45, Math.max(0.6, Hp.y * 0.78), lerp(B.z, Hp.z, 0.75) + this.sway.z * 0.45 + wob);
    c[4].copy(Hp);
    this.curve.updateArcLengths();
    const Lc = this.curve.getLength();
    const away = _v3.copy(this.sway).setY(0).normalize();
    const S = this.M.scale;
    const n = this.spine.length;
    this._P ??= this.spine.map(() => new THREE.Vector3());
    this._T ??= this.spine.map(() => new THREE.Vector3());
    // 1) 곡선 위 자리
    for (let k = 0; k < n; k++) {
      const d = k * this.segLen;
      const P = this._P[k];
      if (d <= Lc) this.curve.getPointAt(1 - d / Lc, P);
      else P.copy(c[0]).setY(c[0].y - (d - Lc));
    }
    // 2) 몸을 따라 흐르는 옆 물결 (머리에서 꼬리로 전해지는 S자) — 땅속 부분과 머리 끝은 덜 흔든다
    const calm = this.mode === 'slam' ? 0.3 : this.mode === 'squeeze' ? 0.5 : 1;
    this.waveA = damp(this.waveA ?? 0, calm, 4, 1 / 60);
    for (let k = 1; k < n - 1; k++) {
      const P = this._P[k];
      if (P.y < -0.2) continue;
      const T = _pt.subVectors(this._P[k - 1], this._P[k + 1]).normalize();
      const side = _px.crossVectors(UP, T);
      if (side.lengthSq() < 1e-4) side.copy(away);
      side.normalize();
      const env = Math.sin(Math.min(1, k / 10) * Math.PI * 0.5) * Math.min(1, (P.y + 0.2) / 1.2);
      P.addScaledVector(side, Math.sin(k * 0.55 - this.t * 6.5) * 0.22 * env * this.waveA);
    }
    // 3) 조이기: 물고 있는 대상을 몸통으로 나선처럼 휘감는다
    const held = this.held?.alive ? this.held : null;
    this.coil = damp(this.coil ?? 0, held && this.mode === 'squeeze' ? 1 : 0, held ? 5 : 9, 1 / 60);
    if (this.coil > 0.01 && held) {
      const C = held.center(_pu);
      const r = 0.55 - Math.max(0, Math.sin(this.t * 12)) * 0.07;
      const k0 = 2;
      const k1 = Math.min(n - 2, 17);
      for (let k = k0; k <= k1; k++) {
        const u = (k - k0) / (k1 - k0);
        const w = this.coil * Math.sin(u * Math.PI) ** 0.6;
        const ang = u * Math.PI * 4.4 + Math.atan2(away.x, away.z);
        const hp = _ps.set(C.x + Math.sin(ang) * r, C.y + 0.55 - u * 1.25, C.z + Math.cos(ang) * r);
        this._P[k].lerp(hp, w);
      }
    }
    // 4) 이웃 마디로 방향을 다시 잡고 뼈를 세운다
    for (let k = 0; k < n; k++) {
      const T = this._T[k];
      if (k === 0) T.subVectors(this._P[0], this._P[1]);
      else if (k === n - 1) T.subVectors(this._P[k - 1], this._P[k]);
      else T.subVectors(this._P[k - 1], this._P[k + 1]);
      if (T.lengthSq() < 1e-6) T.set(0, 1, 0);
      T.normalize();
    }
    for (let k = 0; k < n; k++) {
      const b = this.spine[k];
      const P = this._P[k];
      const T = _pt.copy(this._T[k]);
      if (this.mode === 'slam' && k === 0) T.lerp(_v.subVectors(this.slamTo, this.slamFrom).normalize(), 0.6).normalize();
      // 머리 방향 = 접선, 등(위) = 플레이어 반대쪽 + 하늘
      const U = _pu.copy(away).addScaledVector(UP, (1 - Math.abs(T.y)) * 1.5);
      U.addScaledVector(T, -U.dot(T));
      if (U.lengthSq() < 1e-4) U.set(1, 0, 0).addScaledVector(T, -T.x);
      U.normalize();
      const X = _px.crossVectors(U, T).normalize();
      _m4.makeBasis(X, U, T);
      _q.setFromRotationMatrix(_m4).multiply(this.M.rig.bindW.get(b));
      _m4.compose(P, _q, _ps.set(S, S, S));
      b.matrix.copy(b.parent.matrixWorld).invert().multiply(_m4);
      b.matrix.decompose(b.position, b.quaternion, b.scale);
      b.updateMatrixWorld(true);
    }
    // 혀를 날름
    const tongue = this.M.rig.get('Bone018');
    if (tongue) tongue.scale.setScalar(Math.sin(this.t * 9) > 0.6 ? 1 : 0.3);
  }

  _pose() {
    if (this.M) return this._poseModel();
    const B = this.base;
    const Hp = this.headPos;
    const c = this.curve.points;
    // 땅속 → 지면 → 휘어지며 → 머리
    const wob = Math.sin(this.t * 3) * 0.25;
    c[0].set(B.x, -3, B.z);
    c[1].set(B.x, 0.1, B.z);
    c[2].set(lerp(B.x, Hp.x, 0.35) - this.sway.x * 0.25 + wob, Math.max(0.4, Hp.y * 0.4), lerp(B.z, Hp.z, 0.35) - this.sway.z * 0.25);
    c[3].set(lerp(B.x, Hp.x, 0.75) + this.sway.x * 0.45, Math.max(0.6, Hp.y * 0.78), lerp(B.z, Hp.z, 0.75) + this.sway.z * 0.45 + wob);
    c[4].copy(Hp).addScaledVector(_v.copy(this.headDirV ?? UP), -0.35);
    // 굵기: 땅속은 굵고, 위로 갈수록 살짝 가늘어지다 목에서 머리 크기로
    this.tube.update(this.curve, (u) => 0.5 + Math.sin(u * Math.PI * 0.85) * 0.18 - Math.max(0, u - 0.9) * 1.2);
    this.head.position.copy(Hp);
    this.curve.getTangentAt(1, _v);
    if (this.mode === 'slam') _v.lerp(_v2.subVectors(this.slamTo, this.slamFrom).normalize(), 0.7);
    _q.setFromUnitVectors(_v3.set(0, 0, 1), _v.normalize());
    this.head.quaternion.slerp(_q, 0.5);
  }

  drop() {
    this.held = null;
  }

  onDismiss() {
    if (this.held?.alive) this.held.release(_v.set(0, 0, 0));
    this.held = null;
  }

  onDestroy() {
    if (this.M) this.ctx.scene.remove(this.M.root);
    this.tube?.dispose(this.ctx.scene);
    this.ctx.scene.remove(this.head);
    const mats = new Set();
    this.head.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !o.material.userData.shared) mats.add(o.material);
    });
    for (const m of mats) m.dispose();
  }
}

// ───────────────── 만상 (満象) ─────────────────
export class MaxElephant extends Shiki {
  constructor(owner, target) {
    super(owner, { height: 0, riseDur: 0.01, sinkDur: 0.8, poolR: 2.4 });
    this.name = '만상';
    this.target = target;
    const hide = toon(0x4b4a58);
    const pattern = toon(0x9d9aae);
    const tusk = toon(0xf1ebdc);
    const dark = toon(0x0a0a0d);
    const B = this.body;
    this.M = makeShiki('elephant', 4.2, { outline: 0.025 });
    if (this.M) B.add(this.M.root);
    this.legs = [];
    this.trunk = [];
    if (!this.M) {
      part(B, sph(1.3, 1, 0.92, 1.35), hide, [0, 2.25, -0.2], [0, 0, 0], 0.03);
      part(B, sph(0.92, 1, 1.02, 0.95), hide, [0, 2.75, 1.35], [0, 0, 0], 0.03);
      // 이마의 거울 문양 · 몸의 띠 무늬
      part(B, new THREE.TorusGeometry(0.28, 0.05, 6, 24), pattern, [0, 3.2, 2.08], [-0.35, 0, 0], 0);
      part(B, new THREE.TorusGeometry(1.32, 0.06, 6, 32), pattern, [0, 2.25, 0.35], [0, 0, 0], 0);
      part(B, new THREE.TorusGeometry(1.25, 0.06, 6, 32), pattern, [0, 2.25, -0.75], [0, 0, 0], 0);
      for (const s of [-1, 1]) {
        part(B, new THREE.CylinderGeometry(0.85, 0.85, 0.08, 20).rotateZ(Math.PI / 2), hide, [0.95 * s, 2.75, 1.05], [0, 0.35 * s, 0.15 * s], 0.025);
        part(B, sph(0.07), dark, [0.5 * s, 3.0, 2.12], [0, 0, 0], 0);
        part(B, new THREE.ConeGeometry(0.08, 0.8, 8).rotateX(Math.PI / 2 + 0.5), tusk, [0.32 * s, 2.25, 2.1], [0, 0, 0], 0.01);
      }
      this.legs = [];
      for (const [x, z] of [[-0.75, 0.75], [0.75, 0.75], [-0.75, -1.05], [0.75, -1.05]]) {
        const hip = joint(B, x, 1.75, z);
        part(hip, cyl(0.38, 0.34, 1.75), hide, [0, 0, 0], [0, 0, 0], 0.03);
        part(hip, cyl(0.38, 0.38, 0.12), pattern, [0, -1.6, 0], [0, 0, 0], 0);
        this.legs.push(hip);
      }
      // 코 (마디)
      this.trunk = [];
      let parent = joint(B, 0, 2.4, 2.05);
      for (let i = 0; i < 7; i++) {
        const r = 0.24 - i * 0.022;
        const seg = joint(parent, 0, i === 0 ? 0 : -0.3, 0);
        part(seg, cyl(r, r - 0.02, 0.32), hide, [0, 0, 0], [0, 0, 0], 0.02);
        this.trunk.push(seg);
        parent = seg;
      }
      this.trunkTip = joint(parent, 0, -0.32, 0);
    }
    this.vy = 0;
    this.mode = 'drop';
    this.life = 6;
  }

  emerge(pos, yaw) {
    // 대상 머리 위 높은 곳의 그림자에서 떨어진다 (바닥엔 미리 그림자가 진다)
    this.root.position.set(pos.x, 10, pos.z);
    this.setYaw(yaw, true);
    this.landAt = pos.clone().setY(0);
    this.pool = this.owner.pools.open(pos, this.poolR, { grow: 0.5 });
    this.ctx.sfx.play('whoosh_3', { at: pos, vol: 0.9, rate: 0.5 });
    this.state = 'act';
  }

  update(dt) {
    this.t += dt;
    const { world, fx, sfx, input: inp } = this.ctx;
    const P = this.root.position;
    if (this.state === 'sink') {
      const k = Math.min(1, this.t / this.sinkDur);
      this.body.position.y = -4.2 * k * k;
      if (k >= 1) {
        this.pool?.close();
        this.destroy();
        return false;
      }
      return true;
    }
    if (this.mode === 'drop') {
      this.vy -= 26 * dt;
      P.y += this.vy * dt;
      for (const l of this.legs) l.rotation.x = Math.sin(this.t * 6 + l.position.x) * 0.15;
      if (this.M) this._animModel(dt);
      if (P.y <= 0) {
        P.y = 0;
        this.mode = 'landed';
        this.modeT = 0;
        this._crush();
      }
    } else {
      this.modeT += dt;
      // 착지 반동 후 코를 치켜들고 물을 뿜는다
      const k = Math.min(1, this.modeT / 0.35);
      if (!this.M) this.body.scale.y = 1 - Math.sin(k * Math.PI) * 0.12;
      const lift = Math.min(1, Math.max(0, (this.modeT - 0.5) / 0.4));
      this.trunk.forEach((s, i) => (s.rotation.x = -lift * (0.35 + i * 0.06) + Math.sin(this.modeT * 4 + i) * 0.05));
      if (this.M) this._animModel(dt, lift);
      if (lift >= 1 && !this.sprayed) {
        this.sprayed = true;
        this._spray();
      }
      if (this.modeT > 2.4) this.dismiss();
    }
    void world;
    void fx;
    void sfx;
    void inp;
    return true;
  }

  /**
   * 떨어질 땐 네 다리를 벌려 버티고 귀가 바람에 들리며 코가 위로 말린다.
   * 착지: 수 톤의 무게가 무릎을 꺾어 몸이 내려앉았다가 출렁이며 돌아오고, 귀·코·꼬리는 관성으로 늦게 휘청인다.
   * 그 뒤 코를 높이 치켜들고 (울음과 함께) 물을 뿜는다
   */
  _animModel(dt, lift = 0) {
    const R = this.M.rig;
    R.begin();
    const drop = this.mode === 'drop';
    const T = drop ? 0 : this.modeT;
    // 착지 충격의 감쇠 진동 (양수 = 내려앉음)
    const sq = drop ? 0 : Math.exp(-T * 4.5) * Math.cos(T * 11);
    const sink = Math.max(0, sq);
    const fall = drop ? Math.min(1, -this.vy / 18) : 0;
    for (const sd of ['L', 'R']) {
      // 앞다리: 어깨를 앞으로 내밀어 받치고, 충격 땐 팔꿈치가 굽는다
      R.rot(`Bip001_${sd}_UpperArm`, AX.X, -fall * 0.3 + sink * 0.25);
      R.rot(`Bip001_${sd}_Forearm`, AX.X, sink * 0.35);
      R.rot(`Bip001_${sd}_Hand`, AX.X, -sink * 0.2);
      // 뒷다리: 무릎이 앞으로 꺾이며 주저앉는다
      R.rot(`Bip001_${sd}_Thigh`, AX.X, fall * 0.25 - sink * 0.45);
      R.rot(`Bip001_${sd}_Calf`, AX.X, sink * 0.6);
      R.rot(`Bip001_${sd}_Foot`, AX.X, -sink * 0.25);
      // 다리를 옆으로 벌려 착지를 준비
      R.rot(`Bip001_${sd}_Thigh`, AX.Z, (sd === 'L' ? 1 : -1) * fall * 0.12);
      R.rot(`Bip001_${sd}_UpperArm`, AX.Z, (sd === 'L' ? 1 : -1) * fall * 0.12);
    }
    this.body.position.y = -sq * 0.28;
    this.body.rotation.x = sq * 0.05;
    R.rot('Bip001_Spine', AX.X, -sq * 0.06);
    // 관성: 몸보다 한 박자 늦게 출렁인다
    const lag = drop ? -fall : Math.exp(-T * 3.2) * Math.sin(T * 9 + 0.6);
    const flap = Math.sin(this.t * 7) * 0.25 * lift;
    ['erduo_01', 'erduo_02', 'erduo_03', 'erduo_04'].forEach((b, i) => R.rot(b, AX.Y, (0.25 + fall * 0.5 - lag * 0.35) * (i ? 0.35 : 1) + flap));
    ['erduo_06', 'erduo_07', 'erduo_08', 'erduo_09'].forEach((b, i) => R.rot(b, AX.Y, -(0.25 + fall * 0.5 - lag * 0.35) * (i ? 0.35 : 1) - flap));
    ['erduo_01', 'erduo_06'].forEach((b) => R.rot(b, AX.X, -fall * 0.3 + lag * 0.2));
    // 코: 떨어질 땐 위로 말리고, 착지 땐 아래로 채찍처럼 휘었다가, 마지막엔 하늘로 치켜든다
    ['bizi_01', 'bizi_02', 'bizi_03', 'bizi_04', 'bizi_05'].forEach((b, i) => {
      const k = 0.3 + i * 0.1;
      R.rot(b, AX.X, -fall * k * 0.9 + lag * k * 0.6 - lift * (0.32 + i * 0.09) + Math.sin(this.t * 3 + i * 0.7) * 0.04 * (1 - lift * 0.5));
      R.rot(b, AX.Y, Math.sin(this.t * 1.7 - i * 0.5) * 0.04);
    });
    R.rot('xiaba', AX.X, lift * 0.3 + fall * 0.1);
    R.rot('Bip001_Head', AX.X, -lift * 0.18 + lag * 0.06);
    ['Bone002', 'Bone003', 'Bone004', 'Bone005'].forEach((b, i) => R.rot(b, AX.X, lag * 0.3 * (i + 1) * 0.4));
    if (lift > 0.5 && !this.trumpeted) {
      this.trumpeted = true;
      this.ctx.sfx.tone({ type: 'sawtooth', f0: 520, f1: 760, dur: 0.6, vol: 0.18, at: this.root.position });
    }
  }

  _crush() {
    const { world, fx, sfx, input: inp, game } = this.ctx;
    const c = this.landAt;
    const R = 3.2;
    world.forEachTarget(c, R, (t, d) => {
      const k = Math.max(0, 1 - d / R);
      const out = _v.subVectors(t.center(_v2), c).setY(0).normalize();
      t.damage(60 + 200 * k, { type: 'impact', dir: out.clone(), color: '#c8c8ff' });
      t.impulse?.(out.multiplyScalar(4 + 8 * k).add(_v3.set(0, 3 + 4 * k, 0)), 6);
    });
    fx.shockwave(_v.copy(c).setY(0.05), 0x9a9aa8, R * 2.2, 0.6, { opacity: 0.7 });
    const fire = fx.fire;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      fire.smoke(_v.set(c.x + Math.cos(a) * 1.4, 0.3, c.z + Math.sin(a) * 1.4), _v2.set(Math.cos(a) * 7, 0.6, Math.sin(a) * 7), { size0: 0.5, size1: 2.2, life: 2.2, shade: 0.55, lit: 0, opacity: 0.5, drag: 2.4, rise: 0.4 });
    }
    sfx.explosion(c, 1.6);
    sfx.rumble(1.2, 0.8);
    inp.left.pulse?.(1, 200);
    inp.right.pulse?.(1, 200);
    if (game) game.hitstop = Math.max(game.hitstop, 0.05);
  }

  _spray() {
    const { world, fx, sfx } = this.ctx;
    // 코끝에서 사방으로 쏟아지는 물: 주위를 밀어낸다
    const tip = this.M ? this.M.rig.pos('bizi_05') ?? this.root.position.clone().setY(3) : this.trunkTip.getWorldPosition(new THREE.Vector3());
    const water = new THREE.Color(0xa8dcff);
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(4, 11);
      fx.spawn(tip, _v.set(Math.cos(a) * sp * 0.6, rnd(4, 9), Math.sin(a) * sp * 0.6), water, rnd(0.03, 0.07), rnd(0.8, 1.4), 0.4, 9.8);
    }
    for (let i = 0; i < 10; i++) fx.fire.smoke(tip, _v.randomDirection().multiplyScalar(2).setY(2), { size0: 0.3, size1: 1.5, life: 1.6, shade: 1, lit: 0, opacity: 0.25, rise: -0.5, drag: 1.5 });
    world.forEachTarget(this.landAt, 6, (t, d) => {
      const out = _v.subVectors(t.center(_v2), this.landAt).setY(0).normalize();
      t.impulse?.(out.multiplyScalar(5 * (1 - d / 7)).add(_v3.set(0, 2, 0)), 2);
      t.damage(12, { type: 'impact', color: '#a8dcff' });
    });
    sfx.play('wind_burst', { at: tip, vol: 0.8, rate: 0.6 });
  }
}

// ───────────────── 관우 (貫牛) ─────────────────
// 속박: 곧게만 달릴 수 있는 대신, 달린 거리에 비례해 기하급수적으로 빨라지고 위력이 커진다
export class PiercingOx extends Shiki {
  constructor(owner, dir) {
    super(owner, { height: 2.2, riseDur: 0.35, sinkDur: 0.45, poolR: 1.3 });
    this.name = '관우';
    this.setHp(150, 1.6, 0.7);
    this.M = makeShiki('ox', 2.0, { outline: 0.016 });
    if (this.M) this.body.add(this.M.root);
    else {
      const hide = toon(0x3a2a24);
      const horn = toon(0xe8dfc8);
      const B = this.body;
      part(B, sph(0.7, 0.8, 0.75, 1.3), hide, [0, 1.1, 0], [0, 0, 0], 0.02);
      part(B, sph(0.42, 0.9, 0.8, 1), hide, [0, 1.25, 0.95], [0, 0, 0], 0.02);
      for (const sd of [-1, 1]) {
        part(B, new THREE.ConeGeometry(0.07, 0.5, 8), horn, [0.32 * sd, 1.6, 1.0], [0.3, 0, -0.9 * sd], 0.01);
        for (const z of [0.55, -0.55]) part(B, cyl(0.13, 0.1, 0.75), hide, [0.35 * sd, 0.75, z], [0, 0, 0], 0.015);
      }
    }
    this.dir = dir.clone().setY(0).normalize();
    this.dist = 0;
    this.speed = 0;
    this.mode = 'paw';
    this.modeT = 0;
    this.hit = new Set();
    this.phase = 0;
    this.dustT = 0;
    this.life = 9;
  }

  update(dt) {
    if (!super.update(dt)) return false;
    const { world, fx, sfx, game, env, input: inp } = this.ctx;
    const P = this.root.position;
    if (this.state === 'act') {
      this.modeT += dt;
      if (this.mode === 'paw') {
        // 앞발로 땅을 긁으며 노려본다
        if (this.modeT > 0.5) {
          this.mode = 'charge';
          this.modeT = 0;
          sfx.tone({ type: 'sawtooth', f0: 110, f1: 70, dur: 0.5, vol: 0.25, at: P });
          sfx.play('whoosh_3', { at: P, vol: 0.8, rate: 0.6 });
        }
      } else if (this.mode === 'charge') {
        this.speed = Math.min(46, 4 * Math.exp(this.dist * 0.12));
        const step = this.speed * dt;
        P.addScaledVector(this.dir, step);
        this.dist += step;
        // 진로 위의 모든 것을 들이받는다
        for (const t of world.targets()) {
          if (this.hit.has(t) || t.heldBy) continue;
          const c = t.center(_v);
          const rel = _v2.subVectors(c, P).setY(0);
          const along = rel.dot(this.dir);
          const lat = rel.addScaledVector(this.dir, -along).length();
          if (along < -0.6 || along > 1.8 || lat > 1.1 + 0.3 * (t.scale ?? 1)) continue;
          this.hit.add(t);
          const dmg = 40 + this.dist * 9 + this.speed * 3;
          t.damage(dmg, { type: 'impact', dir: this.dir.clone(), color: '#ffcf90' });
          t.impulse?.(this.dir.clone().multiplyScalar(4 + this.speed * 0.45).add(_v3.set(0, 3 + this.speed * 0.15, 0)), 8);
          fx.burst(c, 30, new THREE.Color(0xffe0b0), 4, 0.04, 0.35, { dir: this.dir, dirAmt: 1 });
          fx.shockwave(c, 0xffffff, 1.6, 0.3, { faceDir: this.dir.clone(), opacity: 0.6 });
          sfx.punch(c);
          if (this.speed > 18) {
            sfx.explosion(c, 0.6);
            if (game) game.hitstop = Math.max(game.hitstop, 0.04);
          }
          inp.left.pulse?.(0.6, 50);
          inp.right.pulse?.(0.6, 50);
        }
        // 발굽 먼지
        this.dustT -= dt;
        if (this.dustT <= 0) {
          this.dustT = 0.05;
          fx.fire.smoke(_v.copy(P).addScaledVector(this.dir, -0.8).setY(0.2), _v2.copy(this.dir).multiplyScalar(-1).add(_v3.set(0, 0.6, 0)), { size0: 0.25, size1: 0.9, life: 1.2, shade: 0.55, lit: 0, opacity: 0.35, drag: 2, rise: 0.3 });
        }
        // 벽이나 경계에 부딪히거나 충분히 달리면 멈춘다
        const B = env.bounds;
        const out = B && (P.x < B.minX + 0.8 || P.x > B.maxX - 0.8 || P.z < B.minZ + 0.8 || P.z > B.maxZ - 0.8);
        if (out || this.dist > 45) {
          if (B) {
            P.x = THREE.MathUtils.clamp(P.x, B.minX + 0.8, B.maxX - 0.8);
            P.z = THREE.MathUtils.clamp(P.z, B.minZ + 0.8, B.maxZ - 0.8);
          }
          fx.shockwave(_v.copy(P).setY(0.1), 0x888888, 3, 0.5, { opacity: 0.6 });
          sfx.explosion(P, Math.min(1.6, this.speed / 20));
          sfx.rumble(0.5, 0.4);
          this.mode = 'done';
          this.modeT = 0;
          this.speed = 0;
        }
      } else if (this.modeT > 0.4) this.dismiss();
    }
    this._animate(dt);
    return true;
  }

  _animate(dt) {
    this.phase += dt * (this.mode === 'paw' ? 9 : 5 + Math.min(16, this.speed * 0.5));
    if (!this.M) return;
    const R = this.M.rig;
    R.begin();
    const N = OX_BONES;
    this.gait ??= {};
    // 몸 전체 자세 (목표값으로 부드럽게)
    let headDown = 0;
    let crouch = 0;
    let brace = 0;
    if (this.mode === 'paw') {
      // 황소의 발 긁기: 오른 앞발을 들어 앞으로 뻗었다가 땅을 끌며 뒤로 긁는다. 머리는 낮추고 뒷다리는 버틴다
      const T = this.modeT;
      const cyc = (T * 2.6) % 1;
      const n = Math.floor(T * 2.6);
      let up = 0;
      let fw = 0;
      if (cyc < 0.35) {
        const k = cyc / 0.35;
        up = Math.sin(k * Math.PI) * 0.9;
        fw = -0.55 * k; // 들어서 앞으로
      } else {
        const k = (cyc - 0.35) / 0.65;
        fw = -0.55 + 1.05 * (k * k * (3 - 2 * k)); // 땅을 긁으며 뒤로
      }
      R.rot('Bip001_R_UpperArm', AX.X, fw);
      R.rot('Bip001_R_Forearm', AX.X, up * 0.9);
      R.rot('Bip001_R_Hand', AX.X, up * 0.7);
      if (n !== this.scrapeN && cyc > 0.45) {
        this.scrapeN = n;
        const foot = this.M.rig.pos('Bip001_R_Hand', _v);
        if (foot) {
          foot.y = 0.1;
          const back = _v2.copy(this.dir).multiplyScalar(-2.2).setY(1.2);
          for (let i = 0; i < 6; i++) this.ctx.fx.spawn(foot, _v3.copy(back).add(_v3.clone().randomDirection().multiplyScalar(0.8)), new THREE.Color(0x6b5a48), 0.03, 0.5, 0.2, 9.8);
          this.ctx.fx.fire.smoke(foot, back.multiplyScalar(0.5), { size0: 0.2, size1: 0.7, life: 0.9, shade: 0.55, lit: 0, opacity: 0.3, drag: 2, rise: 0.2 });
        }
      }
      headDown = 1;
      crouch = 0.5;
      // 콧김을 뿜듯 머리를 짧게 턴다
      R.rot('Bip001_Head', AX.Y, Math.sin(T * 7) * 0.06);
    } else if (this.mode === 'charge') {
      headDown = 1;
    } else {
      // 멈춤: 앞다리를 내뻗어 버티며 미끄러지고, 고개를 치켜든다
      brace = Math.min(1, this.modeT / 0.12);
    }
    const speed = this.mode === 'charge' ? this.speed : 0;
    const out = quadGait(R, N, this.gait, dt, { speed, stride: 1.5, trotAt: 1.5, gallopAt: 3.5, strideMax: 0.9, legLift: 1.1, maxFreq: 5.5 });
    this.hd = damp(this.hd ?? 0, headDown, 6, dt);
    this.cr = damp(this.cr ?? 0, crouch, 6, dt);
    this.br = damp(this.br ?? 0, brace, 14, dt);
    // 뿔을 앞으로 겨누고 목을 낮춘다 (달릴 땐 박자에 맞춰 머리를 들썩인다)
    R.rot('Bip001_Neck', AX.X, this.hd * 0.35 - this.br * 0.4);
    R.rot('Bip001_Head', AX.X, this.hd * 0.3 + out.pitch * 0.8);
    // 뒷다리를 굽혀 무게를 싣는다
    for (const sd of ['L', 'R']) {
      R.rot(`Bip001_${sd}_Thigh`, AX.X, this.cr * 0.18 + this.br * 0.35);
      R.rot(`Bip001_${sd}_Calf`, AX.X, this.cr * 0.2 + this.br * 0.3);
      R.rot(`Bip001_${sd}_UpperArm`, AX.X, -this.br * 0.45);
    }
    // 몸: 갤럽의 앞뒤 흔들림 + 들썩임, 멈출 땐 뒤로 주저앉으며 고개를 든다
    this.body.rotation.x = -out.pitch * 1.3 + this.br * -0.12 + this.cr * 0.04;
    this.body.position.y = out.bob * 1.4 - this.cr * 0.06 - this.br * 0.1;
    // 꼬리: 달리면 뒤로 뻗고, 발을 긁을 땐 휘휘 휘두른다
    tailFollow(R, N.tail, this.gait, dt, { wag: this.mode === 'paw' ? 0.5 : 0.05, lift: Math.min(1, speed / 10), sway: out.flex });
  }
}

// ───────────────── 탈토 (脱兎) ─────────────────
let _rabbitGeo = null;
function rabbitGeometry() {
  if (_rabbitGeo) return _rabbitGeo;
  const parts = [
    sph(0.12, 1, 0.9, 1.25).translate(0, 0.12, 0),
    sph(0.085).translate(0, 0.22, 0.13),
    new THREE.CylinderGeometry(0.022, 0.028, 0.17, 6).translate(0, 0.08, 0).rotateX(-0.25).translate(-0.035, 0.27, 0.1),
    new THREE.CylinderGeometry(0.022, 0.028, 0.17, 6).translate(0, 0.08, 0).rotateX(-0.25).translate(0.035, 0.27, 0.1),
    sph(0.04).translate(0, 0.14, -0.15),
  ].map((g) => {
    g.deleteAttribute('uv');
    return g;
  });
  _rabbitGeo = mergeGeometries(parts);
  _rabbitGeo.userData.shared = true;
  return _rabbitGeo;
}

// 토끼 모델(스키닝)을 바인드 자세 그대로 굳혀 인스턴싱용 형태로 (몸 · 눈)
let _rabbitParts;
function rabbitModelParts() {
  if (_rabbitParts !== undefined) return _rabbitParts;
  const src = getModel(SHIKI_MODELS.rabbit.file);
  if (!src) return null;
  src.updateMatrixWorld(true);
  const k = 0.42 / SHIKI_MODELS.rabbit.h;
  const parts = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.deleteAttribute('skinIndex');
    g.deleteAttribute('skinWeight');
    g.applyMatrix4(o.matrixWorld);
    g.scale(k, k, k);
    g.userData.shared = true;
    const mat = new THREE.MeshToonMaterial({ map: o.material.map ?? null, color: o.material.map ? 0xffffff : o.material.color, gradientMap: gradient() });
    mat.userData.shared = true;
    parts.push({ geo: g, mat, outline: !/eye/i.test(o.name) });
  });
  _rabbitParts = parts;
  return parts;
}

export class RabbitEscape {
  constructor(owner, center, n = 36) {
    this.owner = owner;
    this.ctx = owner.ctx;
    this.name = '탈토';
    this.alive = true;
    this.state = 'act';
    this.t = 0;
    this.life = 8;
    // 모델이 있으면 실제 토끼 (Quest 부담을 줄이려 수를 조금 줄인다), 없으면 코드로 만든 토끼
    const parts = rabbitModelParts();
    this.inst = [];
    if (parts) {
      n = Math.min(n, 24);
      for (const pt of parts) {
        this.inst.push(new THREE.InstancedMesh(pt.geo, pt.mat, n));
        if (pt.outline) this.inst.push(new THREE.InstancedMesh(pt.geo, outlineMat(0.008), n));
      }
    } else {
      this.inst.push(new THREE.InstancedMesh(rabbitGeometry(), toon(0xf6f5f2), n));
      this.inst.push(new THREE.InstancedMesh(rabbitGeometry(), outlineMat(0.008), n));
      this.ownMat = this.inst[0].material;
    }
    for (const m of this.inst) {
      m.frustumCulled = false;
      this.ctx.scene.add(m);
    }
    this.r = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.r.push({
        p: new THREE.Vector3(center.x + Math.cos(a) * 0.3, -0.3, center.z + Math.sin(a) * 0.3),
        v: new THREE.Vector3(Math.cos(a) * rnd(1, 3), rnd(3, 5), Math.sin(a) * rnd(1, 3)),
        yaw: a, ground: false, wait: rnd(0, 0.3), s: rnd(0.85, 1.2), delay: i * 0.03,
      });
    }
    this.pool = owner.pools.open(center, 1.0, { dur: 1.5 });
    shadowSplash(this.ctx.fx, center, 0.8, 30);
    this.center = center.clone();
    this._m = new THREE.Matrix4();
  }

  /** 더미가 노릴 미끼: 가장 가까운 토끼 */
  decoyFor(d) {
    let best = null;
    let bd = Infinity;
    const p = d.root.position;
    for (const r of this.r) {
      if (r.delay > 0) continue;
      const dd = r.p.distanceToSquared(p);
      if (dd < bd) {
        bd = dd;
        best = r.p;
      }
    }
    return best ? _v3.copy(best).setY(Math.max(0.2, best.y)) : null;
  }

  dismiss() {
    if (this.state === 'sink') return;
    this.state = 'sink';
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    if (this.state === 'act' && !this.owner.domainActive) {
      this.life -= dt;
      if (this.life <= 0) this.dismiss();
    }
    const head = this.ctx.input.head;
    const shrink = this.state === 'sink' ? Math.max(0, 1 - this.t / 0.5) : 1;
    let i = 0;
    for (const r of this.r) {
      if (r.delay > 0) {
        r.delay -= dt;
        this._m.makeScale(0, 0, 0);
      } else {
        if (r.ground) {
          r.wait -= dt;
          // 뛰기 직전 뒷다리에 힘을 모아 웅크린다
          if (r.wait < 0.09) r.sqT = -0.35;
          if (r.wait <= 0 && this.state === 'act') {
            // 플레이어 주변 2~9m 안에서 이리저리 뛴다
            const dx = r.p.x - head.x;
            const dz = r.p.z - head.z;
            const dist = Math.hypot(dx, dz);
            let a = r.yaw + rnd(-1.2, 1.2);
            if (dist > 9) a = Math.atan2(-dx, -dz) + rnd(-0.6, 0.6);
            else if (dist < 2) a = Math.atan2(dx, dz) + rnd(-0.6, 0.6);
            r.yaw = a;
            const sp = rnd(1.5, 3.2);
            r.v.set(Math.sin(a) * sp, rnd(2, 3.2), Math.cos(a) * sp);
            r.ground = false;
            r.sqT = 0.25; // 박차고 오르며 길게 늘어난다
          }
        } else {
          r.v.y -= 9.8 * dt;
          r.p.addScaledVector(r.v, dt);
          if (r.p.y <= 0 && r.v.y < 0) {
            r.p.y = 0;
            r.ground = true;
            r.wait = rnd(0.05, 0.35);
            r.sqV = (r.sqV ?? 0) + r.v.y * 0.9; // 착지 충격으로 납작
          }
        }
        const B = this.ctx.env.bounds;
        if (B) {
          r.p.x = THREE.MathUtils.clamp(r.p.x, B.minX + 0.2, B.maxX - 0.2);
          r.p.z = THREE.MathUtils.clamp(r.p.z, B.minZ + 0.2, B.maxZ - 0.2);
        }
        // 찌그러짐: 스프링으로 출렁 (착지 납작 → 반동), 공중에선 속도만큼 늘어난다
        r.sq ??= 0;
        r.sqV ??= 0;
        const want = r.ground ? (r.sqT ?? 0) : THREE.MathUtils.clamp(Math.abs(r.v.y) * 0.05, 0, 0.18);
        r.sqV += ((want - r.sq) * 260 - r.sqV * 16) * dt;
        r.sq = THREE.MathUtils.clamp(r.sq + r.sqV * dt, -0.4, 0.3);
        if (r.ground && (r.sqT ?? 0) > 0) r.sqT = 0;
        // 몸 기울기: 오를 땐 코를 들고 내려올 땐 코부터 떨어진다, 땅에선 코를 킁킁
        const pitchWant = r.ground ? Math.sin(this.t * 14 + r.s * 40) * 0.04 : THREE.MathUtils.clamp(-r.v.y * 0.12, -0.5, 0.5);
        r.pitch = damp(r.pitch ?? 0, pitchWant, 12, dt);
        const sy = 1 + r.sq;
        const sxz = 1 / Math.sqrt(sy);
        _q.setFromAxisAngle(UP, r.yaw).multiply(_q2.setFromAxisAngle(_X, r.pitch));
        this._m.compose(r.p, _q, _v.set(r.s * shrink * sxz, r.s * shrink * sy, r.s * shrink * sxz));
      }
      for (const m of this.inst) m.setMatrixAt(i, this._m);
      i++;
    }
    for (const m of this.inst) m.instanceMatrix.needsUpdate = true;
    if (this.state === 'sink' && this.t > 0.5) {
      this.destroy();
      return false;
    }
    return true;
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    for (let k = 0; k < this.r.length; k += 4) shadowSplash(this.ctx.fx, this.r[k].p, 0.2, 3);
    for (const m of this.inst) {
      this.ctx.scene.remove(m);
      m.dispose();
    }
    this.ownMat?.dispose();
  }
}

// ───────────────── 팔악검 이계신장 마허라 (八握剣 異戒神将 魔虚羅) ─────────────────
function buildGiant(ctx) {
  const tpl = dummyTemplate();
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.55, metalness: 0.05, envMap: ctx.world.envMap, envMapIntensity: 0.6 });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.6 });
  let J;
  let unit = 1;
  if (tpl) {
    const model = tpl.model.clone(true);
    root.add(model);
    model.traverse((o) => {
      if (!o.isMesh) return;
      const dark = o.material.color.r + o.material.color.g + o.material.color.b < 0.1;
      o.material = dark ? darkM : skin;
    });
    const g = (k) => model.getObjectByName('J_' + k);
    J = { hips: g('hips'), spine: g('chest'), head: g('head'), shL: g('shL'), elL: g('elL'), hdL: g('hdL'), shR: g('shR'), elR: g('elR'), hdR: g('hdR'), hpL: g('hpL'), knL: g('knL'), hpR: g('hpR'), knR: g('knR') };
    unit = 1 / tpl.scale;
  } else {
    const box = (w, h, d, parent, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skin);
      m.position.set(x, y, z);
      parent.add(m);
    };
    const jt = (parent, x, y, z) => joint(parent, x, y, z);
    const hips = jt(root, 0, 0.92, 0);
    const spine = jt(hips, 0, 0.08, 0);
    box(0.4, 0.55, 0.24, spine, 0, 0.27, 0);
    const head = jt(spine, 0, 0.62, 0);
    box(0.2, 0.24, 0.22, head, 0, 0.06, 0);
    const arm = (s) => {
      const sh = jt(spine, 0.25 * s, 0.47, 0);
      box(0.1, 0.32, 0.1, sh, 0, -0.16, 0);
      const el = jt(sh, 0, -0.32, 0);
      box(0.09, 0.28, 0.09, el, 0, -0.14, 0);
      const hd = jt(el, 0, -0.3, 0);
      return { sh, el, hd };
    };
    const leg = (s) => {
      const hp = jt(hips, 0.11 * s, -0.02, 0);
      box(0.13, 0.45, 0.13, hp, 0, -0.22, 0);
      const kn = jt(hp, 0, -0.45, 0);
      box(0.1, 0.43, 0.1, kn, 0, -0.21, 0);
      return { hp, kn };
    };
    const aL = arm(1);
    const aR = arm(-1);
    const lL = leg(1);
    const lR = leg(-1);
    J = { hips, spine, head, shL: aL.sh, elL: aL.el, hdL: aL.hd, shR: aR.sh, elR: aR.el, hdR: aR.hd, hpL: lL.hp, knL: lL.kn, hpR: lR.hp, knR: lR.kn };
  }
  return { root, J, unit, mats: [skin, darkM] };
}

const SWING_DUR = 1.0;

/** 법진이 도는 소리 (사용자 제공 파일). 아직 못 불러왔으면 합성음으로 대신한다 */
function wheelSound(sfx, at) {
  if (sfx.play('mahoragaWheel', { at, vol: 1, jitter: 0 })) return;
  sfx.tone({ type: 'square', f0: 120, f1: 60, dur: 0.12, vol: 0.25, at });
  sfx.play('click', { at, vol: 1, rate: 0.5 });
}

/** 금빛 법진 (팔각 바퀴) — 대체 몸 · 법진만 소환 · 떨어진 법진에 쓴다 */
export function makeWheel(ctx, size = 1) {
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a65a, roughness: 0.32, metalness: 0.75, envMap: ctx.world.envMap });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 40), gold));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), gold));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.28, 6).translate(0, 0.14, 0), gold);
    spoke.rotation.z = -a;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), gold);
    knob.position.set(Math.sin(a) * 0.29, Math.cos(a) * 0.29, 0);
    g.add(spoke, knob);
  }
  g.scale.setScalar(size);
  g.userData.mat = gold;
  return g;
}

// 적응: 같은 성질끼리는 내성을 절반쯤 나눠 갖는다 (참격을 익히면 팔(捌)도 어느 정도 버틴다)
export const ADAPT_LABEL = { punch: '타격', impact: '충격', slash: '참격', pierce: '관통', bullet: '총탄', bolt: '전격', fire: '화염', erase: '소멸', evade: '회피 패턴', blood: '피' };
const ADAPT_FAMILY = { slash: 'cut', pierce: 'cut', punch: 'blunt', impact: 'blunt', bullet: 'shot' };
export function adaptKey(info = {}) {
  return info.adapt ?? ({ cleave: 'slash', burn: 'fire' }[info.type] ?? info.type ?? 'punch');
}
const kindLabel = (k) => (k === 'prop' ? '사물' : DUMMY_TYPES[k]?.label.replace(/\(.*\)/, '') ?? k);
export function adaptLabel(k) {
  if (k.startsWith('atk:')) return `${kindLabel(k.slice(4))} 공략`;
  return ADAPT_LABEL[k] ?? k;
}
/** 적응 상태: res(성질 → 단계), expo(분석 중: 경과·필요 시간), atk(상대 종류 → 공격 적응 단계) */
export class Adaptation {
  constructor(from) {
    this.res = new Map(from?.res ?? []);
    this.atk = new Map(from?.atk ?? []);
    this.expo = new Map();
    this.turns = from?.turns ?? 0;
    this.spin = from?.spin ?? false;
  }

  level(k) {
    let L = this.res.get(k) ?? 0;
    const f = ADAPT_FAMILY[k];
    if (f) for (const [k2, v] of this.res) if (k2 !== k && ADAPT_FAMILY[k2] === f) L += v * 0.5;
    return L;
  }

  /** 받는 피해 배율 */
  mul(k) {
    return Math.pow(0.42, this.level(k)) * (this.spin ? 0.3 : 1);
  }

  /** 처음 닿은 성질은 분석을 시작한다 (분석이 끝나면 법진이 돈다) */
  expose(k) {
    if (this.expo.has(k)) return;
    const lv = k.startsWith('atk:') ? this.atk.get(k.slice(4)) ?? 0 : this.res.get(k) ?? 0;
    if (lv >= 5) return;
    this.expo.set(k, { t: 0, need: this.spin ? 0.6 : 2.2 + lv * 1.4 });
  }

  /** 분석을 진행하고 끝난 것 하나를 돌려준다 */
  step(dt) {
    for (const [k, e] of this.expo) {
      e.t += dt;
      if (e.t >= e.need) {
        this.expo.delete(k);
        if (k.startsWith('atk:')) this.atk.set(k.slice(4), (this.atk.get(k.slice(4)) ?? 0) + 1);
        else this.res.set(k, (this.res.get(k) ?? 0) + 1);
        this.turns++;
        const spinNow = !this.spin && this.turns >= 8;
        if (spinNow) this.spin = true;
        return { key: k, spinNow };
      }
    }
    return null;
  }

  summary() {
    const out = [];
    for (const [k, v] of this.res) out.push(`${adaptLabel(k)}${v > 1 ? '×' + v : ''}`);
    for (const [k, v] of this.atk) out.push(`${kindLabel(k)} 공략${v > 1 ? '×' + v : ''}`);
    return out.join(' · ');
  }

  snapshot() {
    return { res: [...this.res], atk: [...this.atk], turns: this.turns, spin: this.spin };
  }
}

/**
 * 법진만 소환 (조복을 마친 뒤, 스쿠나의 운용법): 술사 머리 위에 법진만 떠서 술사가 받는 공격에 대신 적응한다.
 * 같은 수인을 한 번 더 맺으면 그 적응을 그대로 이어받은 마허라가 나온다
 */
export class MahoragaWheel {
  constructor(owner) {
    this.owner = owner;
    this.ctx = owner.ctx;
    this.name = '법진';
    this.alive = true;
    this.state = 'act';
    this.t = 0;
    this.ad = new Adaptation();
    this.angle = 0;
    this.target = 0;
    this.mesh = makeWheel(this.ctx, 1.1);
    this.ctx.scene.add(this.mesh);
    this.ctx.fx.flash(this.ctx.input.head, new THREE.Color(0xffe0a0), 3, 0.3, 4);
    wheelSound(this.ctx.sfx, this.ctx.input.head);
  }

  /** 술사가 맞을 때: 적응한 만큼 피해를 줄이고, 처음 보는 성질과 상대는 분석한다 */
  onPlayerHit(type, info) {
    const k = type ?? 'punch';
    const m = this.ad.mul(k);
    this.ad.expose(k);
    const src = info?.src;
    if (src) this.ad.expose('atk:' + (src.type ?? src.kind ?? '적'));
    return m;
  }

  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const inp = this.ctx.input;
    const done = this.ad.step(dt);
    if (done) {
      this.target += Math.PI / 4;
      const p = this.mesh.position;
      wheelSound(this.ctx.sfx, p);
      this.ctx.fx.flash(p, new THREE.Color(0xffe0a0), 3, 0.25, 5);
      this.ctx.ui.callout(`법진 적응 · ${adaptLabel(done.key)}`, { color: '#ffe0a0', size: 40, dur: 1 });
    }
    if (this.ad.spin) this.target += dt * 2.5;
    this.angle = damp(this.angle, this.target, 6, dt);
    this.mesh.position.copy(inp.head).add(_v.set(0, 0.42 + Math.sin(this.t * 1.5) * 0.015, 0));
    // 정면(머리 방향)을 보는 수직 바퀴
    this.mesh.rotation.set(0, Math.atan2(inp.headDir.x, inp.headDir.z), 0);
    this.mesh.rotateZ(-this.angle);
    if (this.state === 'sink') {
      const k = Math.min(1, this.t / 0.4);
      this.mesh.scale.setScalar(1.1 * (1 - k));
      if (k >= 1) {
        this.destroy();
        return false;
      }
    }
    return true;
  }

  dismiss() {
    if (this.state === 'sink') return;
    this.state = 'sink';
    this.t = 0;
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this.ctx.scene.remove(this.mesh);
    this.mesh.traverse((o) => o.geometry?.dispose());
    this.mesh.userData.mat.dispose();
  }
}

export class Mahoraga extends Shiki {
  constructor(owner, inherit = null) {
    super(owner, { height: 4.6, riseDur: 2.2, sinkDur: 1.2, poolR: 2.6 });
    this.name = '마허라';
    // 조복을 마쳤는지 (마허라를 쓰러뜨려야 조복된다). 조복 전엔 상대가 없으면 술사를 노린다
    this.tamed = !!this.ctx.settings.mahoragaTamed;
    this.ad = new Adaptation(inherit);
    this.setHp(1000, 4.2, 0.85);
    this.growth = 1; // 참격에 적응할 때마다 몸을 부풀린다
    this.reach = 0; // 회피 패턴에 적응하면 늘어난다
    this.swingRate = 1;
    this.misses = 0;
    this.swingDur = SWING_DUR;
    // 조복 의식 중 적대하면 술사와 식신이 칠 수 있는 대상이 된다
    const self = this;
    this.tgt = {
      kind: 'shiki',
      type: 'mahoraga',
      noGrab: true,
      scale: 2.4,
      radius: 1.0,
      pos: new THREE.Vector3(),
      get alive() {
        return self.alive && self.state === 'act' && self.hostile && !self.tamed;
      },
      center: (o = new THREE.Vector3()) => o.copy(self.tgt.pos),
      distanceTo: (q) => self.hitDist(q),
      damage: (a, info) => self.hurt(a, info),
      impulse: () => {},
    };
    if (!this.tamed) this.ctx.world.extraTargets.push(this.tgt);
    this.wheelAngle = 0;
    this.wheelTarget = 0;
    this.M = makeShiki('mahoraga', 5.4, { outline: 0.02, skip: ['teeth', 'mouth'] });
    if (this.M) {
      // 모델: 기존 관절 이름(J.*)으로 각도만 모아 두었다가 프레임 끝에 뼈에 옮긴다
      this.body.add(this.M.root);
      const pj = () => ({ rotation: new THREE.Euler() });
      this.J = { hips: pj(), spine: pj(), head: pj(), shL: pj(), elL: pj(), shR: pj(), elR: pj(), hpL: pj(), knL: pj(), hpR: pj(), knR: pj() };
      this.mats = [];
    } else {
      const g = buildGiant(this.ctx);
      this.SC = 2.4;
      g.root.scale.setScalar(this.SC);
      this.body.add(g.root);
      this.J = g.J;
      const u = g.unit;
      // 머리 위의 법진(바퀴): 적응할 때마다 한 칸씩 돈다
      const gold = new THREE.MeshStandardMaterial({ color: 0xb79a55, roughness: 0.35, metalness: 0.7, envMap: this.ctx.world.envMap });
      this.wheel = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 40), gold);
      this.wheel.add(ring);
      this.wheel.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), gold));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.28, 6).translate(0, 0.14, 0), gold);
        spoke.rotation.z = -a;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), gold);
        knob.position.set(Math.sin(a) * 0.29, Math.cos(a) * 0.29, 0);
        this.wheel.add(spoke, knob);
      }
      this.wheel.scale.setScalar(u);
      this.wheel.position.set(0, 0.38 * u, 0);
      this.J.head.add(this.wheel);
      // 머리 양옆의 작은 날개
      const wingM = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6, envMap: this.ctx.world.envMap });
      for (const sd of [-1, 1]) {
        const w = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(0.16 - i * 0.03, 0.035, 0.012).translate((0.08 - i * 0.015) * sd, 0, 0), wingM);
          f.position.set(0.02 * sd, 0.03 - i * 0.04, -0.01);
          f.rotation.z = (0.5 - i * 0.35) * sd;
          w.add(f);
        }
        w.scale.setScalar(u);
        w.position.set(0.09 * sd * u, 0.08 * u, -0.02 * u);
        this.J.head.add(w);
      }
      this.wheelAngle = 0;
      this.wheelTarget = 0;
      // 오른팔의 퇴마검
      const steel = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.2, metalness: 0.9, envMap: this.ctx.world.envMap });
      this.sword = new THREE.Group();
      this.sword.add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.85, 0.09).translate(0, -0.42, 0), steel));
      this.sword.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.14), gold));
      this.sword.scale.setScalar(u);
      this.sword.rotation.x = 0.25;
      (this.J.hdR ?? this.J.elR).add(this.sword);
      this.mats = [...g.mats, gold, steel, wingM];
    }
    // 걸음 · 자세 상태 (모델/대체 몸 공통)
    this.G = { roll: 0, lean: 0, breath: 0, look: 0, anL: 0, anR: 0, wrist: 0, hairLag: 0, bob: 0, lunge: 0, stepSide: 0 };
    this.adapt = this.ad.atk; // 상대 종류 → 공격 적응 단계 (벨 때마다 분석 → 위력↑)
    this.target = null;
    this.swingT = 0;
    this.swingCd = 0.5;
    this.idleT = 0;
    this.hostile = false;
    this.speed = 0;
    this.phase = 0;
    this.life = 30;
    this.wheelTarget = this.wheelAngle = (this.ad.turns * Math.PI) / 4;
  }

  get hittable() {
    return this.alive && this.state === 'act';
  }

  onDestroy() {
    const L = this.ctx.world.extraTargets;
    const i = L.indexOf(this.tgt);
    if (i >= 0) L.splice(i, 1);
  }

  /**
   * 맞는다: 적응한 성질은 피해가 크게 줄고(같은 성질끼리 일부 공유), 처음 보는 성질은 분석을 시작한다.
   * 분석이 끝나면 법진이 돌며 몸이 한순간에 완전히 재생된다. 재생 전에 한 번에 체력을 넘는 피해를 받으면 소멸
   */
  hurt(amount, info = {}) {
    if (!this.hittable || amount <= 0) return 0;
    const k = adaptKey(info);
    const m = this.ad.mul(k) / (this.growth * this.growth);
    const dmg = amount * m;
    const c = info.at ?? this.aimPoint(_v4);
    const { fx, sfx } = this.ctx;
    if (m < 0.25) {
      // 적응한 공격: 튕겨 낸다
      fx.burst(c, 10, new THREE.Color(0xfff2c0), 3, 0.025, 0.25);
      sfx.play('click', { at: c, vol: 0.5, rate: 1.6, jitter: 0.2 });
    } else {
      fx.burst(c, 14, new THREE.Color(0x8a1a1a), 2.5, 0.05, 0.5);
      sfx.play('punch', { at: c, vol: 0.4, rate: 0.8, jitter: 0.1 });
    }
    this.hurtK = Math.min(1, this.hurtK + dmg / 120);
    this.ad.expose(k);
    if (dmg >= this.hp) {
      this._annihilate(dmg >= this.maxHp * 0.5);
      return dmg;
    }
    this.hp -= dmg;
    return dmg;
  }

  /** 법진이 한 칸 돈다: 적응 완료 → 완전 재생 (+ 성질에 맞는 개조) */
  _onAdapt(done) {
    const { fx, sfx, ui } = this.ctx;
    const k = done.key;
    this.wheelTarget += Math.PI / 4;
    this.hp = this.maxHp;
    if (k === 'slash' || k === 'impact') {
      // 몸을 부풀려 상대적으로 피해를 줄인다
      this.growth = Math.min(1.22, this.growth * 1.05);
    }
    if (k === 'evade') {
      // 술사가 피하는 패턴에 적응: 더 멀리, 더 빨리 벤다
      this.reach = Math.min(2.1, this.reach + 0.7);
      this.swingRate = Math.min(1.6, this.swingRate * 1.18);
    }
    const wp = this._wheelPos(_v);
    wheelSound(sfx, wp);
    fx.flash(wp, new THREE.Color(0xffe0a0), 5, 0.3, 8);
    // 재생: 상처에서 하얀 김이 피어오르며 한순간에 아문다
    const c = this.aimPoint(_v2);
    for (let i = 0; i < 10; i++) fx.fire.smoke(_v3.copy(c).add(_v4.randomDirection().multiplyScalar(0.9 * this.growth)), _v4.set(0, 1.2, 0), { size0: 0.3, size1: 1.1, life: 0.9, shade: 1, lit: 0, opacity: 0.3, drag: 2, rise: 0.6 });
    ui.callout(`적응 · ${adaptLabel(k)}`, { color: '#ffe0a0', size: 44, dur: 0.9 });
    if (done.spinNow) {
      ui.callout('법진 무한회전 — 존재 그 자체에 적응한다', { color: '#ffd28a', size: 40, dur: 2 });
      sfx.play('domain_open', { at: wp, vol: 0.4, rate: 1.4 });
    }
  }

  /** 소멸: 조복 의식 중이면 조복 성공, 조복한 마허라가 파괴되면 십종영법술이 기능을 잃는다 */
  _annihilate(oneShot) {
    const { fx, sfx, ui, game, settings } = this.ctx;
    const c = this.aimPoint(new THREE.Vector3());
    fx.burst(c, 60, new THREE.Color(0xfff0d0), 6, 0.06, 0.9, { spread: 1 });
    fx.flash(c, new THREE.Color(0xffe0b0), 10, 0.4, 16);
    sfx.explosion(c, 1.2);
    sfx.rumble(1, 0.6);
    // 법진이 바닥에 떨어져 구른다
    const wp = this._wheelPos(new THREE.Vector3());
    const w = makeWheel(this.ctx, 2.2);
    w.position.copy(wp);
    let vy = 1.5;
    let life = 0;
    fx.addTransient(w, 3.2, (_k, dt) => {
      life += dt;
      vy -= 9.8 * dt;
      w.position.y = Math.max(0.05, w.position.y + vy * dt);
      if (w.position.y <= 0.05) {
        vy = Math.abs(vy) > 2 ? -vy * 0.3 : 0;
        w.rotation.x = damp(w.rotation.x, -Math.PI / 2, 6, dt);
      }
      w.rotation.z += dt * 2;
      if (life > 2.6) w.scale.multiplyScalar(1 - dt * 3);
    }, () => {
      w.traverse((o) => o.geometry?.dispose());
      w.userData.mat.dispose();
    });
    if (!this.tamed) {
      settings.mahoragaTamed = true;
      game?.saveSettings?.();
      ui.manga({ top: oneShot ? '一撃' : '調伏', main: '八握剣異戒神将魔虚羅', ruby: 'まこら', color: '#ffd28a', big: true });
      ui.callout('조복 완료 — 이제 마허라는 술사를 노리지 않고, 법진만 먼저 부를 수 있다', { color: '#ffe0a0', dur: 3 });
    } else {
      this.owner.tenShadowsBroken = true;
      ui.callout('마허라 파괴 — 십종영법술이 기능을 잃었다', { color: '#ff9a9a', dur: 3 });
    }
    this.sinkDur = 0.5;
    this.dismiss();
  }

  emerge(pos, yaw) {
    super.emerge(pos, yaw);
    this.ctx.sfx.rumble(2.5, 0.6);
    this.ctx.sfx.play('domain_open', { at: pos, vol: 0.5, rate: 0.6 });
  }

  _wheelPos(out) {
    return this.M ? this.M.rig.pos('ring', out) ?? out.copy(this.root.position).setY(5) : this.wheel.getWorldPosition(out);
  }

  /** 모은 관절 각도를 모델 뼈에 옮긴다 (T자 자세 → 팔을 내린 자세가 기준) */
  _applyRig() {
    const R = this.M.rig;
    const J = this.J;
    const G = this.G;
    R.begin();
    R.rot('ring', AX.Z, -this.wheelAngle);
    // 뒤통수의 긴 뿔(바인드에선 뒤로 곧게 뻗어 있다)은 등 뒤로 늘어뜨리고, 몸 흔들림에 늦게 출렁인다
    R.rot('backhead_A', AX.X, -1.25 + G.hairLag * 0.6);
    for (const n of ['backhead_B', 'backhead_C', 'backhead_D', 'backhead_E']) R.rot(n, AX.X, -0.12 + G.hairLag * 0.25);
    // 골반: 걸음마다 앞으로 나간 다리 쪽으로 비틀리고, 들린 다리 쪽이 처진다
    R.rot('hip', AX.Y, J.hips.rotation.y);
    R.rot('hip', AX.Z, G.roll);
    // 허리 · 가슴: 골반과 반대로 비틀어 어깨가 반대로 돈다 + 숨 + 앞으로 숙임
    R.rot('waist', AX.Z, -G.roll * 0.6);
    R.rot('spine', AX.Y, J.spine.rotation.y * 0.5 - J.hips.rotation.y * 0.5);
    R.rot('chest', AX.Y, J.spine.rotation.y * 0.5 - J.hips.rotation.y * 0.6);
    R.rot('spine', AX.X, G.lean * 0.5);
    R.rot('chest', AX.X, G.lean * 0.5 + G.breath - (G.hurt ?? 0) * 0.3);
    R.rot('neck', AX.X, -G.lean * 0.4);
    R.rot('neck', AX.Y, -J.spine.rotation.y * 0.4 + G.look * 0.5);
    R.rot('head', AX.X, J.head.rotation.x - G.lean * 0.3);
    R.rot('head', AX.Y, G.look * 0.5);
    // 팔: 먼저 내리고(Z) → 앞뒤로(X). 바인드가 A자 자세라 0.75만 내린다
    R.rot('L_arm', AX.Z, -0.75 + J.shL.rotation.z);
    R.rot('L_arm', AX.X, J.shL.rotation.x);
    R.rot('R_arm', AX.Z, 0.75 - J.shR.rotation.z);
    R.rot('R_arm', AX.X, J.shR.rotation.x);
    R.rot('L_elbow', AX.X, J.elL.rotation.x - 0.2);
    R.rot('R_elbow', AX.X, J.elR.rotation.x - 0.2);
    R.rot('R_wrist', AX.X, G.wrist);
    R.rot('L_leg', AX.X, -J.hpL.rotation.x);
    R.rot('R_leg', AX.X, -J.hpR.rotation.x);
    R.rot('L_knee', AX.X, J.knL.rotation.x);
    R.rot('R_knee', AX.X, J.knR.rotation.x);
    R.rot('L_ankle', AX.X, G.anL);
    R.rot('R_ankle', AX.X, G.anR);
  }

  update(dt) {
    const alive = this._update(dt);
    if (alive && this.M) this._applyRig();
    return alive;
  }

  _update(dt) {
    if (!super.update(dt)) return false;
    const { input: inp, world } = this.ctx;
    const P = this.root.position;
    const J = this.J;
    let move = 0;
    // 적응 분석 → 법진 회전 · 재생
    if (this.state === 'act') {
      const done = this.ad.step(dt);
      if (done) this._onAdapt(done);
    }
    if (this.ad.spin) this.wheelTarget += dt * 2.5;
    this.tgt.pos.copy(this.aimPoint(_v4));
    this.body.scale.setScalar(damp(this.body.scale.x, this.growth, 3, dt));
    this.G.hurt = this.hurtK;
    // 바퀴는 천천히 목표 각도까지 돈다
    this.wheelAngle = damp(this.wheelAngle, this.wheelTarget, 6, dt);
    if (this.wheel) this.wheel.rotation.z = -this.wheelAngle;
    if (this.state !== 'act') {
      // 솟아오르는 동안 팔을 늘어뜨리고 고개를 숙였다가 든다
      J.head.rotation.x = this.state === 'rise' ? 0.5 * (1 - this.t / this.riseDur) : 0.3;
      this._legs(0, dt);
      return true;
    }
    if (this.swingT > 0) {
      this._swing(dt);
      this._legs(0, dt);
      return true;
    }
    if (!this.target || !this.target.alive || this.target.heldBy || this.target === this.tgt) {
      this.target = this.owner.pickTarget(P, 40, false, (x) => x !== this.tgt);
    }
    const t = this.target;
    let goal = null;
    let reach = 2.3;
    if (t) {
      this.idleT = 0;
      this.hostile = false;
      goal = groundOf(t, _v);
      reach = 2.1 + 0.3 * (t.scale ?? 1) + this.reach * 0.5;
    } else {
      this.idleT += dt;
      if (this.tamed) {
        // 조복된 마허라: 술사 곁을 지킨다
        const side = _v.set(inp.head.x + Math.cos(this.yaw) * 2.8, 0, inp.head.z - Math.sin(this.yaw) * 2.8);
        if (side.distanceTo(_v2.copy(P).setY(0)) > 1.2) goal = side;
        reach = 0.6;
      } else if (this.idleT > 2.5) {
        // 조복되지 않은 식신: 싸울 상대가 없으면 술사에게 칼을 겨눈다
        if (!this.hostile) {
          this.hostile = true;
          this.ctx.ui.callout('마허라가 술사를 노린다 — 같은 수인으로 돌려보내기', { color: '#ffb0b0' });
        }
        goal = _v.copy(inp.head).setY(0);
        reach = 2.2 + this.reach;
      }
    }
    if (goal) {
      const to = _v2.subVectors(goal, P).setY(0);
      const d = to.length();
      const want = Math.atan2(to.x, to.z);
      this.G.look = damp(this.G.look, THREE.MathUtils.clamp(Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)), -0.8, 0.8), 5, dt);
      this.faceTo(goal);
      if (d > reach) {
        move = 2.6;
        P.addScaledVector(to.normalize(), Math.min(d - reach, move * dt));
      } else {
        this.swingCd -= dt;
        if (this.swingCd <= 0) {
          this.swingDur = SWING_DUR / this.swingRate;
          this.swingT = this.swingDur;
          this.swingCd = 0.9 / this.swingRate;
          this._hit = false;
          this.swingTarget = t;
          this.ctx.sfx.play('whoosh_3', { at: P, vol: 0.8, rate: 0.55 });
        }
      }
    }
    this.speed = damp(this.speed, move, 4, dt);
    this._legs(this.speed, dt);
    J.head.rotation.x = damp(J.head.rotation.x, 0.08, 4, dt);
    void world;
    return true;
  }

  /**
   * 내려베기: 예비동작(칼을 높이 치켜들며 상체를 오른쪽으로 비틀고 무게를 뒷발에) → 타격(왼발을 내딛으며
   * 상체를 왼쪽으로 감아 대각선으로 내리친다) → 이어베기(칼이 몸 앞을 지나 왼쪽 아래까지 흘러간다) → 회복
   */
  _swing(dt) {
    const J = this.J;
    const G = this.G;
    this.swingT -= dt;
    const k = 1 - this.swingT / this.swingDur;
    // 퇴마의 검: 반전 술식 같은 정(正)의 에너지를 두르고 휘두른다
    if (k > 0.3 && k < 0.62) this._swordTrail();
    const sm = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
    const wind = sm(0, 0.34, k) * (1 - sm(0.36, 0.46, k));
    const strike = sm(0.36, 0.48, k);
    const recover = sm(0.66, 1, k);
    const follow = strike * (1 - recover);
    // 오른팔 (칼): 위로 치켜들기 → 대각선으로 내리치기 → 왼쪽 아래로 흘러가기 → 제자리
    J.shR.rotation.x = -2.75 * wind + (0.35 * follow) * (1 - wind);
    J.shR.rotation.z = -0.55 * wind + 0.75 * follow;
    J.elR.rotation.x = -0.9 * wind - 0.15 * follow;
    G.wrist = 0.6 * wind - 0.5 * follow;
    // 왼팔: 균형을 잡으려 앞으로 내밀었다가 몸 쪽으로 당긴다
    J.shL.rotation.x = -0.7 * wind + 0.3 * follow;
    J.shL.rotation.z = 0.2 * wind;
    J.elL.rotation.x = -0.6 * wind - 0.2 * follow;
    // 몸통: 오른쪽으로 감았다가 왼쪽으로 풀며 앞으로 숙인다
    J.spine.rotation.y = 0.5 * wind - 0.55 * follow;
    J.hips.rotation.y = 0.18 * wind - 0.22 * follow;
    G.lean = -0.12 * wind + 0.32 * follow;
    // 다리: 뒷발로 버텼다가 왼발을 크게 내딛는다
    J.hpL.rotation.x = -0.1 * wind + 0.55 * follow;
    J.knL.rotation.x = 0.15 * wind + 0.45 * follow;
    J.hpR.rotation.x = 0.1 * wind - 0.35 * follow;
    J.knR.rotation.x = 0.35 * wind + 0.25 * follow;
    G.anL = -0.25 * follow;
    G.anR = 0.2 * follow;
    G.bob = -0.05 * wind - 0.22 * follow;
    G.lunge = 0.7 * follow;
    G.roll = 0;
    if (!this._stomp && k > 0.42) {
      // 내딛는 발이 땅을 울린다
      this._stomp = true;
      this.ctx.sfx.play('punch_2', { at: this.root.position, vol: 0.6, rate: 0.35 });
      this.ctx.sfx.rumble(0.25, 0.3);
    }
    if (!this._hit && k > 0.44) {
      this._hit = true;
      this._strike();
    }
    this._pose(dt);
    if (this.swingT <= 0) {
      this._stomp = false;
      J.shR.rotation.z = 0;
      J.shL.rotation.z = 0;
      J.spine.rotation.y = 0;
      J.hips.rotation.y = 0;
      G.lunge = 0;
    }
  }

  _swordTrail() {
    const tip = this.M ? this.M.rig.pos('R_sword_end', _v4) ?? this.M.rig.pos('R_sword', _v4) : this.sword?.getWorldPosition(_v4);
    if (!tip) return;
    const fx = this.ctx.fx;
    fx.spawn(tip, _v2.randomDirection().multiplyScalar(0.3), new THREE.Color(0xfff4d0), 0.09, 0.28, 2, 0, -0.1);
    fx.spawn(tip, _v2.randomDirection().multiplyScalar(0.6), new THREE.Color(0xffd890), 0.04, 0.4, 1.5, -1);
  }

  _strike() {
    const { world, fx, sfx, input: inp, ui } = this.ctx;
    const P = this.root.position;
    const fwd = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const swing = new THREE.Vector3(Math.cos(this.yaw), -1.2, -Math.sin(this.yaw)).normalize(); // 오른쪽 위 → 왼쪽 아래
    const n = new THREE.Vector3().crossVectors(swing, fwd).normalize();
    const side = _v3.set(fwd.z, 0, -fwd.x);
    const range = 3.4 + this.reach;
    const inArc = (c) => {
      const rel = _v2.subVectors(c, P).setY(0);
      const along = rel.dot(fwd);
      return along > -0.3 && along < range * this.growth && Math.abs(rel.dot(side)) < 1.8 * this.growth;
    };
    if (this.hostile && !this.tamed) {
      // 조복 의식: 술사와 술사의 식신을 벤다. 빗나가면 피하는 패턴을 분석한다
      if (_v2.copy(inp.head).setY(0).distanceTo(_v4.copy(P).setY(0)) < (2.9 + this.reach) * this.growth) {
        world.hitPlayer(30, { type: 'slash' });
        fx.burst(inp.head.clone().add(_v2.set(0, -0.3, 0)), 30, new THREE.Color(0xff3030), 3, 0.04, 0.4);
        this.misses = 0;
      } else if (++this.misses >= 2) {
        this.misses = 0;
        this.ad.expose('evade');
      }
      for (const s2 of this.owner.list) {
        if (s2 === this || !s2.hittable || !inArc(s2.aimPoint(_v4))) continue;
        s2.hurt(70, { type: 'slash' });
      }
      sfx.slash(P, 0.6);
      return;
    }
    let hitAny = false;
    for (const t of world.targets()) {
      if (t.heldBy || t === this.tgt) continue;
      const c = t.center(new THREE.Vector3());
      if (!inArc(c)) continue;
      // 적응: 같은 종류를 벨 때마다 그 상대를 분석해, 끝나면 법진이 돌고 위력이 오른다
      const key = t.type ?? t.kind;
      const a = this.adapt.get(key) ?? 0;
      const dmg = 140 * (1 + a * 0.35) * this.growth;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, c);
      t.damage(dmg, { type: 'slash', plane, push: fwd.clone().multiplyScalar(2), color: '#ffe0a0' });
      t.impulse?.(fwd.clone().multiplyScalar(4).add(_v4.set(0, 2, 0)), 4);
      if (t.kind !== 'prop') this.ad.expose('atk:' + key);
      hitAny = true;
      fx.burst(c, 24, new THREE.Color(0xffffff), 4, 0.03, 0.3, { dir: swing, dirAmt: 1 });
    }
    sfx.slash(P, 0.55);
    void hitAny;
    void ui;
  }

  /**
   * 무거운 거인의 두 발 걸음: 한 주기 = 두 걸음. 지지기(60%) 동안 다리는 앞→뒤로 밀고 무릎은 착지 충격을 받아
   * 살짝 굽었다 펴지며, 들기 동안 무릎을 크게 접어 발을 끌어올린다. 골반은 앞으로 나간 다리 쪽으로 비틀리고
   * 들린 다리 쪽이 처지며, 몸은 지지 다리 위에서 가장 높다. 팔은 다리와 엇갈려 흔들고(칼을 든 오른팔은 덜),
   * 발이 땅에 닿을 때마다 몸이 철렁 내려앉으며 쿵 소리가 난다.
   */
  _legs(speed, dt) {
    const J = this.J;
    const G = this.G;
    const moving = speed > 0.1;
    const w = Math.min(1, speed / 2.2);
    const stride = 2.3; // 한 주기 동안 나아가는 거리 (m)
    this.phase = (this.phase + (dt * speed) / stride) % 1;
    const duty = 0.6;
    const A = 0.42 * w;
    const leg = (p) => {
      if (p < duty) {
        const s = p / duty;
        // 착지 직후 무릎이 충격을 받아 굽었다가 펴진다
        return { hp: A * (1 - 2 * s), kn: 0.12 + Math.sin(s * Math.PI) * 0.18 * w, an: lerp(-0.12, 0.35, s * s) * w, stance: s };
      }
      const s = (p - duty) / (1 - duty);
      const e = s * s * (3 - 2 * s);
      return { hp: -A + 2 * A * e, kn: 0.1 + Math.sin(s * Math.PI) * 1.05 * w, an: lerp(0.35, -0.15, e) * w, stance: -1 };
    };
    const lL = leg(this.phase);
    const lR = leg((this.phase + 0.5) % 1);
    const D = (o, v, k = 14) => (o.rotation.x = damp(o.rotation.x, v, k, dt));
    D(J.hpL, moving ? lL.hp : 0);
    D(J.hpR, moving ? lR.hp : 0);
    D(J.knL, moving ? lL.kn : 0.06);
    D(J.knR, moving ? lR.kn : 0.06);
    G.anL = damp(G.anL, moving ? lL.an : 0, 14, dt);
    G.anR = damp(G.anR, moving ? lR.an : 0, 14, dt);
    const ph = this.phase * Math.PI * 2;
    // 골반 비틀림 · 처짐, 몸 오르내림
    J.hips.rotation.y = damp(J.hips.rotation.y, moving ? Math.sin(ph + Math.PI / 2) * 0.13 * w : 0, 8, dt);
    G.roll = damp(G.roll, moving ? Math.sin(ph) * 0.06 * w : 0, 8, dt);
    // 지지 다리 위에서 높고, 두 발이 모두 닿는 순간 가장 낮다 (+ 착지 충격으로 철렁)
    const jolt = moving ? Math.exp(-Math.min(lL.stance < 0 ? 9 : lL.stance, lR.stance < 0 ? 9 : lR.stance) * 9) : 0;
    G.bob = damp(G.bob, moving ? (-Math.cos(ph * 2) * 0.05 - jolt * 0.07) * w : 0, 16, dt);
    G.lean = damp(G.lean, moving ? 0.1 * w : 0, 4, dt);
    // 팔: 다리와 엇갈려 흔든다 (오른팔은 칼 무게로 덜)
    J.shL.rotation.x = damp(J.shL.rotation.x, moving ? lR.hp * -0.7 : 0.05, 8, dt);
    J.shR.rotation.x = damp(J.shR.rotation.x, moving ? lL.hp * -0.35 + 0.15 : 0.1, 8, dt);
    J.shL.rotation.z = damp(J.shL.rotation.z, 0, 8, dt);
    J.shR.rotation.z = damp(J.shR.rotation.z, 0, 8, dt);
    J.elL.rotation.x = damp(J.elL.rotation.x, -0.25 - Math.max(0, lR.hp) * 0.5, 8, dt);
    J.elR.rotation.x = damp(J.elR.rotation.x, -0.35, 8, dt);
    J.spine.rotation.y = damp(J.spine.rotation.y, 0, 6, dt);
    G.wrist = damp(G.wrist, 0, 8, dt);
    G.lunge = damp(G.lunge, 0, 6, dt);
    // 쿵쿵: 발뒤꿈치가 닿는 순간
    for (const [st, side] of [[lL.stance, 'L'], [lR.stance, 'R']]) {
      const key = '_down' + side;
      if (moving && st >= 0 && st < 0.12) {
        if (!this[key]) {
          this[key] = true;
          const foot = this.M ? this.M.rig.pos(side + '_toe', _v3) : null;
          const at = foot ? foot.setY(0.05) : this.root.position;
          this.ctx.sfx.play('punch_2', { at, vol: 0.45, rate: 0.38 });
          this.ctx.fx.fire.smoke(at, _v2.set(0, 0.3, 0), { size0: 0.3, size1: 1.1, life: 0.9, shade: 0.55, lit: 0, opacity: 0.22, drag: 2.5, rise: 0.2 });
          if (speed > 1.5) this.ctx.sfx.rumble(0.12, 0.15);
        }
      } else if (st < 0 || st > 0.3) this[key] = false;
    }
    this._pose(dt);
  }

  /** 걸음 · 공격 공통: 몸 위치, 숨, 뒤통수 뿔의 관성 */
  _pose(dt) {
    const G = this.G;
    this.breathT = (this.breathT ?? 0) + dt;
    G.breath = Math.sin(this.breathT * 1.3) * 0.025;
    if (this.state === 'act') {
      const prevY = this.body.position.y;
      this.body.position.y = G.bob;
      // 몸이 내려가면 뿔은 늦게 따라 내려온다
      G.hairLag = damp(G.hairLag, THREE.MathUtils.clamp((this.body.position.y - prevY) / Math.max(dt, 1e-3) * 0.6, -0.4, 0.4), 6, dt);
    }
    this.body.position.z = G.lunge;
  }
}
