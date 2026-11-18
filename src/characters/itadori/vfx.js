// 이타도리 VFX: 어주자 「해」 절취선(가위 문양) · 경정권 지연 충격 · 적혈조술 천혈 · 영역전개(고향 동네)
import * as THREE from 'three';
import { glowTexture } from '../../core/fx.js';
import * as R from '../../core/env/realism.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

// ── 절취선: 점선 + 가위 문양 (전지공예의 "여기를 자르세요") ──
let _cutTex = null;
function cutTexture() {
  if (_cutTex) return _cutTex;
  const W = 1024;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cy = H / 2;
  // 점선 (검은 테두리 + 흰 선)
  g.lineCap = 'round';
  g.setLineDash([34, 20]);
  g.strokeStyle = '#000';
  g.lineWidth = 15;
  g.beginPath();
  g.moveTo(130, cy);
  g.lineTo(W - 20, cy);
  g.stroke();
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.stroke();
  g.setLineDash([]);
  // 가위: 손잡이 고리 두 개 + 엇갈린 날
  const drawScissors = (stroke, lw) => {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.beginPath();
    g.ellipse(34, cy - 22, 17, 13, -0.35, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(34, cy + 22, 17, 13, 0.35, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(48, cy - 14);
    g.quadraticCurveTo(80, cy - 2, 118, cy + 14);
    g.moveTo(48, cy + 14);
    g.quadraticCurveTo(80, cy + 2, 118, cy - 14);
    g.stroke();
  };
  drawScissors('#000', 13);
  drawScissors('#fff', 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _cutTex = t;
  return t;
}

const cutVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const cutFrag = /* glsl */ `
uniform sampler2D map;
uniform float uProg;
uniform float uOpacity;
uniform float uFlash;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  // 가위가 지나간 데까지만 점선이 그어진다
  float show = max(step(vUv.x, 0.12), step(vUv.x, 0.12 + uProg * 0.88));
  vec3 c = t.rgb * mix(vec3(1.0), uTint, step(0.5, t.r) * 0.35);
  c = mix(c, vec3(1.0, 0.95, 0.95), uFlash);
  float a = t.a * show * uOpacity;
  if (a < 0.02) discard;
  gl_FragColor = vec4(c, a);
}`;

/**
 * 대상에 붙는 절취선 묶음. 정해진 시간이 지나면 "싹둑" → onCut(plane) 호출
 */
export class CutMarks {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.PlaneGeometry(1, 0.125);
  }

  /**
   * @param target 더미/소품
   * @param point 닿은 지점 (월드)
   * @param normal 절단면 법선
   * @param delay 잘리기까지 시간
   * @param onCut (plane, mark) => void
   */
  add(target, point, normal, delay, onCut, tint = 0xff6070) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: cutVert,
      fragmentShader: cutFrag,
      uniforms: { map: { value: cutTexture() }, uProg: { value: 0 }, uOpacity: { value: 1 }, uFlash: { value: 0 }, uTint: { value: new THREE.Color(tint) } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.renderOrder = 40;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const c = target.center(new THREE.Vector3());
    this.items.push({ target, mesh, mat, offset: point.clone().sub(c), normal: normal.clone().normalize(), t: 0, delay, cut: false, onCut, len: 1.25 * (target.scale ?? 1), after: 0 });
  }

  /** 이 대상에 붙은 표시가 있는지 */
  has(target) {
    return this.items.some((m) => m.target === target && !m.cut);
  }

  update(dt, camPos) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const m = this.items[i];
      m.t += dt;
      const alive = m.target.alive !== false;
      if (alive) m.target.center(_v).add(m.offset);
      else _v.copy(m.mesh.position);
      // 선 방향: 절단면이 보이는 쪽 표면과 만나는 선 (= 법선 × 시선)
      _z.subVectors(camPos, _v).normalize();
      _x.crossVectors(m.normal, _z);
      if (_x.lengthSq() < 1e-4) _x.set(1, 0, 0);
      _x.normalize();
      _y.crossVectors(_z, _x).normalize();
      _m.makeBasis(_x, _y, _z);
      m.mesh.quaternion.setFromRotationMatrix(_m);
      // 몸 앞쪽으로 살짝 띄워 몸에 묻히지 않게
      m.mesh.position.copy(_v).addScaledVector(_z, 0.22 * (m.target.scale ?? 1));
      const k = Math.min(1, m.t / m.delay);
      m.mat.uniforms.uProg.value = k;
      if (!m.cut) {
        m.mesh.scale.set(m.len, m.len, 1);
        if (k >= 1 || !alive) {
          m.cut = true;
          if (alive) {
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(m.normal, m.target.center(_v2).add(m.offset));
            m.onCut?.(plane, m);
          }
        }
      } else {
        // 싹둑: 하얗게 번쩍이며 사라진다
        m.after += dt;
        const e = m.after / 0.18;
        m.mat.uniforms.uFlash.value = 1;
        m.mat.uniforms.uOpacity.value = Math.max(0, 1 - e);
        m.mesh.scale.set(m.len * (1 + e * 0.3), m.len * Math.max(0.05, 1 - e), 1);
        if (e >= 1) {
          this.scene.remove(m.mesh);
          m.mat.dispose();
          this.items.splice(i, 1);
        }
      }
    }
  }

  dispose() {
    for (const m of this.items) {
      this.scene.remove(m.mesh);
      m.mat.dispose();
    }
    this.items = [];
    this.geo.dispose();
  }
}

