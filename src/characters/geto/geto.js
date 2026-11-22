// 게토 스구루 — 「呪霊操術(주령조술)」
//  · 쓰러뜨린 주령은 야구공만 한 주령구가 된다 → 손에 쥐고 입으로 삼키면 내 주령
//  · 왼손바닥을 하늘로 펴면 가진 주령의 주령구가 떠오른다 → 오른손으로 집어 던지면 그곳에서 주령이 나온다
//  · 극번 「渦(소용돌이)」: 저급 주령을 하나로 뭉쳐 쏜다. 오래 모으면 거둔 특급 주령을 녹여 술식을 뽑아낸다
import * as THREE from 'three';
import { cool } from '../../core/cooldown.js';
import { HandAura } from '../../core/handAura.js';
import { preloadChars } from '../../core/rigged.js';
import { DUMMY_TYPES } from '../../core/dummy.js';
import { makeOrb, tickOrb, disposeOrb, makeLabel, setLabel, Portals, makeSpiralSphere } from './vfx.js';
import { CURSES, makeSummon } from './summons.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _fw = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const AURA = { glow: 0x5a2a8a, hot: 0xc8a0ff, inner: 0x08020e, line: 0x000000 };

// 처음부터 가진 주령 (부르는 순서 = 데스크톱 숫자키)
const START = [['centipede', 3], ['bignose', 1], ['worm', 1], ['cyclops', 1], ['kuchisake', 1], ['dragon', 1], ['tamamo', 1]];
const LOW0 = 320; // 저급 주령 (극번 「渦」의 재료)

// 술식 추출: 소용돌이에 녹이면 뽑아낼 수 있는 주령
const EXTRACT = { mahito: '無為転変', jogo: '火山', fingerBearer: '呪力' };

