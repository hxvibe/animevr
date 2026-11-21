// 이타도리 유지 — 술식 없이 몸 하나로 싸우는 주술사 (나중에 어주자·적혈조술을 익힌다)
//  · 경정권(逕庭拳): 주먹이 닿은 뒤 한 박자 늦게 주력이 터지는 2타
//  · 흑섬(黒閃): 타격과 주력이 동시에 → 주먹을 "닿는 순간에" 쥐면 확정. 흑섬 뒤엔 존(확률↑)과 연속 기록
//  · 어주자 「解」: 검지·중지(가위)로 대상을 건드리면 가위 문양의 절취선이 그어지고 싹둑
//  · 적혈조술 「穿血」: 두 손바닥을 맞대 피를 압축(백렴) → 손을 떼면 피의 광선
//  · 영역전개: 할아버지와 살던 동네. 필중 효과만 있는 고전적인 영역 → 안의 모든 것에 영혼을 가르는 해
import * as THREE from 'three';
import { cool } from '../../core/cooldown.js';
import { HandAura } from '../../core/handAura.js';
import { Vessel } from '../../core/vessel.js';
import { CutMarks, BloodOrb, spawnBloodBeam, HometownDomain } from './vfx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CE = new THREE.Color(0x4a8cff); // 이타도리의 주력
const CE_HI = new THREE.Color(0xbfe0ff);
const BLOOD = new THREE.Color(0xb00018);
const BLOOD_DARK = new THREE.Color(0x4a0006);
const AURA = { glow: 0x3a7bff, hot: 0xb8dcff, inner: 0x061634, line: 0x02040a };

