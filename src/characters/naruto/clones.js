// 그림자 분신: 차크라로 만든 실체가 있는 분신. 더미 모델을 차크라 빛깔로 칠해 쓴다.
// 가장 가까운 더미에게 달려가 둘러싸고 연타 → 다섯 번째에 걷어차 띄운다.
import * as THREE from 'three';
import { dummyTemplate } from '../../core/dummy.js';
import { poofSmoke } from './vfx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CLONE_COLOR = 0xfff3e6;
const CLONE_GLOW = 0xff5a00;
const CLONE_GOLD = 0xffb000;

function buildBody(world, gold) {
  const tpl = dummyTemplate();
  const root = new THREE.Group();
  // 차크라로 빚은 몸: 하얀 바탕에 주황(구미 모드는 금빛) 빛이 배어 나온다. 주황색 돌격형 더미와 헷갈리지 않게
  const color = CLONE_COLOR;
  const emis = gold ? CLONE_GOLD : CLONE_GLOW;
  const mats = [];
  let J;
  if (tpl) {
    const model = tpl.model.clone(true);
    root.add(model);
    const map = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      let m = map.get(o.material);
      if (!m) {
        m = o.material.clone();
        const dark = m.color.r + m.color.g + m.color.b < 0.1;
        if (!dark) m.color.set(color);
        m.emissive = new THREE.Color(dark ? 0x000000 : emis);
        m.emissiveIntensity = 0.8;
        m.envMap = world.envMap;
        m.envMapIntensity = 0.5;
        map.set(o.material, m);
        mats.push(m);
      }
      o.material = m;
    });
    const g = (k) => model.getObjectByName('J_' + k);
    J = { hips: g('hips'), spine: g('chest'), head: g('head'), shL: g('shL'), elL: g('elL'), shR: g('shR'), elR: g('elR'), hpL: g('hpL'), knL: g('knL'), hpR: g('hpR'), knR: g('knR') };
  } else {
    // 모델이 없을 때: 단순한 인간형
    const m = new THREE.MeshStandardMaterial({ color, emissive: emis, emissiveIntensity: 0.8, roughness: 0.5, flatShading: true });
    mats.push(m);
    const box = (w, h, d, parent, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const joint = (parent, x, y, z) => {
      const j = new THREE.Group();
      j.position.set(x, y, z);
      parent.add(j);
      return j;
    };
    const hips = joint(root, 0, 0.92, 0);
    const spine = joint(hips, 0, 0.08, 0);
    box(0.34, 0.5, 0.2, spine, 0, 0.25, 0);
    const head = joint(spine, 0, 0.62, 0);
    box(0.2, 0.22, 0.2, head, 0, 0.05, 0);
    const arm = (s) => {
      const sh = joint(spine, 0.22 * s, 0.45, 0);
      box(0.08, 0.3, 0.08, sh, 0, -0.15, 0);
      const el = joint(sh, 0, -0.3, 0);
      box(0.07, 0.28, 0.07, el, 0, -0.14, 0);
      return { sh, el };
    };
    const leg = (s) => {
      const hp = joint(hips, 0.1 * s, -0.02, 0);
      box(0.11, 0.45, 0.11, hp, 0, -0.22, 0);
      const kn = joint(hp, 0, -0.45, 0);
      box(0.09, 0.43, 0.09, kn, 0, -0.21, 0);
      return { hp, kn };
    };
    const aL = arm(1);
    const aR = arm(-1);
    const lL = leg(1);
    const lR = leg(-1);
    J = { hips, spine, head, shL: aL.sh, elL: aL.el, shR: aR.sh, elR: aR.el, hpL: lL.hp, knL: lL.kn, hpR: lR.hp, knR: lR.kn };
  }
  return { root, J, mats };
}

