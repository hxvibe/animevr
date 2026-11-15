// 고죠 사토루 — 무하한 주술 + 육안
//  · 무하한(無下限): 자신과 대상 사이의 "무한"으로 날아오는 모든 것을 멈춘다 (제논의 역설)
//  · 술식순전 「창(蒼)」: 수렴하는 무한 → 모든 것을 끌어당기는 인력 구체
//  · 술식반전 「혁(赫)」: 발산하는 무한 → 모든 것을 밀어내는 척력탄
//  · 허식 「자(茈)」: 창과 혁을 충돌시켜 생기는 가상의 질량 → 경로상의 모든 것을 소멸
//  · 영역전개 「무량공처(無量空処)」: 무한한 정보를 주입해 영역 안의 적을 마비
//  · 육안(六眼): 주력 효율 극대화(소모량 감소) + 적의 주력 · 투사체 궤적 시각화
//  · 반전술식: 피격 후 자동 회복
import * as THREE from 'three';
import { Orb } from './orb.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const C = {
  blue: new THREE.Color(0x3aa0ff),
  blueHi: new THREE.Color(0x9fe0ff),
  red: new THREE.Color(0xff2a3a),
  redHi: new THREE.Color(0xffa070),
  purple: new THREE.Color(0xa04cff),
  purpleHi: new THREE.Color(0xe0b0ff),
  inf: new THREE.Color(0x9fe8ff),
};

export class Gojo {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'gojo';
    this.name = '고죠 사토루';
    this.subtitle = '무하한 주술 · 육안 — 주술고전 최강의 주술사';
    this.energy = 100;
    this.maxEnergy = 100;
    this.infinity = true;
    this.sixEyes = true;
    this.healing = false;
    this.hs = { left: { blue: null, red: null }, right: { blue: null, red: null } };
    this.lingering = [];
    this.redShots = [];
    this.purple = null;
    this.purpleShots = [];
    this.trenches = [];
    this.domain = { state: 'idle', t: 0, sign: 0, cd: 0, duration: 14 };
    this._rippleT = 0;
    this._needRelease = { left: false, right: false };

    ctx.world.shield = (o, dt, center) => this._infinity(o, dt, center);
    ctx.world.setSixEyes(this.sixEyes);
    ctx.world.onPlayerHit = (a) => ctx.ui.damageFlash(a);

    // 영역전개 수인 충전 링
    this.signRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.signRing.rotation.x = -Math.PI / 2;
    ctx.scene.add(this.signRing);

