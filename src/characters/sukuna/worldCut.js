// 세계를 가르는 해 — 차원 참격 연출
//  ① 휘두른 자리에 검은 먹선이 화면을 가로지르고, 그 선을 따라 파란 차원 균열이 들쭉날쭉 벌어진다
//  ② 균열이 화면 전체로 번져 세상이 한순간 파랗게 물든다 (흰 절단선 관통)
//  ③ 한두 프레임 색이 뒤집힌 검은 세계 + 흰 방사 파편 (색수차 테두리)  ← 이 순간 실제로 베인다
//  ④ 가는 절단선만 남아 점선으로 흩어지고
//  ⑤ 절단 평면을 따라 동심원 충격파 고리가 퍼지며
//  ⑥ 절단면 위쪽 세계(배경 건물·벽)가 통째로 미끄러져 어긋난다. 잘린 단면은 노랗게 빛난다
//     잠시 뒤 어긋난 세계는 제자리로 돌아온다
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// 타임라인 (초)
const T = {
  blueIn: 0.06, // 파란 균열 띠 시작
  screen: 0.15, // 화면 전체 파란 물듦
  invert: 0.23, // 반전 + 방사 파편 = 실제 절단 순간
  invertEnd: 0.28,
  lineEnd: 0.62, // 남은 절단선이 다 흩어짐
  split: 0.5, // 충격파 + 세계 어긋남
  heal: 6.5, // 제자리로 돌아오기 시작
  end: 7.1,
};

const LINE_DIST = 12; // 균열 띠를 그리는 거리 (m)
const SLAB = 1.6; // 단면을 노랗게 채우는 깊이 (m)

const GLSL_NOISE = /* glsl */ `
float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
// 직선 보간: 뾰족뾰족한 톱니 윤곽
float jag(float x) { float i = floor(x); return mix(h1(i), h1(i + 1.0), fract(x)); }
`;

// ── ①②④ 균열 띠: 절단 평면 위, 정면 12m 에 화면을 가로지르는 긴 띠 ──
const riftVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const riftFrag = /* glsl */ `
uniform float uT, uL, uW, uGrow, uInk, uBlue, uWhite, uDash, uOp;
varying vec2 vUv;
${GLSL_NOISE}
void main() {
  float x = (vUv.x - 0.5) * uL;
  float y = (vUv.y - 0.5) * uW;
  float r = abs(vUv.x - 0.5) * 2.0 / max(uGrow, 1e-3);
  if (r > 1.0) discard;
  float taper = 1.0 - r * r;
  // 먹선: 굵기가 살짝 출렁이는 검은 선, 끝에서는 점선으로 흩어진다
  float hw = uInk * (0.55 + 0.45 * n1(x * 2.7 + uT * 23.0)) * taper;
  float ink = 1.0 - smoothstep(hw * 0.7, hw, abs(y));
  ink *= step(h1(floor(x * 6.0) + 0.37), uDash);
  // 파란 차원 균열: 중심이 흔들리고 위아래 윤곽이 톱니처럼 들쭉날쭉
  float yc = (n1(x * 0.6 + uT * 9.0) - 0.5) * 0.35 * uBlue;
  float bw = uBlue * (0.12 + 0.75 * pow(jag(x * 1.9 + uT * 34.0), 2.0)) * taper;
  float dy = abs(y - yc);
  float blue = step(dy, bw);
  float inner = step(dy, bw * 0.42 + 0.02 * uBlue);
  float white = 1.0 - smoothstep(uWhite * 0.6, uWhite, abs(y));
  vec3 col = mix(vec3(0.16, 0.47, 1.0), vec3(0.62, 0.85, 1.0), inner);
  float a = blue * 0.92;
  col = mix(col, vec3(0.0), ink);
  a = max(a, ink);
  col = mix(col, vec3(1.0), white);
  a = max(a, white);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a * uOp);
}
`;

