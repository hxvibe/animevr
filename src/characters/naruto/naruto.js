// 우즈마키 나루토 — 차크라 · 풍둔
//  · 螺旋丸(나선환): 손바닥 위에 차크라를 고속 회전시켜 압축한 구 → 직접 박아 넣거나 밀어 던진다
//  · 風遁・螺旋手裏剣(풍둔・나선수리검): 나선환에 바람 성질을 더한 수리검 → 착탄하면 바람 칼날 구로 퍼진다
//  · 影分身の術(그림자 분신술): 실체가 있는 분신을 만들어 함께 싸운다 (오래 유지하면 다중 그림자 분신)
//  · 九喇嘛モード(구미 차크라 모드): 금빛 차크라를 둘러 모든 기술이 강해진다
import * as THREE from 'three';
import { RasenganOrb, WindSphere, WindNeedles, poofSmoke } from './vfx.js';
import { ShadowClone } from './clones.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const C = {
  blue: new THREE.Color(0x3aa0ff),
  blueHi: new THREE.Color(0xcfeeff),
  white: new THREE.Color(0xffffff),
  gold: new THREE.Color(0xffb020),
  goldHi: new THREE.Color(0xffe8a0),
  orange: new THREE.Color(0xff6a10),
};
const MAX_CLONES = 10;

