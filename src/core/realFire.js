// 실사풍 불: GPU 인스턴스 빌보드 (불꽃 · 불티 · 섬광 / 연기)
//  · 움직임은 셰이더가 닫힌 식으로 계산 (초기 속도 + 저항 + 부력/중력) → CPU는 생성할 때만 쓴다
//  · 색은 흑체 복사 근사 (흰 심 → 노랑 → 주황 → 검붉음), 시간이 지나며 식는다
//  · 연기는 아래에서 불빛을 받고 위에서 하늘빛을 받는 가짜 조명
import * as THREE from 'three';

// ── 반복되는 잡음 텍스처 (RGBA 채널마다 다른 fbm) ──
let _noiseTex = null;
export function fireNoiseTexture() {
  if (_noiseTex) return _noiseTex;
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const lattice = (seed, P) => {
    const g = new Float32Array(P * P);
    let s = seed;
    for (let i = 0; i < g.length; i++) {
      s = (s * 16807) % 2147483647;
      g[i] = s / 2147483647;
    }
    return g;
  };
  // 주기 P인 값 잡음을 겹친 fbm (가장자리가 이어지게)
  const fbm = (seed, base, oct) => {
    const layers = [];
    for (let o = 0; o < oct; o++) layers.push({ P: base << o, g: lattice(seed + o * 101, base << o), a: Math.pow(0.5, o) });
    const out = new Float32Array(N * N);
    let mn = 1e9;
    let mx = -1e9;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let v = 0;
        for (const L of layers) {
          const fx = (x / N) * L.P;
          const fy = (y / N) * L.P;
          const ix = Math.floor(fx);
          const iy = Math.floor(fy);
          let tx = fx - ix;
          let ty = fy - iy;
          tx = tx * tx * (3 - 2 * tx);
          ty = ty * ty * (3 - 2 * ty);
          const x0 = ix % L.P;
          const y0 = iy % L.P;
          const x1 = (ix + 1) % L.P;
          const y1 = (iy + 1) % L.P;
          const a = L.g[y0 * L.P + x0];
          const b = L.g[y0 * L.P + x1];
          const c = L.g[y1 * L.P + x0];
          const d = L.g[y1 * L.P + x1];
          v += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * L.a;
        }
        out[y * N + x] = v;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn);
    return out;
  };
  const ch = [fbm(7, 4, 4), fbm(33, 8, 3), fbm(91, 3, 5), fbm(57, 6, 4)];
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = ch[0][i] * 255;
    data[i * 4 + 1] = ch[1][i] * 255;
    data[i * 4 + 2] = ch[2][i] * 255;
    // A: 능선(ridge) 잡음 → 불꽃 결
    data[i * 4 + 3] = (1 - Math.abs(ch[3][i] * 2 - 1)) * 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  _noiseTex = t;
  return t;
}

/** 흑체 색 근사. T: 0(꺼짐) ~ 1.5(백열) */
export const FIRE_RAMP_GLSL = /* glsl */ `
vec3 fireRamp(float T) {
  T = clamp(T, 0.0, 1.6);
  vec3 c = vec3(0.32, 0.03, 0.005) * smoothstep(0.05, 0.3, T);
  c = mix(c, vec3(0.95, 0.2, 0.02), smoothstep(0.25, 0.55, T));
  c = mix(c, vec3(1.0, 0.48, 0.08), smoothstep(0.5, 0.8, T));
  c = mix(c, vec3(1.0, 0.78, 0.36), smoothstep(0.78, 1.05, T));
  c = mix(c, vec3(1.0, 0.96, 0.86), smoothstep(1.05, 1.45, T));
  return c * (0.3 + T * 0.85);
}`;

