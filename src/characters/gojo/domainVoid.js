// 영역전개 「무량공처」 연출
// 결계 돔 + 별 문양 → 하늘의 육안 → 화이트아웃 → 초공간 워프 → 섬광 → 블랙홀이 뜬 우주(먹물 얼룩)
import * as THREE from 'three';
import { glowTexture } from '../../core/fx.js';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const voidFrag = /* glsl */ `
varying vec3 vDir;
uniform float uTime;
uniform float uFade;
uniform vec3 uHole;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.02; a *= 0.5; } return s; }
float stars(vec3 d, float scale, float thr) {
  vec3 p = d * scale; vec3 i = floor(p); float h = hash(i);
  vec3 c = i + 0.5 + (vec3(hash(i + 1.3), hash(i + 2.7), hash(i + 4.1)) - 0.5) * 0.6;
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + h * 4.0) + h * 40.0);
  return step(thr, h) * smoothstep(0.14, 0.0, length(p - c)) * tw;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 H = normalize(uHole);
  float a = acos(clamp(dot(d, H), -1.0, 1.0));
  vec3 right = normalize(cross(H, vec3(0.0, 1.0, 0.0)));
  vec3 up = normalize(cross(right, H));
  float lx = dot(d, right);
  float ly = dot(d, up);
  // 푸른 우주 바탕 + 은은한 성운
  vec3 col = mix(vec3(0.05, 0.12, 0.26), vec3(0.02, 0.05, 0.12), smoothstep(0.0, 1.6, a));
  float n1 = fbm(d * 2.4 + vec3(uTime * 0.01));
  float n2 = fbm(d * 6.0 + 9.0);
  col += vec3(0.25, 0.42, 0.7) * pow(n1, 2.5) * 0.9;
  col += vec3(0.6, 0.75, 1.0) * pow(n2, 5.0) * 0.6;
  col += vec3(0.85, 0.92, 1.0) * stars(d, 80.0, 0.86);
  col += vec3(0.7, 0.85, 1.0) * stars(d, 200.0, 0.92) * 0.7;
  // 중심의 하얀 빛 (안개처럼 퍼지는 광륜)
  float glow = exp(-a * 3.2);
  col += vec3(0.75, 0.86, 1.0) * glow * 0.9;
  col += vec3(0.9, 0.95, 1.0) * exp(-a * 9.0) * 1.2;
  float mist = fbm(vec3(lx * 6.0, ly * 6.0, uTime * 0.06));
  col += vec3(0.8, 0.9, 1.0) * mist * exp(-a * 4.0) * 0.6;
  // 동심원 고리
  col += vec3(0.7, 0.85, 1.0) * (0.5 + 0.5 * sin(a * 70.0 - uTime * 0.8)) * smoothstep(0.55, 0.15, a) * smoothstep(0.16, 0.24, a) * 0.08;
  // 가로로 길게 뻗는 빛줄기
  float band = exp(-abs(ly) * 30.0) * smoothstep(1.6, 0.0, abs(lx));
  col += vec3(0.85, 0.92, 1.0) * band * 1.4;
  col += vec3(0.6, 0.75, 1.0) * exp(-abs(ly) * 8.0) * smoothstep(1.2, 0.0, abs(lx)) * 0.25;
  // 방사형 빛살
  float ang = atan(ly, lx);
  float rays = pow(abs(sin(ang * 9.0 + fbm(vec3(ang * 3.0, 0.0, uTime * 0.05)) * 2.0)), 18.0);
  col += vec3(0.7, 0.85, 1.0) * rays * exp(-a * 2.5) * 0.35;
  // 블랙홀 (경계에 밝은 테)
  float rim = smoothstep(0.035, 0.0, abs(a - 0.165));
  col += vec3(1.0) * rim * 1.5;
  col *= smoothstep(0.152, 0.16, a);
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

const warpVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const warpFrag = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uFade;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  float lanes = 160.0;
  float lane = floor(vUv.x * lanes);
  float r = h1(lane);
  float r2 = h1(lane + 31.7);
  float speed = 2.5 + r * 4.0;
  float y = fract(vUv.y * (2.0 + r2 * 3.0) + uTime * speed + r * 10.0);
  float dash = smoothstep(0.0, 0.05, y) * smoothstep(0.55 + r2 * 0.35, 0.3, y);
  float thin = smoothstep(0.5, 0.0, abs(fract(vUv.x * lanes) - 0.5));
  vec3 pal = r < 0.35 ? vec3(0.65, 0.25, 1.0) : r < 0.55 ? vec3(1.0, 0.2, 0.35) : r < 0.75 ? vec3(0.25, 0.4, 1.0) : vec3(1.0);
  float end = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  vec3 col = pal * dash * thin * 2.2 * end;
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

const domeFrag = /* glsl */ `
varying vec3 vN; varying vec3 vV;
uniform float uFade; uniform float uTime;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float flick = 0.85 + 0.15 * sin(uTime * 13.0);
  vec3 c = vec3(0.35, 0.65, 1.0) * (0.6 + pow(f, 2.0));
  gl_FragColor = vec4(c * flick, uFade * (0.15 + pow(f, 2.0) * 0.8));
}`;
const domeVert = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;

function sigilTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.translate(512, 512);
  const spikes = 8;
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath();
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + (i % 2) * 0.15;
      const long = i % 2 === 0 ? 480 : 330;
      const w = 0.2;
      g.moveTo(Math.cos(a - w) * 120, Math.sin(a - w) * 120);
      g.quadraticCurveTo(Math.cos(a - w * 0.2) * long * 0.6, Math.sin(a - w * 0.2) * long * 0.6, Math.cos(a + 0.12) * long, Math.sin(a + 0.12) * long);
      g.quadraticCurveTo(Math.cos(a + w * 0.6) * long * 0.5, Math.sin(a + w * 0.6) * long * 0.5, Math.cos(a + w) * 120, Math.sin(a + w) * 120);
    }
    if (pass === 0) {
      g.lineWidth = 26;
      g.strokeStyle = '#06122e';
      g.stroke();
    } else {
      g.fillStyle = '#1f5dff';
      g.shadowColor = '#5aa8ff';
      g.shadowBlur = 40;
      g.fill();
    }
  }
  g.beginPath();
  g.arc(0, 0, 150, 0, Math.PI * 2);
  g.lineWidth = 18;
  g.strokeStyle = '#7fc0ff';
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function eyeTexture(flip) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 420;
  const g = c.getContext('2d');
  g.translate(512, 210);
  if (flip) g.scale(-1, 1);
  g.shadowColor = '#4fc8ff';
  g.shadowBlur = 50;
  g.strokeStyle = '#d8f4ff';
  g.lineWidth = 16;
  // 눈 윤곽 (위아래 곡선)
  g.beginPath();
  g.moveTo(-440, 40);
  g.bezierCurveTo(-250, -200, 200, -210, 440, -30);
  g.stroke();
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(-430, 50);
  g.bezierCurveTo(-200, 140, 220, 150, 420, -10);
  g.stroke();
  // 홍채
  g.lineWidth = 12;
  g.strokeStyle = '#8fe0ff';
  g.beginPath();
  g.arc(0, 0, 120, Math.PI * 1.02, Math.PI * 2.0);
  g.stroke();
  g.lineWidth = 6;
  g.beginPath();
  g.arc(0, 0, 70, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(0, 0, 26, 0, Math.PI * 2);
  g.fill();
  // 속눈썹 스트로크
  g.lineWidth = 7;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    const x = 160 + i * 45;
    g.moveTo(x, -150 + i * 20);
    g.lineTo(x + 60, -190 + i * 18);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function inkTexture(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const cx = 256;
  const cy = 256;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  // 중심 덩어리
  g.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = 55 + r() * 45;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.quadraticCurveTo(cx + Math.cos(a - 0.2) * (rr + 25), cy + Math.sin(a - 0.2) * (rr + 25), x, y);
  }
  g.fill();
  // 튀어나가는 줄기 (점점 가늘어짐) + 끝 방울
  const arms = 9 + Math.floor(r() * 7);
  for (let k = 0; k < arms; k++) {
    let a = r() * Math.PI * 2;
    let x = cx + Math.cos(a) * 50;
    let y = cy + Math.sin(a) * 50;
    let w = 14 + r() * 22;
    const len = 90 + r() * 140;
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      a += (r() - 0.5) * 0.5;
      const nx = x + Math.cos(a) * (len / steps);
      const ny = y + Math.sin(a) * (len / steps);
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(nx, ny);
      g.stroke();
      x = nx;
      y = ny;
      w *= 0.84;
      // 갈라지는 잔가지
      if (r() < 0.18) {
        let bx = x;
        let by = y;
        let ba = a + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.6);
        let bw = w * 0.7;
        for (let j = 0; j < 5; j++) {
          const ex = bx + Math.cos(ba) * 14;
          const ey = by + Math.sin(ba) * 14;
          g.lineWidth = bw;
          g.beginPath();
          g.moveTo(bx, by);
          g.lineTo(ex, ey);
          g.stroke();
          bx = ex;
          by = ey;
          bw *= 0.75;
          ba += (r() - 0.5) * 0.6;
        }
      }
    }
    g.beginPath();
    g.arc(x + Math.cos(a) * 10, y + Math.sin(a) * 10, 3 + r() * 9, 0, Math.PI * 2);
    g.fill();
  }
  // 흩뿌린 작은 방울
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2;
    const d = 80 + r() * 160;
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5 + r() * 6, 0, Math.PI * 2);
    g.fill();
  }
  // 물감의 결 (옅은 회색 음영)
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(200,210,225,${0.15 + r() * 0.2})`;
    g.beginPath();
    g.ellipse(cx + (r() - 0.5) * 300, cy + (r() - 0.5) * 300, 20 + r() * 60, 4 + r() * 10, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _v = new THREE.Vector3();

export class UnlimitedVoid {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.state = 'idle';
    this.t = 0;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    // 결계 돔
    this.domeU = { uFade: { value: 0 }, uTime: { value: 0 } };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1.7, 40, 24), new THREE.ShaderMaterial({ vertexShader: domeVert, fragmentShader: domeFrag, uniforms: this.domeU, depthWrite: false, transparent: true, side: THREE.DoubleSide }));
    this.sigil = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: sigilTexture(), transparent: true, depthWrite: false, opacity: 0, fog: false }));
    this.sigil.rotation.x = -Math.PI / 2;
    this.sigil.renderOrder = 2;
    // 하늘의 육안
    this.eyes = [eyeTexture(false), eyeTexture(true)].map((tex) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.9), new THREE.MeshBasicMaterial({ map: tex, color: 0x9fe4ff, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      return m;
    });
    // 화이트아웃 / 섬광
    this.white = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false }));
    this.white.renderOrder = 300;
    ctx.camera.add(this.white);
    this.white.visible = false;
    // 워프 터널
    this.warpU = { uTime: { value: 0 }, uFade: { value: 0 } };
    const wg = new THREE.CylinderGeometry(4.5, 4.5, 90, 64, 1, true);
    wg.rotateX(Math.PI / 2);
    this.warp = new THREE.Mesh(wg, new THREE.ShaderMaterial({ vertexShader: warpVert, fragmentShader: warpFrag, uniforms: this.warpU, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.warp.renderOrder = 5;
    // 무량공처 하늘
    this.voidU = { uTime: { value: 0 }, uFade: { value: 0 }, uHole: { value: new THREE.Vector3(0, 0.12, -1) } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(380, 48, 24), new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: voidFrag, uniforms: this.voidU, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.sky.renderOrder = -9;
    this.sky.frustumCulled = false;
    // 발밑 빛 고리
    this.floorGlow = new THREE.Mesh(new THREE.CircleGeometry(3.5, 48), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x6fa8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.floorGlow.rotation.x = -Math.PI / 2;
    this.floorGlow.position.y = 0.01;
    // 먹물 얼룩
    this.inkTex = [];
    for (let i = 0; i < 10; i++) this.inkTex.push(inkTexture(17 + i * 7919));
    this.inks = [];
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.inkTex[i % 10], color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      s.renderOrder = 3;
      this.inks.push({ s, base: new THREE.Vector3(), drift: new THREE.Vector3(), spin: 0, t: 0, life: 0, size: 1 });
    }
    this.group.add(this.dome, this.sigil, ...this.eyes, this.warp, this.sky, this.floorGlow, ...this.inks.map((x) => x.s));
    this.center = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
  }

  get frozenPhase() {
    return this.state === 'warp' || this.state === 'flash' || this.state === 'active';
  }

  start(center, dir) {
    this.state = 'barrier';
    this.t = 0;
    this.center.copy(center);
    this.dir.copy(dir).setY(0).normalize();
    if (this.dir.lengthSq() < 0.5) this.dir.set(0, 0, -1);
    this.group.visible = true;
    this.white.visible = true;
    // (요청에 따라 하늘의 눈과 발밑 문양은 쓰지 않는다)
    this.dome.visible = true;
    this.sigil.visible = false;
    this.eyes.forEach((e) => (e.visible = false));
    this.domeU.uFade.value = 0;
    this.sigil.material.opacity = 0;
    this.dome.position.copy(center).setY(1.2);
    this.sigil.position.set(center.x, 0.015, center.z);
    const right = _v.set(-this.dir.z, 0, this.dir.x);
    this.eyes.forEach((e, i) => {
      e.position.copy(center).addScaledVector(this.dir, 17).addScaledVector(right, i ? 4.2 : -4.2);
      e.position.y = 8.5;
      e.lookAt(center.x, 1.6, center.z);
    });
    this.warp.visible = false;
    this.sky.visible = false;
    this.floorGlow.visible = false;
    for (const ink of this.inks) ink.s.visible = false;
    this.voidU.uHole.value.copy(this.dir).setY(0.12).normalize();
  }

  /** 튀듯이 나타났다가 사라지고, 다른 곳에 다시 생긴다 */
  _tickInk(ink, dt) {
    ink.t += dt;
    const k = ink.t / ink.life;
    if (k >= 1) {
      this._respawnInk(ink);
      return;
    }
    const appear = Math.min(1, ink.t / 0.18);
    const pop = 1 - Math.pow(1 - appear, 3);
    const fade = k > 0.75 ? (1 - k) / 0.25 : 1;
    ink.s.scale.setScalar(ink.size * (0.4 + 0.6 * pop));
    ink.s.material.opacity = 0.95 * pop * fade;
    ink.s.material.rotation += ink.spin * dt;
  }

  stop() {
    if (this.state === 'idle' || this.state === 'exit') return;
    this.state = 'exit';
    this.t = 0;
  }

  _enterVoid() {
    const { env } = this.ctx;
    env.setHidden(true);
    env.fog.near = 400;
    env.fog.far = 1000;
    env.hemi.color.set(0x9fc0ff);
    env.hemi.groundColor.set(0x101830);
    env.hemi.intensity = 1.4;
    env.sun.intensity = 0.4;
    this.sky.visible = true;
    this.floorGlow.visible = true;
    this.floorGlow.position.set(this.center.x, 0.01, this.center.z);
    this.inks.forEach((ink, i) => {
      this._respawnInk(ink);
      ink.t = Math.random() * ink.life; // 처음부터 엇갈리게
      ink.s.visible = true;
    });
  }

  /** 물감 얼룩 하나를 영역(구)의 겉면 위 새 위치에 다시 뿌린다 — 위치는 고정, 머리를 따라오지 않는다 */
  _respawnInk(ink) {
    const R = 20;
    const d = _v.randomDirection();
    d.y = 0.04 + Math.abs(d.y) * 0.9;
    d.normalize();
    ink.base.set(this.center.x, 1.5, this.center.z).addScaledVector(d, R);
    ink.s.position.copy(ink.base);
    ink.size = 3 + Math.random() * 6;
    ink.s.material.map = this.inkTex[Math.floor(Math.random() * this.inkTex.length)];
    ink.s.material.rotation = Math.random() * Math.PI * 2;
    ink.spin = (Math.random() - 0.5) * 0.08;
    ink.drift.set(0, 0, 0);
    ink.t = 0;
    ink.life = 1.6 + Math.random() * 2.4;
  }

  _exitVoid() {
    const { env } = this.ctx;
    env.setHidden(false);
    env.restore();
    this.group.visible = false;
    this.white.visible = false;
    this.white.material.opacity = 0;
  }

  update(dt) {
    if (this.state === 'idle') return;
    this.t += dt;
    const t = this.t;
    const fx = this.ctx.fx;
    const inp = this.ctx.input;
    this.domeU.uTime.value += dt;
    this.warpU.uTime.value += dt;
    this.voidU.uTime.value += dt;
    const W = this.white.material;

    if (this.state === 'barrier') {
      const k = Math.min(1, t / 0.6);
      this.domeU.uFade.value = k;
      if (Math.random() < 0.5) fx.spawn(_v.copy(this.dome.position).addScaledVector(new THREE.Vector3().randomDirection(), 1.7), new THREE.Vector3(0, 0.6, 0), new THREE.Color(0x7fc0ff), 0.025, 0.8, 0.5, 0);
      if (t > 1.5) {
        // 화이트아웃
        W.opacity = Math.min(1, (t - 1.5) / 0.6);
        if (t > 2.1) {
          this.state = 'warp';
          this.t = 0;
          this._enterVoid();
          this.dome.visible = this.sigil.visible = false;
          this.eyes.forEach((e) => (e.visible = false));
          this.warp.visible = true;
          this.warp.position.copy(inp.head);
          // 고개를 숙이거나 들어도 수평(좌우 방향)만 따라 정면에서 날아오게
          const yawDir = new THREE.Vector3(inp.headDir.x, 0, inp.headDir.z);
          if (yawDir.lengthSq() < 1e-4) yawDir.copy(this.dir);
          this.warp.lookAt(_v.copy(inp.head).add(yawDir.normalize()));
          this.ctx.sfx.rumble(1.4, 0.3);
        }
      }
    } else if (this.state === 'warp') {
      W.opacity = Math.max(0, 1 - t / 0.25);
      this.warpU.uFade.value = Math.min(1, t / 0.2);
      this.warp.position.copy(inp.head);
      // 앞에서 날아오는 흰 빛 구슬
      for (let i = 0; i < 3; i++) {
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.warp.quaternion);
        const p = inp.head.clone().addScaledVector(fwd, 30).add(new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, 0));
        fx.spawn(p, fwd.clone().multiplyScalar(-40), new THREE.Color(0xffffff), 0.12 + Math.random() * 0.2, 0.8, 0, 0);
      }
      if (t > 1.2) W.opacity = Math.min(1, (t - 1.2) / 0.25);
      if (t > 1.45) {
        this.state = 'flash';
        this.t = 0;
        this.warp.visible = false;
        this.voidU.uFade.value = 1;
      }
    } else if (this.state === 'flash') {
      W.opacity = Math.max(0, 1 - t / 0.6);
      this.floorGlow.material.opacity = 0.35 * Math.min(1, t / 0.6);
      for (const ink of this.inks) this._tickInk(ink, dt);
      if (t > 0.6) {
        this.state = 'active';
        this.t = 0;
      }
    } else if (this.state === 'active') {
      for (const ink of this.inks) this._tickInk(ink, dt);
      if (Math.random() < 0.3) fx.starFlare(_v.copy(inp.head).add(new THREE.Vector3((Math.random() - 0.5) * 30, Math.random() * 12, (Math.random() - 0.5) * 30)), 0xffffff, 0.8 + Math.random() * 1.5, 0.5);
    } else if (this.state === 'exit') {
      W.opacity = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.5);
      if (t >= 0.3 && this.group.visible && this.sky.visible) {
        this.sky.visible = false;
        this.floorGlow.visible = false;
        for (const ink of this.inks) ink.s.visible = false;
        this.ctx.env.setHidden(false);
        this.ctx.env.restore();
      }
      if (t > 0.8) {
        this.state = 'idle';
        this._exitVoid();
      }
    }
  }
}
