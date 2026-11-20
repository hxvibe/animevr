// 세계를 가르는 해 — 차원 참격 연출
//  ① 휘두른 자리에 세계를 가르는 참격 선(검은 칼날 + 흰 빛 테두리)이 화면을 가로지르고
//  ② 그 선을 따라 파란 차원 균열이 한두 프레임 번쩍 벌어져 화면을 물들인다. 균열의 톱니 윤곽은
//     연한 하늘색으로 빛나며 벌어질수록 두꺼워진다
//  ③ 임팩트 프레임(히로아카식): 한두 프레임 동안 세상이 흑백으로 뒤집히고, 배경·물체가 하얗게
//     번지며 중심에서 바깥으로 방사형으로 늘어진다 (색수차 테두리)  ← 이 순간 실제로 베인다
//  ④ 가는 절단선만 남아 점선으로 흩어지고
//  ⑤ 절단 평면을 따라 투명한 충격파가 퍼지며 뒤 배경을 일그러뜨리고(굴절), 터지는 순간 화면 전체가 색수차로 출렁인다
//  ⑥ 절단면 위쪽 세계(배경 건물·벽)가 통째로 미끄러져 어긋난다. 위쪽은 크게 들리며 밀려나 벤 틈이 넓게 벌어지고
//     (처음엔 빠르게, 점점 느려지며 계속 벌어짐) 잘린 단면은 하얗게 빛난다
//     잠시 뒤 어긋난 세계는 제자리로 돌아온다
import * as THREE from 'three';
import { bladeTexture } from './vfx.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// 타임라인 (초)
// 참고 영상(30fps)을 프레임 단위로 맞춘 실시간 타이밍
//  0~3 참격 선 · 4~6 파란 균열(얇은 띠 → 거의 전체 → 전체) · 7 임팩트 · 8~12 남은 선이 점선으로 흩어짐
//  13~16 정적 · 17 충격파 + 세계 어긋남 (충격파는 ~5프레임, 어긋남은 ~3프레임 만에)
//  영상 0프레임에 이미 선이 그어져 있으므로 휘두른 순간 = -1프레임 → 영상 k프레임 = (k+1)/30초
const RF = (k) => (k + 1) / 30 - 0.004; // 누적 오차로 경계 프레임을 놓치지 않게 살짝 당긴다
const T = {
  blueIn: RF(4), // 파란 균열 시작
  impact: RF(7), // 임팩트 프레임 = 실제 절단 순간
  impactDur: 1 / 30 - 0.002, // 임팩트 프레임 길이 (30fps 기준 1프레임)
  lineEnd: RF(12.5), // 남은 절단선이 다 흩어짐
  split: RF(17), // 충격파 + 세계 어긋남
  heal: 6.5, // 제자리로 돌아오기 시작
  end: 7.1,
};

const LINE_DIST = 12; // 참격 선을 그리는 거리 (m)
const SLAB = 1.6; // 단면을 하얗게 채우는 깊이 (m)

