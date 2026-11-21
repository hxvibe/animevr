// 적의 영역전개 + 영역 싸움(맞영역)
//
//  "영역에 대한 가장 효과적인 수단은 이쪽도 영역을 전개하는 것.
//   동시에 영역이 전개되면 보다 세련된 주술이 그 자리를 제압한다." — 고죠 사토루
//
//  · 적(마히토 · 죠고 · 고죠)이 영역을 펼친다 → 안에 있으면 필중 효과가 플레이어에게 떨어진다
//  · 플레이어도 영역을 펼치면 영역 싸움:
//      완성도 차이가 크면(압도) 낮은 쪽 영역이 곧바로 밀려나 깨지고,
//      비슷하면 '중첩' — 서로의 필중 효과가 사라지고, 경계가 밀고 밀리는 줄다리기가 된다
//      (두 손바닥을 앞으로 밀어 주력을 쏟으면 내 쪽으로 기운다)
//  · 밀려난 쪽: 영역이 깨지고 술식이 타 버린다. 플레이어가 밀려나면 필중을 그대로 맞는다
import * as THREE from 'three';
import { CLASH_U, CLASH_GLSL, clashSideJS } from './clashBoundary.js';
import { HandMaw } from './mahitoDomain.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

// 적 영역: ref = 완성도(영역·술식의 정교함 · 상성 · 상태를 합친 값)
export const ENEMY_DOMAINS = {
  mahito: {
    name: '自閉円頓裹', ruby: 'じへいえんどんか', label: '자폐원돈과', color: '#b88ad8', ref: 82, radius: 19, type: 0, dur: 24,
    lights: { hemi: 0xe8e0ff, ground: 0x2a2080, hemiI: 0.9, sun: 0xf4f0ff, sunI: 0.7, fog: 0x0a0610, fogNear: 24, fogFar: 75, exposure: 1.0 },
  },
  jogo: {
    name: '蓋棺鉄囲山', ruby: 'がいかんてっちせん', label: '개관철위산', color: '#ff7a2a', ref: 80, radius: 19, type: 1, dur: 24,
    lights: { hemi: 0xff8040, ground: 0x401008, hemiI: 1.0, sun: 0xff6020, sunI: 1.6, fog: 0x401006, fogNear: 12, fogFar: 60, exposure: 0.9 },
  },
  // 손가락 보유자: 불완전한 영역 — 소년원 같은 리미널 스페이스 (결계가 엉성해 틈이 보이고, 필중도 약하다)
  fingerBearer: {
    name: '領域展開', ruby: 'りょういきてんかい', label: '불완전한 영역', color: '#d8c890', ref: 42, radius: 13, type: 3, dur: 15,
    lights: { hemi: 0xfff4d0, ground: 0x403828, hemiI: 1.15, sun: 0xfff0c0, sunI: 0.7, fog: 0x8a8060, fogNear: 6, fogFar: 32, exposure: 0.95 },
  },
  gojo: {
    name: '無量空処', ruby: 'むりょうくうしょ', label: '무량공처', color: '#6fb8ff', ref: 94, radius: 24, type: 2, dur: 20,
    lights: { hemi: 0xb8d8ff, ground: 0x101830, hemiI: 1.3, sun: 0xffffff, sunI: 1.0, fog: 0x02040c, fogNear: 25, fogFar: 120, exposure: 1.0 },
  },
};

// 영역 싸움의 강함 (원작 서열): 스쿠나 > 고죠 > 마히토 ≈ 죠고 > 메구미 > 특급 주령
//  (유타 · 유지는 원작에 맞대결이 없어 그 사이에 둔다) — 강하다고 무조건 이기지는 않는다: 격돌의 운 · 주력 쏟기 · 남은 체력이 판을 뒤집는다
export const PLAYER_DOMAINS = {
  sukuna: { ref: 100, name: '伏魔御廚子', color: '#ff3a3a' },
  gojo: { ref: 94, name: '無量空処', color: '#6fb8ff' },
  yuta: { ref: 87, name: '真贋相愛', color: '#c8a0ff' },
  mahito: { ref: 82, name: '自閉円頓裹', color: '#7ad8ff' },
  jogo: { ref: 80, name: '蓋棺鉄囲山', color: '#ff7a2a' },
  itadori: { ref: 74, name: '領域展開', color: '#ff5a6e' },
  megumi: { ref: 58, name: '嵌合暗翳庭', color: '#6f86ff' },
};

const OVERWHELM = 45; // 이만큼 넘게 차이 나야 '압도' (그래도 버티면 뒤집을 수 있다)

 // 완성도가 이만큼 넘게 차이 나면 '압도' (곧바로 밀려난다)

/** 지금 플레이어 캐릭터의 영역 상태 */
export function playerDomain(ctx) {
  const ch = ctx.character;
  if (!ch) return null;
  const sh = ch.shell ?? ch.garden ?? ch.town ?? ch.shrine ?? ch.void;
  const casting = !!ch.domainCasting;
  if (!sh && !casting) return null;
  const st = sh?.state ?? 'idle';
  const closing = st === 'closing' || st === 'exit' || st === 'sink';
  const open = st !== 'idle' && !closing;
  if (!open && !casting) return null;
  const head = ctx.input.head;
  const center = open && sh.center ? sh.center : _v3.set(head.x, 0, head.z);
  return {
    id: ch.id,
    open,
    casting: casting && !open,
    center: center.clone().setY(0),
    radius: ctx.world.domain?.radius ?? sh?.radius ?? 16,
    ref: PLAYER_DOMAINS[ch.id]?.ref ?? 60,
    name: PLAYER_DOMAINS[ch.id]?.name ?? '領域',
    color: PLAYER_DOMAINS[ch.id]?.color ?? '#ffffff',
    shell: sh,
  };
}

// ───────────────── 적 영역의 모습 ─────────────────
const NOISE = /* glsl */ `
float dh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dn(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh(i), dh(i + vec3(1,0,0)), f.x), mix(dh(i + vec3(0,1,0)), dh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dh(i + vec3(0,0,1)), dh(i + vec3(1,0,1)), f.x), mix(dh(i + vec3(0,1,1)), dh(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * dn(p); p *= 2.03; a *= 0.5; } return s; }
`;

