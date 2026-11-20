// VR UI: 타이틀(메인 메뉴) · 옵션 패널 · 손목 HUD · 만화풍 기술명 · 데미지 숫자 · 피격 효과
import { CTRL_HELP } from './ctrlHands.js';
import { worldCutPC } from '../characters/sukuna/sukuna.js';
// 기본값이 기기에 따라 정해지는 설정
const optVal = (S, k) => (k === 'worldCutPC' ? worldCutPC(S) : !!S[k]);
import * as THREE from 'three';
import { CHARACTERS } from '../characters/index.js';
import { BACKGROUNDS } from './env/backgrounds.js';
import { DUMMY_TYPES } from './dummy.js';
import { HandDemo } from './handDemo.js';

export const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
export const JFONT = "'Noto Serif JP', 'Yu Mincho', 'Hiragino Mincho ProN', serif";

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ray = new THREE.Ray();
const _plane = new THREE.Plane();

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 글자 폭에 맞춰 줄바꿈 (한글은 글자 단위, 공백 우선) */
function wrap(g, text, maxW) {
  const out = [];
  let line = '';
  for (const word of text.split(/(\s+)/)) {
    if (g.measureText(line + word).width <= maxW) {
      line += word;
      continue;
    }
    if (line.trim()) out.push(line.trim());
    line = '';
    for (const ch of word) {
      if (g.measureText(line + ch).width > maxW) {
        out.push(line);
        line = '';
      }
      line += ch;
    }
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

function canvasPlane(cw, ch, mw, mh, opts = {}) {
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, depthTest: opts.depthTest ?? true, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), mat);
  mesh.renderOrder = opts.renderOrder ?? 30;
  return { canvas: c, g: c.getContext('2d'), tex, mat, mesh, mw, mh };
}

/** 버튼이 있는 캔버스 패널 */
class Panel {
  constructor(cw, ch, mw, mh, drawFn) {
    Object.assign(this, canvasPlane(cw, ch, mw, mh, { renderOrder: 60 }));
    this.drawFn = drawFn;
    this.buttons = [];
    this.hover = -1;
    this.mesh.visible = false;
  }

