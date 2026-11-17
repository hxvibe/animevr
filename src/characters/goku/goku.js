// 손오공 — 기(気)
//  · 気弾(기탄): 편 손바닥을 앞으로 내밀어 기를 쏜다 (양손 번갈아 연사)
//  · かめはめ波(에네르기파): 허리 옆에서 두 손을 모아 기를 모았다가 앞으로 내지른다. 손을 움직이면 빔도 따라 휜다
//  · 元気玉(원기옥): 두 손을 하늘로 들어 주위의 기를 모은다 → 내던진다
//  · 瞬間移動(순간이동): 검지·중지를 이마에 대고 → 바라본 상대의 등 뒤로
//  · 超サイヤ人(초사이어인): 금빛 오라. 기 회복과 모든 기술의 위력이 오른다
import * as THREE from 'three';
import { EnergyOrb } from '../gojo/vfx.js';
import { KiBeam, KiShot, Blink } from './vfx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const C = {
  ki: new THREE.Color(0x3aa8ff),
  kiHi: new THREE.Color(0xcff0ff),
  white: new THREE.Color(0xffffff),
  gold: new THREE.Color(0xffd23a),
  goldHi: new THREE.Color(0xfff3a8),
  yellow: new THREE.Color(0xffe07a),
  spirit: new THREE.Color(0x8fd8ff),
  dust: new THREE.Color(0x8a8578),
};
const KAME = [[0.05, 'か'], [0.45, 'め'], [0.9, 'は'], [1.35, 'め']];

