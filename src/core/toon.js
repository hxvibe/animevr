// 만화풍(셀 셰이딩) 폭발 부품: 일렁이는 덩어리(불꽃·연기·바람) + 검은 테두리 + 조각조각 부서지며 사라짐
// 스쿠나 개(開)의 착탄 폭발, 나선수리검의 바람 칼날 구에 쓴다
import * as THREE from 'three';

const NOISE = /* glsl */ `
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.1 + 1.3; a *= 0.5; } return s; }`;

const vert = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uDisp;
uniform float uOutline;
uniform float uStretch;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
varying vec3 vWN;
${NOISE}
void main() {
  vec3 p = position;
  // 뭉게뭉게: 큰 혹 + 잔물결
  float n = fbm(p * 1.6 + vec3(uSeed, uSeed * 0.7, uTime * 0.6));
  p += normal * (n - 0.45) * uDisp;
  p.y *= uStretch;
  p += normal * uOutline;
  vP = position;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vWN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uErode;
uniform float uIsOutline;
uniform float uMode;   // 0: 정면이 밝음(불꽃·바람)  1: 위에서 빛(연기)
uniform float uSwirl;  // 바람 결 세기
uniform float uAlpha;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
uniform vec3 uLine;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
varying vec3 vWN;
${NOISE}
void main() {
  // 사라질 때: 큰 구멍이 뚫리며 조각조각 (테두리는 조금 더 오래 남는다)
  float er = fbm(vP * 2.4 + vec3(uSeed));
  if (er < uErode - (uIsOutline > 0.5 ? 0.04 : 0.0)) discard;
  if (uIsOutline > 0.5) { gl_FragColor = vec4(uLine, uAlpha); return; }
  float f;
  if (uMode < 0.5) f = abs(dot(normalize(vN), normalize(vV)));
  else f = dot(normalize(vWN), normalize(vec3(0.3, 1.0, 0.2))) * 0.5 + 0.5;
  float flow = noise(vP * 5.0 + vec3(0.0, -uTime * 2.0, uSeed));
  f += (flow - 0.5) * 0.25;
  // 녹아드는 가장자리는 어둡게 (구멍 둘레에 탄 자국)
  f -= smoothstep(uErode + 0.08, uErode, er) * 0.5;
  vec3 c = uC0;
  c = mix(c, uC1, step(0.22, f));
  c = mix(c, uC2, step(0.45, f));
  c = mix(c, uC3, step(0.66, f));
  c = mix(c, uC4, step(0.84, f));
  if (uSwirl > 0.0) {
    float ang = atan(vP.z, vP.x);
    float s1 = sin(ang * 5.0 + vP.y * 7.0 - uTime * 14.0 + flow * 4.0);
    float s2 = sin(ang * 8.0 - vP.y * 5.0 + uTime * 10.0);
    float st = step(0.93, s1) + step(0.97, s2);
    c = mix(c, uC4, clamp(st, 0.0, 1.0) * uSwirl);
    c = mix(c, uLine, step(0.996, -s1) * uSwirl * 0.8);
  }
  gl_FragColor = vec4(c, uAlpha);
}`;

export const TOON = {
  fire: { c: [0x8a1a06, 0xff4a0a, 0xff8a1a, 0xffd04a, 0xfff6d0], line: 0x2a0602, mode: 0 },
  fireHot: { c: [0xff4a0a, 0xff8a1a, 0xffc040, 0xfff0a0, 0xffffff], line: 0x3a0a02, mode: 0 },
  smoke: { c: [0x141010, 0x241e1c, 0x3a3230, 0x544a46, 0x6e625c], line: 0x050303, mode: 1 },
  wind: { c: [0x2a6cc8, 0x5aa8f0, 0x9ad4ff, 0xd8f2ff, 0xffffff], line: 0x0a2248, mode: 0 },
  windGold: { c: [0xc06a00, 0xffa020, 0xffd060, 0xfff0b0, 0xffffff], line: 0x3a1a00, mode: 0 },
};

const _geo = new THREE.IcosahedronGeometry(1, 4);

/** 셀 셰이딩 덩어리 하나 (본체 + 뒤집힌 테두리) */
export class ToonBlob {
  constructor(palette, { disp = 0.35, outline = 0.05, swirl = 0, alpha = 1, stretch = 1 } = {}) {
    const P = typeof palette === 'string' ? TOON[palette] : palette;
    const col = P.c.map((x) => new THREE.Color(x));
    this.u = {
      uTime: { value: Math.random() * 10 },
      uSeed: { value: Math.random() * 40 },
      uDisp: { value: disp },
      uOutline: { value: 0 },
      uStretch: { value: stretch },
      uErode: { value: -0.1 },
      uIsOutline: { value: 0 },
      uMode: { value: P.mode },
      uSwirl: { value: swirl },
      uAlpha: { value: alpha },
      uC0: { value: col[0] }, uC1: { value: col[1] }, uC2: { value: col[2] }, uC3: { value: col[3] }, uC4: { value: col[4] },
      uLine: { value: new THREE.Color(P.line) },
    };
    const uo = { ...this.u, uOutline: { value: outline }, uIsOutline: { value: 1 } };
    const transparent = alpha < 1;
    this.mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.u, toneMapped: false, transparent, depthWrite: !transparent });
    this.outMat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: uo, toneMapped: false, side: THREE.BackSide, transparent, depthWrite: !transparent });
    this.group = new THREE.Group();
    this.main = new THREE.Mesh(_geo, this.mat);
    this.line = new THREE.Mesh(_geo, this.outMat);
    this.group.add(this.line, this.main);
    this.outlineK = outline;
  }

  /** 반지름이 커져도 테두리 굵기는 일정하게 (단위: 반지름 1 기준 → 실제 m) */
  setOutlineMeters(m, radius) {
    this.line.material.uniforms.uOutline.value = m / Math.max(0.05, radius);
  }

  set(time, erode) {
    this.u.uTime.value = time;
    this.u.uErode.value = erode;
  }

  dispose() {
    this.mat.dispose();
    this.outMat.dispose();
  }
}

/**
 * 덩어리를 fx 임시 객체로 띄운다.
 * @param opts.from 시작 위치, opts.to 끝 위치, opts.r0/r1 반지름, opts.dur, opts.delay,
 *             opts.erodeAt (0~1, 이때부터 부서짐), opts.outline (m), opts.rise (m/s)
 */
export function spawnToonBlob(fx, palette, opts) {
  const b = new ToonBlob(palette, opts);
  const g = b.group;
  const from = opts.from.clone();
  const to = (opts.to ?? opts.from).clone();
  const r0 = opts.r0 ?? 0.1;
  const r1 = opts.r1 ?? 1;
  const delay = opts.delay ?? 0;
  const dur = opts.dur ?? 1;
  const erodeAt = opts.erodeAt ?? 0.45;
  const rise = opts.rise ?? 0;
  const ease = opts.ease ?? ((k) => 1 - Math.pow(1 - k, 3));
  g.visible = delay <= 0;
  g.position.copy(from);
  g.scale.setScalar(r0);
  g.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  const spin = (Math.random() - 0.5) * 1.5;
  let t = -delay;
  let time = b.u.uTime.value;
  fx.addTransient(g, dur + delay, (k, dt) => {
    t += dt;
    time += dt;
    if (t < 0) return;
    g.visible = true;
    const q = Math.min(1, t / dur);
    const e = ease(Math.min(1, q / (opts.growK ?? 0.35)));
    g.position.lerpVectors(from, to, e);
    g.position.y += rise * t;
    const r = r0 + (r1 - r0) * e;
    g.scale.setScalar(r);
    g.rotation.y += spin * dt;
    b.setOutlineMeters(opts.outline ?? 0.06, r);
    const er = q < erodeAt ? -0.1 : -0.1 + ((q - erodeAt) / (1 - erodeAt)) * 1.05;
    b.set(time, er);
    opts.onUpdate?.(q, r, g);
  }, () => b.dispose());
  return b;
}

// ── 그을린 자국 ──
function vnoise(seed) {
  // 값 잡음 (2D, 주기 없는 단순 격자)
  const P = new Float32Array(256 * 256);
  let s = seed;
  for (let i = 0; i < P.length; i++) {
    s = (s * 16807) % 2147483647;
    P[i] = s / 2147483647;
  }
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
}

const _scorch = [];
/** 폭발 그을음 텍스처 (몇 가지를 미리 만들어 돌려 쓴다) */
export function scorchTexture(i = 0) {
  i %= 3;
  if (_scorch[i]) return _scorch[i];
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const n = vnoise(1234 + i * 977);
  const fb = (x, y) => n(x, y) * 0.5 + n(x * 2.1 + 7, y * 2.1 + 3) * 0.25 + n(x * 4.3 + 1, y * 4.3 + 9) * 0.125 + n(x * 8.7, y * 8.7) * 0.0625;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2);
      const dy = (y - S / 2) / (S / 2);
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      // 들쭉날쭉한 외곽 + 바깥으로 뻗는 폭발 줄무늬
      const edge = 0.62 + (fb(Math.cos(a) * 2 + 10, Math.sin(a) * 2 + 10) - 0.45) * 0.55;
      const rays = Math.pow(n(a * 9 + 50, 3.3) , 3) * 0.45;
      const rr = r / (edge + rays);
      const grain = fb(x / 22, y / 22);
      const fine = n(x / 3.1, y / 3.1);
      // 중심은 숯처럼 새까맣고, 바깥으로 갈수록 갈색으로 옅어짐
      let alpha = 1 - smooth(0.55, 1.0, rr);
      alpha *= 0.75 + 0.45 * grain;
      alpha += (fine > 0.86 ? 0.25 : 0) * (1 - smooth(0.3, 1.25, rr)); // 흩뿌려진 숯 알갱이
      alpha = Math.max(0, Math.min(1, alpha));
      const burnt = 1 - smooth(0.0, 0.75, rr);
      const cr = 14 + (58 - 14) * (1 - burnt) + grain * 18;
      const cg = 11 + (40 - 11) * (1 - burnt) + grain * 12;
      const cb = 9 + (26 - 9) * (1 - burnt) + grain * 8;
      const o = (y * S + x) * 4;
      img.data[o] = cr;
      img.data[o + 1] = cg;
      img.data[o + 2] = cb;
      img.data[o + 3] = alpha * 245;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _scorch[i] = t;
  return t;
}

let _ember = null;
/** 그을음 위에서 식어 가는 잔불: 중심 근처에 흩어진 불씨와 짧은 균열 (가산 혼합) */
export function emberTexture() {
  if (_ember) return _ember;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  g.globalCompositeOperation = 'lighter';
  // 불씨
  for (let i = 0; i < 90; i++) {
    const r = Math.pow(rnd(), 1.6) * S * 0.36;
    const a = rnd() * Math.PI * 2;
    const x = S / 2 + Math.cos(a) * r;
    const y = S / 2 + Math.sin(a) * r;
    const rad = 1.5 + rnd() * 4.5 * (1 - r / (S * 0.4));
    const grd = g.createRadialGradient(x, y, 0, x, y, rad * 2.2);
    grd.addColorStop(0, 'rgba(255,220,140,0.95)');
    grd.addColorStop(0.35, 'rgba(255,110,20,0.7)');
    grd.addColorStop(1, 'rgba(255,40,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad * 2.5, y - rad * 2.5, rad * 5, rad * 5);
  }
  // 숯 사이로 빛이 새는 짧은 균열
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    let x = S / 2 + (rnd() - 0.5) * S * 0.3;
    let y = S / 2 + (rnd() - 0.5) * S * 0.4;
    let a = rnd() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    const n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      a += (rnd() - 0.5) * 1.4;
      x += Math.cos(a) * (4 + rnd() * 8);
      y += Math.sin(a) * (4 + rnd() * 8);
      g.lineTo(x, y);
    }
    g.strokeStyle = 'rgba(255,90,10,0.55)';
    g.lineWidth = 2.2;
    g.stroke();
    g.strokeStyle = 'rgba(255,200,120,0.6)';
    g.lineWidth = 0.8;
    g.stroke();
  }
  _ember = new THREE.CanvasTexture(c);
  _ember.colorSpace = THREE.SRGBColorSpace;
  return _ember;
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
