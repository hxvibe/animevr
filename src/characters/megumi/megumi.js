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
import { MahoragaRitual } from './ritual.js';
import { Vessel } from '../../core/vessel.js';
import { MahoragaSelf } from './possess.js';
import { ShadowStore, CAP_KG } from './shadowStore.js';

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
// 영역 음성에서 「嵌合暗翳庭」을 말하기 시작하는 때 (초)
const CHANT_OPEN = 3.2;
const ORDER = ['dogs', 'nue', 'toad', 'orochi', 'elephant', 'rabbits', 'ox', 'mahoraga'];

export class Megumi {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'megumi';
    this.ctrlNative = true; // 컨트롤러: 손 모델은 그리되 조작은 원래 컨트롤러 방식 (소환은 트리거)
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
    this.fadingWheels = []; // 사라지는 중인 법진
    this.slashes = new SlashLines(ctx.scene, 60); // 옥견 혼의 발톱 자국
    this.shadow = new ShadowStore(this); // 그림자 수납 (주구 · 물건) — 든 무게만큼 술사가 짊어진다
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
    if (this.possessed?.helpLines) return this.possessed.helpLines(mode);
    if (mode === 'hand') {
      return [
        { head: '玉犬 옥견 · 鵺 누에', demo: ['megumi.dogs', 'megumi.nue'], color: '#a8b8ff', text: '옥견: 두 손을 포개 손날을 세우고 네 손가락을 앞으로 곧게, 엄지를 세운다 (개 머리와 귀)\n누에: 두 손바닥을 내 쪽으로 해 손목을 X자로 겹치고 손가락을 날개처럼 펴기 (엄지를 걸어도 OK)' },
        { head: '蝦蟇 가마 · 脱兎 탈토', demo: ['megumi.toad', 'megumi.rabbits'], color: '#a8b8ff', text: '가마: 두 손 검지 끝끼리, 엄지 끝끼리 맞대 마름모 (두꺼비 얼굴) → 혀로 끌어온다\n탈토: 한 손 검지·중지를 얼굴 옆에서 토끼 귀처럼 세우기 → 더미가 토끼를 쫓는다' },
        { head: '大蛇 오로치 · 満象 만상', demo: ['megumi.orochi', 'megumi.elephant'], color: '#a8b8ff', text: '오로치: 손등을 위로, 네 손가락을 모아 앞으로 내밀고 엄지를 그 밑에 붙이기 (뱀 머리)\n만상: 손등을 위로 하고 검지·중지를 아래로 늘어뜨리기 (코끼리 코)' },
        { head: '貫牛 관우', demo: 'megumi.ox', color: '#a8b8ff', text: '한 손 검지를 뿔처럼 세우고 다른 손을 그 아래에 받치기\n바라본 쪽으로 곧게 돌진. 달릴수록 빨라지고 세진다' },
        { head: '魔虚羅 마허라', demo: 'megumi.mahoraga', color: '#ffd28a', text: '두 팔을 앞으로 쭉 뻗고 두 주먹을 쥐어 1초 — 布瑠部由良由良 · 맞은 성질에 적응하면 법진이 돌며 완전 재생\n조복 전 첫 소환은 조복의 의식 연출(布瑠部由良由良 … 번데기가 풀리며 등장, 설정에서 끄기) · 조복 전: 상대가 없으면 술사를 노린다 → 적응 전에 한 방에 쓰러뜨리면 조복 · 조복 후: 법진만 먼저 → 한 번 더 맺으면 이어받아 등장' },
        { head: '영역전개 「嵌合暗翳庭」', demo: 'megumi.domain', color: '#6f86ff', text: '팔을 아래로 내리고 두 주먹을 맞대고 1.2초 → 「領域展開… 嵌合暗翳庭」\n식신 소모 없음 · 그림자 송곳 · 식신이 사라지지 않음 · 메뉴에서도 발동\n미완성 영역: 막힌 실내(연습장)에서만 결계가 닫히고, 탁 트인 곳에선 바닥만 그림자 바다가 된다' },
        { head: '그림자 수납 (주구 · 물건)', color: '#b8c4ff', text: `발밑 그림자(바로 아래 바닥)에 편 손을 대면 꺼낼 물건이 떠오른다 → 주먹을 쥐면 꺼내 쥔다 · 편 손을 1초 대고 있으면 다음 물건\n주구(곡도 · 고리칼): 크게 휘둘러 벤다 · 손을 펴면 그림자로 돌아간다 · 물건을 쥔 채 발밑 그림자에 넣고 손을 펴면 그림자에 넣는다 (영역전개 중엔 그림자 바다 어디든)\n그림자에 든 무게는 술사가 짊어진다 — 무거울수록 느려지고 주력이 덜 찬다 · 최대 ${CAP_KG}kg` },
        { head: '공통', demo: 'common.grab', color: '#ffffff', text: '같은 수인을 다시 맺으면 그 식신을 그림자로 돌려보낸다 · 주먹으로 치기(흑섬) · 물체 집기 (적은 마허라가 된 뒤에만 붙잡는다)' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴' },
        { head: '玉犬 옥견', color: '#e8e8ff', text: '1 (다시 누르면 돌려보내기 · 조준한 대상을 노린다)' },
        { head: '鵺 누에', color: '#c8d0ff', text: '2' },
        { head: '蝦蟇 가마', color: '#b0e0b0', text: '3' },
        { head: '大蛇 오로치', color: '#d0c0a0', text: '4' },
        { head: '満象 만상', color: '#c0d8ff', text: '5' },
        { head: '脱兎 탈토', color: '#ffffff', text: '6' },
        { head: '貫牛 관우', color: '#ffc0a0', text: '7' },
        { head: '魔虚羅 마허라', color: '#ffd28a', text: '8 (조복 전이면 조복의 의식 · 다시 누르면 돌려보내기)' },
        { head: '영역전개 「嵌合暗翳庭」', color: '#6f86ff', text: 'Q 1.2초 누르고 있기' },
        { head: '주먹 · 잡기', color: '#ffd0d0', text: 'V 주먹(흑섬) · T 물체 집기 → 다시 T 던지기' },
        { head: '그림자 수납', color: '#b8c4ff', text: `G 주구 꺼내기/돌려보내기 · T로 든 물건을 G로 그림자에 넣기 · B 꺼낼 물건 고르기 (짊어지는 무게 최대 ${CAP_KG}kg)` },
      ];
    }
    return [
      { head: '식신 고르기 · 부르기', color: '#a8b8ff', text: '왼쪽 트리거만: 식신 고르기 · 오른쪽 트리거만: 부르기 (바라본 대상을 노린다 · 그립까지 쥐면 주먹이라 부르지 않는다)\n다시 부르면 돌려보내기' },
      { head: '魔虚羅 마허라', color: '#ffd28a', text: '두 컨트롤러를 앞으로 쭉 뻗고 두 그립+트리거(주먹)를 1초' },
      { head: '영역전개 「嵌合暗翳庭」', color: '#6f86ff', text: '팔을 아래로 내리고 두 그립+트리거(주먹)를 맞대고 1.2초 (메뉴에서도 발동)' },
      { head: '그림자 수납', color: '#b8c4ff', text: `발밑 바닥에 컨트롤러를 대고 그립 → 주구·물건 꺼내기 (대고 1초: 다음 물건) · 그립을 놓으면 주구는 그림자로\n물건을 쥔 채 발밑에 대고 그립을 놓으면 그림자에 넣는다 · 짊어지는 무게 최대 ${CAP_KG}kg` },
      { head: '버튼', color: '#ffd0d0', text: '그립 쥐고 휘둘러 치기 → 흑섬 · Y 메뉴' },
    ];
  }

