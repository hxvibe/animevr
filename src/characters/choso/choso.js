// 쵸소우 — 가모가 상전 술식 「적혈조술(赤血操術)」
//  · 百斂(백렴): 두 주먹을 맞대 피를 한계까지 압축한다
//  · 穿血(천혈): 압축한 피를 두 손 사이에서 초음속으로 쏜다. 쏘는 동안 손을 움직이면 수압 커터처럼 벤다
//  · 超新星(초신성): 압축한 피를 공중에 띄워 두었다가 한꺼번에 사방으로 터뜨린다
//  · 赫鱗躍動・載(혁린약동・재): 혈류를 조작해 신체 능력을 끌어올린다 (주먹 위력 증가)
import * as THREE from 'three';
import { BloodOrb, BloodBeam, Supernova } from './vfx.js';

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
        { head: '百斂 / 穿血', color: '#ff2030', text: 'E 누르고 있기: 백렴(압축) → E를 떼면 천혈 발사 (발사 중 마우스로 베기)' },
        { head: '超新星', color: '#ff7a8a', text: 'E를 누른 채 Q: 압축한 피를 공중에 띄우기 · F: 모두 터뜨리기' },
        { head: '赫鱗躍動・載 / 흑섬', color: '#ffb0b0', text: 'G: 신체 강화 15초 · V: 주먹' },
      ];
    }
    return [
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
    const together = flat(L) && flat(R) && d < 0.15 && fromHead > 0.3 && fromHead < 0.9 && inFront && fingersFwd;
    // 穿血: 맞댄 손을 앞으로 내지르기
    const push = (L.vel.dot(_v2) + R.vel.dot(_v2)) * 0.5;
    const cancel = L.gesture === 'fist' && R.gesture === 'fist' && L.gestureTime > 0.1 && R.gestureTime > 0.1;
    return { src: 'hand', together, release: push > 0.9 && d < 0.22, apart: d > 0.32, cancel, lost: false };
  }

  /** 겨눔: 머리에서 손 쪽으로, 시선과 섞어서 */
  _aim(out, originOut) {
    const inp = this.ctx.input;
    if (inp.mode === 'desktop') {
      originOut.copy(inp.head).addScaledVector(inp.headDir, 0.55).add(_v3.set(0, -0.12, 0).applyQuaternion(inp.headQuat));
      return out.copy(inp.headDir);
    }
    const L = inp.left;
    const R = inp.right;
    const a = L.source === 'controller' ? L.pos : L.palm;
    const b = R.source === 'controller' ? R.pos : R.palm;
    originOut.addVectors(a, b).multiplyScalar(0.5);
    out.subVectors(originOut, inp.head).normalize().multiplyScalar(0.6).addScaledVector(inp.headDir, 0.4).normalize();
    originOut.addScaledVector(out, L.source === 'controller' ? 0.07 : 0.13); // 손끝 앞
    return out;
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
        const orb = new BloodOrb(this.ctx.scene, 0.02);
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
    if (P.together && this.energy > 0) {
      const add = Math.min(dt / 1.3, 1 - c.charge);
      c.charge += add;
      this.energy = Math.max(0, this.energy - add * 30);
    }
    c.orb.setRadius(0.022 + 0.045 * c.charge);
    c.orb.update(dt, 0.4 + c.charge);
    c.loop.set(0.6 + c.charge * 0.8, 0.8 + c.charge * 0.7);
    c.loop.pos(c.orb.pos);
    // 사방에서 피가 빨려 들어온다
    for (let i = 0; i < 3; i++) {
      _v3.randomDirection();
      if (_v3.dot(inp.headDir) < 0) _v3.addScaledVector(inp.headDir, -2 * _v3.dot(inp.headDir)); // 얼굴 쪽에서는 생기지 않게
      const from = _v2.copy(c.orb.pos).addScaledVector(_v3, 0.15 + Math.random() * 0.2);
      const vel = _v3.subVectors(c.orb.pos, from).multiplyScalar(3.2);
      fx.spawnDark(from, vel, Math.random() < 0.6 ? BLOOD : BLOOD_DARK, 0.012 + Math.random() * 0.01, 0.3, 0, 0, -0.5);
    }
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

  _endConv() {
    const c = this.conv;
    if (!c) return;
    c.loop.stop(0.2);
    this.conv = null;
  }

  _splashCancel() {
    const c = this.conv;
    if (!c) return;
    this.ctx.fx.burst(c.orb.pos, 24, BLOOD, 1.5, 0.02, 0.5, { dark: true });
    this.ctx.sfx.play('blood_splat', { at: c.orb.pos, vol: 0.5 });
    c.orb.dispose();
    this._endConv();
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
    const beam = new BloodBeam(this.ctx.scene);
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
    this.novas.push(new Supernova(this.ctx.scene, pos, power, maxLen));
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
  }
}
