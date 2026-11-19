// 후시구로 메구미 — 생득술식 「十種影法術(십종영법술)」
// 손으로 그림자놀이처럼 식신의 모양을 맺으면, 바닥의 그림자에서 식신이 솟아오른다.
//  · 玉犬(옥견) 白·黒 · 鵺(누에) · 蝦蟇(가마) · 大蛇(오로치) · 満象(만상) · 脱兎(탈토)
//  · 八握剣 異戒神将 魔虚羅(마허라): 조복되지 않은 최강의 식신. 상대가 없으면 술사도 노린다
//  · 영역전개 「嵌合暗翳庭(감합암예정)」: 바닥 전체가 그림자 바다 → 식신 무제한, 그림자 송곳
import * as THREE from 'three';
import { HandAura } from '../../core/handAura.js';
import { ShadowPools, ShadowSpikes, ChimeraShadowGarden, shadowSplash } from './vfx.js';
import { DivineDog, DogTotality, Nue, Toad, Orochi, MaxElephant, RabbitEscape, Mahoraga, MahoragaWheel, PiercingOx } from './shikigami.js';
import { SlashLines } from '../sukuna/vfx.js';
import { preloadShikigami } from './models.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const SHADOW_AURA = { glow: 0x2a3c80, hot: 0x9fb0e0, inner: 0x010104, line: 0x000000 };

export const SIGNS = {
  dogs: { label: '옥견', kanji: '玉犬', ruby: 'ぎょくけん', cost: 15, cd: 1.5, hold: 0.35 },
  nue: { label: '누에', kanji: '鵺', ruby: 'ぬえ', cost: 18, cd: 1.5, hold: 0.35 },
  toad: { label: '가마', kanji: '蝦蟇', ruby: 'がま', cost: 12, cd: 1.2, hold: 0.3 },
  orochi: { label: '오로치', kanji: '大蛇', ruby: 'おろち', cost: 25, cd: 2.5, hold: 0.4 },
  elephant: { label: '만상', kanji: '満象', ruby: 'ばんしょう', cost: 30, cd: 3, hold: 0.2 },
  rabbits: { label: '탈토', kanji: '脱兎', ruby: 'だっと', cost: 15, cd: 2, hold: 0.4 },
  ox: { label: '관우', kanji: '貫牛', ruby: 'かんぎゅう', cost: 22, cd: 2.5, hold: 0.35 },
  mahoraga: { label: '마허라', kanji: '魔虚羅', ruby: 'まこら', cost: 60, cd: 30, hold: 1.0, top: '布瑠部由良由良' },
};
const ORDER = ['dogs', 'nue', 'toad', 'orochi', 'elephant', 'rabbits', 'ox', 'mahoraga'];