// ── 머리에 붙은 구: 시야 방향(월드)을 넘겨준다 ──
const headVert = /* glsl */ `
uniform vec3 uO;
uniform vec3 uN;
varying vec3 vDir;
varying float vOff;
void main() {
  vDir = normalize(mat3(modelMatrix) * position);
  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vOff = dot(uO - c, uN) / ${LINE_DIST.toFixed(1)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
// ② 파랗게 물들이기 (곱하기 혼합): 절단선에서 위아래로 톱니 윤곽을 그리며 벌어진다
const tintFrag = /* glsl */ `
uniform vec3 uN, uA;
uniform float uW, uAmt, uT;
varying vec3 vDir;
varying float vOff;
${GLSL_NOISE}
void main() {
  float d = dot(vDir, uN) - vOff;
  float s = dot(vDir, uA);
  float edge = uW * (0.78 + 0.45 * jag(s * 22.0 + uT * 40.0) + 0.2 * n1(s * 5.0));
  float m = step(abs(d), edge) * uAmt;
  // 가운데로 갈수록 살짝 더 진하게
  vec3 tint = mix(vec3(0.42, 0.66, 1.0), vec3(0.27, 0.52, 0.98), smoothstep(0.5, 0.0, abs(d)));
  gl_FragColor = vec4(mix(vec3(1.0), tint, m), 1.0);
}
`;
// ③ 색 반전: out = k·(1-dst). k 를 낮춰 반전된 화면을 어둡게 (흰 파편이 돋보이게)
const invertFrag = /* glsl */ `
uniform float uAmt;
void main() { gl_FragColor = vec4(vec3(uAmt), 1.0); }
`;
// ③ 흰 방사 파편 (반전된 검은 세계 위). 테두리는 RGB 가 어긋나 색수차처럼
const burstFrag = /* glsl */ `
uniform vec3 uC, uA, uN;
uniform float uR, uAmt, uSeed;
varying vec3 vDir;
varying float vOff;
${GLSL_NOISE}
float spikeR(float phi, float k) {
  float p = phi * 3.0 / 3.14159;
  float sp = pow(n1(p * 6.0 + uSeed), 3.0) * 1.7 + pow(n1(p * 23.0 + uSeed * 2.0), 6.0) * 1.3 + 0.18 * n1(p * 70.0);
  return uR * k * (0.22 + sp);
}
float shards(float ang, float phi, float k) {
  float p = phi * 3.0 / 3.14159;
  float on = step(0.78, n1(p * 14.0 + uSeed * 3.0));
  float r0 = uR * k * (2.0 + 1.4 * n1(p * 4.0 + uSeed));
  float len = uR * (0.25 + 0.6 * n1(p * 31.0));
  float w = step(0.55, n1(p * 90.0 + uSeed));
  return on * w * step(r0, ang) * step(ang, r0 + len);
}
void main() {
  float ca = clamp(dot(vDir, uC), -1.0, 1.0);
  float ang = acos(ca);
  float phi = atan(dot(vDir, uN), dot(vDir, uA));
  vec3 m;
  m.r = max(step(ang, spikeR(phi, 1.025)), shards(ang, phi, 1.02));
  m.g = max(step(ang, spikeR(phi, 1.0)), shards(ang, phi, 1.0));
  m.b = max(step(ang, spikeR(phi, 0.975)), shards(ang, phi, 0.98));
  float a = max(m.r, max(m.g, m.b)) * uAmt;
  if (a < 0.01) discard;
  gl_FragColor = vec4(m, a);
}
`;

function headSphere(frag, uniforms, blending, order) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: headVert,
    fragmentShader: frag,
    uniforms,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    fog: false,
  });
  if (blending) Object.assign(mat, blending);
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16), mat);
  m.renderOrder = order;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}

// ── ⑥ 세계 어긋남: 배경 메시를 절단 평면으로 잘라 위쪽만 옮긴다 (클리핑 평면) ──
class WorldSplit {
  constructor(ctx, { o, travelH, nUp, shift, front = 0.6 }) {
    this.ctx = ctx;
    const env = ctx.env;
    this.bg = env.current;
    this.ok = !!this.bg && !env.hidden;
    if (!this.ok) return;
    this.t = 0;
    this.shift = shift.clone();
    this.offset = new THREE.Vector3();
    const f = o.clone().addScaledVector(travelH, front);
    // 아래쪽(원본): 「위 AND 앞」만 지운다 → 교집합 클리핑
    this.lowerPlanes = [
      new THREE.Plane().setFromNormalAndCoplanarPoint(nUp.clone().negate(), o),
      new THREE.Plane().setFromNormalAndCoplanarPoint(travelH.clone().negate(), f),
    ];
    // 위쪽(복제): 「아래 OR 뒤」를 지운다 → 위 AND 앞만 남는다. 옮긴 만큼 평면도 함께 옮긴다
    this.upperBase = [
      new THREE.Plane().setFromNormalAndCoplanarPoint(nUp.clone(), o),
      new THREE.Plane().setFromNormalAndCoplanarPoint(travelH.clone(), f),
    ];
    this.upperPlanes = this.upperBase.map((p) => p.clone());
    this.capColor = new THREE.Color(0xffd23a);
    // 단면 채우기: 잘린 물체 안쪽(뒷면)을 노랗게 칠한다. 절단면 가까이(SLAB m)만 칠해서
    // 열린 모양의 뒷면(천장 조명 홈 등)이 엉뚱하게 노래지지 않게 한다
    const capMat = (planes, inter, slab) => {
      const m = new THREE.MeshBasicMaterial({
        color: this.capColor, side: THREE.BackSide, clippingPlanes: planes, clipIntersection: inter, clipShadows: false, fog: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uSlab = { value: slab };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
          .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 wpC = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wpC = instanceMatrix * wpC;
  #endif
  vWPos = (modelMatrix * wpC).xyz;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform vec4 uSlab;')
          .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `float sdC = dot(uSlab.xyz, vWPos) + uSlab.w;
  if (sdC < -0.02 || sdC > ${SLAB.toFixed(2)}) discard;
  vec4 diffuseColor = vec4( diffuse * (1.0 - 0.4 * clamp(sdC / ${SLAB.toFixed(2)}, 0.0, 1.0)), opacity );`);
      };
      m.customProgramCacheKey = () => 'worldcut-cap';
      return m;
    };
    // 절단 평면에서 잘린 쪽으로 잰 거리 (양수 = 남은 쪽 안)
    this.slabLower = new THREE.Vector4();
    this.slabUpper = new THREE.Vector4();
    const pl = this.lowerPlanes[0];
    this.slabLower.set(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant);
    this.seamLower = { value: this.slabLower };
    this.seamUpper = { value: this.slabUpper };
    this.seamU = { col: { value: new THREE.Color(0xffe040) }, w: { value: 0 } };
    this.capLower = capMat(this.lowerPlanes, true, this.slabLower);
    this.capUpper = capMat(this.upperPlanes, false, this.slabUpper);
    this.mats = new Map(); // 원본 재질 → { lower, upper }
    this.entries = [];
    this.upper = new THREE.Group(); // 옮겨질 위쪽 세계
    this.upper.matrixAutoUpdate = true;
    this.caps = new THREE.Group(); // 아래쪽 단면 (제자리)
    this.active = false;
    this.bg.group.updateMatrixWorld(true);
    const list = [];
    this.bg.group.traverse((m) => {
      if (!m.isMesh || m.isSkinnedMesh || m.userData.isProp || !m.visible) return;
      if (Array.isArray(m.material) || !m.material || m.material.isShaderMaterial) return;
      list.push(m);
    });
    // 순회가 끝난 뒤에 붙인다 (순회 중 자식을 늘리지 않게)
    for (const m of list) this._add(m);
    this._prewarm();
  }

  // 갈라지기 전에 새 셰이더를 미리 (가능하면 비동기로) 컴파일해 둔다 → 갈라지는 순간 멈칫하지 않게
  _prewarm() {
    const tmp = new THREE.Scene();
    const probes = new THREE.Group();
    for (const x of this.entries) probes.add(this._mk(x.m, x.lower));
    tmp.add(probes, this.upper, this.caps);
    const r = this.ctx.renderer;
    try {
      const p = r.compileAsync ? r.compileAsync(tmp, this.ctx.camera, this.ctx.scene) : (r.compile(tmp, this.ctx.camera, this.ctx.scene), null);
      p?.catch?.(() => {}).finally(() => tmp.remove(this.upper, this.caps));
    } catch (_) { /* 미리 못 만들면 그 자리에서 */ }
    if (!r.compileAsync) tmp.remove(this.upper, this.caps);
  }

  /** 실제로 가른다: 원본에 아래쪽 재질을 입히고 위쪽 복제를 장면에 올린다 */
  activate() {
    if (!this.ok || this.active) return;
    if (this.ctx.env.current !== this.bg || this.ctx.env.hidden) {
      this.dispose();
      return;
    }
    this.active = true;
    for (const x of this.entries) x.m.material = x.lower;
    this.upper.parent?.remove(this.upper);
    this.caps.parent?.remove(this.caps);
    this.ctx.scene.add(this.upper, this.caps);
  }

  // 잘린 표면을 따라 노랗게 빛나는 솔기 (절단 평면에서 SEAM 폭 안쪽). 멀수록 굵게 해서 멀리서도 보이게
  _seamHook(planeU) {
    const U = this.seamU;
    return (sh) => {
      if (!sh.fragmentShader.includes('#include <dithering_fragment>') || !sh.vertexShader.includes('#include <project_vertex>')) return;
      sh.uniforms.uSeamPlane = planeU;
      sh.uniforms.uSeamCol = U.col;
      sh.uniforms.uSeamW = U.w;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeamW;')
        .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 swp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  swp = instanceMatrix * swp;
  #endif
  vSeamW = (modelMatrix * swp).xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSeamW;\nuniform vec4 uSeamPlane;\nuniform vec3 uSeamCol;\nuniform float uSeamW;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  {
    float sd = dot(uSeamPlane.xyz, vSeamW) + uSeamPlane.w;
    float w = uSeamW * (0.03 + 0.0035 * distance(cameraPosition, vSeamW));
    float seam = 1.0 - smoothstep(w * 0.5, w, sd);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uSeamCol, seam * step(0.0, sd + 0.01));
  }`);
    };
  }

  _matsFor(src) {
    let e = this.mats.get(src);
    if (e) return e;
    const lower = src.clone();
    lower.clippingPlanes = this.lowerPlanes;
    lower.clipIntersection = true;
    lower.clipShadows = false;
    const upper = src.clone();
    upper.clippingPlanes = this.upperPlanes;
    upper.clipIntersection = false;
    upper.clipShadows = false;
    lower.onBeforeCompile = this._seamHook(this.seamLower);
    upper.onBeforeCompile = this._seamHook(this.seamUpper);
    lower.customProgramCacheKey = upper.customProgramCacheKey = () => 'worldcut-seam';
    e = { lower, upper };
    this.mats.set(src, e);
    return e;
  }

  _mk(m, mat) {
    let c;
    if (m.isInstancedMesh) {
      c = new THREE.InstancedMesh(m.geometry, mat, m.count);
      c.instanceMatrix = m.instanceMatrix;
      c.instanceColor = m.instanceColor;
    } else c = new THREE.Mesh(m.geometry, mat);
    c.matrixAutoUpdate = false;
    c.matrix.copy(m.matrixWorld);
    c.castShadow = false;
    c.receiveShadow = m.receiveShadow;
    c.frustumCulled = m.frustumCulled;
    c.renderOrder = m.renderOrder;
    return c;
  }

  _add(m) {
    const src = m.material;
    const { lower, upper } = this._matsFor(src);
    const up = this._mk(m, upper);
    const upCap = this._mk(m, this.capUpper);
    const lowCap = this._mk(m, this.capLower);
    this.upper.add(up, upCap);
    this.caps.add(lowCap);
    this.entries.push({ m, src, lower, up, upCap, lowCap });
  }

  update(dt) {
    if (!this.ok) return false;
    if (!this.active) return true;
    const env = this.ctx.env;
    // 배경이 바뀌었거나 영역전개로 배경이 숨겨지면 즉시 원상복구
    if (env.current !== this.bg || env.hidden) {
      this.dispose();
      return false;
    }
    this.t += dt;
    const t = this.t;
    // 순식간에 어긋난 뒤 아주 천천히 더 밀려나고, 끝에 제자리로
    let e;
    if (t < 0.22) {
      const k = t / 0.22;
      e = 1 - Math.pow(1 - k, 3);
    } else e = 1 + Math.min(1, (t - 0.22) / 3) * 0.12;
    const healT = T.heal - T.split;
    const endT = T.end - T.split;
    if (t > healT) {
      const k = Math.min(1, (t - healT) / (endT - healT));
      e *= 1 - k * k * (3 - 2 * k);
    }
    this.offset.copy(this.shift).multiplyScalar(e);
    this.upper.position.copy(this.offset);
    for (let i = 0; i < 2; i++) this.upperPlanes[i].copy(this.upperBase[i]).translate(this.offset);
    const pu = this.upperPlanes[0];
    this.slabUpper.set(pu.normal.x, pu.normal.y, pu.normal.z, pu.constant);
    // 단면: 노랗게 빛나다 주황으로 식는다
    const cool = THREE.MathUtils.clamp((t - 1.2) / 2.5, 0, 1);
    this.capColor.setRGB(1, 0.82 - cool * 0.3, 0.23 - cool * 0.12);
    this.seamU.col.value.copy(this.capColor);
    // 솔기: 갈라지는 순간 굵게 번쩍였다가 가늘어지고, 제자리로 돌아올 때 사라진다
    const flare = t < 0.3 ? 1 + (1 - t / 0.3) * 2.5 : 1;
    const heal = t > healT ? Math.max(0, 1 - (t - healT) / (endT - healT)) : 1;
    this.seamU.w.value = flare * heal;
    for (const x of this.entries) {
      const vis = x.m.visible;
      x.up.visible = x.upCap.visible = x.lowCap.visible = vis;
      // 움직이는 배경 물체(차 등)도 따라가게
      x.up.matrix.copy(x.m.matrixWorld);
      x.upCap.matrix.copy(x.m.matrixWorld);
      x.lowCap.matrix.copy(x.m.matrixWorld);
    }
    if (t >= endT) {
      this.dispose();
      return false;
    }
    return true;
  }

  dispose() {
    if (!this.ok) return;
    this.ok = false;
    if (this.active) for (const x of this.entries) x.m.material = x.src;
    this.active = false;
    this.upper.parent?.remove(this.upper);
    this.caps.parent?.remove(this.caps);
    for (const { lower, upper } of this.mats.values()) {
      lower.dispose();
      upper.dispose();
    }
    this.capLower.dispose();
    this.capUpper.dispose();
    this.entries = [];
    this.mats.clear();
  }
}