  button(x, y, w, h, label, id, o = {}) {
    const g = this.g;
    const i = this.buttons.length;
    this.buttons.push({ x, y, w, h, id });
    rr(g, x, y, w, h, o.r ?? 16);
    const hov = i === this.hover;
    g.fillStyle = o.active ? (o.accent ?? '#3d7bff') : hov ? 'rgba(120,170,255,0.45)' : (o.bg ?? 'rgba(255,255,255,0.08)');
    g.fill();
    g.lineWidth = o.active ? 4 : 2;
    g.strokeStyle = o.active ? '#ffffff' : hov ? '#cfe0ff' : 'rgba(255,255,255,0.25)';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `${o.weight ?? 700} ${o.size ?? 28}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lines = String(label).split('\n');
    lines.forEach((ln, k) => {
      if (k > 0) {
        g.font = `400 ${Math.round((o.size ?? 28) * 0.7)}px ${FONT}`;
        g.fillStyle = 'rgba(255,255,255,0.75)';
      }
      g.fillText(ln, x + w / 2, y + h / 2 + (k - (lines.length - 1) / 2) * (o.size ?? 28) * 1.15);
    });
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  redraw() {
    this.buttons = [];
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawFn(this.g, this);
    this.tex.needsUpdate = true;
  }

  hit(local) {
    const u = local.x / this.mw + 0.5;
    const v = local.y / this.mh + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return { inside: false, index: -1 };
    const px = u * this.canvas.width;
    const py = (1 - v) * this.canvas.height;
    const index = this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
    return { inside: true, index };
  }
}

export class UI {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, camera } = ctx;
    this.scene = scene;
    this.mode = 'title'; // 'title' | 'game'
    this.sel = { character: ctx.settings.character ?? 'gojo', background: ctx.settings.background ?? 'white' };
    this.tab = 'dummy';
    this.spawn = { type: 'basic', hp: 100, count: 1 };

    this.title = new Panel(1600, 1000, 1.76, 1.1, (g, p) => this._drawTitle(g, p));
    this.options = new Panel(1400, 1050, 1.4, 1.05, (g, p) => this._drawOptions(g, p));
    scene.add(this.title.mesh, this.options.mesh);
    // 조작법 탭: 손 모양 영상 (퀘스트 손 모델이 수인을 맺는 동작을 반복)
    this.handDemo = new HandDemo();
    const hd = this.handDemo.group;
    hd.position.set(0.315, 0.125, 0.3); // 패널 오른쪽 위 영상 칸의 가운데 앞
    hd.scale.setScalar(1.15);
    // 오른쪽 어깨 뒤에서 내려다본 시점. 가슴 앞 손 자리(C)가 칸 가운데에 오게
    const st = this.handDemo.stage;
    st.rotation.set(0.3, -0.45, 0, 'XYZ');
    st.position.set(0.02, -0.3, -0.33).applyEuler(st.rotation).negate();
    hd.visible = false;
    this.options.mesh.add(hd);
    this.help = { sel: 0, auto: 4.5, pinned: false, view: null, demoIdx: 0, demoT: 0 };

    // 메타 퀘스트식 메뉴 아이콘: 왼손바닥을 얼굴 쪽으로 돌리면 나타나고, 왼손 집기로 열기
    this.menuIcon = canvasPlane(128, 128, 0.05, 0.05, { renderOrder: 65, depthTest: false });
    {
      const g = this.menuIcon.g;
      g.beginPath();
      g.arc(64, 64, 58, 0, Math.PI * 2);
      g.fillStyle = 'rgba(30,32,40,0.9)';
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.stroke();
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) g.fillRect(36, 40 + i * 20, 56, 8);
      this.menuIcon.tex.needsUpdate = true;
    }
    this.menuIcon.mesh.visible = false;
    scene.add(this.menuIcon.mesh);
    this._iconCd = 0;
    this._iconShow = 0;
    this.hud = canvasPlane(512, 300, 0.17, 0.1, { renderOrder: 40 });
    this.hud.mesh.visible = false;
    scene.add(this.hud.mesh);
    this._hudT = 0;

    this.cursor = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.cursor.renderOrder = 70;
    this.cursor.visible = false;
    scene.add(this.cursor);
    this._pokePrev = { left: 1, right: 1 };
    this._pokeCd = 0;

    this.vignette = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff1030, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false }),
    );
    this.vignette.renderOrder = 100;
    camera.add(this.vignette);

    this.mangas = [];
    this.callouts = [];
    this.numbers = [];
    for (let i = 0; i < 24; i++) {
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = 80;
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false }));
      s.renderOrder = 50;
      s.scale.set(0.3, 0.125, 1);
      s.visible = false;
      scene.add(s);
      this.numbers.push({ s, c, t, life: 0, vel: new THREE.Vector3() });
    }
    this._numCursor = 0;
    this.labels = new Map(); // 샌드백 DPS 라벨
  }

  get menuOpen() {
    return this.title.mesh.visible || this.options.mesh.visible;
  }

  // ───────────────── 타이틀 ─────────────────
  _drawTitle(g, p) {
    const W = p.canvas.width;
    const H = p.canvas.height;
    rr(g, 6, 6, W - 12, H - 12, 44);
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, 'rgba(10,14,30,0.94)');
    bg.addColorStop(1, 'rgba(30,8,20,0.94)');
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.stroke();
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = `900 120px ${FONT}`;
    g.fillText('ANIME VR', W / 2, 160);
    g.font = `500 38px ${FONT}`;
    g.fillStyle = '#b9c6ea';
    g.fillText('술 식  시 뮬 레 이 터', W / 2, 218);
    g.textAlign = 'left';

    g.font = `700 34px ${FONT}`;
    g.fillStyle = '#ffffff';
    g.fillText('캐릭터', 90, 300);
    const n = CHARACTERS.length;
    if (n <= 2) {
      const cw = (W - 180 - (n - 1) * 40) / n;
      CHARACTERS.forEach((c, i) => {
        const x = 90 + i * (cw + 40);
        const active = this.sel.character === c.id;
        p.button(x, 325, cw, 250, '', 'char:' + c.id, { active, accent: c.color + 'aa', r: 24 });
        g.textAlign = 'left';
        g.fillStyle = '#ffffff';
        g.font = `900 64px ${FONT}`;
        g.fillText(c.name, x + 30, 405);
        g.font = `400 30px ${FONT}`;
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillText(`${c.work} · ${c.technique}`, x + 32, 458);
        g.font = `900 46px ${JFONT}`;
        g.fillStyle = c.color;
        g.fillText(c.kanji, x + 30, 530);
      });
    } else if (n > 4) {
      // 5명 이상: 3열(7명 이상은 4열, 9명 이상은 5열 — 두 줄을 넘기면 글씨가 칸에 안 들어간다) 격자
      const cols = n > 8 ? 5 : n > 6 ? 4 : 3;
      const rows = Math.ceil(n / cols);
      const gap = 20;
      const cw = (W - 180 - gap * (cols - 1)) / cols;
      const chh = (285 - (rows - 1) * gap) / rows;
      CHARACTERS.forEach((c, i) => {
        const x = 90 + (i % cols) * (cw + gap);
        const y = 318 + Math.floor(i / cols) * (chh + gap);
        const active = this.sel.character === c.id;
        p.button(x, y, cw, chh, '', 'char:' + c.id, { active, accent: c.color + 'aa', r: 20 });
        g.textAlign = 'left';
        g.fillStyle = '#ffffff';
        let ns = 40;
        g.font = `900 ${ns}px ${FONT}`;
        while (ns > 26 && g.measureText(c.name).width > cw - 40) g.font = `900 ${(ns -= 2)}px ${FONT}`;
        g.fillText(c.name, x + 20, y + 46);
        let ks = 26;
        g.font = `900 ${ks}px ${JFONT}`;
        while (ks > 16 && g.measureText(c.kanji).width > cw - 40) g.font = `900 ${(ks -= 2)}px ${JFONT}`;
        g.fillStyle = c.color;
        g.fillText(c.kanji, x + 20, y + 84);
        let ts = 20;
        g.font = `400 ${ts}px ${FONT}`;
        const sub = `${c.work} · ${c.technique}`;
        while (ts > 14 && g.measureText(sub).width > cw - 40) g.font = `400 ${(ts -= 1)}px ${FONT}`;
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillText(sub, x + 20, y + chh - 14);
      });
    } else {
      // 3~4명: 2열 격자 (이름 · 작품/술식 · 대표 기술)
      const cols = 2;
      const rows = Math.ceil(n / cols);
      const gap = 24;
      const cw = (W - 180 - gap) / cols;
      const chh = (285 - (rows - 1) * gap) / rows;
      CHARACTERS.forEach((c, i) => {
        const x = 90 + (i % cols) * (cw + gap);
        const y = 318 + Math.floor(i / cols) * (chh + gap);
        const active = this.sel.character === c.id;
        p.button(x, y, cw, chh, '', 'char:' + c.id, { active, accent: c.color + 'aa', r: 22 });
        g.textAlign = 'left';
        g.fillStyle = '#ffffff';
        g.font = `900 46px ${FONT}`;
        g.fillText(c.name, x + 26, y + 58);
        const nameW = g.measureText(c.name).width;
        g.font = `400 24px ${FONT}`;
        g.fillStyle = 'rgba(255,255,255,0.78)';
        g.fillText(`${c.work} · ${c.technique}`, x + 28, y + chh - 22);
        g.textAlign = 'right';
        let ks = 32;
        g.font = `900 ${ks}px ${JFONT}`;
        while (ks > 18 && g.measureText(c.kanji).width > cw - nameW - 90) g.font = `900 ${(ks -= 2)}px ${JFONT}`;
        g.fillStyle = c.color;
        g.fillText(c.kanji, x + cw - 24, y + 56);
        g.textAlign = 'left';
      });
    }

    g.font = `700 34px ${FONT}`;
    g.fillStyle = '#ffffff';
    g.fillText('배경', 90, 650);
    Object.entries(BACKGROUNDS).forEach(([id, b], i) => {
      p.button(90 + i * 300, 675, 270, 100, b.label, 'bg:' + id, { active: this.sel.background === id, size: 34 });
    });
    p.button(W - 90 - 420, 820, 420, 120, '시작', 'start', { active: true, accent: '#d6334a', size: 52, weight: 900, r: 28 });
    g.font = `400 26px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillText('손가락으로 직접 누르기 · 멀리서는 손으로 가리키고 엄지와 검지를 맞대기', 90, 900);
    g.fillText('게임 중 메뉴: 퀘스트 기본 메뉴(왼손바닥을 얼굴 쪽으로 → ≡ 집기) · Y 버튼 · H 키', 90, 940);
  }