export class ShadowClone {
  constructor(owner, pos, slot, gold = false) {
    this.owner = owner;
    this.ctx = owner.ctx;
    const b = buildBody(this.ctx.world, gold);
    this.root = b.root;
    this.J = b.J;
    this.mats = b.mats;
    this.root.position.copy(pos);
    this.slot = slot; // 대상 둘레에서 설 자리 (플레이어 반대쪽 기준 각도 차이, -1.3..1.3)
    this.yaw = 0;
    this.t = Math.random() * 10;
    this.life = 30 + Math.random() * 2;
    this.alive = true;
    this.target = null;
    this.punchT = 0;
    this.punchCd = 0.2 + Math.random() * 0.3;
    this.hits = 0;
    this.arm = 0;
    this.retargetT = 0;
    this.hopT = 0;
    this.faceTo(this.ctx.input.head, true);
    this.ctx.scene.add(this.root);
  }

  center(out = new THREE.Vector3()) {
    return out.copy(this.root.position).add(_v2.set(0, 1.05, 0));
  }

  setGold(on) {
    for (const m of this.mats) {
      if (m.color.r + m.color.g + m.color.b < 0.1) continue;
      m.emissive.set(on ? CLONE_GOLD : CLONE_GLOW);
    }
  }

  faceTo(p, snap = false) {
    _v.subVectors(p, this.root.position).setY(0);
    if (_v.lengthSq() < 1e-4) return;
    const want = Math.atan2(_v.x, _v.z);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw = snap ? want : this.yaw + d * 0.25;
    this.root.quaternion.setFromAxisAngle(UP, this.yaw);
  }

  poof() {
    if (!this.alive) return;
    this.alive = false;
    poofSmoke(this.ctx.fx, this.center(_v), 1.1);
    this.ctx.sfx.play('poof', { at: _v, vol: 0.7 });
    this.ctx.scene.remove(this.root);
    for (const m of this.mats) m.dispose();
  }

  _pickTarget() {
    const W = this.ctx.world;
    let best = null;
    let bd = 25;
    const count = new Map();
    for (const c of this.owner.clones) if (c !== this && c.target) count.set(c.target, (count.get(c.target) ?? 0) + 1);
    for (const d of W.dummies) {
      if (!d.alive || d.dying || d.heldBy) continue;
      const dist = d.root.position.distanceTo(this.root.position) + (count.get(d) ?? 0) * 1.5;
      if (dist < bd) {
        bd = dist;
        best = d;
      }
    }
    return best;
  }