// ── 백렴: 두 손바닥 사이에서 압축되는 피 구슬 ──
export class BloodOrb {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshStandardMaterial({ color: 0x7a0010, emissive: 0x2a0004, roughness: 0.12, metalness: 0.15, envMap: ctx.world.envMap, envMapIntensity: 1.2 });
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), this.mat);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff1020, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.5 }));
    this.group.add(this.ball, this.glow);
    this.group.visible = false;
    ctx.scene.add(this.group);
    this.t = 0;
  }

  set(pos, k) {
    const G = this.group;
    G.visible = k > 0;
    if (!G.visible) return;
    this.t += 0.016;
    G.position.copy(pos);
    const r = 0.012 + k * 0.03;
    // 압축되며 출렁인다
    this.ball.scale.set(r * (1 + Math.sin(this.t * 31) * 0.08), r * (1 + Math.cos(this.t * 27) * 0.08), r);
    this.ball.rotation.y += 0.2;
    this.glow.scale.setScalar(0.1 + k * 0.25);
    this.glow.material.opacity = 0.25 + k * 0.4;
    // 사방에서 피가 빨려 들어온다
    if (Math.random() < 0.7) {
      const d = _v.randomDirection();
      const p = _v2.copy(pos).addScaledVector(d, 0.12 + Math.random() * 0.08);
      this.ctx.fx.spawnDark(p, d.multiplyScalar(-0.9), new THREE.Color(0x6a0008), 0.012, 0.15, 0, 0);
    }
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    this.mat.dispose();
    this.ball.geometry.dispose();
    this.glow.material.dispose();
  }
}