// 영역별 벽/바닥 색. d: 중심에서 본 방향(벽) · q: 바닥 좌표(m)
const LOOKS = /* glsl */ `
uniform int uType;
uniform float uTime;
vec3 wallLook(vec3 d) {
  float az = atan(d.z, d.x);
  if (uType == 0) {
    // 自閉円頓裹: 거의 검은 보랏빛 허공 (손 구조물은 3D 로 따로)
    vec3 c = mix(vec3(0.035, 0.022, 0.06), vec3(0.012, 0.008, 0.022), smoothstep(-0.1, 0.9, d.y));
    c += vec3(0.18, 0.09, 0.28) * smoothstep(0.45, 0.85, fbm(d * 2.2 + vec3(0.0, uTime * 0.015, 0.0))) * 0.55;
    vec3 g = floor(d * 150.0);
    c += vec3(0.75, 0.7, 0.9) * step(0.9984, dh(g)) * (0.4 + 0.3 * sin(uTime * 2.0 + dh(g) * 40.0));
    return c;
  }
  if (uType == 1) {
    // 蓋棺鉄囲山: 화산 속 — 검은 바위 틈으로 용암
    float n = fbm(d * 9.0 + vec3(0.0, uTime * 0.08, 0.0));
    float crack = smoothstep(0.485, 0.5, n) * (1.0 - smoothstep(0.5, 0.53, n));
    float hot = smoothstep(0.62, 0.8, fbm(d * 3.5 - vec3(uTime * 0.05)));
    vec3 rock = mix(vec3(0.04, 0.03, 0.025), vec3(0.14, 0.09, 0.07), dn(d * 40.0)) * (0.6 + 0.6 * fbm(d * 16.0));
    vec3 glow = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.4), hot);
    vec3 c = mix(rock, glow * 2.0, max(crack * 1.2, hot * 0.35));
    float top = smoothstep(0.6, 0.98, d.y);
    c = mix(c, vec3(1.2, 0.35, 0.05) * (0.6 + 0.4 * dn(d * 9.0 + uTime)), top * 0.7);
    return c;
  }
  if (uType == 3) {
    // 불완전한 영역: 누렇게 바랜 타일 벽과 끝없이 이어지는 형광등 — 결계가 엉성해 군데군데 바깥이 비친다
    vec2 t = vec2(az * 9.0, d.y * 14.0);
    vec2 g = abs(fract(t) - 0.5);
    float grout = smoothstep(0.47, 0.5, max(g.x, g.y));
    vec3 tile = mix(vec3(0.78, 0.74, 0.58), vec3(0.88, 0.84, 0.68), dn(floor(vec3(t, 1.0))));
    tile *= 0.85 + 0.15 * fbm(d * 7.0);
    vec3 c = mix(tile, vec3(0.45, 0.42, 0.32), grout);
    // 천장 쪽 형광등 줄 (깜빡)
    float lamp = smoothstep(0.92, 1.0, sin(az * 6.0)) * smoothstep(0.55, 0.75, d.y) * (0.75 + 0.25 * step(0.2, fract(sin(floor(uTime * 7.0) * 12.9) * 43.7)));
    c += vec3(1.0, 0.98, 0.85) * lamp * 1.2;
    // 얼룩 · 녹물
    c *= 1.0 - 0.35 * smoothstep(0.6, 0.85, fbm(d * 3.0 + vec3(3.0)));
    return c;
  }
  // 無量空処: 끝없는 우주 — 별과 정보의 흐름
  vec3 c = vec3(0.005, 0.01, 0.03);
  float neb = fbm(d * 2.5 + vec3(uTime * 0.02, 0.0, 0.0));
  c += vec3(0.08, 0.16, 0.45) * pow(neb, 3.0) * 2.0;
  vec3 g = floor(d * 160.0);
  float star = step(0.9965, dh(g));
  c += vec3(0.9, 0.95, 1.0) * star * (0.6 + 0.4 * sin(uTime * 3.0 + dh(g) * 40.0));
  float flow = smoothstep(0.985, 1.0, sin(az * 23.0 + d.y * 17.0 + fbm(d * 3.0) * 6.0 - uTime * 5.0)) * smoothstep(0.55, 0.9, fbm(d * 5.0 + uTime * 0.25));
  c += vec3(0.7, 0.85, 1.0) * flow * 0.45;
  return c;
}
vec3 floorLook(vec2 q, float r) {
  if (uType == 0) {
    // 손 그림 없는 어둠 (반투명: 바닥 밑의 새장이 비친다)
    return vec3(0.05, 0.035, 0.09) + vec3(0.12, 0.08, 0.22) * smoothstep(0.9, 1.0, r) * 0.6;
  }
  if (uType == 1) {
    vec3 p = vec3(q.x, 0.0, q.y) * 0.6;
    float n = fbm(p * 1.3 + vec3(0.0, uTime * 0.15, 0.0));
    float crack = smoothstep(0.48, 0.5, n) * (1.0 - smoothstep(0.5, 0.54, n));
    float hot = smoothstep(0.55, 0.75, fbm(p * 0.7 - vec3(uTime * 0.05)));
    vec3 rock = mix(vec3(0.05, 0.035, 0.03), vec3(0.16, 0.1, 0.08), dn(p * 6.0));
    vec3 glow = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.4), hot);
    return mix(rock, glow * 2.2, max(crack * 1.4, hot * 0.25));
  }
  if (uType == 3) {
    vec2 g = abs(fract(q * 1.6) - 0.5);
    float grout = smoothstep(0.46, 0.5, max(g.x, g.y));
    vec3 tile = mix(vec3(0.62, 0.6, 0.5), vec3(0.72, 0.7, 0.58), dn(vec3(floor(q * 1.6), 2.0)));
    float wet = smoothstep(0.55, 0.75, fbm(vec3(q * 0.35, 4.0)));
    return mix(tile, vec3(0.3, 0.28, 0.22), grout) * (0.8 + 0.2 * wet) * (0.75 + 0.25 * smoothstep(1.0, 0.2, r));
  }
  // 무량공처: 검은 거울 같은 바닥에 빛의 결
  vec2 g = abs(fract(q * 0.5) - 0.5);
  float grid = smoothstep(0.02, 0.0, min(g.x, g.y)) * 0.25;
  float w = smoothstep(0.85, 1.0, sin(length(q) * 2.0 - uTime * 2.5)) * 0.4;
  return vec3(0.01, 0.015, 0.03) + vec3(0.4, 0.6, 1.0) * (grid + w) * smoothstep(1.0, 0.3, r);
}
`;

