// 야가미 라이토 — 데스노트
//  · 왼손바닥을 위로 펴면 데스노트가 펼쳐진다 (그 외에는 닫힌 노트를 쥔다)
//  · 오른손은 연필을 쥔다 (엄지·검지로 집는 자세). 연필 끝을 종이에 대고 실제로 글씨를 쓴다
//  · 연필을 뒤집어 뒤쪽 지우개로 지울 수 있다
//  · 대상의 얼굴을 보고(이름이 뜸) 한 줄에 이름을 쓰고 펜을 떼면 기록 → 일정 시간 뒤 심장마비
import * as THREE from 'three';
import { getModel, fitModel } from '../../core/assets.js';
const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

const PAGE_W = 0.16;
const PAGE_H = 0.225;
const CW = 512;
const CH = 720;
const LINES = 11;
const TOP = 110;
const BOTTOM = 70;
const LINE_H = (CH - TOP - BOTTOM) / LINES;
const PENCIL_LEN = 0.18;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function paperCanvas(paperImg) {
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const g = c.getContext('2d');
  if (paperImg) {
    try {
      // 원본 텍스처의 검은 여백(테두리)은 잘라내고 종이 부분만 쓴다
      const iw = paperImg.width || 1024;
      const ih = paperImg.height || 1024;
      g.drawImage(paperImg, iw * 0.152, ih * 0.168, iw * 0.696, ih * 0.66, 0, 0, CW, CH);
    } catch (_) {
      paperImg = null;
    }
  }
  if (!paperImg) {
    g.fillStyle = '#e6dcc4';
    g.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 4000; i++) {
      const v = 180 + Math.random() * 60;
      g.fillStyle = `rgba(${v},${v - 10},${v - 30},0.12)`;
      g.fillRect(Math.random() * CW, Math.random() * CH, 2, 2);
    }
  }
  // 가장자리 얼룩
  const grd = g.createRadialGradient(CW / 2, CH / 2, CH * 0.3, CW / 2, CH / 2, CH * 0.75);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(80,50,20,0.22)');
  g.fillStyle = grd;
  g.fillRect(0, 0, CW, CH);
  return c;
}

export class Light {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'light';
    this.name = '야가미 라이토';
    const scene = ctx.scene;
    this.entries = [];
    this.pending = [];
    this.kills = 0;
    this.known = null;
    this.gaze = { d: null, t: 0 };
    this.tags = new Map();
    this.lastPt = null;
    this.penDown = false;
    this.lastWriteT = -10;
    this.scratchT = 0;
    this.openK = 0;

    // ── 노트 ──
    this.book = new THREE.Group();
    scene.add(this.book);
    const noteSrc = getModel('death_note');
    let paperImg = null;
    let coverMap = null;
    noteSrc?.traverse((o) => {
      if (o.isMesh && o.material?.name === 'PAPERS') paperImg = o.material.map?.image ?? null;
      if (o.isMesh && o.material?.name === 'DEATH_NOTE') coverMap = o.material.map ?? null;
    });
    this.paperImg = paperImg;
    this.closed = noteSrc ? fitModel(noteSrc, { width: 0.17 }) : this._fallbackClosed();
    this.book.add(this.closed);

