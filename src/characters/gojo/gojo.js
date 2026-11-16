// 고죠 사토루 — 무하한 주술 + 육안
//  · 무하한: 자신에게 다가오는 모든 것이 "무한"에 막혀 닿지 않는다
//  · 술식순전 「蒼(창)」: 수렴하는 무한 → 인력 구체
//  · 술식반전 「赫(혁)」: 발산하는 무한 → 척력탄
//  · 허식 「茈(자)」: 창과 혁을 충돌시킨 가상의 질량 → 경로상의 모든 것을 소멸
//  · 영역전개 「無量空処(무량공처)」: 무한한 정보를 주입해 영역 안의 대상을 정지
//  · 육안: 주력 소모 감소 + 탄도 시각화
import * as THREE from 'three';
import { EnergyOrb } from './vfx.js';
import { UnlimitedVoid } from './domainVoid.js';
import { Bolts } from '../../core/fx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const C = {
  blue: new THREE.Color(0x3a9aff),
  blueHi: new THREE.Color(0xbfe8ff),
  red: new THREE.Color(0xff2a3a),
  redHi: new THREE.Color(0xffb080),
  purple: new THREE.Color(0xa04cff),
  purpleHi: new THREE.Color(0xf0d0ff),
  inf: new THREE.Color(0x9fe8ff),
};

export class Gojo {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'gojo';
    this.name = '고죠 사토루';
    this.energy = 100;
    this.maxEnergy = 100;
    this.infinity = true;
    this.sixEyes = true;
    this.hs = { left: this._handState(), right: this._handState() };
    this.lingering = [];
    this.redShots = [];
    this.purple = null;
    this.purpleShots = [];
    this.trenches = [];
    this.domain = { t: 0, sign: 0, cd: 0, duration: 14 };
    this.void = new UnlimitedVoid(ctx);
    this._rippleT = 0;
    this._needRelease = { left: false, right: false };
    this._holds = { palmOut: 0, eyeArm: 0, eyeArmed: false };
    this._deskDist = 4;
    this._onWheel = (e) => {
      this._deskDist = THREE.MathUtils.clamp(this._deskDist - Math.sign(e.deltaY) * 0.5, 1.5, 9);
    };
    window.addEventListener('wheel', this._onWheel);

    ctx.world.shield = (o, dt, center) => this._infinity(o, dt, center);
    ctx.world.meleeShield = (dummy, fist) => this._meleeShield(fist);