  // ───────────────── 옵션 ─────────────────
  _drawOptions(g, p) {
    const W = p.canvas.width;
    const H = p.canvas.height;
    rr(g, 6, 6, W - 12, H - 12, 36);
    g.fillStyle = 'rgba(8,12,26,0.92)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.stroke();
    const tabs = [['dummy', '더미 소환'], ['settings', '설정'], ['help', '조작법']];
    tabs.forEach(([id, label], i) => p.button(40 + i * 250, 34, 230, 80, label, 'tab:' + id, { active: this.tab === id, size: 32 }));
    p.button(W - 40 - 230, 34, 230, 80, '메인 메뉴', 'title', { size: 30, bg: 'rgba(214,51,74,0.35)' });
    p.button(W - 40 - 230 - 110, 34, 90, 80, '✕', 'close', { size: 36 });
    const S = this.ctx.settings;
    g.fillStyle = '#ffffff';
    if (this.tab === 'dummy') {
      g.font = `700 32px ${FONT}`;
      g.fillText('종류', 50, 172);
      // 첫 줄: 더미 · 둘째 줄: 주령 · 주저사
      const types = Object.entries(DUMMY_TYPES);
      const dum = types.filter(([, d]) => !d.model);
      const cur = types.filter(([, d]) => d.model);
      dum.forEach(([id, d], i) => p.button(50 + i * 258, 185, 240, 76, d.label, 'dtype:' + id, { active: this.spawn.type === id, size: 28 }));
      const cw = Math.min(240, Math.floor((W - 100) / Math.max(1, cur.length)) - 12);
      cur.forEach(([id, d], i) => p.button(50 + i * (cw + 12), 272, cw, 76, `${d.label}\n${d.grade ?? ''}`, 'dtype:' + id, { active: this.spawn.type === id, size: 24, accent: '#7a2e9a' }));
      g.fillStyle = '#ffffff';
      g.font = `700 32px ${FONT}`;
      g.fillText('체력', 50, 392);
      g.font = `400 22px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText('주령은 100 = 기본 체력, 나머지는 배율', 130, 392);
      g.fillStyle = '#ffffff';
      g.font = `700 32px ${FONT}`;
      const hps = [[50, '50'], [100, '100'], [300, '300'], [1000, '1000'], [Infinity, '∞']];
      hps.forEach(([v, l], i) => p.button(50 + i * 258, 405, 240, 80, l, 'dhp:' + i, { active: this.spawn.hp === v, size: 34, accent: '#2e9a5a' }));
      g.fillText('수량', 50, 530);
      [1, 3, 5].forEach((n, i) => p.button(50 + i * 258, 545, 240, 80, `${n}개`, 'dcount:' + n, { active: this.spawn.count === n, size: 34, accent: '#8a5a2e' }));
      p.button(50, 680, 620, 130, '소환', 'spawn', { active: true, accent: '#d6334a', size: 48, weight: 900 });
      p.button(700, 680, 310, 130, '모두 제거', 'clear', { size: 32 });
      p.button(1030, 680, 320, 130, `더미 AI\n${S.dummyAI ? '켜짐' : '꺼짐'}`, 'ai', { size: 30, active: S.dummyAI, accent: '#555' });
      p.button(50, 840, 480, 100, '아레나 초기화', 'resetArena', { size: 30 });
      p.button(560, 840, 450, 100, '적 영역전개 (영역 싸움)', 'edomain', { size: 28, accent: '#3a5ad6' });
      g.font = `400 24px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillText('B 버튼 / R 키: 선택한 더미 바로 소환', 50, 985);
      g.fillText('마히토 · 죠고 · 고죠는 스스로도 영역을 펼친다 → 같이 펼쳐 맞서기', 560, 985);
    } else if (this.tab === 'settings') {
      g.font = `700 32px ${FONT}`;
      g.fillText('배경', 50, 180);
      Object.entries(BACKGROUNDS).forEach(([id, b], i) => p.button(50 + i * 258, 200, 240, 90, b.label, 'bg:' + id, { active: this.ctx.env.id === id, size: 32 }));
      const toggles = [
        ['hud', '손목 HUD'], ['skillNames', '기술명 표시'], ['damageNumbers', '데미지 숫자'],
        ['invincible', '플레이어 무적'], ['locomotion', '이동 (스틱·엄지척)'], ['domainGesture', `${this.ctx.character?.domainLabel ?? '영역전개'} 손동작`], ['shadows', '그림자'],
        ['ctrlHands', '컨트롤러 손 모양'], ['cooldowns', '스킬 쿨타임'],
      ];
      const cid = this.ctx.character?.id;
      if (cid === 'sukuna') toggles.push(['kaminoRule', '카미노 원작 조건'], ['worldCutPC', '세계참 PC 연출']);
      if (cid === 'megumi') toggles.push(['mahoragaTamed', '마허라 조복됨'], ['dogTotality', '옥견 혼 (白 파괴됨)'], ['mahoragaRitual', '마허라 소환 연출']);
      g.fillText('옵션', 50, 345);
      toggles.forEach(([k, l], i) => p.button(50 + (i % 4) * 330, 365 + Math.floor(i / 4) * 100, 315, 86, `${l}  ${optVal(S, k) ? 'ON' : 'OFF'}`, 'opt:' + k, { active: optVal(S, k), size: 25, accent: '#2e6a9a' }));
      if (this.ctx.character?.castDomain) p.button(910, 735, 440, 90, `${this.ctx.character.domainLabel ?? '영역전개'} 발동`, 'castDomain', { size: 32, bg: 'rgba(110,60,200,0.5)' });
      g.fillStyle = '#ffffff';
      g.font = `700 32px ${FONT}`;
      g.fillText(`높이 보정  ${S.heightOffset >= 0 ? '+' : ''}${Math.round(S.heightOffset * 100)} cm`, 50, 710);
      p.button(50, 735, 160, 90, '−5', 'h:-', { size: 36 });
      p.button(230, 735, 160, 90, '+5', 'h:+', { size: 36 });
      p.button(410, 735, 200, 90, '초기화', 'h:0', { size: 30 });
      g.font = `400 26px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillText('세상이 크거나 작게 느껴지면 높이 보정으로 눈높이를 맞추세요.', 50, 880);
      g.fillText('VR 시작 전 기기에서 바닥 높이(가디언)를 설정해 두면 가장 정확합니다.', 50, 920);
    } else {
      this._drawHelp(g, p);
    }
  }

  /** 조작법: 왼쪽 목록 · 오른쪽 손 모양 영상 + 설명 */
  _helpLines() {
    const ch = this.ctx.character;
    const anyHand = this.ctx.input.hands.some((h) => h.source === 'hand');
    const cur = anyHand ? 'hand' : this.ctx.input.mode === 'desktop' ? 'desktop' : 'controller';
    const mode = this.help.view ?? cur;
    let lines = ch ? [...ch.helpLines(mode)] : [];
    // 컨트롤러를 손으로 쓰면: 손 추적과 같은 수인 + 버튼으로 손가락 만드는 법
    if (mode === 'controller' && this.ctx.settings.ctrlHands !== false && ch) {
      lines = [
        { head: '컨트롤러 = 손', color: '#ffffff', text: '트리거 = 검지 · 그립 = 중지·약지·새끼 · 엄지는 스틱/버튼에 대면 접힘, 떼면 폄\n아무것도 안 누름 = 편 손 · 그립+트리거 = 주먹 · 그립만 = 검지 · 그립만+엄지 뗌 = 두 손가락 · 트리거만 = 집기\n손 추적과 같은 손 모양·위치로 기술이 나간다. Y 메뉴 · B 더미 소환 · 왼쪽 스틱 이동 · 오른쪽 스틱 회전' },
        ...ch.helpLines('hand').map((l) => (l.demo && CTRL_HELP[l.demo] ? { ...l, text: l.text + '\n' + CTRL_HELP[l.demo] } : l)),
      ];
    }
    if (mode === 'hand' && this.ctx.settings.locomotion) lines.push({ head: '이동 (핸드트래킹)', color: '#7fd0ff', demo: 'common.loco', text: '왼손 엄지 척 → 그 자리에서 손을 민 방향으로 걷기\n오른손 엄지 척 → 옆으로 밀면 30° 회전' });
    return { lines, mode, cur };
  }

  _drawHelp(g, p) {
    const W = p.canvas.width;
    const { lines, mode } = this._helpLines();
    const H = this.help;
    if (H.sel >= lines.length) H.sel = 0;
    // 보기 전환: 핸드트래킹 손 모양은 어떤 입력에서도 볼 수 있다
    const views = [['hand', '손 모양'], ['controller', '컨트롤러'], ['desktop', '키보드']];
    views.forEach(([id, l], i) => p.button(40 + i * 175, 128, 160, 52, l, 'hview:' + id, { active: mode === id, size: 22, accent: '#5a4a9a' }));
    // 왼쪽 목록
    const top = 200;
    const rowH = Math.min(92, Math.floor((1010 - top) / Math.max(1, lines.length)) - 8);
    lines.forEach((l, i) => {
      const y = top + i * (rowH + 8);
      p.button(40, y, 600, rowH, '', 'help:' + i, { active: i === H.sel, accent: 'rgba(90,110,200,0.55)', r: 14 });
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      let fs = 28;
      g.font = `700 ${fs}px ${FONT}`;
      while (fs > 18 && g.measureText(l.head).width > 520) g.font = `700 ${(fs -= 1)}px ${FONT}`;
      g.fillStyle = l.color || '#ffffff';
      g.fillText(l.head, 62, y + rowH / 2);
      if (l.demo) {
        g.font = `400 20px ${FONT}`;
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.textAlign = 'right';
        g.fillText('▶ 손 모양', 625, y + rowH / 2);
      }
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
    });
    // 오른쪽: 영상 칸 + 설명
    const sel = lines[H.sel];
    rr(g, 670, 128, W - 710, 520, 18);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.stroke();
    if (sel && !sel.demo) {
      g.textAlign = 'center';
      g.font = `400 24px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillText(mode === 'hand' ? '손 모양 영상 없음' : '왼쪽 위 「손 모양」을 누르면 핸드트래킹 동작을 영상으로 볼 수 있어요', 670 + (W - 710) / 2, 390);
      g.textAlign = 'left';
    }
    if (sel) {
      g.font = `700 30px ${FONT}`;
      g.fillStyle = sel.color || '#ffffff';
      g.fillText(sel.head, 680, 700);
      g.font = `400 23px ${FONT}`;
      g.fillStyle = '#d5dcf0';
      let y = 742;
      for (const para of (sel.text || '').split('\n')) {
        for (const ln of wrap(g, para, W - 730)) {
          g.fillText(ln, 690, y);
          y += 31;
        }
        y += 6;
      }
    }
  }

