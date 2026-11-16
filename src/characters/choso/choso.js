// 쵸소우 — 가모가 상전 술식 「적혈조술(赤血操術)」
//  · 百斂(백렴): 두 주먹을 맞대 피를 한계까지 압축한다
//  · 穿血(천혈): 압축한 피를 두 손 사이에서 초음속으로 쏜다. 쏘는 동안 손을 움직이면 수압 커터처럼 벤다
//  · 超新星(초신성): 압축한 피를 공중에 띄워 두었다가 한꺼번에 사방으로 터뜨린다
//  · 赫鱗躍動・載(혁린약동・재): 혈류를 조작해 신체 능력을 끌어올린다 (주먹 위력 증가)
import * as THREE from 'three';
import { BloodOrb, BloodBeam, Supernova, FluidView } from './vfx.js';
import { FluidSim, OWNER_FREE, OWNER_LEFT, OWNER_RIGHT, OWNER_CONV, OWNER_WRAP_L, OWNER_WRAP_R } from './fluid.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const BLOOD = new THREE.Color(0x8a0010);
const BLOOD_HI = new THREE.Color(0xff2a3a);
const BLOOD_DARK = new THREE.Color(0x3a0006);

export class Choso {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'choso';
    this.name = '쵸소우';
    this.energy = 100;
    this.maxEnergy = 100;
    this.conv = null; // 백렴 (압축 중)
    this.orbs = []; // 공중에 띄운 압축 혈액 (초신성 대기)
    this.beams = [];
    this.novas = [];
    this.pendingNova = [];
    this.buff = { t: 0, cd: 0, sign: 0, beat: 0 };
    this._together = 0;
    this._fireT = 0;
    this._detLock = false;
    // 피: 물처럼 움직이는 입자 유체 (손으로 꺼내고, 끌고, 던지고, 모은다)
    this.fluid = new FluidSim(260);
    this.view = new FluidView(ctx.scene, ctx.world.envMap, 260);
    this.hc = { left: this._handCtl(), right: this._handCtl() };
    this._emitAcc = 0;
    this._splatT = 0;
  }

  _handCtl() {
    return { emitAcc: 0, recallT: 0, throwCd: 0, drainT: 0, drainAcc: 0, drainDmg: 0, aimT: 0, wrap: null };
  }

  spend(x) {
    if (this.energy < x) {
      this.denied();
      return false;
    }
    this.energy -= x;
    return true;
  }

  denied(msg = '혈액 부족') {
    if (this._deniedT && this._deniedT > performance.now()) return;
    this._deniedT = performance.now() + 1500;
    this.ctx.sfx.denied();
    this.ctx.ui.callout(msg, { color: '#ff8a8a' });
  }

  /** 근접 공격 배율 (melee.js가 읽는다) */
  meleeMult() {
    return this.buff.t > 0 ? 2.6 : 1;
  }

  handBusy() {
    return !!this.conv;
  }

  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '피 다루기', color: '#ff6a7a', text: '한 손바닥을 위로 펴면 손끝에서 피가 나와 손 위에 물처럼 모임 · 손을 펴고 있으면 흩어진 피가 알아서 돌아옴\n휙 던지면 날아가 더미를 때림 · 두 손의 피를 가까이 대면 합쳐짐 · 편 손바닥을 적에게 향하면 적의 피를 뽑아옴' },
        { head: '赤縛 — 감싸서 조종', color: '#ff3a4a', text: '피를 든 채 검지로 대상을 가리키면 피가 날아가 감쌈 → 손을 움직이면 대상이 3배로 따라 움직임\n그대로 주먹을 쥐면 찌그러져 터짐 · 휙 던지면 대상을 던짐' },
        { head: '百斂(백렴) — 압축', color: '#ff4a5a', text: '편 두 손을 앞으로 뻗어 맞대고 유지 → 손끝 앞에 피가 모여 압축됨 (오래 모을수록 강함) · 두 주먹 쥐면 취소' },
        { head: '穿血(천혈) — 사출', color: '#ff2030', text: '백렴 중 맞댄 두 손을 앞으로 내지르기 → 초음속 피의 광선\n쏘는 동안 손을 움직이면 수압 커터처럼 벤다' },
        { head: '超新星(초신성)', color: '#ff7a8a', text: '백렴 중 두 손을 벌리기 → 압축한 피가 앞으로 날아가 떠 있음 (최대 6개)\n아무 손이나 검지로 가리키면 한꺼번에 터짐' },
        { head: '赫鱗躍動・載', color: '#ffb0b0', text: '양 손바닥을 얼굴 쪽으로 향해 얼굴 가까이 1초 → 15초 동안 주먹 위력 대폭 증가' },
        { head: '잡기 · 흑섬', color: '#ff3040', text: '더미에 손을 대고 주먹 → 잡기, 펴면 던지기 · 주먹으로 빠르게 치면 확률적으로 흑섬' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴 · R 더미 소환' },
        { head: '피 다루기', color: '#ff6a7a', text: '좌클릭 유지: 조준점에 피를 모아 붙잡기 → 떼면 던지기\n피를 든 채 C: 조준한 대상을 감싸 끌고 다님 · X 유지: 쥐어 터뜨리기 · C 다시: 던지기' },
        { head: '百斂 / 穿血', color: '#ff2030', text: 'E 누르고 있기: 백렴(압축) → E를 떼면 천혈 발사 (발사 중 마우스로 베기)' },
        { head: '超新星', color: '#ff7a8a', text: 'E를 누른 채 Q: 압축한 피를 공중에 띄우기 · F: 모두 터뜨리기' },
        { head: '赫鱗躍動・載 / 흑섬', color: '#ffb0b0', text: 'G: 신체 강화 15초 · V: 주먹' },
      ];
    }
    return [
      { head: '피 다루기', color: '#ff6a7a', text: '트리거 하나 유지: 피를 꺼내 붙잡기 (컨트롤러를 따라 출렁임) → 놓거나 휘두르면 던지기' },
      { head: '百斂 — 압축', color: '#ff4a5a', text: '두 컨트롤러를 맞대고 양쪽 트리거 유지' },
      { head: '穿血 — 사출', color: '#ff2030', text: '맞댄 채 트리거를 놓기 → 광선, 쏘는 동안 움직여 베기' },
      { head: '超新星', color: '#ff7a8a', text: '트리거를 쥔 채 두 손을 벌리면 피가 떠 있음 · A/X: 모두 터뜨리기' },
      { head: '赫鱗躍動・載', color: '#ffb0b0', text: '양쪽 스틱을 눌러 1초 · 그립 쥐고 휘둘러 치기 → 흑섬' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    let buff = '준비';
    if (this.buff.t > 0) buff = `발동 중 ${Math.ceil(this.buff.t)}s`;
    else if (this.buff.cd > 0) buff = `재사용 ${Math.ceil(this.buff.cd)}s`;
    return [
      { label: '혈액', bar: this.energy / this.maxEnergy, color: '#ff3040' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff9fa0' },
      { label: '압축', text: this.conv ? `${Math.round(this.conv.charge * 100)}%` : `대기 ${this.orbs.length}/6` },
      { label: '혁린약동', text: buff },
      { label: '처치', text: `${w.kills}` },
    ];
  }

  // ───────────────── 메인 ─────────────────
  update(dt) {
    const blocked = this.ctx.ui.menuOpen;
    this.energy = Math.min(this.maxEnergy, this.energy + (this.conv ? 0 : 11) * dt);
    if (!blocked) {
      this._updateConvergence(dt);
      this._updateDetonate(dt);
      this._updateBuffSign(dt);
    }
    this._updateFluid(dt, blocked);
    this._updateBeams(dt);
    this._updateOrbs(dt);
    this._updateNovas(dt);
    this._updateBuff(dt);
  }

  // ── 손 자세 ──
  _pose() {
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    if (inp.mode === 'desktop') {
      const e = inp.keyDown('KeyE');
      return { src: 'desk', together: e, release: !e, apart: inp.keyDown('KeyQ'), lost: false };
    }
    const ctrl = L.source === 'controller' || R.source === 'controller';
    const lost = !L.active || !R.active || L.uiBlock || R.uiBlock;
    if (lost) return { src: ctrl ? 'ctrl' : 'hand', together: false, release: false, apart: false, lost: true };
    const d = L.palm.distanceTo(R.palm);
    if (ctrl) {
      const both = L.btn.trigger && R.btn.trigger;
      const dd = L.pos.distanceTo(R.pos);
      return { src: 'ctrl', together: both && dd < 0.2, release: !L.btn.trigger && !R.btn.trigger && dd < 0.3, apart: both && dd > 0.35, lost: false };
    }
    // 百斂: 편 두 손을 앞으로 뻗어 맞댄 자세 (몸 앞, 손가락이 앞쪽)
    const flat = (h) => h.gesture === 'open' || h.gesture === 'none' || h.gesture === 'pinch';
    _v.addVectors(L.palm, R.palm).multiplyScalar(0.5);
    const fromHead = _v.distanceTo(inp.head);
    _v2.subVectors(_v, inp.head).normalize();
    const inFront = _v2.dot(inp.headDir) > 0.35;
    const fingersFwd = L.fingersDir.dot(_v2) > 0.25 && R.fingersDir.dot(_v2) > 0.25;
    const palmsUp = L.palmNormal.y > 0.5 && R.palmNormal.y > 0.5; // 두 손바닥을 위로 → 피를 합치는 중
    const together = flat(L) && flat(R) && d < 0.15 && fromHead > 0.3 && fromHead < 0.9 && inFront && fingersFwd && !palmsUp;
    // 穿血: 맞댄 손을 앞으로 내지르기
    const push = (L.vel.dot(_v2) + R.vel.dot(_v2)) * 0.5;
    const cancel = L.gesture === 'fist' && R.gesture === 'fist' && L.gestureTime > 0.1 && R.gestureTime > 0.1;
    return { src: 'hand', together, release: push > 0.9 && d < 0.22, apart: d > 0.32, cancel, lost: false };
  }

  /** 겨눔: 손만 기준 (두 손끝의 가운데 + 손가락 방향) — 고개를 움직여도 따라가지 않는다 */
  _aim(out, originOut) {
    const inp = this.ctx.input;
    if (inp.mode === 'desktop') {
      originOut.copy(inp.head).addScaledVector(inp.headDir, 0.55).add(_v3.set(0, -0.12, 0).applyQuaternion(inp.headQuat));
      return out.copy(inp.headDir);
    }
    const L = inp.left;
    const R = inp.right;
    if (L.source === 'controller' || R.source === 'controller') {
      originOut.addVectors(L.pos, R.pos).multiplyScalar(0.5);
      out.addVectors(L.dir, R.dir);
    } else {
      originOut.addVectors(L.indexTip, R.indexTip).multiplyScalar(0.5);
      out.addVectors(L.fingersDir, R.fingersDir);
    }
    if (out.lengthSq() < 1e-4) out.copy(inp.headDir);
    out.normalize();
    originOut.addScaledVector(out, 0.05);
    return out;
  }

  /** 손끝(검지·중지) 월드 위치 */
  _tips(h) {
    const out = [];
    if (h.source === 'hand' && h.joints) {
      const m = this.ctx.input.rig.matrixWorld;
      for (const n of ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip']) out.push(h.joints[n].clone().applyMatrix4(m));
    } else out.push(h.pos.clone().addScaledVector(h.dir, 0.03));
    return out;
  }

  /** 손끝에서 피를 흘려 내보낸다 */
  _emit(h, owner, rate, dt, toward = null) {
    const F = this.fluid;
    const c = this.hc[h.side] ?? this.hc.right;
    c.emitAcc += rate * dt;
    if (c.emitAcc < 1) return 0;
    const tips = h.source === 'desktop' ? [this.ctx.input.head.clone().addScaledVector(this.ctx.input.headDir, 0.6)] : this._tips(h);
    let made = 0;
    while (c.emitAcc >= 1) {
      c.emitAcc -= 1;
      if (F.n >= F.max || this.energy < 0.12) break;
      const t = tips[Math.floor(Math.random() * tips.length)];
      const v = toward ? _v.subVectors(toward, t).normalize().multiplyScalar(0.8) : _v.copy(h.source === 'hand' ? h.fingersDir : h.dir).multiplyScalar(0.4);
      v.add(h.vel ?? _v2.set(0, 0, 0));
      const j = 0.004;
      F.add(t.x + (Math.random() - 0.5) * j, t.y + (Math.random() - 0.5) * j, t.z + (Math.random() - 0.5) * j, v.x, v.y, v.z, owner);
      this.energy -= 0.12;
      made++;
    }
    return made;
  }

  // ── 피 조종 (유체) ──
  _updateFluid(dt, blocked) {
    const { input: inp, world, fx, sfx } = this.ctx;
    const F = this.fluid;
    F.bounds = this.ctx.env.bounds ?? null;
    this._noRecall = (this._noRecall ?? 0) - dt;
    if (!blocked && !this.conv) {
      if (inp.mode === 'desktop') this._deskBlood(dt);
      else {
        for (const h of inp.hands) this._handBlood(h, dt);
        this._mergeHands();
      }
    }
    // 물리 (프레임이 길면 나눠서)
    const steps = dt > 1 / 55 ? 2 : 1;
    this._absorbed = this._absorbed ?? 0;
    for (let k = 0; k < steps; k++) {
      F.step(Math.min(dt / steps, 1 / 45));
      this._absorbed += F.absorbed;
    }
    // 오래 고인 피는 서서히 스며든다
    for (let i = F.n - 1; i >= 0; i--) {
      if (F.rest[i] > 6) {
        F.life[i] -= dt * 0.5;
        if (F.life[i] <= 0) F.remove(i);
      }
    }
    // 빠르게 날아가는 피가 더미에 맞으면 피해
    this._splatT -= dt;
    for (const t of world.targets()) {
      const c = t.center ? t.center(_v2) : t.pos;
      let dmg = 0;
      const imp = _v3.set(0, 0, 0);
      for (let i = 0; i < F.n; i++) {
        if (F.owner[i] !== OWNER_FREE) continue;
        const i3 = i * 3;
        const vx = F.v[i3];
        const vy = F.v[i3 + 1];
        const vz = F.v[i3 + 2];
        const sp2 = vx * vx + vy * vy + vz * vz;
        if (sp2 < 9) continue;
        const dx = F.p[i3] - c.x;
        const dy = F.p[i3 + 1] - c.y;
        const dz = F.p[i3 + 2] - c.z;
        if (dx * dx + dy * dy + dz * dz > 1.2) continue;
        _v.set(F.p[i3], F.p[i3 + 1], F.p[i3 + 2]);
        if (t.distanceTo(_v) > 0.03) continue;
        const sp = Math.sqrt(sp2);
        dmg += sp * 0.9;
        imp.x += vx * 0.03;
        imp.y += vy * 0.03;
        imp.z += vz * 0.03;
        // 몸에 부딪혀 튀고 흘러내린다
        F.v[i3] *= -0.15;
        F.v[i3 + 1] *= -0.15;
        F.v[i3 + 2] *= -0.15;
      }
      if (dmg > 0) {
        t.damage(dmg, { type: 'blast', dir: imp.clone().normalize(), color: '#ff2030' });
        t.impulse?.(imp.clampLength(0, 6), 3);
        if (this._splatT <= 0) {
          this._splatT = 0.12;
          sfx.play('blood_splat', { at: c, vol: Math.min(0.8, 0.3 + dmg * 0.01) });
        }
      }
    }
    this.view.update(F);
    void fx;
  }

  /** 두 손에 든 피가 가까워지면 하나로 합친다 (더 많이 든 손으로) */
  _mergeHands() {
    const F = this.fluid;
    const A = F.ctrl[OWNER_LEFT];
    const B = F.ctrl[OWNER_RIGHT];
    if (!A.active || !B.active || this.hc.left.wrap || this.hc.right.wrap) return;
    if (Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z) > 0.22) return;
    const nl = F.count(OWNER_LEFT);
    const nr = F.count(OWNER_RIGHT);
    if (!nl || !nr) return;
    const from = nl < nr ? OWNER_LEFT : OWNER_RIGHT;
    const to = from === OWNER_LEFT ? OWNER_RIGHT : OWNER_LEFT;
    for (let i = 0; i < F.n; i++) if (F.owner[i] === from) F.owner[i] = to;
    this.ctx.sfx.play('blood_splat', { vol: 0.35, rate: 1.3 });
  }

  /** 핸드트래킹/컨트롤러로 피 다루기 */
  _handBlood(h, dt) {
    const F = this.fluid;
    const { world } = this.ctx;
    const owner = h.side === 'left' ? OWNER_LEFT : OWNER_RIGHT;
    const C = F.ctrl[owner];
    const hc = this.hc[h.side];
    hc.throwCd -= dt;
    if (hc.wrap) {
      this._updateWrap(h, hc, dt);
      return;
    }
    const drop = (vel = null) => {
      for (let i = 0; i < F.n; i++) {
        if (F.owner[i] !== owner) continue;
        F.owner[i] = OWNER_FREE;
        if (vel) {
          F.v[i * 3] += vel.x;
          F.v[i * 3 + 1] += vel.y;
          F.v[i * 3 + 2] += vel.z;
        }
      }
      C.active = false;
    };
    if (!h.active || h.uiBlock || this.ctx.grab?.isHolding(h.side)) {
      drop();
      hc.aimT = hc.drainT = hc.recallT = 0;
      return;
    }
    const hand = h.source === 'hand';
    const g = h.gesture;
    // 목표점: 편 손은 손바닥 위, 검지로 가리키면 손끝 앞으로 뻗은 물줄기
    if (hand && g === 'point') {
      C.x = h.pos.x + h.dir.x * 0.2;
      C.y = h.pos.y + h.dir.y * 0.2;
      C.z = h.pos.z + h.dir.z * 0.2;
    } else if (hand) {
      C.x = h.palm.x + h.palmNormal.x * 0.1;
      C.y = h.palm.y + h.palmNormal.y * 0.1;
      C.z = h.palm.z + h.palmNormal.z * 0.1;
    } else {
      C.x = h.pos.x + h.dir.x * 0.15;
      C.y = h.pos.y + h.dir.y * 0.15;
      C.z = h.pos.z + h.dir.z * 0.15;
    }
    C.vx = h.vel.x;
    C.vy = h.vel.y;
    C.vz = h.vel.z;
    Object.assign(C, { kp: 200, kd: 12, amax: 90, r0: g === 'point' ? 0.1 : 0.15, sag: 0.15, seekR: 0.3, vmax: 5, ks: 7, shell: 0 });
    const n = F.count(owner);
    // 던지기 (휙 뿌리기) / 놓기 (주먹)
    const flick = h.speed > 2.4 && hc.throwCd <= 0 && (hand ? g === 'open' || g === 'point' || g === 'none' : true);
    const letGo = hand ? g === 'fist' && h.gestureTime > 0.15 : !h.btn.trigger;
    if (n > 0 && (flick || letGo)) {
      if (flick) {
        hc.throwCd = 0.5;
        this._noRecall = 1.0;
        drop(_v.copy(h.vel).multiplyScalar(0.6));
        this.ctx.sfx.play('whoosh', { at: h.palm, vol: 0.5, rate: 0.8 });
        h.pulse(0.6, 50);
      } else drop();
      return;
    }
    C.active = n > 0;

    // ── 감싸기 겨누기: 피를 든 채 검지로 대상을 가리키면 피가 날아가 대상을 감싼다 ──
    if (hand ? g === 'point' : h.btn.a) {
      const t = n >= 25 ? this._aimTarget(h.pos, h.dir, 9, 0.95) : null;
      if (t) {
        hc.aimT += dt;
        if (hc.aimT > 0.2) {
          // 피를 대상에게 보낸다
          const c = t.center ? t.center(_v2) : t.pos;
          Object.assign(C, { x: c.x, y: c.y, z: c.z, vx: 0, vy: 0, vz: 0, seekR: 0.15, vmax: 9, ks: 9, amax: 140 });
          let near = 0;
          for (let i = 0; i < F.n; i++) {
            if (F.owner[i] !== owner) continue;
            if (Math.hypot(F.p[i * 3] - c.x, F.p[i * 3 + 1] - c.y, F.p[i * 3 + 2] - c.z) < 0.6) near++;
          }
          if (near >= n * 0.55) this._startWrap(h, hc, t);
        }
      } else hc.aimT = 0;
    } else hc.aimT = 0;

    // ── 꺼내기: 손바닥을 위로 펴면 손끝에서 피가 흘러나온다 (컨트롤러: 트리거 하나만) ──
    const other = this.ctx.input[h.side === 'left' ? 'right' : 'left'];
    const draw = hand ? g === 'open' && h.palmNormal.y > 0.55 && h.gestureTime > 0.25 && h.speed < 1 : h.btn.trigger && !other.btn?.trigger;
    if (draw && F.n < F.max) {
      const made = this._emit(h, owner, 45, dt);
      if (made) {
        C.active = true;
        if (Math.random() < 0.3) h.pulse(0.15, 15);
        if (!hc.drawSfx || hc.drawSfx < performance.now()) {
          hc.drawSfx = performance.now() + 900;
          this.ctx.sfx.play('blood_compress', { at: h.palm, vol: 0.35, rate: 1.2 });
        }
      }
    }

    // ── 되부르기: 손을 펴면 흩어지고 고인 피가 알아서 손으로 돌아온다 ──
    const openHand = hand ? g === 'open' && h.gestureTime > 0.2 : h.btn.grip;
    if (openHand && h.speed < 1.6 && !(this._noRecall > 0)) {
      let k = 0;
      for (let i = 0; i < F.n && k < 14; i++) {
        if (F.owner[i] !== OWNER_FREE) continue;
        const i3 = i * 3;
        const d = Math.hypot(F.p[i3] - h.palm.x, F.p[i3 + 1] - h.palm.y, F.p[i3 + 2] - h.palm.z);
        if (d > 9) continue;
        F.owner[i] = owner;
        F.life[i] = 1;
        F.rest[i] = 0;
        k++;
      }
      if (k) C.active = true;
    }

    // ── 적의 피 뽑기: 편 손바닥을 적(살아 있어도 됨)에게 향하고 유지 ──
    if (hand && g === 'open' && h.speed < 1.2 && F.n < F.max) {
      let best = null;
      let bd = 0.86;
      for (const d of world.dummies) {
        if (!d.alive || d.dying || d.heldBy) continue;
        const c = d.center(_v2);
        const to = _v3.subVectors(c, h.palm);
        const dist = to.length();
        if (dist > 7 || dist < 0.25) continue;
        const cos = to.dot(h.palmNormal) / dist;
        if (cos > bd) {
          bd = cos;
          best = d;
        }
      }
      if (best) {
        hc.drainT += dt;
        if (hc.drainT > 0.3) this._drain(h, hc, best, owner, dt);
      } else hc.drainT = 0;
    } else hc.drainT = 0;
  }

  /** 겨눈 방향 원뿔 안의 가장 가까운 대상 (더미는 머리~다리 어디를 가리켜도 됨) */
  _aimTarget(from, dir, maxD, minCos) {
    let best = null;
    let bestD = maxD;
    for (const t of this.ctx.world.targets()) {
      if (t.heldBy || t.held || t.dying) continue;
      const c = t.center ? t.center(_v2) : t.pos;
      const span = t.kind === 'dummy' ? 0.6 * t.scale : 0;
      let ok = false;
      let dist = Infinity;
      for (const dy of span ? [-span, 0, span] : [0]) {
        const to = _v3.set(c.x - from.x, c.y + dy - from.y, c.z - from.z);
        const d = to.length();
        if (d < 0.3) continue;
        if (to.dot(dir) / d >= minCos) {
          ok = true;
          dist = Math.min(dist, d);
        }
      }
      if (!ok || dist > bestD) continue;
      bestD = dist;
      best = t;
    }
    return best;
  }

  /** 적의 몸에서 피를 뽑아 손으로 끌어온다 */
  _drain(h, hc, t, owner, dt) {
    const F = this.fluid;
    hc.drainAcc += 32 * dt;
    const c = t.center(_v2);
    while (hc.drainAcc >= 1 && F.n < F.max) {
      hc.drainAcc -= 1;
      const d = _v.randomDirection().multiplyScalar(0.12 * t.scale);
      const p = _v3.copy(c).add(d);
      const v = _v.subVectors(h.palm, p).normalize().multiplyScalar(2.5);
      F.add(p.x, p.y, p.z, v.x, v.y, v.z, owner);
      hc.drainDmg += 1.4;
      this.energy = Math.min(this.maxEnergy, this.energy + 0.25);
    }
    F.ctrl[owner].active = true;
    if (hc.drainDmg >= 6) {
      t.damage(hc.drainDmg, { type: 'blast', dir: _v.subVectors(h.palm, c).normalize(), color: '#ff3040' });
      hc.drainDmg = 0;
      t.flash = Math.max(t.flash ?? 0, 0.05);
    }
    if (Math.random() < 0.2) h.pulse(0.2, 15);
    if (!hc.drainSfx || hc.drainSfx < performance.now()) {
      hc.drainSfx = performance.now() + 700;
      this.ctx.sfx.play('blood_compress', { at: c, vol: 0.4, rate: 0.9 });
    }
  }

  // ── 赤縛: 피로 감싸 원격 조작 · 쥐어 터뜨리기 ──
  _startWrap(h, hc, t) {
    const F = this.fluid;
    const owner = h.side === 'left' ? OWNER_LEFT : OWNER_RIGHT;
    const wo = h.side === 'left' ? OWNER_WRAP_L : OWNER_WRAP_R;
    const c = (t.center ? t.center(new THREE.Vector3()) : t.pos.clone());
    let cnt = 0;
    for (let i = 0; i < F.n; i++) {
      if (F.owner[i] !== owner) continue;
      F.owner[i] = wo;
      F.setOffset(i);
      cnt++;
    }
    F.ctrl[owner].active = false;
    // 감쌀 피가 모자라면 손끝에서 더 뽑아 덮는다
    for (let k = cnt; k < 150 && F.n < F.max && this.energy > 0.2; k++) {
      const d = _v.randomDirection().multiplyScalar(0.25);
      F.add(c.x + d.x, c.y + d.y, c.z + d.z, 0, 0, 0, wo);
      this.energy -= 0.12;
    }
    const dummy = t.kind === 'dummy';
    if (dummy) {
      if (t.grab({ drop: () => this._endWrap(h.side, null) }, c) === false) return;
    } else t.held = true;
    hc.wrap = {
      t, wo, dummy, cnt,
      anchorHand: (h.source === 'desktop' ? h.palm : h.palm).clone(),
      anchorT: c.clone(),
      crush: 0,
      baseScale: dummy ? t.root.scale.clone() : null,
      shell: dummy ? 0.2 * t.scale : Math.max(0.15, (t.radius ?? 0.2) * 1.05),
      shellY: dummy ? 3.4 : 1,
    };
    hc.aimT = 0;
    this.ctx.ui.manga({ top: '赤血操術', main: '赤縛', ruby: 'せきばく', color: '#ff2030', side: h.side });
    this.ctx.sfx.play('blood_splat', { at: c, vol: 0.8, rate: 0.8 });
    h.pulse?.(0.7, 80);
  }

  _endWrap(side, vel) {
    const hc = this.hc[side];
    const W = hc.wrap;
    if (!W) return;
    hc.wrap = null;
    const F = this.fluid;
    F.ctrl[W.wo].active = false;
    for (let i = 0; i < F.n; i++) {
      if (F.owner[i] !== W.wo) continue;
      F.owner[i] = OWNER_FREE;
      if (vel) {
        F.v[i * 3] += vel.x;
        F.v[i * 3 + 1] += vel.y;
        F.v[i * 3 + 2] += vel.z;
      }
    }
    const t = W.t;
    if (W.dummy) {
      if (t.heldBy && t.alive) t.release(vel ?? new THREE.Vector3());
    } else if (t.alive) {
      t.held = false;
      if (vel) {
        t.vel.copy(vel);
        t.asleep = false;
      }
    }
    hc.throwCd = 0.6;
    this._noRecall = 1.0;
  }

  _updateWrap(h, hc, dt) {
    const W = hc.wrap;
    const t = W.t;
    const F = this.fluid;
    const { fx, sfx, ui } = this.ctx;
    if (!t.alive) {
      this._endWrap(h.side, null);
      return;
    }
    if (!h.active || h.uiBlock) {
      this._endWrap(h.side, null);
      return;
    }
    // 손의 움직임을 3배로 키워 대상을 움직인다 (염력)
    const goal = _v.subVectors(h.palm, W.anchorHand).multiplyScalar(3).add(W.anchorT);
    goal.y = Math.max(W.dummy ? 0.9 : 0.3, goal.y);
    if (W.dummy) t.holdAt(goal);
    else t.pos.lerp(goal, 1 - Math.exp(-dt * 10));
    const c = t.center ? t.center(_v2) : t.pos;
    const K = F.ctrl[W.wo];
    const ck = Math.min(1, W.crush);
    Object.assign(K, {
      x: c.x, y: c.y, z: c.z, vx: 0, vy: 0, vz: 0, active: true,
      kp: 160 + 400 * ck, kd: 12, amax: 160, seekR: 0.5, vmax: 9, ks: 10,
      shell: W.shell * (1 - 0.7 * ck), shellY: W.shellY * (1 - 0.5 * ck),
    });
    const hand = h.source === 'hand';
    // 던지기
    if (h.speed > 2.6 && W.crush <= 0) {
      const v = _v3.copy(h.vel).multiplyScalar(3);
      if (v.length() > 20) v.setLength(20);
      this._endWrap(h.side, v);
      sfx.play('whoosh', { at: c, vol: 0.7, rate: 0.7 });
      return;
    }
    // 쥐어 터뜨리기: 감싼 채 주먹
    const fist = hand ? h.gesture === 'fist' && h.gestureTime > 0.12 : !!h.crush;
    if (fist) {
      W.crush += dt / 0.45;
      if (W.dummy && W.baseScale) {
        const k = Math.min(1, W.crush);
        t.root.scale.set(W.baseScale.x * (1 + 0.35 * k), W.baseScale.y * (1 - 0.55 * k), W.baseScale.z * (1 + 0.35 * k));
      }
      if (Math.random() < 0.5) h.pulse?.(0.3 + W.crush * 0.6, 20);
      if (!W.crSfx) {
        W.crSfx = true;
        sfx.play('blood_compress', { at: c, vol: 0.8, rate: 0.7 });
      }
      if (W.crush >= 1) {
        const pos = c.clone();
        const wo = W.wo;
        hc.wrap = null;
        F.ctrl[wo].active = false;
        // 감싼 피가 사방으로 터진다
        for (let i = 0; i < F.n; i++) {
          if (F.owner[i] !== wo) continue;
          F.owner[i] = OWNER_FREE;
          const d = _v.set(F.p[i * 3] - pos.x, F.p[i * 3 + 1] - pos.y, F.p[i * 3 + 2] - pos.z).normalize();
          F.v[i * 3] = d.x * 4;
          F.v[i * 3 + 1] = d.y * 4 + 1.5;
          F.v[i * 3 + 2] = d.z * 4;
        }
        if (W.dummy) t.release(new THREE.Vector3());
        else t.held = false;
        t.damage(999999, { type: 'shatter', color: '#ff2030' });
        this._spill(pos, 30, 4);
        fx.burst(pos, 60, BLOOD, 5, 0.03, 0.6, { dark: true });
        fx.flash(pos, BLOOD_HI, 6, 0.2);
        sfx.play('blood_burst', { at: pos, vol: 1 });
        sfx.shatter(pos);
        ui.manga({ main: '潰', ruby: 'つぶす', color: '#ff2030', side: h.side, dur: 0.8 });
        h.pulse?.(1, 150);
        hc.throwCd = 0.6;
        this._noRecall = 1.0;
      }
    } else if (W.crush > 0) {
      // 주먹을 풀면 원래대로
      W.crush = Math.max(0, W.crush - dt * 2);
      W.crSfx = false;
      if (W.dummy && W.baseScale) {
        const k = Math.min(1, W.crush);
        t.root.scale.set(W.baseScale.x * (1 + 0.35 * k), W.baseScale.y * (1 - 0.55 * k), W.baseScale.z * (1 + 0.35 * k));
      }
    }
  }

  /** 데스크톱: 좌클릭 유지 → 조준점에 피를 꺼내 붙잡고, 떼면 던진다 · 피를 든 채 C 감싸기(다시 C: 던지기) · X 유지 쥐어 터뜨리기 */
  _deskBlood(dt) {
    const inp = this.ctx.input;
    const F = this.fluid;
    const hc = this.hc.right;
    const cDown = inp.keyDown('KeyC');
    const cPressed = cDown && !this._cPrev;
    this._cPrev = cDown;
    const virt = { side: 'right', source: 'desktop', active: true, uiBlock: false, palm: inp.head.clone().addScaledVector(inp.headDir, 1.0), vel: new THREE.Vector3(), speed: 0, crush: inp.keyDown('KeyX'), dir: inp.headDir, pulse() {} };
    if (hc.wrap) {
      // 시선 방향으로 대상을 끌고 다닌다
      const W = hc.wrap;
      W.anchorT.copy(inp.head).addScaledVector(inp.headDir, W.deskDist ?? 3);
      W.anchorHand.copy(virt.palm);
      if (cPressed) {
        this._endWrap('right', inp.headDir.clone().multiplyScalar(12).add(_v.set(0, 2, 0)));
        return;
      }
      this._updateWrap(virt, hc, dt);
      return;
    }
    const C = F.ctrl[OWNER_RIGHT];
    if (cPressed && F.count(OWNER_RIGHT) >= 20) {
      const t = this._aimTarget(inp.head, inp.headDir, 12, 0.97);
      if (t) {
        const dist = Math.max(1.5, (t.center ? t.center(_v) : t.pos).distanceTo(inp.head));
        this._startWrap(virt, hc, t);
        if (hc.wrap) hc.wrap.deskDist = dist;
        return;
      }
    }
    const T = _v.copy(inp.head).addScaledVector(inp.headDir, 0.8);
    Object.assign(C, { x: T.x, y: T.y, z: T.z, vx: 0, vy: 0, vz: 0, kp: 200, kd: 12, amax: 80, r0: 0.15, sag: 0.15, seekR: 0.3, vmax: 5, ks: 7, shell: 0 });
    if (inp.mouse.left && !inp.keyDown('KeyE')) {
      C.active = true;
      this._emit({ side: 'right', source: 'desktop', vel: null, dir: inp.headDir }, OWNER_RIGHT, 45, dt);
    } else if (C.active) {
      C.active = false;
      this._noRecall = 1.0;
      const v = _v2.copy(inp.headDir).multiplyScalar(9).add(_v3.set(0, 1, 0));
      for (let i = 0; i < F.n; i++) {
        if (F.owner[i] !== OWNER_RIGHT) continue;
        F.owner[i] = OWNER_FREE;
        F.v[i * 3] += v.x;
        F.v[i * 3 + 1] += v.y;
        F.v[i * 3 + 2] += v.z;
      }
    }
  }

  // ── 百斂 ──
  _updateConvergence(dt) {
    const { input: inp, fx, sfx, ui } = this.ctx;
    const P = this._pose();
    const c = this.conv;
    if (!c) {
      const grabbing = this.ctx.grab?.isHolding('left') || this.ctx.grab?.isHolding('right');
      this._together = P.together && !grabbing ? this._together + dt : 0;
      const need = P.src === 'hand' ? 0.3 : 0.05;
      if (this._together >= need && !this._needRelease) {
        this._together = 0;
        if (!this.spend(8)) return;
        const orb = new BloodOrb(this.ctx.scene, 0.02, this.ctx.world.envMap);
        const aim = new THREE.Vector3();
        const pos = new THREE.Vector3();
        this._aim(aim, pos);
        orb.pos.copy(pos);
        this.conv = { orb, charge: 0, t: 0, src: P.src, aim, loop: sfx.loop({ sample: 'blood', base: 60, noiseF: 300, vol: 0.45 }) };
        ui.manga({ top: '赤血操術', main: '百斂', ruby: 'びゃくれん', color: '#ff2a3a' });
        sfx.play('blood_compress', { at: pos, vol: 0.9 });
        inp.left.pulse(0.6, 60);
        inp.right.pulse(0.6, 60);
      }
      if (!P.together) this._needRelease = false;
      return;
    }
    c.t += dt;
    const pos = _v.set(0, 0, 0);
    this._aim(c.aim, pos);
    c.orb.pos.lerp(pos, 1 - Math.exp(-dt * 20));
    if (P.together && this.energy > 0) c.charge = Math.min(1, c.charge + dt * 0.12);
    c.orb.setRadius(0.022 + 0.045 * c.charge);
    c.orb.update(dt, 0.4 + c.charge);
    c.loop.set(0.6 + c.charge * 0.8, 0.8 + c.charge * 0.7);
    c.loop.pos(c.orb.pos);
    // 손끝에서 피가 흘러나와 압축점으로 빨려 들어간다 (손에 들고 있던 피도 모두 모인다)
    const F = this.fluid;
    const K = F.ctrl[OWNER_CONV];
    Object.assign(K, { x: c.orb.pos.x, y: c.orb.pos.y, z: c.orb.pos.z, vx: 0, vy: 0, vz: 0, kp: 420, kd: 22, amax: 160, r0: 0.06, sag: 0, active: true, absorb: 0.02 + c.orb.radius * 0.6 });
    for (let i = 0; i < F.n; i++) if (F.owner[i] === OWNER_LEFT || F.owner[i] === OWNER_RIGHT) F.owner[i] = OWNER_CONV;
    if (P.together && c.charge < 1) {
      if (inp.mode === 'desktop') this._emit({ side: 'right', source: 'desktop', vel: null, dir: inp.headDir }, OWNER_CONV, 60, dt, c.orb.pos);
      else {
        this._emit(inp.left, OWNER_CONV, 40, dt, c.orb.pos);
        this._emit(inp.right, OWNER_CONV, 40, dt, c.orb.pos);
      }
    }
    c.charge = Math.min(1, c.charge + this._absorbed / 120);
    this._absorbed = 0;
    if (Math.random() < 0.5) {
      inp.left.pulse(0.15 + c.charge * 0.4, 20);
      inp.right.pulse(0.15 + c.charge * 0.4, 20);
    }
    if (c.charge >= 1 && !c.full) {
      c.full = true;
      fx.implode(c.orb.pos, 20, BLOOD_HI, 0.3, 0.25, 0.015);
      sfx.play('blood_splat', { at: c.orb.pos, vol: 0.5, rate: 1.4 });
    }

    // 추적이 끊기면 즉시 풀린다
    if (P.lost) {
      this._splashCancel();
      return;
    }
    if (P.apart && c.t > 0.15) {
      // 超新星 대기: 압축한 피를 그 자리에 띄운다
      if (c.charge >= 0.25) this._placeOrb();
      else this._splashCancel();
      this._needRelease = true;
      return;
    }
    if (P.cancel) {
      this._splashCancel();
      return;
    }
    if (P.release) {
      if (c.charge >= 0.2) this._fireBeam();
      else if (P.src !== 'hand') this._splashCancel();
      return;
    }
  }

  _endConv(spill = false) {
    const c = this.conv;
    if (!c) return;
    c.loop.stop(0.2);
    this.conv = null;
    const F = this.fluid;
    F.ctrl[OWNER_CONV].active = false;
    // 모이던 피: 쏘거나 띄우면 압축에 흡수, 취소하면 그대로 쏟아진다
    for (let i = F.n - 1; i >= 0; i--) {
      if (F.owner[i] !== OWNER_CONV) continue;
      if (spill) F.owner[i] = OWNER_FREE;
      else F.remove(i);
    }
  }

  /** 압축된 피를 액체로 쏟는다 */
  _spill(pos, amount, speed = 1.2) {
    const F = this.fluid;
    for (let k = 0; k < amount && F.n < F.max; k++) {
      const d = _v.randomDirection();
      F.add(pos.x + d.x * 0.02, pos.y + d.y * 0.02, pos.z + d.z * 0.02, d.x * speed, d.y * speed + 0.5, d.z * speed, OWNER_FREE);
    }
  }

  _splashCancel() {
    const c = this.conv;
    if (!c) return;
    this.ctx.sfx.play('blood_splat', { at: c.orb.pos, vol: 0.5 });
    this._spill(c.orb.pos, Math.round(20 + c.charge * 100), 0.8);
    c.orb.dispose();
    this._endConv(true);
  }

  _placeOrb() {
    const c = this.conv;
    const { sfx, ui } = this.ctx;
    if (this.orbs.length >= 6) this._detonate(this.orbs.shift(), 0);
    // 압축한 피를 겨눈 쪽으로 띄워 보낸다 (가까운 대상이 있으면 그 앞까지)
    const from = c.orb.pos.clone();
    const aim = c.aim.clone();
    let dist = 3;
    let best = 0.93;
    for (const t of this.ctx.world.targets()) {
      const tc = t.center ? t.center(new THREE.Vector3()) : t.pos;
      const to = tc.clone().sub(from);
      const d = to.length();
      if (d < 0.8 || d > 10) continue;
      const cos = to.normalize().dot(aim);
      if (cos > best) {
        best = cos;
        dist = d - 0.55;
      }
    }
    const goal = from.clone().addScaledVector(aim, dist);
    goal.y = Math.max(0.3, goal.y);
    this.orbs.push({ orb: c.orb, base: goal, from, fly: 0, charge: c.charge, t: Math.random() * 6 });
    sfx.play('blood_splat', { at: c.orb.pos, vol: 0.5, rate: 0.8 });
    if (this.orbs.length === 1) ui.callout('검지로 가리키면 超新星', { color: '#ff8a9a' });
    this._endConv();
  }

  // ── 穿血 ──
  _fireBeam() {
    const c = this.conv;
    const { fx, sfx, ui, input: inp } = this.ctx;
    const origin = c.orb.pos.clone();
    const dir = c.aim.clone();
    const charge = c.charge;
    c.orb.dispose();
    this._endConv();
    const beam = new BloodBeam(this.ctx.scene, this.ctx.world.envMap);
    this.beams.push({ beam, t: 0, dur: 0.35 + 0.9 * charge, charge, origin, dir, prevDir: dir.clone(), hitT: new Map(), src: inp.mode === 'desktop' ? 'desk' : 'hand' });
    ui.manga({ top: '赤血操術', main: '穿血', ruby: 'せんけつ', color: '#ff1020' });
    sfx.play('blood_beam', { at: origin, vol: 0.8 + 0.4 * charge, rate: 1.1 - 0.15 * charge });
    // 초음속: 총구의 충격파와 공기 고리
    fx.shockwave(origin, BLOOD_HI, 0.25 + 0.45 * charge, 0.3, { faceDir: dir });
    for (let i = 1; i <= 3; i++) {
      const at = origin.clone().addScaledVector(dir, i * i * 0.45);
      setTimeout(() => fx.shockwave(at, new THREE.Color(0xffd0d0), 0.15 + i * 0.12, 0.35, { faceDir: dir }), i * 30);
    }
    fx.flash(origin, BLOOD_HI, 6, 0.2);
    fx.burst(origin, 30, BLOOD, 3, 0.02, 0.4, { dark: true });
    inp.left.pulse(1, 200);
    inp.right.pulse(1, 200);
  }

  _updateBeams(dt) {
    const { input: inp, fx, world } = this.ctx;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const k = b.t / b.dur;
      // 쏘는 동안 손(시선)을 따라 방향이 움직인다 → 베기
      const lost = b.src === 'hand' && (!inp.left.active || !inp.right.active);
      if (!lost) {
        b.prevDir.copy(b.dir);
        this._aim(_v, _v2);
        b.dir.lerp(_v, 1 - Math.exp(-dt * 18)).normalize();
        b.origin.copy(_v2);
      }
      if (k >= 1 || lost) {
        b.beam.dispose();
        this.beams.splice(i, 1);
        continue;
      }
      const len = this._rayLength(b.origin, b.dir);
      const fade = k < 0.85 ? 1 : (1 - k) / 0.15;
      const radius = (0.012 + 0.016 * b.charge) * (k < 0.08 ? 1.8 - k * 10 : 1) * fade;
      b.beam.set(b.origin, b.dir, len, Math.max(0.002, radius), fade);
      b.beam.update(dt);
      // 착탄 지점: 피 튀김
      const end = _v3.copy(b.origin).addScaledVector(b.dir, len);
      if (Math.random() < 0.8) fx.spawnDark(end, _v.randomDirection().multiplyScalar(2).add(_v2.set(0, 1.5, 0)), BLOOD, 0.02 + Math.random() * 0.02, 0.5, 1, -6);
      if (Math.random() < 0.5) this._spill(end.clone().addScaledVector(b.dir, -0.05), 1, 2);
      if (Math.random() < 0.3) fx.spawn(end, _v.randomDirection().multiplyScalar(1.5), BLOOD_HI, 0.02, 0.2, 2, 0);
      // 광선이 닿은 대상
      const sweep = new THREE.Vector3().subVectors(b.dir, b.prevDir);
      for (const t of world.targets()) {
        const c = t.center ? t.center(_v2) : t.pos;
        const along = THREE.MathUtils.clamp(_v3.subVectors(c, b.origin).dot(b.dir), 0, len);
        const p = _v3.copy(b.origin).addScaledVector(b.dir, along);
        if (t.distanceTo(p) > 0.05 + radius) continue;
        const last = b.hitT.get(t) ?? -1;
        if (b.t - last < 0.12) continue;
        const first = last < 0;
        b.hitT.set(t, b.t);
        const n = new THREE.Vector3().crossVectors(b.dir, sweep.lengthSq() > 1e-6 ? sweep : UP).normalize();
        if (n.lengthSq() < 0.5) n.set(1, 0, 0);
        const dmg = first ? 60 + 110 * b.charge : 30 + 30 * b.charge;
        t.damage(dmg, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, p), push: b.dir.clone().multiplyScalar(3), dir: b.dir.clone(), color: '#ff2030' });
        t.impulse?.(_v.copy(b.dir).multiplyScalar(first ? 3 + 4 * b.charge : 0.8), 3);
        fx.burst(p, 18, BLOOD, 3, 0.025, 0.5, { dark: true });
        if (first) this.ctx.sfx.play('blood_splat', { at: p, vol: 0.7 });
      }
    }
  }

  /** 바닥·벽까지의 거리 (최대 40m) */
  _rayLength(o, d) {
    let len = 40;
    if (d.y < -1e-3) len = Math.min(len, (o.y - 0.01) / -d.y);
    const b = this.ctx.env.bounds;
    if (b) {
      if (d.x > 1e-3) len = Math.min(len, (b.maxX + 0.6 - o.x) / d.x);
      if (d.x < -1e-3) len = Math.min(len, (b.minX - 0.6 - o.x) / d.x);
      if (d.z > 1e-3) len = Math.min(len, (b.maxZ + 0.6 - o.z) / d.z);
      if (d.z < -1e-3) len = Math.min(len, (b.minZ - 0.6 - o.z) / d.z);
    }
    return Math.max(0.3, len);
  }

  // ── 超新星 ──
  _updateOrbs(dt) {
    for (const o of this.orbs) {
      o.t += dt;
      o.fly = Math.min(1, (o.fly ?? 1) + dt / 0.45);
      const e = 1 - Math.pow(1 - o.fly, 3);
      _v2.lerpVectors(o.from ?? o.base, o.base, e);
      o.orb.pos.copy(_v2).add(_v.set(Math.sin(o.t * 1.3) * 0.01, Math.sin(o.t * 2.1) * 0.015, 0));
      if (o.fly < 1 && Math.random() < 0.7) this.ctx.fx.spawnDark(o.orb.pos, _v.set(0, 0, 0), BLOOD, 0.015, 0.25, 1, 0, -0.5);
      o.orb.update(dt, 0.5 + 0.3 * Math.sin(o.t * 5));
    }
  }

  _updateDetonate(dt) {
    const inp = this.ctx.input;
    let det = false;
    if (inp.mode === 'desktop') det = inp.keyDown('KeyF');
    else {
      for (const h of inp.hands) {
        if (!h.active || h.uiBlock) continue;
        if (h.source === 'hand' && h.gesture === 'point' && h.gestureTime > 0.12) det = true;
        if (h.source === 'controller' && h.pressed('a')) det = true;
      }
    }
    if (!det) this._detLock = false;
    if (det && !this._detLock && this.orbs.length && !this.conv) {
      this._detLock = true;
      const list = this.orbs.splice(0);
      this.ctx.ui.manga({ top: '赤血操術', main: '超新星', ruby: 'ちょうしんせい', color: '#ff3a4a' });
      list.forEach((o, i) => this.pendingNova.push({ o, t: i * 0.07 }));
    }
    for (let i = this.pendingNova.length - 1; i >= 0; i--) {
      const p = this.pendingNova[i];
      p.t -= dt;
      if (p.t <= 0) {
        this._detonate(p.o, 0);
        this.pendingNova.splice(i, 1);
      }
    }
  }

  _detonate(o) {
    const { fx, sfx, world, input: inp } = this.ctx;
    const pos = o.orb.pos.clone();
    const power = 0.7 + 0.6 * o.charge;
    o.orb.dispose();
    // 가시가 플레이어 얼굴까지 덮치지 않게 길이 제한
    const maxLen = Math.max(0.15, pos.distanceTo(inp.head) - 0.25);
    this.novas.push(new Supernova(this.ctx.scene, pos, power, maxLen, this.ctx.world.envMap));
    const R = 1.6 + 1.2 * o.charge;
    world.forEachTarget(pos, R, (t, d, c) => {
      const k = 1 - Math.min(1, d / R) * 0.6;
      const dir = new THREE.Vector3().subVectors(c, pos).normalize();
      t.damage((50 + 110 * o.charge) * k, { type: 'blast', dir, color: '#ff2030' });
      t.impulse?.(dir.multiplyScalar(4 + 6 * o.charge).add(_v.set(0, 2, 0)), 5);
    });
    fx.flash(pos, BLOOD_HI, 8, 0.25);
    fx.sphereBlast(pos, 0xff3040, 0.5 + 0.6 * o.charge, 0.2);
    fx.shockwave(pos, BLOOD_HI, 1 + 1.2 * o.charge, 0.35, { faceDir: _v.subVectors(inp.head, pos).normalize().clone() });
    fx.burst(pos, 70, BLOOD, 5 + 4 * o.charge, 0.03, 0.7, { dark: true, drag: 1.5 });
    fx.burst(pos, 30, BLOOD_DARK, 3, 0.04, 0.9, { dark: true });
    sfx.play('blood_burst', { at: pos, vol: 0.8 + 0.4 * o.charge });
    this._spill(pos, Math.round(15 + 25 * o.charge), 3.5); // 터진 피가 흩뿌려져 떨어진다
    inp.left.pulse(0.6, 80);
    inp.right.pulse(0.6, 80);
  }

  _updateNovas(dt) {
    for (let i = this.novas.length - 1; i >= 0; i--) {
      if (!this.novas[i].update(dt)) {
        this.novas[i].dispose();
        this.novas.splice(i, 1);
      }
    }
  }

  // ── 赫鱗躍動・載 ──
  _updateBuffSign(dt) {
    const inp = this.ctx.input;
    const B = this.buff;
    B.cd = Math.max(0, B.cd - dt);
    let sign = false;
    if (inp.mode === 'desktop') sign = inp.keyDown('KeyG');
    else {
      const L = inp.left;
      const R = inp.right;
      if (L.active && R.active) {
        if (L.source === 'controller') sign = L.btn.stick && R.btn.stick;
        else {
          const ok = (h) => {
            if (h.gesture !== 'open') return false;
            _v.subVectors(inp.head, h.palm);
            const d = _v.length();
            return d < 0.32 && h.palmNormal.dot(_v.normalize()) > 0.5;
          };
          sign = ok(L) && ok(R) && !this.conv;
        }
      }
    }
    const need = inp.mode === 'desktop' ? 0.05 : 1;
    if (sign && B.t <= 0 && B.cd <= 0) {
      B.sign += dt;
      if (Math.random() < 0.4) {
        inp.left.pulse(0.2 + B.sign * 0.4, 20);
        inp.right.pulse(0.2 + B.sign * 0.4, 20);
      }
      if (B.sign >= need) {
        B.sign = 0;
        B.t = 15;
        B.cd = 30;
        this.ctx.ui.manga({ top: '赤血操術', main: '赫鱗躍動・載', ruby: 'せきりんやくどう・さい', color: '#ff2030' });
        this.ctx.sfx.play('heartbeat', { vol: 1 });
        this.ctx.sfx.play('charge_rise', { vol: 0.5, rate: 0.7 });
        for (const h of inp.hands) this.ctx.fx.burst(h.palm, 30, BLOOD_HI, 2, 0.02, 0.5);
      }
    } else if (!sign) B.sign = 0;
    else if (B.t > 0 || B.cd > 0) {
      if (!this._cdMsg) this.ctx.ui.callout(B.t > 0 ? '이미 발동 중' : `재사용 대기 ${Math.ceil(B.cd)}s`);
      this._cdMsg = true;
    }
    if (!sign) this._cdMsg = false;
  }

  _updateBuff(dt) {
    const B = this.buff;
    if (B.t <= 0) return;
    B.t -= dt;
    const { fx, input: inp } = this.ctx;
    B.beat -= dt;
    if (B.beat <= 0) {
      B.beat = 0.75;
      this.ctx.sfx.play('heartbeat', { vol: 0.35 });
    }
    // 손에서 붉은 혈류가 피어오른다
    for (const h of inp.hands) {
      if (!h.active || h.source === 'desktop') continue;
      if (Math.random() < 0.6) fx.spawn(_v.copy(h.palm).add(_v2.randomDirection().multiplyScalar(0.05)), _v3.set(0, 0.25, 0), BLOOD_HI, 0.012, 0.4, 1, 0, -0.3);
    }
    if (B.t <= 0) this.ctx.ui.callout('赫鱗躍動 해제', { color: '#ffb0b0' });
  }

  dispose() {
    for (const side of ['left', 'right']) if (this.hc[side].wrap) this._endWrap(side, null);
    if (this.conv) {
      this.conv.orb.dispose();
      this._endConv();
    }
    for (const o of this.orbs) o.orb.dispose();
    for (const p of this.pendingNova) p.o.orb.dispose();
    for (const b of this.beams) b.beam.dispose();
    for (const n of this.novas) n.dispose();
    this.orbs = [];
    this.beams = [];
    this.novas = [];
    this.pendingNova = [];
    this.view.dispose();
  }
}