const DOME_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vL;
void main() {
  vL = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const DOME_FRAG = /* glsl */ `
uniform float uOpen; uniform float uCrack; uniform vec3 uRim;
varying vec3 vW; varying vec3 vL;
${NOISE}
${LOOKS}
${CLASH_GLSL}
void main() {
  // 경계(영역 싸움): 플레이어 영역 쪽은 그리지 않는다
  float side = uClashOn > 0.5 ? clashSide(vW) : 1.0;
  if (side < 0.0) discard;
  vec3 d = normalize(vL);
  vec3 col;
  if (gl_FrontFacing) {
    // 바깥에서 본 결계: 먹빛 구에 희미한 무늬
    col = vec3(0.02) + uRim * 0.15 * fbm(d * 6.0 + uTime * 0.1);
  } else {
    col = wallLook(d);
  }
  // 경계 가까이는 두 영역이 맞부딪혀 빛난다
  col += clashSeam(vW, side);
  // 깨질 때: 금이 간다
  if (uCrack > 0.0) {
    float c = smoothstep(0.02, 0.0, abs(fbm(d * 9.0) - 0.5)) * uCrack;
    col = mix(col, vec3(1.0), c);
  }
  float alpha = uType == 0 ? mix(0.5, 0.12, r) : 1.0;
  gl_FragColor = vec4(col * uOpen, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const FLOOR_FRAG = /* glsl */ `
uniform float uOpen; uniform vec3 uRim; uniform vec3 uCenter; uniform float uR;
varying vec3 vW; varying vec3 vL;
${NOISE}
${LOOKS}
${CLASH_GLSL}
void main() {
  float side = uClashOn > 0.5 ? clashSide(vW) : 1.0;
  if (side < 0.0) discard;
  vec2 q = vW.xz - uCenter.xz;
  float r = length(q) / uR;
  if (r > 1.0) discard;
  vec3 col = floorLook(q, r);
  col += clashSeam(vW, side);
  gl_FragColor = vec4(col * uOpen, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// 두 영역이 맞닿는 경계: 지지직거리는 빛의 막
const SEAM_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uK;
varying vec3 vW; varying vec3 vL;
${NOISE}
void main() {
  vec2 p = vL.xy;
  float r = length(p);
  float edge = smoothstep(1.0, 0.75, r) * smoothstep(-0.02, 0.06, vW.y); // 바닥 아래는 없다
  float n = fbm(vec3(p * 9.0, uTime * 1.5));
  float bolt = smoothstep(0.012, 0.0, abs(n - 0.5)) + smoothstep(0.008, 0.0, abs(fbm(vec3(p * 16.0 + 3.0, uTime * 2.3)) - 0.5)) * 0.7;
  vec3 col = mix(uA, uB, smoothstep(0.3, 0.7, n)) * 0.5 + vec3(0.9, 0.95, 1.0) * bolt;
  // 눈앞(3m 안)에선 흐려진다 — VR 에서 번개가 얼굴을 덮지 않게
  float near = smoothstep(0.8, 3.5, distance(cameraPosition, vW));
  float a = edge * (0.05 + bolt * 0.5) * uK * near;
  gl_FragColor = vec4(col, a);
}`;

class EnemyDomainView {
  constructor(ctx, def, center) {
    this.ctx = ctx;
    this.def = def;
    this.center = center.clone().setY(0);
    const rim = new THREE.Color(def.color);
    this.u = {
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uType: { value: def.type },
      ...CLASH_U,
      uCrack: { value: 0 },
      uRim: { value: rim },
      uCenter: { value: this.center },
      uR: { value: def.radius },
    };
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.DoubleSide, fog: false }));
    // 하늘(깊이 안 씀)보다 뒤에 그려 덮고, 몸·소품(먼저 그려 깊이를 남김)에는 가려진다
    this.dome.renderOrder = 1;
    this.dome.frustumCulled = false;
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: DOME_VERT, fragmentShader: FLOOR_FRAG, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }));
    this.floor.position.y = 0.012;
    this.floor.renderOrder = 1;
    this.floor.frustumCulled = false;
    this.group.add(this.dome, this.floor);
    // 자폐원돈과: 손이 엮인 거대한 아가리
    if (def.type === 0) {
      this.floor.material.transparent = true;
      this.floor.material.depthWrite = false;
      this.maw = new HandMaw(def.radius);
      this.mawK = 0;
      this.group.add(this.maw.group);
    }
    ctx.scene.add(this.group);
    this.setSize(0.02);
  }

  setSize(k) {
    const r = Math.max(0.05, this.def.radius * k);
    this.dome.scale.setScalar(r);
    this.floor.scale.setScalar(r);
  }

  /** 경계 평면: n(수평, 적 쪽을 향함)과 점 p. null 이면 끔 */

  dispose() {
    this.ctx.scene.remove(this.group);
    this.maw?.dispose();
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
  }
}

// ───────────────── 머리에 붙는 효과 (무량공처의 정보 과부하) ─────────────────
const OVERLOAD_FRAG = /* glsl */ `
uniform float uTime; uniform float uK;
varying vec3 vW; varying vec3 vL;
${NOISE}
void main() {
  vec3 d = normalize(vL);
  float az = atan(d.z, d.x);
  float streak = smoothstep(0.6, 1.0, sin(az * 60.0 + d.y * 30.0 + uTime * 40.0)) * dn(d * 30.0 + uTime * 9.0);
  float flash = 0.5 + 0.5 * sin(uTime * 23.0);
  vec3 col = mix(vec3(0.6, 0.8, 1.0), vec3(1.0), flash) * (streak * 1.4 + 0.25 * flash);
  gl_FragColor = vec4(col, uK * clamp(streak + 0.35 * flash, 0.0, 1.0));
}`;

// ───────────────── 영역 싸움 ─────────────────
export class DomainClash {
  constructor(ctx) {
    this.ctx = ctx;
    this.enemy = null; // { def, caster, view, state, t, center, startedAt }
    this.clash = null; // { D, gap, overwhelm, responder, t }
    this.pushK = 0;
    this.sure = { t: 0, para: 0, window: 0 };
    this.cds = new Map(); // 적 → 다시 펼칠 수 있는 때
    this.hud = null;
    this.overload = null;
  }

  /** 적이 영역을 펼칠 수 있는가 */
  canCast(e) {
    if (this.enemy) return false;
    return (this.cds.get(e) ?? -1) <= this.ctx.world.time;
  }

  /** 적이 영역전개 (수인을 다 맺은 순간 부른다) */
  cast(e) {
    const def = ENEMY_DOMAINS[e.def.model];
    if (!def || this.enemy) return false;
    const { ui, sfx, world } = this.ctx;
    const view = new EnemyDomainView(this.ctx, def, e.root.position);
    if (view.maw) {
      // 손의 아가리는 시전자 뒤에 우뚝 서서 플레이어 쪽으로 입을 벌린다
      const h = this.ctx.input.head;
      const dx = e.root.position.x - h.x;
      const dz = e.root.position.z - h.z;
      const d = Math.hypot(dx, dz) || 1;
      view.maw.place(new THREE.Vector3((dx / d) * def.radius * 0.5, 0, (dz / d) * def.radius * 0.5), Math.atan2(-dx, -dz));
    }
    this.enemy = { def, caster: e, view, state: 'opening', t: 0, center: view.center, startedAt: world.time };
    this.cds.set(e, world.time + 45);
    ui.manga({ top: '領域展開', main: def.name, ruby: def.ruby, color: def.color, big: true });
    sfx.rumble(2.2, 0.6);
    sfx.play('domain_open', { vol: 0.9, rate: def.type === 2 ? 1 : 0.8 });
    if (def.type === 2) sfx.play('void_open', { vol: 0.6 });
    this.sure = { t: 1.2, para: 0, window: 0 };
    // 플레이어가 이미 펼쳐 두었으면 곧바로 영역 싸움 (나중에 펼친 적이 밀고 들어온다)
    const pd = playerDomain(this.ctx);
    if (pd) this._startClash(pd, 'enemy');
    return true;
  }

  get active() {
    return !!this.enemy && this.enemy.state !== 'closing' && this.enemy.state !== 'broken';
  }

  /** 중첩 중: 서로의 필중 효과가 사라진다 */
  get neutral() {
    return !!this.clash && !this.clash.done;
  }

  /** 플레이어 영역의 필중이 막혔는가 (영역 싸움 중) */
  sureHitBlocked() {
    return this.neutral;
  }

  /** 플레이어 영역의 필중이 지금 먹히는가 (무하한을 뚫는다) */
  playerSureHit() {
    const pd = playerDomain(this.ctx);
    return !!pd && pd.open && !this.neutral;
  }

  _startClash(pd, responder) {
    const { ui, sfx } = this.ctx;
    const E = this.enemy;
    const gap = pd.ref - E.def.ref + (responder === 'player' ? 6 : -6);
    const overwhelm = Math.abs(gap) >= OVERWHELM;
    this.clash = { D: 0, gap, overwhelm, responder, t: 0, done: false, pd, seed: Math.random() * 6 };
    ui.manga({ main: '領域の押し合い', ruby: '영역 싸움', color: '#ffffff', big: true });
    ui.callout(overwhelm ? (gap > 0 ? '압도적인 차이 — 상대 영역을 짓누른다' : '격이 다르다 — 이대로는 밀려난다!') : '중첩 — 서로의 필중 효과가 사라졌다 · 두 손바닥으로 밀어 주력을 쏟아라', { color: '#ffffff', dur: 3 });
    sfx.play('black_flash', { vol: 0.6, rate: 0.6 });
    sfx.rumble(1.5, 0.5);
    this._ensureHud();
    this._ensureSeam();
  }

  // ───────── 매 프레임 ─────────
  update(dt) {
    const E = this.enemy;
    if (!E) return;
    const { world, env, input: inp, fx } = this.ctx;
    E.t += dt;
    E.view.u.uTime.value += dt;
    const V = E.view;
    // 시전자가 쓰러지면 영역도 무너진다
    if (E.state !== 'broken' && E.state !== 'closing' && (!E.caster.alive || E.caster.dying)) this._break('caster');
    if (E.state === 'opening') {
      const k = Math.min(1, E.t / 1.0);
      const e = 1 - Math.pow(1 - k, 3);
      V.setSize(e);
      V.u.uOpen.value = e;
      if (k > 0.35) this._takeEnv(true);
      if (k >= 1) {
        E.state = 'active';
        E.t = 0;
      }
    } else if (E.state === 'active') {
      V.setSize(1);
      V.u.uOpen.value = 1;
      this._takeEnv(true);
      if (E.t >= E.def.dur) this._close();
    } else if (E.state === 'closing') {
      const k = Math.min(1, E.t / 0.7);
      V.setSize(1 - k);
      V.u.uOpen.value = 1 - k;
      if (k >= 1) return this._end();
    } else if (E.state === 'broken') {
      // 금이 가며 산산이 부서진다
      const k = Math.min(1, E.t / 0.8);
      V.u.uCrack.value = Math.min(1, k * 3);
      V.u.uOpen.value = 1 - Math.max(0, (k - 0.4) / 0.6);
      V.setSize(1 + k * 0.08);
      if (Math.random() < 0.6) fx.burst(_v.copy(E.center).add(_v2.randomDirection().multiplyScalar(E.def.radius * 0.8)).setY(rnd(0.5, 8)), 6, new THREE.Color(E.def.color), 3, 0.08, 0.6);
      if (k >= 1) return this._end();
    }

    if (V.maw) {
      // 손이 꽃처럼 피어 흩어지며 아가리를 엮는다 · 닫힐 땐 오므라든다
      if (E.state === 'opening' || E.state === 'active') V.mawK = Math.min(1.2, V.mawK + dt / 1.6);
      else V.mawK = Math.max(0, Math.min(1, V.mawK) - dt / (E.state === 'broken' ? 0.5 : 0.7));
      V.maw.update(dt, V.mawK);
      V.maw.group.visible = V.mawK > 0.01 && !(this.clash && !this.clash.done);
    }
    // 바깥에서 결계를 치면 깨진다 (결계는 안쪽엔 강하고 바깥엔 약하다)
    if (E.state === 'active' || E.state === 'opening') this._outsideHits(dt);
    // 영역 싸움
    const pd = playerDomain(this.ctx);
    if (!this.clash && pd && this.active) this._startClash(pd, 'player');
    if (this.clash && !this.clash.done) this._tickClash(dt, pd);
    else this._hideSeam();

    // 필중: 영역 싸움이 없거나 플레이어가 밀려났으면 안에 든 플레이어에게
    const inside = Math.hypot(inp.head.x - E.center.x, inp.head.z - E.center.z) < E.def.radius * 0.98;
    if (E.state === 'active' && inside && !this.neutral && !(pd && pd.open && this.clash?.winner === 'player')) this._sureHit(dt);
    else this._clearSure(dt);
    this._updateHud();
    void world;
    void env;
  }

  /** 플레이어가 영역 바깥에 있으면 주먹으로 결계를 친다 → 금이 가다 깨진다 */
  _outsideHits(dt) {
    const E = this.enemy;
    const { input: inp, fx, sfx, ui } = this.ctx;
    E.barrier ??= 100;
    E.hitCd = Math.max(0, (E.hitCd ?? 0) - dt);
    const R = (E.view.dome?.scale.x ?? E.def.radius);
    const headD = Math.hypot(inp.head.x - E.center.x, inp.head.z - E.center.z);
    if (headD < R) return;
    for (const h of [inp.left, inp.right]) {
      if (!h.active || E.hitCd > 0 || h.speed < 2.2) continue;
      const p = h.palm;
      const d = Math.hypot(p.x - E.center.x, p.z - E.center.z);
      const r3 = Math.hypot(d, p.y - (E.center.y ?? 0)); // 반구 표면까지
      if (Math.abs(r3 - R) > 0.5 && Math.abs(d - R) > 0.5) continue;
      E.hitCd = 0.22;
      const dmg = 4 + h.speed * 1.6;
      E.barrier -= dmg;
      fx.burst(p, 18, new THREE.Color(E.def.color), 3, 0.05, 0.4);
      fx.flash(p, new THREE.Color(0xffffff), 1.2, 0.08);
      sfx.play('shatter_2', { at: p, vol: 0.6, rate: rnd(0.8, 1.1) });
      h.pulse?.(0.9, 60);
      E.view.u.uCrack.value = Math.min(0.55, (1 - E.barrier / 100) * 0.6);
      if (!E.toldOut) {
        E.toldOut = true;
        ui.callout('결계를 바깥에서 친다 — 영역은 바깥의 공격에 약하다', { color: '#ffffff', dur: 2.2 });
      }
      if (E.barrier <= 0) {
        ui.manga({ main: '結界破壊', ruby: '결계 파괴', color: '#ffffff', big: true });
        const e = E.caster;
        if (e.alive) {
          e.burnout = this.ctx.world.time + 8;
          e.stunUntil = Math.max(e.stunUntil ?? 0, this.ctx.world.time + 1.5);
        }
        this._break('outside');
        return;
      }
    }
  }

  /**
   * 영역 안에 갇힌 것은 동그란 영역 밖으로 나갈 수 없다 (플레이어 · 적) — pos 를 안쪽으로 되돌린다
   * 반환: 밀린 양
   */
  cage(pos, r, wasInside) {
    const out = _v4.set(0, 0, 0);
    const lim = (c, R) => {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const m = R - r - 0.3;
      if (d > m && d < R + 2.5) {
        out.x += (dx / d) * (m - d);
        out.z += (dz / d) * (m - d);
        pos.x = c.x + (dx / d) * m;
        pos.z = c.z + (dz / d) * m;
      }
    };
    const E = this.enemy;
    if (E && (E.state === 'active' || E.state === 'opening') && wasInside?.enemy) lim(E.center, E.def.radius);
    const pd = playerDomain(this.ctx);
    if (pd?.open && wasInside?.player) lim(pd.center, pd.radius);
    return out;
  }

  /** 지금 이 점이 영역(적 · 플레이어) 안인가 */
  insideOf(pos) {
    const E = this.enemy;
    const pd = playerDomain(this.ctx);
    return {
      enemy: !!E && (E.state === 'active' || E.state === 'opening') && Math.hypot(pos.x - E.center.x, pos.z - E.center.z) < E.def.radius - 0.2,
      player: !!pd?.open && Math.hypot(pos.x - pd.center.x, pos.z - pd.center.z) < pd.radius - 0.2,
    };
  }

  /** 배경을 숨기고 영역의 빛으로 (플레이어 영역이 열려 있으면 그쪽 조명을 둔다) */
  _takeEnv(on) {
    const env = this.ctx.env;
    const E = this.enemy;
    if (on) {
      if (!env.hidden) {
        // 플레이어 영역이 닫히며 배경·조명이 돌아왔다 → 다시 덮고 이 영역의 빛으로
        env.setHidden(true);
        E.lit = false;
      }
      if (!E.lit && !playerDomain(this.ctx)?.open) {
        E.lit = true;
        const L = E.def.lights;
        env.hemi.color.set(L.hemi);
        env.hemi.groundColor.set(L.ground);
        env.hemi.intensity = L.hemiI;
        env.sun.color.set(L.sun);
        env.sun.intensity = L.sunI;
        env.fog.color.set(L.fog);
        env.fog.near = L.fogNear;
        env.fog.far = L.fogFar;
        this.ctx.renderer.toneMappingExposure = L.exposure;
      }
    }
  }

  _tickClash(dt, pd) {
    const C = this.clash;
    const E = this.enemy;
    const { input: inp, world, fx, sfx, ui } = this.ctx;
    C.t += dt;
    // 플레이어의 영역이 먼저 닫히면(시간이 다 됐거나 해제) 그대로 밀려난 것
    if (!pd) {
      // 비등하게 버티다 끝났으면 둘 다 사그라든다
      if (C.D > -0.25) this._resolve('draw', 'expired');
      else this._resolve('enemy', 'expired');
      return;
    }
    C.pd = pd;
    // 주력 쏟기: 두 손바닥을 앞으로 밀기(손) · 두 트리거(컨트롤러) · F(데스크톱)
    const ch = this.ctx.character;
    const L = inp.left;
    const R = inp.right;
    const fwd = _v.copy(inp.headDir).setY(0).normalize();
    const palmPush = (h) => h.active && h.source === 'hand' && h.palmNormal.dot(fwd) > 0.55 && _v2.subVectors(h.palm, inp.head).dot(fwd) > 0.28 && h.gesture !== 'fist';
    const pushing = (palmPush(L) && palmPush(R)) || (L.source === 'controller' && R.source === 'controller' && L.btn.trigger && R.btn.trigger) || (inp.mode === 'desktop' && inp.keyDown('KeyF'));
    const canPush = pushing && (ch?.energy ?? 0) > 1;
    if (canPush) ch.energy = Math.max(0, ch.energy - 11 * dt);
    this.pushK += ((canPush ? 1 : 0) - this.pushK) * Math.min(1, dt * 5);
    if (canPush && Math.random() < 0.4) {
      L.pulse?.(0.25, 20);
      R.pulse?.(0.25, 20);
    }
    // 상태: 주력이 남은 정도 · 적의 체력
    const ef = ch?.maxEnergy ? ch.energy / ch.maxEnergy : 0.5;
    const hf = E.caster.maxHp && Number.isFinite(E.caster.maxHp) ? clamp(E.caster.hp / E.caster.maxHp, 0, 1) : 1;
    const eff = C.gap + (ef - 0.5) * 6 - (hf - 0.5) * 10 + this.pushK * 22 - (E.caster.enemyPush ?? 0);
    // 격돌: 1~2.5초마다 한쪽이 몰아친다 → 경계가 크게 출렁이고 번쩍이며 땅이 울린다
    C.surgeT = (C.surgeT ?? 1.2) - dt;
    if (C.surgeT <= 0) {
      C.surgeT = rnd(0.9, 2.2);
      const mine = Math.random() < 0.5 + clamp(eff, -30, 30) / 110 + this.pushK * 0.18;
      C.D = clamp(C.D + (mine ? 1 : -1) * rnd(0.05, 0.16), -1, 1);
      C.surges = (C.surges ?? 0) + 1;
      C.last = mine ? 'mine' : 'theirs';
      C.lastT = 0;
      C.amp = 4.5;
      C.flashK = 1;
      C.flashCol = mine ? pd.color : E.def.color;
      sfx.play('black_flash', { vol: 0.45, rate: rnd(0.45, 0.65) });
      sfx.rumble(0.6, 0.45);
      inp.left.pulse?.(0.6, 80);
      inp.right.pulse?.(0.6, 80);
      ui.callout(mine ? '밀어붙였다!' : '밀린다!', { color: mine ? '#c8ffd8' : '#ffb0b0', size: 40, dur: 0.6 });
    }
    let rate;
    // 격의 차이는 흐름을 기울일 뿐 — 흔들림(운)과 쏟는 주력으로 뒤집힐 수 있다
    if (C.overwhelm) rate = Math.sign(C.gap) * 0.32 + this.pushK * 0.12 * -Math.sign(C.gap) * (C.gap < 0 ? 1 : 0);
    else rate = eff * 0.0075 + Math.sin(C.t * 1.7 + C.seed) * 0.05 + Math.sin(C.t * 4.3) * 0.03;
    C.D = clamp(C.D + rate * dt, -1, 1);
    // 경계: 두 중심 (D>0 이면 경계가 적 쪽으로 밀려간다). 중심이 겹치면 플레이어 → 적 방향으로 벌린다
    const pc = _v2.copy(pd.center);
    const ec = _v3.copy(E.center);
    if (pc.distanceTo(ec) < 4) {
      const d = _v.subVectors(E.caster.root.position, inp.head).setY(0);
      if (d.lengthSq() < 1e-3) d.set(0, 0, -1);
      d.normalize();
      const m = _v4.addVectors(pc, ec).multiplyScalar(0.5);
      pc.copy(m).addScaledVector(d, -2);
      ec.copy(m).addScaledVector(d, 2);
    }
    const Lc = Math.hypot(ec.x - pc.x, ec.z - pc.z);
    // 반지름이 큰 쪽이 기본으로 조금 더 넓다 + 우세만큼 밀린다
    let bias = (pd.radius - E.def.radius) * 0.3 + C.D * Lc * 0.9;
    CLASH_U.uClashP.value.set(pc.x, 0, pc.z, bias);
    CLASH_U.uClashE.value.set(ec.x, 0, ec.z, 1);
    // 플레이어는 늘 내 영역 안에 (머리가 경계 1.5m 안쪽에 있게)
    const hs = clashSideJS(inp.head);
    if (hs > -1.5) {
      bias += hs + 1.5;
      CLASH_U.uClashP.value.w = bias;
    }
    CLASH_U.uClashOn.value = 1;
    CLASH_U.uClashT.value += dt * (1 + this.pushK);
    C.amp = Math.max(1.2, (C.amp ?? 1.2) - dt * 4);
    CLASH_U.uClashAmp.value = C.amp + this.pushK * 0.8;
    CLASH_U.uClashColP.value.set(pd.color);
    CLASH_U.uClashColE.value.set(E.def.color);
    // 경계를 따라 불똥: 플레이어 중심에서 바깥으로 경계를 찾아 튀긴다
    const PC = pc.clone();
    const EC = ec.clone();
    const sparks = 2 + Math.floor(this.pushK * 3 + (C.flashK ?? 0) * 6);
    for (let i = 0; i < sparks; i++) {
      const ang = Math.atan2(EC.x - PC.x, EC.z - PC.z) + rnd(-1.1, 1.1);
      const dir = _v.set(Math.sin(ang), 0, Math.cos(ang));
      let lo = 0.3;
      let hi = 45;
      if (clashSideJS(_v2.copy(PC).addScaledVector(dir, hi)) < 0) continue;
      for (let it = 0; it < 12; it++) {
        const m = (lo + hi) / 2;
        if (clashSideJS(_v2.copy(PC).addScaledVector(dir, m)) > 0) hi = m;
        else lo = m;
      }
      const at = _v3.copy(PC).addScaledVector(dir, hi).setY(rnd(0.2, 7));
      fx.burst(at, 3, new THREE.Color(Math.random() < 0.4 ? '#ffffff' : Math.random() < 0.5 ? pd.color : E.def.color), 2.5, 0.05, 0.45);
    }
    if (C.flashK > 0) {
      C.flashK = Math.max(0, C.flashK - dt * 3);
      if (C.flashK > 0.7) fx.flash(inp.head, new THREE.Color(C.flashCol), 3, 0.15);
    }
    if (Math.random() < dt * 2.5) sfx.play('zap', { at: inp.head, vol: 0.25 + this.pushK * 0.2, rate: rnd(0.5, 1) });
    if (C.D >= 1) this._resolve('player', 'pushed');
    else if (C.D <= -1) this._resolve('enemy', 'pushed');
    void world;
    void ui;
  }

  _resolve(winner, why) {
    const C = this.clash;
    const E = this.enemy;
    const { ui, sfx, world, fx } = this.ctx;
    C.done = true;
    C.winner = winner;
    this._hideSeam();
    CLASH_U.uClashOn.value = 0;
    if (winner === 'player') {
      ui.manga({ main: '押し勝ち', ruby: '영역을 밀어냈다', color: '#ffffff', big: true });
      ui.callout(`${E.def.label} 붕괴 — 술식이 타 버렸다 · 필중이 다시 먹힌다`, { color: '#a0ffc0', dur: 3 });
      const e = E.caster;
      if (e.alive) {
        e.burnout = world.time + 10;
        e.stunUntil = Math.max(e.stunUntil ?? 0, world.time + 2.5);
        e.damage(e.maxHp && Number.isFinite(e.maxHp) ? e.maxHp * 0.15 : 60, { type: 'impact', color: '#ffffff' });
      }
      this._break('clash');
    } else if (winner === 'draw') {
      ui.callout('두 영역이 함께 사그라들었다', { color: '#ffffff', dur: 2.5 });
      this._close();
    } else {
      // 플레이어 영역이 밀려나 깨진다 → 필중을 그대로 맞는다
      if (why === 'pushed') {
        ui.manga({ main: '押し負け', ruby: '영역이 밀려났다', color: '#ff8080', big: true });
        ui.callout('영역이 밀려났다 — 필중을 맞는다!', { color: '#ff9090', dur: 3 });
        this.ctx.character?.cancelDomain?.();
        world.hitPlayer(38, { type: 'domain', src: E.caster });
        fx.flash(this.ctx.input.head, new THREE.Color(E.def.color), 8, 0.4);
        sfx.play('shatter', { vol: 0.9, rate: 0.7 });
      } else ui.callout('내 영역이 먼저 닫혔다 — 상대 영역만 남았다', { color: '#ffb0b0', dur: 2.5 });
      this.sure.t = 0.6;
    }
  }


  // ───────── 필중 효과 (플레이어) ─────────
  _sureHit(dt) {
    const E = this.enemy;
    const S = this.sure;
    const { world, ui, fx, input: inp } = this.ctx;
    const P = world.player;
    S.t -= dt;
    if (E.def.type === 0) {
      // 무위전변: 영혼에 손이 닿는다
      if (S.t <= 0) {
        S.t = 2.2;
        if (!S.told) {
          S.told = true;
          ui.callout('필중 — 무위전변이 영혼을 만진다 (맞영역으로 막아라)', { color: '#a8e8ff', dur: 2.5 });
        }
        world.hitPlayer(16, { type: 'soul', src: E.caster });
        fx.burst(inp.head.clone().add(_v.set(0, -0.3, 0)), 20, new THREE.Color(0x9ad8ff), 2, 0.04, 0.5);
      }
    } else if (E.def.type === 1) {
      // 개관철위산: 들어온 것은 모두 탄다
      if (S.t <= 0) {
        S.t = 0.5;
        if (!S.told) {
          S.told = true;
          ui.callout('필중 — 몸이 타들어 간다 (맞영역으로 막아라)', { color: '#ffb080', dur: 2.5 });
        }
        world.hitPlayer(3.5, { type: 'fire', src: E.caster });
      }
      if (Math.random() < 0.5) fx.fire?.flame?.(_v.copy(inp.head).add(_v2.set(rnd(-0.5, 0.5), -1.2, rnd(-0.5, 0.5))), _v3.set(0, 2, 0), { size0: 0.2, size1: 0.6, life: 0.5 });
    } else if (E.def.type === 3) {
      // 불완전한 영역: 사방의 벽에서 주력이 불규칙하게 터져 나온다 (필중이 엉성해 약하다)
      if (S.t <= 0) {
        S.t = rnd(0.9, 1.6);
        if (!S.told) {
          S.told = true;
          ui.callout('필중(불완전) — 사방에서 주력이 터진다 (맞영역으로 막아라)', { color: '#ffe0a0', dur: 2.5 });
        }
        const p = inp.head.clone().add(_v.set(rnd(-0.6, 0.6), rnd(-0.6, 0.2), rnd(-0.6, 0.6)));
        fx.burst(p, 16, new THREE.Color(0xc02040), 3, 0.05, 0.35);
        world.hitPlayer(5, { type: 'energy', src: E.caster });
      }
    } else {
      // 무량공처: 끝없는 정보가 쏟아져 몸이 굳는다 (굳었다 → 잠깐 풀림 → 다시)
      if (S.para > 0) {
        S.para -= dt;
        P.paralyzed = true;
        if (S.para <= 0) {
          S.window = 1.8;
          P.paralyzed = false;
        }
      } else if (S.window > 0) {
        S.window -= dt;
        P.paralyzed = false;
      } else {
        S.para = 2.3;
        P.paralyzed = true;
        world.hitPlayer(6, { type: 'void', src: E.caster });
        if (!S.told) {
          S.told = true;
          ui.callout('필중 — 무한한 정보가 쏟아진다! 풀린 틈에 영역을 펼쳐라', { color: '#c0e0ff', dur: 3 });
        }
      }
      this._overloadFx(dt, S.para > 0 ? 1 : 0.15);
      return;
    }
    this._overloadFx(dt, 0);
  }

  _clearSure(dt) {
    this.ctx.world.player.paralyzed = false;
    this.sure.para = 0;
    this._overloadFx(dt, 0);
  }

  _overloadFx(dt, want) {
    if (!this.overload && want <= 0) return;
    if (!this.overload) {
      const u = { uTime: { value: 0 }, uK: { value: 0 } };
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), new THREE.ShaderMaterial({ uniforms: u, vertexShader: DOME_VERT, fragmentShader: OVERLOAD_FRAG, side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = 999;
      m.frustumCulled = false;
      this.ctx.camera.add(m);
      this.overload = { m, u };
    }
    const O = this.overload;
    O.u.uTime.value += dt;
    O.u.uK.value += (want - O.u.uK.value) * Math.min(1, dt * 8);
    O.m.visible = O.u.uK.value > 0.01;
  }

  // ───────── 경계막 ─────────
  _ensureSeam() {
    if (this.seam) return;
    const u = { uTime: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uK: { value: 0 } };
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.ShaderMaterial({ uniforms: u, vertexShader: DOME_VERT, fragmentShader: SEAM_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    m.frustumCulled = false;
    m.renderOrder = 5;
    this.ctx.scene.add(m);
    this.seam = { m, u };
  }

  _placeSeam(p, n, r, C) {
    this._ensureSeam();
    const S = this.seam;
    S.m.visible = true;
    S.m.position.copy(p).setY(0);
    S.m.quaternion.setFromUnitVectors(_v3.set(0, 0, 1), n);
    S.m.scale.setScalar(r);
    S.u.uTime.value += 1 / 60;
    S.u.uA.value.set(C.pd?.color ?? '#ffffff');
    S.u.uB.value.set(this.enemy.def.color);
    S.u.uK.value = 0.45 + 0.3 * Math.abs(Math.sin(C.t * 9));
  }

  _hideSeam() {
    if (this.seam) this.seam.m.visible = false;
  }

  // ───────── 영역 싸움 막대 (머리 앞) ─────────
  _ensureHud() {
    if (this.hud) return;
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.19), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    m.position.set(0, 0.2, -0.75);
    m.renderOrder = 998;
    this.ctx.camera.add(m);
    // 밀릴 때 시야 가장자리가 붉게 조여 온다
    const vg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 }, uCol: { value: new THREE.Color(0xff2020) }, uT: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uK; uniform vec3 uCol; uniform float uT; varying vec2 vUv; void main(){ vec2 q = vUv - 0.5; float r = length(q * vec2(1.0, 1.35)); float a = smoothstep(0.28, 0.62, r) * uK * (0.8 + 0.2 * sin(uT * 9.0)); gl_FragColor = vec4(uCol, a * 0.55); }',
      transparent: true, depthTest: false, depthWrite: false,
    }));
    vg.position.set(0, 0, -0.6);
    vg.renderOrder = 997;
    this.ctx.camera.add(vg);
    this.hud = { c, g: c.getContext('2d'), tex, m, vg, last: 0, t: 0, shake: 0 };
  }

  _updateHud() {
    const H = this.hud;
    if (!H) return;
    const C = this.clash;
    const on = !!C && !C.done && !!this.enemy;
    H.m.visible = on;
    H.vg.visible = on;
    if (!on) return;
    const dt = 1 / 72;
    H.t += dt;
    C.lastT = (C.lastT ?? 9) + dt;
    // 밀리는 정도 → 붉은 테두리 · 격돌 순간엔 HUD가 떨린다
    const lose = clamp(-C.D * 1.6 - 0.2, 0, 1);
    H.vg.material.uniforms.uK.value = Math.max(lose, C.lastT < 0.25 && C.last === 'theirs' ? 0.8 : 0);
    H.vg.material.uniforms.uT.value = H.t;
    H.vg.material.uniforms.uCol.value.set(C.lastT < 0.25 && C.last === 'mine' ? C.pd?.color ?? '#ffffff' : this.enemy.def.color);
    const sh = C.lastT < 0.3 ? (0.3 - C.lastT) * 0.03 : 0;
    H.m.position.set((Math.random() - 0.5) * sh, 0.2 + (Math.random() - 0.5) * sh, -0.75);
    // 그리기는 초당 30번
    if (H.t - H.last < 1 / 30) return;
    H.last = H.t;
    const g = H.g;
    const W = 1024;
    const HH = 256;
    g.clearRect(0, 0, W, HH);
    const mine = C.pd?.color ?? '#9fb2ff';
    const theirs = this.enemy.def.color;
    // 바탕: 먹색 띠 + 위아래 가는 금선
    const bg = g.createLinearGradient(0, 0, 0, HH);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(0.25, 'rgba(6,6,10,0.82)');
    bg.addColorStop(0.75, 'rgba(6,6,10,0.82)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, HH);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(60, 64, W - 120, 1.5);
    g.fillRect(60, 192, W - 120, 1.5);
    // 가운데 제목
    g.textAlign = 'center';
    g.font = "900 30px 'Noto Serif JP', serif";
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText('領 域 の 押 し 合 い', W / 2, 50);
    // 이름 (내 영역 왼쪽 · 상대 오른쪽)
    g.font = "900 40px 'Noto Serif JP', 'Noto Sans KR', serif";
    g.textAlign = 'left';
    g.shadowColor = mine;
    g.shadowBlur = 18;
    g.fillStyle = '#ffffff';
    g.fillText(C.pd?.name ?? '', 64, 108);
    g.textAlign = 'right';
    g.shadowColor = theirs;
    g.fillText(this.enemy.def.name, W - 64, 108);
    g.shadowBlur = 0;
    // 줄다리기 막대: 비스듬히 잘린 두 색이 맞물리고, 이음매는 지지직
    const x0 = 64;
    const w = W - 128;
    const y = 128;
    const h = 34;
    const mid = x0 + w * (0.5 + C.D * 0.5);
    const grad1 = g.createLinearGradient(x0, 0, mid, 0);
    grad1.addColorStop(0, 'rgba(255,255,255,0.05)');
    grad1.addColorStop(1, mine);
    const grad2 = g.createLinearGradient(mid, 0, x0 + w, 0);
    grad2.addColorStop(0, theirs);
    grad2.addColorStop(1, 'rgba(255,255,255,0.05)');
    g.fillStyle = grad1;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(mid + 10, y);
    g.lineTo(mid - 10, y + h);
    g.lineTo(x0, y + h);
    g.fill();
    g.fillStyle = grad2;
    g.beginPath();
    g.moveTo(mid + 10, y);
    g.lineTo(x0 + w, y);
    g.lineTo(x0 + w, y + h);
    g.lineTo(mid - 10, y + h);
    g.fill();
    // 눈금 (중앙 · 4분)
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (const f of [0.25, 0.5, 0.75]) g.fillRect(x0 + w * f - 1, y - 6, 2, h + 12);
    // 이음매 번개
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.shadowColor = '#ffffff';
    g.shadowBlur = 16;
    g.beginPath();
    let yy = y - 10;
    g.moveTo(mid + (Math.random() - 0.5) * 10, yy);
    while (yy < y + h + 10) {
      yy += 8;
      g.lineTo(mid + (Math.random() - 0.5) * (10 + this.pushK * 14), yy);
    }
    g.stroke();
    g.shadowBlur = 0;
    // 아래: 형세 · 주력 · 상태
    const pct = Math.round(50 + C.D * 50);
    g.font = "800 26px 'Noto Sans KR', sans-serif";
    g.textAlign = 'left';
    g.fillStyle = mine;
    g.fillText(`${pct}%`, 64, 200 + 16 - 16);
    g.textAlign = 'right';
    g.fillStyle = theirs;
    g.fillText(`${100 - pct}%`, W - 64, 200);
    g.textAlign = 'center';
    const msg = C.lastT < 0.6 ? (C.last === 'mine' ? '— 밀어붙였다 —' : '— 밀린다 —') : C.overwhelm ? (C.gap > 0 ? '격이 다르다 · 짓누른다' : '격이 다르다 · 주력을 쏟아 버텨라') : this.pushK > 0.3 ? '주력을 쏟는 중' : lose > 0.3 ? '두 손바닥을 앞으로 — 주력을 쏟아라' : '중첩 · 필중 상쇄';
    g.fillStyle = C.lastT < 0.6 ? (C.last === 'mine' ? '#c8ffd8' : '#ffb0b0') : 'rgba(255,255,255,0.85)';
    g.fillText(msg, W / 2, 200);
    // 주력 게이지 (가운데 아래 가는 줄)
    const ch = this.ctx.character;
    const ef = ch?.maxEnergy ? clamp(ch.energy / ch.maxEnergy, 0, 1) : 0;
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(W / 2 - 160, 214, 320, 6);
    g.fillStyle = ef < 0.2 ? '#ff6060' : '#9fe0ff';
    g.fillRect(W / 2 - 160, 214, 320 * ef, 6);
    H.tex.needsUpdate = true;
  }

  // ───────── 끝내기 ─────────
  _break(why) {
    const E = this.enemy;
    if (!E || E.state === 'broken') return;
    E.state = 'broken';
    E.t = 0;
    this.ctx.sfx.play('shatter', { vol: 1, rate: 0.6 });
    this.ctx.sfx.rumble(1.2, 0.5);
    if (why === 'caster') this.ctx.ui.callout(`시전자가 쓰러져 ${E.def.label}이(가) 무너진다`, { color: '#ffffff', dur: 2 });
    if (why === 'outside') this.ctx.ui.callout(`${E.def.label} — 바깥에서 결계가 깨졌다 (시전자의 술식이 타 버렸다)`, { color: '#ffffff', dur: 2.5 });
  }

  _close() {
    const E = this.enemy;
    E.state = 'closing';
    E.t = 0;
  }

  /** 적 영역을 완전히 치운다 (배경을 되돌린다) */
  _end() {
    const E = this.enemy;
    if (!E) return;
    E.view.dispose();
    this.enemy = null;
    CLASH_U.uClashOn.value = 0;
    this.clash = null;
    this._hideSeam();
    this._clearSure(0);
    if (this.overload) this.overload.m.visible = false;
    if (this.hud) this.hud.m.visible = this.hud.vg.visible = false;
    // 플레이어 영역이 열려 있지 않으면 배경·조명을 되돌린다
    const pd = playerDomain(this.ctx);
    if (!pd) {
      const env = this.ctx.env;
      env.setHidden(false);
      env.restore();
      env.applyShadows();
    }
  }

  /** 배경 전환 · 캐릭터 교체 · 적 정리 */
  reset() {
    CLASH_U.uClashOn.value = 0;
    if (this.enemy) {
      this.enemy.view.dispose();
      this.enemy = null;
    }
    this.clash = null;
    this._hideSeam();
    this.ctx.world.player.paralyzed = false;
    if (this.overload) this.overload.m.visible = false;
    if (this.hud) this.hud.m.visible = false;
  }
}
