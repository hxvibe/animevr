// 스쿠나 VFX: 참격 초승달 · 절단선 · 화염 화살 · 불기둥
import * as THREE from 'three';
import { glowTexture } from '../../core/fx.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

// ── 참격 텍스처: 검은 칼날 + 하얀 빛 테두리, 양끝이 가늘게 빠지는 초승달 ──
let _bladeTex = null;
export function bladeTexture() {
  if (_bladeTex) return _bladeTex;
  const W = 1024;
  const H = 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cy = H / 2;
  // 살짝 휜 칼날 윤곽 (위·아래 곡선, 양끝 뾰족)
  const blade = (thick, x0 = 40, x1 = W - 40, bend = 7) => {
    g.beginPath();
    g.moveTo(x0, cy + bend);
    g.bezierCurveTo(W * 0.32, cy - thick * 1.05 + bend * 0.4, W * 0.62, cy - thick * 0.95 - bend * 0.4, x1, cy - bend);
    g.bezierCurveTo(W * 0.62, cy + thick * 0.95 - bend * 0.4, W * 0.32, cy + thick * 1.05 + bend * 0.4, x0, cy + bend);
    g.closePath();
  };
  // 바깥 하얀 빛
  g.save();
  g.shadowColor = 'rgba(255,255,255,1)';
  g.shadowBlur = 24;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  blade(52, 16, W - 16);
  g.fill();
  g.shadowBlur = 10;
  blade(47, 22, W - 22);
  g.fill();
  g.restore();
  // 검은 칼날
  g.fillStyle = '#050505';
  blade(38, 46, W - 46);
  g.fill();
  // 가장자리를 따라 갈라지는 얇은 검은 파편
  g.fillStyle = '#050505';
  for (const [x, y, len, dir] of [[300, cy - 34, 120, -1], [560, cy + 33, 150, 1], [760, cy - 26, 110, -1], [200, cy + 24, 90, 1]]) {
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len * 0.5, y + dir * 8, x + len, y + dir * 3);
    g.quadraticCurveTo(x + len * 0.5, y + dir * 1, x, y);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _bladeTex = t;
  return t;
}

function bladeMaterial(color = 0xffffff, opacity = 1) {
  return new THREE.MeshBasicMaterial({ map: bladeTexture(), color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
}

/** 순간적으로 번쩍이는 절단선 (인스턴스 묶음). 선 방향 축으로 카메라를 향해 돈다 */
export class SlashLines {
  constructor(scene, max = 120) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = bladeMaterial(0xffffff, 1);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.bright = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ life: 0, max: 1, pos: new THREE.Vector3(), along: new THREE.Vector3(1, 0, 0), len: 1, w: 0.02, color: new THREE.Color() });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.cursor = 0;
    this._y = new THREE.Vector3();
    this._z = new THREE.Vector3();
  }

  /**
   * @param pos 중심
   * @param along 선 방향 (절단면 위)
   * @param normal 절단면 법선 (호환용)
   */
  add(pos, along, normal, len = 1, w = 0.02, life = 0.15, color = 0xffffff, ratio = 0.075) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.pos.copy(pos);
    it.along.copy(along).normalize();
    it.len = len;
    it.w = Math.max(w * 4, len * ratio);
    it.life = it.max = life;
    // 칼날은 검정 고정, 빛 테두리만 살짝 물들인다
    it.color.set(color === 0xffffff ? 0xffffff : 0xffd0d0);
    void normal;
  }

  update(dt, camPos) {
    let any = false;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      any = true;
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      const grow = Math.min(1, (1 - k) * 5 + 0.25);
      const x = it.along;
      if (camPos) this._z.subVectors(camPos, it.pos).normalize();
      else this._z.set(0, 0, 1);
      this._y.crossVectors(this._z, x);
      if (this._y.lengthSq() < 1e-6) this._y.set(0, 1, 0);
      this._y.normalize();
      this._z.crossVectors(x, this._y);
      _m.makeBasis(x, this._y, this._z);
      _q.setFromRotationMatrix(_m);
      _s.set(it.len * grow, it.w * (0.35 + 0.65 * k), 1);
      this.mesh.setMatrixAt(i, _m.compose(it.pos, _q, it.life > 0 ? _s : _s.set(0, 0, 0)));
      this.mesh.setColorAt(i, it.color);
    }
    if (any) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