// ── 천혈: 음속을 넘는 피의 광선 ──
const _beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
export function spawnBloodBeam(ctx, from, to, power = 1) {
  const { scene, fx } = ctx;
  const g = new THREE.Group();
  const len = from.distanceTo(to);
  const core = new THREE.Mesh(_beamGeo, new THREE.MeshBasicMaterial({ color: 0xffd6d6, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  const body = new THREE.Mesh(_beamGeo, new THREE.MeshBasicMaterial({ color: 0xb00012, transparent: true, depthWrite: false, fog: false }));
  const halo = new THREE.Mesh(_beamGeo, new THREE.MeshBasicMaterial({ color: 0xff1030, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  g.add(halo, body, core);
  g.position.copy(from);
  g.lookAt(to);
  const R = 0.012 + power * 0.01;
  g.renderOrder = 20;
  scene.add(g);
  let t = 0;
  const dur = 0.42;
  fx.addTransient(g, dur, (k, dt) => {
    t += dt ?? 0.016;
    // 순간적으로 뻗어 나가고 가늘어지며 사라진다
    const reach = Math.min(1, t / 0.05);
    const w = 1 - k;
    core.scale.set(R * 0.35 * w, R * 0.35 * w, len * reach);
    body.scale.set(R * w, R * w, len * reach);
    halo.scale.set(R * 3.2 * w, R * 3.2 * w, len * reach);
    body.material.opacity = Math.min(1, w * 1.5);
    core.material.opacity = w;
    halo.material.opacity = 0.35 * w;
  }, () => {
    core.material.dispose();
    body.material.dispose();
    halo.material.dispose();
  });
  // 광선을 따라 흩날리는 핏방울
  const dir = _v.subVectors(to, from).normalize();
  const n = Math.min(80, Math.round(len * 3));
  for (let i = 0; i < n; i++) {
    const p = _v2.copy(from).addScaledVector(dir, Math.random() * len);
    fx.spawnDark(p, new THREE.Vector3().randomDirection().multiplyScalar(0.4).addScaledVector(dir, 0.6), new THREE.Color(0x5a0008), 0.02 + Math.random() * 0.02, 0.4 + Math.random() * 0.4, 2, 2.5);
  }
}

// ── 영역전개: 할아버지와 살던 동네 (노을 진 일본 교외 주택가) ──
// 사이딩 벽 · 기와 지붕 · 블록 담장 · 전봇대와 전선 · 자판기 · 커브 미러 · 먼 산 · 낮게 깔린 해와 긴 그림자
const SIDINGS = [[0.88, 0.85, 0.78], [0.8, 0.78, 0.74], [0.9, 0.88, 0.84], [0.74, 0.66, 0.56], [0.62, 0.64, 0.66], [0.86, 0.8, 0.68]];
const ROOFS = [[0.22, 0.24, 0.28], [0.34, 0.2, 0.16], [0.2, 0.26, 0.3], [0.3, 0.3, 0.3]];

function houseMats() {
  return {
    walls: SIDINGS.map((c) => R.pbrMat(R.sidingSet(c), { normal: 1 })),
    roofs: ROOFS.map((c) => R.pbrMat(R.roofTileSet(c), { normal: 1, env: 1.2 })),
    block: R.pbrMat(R.blockWallSet(), { normal: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.5 }),
    lit: (() => {
      const m = new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffc080, emissiveIntensity: 1.4, roughness: 0.3 });
      m.userData.noShadow = true;
      return m;
    })(),
    frame: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.4, metalness: 0.6 }),
    shutter: new THREE.MeshStandardMaterial({ color: 0x8a8e90, roughness: 0.5, metalness: 0.4 }),
    door: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.6 }),
    concrete: R.pbrMat(R.concreteSet(0.66)),
    soil: R.pbrMat(R.asphaltSet(false), { color: 0x9a8670, normal: 0.6 }),
  };
}

/** 벽면용 상자 (UV 1 = 1m) */
function wallBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const fw = ax > 0.5 ? d : w;
    const fh = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * fw, uv.getY(i) * fh);
  }
  return g;
}

