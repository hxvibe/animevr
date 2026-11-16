// 료멘스쿠나 — 생득술식 「御廚子(어주자)」
//  · 解(해/カイ): 보이지 않는 참격을 날린다. 거리가 멀수록 위력 감소. 연속·다발 사격 가능
//  · 捌(팔/ハチ): 접촉한 대상을 난도질. 대상이 약할수록 더 잘게 썰린다
//  · 竈(카미노) 開(フーガ): 활을 당기듯 화염을 쏘아 착탄 시 거대한 불기둥
//  · 세계를 가르는 해: 영창(龍鱗·反発·番いの流星) + 손바닥으로 방향 지정 → 공간째 절단
//  · 영역전개 「伏魔御廚子(복마어주자)」: 사찰을 세우고 범위 안 모든 것에 해·팔을 난사
//  · 흑섬 / 반전술식: 공통 시스템
import * as THREE from 'three';
import { SlashLines, makeCrescent, FireArrow, spawnFirePillar } from './vfx.js';
import { MalevolentShrine } from './domainShrine.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const RED = new THREE.Color(0xff2a30);
const FIRE = new THREE.Color(0xff6a10);
const FIRE_HI = new THREE.Color(0xffd070);
const SMOKE = new THREE.Color(0x1a1010);

export class Sukuna {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'sukuna';
    this.name = '료멘 스쿠나';
    this.energy = 100;
    this.maxEnergy = 100;
    this.lines = new SlashLines(ctx.scene, 160);
    this.slashes = [];
    this.arrows = [];
    this.pending = []; // 지연 폭발
    this.scars = [];
    this.hand = { left: this._hs(), right: this._hs() };
    this.bow = null;
    this.used = { kai: false, hachi: false };
    this.shrine = new MalevolentShrine(ctx);
    this.domain = { sign: 0, cd: 0, t: 0, duration: 20, hitT: new Map(), cutSfx: 0 };
    this._mangaCd = { kai: 0, hachi: 0 };
    this._deskSlashT = 0;
    this.scarGeo = new THREE.PlaneGeometry(1, 1);
    this.scarGeo.rotateX(-Math.PI / 2);
    this.sheetGeo = new THREE.PlaneGeometry(1, 1);
  }

  _hs() {
    return { swipeCd: 0, cleaveCd: 0, chant: 0, chantStage: 0, armed: 0, broken: 0 };
  }

  spend(x) {
    if (this.energy < x) {
      this.denied();
      return false;
    }
    this.energy -= x;
    return true;
  }

  denied(msg = '주력 부족') {
    if (this._deniedT && this._deniedT > performance.now()) return;
    this._deniedT = performance.now() + 1500;
    this.ctx.sfx.denied();
    this.ctx.ui.callout(msg, { color: '#ff8a8a' });
  }

  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '解(해) — 참격', color: '#ff6a6a', text: '손을 펴고 빠르게 휘두르기. 휘두른 방향으로 참격이 날아감 (연속 가능)' },
        { head: '捌(팔) — 난도질', color: '#ff9a7a', text: '편 손으로 더미를 직접 건드리기. 약한 상대일수록 잘게 썰림' },
        { head: '竈 開(フーガ) — 화염', color: '#ffb050', text: '한 손을 펴고, 다른 손으로 집게(엄지·검지)를 그 손 앞에서 잡아\n활처럼 뒤로 당겼다가 놓기' },
        { head: '세계를 가르는 해', color: '#ffffff', text: '편 손바닥을 앞으로 뻗고 1.3초 유지(영창) → 그 손을 크게 휘두르기' },
        { head: '영역전개 「伏魔御廚子」', color: '#ff4040', text: '얼굴 앞에서 손바닥을 마주 대고 손가락을 세워 1.5초 (염마천인) · 메뉴에서도 발동' },
        { head: '잡기 · 흑섬', color: '#ff3040', text: '더미에 손을 대고 주먹 → 잡기, 펴면 던지기 · 주먹으로 빠르게 치면 확률적으로 흑섬' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴 · R 더미 소환' },
        { head: '解 / 捌', color: '#ff6a6a', text: '좌클릭: 해 (누르고 있으면 연사, 마우스 움직임 방향으로 벰)\n우클릭: 조준한 2.5m 이내 더미에 팔' },
        { head: '竈 開', color: '#ffb050', text: 'F 길게 눌러 당기기 → 떼면 발사' },
        { head: '세계참 / 영역 / 흑섬', color: '#ff4040', text: 'G 1.3초 영창 후 좌클릭: 세계를 가르는 해 · Q 1초: 복마어주자 · V 주먹' },
      ];
    }
    return [
      { head: '解(해) — 참격', color: '#ff6a6a', text: '트리거: 정면 참격 · 트리거를 쥐고 휘두르면 휘두른 방향으로 연속 참격' },
      { head: '捌(팔) — 난도질', color: '#ff9a7a', text: '컨트롤러를 더미에 댄 채 트리거' },
      { head: '竈 開(フーガ) — 화염', color: '#ffb050', text: '왼쪽 그립 유지 + 오른 컨트롤러를 왼손에 대고 트리거 → 뒤로 당겼다 놓기' },
      { head: '세계를 가르는 해', color: '#ffffff', text: 'A 버튼 1.3초 (영창) → 오른 컨트롤러를 크게 휘두르기' },
      { head: '영역전개 「伏魔御廚子」', color: '#ff4040', text: '양쪽 스틱을 눌러 1.5초 (메뉴에서도 발동)' },
      { head: '버튼', color: '#ffd0d0', text: '그립 쥐고 휘둘러 치기 → 흑섬 · B 더미 소환 · Y 메뉴' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const d = this.domain;
    let dom = '준비';
    if (this.shrine.state === 'active') dom = `전개 중 ${Math.max(0, Math.ceil(d.duration - d.t))}s`;
    else if (this.shrine.state !== 'idle') dom = '전개 중';
    else if (d.cd > 0) dom = `재사용 ${Math.ceil(d.cd)}s`;
    return [
      { label: '주력', bar: this.energy / this.maxEnergy, color: '#ff6a6a' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff9fa0' },
      { label: '조리', text: `解 ${this.used.kai ? '✓' : '·'}  捌 ${this.used.hachi ? '✓' : '·'}` },
      { label: '영역', text: dom },
      { label: '처치', text: `${w.kills}` },
    ];
  }

  // ───────────────── 메인 ─────────────────
  update(dt) {
    const { input: inp } = this.ctx;
    const blocked = this.ctx.ui.menuOpen;
    this.energy = Math.min(this.maxEnergy, this.energy + 12 * dt);
    for (const k in this._mangaCd) this._mangaCd[k] -= dt;

    if (!blocked) {
      this._updateDomainSign(dt);
      this._updateBow(dt);
      for (const side of ['left', 'right']) this._updateHand(side, dt);
      if (inp.mode === 'desktop') this._desktop(dt);
    }
    this._updateSlashes(dt);
    this._updateArrows(dt);
    this._updatePending(dt);
    this._updateDomain(dt);
    this._updateScars(dt);
    this.lines.bright = this.ctx.fx.brightBg;
    this.lines.update(dt, this.ctx.input.head);
    this.shrine.update(dt);
  }

  _slashBlockedFor(h) {
    return this.bow && (this.bow.draw === h.side || this.bow.bowSide === h.side);
  }

  _updateHand(side, dt) {
    const { input: inp, world, fx } = this.ctx;
    const h = inp[side];
    const s = this.hand[side];
    s.swipeCd -= dt;
    s.cleaveCd -= dt;
    if (s.armed > 0) s.armed -= dt;
    if (!h.active && h.source === 'hand') {
      // 추적이 끊기면 준비 중이던 영창·장전은 모두 풀린다
      s.chant = 0;
      s.chantStage = 0;
      s.armed = 0;
      return;
    }
    if (!h.active || h.uiBlock || h.source === 'desktop') return;

    // ── 세계를 가르는 해: 영창 ──
    let chantPose;
    if (h.source === 'hand') {
      const fwd = _v.copy(inp.headDir).setY(0).normalize();
      chantPose = h.gesture === 'open' && h.palmNormal.dot(fwd) > 0.5 && h.palm.distanceTo(inp.head) > 0.38 && h.palm.y > inp.head.y - 0.4 && h.speed < 0.9;
    } else chantPose = side === 'right' && h.btn.a;
    if (chantPose && s.armed <= 0 && !this.bow) {
      s.chant += dt;
      s.broken = 0;
      const stages = [[0.05, '龍鱗', 'りゅうりん'], [0.5, '反発', 'はんぱつ'], [0.95, '番いの流星', 'つがいのりゅうせい']];
      if (s.chantStage < 3 && s.chant >= stages[s.chantStage][0]) {
        const [, w, r] = stages[s.chantStage];
        this.ctx.ui.manga({ main: w, ruby: r, color: '#e0e0e0', dur: 0.8, side });
        this.ctx.sfx.play('chant', { vol: 0.7, rate: 0.9 + s.chantStage * 0.12 });
        s.chantStage++;
      }
      if (Math.random() < 0.5) fx.spawn(h.palm, _v2.randomDirection().multiplyScalar(0.2), new THREE.Color(0xffffff), 0.015, 0.4, 2, 0);
      if (s.chant >= 1.3) {
        s.armed = 3;
        s.chant = 0;
        s.chantStage = 0;
        h.pulse(0.8, 120);
        fx.burst(h.palm, 30, new THREE.Color(0xffffff), 1.2, 0.02, 0.5);
      }
    } else {
      s.broken += dt;
      if (s.broken > 0.3) {
        s.chant = 0;
        s.chantStage = 0;
      }
    }
    if (s.armed > 0 && Math.random() < 0.6) {
      fx.spawn(h.palm, _v2.randomDirection().multiplyScalar(0.15), new THREE.Color(0xffffff), 0.02, 0.3, 2, 0);
      fx.spawnDark(h.palm, _v2.randomDirection().multiplyScalar(0.15), SMOKE, 0.03, 0.4, 2, 0);
    }

    // ── 휘두르기: 解 또는 세계참 ──
    const swingOk = h.source === 'hand' ? h.gesture !== 'fist' && h.gesture !== 'pinch' : h.btn.trigger || s.armed > 0;
    if (swingOk && h.speed > 2.3 && s.swipeCd <= 0 && !this._slashBlockedFor(h)) {
      const swipe = _v2.copy(h.vel).normalize();
      if (s.armed > 0) {
        s.armed = 0;
        s.swipeCd = 0.5;
        this._worldSlash(h, swipe);
        return;
      }
      s.swipeCd = 0.16;
      this._dismantle(h, swipe);
    }
    // 컨트롤러: 트리거 한 번 → 정면 참격
    if (h.source === 'controller' && h.pressed('trigger') && s.swipeCd <= 0 && !this._slashBlockedFor(h) && !this._nearOther(h, 0.3)) {
      const tilt = new THREE.Vector3(1, (Math.random() - 0.5) * 1.2, 0).applyQuaternion(inp.headQuat).normalize();
      // 대상에 닿아 있으면 捌
      const t = world.nearestTarget(h.pos, 0.12) ?? world.nearestTarget(h.palm, 0.12);
      if (t) this._cleave(t, h);
      else {
        s.swipeCd = 0.12;
        this._dismantle(h, tilt);
      }
    }

    // ── 捌: 편 손으로 접촉 ──
    if (h.source === 'hand' && s.cleaveCd <= 0 && h.gesture !== 'fist' && h.gesture !== 'pinch' && !this.ctx.grab?.isHolding(side)) {
      const free = (x) => !x.heldBy && !x.held;
      const t = world.nearestTarget(h.palm, 0.06, free) ?? world.nearestTarget(h.indexTip, 0.04, free);
      if (t && h.speed > 0.6) {
        s.cleaveCd = 0.6;
        this._cleave(t, h);
      }
    }
  }

  _nearOther(h, d) {
    const inp = this.ctx.input;
    const o = h.side === 'left' ? inp.right : inp.left;
    return o.active && o.btn?.grip && o.pos.distanceTo(h.pos) < d;
  }

  _desktop(dt) {
    const inp = this.ctx.input;
    const world = this.ctx.world;
    this._deskSlashT -= dt;
    const armed = this.hand.right.armed > 0;
    // G: 영창
    if (inp.keyDown('KeyG') && !armed) {
      const s = this.hand.right;
      s.chant += dt;
      const stages = [[0.05, '龍鱗', 'りゅうりん'], [0.5, '反発', 'はんぱつ'], [0.95, '番いの流星', 'つがいのりゅうせい']];
      if (s.chantStage < 3 && s.chant >= stages[s.chantStage][0]) {
        const [, w, r] = stages[s.chantStage];
        this.ctx.ui.manga({ main: w, ruby: r, color: '#e0e0e0', dur: 0.8 });
        s.chantStage++;
      }
      if (s.chant >= 1.3) {
        s.armed = 3;
        s.chant = 0;
        s.chantStage = 0;
      }
    } else if (!inp.keyDown('KeyG')) {
      this.hand.right.chant = 0;
      this.hand.right.chantStage = 0;
    }
    const dx = inp.mouse.dx;
    const dy = inp.mouse.dy;
    let swipe;
    if (Math.abs(dx) + Math.abs(dy) > 2) swipe = new THREE.Vector3(dx, -dy, 0).normalize().applyQuaternion(inp.headQuat);
    else swipe = new THREE.Vector3(1, (Math.random() - 0.5) * 1.4, 0).normalize().applyQuaternion(inp.headQuat);
    if (inp.mouse.left && this._deskSlashT <= 0) {
      this._deskSlashT = 0.16;
      if (armed) {
        this.hand.right.armed = 0;
        this._worldSlash(inp.right, swipe);
      } else this._dismantle(inp.right, swipe);
    }
    if (inp.mouseRightPressed) {
      let best = null;
      let bd = 0.7;
      for (const t of world.targets()) {
        const c = t.center(_v);
        const rel = _v2.subVectors(c, inp.head);
        const along = rel.dot(inp.headDir);
        if (along < 0 || along > 2.8) continue;
        const off = rel.addScaledVector(inp.headDir, -along).length();
        if (off < bd) {
          bd = off;
          best = t;
        }
      }
      if (best) this._cleave(best, inp.right);
    }
  }

  // ───────────────── 解 ─────────────────
  _dismantle(h, swipe) {
    const { input: inp, fx, sfx, ui } = this.ctx;
    if (!this.spend(2.5)) return;
    // 진행 방향: 시선 + 손 방향
    const toHand = _v.subVectors(h.palm, inp.head).normalize();
    const travel = new THREE.Vector3().copy(inp.headDir).addScaledVector(toHand, 0.35).normalize();
    // 휘두른 방향을 진행 방향에 수직으로
    const along = swipe.clone().addScaledVector(travel, -swipe.dot(travel));
    if (along.lengthSq() < 1e-3) along.set(1, 0, 0).applyQuaternion(inp.headQuat);
    along.normalize();
    const n = new THREE.Vector3().crossVectors(travel, along).normalize();
    const g = makeCrescent(0.55);
    // 칼날 길이 = along, 두께 = n, 면은 진행 방향(=플레이어 반대쪽)을 바라본다
    const basis = new THREE.Matrix4().makeBasis(along, n, travel);
    g.quaternion.setFromRotationMatrix(basis);
    const start = (h.source === 'desktop' ? inp.head.clone().addScaledVector(inp.headDir, 0.4) : h.palm.clone()).addScaledVector(travel, 0.25);
    g.position.copy(start);
    this.ctx.scene.add(g);
    this.slashes.push({ g, pos: g.position, start, travel, along, n, speed: 26, life: 0.55, hit: new Set() });
    sfx.slash(start, 0.9 + Math.random() * 0.3);
    h.pulse?.(0.5, 30);
    this.used.kai = true;
    if (this._mangaCd.kai <= 0) {
      this._mangaCd.kai = 2.5;
      ui.manga({ main: '解', ruby: 'カイ', color: '#ff2030', side: h.side });
    }
    void fx;
  }

  _updateSlashes(dt) {
    const { world, fx, sfx } = this.ctx;
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life -= dt;
      const steps = Math.max(1, Math.ceil((s.speed * dt) / 0.25));
      for (let k = 0; k < steps; k++) {
        s.pos.addScaledVector(s.travel, (s.speed * dt) / steps);
        for (const t of world.targets()) {
          if (s.hit.has(t)) continue;
          // 참격면과의 거리 + 초승달 길이 안
          const c = t.center(_v);
          const rel = _v2.subVectors(c, s.pos);
          const plane = Math.abs(rel.dot(s.n));
          const lat = Math.abs(rel.dot(s.along));
          const fwd = Math.abs(rel.dot(s.travel));
          const r = (t.kind === 'dummy' ? 0.45 : t.radius) * (t.scale ?? 1);
          if (plane < r * 0.8 && lat < 0.75 + r && fwd < 0.35 + r * 0.5) {
            s.hit.add(t);
            const dist = s.pos.distanceTo(s.start);
            const dmg = 42 * Math.max(0.35, 1 - dist / 22);
            const cutPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(s.n, c);
            this.lines.add(c, s.along, s.n, 1.1 * (t.scale ?? 1), 0.025, 0.2, 0xffffff);
            fx.burst(c, 14, RED, 2.5, 0.03, 0.35, { dir: s.travel, dirAmt: 1 });
            sfx.cut(c);
            t.damage(dmg, { type: 'slash', plane: cutPlane, push: s.travel.clone().multiplyScalar(2) });
            if (t.alive) t.impulse(s.travel.clone().multiplyScalar(1.2));
          }
        }
        // 이미 잘린 조각도 다시 썬다
        for (const pc of [...world.slicer.pieces]) {
          if (s.hit.has(pc) || pc.pivot.position.distanceTo(s.pos) > 0.6) continue;
          s.hit.add(pc);
          if (pc.localPlanes.length < 3) world.slicer.sliceAgain(pc, new THREE.Plane().setFromNormalAndCoplanarPoint(s.n, pc.pivot.position), { sep: 0.8, radius: pc.radius * 0.7 });
          else world.slicer.shatterPiece(pc, 16);
        }
      }
      const k = Math.max(0, s.life / 0.55);
      const fade = Math.min(1, k * 3);
      s.g.children.forEach((m, j) => (m.material.opacity = [1, 0.75][j] * fade));
      s.g.scale.setScalar(1 + (1 - k) * 0.6);
      if (s.pos.y < 0.05 || s.life <= 0) {
        if (s.pos.y < 0.3) this._scar(s.pos, s.along, 1.2, 0.04);
        this.ctx.scene.remove(s.g);
        s.g.children.forEach((m) => {
          m.geometry.dispose();
          m.material.dispose();
        });
        this.slashes.splice(i, 1);
      }
    }
  }

  // ───────────────── 捌 ─────────────────
  _cleave(t, h) {
    const { fx, sfx, ui } = this.ctx;
    if (!this.spend(8)) return;
    const c = t.center(new THREE.Vector3());
    // 상대가 약할수록 더 잘게
    const hp = t.infinite ? 400 : t.maxHp;
    const n = THREE.MathUtils.clamp(Math.round((4 * 150) / Math.max(30, hp)), 1, 8);
    const planes = [];
    for (let i = 0; i < n; i++) {
      const nrm = new THREE.Vector3().randomDirection();
      if (i === 0) nrm.set(Math.random() - 0.5, 0.25, Math.random() - 0.5).normalize();
      const p = c.clone().add(_v.randomDirection().multiplyScalar(0.15 * (t.scale ?? 1)));
      planes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, p));
      const along = new THREE.Vector3().crossVectors(nrm, _v2.randomDirection()).normalize();
      this.lines.add(p, along, nrm, 1.0 * (t.scale ?? 1), 0.022, 0.25 + i * 0.03, i % 2 ? 0xff8080 : 0xffffff);
    }
    for (let i = 0; i < Math.min(n, 4); i++) setTimeout(() => sfx.cut(c), i * 40);
    fx.burst(c, 20 + n * 6, RED, 2.5, 0.03, 0.4);
    t.damage(150, { type: 'cleave', planes, plane: planes[0] });
    h?.pulse?.(0.9, 80);
    this.used.hachi = true;
    if (this._mangaCd.hachi <= 0) {
      this._mangaCd.hachi = 1.5;
      ui.manga({ main: '捌', ruby: 'ハチ', color: '#ff4020', side: h?.side });
    }
  }

  // ───────────────── 竈 開 ─────────────────
  _updateBow(dt) {
    const { input: inp, fx, ui, sfx, settings } = this.ctx;
    const L = inp.left;
    const R = inp.right;
    const b = this.bow;
    if (!b) {
      // 시작 조건
      let start = null;
      if (inp.mode === 'desktop') {
        if (inp.keyDown('KeyF')) start = { bowSide: 'left', drawSide: 'right' };
      } else {
        for (const [B, D] of [[L, R], [R, L]]) {
          if (!B.active || !D.active || B.uiBlock) continue;
          if (B.source === 'hand' && D.source === 'hand') {
            if (B.gesture === 'open' && (D.gesture === 'pinch' || D.pinch) && D.pos.distanceTo(B.palm) < 0.16 && D.palm.distanceTo(B.palm) > 0.07) start = { bowSide: B.side, drawSide: D.side };
          } else if (B.source === 'controller' && D.source === 'controller') {
            if (B.side === 'left' && B.btn.grip && D.pressed('trigger') && D.pos.distanceTo(B.pos) < 0.25) start = { bowSide: 'left', drawSide: 'right' };
          }
          if (start) break;
        }
      }
      if (start) {
        if (settings.kaminoRule && !(this.used.kai && this.used.hachi)) {
          this.denied('해와 팔로 먼저 조리해야 한다');
          return;
        }
        if (this.energy < 30) {
          this.denied();
          return;
        }
        this.bow = { ...start, draw: 0, t: 0, arrow: new FireArrow(this.ctx), light: fx.borrowLight(FIRE, 3, 6) };
        ui.manga({ top: '■', main: '開', ruby: 'フーガ', color: '#ff6a10' });
        sfx.playClip('sukunaFuga', { vol: 1.2 });
        sfx.play('fire_ignite', { vol: 0.8 });
        this.bow.loop = sfx.loop({ sample: 'fire', base: 70, noiseF: 600, vol: 0.35 });
      }
      return;
    }
    // 당기는 중
    b.t += dt;
    const B = inp[b.bowSide];
    const D = inp[b.drawSide];
    let holding;
    let tail;
    let tip;
    if (inp.mode === 'desktop') {
      holding = inp.keyDown('KeyF');
      b.draw = Math.min(0.55, b.t * 0.55);
      tip = new THREE.Vector3().copy(inp.head).addScaledVector(inp.headDir, 0.7).add(_v3.set(0, -0.15, 0).applyQuaternion(inp.headQuat));
      tail = new THREE.Vector3().copy(tip).addScaledVector(inp.headDir, -(0.25 + b.draw));
    } else {
      holding = D.source === 'hand' ? D.pinchDist < 0.045 || D.pinch : D.btn.trigger;
      // 손 추적이 끊기면 발사하지 않고 취소
      if (!B.active || !D.active) {
        b.arrow.dispose();
        fx.releaseLight(b.light);
        b.loop?.stop(0.2);
        this.bow = null;
        return;
      }
      tip = B.palm.clone();
      tail = D.pos.clone();
      b.draw = THREE.MathUtils.clamp(tip.distanceTo(tail) - 0.08, 0, 0.55);
    }
    const dir = new THREE.Vector3().subVectors(tip, tail).normalize();
    const A = b.arrow;
    const len = tip.distanceTo(tail) + 0.25;
    A.group.position.copy(tail);
    A.group.lookAt(_v.copy(tail).sub(dir)); // -Z 가 진행 방향이 되도록
    A.setLength(len, 0.3 + b.draw * 0.5);
    A.update(dt);
    b.loop?.set(0.6 + b.draw * 1.2, 0.9 + b.draw * 0.6);
    b.loop?.pos(tip);
    if (b.light) b.light.position.copy(tip);
    if (Math.random() < 0.9) fx.spawn(tip, new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3), Math.random() < 0.5 ? FIRE : FIRE_HI, 0.04 + b.draw * 0.06, 0.4, 1, -1, 0.5);
    if (Math.random() < 0.15) fx.spawnDark(_v3.copy(tip).addScaledVector(dir, 0.1), new THREE.Vector3(0, 0.6, 0), SMOKE, 0.03, 0.6, 1, -0.5, 1.2);
    if (Math.random() < 0.4) {
      B.pulse?.(0.1 + b.draw * 0.5, 15);
      D.pulse?.(0.1 + b.draw * 0.5, 15);
    }
    if (!holding) {
      if (b.draw >= 0.15 && this.spend(30)) this._fireArrow(tip.clone(), dir.clone(), b.draw);
      else fx.burst(tip, 20, FIRE, 1, 0.03, 0.4);
      A.dispose();
      fx.releaseLight(b.light);
      b.loop?.stop(0.3);
      this.bow = null;
    }
  }

  _fireArrow(pos, dir, draw) {
    const { fx, sfx } = this.ctx;
    const arrow = new FireArrow(this.ctx);
    arrow.setLength(2.6, 1.25);
    arrow.group.position.copy(pos);
    arrow.group.lookAt(_v.copy(pos).add(dir));
    arrow.group.rotateY(Math.PI); // -Z 가 진행 방향
    const light = fx.borrowLight(FIRE, 6, 10);
    this.arrows.push({ arrow, pos: arrow.group.position, vel: dir.multiplyScalar(18 + draw * 24), life: 3, draw, light });
    if (!sfx.play('fire_whoosh', { at: pos, vol: 1.1 })) sfx.fire(pos, 0.5);
    fx.burst(pos, 40, FIRE, 2.5, 0.05, 0.4);
    this.used.kai = this.used.hachi = false;
    const inp = this.ctx.input;
    inp.left.pulse(1, 150);
    inp.right.pulse(1, 150);
  }

  _updateArrows(dt) {
    const { world, fx } = this.ctx;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      a.arrow.update(dt);
      const steps = Math.max(1, Math.ceil((a.vel.length() * dt) / 0.25));
      let hit = a.life <= 0;
      const targets = world.targets();
      for (let k = 0; k < steps && !hit; k++) {
        a.pos.addScaledVector(a.vel, dt / steps);
        if (a.pos.y < 0.1) hit = true;
        for (const t of targets) if (t.distanceTo(a.pos) < 0.15) {
          hit = true;
          break;
        }
      }
      if (a.light) a.light.position.copy(a.pos);
      // 불티와 꼬리 연기
      const back = _v3.copy(a.vel).normalize();
      for (let k = 0; k < 5; k++) {
        const p = _v2.copy(a.pos).addScaledVector(back, -Math.random() * 2.2).add(_v.randomDirection().multiplyScalar(0.25));
        fx.spawn(p, _v.randomDirection().multiplyScalar(1.2).addScaledVector(a.vel, -0.04), k % 2 ? FIRE : FIRE_HI, 0.025 + Math.random() * 0.03, 0.5 + Math.random() * 0.4, 1.5, -0.6, 0);
      }
      if (Math.random() < 0.6 && a.pos.distanceTo(this.ctx.input.head) > 4) fx.spawnDark(_v2.copy(a.pos).addScaledVector(back, -1.6), _v.set((Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4), new THREE.Color(0x3a3030), 0.18, 1.2, 1, -0.4, 2.5);
      if (hit) {
        this._kamino(a.pos.clone(), a.draw, true);
        a.arrow.dispose();
        fx.releaseLight(a.light);
        this.arrows.splice(i, 1);
      }
    }
  }

  _kamino(pos, draw, primary) {
    const { world, fx, sfx, ui } = this.ctx;
    const R = 3.5 + draw * 5;
    world.forEachTarget(pos, R, (t, d, c) => {
      const k = Math.max(0, 1 - d / R);
      const n = new THREE.Vector3().subVectors(c, pos).add(_v2.set(0, 0.8, 0)).normalize();
      t.impulse(n.clone().multiplyScalar(6 + 12 * k), 8);
      t.damage(40 + 200 * k, { type: 'burn', burn: true, dir: n, dirAmt: 3 });
    });
    fx.sphereBlast(pos, FIRE, R * 0.7, 0.45);
    fx.sphereBlast(pos, 0xfff0c0, R * 0.3, 0.2);
    fx.burst(pos, 160, FIRE, 6, 0.12, 1.1, { up: 1.2, grav: -2, drag: 1.5, grow: 1.5 });
    fx.burst(pos, 80, FIRE_HI, 4, 0.08, 0.6, { grav: -1 });
    fx.burst(pos, 60, SMOKE, 3, 0.25, 2.2, { dark: true, up: 1, grav: -1.5, drag: 1, grow: 2 });
    fx.shockwave(_v.copy(pos).setY(0.06), FIRE, R * 1.3, 0.7);
    spawnFirePillar(fx, pos, 6 + draw * 10, 1 + draw * 2, 2.4);
    fx.flash(pos, FIRE, 14, 0.8, 25);
    sfx.fire(pos, 1 + draw);
    this._scar(pos, new THREE.Vector3(1, 0, 0), R * 1.2, R * 1.2, 0x120806);
    if (primary) {
      ui.manga({ main: '竈', ruby: 'カミノ', color: '#ff6a10' });
      // 영역 안이라면: 갈려나간 분진이 일제히 점화
      if (this.shrine.state === 'active') this._igniteDomain();
    }
  }

  _igniteDomain() {
    const { world } = this.ctx;
    const c = this.shrine.center;
    for (const t of world.targets()) {
      const p = t.center(new THREE.Vector3());
      if (p.distanceTo(c) > this.shrine.radius) continue;
      this.pending.push({ t: 0.2 + Math.random() * 0.8, pos: p, draw: 0.3 });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 20;
      this.pending.push({ t: 0.3 + Math.random() * 1.2, pos: new THREE.Vector3(c.x + Math.cos(a) * r, 0.5, c.z + Math.sin(a) * r), draw: 0.4 });
    }
    // 카미노 발동 → 영역의 참격이 멎는다
    this.domain.t = Math.max(this.domain.t, this.domain.duration - 2.5);
    this.domain.stopSlashes = true;
  }

  _updatePending(dt) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this._kamino(p.pos, p.draw, false);
        this.pending.splice(i, 1);
      }
    }
  }

  // ───────────────── 세계를 가르는 해 ─────────────────
  _worldSlash(h, swipe) {
    const { input: inp, world, fx, sfx, ui } = this.ctx;
    if (!this.spend(45)) return;
    const travel = inp.headDir.clone();
    const along = swipe.clone().addScaledVector(travel, -swipe.dot(travel));
    if (along.lengthSq() < 1e-3) along.set(0, 1, 0);
    along.normalize();
    const n = new THREE.Vector3().crossVectors(travel, along).normalize();
    const o = h.source === 'desktop' ? inp.head.clone() : h.palm.clone();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, o);
    for (const t of world.targets()) {
      const c = t.center(new THREE.Vector3());
      const rel = _v.subVectors(c, o);
      const fwd = rel.dot(travel);
      if (fwd < -0.5 || fwd > 90) continue;
      const r = (t.kind === 'dummy' ? 0.6 * t.scale : t.radius + 0.2);
      if (Math.abs(plane.distanceToPoint(c)) > r) continue;
      const cut = new THREE.Plane().setFromNormalAndCoplanarPoint(n, plane.projectPoint(c, new THREE.Vector3()));
      t.damage(99999, { type: 'slash', plane: cut, push: n.clone().multiplyScalar(0.5) });
    }
    for (const pc of [...world.slicer.pieces]) {
      if (Math.abs(plane.distanceToPoint(pc.pivot.position)) < pc.radius && pc.localPlanes.length < 3) world.slicer.sliceAgain(pc, plane.clone(), { sep: 1 });
    }
    // 연출: 휘두른 방향(along)으로 화면을 가로지르는 거대한 칼날이 앞으로 뻗어 나가며 공간을 가른다
    for (let i = 0; i < 7; i++) {
      const d = 2.5 + i * i * 1.6;
      this.lines.add(_v.copy(o).addScaledVector(travel, d), along, n, 3 + d * 1.25, 0.05 + d * 0.012, 0.45 + i * 0.07, 0xffffff);
    }
    const big = makeCrescent(1);
    big.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, n, travel));
    big.position.copy(o).addScaledVector(travel, 1.5);
    fx.addTransient(big, 0.6, (k) => {
      const d = 1.5 + k * 60;
      big.position.copy(o).addScaledVector(travel, d);
      big.scale.set(1 + d * 0.9, 1 + d * 0.25, 1 + d * 0.2);
      big.children.forEach((m, j) => (m.material.opacity = (j ? 0.6 : 1) * (k < 0.7 ? 1 : (1 - k) / 0.3)));
    }, () => big.children.forEach((m) => m.material.dispose()));
    const sheet = new THREE.Mesh(this.sheetGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const mid = o.clone().addScaledVector(travel, 45);
    sheet.position.copy(mid);
    sheet.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(travel, along, n));
    sheet.scale.set(90, 120, 1);
    fx.addTransient(sheet, 0.35, (k) => {
      sheet.material.opacity = 0.18 * Math.sin(k * Math.PI);
    });
    // 바닥과의 교선에 흉터
    const groundDir = new THREE.Vector3().crossVectors(n, UP);
    if (groundDir.lengthSq() > 0.05) {
      groundDir.normalize();
      // 평면과 바닥(y=0)의 교선 위 한 점
      const p0 = o.clone();
      const ny = n.y;
      const horiz = new THREE.Vector3(n.x, 0, n.z);
      if (horiz.lengthSq() > 1e-4) {
        const off = (ny * o.y) / horiz.lengthSq();
        p0.addScaledVector(horiz, off).setY(0);
        if (groundDir.dot(travel) < 0) groundDir.negate();
        this._scar(p0.clone().addScaledVector(groundDir, 40), groundDir, 0.18, 80, 0x2a0000);
      }
    }
    fx.flash(o, 0xffffff, 12, 0.3, 30);
    sfx.slash(o, 0.65);
    sfx.rumble(1.2, 0.5);
    ui.manga({ top: '世界を断つ', main: '解', ruby: 'カイ', color: '#ffffff', sub: '세계를 가르는 참격' });
    h.pulse?.(1, 250);
  }

  _scar(pos, dir, width, length, color = 0x1a0000) {
    const m = new THREE.Mesh(this.scarGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(pos.x, 0.015, pos.z);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    m.scale.set(width, 1, length);
    this.ctx.scene.add(m);
    this.scars.push({ m, t: 0 });
    if (this.scars.length > 60) {
      const old = this.scars.shift();
      this.ctx.scene.remove(old.m);
      old.m.material.dispose();
    }
  }

  _updateScars(dt) {
    for (let i = this.scars.length - 1; i >= 0; i--) {
      const s = this.scars[i];
      s.t += dt;
      s.m.material.opacity = 0.8 * Math.max(0, 1 - s.t / 10);
      if (s.t > 10) {
        this.ctx.scene.remove(s.m);
        s.m.material.dispose();
        this.scars.splice(i, 1);
      }
    }
  }

  // ───────────────── 영역전개 伏魔御廚子 ─────────────────
  _updateDomainSign(dt) {
    const { input: inp, fx } = this.ctx;
    const L = inp.left;
    const R = inp.right;
    const d = this.domain;
    d.cd = Math.max(0, d.cd - dt);
    let sign = false;
    if (inp.mode === 'desktop') sign = inp.keyDown('KeyQ');
    else if (L.active && R.active) {
      if (L.source === 'hand' && R.source === 'hand') {
        // 염마천인: 얼굴 앞에서 손바닥을 마주 대고, 손가락은 위로
        const mid = _v.addVectors(L.palm, R.palm).multiplyScalar(0.5);
        sign = this.ctx.settings.domainGesture && L.palm.distanceTo(R.palm) < 0.1 && mid.distanceTo(inp.head) < 0.42 && L.fingersDir.y > 0.55 && R.fingersDir.y > 0.55 &&
          L.gesture !== 'fist' && R.gesture !== 'fist' && L.speed < 0.6 && R.speed < 0.6 && L.palmNormal.dot(R.palmNormal) < -0.4;
      } else if (L.source === 'controller' && R.source === 'controller') {
        sign = L.btn.stick && R.btn.stick;
      }
    }
    if (sign && this.shrine.state === 'idle' && d.cd <= 0 && !this.bow) {
      d.sign += dt;
      if (Math.random() < 0.6) {
        L.pulse(0.1 + d.sign * 0.4, 20);
        R.pulse(0.1 + d.sign * 0.4, 20);
        fx.spawnDark(_v.copy(inp.head).addScaledVector(inp.headDir, 0.35), _v2.randomDirection().multiplyScalar(0.3), SMOKE, 0.05, 0.6, 1, 0, 1);
      }
      if (d.sign >= 1.5) {
        d.sign = 0;
        this._castDomain();
      }
    } else d.sign = Math.max(0, d.sign - dt * 2);
  }

  castDomain() {
    if (this.shrine.state === 'idle' && this.domain.cd <= 0) this._castDomain();
    else this.ctx.ui.callout('영역전개 재사용 대기 중');
  }

  handBusy(side) {
    return !!this.bow;
  }

  _castDomain() {
    const { input: inp, ui, sfx, world } = this.ctx;
    if (!this.spend(45)) return;
    const center = new THREE.Vector3(inp.head.x, 0, inp.head.z);
    this.shrine.start(center, inp.headDir);
    this.domain.t = 0;
    this.domain.stopSlashes = false;
    world.domain = { center, radius: this.shrine.radius, freeze: false };
    ui.manga({ top: '領域展開', main: '伏魔御廚子', ruby: 'ふくまみづし', color: '#ff2020', big: true });
    sfx.rumble(2.5, 0.6);
    sfx.play('domain_open', { vol: 0.9 });
    // 영창 음성 → 끝나기 0.5초 전부터 영역 음악
    this._stopMusic(0.1);
    const voice = sfx.playClip('sukunaDomain', { vol: 1.1 });
    const lead = Math.max(0, (voice.duration || sfx.clipDuration('sukunaDomain')) - 0.5);
    this.music = sfx.playClip('shrineMusic', { vol: 0.75, delay: lead, fadeIn: 0.3 });
    inp.left.pulse(1, 400);
    inp.right.pulse(1, 400);
  }

  _updateDomain(dt) {
    const { world, fx, sfx } = this.ctx;
    const S = this.shrine;
    const d = this.domain;
    if (S.state !== 'active') return;
    d.t += dt;
    if (d.t >= d.duration) {
      S.stop();
      d.cd = 10;
      world.domain = null;
      this._stopMusic(2);
      return;
    }
    if (d.stopSlashes) return;
    const c = S.center;
    // 허공에 번뜩이는 무수한 참격
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * S.radius * 0.8;
      const p = new THREE.Vector3(c.x + Math.cos(a) * r, Math.random() * 4, c.z + Math.sin(a) * r);
      this.lines.add(p, _v.randomDirection(), _v2.randomDirection(), 1 + Math.random() * 4, 0.02 + Math.random() * 0.03, 0.12, Math.random() < 0.3 ? 0xff5050 : 0xffffff);
      if (Math.random() < 0.3) this._scar(p, _v.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), 0.04, 1 + Math.random() * 3, 0x200000);
    }
    // 범위 안 대상에게 해·팔 난사
    d.cutSfx -= dt;
    for (const t of world.targets()) {
      const tc = t.center(new THREE.Vector3());
      if (tc.distanceTo(c) > S.radius) continue;
      const next = d.hitT.get(t) ?? 0;
      if (world.time < next) continue;
      d.hitT.set(t, world.time + 0.1 + Math.random() * 0.1);
      const nrm = new THREE.Vector3().randomDirection();
      const p = tc.clone().add(_v.randomDirection().multiplyScalar(0.2 * (t.scale ?? 1)));
      this.lines.add(p, _v2.crossVectors(nrm, _v3.randomDirection()).normalize(), nrm, 0.9 * (t.scale ?? 1), 0.02, 0.15, 0xffffff);
      fx.burst(p, 5, RED, 1.5, 0.025, 0.3);
      t.damage(t.kind === 'dummy' ? 9 : 14, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, p), silent: true });
      if (d.cutSfx <= 0) {
        d.cutSfx = 0.07;
        sfx.cut(p);
      }
    }
    // 조각들도 계속 썰려 나간다
    if (Math.random() < 0.15 && world.slicer.pieces.length) {
      const pc = world.slicer.pieces[Math.floor(Math.random() * world.slicer.pieces.length)];
      if (pc.pivot.position.distanceTo(c) < S.radius) {
        if (pc.localPlanes.length < 3) world.slicer.sliceAgain(pc, new THREE.Plane().setFromNormalAndCoplanarPoint(_v.randomDirection(), pc.pivot.position), { sep: 0.6, radius: pc.radius * 0.7 });
        else world.slicer.shatterPiece(pc, 14);
      }
    }
  }

  _stopMusic(fade = 1) {
    this.music?.stop(fade);
    this.music = null;
  }

  cancelDomain() {
    this._stopMusic(0.3);
    if (this.shrine.state !== 'idle') {
      this.shrine.state = 'idle';
      this.shrine.group.visible = false;
      this.shrine.sky.visible = false;
      this.ctx.env.setHidden(false);
      this.ctx.env.restore();
    }
    this.pending = [];
    this.ctx.world.domain = null;
  }

  dispose() {
    const { scene, fx } = this.ctx;
    this._stopMusic(0.3);
    for (const s of this.slashes) scene.remove(s.g);
    for (const a of this.arrows) {
      a.arrow.dispose();
      fx.releaseLight(a.light);
    }
    if (this.bow) {
      this.bow.arrow.dispose();
      fx.releaseLight(this.bow.light);
      this.bow.loop?.stop(0.2);
    }
    for (const s of this.scars) scene.remove(s.m);
    scene.remove(this.lines.mesh);
    this.shrine.dispose();
    this.ctx.world.domain = null;
  }
}