    this.signRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    ctx.scene.add(this.signRing);
    this.trenchGeo = new THREE.PlaneGeometry(1, 1);
    this.trenchGeo.rotateX(-Math.PI / 2);
  }

  _handState() {
    return { mode: null, orb: null, power: 0, dist: 3, loop: null, t: 0, charge: 0 };
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

  denied() {
    if (this._deniedT && this._deniedT > performance.now()) return;
    this._deniedT = performance.now() + 1500;
    this.ctx.sfx.denied();
    this.ctx.ui.callout('주력 부족', { color: '#ff8a8a' });
  }

  // ── 메뉴/HUD ──
  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '술식순전 「蒼」 — 인력', color: '#7fc4ff', text: '검지+중지로 앞을 가리키면 손가락 끝에 생성\n그 상태로 손을 펴면 창이 손을 따라 멀리 이동(팔을 뻗을수록 멀리)' },
        { head: '술식반전 「赫」 — 척력', color: '#ff7a7a', text: '검지만 펴서 충전 → 앞으로 찌르거나 손을 펴면 발사' },
        { head: '창 ↔ 혁 전환 · 취소', color: '#ffffff', text: '창 상태에서 검지만 → 혁 / 혁 상태에서 검지+중지 → 창 · 주먹을 쥐면 사라짐' },
        { head: '허식 「茈」 — 소멸', color: '#c89bff', text: '수인: 검지·중지를 접고 그 위에 엄지를 얹은 채 약지·새끼를 펴기\n→ 창과 혁이 돌며 섞여 茈 완성 → 손을 펴거나 앞으로 밀면 발사 · 주먹은 취소' },
        { head: '영역전개 「無量空処」', color: '#e8f0ff', text: '검지·중지만 펴서 얼굴 앞에 세우고 6초 유지 (1초째부터 영창)\n전개 중 같은 자세 1.5초 → 해제 · 설정에서 손동작 끄기 / 메뉴에서 발동' },
        { head: '무하한 · 육안 · 잡기 · 흑섬', color: '#9fe8ff', text: '무하한: 양 손바닥을 앞으로 1초 · 육안: 손으로 눈을 0.5초 가리기\n더미에 손을 대고 주먹 → 잡기, 펴면 던지기 · 빠르게 주먹으로 치면 흑섬 확률' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴 · R 더미 소환' },
        { head: '蒼 / 赫', color: '#7fc4ff', text: '우클릭 유지: 창 (휠: 거리) · 좌클릭 충전 후 놓기: 혁' },
        { head: '茈', color: '#c89bff', text: 'E 유지 → 창·혁이 섞여 茈 완성 → E를 놓으면 발사' },
        { head: '無量空処 / 토글', color: '#e8f0ff', text: 'Q 6초: 영역전개 · I 무하한 · O 육안 · V 주먹(흑섬)' },
      ];
    }
    return [
      { head: '술식순전 「蒼」 — 인력', color: '#7fc4ff', text: '왼쪽 트리거 유지. 팔을 뻗을수록 멀리 생성' },
      { head: '술식반전 「赫」 — 척력', color: '#ff7a7a', text: '오른쪽 트리거로 충전 → 놓거나 앞으로 찌르면 발사' },
      { head: '허식 「茈」 — 소멸', color: '#c89bff', text: '창 + 혁 유지 상태로 두 컨트롤러를 맞대기 → 밀거나 트리거를 놓아 발사' },
      { head: '영역전개 「無量空処」', color: '#e8f0ff', text: '양쪽 스틱을 눌러 6초 (1초째부터 영창, 메뉴에서도 발동)' },
      { head: '버튼', color: '#9fe8ff', text: 'X 무하한 · A 육안 · B 더미 소환 · Y 메뉴\n그립: 더미 잡기/던지기 · 그립 쥐고 휘둘러 치기 → 흑섬' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const d = this.domain;
    let dom = '준비';
    if (this.void.state === 'active') dom = `전개 중 ${Math.max(0, Math.ceil(d.duration - d.t))}s`;
    else if (this.void.state !== 'idle') dom = '전개 중';
    else if (d.cd > 0) dom = `재사용 ${Math.ceil(d.cd)}s`;
    return [
      { label: '주력', bar: this.energy / this.maxEnergy, color: '#6fd0ff' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff6f7f' },
      { label: '무하한', text: this.infinity ? 'ON' : 'OFF', textColor: this.infinity ? '#9fe8ff' : '#888' },
      { label: '육안', text: this.sixEyes ? 'ON (소모 -70%)' : 'OFF', textColor: this.sixEyes ? '#9fe8ff' : '#888' },
      { label: '영역', text: dom },
      { label: '처치', text: `${w.kills}` },
    ];
  }

  setInfinity(on) {
    this.infinity = on;
    this.ctx.sfx.toggle(on);
    if (on) {
      this.ctx.ui.manga({ main: '無下限', ruby: 'むかげん', color: '#7fe0ff', dur: 1.2 });
      this.ctx.fx.shockwave(this.ctx.input.bodyCenter(_v).setY(0.05), C.inf, 1.4, 0.6);
    } else this.ctx.ui.callout('무하한 해제', { color: '#9fe8ff' });
  }

  setSixEyes(on) {
    this.sixEyes = on;
    this.ctx.sfx.toggle(on);
    if (on) this.ctx.ui.manga({ main: '六眼', ruby: 'りくがん', color: '#40c8ff', dur: 1.2 });
    else this.ctx.ui.callout('육안 봉인', { color: '#7fe0ff' });
  }

  // ── 입력 해석 ──
  /** 손 하나의 상태 요약. 핸드트래킹은 손 모양(gesture) 기반 */
  _intent(h) {
    const I = { blue: false, red: false, sign: false, purple: false, released: false, fist: false, open: false, gesture: 'none', gt: 0, src: h.source };
    if (!h.active || h.uiBlock || this.ctx.ui.menuOpen || this.ctx.grab?.isHolding(h.side)) return I;
    const inp = this.ctx.input;
    if (h.source === 'controller') {
      I.blue = h.side === 'left' && h.btn.trigger;
      I.red = h.side === 'right' && h.btn.trigger;
      I.released = !h.btn.trigger;
      I.sign = inp.left.btn.stick && inp.right.btn.stick ? 1 : 0;
      return I;
    }
    if (h.source === 'desktop') {
      I.blue = h.side === 'left' && inp.mouse.right;
      I.red = h.side === 'right' && inp.mouse.left;
      I.released = h.side === 'left' ? !inp.mouse.right : !inp.mouse.left;
      I.sign = inp.keyDown('KeyQ') ? 1 : 0;
      I.purple = h.side === 'right' && inp.keyDown('KeyE');
      return I;
    }
    const g = h.gesture;
    const gt = h.gestureTime;
    I.gesture = g;
    I.gt = gt;
    _v.subVectors(h.pos, inp.head);
    const dist = _v.length();
    _v.normalize();
    const outward = h.dir.dot(_v) > 0.25;
    const nearFace = h.palm.distanceTo(inp.head) < 0.42;
    // 영역전개 수인 (설정에서 끌 수 있음)
    //  · 검지·중지만 펴서(또는 꼬아서) 얼굴 앞에 세우고 6초 유지 — 1초째부터 영창 음성
    const inFront = _v.dot(_v3.copy(inp.headDir).setY(0).normalize()) > 0.2;
    if (this.ctx.settings.domainGesture && nearFace && inFront) {
      if (g === 'crossed' && h.dir.y > 0.3) I.sign = 1;
      else if (g === 'two' && h.dir.y > 0.6) I.sign = 1;
    }
    // 창: 두 손가락으로 앞을 가리키고 0.2초 (얼굴 근처·위를 가리키면 무시)
    I.blue = g === 'two' && gt >= 0.2 && outward && !nearFace && h.dir.y < 0.6 && dist > 0.3;
    // 혁: 검지만 펴고 0.2초
    I.red = g === 'point' && gt >= 0.2 && outward && !nearFace;
    // 허식 「茈」 수인: 엄지를 접은 검지·중지 위에 얹고 약지·새끼를 편다
    I.purple = g === 'purple' && gt >= 0.2;
    I.fist = g === 'fist' && gt >= 0.08;
    I.open = g === 'open' && gt >= 0.08;
    I.released = I.open || I.fist;
    return I;
  }

  // ── 메인 루프 ──
  update(dt) {
    const { input: inp, world, fx } = this.ctx;
    if (!this.ctx.ui.menuOpen) this._toggles(dt);

    if (!this.purple) this.energy = Math.min(this.maxEnergy, this.energy + 11 * dt);
    if (this.infinity) this.drain(1.2 * dt);

    const IL = this._intent(inp.left);
    const IR = this._intent(inp.right);
    this._signSide = IL.sign ? 'left' : IR.sign ? 'right' : null;
    this._updateDomain(dt, !!(IL.sign || IR.sign));
    if (!IL.purple && !IR.purple) this._purpleLock = false;
    if (!this.purple && !this._purpleLock && this.domain.sign <= 0.05) {
      // 한 손 수인 → 창과 혁을 불러내 섞는다
      for (const [side, I] of [['left', IL], ['right', IR]]) {
        if (I.purple && !this.purple && this.void.state === 'idle') this._beginPurple(side, inp.mode === 'desktop' ? 'desk' : 'one');
      }
    }
    if (!this.purple) {
      this._updateHand('left', IL, dt);
      this._updateHand('right', IR, dt);
      this._checkFusion();
    }
    this._updatePurple(dt, IL, IR);
    this._updateLingering(dt);
    this._updateRedShots(dt);
    this._updatePurpleShots(dt);
    this._updateTrenches(dt);
    this.void.update(dt);

    // 잘린 조각도 창에 끌려온다
    const blues = [];
    for (const s of Object.values(this.hs)) if (s.mode === 'blue') blues.push([s.orb.pos, s.power]);
    for (const L of this.lingering) blues.push([L.s.orb.pos, L.s.power * 0.8]);
    world.pieceForce = blues.length
      ? (p, dt2) => {
          for (const [c, pw] of blues) {
            _v.subVectors(c, p.pivot.position);
            const d = _v.length();
            if (d < 5 * pw + 1) {
              p.vel.addScaledVector(_v.normalize(), 30 * pw * dt2);
              if (d < 0.8) p.vel.multiplyScalar(Math.exp(-dt2 * 4));
              p.vel.y += 9.8 * dt2 * 0.9;
            }
          }
        }
      : null;

    // 육안: 탄도 표시 + 손끝 주력 흐름
    if (this.sixEyes) {
      for (const b of world.bullets) {
        if (Math.random() < 0.5) fx.spawn(_v.copy(b.pos).addScaledVector(b.vel, Math.random() * 0.6), _v2.set(0, 0, 0), C.inf, 0.015, 0.25, 0, 0);
      }
      if (inp.mode === 'xr') {
        for (const h of inp.hands) {
          if (!h.active || Math.random() > 0.4) continue;
          fx.spawn(h.indexTip, _v.randomDirection().multiplyScalar(0.04), C.blueHi, 0.008, 0.3, 2, 0);
        }
      }
    }
    this._rippleT -= dt;
  }

  _toggles(dt) {
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    if (L.source === 'controller' && L.pressed('a')) this.setInfinity(!this.infinity); // X
    if (R.source === 'controller' && R.pressed('a')) this.setSixEyes(!this.sixEyes); // A
    if (inp.mode === 'desktop') {
      if (inp.keyDown('KeyI') && !this._kI) this.setInfinity(!this.infinity);
      if (inp.keyDown('KeyO') && !this._kO) this.setSixEyes(!this.sixEyes);
      this._kI = inp.keyDown('KeyI');
      this._kO = inp.keyDown('KeyO');
    }
    const H = this._holds;
    const hand = (h) => h.active && h.source === 'hand';
    const palmOut = (h) => {
      if (!hand(h) || h.gesture !== 'open') return false;
      _v.subVectors(h.palm, inp.head).normalize();
      return h.palmNormal.dot(_v) > 0.6 && h.palm.distanceTo(inp.head) > 0.3;
    };
    if (palmOut(L) && palmOut(R) && !this.hs.left.mode && !this.hs.right.mode) {
      H.palmOut += dt;
      if (H.palmOut > 1.0) {
        this.setInfinity(!this.infinity);
        H.palmOut = -1.5;
      }
    } else if (H.palmOut > 0) H.palmOut = 0;
    else H.palmOut = Math.min(0, H.palmOut + dt);
    // 육안: 손으로 눈을 가리고 0.5초 → 전환 (손을 떼야 다시 가능)
    //  얼굴에 손을 대면 추적이 끊기기 쉬우므로, 가까이 다가온 직후 추적이 끊겨도 가린 것으로 본다
    let covering = false;
    for (const h of inp.hands) {
      if (h.source !== 'hand') continue;
      if (h.active) {
        if (['two', 'crossed', 'point', 'purple'].includes(h.gesture)) continue;
        _v.subVectors(h.palm, inp.head);
        const d = _v.length();
        const front = _v.dot(inp.headDir);
        h._nearEyes = d < 0.2 && front > -0.02;
        if (h._nearEyes) covering = true;
        h._lostNear = 0;
      } else if (h._nearEyes) {
        h._lostNear = (h._lostNear ?? 0) + dt;
        if (h._lostNear < 1.5) covering = true;
        else h._nearEyes = false;
      }
    }
    if (covering && !this.hs.left.mode && !this.hs.right.mode && !this.purple) {
      H.eyeArm += dt;
      if (H.eyeArm > 0.5 && !H.eyeArmed) {
        H.eyeArmed = true;
        this.setSixEyes(!this.sixEyes);
        inp.left.pulse(0.6, 80);
        inp.right.pulse(0.6, 80);
      }
    } else {
      H.eyeArmed = false;
      H.eyeArm = 0;
    }
  }

  // ── 무하한 ──
  _infinity(o, dt, center) {
    if (!this.infinity) return;
    const R = 1.5;
    const rMin = 0.55;
    const pos = o.center ? o.center(_v3) : o.pos;
    _v.subVectors(pos, center);
    const d = _v.length();
    if (d > R || d < 1e-4) return;
    const n = _v.divideScalar(d);
    const radial = o.vel.dot(n);
    if (radial >= 0) return;
    // 가까워질수록 허용 접근 속도가 0으로 수렴 → 영원히 닿지 않는다 (제논의 역설)
    const maxIn = 2.2 * Math.max(0, d - rMin);
    if (-radial > maxIn) o.vel.addScaledVector(n, -radial - maxIn);
    _v2.copy(o.vel).addScaledVector(n, -o.vel.dot(n));
    o.vel.addScaledVector(_v2, -Math.min(1, dt * 3));
    if (!o._infTouched) {
      o._infTouched = true;
      this._ripple(_v3.copy(center).addScaledVector(n, d * 0.92), n.clone());
    }
  }

  _meleeShield(fist) {
    if (!this.infinity) return false;
    const c = this.ctx.input.bodyCenter(new THREE.Vector3());
    const n = new THREE.Vector3().subVectors(fist, c).normalize();
    this._ripple(c.addScaledVector(n, 0.6), n);
    return true;
  }

  _ripple(p, n) {
    const fx = this.ctx.fx;
    fx.shockwave(p, C.inf, 0.45, 0.6, { faceDir: n, opacity: 0.9 });
    fx.shockwave(p, C.inf, 0.25, 0.4, { faceDir: n, opacity: 0.6 });
    fx.starFlare(p, 0xdff6ff, 0.25, 0.3);
    fx.burst(p, 10, C.inf, 0.5, 0.02, 0.5);
    if (this._rippleT <= 0) {
      this._rippleT = 0.12;
      this.ctx.sfx.ripple(p);
    }
  }

  // ── 창 / 혁 ──
  _blueDistance(h) {
    const inp = this.ctx.input;
    if (h.source === 'desktop') return this._deskDist;
    const ext = h.palm.distanceTo(inp.head);
    const k = THREE.MathUtils.clamp((ext - 0.28) / 0.32, 0, 1);
    return THREE.MathUtils.lerp(1.4, 6.5, k);
  }

  _updateHand(side, I, dt) {
    const { input: inp, fx } = this.ctx;
    const h = inp[side];
    const s = this.hs[side];
    if (this._needRelease[side]) {
      if (!I.blue && !I.red && !(h.source === 'hand' && (I.gesture === 'two' || I.gesture === 'point'))) this._needRelease[side] = false;
      else return;
    }
    const handMode = h.source === 'hand';

    if (!s.mode && this.domain.sign <= 0.05) {
      if (I.blue) {
        if (this.energy > 3) this._startBlue(side, h, handMode ? 'tip' : 'far');
        else this.denied();
      } else if (I.red) {
        if (this.energy > 5) this._startRed(side, h);
        else this.denied();
      }
    }
    if (!s.mode) return;
    s.t += dt;

    // 공통: 주먹을 쥐면 사라진다
    if (handMode && I.fist) {
      fx.implode(s.orb.pos, 16, s.mode === 'blue' ? C.blueHi : C.redHi, 0.25, 0.2, 0.02);
      this.ctx.sfx.play('whoosh', { at: s.orb.pos, vol: 0.35, rate: 1.6 });
      if (s.mode === 'blue') this._disposeBlue(s);
      else this._disposeRed(s);
      h.pulse(0.3, 30);
      return;
    }
    // 손이 사라지면(추적 끊김) 즉시 해제 — 다시 잡혀도 이어지지 않는다
    if (!h.active) {
      fx.implode(s.orb.pos, 12, s.mode === 'blue' ? C.blueHi : C.redHi, 0.2, 0.2, 0.02);
      if (s.mode === 'blue') this._disposeBlue(s);
      else this._disposeRed(s);
      return;
    }

    if (s.mode === 'blue') {
      // 창 → 혁 전환 (검지만)
      if (handMode && I.gesture === 'point' && I.gt > 0.15) {
        this._convert(side, 'red');
        return;
      }
      if (handMode) {
        if (I.open && s.sub !== 'far') {
          s.sub = 'far';
          s.dist = 0.4;
          h.pulse(0.3, 30);
        } else if (I.gesture === 'two' && I.gt > 0.18 && s.sub === 'far') s.sub = 'tip';
      } else if (!I.blue) {
        this.lingering.push({ s: { ...s }, t: 0 });
        Object.assign(s, this._handState());
        return;
      }
      if (!this.drain((s.sub === 'far' ? 4.5 : 1.5) * dt)) {
        this.lingering.push({ s: { ...s }, t: 0 });
        Object.assign(s, this._handState());
        return;
      }
      s.power = Math.min(1, s.power + dt * 2.2);
      if (s.sub === 'tip') {
        // 손가락 끝에 작게
        s.orb.pos.lerp(_v.copy(h.pos).addScaledVector(h.dir, 0.06), 1 - Math.exp(-dt * 25));
        s.orb.setRadius(0.035 + 0.025 * s.power);
        if (s.orb.light) s.orb.light.intensity = 1.5 * s.power;
        this._applyBlue(s.orb.pos, s.power * 0.25, dt, 1.0);
      } else {
        // 손을 편 상태: 손 위치·팔 뻗음에 따라 멀리 이동
        const dir = handMode ? h.fingersDir : h.dir;
        s.dist = THREE.MathUtils.lerp(s.dist, this._blueDistance(h), 1 - Math.exp(-dt * 5));
        _v.copy(h.palm).addScaledVector(dir, s.dist);
        if (_v.y < 0.35) _v.y = 0.35;
        s.orb.pos.lerp(_v, 1 - Math.exp(-dt * 10));
        s.orb.setRadius(0.07 + 0.09 * s.power);
        if (s.orb.light) s.orb.light.intensity = 4 * s.power;
        this._applyBlue(s.orb.pos, s.power, dt);
        if (Math.random() < 0.6) fx.implode(s.orb.pos, 3, C.blueHi, 0.8 + s.power * 1.4, 0.4, 0.03);
      }
      s.loop.set(0.3 + 0.7 * s.power * (s.sub === 'far' ? 1 : 0.4), 0.8 + 0.4 * s.power);
      s.loop.pos(s.orb.pos);
      if (Math.random() < 0.3) h.pulse(0.05 + 0.1 * s.power, 20);
      s.orb.update(dt, s.sub === 'far' ? s.power : 0.6);
    } else if (s.mode === 'red') {
      // 혁 → 창 전환 (두 손가락)
      if (handMode && I.gesture === 'two' && I.gt > 0.15) {
        this._convert(side, 'blue');
        return;
      }
      s.charge = Math.min(1, s.charge + dt / 0.6);
      s.orb.pos.copy(h.pos).addScaledVector(h.dir, 0.05);
      s.orb.setRadius(0.025 + 0.045 * s.charge);
      if (s.orb.light) s.orb.light.intensity = 2.5 * s.charge;
      s.loop.set(0.5 + s.charge, 1 + s.charge * 1.5);
      s.loop.pos(s.orb.pos);
      s.orb.update(dt, 0.5 + s.charge * 0.5);
      if (Math.random() < 0.4) h.pulse(0.05 + 0.2 * s.charge, 15);
      const released = handMode ? I.open : !I.red;
      if (s.charge >= 0.25 && (h.thrust > 1.4 || released)) this._fireRed(side);
      else if (released) this._disposeRed(s);
    }
  }

  /** 창 ↔ 혁 전환 */
  _convert(side, to) {
    const h = this.ctx.input[side];
    const s = this.hs[side];
    const keep = s.mode === 'blue' ? s.power : s.charge;
    const pos = s.orb.pos.clone();
    if (s.mode === 'blue') this._disposeBlue(s);
    else this._disposeRed(s);
    this.ctx.fx.burst(pos, 20, to === 'red' ? C.red : C.blue, 1, 0.02, 0.3);
    if (to === 'red') {
      this._startRed(side, h);
      this.hs[side].charge = Math.min(1, keep * 0.6);
    } else {
      this._startBlue(side, h, 'tip');
      this.hs[side].power = keep;
    }
  }

  /** 다른 시스템(잡기 등)이 이 손을 써도 되는지 */
  handBusy(side) {
    return !!this.hs[side].mode || !!this.purple;
  }

  _startBlue(side, h, sub = 'tip') {
    const { fx, sfx, ui } = this.ctx;
    const s = this.hs[side];
    const orb = new EnergyOrb(this.ctx, 'blue', 0.03);
    orb.light = fx.borrowLight(C.blue, 0, 7);
    orb.pos.copy(h.pos).addScaledVector(h.dir, 0.06);
    Object.assign(s, { mode: 'blue', sub, orb, power: 0, dist: this._blueDistance(h), loop: sfx.loop({ sample: 'blue', base: 50, noiseF: 260, vol: 0.45 }), t: 0 });
    ui.manga({ top: '術式順転', main: '「蒼」', ruby: 'あお', color: '#2f8cff', side });
    h.pulse(0.4, 60);
  }

  _startRed(side, h) {
    const { fx, sfx, ui } = this.ctx;
    const s = this.hs[side];
    const orb = new EnergyOrb(this.ctx, 'red', 0.03);
    orb.light = fx.borrowLight(C.red, 0, 5);
    orb.pos.copy(h.pos);
    Object.assign(s, { mode: 'red', orb, charge: 0, loop: sfx.loop({ sample: 'red', base: 180, type: 'triangle', noiseF: 1500, vol: 0.3 }), t: 0 });
    h.pulse(0.3, 40);
    void ui;
  }

  _applyBlue(center, power, dt, rOverride) {
    const { world } = this.ctx;
    const R = rOverride ?? 1.5 + 4 * power;
    world.forEachTarget(center, R, (t, d, c) => {
      _v.subVectors(center, c);
      const dd = Math.max(0.05, d);
      _v.divideScalar(dd);
      const accel = (14 + 36 * Math.sqrt(Math.max(0, 1 - dd / R))) * power;
      _v2.copy(_v).multiplyScalar(accel * dt);
      _v2.addScaledVector(_v3.crossVectors(_v, UP).normalize(), accel * 0.25 * dt);
      _v2.y += 9.8 * dt * 0.8 * power;
      t.impulse(_v2);
      if (dd < 1.0) {
        t.vel.multiplyScalar(Math.exp(-dt * 4));
        if (t.kind === 'prop') t.crush = Math.min(1, t.crush + dt * 0.5);
        t.damage(26 * power * dt, { type: 'crush', silent: true });
      }
    });
    for (const b of world.bullets) {
      if (!b.alive) continue;
      const d = b.pos.distanceTo(center);
      if (d < R) {
        b.vel.addScaledVector(_v.subVectors(center, b.pos).normalize(), 30 * power * dt);
        if (d < 0.3) world.removeBullet(b);
      }
    }
  }

  _updateLingering(dt) {
    const { fx, sfx, world } = this.ctx;
    for (let i = this.lingering.length - 1; i >= 0; i--) {
      const L = this.lingering[i];
      const s = L.s;
      L.t += dt;
      s.orb.update(dt, s.power);
      const k = L.t / 0.45;
      if (k < 1) {
        this._applyBlue(s.orb.pos, s.power, dt);
        s.orb.setRadius((0.07 + 0.09 * s.power) * (1 - k * 0.6));
        fx.implode(s.orb.pos, 6, C.blueHi, 1.6, 0.3, 0.04);
      } else {
        const c = s.orb.pos.clone();
        world.forEachTarget(c, 2.2, (t, d, tc) => {
          t.damage(40 * s.power, { type: 'crush' });
          t.impulse(_v.subVectors(tc, c).normalize().multiplyScalar(4 + Math.random() * 3));
        });
        fx.implode(c, 70, C.blueHi, 2, 0.22, 0.05);
        fx.burst(c, 50, C.blue, 4, 0.06, 0.6);
        fx.sphereBlast(c, C.blue, 1.2, 0.3);
        fx.shockwave(c, C.blueHi, 2, 0.4, { faceDir: new THREE.Vector3().subVectors(this.ctx.input.head, c).normalize() });
        fx.starFlare(c, 0xffffff, 1.2, 0.35);
        fx.flash(c, C.blue, 8, 0.4);
        sfx.explosion(c, 0.5);
        sfx.play('whoosh', { at: c, vol: 0.6, rate: 0.6 });
        this._disposeBlue(s);
        this.lingering.splice(i, 1);
      }
    }
  }

  _disposeBlue(s) {
    s.loop?.stop();
    s.orb?.dispose();
    if (this.hs.left === s || this.hs.right === s) Object.assign(s, this._handState());
  }

  _disposeRed(s) {
    s.loop?.stop(0.1);
    s.orb?.dispose();
    if (this.hs.left === s || this.hs.right === s) Object.assign(s, this._handState());
  }

  _fireRed(side) {
    const { input: inp, fx, sfx, ui } = this.ctx;
    const h = inp[side];
    const s = this.hs[side];
    const orb = s.orb;
    const charge = s.charge;
    s.loop.stop(0.05);
    Object.assign(s, this._handState());
    if (!this.spend(8 + 14 * charge)) {
      orb.dispose();
      this.denied();
      return;
    }
    const dir = (h.source === 'desktop' ? inp.headDir : h.dir).clone().normalize();
    orb.setRadius(0.05 + 0.05 * charge);
    if (orb.light) orb.light.intensity = 5;
    this.redShots.push({ orb, pos: orb.pos, vel: dir.multiplyScalar(26 + 8 * charge), charge, life: 2.2 });
    ui.manga({ top: '術式反転', main: '「赫」', ruby: 'あか', color: '#ff2030', side });
    if (!sfx.play('red_fire', { at: h.pos, vol: 0.6 + 0.4 * charge, rate: 1.15 - 0.2 * charge })) sfx.zap(h.pos);
    sfx.zap(h.pos);
    h.pulse(0.9, 90);
    fx.burst(h.pos, 30, C.red, 2.5, 0.03, 0.3);
    fx.starFlare(h.pos, 0xffd0c0, 0.4, 0.25);
  }

  _updateRedShots(dt) {
    const { world, fx } = this.ctx;
    for (let i = this.redShots.length - 1; i >= 0; i--) {
      const s = this.redShots[i];
      s.life -= dt;
      s.orb.update(dt, 1);
      const speed = s.vel.length();
      const steps = Math.max(1, Math.ceil((speed * dt) / 0.2));
      let hit = s.life <= 0;
      const targets = world.targets();
      for (let k = 0; k < steps && !hit; k++) {
        s.pos.addScaledVector(s.vel, dt / steps);
        if (s.pos.y < 0.08) hit = true;
        for (const t of targets) {
          if (t.distanceTo(s.pos) < 0.12) {
            hit = true;
            break;
          }
        }
        for (const b of world.bullets) if (b.alive && b.pos.distanceTo(s.pos) < 0.4) world.removeBullet(b);
      }
      const dir = s.vel.clone().normalize();
      world.forEachTarget(s.pos, 1.2, (t, d, c) => {
        _v.subVectors(c, s.pos);
        _v.addScaledVector(dir, -_v.dot(dir));
        if (_v.lengthSq() < 1e-4) return;
        t.impulse(_v.normalize().multiplyScalar(14 * dt));
      });
      fx.spawn(s.pos, _v.randomDirection().multiplyScalar(0.5), C.red, 0.08, 0.3, 2, 0);
      fx.spawn(s.pos, _v.randomDirection().multiplyScalar(1.2), C.redHi, 0.04, 0.25, 2, 0);
      if (hit) {
        this._explodeRed(s.pos.clone(), s.charge, dir);
        s.orb.dispose();
        this.redShots.splice(i, 1);
      }
    }
  }

  _explodeRed(pos, charge, dir) {
    const { world, fx, sfx } = this.ctx;
    const R = 2 + 2.5 * charge;
    world.forEachTarget(pos, R, (t, d, c) => {
      const k = Math.max(0, 1 - d / R);
      const n = new THREE.Vector3().subVectors(c, pos).add(_v2.set(0, 0.5, 0)).normalize();
      t.impulse(n.clone().multiplyScalar(((12 + 16 * charge) * k * 3) / ((t.mass ?? 3) + 1) + 1.5), 10);
      t.damage((40 + 70 * charge) * k, { type: 'blast', dir: n, dirAmt: 4 + 4 * k });
    });
    for (const b of world.bullets) if (b.alive && b.pos.distanceTo(pos) < R) world.removeBullet(b);
    fx.sphereBlast(pos, C.red, 0.8 + 1.4 * charge, 0.3);
    fx.sphereBlast(pos, 0xffffff, 0.4 + 0.5 * charge, 0.15);
    fx.burst(pos, 60 + 60 * charge, C.red, 6 + 5 * charge, 0.07, 0.7, { drag: 2.5 });
    fx.burst(pos, 30, C.redHi, 3, 0.05, 0.4);
    fx.shockwave(_v.copy(pos).setY(0.05), C.red, R, 0.5);
    fx.shockwave(pos, C.redHi, R * 0.7, 0.35, { faceDir: dir });
    for (let i = 0; i < 4; i++) fx.starFlare(_v.copy(pos).add(_v2.randomDirection().multiplyScalar(0.4 * charge)), 0xffe0d0, 0.6 + charge, 0.3);
    fx.flash(pos, C.red, 10, 0.4, 14);
    sfx.explosion(pos, 0.6 + charge);
  }

  // ── 허식 「茈」 ──
  _handsTogether() {
    const inp = this.ctx.input;
    if (inp.mode === 'desktop') return inp.keyDown('KeyE');
    const L = inp.left;
    const R = inp.right;
    if (!L.active || !R.active) return false;
    const ctrl = L.source === 'controller' || R.source === 'controller';
    const thr = ctrl ? 0.2 : 0.15;
    return L.pos.distanceTo(R.pos) < thr || L.palm.distanceTo(R.palm) < thr + 0.03;
  }

  _checkFusion() {
    const inp = this.ctx.input;
    if (inp.mode === 'desktop') return;
    for (const [a, b] of [['left', 'right'], ['right', 'left']]) {
      const sa = this.hs[a];
      const sb = this.hs[b];
      if (sa.mode === 'blue' && sb.mode === 'red' && sb.charge >= 0.3 && this._handsTogether()) {
        const from = { blue: sa.orb.pos.clone(), red: sb.orb.pos.clone() };
        const ctrl = inp.left.source === 'controller' || inp.right.source === 'controller';
        this._beginPurple(a, ctrl ? 'ctrl' : 'two', from);
        return;
      }
    }
  }

  /** 茈가 만들어질 위치: 손에서 앞으로, 얼굴에서 충분히 떨어진 곳 */
  _purpleAnchor(p, out) {
    const inp = this.ctx.input;
    const head = inp.head;
    if (p.mode === 'desk') {
      out.copy(head).addScaledVector(inp.headDir, 1.25);
      out.y -= 0.12;
      p.aim.copy(inp.headDir);
      return out;
    }
    let base;
    if (p.mode === 'one') base = inp[p.side].palm;
    else base = _v2.copy(inp.left.pos).add(inp.right.pos).multiplyScalar(0.5);
    _v3.subVectors(base, head);
    const d = _v3.length();
    _v3.normalize().multiplyScalar(0.55).addScaledVector(inp.headDir, 0.45).normalize();
    p.aim.lerp(_v3, 0.25).normalize();
    out.copy(head).addScaledVector(p.aim, Math.max(1.05, d + 0.6));
    if (out.y < 0.5) out.y = 0.5;
    return out;
  }

  _beginPurple(side, mode, from) {
    const { input: inp, fx, sfx } = this.ctx;
    if (!this.spend(30)) {
      this.denied();
      return;
    }
    for (const sd of ['left', 'right']) {
      const s = this.hs[sd];
      if (s.mode === 'blue') this._disposeBlue(s);
      else if (s.mode === 'red') this._disposeRed(s);
    }
    const h = inp[side];
    const blue = new EnergyOrb(this.ctx, 'blue', 0.04);
    const red = new EnergyOrb(this.ctx, 'red', 0.04);
    blue.light = fx.borrowLight(C.blue, 3, 6);
    red.light = fx.borrowLight(C.red, 3, 6);
    const start = mode === 'desk' ? _v.copy(inp.head).addScaledVector(inp.headDir, 0.5) : _v.copy(mode === 'one' ? h.palm : h.pos);
    blue.pos.copy(from?.blue ?? start);
    red.pos.copy(from?.red ?? start);
    const bolts = new Bolts(this.ctx.scene, { count: 3, segs: 10, color: 0xe0b0ff, width: 0.006 });
    const p = {
      stage: 'merge', mode, side, t: 0, ang: Math.random() * 6.28, blue, red, bolts, orb: null, charge: 0, hold: 0, away: 0,
      aim: new THREE.Vector3().copy(inp.headDir), anchor: new THREE.Vector3(),
      loop: sfx.loop({ sample: 'purple', base: 44, noiseF: 420, vol: 0.45 }),
    };
    this._purpleAnchor(p, p.anchor);
    this.purple = p;
    this.ctx.ui.manga({ top: '術式順転', main: '「蒼」', ruby: 'あお', color: '#2f8cff', side: 'left', dur: 0.9 });
    setTimeout(() => {
      if (this.purple === p && p.stage === 'merge') this.ctx.ui.manga({ top: '術式反転', main: '「赫」', ruby: 'あか', color: '#ff2a3a', side: 'right', dur: 0.9 });
    }, 380);
    sfx.play('charge_rise', { vol: 0.7 });
    inp.left.pulse(0.4, 60);
    inp.right.pulse(0.4, 60);
  }

  _cancelPurple(refund) {
    const p = this.purple;
    if (!p) return;
    const fx = this.ctx.fx;
    const at = p.orb ? p.orb.pos : p.anchor;
    fx.implode(at, 30, C.purpleHi, 0.4, 0.25, 0.03);
    if (refund) this.energy = Math.min(this.maxEnergy, this.energy + 15 * this.costMul);
    p.loop.stop();
    p.blue?.dispose();
    p.red?.dispose();
    p.bolts?.dispose(this.ctx.scene);
    p.orb?.dispose();
    this.purple = null;
    this._purpleLock = true;
  }

  _updatePurple(dt, IL, IR) {
    const p = this.purple;
    if (!p) return;
    const { input: inp, fx, sfx, ui } = this.ctx;
    const L = inp.left;
    const R = inp.right;
    const Is = p.side === 'left' ? IL : IR;
    const H = inp[p.side];
    p.t += dt;
    this._purpleAnchor(p, _v);
    p.anchor.lerp(_v, 1 - Math.exp(-dt * 10));

    // 취소: 수인을 맺은 손(두 손 모드면 양손)으로 주먹, 또는 그 손의 추적이 끊김
    const lost = p.mode === 'one' ? !H.active : p.mode === 'two' ? !L.active || !R.active : false;
    const cancel = lost || (p.mode === 'one' ? Is.fist : p.mode === 'two' ? IL.fist && IR.fist : false);
    if (cancel) {
      this._cancelPurple(true);
      return;
    }

    if (p.stage === 'merge') {
      // 창(파랑)과 혁(빨강)이 서로를 돌며 점점 가까워지다 충돌
      const DUR = 1.8;
      const k = Math.min(1, p.t / DUR);
      const e = k * k * (3 - 2 * k);
      p.ang += dt * (2.5 + 16 * k * k);
      const rad = 0.42 * (1 - e) + 0.012;
      const u = _v2.crossVectors(p.aim, UP);
      if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
      u.normalize();
      const w = _v3.crossVectors(u, p.aim).normalize();
      const c = Math.cos(p.ang);
      const sn = Math.sin(p.ang);
      const follow = 1 - Math.exp(-dt * (k < 0.25 ? 7 : 22));
      const tb = new THREE.Vector3().copy(p.anchor).addScaledVector(u, c * rad).addScaledVector(w, sn * rad);
      const tr = new THREE.Vector3().copy(p.anchor).addScaledVector(u, -c * rad).addScaledVector(w, -sn * rad);
      p.blue.pos.lerp(tb, follow);
      p.red.pos.lerp(tr, follow);
      const r = 0.05 + 0.05 * e;
      p.blue.setRadius(r);
      p.red.setRadius(r);
      p.blue.update(dt, 0.7 + 0.3 * k);
      p.red.update(dt, 0.7 + 0.3 * k);
      if (p.blue.light) p.blue.light.position.copy(p.blue.pos);
      if (p.red.light) p.red.light.position.copy(p.red.pos);
      // 꼬리 입자 + 두 구체를 잇는 보랏빛 전류
      for (let i = 0; i < 3; i++) {
        fx.spawn(p.blue.pos, _v.randomDirection().multiplyScalar(0.12), i ? C.blue : C.blueHi, 0.03, 0.35, 2, 0);
        fx.spawn(p.red.pos, _v.randomDirection().multiplyScalar(0.12), i ? C.red : C.redHi, 0.03, 0.35, 2, 0);
      }
      if (k > 0.35) {
        p.boltT = (p.boltT ?? 0) - dt;
        if (p.boltT <= 0) {
          p.boltT = 0.05;
          const amp = 0.03 + 0.05 * (1 - k);
          const list = [[p.blue.pos, p.red.pos, amp]];
          if (k > 0.6) list.push([p.blue.pos, p.red.pos, amp * 1.5]);
          if (k > 0.8) list.push([p.blue.pos, p.red.pos, amp * 2]);
          p.bolts.regenBetween(list, inp.head);
        }
        if (Math.random() < k * 0.6) fx.implode(p.anchor, 4, C.purpleHi, 0.5, 0.3, 0.025);
      }
      p.loop.set(0.4 + 0.8 * k, 0.8 + 1.4 * k);
      p.loop.pos(p.anchor);
      if (Math.random() < 0.5) {
        L.pulse(0.1 + 0.5 * k, 15);
        R.pulse(0.1 + 0.5 * k, 15);
      }
      if (k >= 1) {
        // 충돌 → 가상의 질량 「茈」
        const at = p.anchor.clone();
        p.blue.dispose();
        p.red.dispose();
        p.bolts.dispose(this.ctx.scene);
        p.blue = p.red = p.bolts = null;
        const orb = new EnergyOrb(this.ctx, 'purple', 0.1);
        orb.light = fx.borrowLight(C.purple, 5, 9);
        orb.pos.copy(at);
        p.orb = orb;
        p.stage = 'hold';
        p.hold = 0;
        p.charge = 0.35;
        ui.manga({ top: '虚式', main: '「茈」', ruby: 'むらさき', color: '#a64dff' });
        fx.flash(at, C.purpleHi, 10, 0.35, 10);
        fx.sphereBlast(at, 0xffffff, 0.35, 0.18);
        fx.burst(at, 70, C.purpleHi, 2.2, 0.03, 0.5);
        fx.burst(at, 30, C.blue, 1.6, 0.03, 0.4);
        fx.burst(at, 30, C.red, 1.6, 0.03, 0.4);
        _v.subVectors(inp.head, at).normalize();
        fx.shockwave(at, C.purpleHi, 0.6, 0.35, { faceDir: _v.clone() });
        fx.starFlare(at, 0xffffff, 0.9, 0.3);
        sfx.explosion(at, 0.6);
        L.pulse(1, 120);
        R.pulse(1, 120);
      }
      return;
    }

    // ── 완성된 茈를 앞에 띄워 두고 발사를 기다린다 ──
    p.hold += dt;
    p.orb.pos.lerp(p.anchor, 1 - Math.exp(-dt * 12));
    p.charge = Math.min(1, p.charge + dt / 0.9);
    p.orb.setRadius(0.1 + 0.12 * p.charge);
    p.orb.update(dt, 0.6 + 0.4 * p.charge);
    p.loop.set(0.6 + 0.6 * p.charge, 1 + p.charge);
    p.loop.pos(p.orb.pos);
    if (Math.random() < 0.4) {
      L.pulse(0.2 + 0.4 * p.charge, 20);
      R.pulse(0.2 + 0.4 * p.charge, 20);
    }
    let fire = false;
    if (p.mode === 'one') {
      // 손을 펴거나, 앞으로 밀거나, 수인을 풀면 발사
      const push = H.vel.dot(p.aim) > 1.3;
      if (Is.gesture !== 'purple' && Is.gesture !== 'fist') p.away += dt;
      else p.away = 0;
      fire = push || Is.open || p.away > 0.15;
    } else if (p.mode === 'desk') {
      fire = !inp.keyDown('KeyE') || inp.keyDown('KeyF');
    } else if (p.mode === 'two') {
      const pushL = L.vel.dot(p.aim);
      const pushR = R.vel.dot(p.aim);
      fire = (pushL + pushR) * 0.5 > 1.1 || Math.max(pushL, pushR) > 2.0 || (IL.open && IR.open) || L.pos.distanceTo(R.pos) > 0.55;
    } else {
      const pushL = L.vel.dot(p.aim);
      const pushR = R.vel.dot(p.aim);
      fire = (pushL + pushR) * 0.5 > 1.1 || Math.max(pushL, pushR) > 2.0 || !(IL.blue || IL.red || IR.blue || IR.red);
    }
    if (p.hold > 6) fire = true;
    if (fire && p.hold > 0.12) this._launchPurple();
  }

  _launchPurple() {
    const p = this.purple;
    this.purple = null;
    this._purpleLock = true;
    const { input: inp, fx, sfx } = this.ctx;
    p.loop.stop(1.5);
    const dir = p.mode === 'desk' ? inp.headDir.clone() : new THREE.Vector3().subVectors(p.orb.pos, inp.head).normalize().lerp(p.aim, 0.3).normalize();
    const shot = { orb: p.orb, pos: p.orb.pos, vel: dir.clone().multiplyScalar(17), dir: dir.clone(), r: p.orb.radius, rTarget: 0.7 + 0.6 * p.charge, life: 4.2, charge: p.charge, trenchAcc: 0, ringT: 0 };
    if (shot.orb.light) {
      shot.orb.light.intensity = 10;
      shot.orb.light.distance = 20;
    }
    this.purpleShots.push(shot);
    this._needRelease.left = this._needRelease.right = true;
    if (!sfx.play('purple_launch', { at: shot.pos, vol: 1.3 })) sfx.explosion(shot.pos, 2.2);
    fx.flash(shot.pos, C.purpleHi, 12, 0.5, 20);
    fx.burst(shot.pos, 80, C.purpleHi, 4, 0.04, 0.5);
    fx.shockwave(shot.pos, C.purpleHi, 1.2, 0.45, { faceDir: dir });
    for (let i = 0; i < 4; i++) fx.starFlare(_v.copy(shot.pos).add(_v2.randomDirection().multiplyScalar(0.25)), 0xffffff, 0.6, 0.3);
    inp.left.pulse(1, 250);
    inp.right.pulse(1, 250);
  }

  _updatePurpleShots(dt) {
    const { world, fx } = this.ctx;
    for (let i = this.purpleShots.length - 1; i >= 0; i--) {
      const s = this.purpleShots[i];
      s.life -= dt;
      const fade = s.life < 0.6 ? Math.max(0, s.life / 0.6) : 1;
      // 플레이어 가까이에서는 작게, 멀어질수록 커진다 (눈앞을 가리지 않도록)
      const rCap = Math.max(0.22, (s.pos.distanceTo(this.ctx.input.head) - 0.6) * 0.45);
      s.r = Math.min(rCap, THREE.MathUtils.lerp(s.r, s.rTarget, 1 - Math.exp(-dt * 3.5)));
      const r = s.r * Math.max(0.05, fade);
      s.orb.setRadius(r);
      s.orb.update(dt, 1);
      const step = s.vel.length() * dt;
      const steps = Math.max(1, Math.ceil(step / 0.4));
      for (let k = 0; k < steps; k++) {
        s.pos.addScaledVector(s.vel, dt / steps);
        world.forEachTarget(s.pos, r, (t) => t.damage(99999, { type: 'erase' }));
        for (const b of world.bullets) if (b.alive && b.pos.distanceTo(s.pos) < r + 0.2) world.removeBullet(b, false);
        for (const pc of [...world.slicer.pieces]) {
          if (pc.pivot.position.distanceTo(s.pos) < r + 0.3) {
            fx.burst(pc.pivot.position, 10, C.purpleHi, 1.5, 0.04, 0.4);
            world.slicer.remove(pc);
          }
        }
        if (s.pos.y - r < 0.05 && r > 0.35) {
          s.trenchAcc += step / steps;
          if (s.trenchAcc > 0.45) {
            s.trenchAcc = 0;
            const halfW = Math.sqrt(Math.max(0, r * r - s.pos.y * s.pos.y));
            if (halfW > 0.15) this._addTrench(s.pos, s.dir, halfW * 2);
          }
        }
      }
      s.ringT -= dt;
      if (s.ringT <= 0 && fade > 0.5) {
        s.ringT = 0.12;
        fx.shockwave(s.pos, C.purple, r * 1.8, 0.4, { faceDir: s.dir, opacity: 0.6 });
      }
      for (let k = 0; k < 6; k++) {
        _v.randomDirection();
        _v2.copy(s.pos).addScaledVector(_v, r);
        _v.multiplyScalar(1.2).addScaledVector(s.dir, -3);
        fx.spawn(_v2, _v, k % 3 === 0 ? C.blue : k % 3 === 1 ? C.red : C.purpleHi, 0.08 * Math.max(0.3, r), 0.5, 1.5, 0);
      }
      if (s.life <= 0) {
        fx.sphereBlast(s.pos, C.purpleHi, 2, 0.3);
        s.orb.dispose();
        this.purpleShots.splice(i, 1);
      }
    }
  }

  _addTrench(pos, dir, width) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a3cff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(this.trenchGeo, mat);
    m.position.set(pos.x, 0.02, pos.z);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    m.scale.set(width, 1, 0.55);
    this.ctx.scene.add(m);
    this.trenches.push({ mesh: m, t: 0 });
    this.ctx.fx.burst(_v.set(pos.x, 0.1, pos.z), 5, new THREE.Color(0x777788), 2.5, 0.05, 1.0, { up: 1, grav: 6 });
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

  // ── 영역전개 「無量空処」 ──
  _updateDomain(dt, sign) {
    const { input: inp, fx, world } = this.ctx;
    const d = this.domain;
    d.cd = Math.max(0, d.cd - dt);
    const V = this.void;
    const ring = this.signRing;
    const canCast = V.state === 'idle' ? d.cd <= 0 && !this.hs.left.mode && !this.hs.right.mode && !this.purple : V.state === 'active' && d.t > 2;
    // 수인을 6초 유지 → 1초째부터 영창 음성(약 5초)이 나오고, 끝날 즈음 전개. 해제는 1.5초
    const casting = V.state === 'idle';
    const need = casting ? 6 : 1.5;
    if (d.auto && !(casting && canCast)) d.auto = false;
    const held = (sign || d.auto) && canCast;
    if (held) {
      d.lost = 0;
      d.sign += dt;
      if (Math.random() < 0.5) {
        inp.left.pulse(0.1 + (d.sign / need) * 0.6, 20);
        inp.right.pulse(0.1 + (d.sign / need) * 0.6, 20);
      }
      if (casting && d.sign >= 1 && !d.voice) d.voice = this.ctx.sfx.playClip('gojoDomain', { vol: 1.1 });
      if (d.sign >= need) {
        d.sign = 0;
        d.auto = false;
        d.voice = null;
        if (V.state === 'active') this._endDomain();
        else this._castDomain();
      }
    } else if ((d.lost = (d.lost ?? 0) + dt) > 0.3 || !canCast) {
      // 추적이 잠깐 흔들리는 정도(0.3초)는 봐준다
      d.sign = 0;
      if (d.voice) {
        d.voice.stop(0.25);
        d.voice = null;
      }
    }
    // 진행 표시: 수인을 맺은 손 앞에 작은 고리가 차오른다
    const k = Math.min(1, d.sign / need);
    ring.material.opacity = k * 0.9;
    ring.visible = d.sign > 0.01;
    const sh = this._signSide ? inp[this._signSide] : null;
    if (sh && sh.active) ring.position.copy(sh.pos);
    else ring.position.copy(inp.head).addScaledVector(inp.headDir, 0.35);
    ring.quaternion.copy(inp.headQuat);
    ring.scale.setScalar(0.03 + k * 0.05);
    if (ring.visible && Math.random() < 0.5) fx.implode(ring.position, 2, C.blueHi, 0.12, 0.25, 0.01);

    if (V.frozenPhase && !world.domain) world.domain = { center: V.center.clone(), radius: 45, freeze: true };
    if (V.state === 'active') {
      d.t += dt;
      if (d.t >= d.duration) this._endDomain();
    }
  }

  /** 메뉴에서 직접 발동 */
  castDomain() {
    // 메뉴에서 발동: 영창 음성을 먼저 들려주고 전개
    if (this.void.state === 'idle' && this.domain.cd <= 0) {
      this.domain.auto = true;
      this.domain.sign = Math.max(this.domain.sign, 1);
    } else this.ctx.ui.callout('영역전개 재사용 대기 중');
  }

  _castDomain() {
    const { input: inp, ui, sfx, fx } = this.ctx;
    if (!this.spend(40)) {
      this.denied();
      return;
    }
    this.domain.t = 0;
    const center = new THREE.Vector3(inp.head.x, 0, inp.head.z);
    this.void.start(center, inp.headDir);
    ui.manga({ top: '領域展開', main: '無量空処', ruby: 'むりょうくうしょ', color: '#6fb8ff', big: true });
    sfx.domain();
    inp.left.pulse(1, 300);
    inp.right.pulse(1, 300);
  }

  _endDomain() {
    const d = this.domain;
    d.cd = 10;
    d.t = 0;
    this.void.stop();
    this.ctx.world.domain = null;
    this.ctx.sfx.play('charge_rise', { vol: 0.5, rate: 0.6 });
  }

  /** 배경 전환 등으로 영역을 즉시 해제 */
  cancelDomain() {
    const d = this.domain;
    d.voice?.stop(0.2);
    d.voice = null;
    d.auto = false;
    d.sign = 0;
    if (this.void.state !== 'idle') {
      this.void._exitVoid();
      this.void.state = 'idle';
    }
    this.ctx.world.domain = null;
    this.domain.t = 0;
  }

  dispose() {
    window.removeEventListener('wheel', this._onWheel);
    this.domain.voice?.stop(0.2);
    for (const side of ['left', 'right']) {
      const s = this.hs[side];
      if (s.mode === 'blue') this._disposeBlue(s);
      if (s.mode === 'red') this._disposeRed(s);
    }
    for (const L of this.lingering) this._disposeBlue(L.s);
    for (const r of this.redShots) r.orb.dispose();
    if (this.purple) this._cancelPurple(false);
    for (const p of this.purpleShots) p.orb.dispose();
    for (const t of this.trenches) this.ctx.scene.remove(t.mesh);
    if (this.void.state !== 'idle') {
      this.void._exitVoid();
      this.void.state = 'idle';
    }
    this.ctx.scene.remove(this.void.group, this.signRing);
    this.ctx.camera.remove(this.void.white);
    this.ctx.world.domain = null;
    this.ctx.world.shield = null;
    this.ctx.world.meleeShield = null;
    this.ctx.world.pieceForce = null;
  }
}
