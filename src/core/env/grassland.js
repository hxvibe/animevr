// 넓은 초원 (사실적으로): 바람에 물결치는 풀잎 수만 장 · 들꽃 · 완만한 언덕 · 흩어진 나무 · 먼 산 · 구름 낀 하늘
//  싸우는 곳(반지름 약 45m)은 평평하고, 그 바깥으로 언덕이 솟는다. 1 유닛 = 1m.
import * as THREE from 'three';
import * as R from './realism.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PLAY = 45; // 평평한 싸움터 반지름
const rnd = () => R.rnd();

// ── 땅 높이: 싸움터는 0, 바깥은 완만한 언덕 ──
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < 5; i++) {
    s += a * vnoise(x, y);
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.3;
    a *= 0.5;
  }
  return s;
}
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const k = THREE.MathUtils.smoothstep(r, PLAY, PLAY + 40);
  const hills = (fbm(x * 0.012, z * 0.012) - 0.35) * 26 + (fbm(x * 0.05 + 3, z * 0.05) - 0.5) * 3;
  // 아주 작은 기복 (싸움터 안은 3cm 이내)
  const micro = (vnoise(x * 0.3, z * 0.3) - 0.5) * 0.04;
  return Math.max(0, hills) * k + micro * (1 - k);
}

// ── 땅 재질: 흙 + 짧은 풀 (월드 좌표로 섞어 반복이 안 보이게) ──
function soilSet() {
  return R.bake('meadowSoil', 512, (() => {
    R.seed(61);
    const N = 512;
    const big = R.makeFbm(N, 4, 4);
    const fine = R.makeFbm(N, 96, 3);
    const blades = R.makeFbm(N, 220, 2);
    return (x, y, o) => {
      const b = big(x, y);
      const f = fine(x, y);
      const g = blades(x, y);
      // 마른 풀 · 푸른 풀 · 흙이 섞인 바닥
      const dry = Math.max(0, Math.min(1, (b - 0.45) * 3));
      const soil = f < 0.32 ? (0.32 - f) * 2.5 : 0;
      let r = 0.16 + dry * 0.16;
      let gg = 0.27 + dry * 0.1;
      let bl = 0.08 + dry * 0.02;
      const k = 0.75 + g * 0.5;
      r = (r * (1 - soil) + 0.24 * soil) * k;
      gg = (gg * (1 - soil) + 0.18 * soil) * k;
      bl = (bl * (1 - soil) + 0.1 * soil) * k;
      o[0] = r;
      o[1] = gg;
      o[2] = bl;
      o[3] = g * 0.6 + f * 0.4;
      o[4] = 0.95;
    };
  })(), { normal: 2 });
}

// ── 풀잎: 휘어진 가는 잎 (아래가 짙고 끝이 밝다) · 바람에 흔들리는 셰이더 ──
function bladeGeo(h = 1, w = 0.05, segs = 4) {
  const pos = [];
  const col = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = t * h;
    const ww = w * (1 - t * 0.92);
    const bend = t * t * 0.25 * h;
    pos.push(-ww / 2, y, bend, ww / 2, y, bend);
    const c = 0.35 + t * 0.65;
    col.push(c, c, c, c, c, c);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  // 법선은 위쪽으로 (풀밭이 부드럽게 빛나게)
  const n = [];
  for (let i = 0; i < pos.length / 3; i++) n.push(0, 1, 0.25);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return g;
}

