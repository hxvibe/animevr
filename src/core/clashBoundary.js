import * as THREE from 'three';

// ───────── 영역 싸움 경계 (모든 영역 셰이더가 같은 값을 본다) ─────────
//  경계 = 두 영역 중심까지 거리의 차가 bias 인 곳 (쌍곡면) + 일렁이는 노이즈
//  s = |p - 플레이어 중심| - |p - 적 중심| - bias > 0 이면 적의 영역 (bias 가 크면 내 영역이 넓다)
//  → 우세한 쪽이 상대 쪽으로 휘어 감싸며 밀어붙이고, 맞닿은 면은 계속 출렁인다
export const CLASH_U = {
  uClashP: { value: new THREE.Vector4(0, 0, 0, 1) },
  uClashE: { value: new THREE.Vector4(0, 0, 0, 1) },
  uClashOn: { value: 0 },
  uClashT: { value: 0 },
  uClashAmp: { value: 1.2 },
  uClashColP: { value: new THREE.Color(1, 1, 1) },
  uClashColE: { value: new THREE.Color(1, 1, 1) },
};
export const CLASH_GLSL = /* glsl */ `
uniform vec4 uClashP; uniform vec4 uClashE; uniform float uClashOn; uniform float uClashT; uniform float uClashAmp;
uniform vec3 uClashColP; uniform vec3 uClashColE;
float clH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float clN(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(clH(i), clH(i + vec3(1,0,0)), f.x), mix(clH(i + vec3(0,1,0)), clH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(clH(i + vec3(0,0,1)), clH(i + vec3(1,0,1)), f.x), mix(clH(i + vec3(0,1,1)), clH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float clashSide(vec3 p) {
  // 두 중심까지 거리의 차 (쌍곡면 — 약한 쪽으로 휘어 감싼다), 단위 m
  float s = length(p.xz - uClashP.xz) - length(p.xz - uClashE.xz) - uClashP.w;
  s += (clN(p * 0.22 + vec3(0.0, -uClashT * 0.7, uClashT * 0.3)) - 0.5) * uClashAmp;
  s += (clN(p * 0.9 + vec3(uClashT * 1.5, 0.0, 0.0)) - 0.5) * uClashAmp * 0.35;
  return s;
}
// 경계 빛: 맞닿은 곳에서 두 영역의 색이 지지직거린다
vec3 clashSeam(vec3 p, float s) {
  if (uClashOn < 0.5) return vec3(0.0);
  float b = abs(s);
  float crack = smoothstep(0.03, 0.0, abs(clN(p * 1.6 + vec3(0.0, uClashT * 3.0, 0.0)) - 0.5)) * smoothstep(1.6, 0.0, b);
  vec3 c = mix(uClashColP, uClashColE, step(0.0, s));
  return c * smoothstep(0.45, 0.0, b) * 2.2 + vec3(1.0) * crack * 1.3;
}
`;

/** JS 판정용 (노이즈 없이) */
export function clashSideJS(p) {
  const P = CLASH_U.uClashP.value;
  const E = CLASH_U.uClashE.value;
  return Math.hypot(p.x - P.x, p.z - P.z) - Math.hypot(p.x - E.x, p.z - E.z) - P.w;
}