// ── 공통 정점 셰이더: 닫힌 식 운동 + 카메라를 향한(또는 속도로 늘어난) 사각형 ──
const vert = /* glsl */ `
attribute vec4 iPos;   // xyz 시작 위치, w 태어난 시각
attribute vec4 iVel;   // xyz 초기 속도, w 수명
attribute vec4 iAcc;   // xyz 가속(부력·중력), w 공기 저항
attribute vec4 iSize;  // x 처음 크기, y 나중 크기, z 씨앗, w 종류
attribute vec4 iParam; // x 늘어남, y 온도/밝기, z 식는 정도/불빛 받음, w 회전/불투명
uniform float uTime;
varying vec2 vUv;
varying float vAn;
varying float vSeed;
varying float vKind;
varying float vFade;
varying vec4 vParam;
varying float vSize;
void main() {
  float age = uTime - iPos.w;
  float life = iVel.w;
  if (age < 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float an = age / life;
  float k = max(iAcc.w, 0.001);
  float e = exp(-k * age);
  float f1 = (1.0 - e) / k;
  vec3 p = iPos.xyz + iVel.xyz * f1 + iAcc.xyz * (age - f1) / k;
  vec3 v = iVel.xyz * e + iAcc.xyz * (1.0 - e) / k;
  float size = mix(iSize.x, iSize.y, 1.0 - (1.0 - an) * (1.0 - an));
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  toCam /= max(dist, 1e-4);
  vec3 right;
  vec3 up;
  float L = 1.0;
  float sp = length(v);
  if (iParam.x > 0.0 && sp > 0.05) {
    up = v / sp;
    up = normalize(up - toCam * dot(up, toCam) + vec3(0.0, 1e-4, 0.0));
    right = normalize(cross(up, toCam));
    L = 1.0 + iParam.x * sp;
  } else {
    right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  }
  vec3 w = p + right * position.x * size + up * position.y * size * L;
  // 눈앞을 덮지 않게 가까우면 옅어지고, 땅에 박힌 부분은 부드럽게 사라진다
  float nearF = clamp((dist - 0.3) / (0.5 + size * 0.9), 0.0, 1.0);
  float groundF = clamp(w.y / (0.08 + size * 0.35), 0.0, 1.0);
  vFade = nearF * groundF;
  vUv = position.xy;
  vAn = an;
  vSeed = iSize.z;
  vKind = iSize.w;
  vParam = iParam;
  vSize = size;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

// 불꽃(0) · 섬광(1) · 불티(2)
const flameFrag = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform float uOcc;
varying vec2 vUv;
varying float vAn;
varying float vSeed;
varying float vKind;
varying float vFade;
varying vec4 vParam;
varying float vSize;
${FIRE_RAMP_GLSL}
void main() {
  vec2 p = vUv;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  float heat = vParam.y;
  float cool = vParam.z;
  if (vKind > 1.5) {
    // 불티: 작고 뜨거운 점, 끝에서 깜빡이며 꺼진다
    float a = pow(1.0 - r, 2.2);
    float flick = 0.75 + 0.25 * sin(uTime * 40.0 + vSeed * 90.0);
    float T = heat * (1.0 - vAn * cool) + (1.0 - r) * 0.35;
    float fade = 1.0 - smoothstep(0.6, 1.0, vAn);
    a *= fade * vFade * flick;
    gl_FragColor = vec4(fireRamp(T) * a * 1.4, a * uOcc * 0.3);
    return;
  }
  if (vKind > 0.5) {
    // 섬광: 순간적으로 번쩍이는 둥근 빛
    float a = pow(1.0 - r, 2.4) * (1.0 - vAn) * (1.0 - vAn) * vFade;
    gl_FragColor = vec4(fireRamp(heat * (0.6 + 0.4 * (1.0 - r))) * a, a * uOcc * 0.4);
    return;
  }
  // 불꽃: 위로 흘러가는 두 겹 잡음이 가장자리를 갉아먹는다
  vec2 q = p * 0.32 + vec2(vSeed * 7.13, vSeed * 3.71);
  float n1 = texture2D(uNoise, q + vec2(0.0, -uTime * 0.32 - vAn * 0.35)).r;
  vec2 warp = vec2(n1 - 0.5, 0.0) * 0.3;
  float n2 = texture2D(uNoise, q * 2.4 + warp + vec2(vSeed, -uTime * 0.95)).a;
  float n3 = texture2D(uNoise, q * 5.1 + warp * 2.0 + vec2(0.0, -uTime * 1.7)).g;
  float n = smoothstep(0.15, 0.85, n1 * 0.5 + n2 * 0.35 + n3 * 0.15);
  float erode = 0.6 + vAn * 0.8;
  // 물방울꼴: 아래(뿌리)는 둥글고 위(진행 방향)로 갈수록 가늘어지는 혀
  float taper = 1.0 - 0.5 * clamp(p.y * 0.5 + 0.5, 0.0, 1.0);
  float rr = length(vec2(p.x / taper, p.y));
  float shape = smoothstep(1.0, 0.1, rr + (n2 - 0.5) * 0.4);
  float dens = smoothstep(0.0, 0.55, shape * 1.3 - (1.0 - n) * erode);
  float fadeIn = smoothstep(0.0, 0.06, vAn);
  float fadeOut = 1.0 - smoothstep(0.45, 1.0, vAn);
  float a = dens * fadeIn * fadeOut * vFade;
  // 가운데가 뜨겁고, 나이 들수록 식는다
  float T = heat * (1.0 - vAn * cool) * (0.4 + 0.75 * dens) * (0.8 + 0.4 * n3);
  // 식은 가장자리는 그을음처럼 뒤를 가린다 (낮 하늘에 분홍빛으로 뜨지 않게)
  gl_FragColor = vec4(fireRamp(T) * a, a * uOcc);
}`;