export class WorldCut {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = null;
    this.split = null;
    // 균열 띠
    this.riftU = {
      uT: { value: 0 }, uL: { value: 150 }, uW: { value: 5 }, uGrow: { value: 0 }, uInk: { value: 0.05 },
      uBlue: { value: 0 }, uWhite: { value: 0 }, uDash: { value: 1 }, uOp: { value: 1 },
    };
    this.rift = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({ vertexShader: riftVert, fragmentShader: riftFrag, uniforms: this.riftU, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.rift.renderOrder = 405;
    this.rift.frustumCulled = false;
    this.rift.visible = false;
    ctx.scene.add(this.rift);
    // 화면 효과 (머리에 붙는 구)
    const shared = { uO: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uA: { value: new THREE.Vector3() }, uT: { value: 0 } };
    this.tintU = { ...shared, uW: { value: 0 }, uAmt: { value: 0 } };
    this.tint = headSphere(tintFrag, this.tintU, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, // 화면 알파는 그대로
    }, 401);
    this.invU = { ...shared, uAmt: { value: 0 } };
    this.invert = headSphere(invertFrag, this.invU, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    }, 402);
    this.burstU = { ...shared, uC: { value: new THREE.Vector3() }, uR: { value: 0.3 }, uAmt: { value: 0 }, uSeed: { value: 0 } };
    this.burst = headSphere(burstFrag, this.burstU, null, 403);
    ctx.camera.add(this.tint, this.invert, this.burst);
    // ⑤ 충격파 고리 (관 모양 고리 + 빨강·청록으로 어긋난 테두리)
    this.ringGeo = new THREE.TorusGeometry(1, 0.03, 10, 128);
    this.rings = [];
    const specs = [
      { delay: 0, R: 46, thick: 0.45, dur: 0.85 },
      { delay: 0.04, R: 30, thick: 0.6, dur: 0.75 },
      { delay: 0.1, R: 70, thick: 0.35, dur: 1.0 },
      { delay: 0.16, R: 20, thick: 0.8, dur: 0.7 },
    ];
    for (const s of specs) {
      const g = new THREE.Group();
      const mk = (color, sc, op, order) => {
        const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: false }));
        m.scale.set(sc, sc, 1);
        m.userData.op = op;
        m.renderOrder = order;
        g.add(m);
        return m;
      };
      // 색수차: 안쪽 테두리는 빨강, 바깥은 청록이 살짝 비어져 나온다
      const red = mk(0xff2a4a, 0.975, 0.28, 20);
      const cyan = mk(0x22d8ff, 1.025, 0.28, 20);
      const main = mk(0x4a4a50, 1, 0.5, 21);
      g.visible = false;
      ctx.scene.add(g);
      this.rings.push({ g, main, parts: [main, red, cyan], ...s });
    }
  }

  /**
   * @param o 절단 평면 위의 한 점 (손바닥)
   * @param travel 참격이 뻗어 나가는 방향 (시선)
   * @param along 휘두른 방향 (평면 안, travel 과 직교)
   * @param n 평면 법선
   * @param onCut 반전 프레임(실제 절단 순간)에 불린다
   */
  start({ o, travel, along, n, onCut }) {
    this._finish();
    const travelH = travel.clone().setY(0);
    if (travelH.lengthSq() < 1e-3) travelH.set(0, 0, -1).applyQuaternion(this.ctx.input.headQuat).setY(0);
    travelH.normalize();
    const nUp = n.y >= 0 ? n.clone() : n.clone().negate();
    this.active = { t: 0, o: o.clone(), travel: travel.clone(), travelH, along: along.clone(), n: n.clone(), nUp, onCut, cut: false, splitDone: false };
    // 위쪽 세계가 밀려날 방향: 휘두른 방향 + 절단면에서 살짝 들림
    const shift = along.clone().multiplyScalar(2.4 * (0.55 + 0.45 * Math.abs(nUp.y))).addScaledVector(nUp, 0.35); // 세로로 벤 경우는 덜 밀린다
    this.split = new WorldSplit(this.ctx, { o, travelH, nUp, shift });
    if (!this.split.ok) this.split = null;
    // 균열 띠: 정면 12m, 휘두른 방향으로 길게 (평면을 정면으로 마주 본다)
    const c = o.clone().addScaledVector(travel, LINE_DIST);
    this.rift.position.copy(c);
    this.rift.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, n, travel));
    this.rift.scale.set(this.riftU.uL.value, this.riftU.uW.value, 1);
    this.rift.visible = true;
    const u = this.tintU;
    u.uO.value.copy(o);
    u.uN.value.copy(n);
    u.uA.value.copy(along);
    this.burstU.uC.value.copy(_v.copy(c).sub(this.ctx.input.head).normalize());
    this.burstU.uSeed.value = Math.random() * 50;
  }

  _finish() {
    this.active = null;
    this.rift.visible = false;
    this.tint.visible = this.invert.visible = this.burst.visible = false;
    for (const r of this.rings) r.g.visible = false;
    this.split?.dispose();
    this.split = null;
  }

  update(dt) {
    if (this.split && !this.split.update(dt)) this.split = null;
    const a = this.active;
    if (!a) return;
    a.t += dt;
    const t = a.t;
    const { fx, sfx } = this.ctx;
    const bright = fx.brightBg;
    const R = this.riftU;
    R.uT.value += dt;
    this.tintU.uT.value = R.uT.value;
    // ①④ 균열 띠
    R.uGrow.value = Math.min(1, 1 - Math.pow(1 - Math.min(1, t / 0.09), 3));
    R.uInk.value = t < T.invertEnd ? 0.055 : 0.028;
    const bk = t < T.blueIn ? 0 : t < 0.14 ? (t - T.blueIn) / (0.14 - T.blueIn) : t < T.invert ? 1 : 0;
    R.uBlue.value = bk * 0.55;
    R.uWhite.value = t > T.screen && t < T.invertEnd ? 0.035 : 0;
    R.uDash.value = t < 0.42 ? 1 : Math.max(0, 1 - (t - 0.42) / (T.lineEnd - 0.42));
    R.uOp.value = 1;
    this.rift.visible = t < T.lineEnd && !(t >= T.invert && t < T.invertEnd);
    // ② 화면 전체 파란 물듦
    const tintOn = t >= T.screen && t < T.invert;
    this.tint.visible = tintOn;
    if (tintOn) {
      const k = (t - T.screen) / 0.05;
      this.tintU.uW.value = 0.03 + Math.min(1, k) * 1.25;
      this.tintU.uAmt.value = 1;
    }
    // ③ 반전 + 방사 파편
    const invOn = t >= T.invert && t < T.invertEnd;
    this.invert.visible = this.burst.visible = invOn;
    if (invOn) {
      const k = (t - T.invert) / (T.invertEnd - T.invert);
      this.invU.uAmt.value = 0.38;
      this.burstU.uAmt.value = 1;
      this.burstU.uR.value = 0.22 + k * 0.28;
    }
    if (!a.cut && t >= T.invert) {
      a.cut = true;
      a.onCut?.();
      fx.flash(a.o.clone().addScaledVector(a.travel, 4), 0xffffff, 14, 0.35, 40);
      sfx.play('slash', { at: a.o, vol: 1, rate: 0.55 });
      sfx.play('black_flash', { vol: 0.5, rate: 0.7 });
    }
    // ⑤⑥ 충격파 고리 + 세계 어긋남
    if (!a.splitDone && t >= T.split) {
      a.splitDone = true;
      this.split?.activate();
      const center = a.o.clone().addScaledVector(a.travel, 16);
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.n);
      const head = this.ctx.input.head;
      for (const r of this.rings) {
        _v.subVectors(head, center);
        r.dCam = _v.addScaledVector(a.nUp, -_v.dot(a.nUp)).length(); // 고리 중심에서 머리까지 (평면 위로 잰 거리)
        r.g.position.copy(center);
        r.g.quaternion.copy(_q);
        r.g.visible = false;
      }
      sfx.play('wind_burst', { vol: 0.9, rate: 0.6 });
      sfx.rumble(1.4, 0.6);
    }
    if (a.splitDone) {
      const ts = t - T.split;
      let any = false;
      for (const r of this.rings) {
        const k = (ts - r.delay) / r.dur;
        if (k < 0 || k >= 1) {
          r.g.visible = false;
          if (k < 1) any = true;
          continue;
        }
        any = true;
        r.g.visible = true;
        const e = 1 - Math.pow(1 - k, 3);
        const rad = 1.5 + e * r.R;
        r.g.scale.set(rad, rad, rad * r.thick);
        // 고리가 머리 곁을 지나갈 때는 시야를 덮지 않게 옅게
        const near = THREE.MathUtils.smoothstep(Math.abs(rad - r.dCam), 1.5, 9);
        const fade = Math.pow(1 - k, 1.4) * (0.2 + 0.8 * near);
        r.main.material.color.setHex(bright ? 0x4a4a50 : 0xdfe8ff);
        for (const p of r.parts) p.material.opacity = p.userData.op * fade;
      }
      if (!any && t > T.lineEnd) this.active = null;
    }
  }

  dispose() {
    this._finish();
    const { scene, camera } = this.ctx;
    scene.remove(this.rift);
    camera.remove(this.tint, this.invert, this.burst);
    for (const r of this.rings) scene.remove(r.g);
  }
}