  _onClick(id) {
    const ctx = this.ctx;
    const S = ctx.settings;
    this.ctx.sfx.click();
    const [k, v] = id.split(':');
    if (k === 'char') this.sel.character = v;
    else if (k === 'bg') {
      this.sel.background = v;
      if (this.mode === 'game') ctx.game.setBackground(v);
    } else if (id === 'start') ctx.game.start(this.sel.character, this.sel.background);
    else if (k === 'tab') this.tab = v;
    else if (k === 'help') {
      this.help.sel = +v;
      this.help.pinned = true;
      this.help.demoIdx = 0;
    } else if (k === 'hview') {
      this.help.view = v;
      this.help.sel = 0;
      this.help.pinned = false;
    }
    else if (id === 'close') this.showOptions(false);
    else if (id === 'title') ctx.game.toTitle();
    else if (k === 'dtype') this.spawn.type = v;
    else if (k === 'dhp') this.spawn.hp = [50, 100, 300, 1000, Infinity][+v];
    else if (k === 'dcount') this.spawn.count = +v;
    else if (id === 'spawn') {
      ctx.world.spawnDummies(this.spawn.type, this.spawn.hp, this.spawn.count);
      this.showOptions(false);
    } else if (id === 'edomain') {
      // 영역을 쓰는 적이 바로 영역전개 (영역 싸움 시험용)
      const inp = ctx.input;
      const list = ctx.world.dummies.filter((d) => d.alive && d.def.domain && !d.dying);
      list.sort((a, b) => a.root.position.distanceTo(inp.head) - b.root.position.distanceTo(inp.head));
      if (!list.length) this.callout('영역을 쓰는 적(마히토 · 죠고 · 고죠 사토루)을 먼저 소환하세요', { color: '#ffb0b0' });
      else if (ctx.world.clash.enemy) this.callout('이미 적의 영역이 펼쳐져 있다', { color: '#ffb0b0' });
      else {
        list[0].forceDomain = true;
        if (!ctx.settings.dummyAI) this.callout('더미 AI 가 꺼져 있으면 적이 움직이지 않습니다', { color: '#ffb0b0' });
        this.showOptions(false);
      }
    } else if (id === 'clear') {
      ctx.world.clearDummies();
      ctx.world.clearDebris();
    } else if (id === 'ai') S.dummyAI = !S.dummyAI;
    else if (id === 'resetArena') ctx.game.setBackground(ctx.env.id);
    else if (id === 'castDomain') {
      this.showOptions(false);
      ctx.character?.castDomain?.();
    }
    else if (k === 'opt') {
      S[v] = !optVal(S, v);
      if (v === 'locomotion') ctx.input.locomotion = S.locomotion;
      if (v === 'shadows') ctx.env.applyShadows();
    } else if (k === 'h') {
      S.heightOffset = v === '0' ? 0 : THREE.MathUtils.clamp(S.heightOffset + (v === '+' ? 0.05 : -0.05), -0.5, 0.5);
      ctx.game.applyHeight();
    }
    ctx.game.saveSettings();
    if (this.title.mesh.visible) this.title.redraw();
    if (this.options.mesh.visible) this.options.redraw();
  }