const smokeFrag = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uSky;
varying vec2 vUv;
varying float vAn;
varying float vSeed;
varying float vKind;
varying float vFade;
varying vec4 vParam; // x 늘어남, y 밝기(0 검댕 ~ 1 회색 먼지), z 불빛 받음, w 불투명
varying float vSize;
void main() {
  vec2 p = vUv;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float ang = vSeed * 6.2831 + vAn * (vSeed - 0.5) * 2.0;
  float c = cos(ang);
  float s = sin(ang);
  vec2 pr = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec2 q = pr * 0.28 + vec2(vSeed * 5.1, vSeed * 2.7);
  float n1 = texture2D(uNoise, q + vec2(0.0, -vAn * 0.12)).b;
  float n2 = texture2D(uNoise, q * 2.6 + (n1 - 0.5) * 0.35 + vec2(uTime * 0.02, 0.0)).r;
  float n3 = texture2D(uNoise, q * 6.3 + (n2 - 0.5) * 0.25).g;
  float n = smoothstep(0.12, 0.88, n1 * 0.5 + n2 * 0.33 + n3 * 0.17);
  float shape = 1.0 - r2;
  float dens = smoothstep(0.0, 0.45, shape * 1.25 - (1.0 - n) * (0.85 + vAn * 0.55));
  // 가짜 법선: 공 모양 + 잡음 굴곡 → 위는 하늘빛, 아래는 불빛
  vec3 N = normalize(vec3(p.x + (n2 - 0.5) * 1.1 + (n3 - 0.5) * 0.5, p.y + (n1 - 0.5) * 1.1 + (n3 - 0.5) * 0.5, sqrt(max(0.0, 1.0 - r2)) + 0.2));
  float top = clamp(N.y * 0.6 + 0.5, 0.0, 1.0);
  vec3 base = mix(vec3(0.035, 0.032, 0.03), vec3(0.36, 0.34, 0.31), vParam.y);
  // 위는 하늘빛, 굴곡 안쪽은 자기 그림자
  vec3 col = base * (0.35 + 0.9 * top) * (0.75 + 0.35 * n3) + uSky * top * 0.06 * (0.3 + vParam.y);
  float glow = vParam.z * (1.0 - smoothstep(0.0, 0.3, vAn));
  col += vec3(1.0, 0.3, 0.04) * glow * glow * smoothstep(0.1, 1.0, 1.0 - top) * 0.9;
  float fadeIn = smoothstep(0.0, 0.05, vAn);
  float fadeOut = 1.0 - smoothstep(0.5, 1.0, vAn);
  float a = dens * vParam.w * fadeIn * fadeOut * vFade;
  gl_FragColor = vec4(col, a);
}`;

class BillboardPool {
  constructor(scene, max, frag, blending, renderOrder, noise) {
    this.max = max;
    this.cursor = 0;
    this.lo = Infinity;
    this.hi = -1;
    this.wrapped = false;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.attrs = {};
    for (const name of ['iPos', 'iVel', 'iAcc', 'iSize', 'iParam']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      this.attrs[name] = a;
    }
    // 처음엔 모두 죽은 상태
    const P = this.attrs.iPos.array;
    for (let i = 0; i < max; i++) P[i * 4 + 3] = -1e6;
    geo.instanceCount = max;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.uniforms = { uTime: { value: 0 }, uNoise: { value: noise }, uOcc: { value: 0.15 }, uSky: { value: new THREE.Color(0.55, 0.62, 0.75) } };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    if (blending === 'premulAdd') {
      // 색은 더하고, 알파만큼 뒤를 살짝 가린다 → 밤엔 빛나고 낮에도 보인다
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    } else mat.blending = THREE.NormalBlending;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.full = false;
    this.mesh.onBeforeRender = () => (this.full = false); // 이 시점엔 이미 올라갔다
    scene.add(this.mesh);
    this.geo = geo;
  }

  spawn(t, p, v, life, acc, drag, s0, s1, kind, param) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (this.cursor === 0) this.wrapped = true;
    const o = i * 4;
    const A = this.attrs;
    A.iPos.array[o] = p.x; A.iPos.array[o + 1] = p.y; A.iPos.array[o + 2] = p.z; A.iPos.array[o + 3] = t;
    A.iVel.array[o] = v.x; A.iVel.array[o + 1] = v.y; A.iVel.array[o + 2] = v.z; A.iVel.array[o + 3] = life;
    A.iAcc.array[o] = acc.x; A.iAcc.array[o + 1] = acc.y; A.iAcc.array[o + 2] = acc.z; A.iAcc.array[o + 3] = drag;
    A.iSize.array[o] = s0; A.iSize.array[o + 1] = s1; A.iSize.array[o + 2] = Math.random(); A.iSize.array[o + 3] = kind;
    A.iParam.array[o] = param[0]; A.iParam.array[o + 1] = param[1]; A.iParam.array[o + 2] = param[2]; A.iParam.array[o + 3] = param[3];
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  flush(time) {
    this.uniforms.uTime.value = time;
    if (this.hi < 0) return;
    // 이번 프레임에 쓴 칸만 GPU로 올린다. 고리 버퍼가 한 바퀴 돌았으면 다음 렌더까지 통째로.
    // (구간은 렌더러가 올린 뒤 비우므로, 렌더 전에 여러 번 불려도 쌓인다)
    if (this.wrapped) this.full = true;
    for (const a of Object.values(this.attrs)) {
      if (this.full) a.clearUpdateRanges();
      else a.addUpdateRange(this.lo * 4, (this.hi - this.lo + 1) * 4);
      a.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -1;
    this.wrapped = false;
  }
}

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _acc = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

export class RealFire {
  constructor(scene) {
    const noise = fireNoiseTexture();
    this.time = 0;
    // 연기를 먼저 그리고 불꽃을 위에 더한다 (정렬 없이도 불이 연기 속에서 빛나 보이게)
    this.smokePool = new BillboardPool(scene, 2400, smokeFrag, 'normal', 8, noise);
    this.flamePool = new BillboardPool(scene, 6000, flameFrag, 'premulAdd', 11, noise);
  }

  set bright(b) {
    this.flamePool.uniforms.uOcc.value = b ? 0.55 : 0.12;
  }

  /**
   * 불꽃 하나
   * @param o { size0, size1, life, heat(1.0~1.5), cool(0~1), rise(부력 m/s²), drag, stretch, delay, acc }
   */
  flame(pos, vel, o = {}) {
    const acc = o.acc ?? _acc.set(0, o.rise ?? 2.5, 0);
    this.flamePool.spawn(this.time + (o.delay ?? 0), pos, vel ?? ZERO, o.life ?? 0.8, acc, o.drag ?? 2, o.size0 ?? 0.2, o.size1 ?? 0.4, 0, [o.stretch ?? 0, o.heat ?? 1.25, o.cool ?? 0.8, 0]);
  }

  /** 순간 섬광 */
  glow(pos, o = {}) {
    this.flamePool.spawn(this.time + (o.delay ?? 0), pos, ZERO, o.life ?? 0.2, ZERO, 1, o.size0 ?? 1, o.size1 ?? o.size0 ?? 1.2, 1, [0, o.heat ?? 1.4, 0, 0]);
  }

  /** 불티 (중력을 받고 속도 방향으로 늘어난다) */
  spark(pos, vel, o = {}) {
    const acc = o.acc ?? _acc.set(0, -(o.grav ?? 9.8), 0);
    this.flamePool.spawn(this.time + (o.delay ?? 0), pos, vel ?? ZERO, o.life ?? 1, acc, o.drag ?? 0.6, o.size ?? 0.03, (o.size ?? 0.03) * 0.6, 2, [o.stretch ?? 0.04, o.heat ?? 1.3, o.cool ?? 0.7, 0]);
  }

  /**
   * 연기 하나
   * @param o { size0, size1, life, shade(0 검댕 ~ 1 회색), lit(불빛 받음), opacity, rise, drag, delay }
   */
  smoke(pos, vel, o = {}) {
    const acc = o.acc ?? _acc.set(0, o.rise ?? 0.6, 0);
    this.smokePool.spawn(this.time + (o.delay ?? 0), pos, vel ?? ZERO, o.life ?? 3, acc, o.drag ?? 1, o.size0 ?? 0.3, o.size1 ?? 1, 0, [0, o.shade ?? 0.25, o.lit ?? 0, o.opacity ?? 0.7]);
  }

  /**
   * 폭발: 섬광 → 팽창하는 화구 → (불기둥) → 솟아오르는 검은 연기와 버섯구름 → 바닥을 쓰는 먼지 고리 → 불티·잔불
   * @param o { height: 불기둥 높이(0이면 없음), colR: 기둥 반지름, lite: 가벼운 버전, head: 이 근처는 작게 }
   */
  explosion(pos, R, o = {}) {
    const lite = !!o.lite;
    const head = o.head;
    const base = _p.copy(pos);
    base.y = Math.max(0.3, base.y);
    const B = base.clone();
    // 머리 가까이서 터져도 불덩이가 얼굴을 덮지 않게
    const fit = (at, s) => (head ? Math.min(s, Math.max(0.25, at.distanceTo(head) - 0.6)) : s);
    const q = new THREE.Vector3();
    // 1) 섬광
    this.glow(B, { size0: R * 0.5, size1: R * 1.0, life: 0.12, heat: 1.5 });
    this.glow(B, { size0: R * 0.9, size1: R * 1.8, life: 0.4, heat: 0.6 });
    // 2) 백열하는 심
    for (let i = 0; i < (lite ? 5 : 10); i++) {
      _d.randomDirection();
      q.copy(B).addScaledVector(_d, R * 0.08);
      this.flame(q, _vel.copy(_d).multiplyScalar(R * rand(0.6, 1.4)), { size0: fit(q, R * 0.2), size1: fit(q, R * 0.36), life: rand(0.3, 0.5), heat: 1.35, cool: 0.9, drag: 4, rise: 1 });
    }
    // 3) 팽창하는 화구: 빠르게 퍼지다 공기 저항에 멈추고, 부력으로 굴러 올라간다
    const nBall = lite ? 26 : 56;
    for (let i = 0; i < nBall; i++) {
      _d.randomDirection();
      _d.y = Math.abs(_d.y) * 0.9 + 0.08;
      _d.normalize();
      const sp = R * rand(2.4, 4.4);
      q.copy(B).addScaledVector(_d, R * 0.12);
      const far = q.clone().addScaledVector(_d, sp / 3.6);
      this.flame(q, _vel.copy(_d).multiplyScalar(sp), {
        size0: fit(q, R * rand(0.16, 0.26)), size1: fit(far, R * rand(0.36, 0.56)), life: rand(0.9, 1.6),
        heat: rand(0.85, 1.2), cool: 1, drag: 3.6, rise: 2 + R * 0.35, delay: Math.random() * 0.06,
      });
    }
    // 4) 불기둥 (竈): 늦게 출발할수록 위로 이어 붙는다
    const H = o.height ?? 0;
    const colR = o.colR ?? R * 0.2;
    if (H > 0) {
      // 기둥 전체에 흩어 놓고 위로 밀어 올린다 → 밑동부터 꼭대기까지 끊기지 않는 불길
      const nCol = lite ? 18 : 44;
      for (let i = 0; i < nCol; i++) {
        const a = Math.random() * Math.PI * 2;
        const delay = Math.random();
        const u = Math.min(1, delay * 1.3) * Math.random(); // 늦게 나온 불일수록 높은 데서 시작
        const rr = Math.sqrt(Math.random()) * colR * 0.3;
        q.set(B.x + Math.cos(a) * rr, Math.max(0.3, B.y - 0.2) + H * 0.5 * u, B.z + Math.sin(a) * rr);
        this.flame(q, _vel.set((Math.random() - 0.5) * 0.8, H * rand(0.55, 0.85), (Math.random() - 0.5) * 0.8), {
          size0: colR * rand(0.6, 0.85) * (1 - u * 0.3), size1: colR * rand(1.0, 1.4) * (1 - u * 0.25), life: rand(0.7, 1.1),
          heat: rand(1.05, 1.3), cool: 0.9, drag: 1.3, rise: 2, delay,
        });
      }
      // 기둥 꼭대기의 버섯구름
      for (let i = 0; i < (lite ? 6 : 14); i++) {
        const a = Math.random() * Math.PI * 2;
        const top = q.set(B.x + Math.cos(a) * colR * 0.5, B.y + H * rand(0.75, 0.95), B.z + Math.sin(a) * colR * 0.5);
        this.smoke(top, _vel.set(Math.cos(a) * rand(1.2, 3), rand(0.8, 2), Math.sin(a) * rand(1.2, 3)), {
          size0: colR * 0.9, size1: colR * rand(1.8, 2.6), life: rand(3.5, 5.5), shade: rand(0.05, 0.2), lit: 0.6,
          opacity: 0.9, rise: 0.5, drag: 0.9, delay: rand(0.35, 1.1),
        });
      }
    }
    // 5) 화구가 식으며 남기는 검은 연기
    const nSmoke = lite ? 14 : 36;
    for (let i = 0; i < nSmoke; i++) {
      _d.randomDirection();
      _d.y = Math.abs(_d.y) * 0.8 + 0.2;
      _d.normalize();
      q.copy(B).addScaledVector(_d, R * rand(0.35, 0.8));
      this.smoke(q, _vel.copy(_d).multiplyScalar(R * rand(0.3, 0.6)).add(_d.set(0, rand(1, 2.5), 0)), {
        size0: fit(q, R * 0.28), size1: R * rand(0.5, 0.75), life: rand(3, 5), shade: rand(0.04, 0.22), lit: 1,
        opacity: 0.88, rise: 0.8, drag: 1.1, delay: rand(0.12, 0.6),
      });
    }
    // 6) 바닥을 쓸고 퍼지는 먼지 고리
    const nDust = lite ? 12 : 28;
    for (let i = 0; i < nDust; i++) {
      const a = (i / nDust) * Math.PI * 2 + Math.random() * 0.4;
      q.set(B.x + Math.cos(a) * R * 0.15, 0.15, B.z + Math.sin(a) * R * 0.15);
      const sp = R * rand(2.2, 3.4);
      this.smoke(q, _vel.set(Math.cos(a) * sp, rand(0.1, 0.6), Math.sin(a) * sp), {
        size0: R * 0.08, size1: R * rand(0.22, 0.36), life: rand(1.6, 2.6), shade: rand(0.4, 0.6), lit: 0.2,
        opacity: 0.32, rise: 0.3, drag: 2.4, delay: 0.04,
      });
    }
    // 7) 사방으로 튀는 불티 + 떠오르는 잔불
    const nSpark = lite ? 24 : 70;
    const sv = Math.min(1.6, R / 6);
    for (let i = 0; i < nSpark; i++) {
      _d.randomDirection();
      _d.y = Math.abs(_d.y) * 1.3 + 0.1;
      _d.normalize();
      this.spark(B, _vel.copy(_d).multiplyScalar(rand(5, 15) * sv), { life: rand(0.7, 1.7), size: rand(0.022, 0.045), grav: 9.8, drag: 0.5, delay: Math.random() * 0.05 });
    }
    for (let i = 0; i < (lite ? 8 : 26); i++) {
      q.copy(B).addScaledVector(_d.randomDirection(), R * rand(0.1, 0.5));
      this.spark(q, _vel.randomDirection().multiplyScalar(0.8), { acc: _acc.set(0, 0.9, 0), life: rand(2, 3.6), size: rand(0.018, 0.032), drag: 1.2, stretch: 0, heat: 1.05, cool: 0.6, delay: rand(0.2, 1) });
    }
  }

  update(dt) {
    this.time += dt;
    this.smokePool.flush(this.time);
    this.flamePool.flush(this.time);
  }
}