const GLSL_NOISE = /* glsl */ `
float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
// 직선 보간: 뾰족뾰족한 톱니 윤곽
float jag(float x) { float i = floor(x); return mix(h1(i), h1(i + 1.0), fract(x)); }
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
// ② 파란 차원 균열: 참격 선에서 위아래로 톱니 윤곽을 그리며 벌어져 화면을 물들인다
//    톱니 모양은 몇 프레임마다 바뀌어 손으로 그린 듯 들끓는다
const EDGE = /* glsl */ `
float tearEdge(float s) {
  return uW * (0.62 + 0.75 * jag(s * 9.0 + floor(uT * 20.0) * 3.1) + 0.12 * n1(s * 37.0 + uT * 3.0));
}
`;
// 곱하기 혼합: 흰 것은 하늘색, 어두운 것은 짙은 파랑
const tintFrag = /* glsl */ `
uniform vec3 uN, uA;
uniform float uW, uAmt, uT;
varying vec3 vDir;
varying float vOff;
${GLSL_NOISE}
${EDGE}
void main() {
  float d = dot(vDir, uN) - vOff;
  float m = step(abs(d), tearEdge(dot(vDir, uA))) * uAmt;
  vec3 tint = mix(vec3(0.42, 0.66, 1.0), vec3(0.27, 0.52, 0.98), smoothstep(0.5, 0.0, abs(d)));
  gl_FragColor = vec4(mix(vec3(1.0), tint, m), 1.0);
}
`;
// 파란 균열의 톱니 윤곽선 (일반 혼합). 벌어질수록 uOW 가 커져 두꺼워진다
const tintEdgeFrag = /* glsl */ `
uniform vec3 uN, uA;
uniform float uW, uAmt, uT, uOW;
uniform vec3 uEdgeCol;
varying vec3 vDir;
varying float vOff;
${GLSL_NOISE}
${EDGE}
void main() {
  float d = dot(vDir, uN) - vOff;
  float e = abs(d) - tearEdge(dot(vDir, uA)); // 양수 = 바깥
  float core = 1.0 - smoothstep(uOW * 0.3, uOW, abs(e));
  float inGlow = (1.0 - smoothstep(0.0, uOW * 3.0, -e)) * step(e, 0.0);
  float a = max(core, inGlow * 0.55) * uAmt;
  if (a < 0.01) discard;
  // 연한 하늘색 테두리, 한가운데는 하얗게
  gl_FragColor = vec4(mix(uEdgeCol, vec3(1.0), core * 0.55), a);
}
`;

// ③ 임팩트 프레임: 방금 그린 화면(렌더 타깃)을 검게 덮고, 물체·배경의 윤곽처럼 주변과 대비가 큰 곳만
//    하얗게 → 중심에서 바깥으로 방사형으로 번지게 늘인다
const impactVert = /* glsl */ `
uniform vec3 uC;
varying vec4 vClip;
varying vec4 vCC;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vClip = gl_Position;
  vCC = projectionMatrix * viewMatrix * vec4(uC, 1.0);
}
`;
const impactFrag = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uRes, uVp;
uniform float uK, uSeed;
varying vec4 vClip;
varying vec4 vCC;
${GLSL_NOISE}
const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
float gAvg, gLod;
// 하얗게 번질 곳: 주변과 대비가 큰 곳(윤곽·무늬·물체 가장자리). 아주 밝은 배경(하얀 방)이면 어두운 물체 덩어리도
float pick(vec2 suv) {
  float l = dot(texture2D(uTex, suv).rgb, LUM);
  float m = dot(textureLod(uTex, suv, gLod).rgb, LUM);
  float edge = smoothstep(0.26, 0.6, abs(l - m) / (m + 0.06));
  float dark = gAvg > 0.6 ? smoothstep(0.25, 0.45, gAvg - l) : 0.0;
  return max(edge, dark);
}
float smear(vec2 uv, vec2 d, float k) {
  float m = 0.0;
  for (int i = 0; i < 12; i++) {
    float f = float(i) / 11.0;
    m = max(m, pick(uv - d * f * k) * (1.0 - f * 0.8));
  }
  return m;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 ndc = vClip.xy / vClip.w;
  vec2 cn = vCC.w > 0.0 ? vCC.xy / vCC.w : vec2(0.0);
  vec2 d = (ndc - cn) * uVp; // 이 픽셀에서 중심까지의 uv 차이
  gAvg = dot(textureLod(uTex, uv, 20.0).rgb, LUM);
  gLod = log2(uRes.y / 90.0); // 주변 평균을 낼 범위 (해상도와 무관하게 화면의 약 1/90)
  // 각도마다 번지는 길이가 달라 들쭉날쭉한 방사형 얼룩
  float ang = atan(ndc.y - cn.y, ndc.x - cn.x);
  float k = uK * (0.35 + 1.1 * pow(n1(ang * 9.0 + uSeed), 2.0) + 0.3 * n1(ang * 41.0 + uSeed));
  vec3 col = vec3(smear(uv, d, k * 1.05), smear(uv, d, k), smear(uv, d, k * 0.95));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ⑤ 충격파: 절단 평면을 따라 납작하게 퍼지는 투명한 압력 껍질. 껍질을 비스듬히 볼수록(가장자리)
//    뒤 배경이 바깥쪽으로 굴절돼 일그러진다 (아지랑이). 앞쪽 가장자리엔 응결된 듯 옅은 흰빛
const shockVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;
const shockFrag = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uRes, uVp;
uniform float uStr, uSheen, uDark;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float f = 1.0 - abs(dot(N, normalize(vV)));
  float prof = pow(f, 3.0);
  float a = smoothstep(0.004, 0.06, prof * uStr * 40.0);
  if (a < 0.01) discard;
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 off = N.xy * uVp * 2.0 * uStr * prof;
  vec3 col;
  col.r = texture2D(uTex, uv + off * 1.04).r;
  col.g = texture2D(uTex, uv + off).g;
  col.b = texture2D(uTex, uv + off * 0.96).b;
  // 압축된 공기의 옅은 흰 막 (가장자리일수록)
  col = mix(col, vec3(1.0), uSheen * pow(f, 6.0));
  // 압력 앞머리: 살짝 어두운 띠 (밝은 배경에서도 파면이 보이게)
  col *= 1.0 - uDark * smoothstep(0.55, 0.85, f) * (1.0 - smoothstep(0.9, 1.0, f));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ⑤ 충격파가 터지는 순간: 화면 전체가 색수차로 갈라지며 바깥으로 출렁 (참고 영상 17~19프레임)
const pulseVert = /* glsl */ `
uniform vec3 uC;
varying vec4 vClip;
varying vec4 vCC;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vClip = gl_Position;
  vCC = projectionMatrix * viewMatrix * vec4(uC, 1.0);
}
`;
const pulseFrag = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uRes, uVp;
uniform float uAmt, uT;
varying vec4 vClip;
varying vec4 vCC;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 ndc = vClip.xy / vClip.w;
  vec2 cn = vCC.w > 0.0 ? vCC.xy / vCC.w : vec2(0.0);
  vec2 d = (ndc - cn) * uVp;
  float r = length(ndc - cn);
  // 바깥으로 퍼지는 물결 + 가장자리일수록 커지는 색 갈라짐
  float wob = sin(r * 14.0 - uT * 60.0) * 0.012 * uAmt;
  vec2 w = d * wob / max(r, 0.05);
  float ca = 0.035 * uAmt * (0.35 + r);
  vec3 col;
  col.r = texture2D(uTex, uv + w + d * ca).r;
  col.g = texture2D(uTex, uv + w).g;
  col.b = texture2D(uTex, uv + w - d * ca).b;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
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
    this.capColor = new THREE.Color(0xffffff);
    // 단면 채우기: 잘린 물체 안쪽(뒷면)을 하얗게 칠한다. 절단면 가까이(SLAB m)만 칠해서
    // 열린 모양의 뒷면(천장 조명 홈 등)이 엉뚱하게 칠해지지 않게 한다
    const capMat = (planes, inter, slab) => {
      const m = new THREE.MeshBasicMaterial({
        color: this.capColor, side: THREE.BackSide, clippingPlanes: planes, clipIntersection: inter, clipShadows: false, fog: false, toneMapped: false,
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
    this.seamU = { col: { value: new THREE.Color(0xffffff) }, w: { value: 0 } };
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
    this.update(0); // 첫 프레임부터 단면·솔기 평면 값을 채워 둔다
  }

  // 잘린 표면을 따라 하얗게 빛나는 솔기 (절단 평면에서 SEAM 폭 안쪽). 멀수록 굵게 해서 멀리서도 보이게
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
    // 처음엔 확 벌어지고 점점 느려지며 계속 벌어진다 (참고 영상: 1초 넘게 여전히 움직임). 끝에 제자리로
    const e0 = 1 - Math.exp(-t / 0.55);
    let e = e0 * 0.85 + Math.min(1, t / 4) * 0.15;
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
    // 단면: 하얗게 빛나다 아주 옅은 회색으로
    const cool = THREE.MathUtils.clamp((t - 1.5) / 3, 0, 1);
    this.capColor.setScalar(1 - cool * 0.12);
    this.seamU.col.value.copy(this.capColor);
    // 솔기: 갈라지는 순간 굵게 번쩍였다가 가늘어지고, 제자리로 돌아올 때 사라진다
    const flare = t < 0.2 ? 1 + (1 - t / 0.2) * 2.5 : 1;
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
    // 참격 선: 기존 「세계를 가르는 해」 칼날 (검은 칼날 + 흰 빛 테두리, 양끝이 가늘게)
    this.blade = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: bladeTexture(), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }),
    );
    this.blade.renderOrder = 405;
    this.blade.frustumCulled = false;
    this.blade.visible = false;
    ctx.scene.add(this.blade);
    // 화면 효과 (머리에 붙는 구)
    const shared = { uO: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uA: { value: new THREE.Vector3() }, uT: { value: 0 } };
    this.tintU = { ...shared, uW: { value: 0 }, uAmt: { value: 0 } };
    this.tint = headSphere(tintFrag, this.tintU, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, // 화면 알파는 그대로
    }, 401);
    this.edgeU = { ...shared, uW: this.tintU.uW, uAmt: this.tintU.uAmt, uOW: { value: 0.02 }, uEdgeCol: { value: new THREE.Color(0.72, 0.9, 1.0) } };
    this.tintEdge = headSphere(tintEdgeFrag, this.edgeU, null, 402);
    // 임팩트 프레임 (렌더 타깃에 먼저 그린 장면을 가공)
    this.rt = new THREE.WebGLRenderTarget(4, 4, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    this._size = new THREE.Vector2();
    this.impactU = {
      uTex: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uVp: { value: new THREE.Vector2(0.5, 0.5) },
      uC: { value: new THREE.Vector3() }, uK: { value: 0.3 }, uSeed: { value: 0 },
    };
    this.impact = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16), new THREE.ShaderMaterial({
      vertexShader: impactVert, fragmentShader: impactFrag, uniforms: this.impactU, side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true, fog: false,
    }));
    this.impact.renderOrder = 403;
    this.impact.frustumCulled = false;
    this.impact.visible = false;
    ctx.camera.add(this.tint, this.tintEdge, this.impact);
    this._preRender = () => this._renderSources();
    (ctx.beforeRender ??= []).push(this._preRender);
    // ⑤ 충격파 껍질: 본 파동 + 약한 뒤따르는 파동. 배경은 반 해상도 렌더 타깃에서 가져와 굴절시킨다
    this.shockRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.shockGeo = new THREE.SphereGeometry(1, 64, 32);
    this.shocks = [
      { delay: 0, R: 60, dur: 0.34, str: 0.13, sheen: 0.3, dark: 0.35 },
      { delay: 0.05, R: 42, dur: 0.3, str: 0.07, sheen: 0.18, dark: 0.22 },
    ].map((sp) => {
      const u = { uTex: { value: this.shockRT.texture }, uRes: this.impactU.uRes, uVp: this.impactU.uVp, uStr: { value: 0 }, uSheen: { value: 0 }, uDark: { value: 0 } };
      const m = new THREE.Mesh(this.shockGeo, new THREE.ShaderMaterial({ vertexShader: shockVert, fragmentShader: shockFrag, uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.renderOrder = 30;
      m.frustumCulled = false;
      m.visible = false;
      ctx.scene.add(m);
      return { m, u, ...sp };
    });
    this.pulseU = { uTex: { value: this.shockRT.texture }, uRes: this.impactU.uRes, uVp: this.impactU.uVp, uC: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uT: { value: 0 } };
    this.pulse = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16), new THREE.ShaderMaterial({
      vertexShader: pulseVert, fragmentShader: pulseFrag, uniforms: this.pulseU, side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true, fog: false,
    }));
    this.pulse.renderOrder = 29; // 충격파 껍질(30)보다 먼저
    this.pulse.frustumCulled = false;
    this.pulse.visible = false;
    ctx.camera.add(this.pulse);
  }

  // 화면 효과가 켜진 프레임에만 장면을 렌더 타깃에 한 번 더 그린다 (XR 이면 두 눈이 나란히)
  //  · 임팩트 프레임: 원래 해상도 (윤곽을 또렷하게)
  //  · 충격파: 반 해상도 (굴절된 배경은 살짝 흐린 편이 아지랑이처럼 자연스럽다)
  _renderSources() {
    const shockOn = this.shocks.some((x) => x.m.visible);
    if (!this.impact.visible && !shockOn) return;
    const r = this.ctx.renderer;
    r.getDrawingBufferSize(this._size);
    this.impactU.uRes.value.copy(this._size);
    // ndc 1 만큼이 uv 로 얼마인지 (XR: 한 눈이 화면 절반)
    const vp = this.impactU.uVp.value.set(0.5, 0.5);
    if (r.xr.isPresenting) {
      const v = r.xr.getCamera().cameras[0]?.viewport;
      if (v) vp.set((v.z / this._size.x) * 0.5, (v.w / this._size.y) * 0.5);
    }
    if (this.impact.visible) {
      this._renderInto(this.rt, this._size.x, this._size.y, [this.impact]);
    } else if (shockOn) {
      // 화면 전체 색수차가 도는 동안은 원래 해상도, 그 뒤 굴절만 남으면 반 해상도
      const div = this.pulse.visible ? 1 : 2;
      this._renderInto(this.shockRT, Math.max(1, Math.round(this._size.x / div)), Math.max(1, Math.round(this._size.y / div)), [...this.shocks.map((x) => x.m), this.pulse]);
    }
  }

  _renderInto(rt, w, h, hide) {
    const r = this.ctx.renderer;
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    const vis = hide.map((m) => m.visible);
    for (const m of hide) m.visible = false;
    const prev = r.getRenderTarget();
    r.setRenderTarget(rt);
    r.render(this.ctx.scene, this.ctx.camera);
    r.setRenderTarget(prev);
    hide.forEach((m, i) => (m.visible = vis[i]));
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
    // 휘두른 방향으로 밀리고 절단면에서 크게 들려 벤 틈이 넓게 벌어진다 (세로로 벤 경우는 덜 밀린다)
    const shift = along.clone().multiplyScalar(3.2 * (0.55 + 0.45 * Math.abs(nUp.y))).addScaledVector(nUp, 1.5);
    this.split = new WorldSplit(this.ctx, { o, travelH, nUp, shift });
    if (!this.split.ok) this.split = null;
    // 참격 선: 정면 12m, 휘두른 방향으로 길게 (평면을 정면으로 마주 본다)
    const c = o.clone().addScaledVector(travel, LINE_DIST);
    this.blade.position.copy(c);
    this.blade.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, n, travel));
    this.blade.scale.set(0.01, 0.01, 1);
    this.blade.material.opacity = 1;
    this.blade.visible = true;
    const u = this.tintU;
    u.uO.value.copy(o);
    u.uN.value.copy(n);
    u.uA.value.copy(along);
    this.impactU.uC.value.copy(c);
    this.impactU.uSeed.value = Math.random() * 50;
  }

  _finish() {
    this.active = null;
    this.blade.visible = false;
    this.tint.visible = this.tintEdge.visible = this.impact.visible = false;
    for (const x of this.shocks) x.m.visible = false;
    this.pulse.visible = false;
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
    this.tintU.uT.value += dt;
    // ② 파란 차원 균열: 얇은 띠에서 순식간에 벌어져 화면을 덮는다 (약 0.1초)
    const tintOn = t >= T.blueIn && t < T.impact;
    if (tintOn) {
      const k = (t - T.blueIn) / (T.impact - T.blueIn);
      const open = Math.pow(Math.min(1, 0.06 + k * 1.5), 1.3);
      this.tintU.uW.value = 0.02 + 0.58 * open;
      this.tintU.uAmt.value = 1;
      this.edgeU.uOW.value = 0.01 + open * 0.07; // 벌어질수록 윤곽선이 두꺼워진다
    }
    this.tint.visible = this.tintEdge.visible = tintOn;
    if (t >= T.impact && a.impactT === undefined) a.impactT = t;
    // ③ 임팩트 프레임
    const impEnd = a.impactT !== undefined ? a.impactT + T.impactDur : Infinity;
    const invOn = a.impactT !== undefined && t < impEnd;
    this.impact.visible = invOn;
    if (invOn) this.impactU.uK.value = 0.22 + ((t - a.impactT) / T.impactDur) * 0.2;
    if (!a.cut && a.impactT !== undefined) {
      a.cut = true;
      a.onCut?.();
      fx.flash(a.o.clone().addScaledVector(a.travel, 4), 0xffffff, 14, 0.35, 40);
      sfx.play('slash', { at: a.o, vol: 1, rate: 0.55 });
      sfx.play('black_flash', { vol: 0.5, rate: 0.7 });
    }
    // ①④ 참격 선: 순식간에 화면 끝까지 뻗고, 절단 뒤에는 가늘어지며 사라진다
    const grow = 1 - Math.pow(1 - Math.min(1, t / 0.09), 3);
    let thick = 0.55;
    let op = 1;
    const fadeFrom = Math.min(impEnd, T.lineEnd - 0.1);
    if (t >= fadeFrom) {
      const k = Math.min(1, (t - fadeFrom) / (T.lineEnd - fadeFrom));
      thick = 0.4 * (1 - k * 0.7);
      op = 1 - k * k;
    }
    this.blade.scale.set(6 + 144 * grow, thick, 1);
    this.blade.material.opacity = op;
    this.blade.visible = t < T.lineEnd && !invOn;
    // ⑤⑥ 충격파 + 세계 어긋남
    if (!a.splitDone && t >= T.split) {
      a.splitDone = true;
      this.split?.activate();
      // 충격파 중심: 정면 14m 의 절단 평면 위. 평면 방향으로 납작한 껍질
      a.center = a.o.clone().addScaledVector(a.travel, 14);
      a.e1 = a.travelH.clone();
      a.e2 = new THREE.Vector3().crossVectors(a.nUp, a.e1).normalize();
      a.e1.crossVectors(a.e2, a.nUp).normalize(); // 평면 안의 정면
      this.pulseU.uC.value.copy(a.center);
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.nUp);
      for (const x of this.shocks) {
        x.m.position.copy(a.center);
        x.m.quaternion.copy(_q);
      }
      sfx.explosion(a.center, 1.6);
      sfx.play('wind_burst', { vol: 0.9, rate: 0.55 });
      sfx.rumble(1.6, 0.7);
      this.ctx.input.left?.pulse?.(0.7, 220);
      this.ctx.input.right?.pulse?.(0.9, 260);
    }
    if (a.splitDone) {
      const ts = t - T.split;
      let any = false;
      for (const x of this.shocks) {
        const k = (ts - x.delay) / x.dur;
        if (k < 0 || k >= 1) {
          x.m.visible = false;
          if (k < 0) any = true;
          continue;
        }
        any = true;
        x.m.visible = true;
        // 처음엔 아주 빠르게, 퍼질수록 느려진다 (폭풍파 감속)
        const e = 1 - Math.pow(1 - k, 2.6);
        const rad = 0.5 + e * x.R;
        x.m.scale.set(rad, rad, rad * 0.32);
        const fade = Math.pow(1 - k, 1.6) * Math.min(1, k * 12);
        x.u.uStr.value = x.str * fade;
        x.u.uSheen.value = x.sheen * fade;
        x.u.uDark.value = x.dark * fade;
      }
      // 화면 전체 색수차 출렁임: 터지는 순간 가장 세고 0.2초 만에 가라앉는다
      const pk = ts / 0.2;
      this.pulse.visible = pk < 1;
      if (pk < 1) {
        this.pulseU.uAmt.value = Math.pow(1 - pk, 1.5) * Math.min(1, pk * 10 + 0.4);
        this.pulseU.uT.value = ts;
        any = true;
      }
      if (!any && t > T.lineEnd) this.active = null;
    }
  }

  dispose() {
    this._finish();
    const { scene, camera } = this.ctx;
    scene.remove(this.blade);
    this.blade.material.dispose();
    camera.remove(this.tint, this.tintEdge, this.impact);
    const hooks = this.ctx.beforeRender;
    const i = hooks ? hooks.indexOf(this._preRender) : -1;
    if (i >= 0) hooks.splice(i, 1);
    this.rt.dispose();
    for (const x of this.shocks) {
      scene.remove(x.m);
      x.m.material.dispose();
    }
    this.shockGeo.dispose();
    this.shockRT.dispose();
    camera.remove(this.pulse);
    this.pulse.material.dispose();
  }
}