  _place(panel, dist, yOff = 0, scale = 1) {
    const inp = this.ctx.input;
    _v.copy(inp.headDir).setY(0);
    if (_v.lengthSq() < 1e-4) _v.set(0, 0, -1);
    _v.normalize();
    panel.mesh.scale.setScalar(scale);
    panel.mesh.position.copy(inp.head).addScaledVector(_v, dist);
    panel.mesh.position.y = Math.max(0.9, inp.head.y - 0.12 + yOff);
    panel.mesh.lookAt(inp.head.x, panel.mesh.position.y, inp.head.z);
  }

  /** 왼손 위에 작게 띄움 */
  _placeAtHand(panel, scale) {
    const inp = this.ctx.input;
    const L = inp.left;
    panel.mesh.scale.setScalar(scale);
    _v.subVectors(inp.head, L.palm).setY(0).normalize();
    panel.mesh.position.copy(L.palm).addScaledVector(_v, -0.05).add(_v2.set(0, 0.17 + (panel.mh * scale) / 2 - 0.15, 0));
    // 오른손으로 누르기 쉽게 살짝 오른쪽으로
    const right = _v2.set(-_v.z, 0, _v.x);
    panel.mesh.position.addScaledVector(right, -0.12);
    panel.mesh.lookAt(inp.head);
  }

  showTitle(show) {
    this.mode = show ? 'title' : 'game';
    this.title.mesh.visible = show;
    if (show) {
      this.options.mesh.visible = false;
      const xr = this.ctx.input.mode === 'xr';
      this._place(this.title, xr ? 0.62 : 2.0, xr ? -0.05 : 0.05, xr ? 0.55 : 1);
      this.title.redraw();
    }
    this.ctx.input.setRaysVisible(this.menuOpen);
  }