export class Geto {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'geto';
    this.ctrlNative = true; // 컨트롤러: 손 모델은 그리되 조작은 원래 컨트롤러 방식 (소환은 트리거)
    this.name = '게토 스구루';
    this.domainLabel = '극번 「渦」';
    this.reviveText = '쓰러졌다… 주령이 몸을 감싸 일으킨다';
    this.energy = 100;
    this.maxEnergy = 100;
    this.aura = new HandAura(ctx, AURA);
    this.portals = new Portals(ctx.scene);
    this.stock = new Map(START);
    this.low = LOW0;
    this.summons = [];
    this.fxList = []; // 가위 등 잠깐 나오는 효과 (update(dt) → false 면 끝)
    this.pending = [];
    this.free = []; // 쓰러뜨려 생긴 주령구 (아직 삼키지 않음)
    this.flying = []; // 던진 주령구 · 돌아오는 주령구
    this.tray = { open: 0, orbs: new Map(), spin: 0 };
    this._aim = { left: null, right: null };
    this.held = { left: null, right: null }; // 손에 쥔 주령구 { kind: 'stock'|'free', id, orb, ... }
    this.uz = { state: 'idle', t: 0, n: 0, sphere: null, ext: null, tint: new THREE.Color(0x6a3aa0), tick: 0 };
    this.shots = [];
    this.ctrlSel = 0;
    this._keys = {};
    this.cds = {};
    this.time = 0;
    this.firstTaste = true;
    preloadChars(['centipede', 'bignose', 'worm', 'dragon', 'tamamo', 'cyclops', 'kuchisake', 'mahito', 'jogo', 'fingerBearer']);
    // 쓰러뜨린 주령은 부서지지 않고 주령구가 된다
    ctx.world.captureCurse = (d) => {
      const id = CURSES[d.type] ? d.type : null;
      if (!id) return false;
      this._dropOrb(id, d.center(new THREE.Vector3()));
      return true;
    };
  }

  // ───────────────── 공통 도우미 ─────────────────
  flatFwd(out = new THREE.Vector3()) {
    out.copy(this.ctx.input.headDir).setY(0);
    if (out.lengthSq() < 1e-4) out.set(0, 0, -1);
    return out.normalize();
  }

  /** 적: 더미 우선, 없으면 소품 */
  enemies(from, maxD = 20) {
    const W = this.ctx.world;
    const list = [];
    for (const d of W.dummies) if (d.alive && !d.dying && d.center(_v).distanceTo(from) < maxD) list.push([d, _v.distanceTo(from)]);
    for (const x of W.extraTargets) if (x.alive && x.center(_v).distanceTo(from) < maxD) list.push([x, _v.distanceTo(from)]);
    list.sort((a, b) => a[1] - b[1]);
    return list.map((x) => x[0]);
  }

  nearestEnemy(from, maxD = 20) {
    return this.enemies(from, maxD)[0] ?? null;
  }

  /** 바라보는 대상 (없으면 null) */
  gazeTarget() {
    const inp = this.ctx.input;
    let best = null;
    let bs = 0.3;
    for (const t of this.ctx.world.enemies()) {
      if (!t.alive || t.dying) continue;
      const rel = _v.subVectors(t.center(_v2), inp.head);
      const along = rel.dot(inp.headDir);
      if (along < 0.5 || along > 30) continue;
      const s = rel.addScaledVector(inp.headDir, -along).length() / along;
      if (s < bs) {
        bs = s;
        best = t;
      }
    }
    return best;
  }

  /** 바라보는 바닥 지점 (최대 dist) */
  gazePoint(dist = 5, out = new THREE.Vector3()) {
    const inp = this.ctx.input;
    const d = inp.headDir;
    if (d.y < -0.05) {
      const k = Math.min(dist, inp.head.y / -d.y);
      return out.copy(inp.head).addScaledVector(d, k).setY(0);
    }
    return out.copy(inp.head).addScaledVector(this.flatFwd(_v3), dist).setY(0);
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

  stockList() {
    return [...this.stock.entries()].filter(([id]) => CURSES[id]);
  }

  // ───────────────── 소환 ─────────────────
  /** at: 바닥 지점, target: 노릴 대상(없으면 가까운 적) */
  summon(id, at, target = null) {
    const def = CURSES[id];
    if (!def) return false;
    if (!cool(this.ctx, 'summon:' + id, 3, def.label)) return false;
    if ((this.stock.get(id) ?? 0) <= 0) {
      this.denied(`${def.label} — 이미 나가 있다`);
      return false;
    }
    if ((this.cds[id] ?? 0) > 0) return false;
    if (!this.spend(def.cost)) return false;
    target ??= this.nearestEnemy(at, 10) ?? this.gazeTarget();
    const s = makeSummon(this, id, at, target);
    if (!s) return false;
    this.stock.set(id, this.stock.get(id) - 1);
    this.cds[id] = 0.4;
    this.summons.push(s);
    const { ui } = this.ctx;
    const big = { dragon: ['虹龍', 'こうりゅう'], tamamo: ['化身玉藻前', 'けしんたまものまえ'], worm: ['呪霊', '데스웜'], bignose: ['呪霊', '큰코 주령'] }[id];
    if (big) ui.manga({ main: big[0], ruby: big[1], color: '#c8a0ff', side: 'left' });
    this.ctx.input.right.pulse?.(0.5, 40);
    return true;
  }

  /** 소환이 끝난 주령이 주령구로 돌아온다 */
  returnCurse(id, at) {
    const orb = makeOrb(CURSES[id]?.color ?? 0x8888aa, 0.05);
    orb.position.copy(at).setY(Math.max(0.6, at.y));
    this.ctx.scene.add(orb);
    this.flying.push({ kind: 'return', id, orb, vel: new THREE.Vector3(0, 4, 0), t: 0 });
  }

  /** 쓰러뜨린 주령 → 주령구 */
  _dropOrb(id, at) {
    const def = DUMMY_TYPES[id];
    const orb = makeOrb(def?.orb ?? CURSES[id]?.color ?? 0xaaaaaa, 0.055);
    orb.position.copy(at);
    this.ctx.scene.add(orb);
    const label = makeLabel();
    setLabel(label, `${CURSES[id]?.label ?? id} · 주령구`, '#e8dcff');
    orb.add(label);
    label.position.set(0, 0.13, 0);
    label.scale.set(0.2, 0.056, 1);
    this.free.push({ id, orb, label, vel: new THREE.Vector3(0, 1.2, 0), state: 'float', t: 0 });
    const { fx, sfx, ui } = this.ctx;
    fx.implode(at, 30, new THREE.Color(def?.orb ?? 0xffffff), 0.9, 0.45, 0.04);
    fx.starFlare(at, new THREE.Color(def?.orb ?? 0xffffff), 0.6, 0.5);
    sfx.play('shimmer', { at, vol: 0.8, rate: 1.2 });
    ui.callout(`${CURSES[id]?.label ?? id} 조복 — 주령구를 쥐고 삼켜라`, { color: '#d8c8ff', dur: 2.2 });
  }

  // ───────────────── 메인 ─────────────────
  update(dt) {
    const { input: inp, ui } = this.ctx;
    this.time += dt;
    this.energy = Math.min(this.maxEnergy, this.energy + 10 * dt);
    for (const k in this.cds) this.cds[k] -= dt;
    const blocked = ui.menuOpen;
    if (!blocked) {
      this._updateTray(dt);
      this._updateHands(dt);
      this._updateUzumaki(dt);
      this._controller(dt);
      if (inp.mode === 'desktop') this._desktop(dt);
    }
    this._updateFree(dt);
    this._updateFlying(dt);
    this._updateShots(dt);
    this.summons = this.summons.filter((s) => (s.tick ? s.tick(dt) : s.update(dt)));
    this.fxList = this.fxList.filter((f) => f.update(dt));
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        p.fn();
      }
    }
    this.portals.update(dt);
    this.aura.update(dt);
  }

  // ───────────────── 왼손 위의 주령구 (고르기) ─────────────────
  _trayHand() {
    const inp = this.ctx.input;
    const L = inp.left;
    if (!L.active || L.source !== 'hand' || L.uiBlock) return null;
    if (L.palmNormal.y < 0.68 || L.gesture === 'fist') return null;
    if (L.palm.distanceTo(inp.head) > 0.8 || L.palm.y > inp.head.y - 0.1) return null;
    return L;
  }

  _updateTray(dt) {
    const T = this.tray;
    const L = this._trayHand();
    T.open = Math.max(0, Math.min(1, T.open + (L ? dt * 6 : -dt * 6)));
    T.spin += dt * 0.5;
    const list = this.stockList();
    // 없어진 종류 정리
    for (const [id, o] of T.orbs) {
      if (!this.stock.has(id)) {
        disposeOrb(o.orb);
        T.orbs.delete(id);
      }
    }
    if (T.open <= 0) {
      for (const o of T.orbs.values()) o.orb.visible = false;
      return;
    }
    const center = L ? L.palm : this._lastTray ?? this.ctx.input.head;
    if (L) this._lastTray = L.palm.clone();
    const n = list.length;
    const R = n > 7 ? 0.15 : 0.12;
    list.forEach(([id, count], i) => {
      let o = T.orbs.get(id);
      if (!o) {
        const orb = makeOrb(CURSES[id].color, 0.026);
        const label = makeLabel();
        orb.add(label);
        label.position.set(0, 0.05, 0);
        this.ctx.scene.add(orb);
        o = { orb, label };
        T.orbs.set(id, o);
      }
      const a = T.spin + (i / n) * Math.PI * 2;
      const hold = this.held.right?.kind === 'stock' && this.held.right.id === id && this.held.right.fromTray;
      o.orb.visible = !hold;
      o.orb.position.set(center.x + Math.cos(a) * R * T.open, center.y + 0.1 * T.open + Math.sin(this.time * 2 + i) * 0.006, center.z + Math.sin(a) * R * T.open);
      o.orb.scale.setScalar(T.open * (count > 0 ? 1 : 0.6));
      setLabel(o.label, `${CURSES[id].label} ${count}`, count > 0 ? '#ffffff' : 'rgba(255,255,255,0.4)');
      tickOrb(o.orb, this.time, count > 0 ? 1 : 0.15, count > 0 ? 1 : 0.45);
      o.count = count;
    });
  }

  /** 손 근처의 왼손 주령구 */
  _trayOrbNear(p, r = 0.065) {
    if (this.tray.open < 0.8) return null;
    let best = null;
    let bd = r;
    for (const [id, o] of this.tray.orbs) {
      if (!o.orb.visible || !(o.count > 0)) continue;
      const d = o.orb.position.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }

  // ───────────────── 손: 집기 · 던지기 · 삼키기 ─────────────────
  _closed(h) {
    return h.gesture === 'fist' || h.gesture === 'pinch' || h.pinching || (h.source === 'controller' && h.btn.grip);
  }

  /** 손으로 가리킨 쓰러진 주령의 주령구 (10m 안, 겨눈 선에서 25cm·12° 안) */
  _aimFree(h) {
    const o = h.rayPos;
    const d = h.rayDir;
    let best = null;
    let bestS = Infinity;
    for (const f of this.free) {
      if (f.state === 'swallow' || f.state === 'held') continue;
      const to = _v3.subVectors(f.orb.position, o);
      const along = to.dot(d);
      if (along < 0.3 || along > 10) continue;
      const lat = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (lat > Math.max(0.25, along * Math.tan(0.21))) continue;
      const s = lat / along;
      if (s < bestS) {
        bestS = s;
        best = f;
      }
    }
    return best;
  }

  _updateHands(dt) {
    const inp = this.ctx.input;
    // 쥐는 순간엔 손 모양이 바뀌며 겨눈 선이 흔들리므로, 직전 프레임에 겨눈 것을 쓴다
    this._aimPrev = { ...this._aim };
    for (const h of [inp.left, inp.right]) {
      if (!h.active || h.uiBlock) continue;
      const closed = this._closed(h);
      const was = h === inp.left ? this._closedL : this._closedR;
      if (h === inp.left) this._closedL = closed;
      else this._closedR = closed;
      const H = this.held[h.side];
      const grabAt = h.source === 'hand' ? _v.copy(h.palm).lerp(h.indexTip, 0.4) : h.palm;
      // 멀리 있는 주령구 겨누기: 손바닥을 펴고 손끝(컨트롤러는 앞쪽)으로 주령구를 가리키면 빛난다 → 쥐면 날아온다
      const aim = !H && !closed ? this._aimFree(h) : null;
      if (this._aim[h.side] && this._aim[h.side] !== aim) this._aim[h.side].orb.scale.setScalar(1);
      this._aim[h.side] = aim;
      if (aim) aim.orb.scale.setScalar(1.35 + Math.sin(this.time * 14) * 0.15);
      if (!H && closed && !was) {
        // 1) 쓰러뜨린 주령의 주령구 (손 가까이 · 또는 겨눈 것)
        const near = this.free.find((x) => x.state !== 'swallow' && x.state !== 'held' && x.orb.position.distanceTo(grabAt) < 0.13);
        const f = near ?? this._aimPrev?.[h.side];
        if (f && f.state !== 'swallow' && f.state !== 'held') {
          f.state = 'held';
          f.hand = h.side;
          f.orb.scale.setScalar(1);
          this.held[h.side] = { kind: 'free', f, pull: near ? null : { t: 0, from: f.orb.position.clone() } };
          this.ctx.sfx.play('grab', { at: grabAt, vol: 0.5 });
          h.pulse?.(0.4, 30);
          continue;
        }
        // 2) 왼손 위의 주령구 (오른손으로)
        if (h === inp.right) {
          const id = this._trayOrbNear(grabAt);
          if (id) {
            const orb = makeOrb(CURSES[id].color, 0.03);
            this.ctx.scene.add(orb);
            this.held.right = { kind: 'stock', id, orb, fromTray: true };
            this.ctx.sfx.play('grab', { at: grabAt, vol: 0.4, rate: 1.3 });
            h.pulse?.(0.3, 25);
          }
        }
        continue;
      }
      if (!H) continue;
      // 쥔 주령구는 손을 따라온다 (멀리서 끌어온 건 날아와 손에 붙는다)
      const orb = H.kind === 'free' ? H.f.orb : H.orb;
      orb.position.copy(grabAt).addScaledVector(h.palmNormal, h.source === 'hand' ? 0.035 : 0.02);
      if (H.pull) {
        H.pull.t += dt;
        const k = Math.min(1, H.pull.t / 0.3);
        const e = k * k * (3 - 2 * k);
        orb.position.lerpVectors(H.pull.from, orb.position, e);
        if (k >= 1) {
          H.pull = null;
          h.pulse?.(0.5, 40);
          this.ctx.sfx.play('grab', { at: orb.position, vol: 0.5 });
        }
      }
      tickOrb(orb, this.time, 1.3, 1);
      // 입에 가져가면 삼킨다 (거둔 주령구만)
      if (H.kind === 'free') {
        const mouth = this._mouth(_v2);
        if (orb.position.distanceTo(mouth) < 0.15) {
          this._swallow(H.f);
          this.held[h.side] = null;
          continue;
        }
      }
      // 거둔 주령구는 편 손바닥 위에도 얹혀 있다 → 손바닥을 뒤집거나 휙 뿌려야 떨어진다
      const letGo = H.kind === 'free'
        ? (h.source === 'hand' ? (!closed && h.palmNormal.y < -0.45) || h.speed > 3.5 : !closed)
        : !closed && (h.source !== 'hand' || h.gestureTime > 0.05 || h.gesture === 'open');
      if (letGo) {
        this._release(h, H);
        this.held[h.side] = null;
      }
    }
  }

  _mouth(out) {
    const inp = this.ctx.input;
    return out.copy(inp.head).add(_v3.set(0, -0.1, 0).applyQuaternion(inp.headQuat)).addScaledVector(inp.headDir, 0.05);
  }

  _release(h, H) {
    if (H.kind === 'free') {
      // 거둔 주령구를 놓으면 그 자리에 다시 떠 있다
      H.f.state = 'float';
      H.f.vel.copy(h.vel).multiplyScalar(0.5);
      return;
    }
    // 고른 주령구: 던지면 떨어진 곳에서, 그냥 놓으면 바라보는 곳에서 나온다
    const sp = h.speed;
    if (sp > 1.5) {
      const vel = h.vel.clone().multiplyScalar(1.6).addScaledVector(this.ctx.input.headDir, 2).add(_v.set(0, 0.6, 0));
      this.flying.push({ kind: 'throw', id: H.id, orb: H.orb, vel, t: 0 });
      this.ctx.sfx.whoosh(H.orb.position, 0.5, 1.4);
    } else if (this.tray.open > 0.5 && this._lastTray && H.orb.position.distanceTo(this._lastTray) < 0.2) {
      disposeOrb(H.orb); // 왼손 위에 도로 내려놓았다
    } else {
      const t = this.gazeTarget();
      const at = t ? t.center(new THREE.Vector3()).setY(0) : this.gazePoint(4, new THREE.Vector3());
      disposeOrb(H.orb);
      this.summon(H.id, at, t);
    }
  }

  _swallow(f) {
    f.state = 'swallow';
    f.t = 0;
    const { sfx, ui, input } = this.ctx;
    sfx.tone({ type: 'sine', f0: 220, f1: 70, dur: 0.35, vol: 0.35 });
    sfx.play('grab', { at: input.head, vol: 0.6, rate: 0.5 });
    input.left.pulse?.(0.5, 60);
    input.right.pulse?.(0.5, 60);
    const label = CURSES[f.id]?.label ?? f.id;
    this.stock.set(f.id, (this.stock.get(f.id) ?? 0) + 1);
    this.energy = Math.min(this.maxEnergy, this.energy + 25);
    ui.callout(this.firstTaste ? `${label} 흡수 — …토사물을 닦은 걸레 맛` : `${label} 흡수 — 주령조술로 부릴 수 있다`, { color: '#d8c8ff', dur: 2.4 });
    this.firstTaste = false;
  }

  // 쓰러뜨린 주령의 주령구: 둥실 떠 있다가, 손바닥을 향해 당기면 날아온다
  _updateFree(dt) {
    const inp = this.ctx.input;
    for (let i = this.free.length - 1; i >= 0; i--) {
      const f = this.free[i];
      f.t += dt;
      const P = f.orb.position;
      if (f.state === 'float') {
        f.vel.y += (1.25 + Math.sin(f.t * 2) * 0.05 - P.y) * dt * 4;
        f.vel.multiplyScalar(Math.max(0, 1 - dt * 2.5));
        P.addScaledVector(f.vel, dt);
        // 끌어오기: 편 손바닥을 주령구로 향하고 몸 쪽으로 당긴다
        for (const h of [inp.left, inp.right]) {
          if (!h.active || h.uiBlock || this.held[h.side]) continue;
          const to = _v.subVectors(P, h.palm);
          const d = to.length();
          if (d > 9 || d < 0.2) continue;
          to.divideScalar(d);
          const aim = h.source === 'hand' ? (h.gesture === 'open' ? h.palmNormal.dot(to) : -1) : h.dir.dot(to) > 0.97 && h.btn.grip ? 1 : -1;
          const pull = -h.vel.dot(to);
          if (aim > 0.8 && (pull > 1.0 || h.source !== 'hand')) {
            f.state = 'fly';
            f.hand = h.side;
            this.ctx.sfx.whoosh(P, 0.4, 1.6);
            break;
          }
        }
      } else if (f.state === 'fly') {
        const h = inp[f.hand];
        const d = _v.subVectors(h.palm, P);
        const L = d.length();
        P.addScaledVector(d, Math.min(1, (dt * 9) / Math.max(L, 1e-3)));
        if (L < 0.08) {
          f.state = 'held';
          this.held[f.hand] = { kind: 'free', f };
          h.pulse?.(0.4, 30);
        }
      } else if (f.state === 'swallow') {
        const m = this._mouth(_v);
        P.lerp(m, Math.min(1, dt * 14));
        f.orb.scale.setScalar(Math.max(0.01, 1 - f.t / 0.25));
        if (f.t > 0.25) {
          disposeOrb(f.orb);
          f.label.material.map.dispose();
          f.label.material.dispose();
          this.free.splice(i, 1);
          continue;
        }
      }
      tickOrb(f.orb, this.time, 1, 1);
      f.label.visible = f.state === 'float';
    }
  }

  _updateFlying(dt) {
    const { fx, sfx, input: inp } = this.ctx;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const o = this.flying[i];
      o.t += dt;
      const P = o.orb.position;
      tickOrb(o.orb, this.time, 1.2, 1);
      if (o.kind === 'throw') {
        o.vel.y -= 5 * dt;
        P.addScaledVector(o.vel, dt);
        fx.spawn(P, _v.set(0, 0, 0), new THREE.Color(CURSES[o.id].color), 0.04, 0.25, 0, 0);
        let hit = null;
        for (const t of this.ctx.world.enemies()) {
          if (t.alive && !t.dying && t.center(_v).distanceTo(P) < (t.kind === 'dummy' ? 0.55 * (t.scale ?? 1) : (t.radius ?? 0.3) + 0.15)) {
            hit = t;
            break;
          }
        }
        if (hit || P.y <= 0.03 || o.t > 1.6) {
          const at = hit ? hit.center(new THREE.Vector3()).setY(0) : P.clone().setY(0);
          fx.burst(P, 16, new THREE.Color(CURSES[o.id].color), 2, 0.04, 0.35);
          sfx.play('shatter', { at: P, vol: 0.4, rate: 1.6 });
          disposeOrb(o.orb);
          this.flying.splice(i, 1);
          this.summon(o.id, at, hit ?? this.nearestEnemy(at, 6));
        }
      } else if (o.kind === 'return') {
        // 게토의 가슴으로 돌아온다
        const to = _v.copy(inp.head).add(_v2.set(0, -0.4, 0));
        const d = _v2.subVectors(to, P);
        const L = d.length();
        o.vel.lerp(d.normalize().multiplyScalar(Math.min(12, 3 + o.t * 14)), Math.min(1, dt * 4));
        P.addScaledVector(o.vel, dt);
        if (L < 0.25 || o.t > 3) {
          disposeOrb(o.orb);
          this.flying.splice(i, 1);
          this.stock.set(o.id, (this.stock.get(o.id) ?? 0) + 1);
          sfx.play('shimmer', { at: to, vol: 0.25, rate: 1.8 });
        }
      }
    }
  }

  // ───────────────── 극번 「渦」 ─────────────────
  _uzHands() {
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    if (!L.active || !R.active || L.uiBlock || R.uiBlock) return null;
    if (this.held.left || this.held.right) return null;
    const d = L.palm.distanceTo(R.palm);
    const mid = _v.addVectors(L.palm, R.palm).multiplyScalar(0.5);
    const front = _v2.subVectors(mid, inp.head).dot(inp.headDir);
    if (L.source === 'hand' && R.source === 'hand') {
      if (L.gesture === 'fist' || R.gesture === 'fist') return null;
      // 왼손바닥을 펴서 주령구를 꺼내 놓고 오른손으로 고르는 중이면 소용돌이가 아니다
      //  (왼손바닥은 위, 오른손바닥은 아래를 보며 위아래로 겹쳐 → 마주 보는 것으로 잘못 잡혔다)
      if (this.tray.open > 0.05 || this._trayHand() || this.held.right || this.held.left) return null;
      const lr = _v3.subVectors(R.palm, L.palm).normalize();
      // 두 손이 옆으로 나란히 (위아래로 겹친 건 제외)
      if (Math.abs(lr.y) > 0.35) return null;
      // 두 손바닥이 확실히 마주 본다 (공을 감싸 쥐듯) — 그냥 손을 앞에 둔 정도로는 잡히지 않게 엄격하게
      //  손끝은 서로를 찌르지 않고 앞·위를 향하고, 손은 거의 멈춰 있으며, 가슴 앞 충분히 앞쪽
      const fw = _fw.copy(inp.headDir).setY(0).normalize();
      const tipsOk = (H) => H.fingersDir.dot(fw) + Math.max(0, H.fingersDir.y) > 0.45;
      if (d > 0.12 && d < 0.42 && L.palmNormal.dot(lr) > 0.7 && R.palmNormal.dot(lr) < -0.7 && front > 0.2 && mid.y > inp.head.y - 0.65 && mid.y < inp.head.y + 0.05 &&
        tipsOk(L) && tipsOk(R) && L.speed < 0.6 && R.speed < 0.6 && L.gesture !== 'point' && R.gesture !== 'point' && L.gesture !== 'pinch' && R.gesture !== 'pinch') return { mid: mid.clone(), d };
      return null;
    }
    if (L.source === 'controller' && R.source === 'controller' && L.btn.grip && R.btn.grip && !L.btn.trigger && !R.btn.trigger && d > 0.1 && d < 0.45 && front > 0.2) return { mid: mid.clone(), d };
    return null;
  }

  _updateUzumaki(dt) {
    const U = this.uz;
    const inp = this.ctx.input;
    const { fx, sfx, ui } = this.ctx;
    const desk = inp.mode === 'desktop' && inp.keyDown('KeyQ');
    const hands = desk ? { mid: _v.copy(inp.head).addScaledVector(inp.headDir, 0.5).add(_v2.set(0, -0.15, 0)).clone(), d: 0.3 } : this._uzHands();
    if (U.state === 'idle') {
      if (hands && this.low > 0) {
        U.hold = (U.hold ?? 0) + dt;
        if (U.hold > (desk ? 0.3 : 0.7) && cool(this.ctx, 'uzumaki', 12, '극번「渦」')) {
          U.state = 'charge';
          U.byKey = desk;
          U.t = 0;
          U.n = 0;
          U.ext = null;
          U.tint.set(0x6a3aa0);
          U.sphere = makeSpiralSphere();
          this.ctx.scene.add(U.sphere);
          U.loop = sfx.loop?.({ sample: 'purple', vol: 0.2 });
          sfx.play('charge_rise', { at: hands.mid, vol: 0.6, rate: 0.6 });
        }
      } else U.hold = 0;
      return;
    }
    if (U.state !== 'charge') return;
    U.t += dt;
    const mid = hands ? hands.mid : U.lastMid ?? inp.head;
    if (hands) U.lastMid = mid.clone();
    // 저급 주령을 끌어모은다
    U.tick -= dt;
    if (U.tick <= 0 && this.low > 0) {
      U.tick = 0.08;
      const take = Math.min(this.low, Math.max(2, Math.ceil(this.low * 0.025)));
      this.low -= take;
      U.n += take;
      fx.implode(mid, 6, new THREE.Color(0x1a0a24), 0.9 + Math.random() * 0.6, 0.35, 0.05);
      fx.burst(mid, 2, U.tint, 0.5, 0.03, 0.3);
    }
    // 오래 모으면 거둔 특급 주령을 녹여 술식을 뽑는다
    if (!U.ext && U.t > 2.2) {
      const id = Object.keys(EXTRACT).find((k) => (this.stock.get(k) ?? 0) > 0);
      if (id) {
        this.stock.set(id, this.stock.get(id) - 1);
        U.ext = id;
        U.tint.set(CURSES[id].color);
        ui.callout(`술식 추출 — ${CURSES[id].label} 「${EXTRACT[id]}」`, { color: '#ffd28a', dur: 2 });
        sfx.play('void_open', { at: mid, vol: 0.6, rate: 1.3 });
        fx.starFlare(mid, U.tint, 0.8, 0.5);
      }
    }
    const power = Math.min(1, U.n / 220) + (U.ext ? 0.5 : 0);
    const r = 0.05 + 0.13 * Math.sqrt(Math.min(1.6, U.n / 120));
    U.sphere.position.copy(mid);
    U.sphere.scale.setScalar(r);
    U.sphere.userData.mat.uniforms.uTime.value += dt;
    U.sphere.userData.mat.uniforms.uPower.value = power;
    U.sphere.userData.mat.uniforms.uTint.value.copy(U.tint);
    U.sphere.userData.glow.scale.setScalar(4 + power * 2);
    U.loop?.set?.(0.5 + power, 0.7 + power * 0.6);
    this.aura.set('left', 0.3 + power * 0.6);
    this.aura.set('right', 0.3 + power * 0.6);
    if (Math.random() < 0.5) inp.left.pulse?.(0.1 + power * 0.3, 15);
    if (Math.random() < 0.5) inp.right.pulse?.(0.1 + power * 0.3, 15);
    // 발사: 두 손을 앞으로 민다 (데스크톱: Q 떼기)
    const push = (inp.left.vel.dot(inp.headDir) + inp.right.vel.dot(inp.headDir)) / 2;
    const fire = desk ? false : hands ? push > 1.4 && U.t > 0.4 : false;
    const deskRelease = U.byKey && !inp.keyDown('KeyQ');
    if (fire || (deskRelease && U.t > 0.3) || (!hands && !desk && U.t > 0.4 && push > 0.9)) this._fireUzumaki(mid);
    else if (!hands && !desk && !U.byKey) {
      // 손을 풀었다: 모은 주령을 도로 흩는다
      U.lostT = (U.lostT ?? 0) + dt;
      if (U.lostT > 0.35) {
        this.low += U.n;
        if (U.ext) this.stock.set(U.ext, (this.stock.get(U.ext) ?? 0) + 1);
        this._endUz();
        ui.callout('소용돌이를 풀었다', { color: '#c0b0d8' });
      }
    } else U.lostT = 0;
  }

  _endUz() {
    const U = this.uz;
    if (U.sphere) {
      this.ctx.scene.remove(U.sphere);
      U.sphere.userData.mat.dispose();
      U.sphere.userData.glow.material.dispose();
    }
    U.loop?.stop?.();
    U.loop = null;
    U.sphere = null;
    U.state = 'idle';
    U.hold = 0;
    U.lostT = 0;
  }

  _fireUzumaki(from) {
    const U = this.uz;
    const { ui, sfx, input: inp } = this.ctx;
    const n = U.n;
    const mul = U.ext ? 1.8 : 1;
    const shot = {
      sphere: U.sphere, pos: from.clone(), dir: inp.headDir.clone(), n, ext: U.ext, tint: U.tint.clone(),
      dmg: Math.min(420, 45 + n * 1.5) * mul, R: Math.min(7.5, 1.8 + n * 0.02) * (U.ext ? 1.3 : 1), t: 0, hit: new Set(), r0: U.sphere.scale.x,
    };
    U.sphere = null;
    this.shots.push(shot);
    ui.manga({ main: '極ノ番「うずまき」', ruby: '극번 「소용돌이」', color: '#b080ff', big: true, sub: `저급 주령 ${n}마리${U.ext ? ` · ${CURSES[U.ext].label}` : ''}` });
    sfx.play('purple_launch', { at: from, vol: 0.9, rate: 0.7 });
    sfx.rumble(1.2, 0.5);
    inp.left.pulse?.(1, 120);
    inp.right.pulse?.(1, 120);
    this._endUz();
  }

  _updateShots(dt) {
    const { fx, sfx, world } = this.ctx;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      const sp = 16;
      s.pos.addScaledVector(s.dir, sp * dt);
      const r = s.r0 * (1 + s.t * 3);
      s.sphere.position.copy(s.pos);
      s.sphere.scale.setScalar(Math.min(1.2, r));
      s.sphere.userData.mat.uniforms.uTime.value += dt * 1.5;
      // 나선 꼬리
      for (let k = 0; k < 3; k++) {
        const a = s.t * 18 + k * 2.1;
        const side = _v.set(Math.cos(a), Math.sin(a), 0).multiplyScalar(r * 1.2);
        side.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_v2.set(0, 0, 1), s.dir));
        fx.spawnDark(_v2.copy(s.pos).add(side), _v3.copy(s.dir).multiplyScalar(-2), new THREE.Color(0x120818), 0.12, 0.5, 1, 0);
        fx.spawn(_v2, _v3.set(0, 0, 0), s.tint, 0.05, 0.3, 0, 0);
      }
      // 지나가는 길: 스치는 것도 갈린다
      let boom = s.pos.y < 0.1 || s.t > 2.2;
      for (const t of world.targets()) {
        if (!t.alive || s.hit.has(t)) continue;
        const c = t.center(_v);
        const rr = (t.kind === 'dummy' ? 0.45 * (t.scale ?? 1) : t.radius ?? 0.3) + Math.min(1.2, r);
        if (c.distanceTo(s.pos) < rr) {
          s.hit.add(t);
          t.damage(s.dmg * 0.35, { type: 'impact' });
          boom = true;
        }
      }
      if (boom) {
        this._explode(s);
        this.ctx.scene.remove(s.sphere);
        s.sphere.userData.mat.dispose();
        s.sphere.userData.glow.material.dispose();
        this.shots.splice(i, 1);
      }
    }
    void sfx;
  }

  _explode(s) {
    const { fx, sfx, world, game } = this.ctx;
    const p = s.pos;
    fx.sphereBlast(p, 0x14081c, s.R, 0.6, { dark: true, opacity: 0.85 });
    fx.sphereBlast(p, s.tint, s.R * 0.8, 0.45, { opacity: 0.6 });
    fx.shockwave(_v.copy(p).setY(0.06), 0x3a1a5a, s.R * 1.6, 0.7, { opacity: 0.7 });
    fx.burst(p, 90, new THREE.Color(0x1a0a24), 9, 0.1, 1.0, { dark: true, spread: s.R * 0.3 });
    fx.burst(p, 50, s.tint, 7, 0.06, 0.7);
    fx.flash(p, s.tint, 12, 0.5, 30);
    sfx.explosion(p, 1.6);
    sfx.play('explosion_2', { at: p, vol: 1, rate: 0.6 });
    sfx.rumble(1.4, 0.7);
    game.hitstop = Math.max(game.hitstop, 0.08);
    world.forEachTarget(p, s.R, (t, d, c) => {
      const k = 1 - Math.min(0.8, d / (s.R * 1.2));
      const push = _v2.subVectors(c, p).normalize().multiplyScalar(14 * k).add(_v3.set(0, 6 * k, 0));
      t.damage(s.dmg * k, { type: s.ext === 'jogo' ? 'fire' : 'impact', burn: s.ext === 'jogo', dir: push.clone().normalize() });
      if (t.alive) t.impulse?.(push, 6);
    });
    // 술식 추출의 덤
    if (s.ext === 'jogo') for (let i = 0; i < 6; i++) fx.fire.explosion?.(_v.copy(p).add(_v2.randomDirection().multiplyScalar(s.R * 0.5)), 1.4);
  }

  // ───────────────── 컨트롤러 / 데스크톱 ─────────────────
  _controller(dt) {
    const { input: inp, ui } = this.ctx;
    const L = inp.left;
    const R = inp.right;
    const list = this.stockList();
    if (!list.length) return;
    if (L.source === 'controller' && L.active && !L.uiBlock && L.pressed('trigger')) {
      this.ctrlSel = (this.ctrlSel + 1) % list.length;
      const [id, n] = list[this.ctrlSel];
      ui.callout(`${CURSES[id].label} (${n})`, { color: '#d8c8ff', size: 46, dur: 0.8 });
      L.pulse?.(0.3, 30);
    }
    if (R.source === 'controller' && R.active && !R.uiBlock && R.pressed('trigger') && !this.held.right) {
      const [id] = list[this.ctrlSel % list.length];
      const t = this.gazeTarget();
      this.summon(id, t ? t.center(new THREE.Vector3()).setY(0) : this.gazePoint(4, new THREE.Vector3()), t);
    }
    void dt;
  }

  _desktop(dt) {
    const inp = this.ctx.input;
    const list = this.stockList();
    for (let i = 0; i < 9; i++) {
      const code = 'Digit' + (i + 1);
      const down = inp.keyDown(code);
      if (down && !this._keys[code] && list[i]) {
        const t = this.gazeTarget();
        this.summon(list[i][0], t ? t.center(new THREE.Vector3()).setY(0) : this.gazePoint(4, new THREE.Vector3()), t);
      }
      this._keys[code] = down;
    }
    // E: 가장 가까운 주령구를 끌어와 삼킨다
    const e = inp.keyDown('KeyE');
    if (e && !this._keys.E) {
      const f = this.free.filter((x) => x.state === 'float').sort((a, b) => a.orb.position.distanceTo(inp.head) - b.orb.position.distanceTo(inp.head))[0];
      if (f) {
        f.state = 'fly';
        f.hand = 'right';
        this._deskSwallow = f;
      }
    }
    this._keys.E = e;
    if (this._deskSwallow && this._deskSwallow.state === 'held') {
      this.held.right = null;
      this._swallow(this._deskSwallow);
      this._deskSwallow = null;
    }
    void dt;
  }

  castDomain() {
    // 메뉴의 "발동": 지금 가진 저급 주령의 절반으로 바로 쏜다
    if (this.uz.state !== 'idle' || this.low <= 0) return;
    const inp = this.ctx.input;
    const U = this.uz;
    U.sphere = makeSpiralSphere();
    U.sphere.scale.setScalar(0.25);
    this.ctx.scene.add(U.sphere);
    const take = Math.ceil(this.low / 2);
    this.low -= take;
    U.n = take;
    U.ext = null;
    U.tint.set(0x6a3aa0);
    this._fireUzumaki(_v.copy(inp.head).addScaledVector(inp.headDir, 0.6).clone());
  }

  cancelDomain() {}

  // ───────────────── 안내 · HUD ─────────────────
  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '주령구 꺼내기 · 부르기', demo: 'geto.tray', color: '#c8a0ff', text: '왼손바닥을 하늘로 펴서 가슴 앞에 → 가진 주령의 주령구가 떠오른다\n오른손으로 하나를 쥐고 던지기 → 떨어진 곳·맞힌 대상에서 주령이 나온다 (그냥 놓으면 바라보는 곳)' },
        { head: '주령 흡수', demo: 'geto.absorb', color: '#ffd28a', text: '쓰러뜨린 주령은 주령구가 된다 → 손으로 쥐거나, 편 손바닥을 향하고 몸 쪽으로 당겨 끌어오기\n멀리 있으면: 편 손의 손끝(컨트롤러는 컨트롤러 앞쪽 = 레이저 방향)으로 주령구를 가리켜 커지며 깜빡이면 쥐기 → 손으로 날아온다\n쥔 주령구를 입에 가져가면 삼킨다 → 다음부터 부를 수 있다 (주력 회복)' },
        { head: '극번 「渦」 소용돌이', demo: 'geto.uzumaki', color: '#b080ff', text: '두 손바닥을 마주 보게 (공을 감싸 쥐듯) → 저급 주령이 모여 검은 구가 커진다\n두 손을 앞으로 밀면 발사 · 2초 넘게 모으면 거둔 특급 주령을 녹여 술식 추출 · 손을 풀면 취소' },
        { head: '체술', demo: 'itadori.punch', color: '#ffffff', text: '주먹으로 치기 · 물체 집기 (게토는 체술도 1급 이상 · 적은 붙잡지 못한다)' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴' },
        { head: '주령 부르기', color: '#c8a0ff', text: '숫자 키 (조준한 대상을 노린다)\n1 지네 · 2 큰코 · 3 데스웜 · 4 효수 · 5 쿠치사케온나 · 6 홍룡 · 7 타마모노마에 · 8~9 거둔 주령' },
        { head: '주령 흡수', color: '#ffd28a', text: 'E: 가장 가까운 주령구를 끌어와 삼키기' },
        { head: '극번 「渦」', color: '#b080ff', text: 'Q 누르고 있기(모으기) → 떼면 발사' },
        { head: '주먹 · 잡기', color: '#ffd0d0', text: 'V 주먹 · T 물체 집기 → 다시 T 던지기' },
      ];
    }
    return [
      { head: '주령 고르기 · 부르기', color: '#c8a0ff', text: '왼쪽 트리거: 고르기 · 오른쪽 트리거: 부르기 (바라본 대상)' },
      { head: '흡수', color: '#ffd28a', text: '주령구를 그립으로 쥐어 입으로 · 컨트롤러 앞쪽(레이저 방향)으로 주령구를 가리켜 커지며 깜빡이면 그립 → 끌어오기' },
      { head: '극번 「渦」', color: '#b080ff', text: '두 그립을 쥐고 두 손을 모은다 → 앞으로 밀어 발사' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const out = this.summons.length;
    const total = [...this.stock.values()].reduce((a, b) => a + b, 0);
    const rows = [
      { label: '주력', bar: this.energy / this.maxEnergy, color: '#b08aff' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff9fa0' },
      { label: '주령', text: `${total}마리 대기 · ${out} 출격` },
      { label: '저급 주령', text: `${this.low}` },
      { label: '처치', text: `${w.kills}` },
    ];
    if (this.uz.state === 'charge') rows.splice(3, 0, { label: '소용돌이', text: `${this.uz.n}마리${this.uz.ext ? ' + ' + CURSES[this.uz.ext].label : ''}`, color: '#c8a0ff' });
    if (this.ctx.input.hands.some((h) => h.source === 'controller')) {
      const list = this.stockList();
      const s = list[this.ctrlSel % Math.max(1, list.length)];
      if (s) rows.splice(2, 0, { label: '선택', text: `${CURSES[s[0]].label} ${s[1]}`, color: '#d8c8ff' });
    }
    return rows;
  }

  dispose() {
    const W = this.ctx.world;
    W.captureCurse = null;
    this._endUz();
    for (const s of this.summons) {
      if (s.tick) {
        s.alive = false;
        this.ctx.scene.remove(s.root);
        s._dispose?.();
        s.portal?.close?.();
      } else {
        s.alive = false;
        s.dispose?.();
      }
    }
    this.summons = [];
    for (const f of this.fxList) f.dispose?.();
    for (const f of this.free) disposeOrb(f.orb);
    for (const o of this.flying) disposeOrb(o.orb);
    for (const o of this.tray.orbs.values()) disposeOrb(o.orb);
    for (const H of Object.values(this.held)) if (H?.orb) disposeOrb(H.orb);
    for (const s of this.shots) this.ctx.scene.remove(s.sphere);
    this.portals.clear();
    this.aura.dispose?.();
  }
}