  hudRows() {
    if (this.possessed) return this.possessed.hudRows();
    const w = this.ctx.world;
    const d = this.domain;
    let dom = '준비';
    if (this.garden.state === 'active') dom = `전개 중 ${Math.max(0, Math.ceil(d.duration - d.t))}s`;
    else if (this.garden.state !== 'idle') dom = '전개 중';
    else if (d.chant) dom = '영창 중';
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
    rows.push(this.shadow.hudRow());
    if (this.vessel) rows.push(this.vessel.hudRow());
    return rows;
  }

  // ───────────────── 메인 ─────────────────
  update(dt) {
    const { input: inp } = this.ctx;
    const blocked = this.ctx.ui.menuOpen || !!this.ritual?.alive; // 조복 의식 중엔 술식도 못 쓴다
    // 그림자에 든 무게를 짊어진다: 무거울수록 주력이 덜 차고 몸이 느려진다
    const burden = this.possessed ? 0 : this.shadow.burden;
    this.energy = Math.min(this.maxEnergy, this.energy + 12 * (1 - 0.85 * burden) * dt);
    inp.moveMul = 1 - 0.6 * burden;
    for (const k in this.cds) this.cds[k] -= dt;
    if (this.possessed) {
      // 술사가 마허라가 된 동안: 식신·수인 없이 마허라의 몸으로 싸운다
      this.possessed.update(dt);
    } else (this.vessel ??= new Vessel(this)).update(dt);
    this.domain.cd = Math.max(0, this.domain.cd - dt);
    if (!blocked && !this.possessed) {
      // 핸드트래킹 · (원래 조작) 컨트롤러 모두 수인을 본다 — 컨트롤러는 마허라 · 영역전개만
      if (inp.left.source === 'hand' || inp.right.source === 'hand' || (inp.left.source === 'controller' && inp.right.source === 'controller')) this._updateSigns(dt);
      this._controller(dt);
      if (inp.mode === 'desktop') this._desktop(dt);
      this.shadow.update(dt);
    } else if (this.possessed) for (const sd of ['left', 'right']) this.shadow.putTool(sd);
    if (this.ritual && !this.ritual.update(dt)) this.ritual = null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (!s.alive || !s.update(dt)) this.list.splice(i, 1);
    }
    if (this.wheel && !this.wheel.update(dt)) this.wheel = null;
    this.fadingWheels = this.fadingWheels.filter((w) => w.update(dt));
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
    // 컨트롤러 그대로(원래 조작): 그립+트리거 = 주먹
    //  마허라: 두 팔을 앞으로 뻗고 두 주먹 / 영역전개: 팔을 내리고 두 주먹을 맞댄다 (컨트롤러는 몸통이 커서 22cm 안이면 맞댄 것으로)
    if (L.active && R.active && L.source === 'controller' && R.source === 'controller' && !L.uiBlock && !R.uiBlock) {
      const cf = (h) => h.btn.grip && h.btn.trigger;
      if (cf(L) && cf(R)) {
        const d = L.palm.distanceTo(R.palm);
        const drop = head.y - (L.palm.y + R.palm.y) / 2;
        if (settings.domainGesture && d < 0.22 && drop > 0.68 && drop < 1.4) return 'domain';
        if (front(L) > 0.36 && front(R) > 0.36 && drop > 0.0 && drop < 0.6 && d < 0.6) return 'mahoraga';
      }
    }
    // 컨트롤러 손: 맞물린 수인
    if (inp.ctrlMudra === 'megumi.domain' && settings.domainGesture) return 'domain';
    if (inp.ctrlMudra === 'megumi.mahoraga') return 'mahoraga';
    if (L.active && R.active && L.source === 'hand' && R.source === 'hand' && !L.uiBlock && !R.uiBlock) {
      const d = L.palm.distanceTo(R.palm);
      const mid = _v2.addVectors(L.palm, R.palm).multiplyScalar(0.5);
      // 두 주먹을 맞댄다: 팔을 앞으로 뻗어 허리 아래면 영역전개, 가슴 앞이면 마허라
      //  높이는 눈에서 잰다: 가슴 앞 ≈ 눈 아래 0.2~0.45m, 허리 ≈ 0.6m 아래
      const drop = head.y - mid.y;
      // 영역전개: 팔을 내리고(허리 아래) 두 주먹을 맞댄다
      if (settings.domainGesture && fist(L) && fist(R) && d < 0.14 && drop > 0.7 && drop < 1.35) return 'domain';
      // 마허라: 두 팔을 앞으로 쭉 뻗고 두 주먹
      if (fist(L) && fist(R) && front(L) > 0.4 && front(R) > 0.4 && drop > 0.0 && drop < 0.6 && d < 0.45) return 'mahoraga';
      // 관우 (그림): 한 손 검지를 뿔처럼 세우고, 다른 손을 그 아래에 받친다
      const horn = (H, B) => (H.gesture === 'point' || H.gesture === 'two') && H.dir.y > 0.45 && nf(B) && H.palm.y - B.palm.y > 0.02 && Math.hypot(H.palm.x - B.palm.x, H.palm.z - B.palm.z) < 0.15 && front(H) > 0.12;
      if (horn(L, R) || horn(R, L)) return 'ox';
      // 가마 (그림): 두 손 검지 끝끼리, 엄지 끝끼리 맞대 마름모 (두꺼비 얼굴)
      const li = J(L, 'index-finger-tip');
      const ri = J(R, 'index-finger-tip');
      const lt = J(L, 'thumb-tip');
      const rt = J(R, 'thumb-tip');
      if (li && ri && lt && rt && li.distanceTo(ri) < 0.055 && lt.distanceTo(rt) < 0.065 && (li.y + ri.y) / 2 - (lt.y + rt.y) / 2 > 0.03 && front(L) > 0.12) return 'toad';
      // 옥견 (그림자 개): 두 손을 포개 손날을 세우고 네 손가락을 앞으로 (주둥이), 엄지를 세운다 (귀)
      if (nf(L) && nf(R) && d < 0.13 && Math.abs(L.palmNormal.y) < 0.55 && Math.abs(R.palmNormal.y) < 0.55 && L.fingersDir.dot(fwd) > 0.5 && R.fingersDir.dot(fwd) > 0.5 && (thumbUp(L) || thumbUp(R)) && front(L) > 0.15) return 'dogs';
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
      // 만상 (그림): 손등을 위로 하고 검지·중지를 아래로 늘어뜨린다 (코끼리 코)
      if ((h.gesture === 'two' || h.gesture === 'point') && h.dir.y < -0.55 && fr > 0.18 && h.palm.y < head.y - 0.15) return 'elephantT';
      // 오로치 (변형): 손등을 위로, 네 손가락을 모아 앞으로 내밀고 엄지를 그 아래에 붙인다 (뱀 머리 · 입)
      if (h.gesture !== 'fist' && h.palmNormal.y < -0.5 && h.fingersDir.dot(fwd) > 0.5 && Math.abs(h.fingersDir.y) < 0.6 && (h.pinchDist < 0.05 || h.gesture === 'pinch') && fr > 0.15) return 'orochi';
    }
    this._signSide = null;
    return null;
  }

  _signHands(id) {
    if (this._signSide && (id === 'rabbits' || id === 'orochi' || id === 'elephantT')) return [this._signSide];
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

  /** 술사가 쓰러졌다: 조복 전 마허라에게 당했으면 술사가 마허라가 된다 */
  onPlayerDown(info) {
    if (this.possessed) {
      this.possessed.exit('dead');
      return true;
    }
    const m = info?.src;
    if (m instanceof Mahoraga && !m.tamed && m.alive) {
      const { fx, sfx } = this.ctx;
      const c = m.aimPoint(new THREE.Vector3());
      fx.burst(c, 60, new THREE.Color(0x0c0c12), 5, 0.08, 1, { spread: 1.2 });
      for (let i = 0; i < 12; i++) fx.fire.smoke(c.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(1.2)), new THREE.Vector3(0, 0.8, 0), { size0: 0.5, size1: 1.8, life: 1.2, shade: 1, lit: 0, opacity: 0.35, drag: 2, rise: 0.4 });
      sfx.play('whoosh_2', { at: c, vol: 0.8, rate: 0.5 });
      m.destroy();
      this.list = this.list.filter((s) => s !== m);
      // 다른 식신들은 그림자로 돌아간다
      for (const s of this.list) s.dismiss?.();
      this.possessed = new MahoragaSelf(this, m);
      return true;
    }
    return false;
  }

  /** 마허라가 된 동안의 주먹 */
  meleeHit(target, pos, dir, speed, hand) {
    return this.possessed ? this.possessed.meleeHit(target, pos, dir, speed, hand) : false;
  }

  handBusy(side) {
    return this.sign.t > 0 || this.elephant.armed > 0 || (side && (this.vessel?.holds(side) || this.shadow?.holds(side)));
  }

  /** 지금 펼친 영역 (스쿠나의 손가락을 먹었으면 복마어주자가 겹친다) */
  domainInfo() {
    const G = this.garden;
    return G.state === 'active' ? { center: G.center, radius: G.radius } : null;
  }

  // ───────────────── 컨트롤러 / 데스크톱 ─────────────────
  _controller(dt) {
    const { input: inp, ui } = this.ctx;
    const L = inp.left;
    const R = inp.right;
    // 트리거만 눌렀을 때 (그립까지 쥐면 주먹 — 주먹을 쥐었다고 식신이 나가지 않게)
    if (L.source === 'controller' && L.active && !L.uiBlock && L.pressed('trigger') && !L.btn.grip) {
      this.ctrlSel = (this.ctrlSel + 1) % ORDER.length;
      const s = SIGNS[ORDER[this.ctrlSel]];
      ui.callout(`${s.kanji} ${s.label}`, { color: '#c0ccff', size: 46, dur: 0.8 });
      L.pulse?.(0.3, 30);
    }
    if (R.source === 'controller' && R.active && !R.uiBlock && R.pressed('trigger') && !R.btn.grip) this.summon(ORDER[this.ctrlSel]);
    // 마허라 · 영역전개는 컨트롤러로도 수인을 맺는다 (_detect: 그립+트리거 = 주먹)
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
    if ((this.cds[id] ?? 0) > 0 && !this.domainActive) {
      if (id === 'mahoraga') ui.callout(`마허라 재소환 대기 ${Math.ceil(this.cds[id])}s`, { color: '#ffe0a0', size: 38, dur: 1 });
      return;
    }
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
        // 법진은 마허라 머리 위로 옮겨 가며 사라진다 (사라지는 동안에도 계속 갱신해야 장면에서 빠진다)
        this.wheel.dismiss();
        this.fadingWheels.push(this.wheel);
        this.wheel = null;
      }
      if (!inherit && !this.ctx.settings.mahoragaTamed && this.ctx.settings.mahoragaRitual !== false && !this.domainActive) {
        // 조복의 의식: 「布瑠部由良由良」 음성에 맞춘 연출 뒤에 마허라가 번데기에서 풀려난다
        if (this.ritual?.alive) return;
        this.ritual = new MahoragaRitual(this, (pos, y) => {
          const m = new Mahoraga(this);
          m.emerge(pos, y);
          m.state = 'act';
          m.t = 0;
          m.body.position.y = 0;
          m.pool?.close();
          m.pool = null;
          this.list.push(m);
        });
        inp.left.pulse?.(0.6, 60);
        inp.right.pulse?.(0.6, 60);
        return;
      }
      const m = new Mahoraga(this, inherit);
      // 술사의 등 뒤 그림자에서 낮은 싸움 자세로 솟아오른다 (술사와 같은 쪽을 본다)
      m.emerge(at(-3.4, 0.5), yaw);
      made = [m];
      // 의식 없이 부를 땐 음성의 앞부분 「布瑠部由良由良」만 (앞 0.4초 페이드 인, 4.7초에 페이드 아웃)
      const v = sfx.playClip('mahoragaSummon', { vol: 1.1, fadeIn: 0.4 });
      if (v.duration) setTimeout(() => v.stop(0.5), 4700);
      else sfx.play('chant', { vol: 0.9, rate: 0.7 });
    }
    this.list.push(...made);
    if (totality) ui.manga({ main: '玉犬・渾', ruby: 'ぎょくけん・こん', color: '#9fb2ff' });
    else ui.manga({ top: S.top, main: S.kanji, ruby: S.ruby, color: id === 'mahoraga' ? '#ffd28a' : '#9fb2ff', big: id === 'mahoraga' });
    inp.left.pulse?.(0.6, 60);
    inp.right.pulse?.(0.6, 60);
  }

  // ───────────────── 영역전개 嵌合暗翳庭 ─────────────────
  castDomain() {
    const { input: inp, ui, sfx } = this.ctx;
    if (this.garden.state !== 'idle' || this.domain.cd > 0 || this.domain.chant) {
      if (!this.domain.chant) ui.callout('영역전개 재사용 대기 중');
      return;
    }
    if (this.energy < 50) {
      this.denied();
      return;
    }
    this.energy -= 50;
    // 영창: 「領域展開」 → (숨) → 「嵌合暗翳庭」 을 말하는 순간 그림자 바다가 펼쳐진다
    const voice = sfx.playClip('megumiDomain', { vol: 1.15 });
    const lead = voice.duration ? CHANT_OPEN : 0.25;
    this.domain.chant = { t: 0, lead, voice };
    this.domainCasting = true; // 영역 싸움: 영창 중에도 전개를 시작한 것으로 본다
    ui.manga({ main: '領域展開', ruby: 'りょういきてんかい', color: '#6f86ff' });
    shadowSplash(this.ctx.fx, new THREE.Vector3(inp.head.x, 0, inp.head.z), 1.2, 24);
    inp.left.pulse?.(0.5, 200);
    inp.right.pulse?.(0.5, 200);
  }

  /** 영창이 끝나 실제로 펼친다 */
  _openGarden() {
    const { input: inp, ui, sfx, world } = this.ctx;
    this.domain.chant = null;
    this.domainCasting = false;
    const center = new THREE.Vector3(inp.head.x, 0, inp.head.z);
    this.garden.start(center);
    this.domain.t = 0;
    this.domain.spikeT = 1.2;
    world.domain = { center, radius: this.garden.radius, freeze: false };
    shadowSplash(this.ctx.fx, center, 3, 60);
    ui.manga({ top: '領域展開', main: '嵌合暗翳庭', ruby: 'かんごうあんえいてい', color: '#6f86ff', big: true });
    // 미완성 영역: 막힌 공간이 아니면 결계가 닫히지 않는다 (바닥만 그림자)
    if (!this.garden.closed) ui.callout('미완성 영역 — 결계를 닫지 못해 바닥만 그림자로 잠긴다 (막힌 실내에서는 결계가 닫힌다)', { color: '#9fb2ff', dur: 2.6 });
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
    if (d.chant) {
      d.chant.t += dt;
      // 영창 중: 발밑 그림자가 짙어지고 손에 그림자가 감긴다
      this.aura.set('left', 0.5 + 0.5 * Math.min(1, d.chant.t / d.chant.lead));
      this.aura.set('right', 0.5 + 0.5 * Math.min(1, d.chant.t / d.chant.lead));
      if (Math.random() < 0.3) shadowSplash(fx, _v.set(this.ctx.input.head.x + (Math.random() - 0.5) * 1.5, 0, this.ctx.input.head.z + (Math.random() - 0.5) * 1.5), 0.3, 4);
      if (d.chant.t >= d.chant.lead) this._openGarden();
      return;
    }
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
    if (world.sureHitBlocked?.()) return; // 영역 싸움(중첩): 필중 효과가 사라진다
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
    this.vessel?.cancelDomain();
    this.domain.chant?.voice?.stop(0.2);
    this.domain.chant = null;
    this.domainCasting = false;
    this.garden.cancel();
    this.ctx.world.domain = null;
  }

  dispose() {
    this.possessed?.exit('back');
    this.vessel?.dispose();
    this.ritual?.cancel();
    this.ritual = null;
    for (const s of this.list) s.destroy();
    this.list = [];
    this.wheel?.destroy();
    this.wheel = null;
    for (const w of this.fadingWheels) w.destroy();
    this.fadingWheels = [];
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
    this.shadow.dispose();
    this.ctx.input.moveMul = 1;
  }
}