/**
 * 해(解) 참격: 날아가는 칼날. 그룹의 로컬 X = 칼날 길이 방향(along), Z = 진행 방향(카메라 쪽을 향함)
 * 겹친 두 장(정면 + 살짝 기운 면)으로 어느 각도에서도 보이게 한다
 */
export function makeCrescent(radius = 0.7) {
  const g = new THREE.Group();
  const len = radius * 2.6;
  const geo = new THREE.PlaneGeometry(1, 1, 16, 1);
  // 진행 방향으로 살짝 휜 초승달
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    P.setZ(i, (1 - 4 * x * x) * 0.12);
  }
  const front = new THREE.Mesh(geo, bladeMaterial(0xffffff, 1));
  // 굵기: 더미에 맞았을 때 남는 절단선(SlashLines)과 같은 비율 (길이의 7.5% · 검은 칼날은 그 절반 남짓)
  front.scale.set(len, len * 0.058, len);
  const tilt = new THREE.Mesh(geo, bladeMaterial(0xffffff, 0.75));
  tilt.scale.copy(front.scale);
  tilt.rotation.x = Math.PI / 2;
  g.add(front, tilt);
  g.userData.blade = true;
  return g;
}

const fireVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const fireFrag = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
uniform float uTime;
uniform float uFade;
uniform float uScroll;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }
void main() {
  float n = fbm(vec2(vUv.x * 6.0, vUv.y * 3.0 - uTime * uScroll));
  float edge = abs(dot(normalize(vN), normalize(vV)));
  float body = smoothstep(0.0, 0.6, edge) ;
  float f = clamp(n * 1.4 - (1.0 - vUv.y) * 0.15, 0.0, 1.0) * (0.35 + body);
  vec3 c = mix(vec3(0.6, 0.05, 0.0), vec3(1.0, 0.45, 0.05), smoothstep(0.2, 0.6, f));
  c = mix(c, vec3(1.0, 0.95, 0.7), smoothstep(0.65, 0.95, f));
  gl_FragColor = vec4(c * f * 2.2 * uFade, 1.0);
}`;

export function fireMaterial(scroll = 2.0) {
  return new THREE.ShaderMaterial({
    vertexShader: fireVert,
    fragmentShader: fireFrag,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uScroll: { value: scroll } },
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

// ── 개(開) 화염 화살: 셀 셰이딩(애니메이션풍)으로 칠한 입체 불새 화살 ──
// 화살 축: 꼬리 z=0 → 머리 z=-1 (단위 길이). aT = 0(머리) ~ 1(꼬리)

/** 반지름이 줄어드는 튜브 (곡선을 따라가는 불꽃 혀) */
function taperedTube(curve, segs, radial, r0, rFn) {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [];
  const nor = [];
  const at = [];
  const idx = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, P);
    const r = r0 * rFn(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const nx = Math.cos(a) * N.x + Math.sin(a) * B.x;
      const ny = Math.cos(a) * N.y + Math.sin(a) * B.y;
      const nz = Math.cos(a) * N.z + Math.sin(a) * B.z;
      pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r);
      nor.push(nx, ny, nz);
      at.push(u);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1));
  g.setIndex(idx);
  return g;
}

let _arrowGeo = null;
function arrowGeometry() {
  if (_arrowGeo) return _arrowGeo;
  const parts = [];
  // 몸통: 뾰족한 머리 → 부푼 가슴 → 길게 빠지는 꼬리
  const prof = [[0, 0], [0.05, 0.03], [0.12, 0.07], [0.2, 0.12], [0.24, 0.2], [0.16, 0.27], [0.19, 0.36], [0.17, 0.5], [0.12, 0.66], [0.07, 0.82], [0.02, 1]];
  const pts = prof.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
  const body = new THREE.LatheGeometry(pts, 14);
  body.rotateX(Math.PI / 2);
  body.translate(0, 0, -1);
  const bp = body.attributes.position;
  const bt = new Float32Array(bp.count);
  for (let i = 0; i < bp.count; i++) bt[i] = THREE.MathUtils.clamp(bp.getZ(i) + 1, 0, 1);
  body.setAttribute('aT', new THREE.BufferAttribute(bt, 1));
  body.deleteAttribute('uv');
  parts.push(body);
  // 날개처럼 뒤로 휘어지는 불꽃 혀들 (위·아래·좌·우)
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const tongue = (z0, ang, spread, len, r0, curl) => {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dx * 0.08, dy * 0.08, z0),
      new THREE.Vector3(dx * spread * 0.45, dy * spread * 0.45, z0 + len * 0.3),
      new THREE.Vector3(dx * spread * 0.85 - dy * curl, dy * spread * 0.85 + dx * curl, z0 + len * 0.65),
      new THREE.Vector3(dx * spread * 1.0 - dy * curl * 2, dy * spread * 1.0 + dx * curl * 2, z0 + len),
    ]);
    const g = taperedTube(c, 22, 7, r0, (u) => Math.pow(Math.sin(Math.min(1, u * 2.2 + 0.08) * Math.PI * 0.5), 0.7) * Math.pow(1 - u, 0.85));
    // 몸통 기준 aT로 변환 (머리 0 ~ 꼬리 1)
    const a = g.attributes.aT;
    for (let i = 0; i < a.count; i++) a.setX(i, THREE.MathUtils.clamp(z0 + 1 + a.getX(i) * len, 0, 1.3));
    parts.push(g);
  };
  // 큰 날개 (좌우로 크게)
  for (const side of [0, Math.PI]) {
    tongue(-0.74, side + 0.25, 0.75, 0.75, 0.085, 0.05);
    tongue(-0.66, side - 0.25, 0.62, 0.7, 0.07, -0.06);
    tongue(-0.55, side + 0.6, 0.5, 0.62, 0.06, 0.08);
  }
  // 위아래로 짧게
  tongue(-0.7, Math.PI / 2 + 0.2, 0.38, 0.6, 0.06, 0.04);
  tongue(-0.62, -Math.PI / 2 - 0.2, 0.34, 0.55, 0.055, -0.04);
  // 꼬리 쪽 가는 갈래
  for (let i = 0; i < 5; i++) tongue(-0.42 + i * 0.07, rnd() * Math.PI * 2, 0.22 + rnd() * 0.25, 0.5 + rnd() * 0.3, 0.035, (rnd() - 0.5) * 0.15);
  // 합치기
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const at = new Float32Array(total);
  const idx = [];
  let off = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    at.set(g.attributes.aT.array, off);
    const I = g.index.array;
    for (let i = 0; i < I.length; i++) idx.push(I[i] + off);
    off += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(at, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  _arrowGeo = geo;
  return geo;
}

const NOISE_GLSL = /* glsl */ `
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
}`;
const celVert = /* glsl */ `
attribute float aT;
uniform float uTime;
uniform float uSeed;
uniform float uOutline;
varying float vT;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
${NOISE_GLSL}
void main() {
  vT = aT;
  float t = uTime * 3.0 + uSeed;
  vec3 p = position;
  // 꼬리로 갈수록 일렁임
  float w = smoothstep(0.15, 1.0, aT);
  p += normal * (noise(vec3(p * 9.0 + vec3(0.0, 0.0, t))) - 0.4) * 0.07 * w;
  p.x += sin(aT * 11.0 - uTime * 12.0 + uSeed) * 0.05 * w;
  p.y += cos(aT * 9.0 - uTime * 10.0 + uSeed) * 0.05 * w;
  p += normal * uOutline;
  vP = p;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const celFrag = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uFade;
uniform float uIsOutline;
varying float vT;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
${NOISE_GLSL}
void main() {
  float t = uTime * 4.0 + uSeed;
  // 꼬리 끝은 조각조각 끊기며 사라진다
  float br = noise(vec3(vP.x * 8.0, vP.y * 8.0, vT * 10.0 - t));
  if (vT > 0.5 && br < (vT - 0.5) * 1.6 + (1.0 - uFade)) discard;
  if (uIsOutline > 0.5) { gl_FragColor = vec4(0.23, 0.03, 0.01, 1.0); return; }
  float facing = abs(dot(normalize(vN), normalize(vV)));
  // 셀 단계: 짙은 주황 테두리 → 주황 → 밝은 주황 → 노랑 결 → 흰 심
  vec3 deep = vec3(0.62, 0.12, 0.03);
  vec3 orange = vec3(1.0, 0.36, 0.07);
  vec3 light = vec3(1.0, 0.6, 0.16);
  vec3 yellow = vec3(1.0, 0.86, 0.42);
  vec3 white = vec3(1.0, 0.97, 0.85);
  float flow = noise(vec3(vP.x * 14.0, vP.y * 14.0, vT * 16.0 - t * 2.0));
  float f = facing + (flow - 0.5) * 0.35;
  vec3 c = deep;
  c = mix(c, orange, step(0.1, f));
  c = mix(c, light, step(0.45, f));
  // 머리에서 꼬리로 흐르는 노란 빛줄기
  float streak = noise(vec3(vP.x * 26.0, vP.y * 26.0, vT * 9.0 - t * 1.6));
  c = mix(c, yellow, step(0.62, streak) * step(0.25, f));
  // 머리 쪽 흰 심
  c = mix(c, white, step(0.68, f) * step(vT, 0.4 + flow * 0.15));
  gl_FragColor = vec4(c * 1.08, 1.0);
}`;

export class FireArrow {
  /** @param ctx 게임 컨텍스트. 예전 호출(scene)도 지원 */
  constructor(ctxOrScene) {
    const isCtx = !!ctxOrScene?.scene;
    this.scene = isCtx ? ctxOrScene.scene : ctxOrScene;
    this.ctx = isCtx ? ctxOrScene : null;
    this.group = new THREE.Group();
    const geo = arrowGeometry();
    const uni = () => ({ uTime: this.time, uSeed: this.seed, uFade: this.fade, uOutline: { value: 0 }, uIsOutline: { value: 0 } });
    this.time = { value: Math.random() * 10 };
    this.seed = { value: Math.random() * 50 };
    this.fade = { value: 1 };
    const u1 = uni();
    const u2 = uni();
    u2.uOutline.value = 0.013;
    u2.uIsOutline.value = 1;
    this.mat = new THREE.ShaderMaterial({ vertexShader: celVert, fragmentShader: celFrag, uniforms: u1, toneMapped: false, side: THREE.FrontSide });
    this.outMat = new THREE.ShaderMaterial({ vertexShader: celVert, fragmentShader: celFrag, uniforms: u2, toneMapped: false, side: THREE.BackSide });
    this.body = new THREE.Group();
    this.main = new THREE.Mesh(geo, this.mat);
    this.outline = new THREE.Mesh(geo, this.outMat);
    this.main.frustumCulled = this.outline.frustumCulled = false;
    this.body.add(this.outline, this.main);
    const tex = glowTexture();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff5a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.5 }));
    this.tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff0c0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.group.add(this.glow, this.body, this.tip);
    this.scene.add(this.group);
    this.setLength(0.5);
  }

  /** 길이만 바뀌고 굵기는 고정 (당길수록 길어진다) */
  setLength(len, thick = 1) {
    this.len = len;
    const w = 0.26 * thick;
    this.body.scale.set(w, w, len);
    this.glow.position.set(0, 0, -len * 0.6);
    this.glow.scale.set(0.6 + len * 0.25, 0.6 + len * 0.25, 1);
    this.tip.position.set(0, 0, -len * 0.98);
    this.tip.scale.setScalar(0.12);
  }

  update(dt) {
    this.time.value += dt;
    this.glow.material.opacity = 0.35 + Math.random() * 0.2;
    this.body.rotation.z += dt * 1.5; // 천천히 비틀며 타오른다
  }

  dispose() {
    this.scene.remove(this.group);
    this.mat.dispose();
    this.outMat.dispose();
    this.glow.material.dispose();
    this.tip.material.dispose();
  }
}

/** 竈(카미노): 착탄 후 솟구치는 불기둥 */
export function spawnFirePillar(fx, pos, height = 9, radius = 1.6, dur = 2.2) {
  const geo = new THREE.CylinderGeometry(radius * 0.6, radius, height, 24, 6, true);
  geo.translate(0, height / 2, 0);
  const mat = fireMaterial(1.6);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos.x, 0, pos.z);
  m.renderOrder = 6;
  fx.addTransient(m, dur, (k, dt) => {
    mat.uniforms.uTime.value += dt ?? 0.016;
    const rise = Math.min(1, k * 5);
    m.scale.set(1 + k * 0.6, rise, 1 + k * 0.6);
    mat.uniforms.uFade.value = k < 0.7 ? 1 : (1 - k) / 0.3;
  }, () => geo.dispose());
}