    this.openG = new THREE.Group();
    this.book.add(this.openG);
    const board = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W * 2 + 0.006, 0.004, PAGE_H + 0.003), new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.75, map: coverMap }));
    board.position.y = -0.003;
    this.openG.add(board);
    // 왼쪽 장: 사용법, 오른쪽 장: 쓰는 곳
    this.leftCanvas = paperCanvas(paperImg);
    this._drawRules(this.leftCanvas.getContext('2d'));
    this.bg = paperCanvas(paperImg);
    this._drawLines(this.bg.getContext('2d'));
    this.ink = document.createElement('canvas');
    this.ink.width = CW;
    this.ink.height = CH;
    this.inkG = this.ink.getContext('2d');
    this.pageCanvas = document.createElement('canvas');
    this.pageCanvas.width = CW;
    this.pageCanvas.height = CH;
    const mkPage = (canvas, x) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(PAGE_W, PAGE_H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.0005, 0);
      this.openG.add(m);
      return { m, tex };
    };
    this.left = mkPage(this.leftCanvas, -PAGE_W / 2 - 0.0006);
    this.right = mkPage(this.pageCanvas, PAGE_W / 2 + 0.0006);
    // 가운데 접힌 자국
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.0012, PAGE_H), new THREE.MeshBasicMaterial({ color: 0x8a7a60 }));
    this.openG.add(fold);
    this._composePage();

    // ── 연필 ──
    const pencilSrc = getModel('pencil');
    this.pencil = pencilSrc ? fitModel(pencilSrc, { height: PENCIL_LEN }) : this._fallbackPencil();
    scene.add(this.pencil);
    this.tip = new THREE.Vector3();
    this.eraser = new THREE.Vector3();
    this.penAxis = new THREE.Vector3(0, 1, 0);
  }

  _fallbackClosed() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.014, 0.24), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    b.position.y = 0.007;
    g.add(b);
    return g;
  }

  _fallbackPencil() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, PENCIL_LEN * 0.85, 6), new THREE.MeshStandardMaterial({ color: 0xe8b020 }));
    body.position.y = PENCIL_LEN * 0.5;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, PENCIL_LEN * 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    tip.rotation.x = Math.PI;
    tip.position.y = PENCIL_LEN * 0.05;
    const er = new THREE.Mesh(new THREE.CylinderGeometry(0.0047, 0.0047, PENCIL_LEN * 0.06, 8), new THREE.MeshStandardMaterial({ color: 0xff8a9a }));
    er.position.y = PENCIL_LEN * 0.96;
    g.add(body, tip, er);
    return g;
  }

  _drawRules(g) {
    g.fillStyle = '#1a1410';
    g.textBaseline = 'top';
    g.font = `900 40px ${FONT}`;
    g.fillText('사용법', 40, 40);
    g.font = `400 21px ${FONT}`;
    const rules = [
      '1. 이 노트에 이름이 적힌 사람은 죽는다.',
      '2. 쓰는 사람이 그 얼굴을 알고 있어야 한다.',
      '   (대상을 바라보면 머리 위에 이름이 보인다)',
      '3. 사인을 적지 않으면 심장마비로 죽는다.',
      '4. 이름을 쓴 뒤 펜을 떼면 기록된다.',
      '   기록된 이름은 지워도 되돌릴 수 없다.',
      '',
      '— 쓰는 법 —',
      '왼손바닥을 위로: 노트를 편다',
      '오른손 엄지·검지로 연필을 쥔다',
      '연필 끝을 오른쪽 장의 줄 위에 댄다',
      '연필을 뒤집어 지우개로 지운다',
      '오른쪽 아래 ▶ 에 연필을 대면 새 장',
    ];
    rules.forEach((r, i) => g.fillText(r, 40, 110 + i * 34));
  }

  _drawLines(g) {
    g.fillStyle = '#1a1410';
    g.font = `900 34px ${FONT}`;
    g.textBaseline = 'top';
    g.fillText('DEATH NOTE', 40, 34);
    g.strokeStyle = 'rgba(60,40,20,0.45)';
    g.lineWidth = 1.5;
    for (let i = 1; i <= LINES; i++) {
      const y = TOP + i * LINE_H;
      g.beginPath();
      g.moveTo(26, y);
      g.lineTo(CW - 26, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(30,20,10,0.75)';
    g.font = `700 28px ${FONT}`;
    g.fillText('▶', CW - 54, CH - 52);
  }

  _composePage() {
    const g = this.pageCanvas.getContext('2d');
    g.clearRect(0, 0, CW, CH);
    g.drawImage(this.bg, 0, 0);
    g.drawImage(this.ink, 0, 0);
    // 기록된 이름 표시
    g.font = `700 18px ${FONT}`;
    g.textBaseline = 'alphabetic';
    for (const e of this.entries) {
      if (!e.committed) continue;
      const y = TOP + (e.line + 1) * LINE_H - 6;
      g.fillStyle = e.target ? 'rgba(150,0,0,0.85)' : 'rgba(80,80,80,0.6)';
      g.textAlign = 'right';
      g.fillText(e.target ? `${e.name} · 심장마비` : '효과 없음 (얼굴을 모름)', CW - 30, y);
      g.textAlign = 'left';
    }
    this.right.tex.needsUpdate = true;
    this.dirty = false;
  }

  // ───────── 메뉴/HUD ─────────
  helpLines(mode) {
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴 · R 더미 소환' },
        { head: '데스노트', color: '#e0e0e0', text: '더미를 바라봐서 이름을 확인 → 아래 노트의 줄을 조준하고\n좌클릭을 누른 채 마우스로 글씨 쓰기 · 우클릭: 지우개' },
        { head: '기타', color: '#9fd0ff', text: 'T: 잡기/던지기 · V: 주먹' },
      ];
    }
    return [
      { head: '데스노트 펴기', color: '#e0e0e0', text: '왼손바닥을 위로 펴면 노트가 펼쳐진다' },
      { head: '이름 쓰기', color: '#ff8080', text: '대상을 바라봐서 머리 위의 이름을 확인한 뒤\n오른손 연필 끝을 오른쪽 장의 한 줄에 대고 실제로 쓴다 → 펜을 떼면 기록' },
      { head: '지우기 · 새 장', color: '#ffffff', text: '연필을 뒤집어 뒤쪽 지우개를 종이에 문지르기 · 오른쪽 아래 ▶에 연필을 대면 새 장' },
      { head: '사망', color: '#ff5050', text: '기록 후 6초(설정에서 원작 40초) 뒤 심장마비' },
      { head: '잡기 · 흑섬', color: '#9fd0ff', text: '오른손으로 더미에 손을 대고 주먹 → 잡기, 펴면 던지기' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    return [
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff9fa0' },
      { label: '대상', text: this.known?.d?.alive ? this.known.d.name : '없음' },
      { label: '대기', text: `${this.pending.length}명` },
      { label: '처치', text: `${this.kills}` },
    ];
  }

  handBusy(side) {
    return side === 'left';
  }

  get delay() {
    return this.ctx.settings.deathDelay40 ? 40 : 6;
  }

  // ───────── 메인 ─────────
  update(dt) {
    const { input: inp } = this.ctx;
    this._updateBookPose(dt);
    this._updatePencilPose(dt);
    if (!this.ctx.ui.menuOpen) {
      this._updateGaze(dt);
      this._write(dt);
    }
    this._commitCheck();
    this._updatePending();
    this._updateTags();
    if (this.dirty) this._composePage();
    void inp;
  }

  _updateBookPose(dt) {
    const inp = this.ctx.input;
    const L = inp.left;
    let open = true;
    const pos = _v;
    const X = new THREE.Vector3();
    const Y = new THREE.Vector3();
    const Z = new THREE.Vector3();
    if (inp.mode === 'desktop') {
      const f = _v2.copy(inp.headDir).setY(0).normalize();
      X.crossVectors(f, UP).normalize();
      Y.copy(f).multiplyScalar(-0.75).addScaledVector(UP, 0.66).normalize();
      Z.crossVectors(X, Y).normalize();
      pos.copy(inp.head).addScaledVector(f, 0.4).add(_v3.set(0, -0.3, 0));
    } else if (L.active && L.source === 'controller') {
      Y.set(0, 1, 0).applyQuaternion(L.quat);
      Z.set(0, 0, 1).applyQuaternion(L.quat);
      X.crossVectors(Y, Z).normalize();
      pos.copy(L.palm).addScaledVector(Y, 0.05);
    } else if (L.active && L.source === 'hand') {
      open = L.palmNormal.y > 0.35;
      Y.copy(L.palmNormal);
      if (!open) Y.negate();
      Z.copy(L.fingersDir).negate();
      Z.addScaledVector(Y, -Z.dot(Y)).normalize();
      X.crossVectors(Y, Z).normalize();
      pos.copy(L.palm).addScaledVector(open ? Y : L.palmNormal, open ? 0.025 : -0.03).addScaledVector(X, open ? 0.02 : 0);
    } else {
      this.book.visible = false;
      return;
    }
    this.book.visible = true;
    _m.makeBasis(X, Y, Z);
    _q.setFromRotationMatrix(_m);
    const k = 1 - Math.exp(-dt * 18);
    if (this._snap) {
      this.book.position.copy(pos);
      this.book.quaternion.copy(_q);
      this._snap = false;
    } else {
      this.book.position.lerp(pos, k);
      this.book.quaternion.slerp(_q, k);
    }
    this.openK = THREE.MathUtils.lerp(this.openK, open ? 1 : 0, 1 - Math.exp(-dt * 10));
    this.isOpen = this.openK > 0.5;
    this.openG.visible = this.openK > 0.05;
    this.closed.visible = this.openK < 0.95;
    this.openG.scale.set(Math.max(0.05, this.openK), 1, 1);
    this.closed.scale.setScalar(1 - this.openK * 0.9);
  }

  _updatePencilPose() {
    const inp = this.ctx.input;
    const R = inp.right;
    if (inp.mode === 'desktop' || !R.active) {
      this.pencil.visible = false;
      return;
    }
    this.pencil.visible = true;
    if (R.source === 'hand' && R.joints) {
      const m = inp.rig.matrixWorld;
      const J = R.joints;
      const thumb = _v.copy(J['thumb-tip']).applyMatrix4(m);
      const index = _v2.copy(J['index-finger-tip']).applyMatrix4(m);
      const grip = thumb.add(index).multiplyScalar(0.5);
      const back = _v3.copy(J['index-finger-metacarpal']).applyMatrix4(m);
      this.penAxis.subVectors(back, grip).normalize();
      this.tip.copy(grip).addScaledVector(this.penAxis, -0.03);
    } else {
      this.penAxis.copy(R.dir).negate();
      this.tip.copy(R.pos).addScaledVector(R.dir, 0.06);
    }
    this.eraser.copy(this.tip).addScaledVector(this.penAxis, PENCIL_LEN);
    this.pencil.position.copy(this.tip);
    this.pencil.quaternion.setFromUnitVectors(UP, this.penAxis);
  }

  /** 시선으로 얼굴을 확인 → 이름을 안다 */
  _updateGaze(dt) {
    const inp = this.ctx.input;
    let best = null;
    let bestA = 0.2;
    for (const d of this.ctx.world.dummies) {
      if (!d.alive || d.dying) continue;
      const hp = d.headPos(_v);
      const to = _v2.subVectors(hp, inp.head);
      const dist = to.length();
      if (dist > 35) continue;
      const a = Math.acos(THREE.MathUtils.clamp(to.normalize().dot(inp.headDir), -1, 1));
      // 얼굴이 이쪽을 향하는지 (더미 앞 방향 = +Z)
      const face = _v3.set(0, 0, 1).applyQuaternion(d.root.quaternion);
      const facing = face.dot(to.negate()) > -0.1;
      if (a < bestA && facing) {
        bestA = a;
        best = d;
      }
    }
    if (best && best === this.gaze.d) {
      this.gaze.t += dt;
      if (this.gaze.t > 0.35 && this.known?.d !== best) {
        this.known = { d: best, t: this.ctx.world.time };
        this.ctx.sfx.tone({ type: 'sine', f0: 900, f1: 1100, dur: 0.06, vol: 0.06 });
      }
      if (this.known?.d === best) this.known.t = this.ctx.world.time;
    } else {
      this.gaze.d = best;
      this.gaze.t = 0;
    }
  }

  _pageLocal(worldP, out) {
    this.right.m.updateMatrixWorld();
    return this.right.m.worldToLocal(out.copy(worldP));
  }

  _toCanvas(local) {
    return [(local.x / PAGE_W + 0.5) * CW, (0.5 - local.y / PAGE_H) * CH];
  }

  _write(dt) {
    const inp = this.ctx.input;
    this.scratchT -= dt;
    if (!this.book.visible || !this.isOpen) {
      this.penDown = false;
      this.lastPt = null;
      return;
    }
    let contact = false;
    let erase = false;
    let local = null;
    if (inp.mode === 'desktop') {
      // 화면 중앙 조준점이 종이에 닿은 곳
      const ray = new THREE.Ray(inp.head, inp.headDir);
      this.right.m.updateMatrixWorld();
      const n = _v.set(0, 0, 1).transformDirection(this.right.m.matrixWorld);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, this.right.m.getWorldPosition(_v2));
      const hit = ray.intersectPlane(plane, _v3);
      if (hit) {
        local = this._pageLocal(hit, new THREE.Vector3());
        local.z = 0;
        contact = inp.mouse.left;
        erase = inp.mouse.right;
      }
    } else if (this.pencil.visible) {
      const lt = this._pageLocal(this.tip, new THREE.Vector3());
      const le = this._pageLocal(this.eraser, new THREE.Vector3());
      const inside = (l) => Math.abs(l.x) < PAGE_W / 2 && Math.abs(l.y) < PAGE_H / 2;
      if (inside(le) && le.z < 0.014 && le.z > -0.04) {
        erase = true;
        local = le;
      } else if (inside(lt) && lt.z < 0.006 && lt.z > -0.03) {
        contact = true;
        local = lt;
      }
    }
    if (erase && local) {
      const [cx, cy] = this._toCanvas(local);
      this.inkG.save();
      this.inkG.globalCompositeOperation = 'destination-out';
      this.inkG.beginPath();
      this.inkG.arc(cx, cy, 16, 0, Math.PI * 2);
      this.inkG.fill();
      this.inkG.restore();
      const line = Math.floor((cy - TOP) / LINE_H);
      const e = this.entries.find((x) => x.line === line && !x.committed);
      if (e) e.ink = Math.max(0, e.ink - 12);
      this.dirty = true;
      this.penDown = false;
      this.lastPt = null;
      if (this.scratchT <= 0) {
        this.scratchT = 0.1;
        this.ctx.sfx.noise({ dur: 0.08, vol: 0.06, f0: 1500, f1: 800, type: 'bandpass', q: 2 });
      }
      inp.right.pulse(0.15, 15);
      return;
    }
    if (contact && local) {
      const [cx, cy] = this._toCanvas(local);
      // 새 장
      if (cx > CW - 80 && cy > CH - 70) {
        if (!this._pageCd || this._pageCd < this.ctx.world.time) {
          this._pageCd = this.ctx.world.time + 1;
          this._newPage();
        }
        return;
      }
      const line = Math.floor((cy - TOP) / LINE_H);
      if (line < 0 || line >= LINES) {
        this.lastPt = null;
        return;
      }
      let e = this.entries.find((x) => x.line === line);
      if (e?.committed) {
        // 이미 기록된 줄에는 덧쓰기만 (효과 없음)
      } else if (!e) {
        e = { line, ink: 0, lastT: 0, committed: false };
        this.entries.push(e);
      }
      const g = this.inkG;
      g.strokeStyle = '#141008';
      g.fillStyle = '#141008';
      g.lineWidth = 3.2;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      if (this.lastPt) {
        const d = Math.hypot(cx - this.lastPt[0], cy - this.lastPt[1]);
        if (d < 60) {
          g.beginPath();
          g.moveTo(this.lastPt[0], this.lastPt[1]);
          g.lineTo(cx, cy);
          g.stroke();
          if (e && !e.committed) e.ink += d;
        }
      } else {
        g.beginPath();
        g.arc(cx, cy, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      if (e && !e.committed) e.lastT = this.ctx.world.time;
      this.lastPt = [cx, cy];
      this.penDown = true;
      this.lastWriteT = this.ctx.world.time;
      this.dirty = true;
      if (this.scratchT <= 0) {
        this.scratchT = 0.07;
        this.ctx.sfx.noise({ dur: 0.06, vol: 0.05, f0: 4000, f1: 2500, type: 'bandpass', q: 3 });
      }
      inp.right.pulse(0.08, 10);
    } else {
      this.penDown = false;
      this.lastPt = null;
    }
  }

  _commitCheck() {
    const now = this.ctx.world.time;
    if (this.penDown) return;
    for (const e of this.entries) {
      if (e.committed || e.ink < 70 || now - e.lastT < 1.0) continue;
      e.committed = true;
      const k = this.known;
      if (k && k.d.alive && !k.d.dying && now - k.t < 10 && !this.pending.some((p) => p.d === k.d)) {
        e.target = k.d;
        e.name = k.d.name;
        this.pending.push({ d: k.d, at: now + this.delay, e });
        this.ctx.ui.callout(`기록됨: ${k.d.name}`, { color: '#ff8080' });
        this.ctx.sfx.tone({ type: 'sine', f0: 220, f1: 110, dur: 0.6, vol: 0.15 });
      } else {
        e.target = null;
        this.ctx.ui.callout('얼굴을 모르는 상대에게는 효과가 없다', { color: '#cccccc' });
      }
      this.dirty = true;
    }
  }

  _updatePending() {
    const now = this.ctx.world.time;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (!p.d.alive) {
        this.pending.splice(i, 1);
        continue;
      }
      if (now >= p.at) {
        p.d.heartAttack();
        this.pending.splice(i, 1);
        this.kills++;
        const sfx = this.ctx.sfx;
        sfx.tone({ type: 'sine', f0: 70, f1: 50, dur: 0.12, vol: 0.4 });
        setTimeout(() => sfx.tone({ type: 'sine', f0: 70, f1: 50, dur: 0.12, vol: 0.4 }), 260);
        setTimeout(() => sfx.tone({ type: 'sine', f0: 1000, f1: 1000, dur: 1.2, vol: 0.05 }), 900);
        this.ctx.ui.manga({ main: '心臓麻痺', ruby: 'しんぞうまひ', color: '#aa0000' });
        if (this.kills === 1 || Math.random() < 0.25) setTimeout(() => this.ctx.ui.manga({ main: '計画通り', ruby: 'けいかくどおり', color: '#333333' }), 1800);
      }
    }
  }

  _newPage() {
    this.inkG.clearRect(0, 0, CW, CH);
    this.entries = [];
    this.dirty = true;
    this.ctx.sfx.noise({ dur: 0.35, vol: 0.12, f0: 3000, f1: 600, type: 'bandpass', q: 1 });
    this.ctx.input.right.pulse(0.3, 40);
  }

  /** 머리 위 이름표: 바라보는 대상(흰색), 사신의 눈이 켜져 있으면 모두(붉은색) */
  _updateTags() {
    const W = this.ctx.world;
    const eyes = this.ctx.settings.shinigamiEyes;
    const now = W.time;
    const live = new Set();
    for (const d of W.dummies) {
      if (!d.alive) continue;
      const pend = this.pending.find((p) => p.d === d);
      const focused = this.known?.d === d && now - this.known.t < 10;
      if (!eyes && !focused && !pend) continue;
      live.add(d);
      let T = this.tags.get(d);
      if (!T) {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 128;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
        s.scale.set(0.8, 0.2, 1);
        s.renderOrder = 47;
        this.ctx.scene.add(s);
        T = { s, c, tex, last: '' };
        this.tags.set(d, T);
      }
      const remain = pend ? Math.max(0, pend.at - now).toFixed(1) : '';
      const key = `${d.name}|${focused}|${eyes}|${remain}`;
      if (key !== T.last) {
        T.last = key;
        const g = T.c.getContext('2d');
        g.clearRect(0, 0, 512, 128);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `900 52px ${FONT}`;
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.strokeText(d.name, 256, 46);
        g.fillStyle = eyes ? '#ff4040' : '#ffffff';
        g.fillText(d.name, 256, 46);
        if (pend) {
          g.font = `700 36px ${FONT}`;
          g.strokeText(`♥ ${remain}`, 256, 102);
          g.fillStyle = '#ff2020';
          g.fillText(`♥ ${remain}`, 256, 102);
        } else if (eyes) {
          g.font = `700 30px ${FONT}`;
          const life = (d.name.length * 7919 + 1234567) % 9000000 + 1000000;
          g.strokeText(String(life), 256, 100);
          g.fillStyle = '#ff7070';
          g.fillText(String(life), 256, 100);
        }
        T.tex.needsUpdate = true;
      }
      d.headPos(T.s.position).add(_v.set(0, 0.4 * d.scale, 0));
      T.s.material.opacity = focused || pend ? 1 : 0.75;
    }
    for (const [d, T] of this.tags) {
      if (!live.has(d)) {
        this.ctx.scene.remove(T.s);
        T.tex.dispose();
        T.s.material.dispose();
        this.tags.delete(d);
      }
    }
  }

  cancelDomain() {}

  dispose() {
    const scene = this.ctx.scene;
    scene.remove(this.book, this.pencil);
    for (const [, T] of this.tags) {
      scene.remove(T.s);
      T.tex.dispose();
    }
    this.tags.clear();
  }
}