export class Itadori {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'itadori';
    this.name = '이타도리 유지';
    this.domainLabel = '영역전개';
    this.reviveText = '쓰러졌다… 반전술식으로 회복';
    this.energy = 100;
    this.maxEnergy = 100;
    this.aura = new HandAura(ctx, AURA);
    this.cuts = new CutMarks(ctx.scene);
    this.orb = new BloodOrb(ctx);
    this.town = new HometownDomain(ctx);
    this.domain = { sign: 0, cd: 0, t: 0, duration: 16, sure: 0.6 };
    this.hand = { left: this._hs(), right: this._hs() };
    this.bf = { streak: 0, best: 0, zone: 0, total: 0 };
    this.pending = []; // 경정권 2타
    this.blood = { charge: 0, sepT: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), loop: null, desk: false };
    this._mangaCd = { div: 0, kai: 0 };
    this._deskT = 0;
  }

  _hs() {
    return { lastG: 'none', lastGrip: false, clenchT: -10, cutCd: 0, aimT: 0, aimTarget: null };
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
        { head: '주먹 · 경정권(逕庭拳)', demo: 'itadori.punch', color: '#7fb0ff', text: '주먹으로 더미를 치면 한 박자 늦게 주력이 한 번 더 터진다 (2타)' },
        { head: '흑섬(黒閃)', demo: 'itadori.blackflash', color: '#ff3040', text: '손을 편 채 휘두르다 닿기 직전에 주먹을 쥐면 흑섬 확정\n흑섬 뒤 8초는 존: 흑섬 확률↑ · 연속 기록' },
        { head: '어주자 「解」', demo: 'itadori.cut', color: '#ff6070', text: '검지·중지를 편 가위 손으로 더미를 건드리기 → 절취선이 그어지고 싹둑\n영역 안에서는 가위 손으로 0.25초 가리키기만 해도 된다' },
        { head: '적혈조술 「穿血」', demo: 'itadori.blood', color: '#d0001a', text: '두 손바닥을 맞대고 손끝을 앞으로 (백렴: 피가 압축된다)\n0.5초 이상 모은 뒤 두 손을 떼면 손끝 방향으로 발사' },
        { head: '영역전개', demo: 'itadori.domain', color: '#ffb070', text: '두 손을 깍지 끼고 두 검지만 맞대어 위로 세워 1.5초 (수인표)\n안의 모든 것에 영혼을 가르는 해가 필중 · 메뉴에서도 발동' },
        { head: '잡기', demo: 'common.grab', color: '#ffffff', text: '더미에 손을 대고 천천히 주먹 → 잡기, 펴면 던지기' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴' },
        { head: '주먹 · 흑섬', color: '#7fb0ff', text: '좌클릭: 조준한 2.6m 이내 더미를 친다 (경정권 2타, 확률적으로 흑섬)' },
        { head: '어주자 「解」', color: '#ff6070', text: '우클릭: 조준한 2.6m 이내 더미에 절취선 (영역 안에서는 거리 무관)' },
        { head: '穿血 / 영역', color: '#d0001a', text: 'C 길게 눌러 모으기 → 떼면 발사 · Q 1.5초: 영역전개' },
      ];
    }
    return [
      { head: '주먹 · 경정권 · 흑섬', color: '#7fb0ff', text: '그립 쥐고 휘둘러 치기 (2타) · 닿기 직전에 그립을 쥐면 흑섬 확정' },
      { head: '어주자 「解」', color: '#ff6070', text: '컨트롤러를 더미에 대고 A/X 버튼 (영역 안에서는 겨누고 A/X)' },
      { head: '적혈조술 「穿血」', color: '#d0001a', text: '두 컨트롤러를 맞대고 양쪽 그립 유지 → 하나를 놓으면 발사' },
      { head: '영역전개', color: '#ffb070', text: '양쪽 스틱을 눌러 1.5초 (메뉴에서도 발동)' },
      { head: '버튼', color: '#ffd0d0', text: 'Y 메뉴' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const d = this.domain;
    let dom = '준비';
    if (this.town.state === 'active') dom = `전개 중 ${Math.max(0, Math.ceil(d.duration - d.t))}s`;
    else if (this.town.state !== 'idle') dom = '전개 중';
    else if (d.cd > 0) dom = `재사용 ${Math.ceil(d.cd)}s`;
    const zone = this.bf.zone > 0 ? ` · 존 ${Math.ceil(this.bf.zone)}s` : '';
    return [
      { label: '주력', bar: this.energy / this.maxEnergy, color: '#7fb0ff' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff9fa0' },
      { label: '흑섬', text: `연속 ${this.bf.streak} · 최고 ${this.bf.best}${zone}`, color: '#ff5060' },
      { label: '영역', text: dom },
      { label: '처치', text: `${w.kills}` },
      ...(this.vessel ? [this.vessel.hudRow()] : []),
    ];
  }

  // ───────────────── 메인 ─────────────────
  update(dt) {
    const { input: inp, world } = this.ctx;
    const blocked = this.ctx.ui.menuOpen;
    this.energy = Math.min(this.maxEnergy, this.energy + (this.bf.zone > 0 ? 20 : 13) * dt);
    for (const k in this._mangaCd) this._mangaCd[k] -= dt;
    this.bf.zone = Math.max(0, this.bf.zone - dt);
    (this.vessel ??= new Vessel(this)).update(dt);

    // 주먹을 쥔 순간 기록 (흑섬 타이밍)
    for (const side of ['left', 'right']) {
      const h = inp[side];
      const s = this.hand[side];
      if (h.source === 'hand') {
        if (h.gesture === 'fist' && s.lastG !== 'fist') s.clenchT = world.time;
        s.lastG = h.gesture;
      } else if (h.source === 'controller') {
        if (h.btn.grip && !s.lastGrip) s.clenchT = world.time;
        s.lastGrip = h.btn.grip;
      }
    }

    if (!blocked) {
      this._updateDomainSign(dt);
      this._updateBlood(dt);
      for (const side of ['left', 'right']) this._updateCut(side, dt);
      if (inp.mode === 'desktop') this._desktop(dt);
    }
    this._updatePending(dt);
    this._updateDomain(dt);
    // 존: 흑섬 뒤 주력이 손을 감싸고 검붉게 일렁인다
    if (this.bf.zone > 0) {
      const k = 0.45 + Math.min(0.4, this.bf.zone / 8 * 0.4) + Math.sin(world.time * 10) * 0.06;
      this.aura.set('left', k);
      this.aura.set('right', k);
    }
    // 주먹을 쥐면 그 손을 주력이 감싼다 (흑섬을 노리는 손)
    if (!blocked) {
      for (const side of ['left', 'right']) {
        const h = inp[side];
        const fist = h.active && !h.uiBlock && (h.source === 'hand' ? h.gesture === 'fist' : h.source === 'controller' && h.btn.grip);
        if (fist) this.aura.set(side, 0.55 + Math.sin(world.time * 8 + (side === 'left' ? 0 : 1.7)) * 0.06);
      }
    }
    this.aura.update(dt);
    this.cuts.update(dt, inp.head);
    this.town.update(dt);
  }

  // ───────────────── 주먹: 경정권 · 흑섬 ─────────────────
  meleeHit(target, pos, dir, speed, hand) {
    const { world, settings, melee } = this.ctx;
    const side = hand?.side;
    const s = side ? this.hand[side] : null;
    const since = s ? world.time - s.clenchT : 99;
    // 타격과 주력이 동시에: 닿기 직전에 쥔 주먹
    const perfect = hand?.source === 'hand' ? since < 0.17 : hand?.source === 'controller' ? since < 0.12 : false;
    const inDomain = this.town.state === 'active';
    const chance = (settings.blackFlashChance ?? 0.2) + 0.08 + (this.bf.zone > 0 ? 0.3 : 0) + (inDomain ? 0.1 : 0);
    const black = perfect || Math.random() < chance;
    const base = (10 + speed * 3) * 1.5; // 괴력
    if (black) {
      const B = this.bf;
      B.streak++;
      B.total++;
      B.best = Math.max(B.best, B.streak);
      B.zone = 8;
      melee.blackFlash(target, pos, dir, base, hand, { mul: 1 + Math.min(0.6, (B.streak - 1) * 0.12), top: B.streak > 1 ? `${B.streak}連続` : null });
      this.energy = Math.min(this.maxEnergy, this.energy + 15);
    } else {
      this.bf.streak = 0;
      melee.normalHit(target, pos, dir, base, speed, hand, { push: 1.5 });
      // 경정권: 주먹보다 한 박자 늦게 주력이 터진다
      this.pending.push({ t: 0.13, target, dir: dir.clone(), base, hand });
    }
    return true;
  }

  _updatePending(dt) {
    const { fx, sfx, ui } = this.ctx;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t > 0) continue;
      this.pending.splice(i, 1);
      const t = p.target;
      if (!t.alive) continue;
      const c = t.center(new THREE.Vector3());
      t.damage(p.base * 0.9, { type: 'punch', dir: p.dir, color: '#8fc0ff' });
      t.impulse?.(_v.copy(p.dir).multiplyScalar(5).add(_v2.set(0, 1.6, 0)), 4);
      fx.shockwave(c, CE, 1.5, 0.32, { faceDir: p.dir.clone() });
      fx.shockwave(c, CE_HI, 0.9, 0.22, { faceDir: p.dir.clone() });
      fx.burst(c, 34, CE, 4.5, 0.04, 0.35, { dir: p.dir, dirAmt: 1 });
      fx.burst(c, 14, CE_HI, 2, 0.03, 0.25);
      fx.flash(c, CE, 5, 0.18, 6);
      sfx.play('punch_2', { at: c, vol: 0.9, rate: 0.75 });
      sfx.play('wind_burst', { at: c, vol: 0.35, rate: 1.4 });
      p.hand?.pulse?.(0.9, 50);
      if (this._mangaCd.div <= 0) {
        this._mangaCd.div = 3;
        ui.manga({ main: '逕庭拳', ruby: 'けいていけん', color: '#4a8cff', side: p.hand?.side });
      }
    }
  }

  // ───────────────── 어주자 「解」 (접촉) ─────────────────
  _updateCut(side, dt) {
    const { input: inp, world } = this.ctx;
    const h = inp[side];
    const s = this.hand[side];
    s.cutCd -= dt;
    if (!h.active || h.uiBlock || h.source === 'desktop' || this.blood.charge > 0) {
      s.aimT = 0;
      return;
    }
    const free = (x) => !x.held && !x.dying; // 잡고 있는 적도
    const inDomain = this.town.state === 'active';
    let target = null;
    let point = null;
    if (h.source === 'hand') {
      if (h.gesture !== 'two' || s.cutCd > 0) {
        s.aimT = 0;
        return;
      }
      const t = world.nearestTarget(h.indexTip, 0.05, free) ?? world.nearestTarget(h.pos, 0.05, free);
      if (t && !this.cuts.has(t)) {
        target = t;
        point = h.indexTip.clone();
      } else if (inDomain) {
        // 필중: 가위 손으로 가리키기만 해도 닿는다
        const a = this._aimed(h.pos, h.dir, 0.15, this.town.radius * 1.5);
        if (a && a === s.aimTarget) s.aimT += dt;
        else {
          s.aimTarget = a;
          s.aimT = 0;
        }
        if (a && s.aimT >= 0.25 && !this.cuts.has(a)) {
          target = a;
          point = a.center(new THREE.Vector3());
          s.aimT = 0;
        }
      }
    } else if (h.source === 'controller' && h.pressed('a') && s.cutCd <= 0) {
      target = world.nearestTarget(h.pos, 0.15, free);
      point = h.pos.clone();
      if (!target && inDomain) {
        target = this._aimed(h.pos, h.dir, 0.15, this.town.radius * 1.5);
        point = target?.center(new THREE.Vector3());
      }
    }
    if (target) {
      // 절단면: 손끝 방향과 손바닥 법선이 이루는 면 (손날로 긋는 면)
      const n = _v.crossVectors(h.fingersDir, h.palmNormal);
      if (n.lengthSq() < 1e-4) n.crossVectors(h.dir, UP);
      if (n.lengthSq() < 1e-4) n.set(1, 0, 0);
      this._kai(target, point, n.normalize(), h);
    }
  }

  /** 시선(광선) 근처의 대상: 각도 cos 대신 수직 거리 비율로 */
  _aimed(from, dir, tan, maxD) {
    let best = null;
    let bs = tan;
    for (const t of this.ctx.world.targets()) {
      if (t.dying) continue;
      const c = t.center(_v3);
      const rel = _v2.subVectors(c, from);
      const along = rel.dot(dir);
      if (along < 0.2 || along > maxD) continue;
      const off = rel.addScaledVector(dir, -along).length();
      const score = off / along;
      if (score < bs) {
        bs = score;
        best = t;
      }
    }
    return best;
  }

  _kai(target, point, normal, h, { cost = 12, dmg = 170, delay = 0.32, quiet = false } = {}) {
    const { fx, sfx, ui } = this.ctx;
    if (cost && !this.spend(cost)) return;
    if (h) this.hand[h.side].cutCd = 0.45;
    sfx.play('slash', { at: point, vol: 0.35, rate: 2.2 });
    h?.pulse?.(0.5, 30);
    this.cuts.add(target, point, normal, delay, (plane) => {
      const c = target.center(new THREE.Vector3());
      target.damage(dmg, { type: 'slash', plane, push: normal.clone().multiplyScalar(0.6), color: '#ff7080' });
      fx.burst(c, 18, new THREE.Color(0xff3040), 2.5, 0.03, 0.35);
      fx.burst(c, 10, new THREE.Color(0xffffff), 3, 0.02, 0.2);
      sfx.cut(c);
      h?.pulse?.(0.9, 60);
    });
    if (!quiet && this._mangaCd.kai <= 0) {
      this._mangaCd.kai = 2;
      ui.manga({ main: '解', ruby: 'カイ', color: '#ff4060', side: h?.side });
    }
  }

  // ───────────────── 적혈조술 「穿血」 ─────────────────
  _updateBlood(dt) {
    const { input: inp, sfx } = this.ctx;
    const L = inp.left;
    const R = inp.right;
    const b = this.blood;
    let pose = false;
    let released = false;
    if (inp.mode === 'desktop') {
      pose = inp.keyDown('KeyC');
      if (pose) {
        b.pos.copy(inp.head).addScaledVector(inp.headDir, 0.45).add(_v.set(0, -0.15, 0).applyQuaternion(inp.headQuat));
        b.dir.copy(inp.headDir);
      }
      released = !pose && b.charge > 0;
    } else if (L.active && R.active && !L.uiBlock && !R.uiBlock) {
      if (L.source === 'hand' && R.source === 'hand') {
        const fwd = inp.headDir;
        // 컨트롤러로 흉내 낸 손은 몸체가 부딪혀 손바닥끼리 완전히 맞닿지 못한다 → 넉넉히 본다 (이미 모으는 중이면 더 넉넉히)
        const em = L.emulated || R.emulated;
        const near = (em ? 0.19 : 0.085) + (b.charge > 0 ? (em ? 0.05 : 0.015) : 0);
        pose = L.palm.distanceTo(R.palm) < near && L.palmNormal.dot(R.palmNormal) < (em ? -0.15 : -0.4) && L.fingersDir.dot(fwd) > (em ? 0.25 : 0.4) && R.fingersDir.dot(fwd) > (em ? 0.25 : 0.4) &&
          L.gesture !== 'fist' && R.gesture !== 'fist' && L.palm.distanceTo(inp.head) > 0.2;
        if (pose) {
          _v.addVectors(L.fingersDir, R.fingersDir).normalize();
          b.dir.lerp(_v, 0.5).normalize();
          b.pos.addVectors(L.palm, R.palm).multiplyScalar(0.5).addScaledVector(b.dir, 0.07);
        }
        // 맞댄 손을 떼면 발사
        released = !pose && b.charge > 0 && L.palm.distanceTo(R.palm) > (em ? 0.26 : 0.1);
      } else if (L.source === 'controller' && R.source === 'controller') {
        pose = L.btn.grip && R.btn.grip && L.pos.distanceTo(R.pos) < (b.charge > 0 ? 0.32 : 0.24); // 컨트롤러는 끝까지 맞닿지 못한다
        if (pose) {
          b.dir.addVectors(L.dir, R.dir).normalize();
          b.pos.addVectors(L.pos, R.pos).multiplyScalar(0.5).addScaledVector(b.dir, 0.05);
        }
        released = !pose && b.charge > 0 && (!L.btn.grip || !R.btn.grip);
      }
    }
    if (pose) {
      if (b.charge === 0) {
        b.loop = sfx.loop({ sample: 'red', base: 90, noiseF: 900, vol: 0.25 });
        sfx.play('charge_rise', { at: b.pos, vol: 0.5, rate: 1.3 });
      }
      b.charge = Math.min(1.5, b.charge + dt);
      b.sepT = 0;
      const k = Math.min(1, b.charge / 0.6);
      this.orb.set(b.pos, k);
      b.loop?.set(0.5 + k * 0.8, 0.8 + k * 0.7);
      b.loop?.pos(b.pos);
      if (Math.random() < 0.5) {
        L.pulse?.(0.1 + k * 0.4, 20);
        R.pulse?.(0.1 + k * 0.4, 20);
      }
      if (b.charge >= 0.5 && !b.ready) {
        b.ready = true;
        L.pulse?.(0.8, 60);
        R.pulse?.(0.8, 60);
      }
      return;
    }
    if (b.charge <= 0) return;
    if (released && b.charge >= 0.45) {
      if (this.spend(25)) this._fireBlood(b.pos.clone(), b.dir.clone(), b.charge);
      this._endBlood();
      return;
    }
    // 잠깐 흐트러진 건 봐준다
    b.sepT += dt;
    this.orb.set(b.pos, Math.min(1, b.charge / 0.6) * Math.max(0, 1 - b.sepT / 0.25));
    if (b.sepT > 0.25 || released) this._endBlood();
  }

  _endBlood() {
    const b = this.blood;
    b.charge = 0;
    b.sepT = 0;
    b.ready = false;
    b.loop?.stop(0.2);
    b.loop = null;
    this.orb.set(b.pos, 0);
  }

  _fireBlood(pos, dir, charge) {
    const { world, fx, sfx, ui, input: inp } = this.ctx;
    if (!cool(this.ctx, 'piercing', 5, '穿血')) return;
    const power = Math.min(1, charge / 1.2);
    let len = 45;
    if (dir.y < -0.02) len = Math.min(len, (pos.y - 0.02) / -dir.y);
    const end = pos.clone().addScaledVector(dir, len);
    const dmg = 70 + 140 * power;
    for (const t of world.targets()) {
      if (t.heldBy && t.heldBy !== this) continue;
      const c = t.center(new THREE.Vector3());
      const rel = _v.subVectors(c, pos);
      const along = rel.dot(dir);
      if (along < 0 || along > len) continue;
      const off = rel.addScaledVector(dir, -along).length();
      const r = t.kind === 'dummy' ? 0.3 * (t.scale ?? 1) : t.radius;
      if (off > r + 0.08) continue;
      const hit = pos.clone().addScaledVector(dir, along);
      t.damage(dmg, { type: 'pierce', dir: dir.clone(), dirAmt: 4, speed: 5, color: '#ff3040' });
      t.impulse?.(dir.clone().multiplyScalar(4 + power * 4).add(_v2.set(0, 1, 0)), 4);
      fx.burst(hit, 26, BLOOD, 4, 0.035, 0.45, { dir, dirAmt: 1, dark: true, drag: 2, grav: 4 });
      fx.burst(hit, 10, new THREE.Color(0xff5060), 3, 0.025, 0.25);
    }
    spawnBloodBeam(this.ctx, pos, end, power);
    fx.burst(end, 30, BLOOD_DARK, 3, 0.04, 0.6, { dark: true, up: 1.2, grav: 5 });
    fx.flash(pos, BLOOD, 6, 0.2, 8);
    sfx.play('ki_blast', { at: pos, vol: 0.8, rate: 1.7 });
    sfx.play('slash', { at: pos, vol: 0.7, rate: 0.6 });
    inp.left.pulse?.(1, 120);
    inp.right.pulse?.(1, 120);
    ui.manga({ top: '赤血操術', main: '穿血', ruby: 'せんけつ', color: '#d0001a' });
  }

  // ───────────────── 데스크톱 ─────────────────
  _desktop(dt) {
    const { input: inp, melee } = this.ctx;
    this._deskT -= dt;
    if (inp.mouseLeftPressed && this._deskT <= 0) {
      this._deskT = 0.25;
      const t = this._aimed(inp.head, inp.headDir, 0.35, 2.6);
      if (t) melee.hit(t, t.center(new THREE.Vector3()), inp.headDir.clone(), 5, inp.right);
    }
    if (inp.mouseRightPressed) {
      const inDomain = this.town.state === 'active';
      const t = this._aimed(inp.head, inp.headDir, inDomain ? 0.2 : 0.35, inDomain ? 40 : 2.6);
      if (t && !this.cuts.has(t)) {
        const n = new THREE.Vector3(1, (Math.random() - 0.5) * 1.2, 0).applyQuaternion(inp.headQuat).normalize();
        this._kai(t, t.center(new THREE.Vector3()), n, inp.right);
      }
    }
  }

  // ───────────────── 영역전개 ─────────────────
  _updateDomainSign(dt) {
    const { input: inp } = this.ctx;
    const L = inp.left;
    const R = inp.right;
    const d = this.domain;
    d.cd = Math.max(0, d.cd - dt);
    let sign = false;
    if (inp.mode === 'desktop') sign = inp.keyDown('KeyQ');
    else if (L.active && R.active) {
      if (L.source === 'hand' && R.source === 'hand') {
        const mid = _v.addVectors(L.palm, R.palm).multiplyScalar(0.5);
        const still = L.speed < 0.6 && R.speed < 0.6;
        // 수인표: 두 검지를 맞대어 세우고 나머지 손가락은 깍지 — 손바닥이 마주 본다
        const up = (h) => (h.gesture === 'point' || h.gesture === 'two' || h.gesture === 'crossed') && h.dir.y > 0.5;
        const c = up(L) && up(R) && L.palm.distanceTo(R.palm) < 0.1 && L.palmNormal.dot(R.palmNormal) < -0.3 && mid.distanceTo(inp.head) < 0.6;
        sign = this.ctx.settings.domainGesture && still && c;
      } else if (L.source === 'controller' && R.source === 'controller') sign = L.btn.stick && R.btn.stick;
      if (this.ctx.settings.domainGesture && inp.ctrlMudra === 'itadori.domain') sign = true;
    }
    if (sign && this.town.state === 'idle' && d.cd <= 0) {
      d.sign += dt;
      if (Math.random() < 0.6) {
        L.pulse?.(0.1 + d.sign * 0.4, 20);
        R.pulse?.(0.1 + d.sign * 0.4, 20);
      }
      this.aura.set('left', 0.2 + (d.sign / 1.5) * 0.8);
      this.aura.set('right', 0.2 + (d.sign / 1.5) * 0.8);
      if (d.sign >= 1.5) {
        d.sign = 0;
        this._castDomain();
      }
    } else d.sign = Math.max(0, d.sign - dt * 2);
  }

  castDomain() {
    if (this.town.state === 'idle' && this.domain.cd <= 0) this._castDomain();
    else this.ctx.ui.callout('영역전개 재사용 대기 중');
  }

  _castDomain() {
    const { input: inp, ui, sfx, world } = this.ctx;
    if (!this.spend(50)) return;
    const center = new THREE.Vector3(inp.head.x, 0, inp.head.z);
    const dir = _v.copy(inp.headDir).setY(0);
    if (dir.lengthSq() < 1e-3) dir.set(0, 0, -1);
    this.town.start(center, dir.normalize());
    this.domain.t = 0;
    this.domain.sure = 1.2;
    world.domain = { center, radius: this.town.radius, freeze: false };
    ui.manga({ main: '領域展開', ruby: 'りょういきてんかい', color: '#ff9a50', big: true });
    sfx.rumble(2, 0.5);
    sfx.play('domain_open', { vol: 0.9 });
    inp.left.pulse?.(1, 400);
    inp.right.pulse?.(1, 400);
  }

  _updateDomain(dt) {
    const { world } = this.ctx;
    const T = this.town;
    const d = this.domain;
    if (T.state !== 'active') return;
    d.t += dt;
    if (d.t >= d.duration) {
      T.stop();
      d.cd = 12;
      world.domain = null;
      return;
    }
    // 필중: 영역 안의 모든 대상에 영혼을 가르는 해가 돌아가며 떨어진다
    d.sure -= dt;
    if (d.sure > 0) return;
    d.sure = 1.4;
    if (this.ctx.world.sureHitBlocked?.()) return; // 영역 싸움(중첩): 필중 효과가 사라진다
    for (const t of world.targets()) {
      if (t.heldBy || this.cuts.has(t)) continue;
      const c = t.center(new THREE.Vector3());
      if (c.distanceTo(T.center) > T.radius) continue;
      const n = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 2).normalize();
      const p = c.add(_v.randomDirection().multiplyScalar(0.12 * (t.scale ?? 1)));
      this._kai(t, p, n, null, { cost: 0, dmg: 90, delay: 0.35 + Math.random() * 0.5, quiet: true });
    }
  }

  cancelDomain() {
    this.vessel?.cancelDomain();
    this.town.cancel();
    this.ctx.world.domain = null;
  }

  /** 지금 펼친 영역 (스쿠나의 손가락을 먹었으면 복마어주자가 겹친다) */
  domainInfo() {
    const T = this.town;
    return T.state === 'active' ? { center: T.center, radius: T.radius } : null;
  }

  handBusy(side) {
    if (side && this.vessel?.holds(side)) return true;
    return this.blood.charge > 0;
  }

  dispose() {
    this.vessel?.dispose();
    this._endBlood();
    this.cancelDomain();
    this.aura.dispose();
    this.cuts.dispose();
    this.orb.dispose();
    this.town.dispose();
    this.ctx.world.domain = null;
  }
}