    this.trenchGeo = new THREE.PlaneGeometry(1, 1);
    this.trenchGeo.rotateX(-Math.PI / 2);
  }

  get costMul() {
    return this.sixEyes ? 0.3 : 1;
  }

  spend(x) {
    const c = x * this.costMul;
    if (this.energy < c) return false;
    this.energy -= c;
    return true;
  }

  drain(x) {
    this.energy = Math.max(0, this.energy - x * this.costMul);
    return this.energy > 0;
  }

  denied(pos) {
    this.ctx.sfx.denied();
    this.ctx.ui.callout('주력 부족', pos, { color: '#ff8a8a', size: 70, dur: 1 });
  }

  // ── 메뉴/HUD ──
  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '술식순전 「창」 — 인력', color: '#7fc4ff', text: '검지+중지를 펴서 가리키고 유지. 팔을 뻗을수록 멀리 생성' },
        { head: '술식반전 「혁」 — 척력', color: '#ff7a7a', text: '검지만 펴서 충전 → 앞으로 찌르거나 손을 펴면 발사' },
        { head: '허식 「자」 — 소멸', color: '#c89bff', text: '한 손은 창, 다른 손은 혁을 쥔 채 두 손끝을 맞대기\n→ 양손을 앞으로 밀거나 손을 펴서 발사' },
        { head: '영역전개 「무량공처」', color: '#e8f0ff', text: '검지·중지를 꼬아(교차) 1초 유지\n(또는 두 손가락을 세워 얼굴 앞에 1초)' },
        { head: '무하한 · 육안 · 메뉴', color: '#9fe8ff', text: '무하한: 양 손바닥을 앞으로 1초  ·  육안: 손으로 눈을 가렸다 떼기\n메뉴: 왼손바닥을 하늘로 펴기  ·  버튼은 손가락으로 터치' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱 테스트)', color: '#ffffff', text: '화면 클릭 → 마우스 고정  ·  WASD 이동, Shift 달리기' },
        { head: '창 / 혁', color: '#7fc4ff', text: '우클릭 유지: 창 (휠로 거리)  ·  좌클릭 충전 후 놓기: 혁 (F: 밀어 발사)' },
        { head: '허식 「자」', color: '#c89bff', text: '좌·우클릭을 모두 누른 채 E → 버튼을 놓으면 발사' },
        { head: '무량공처 / 토글', color: '#e8f0ff', text: 'Q 1초 유지: 영역전개  ·  I 무하한  ·  O 육안  ·  R 리셋  ·  H 메뉴' },
      ];
    }
    return [
      { head: '술식순전 「창」 — 인력', color: '#7fc4ff', text: '왼쪽 트리거 유지. 팔을 뻗을수록 멀리 생성' },
      { head: '술식반전 「혁」 — 척력', color: '#ff7a7a', text: '오른쪽 트리거로 충전 → 놓거나 앞으로 찌르면 발사' },
      { head: '허식 「자」 — 소멸', color: '#c89bff', text: '창 + 혁을 유지한 채 두 컨트롤러를 맞대기\n→ 앞으로 밀거나 트리거를 놓아 발사' },
      { head: '영역전개 「무량공처」', color: '#e8f0ff', text: '양쪽 그립을 1초 동안 쥐기' },
      { head: '버튼', color: '#9fe8ff', text: 'X 무하한  ·  A 육안  ·  B 리셋  ·  Y 메뉴\n왼스틱 이동  ·  오른스틱 회전' },
    ];
  }

  panelButtons() {
    return [
      { id: 'infinity', label: `무하한 ${this.infinity ? 'ON' : 'OFF'}`, on: this.infinity },
      { id: 'sixeyes', label: `육안 ${this.sixEyes ? 'ON' : 'OFF'}`, on: this.sixEyes },
      { id: 'reset', label: '아레나 리셋' },
      { id: 'close', label: '닫기' },
    ];
  }

  onPanelButton(id) {
    if (id === 'infinity') this.setInfinity(!this.infinity);
    if (id === 'sixeyes') this.setSixEyes(!this.sixEyes);
    if (id === 'reset') this.reset();
  }

  hudRows() {
    const w = this.ctx.world;
    const d = this.domain;
    let dom = '준비';
    if (d.state === 'active') dom = `전개 중 ${Math.ceil(d.duration - d.t)}s`;
    else if (d.cd > 0) dom = `재사용 ${Math.ceil(d.cd)}s`;
    return [
      { label: '주력', bar: this.energy / this.maxEnergy, color: '#6fd0ff' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: this.healing ? '#7dffb0' : '#ff6f7f' },
      { label: '무하한', text: this.infinity ? 'ON' : 'OFF', textColor: this.infinity ? '#9fe8ff' : '#888' },
      { label: '육안', text: this.sixEyes ? 'ON  (소모 -70%)' : 'OFF', textColor: this.sixEyes ? '#9fe8ff' : '#888' },
      { label: '영역', text: dom },
      { label: '처치', text: `${w.kills}` },
    ];
  }

  setInfinity(on) {
    this.infinity = on;
    this.ctx.sfx.toggle(on);
    this.ctx.ui.callout(on ? '무하한 ON' : '무하한 OFF', null, { color: '#9fe8ff', size: 80, dur: 1.2 });
    if (on) this.ctx.fx.shockwave(this.ctx.input.bodyCenter(_v).setY(0.05), C.inf, 1.6, 0.6);
    if (this.ctx.ui.panelVisible) this.ctx.ui.drawPanel();
  }

  setSixEyes(on) {
    this.sixEyes = on;
    this.ctx.world.setSixEyes(on);
    this.ctx.sfx.toggle(on);
    this.ctx.ui.callout(on ? '육안 개방' : '육안 봉인', null, { color: '#7fe0ff', size: 80, dur: 1.2 });
    if (this.ctx.ui.panelVisible) this.ctx.ui.drawPanel();
  }

  reset() {
    for (const side of ['left', 'right']) {
      const s = this.hs[side];
      if (s.blue) this._disposeBlue(s.blue);
      if (s.red) this._disposeRed(s.red);
      s.blue = s.red = null;
    }
    for (const l of this.lingering) this._disposeBlue(l.b);
    this.lingering = [];
    for (const r of this.redShots) r.orb.dispose(this.ctx.fx);
    this.redShots = [];
    if (this.purple) this._disposePurple(this.purple);
    this.purple = null;
    for (const p of this.purpleShots) p.orb.dispose(this.ctx.fx);
    this.purpleShots = [];
    for (const t of this.trenches) this.ctx.scene.remove(t.mesh);
    this.trenches = [];
    if (this.domain.state === 'active') this._endDomain();
    this.domain.cd = 0;
    this.energy = this.maxEnergy;
    this.ctx.world.reset();
    this.ctx.ui.callout('아레나 리셋', null, { size: 70, dur: 1 });
  }

  // ── 메인 루프 ──
  update(dt) {
    const { input: inp, world, fx } = this.ctx;
    const A = inp.actions;
    if (A.toggleInfinity) this.setInfinity(!this.infinity);
    if (A.toggleSixEyes) this.setSixEyes(!this.sixEyes);
    if (A.reset) this.reset();
    if (A.toggleHelp) this.ctx.ui.showPanel(!this.ctx.ui.panelVisible);

    // 주력 회복 / 무하한 유지비
    if (!this.purple) this.energy = Math.min(this.maxEnergy, this.energy + 11 * dt);
    if (this.infinity) this.drain(1.5 * dt);

    // 반전술식: 피격 2초 뒤부터 자동 회복
    const P = world.player;
    this.healing = P.hp < P.maxHp && world.time - P.lastHit > 2;
    if (this.healing) P.hp = Math.min(P.maxHp, P.hp + 9 * dt);

    this._updateDomain(dt);
    if (!this.purple) {
      this._updateHand('left', dt);
      this._updateHand('right', dt);
      this._checkFusion();
    }
    this._updatePurple(dt);
    this._updateLingering(dt);
    this._updateRedShots(dt);
    this._updatePurpleShots(dt);
    this._updateTrenches(dt);

    // 육안: 손끝에 흐르는 주력
    if (this.sixEyes && inp.mode === 'xr') {
      for (const h of inp.hands) {
        if (!h.active || Math.random() > 0.5) continue;
        _v.randomDirection().multiplyScalar(0.05);
        fx.spawn(h.indexTipWorld, _v, C.blueHi, 0.012, 0.35, 2, 0);
      }
    }
    this._rippleT -= dt;
  }

  // ── 무하한 ──
  _infinity(o, dt, center) {
    if (!this.infinity) return;
    const R = 1.7;
    const rMin = 0.6;
    _v.subVectors(o.pos, center);
    const d = _v.length();
    if (d > R || d < 1e-4) return;
    const n = _v.divideScalar(d);
    const radial = o.vel.dot(n);
    if (radial >= 0) return;
    // 가까워질수록 허용 접근 속도가 0으로 수렴 → 영원히 닿지 않는다
    const maxIn = 2.5 * Math.max(0, d - rMin);
    if (-radial > maxIn) o.vel.addScaledVector(n, -radial - maxIn);
    // 접선 방향 속도도 감쇠
    _v2.copy(o.vel).addScaledVector(n, -o.vel.dot(n));
    o.vel.addScaledVector(_v2, -Math.min(1, dt * 3));
    if (!o._infTouched) {
      o._infTouched = true;
      const p = _v3.copy(center).addScaledVector(n, d * 0.9);
      this.ctx.fx.shockwave(p, C.inf, 0.5, 0.6, { faceDir: n.clone(), opacity: 0.8 });
      this.ctx.fx.burst(p, 10, C.inf, 0.6, 0.03, 0.6);
      if (this._rippleT <= 0) {
        this._rippleT = 0.15;
        this.ctx.sfx.ripple(p);
      }
    }
  }

  // ── 창 / 혁 (손별) ──
  _blueDistance(h, b) {
    const inp = this.ctx.input;
    if (h.source === 'desktop') return inp.blueDistance;
    const ext = h.palm.distanceTo(inp.head);
    const k = THREE.MathUtils.clamp((ext - 0.25) / 0.35, 0, 1);
    return THREE.MathUtils.lerp(2.2, 9, k);
  }

  _updateHand(side, dt) {
    const { input: inp, fx, sfx } = this.ctx;
    const h = inp[side];
    const s = this.hs[side];
    // 허식 발사 직후에는 손을 한 번 풀어야 다시 시전
    if (this._needRelease[side]) {
      if (!h.blue && !h.red) this._needRelease[side] = false;
      else return;
    }

    // 창 시작
    if (!s.blue && !s.red && h.active && h.blue) {
      if (this.energy > 3) {
        const orb = new Orb(this.ctx.scene, { core: 0xe8f6ff, rim: 0x2a7bff, swirl: 0x4aa8ff, swirl2: 0xbfe8ff, dir: 1, radius: 0.05, count: 500, flat: 0.55, swirlScale: 6, speed: 1.1 });
        orb.light = fx.borrowLight(C.blue, 0, 9);
        orb.pos.copy(h.pos).addScaledVector(h.dir, 0.3);
        const b = { orb, power: 0, dist: this._blueDistance(h), loop: sfx.loop({ base: 50, noiseF: 260, vol: 0.3 }), t: 0 };
        s.blue = b;
        this.ctx.ui.callout('술식순전 「창」', h.pos, { color: '#8fd0ff', glow: '#2a7bff', size: 80, dur: 1.2, width: 0.6 });
        h.pulse(0.4, 60);
      } else if (h.pressed?.('trigger') || h.source === 'hand') {
        if (!this._deniedT || this._deniedT < performance.now()) {
          this._deniedT = performance.now() + 1500;
          this.denied(h.pos);
        }
      }
    }
    if (s.blue) {
      const b = s.blue;
      b.t += dt;
      if (h.active && h.blue && this.drain(5 * dt)) {
        b.dist = THREE.MathUtils.lerp(b.dist, this._blueDistance(h, b), 1 - Math.exp(-dt * 6));
        _v.copy(h.pos).addScaledVector(h.dir, b.dist);
        if (_v.y < 0.4) _v.y = 0.4;
        b.orb.pos.lerp(_v, 1 - Math.exp(-dt * 10));
        b.power = Math.min(1, b.power + dt * 2.2);
        b.orb.setRadius(0.1 + 0.22 * b.power);
        if (b.orb.light) b.orb.light.intensity = 4 * b.power;
        b.loop.set(0.4 + 0.6 * b.power, 0.8 + 0.4 * b.power);
        b.loop.pos(b.orb.pos);
        this._applyBlue(b.orb.pos, b.power, dt);
        if (Math.random() < 0.3) h.pulse(0.08 + 0.12 * b.power, 20);
        if (Math.random() < 0.5) fx.implode(b.orb.pos, 3, C.blueHi, 1.6 + b.power * 2, 0.45, 0.05);
      } else {
        this.lingering.push({ b, t: 0 });
        s.blue = null;
      }
      b.orb.update(dt);
    }

    // 혁 충전
    if (!s.red && !s.blue && h.active && h.red) {
      if (this.energy > 5) {
        const orb = new Orb(this.ctx.scene, { core: 0xfff0e0, rim: 0xff1a2a, swirl: 0xff4a3a, swirl2: 0xffb080, dir: -1, radius: 0.03, count: 260, flat: 0.1, swirlScale: 3, speed: 1.6, glowScale: 6 });
        orb.light = fx.borrowLight(C.red, 0, 6);
        orb.pos.copy(h.pos);
        s.red = { orb, charge: 0, loop: sfx.loop({ base: 180, type: 'triangle', noiseF: 1500, vol: 0.12 }) };
        h.pulse(0.3, 40);
      }
    }
    if (s.red) {
      const r = s.red;
      r.charge = Math.min(1, r.charge + dt / 0.7);
      r.orb.pos.copy(h.pos).addScaledVector(h.dir, 0.06);
      r.orb.setRadius(0.025 + 0.06 * r.charge);
      if (r.orb.light) r.orb.light.intensity = 2.5 * r.charge;
      r.loop.set(0.5 + r.charge, 1 + r.charge * 1.5);
      r.loop.pos(r.orb.pos);
      r.orb.update(dt);
      if (Math.random() < 0.4) h.pulse(0.05 + 0.2 * r.charge, 15);
      if (Math.random() < 0.6) {
        _v.randomDirection().multiplyScalar(0.8);
        fx.spawn(r.orb.pos, _v, C.redHi, 0.02, 0.25, 3, 0);
      }
      const fire = r.charge >= 0.25 && (h.thrust > 1.3 || !h.red || !h.active);
      if (fire) this._fireRed(side);
      else if (!h.red || !h.active) {
        this._disposeRed(r);
        s.red = null;
      }
    }
  }

  _applyBlue(center, power, dt) {
    const { world, fx } = this.ctx;
    const R = 2.5 + 5 * power;
    world.forEachInRadius(center, R, (b, d) => {
      b.wake();
      if (b.kind === 'enemy') b.stun = Math.max(b.stun, 0.4);
      _v.subVectors(center, b.pos);
      const dd = Math.max(0.05, d);
      _v.divideScalar(dd);
      const accel = (16 + 42 * Math.sqrt(Math.max(0, 1 - dd / R))) * power;
      b.vel.addScaledVector(_v, accel * dt);
      // 소용돌이
      _v2.crossVectors(_v, UP).normalize();
      b.vel.addScaledVector(_v2, accel * 0.25 * dt);
      // 중심부: 감쇠 + 압축 + 파괴
      if (dd < 1.3) {
        b.vel.multiplyScalar(Math.exp(-dt * 4));
        b.crush = Math.min(1, b.crush + dt * 0.5);
        world.damage(b, 24 * power * dt);
        b.spin.x += dt * 8;
        b.spin.y += dt * 6;
      }
    });
    for (const p of world.projectiles) {
      if (!p.alive) continue;
      const d = p.pos.distanceTo(center);
      if (d < R) {
        _v.subVectors(center, p.pos).normalize();
        p.vel.addScaledVector(_v, 30 * power * dt);
        if (d < 0.5) world.removeProjectile(p);
      }
    }
  }

  _updateLingering(dt) {
    const { fx, sfx, world } = this.ctx;
    for (let i = this.lingering.length - 1; i >= 0; i--) {
      const L = this.lingering[i];
      L.t += dt;
      const b = L.b;
      b.orb.update(dt);
      const k = L.t / 0.5;
      if (k < 1) {
        this._applyBlue(b.orb.pos, b.power, dt);
        b.orb.setRadius((0.1 + 0.22 * b.power) * (1 - k * 0.7));
        fx.implode(b.orb.pos, 6, C.blueHi, 2.5, 0.3, 0.06);
      } else {
        // 붕괴: 중심부 분쇄 후 튕겨나감
        const c = b.orb.pos;
        world.forEachInRadius(c, 2.6, (body, d) => {
          world.damage(body, 45 * b.power);
          _v.subVectors(body.pos, c).normalize();
          body.vel.addScaledVector(_v, 5 + Math.random() * 4);
          body.wake();
        });
        fx.implode(c, 80, C.blueHi, 3, 0.25, 0.08);
        fx.burst(c, 60, C.blue, 5, 0.1, 0.6);
        fx.sphereBlast(c, C.blue, 1.6, 0.3);
        fx.flash(c, C.blue, 8, 0.4);
        sfx.explosion(c, 0.6);
        this._disposeBlue(b);
        this.lingering.splice(i, 1);
      }
    }
  }

  _disposeBlue(b) {
    b.loop.stop();
    b.orb.dispose(this.ctx.fx);
  }

  _disposeRed(r) {
    r.loop.stop(0.1);
    r.orb.dispose(this.ctx.fx);
  }

  _fireRed(side) {
    const { input: inp, fx, sfx, ui } = this.ctx;
    const h = inp[side];
    const r = this.hs[side].red;
    this.hs[side].red = null;
    r.loop.stop(0.05);
    if (!this.spend(8 + 14 * r.charge)) {
      r.orb.dispose(fx);
      this.denied(h.pos);
      return;
    }
    const dir = h.dir.clone().normalize();
    const shot = { orb: r.orb, pos: r.orb.pos, vel: dir.multiplyScalar(26 + 8 * r.charge), charge: r.charge, life: 2.2 };
    r.orb.setRadius(0.08 + 0.1 * r.charge);
    if (r.orb.light) r.orb.light.intensity = 5;
    this.redShots.push(shot);
    ui.callout('술식반전 「혁」', h.pos, { color: '#ff9a8a', glow: '#ff1a2a', size: 80, dur: 1.1, width: 0.6 });
    sfx.zap(h.pos);
    h.pulse(0.9, 90);
    fx.burst(h.pos, 30, C.red, 3, 0.05, 0.3);
  }

  _updateRedShots(dt) {
    const { world, fx } = this.ctx;
    for (let i = this.redShots.length - 1; i >= 0; i--) {
      const s = this.redShots[i];
      s.life -= dt;
      s.orb.update(dt);
      const speed = s.vel.length();
      const steps = Math.max(1, Math.ceil((speed * dt) / 0.25));
      let hit = s.life <= 0;
      for (let k = 0; k < steps && !hit; k++) {
        s.pos.addScaledVector(s.vel, dt / steps);
        if (s.pos.y < 0.12) hit = true;
        for (const b of world.bodies) {
          if (b.alive && b.pos.distanceTo(s.pos) < b.radius + 0.25) {
            hit = true;
            break;
          }
        }
        for (const p of world.projectiles) {
          if (p.alive && p.pos.distanceTo(s.pos) < 0.5) world.removeProjectile(p);
        }
      }
      // 경로 주변을 밀어냄
      _v3.copy(s.vel).normalize();
      world.forEachInRadius(s.pos, 1.5, (b) => {
        _v.subVectors(b.pos, s.pos);
        _v.addScaledVector(_v3, -_v.dot(_v3));
        if (_v.lengthSq() < 1e-4) return;
        b.wake();
        b.vel.addScaledVector(_v.normalize(), 18 * dt);
      });
      fx.spawn(s.pos, _v.randomDirection().multiplyScalar(0.6), C.red, 0.12, 0.3, 2, 0);
      fx.spawn(s.pos, _v.randomDirection().multiplyScalar(1.2), C.redHi, 0.06, 0.25, 2, 0);
      if (hit) {
        this._explodeRed(s.pos.clone(), s.charge);
        s.orb.dispose(fx);
        this.redShots.splice(i, 1);
      }
    }
  }

  _explodeRed(pos, charge) {
    const { world, fx, sfx } = this.ctx;
    const R = 2.5 + 3.5 * charge;
    world.forEachInRadius(pos, R, (b, d) => {
      const k = Math.max(0, 1 - d / R);
      b.wake();
      if (b.kind === 'enemy') b.stun = 1.2;
      _v.subVectors(b.pos, pos).add(_v2.set(0, 0.4, 0)).normalize();
      b.vel.addScaledVector(_v, (16 + 22 * charge) * k * (3 / (b.mass + 1)) + 2);
      b.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      world.damage(b, (45 + 75 * charge) * k);
    });
    for (const p of world.projectiles) if (p.alive && p.pos.distanceTo(pos) < R) world.removeProjectile(p);
    fx.sphereBlast(pos, C.red, 1 + 2 * charge, 0.35);
    fx.burst(pos, 70 + 60 * charge, C.red, 7 + 6 * charge, 0.14, 0.8, { drag: 2.5 });
    fx.burst(pos, 40, C.redHi, 4, 0.08, 0.5);
    fx.shockwave(_v.copy(pos).setY(0.05), C.red, R, 0.5);
    fx.flash(pos, C.red, 10, 0.4, 16);
    sfx.explosion(pos, 0.6 + charge);
  }

  // ── 허식 「자」 ──
  _checkFusion() {
    const inp = this.ctx.input;
    const pairs = [['left', 'right'], ['right', 'left']];
    for (const [a, b] of pairs) {
      const sa = this.hs[a];
      const sb = this.hs[b];
      if (sa.blue && sb.red && sb.red.charge >= 0.3 && inp.handsTogether()) {
        const mid = _v.copy(inp.left.pos).add(inp.right.pos).multiplyScalar(0.5);
        if (!this.spend(30)) {
          if (!this._deniedT || this._deniedT < performance.now()) {
            this._deniedT = performance.now() + 1500;
            this.denied(mid);
          }
          return;
        }
        const { fx, sfx, ui } = this.ctx;
        // 창이 손으로 돌아와 혁과 충돌
        const bluePos = sa.blue.orb.pos.clone();
        for (let i = 0; i < 40; i++) {
          _v2.lerpVectors(bluePos, mid, i / 40);
          fx.spawn(_v2, _v3.randomDirection().multiplyScalar(0.3), C.blueHi, 0.06, 0.4, 2, 0);
        }
        this._disposeBlue(sa.blue);
        this._disposeRed(sb.red);
        sa.blue = null;
        sb.red = null;
        const orb = new Orb(this.ctx.scene, { core: 0xfff4ff, rim: 0x8a2cff, swirl: 0x4aa8ff, swirl2: 0xff4a5a, dir: 1, radius: 0.1, count: 700, flat: 0.3, swirlScale: 3.5, speed: 1.4, pulse: 1, glowScale: 5 });
        orb.light = fx.borrowLight(C.purple, 4, 10);
        orb.pos.copy(mid);
        this.purple = { orb, charge: 0, loop: sfx.loop({ base: 36, noiseF: 500, vol: 0.4 }) };
        ui.callout('허식 「자」', mid, { color: '#e2c4ff', glow: '#8a2cff', size: 96, dur: 1.6, width: 0.8 });
        fx.burst(mid, 60, C.purpleHi, 2.5, 0.05, 0.5);
        inp.left.pulse(1, 120);
        inp.right.pulse(1, 120);
        return;
      }
    }
  }

  _disposePurple(p) {
    p.loop.stop();
    p.orb.dispose(this.ctx.fx);
  }

  _updatePurple(dt) {
    const p = this.purple;
    if (!p) return;
    const { input: inp, fx } = this.ctx;
    const L = inp.left;
    const R = inp.right;
    const mid = _v.copy(L.pos).add(R.pos).multiplyScalar(0.5);
    if (inp.mode === 'desktop') mid.copy(inp.head).addScaledVector(inp.headDir, 0.5).add(_v2.set(0, -0.12, 0));
    _v2.subVectors(mid, inp.head).normalize();
    mid.addScaledVector(_v2, 0.12);
    p.orb.pos.lerp(mid, 1 - Math.exp(-dt * 14));
    p.charge = Math.min(1, p.charge + dt / 1.2);
    p.orb.setRadius(0.09 + 0.2 * p.charge);
    p.orb.update(dt);
    p.loop.set(0.6 + 0.6 * p.charge, 1 + p.charge);
    p.loop.pos(p.orb.pos);
    if (Math.random() < 0.5) {
      L.pulse(0.2 + 0.5 * p.charge, 20);
      R.pulse(0.2 + 0.5 * p.charge, 20);
    }
    fx.implode(p.orb.pos, 3, Math.random() < 0.5 ? C.blue : C.red, 0.6 + p.charge * 0.5, 0.3, 0.03);

    // 발사 조건
    const launchDir = _v3.subVectors(p.orb.pos, inp.head).normalize();
    const pushL = L.vel.dot(launchDir);
    const pushR = R.vel.dot(launchDir);
    const pushed = (pushL + pushR) * 0.5 > 1.1 || Math.max(pushL, pushR) > 2.0;
    const holding = (L.blue || L.red || L.btn.trigger) || (R.blue || R.red || R.btn.trigger);
    const apart = inp.mode === 'xr' && L.pos.distanceTo(R.pos) > 0.55;
    const released = !holding || apart || !L.active || !R.active;
    if (p.charge >= 0.3 && (pushed || released)) this._launchPurple();
    else if (released && p.charge < 0.3 && !pushed) {
      // 충전 부족이면 흩어진다
      fx.burst(p.orb.pos, 40, C.purpleHi, 2, 0.05, 0.5);
      this.energy = Math.min(this.maxEnergy, this.energy + 15 * this.costMul);
      this._disposePurple(p);
      this.purple = null;
    }
  }

  _launchPurple() {
    const p = this.purple;
    this.purple = null;
    const { input: inp, fx, sfx } = this.ctx;
    p.loop.stop(1.5);
    let dir;
    if (inp.mode === 'desktop') dir = inp.headDir.clone();
    else {
      const toOrb = _v.subVectors(p.orb.pos, inp.head).normalize();
      const hands = _v2.copy(inp.left.dir).add(inp.right.dir).normalize();
      dir = toOrb.multiplyScalar(0.6).add(hands.multiplyScalar(0.4)).normalize();
    }
    const shot = {
      orb: p.orb, pos: p.orb.pos, vel: dir.multiplyScalar(20), dir: dir.clone().normalize(),
      r: p.orb.radius, rTarget: 1.0 + 1.5 * p.charge, life: 4.5, charge: p.charge, trenchAcc: 0,
    };
    if (shot.orb.light) {
      shot.orb.light.intensity = 10;
      shot.orb.light.distance = 25;
    }
    this.purpleShots.push(shot);
    this._needRelease.left = this._needRelease.right = true;
    sfx.explosion(shot.pos, 2.2);
    sfx.tone({ type: 'sawtooth', f0: 90, f1: 30, dur: 2.5, vol: 0.35, at: shot.pos });
    fx.flash(shot.pos, C.purpleHi, 14, 0.5, 20);
    fx.burst(shot.pos, 120, C.purpleHi, 6, 0.08, 0.6);
    inp.left.pulse(1, 250);
    inp.right.pulse(1, 250);
  }

  _updatePurpleShots(dt) {
    const { world, fx, scene } = this.ctx;
    for (let i = this.purpleShots.length - 1; i >= 0; i--) {
      const s = this.purpleShots[i];
      s.life -= dt;
      const fade = s.life < 0.6 ? Math.max(0, s.life / 0.6) : 1;
      s.r = THREE.MathUtils.lerp(s.r, s.rTarget, 1 - Math.exp(-dt * 3.5)) * (fade < 1 ? 0.97 : 1);
      s.orb.setRadius(s.r * Math.max(0.05, fade));
      s.orb.update(dt);
      const step = s.vel.length() * dt;
      const steps = Math.max(1, Math.ceil(step / 0.5));
      for (let k = 0; k < steps; k++) {
        s.pos.addScaledVector(s.vel, dt / steps);
        const r = s.r * fade;
        world.forEachInRadius(s.pos, r, (b) => world.erase(b));
        for (const p of world.projectiles) if (p.alive && p.pos.distanceTo(s.pos) < r + 0.2) world.removeProjectile(p, false);
        // 바닥을 도려낸 흔적
        if (s.pos.y - r < 0.05 && r > 0.4) {
          s.trenchAcc += step / steps;
          if (s.trenchAcc > 0.5) {
            s.trenchAcc = 0;
            const halfW = Math.sqrt(Math.max(0, r * r - s.pos.y * s.pos.y));
            if (halfW > 0.2) this._addTrench(s.pos, s.dir, halfW * 2);
          }
        }
      }
      // 꼬리
      for (let k = 0; k < 8; k++) {
        _v.randomDirection();
        _v2.copy(s.pos).addScaledVector(_v, s.r * fade);
        _v.multiplyScalar(1.5).addScaledVector(s.dir, -3);
        fx.spawn(_v2, _v, k % 3 === 0 ? C.blue : k % 3 === 1 ? C.red : C.purpleHi, 0.15 * s.r, 0.6, 1.5, 0);
      }
      if (s.life <= 0) {
        s.orb.dispose(fx);
        this.purpleShots.splice(i, 1);
      }
    }
    void scene;
  }

  _addTrench(pos, dir, width) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a3cff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(this.trenchGeo, mat);
    m.position.set(pos.x, 0.02, pos.z);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    m.scale.set(width, 1, 0.7);
    this.ctx.scene.add(m);
    this.trenches.push({ mesh: m, t: 0 });
    this.ctx.fx.burst(_v.set(pos.x, 0.1, pos.z), 6, new THREE.Color(0x6a6a7a), 3, 0.1, 1.0, { up: 1, grav: 6 });
  }

  _updateTrenches(dt) {
    for (let i = this.trenches.length - 1; i >= 0; i--) {
      const t = this.trenches[i];
      t.t += dt;
      const k = t.t / 7;
      t.mesh.material.opacity = 0.85 * (1 - k);
      t.mesh.material.color.setHSL(0.75 - k * 0.1, 0.8, 0.5 * (1 - k * 0.6));
      if (k >= 1) {
        this.ctx.scene.remove(t.mesh);
        t.mesh.material.dispose();
        this.trenches.splice(i, 1);
      }
    }
  }

  // ── 영역전개 「무량공처」 ──
  _updateDomain(dt) {
    const { input: inp, fx } = this.ctx;
    const d = this.domain;
    d.cd = Math.max(0, d.cd - dt);
    const sign = inp.left.domainSign || inp.right.domainSign;
    const ring = this.signRing;
    if (sign && (d.state === 'active' ? d.t > 2 : d.cd <= 0)) {
      d.sign += dt;
      if (Math.random() < 0.5) {
        inp.left.pulse(0.1 + d.sign * 0.4, 20);
        inp.right.pulse(0.1 + d.sign * 0.4, 20);
      }
      if (d.state !== 'active' && Math.random() < 0.6) fx.implode(_v.copy(inp.head).addScaledVector(inp.headDir, 0.4), 2, C.blueHi, 0.5, 0.3, 0.02);
      if (d.sign >= 1.0) {
        d.sign = 0;
        if (d.state === 'active') this._endDomain();
        else this._castDomain();
      }
    } else d.sign = Math.max(0, d.sign - dt * 2);
    ring.material.opacity = Math.min(1, d.sign) * 0.9;
    ring.visible = d.sign > 0.01;
    ring.position.set(inp.head.x, 0.03, inp.head.z);
    ring.scale.setScalar(0.4 + d.sign * 1.8);

    if (d.state === 'active') {
      d.t += dt;
      if (d.t >= d.duration) this._endDomain();
    }
  }

  _castDomain() {
    const { input: inp, world, env, ui, sfx, fx } = this.ctx;
    if (!this.spend(40)) {
      this.denied(null);
      return;
    }
    const d = this.domain;
    d.state = 'active';
    d.t = 0;
    const center = new THREE.Vector3(inp.head.x, 0, inp.head.z);
    world.domain = { center, radius: 45 };
    env.setDomain(true, center);
    ui.bigTitle('영역전개', '無量空処', '무 량 공 처');
    sfx.domain();
    fx.shockwave(_v.copy(center).setY(0.05), new THREE.Color(0xdff0ff), 40, 1.6);
    fx.shockwave(_v.copy(inp.head), new THREE.Color(0x9fc8ff), 6, 0.8, { faceDir: inp.headDir.clone() });
    fx.burst(inp.head, 150, new THREE.Color(0xdfefff), 8, 0.05, 1.2, { drag: 1 });
    inp.left.pulse(1, 300);
    inp.right.pulse(1, 300);
  }

  _endDomain() {
    const { world, env, ui, sfx } = this.ctx;
    const d = this.domain;
    d.state = 'idle';
    d.cd = 6;
    world.domain = null;
    env.setDomain(false);
    ui.callout('영역 해제', null, { color: '#cfe3ff', size: 70, dur: 1.2 });
    sfx.tone({ type: 'sine', f0: 600, f1: 120, dur: 1.2, vol: 0.2 });
  }

  dispose() {
    this.reset();
    this.ctx.scene.remove(this.signRing);
  }
}