  showOptions(show) {
    if (this.mode !== 'game') return;
    this.options.mesh.visible = show;
    if (show) {
      const inp = this.ctx.input;
      if (inp.mode === 'xr' && inp.left.active) this._placeAtHand(this.options, 0.42);
      else this._place(this.options, inp.mode === 'xr' ? 0.6 : 1.35, -0.1, inp.mode === 'xr' ? 0.45 : 1);
      this.options.redraw();
    }
    this.ctx.input.setRaysVisible(this.menuOpen);
  }

  /** 캐릭터 업데이트 전에 호출. 메뉴가 열려 있으면 모든 손을 UI 전용으로 */
  handleInput(dt) {
    this._pokeCd -= dt;
    this.cursor.visible = false;
    const inp = this.ctx.input;
    const open = this.menuOpen;
    for (const h of inp.hands) h.uiBlock = open;
    if (!open) return;
    const panel = this.title.mesh.visible ? this.title : this.options;
    const mesh = panel.mesh;
    mesh.updateMatrixWorld();
    let hover = -1;
    const pointers = [];
    for (const h of inp.hands) {
      if (!h.active) continue;
      if (h.source === 'hand') {
        const local = mesh.worldToLocal(_v.copy(h.indexTip));
        const r = panel.hit(local);
        const zw = local.z * mesh.scale.x; // 패널 면까지의 실제 거리(m)
        const prev = this._pokePrev[h.side];
        this._pokePrev[h.side] = zw;
        const near = r.inside && Math.abs(zw) < 0.1;
        // 멀리 있으면 손 포인터 + 집기(엄지·검지)로 클릭
        if (!near) pointers.push([h.rayPos, h.rayDir, h.pinchPressed, h]);
        if (near) {
          if (r.index >= 0) hover = r.index;
          if (r.index >= 0 && prev > 0.008 && zw <= 0.008 && this._pokeCd <= 0) {
            h.pulse(0.5, 25);
            this._pokeCd = 0.35;
            this._onClick(panel.buttons[r.index].id);
            return;
          }
        }
      } else if (h.source === 'controller') pointers.push([h.pos, h.dir, h.pressed('trigger'), h]);
    }
    if (inp.mode === 'desktop') pointers.push([inp.head, inp.headDir, inp.mouseLeftPressed, null]);
    for (const [o, d, click, h] of pointers) {
      _ray.set(o, d);
      _plane.setFromNormalAndCoplanarPoint(_v2.set(0, 0, 1).applyQuaternion(mesh.quaternion), mesh.position);
      const hit = _ray.intersectPlane(_plane, _v);
      if (!hit) continue;
      const local = mesh.worldToLocal(_v2.copy(hit));
      const r = panel.hit(local);
      if (!r.inside) continue;
      this.cursor.position.copy(hit);
      this.cursor.visible = true;
      if (r.index >= 0) hover = r.index;
      if (r.index >= 0 && click) {
        h?.pulse(0.5, 25);
        this._onClick(panel.buttons[r.index].id);
        return;
      }
    }
    if (hover !== panel.hover) {
      panel.hover = hover;
      panel.redraw();
    }
  }

  // ───────────────── 만화풍 기술명 ─────────────────
  /**
   * @param {object} o { top: '術式順転', main: '蒼', ruby: 'あお', color: '#3aa0ff', big: false, pos, sub }
   */
  manga(o) {
    if (!this.ctx.settings.skillNames) return;
    const big = !!o.big;
    const cw = 1024;
    const ch = 512;
    const c = canvasPlane(cw, ch, big ? 2.4 : 1.05, big ? 1.2 : 0.525, { renderOrder: 55, depthTest: false });
    const g = c.g;
    const col = o.color ?? '#ff3040';
    g.save();
    g.translate(cw / 2, ch / 2);
    g.rotate(((Math.random() - 0.5) * 8 * Math.PI) / 180);
    // 상단 작은 문구
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (o.top) {
      g.font = `900 64px ${JFONT}`;
      g.lineJoin = 'round';
      g.lineWidth = 14;
      g.strokeStyle = '#000000';
      g.strokeText(o.top, 0, -120);
      g.lineWidth = 8;
      g.strokeStyle = '#ffffff';
      g.strokeText(o.top, 0, -120);
      g.fillStyle = '#111';
      g.fillText(o.top, 0, -120);
    }
    // 메인
    const main = o.main;
    const size = main.length <= 1 ? 230 : main.length <= 3 ? 170 : main.length <= 5 ? 140 : 110;
    g.font = `900 ${size}px ${JFONT}`;
    g.lineJoin = 'round';
    // 말풍선·네온 없이: 검은 글씨 + 흰 테두리 + 얇은 검은 외곽선 (어느 배경에서도 읽히게)
    g.lineWidth = 18;
    g.strokeStyle = '#000000';
    g.strokeText(main, 0, 30);
    g.lineWidth = 11;
    g.strokeStyle = '#ffffff';
    g.strokeText(main, 0, 30);
    g.fillStyle = '#0a0a0a';
    g.fillText(main, 0, 30);
    if (o.ruby) {
      g.font = `700 44px ${JFONT}`;
      g.lineWidth = 12;
      g.strokeStyle = '#000';
      g.strokeText(o.ruby, 0, 30 + size * 0.62);
      g.lineWidth = 7;
      g.strokeStyle = '#fff';
      g.strokeText(o.ruby, 0, 30 + size * 0.62);
      g.fillStyle = col;
      g.fillText(o.ruby, 0, 30 + size * 0.62);
    }
    if (o.sub) {
      g.font = `700 40px ${FONT}`;
      g.lineWidth = 8;
      g.strokeStyle = '#000';
      g.strokeText(o.sub, 0, 205);
      g.fillStyle = '#fff';
      g.fillText(o.sub, 0, 205);
    }
    g.restore();
    c.tex.needsUpdate = true;
    const inp = this.ctx.input;
    const m = c.mesh;
    const side = o.side === 'left' ? -1 : o.side === 'right' ? 1 : 0;
    m.position.copy(inp.head).addScaledVector(inp.headDir, big ? 3 : 1.5);
    _v.set(side * (big ? 0 : 0.35), big ? 0.15 : 0.32, 0).applyQuaternion(inp.headQuat);
    m.position.add(_v);
    m.lookAt(inp.head);
    this.scene.add(m);
    // 같은 기술명이 연달아 쌓이지 않게 오래된 것 정리
    while (this.mangas.length > 3) this._removeManga(this.mangas[0]);
    this.mangas.push({ c, t: 0, dur: o.dur ?? (big ? 3.2 : 1.5), base: m.position.clone(), big });
  }