/** 2층 단독주택 한 채 (로컬 +Z = 길 쪽) */
function house(B, M, x, z, rotY, { w = 8, d = 7, floors = 2 } = {}) {
  const m4 = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  const add = (mat, geo) => B.add(mat, geo, m4);
  const wall = R.pick(M.walls);
  const roof = R.pick(M.roofs);
  const h = floors * 2.9 + 0.4;
  add(M.concrete, wallBox(w + 0.2, 0.4, d + 0.2).translate(0, 0.2, 0)); // 기초
  add(wall, wallBox(w, h - 0.4, d).translate(0, 0.4 + (h - 0.4) / 2, 0));
  // 박공지붕: 마루는 로컬 X 방향, 처마 0.5m
  const rise = d * 0.28;
  const slope = Math.hypot(d / 2 + 0.5, rise + 0.15);
  const ang = Math.atan2(rise + 0.15, d / 2 + 0.5);
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(w + 1, 0.12, slope);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w + 1), uv.getY(i) * slope);
    g.rotateX(s * ang).translate(0, h + rise / 2, (s * (d / 2 + 0.5)) / 2);
    add(roof, g);
  }
  // 박공 삼각 벽
  const tri = new THREE.BufferGeometry();
  const hd = d / 2;
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, h, -hd, 0, h, hd, 0, h + rise, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, d, 0, d / 2, rise], 2));
  tri.computeVertexNormals();
  for (const s of [-1, 1]) {
    const t = tri.clone();
    if (s < 0) t.scale(-1, 1, 1);
    t.translate((s * w) / 2, 0, 0);
    if (s > 0) {
      const ix = [0, 2, 1];
      t.setIndex(ix);
    } else t.setIndex([0, 1, 2]);
    t.computeVertexNormals();
    add(wall, t);
  }
  // 창문 (1·2층 정면 + 옆면), 일부는 불이 켜졌다
  const win = (lx, ly, face, ww = 1.6, wh = 1.1) => {
    const lit = R.rnd() < 0.35;
    const mat = lit ? M.lit : M.glass;
    let g = new THREE.PlaneGeometry(ww, wh);
    let fr = new THREE.BoxGeometry(ww + 0.12, wh + 0.12, 0.06);
    const sh = R.rnd() < 0.3 ? new THREE.BoxGeometry(ww * 0.5, wh + 0.1, 0.08) : null;
    const place = (geo, off) => {
      if (face === 'front') geo.translate(lx, ly, d / 2 + off);
      else {
        geo.rotateY(face === 'right' ? Math.PI / 2 : -Math.PI / 2);
        geo.translate((face === 'right' ? 1 : -1) * (w / 2 + off), ly, lx);
      }
      return geo;
    };
    add(M.frame, place(fr, 0.02));
    add(mat, place(g, 0.06));
    if (sh) add(M.shutter, place(sh.translate(ww * 0.25, 0, 0), 0.09));
  };
  for (let f = 0; f < floors; f++) {
    const y = 0.4 + 1.5 + f * 2.9;
    win(-w * 0.27, y, 'front');
    if (f > 0 || R.rnd() < 0.5) win(w * 0.27, y, 'front');
    win(0, y, R.rnd() < 0.5 ? 'left' : 'right', 1.2, 1.0);
  }
  // 현관 · 차양 · 2층 발코니
  add(M.door, new THREE.BoxGeometry(0.9, 2.0, 0.08).translate(w * 0.05, 1.4, d / 2 + 0.04));
  add(M.frame, new THREE.BoxGeometry(1.6, 0.08, 0.9).translate(w * 0.05, 2.6, d / 2 + 0.45));
  if (floors > 1) {
    add(M.concrete, new THREE.BoxGeometry(w * 0.55, 0.15, 1.1).translate(-w * 0.18, 3.3, d / 2 + 0.55));
    add(M.frame, new THREE.BoxGeometry(w * 0.55, 0.9, 0.04).translate(-w * 0.18, 3.85, d / 2 + 1.08));
  }
  return { m4, h };
}

/** 블록 담장 (대문 자리를 비운다) */
function blockFence(B, M, x0, z0, x1, z1, gapAt = null, h = 1.2) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(x1 - x0, z1 - z0);
  const segs = gapAt === null ? [[0, len]] : [[0, Math.max(0, gapAt - 0.7)], [Math.min(len, gapAt + 0.7), len]];
  for (const [a, b] of segs) {
    if (b - a < 0.2) continue;
    const g = new THREE.BoxGeometry(0.15, h, b - a);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (b - a)) / 0.8, (uv.getY(i) * h) / 0.4);
    g.translate(0, h / 2, (a + b) / 2).applyMatrix4(new THREE.Matrix4().makeRotationY(ang).setPosition(x0, 0, z0));
    B.add(M.block, g);
  }
}

