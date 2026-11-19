// 게토 스구루 — 주령조술 효과
//  · 주령구(呪霊球): 속에서 빛이 나는 유리구슬. 주령마다 색이 다르다
//  · 주령이 나오는 검은 소용돌이 구멍
//  · 쿠치사케온나의 거대한 가위 · 극번 「渦(소용돌이)」의 검은 나선 구
import * as THREE from 'three';
import { makeGlowSprite } from '../../core/fx.js';
import { FONT } from '../../core/ui.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const NOISE = /* glsl */ `
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
`;

// ───────────────── 주령구 ─────────────────
const ORB_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const ORB_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uGlow; uniform float uSeed; uniform float uFade;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
${NOISE}
void main() {
  float ndv = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  // 유리 속을 들여다보는 깊이: 가운데일수록 깊다 → 안쪽 구름을 여러 겹 겹쳐 본다
  vec3 p = normalize(vP);
  float a = uTime * 0.6 + uSeed;
  mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
  float cloud = 0.0;
  for (int i = 0; i < 3; i++) {
    float d = 0.35 + float(i) * 0.25;
    vec3 q = p * mix(1.0, d, ndv);
    q.xz = r * q.xz;
    cloud += smoothstep(0.42, 0.85, fbm(q * 2.6 + vec3(uSeed, uTime * 0.25, float(i) * 3.1)));
  }
  cloud /= 3.0;
  float core = pow(ndv, 4.0);
  vec3 col = uColor * (0.25 + cloud * 1.9) + vec3(1.0) * core * (0.35 + 0.65 * cloud) * uGlow;
  // 유리 테두리와 하이라이트
  col += vec3(0.85, 0.92, 1.0) * fres * 0.9;
  float spec = pow(max(0.0, dot(normalize(vN), normalize(vec3(0.4, 0.7, 0.6)))), 40.0);
  col += vec3(1.0) * spec * 1.2;
  float alpha = clamp(0.5 + fres * 0.45 + cloud * 0.35 + core * 0.2, 0.0, 1.0) * uFade;
  gl_FragColor = vec4(col, alpha);
}`;

const _orbGeo = new THREE.SphereGeometry(1, 28, 20);
_orbGeo.userData.shared = true;

/** 주령구 하나 (Group: 유리 구슬 + 번짐). r: 반지름(m) */
export function makeOrb(color, r = 0.04) {
  const c = new THREE.Color(color);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: c }, uTime: { value: 0 }, uGlow: { value: 1 }, uSeed: { value: Math.random() * 10 }, uFade: { value: 1 } },
    vertexShader: ORB_VERT, fragmentShader: ORB_FRAG, transparent: true, depthWrite: false, toneMapped: false,
  });
  const g = new THREE.Group();
  const m = new THREE.Mesh(_orbGeo, mat);
  m.scale.setScalar(r);
  m.renderOrder = 6;
  g.add(m);
  const glow = makeGlowSprite(c.clone().lerp(new THREE.Color(1, 1, 1), 0.35), r * 5.5);
  glow.material.opacity = 0.55;
  glow.material.depthWrite = false;
  glow.renderOrder = 5;
  g.add(glow);
  g.userData = { mat, glow, r, color: c };
  return g;
}

export function tickOrb(orb, t, glow = 1, fade = 1) {
  const u = orb.userData.mat.uniforms;
  u.uTime.value = t;
  u.uGlow.value = glow;
  u.uFade.value = fade;
  orb.userData.glow.material.opacity = 0.55 * fade * (0.8 + 0.2 * Math.sin(t * 5 + u.uSeed.value));
}

export function disposeOrb(orb) {
  orb.parent?.remove(orb);
  orb.userData.mat.dispose();
  orb.userData.glow.material.dispose();
}

/** 주령구 옆 이름표 (스프라이트) */
export function makeLabel() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 72;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(0.1, 0.028, 1);
  s.renderOrder = 40;
  s.userData = { c, tex, text: '' };
  return s;
}