  _removeManga(o) {
    this.scene.remove(o.c.mesh);
    o.c.tex.dispose();
    o.c.mat.dispose();
    o.c.mesh.geometry.dispose();
    this.mangas.splice(this.mangas.indexOf(o), 1);
  }

  /** 작은 한글 안내 문구 */
  callout(text, o = {}) {
    const c = canvasPlane(1024, 140, 0.8, 0.11, { renderOrder: 45, depthTest: false });
    const g = c.g;
    let size = o.size ?? 72;
    g.font = `800 ${size}px ${FONT}`;
    while (g.measureText(text).width > 980 && size > 24) {
      size -= 4;
      g.font = `800 ${size}px ${FONT}`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(text, 512, 72);
    g.fillStyle = o.color || '#ffffff';
    g.fillText(text, 512, 72);
    c.tex.needsUpdate = true;
    const inp = this.ctx.input;
    c.mesh.position.copy(inp.head).addScaledVector(inp.headDir, 1.3).add(_v.set(0, -0.28, 0));
    c.mesh.lookAt(inp.head);
    this.scene.add(c.mesh);
    for (const old of this.callouts) old.t = Math.max(old.t, old.dur * 0.7);
    this.callouts.push({ c, t: 0, dur: o.dur ?? 1.4 });
  }

  // ───────────────── 데미지 숫자 ─────────────────
  damageNumber(target, amount, info = {}) {
    if (!this.ctx.settings.damageNumbers) return;
    // 지속 피해는 0.3초마다 합산해서 표시
    if (info.silent) {
      target._acc = (target._acc ?? 0) + amount;
      const now = this.ctx.world.time;
      if (now - (target._accT ?? -1) < 0.3) return;
      target._accT = now;
      amount = target._acc;
      target._acc = 0;
      if (amount < 1) return;
    }
    const n = this.numbers[this._numCursor];
    this._numCursor = (this._numCursor + 1) % this.numbers.length;
    const g = n.c.getContext('2d');
    g.clearRect(0, 0, 192, 80);
    const val = amount >= 10 ? Math.round(amount) : amount.toFixed(1);
    const big = amount >= 60;
    g.font = `900 ${big ? 60 : 48}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#000';
    g.strokeText(val, 96, 42);
    g.fillStyle = info.color ?? (big ? '#ffd23a' : '#ffffff');
    g.fillText(val, 96, 42);
    n.t.needsUpdate = true;
    const p = target.headPos ? target.headPos(_v) : target.center(_v);
    n.s.position.copy(p).add(_v2.set((Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3));
    n.vel.set((Math.random() - 0.5) * 0.4, 0.9, (Math.random() - 0.5) * 0.4);
    n.life = 0.9;
    n.s.visible = true;
    n.s.material.opacity = 1;
    const sc = big ? 0.38 : 0.28;
    n.s.scale.set(sc, sc * 0.42, 1);
  }

  damageFlash(amount) {
    this.vignette.material.opacity = Math.min(0.6, this.vignette.material.opacity + amount * 0.03);
  }

  _drawHud() {
    const { g, canvas, tex } = this.hud;
    const ch = this.ctx.character;
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    rr(g, 4, 4, W - 8, H - 8, 26);
    g.fillStyle = 'rgba(6,10,24,0.78)';
    g.fill();
    if (!ch) return;
    let y = 22;
    for (const r of ch.hudRows()) {
      g.font = `700 26px ${FONT}`;
      g.fillStyle = r.color || '#ffffff';
      g.textBaseline = 'top';
      g.fillText(r.label, 24, y);
      if (r.bar !== undefined) {
        rr(g, 170, y + 4, W - 200, 22, 10);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fill();
        rr(g, 170, y + 4, Math.max(12, (W - 200) * Math.min(1, r.bar)), 22, 10);
        g.fillStyle = r.color || '#7fd4ff';
        g.fill();
      } else if (r.text) {
        g.font = `400 26px ${FONT}`;
        g.fillStyle = r.textColor || '#dfe6ff';
        g.fillText(r.text, 170, y);
      }
      y += 44;
    }
    tex.needsUpdate = true;
  }

  _updateLabels() {
    const W = this.ctx.world;
    const alive = new Set();
    for (const d of W.dummies) {
      if (!d.infinite || !d.alive) continue;
      alive.add(d);
      let L = this.labels.get(d);
      if (!L) {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 110;
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
        s.scale.set(0.5, 0.17, 1);
        s.renderOrder = 48;
        this.scene.add(s);
        L = { s, c, t, last: '' };
        this.labels.set(d, L);
      }
      const txt = `${Math.round(d.totalDamage)}|${Math.round(d.dps)}`;
      if (txt !== L.last) {
        L.last = txt;
        const g = L.c.getContext('2d');
        g.clearRect(0, 0, 320, 110);
        rr(g, 4, 4, 312, 102, 18);
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fill();
        g.font = `700 32px ${FONT}`;
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.fillText(`누적 ${Math.round(d.totalDamage)}`, 160, 46);
        g.fillStyle = '#ffd23a';
        g.fillText(`DPS ${Math.round(d.dps)}`, 160, 88);
        L.t.needsUpdate = true;
      }
      d.headPos(L.s.position).add(_v.set(0, 0.35 * d.scale, 0));
      L.s.visible = this.ctx.settings.damageNumbers;
    }
    for (const [d, L] of this.labels) {
      if (!alive.has(d)) {
        this.scene.remove(L.s);
        L.t.dispose();
        L.s.material.dispose();
        this.labels.delete(d);
      }
    }
  }

  _updateHelpDemo(dt) {
    const D = this.handDemo;
    const on = this.options.mesh.visible && this.tab === 'help' && !!this.ctx.character;
    if (!on) {
      D.group.visible = false;
      D.play(null);
      return;
    }
    const H = this.help;
    const { lines } = this._helpLines();
    // 아무것도 고르지 않았으면 손 모양이 있는 항목을 차례로 보여준다
    if (!H.pinned) {
      H.auto -= dt;
      if (H.auto <= 0) {
        const n = lines.length;
        for (let i = 1; i <= n; i++) {
          const j = (H.sel + i) % n;
          if (lines[j]?.demo) {
            H.sel = j;
            H.demoIdx = 0;
            H.demoT = 0;
            H.auto = Array.isArray(lines[j].demo) ? lines[j].demo.reduce((a, d) => a + this.handDemo.durOf(d) * 2, 0) : Math.max(4.5, this.handDemo.durOf(lines[j].demo) * 2);
            break;
          }
        }
        this.options.redraw();
      }
    }
    const sel = lines[H.sel];
    let id = sel?.demo ?? null;
    // 한 항목에 수인이 둘이면 번갈아
    if (Array.isArray(id)) {
      H.demoT += dt;
      const cur = id[H.demoIdx % id.length];
      const dur = D.durOf(cur);
      if (H.demoT > dur * 2) {
        H.demoT = 0;
        H.demoIdx++;
      }
      id = id[H.demoIdx % id.length];
    }
    D.play(id);
    D.update(dt);
  }

  _updateMenuIcon(dt) {
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    const icon = this.menuIcon.mesh;
    this._iconCd -= dt;
    let show = false;
    void R;
    if (inp.mode === 'xr' && L.active && L.source === 'hand') {
      _v.subVectors(inp.head, L.palm);
      const d = _v.length();
      _v.normalize();
      show = d < 0.65 && L.palmNormal.dot(_v) > 0.6 && Math.abs(L.palmNormal.y) < 0.7 && L.gesture !== 'fist';
      if (show) {
        icon.position.copy(L.palm).addScaledVector(_v, 0.06).add(_v2.set(0, 0.08, 0));
        icon.lookAt(inp.head);
      }
    }
    // 아이콘은 그리지 않는다 (퀘스트가 같은 자리에 기본 ≡ 아이콘을 띄움). 같은 손동작(왼손바닥을 얼굴로 + 집기)만 받는다
    icon.visible = false;
    if (!show || this._iconCd > 0) return;
    if (L.pinchPressed) {
      this._iconCd = 0.6;
      this.lastMenuToggle = performance.now();
      this.ctx.sfx.click();
      L.pulse(0.4, 30);
      if (this.mode === 'game') this.showOptions(!this.options.mesh.visible);
      else if (this.mode === 'title') this.showTitle(true);
    }
  }

  update(dt) {
    const inp = this.ctx.input;
    const S = this.ctx.settings;
    this._updateMenuIcon(dt);
    this._updateHelpDemo(dt);
    // HUD
    const hm = this.hud.mesh;
    const L = inp.left;
    if (S.hud && this.mode === 'game' && inp.mode === 'xr' && L.active) {
      hm.visible = true;
      _v.subVectors(inp.head, L.palm).normalize();
      hm.position.copy(L.palm).addScaledVector(_v, 0.06).add(_v2.set(0, 0.09, 0));
      hm.lookAt(inp.head);
    } else if (S.hud && this.mode === 'game' && inp.mode === 'desktop') {
      hm.visible = true;
      hm.position.copy(inp.head).addScaledVector(inp.headDir, 0.5).add(_v.set(-0.22, -0.14, 0).applyQuaternion(inp.headQuat));
      hm.quaternion.copy(inp.headQuat);
    } else hm.visible = false;
    if (hm.visible) {
      this._hudT -= dt;
      if (this._hudT <= 0) {
        this._hudT = 0.12;
        this._drawHud();
      }
    }

    for (let i = this.mangas.length - 1; i >= 0; i--) {
      const o = this.mangas[i];
      o.t += dt;
      const k = o.t / o.dur;
      const m = o.c.mesh;
      const pop = o.t < 0.12 ? 1.5 - (o.t / 0.12) * 0.5 : 1;
      m.scale.setScalar(pop);
      m.position.copy(o.base);
      if (o.t < 0.35) m.position.add(_v.set((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, 0));
      o.c.mat.opacity = k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
      if (k >= 1) this._removeManga(o);
    }
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const o = this.callouts[i];
      o.t += dt;
      const k = o.t / o.dur;
      o.c.mat.opacity = k < 0.12 ? k / 0.12 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
      if (k >= 1) {
        this.scene.remove(o.c.mesh);
        o.c.tex.dispose();
        o.c.mat.dispose();
        o.c.mesh.geometry.dispose();
        this.callouts.splice(i, 1);
      }
    }
    for (const n of this.numbers) {
      if (n.life <= 0) continue;
      n.life -= dt;
      n.s.position.addScaledVector(n.vel, dt);
      n.vel.y -= dt * 1.2;
      n.s.material.opacity = Math.min(1, n.life / 0.3);
      if (n.life <= 0) n.s.visible = false;
    }
    this._updateLabels();
    const vm = this.vignette.material;
    vm.opacity = Math.max(0, vm.opacity - dt * 0.8);
    this.vignette.visible = vm.opacity > 0.01;
  }
}