export class HometownDomain {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.state = 'idle';
    this.t = 0;
    this.radius = 16;
    this.center = new THREE.Vector3();
    this.built = false;
    ctx.scene.add(this.group);
  }

  _build() {
    R.seed(1954);
    const G = this.group;
    const B = new R.Batch();
    const M = houseMats();
    const S = { asphalt: R.pbrMat(R.asphaltSet(false), { normal: 1 }), paint: R.roadPaint() };
    // 땅: 바깥은 흙·자갈, 길은 아스팔트 (폭 6m) + 양옆 흰 실선 + 콘크리트 측구
    G.add(R.ground(220, 220, M.soil, 3, 0, 0, 0.002));
    G.add(R.ground(6.5, 200, S.asphalt, 4, 0, 0, 0.01));
    G.add(R.ground(200, 6, S.asphalt, 4, 0, 0, 0.008));
    for (const s of [-1, 1]) {
      B.add(S.paint, R.stripe(s * 2.85, -55, 0.15, 90, 0, 0.016));
      B.add(S.paint, R.stripe(s * 2.85, 55, 0.15, 90, 0, 0.016));
      B.add(M.concrete, new THREE.BoxGeometry(0.4, 0.06, 200).translate(s * 3.45, 0.03, 0));
      B.add(M.concrete, new THREE.BoxGeometry(200, 0.06, 0.4).translate(0, 0.03, s * 3.2));
    }
    // 정지선 + "止まれ"
    B.add(S.paint, R.stripe(-1.5, 4.5, 3, 0.4, 0, 0.016));
    this.rise = new THREE.Group();
    const RB = new R.Batch();
    // 길 양쪽 주택: 담장 → 마당 → 집
    for (const side of [-1, 1]) {
      for (let i = -6; i <= 6; i++) {
        if (i === 0) continue; // 교차로
        const zc = i * 13 + (R.rnd() - 0.5) * 2;
        if (R.rnd() < 0.12) continue; // 빈 터 (주차장)
        const w = 8 + R.rnd() * 3;
        const d = 7 + R.rnd() * 2;
        const setback = 3.4 + 2.5 + d / 2;
        house(RB, M, side * setback, zc, side > 0 ? -Math.PI / 2 : Math.PI / 2, { w, d, floors: R.rnd() < 0.8 ? 2 : 1 });
        blockFence(RB, M, side * 3.9, zc - w / 2 - 1, side * 3.9, zc + w / 2 + 1, w / 2 + 1 + (R.rnd() - 0.5) * 2);
      }
      // 교차하는 골목 쪽 집들
      for (let i = 1; i <= 4; i++) {
        for (const s2 of [-1, 1]) {
          const xc = s2 * (i * 13 + 2);
          house(RB, M, xc, side * (3.2 + 2.5 + 4), side > 0 ? Math.PI : 0, { w: 8, d: 7, floors: 2 });
          blockFence(RB, M, xc - 5, side * 3.6, xc + 5, side * 3.6, 5);
        }
      }
    }
    // 전봇대 + 전선 (길 한쪽)
    const tops = [];
    for (let z = -90; z <= 90; z += 22) tops.push(R.utilityPole(RB, 3.7, z, { h: 10, transformer: Math.abs(z) % 44 === 0 }));
    R.wires(this.rise, tops, 0.7, [-0.75, 0, 0.75], new THREE.Vector3(1, 0, 0));
    const ctops = [];
    for (let x = -80; x <= 80; x += 22) ctops.push(R.utilityPole(RB, x + 11, -3.5, { h: 9.5 }));
    R.wires(this.rise, ctops, 0.6, [-0.6, 0.6], new THREE.Vector3(0, 0, 1));
    // 교차로 소품
    R.curveMirror(RB, -3.7, -3.6, Math.PI * 0.75);
    R.vendingMachine(RB, 4.3, 6, -Math.PI / 2, 0xf2f2f2);
    R.vendingMachine(RB, 4.3, 7.1, -Math.PI / 2, 0xc8102e);
    R.streetLight(RB, -3.8, 12, 0, 6.5);
    R.streetLight(RB, 3.8, -20, Math.PI, 6.5);
    // 먼 산 (짙은 실루엣)
    const hill = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 150 + R.rnd() * 40;
      RB.add(hill, new THREE.SphereGeometry(40 + R.rnd() * 40, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.8, 0.35 + R.rnd() * 0.3, 1).translate(Math.cos(a) * r, -2, Math.sin(a) * r));
    }
    B.build(G);
    RB.build(this.rise);
    G.add(this.rise);
    this.built = true;
  }

  start(center, dir) {
    if (!this.built) this._build();
    this.center.copy(center);
    this.group.position.set(center.x, 0, center.z);
    // 길이 바라보는 방향으로 뻗도록
    const yaw = Math.atan2(dir.x, dir.z);
    this.group.rotation.y = yaw;
    // 해는 길 끝(정면)에 낮게
    this.sky?.parent?.remove(this.sky);
    const az = THREE.MathUtils.radToDeg(yaw);
    this.envTex?.dispose();
    this.envTex = null;
    this.sky = R.physicalSky({ elevation: 1.2, azimuth: az, turbidity: 12, rayleigh: 3.6, mie: 0.01, mieG: 0.9 });
    this.sky.visible = false;
    this.ctx.scene.add(this.sky);
    this.sunDir = new THREE.Vector3(dir.x, 0.12, dir.z).normalize();
    this.state = 'opening';
    this.t = 0;
    this.group.visible = true;
    this.rise.scale.set(1, 0.001, 1);
  }

  stop() {
    if (this.state === 'idle') return;
    this.state = 'closing';
    this.t = 0;
  }

  update(dt) {
    if (this.state === 'idle') return;
    const env = this.ctx.env;
    this.t += dt;
    if (this.state === 'opening') {
      const k = Math.min(1, this.t / 1.1);
      const e = 1 - Math.pow(1 - k, 3);
      this.rise.scale.y = Math.max(0.001, e);
      if (k > 0.3 && !this.sky.visible) {
        env.setHidden(true);
        this.sky.visible = true;
        // 해 질 녘 빛: 낮게 깔린 주황 햇빛 + 긴 그림자, 동네를 찍은 반사 환경
        this._saved = { sunDir: env.sunDir.clone(), cast: env.sun.castShadow, envMap: this.ctx.scene.environment, exposure: this.ctx.renderer.toneMappingExposure };
        env.sunDir.copy(this.sunDir).applyAxisAngle(THREE.Object3D.DEFAULT_UP, 0);
        env.sun.castShadow = !!this.ctx.settings.shadows;
        env.sun.color.set(0xffa060);
        env.sun.intensity = 2.6;
        env.hemi.color.set(0xffb890);
        env.hemi.groundColor.set(0x40342c);
        env.hemi.intensity = 0.8;
        this.ctx.renderer.toneMappingExposure = 0.8;
        try {
          if (!this.envTex) this.envTex = R.captureEnvironment(this.ctx.renderer, [this.group, this.sky], new THREE.Vector3(this.center.x, 1.6, this.center.z), { lights: [env.hemi.clone(), env.sun.clone()] });
          this.ctx.scene.environment = this.envTex;
        } catch (err) {
          console.warn(err);
        }
      }
      env.fog.color.lerp(new THREE.Color(0xd8a080), Math.min(1, dt * 3));
      env.fog.near = THREE.MathUtils.lerp(env.fog.near, 40, dt * 2);
      env.fog.far = THREE.MathUtils.lerp(env.fog.far, 260, dt * 2);
      if (k >= 1) this.state = 'active';
    } else if (this.state === 'closing') {
      const k = Math.min(1, this.t / 0.8);
      this.rise.scale.y = Math.max(0.001, 1 - k);
      if (k >= 1) this._hide();
    }
  }

  _hide() {
    this.state = 'idle';
    this.group.visible = false;
    const env = this.ctx.env;
    if (this.sky?.visible) {
      this.sky.visible = false;
      env.setHidden(false);
    }
    if (this._saved) {
      env.sunDir.copy(this._saved.sunDir);
      this.ctx.scene.environment = this._saved.envMap;
      this._saved = null;
    }
    env.restore();
    env.applyShadows();
  }

  cancel() {
    if (this.state !== 'idle') this._hide();
  }

  dispose() {
    this.cancel();
    this.sky?.parent?.remove(this.sky);
    this.ctx.scene.remove(this.group);
    this.envTex?.dispose();
    this.group.traverse((o) => {
      o.geometry?.dispose();
    });
  }
}