export class Goku {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'goku';
    this.name = '손오공';
    this.domainLabel = '초사이어인';
    this.reviveText = '쓰러졌다… 선두를 먹고 회복';
    this.energy = 100;
    this.maxEnergy = 100;
    this.blastCd = { left: 0, right: 0 };
    this.shots = [];
    this.kame = null;
    this.beams = []; // 사라지는 중인 빔
    this.genki = null;
    this.bombs = [];
    this.tele = { hold: 0, cd: 0 };
    this.ssjT = 0;
    this.domain = { sign: 0, cd: 0, duration: 30, auto: false, lost: 0 };
    this.blink = new Blink(ctx.camera);
    this._kp = { kame: 0, genki: 0 };
    this._deskBlastT = 0;
    this._mid = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this.signRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    ctx.scene.add(this.signRing);
  }

  get ssj() {
    return this.ssjT > 0;
  }

  get power() {
    return this.ssj ? 1.5 : 1;
  }

  spend(x) {
    if (this.energy < x) {
      this.denied();
      return false;
    }
    this.energy -= x;
    return true;
  }

  denied(msg = '기 부족') {
    if (this._deniedT && this._deniedT > performance.now()) return;
    this._deniedT = performance.now() + 1500;
    this.ctx.sfx.denied();
    this.ctx.ui.callout(msg, { color: '#ffd08a' });
  }

  // ── 메뉴/HUD ──
  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '気弾(기탄)', color: '#ffe07a', text: '손을 펴고 손바닥을 앞으로 빠르게 내밀기 → 기탄 (양손 번갈아 연사)' },
        { head: 'かめはめ波(에네르기파)', color: '#7fc8ff', text: '두 손을 모아 허리 옆으로 → 기를 모으는 동안 か·め·は·め\n모은 손을 앞으로 내지르면 발사 · 손을 모은 채 움직이면 빔이 따라감 · 손을 떼면 끝' },
        { head: '元気玉(원기옥)', color: '#bfeaff', text: '두 손을 머리 위로 높이 들고 기다리기 → 머리 위에서 점점 커짐\n앞으로 크게 내던지기 · 양손 주먹은 취소' },
        { head: '瞬間移動(순간이동)', color: '#ffffff', text: '검지·중지를 펴서 이마에 대고 0.5초 → 바라본 더미의 등 뒤로 (없으면 앞으로 6m)' },
        { head: '超サイヤ人(초사이어인)', color: '#ffd23a', text: '양 주먹을 쥐고 허리 옆에서 힘주며 1.5초 → 30초 동안 강화\n켜진 상태에서 같은 자세 1.5초 → 해제 · 설정에서 손동작 끄기 / 메뉴에서 발동' },
        { head: '잡기 · 주먹', color: '#ffffff', text: '더미에 손을 대고 주먹 → 잡기, 펴면 던지기 · 주먹으로 빠르게 치기' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴 · R 더미 소환' },
        { head: '気弾 / かめはめ波', color: '#7fc8ff', text: '좌클릭: 기탄 (누르고 있으면 연사) · K 유지: 기 모으기 → 놓으면 에네르기파' },
        { head: '元気玉 / 瞬間移動', color: '#bfeaff', text: 'G 유지: 원기옥 모으기 → 놓으면 던짐 · E: 순간이동' },
        { head: '超サイヤ人', color: '#ffd23a', text: 'Q 1.5초: 초사이어인 · V 주먹' },
      ];
    }
    return [
      { head: '気弾(기탄)', color: '#ffe07a', text: '트리거: 그 컨트롤러 방향으로 기탄' },
      { head: 'かめはめ波(에네르기파)', color: '#7fc8ff', text: '양쪽 그립을 쥐고 두 컨트롤러를 맞대어 모으기 → 앞으로 내지르기 · 그립을 놓으면 끝' },
      { head: '元気玉(원기옥)', color: '#bfeaff', text: '두 컨트롤러를 머리 위로 들고 양쪽 트리거 유지 → 휘둘러 던지기' },
      { head: '瞬間移動 · 超サイヤ人', color: '#ffd23a', text: 'X: 순간이동 · 양쪽 스틱을 눌러 1.5초: 초사이어인 (메뉴에서도 발동)' },
      { head: '버튼', color: '#ffffff', text: '그립: 더미 잡기/던지기 · 그립 쥐고 휘둘러 치기 · B 더미 소환 · Y 메뉴' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const d = this.domain;
    let st = '준비';
    if (this.ssj) st = `변신 중 ${Math.ceil(this.ssjT)}s`;
    else if (d.cd > 0) st = `재사용 ${Math.ceil(d.cd)}s`;
    return [
      { label: '기', bar: this.energy / this.maxEnergy, color: this.ssj ? '#ffd23a' : '#7fc8ff' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff6f7f' },
      { label: '초사이어인', text: st, textColor: this.ssj ? '#ffe070' : '#dfe6ff' },
      { label: '처치', text: `${w.kills}` },
    ];
  }

  handBusy() {
    return !!this.kame || !!this.genki;
  }

  // ── 메인 ──
  update(dt) {
    const inp = this.ctx.input;
    const blocked = this.ctx.ui.menuOpen;
    const busy = this.kame || this.genki;
    if (!busy) this.energy = Math.min(this.maxEnergy, this.energy + (this.ssj ? 18 : 9) * dt);
    this.blastCd.left -= dt;
    this.blastCd.right -= dt;
    this.tele.cd -= dt;
    if (!blocked) {
      this._updateSsjSign(dt);
      this._updateKame(dt);
      this._updateGenki(dt);
      this._updateTeleport(dt);
      this._updateBlasts(dt);
    }
    this._updateShots(dt);
    this._updateBeams(dt);
    this._updateBombs(dt);
    this._updateSsj(dt);
    this.blink.update(dt);
  }

  _two() {
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    return L.active && R.active && !L.uiBlock && !R.uiBlock;
  }

  // ── 기탄 ──
  _updateBlasts(dt) {
    const inp = this.ctx.input;
    if (this.kame || this.genki) return;
    if (inp.mode === 'desktop') {
      this._deskBlastT -= dt;
      if (inp.mouse.left && this._deskBlastT <= 0) {
        this._deskBlastT = 0.16;
        const h = inp.right;
        const dir = inp.headDir.clone();
        this._fireShot(_v.copy(h.palm).addScaledVector(dir, 0.2), dir, h);
      }
      return;
    }
    for (const h of inp.hands) {
      if (!h.active || h.uiBlock || this.blastCd[h.side] > 0 || this.ctx.grab?.isHolding(h.side)) continue;
      const o = h.side === 'left' ? inp.right : inp.left;
      if (o.active && o.palm.distanceTo(h.palm) < 0.25) continue; // 두 손을 모은 상태는 에네르기파
      if (h.source === 'controller') {
        if (h.pressed('trigger') && !h.btn.grip) {
          this.blastCd[h.side] = 0.15;
          this._fireShot(_v.copy(h.pos).addScaledVector(h.dir, 0.05), h.dir.clone(), h);
        }
        continue;
      }
      if (h.source !== 'hand' || (h.gesture !== 'open' && h.gesture !== 'none')) continue;
      _v.subVectors(h.palm, inp.head);
      if (_v.length() < 0.25) continue;
      _v.normalize();
      const facing = h.palmNormal.dot(_v) > 0.45;
      const push = h.vel.dot(h.palmNormal);
      if (facing && push > 1.7 && h.speed > 1.7 && h.palm.y > inp.head.y - 0.75) {
        this.blastCd[h.side] = 0.2;
        const dir = h.palmNormal.clone().lerp(inp.headDir, 0.3).normalize();
        this._fireShot(_v2.copy(h.palm).addScaledVector(h.palmNormal, 0.08), dir, h);
      }
    }
  }

  _fireShot(from, dir, h) {
    const { sfx, fx } = this.ctx;
    if (!this.spend(3)) return;
    const col = this.ssj ? 0xffd23a : 0xffe07a;
    const shot = new KiShot(this.ctx, col, this.ssj ? 0.075 : 0.06);
    shot.pos.copy(from);
    this.shots.push({ shot, pos: shot.pos, vel: dir.clone().multiplyScalar(24), life: 2, gold: this.ssj });
    if (!sfx.play('ki_blast', { at: from, vol: 0.7 })) sfx.zap(from);
    fx.burst(from, 10, this.ssj ? C.gold : C.yellow, 1.5, 0.025, 0.2);
    h?.pulse?.(0.5, 40);
  }

  _updateShots(dt) {
    const { world, fx, sfx } = this.ctx;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const S = this.shots[i];
      S.life -= dt;
      S.shot.update();
      let hit = S.life <= 0;
      const steps = Math.max(1, Math.ceil((S.vel.length() * dt) / 0.2));
      for (let k = 0; k < steps && !hit; k++) {
        S.pos.addScaledVector(S.vel, dt / steps);
        if (S.pos.y < 0.05 || world.nearestTarget(S.pos, 0.08)) hit = true;
        const B = this.ctx.env.bounds;
        if (B && (S.pos.x < B.minX || S.pos.x > B.maxX || S.pos.z < B.minZ || S.pos.z > B.maxZ)) hit = true;
      }
      if (Math.random() < 0.7) fx.spawn(S.pos, _v.randomDirection().multiplyScalar(0.3), S.gold ? C.gold : C.yellow, 0.025, 0.2, 2, 0);
      if (!hit) continue;
      const mul = S.gold ? 1.5 : 1;
      const dir = S.vel.clone().normalize();
      world.forEachTarget(S.pos, 1.0, (t, d, c) => {
        const k = Math.max(0.2, 1 - d / 1.0);
        const n = _v.subVectors(c, S.pos).add(_v2.set(0, 0.3, 0)).normalize();
        t.damage(16 * mul * k, { type: 'blast', dir: n, dirAmt: 3 });
        t.impulse(n.multiplyScalar((3 + 2 * mul) * k).addScaledVector(dir, 1.5), 4);
      });
      fx.sphereBlast(S.pos, S.gold ? C.gold : C.yellow, 0.6 * mul, 0.25);
      fx.burst(S.pos, 24, S.gold ? C.goldHi : C.yellow, 3, 0.035, 0.35);
      fx.shockwave(S.pos, C.white, 0.7, 0.25, { faceDir: dir });
      fx.flash(S.pos, S.gold ? C.gold : C.yellow, 5, 0.25, 6);
      sfx.explosion(S.pos, 0.4);
      S.shot.dispose();
      this.shots.splice(i, 1);
    }
  }

  // ── 에네르기파 ──
  _kameInput() {
    // 반환: { charge: 모으는 자세, together: 두 손이 붙어 있음, fire: 내지름, mid, aim, lost }
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    const out = { charge: false, together: false, fire: false, mid: this._mid, aim: this._aim, lost: false, cancel: false };
    out.aim.set(0, 0, -1);
    if (inp.mode === 'desktop') {
      out.charge = out.together = inp.keyDown('KeyK');
      out.mid.copy(inp.head).addScaledVector(inp.headDir, 0.4).add(_v.set(0.15, -0.35, 0).applyQuaternion(inp.headQuat));
      out.aim.copy(inp.headDir);
      out.fire = !inp.keyDown('KeyK');
      return out;
    }
    if (!L.active || !R.active) {
      out.lost = true;
      return out;
    }
    if (L.uiBlock || R.uiBlock || this.ctx.grab?.isHolding('left') || this.ctx.grab?.isHolding('right')) return out;
    out.mid.addVectors(L.palm, R.palm).multiplyScalar(0.5);
    const d = L.palm.distanceTo(R.palm);
    _v.subVectors(out.mid, inp.head);
    const ext = _v.dot(inp.headDir);
    if (L.source === 'controller' && R.source === 'controller') {
      out.together = L.btn.grip && R.btn.grip && L.pos.distanceTo(R.pos) < 0.3;
      out.charge = out.together && L.pos.distanceTo(R.pos) < 0.22;
      out.fire = out.together && (ext > 0.4 || (L.btn.trigger && R.btn.trigger));
      out.aim.copy(L.dir).add(R.dir).normalize();
      return out;
    }
    if (L.source !== 'hand' || R.source !== 'hand') return out;
    const notFist = L.gesture !== 'fist' && R.gesture !== 'fist';
    out.cancel = L.gesture === 'fist' && R.gesture === 'fist';
    out.together = d < 0.3 && notFist;
    // 모으기: 두 손바닥을 가까이(마주 보게) 붙여 허리 높이로
    out.charge = d < 0.17 && notFist && out.mid.y < inp.head.y - 0.25 && L.speed < 1.6 && R.speed < 1.6;
    // 내지르기: 모은 손이 얼굴 앞쪽으로 충분히 뻗어 나감
    out.fire = out.together && ext > 0.38 && out.mid.y > inp.head.y - 0.7;
    // 조준: 손바닥이 향한 쪽 위주 + 시선 (손목을 돌리면 빔이 휜다)
    _v2.copy(L.palmNormal).add(R.palmNormal);
    if (_v2.lengthSq() < 0.2) _v2.copy(inp.headDir);
    out.aim.copy(_v2.normalize()).multiplyScalar(0.65).addScaledVector(inp.headDir, 0.35).normalize();
    return out;
  }

  _updateKame(dt) {
    const { input: inp, fx, sfx, ui } = this.ctx;
    const I = this._kameInput();
    let K = this.kame;
    if (!K) {
      if (this.genki) return;
      this._kp.kame = I.charge ? this._kp.kame + dt : 0;
      if (this._kp.kame > (inp.mode === 'desktop' ? 0 : 0.25)) {
        this._kp.kame = 0;
        if (this.energy < 15) {
          this.denied();
          return;
        }
        const orb = new EnergyOrb(this.ctx, 'ki', 0.02);
        orb.light = fx.borrowLight(C.ki, 2, 5);
        orb.pos.copy(I.mid);
        K = this.kame = { stage: 'charge', charge: 0, t: 0, orb, chant: 0, apart: 0, loop: sfx.loop({ sample: 'ki', base: 68, noiseF: 700, vol: 0.4 }), aim: I.aim.clone(), beam: null, len: 0, fireT: 0, maxT: 0, tick: 0 };
      }
      return;
    }
    K.t += dt;
    // 추적이 끊기면 즉시 끝 (다시 잡혀도 이어지지 않는다)
    if (I.lost || I.cancel) {
      this._endKame(K.stage === 'charge');
      return;
    }
    if (K.stage === 'charge') {
      if (!I.together) {
        K.apart += dt;
        if (K.apart > 0.3) {
          this._endKame(true);
          return;
        }
      } else K.apart = 0;
      K.charge = Math.min(2.5, K.charge + dt);
      this.energy = Math.max(0, this.energy - 6 * dt);
      // 손바닥 사이에서 커지는 기
      const r = 0.025 + 0.05 * Math.min(1, K.charge / 1.6) + (this.ssj ? 0.015 : 0);
      K.orb.setRadius(r);
      K.orb.pos.lerp(I.mid, 1 - Math.exp(-dt * 25));
      K.orb.update(dt, 0.5 + 0.2 * K.charge);
      K.loop.set(0.4 + 0.3 * K.charge, 0.8 + 0.25 * K.charge);
      K.loop.pos(K.orb.pos);
      if (Math.random() < 0.8) fx.implode(K.orb.pos, 2, C.kiHi, 0.25 + 0.1 * K.charge, 0.25, 0.012);
      if (K.chant < KAME.length && K.charge >= KAME[K.chant][0]) {
        ui.manga({ main: KAME[K.chant][1], color: '#3aa8ff', dur: 0.7, side: K.chant % 2 ? 'right' : 'left' });
        sfx.play('chant', { vol: 0.5, rate: 1.1 + K.chant * 0.1 });
        K.chant++;
      }
      if (Math.random() < 0.6) {
        inp.left.pulse(0.1 + 0.15 * K.charge, 15);
        inp.right.pulse(0.1 + 0.15 * K.charge, 15);
      }
      if (I.fire && K.charge >= 0.6) this._fireKame(I);
      else if (inp.mode === 'desktop' && I.fire) this._endKame(true);
      return;
    }
    // ── 발사 중 ──
    K.fireT += dt;
    const ending = !I.together || K.fireT >= K.maxT || (inp.mode === 'desktop' && K.fireT >= K.maxT);
    if (ending && inp.mode !== 'desktop') {
      this._endKame(false);
      return;
    }
    if (inp.mode === 'desktop' && K.fireT >= K.maxT) {
      this._endKame(false);
      return;
    }
    this.energy = Math.max(0, this.energy - 10 * dt);
    K.aim.lerp(I.aim, 1 - Math.exp(-dt * 8)).normalize();
    const origin = this._origin.copy(I.mid).addScaledVector(K.aim, 0.08);
    this._driveBeam(K, origin, K.aim, dt);
    K.loop.pos(origin);
    if (Math.random() < 0.7) {
      inp.left.pulse(0.5, 20);
      inp.right.pulse(0.5, 20);
    }
  }

  _fireKame(I) {
    const { fx, sfx, ui, input: inp } = this.ctx;
    const K = this.kame;
    K.stage = 'fire';
    K.fireT = 0;
    K.maxT = 1.4 + 1.2 * Math.min(1, K.charge / 2);
    K.len = 0.2;
    K.aim.copy(I.aim);
    K.r = (0.12 + 0.16 * Math.min(1, K.charge / 2)) * (this.ssj ? 1.35 : 1);
    K.beam = new KiBeam(this.ctx);
    K.orb.dispose();
    K.orb = null;
    K.loop.stop(0.1);
    K.loop = sfx.loop({ sample: 'beam', base: 50, noiseF: 900, vol: 0.6 });
    ui.manga({ main: 'かめはめ波', ruby: 'かめはめは', color: '#2a90ff', sub: '에네르기파' });
    if (!sfx.play('purple_launch', { at: I.mid, vol: 0.8, rate: 1.2 })) sfx.explosion(I.mid, 1.2);
    fx.flash(I.mid, C.ki, 12, 0.5, 15);
    fx.burst(I.mid, 50, C.kiHi, 3, 0.03, 0.4);
    inp.left.pulse(1, 200);
    inp.right.pulse(1, 200);
  }

  /** 빔을 앞으로 뻗고, 처음 닿는 대상(또는 바닥·벽)에서 멈춘다. 닿은 대상은 밀려나며 계속 타격 */
  _driveBeam(K, origin, dir, dt) {
    const { world, fx, sfx } = this.ctx;
    const r = K.r * (K.fireT < 0.15 ? 0.5 + K.fireT / 0.3 : 1);
    // 끝: 바닥 또는 배경 경계
    let maxLen = 80;
    if (dir.y < -0.01) maxLen = Math.min(maxLen, origin.y / -dir.y);
    const B = this.ctx.env.bounds;
    if (B) {
      for (const [p, v, lo, hi] of [[origin.x, dir.x, B.minX, B.maxX], [origin.z, dir.z, B.minZ, B.maxZ]]) {
        if (v > 1e-3) maxLen = Math.min(maxLen, (hi - p) / v);
        else if (v < -1e-3) maxLen = Math.min(maxLen, (lo - p) / v);
      }
    }
    let first = null;
    let firstAlong = maxLen;
    for (const t of world.targets()) {
      const c = t.center(_v2);
      const rel = c.sub(origin);
      const along = rel.dot(dir);
      if (along < 0 || along > firstAlong) continue;
      const perp = rel.addScaledVector(dir, -along).length();
      const tr = t.kind === 'dummy' ? 0.3 * t.scale : t.radius;
      if (perp < r + tr) {
        first = t;
        firstAlong = Math.max(0.1, along - tr * 0.6);
      }
    }
    K.len = Math.min(firstAlong, K.len + 70 * dt);
    K.beam.set(origin, dir, K.len, r, 1, dt);
    const end = _v2.copy(origin).addScaledVector(dir, K.len);
    const reached = K.len >= firstAlong - 0.05;
    if (reached) {
      if (Math.random() < 0.7) fx.burst(end, 8, Math.random() < 0.5 ? C.kiHi : C.white, 4, 0.05, 0.3, { dir: dir.clone().negate(), dirAmt: 0.5 });
      K.tick -= dt;
      if (K.tick <= 0) {
        K.tick = 0.09;
        fx.shockwave(end, C.kiHi, r * 4, 0.25, { faceDir: dir.clone() });
        if (Math.random() < 0.35) sfx.explosion(end, 0.5);
        const mul = this.power * (0.7 + 0.3 * Math.min(1, K.charge / 2));
        world.forEachTarget(end, r + 0.9, (t, d, c) => {
          t.damage(22 * mul, { type: 'blast', dir: dir.clone(), dirAmt: 6, silent: true });
          if (t.alive) t.impulse(_v.copy(dir).multiplyScalar(4.5 / Math.sqrt(t.mass ?? 3)).add(_v3.set(0, 0.6, 0)), 2);
        });
        if (!first && end.y < 0.3) fx.shockwave(_v.copy(end).setY(0.05), C.kiHi, 2.5, 0.4);
      }
    }
  }

  _endKame(refund) {
    const K = this.kame;
    if (!K) return;
    this.kame = null;
    K.loop?.stop(0.3);
    if (K.orb) {
      this.ctx.fx.implode(K.orb.pos, 16, C.kiHi, 0.2, 0.2, 0.015);
      K.orb.dispose();
      if (refund) this.energy = Math.min(this.maxEnergy, this.energy + K.charge * 3);
    }
    if (K.beam) this.beams.push({ beam: K.beam, origin: K.beam.origin.clone(), dir: K.beam.dir.clone(), len: K.beam.len, r: K.beam.r, t: 0 });
  }

  _updateBeams(dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const B = this.beams[i];
      B.t += dt;
      const k = B.t / 0.35;
      // 꼬리가 앞으로 빠져나가며 가늘어진다
      const cut = Math.min(B.len, B.t * 60);
      B.beam.set(_v.copy(B.origin).addScaledVector(B.dir, cut), B.dir, Math.max(0.01, B.len - cut), B.r * Math.max(0.05, 1 - k), 1 - k, dt);
      if (k >= 1) {
        B.beam.dispose();
        this.beams.splice(i, 1);
      }
    }
  }

  // ── 원기옥 ──
  _genkiInput() {
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    const out = { up: false, throwIt: false, lost: false, cancel: false };
    if (inp.mode === 'desktop') {
      out.up = inp.keyDown('KeyG');
      out.throwIt = !out.up;
      return out;
    }
    if (!L.active || !R.active) {
      out.lost = true;
      return out;
    }
    const fwd = _v.copy(inp.headDir).setY(0).normalize();
    const avgV = _v2.addVectors(L.vel, R.vel).multiplyScalar(0.5);
    if (L.source === 'controller' && R.source === 'controller') {
      out.up = L.btn.trigger && R.btn.trigger && L.pos.y > inp.head.y + 0.05 && R.pos.y > inp.head.y + 0.05;
      out.throwIt = avgV.dot(fwd) > 1.4 || (!L.btn.trigger && !R.btn.trigger);
      return out;
    }
    if (L.source !== 'hand' || R.source !== 'hand') return out;
    out.cancel = L.gesture === 'fist' && R.gesture === 'fist';
    const raised = L.palm.y > inp.head.y + 0.1 && R.palm.y > inp.head.y + 0.1;
    const notFist = L.gesture !== 'fist' && R.gesture !== 'fist';
    out.up = raised && notFist && L.speed < 1.5 && R.speed < 1.5;
    // 앞으로(또는 앞쪽 아래로) 크게 내던지기
    out.throwIt = avgV.dot(fwd) > 1.4 || (avgV.y < -1.6 && avgV.dot(fwd) > 0.4);
    return out;
  }

  _updateGenki(dt) {
    const { input: inp, fx, sfx, ui } = this.ctx;
    const I = this._genkiInput();
    let G = this.genki;
    if (!G) {
      if (this.kame) return;
      this._kp.genki = I.up ? this._kp.genki + dt : 0;
      if (this._kp.genki > (inp.mode === 'desktop' ? 0 : 0.4)) {
        this._kp.genki = 0;
        if (!this.spend(20)) return;
        const orb = new EnergyOrb(this.ctx, 'spirit', 0.2);
        orb.light = fx.borrowLight(C.spirit, 3, 12);
        G = this.genki = { charge: 0, t: 0, orb, r: 0.2, down: 0, loop: sfx.loop({ sample: 'spirit', base: 110, noiseF: 900, vol: 0.45 }) };
        orb.pos.copy(inp.head).add(_v.set(0, 1.4, 0));
        ui.manga({ main: '元気玉', ruby: 'げんきだま', color: '#4ab8ff', sub: '모두, 기를 나눠 줘!' });
        sfx.play('charge_rise', { vol: 0.6, rate: 0.7 });
      }
      return;
    }
    G.t += dt;
    if (I.lost || I.cancel) {
      this._cancelGenki();
      return;
    }
    if (I.up) {
      G.down = 0;
      G.charge = Math.min(6, G.charge + dt * (this.ssj ? 1.6 : 1));
      if (Math.random() < 0.5) {
        inp.left.pulse(0.1 + G.charge * 0.05, 15);
        inp.right.pulse(0.1 + G.charge * 0.05, 15);
      }
    } else G.down += dt;
    G.r = 0.25 + 2.5 * Math.min(1, G.charge / 6);
    // 머리 위에 떠 있는 위치
    const fwd = _v2.copy(inp.headDir).setY(0).normalize();
    const want = _v.copy(inp.head).addScaledVector(UP, 0.9 + G.r).addScaledVector(fwd, 0.4 + G.r * 0.3);
    G.orb.pos.lerp(want, 1 - Math.exp(-dt * 6));
    G.orb.setRadius(G.r);
    G.orb.update(dt, 0.6 + 0.05 * G.charge);
    G.loop.set(0.5 + 0.08 * G.charge, 0.8 + 0.05 * G.charge);
    G.loop.pos(G.orb.pos);
    // 사방에서 모여드는 기
    if (I.up) {
      for (let k = 0; k < 4; k++) {
        const far = _v3.randomDirection();
        far.y = Math.abs(far.y) * 0.6 + 0.05;
        far.multiplyScalar(10 + Math.random() * 14).add(G.orb.pos);
        const life = 0.7 + Math.random() * 0.4;
        const vel = _v.subVectors(G.orb.pos, far).divideScalar(life);
        fx.spawn(far, vel, Math.random() < 0.6 ? C.spirit : C.white, 0.05 + Math.random() * 0.05, life, 0, 0);
      }
    }
    if (G.charge >= 1.2 && I.throwIt && (inp.mode === 'desktop' || G.down < 2.5)) this._throwGenki();
    else if (inp.mode === 'desktop' && I.throwIt) this._cancelGenki();
    else if (G.down > 4) this._cancelGenki();
  }

  _cancelGenki() {
    const G = this.genki;
    if (!G) return;
    this.genki = null;
    this.ctx.fx.implode(G.orb.pos, 40, C.spirit, G.r * 1.2, 0.4, 0.04);
    G.orb.dispose();
    G.loop.stop(0.5);
  }

  _throwGenki() {
    const { input: inp, sfx } = this.ctx;
    const G = this.genki;
    this.genki = null;
    // 겨냥: 시선 35° 안의 더미 → 시선이 닿는 바닥 → 앞쪽 12m 바닥
    const head = inp.head;
    let aim = null;
    let bestCos = Math.cos((35 * Math.PI) / 180);
    for (const d of this.ctx.world.dummies) {
      if (!d.alive) continue;
      const c = d.center(new THREE.Vector3());
      const v = _v.subVectors(c, head);
      const dist = v.length();
      if (dist > 45) continue;
      const cos = v.divideScalar(dist).dot(inp.headDir);
      if (cos > bestCos) {
        bestCos = cos;
        aim = c;
      }
    }
    if (!aim) {
      const hd = inp.headDir;
      if (hd.y < -0.05) aim = _v.copy(head).addScaledVector(hd, Math.min(30, head.y / -hd.y)).clone();
      else aim = _v.copy(hd).setY(0).normalize().multiplyScalar(12).add(head).setY(0).clone();
    }
    const dir = aim.sub(G.orb.pos).normalize();
    this.bombs.push({ orb: G.orb, pos: G.orb.pos, vel: dir.multiplyScalar(this.ssj ? 11 : 8), r: G.r, life: 8, loop: G.loop, gold: this.ssj });
    sfx.play('whoosh', { vol: 1, rate: 0.5 });
    inp.left.pulse(1, 200);
    inp.right.pulse(1, 200);
  }

  _updateBombs(dt) {
    const { world, fx } = this.ctx;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const S = this.bombs[i];
      S.life -= dt;
      S.orb.update(dt, 1);
      S.loop.pos(S.pos);
      let hit = S.life <= 0;
      const steps = Math.max(1, Math.ceil((S.vel.length() * dt) / 0.3));
      for (let k = 0; k < steps && !hit; k++) {
        S.pos.addScaledVector(S.vel, dt / steps);
        if (S.pos.y - S.r * 0.6 < 0) hit = true;
        else if (world.nearestTarget(S.pos, S.r * 0.85)) hit = true;
        const B = this.ctx.env.bounds;
        if (B && (S.pos.x < B.minX - 1 || S.pos.x > B.maxX + 1 || S.pos.z < B.minZ - 1 || S.pos.z > B.maxZ + 1)) hit = true;
      }
      if (Math.random() < 0.6) fx.spawn(_v.randomDirection().multiplyScalar(S.r).add(S.pos), _v2.copy(S.vel).multiplyScalar(-0.3), C.spirit, 0.06, 0.4, 1, 0);
      if (hit) {
        this._detonateGenki(S);
        S.orb.dispose();
        S.loop.stop(0.4);
        this.bombs.splice(i, 1);
      }
    }
  }

  _detonateGenki(S) {
    const { world, fx, sfx, input: inp } = this.ctx;
    const pos = S.pos.clone();
    if (pos.y < S.r * 0.6) pos.y = S.r * 0.6;
    const R = S.r * 2.2 + 2.5;
    const mul = S.gold ? 1.5 : 1;
    world.forEachTarget(pos, R * 1.15, (t, d, c) => {
      const k = Math.max(0.15, 1 - d / (R * 1.15));
      const n = new THREE.Vector3().subVectors(c, pos).add(_v2.set(0, 1, 0)).normalize();
      t.damage((120 + 260 * (S.r / 2.8)) * mul * k, { type: 'blast', dir: n, dirAmt: 6 });
      if (t.alive) t.impulse(n.clone().multiplyScalar((10 + 14 * k) / Math.sqrt(t.mass ?? 3)), 10);
    });
    for (const b of world.bullets) if (b.alive && b.pos.distanceTo(pos) < R) world.removeBullet(b);
    // 빛의 돔이 부풀었다 사라진다
    fx.sphereBlast(pos, C.spirit, R, 1.2, { opacity: 0.7 });
    fx.sphereBlast(pos, 0xffffff, R * 0.6, 0.5);
    fx.shockwave(_v.copy(pos).setY(0.05), C.kiHi, R * 2.2, 1.0);
    fx.shockwave(_v.copy(pos).setY(0.08), C.spirit, R * 1.4, 0.7);
    fx.burst(pos, 220, C.spirit, 9, 0.08, 1.1, { drag: 1.6 });
    fx.burst(pos, 120, C.white, 6, 0.06, 0.7, { drag: 2 });
    fx.burst(_v.copy(pos).setY(0.2), 80, C.dust, 5, 0.12, 1.6, { dark: true, up: 1, grav: 3, drag: 1.2, grow: 1.2 });
    fx.flash(pos, C.spirit, 18, 1.2, 40);
    for (let i = 0; i < 5; i++) fx.starFlare(_v.copy(pos).add(_v2.randomDirection().multiplyScalar(S.r * 0.5)), 0xffffff, 1.5 + S.r, 0.4);
    sfx.explosion(pos, 2.2);
    sfx.play('wind_burst', { at: pos, vol: 0.9, rate: 0.8 });
    sfx.rumble(2.5, 0.6);
    inp.left.pulse(1, 400);
    inp.right.pulse(1, 400);
  }

  // ── 순간이동 ──
  _updateTeleport(dt) {
    const inp = this.ctx.input;
    const T = this.tele;
    let pose = false;
    if (inp.mode === 'desktop') {
      if (inp.keyDown('KeyE') && !this._kE && T.cd <= 0) this._teleport();
      this._kE = inp.keyDown('KeyE');
      return;
    }
    const L = inp.left;
    if (L.source === 'controller' && L.active && L.pressed('a')) {
      if (T.cd <= 0) this._teleport();
      return;
    }
    if (this.kame || this.genki) return;
    // 이마 = 눈(카메라)보다 조금 위·앞
    const brow = _v.copy(inp.head).addScaledVector(UP, 0.07).addScaledVector(inp.headDir, 0.05);
    for (const h of inp.hands) {
      if (h.source !== 'hand') continue;
      if (h.active) {
        const g = h.gesture;
        const fingers = g === 'two' || g === 'crossed' || g === 'point';
        h._onBrow = fingers && (h.pos.distanceTo(brow) < 0.1 || h.indexTip.distanceTo(brow) < 0.09);
        h._browLost = 0;
        if (h._onBrow) pose = true;
      } else if (h._onBrow) {
        // 얼굴에 바짝 대면 추적이 끊기기 쉬우므로 잠깐은 대고 있는 것으로 본다
        h._browLost = (h._browLost ?? 0) + dt;
        if (h._browLost < 0.8) pose = true;
        else h._onBrow = false;
      }
    }
    if (pose && T.cd <= 0) {
      T.hold += dt;
      if (Math.random() < 0.5) this.ctx.fx.spawn(_v2.copy(brow).addScaledVector(inp.headDir, 0.05), _v3.randomDirection().multiplyScalar(0.1), C.white, 0.01, 0.3, 2, 0);
      if (T.hold > 0.5) {
        T.hold = 0;
        this._teleport();
      }
    } else T.hold = 0;
  }

  _teleport() {
    const { input: inp, world, fx, sfx, ui, rig, env } = this.ctx;
    this.tele.cd = 1.0;
    const head = inp.head.clone();
    const fwd = _v.copy(inp.headDir).setY(0);
    if (fwd.lengthSq() < 1e-3) fwd.set(0, 0, -1);
    fwd.normalize();
    // 바라보는 쪽(35° 안)에서 가장 정면에 있는 더미
    let best = null;
    let bestCos = Math.cos((35 * Math.PI) / 180);
    for (const d of world.dummies) {
      if (!d.alive || d.dying) continue;
      const c = d.center(_v2).sub(head);
      const dist = c.length();
      if (dist > 40 || dist < 0.5) continue;
      const cos = c.divideScalar(dist).dot(inp.headDir);
      if (cos > bestCos) {
        bestCos = cos;
        best = d;
      }
    }
    const dest = new THREE.Vector3();
    const face = new THREE.Vector3();
    if (best) {
      const dp = best.root.position;
      const away = _v2.set(dp.x - head.x, 0, dp.z - head.z);
      if (away.lengthSq() < 1e-4) away.copy(fwd);
      away.normalize();
      dest.set(dp.x + away.x * 1.1, 0, dp.z + away.z * 1.1);
      face.copy(away).negate();
    } else {
      dest.set(head.x + fwd.x * 6, 0, head.z + fwd.z * 6);
      face.copy(fwd);
    }
    const B = env.bounds;
    if (B) {
      dest.x = THREE.MathUtils.clamp(dest.x, B.minX + 0.5, B.maxX - 0.5);
      dest.z = THREE.MathUtils.clamp(dest.z, B.minZ + 0.5, B.maxZ - 0.5);
    }
    // 사라지는 자리
    fx.burst(_v3.copy(head).add(_v2.set(0, -0.5, 0)), 30, this.ssj ? C.gold : C.white, 2, 0.04, 0.3, { spread: 0.4 });
    if (!sfx.play('teleport', { vol: 0.9 })) sfx.whoosh(head, 0.8, 2);
    // 몸(리그)을 옮기고 상대를 바라보게 돌린다
    const dx = dest.x - head.x;
    const dz = dest.z - head.z;
    const yawDelta = Math.atan2(face.x, face.z) - Math.atan2(fwd.x, fwd.z);
    rig.position.x += dx;
    rig.position.z += dz;
    if (inp.mode === 'desktop') {
      inp.yaw += yawDelta;
    } else {
      const pivot = _v2.set(dest.x, rig.position.y, dest.z);
      rig.position.sub(pivot).applyAxisAngle(UP, yawDelta).add(pivot);
      rig.rotation.y += yawDelta;
    }
    rig.updateMatrixWorld(true);
    this.blink.fire(this.ssj ? 0xfff0b0 : 0xffffff);
    fx.burst(_v3.set(dest.x, 1.0, dest.z), 30, this.ssj ? C.gold : C.white, 2, 0.04, 0.3, { spread: 0.4 });
    ui.manga({ main: '瞬間移動', ruby: 'しゅんかんいどう', color: '#ffffff', dur: 0.9 });
    inp.left.pulse(0.6, 60);
    inp.right.pulse(0.6, 60);
  }

  // ── 초사이어인 ──
  _ssjSign() {
    const inp = this.ctx.input;
    if (inp.mode === 'desktop') return inp.keyDown('KeyQ');
    const L = inp.left;
    const R = inp.right;
    if (!L.active || !R.active) return false;
    if (L.source === 'controller' && R.source === 'controller') return L.btn.stick && R.btn.stick;
    if (L.source !== 'hand' || R.source !== 'hand' || !this.ctx.settings.domainGesture) return false;
    // 두 주먹을 허리 옆에 두고 힘을 준다
    const low = (h) => h.palm.y < inp.head.y - 0.35 && h.palm.y > inp.head.y - 1.15;
    return L.gesture === 'fist' && R.gesture === 'fist' && low(L) && low(R) && L.palm.distanceTo(R.palm) > 0.3 && L.speed < 0.8 && R.speed < 0.8;
  }

  _updateSsjSign(dt) {
    const { input: inp, fx, sfx } = this.ctx;
    const d = this.domain;
    d.cd = Math.max(0, d.cd - dt);
    const active = this.ssj;
    const canCast = active ? this.ssjT < d.duration - 2 : d.cd <= 0;
    const held = (this._ssjSign() || d.auto) && canCast && !this.kame && !this.genki;
    const need = 1.5;
    if (held) {
      d.lost = 0;
      d.sign += dt * (d.auto ? 2 : 1);
      if (Math.random() < 0.6) {
        inp.left.pulse(0.2 + (d.sign / need) * 0.7, 20);
        inp.right.pulse(0.2 + (d.sign / need) * 0.7, 20);
      }
      if (!active) {
        // 기를 끌어올린다: 땅에서 돌가루가 떠오르고 금빛이 번뜩인다
        if (Math.random() < 0.7) {
          const a = Math.random() * Math.PI * 2;
          const r = 0.6 + Math.random() * 1.5;
          fx.spawnDark(_v.set(inp.head.x + Math.cos(a) * r, 0.05, inp.head.z + Math.sin(a) * r), _v2.set(0, 0.8 + Math.random(), 0), C.dust, 0.03 + Math.random() * 0.03, 0.9, 0.5, -0.3);
        }
        if (Math.random() < d.sign / need) fx.spawn(_v.copy(inp.head).add(_v2.set((Math.random() - 0.5) * 0.8, -0.8 - Math.random() * 0.6, (Math.random() - 0.5) * 0.8)), _v2.set(0, 2, 0), C.gold, 0.04, 0.4, 1, -1);
        if (!d.rumble) {
          d.rumble = true;
          sfx.rumble(1.6, 0.4);
          sfx.play('charge_rise', { vol: 0.6, rate: 0.8 });
        }
      }
      if (d.sign >= need) {
        d.sign = 0;
        d.auto = false;
        d.rumble = false;
        if (active) this._endSsj();
        else this._startSsj();
      }
    } else if ((d.lost += dt) > 0.3 || !canCast) {
      d.sign = 0;
      d.rumble = false;
      if (!canCast) d.auto = false;
    }
    const ring = this.signRing;
    const k = Math.min(1, d.sign / need);
    ring.visible = d.sign > 0.01;
    ring.material.opacity = k * 0.9;
    ring.position.copy(inp.head).addScaledVector(inp.headDir, 0.45).add(_v.set(0, -0.25, 0));
    ring.quaternion.copy(inp.headQuat);
    ring.scale.setScalar(0.04 + k * 0.06);
  }

  castDomain() {
    if (!this.ssj && this.domain.cd <= 0) this._startSsj();
    else if (this.ssj) this.ctx.ui.callout('이미 초사이어인');
    else this.ctx.ui.callout('재사용 대기 중');
  }

  _startSsj() {
    const { input: inp, fx, sfx, ui } = this.ctx;
    if (!this.spend(30)) return;
    this.ssjT = this.domain.duration;
    const c = inp.bodyCenter(_v);
    fx.flash(c, C.gold, 18, 0.9, 25);
    fx.sphereBlast(c, C.goldHi, 2.2, 0.35);
    fx.shockwave(_v2.copy(c).setY(0.05), C.gold, 7, 0.9);
    fx.shockwave(_v2.copy(c).setY(0.1), C.goldHi, 4, 0.6);
    fx.burst(c, 160, C.gold, 6, 0.05, 0.8, { up: 2, grav: -1 });
    fx.burst(_v2.copy(c).setY(0.1), 70, C.dust, 4, 0.08, 1.2, { dark: true, up: 1.2, grav: 4 });
    if (!sfx.play('powerup', { vol: 1.2 })) sfx.explosion(c, 1.6);
    this.auraLoop = sfx.loop({ sample: 'aura', base: 60, noiseF: 500, vol: 0.28 });
    this.blink.fire(0xffe070);
    ui.manga({ main: '超サイヤ人', ruby: 'スーパーサイヤじん', color: '#ffb000', big: true, dur: 2.6 });
    inp.left.pulse(1, 400);
    inp.right.pulse(1, 400);
  }

  _endSsj() {
    this.ssjT = 0;
    this.domain.cd = 10;
    this.auraLoop?.stop(1);
    this.auraLoop = null;
    this.ctx.sfx.play('charge_rise', { vol: 0.4, rate: 0.6 });
    this.ctx.ui.callout('초사이어인 해제', { color: '#ffe080' });
  }

  _updateSsj(dt) {
    if (!this.ssj) return;
    const { input: inp, fx } = this.ctx;
    this.ssjT -= dt;
    if (this.ssjT <= 0) {
      this._endSsj();
      return;
    }
    // 몸을 감싸고 위로 치솟는 금빛 오라
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.32 + Math.random() * 0.22;
      _v.set(inp.head.x + Math.cos(a) * r, 0.05 + Math.random() * inp.head.y, inp.head.z + Math.sin(a) * r);
      fx.spawn(_v, _v2.set(Math.cos(a) * 0.15, 2.4 + Math.random() * 1.6, Math.sin(a) * 0.15), Math.random() < 0.6 ? C.gold : C.goldHi, 0.04 + Math.random() * 0.04, 0.35, 1, 0, 0.3);
    }
    for (const h of inp.hands) {
      if (!h.active || Math.random() > 0.6) continue;
      fx.spawn(_v.copy(h.palm).add(_v2.randomDirection().multiplyScalar(0.05)), _v2.set(0, 1 + Math.random(), 0), C.gold, 0.02, 0.3, 1, 0);
    }
    this.auraLoop?.pos(inp.head);
    const sec = Math.ceil(this.ssjT);
    if (sec <= 3 && sec !== this._lastSec) {
      this._lastSec = sec;
      this.ctx.ui.callout(`초사이어인 ${sec}초`, { color: '#ffe080', dur: 0.6 });
    }
  }

  // ── 주먹 (흑섬 없음, 대신 기를 실은 충격) ──
  meleeHit(target, pos, dir, speed, hand) {
    const { fx, sfx } = this.ctx;
    const k = this.ssj ? 2 : 1.3;
    target.damage((12 + speed * 3.5) * k, { type: 'punch', dir });
    target.impulse?.(_v.copy(dir).multiplyScalar((2.5 + speed * 0.8) * k).add(_v2.set(0, 1 * k, 0)), 4 * k);
    fx.burst(pos, 18, this.ssj ? C.gold : C.white, 2.5 * k, 0.03, 0.25);
    fx.shockwave(pos, this.ssj ? C.gold : C.white, 0.6 * k, 0.22, { faceDir: dir.clone(), opacity: 0.9 });
    sfx.punch(pos);
    if (speed > 4) {
      fx.shockwave(pos, C.white, 1.4 * k, 0.3, { faceDir: dir.clone(), opacity: 0.6 });
      sfx.explosion(pos, 0.4);
    }
    hand?.pulse(0.8, 70);
    return true;
  }

  cancelDomain() {
    if (this.ssj) {
      this.ssjT = 0;
      this.auraLoop?.stop(0.3);
      this.auraLoop = null;
    }
    this.domain.sign = 0;
    this.domain.auto = false;
    this._endKame(false);
    this._cancelGenki();
  }

  dispose() {
    const { scene } = this.ctx;
    this._endKame(false);
    this._cancelGenki();
    for (const B of this.beams) B.beam.dispose();
    for (const S of this.shots) S.shot.dispose();
    for (const S of this.bombs) {
      S.orb.dispose();
      S.loop.stop(0.2);
    }
    this.auraLoop?.stop(0.2);
    this.blink.dispose();
    scene.remove(this.signRing);
  }
}