export class Megumi {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'megumi';
    this.name = '후시구로 메구미';
    this.domainLabel = '영역전개';
    this.reviveText = '쓰러졌다… 그림자 속에서 다시 일어선다';
    this.energy = 100;
    this.maxEnergy = 100;
    this.aura = new HandAura(ctx, SHADOW_AURA);
    this.pools = new ShadowPools(ctx.scene);
    this.spikes = new ShadowSpikes(ctx.scene);
    this.garden = new ChimeraShadowGarden(ctx);
    this.list = []; // 지금 나와 있는 식신
    this.cds = {};
    this.sign = { id: null, t: 0, lock: null };
    this.elephant = { armed: 0 };
    this.domain = { sign: 0, cd: 0, t: 0, duration: 20, spikeT: 0 };
    this.pending = [];
    this.ctrlSel = 0;
    this._keys = {};
    // 식신 모델은 메구미를 골랐을 때만 받는다 (받기 전엔 코드로 만든 모델로 대신)
    preloadShikigami();
    this.lost = new Set(); // 파괴된 식신 (다시 부를 수 없다)
    this.tenShadowsBroken = false; // 조복한 마허라가 파괴되면 십종영법술이 기능을 잃는다
    this.wheel = null; // 법진만 소환
    this.slashes = new SlashLines(ctx.scene, 60); // 옥견 혼의 발톱 자국
    const W = ctx.world;
    // 탈토가 나와 있으면 더미들은 토끼를 노리고, 가까이서 싸우는 식신이 있으면 그 식신을 친다
    W.decoy = (d) => {
      const r = this.list.find((s) => s instanceof RabbitEscape && s.state === 'act');
      if (r) return r.decoyFor(d);
      let best = null;
      let bd = 2.6;
      for (const s of this.list) {
        if (!s.hittable || s instanceof Nue) continue;
        const dd = s.hitDist(d.root.position) + s.hitR;
        if (dd < bd) {
          bd = dd;
          best = s;
        }
      }
      return best ? best.aimPoint(_v3) : null;
    };
    W.absorbMelee = (d, fist, dmg) => {
      for (const s of this.list) {
        if (s.hittable && s.hitDist(fist) < 0.3) {
          s.hurt(dmg * 0.6, { type: 'punch', src: d, at: fist.clone() });
          return true;
        }
      }
      return false;
    };
    W.absorbBullet = (b) => {
      for (const s of this.list) {
        if (s.hittable && s.hitDist(b.pos) < 0.05) {
          s.hurt(6, { type: 'bullet', src: b.src, at: b.pos.clone() });
          return true;
        }
      }
      return false;
    };
    // 법진: 술사가 받는 공격에 적응한다
    W.playerDamageMul = (type, info) => (this.wheel?.alive ? this.wheel.onPlayerHit(type, info) : 1);
  }

  /** 식신이 파괴됐다: 옥견은 남은 쪽이 힘을 이어받아 옥견·혼이 되고, 나머지는 다시 부를 수 없다 */
  onShikiBroken(s) {
    const { ui, settings, game } = this.ctx;
    if (s instanceof DivineDog) {
      settings.dogTotality = true;
      game?.saveSettings?.();
      ui.callout(`${s.name} 파괴 — 남은 옥견이 힘을 이어받는다 (다음 옥견 수인: 玉犬・渾)`, { color: '#c0c8ff', dur: 3 });
      return;
    }
    const id = s instanceof DogTotality ? 'dogs' : s instanceof Nue ? 'nue' : s instanceof Toad ? 'toad' : s instanceof PiercingOx ? 'ox' : null;
    if (id) {
      this.lost.add(id);
      ui.callout(`${s.name} 파괴 — 다시 부를 수 없다`, { color: '#ff9a9a', dur: 2.5 });
    }
  }

  get domainActive() {
    return this.garden.state !== 'idle' && this.garden.state !== 'closing';
  }

  spend(x) {
    if (this.domainActive) return true; // 영역 안에서는 식신을 마음껏
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
        { head: '玉犬 옥견 · 鵺 누에', demo: ['megumi.dogs', 'megumi.nue'], color: '#a8b8ff', text: '옥견: 한 손 손날을 아래로 세워 네 손가락을 앞으로 곧게, 엄지만 위로 (개 머리와 귀)\n누에: 두 손바닥을 내 쪽으로 해 손목을 X자로 겹치고 손가락을 날개처럼 펴기 (엄지를 걸어도 OK)' },
        { head: '蝦蟇 가마 · 脱兎 탈토', demo: ['megumi.toad', 'megumi.rabbits'], color: '#a8b8ff', text: '가마: 두 손 검지 끝끼리, 엄지 끝끼리 맞대 마름모 (두꺼비 얼굴) → 혀로 끌어온다\n탈토: 한 손 검지·중지를 얼굴 옆에서 토끼 귀처럼 세우기 → 더미가 토끼를 쫓는다' },
        { head: '大蛇 오로치 · 満象 만상', demo: ['megumi.orochi', 'megumi.elephant'], color: '#a8b8ff', text: '오로치: 손등을 위로, 네 손가락을 모아 앞으로 내밀고 엄지를 그 밑에 붙이기 (뱀 머리)\n만상: 손등을 위로 하고 검지·중지를 아래로 늘어뜨리기 (코끼리 코)' },
        { head: '貫牛 관우', demo: 'megumi.ox', color: '#a8b8ff', text: '한 손 검지를 뿔처럼 세우고 다른 손을 그 아래에 받치기\n바라본 쪽으로 곧게 돌진. 달릴수록 빨라지고 세진다' },
        { head: '魔虚羅 마허라', demo: 'megumi.mahoraga', color: '#ffd28a', text: '두 주먹을 가슴 앞에서 맞대고 1초 — 布瑠部由良由良 · 맞은 성질에 적응하면 법진이 돌며 완전 재생\n조복 전: 상대가 없으면 술사를 노린다 → 적응 전에 한 방에 쓰러뜨리면 조복 · 조복 후: 법진만 먼저 → 한 번 더 맺으면 이어받아 등장' },
        { head: '영역전개 「嵌合暗翳庭」', demo: 'megumi.domain', color: '#6f86ff', text: '가슴 앞에서 두 손을 맞잡아 깍지 끼고 1.2초 (수인표)\n식신 소모 없음 · 그림자 송곳 · 식신이 사라지지 않음 · 메뉴에서도 발동' },
        { head: '공통', demo: 'common.grab', color: '#ffffff', text: '같은 수인을 다시 맺으면 그 식신을 그림자로 돌려보낸다 · 주먹으로 치기(흑섬) · 잡기' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴 · R 더미 소환' },
        { head: '식신', color: '#a8b8ff', text: '1 옥견 · 2 누에 · 3 가마 · 4 오로치 · 5 만상 · 6 탈토 · 7 관우 · 8 마허라\n(다시 누르면 돌려보내기 · 조준한 대상을 노린다)' },
        { head: '영역 / 주먹', color: '#6f86ff', text: 'Q 1.2초: 嵌合暗翳庭 · V 주먹' },
      ];
    }
    return [
      { head: '식신 고르기 · 부르기', color: '#a8b8ff', text: '왼쪽 트리거: 식신 고르기 · 오른쪽 트리거: 부르기 (바라본 대상을 노린다)\n다시 부르면 돌려보내기' },
      { head: '영역전개 「嵌合暗翳庭」', color: '#6f86ff', text: '양쪽 스틱을 눌러 1.2초 (메뉴에서도 발동)' },
      { head: '버튼', color: '#ffd0d0', text: '그립 쥐고 휘둘러 치기 → 흑섬 · B 더미 소환 · Y 메뉴' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const d = this.domain;
    let dom = '준비';
    if (this.garden.state === 'active') dom = `전개 중 ${Math.max(0, Math.ceil(d.duration - d.t))}s`;
    else if (this.garden.state !== 'idle') dom = '전개 중';
    else if (d.cd > 0) dom = `재사용 ${Math.ceil(d.cd)}s`;
    const names = [...new Set(this.list.filter((s) => s.state !== 'sink').map((s) => s.name.replace(/ [白黒]$/, '')))];
    const rows = [
      { label: '주력', bar: this.energy / this.maxEnergy, color: '#8aa0ff' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff9fa0' },
      { label: '식신', text: names.length ? names.join(' · ') : '—' },
      { label: '영역', text: dom },
      { label: '처치', text: `${w.kills}` },
    ];
    // 마허라 / 법진: 체력과 지금까지의 적응
    const m = this.list.find((s) => s instanceof Mahoraga && s.state !== 'sink');
    const ad = m?.ad ?? (this.wheel?.alive ? this.wheel.ad : null);
    if (m) rows.push({ label: m.tamed ? '마허라' : '마허라 (조복 의식)', bar: m.hp / m.maxHp, color: '#ffd28a' });
    if (ad) rows.push({ label: m ? '적응' : '법진 적응', text: (ad.summary() || '—') + (ad.spin ? ' · 무한회전' : ''), color: '#ffe0a0' });
    if (this.ctx.input.hands.some((h) => h.source === 'controller')) rows.splice(3, 0, { label: '선택', text: SIGNS[ORDER[this.ctrlSel]].label, color: '#c0ccff' });
    return rows;
  }

  // ───────────────── 메인 ─────────────────
  update(dt) {
    const { input: inp } = this.ctx;
    const blocked = this.ctx.ui.menuOpen;
    this.energy = Math.min(this.maxEnergy, this.energy + 12 * dt);
    for (const k in this.cds) this.cds[k] -= dt;
    this.domain.cd = Math.max(0, this.domain.cd - dt);
    if (!blocked) {
      if (inp.left.source === 'hand' || inp.right.source === 'hand') this._updateSigns(dt);
      this._controller(dt);
      if (inp.mode === 'desktop') this._desktop(dt);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (!s.alive || !s.update(dt)) this.list.splice(i, 1);
    }
    if (this.wheel && !this.wheel.update(dt)) this.wheel = null;
    this.slashes.update(dt, inp.head);
    this._updateDomain(dt);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        p.fn();
      }
    }
    this.pools.update(dt);
    this.spikes.update(dt);
    this.garden.update(dt);
    this.aura.update(dt);
  }

  // ───────────────── 수인 판정 (핸드트래킹) ─────────────────
  _thumbs(L, R) {
    if (!L.joints || !R.joints) return 1;
    return L.joints['thumb-tip'].distanceTo(R.joints['thumb-tip']); // 두 손 모두 리그 공간 → 거리는 그대로
  }

  _detect() {
    const { input: inp, settings } = this.ctx;
    const L = inp.left;
    const R = inp.right;
    const head = inp.head;
    const fwd = _v3.copy(inp.headDir).setY(0);
    if (fwd.lengthSq() < 1e-3) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = _v4.set(-fwd.z, 0, fwd.x);
    const nf = (h) => h.gesture !== 'fist';
    const fist = (h) => h.gesture === 'fist';
    const facing = (h) => h.palmNormal.dot(_v.subVectors(head, h.palm).normalize());
    const front = (h) => _v.subVectors(h.palm, head).dot(fwd);
    const J = (h, n) => h.joints?.[n];
    // 엄지가 위로 서 있는가 (리그 공간도 y 는 그대로)
    const thumbUp = (h) => {
      const t = J(h, 'thumb-tip');
      const m = J(h, 'thumb-metacarpal');
      if (!t || !m) return false;
      const d = t.distanceTo(m);
      return d > 1e-3 && (t.y - m.y) / d > 0.55;
    };
    this._signSide = null;
    if (L.active && R.active && L.source === 'hand' && R.source === 'hand' && !L.uiBlock && !R.uiBlock) {
      const d = L.palm.distanceTo(R.palm);
      const mid = _v2.addVectors(L.palm, R.palm).multiplyScalar(0.5);
      // 영역전개 (수인표): 가슴 앞에서 두 손을 맞잡아 손가락을 깍지 낀다 — 손바닥이 서로 마주 본다
      const clasp = d < 0.075 && L.gesture !== 'open' && R.gesture !== 'open' && L.palmNormal.dot(R.palmNormal) < -0.5 && mid.y < head.y - 0.12 && mid.y > head.y - 0.65 && front(L) > 0.1;
      if (settings.domainGesture && clasp) return 'domain';
      // 마허라: 두 주먹을 맞댄다 (그림)
      if (fist(L) && fist(R) && d < 0.13 && L.palmNormal.dot(R.palmNormal) > -0.3 && mid.y < head.y - 0.12 && mid.distanceTo(head) < 0.75) return 'mahoraga';
      // 관우 (그림): 한 손 검지를 뿔처럼 세우고, 다른 손을 그 아래에 받친다
      const horn = (H, B) => (H.gesture === 'point' || H.gesture === 'two') && H.dir.y > 0.45 && nf(B) && H.palm.y - B.palm.y > 0.02 && Math.hypot(H.palm.x - B.palm.x, H.palm.z - B.palm.z) < 0.15 && front(H) > 0.12;
      if (horn(L, R) || horn(R, L)) return 'ox';
      // 가마 (그림): 두 손 검지 끝끼리, 엄지 끝끼리 맞대 마름모 (두꺼비 얼굴)
      const li = J(L, 'index-finger-tip');
      const ri = J(R, 'index-finger-tip');
      const lt = J(L, 'thumb-tip');
      const rt = J(R, 'thumb-tip');
      if (li && ri && lt && rt && li.distanceTo(ri) < 0.055 && lt.distanceTo(rt) < 0.065 && (li.y + ri.y) / 2 - (lt.y + rt.y) / 2 > 0.03 && front(L) > 0.12) return 'toad';
      // 누에 (그림): 손바닥을 내 쪽으로 해 손목을 X자로 겹치고 손가락을 날개처럼 편다
      //   엄지를 거는 원래 수인은 손가락이 가려 인식이 흔들리므로, 손목이 교차했는지로 본다
      if (nf(L) && nf(R) && d < 0.22 && facing(L) > 0.25 && facing(R) > 0.25) {
        const crossed = _v.subVectors(L.palm, R.palm).dot(right) > 0.01;
        if (crossed || this._thumbs(L, R) < 0.045) return 'nue';
      }
    }
    for (const h of [L, R]) {
      if (!h.active || h.source !== 'hand' || h.uiBlock) continue;
      const o = h === L ? R : L;
      if (o.active && o.source === 'hand' && o.palm.distanceTo(h.palm) < 0.25) continue;
      const fr = front(h);
      this._signSide = h.side;
      // 탈토: 검지·중지를 토끼 귀처럼 세운다
      if (h.gesture === 'two' && h.dir.y > 0.7 && Math.abs(h.palm.y - head.y) < 0.35 && fr > 0.12) return 'rabbits';
      // 옥견 (변형): 손날을 아래로 세우고 네 손가락을 앞으로 곧게 (개 주둥이), 엄지만 위로 (귀)
      if (h.gesture === 'open' && Math.abs(h.palmNormal.y) < 0.5 && h.fingersDir.dot(fwd) > 0.6 && thumbUp(h) && fr > 0.15) return 'dogs';
      // 만상 (그림): 손등을 위로 하고 검지·중지를 아래로 늘어뜨린다 (코끼리 코)
      if ((h.gesture === 'two' || h.gesture === 'point') && h.dir.y < -0.55 && fr > 0.18 && h.palm.y < head.y - 0.15) return 'elephantT';
      // 오로치 (변형): 손등을 위로, 네 손가락을 모아 앞으로 내밀고 엄지를 그 아래에 붙인다 (뱀 머리 · 입)
      if (h.gesture !== 'fist' && h.palmNormal.y < -0.5 && h.fingersDir.dot(fwd) > 0.5 && Math.abs(h.fingersDir.y) < 0.6 && (h.pinchDist < 0.05 || h.gesture === 'pinch') && fr > 0.15) return 'orochi';
    }
    this._signSide = null;
    return null;
  }

  _signHands(id) {
    if (this._signSide && (id === 'rabbits' || id === 'orochi' || id === 'dogs' || id === 'elephantT')) return [this._signSide];
    return ['left', 'right'];
  }

  _updateSigns(dt) {
    const { input: inp } = this.ctx;
    const S = this.sign;
    const E = this.elephant;
    // 만상: 주먹을 들어 올린 상태 → 빠르게 내려치면 떨어뜨린다
    if (E.armed > 0) {
      E.armed -= dt;
      const vy = (inp.left.vel.y + inp.right.vel.y) / 2;
      this.aura.set('left', 0.7);
      this.aura.set('right', 0.7);
      if (vy < -2.0) {
        E.armed = 0;
        this.summon('elephant');
      }
    }
    const id = this._detect();
    if (id && id === S.lock) return; // 같은 수인을 풀지 않고 유지 중
    S.lock = null;
    if (id !== S.id) {
      S.id = id;
      S.t = 0;
    }
    if (!id) return;
    S.t += dt;
    const hold = id === 'domain' ? 1.2 : id === 'elephantT' ? 0.35 : SIGNS[id].hold;
    const k = Math.min(1, S.t / hold);
    for (const side of this._signHands(id)) this.aura.set(side, 0.2 + k * 0.8);
    if (Math.random() < 0.5) for (const side of this._signHands(id)) inp[side].pulse?.(0.1 + k * 0.4, 20);
    if (S.t >= hold) {
      S.lock = id;
      S.id = null;
      S.t = 0;
      if (id === 'domain') this.castDomain();
      else if (id === 'elephant') {
        E.armed = 1.5;
        inp.left.pulse?.(0.6, 50);
        inp.right.pulse?.(0.6, 50);
      } else this.summon(id === 'elephantT' ? 'elephant' : id);
    }
  }

  handBusy() {
    return this.sign.t > 0 || this.elephant.armed > 0;
  }

  // ───────────────── 컨트롤러 / 데스크톱 ─────────────────
  _controller(dt) {
    const { input: inp, ui } = this.ctx;
    const L = inp.left;
    const R = inp.right;
    if (L.source === 'controller' && L.active && !L.uiBlock && L.pressed('trigger')) {
      this.ctrlSel = (this.ctrlSel + 1) % ORDER.length;
      const s = SIGNS[ORDER[this.ctrlSel]];
      ui.callout(`${s.kanji} ${s.label}`, { color: '#c0ccff', size: 46, dur: 0.8 });
      L.pulse?.(0.3, 30);
    }
    if (R.source === 'controller' && R.active && !R.uiBlock && R.pressed('trigger')) this.summon(ORDER[this.ctrlSel]);
    // 영역: 양쪽 스틱
    const d = this.domain;
    const both = L.source === 'controller' && R.source === 'controller' && L.btn.stick && R.btn.stick;
    if (both && this.garden.state === 'idle' && d.cd <= 0) {
      d.sign += dt;
      this.aura.set('left', 0.2 + d.sign * 0.7);
      this.aura.set('right', 0.2 + d.sign * 0.7);
      if (d.sign >= 1.2) {
        d.sign = 0;
        this.castDomain();
      }
    } else if (!(inp.mode === 'desktop' && inp.keyDown('KeyQ'))) d.sign = 0;
  }

  _desktop(dt) {
    const inp = this.ctx.input;
    ORDER.forEach((id, i) => {
      const code = 'Digit' + (i + 1);
      const down = inp.keyDown(code);
      if (down && !this._keys[code]) this.summon(id);
      this._keys[code] = down;
    });
    const d = this.domain;
    if (inp.keyDown('KeyQ') && this.garden.state === 'idle' && d.cd <= 0) {
      d.sign += dt;
      if (d.sign >= 1.2) {
        d.sign = 0;
        this.castDomain();
      }
    }
  }

  // ───────────────── 대상 고르기 ─────────────────
  /** 바라보는 대상을 먼저, 없으면 from 에서 가장 가까운 대상 */
  pickTarget(from, maxD = 20, gazeFirst = false, filter = null) {
    const { world, input: inp } = this.ctx;
    const ok = (t) => t.alive && !t.heldBy && !t.dying && (!filter || filter(t));
    if (gazeFirst) {
      let best = null;
      let bs = 0.35;
      for (const t of world.enemies()) {
        if (!ok(t)) continue;
        const c = t.center(_v);
        const rel = _v2.subVectors(c, inp.head);
        const along = rel.dot(inp.headDir);
        if (along < 0.5 || along > 28) continue;
        const s = rel.addScaledVector(inp.headDir, -along).length() / along;
        if (s < bs) {
          bs = s;
          best = t;
        }
      }
      if (best) return best;
    }
    let best = null;
    let bd = maxD;
    for (const t of world.enemies()) {
      if (!ok(t)) continue;
      const d = t.center(_v).distanceTo(from);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  _find(cls) {
    return this.list.filter((s) => s instanceof cls && s.state !== 'sink');
  }

  // ───────────────── 소환 ─────────────────
  summon(id) {
    const { input: inp, ui, sfx } = this.ctx;
    const S = SIGNS[id];
    const head = inp.head;
    const fwd = _v3.copy(inp.headDir).setY(0);
    if (fwd.lengthSq() < 1e-3) fwd.set(0, 0, -1);
    fwd.normalize();
    const yaw = Math.atan2(fwd.x, fwd.z);
    const at = (f, s) => new THREE.Vector3(head.x + fwd.x * f - fwd.z * s, 0, head.z + fwd.z * f + fwd.x * s);
    if (this.tenShadowsBroken) {
      this.denied('십종영법술이 망가졌다');
      return;
    }
    // 같은 식신을 다시 부르면 돌려보낸다
    const toggle = { dogs: [DivineDog, DogTotality], nue: [Nue], rabbits: [RabbitEscape], mahoraga: [Mahoraga] }[id];
    if (toggle) {
      const cur = toggle.flatMap((c) => this._find(c));
      if (cur.length) {
        for (const s of cur) s.dismiss();
        ui.callout(`${S.label} 해제`, { color: '#a0b0e0', size: 40, dur: 0.8 });
        return;
      }
    }
    if (this.lost.has(id)) {
      this.denied(`${S.label}은(는) 파괴되어 부를 수 없다`);
      return;
    }
    const totality = id === 'dogs' && this.ctx.settings.dogTotality;
    // 조복한 마허라: 먼저 법진만 불러 술사가 대신 적응하고, 한 번 더 맺으면 그 적응을 이어받아 나온다
    if (id === 'mahoraga' && this.ctx.settings.mahoragaTamed && !this.wheel?.alive) {
      if (!this.spend(20)) return;
      this.wheel = new MahoragaWheel(this);
      ui.manga({ main: '法陣', ruby: 'ほうじん', color: '#ffd28a' });
      ui.callout('법진만 소환 — 받는 공격에 적응한다 · 같은 수인으로 마허라', { color: '#ffe0a0', dur: 2 });
      return;
    }
    if ((this.cds[id] ?? 0) > 0 && !this.domainActive) return;
    let target = null;
    if (id === 'orochi' || id === 'elephant' || id === 'toad') {
      target = this.pickTarget(head, 24, true);
      if (!target && id === 'orochi') {
        ui.callout('대상이 없다', { color: '#a0b0e0', size: 40, dur: 0.8 });
        return;
      }
    }
    if (!this.spend(S.cost)) return;
    this.cds[id] = this.domainActive ? 0.25 : S.cd;
    let made = [];
    if (totality) {
      const d = new DogTotality(this);
      d.emerge(at(1.6, 0.9), yaw);
      made = [d];
    } else if (id === 'dogs') {
      const w = new DivineDog(this, true, -1);
      w.emerge(at(1.3, -0.8), yaw);
      const b = new DivineDog(this, false, 1);
      b.emerge(at(1.3, 0.8), yaw);
      made = [w, b];
    } else if (id === 'nue') {
      const n = new Nue(this);
      n.emerge(at(1.6, 0), yaw);
      made = [n];
    } else if (id === 'toad') {
      const tp = target ? target.center(new THREE.Vector3()) : at(5, 0);
      const side = _v.subVectors(tp, head).dot(_v2.set(-fwd.z, 0, fwd.x)) > 0 ? 1 : -1;
      const p = at(1.7, 0.7 * side);
      const t = new Toad(this);
      t.emerge(p, Math.atan2(tp.x - p.x, tp.z - p.z));
      made = [t];
    } else if (id === 'orochi') {
      const p = target.center(new THREE.Vector3()).setY(0);
      const o = new Orochi(this, target);
      o.emerge(p, yaw);
      made = [o];
    } else if (id === 'elephant') {
      const p = target ? target.center(new THREE.Vector3()).setY(0) : at(5, 0);
      const e = new MaxElephant(this, target);
      e.emerge(p, yaw + Math.PI);
      made = [e];
    } else if (id === 'ox') {
      const tp = this.pickTarget(head, 30, true);
      const dir = tp ? tp.center(new THREE.Vector3()).sub(head).setY(0).normalize() : fwd.clone();
      const o = new PiercingOx(this, dir);
      o.emerge(at(0.8, 1.1), Math.atan2(dir.x, dir.z));
      made = [o];
    } else if (id === 'rabbits') {
      made = [new RabbitEscape(this, at(0.6, 0))];
    } else if (id === 'mahoraga') {
      const inherit = this.wheel?.alive ? this.wheel.ad.snapshot() : null;
      if (this.wheel) {
        this.wheel.dismiss();
        this.wheel = null;
      }
      const m = new Mahoraga(this, inherit);
      m.emerge(at(3.6, 0), yaw + Math.PI);
      made = [m];
      sfx.play('chant', { vol: 0.9, rate: 0.7 });
    }
    this.list.push(...made);
    if (totality) ui.manga({ main: '玉犬・渾', ruby: 'ぎょくけん・こん', color: '#9fb2ff' });
    else ui.manga({ top: S.top, main: S.kanji, ruby: S.ruby, color: id === 'mahoraga' ? '#ffd28a' : '#9fb2ff', big: id === 'mahoraga' });
    inp.left.pulse?.(0.6, 60);
    inp.right.pulse?.(0.6, 60);
  }

  // ───────────────── 영역전개 嵌合暗翳庭 ─────────────────
  castDomain() {
    const { input: inp, ui, sfx, world } = this.ctx;
    if (this.garden.state !== 'idle' || this.domain.cd > 0) {
      ui.callout('영역전개 재사용 대기 중');
      return;
    }
    if (this.energy < 50) {
      this.denied();
      return;
    }
    this.energy -= 50;
    const center = new THREE.Vector3(inp.head.x, 0, inp.head.z);
    this.garden.start(center);
    this.domain.t = 0;
    this.domain.spikeT = 1.2;
    world.domain = { center, radius: this.garden.radius, freeze: false };
    shadowSplash(this.ctx.fx, center, 3, 60);
    ui.manga({ top: '領域展開', main: '嵌合暗翳庭', ruby: 'かんごうあんえいてい', color: '#6f86ff', big: true });
    sfx.rumble(2.5, 0.6);
    sfx.play('domain_open', { vol: 0.9, rate: 0.85 });
    sfx.play('void_open', { vol: 0.4, rate: 0.7 });
    inp.left.pulse?.(1, 400);
    inp.right.pulse?.(1, 400);
  }

  _updateDomain(dt) {
    const { world, fx, sfx } = this.ctx;
    const G = this.garden;
    const d = this.domain;
    if (G.state !== 'active') return;
    d.t += dt;
    if (d.t >= d.duration) {
      G.stop();
      d.cd = 15;
      world.domain = null;
      return;
    }
    // 그림자 송곳: 그림자 바다 위의 대상 발밑에서 솟구친다
    d.spikeT -= dt;
    if (d.spikeT > 0) return;
    d.spikeT = 1.8;
    for (const t of world.targets()) {
      if (t.heldBy) continue;
      const c = t.center(new THREE.Vector3());
      if (!G.contains(c)) continue;
      const g = c.clone().setY(0);
      const delay = Math.random() * 0.5;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.random();
        const p = g.clone().add(_v.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35));
        const tilt = _v2.set(-Math.cos(a) * 0.35, 1, -Math.sin(a) * 0.35).normalize().clone();
        this.spikes.spawn(p, 1.6 + Math.random() * 0.8, 0.1 + Math.random() * 0.05, tilt, delay);
      }
      this.pending.push({
        t: delay + 0.05,
        fn: () => {
          if (!t.alive) return;
          t.damage(32, { type: 'punch', dir: new THREE.Vector3(0, 1, 0), color: '#8aa0ff' });
          t.impulse?.(_v.set((Math.random() - 0.5) * 2, 6, (Math.random() - 0.5) * 2), 6);
          shadowSplash(fx, g, 0.6, 14);
          sfx.play('slash', { at: g, vol: 0.4, rate: 0.7 });
        },
      });
    }
  }

  cancelDomain() {
    this.garden.cancel();
    this.ctx.world.domain = null;
  }

  dispose() {
    for (const s of this.list) s.destroy();
    this.list = [];
    this.wheel?.destroy();
    this.wheel = null;
    this.ctx.scene.remove(this.slashes.mesh);
    this.slashes.mesh.dispose();
    const W = this.ctx.world;
    W.absorbMelee = W.absorbBullet = W.playerDamageMul = null;
    W.extraTargets.length = 0;
    this.cancelDomain();
    this.garden.dispose();
    this.pools.dispose();
    this.spikes.dispose();
    this.aura.dispose();
    this.ctx.world.decoy = null;
    this.ctx.world.domain = null;
  }
}