const WIND = { value: 0 };
function windMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75, metalness: 0, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = WIND;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
uniform float uWind;
float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
  vec3 root = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#endif
  // 큰 돌풍이 풀밭을 쓸고 지나가는 물결 + 잔떨림
  float gust = gn(root.xz * 0.06 + vec2(uWind * 0.35, uWind * 0.12));
  float flutter = sin(uWind * 6.0 + root.x * 1.7 + root.z * 1.3) * 0.08;
  float k = position.y * position.y;
  transformed.x += (gust * 0.55 + flutter) * k;
  transformed.z += (gust * 0.25 + flutter * 0.5) * k;
  transformed.y -= gust * 0.12 * k;`);
  };
  m.customProgramCacheKey = () => 'wind';
  return m;
}

/** 나무 한 그루 (줄기 + 가지 + 잎 덩어리) — 기하를 모아 반환 */
function treeGeos(x, z, s) {
  const trunk = [];
  const leaf = [];
  const y0 = groundHeight(x, z) - 0.2;
  const h = 4.5 * s;
  trunk.push(new THREE.CylinderGeometry(0.16 * s, 0.32 * s, h, 8).translate(x, y0 + h / 2, z));
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    const b = new THREE.CylinderGeometry(0.05 * s, 0.11 * s, 2.2 * s, 6).translate(0, 1.1 * s, 0).rotateZ(0.7 + rnd() * 0.3).rotateY(a).translate(x, y0 + h * (0.55 + rnd() * 0.3), z);
    trunk.push(b);
  }
  // 잎: 작은 덩이 여럿이 겹친 수관 (아래 · 안쪽은 그늘져 어둡고 위는 볕을 받아 밝다)
  const crownY = y0 + h + 0.6 * s;
  for (let i = 0; i < 16; i++) {
    const r = (0.8 + rnd() * 0.8) * s;
    const g = new THREE.IcosahedronGeometry(r, 2);
    const p = g.attributes.position;
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * 2.6 * s;
    const cx = x + Math.cos(a) * rr;
    const cy = crownY + (rnd() - 0.35) * 2.2 * s;
    const cz = z + Math.sin(a) * rr;
    const col = [];
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, k);
      const nz = 0.72 + vnoise(v.x * 3 + i * 1.7, v.y * 3 + v.z * 2) * 0.5;
      v.multiplyScalar(nz);
      v.y *= 0.82;
      p.setXYZ(k, v.x, v.y, v.z);
      const wy = cy + v.y;
      const sun = THREE.MathUtils.clamp((wy - (crownY - 2 * s)) / (4 * s), 0, 1);
      const out = THREE.MathUtils.clamp(Math.hypot(cx + v.x - x, cz + v.z - z) / (3.2 * s), 0, 1);
      const k2 = 0.45 + sun * 0.45 + out * 0.2 + (vnoise(v.x * 9, v.z * 9 + i) - 0.5) * 0.25;
      col.push(0.2 * k2, 0.36 * k2, 0.14 * k2);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.translate(cx, cy, cz);
    leaf.push(g);
  }
  return { trunk, leaf };
}

export function buildGrassland(ctx) {
  R.seed(88);
  const group = new THREE.Group();
  const SIZE = 700;

  // ── 땅 ──
  const segs = 180;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, segs, segs).rotateX(-Math.PI / 2);
  const p = tg.attributes.position;
  const uv = tg.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, groundHeight(x, z));
    uv.setXY(i, x / 3, -z / 3);
  }
  tg.computeVertexNormals();
  const soil = soilSet();
  const groundMat = new THREE.MeshStandardMaterial({ map: soil.map, normalMap: soil.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, color: 0xd8e0c8 });
  // 넓게 보면 색이 고르지 않게 (월드 좌표 잡음으로 짙은 풀 · 마른 풀 얼룩)
  groundMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGW;
float mh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mh(i), mh(i + vec2(1.0, 0.0)), f.x), mix(mh(i + vec2(0.0, 1.0)), mh(i + vec2(1.0, 1.0)), f.x), f.y); }
float mf(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * mn(p); p = p * 2.1 + 3.1; a *= 0.5; } return s; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float patchD = mf(vGW.xz * 0.03);
float patchL = mf(vGW.xz * 0.11 + 7.0);
diffuseColor.rgb *= mix(vec3(0.82, 0.95, 0.78), vec3(1.15, 1.08, 0.82), smoothstep(0.35, 0.7, patchD));
diffuseColor.rgb *= 0.85 + 0.3 * patchL;`);
  };
  const ground = new THREE.Mesh(tg, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // ── 풀잎: 가까운 곳은 촘촘히 (반지름 32m), 그 바깥은 성기게 큰 덤불 ──
  const blade = bladeGeo(1, 0.045, 4);
  const grassMat = windMaterial();
  const isQuest = /OculusBrowser|Quest/i.test(navigator.userAgent);
  const NEAR = isQuest ? 26000 : 52000;
  const near = new THREE.InstancedMesh(blade, grassMat, NEAR);
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();
  const P = new THREE.Vector3();
  const E = new THREE.Euler();
  const C = new THREE.Color();
  let n = 0;
  while (n < NEAR) {
    // 가운데로 갈수록 촘촘 (제곱근 분포를 조금 당긴다)
    const r = Math.pow(rnd(), 0.62) * 34;
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r + 2;
    // 군데군데 풀이 짧거나 듬성한 곳
    const dens = vnoise(x * 0.18 + 4, z * 0.18);
    if (dens < 0.3 && rnd() < 0.7) continue;
    const h = (0.22 + rnd() * 0.38) * (0.6 + dens * 0.8);
    P.set(x, groundHeight(x, z), z);
    E.set((rnd() - 0.5) * 0.35, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.35);
    Q.setFromEuler(E);
    S.set(0.7 + rnd() * 0.6, h, 1);
    M.compose(P, Q, S);
    near.setMatrixAt(n, M);
    const dry = vnoise(x * 0.07, z * 0.07);
    C.setRGB(0.2 + dry * 0.22 + rnd() * 0.05, 0.42 + dry * 0.1 + rnd() * 0.08, 0.08 + rnd() * 0.04);
    near.setColorAt(n, C);
    n++;
  }
  near.frustumCulled = false;
  near.receiveShadow = true;
  group.add(near);
  // 바깥: 큰 풀포기 (잎 여러 장을 한 덩이로)
  const tuftParts = [];
  for (let i = 0; i < 7; i++) {
    const g = bladeGeo(1, 0.06, 3);
    g.rotateY((i / 7) * Math.PI * 2).rotateX(0.18).translate(Math.cos(i) * 0.08, 0, Math.sin(i) * 0.08);
    tuftParts.push(g);
  }
  const tuft = mergeGeometries(tuftParts);
  const FAR = isQuest ? 5000 : 11000;
  const far = new THREE.InstancedMesh(tuft, grassMat, FAR);
  n = 0;
  while (n < FAR) {
    const r = 30 + Math.pow(rnd(), 0.8) * 120;
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    P.set(x, groundHeight(x, z) - 0.02, z);
    Q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * 6.28);
    const s = 0.5 + rnd() * 0.6;
    S.set(s * 1.6, s * (0.6 + rnd() * 0.5), s * 1.6);
    M.compose(P, Q, S);
    far.setMatrixAt(n, M);
    const dry = vnoise(x * 0.07, z * 0.07);
    C.setRGB(0.22 + dry * 0.25, 0.4 + dry * 0.08, 0.1);
    far.setColorAt(n, C);
    n++;
  }
  far.frustumCulled = false;
  group.add(far);

  // ── 들꽃: 흰 · 노랑 · 보라 작은 꽃 ──
  const flowerGeo = new THREE.IcosahedronGeometry(0.035, 0).scale(1, 0.55, 1);
  const flowerMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const NF = 1800;
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, NF);
  const fcols = [0xf6f4ea, 0xf2d43a, 0xb48ae0, 0xf6f4ea, 0xe8e070];
  for (let i = 0; i < NF; i++) {
    // 무리지어 핀다
    const cx = (vnoise(i * 0.37, 1) - 0.5) * 60;
    const cz = (vnoise(2, i * 0.41) - 0.5) * 60;
    const x = cx + (rnd() - 0.5) * 5;
    const z = cz + (rnd() - 0.5) * 5;
    P.set(x, groundHeight(x, z) + 0.25 + rnd() * 0.25, z);
    M.compose(P, Q.identity(), S.setScalar(0.7 + rnd() * 0.7));
    flowers.setMatrixAt(i, M);
    flowers.setColorAt(i, C.setHex(fcols[i % fcols.length]));
  }
  group.add(flowers);

  // ── 나무: 싸움터 바깥 듬성듬성 · 몇 그루는 숲처럼 모여 ──
  const trunks = [];
  const leaves = [];
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 55 + rnd() * 150;
    spots.push([Math.cos(a) * r, Math.sin(a) * r, 0.9 + rnd() * 0.7]);
  }
  // 작은 숲 두 곳
  for (const [fx, fz] of [[-90, -110], [120, -60]]) for (let i = 0; i < 12; i++) spots.push([fx + (rnd() - 0.5) * 30, fz + (rnd() - 0.5) * 30, 0.8 + rnd() * 0.8]);
  // 싸움터 가장자리의 큰 나무 한 그루 (그늘)
  spots.push([-28, -30, 1.7]);
  for (const [x, z, s] of spots) {
    const t = treeGeos(x, z, s);
    trunks.push(...t.trunk);
    leaves.push(...t.leaf);
  }
  const strip = (gs) => gs.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') x.deleteAttribute(k);
    return x;
  });
  const bark = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 });
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const tm = new THREE.Mesh(mergeGeometries(strip(trunks)), bark);
  const lm = new THREE.Mesh(mergeGeometries(strip(leaves)), foliage);
  tm.castShadow = lm.castShadow = true;
  tm.receiveShadow = lm.receiveShadow = true;
  group.add(tm, lm);

  // ── 먼 산: 지평선을 두른 푸르스름한 능선 (안개에 잠긴다) ──
  const ridge = [];
  for (let layer = 0; layer < 2; layer++) {
    const Rr = 320 + layer * 40;
    const g = new THREE.CylinderGeometry(Rr, Rr, 1, 160, 6, true);
    const gp = g.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i);
      const z = gp.getZ(i);
      const yN = gp.getY(i) + 0.5; // 0~1
      const a = Math.atan2(z, x);
      const hgt = (18 + fbm(Math.cos(a) * 3 + layer * 7, Math.sin(a) * 3) * 60 * (1 + layer * 0.6));
      gp.setY(i, yN * hgt - 2);
    }
    g.computeVertexNormals();
    ridge.push(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: layer ? 0x7f95a8 : 0x6a8268, roughness: 1, side: THREE.BackSide })));
  }
  group.add(...ridge);

  // ── 하늘 + 구름 ──
  const sky = R.physicalSky({ elevation: 38, azimuth: 205, turbidity: 3.2, rayleigh: 1.3, mie: 0.004, mieG: 0.82 });
  const skyGroup = new THREE.Group();
  skyGroup.add(sky);
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { uT: WIND, uSun: { value: sky.userData.sunDir.clone() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform float uT; uniform vec3 uSun; varying vec3 vD;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
float fb(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * n(p); p = p * 2.02 + 1.3; a *= 0.5; } return s; }
void main() {
  if (vD.y < 0.0) discard;
  vec2 uv = vD.xz / (vD.y + 0.12) * 1.6 + vec2(uT * 0.004, uT * 0.0015);
  float c = fb(uv);
  float cov = smoothstep(0.48, 0.78, c);
  float thick = smoothstep(0.55, 0.95, c);
  float sunF = pow(max(0.0, dot(vD, normalize(uSun))), 6.0);
  vec3 col = mix(vec3(1.0), vec3(0.62, 0.66, 0.74), thick * 0.8) + vec3(1.0, 0.9, 0.75) * sunF * 0.4;
  float a = cov * smoothstep(0.0, 0.18, vD.y) * 0.95;
  gl_FragColor = vec4(col, a);
}`,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(390, 48, 24), cloudMat);
  clouds.renderOrder = -9;
  clouds.frustumCulled = false;
  skyGroup.add(clouds);

  return {
    id: 'grassland',
    bright: true,
    group,
    sky: skyGroup,
    fog: { color: 0xbfd0de, near: 70, far: 520 },
    hemi: { sky: 0xcfe2ff, ground: 0x5a6a3a, intensity: 1.05 },
    sun: { color: 0xfff2dc, intensity: 2.6, pos: sky.userData.sunDir.clone().multiplyScalar(100).toArray() },
    exposure: 0.9,
    capture: true,
    shadows: true,
    bounds: { minX: -PLAY, maxX: PLAY, minZ: -PLAY, maxZ: PLAY },
    colliders: [{ minX: -28.45, maxX: -27.55, minZ: -30.45, maxZ: -29.55, minY: 0, maxY: 8 }], // 가장자리 큰 나무 줄기
    spawn: new THREE.Vector3(0, 0, 1),
    update(dt) {
      WIND.value += dt;
    },
  };
}