export function setLabel(s, text, color = '#ffffff') {
  if (s.userData.text === text + color) return;
  s.userData.text = text + color;
  const g = s.userData.c.getContext('2d');
  g.clearRect(0, 0, 256, 72);
  g.font = `800 34px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 128, 38);
  g.fillStyle = color;
  g.fillText(text, 128, 38);
  s.userData.tex.needsUpdate = true;
}

// ───────────────── 주령이 나오는 구멍 ─────────────────
const PORTAL_FRAG = /* glsl */ `
uniform float uTime; uniform float uOpen; uniform vec3 uColor; uniform float uRing;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float ang = atan(p.y, p.x);
  float sw = fbm(vec3(ang * 1.6 + r * 5.0 - uTime * 2.5, r * 3.0, uTime * 0.4));
  float arms = sin(ang * 4.0 + r * 11.0 - uTime * 5.0) * 0.5 + 0.5;
  float ring = smoothstep(0.72, 0.9, r) * smoothstep(1.0, 0.9, r);
  vec3 col = vec3(0.012, 0.004, 0.02);
  col += uColor * (arms * sw * 0.7) * smoothstep(0.15, 0.85, r);
  col += uColor * ring * 1.4;
  float edge = smoothstep(1.0, 0.82 + 0.1 * sw, r);
  // 간이영역처럼 테두리만 (안쪽은 옅게)
  float a = mix(edge * (0.88 + 0.12 * arms), max(ring, 0.12 * edge + 0.25 * arms * smoothstep(0.6, 0.95, r)), uRing);
  gl_FragColor = vec4(col, a * uOpen);
}`;
const _discGeo = new THREE.CircleGeometry(1, 40);
_discGeo.userData.shared = true;

export class Portals {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  /** at: 중심, normal: 구멍이 바라보는 방향(바닥이면 위), r: 반지름. 반환값.close() 로 닫는다 */
  open(at, r = 1, { normal = UP, color = 0x5a2a8a, life = 0, ring = false } = {}) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: Math.random() * 10 }, uOpen: { value: 0 }, uColor: { value: new THREE.Color(color) }, uRing: { value: ring ? 1 : 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: PORTAL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const m = new THREE.Mesh(_discGeo, mat);
    m.position.copy(at);
    if (normal.y > 0.99) m.position.y = Math.max(m.position.y, 0.012);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v.copy(normal).normalize());
    m.renderOrder = 3;
    this.scene.add(m);
    const p = { m, mat, r, k: 0, closing: false, life, t: 0, close: () => (p.closing = true) };
    m.scale.setScalar(0.01);
    this.list.push(p);
    return p;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.life && p.t > p.life) p.closing = true;
      p.k = p.closing ? Math.max(0, p.k - dt * 2.2) : Math.min(1, p.k + dt * 3.5);
      const e = 1 - Math.pow(1 - p.k, 3);
      p.m.scale.setScalar(Math.max(0.01, p.r * e));
      p.mat.uniforms.uOpen.value = e;
      p.mat.uniforms.uTime.value += dt;
      if (p.closing && p.k <= 0) {
        this.scene.remove(p.m);
        p.mat.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.list) {
      this.scene.remove(p.m);
      p.mat.dispose();
    }
    this.list = [];
  }
}

// ───────────────── 쿠치사케온나의 거대한 가위 ─────────────────
let _bladeGeo = null;
function bladeGeo() {
  if (_bladeGeo) return _bladeGeo;
  // 길쭉한 칼날 (날 쪽이 곧고 등 쪽이 휘어진 쐐기) + 손잡이 고리
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(1.0, 0.0);
  s.quadraticCurveTo(0.6, 0.11, 0, 0.13);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
  g.translate(0, 0, -0.01);
  const ring = new THREE.TorusGeometry(0.11, 0.025, 6, 16).translate(-0.16, 0.06, 0);
  _bladeGeo = { blade: g, ring };
  return _bladeGeo;
}

export class GiantScissors {
  /** at: 자를 곳(가운데), dir: 가위가 향하는 방향(수평), size: 날 길이(m) */
  constructor(ctx, at, dir, size = 2.2, onSnip = null) {
    this.ctx = ctx;
    const G = bladeGeo();
    const metal = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.4, envMap: ctx.world.envMap });
    const handle = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    this.mats = [metal, handle];
    this.root = new THREE.Group();
    this.root.position.copy(at);
    this.root.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), _v.copy(dir).setY(0).normalize());
    this.root.scale.setScalar(size);
    this.a = new THREE.Group();
    this.b = new THREE.Group();
    for (const [g, s] of [[this.a, 1], [this.b, -1]]) {
      const bl = new THREE.Mesh(G.blade, metal);
      bl.scale.y = s;
      const rg = new THREE.Mesh(G.ring, handle);
      rg.scale.y = s;
      g.add(bl, rg);
      this.root.add(g);
    }
    this.root.position.addScaledVector(_v.copy(dir).setY(0).normalize(), -size * 0.45);
    ctx.scene.add(this.root);
    this.t = 0;
    this.snipped = false;
    this.onSnip = onSnip;
    this.alive = true;
  }

  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const t = this.t;
    // 벌렸다가(0.35s) 싹둑(0.12s) → 잠깐 멈춤 → 사라짐
    let open;
    if (t < 0) open = 0.75 * Math.min(1, (t + 0.35) / 0.2); // 예고: 벌린 채 기다린다
    else if (t < 0.35) open = 0.75;
    else if (t < 0.47) open = 0.75 * (1 - (t - 0.35) / 0.12);
    else open = 0;
    if (!this.snipped && t >= 0.47) {
      this.snipped = true;
      this.ctx.sfx.play('slash', { at: this.root.position, vol: 1, rate: 0.55 });
      this.ctx.sfx.cut(this.root.position);
      this.onSnip?.();
    }
    this.a.rotation.z = open;
    this.b.rotation.z = -open;
    const fade = t > 0.9 ? Math.max(0, 1 - (t - 0.9) / 0.3) : 1;
    this.root.scale.multiplyScalar(1); // 크기 유지
    for (const m of this.mats) {
      m.transparent = fade < 1;
      m.opacity = fade;
    }
    if (t > 1.2) {
      this.dispose();
      return false;
    }
    return true;
  }

  dispose() {
    this.alive = false;
    this.ctx.scene.remove(this.root);
    for (const m of this.mats) m.dispose();
  }
}

// ───────────────── 극번 「渦」 ─────────────────
const SPIRAL_FRAG = /* glsl */ `
uniform float uTime; uniform float uPower; uniform vec3 uTint;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
${NOISE}
void main() {
  float ndv = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  vec3 p = normalize(vP);
  float ang = atan(p.z, p.x);
  float lat = p.y;
  // 회전하는 나선 띠: 주령들이 뭉쳐 휘감긴다
  float sw = sin(ang * 3.0 + lat * 9.0 - uTime * 9.0) * 0.5 + 0.5;
  float n = fbm(vec3(ang * 2.0 - uTime * 2.0, lat * 4.0, uTime * 0.5));
  float band = smoothstep(0.55, 0.95, sw * 0.6 + n * 0.6);
  vec3 col = vec3(0.01, 0.005, 0.015);
  col += uTint * band * (0.6 + uPower * 0.8);
  col += vec3(0.75, 0.6, 1.0) * pow(1.0 - ndv, 2.5) * (0.6 + uPower);
  gl_FragColor = vec4(col, 0.92);
}`;

export function makeSpiralSphere(tint = 0x6a3aa0) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uTint: { value: new THREE.Color(tint) } },
    vertexShader: ORB_VERT, fragmentShader: SPIRAL_FRAG, transparent: true, depthWrite: false, toneMapped: false,
  });
  const m = new THREE.Mesh(_orbGeo, mat);
  m.renderOrder = 7;
  const glow = makeGlowSprite(new THREE.Color(0x8a5ad0), 3);
  glow.material.opacity = 0.4;
  m.add(glow);
  m.userData = { mat, glow };
  return m;
}

export { NOISE };
void _q;
void _v2;