  _legs(speed, dt) {
    const J = this.J;
    const a = speed > 0 ? Math.sin(this.t * 11) * 0.8 : 0;
    const L = (o, v) => (o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, v, Math.min(1, dt * 12)));
    L(J.hpL, a);
    L(J.hpR, -a);
    L(J.knL, speed > 0 ? Math.max(0, -a) * 1.3 + 0.15 : 0.1);
    L(J.knR, speed > 0 ? Math.max(0, a) * 1.3 + 0.15 : 0.1);
    // 닌자 달리기: 상체를 숙이고 팔을 뒤로
    L(J.spine, speed > 0 ? 0.45 : 0.05);
    if (speed > 0) {
      L(J.shL, 0.9);
      L(J.shR, 0.9);
      L(J.elL, -0.2);
      L(J.elR, -0.2);
    }
  }

  update(dt) {
    if (!this.alive) return;
    const { world, input, fx, sfx } = this.ctx;
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.poof();
      return;
    }
    // 총알에 맞으면 펑
    const c = this.center(_v);
    for (const b of world.bullets) {
      if (b.alive && b.pos.distanceTo(c) < 0.4) {
        world.removeBullet(b);
        this.poof();
        return;
      }
    }
    this.retargetT -= dt;
    if (!this.target || !this.target.alive || this.target.heldBy || this.retargetT <= 0) {
      this.target = this._pickTarget();
      this.retargetT = 1.5;
    }
    const J = this.J;
    const P = this.root.position;
    const t = this.target;
    let speed = 0;
    if (t) {
      const tp = t.root.position;
      const flying = t.state === 'air' || t.state === 'held';
      // 대상 둘레의 자기 자리: 플레이어와 대상 사이는 비워 두고 옆·뒤에서 친다
      const ring = 0.72 * (t.scale ?? 1);
      const away = Math.atan2(tp.x - input.head.x, tp.z - input.head.z) + this.slot;
      const want = _v2.set(tp.x + Math.sin(away) * ring, 0, tp.z + Math.cos(away) * ring);
      // 자리가 플레이어 개인 공간 안이면 바깥으로 밀어 낸다 (닿지 못하고 맴도는 일 방지)
      const wx = want.x - input.head.x;
      const wz = want.z - input.head.z;
      const wd = Math.hypot(wx, wz);
      if (wd < 1.05 && wd > 1e-3) want.set(input.head.x + (wx / wd) * 1.05, 0, input.head.z + (wz / wd) * 1.05);
      const B0 = this.ctx.env.bounds;
      if (B0) {
        want.x = THREE.MathUtils.clamp(want.x, B0.minX + 0.3, B0.maxX - 0.3);
        want.z = THREE.MathUtils.clamp(want.z, B0.minZ + 0.3, B0.maxZ - 0.3);
      }
      const toWant = _v.subVectors(want, P).setY(0);
      const dist = toWant.length();
      const toT = Math.hypot(tp.x - P.x, tp.z - P.z);
      if (this.punchT > 0) {
        // 주먹: 0.22초 안에 뻗었다 거둔다
        this.punchT -= dt;
        const k = 1 - this.punchT / 0.22;
        const ext = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55;
        const sh = this.arm ? J.shR : J.shL;
        const el = this.arm ? J.elR : J.elL;
        const other = this.arm ? J.shL : J.shR;
        sh.rotation.x = (-Math.PI / 2) * ext;
        el.rotation.x = -0.15 * (1 - ext);
        other.rotation.x = THREE.MathUtils.lerp(other.rotation.x, -0.9, dt * 10);
        if (this.kick) {
          J.hpR.rotation.x = -1.6 * ext;
          J.knR.rotation.x = 0.2 * (1 - ext);
        }
        if (!this._hit && k > 0.42) {
          this._hit = true;
          this._strike(t);
        }
        this.faceTo(tp);
        this._legs(0, dt);
      } else if (dist > 0.18 && !(toT < ring + 0.15 && dist < 0.5)) {
        // 달려간다 (멀리 날아간 대상도 쫓는다)
        const sp = Math.min(5, 2 + dist * 2);
        P.addScaledVector(toWant.normalize(), Math.min(dist, sp * dt));
        speed = sp;
        this.faceTo(flying ? tp : _v2.copy(P).add(toWant));
        this._legs(sp, dt);
      } else {
        this.faceTo(tp);
        this._legs(0, dt);
        this.punchCd -= dt;
        if (this.punchCd <= 0 && !flying) {
          this.hits++;
          this.kick = this.hits % 5 === 0;
          this.arm = 1 - this.arm;
          this.punchT = 0.22;
          this.punchCd = this.kick ? 0.9 : 0.3 + Math.random() * 0.12;
          this._hit = false;
        }
      }
    } else {
      // 대상이 없으면 플레이어 앞쪽에 줄지어 대기
      const fwd = _v2.copy(input.headDir).setY(0);
      if (fwd.lengthSq() < 1e-3) fwd.set(0, 0, -1);
      fwd.normalize();
      // 플레이어 앞에 부채꼴로 줄을 선다
      const list = this.owner.clones;
      const i = list.indexOf(this);
      const n = list.length;
      const a = Math.atan2(fwd.x, fwd.z) + (i - (n - 1) / 2) * Math.min(0.32, 2.4 / Math.max(1, n));
      const rr = 1.9 + (n > 6 ? (i % 2) * 0.7 : 0);
      const want = _v.set(input.head.x + Math.sin(a) * rr, 0, input.head.z + Math.cos(a) * rr);
      const toWant = want.sub(P).setY(0);
      const dist = toWant.length();
      if (dist > 0.2) {
        const sp = Math.min(4, 1 + dist * 2);
        P.addScaledVector(toWant.normalize(), Math.min(dist, sp * dt));
        speed = sp;
        this.faceTo(_v2.copy(P).add(toWant));
      } else this.faceTo(_v2.copy(input.head));
      this._legs(speed, dt);
      for (const sh of [J.shL, J.shR]) sh.rotation.x = THREE.MathUtils.lerp(sh.rotation.x, speed ? 0.9 : 0, dt * 6);
      J.spine.rotation.x = THREE.MathUtils.lerp(J.spine.rotation.x, speed ? 0.45 : 0.02 + Math.sin(this.t * 2) * 0.02, dt * 6);
    }
    // 플레이어 바로 앞을 막지 않도록 개인 공간(1m) 밖으로
    const hx = P.x - input.head.x;
    const hz = P.z - input.head.z;
    const hd = Math.hypot(hx, hz);
    if (hd < 1) {
      const k = hd > 1e-3 ? 1 / hd : 0;
      P.x = input.head.x + (hd > 1e-3 ? hx * k : 1);
      P.z = input.head.z + (hd > 1e-3 ? hz * k : 0);
    }
    // 가볍게 통통 튀며 달린다
    P.y = speed > 0 ? Math.abs(Math.sin(this.t * 11)) * 0.06 : 0;
    const B = this.ctx.env.bounds;
    if (B) {
      P.x = THREE.MathUtils.clamp(P.x, B.minX + 0.3, B.maxX - 0.3);
      P.z = THREE.MathUtils.clamp(P.z, B.minZ + 0.3, B.maxZ - 0.3);
    }
    if (Math.random() < (this.owner.kurama ? 0.5 : 0.08)) fx.spawn(_v.copy(P).add(_v2.set((Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 1.4, (Math.random() - 0.5) * 0.4)), _v2.set(0, 0.6, 0), this.owner.kurama ? new THREE.Color(0xffa020) : new THREE.Color(0xff8030), 0.03, 0.4, 1, -0.5);
    void sfx;
  }

  _strike(t) {
    const { fx, sfx } = this.ctx;
    if (!t.alive) return;
    const mul = this.owner.kurama ? 1.8 : 1;
    const hp = this.arm ? this.J.shR : this.J.shL;
    const at = hp.getWorldPosition(_v);
    at.y = Math.max(at.y, 1.0);
    // 플레이어 쪽으로 밀려오지 않게, 맞은 대상은 플레이어 반대쪽으로 날아간다
    const head = this.ctx.input.head;
    const dir = _v2.subVectors(t.center(new THREE.Vector3()), head).setY(0);
    if (dir.lengthSq() < 1e-4) dir.subVectors(t.center(new THREE.Vector3()), this.root.position).setY(0);
    dir.normalize();
    if (this.kick) {
      // 다섯 번째: 걷어차 띄운다
      t.damage(20 * mul, { type: 'punch', dir });
      t.impulse(dir.clone().multiplyScalar(2.5 * mul).add(_v.set(0, 6 + 2 * mul, 0)), 6);
      fx.burst(t.center(new THREE.Vector3()), 18, new THREE.Color(0xffd0a0), 3, 0.04, 0.35);
      sfx.punch(at);
    } else {
      t.damage(9 * mul, { type: 'punch', dir });
      t.impulse(dir.clone().multiplyScalar(0.6 * mul).add(_v.set(0, 0.2, 0)), 0);
      fx.burst(t.center(new THREE.Vector3()).addScaledVector(dir, -0.2), 6, new THREE.Color(0xffffff), 1.5, 0.025, 0.2);
      sfx.play('punch', { at, vol: 0.45, rate: 1.2, jitter: 0.12 });
    }
  }
}
