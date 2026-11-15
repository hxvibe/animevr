// VR 안에서 쓰는 UI: 손목 HUD, 안내/설정 패널(손가락 터치·레이 클릭), 기술명 표시, 피격 효과
import * as THREE from 'three';

export const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

function canvasPlane(w, h, mw, mh, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, depthTest: opts.depthTest ?? true, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), mat);
  mesh.renderOrder = opts.renderOrder ?? 30;
  return { canvas: c, g: c.getContext('2d'), tex, mat, mesh };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ray = new THREE.Ray();
const _plane = new THREE.Plane();

export class UI {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, camera } = ctx;
    this.scene = scene;

    // 손목 HUD
    this.hud = canvasPlane(512, 300, 0.17, 0.1, { renderOrder: 40 });
    scene.add(this.hud.mesh);
    this._hudTimer = 0;

    // 안내 패널
    this.panel = canvasPlane(1024, 900, 1.3, 1.14, { renderOrder: 35 });
    this.panel.mesh.position.set(0, 1.45, -2.2);
    scene.add(this.panel.mesh);
    this.panelVisible = true;
    this.buttons = [];
    this.cursor = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.cursor.renderOrder = 50;
    this.cursor.visible = false;
    scene.add(this.cursor);
    this._pokePrev = { left: 1, right: 1 };
    this._pokeCooldown = 0;
    this._hover = -1;

    // 피격 비네트
    this.vignette = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff1030, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false }),
    );
    this.vignette.renderOrder = 100;
    camera.add(this.vignette);

    this.callouts = [];
    this.title = null;
  }

  // ── 패널 ──
  drawPanel() {
    const { g, canvas, tex } = this.panel;
    const ch = this.ctx.character;
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    roundRect(g, 4, 4, W - 8, H - 8, 36);
    g.fillStyle = 'rgba(8,12,28,0.86)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(120,200,255,0.7)';
    g.stroke();

    g.fillStyle = '#9fdcff';
    g.font = `700 54px ${FONT}`;
    g.textBaseline = 'top';
    g.fillText(ch ? ch.name : 'ANIME VR', 48, 36);
    g.font = `400 30px ${FONT}`;
    g.fillStyle = '#c9d6ff';
    g.fillText(ch ? ch.subtitle : '', 48, 102);

    const mode = this.ctx.input.mode;
    const anyHand = this.ctx.input.hands.some((h) => h.source === 'hand');
    const lines = ch ? ch.helpLines(anyHand ? 'hand' : mode === 'desktop' ? 'desktop' : 'controller') : [];
    let y = 160;
    for (const l of lines) {
      if (l.head) {
        g.font = `700 30px ${FONT}`;
        g.fillStyle = l.color || '#ffffff';
        g.fillText(l.head, 48, y);
        y += 40;
      }
      if (l.text) {
        g.font = `400 25px ${FONT}`;
        g.fillStyle = '#d5dcf0';
        for (const t of l.text.split('\n')) {
          g.fillText(t, 70, y);
          y += 32;
        }
        y += 8;
      }
    }

    // 버튼
    const labels = ch ? ch.panelButtons() : [];
    const bw = 210;
    const bh = 74;
    const gap = 26;
    const total = labels.length * bw + (labels.length - 1) * gap;
    let x = (W - total) / 2;
    const by = H - bh - 34;
    this.buttons = [];
    labels.forEach((b, i) => {
      roundRect(g, x, by, bw, bh, 18);
      g.fillStyle = i === this._hover ? 'rgba(120,200,255,0.55)' : b.on === false ? 'rgba(60,60,80,0.8)' : 'rgba(40,90,160,0.75)';
      g.fill();
      g.strokeStyle = '#9fdcff';
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = '#ffffff';
      g.font = `700 28px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(b.label, x + bw / 2, by + bh / 2);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      this.buttons.push({ x, y: by, w: bw, h: bh, id: b.id });
      x += bw + gap;
    });
    tex.needsUpdate = true;
  }

  showPanel(show) {
    this.panelVisible = show;
    this.panel.mesh.visible = show;
    if (show) {
      // 머리 앞 2m에 소환
      const inp = this.ctx.input;
      _v.copy(inp.headDir).setY(0);
      if (_v.lengthSq() < 1e-4) _v.set(0, 0, -1);
      _v.normalize();
      this.panel.mesh.position.copy(inp.head).addScaledVector(_v, 1.6);
      this.panel.mesh.position.y = Math.max(1.0, inp.head.y - 0.15);
      this.panel.mesh.lookAt(inp.head.x, this.panel.mesh.position.y, inp.head.z);
      this.drawPanel();
    }
  }

  _buttonAt(uvx, uvy) {
    const W = this.panel.canvas.width;
    const H = this.panel.canvas.height;
    const px = uvx * W;
    const py = (1 - uvy) * H;
    return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
  }

  _localToUV(local) {
    const pw = 1.3;
    const ph = 1.14;
    return { u: local.x / pw + 0.5, v: local.y / ph + 0.5, inside: Math.abs(local.x) <= pw / 2 && Math.abs(local.y) <= ph / 2 };
  }

  /** 스킬보다 먼저 호출: 패널 조작 중이면 스킬 의도를 지운다 */
  handleInput(dt) {
    this._pokeCooldown -= dt;
    this.cursor.visible = false;
    if (!this.panelVisible) return;
    const inp = this.ctx.input;
    const mesh = this.panel.mesh;
    mesh.updateMatrixWorld();
    let hover = -1;
    for (const h of inp.hands) {
      if (!h.active) continue;
      if (h.source === 'hand') {
        const local = mesh.worldToLocal(_v.copy(h.indexTipWorld));
        const uv = this._localToUV(local);
        const prev = this._pokePrev[h.side];
        this._pokePrev[h.side] = local.z;
        if (uv.inside && local.z < 0.12 && local.z > -0.08) {
          h.blue = h.red = h.domainSign = false; // 패널 근처에서는 스킬 금지
          const idx = this._buttonAt(uv.u, uv.v);
          if (idx >= 0) hover = idx;
          if (idx >= 0 && prev > 0.01 && local.z <= 0.01 && this._pokeCooldown <= 0) {
            this._click(idx, h);
          }
        }
      } else if (h.source === 'controller') {
        _ray.set(h.pos, h.dir);
        _plane.setFromNormalAndCoplanarPoint(_v2.set(0, 0, 1).applyQuaternion(mesh.quaternion), mesh.position);
        const hit = _ray.intersectPlane(_plane, _v);
        if (hit && hit.distanceTo(h.pos) < 6) {
          const local = mesh.worldToLocal(_v2.copy(hit));
          const uv = this._localToUV(local);
          if (uv.inside) {
            h.blue = h.red = false;
            this.cursor.position.copy(hit);
            this.cursor.visible = true;
            const idx = this._buttonAt(uv.u, uv.v);
            if (idx >= 0) hover = idx;
            if (idx >= 0 && h.pressed('trigger')) this._click(idx, h);
          }
        }
      }
    }
    if (hover !== this._hover) {
      this._hover = hover;
      this.drawPanel();
    }
  }

  _click(idx, h) {
    this._pokeCooldown = 0.4;
    const id = this.buttons[idx].id;
    h?.pulse(0.6, 30);
    this.ctx.sfx.tone({ type: 'sine', f0: 1200, f1: 1600, dur: 0.08, vol: 0.15 });
    if (id === 'close') this.showPanel(false);
    else this.ctx.character?.onPanelButton(id);
    if (this.panelVisible) this.drawPanel();
  }

  // ── HUD ──
  drawHud() {
    const { g, canvas, tex } = this.hud;
    const ch = this.ctx.character;
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    roundRect(g, 4, 4, W - 8, H - 8, 26);
    g.fillStyle = 'rgba(6,10,24,0.78)';
    g.fill();
    g.strokeStyle = 'rgba(120,200,255,0.6)';
    g.lineWidth = 3;
    g.stroke();
    if (!ch) return;
    const rows = ch.hudRows();
    let y = 22;
    for (const r of rows) {
      g.font = `700 26px ${FONT}`;
      g.fillStyle = r.color || '#ffffff';
      g.textBaseline = 'top';
      g.fillText(r.label, 24, y);
      if (r.bar !== undefined) {
        roundRect(g, 170, y + 4, W - 200, 22, 10);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fill();
        roundRect(g, 170, y + 4, Math.max(12, (W - 200) * r.bar), 22, 10);
        g.fillStyle = r.color || '#7fd4ff';
        g.fill();
      } else if (r.text) {
        g.font = `400 26px ${FONT}`;
        g.fillStyle = r.textColor || '#dfe6ff';
        g.fillText(r.text, 170, y);
      }
      y += 46;
    }
    tex.needsUpdate = true;
  }

  callout(text, pos, opts = {}) {
    const c = canvasPlane(1024, 160, opts.width ?? 0.9, (opts.width ?? 0.9) * 0.156, { renderOrder: 45, depthTest: false });
    const { g } = c;
    g.font = `800 ${opts.size ?? 92}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = opts.glow || opts.color || '#66ccff';
    g.shadowBlur = 24;
    g.fillStyle = opts.color || '#ffffff';
    g.fillText(text, 512, 84);
    g.shadowBlur = 0;
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.strokeText(text, 512, 84);
    c.tex.needsUpdate = true;
    const inp = this.ctx.input;
    if (pos) c.mesh.position.copy(pos).add(_v.set(0, 0.18, 0));
    else c.mesh.position.copy(inp.head).addScaledVector(inp.headDir, 1.4).add(_v.set(0, -0.15, 0));
    this.scene.add(c.mesh);
    this.callouts.push({ c, t: 0, dur: opts.dur ?? 1.6 });
  }

  /** 영역전개 타이틀 */
  bigTitle(top, main, sub) {
    if (this.title) {
      this.scene.remove(this.title.c.mesh);
      this.title.c.tex.dispose();
    }
    const c = canvasPlane(1024, 512, 2.4, 1.2, { renderOrder: 46, depthTest: false });
    const { g } = c;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#6fb8ff';
    g.shadowBlur = 40;
    g.fillStyle = '#e8f2ff';
    g.font = `500 56px ${FONT}`;
    g.fillText(top, 512, 120);
    g.font = `900 170px ${FONT}`;
    g.fillStyle = '#ffffff';
    g.fillText(main, 512, 280);
    g.shadowBlur = 10;
    g.font = `400 44px ${FONT}`;
    g.fillStyle = '#b8d4ff';
    g.fillText(sub, 512, 420);
    c.tex.needsUpdate = true;
    const inp = this.ctx.input;
    c.mesh.position.copy(inp.head).addScaledVector(inp.headDir, 3.2);
    c.mesh.lookAt(inp.head);
    this.scene.add(c.mesh);
    this.title = { c, t: 0, dur: 4 };
  }

  damageFlash(amount) {
    this.vignette.material.opacity = Math.min(0.6, this.vignette.material.opacity + amount * 0.03);
  }

  update(dt) {
    const inp = this.ctx.input;
    // HUD 위치: 왼손 위 / 데스크톱이면 화면 좌하단
    const L = inp.left;
    const mesh = this.hud.mesh;
    if (inp.mode === 'xr' && L.active) {
      mesh.visible = true;
      _v.subVectors(inp.head, L.palm).normalize();
      mesh.position.copy(L.palm).addScaledVector(_v, 0.06).add(_v2.set(0, 0.09, 0));
      mesh.lookAt(inp.head);
    } else if (inp.mode === 'desktop') {
      mesh.visible = true;
      mesh.position.copy(inp.head).addScaledVector(inp.headDir, 0.5);
      _v.set(-0.22, -0.14, 0).applyQuaternion(inp.headQuat);
      mesh.position.add(_v);
      mesh.quaternion.copy(inp.headQuat);
    } else mesh.visible = false;
    this._hudTimer -= dt;
    if (this._hudTimer <= 0) {
      this._hudTimer = 0.12;
      this.drawHud();
    }

    // 기술명
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const o = this.callouts[i];
      o.t += dt;
      const k = o.t / o.dur;
      o.c.mesh.position.y += dt * 0.15;
      o.c.mesh.lookAt(inp.head);
      o.c.mat.opacity = k < 0.15 ? k / 0.15 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
      if (k >= 1) {
        this.scene.remove(o.c.mesh);
        o.c.tex.dispose();
        o.c.mat.dispose();
        o.c.mesh.geometry.dispose();
        this.callouts.splice(i, 1);
      }
    }
    if (this.title) {
      const o = this.title;
      o.t += dt;
      const k = o.t / o.dur;
      o.c.mat.opacity = k < 0.2 ? k / 0.2 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
      if (k >= 1) {
        this.scene.remove(o.c.mesh);
        o.c.tex.dispose();
        this.title = null;
      }
    }
    const vm = this.vignette.material;
    vm.opacity = Math.max(0, vm.opacity - dt * 0.8);
    this.vignette.visible = vm.opacity > 0.01;
  }
}