export class Naruto {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'naruto';
    this.name = '우즈마키 나루토';
    this.domainLabel = '구미 모드';
    this.reviveText = '쓰러졌다… 구라마의 차크라로 회복';
    this.energy = 100;
    this.maxEnergy = 100;
    this.hs = { left: this._hs(), right: this._hs() };
    this.thrown = []; // 던진 나선환
    this.shurikens = []; // 날아가는 나선수리검
    this.winds = []; // 터진 바람 칼날 구
    this.clones = [];
    this.sign = { t: 0, stage: 0, lost: 0 };
    this.kuramaT = 0; // 남은 시간
    this.domain = { sign: 0, cd: 0, duration: 25, auto: false, lost: 0 };
    this.needles = new WindNeedles(ctx.scene, 220);
    this.signRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    ctx.scene.add(this.signRing);
    this._mangaCd = 0;
  }

  _hs() {
    return { mode: null, orb: null, power: 0, t: 0, raise: 0, loop: null, pose: 0 };
  }

  get kurama() {
    return this.kuramaT > 0;
  }

  get costMul() {
    return this.kurama ? 0.5 : 1;
  }

  spend(x) {
    const c = x * this.costMul;
    if (this.energy < c) {
      this.denied();
      return false;
    }
    this.energy -= c;
    return true;
  }

  denied(msg = '차크라 부족') {
    if (this._deniedT && this._deniedT > performance.now()) return;
    this._deniedT = performance.now() + 1500;
    this.ctx.sfx.denied();
    this.ctx.ui.callout(msg, { color: '#ffb07a' });
  }

  // ── 메뉴/HUD ──
  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '螺旋丸(나선환)', color: '#7fc4ff', text: '손바닥을 위로 펴고 잠깐 기다리면 생성 → 더미에 그대로 박아 넣기\n손바닥을 앞으로 빠르게 밀면 던짐 · 주먹을 쥐면 사라짐' },
        { head: '風遁・螺旋手裏剣(풍둔・나선수리검)', color: '#cfeeff', text: '나선환을 든 손을 머리 위로 0.7초 들어 올리기 → 크게 휘둘러 던지기\n맞은 자리에 바람 칼날 구가 퍼져 안의 모든 것을 잘게 썬다' },
        { head: '影分身の術(그림자 분신술)', color: '#ffb070', text: '양손 검지·중지를 펴서 가슴 앞에서 십자로 겹치기 0.4초 → 분신 3명\n계속 유지(1.4초)하면 다중 그림자 분신 · 분신은 30초 뒤 사라짐' },
        { head: '九喇嘛モード(구미 차크라 모드)', color: '#ffc040', text: '양 주먹을 가슴 앞에서 맞대고 1.5초 → 25초 동안 모든 기술 강화\n켜진 상태에서 같은 자세 1.5초 → 해제 · 설정에서 손동작 끄기 / 메뉴에서 발동' },
        { head: '잡기 · 주먹', color: '#ffffff', text: '더미에 손을 대고 주먹 → 잡기, 펴면 던지기 · 주먹으로 빠르게 치기' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴 · R 더미 소환' },
        { head: '螺旋丸 / 螺旋手裏剣', color: '#7fc4ff', text: '좌클릭 유지: 나선환 생성 → 놓으면 던짐\n나선환을 든 채 우클릭: 나선수리검으로 변환 → 좌클릭을 놓으면 던짐' },
        { head: '影分身 / 九喇嘛', color: '#ffb070', text: 'C: 그림자 분신술 (1.4초 유지 → 다중) · Q 1.5초: 구미 차크라 모드 · V 주먹' },
      ];
    }
    return [
      { head: '螺旋丸(나선환)', color: '#7fc4ff', text: '트리거 유지: 그 손에 나선환 → 더미에 대거나 앞으로 찔러 던지기 · 트리거를 놓으면 사라짐' },
      { head: '風遁・螺旋手裏剣', color: '#cfeeff', text: '나선환을 든 컨트롤러를 머리 위로 0.7초 → 휘둘러 던지기' },
      { head: '影分身の術', color: '#ffb070', text: 'X 버튼: 분신 3명 (1초 유지하면 다중 그림자 분신)' },
      { head: '九喇嘛モード', color: '#ffc040', text: '양쪽 스틱을 눌러 1.5초 (메뉴에서도 발동)' },
      { head: '버튼', color: '#ffffff', text: '그립: 더미 잡기/던지기 · 그립 쥐고 휘둘러 치기 · B 더미 소환 · Y 메뉴' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const d = this.domain;
    let mode = '준비';
    if (this.kurama) mode = `발동 중 ${Math.ceil(this.kuramaT)}s`;
    else if (d.cd > 0) mode = `재사용 ${Math.ceil(d.cd)}s`;
    return [
      { label: '차크라', bar: this.energy / this.maxEnergy, color: this.kurama ? '#ffc040' : '#6fb8ff' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff6f7f' },
      { label: '분신', text: `${this.clones.length}명` },
      { label: '구미', text: mode, textColor: this.kurama ? '#ffd060' : '#dfe6ff' },
      { label: '처치', text: `${w.kills}` },
    ];
  }

  handBusy(side) {
    return !!this.hs[side].mode;
  }

  // ── 메인 ──
  update(dt) {
    const { input: inp } = this.ctx;
    const blocked = this.ctx.ui.menuOpen;
    this.energy = Math.min(this.maxEnergy, this.energy + (this.kurama ? 20 : 10) * dt);
    this._mangaCd -= dt;
    if (!blocked) {
      this._updateKuramaSign(dt);
      this._updateCloneSign(dt);
      if (inp.mode === 'desktop') this._desktop(dt);
      else for (const side of ['left', 'right']) this._updateHand(side, dt);
    }
    this._updateThrown(dt);
    this._updateShurikens(dt);
    this._updateWinds(dt);
    for (const c of this.clones) c.update(dt);
    if (this.clones.some((c) => !c.alive)) this.clones = this.clones.filter((c) => c.alive);
    this._updateKurama(dt);
    this.needles.update(dt, inp.head, !!this.ctx.fx.brightBg);
  }

  // ── 손 하나: 나선환 → 나선수리검 ──
  _poseRasengan(h) {
    if (!h.active || h.uiBlock || this.ctx.grab?.isHolding(h.side)) return false;
    if (h.source === 'controller') return h.btn.trigger;
    const g = h.gesture;
    const inp = this.ctx.input;
    // 손바닥을 위로 편 손 (손가락이 살짝 굽어도 됨)
    return (g === 'open' || g === 'none') && h.gestureTime > 0.12 && h.palmNormal.y > 0.55 && h.palm.y < inp.head.y + 0.1 && h.speed < 1.2;
  }

  _updateHand(side, dt) {
    const { input: inp, fx } = this.ctx;
    const h = inp[side];
    const s = this.hs[side];
    if (!s.mode) {
      if (this._poseRasengan(h) && this.sign.t <= 0 && this.domain.sign <= 0.05) {
        s.pose += dt;
        if (s.pose > 0.2) {
          s.pose = 0;
          if (this.spend(12)) this._startRasengan(side);
        }
      } else s.pose = 0;
      return;
    }
    // 추적이 끊기면 즉시 해제 (다시 잡혀도 이어지지 않는다)
    if (!h.active) {
      this._fizzle(s);
      return;
    }
    const handMode = h.source === 'hand';
    const fist = handMode ? h.gesture === 'fist' && h.gestureTime > 0.08 : !h.btn.trigger;
    if (fist) {
      this._fizzle(s);
      h.pulse(0.3, 30);
      return;
    }
    s.t += dt;
    const R = this.kurama ? 0.11 : 0.075;
    if (s.mode === 'form') {
      s.power = Math.min(1, s.power + dt / (this.kurama ? 0.55 : 0.9));
      if (Math.random() < 0.7) fx.implode(s.orb.pos, 3, this.kurama ? C.goldHi : C.blueHi, 0.18 + 0.1 * (1 - s.power), 0.25, 0.012);
      if (s.power >= 1) {
        s.mode = 'hold';
        h.pulse(0.6, 60);
        fx.burst(s.orb.pos, 16, this.kurama ? C.goldHi : C.blueHi, 1.2, 0.02, 0.25);
      }
    }
    // 위치: 손바닥 앞 (수리검은 손 위)
    const r = s.mode === 'shuriken' ? R * 1.5 : 0.015 + (R - 0.015) * s.power;
    s.orb.setRadius(r);
    if (s.mode === 'shuriken') {
      // 머리 위에서는 수평으로 돌려 시야를 가리지 않게 (던지면 날아가는 방향을 향해 돈다)
      _v.copy(h.palm).addScaledVector(UP, 0.2);
      s.orb.spinAxis.copy(UP);
    } else {
      const n = handMode ? h.palmNormal : _v3.copy(h.dir);
      _v.copy(h.palm).addScaledVector(n, r + (handMode ? 0.035 : 0.06));
    }
    s.orb.pos.lerp(_v, 1 - Math.exp(-dt * 30));
    s.orb.update(dt, s.power);
    s.loop?.set(0.4 + 0.6 * s.power, 0.85 + 0.4 * s.power);
    s.loop?.pos(s.orb.pos);
    if (Math.random() < 0.35) h.pulse(0.05 + 0.15 * s.power, 15);
    if (this.kurama && Math.random() < 0.5) fx.spawn(s.orb.pos, _v2.randomDirection().multiplyScalar(0.3), C.gold, 0.02, 0.3, 2, -0.5);

    if (s.mode === 'shuriken') {
      // 크게 휘둘러 던진다
      const fwd = _v2.copy(inp.headDir).setY(0).normalize();
      if (h.speed > 2.2 && h.vel.dot(fwd) > 1.2) this._throwShuriken(side);
      return;
    }
    if (s.power < 0.5) return;
    // 박아 넣기: 구가 대상에 닿으면 바로
    const hit = this.ctx.world.nearestTarget(s.orb.pos, r + 0.04, (x) => !x.heldBy && !x.held);
    if (hit) {
      this._rasenganHit(hit, s.orb.pos.clone(), h.vel.lengthSq() > 1 ? h.vel.clone().normalize() : _v.subVectors(hit.center(_v3), inp.head).normalize().clone(), s.power, h);
      this._dispose(s);
      return;
    }
    if (s.mode !== 'hold') return;
    // 머리 위로 들어 올리면 나선수리검
    if (h.palm.y > inp.head.y + 0.06) {
      s.raise += dt;
      if (Math.random() < 0.6) fx.implode(s.orb.pos, 3, C.white, 0.35, 0.3, 0.015);
      if (s.raise > 0.7) {
        s.raise = 0;
        if (this.spend(30)) this._toShuriken(side);
      }
      return;
    }
    s.raise = Math.max(0, s.raise - dt * 2);
    // 앞으로 빠르게 밀면 던진다
    const push = handMode ? h.vel.dot(h.palmNormal) : h.thrust;
    if (push > 2.0 && h.speed > 2.0) this._throwRasengan(side);
  }

  _startRasengan(side) {
    const { input: inp, sfx, fx } = this.ctx;
    const h = inp[side];
    const s = this.hs[side];
    const orb = new RasenganOrb(this.ctx, 0.015, { gold: this.kurama });
    orb.pos.copy(h.palm).addScaledVector(h.source === 'hand' ? h.palmNormal : h.dir, 0.05);
    orb.light = fx.borrowLight(this.kurama ? C.gold : C.blue, 2, 4);
    Object.assign(s, { mode: 'form', orb, power: 0, t: 0, raise: 0, loop: sfx.loop({ sample: 'rasengan', base: 140, noiseF: 1600, vol: 0.4 }) });
    sfx.play('charge_rise', { at: orb.pos, vol: 0.35, rate: 1.6 });
    h.pulse(0.4, 50);
  }

  _toShuriken(side) {
    const { input: inp, sfx, fx, ui } = this.ctx;
    const s = this.hs[side];
    const h = inp[side];
    s.mode = 'shuriken';
    s.orb.setShuriken(true, this.kurama ? 0.6 : 0.42);
    s.loop?.stop(0.2);
    s.loop = sfx.loop({ sample: 'shuriken', base: 900, type: 'sawtooth', noiseF: 3000, vol: 0.4 });
    ui.manga({ top: '風遁', main: '螺旋手裏剣', ruby: 'らせんしゅりけん', color: '#4ab0ff', side });
    fx.burst(s.orb.pos, 40, C.white, 2.5, 0.03, 0.35);
    fx.shockwave(s.orb.pos, C.blueHi, 0.8, 0.35, { faceDir: _v.subVectors(inp.head, s.orb.pos).normalize().clone() });
    sfx.play('whoosh', { at: s.orb.pos, vol: 0.7, rate: 0.7 });
    h.pulse(0.8, 120);
  }

  _fizzle(s) {
    if (s.orb) this.ctx.fx.implode(s.orb.pos, 14, this.kurama ? C.goldHi : C.blueHi, 0.2, 0.2, 0.015);
    this.ctx.sfx.play('whoosh', { at: s.orb?.pos, vol: 0.3, rate: 1.7 });
    this._dispose(s);
  }

  _dispose(s) {
    s.loop?.stop(0.15);
    s.orb?.dispose();
    Object.assign(s, this._hs());
  }

  _rasenganHit(t, pos, dir, power, h) {
    const { fx, sfx, ui } = this.ctx;
    const mul = this.kurama ? 1.6 : 1;
    const c = t.center(new THREE.Vector3());
    const d = dir.clone();
    d.y = Math.max(d.y, 0.05);
    d.normalize();
    t.damage(70 * mul * power, { type: 'blast', dir: d, dirAmt: 6 });
    if (t.alive) t.impulse(d.clone().multiplyScalar((10 + 6 * mul) / Math.sqrt(t.mass ?? 3)).add(_v.set(0, 1.5, 0)), 25);
    // 회전하며 퍼지는 고리
    const col = this.kurama ? C.gold : C.blue;
    const hi = this.kurama ? C.goldHi : C.blueHi;
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        fx.shockwave(pos, i % 2 ? hi : col, (0.8 + i * 0.5) * mul, 0.35 + i * 0.05, { faceDir: d, opacity: 0.9 - i * 0.15 });
      }, i * 45);
    }
    fx.sphereBlast(pos, col, 0.7 * mul, 0.3);
    fx.sphereBlast(pos, 0xffffff, 0.35 * mul, 0.15);
    fx.burst(pos, 70, hi, 4, 0.04, 0.5, { dir: d, dirAmt: 0.6 });
    fx.burst(c, 40, col, 5, 0.05, 0.6, { dir: d, dirAmt: 1.2 });
    fx.starFlare(pos, 0xffffff, 0.8, 0.3);
    fx.flash(pos, col, 10, 0.4, 10);
    if (!sfx.play('rasengan_hit', { at: pos, vol: 1.1 })) sfx.explosion(pos, 0.8);
    ui.manga({ main: '螺旋丸', ruby: 'らせんがん', color: this.kurama ? '#ff9a10' : '#2f8cff', side: h?.side });
    h?.pulse?.(1, 160);
  }

  _throwRasengan(side) {
    const { input: inp, sfx } = this.ctx;
    const h = inp[side];
    const s = this.hs[side];
    const dir = (h.source === 'hand' ? h.palmNormal.clone().lerp(inp.headDir, 0.4) : h.dir.clone()).normalize();
    this.thrown.push({ orb: s.orb, pos: s.orb.pos, vel: dir.multiplyScalar(13), life: 1.4, power: s.power, loop: s.loop });
    Object.assign(s, this._hs());
    sfx.play('whoosh', { at: h.palm, vol: 0.7, rate: 1.2 });
    h.pulse(0.7, 70);
  }

  _updateThrown(dt) {
    const { world, fx } = this.ctx;
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const T = this.thrown[i];
      T.life -= dt;
      T.vel.multiplyScalar(Math.exp(-dt * 0.8));
      T.orb.update(dt, T.power);
      T.loop?.pos(T.pos);
      const steps = Math.max(1, Math.ceil((T.vel.length() * dt) / 0.15));
      let hit = null;
      for (let k = 0; k < steps && !hit; k++) {
        T.pos.addScaledVector(T.vel, dt / steps);
        hit = world.nearestTarget(T.pos, T.orb.radius + 0.05);
      }
      if (Math.random() < 0.6) fx.spawn(T.pos, _v.randomDirection().multiplyScalar(0.4), this.kurama ? C.gold : C.blueHi, 0.02, 0.25, 2, 0);
      if (hit) {
        this._rasenganHit(hit, T.pos.clone(), T.vel.clone().normalize(), T.power, null);
      } else if (T.life > 0 && T.pos.y > 0.05) continue;
      else {
        fx.implode(T.pos, 20, C.blueHi, 0.3, 0.25, 0.02);
        fx.shockwave(_v.copy(T.pos).setY(0.05), C.blueHi, 0.8, 0.3);
      }
      T.loop?.stop(0.2);
      T.orb.dispose();
      this.thrown.splice(i, 1);
    }
  }

  _throwShuriken(side) {
    const { input: inp, sfx, fx } = this.ctx;
    const h = inp[side];
    const s = this.hs[side];
    const vdir = h.source === 'desktop' ? inp.headDir.clone() : h.vel.clone().normalize();
    const dir = inp.headDir.clone().lerp(vdir, 0.35).normalize();
    if (dir.y < -0.35) dir.y = -0.35;
    dir.normalize();
    s.orb.spinAxis.copy(dir);
    this.shurikens.push({ orb: s.orb, pos: s.orb.pos, vel: dir.clone().multiplyScalar(16), dir, life: 2.6, loop: s.loop, gold: this.kurama });
    Object.assign(s, this._hs());
    sfx.play('whoosh', { at: h.palm, vol: 1, rate: 0.8 });
    fx.burst(h.palm, 20, C.white, 2, 0.03, 0.3);
    h.pulse(1, 120);
  }

  _updateShurikens(dt) {
    const { world, fx } = this.ctx;
    for (let i = this.shurikens.length - 1; i >= 0; i--) {
      const S = this.shurikens[i];
      S.life -= dt;
      S.orb.update(dt, 1);
      S.loop?.pos(S.pos);
      S.loop?.set(1, 1.1);
      let hit = S.life <= 0;
      const steps = Math.max(1, Math.ceil((S.vel.length() * dt) / 0.25));
      for (let k = 0; k < steps && !hit; k++) {
        S.pos.addScaledVector(S.vel, dt / steps);
        if (S.pos.y < 0.15) hit = true;
        else if (world.nearestTarget(S.pos, 0.45)) hit = true;
        const B = this.ctx.env.bounds;
        if (B && (S.pos.x < B.minX || S.pos.x > B.maxX || S.pos.z < B.minZ || S.pos.z > B.maxZ)) hit = true;
      }
      for (let k = 0; k < 3; k++) fx.spawn(_v.copy(S.pos).add(_v2.randomDirection().multiplyScalar(0.3)), _v2.copy(S.vel).multiplyScalar(-0.1), C.white, 0.025, 0.3, 2, 0);
      if (hit) {
        this._burstWind(S.pos.clone(), S.gold);
        S.loop?.stop(0.3);
        S.orb.dispose();
        this.shurikens.splice(i, 1);
      }
    }
  }

  _burstWind(pos, gold) {
    const { fx, sfx, ui } = this.ctx;
    if (pos.y < 0.4) pos.y = 0.4;
    const R = gold ? 4.5 : 3.2;
    const w = new WindSphere(this.ctx, pos, R, !!fx.brightBg);
    this.winds.push({ w, pos, R, t: 0, dur: 1.9, tick: 0, gold });
    fx.flash(pos, gold ? C.gold : C.blueHi, 14, 0.6, 25);
    fx.shockwave(_v.copy(pos).setY(0.05), C.blueHi, R * 1.6, 0.6);
    fx.sphereBlast(pos, 0xffffff, R * 0.5, 0.2);
    fx.burst(pos, 90, C.white, 7, 0.04, 0.6, { drag: 2 });
    if (!sfx.play('wind_burst', { at: pos, vol: 1.3 })) sfx.explosion(pos, 1.6);
    sfx.rumble(1.4, 0.4);
    ui.manga({ top: '風遁', main: '螺旋手裏剣', ruby: 'らせんしゅりけん', color: '#4ab0ff', dur: 1 });
    this.ctx.input.left.pulse(0.8, 200);
    this.ctx.input.right.pulse(0.8, 200);
  }

  _updateWinds(dt) {
    const { world, fx, input: inp } = this.ctx;
    for (let i = this.winds.length - 1; i >= 0; i--) {
      const W = this.winds[i];
      W.t += dt;
      const k = W.t / W.dur;
      const grow = Math.min(1, W.t / 0.25);
      const shrink = k > 0.82 ? 1 - (k - 0.82) / 0.18 : 1;
      const r = W.R * (1 - Math.pow(1 - grow, 3)) * Math.max(0.05, shrink);
      W.w.set(r, 0.9 * Math.min(1, shrink * 1.5), dt);
      // 안쪽에서 번뜩이는 무수한 바람 칼날
      for (let n = 0; n < 10; n++) {
        _v.randomDirection().multiplyScalar(Math.cbrt(Math.random()) * r).add(W.pos);
        this.needles.add(_v, _v2.randomDirection(), 0.3 + Math.random() * 0.9, 0.02 + Math.random() * 0.02, 0.1 + Math.random() * 0.08);
      }
      if (Math.random() < 0.5) fx.spawn(_v.randomDirection().multiplyScalar(r * 0.9).add(W.pos), _v2.randomDirection().multiplyScalar(2), C.blueHi, 0.03, 0.3, 2, 0);
      // 범위 안 대상: 끌어당겨 붙잡은 채 세포 단위로 잘게 썬다
      W.tick -= dt;
      const tick = W.tick <= 0 && shrink > 0.3;
      if (tick) W.tick = 0.1;
      world.forEachTarget(W.pos, r, (t, d, c) => {
        _v.subVectors(W.pos, c);
        t.vel?.multiplyScalar(Math.exp(-dt * 3));
        if (t.state === 'stand' && d > 0.5) t.impulse(_v.normalize().multiplyScalar(2.4), 4);
        else if (d > 0.4) t.impulse(_v.normalize().multiplyScalar(9 * dt), 0);
        if (!tick) return;
        const planes = [];
        for (let p = 0; p < 6; p++) planes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(_v2.randomDirection().clone(), c.clone().add(_v3.randomDirection().multiplyScalar(0.15))));
        t.damage((W.gold ? 40 : 28) * (t.kind === 'prop' ? 2 : 1), { type: 'cleave', planes, plane: planes[0], silent: Math.random() < 0.6 });
      });
      for (const pc of [...world.slicer.pieces]) {
        if (pc.pivot.position.distanceTo(W.pos) < r && Math.random() < 0.3) world.slicer.shatterPiece(pc, 10);
      }
      if (Math.random() < 0.5) {
        inp.left.pulse(0.2, 20);
        inp.right.pulse(0.2, 20);
      }
      if (k >= 1) {
        fx.burst(W.pos, 40, C.white, 4, 0.04, 0.5);
        W.w.dispose();
        this.winds.splice(i, 1);
      }
    }
  }

  // ── 그림자 분신술 ──
  _cloneSignHeld() {
    const inp = this.ctx.input;
    if (inp.mode === 'desktop') return inp.keyDown('KeyC');
    const L = inp.left;
    const R = inp.right;
    if (L.source === 'controller') return L.active && L.btn.a;
    if (!L.active || !R.active || L.source !== 'hand' || R.source !== 'hand' || L.uiBlock || R.uiBlock) return false;
    const ok = (g) => g === 'two' || g === 'crossed' || g === 'point';
    if (!ok(L.gesture) || !ok(R.gesture)) return false;
    // 두 손의 손가락이 십자로 겹친다 (검지 끝끼리 가깝고, 방향은 서로 비스듬히)
    const near = L.pos.distanceTo(R.pos) < 0.1 || L.indexTip.distanceTo(R.indexTip) < 0.09;
    const cross = Math.abs(L.dir.dot(R.dir)) < 0.7;
    const mid = _v.addVectors(L.pos, R.pos).multiplyScalar(0.5);
    const front = mid.distanceTo(inp.head) < 0.6 && _v2.subVectors(mid, inp.head).dot(inp.headDir) > 0.1;
    return near && cross && front;
  }

  _updateCloneSign(dt) {
    const S = this.sign;
    const held = this._cloneSignHeld() && !this.hs.left.mode && !this.hs.right.mode;
    if (held) {
      S.lost = 0;
      S.t += dt;
      const inp = this.ctx.input;
      if (Math.random() < 0.5) {
        inp.left.pulse(0.1 + S.t * 0.3, 15);
        inp.right.pulse(0.1 + S.t * 0.3, 15);
      }
      const ctrl = inp.left.source === 'controller';
      if (S.stage === 0 && S.t >= (ctrl ? 0.05 : 0.4)) {
        S.stage = 1;
        if (this.clones.length >= MAX_CLONES) this._dismissClones();
        else if (this.spend(15)) this._spawnClones(3, false);
      } else if (S.stage === 1 && S.t >= (ctrl ? 1.0 : 1.4)) {
        S.stage = 2;
        if (this.clones.length < MAX_CLONES && this.spend(25)) this._spawnClones(MAX_CLONES - this.clones.length, true);
      }
    } else if ((S.lost += dt) > 0.25) {
      S.t = 0;
      S.stage = 0;
    }
  }

  _spawnClones(n, multi) {
    const { input: inp, ui, sfx, fx } = this.ctx;
    const fwd = _v.copy(inp.headDir).setY(0);
    if (fwd.lengthSq() < 1e-3) fwd.set(0, 0, -1);
    fwd.normalize();
    const base = Math.atan2(fwd.x, fwd.z);
    const B = this.ctx.env.bounds;
    for (let i = 0; i < n; i++) {
      const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * (multi ? 2.6 : 1.6);
      const a = base + spread;
      const dist = 1.3 + (multi ? (i % 2) * 0.8 : 0);
      const p = new THREE.Vector3(inp.head.x + Math.sin(a) * dist, 0, inp.head.z + Math.cos(a) * dist);
      if (B) {
        p.x = THREE.MathUtils.clamp(p.x, B.minX + 0.4, B.maxX - 0.4);
        p.z = THREE.MathUtils.clamp(p.z, B.minZ + 0.4, B.maxZ - 0.4);
      }
      const slot = (((this.clones.length * 0.618) % 1) - 0.5) * 2.6;
      const c = new ShadowClone(this, p, slot, this.kurama);
      this.clones.push(c);
      poofSmoke(fx, c.center(_v2), 1.2);
    }
    sfx.play('poof', { vol: 1 });
    if (n > 3) setTimeout(() => sfx.play('poof', { vol: 0.8, rate: 0.9 }), 90);
    ui.manga(multi ? { top: '多重', main: '影分身の術', ruby: 'たじゅうかげぶんしんのじゅつ', color: '#ff7a1a' } : { main: '影分身の術', ruby: 'かげぶんしんのじゅつ', color: '#ff7a1a' });
    inp.left.pulse(0.7, 90);
    inp.right.pulse(0.7, 90);
  }

  _dismissClones() {
    for (const c of this.clones) c.poof();
    this.clones = [];
    this.ctx.ui.callout('분신 해제', { color: '#ffb070' });
  }

  // ── 구미 차크라 모드 ──
  _kuramaSign() {
    const inp = this.ctx.input;
    if (inp.mode === 'desktop') return inp.keyDown('KeyQ');
    const L = inp.left;
    const R = inp.right;
    if (!L.active || !R.active) return false;
    if (L.source === 'controller' && R.source === 'controller') return L.btn.stick && R.btn.stick;
    if (L.source !== 'hand' || R.source !== 'hand' || !this.ctx.settings.domainGesture) return false;
    // 양 주먹을 가슴 앞에서 맞댄다
    const mid = _v.addVectors(L.palm, R.palm).multiplyScalar(0.5);
    return L.gesture === 'fist' && R.gesture === 'fist' && L.palm.distanceTo(R.palm) < 0.15 && mid.distanceTo(inp.head) < 0.62 &&
      _v2.subVectors(mid, inp.head).dot(inp.headDir) > 0.1 && L.speed < 0.9 && R.speed < 0.9;
  }

  _updateKuramaSign(dt) {
    const { input: inp, fx } = this.ctx;
    const d = this.domain;
    d.cd = Math.max(0, d.cd - dt);
    const active = this.kurama;
    const canCast = active ? this.kuramaT < d.duration - 2 : d.cd <= 0;
    const held = (this._kuramaSign() || d.auto) && canCast && !this.hs.left.mode && !this.hs.right.mode;
    const need = 1.5;
    if (held) {
      d.lost = 0;
      d.sign += dt * (d.auto ? 2 : 1);
      if (Math.random() < 0.5) {
        inp.left.pulse(0.1 + (d.sign / need) * 0.6, 20);
        inp.right.pulse(0.1 + (d.sign / need) * 0.6, 20);
      }
      if (!active && Math.random() < 0.8) {
        fx.spawn(_v.copy(inp.head).add(_v2.set((Math.random() - 0.5) * 0.9, -1.2 - Math.random() * 0.4, (Math.random() - 0.5) * 0.9)), _v2.set(0, 1.5 + Math.random(), 0), C.gold, 0.04, 0.6, 1, -0.5, 0.5);
      }
      if (d.sign >= need) {
        d.sign = 0;
        d.auto = false;
        if (active) this._endKurama();
        else this._startKurama();
      }
    } else if ((d.lost += dt) > 0.3 || !canCast) {
      d.sign = 0;
      if (!canCast) d.auto = false;
    }
    const ring = this.signRing;
    const k = Math.min(1, d.sign / need);
    ring.visible = d.sign > 0.01;
    ring.material.opacity = k * 0.9;
    if (inp.left.active && inp.right.active) ring.position.addVectors(inp.left.palm, inp.right.palm).multiplyScalar(0.5);
    else ring.position.copy(inp.head).addScaledVector(inp.headDir, 0.4);
    ring.quaternion.copy(inp.headQuat);
    ring.scale.setScalar(0.04 + k * 0.06);
  }

  castDomain() {
    if (!this.kurama && this.domain.cd <= 0) this._startKurama();
    else if (this.kurama) this.ctx.ui.callout('이미 구미 차크라 모드');
    else this.ctx.ui.callout('재사용 대기 중');
  }

  _startKurama() {
    const { input: inp, fx, sfx, ui } = this.ctx;
    if (!this.spend(40)) return;
    this.kuramaT = this.domain.duration;
    const c = inp.bodyCenter(_v);
    fx.flash(c, C.gold, 14, 0.8, 20);
    fx.shockwave(_v2.copy(c).setY(0.05), C.gold, 6, 0.8);
    fx.burst(c, 120, C.gold, 5, 0.05, 0.8, { up: 1.5, grav: -1 });
    fx.burst(c, 60, C.goldHi, 3, 0.04, 0.6);
    if (!sfx.play('powerup', { vol: 1.1 })) sfx.explosion(c, 1.4);
    this.auraLoop = sfx.loop({ sample: 'aura', base: 60, noiseF: 500, vol: 0.22 });
    ui.manga({ main: '九喇嘛モード', ruby: 'クラマモード', color: '#ff9a10', big: true, dur: 2.4 });
    for (const cl of this.clones) cl.setGold(true);
    inp.left.pulse(1, 300);
    inp.right.pulse(1, 300);
  }

  _endKurama() {
    this.kuramaT = 0;
    this.domain.cd = 10;
    this.auraLoop?.stop(1);
    this.auraLoop = null;
    for (const cl of this.clones) cl.setGold(false);
    this.ctx.sfx.play('charge_rise', { vol: 0.4, rate: 0.6 });
    this.ctx.ui.callout('구미 차크라 모드 해제', { color: '#ffd080' });
  }

  _updateKurama(dt) {
    if (!this.kurama) return;
    const { input: inp, fx } = this.ctx;
    this.kuramaT -= dt;
    if (this.kuramaT <= 0) {
      this._endKurama();
      return;
    }
    // 몸을 감싸고 타오르는 금빛 차크라 (시야 가장자리) + 손에서 일렁이는 불꽃
    const base = _v3.set(inp.head.x, 0, inp.head.z);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.35 + Math.random() * 0.25;
      _v.set(base.x + Math.cos(a) * r, 0.1 + Math.random() * (inp.head.y - 0.3), base.z + Math.sin(a) * r);
      fx.spawn(_v, _v2.set(Math.cos(a) * 0.2, 1.2 + Math.random() * 0.8, Math.sin(a) * 0.2), Math.random() < 0.5 ? C.gold : C.orange, 0.05 + Math.random() * 0.04, 0.5, 1.5, -0.5, 0.5);
    }
    for (const h of inp.hands) {
      if (!h.active) continue;
      if (Math.random() < 0.8) fx.spawn(_v.copy(h.palm).add(_v2.randomDirection().multiplyScalar(0.05)), _v2.set((Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2), Math.random() < 0.6 ? C.gold : C.goldHi, 0.025, 0.35, 1, -0.5, 0.3);
    }
    this.auraLoop?.pos(inp.head);
    const sec = Math.ceil(this.kuramaT);
    if (sec <= 3 && sec !== this._lastSec) {
      this._lastSec = sec;
      this.ctx.ui.callout(`구미 모드 ${sec}초`, { color: '#ffd080', dur: 0.6 });
    }
  }

  // ── 주먹 (흑섬 없음) ──
  meleeHit(target, pos, dir, speed, hand) {
    const { fx, sfx } = this.ctx;
    const k = this.kurama ? 2 : 1;
    target.damage((10 + speed * 3) * k, { type: 'punch', dir });
    target.impulse?.(_v.copy(dir).multiplyScalar((2 + speed * 0.6) * k).add(_v2.set(0, 0.8 * k, 0)), 3 * k);
    fx.burst(pos, 14, this.kurama ? C.gold : C.white, 2 * k, 0.03, 0.25);
    if (this.kurama) fx.shockwave(pos, C.gold, 0.8, 0.25, { faceDir: dir.clone() });
    sfx.punch(pos);
    hand?.pulse(0.7, 60);
    return true;
  }

  // ── 데스크톱 ──
  _desktop(dt) {
    const inp = this.ctx.input;
    const h = inp.right;
    const s = this.hs.right;
    if (!s.mode) {
      if (inp.mouse.left && this.sign.t <= 0) {
        if (this.spend(12)) this._startRasengan('right');
      }
      return;
    }
    s.t += dt;
    const R = this.kurama ? 0.11 : 0.075;
    if (s.mode === 'form') {
      s.power = Math.min(1, s.power + dt / (this.kurama ? 0.55 : 0.9));
      if (s.power >= 1) s.mode = 'hold';
    }
    const r = s.mode === 'shuriken' ? R * 1.5 : 0.015 + (R - 0.015) * s.power;
    s.orb.setRadius(r);
    s.orb.pos.copy(h.palm).addScaledVector(inp.headDir, 0.15);
    if (s.mode === 'shuriken') {
      s.orb.pos.addScaledVector(_v.set(0, 1, 0).applyQuaternion(inp.headQuat), 0.15);
      s.orb.spinAxis.copy(UP);
    }
    s.orb.update(dt, s.power);
    s.loop?.set(0.4 + 0.6 * s.power, 0.85 + 0.4 * s.power);
    s.loop?.pos(s.orb.pos);
    if (s.mode === 'hold' && inp.mouse.right) {
      if (this.spend(30)) this._toShuriken('right');
    }
    if (!inp.mouse.left) {
      if (s.mode === 'shuriken') this._throwShuriken('right');
      else if (s.power >= 0.5) {
        const dir = inp.headDir.clone();
        this.thrown.push({ orb: s.orb, pos: s.orb.pos, vel: dir.multiplyScalar(13), life: 1.4, power: s.power, loop: s.loop });
        Object.assign(s, this._hs());
        this.ctx.sfx.play('whoosh', { vol: 0.7, rate: 1.2 });
      } else this._fizzle(s);
    }
  }

  cancelDomain() {
    if (this.kurama) {
      this.kuramaT = 0;
      this.auraLoop?.stop(0.3);
      this.auraLoop = null;
    }
    this.domain.sign = 0;
    this.domain.auto = false;
    for (const c of this.clones) c.poof();
    this.clones = [];
  }

  dispose() {
    const { scene } = this.ctx;
    for (const side of ['left', 'right']) this._dispose(this.hs[side]);
    for (const T of this.thrown) {
      T.loop?.stop(0.1);
      T.orb.dispose();
    }
    for (const S of this.shurikens) {
      S.loop?.stop(0.1);
      S.orb.dispose();
    }
    for (const W of this.winds) W.w.dispose();
    for (const c of this.clones) c.poof();
    this.clones = [];
    this.auraLoop?.stop(0.2);
    this.needles.dispose(scene);
    scene.remove(this.signRing);
  }
}
