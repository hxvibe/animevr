// 사실적인 배경을 위한 공용 도구
//  · 코드로 만드는 PBR 텍스처 (색 + 높이에서 뽑은 법선 + 거칠기 [+ 발광])
//  · 층/칸 단위 UV를 가진 건물 상자 → 같은 재질끼리 합쳐 드로우콜을 줄인다
//  · 간판 아틀라스 (일본어 간판을 한 장의 텍스처에 모아 한 번에 그린다)
//  · 일본 거리 소품: 전봇대 · 자판기 · 신호등 · 가드레일 · 가로등 · 커브 미러
//  · 물리 하늘(Preetham) · 장면을 찍어 만든 반사 환경맵
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ───────────────── 난수 · 잡음 ─────────────────
let _s = 1;
export function seed(v) {
  _s = v >>> 0 || 1;
}
export function rnd() {
  _s = (_s * 16807) % 2147483647;
  return (_s - 1) / 2147483646;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];

/** 주기 P 로 이어지는 값 잡음 격자 */
function lattice(P) {
  const g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return { P, g };
}
function vnoise(L, x, y) {
  const { P, g } = L;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let tx = x - ix;
  let ty = y - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const x0 = ((ix % P) + P) % P;
  const y0 = ((iy % P) + P) % P;
  const x1 = (x0 + 1) % P;
  const y1 = (y0 + 1) % P;
  const a = g[y0 * P + x0];
  const b = g[y0 * P + x1];
  const c = g[y1 * P + x0];
  const d = g[y1 * P + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
/** 텍스처 크기 N 에서 이어지는 fbm (0~1) */
function makeFbm(N, base = 4, oct = 5) {
  const Ls = [];
  for (let o = 0; o < oct; o++) Ls.push(lattice(base << o));
  return (px, py) => {
    let v = 0;
    let a = 0.5;
    let n = 0;
    for (let o = 0; o < oct; o++) {
      const L = Ls[o];
      v += vnoise(L, (px / N) * L.P, (py / N) * L.P) * a;
      n += a;
      a *= 0.5;
    }
    return v / n;
  };
}

// ───────────────── PBR 텍스처 조립 ─────────────────
const _cache = new Map();

function toTexture(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/**
 * painter(x, y) → [r, g, b (0~1 sRGB), height (0~1), roughness (0~1), emissive?(0~1 r,g,b)]
 * 높이에서 소벨로 법선을 뽑는다
 */
function bake(key, N, painter, { normal = 2.5, emissive = false } = {}) {
  if (_cache.has(key)) return _cache.get(key);
  const cv = (n) => {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    return c;
  };
  const cC = cv(N);
  const cN = cv(N);
  const cR = cv(N);
  const cE = emissive ? cv(N) : null;
  const gC = cC.getContext('2d');
  const gN = cN.getContext('2d');
  const gR = cR.getContext('2d');
  const iC = gC.createImageData(N, N);
  const iN = gN.createImageData(N, N);
  const iR = gR.createImageData(N, N);
  const iE = emissive ? cE.getContext('2d').createImageData(N, N) : null;
  const H = new Float32Array(N * N);
  const out = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      out[5] = out[6] = out[7] = 0;
      painter(x, y, out);
      const i = y * N + x;
      const k = i * 4;
      iC.data[k] = Math.max(0, Math.min(255, out[0] * 255));
      iC.data[k + 1] = Math.max(0, Math.min(255, out[1] * 255));
      iC.data[k + 2] = Math.max(0, Math.min(255, out[2] * 255));
      iC.data[k + 3] = 255;
      H[i] = out[3];
      // 거칠기는 G 채널 (three 규약: roughnessMap.g)
      const r = Math.max(0, Math.min(255, out[4] * 255));
      iR.data[k] = r;
      iR.data[k + 1] = r;
      iR.data[k + 2] = r;
      iR.data[k + 3] = 255;
      if (iE) {
        iE.data[k] = Math.min(255, out[5] * 255);
        iE.data[k + 1] = Math.min(255, out[6] * 255);
        iE.data[k + 2] = Math.min(255, out[7] * 255);
        iE.data[k + 3] = 255;
      }
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const h = (xx, yy) => H[(((yy + N) % N) * N) + ((xx + N) % N)];
      const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x - 1, y) - h(x - 1, y + 1)) * normal;
      const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x, y - 1) - h(x + 1, y - 1)) * normal;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * N + x) * 4;
      iN.data[k] = ((-dx / l) * 0.5 + 0.5) * 255;
      iN.data[k + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      iN.data[k + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      iN.data[k + 3] = 255;
    }
  }
  gC.putImageData(iC, 0, 0);
  gN.putImageData(iN, 0, 0);
  gR.putImageData(iR, 0, 0);
  if (iE) cE.getContext('2d').putImageData(iE, 0, 0);
  const set = { map: toTexture(cC, true), normalMap: toTexture(cN, false), roughnessMap: toTexture(cR, false), emissiveMap: cE ? toTexture(cE, true) : null };
  _cache.set(key, set);
  return set;
}

/** 텍스처 세트를 쓰는 물리 재질 */
export function pbrMat(set, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    roughness: 1,
    metalness: o.metalness ?? 0,
    normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1),
    color: o.color ?? 0xffffff,
    envMapIntensity: o.env ?? 1,
  });
  if (set.emissiveMap && o.emissive !== false) {
    m.emissiveMap = set.emissiveMap;
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveIntensity = o.emissive ?? 1;
  }
  return m;
}

const lerp = (a, b, t) => a + (b - a) * t;
const sat = (v) => Math.max(0, Math.min(1, v));
const sstep = (a, b, x) => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ── 아스팔트 (마른 / 젖은) ──
export function asphaltSet(wet = false) {
  return bake('asphalt' + wet, 512, (() => {
    seed(wet ? 91 : 17);
    const N = 512;
    const big = makeFbm(N, 3, 4);
    const mid = makeFbm(N, 16, 3);
    const fine = makeFbm(N, 160, 2);
    const puddle = makeFbm(N, 2, 4);
    const crack = makeFbm(N, 6, 3);
    return (x, y, o) => {
      const b = big(x, y);
      const m = mid(x, y);
      const f = fine(x, y);
      // 골재: 밝은 돌·어두운 돌 점
      const stone = f > 0.7 ? (f - 0.7) * 1.2 : 0;
      const dark = f < 0.3 ? (0.3 - f) * 0.7 : 0;
      // 갈라진 틈 (등고선 같은 가는 선) + 보수한 자국
      const c = Math.abs(crack(x, y) - 0.5);
      const cr = c < 0.012 ? 1 - c / 0.012 : 0;
      const patch = sstep(0.62, 0.66, b) * 0.6;
      let v = 0.2 + (m - 0.5) * 0.06 + stone * 0.35 - dark * 0.25 - patch * 0.05 - cr * 0.1;
      let rough = 0.9 - stone * 0.15 + cr * 0.05;
      let h = f * 0.35 + m * 0.15 - cr * 0.8;
      if (wet) {
        const p = sstep(0.55, 0.6, puddle(x, y));
        v *= 0.55;
        rough = lerp(0.42 - stone * 0.1, 0.03, p);
        h = lerp(h, 0.2, p);
      }
      o[0] = v;
      o[1] = v;
      o[2] = v * 1.04;
      o[3] = h;
      o[4] = rough;
    };
  })(), { normal: 1.6 });
}

// ── 일본 보도: 인터로킹 블록 (20x10cm, 어긋나게) ──
export function paverSet(tone = 'gray') {
  return bake('paver' + tone, 512, (() => {
    seed(tone === 'gray' ? 31 : 37);
    const N = 512;
    const fine = makeFbm(N, 64, 2);
    const mid = makeFbm(N, 8, 3);
    const tint = [];
    for (let i = 0; i < 64 * 64; i++) tint.push(rnd());
    const base = tone === 'gray' ? [0.55, 0.54, 0.52] : [0.55, 0.4, 0.33];
    return (x, y, o) => {
      // 텍스처 한 장 = 1m: 블록 20cm x 10cm → 5 x 10
      const bw = N / 5;
      const bh = N / 10;
      const row = Math.floor(y / bh);
      const xx = x + (row % 2) * bw * 0.5;
      const col = Math.floor(xx / bw) % 5;
      const lx = xx % bw;
      const ly = y % bh;
      const edge = Math.min(lx, bw - lx, ly, bh - ly);
      const joint = edge < 2 ? 1 : 0;
      const bevel = sstep(0, 5, edge);
      const t = tint[(row * 7 + col) % tint.length];
      const k = 0.85 + t * 0.25 + (fine(x, y) - 0.5) * 0.18 + (mid(x, y) - 0.5) * 0.1;
      o[0] = base[0] * k * (joint ? 0.45 : 1);
      o[1] = base[1] * k * (joint ? 0.45 : 1);
      o[2] = base[2] * k * (joint ? 0.45 : 1);
      o[3] = bevel * 0.8 + fine(x, y) * 0.2;
      o[4] = joint ? 0.95 : 0.78 + (fine(x, y) - 0.5) * 0.2;
    };
  })(), { normal: 2.5 });
}

// ── 점자 블록 (노란 유도 블록, 30cm 정사각) ──
export function tactileSet() {
  return bake('tactile', 256, (() => {
    seed(5);
    const N = 256;
    const fine = makeFbm(N, 32, 2);
    return (x, y, o) => {
      const cell = N / 5;
      const cx = (x % cell) - cell / 2;
      const cy = (y % cell) - cell / 2;
      const r = Math.hypot(cx, cy);
      const dot = sstep(cell * 0.3, cell * 0.24, r);
      const edge = Math.min(x, N - x, y, N - y);
      const k = 0.9 + (fine(x, y) - 0.5) * 0.15;
      const j = edge < 2 ? 0.4 : 1;
      o[0] = 0.92 * k * j;
      o[1] = 0.72 * k * j;
      o[2] = 0.12 * k * j;
      o[3] = dot;
      o[4] = 0.6;
    };
  })(), { normal: 4 });
}

// ── 노출 콘크리트 (거푸집 줄눈 + 세퍼레이터 구멍 + 빗물 얼룩) ──
export function concreteSet(tone = 0.62) {
  return bake('concrete' + tone, 512, (() => {
    seed(Math.floor(tone * 1000));
    const N = 512;
    const big = makeFbm(N, 3, 4);
    const fine = makeFbm(N, 64, 3);
    const streak = makeFbm(N, 24, 2);
    return (x, y, o) => {
      // 한 장 = 1.8m x 0.9m 거푸집 판 2장 높이
      const pw = N;
      const ph = N / 2;
      const ly = y % ph;
      const seam = Math.min(ly, ph - ly) < 1.5 || x < 1.5 ? 1 : 0;
      const hx = (x % (pw / 3)) - pw / 6;
      const hy = (y % (ph / 2)) - ph / 4;
      const hole = Math.hypot(hx, hy) < 6 ? 1 : 0;
      const st = streak(x * 0.2, y * 3) * sstep(0.2, 1, y / N);
      const v = tone * (0.9 + (big(x, y) - 0.5) * 0.25 + (fine(x, y) - 0.5) * 0.1) - st * 0.06 - seam * 0.08 - hole * 0.25;
      o[0] = v;
      o[1] = v;
      o[2] = v * 1.02;
      o[3] = fine(x, y) * 0.4 - seam * 0.5 - hole;
      o[4] = 0.82 + (fine(x, y) - 0.5) * 0.15;
    };
  })(), { normal: 2 });
}

// ── 외벽 타일 (45x95mm 소형 타일) ──
export function tileSet(color = [0.78, 0.72, 0.62]) {
  const key = 'tile' + color.join(',');
  return bake(key, 512, (() => {
    seed(Math.floor(color[0] * 997 + color[1] * 101));
    const N = 512;
    const fine = makeFbm(N, 64, 2);
    const tint = [];
    for (let i = 0; i < 4096; i++) tint.push(rnd());
    return (x, y, o) => {
      // 한 장 = 0.5m: 타일 5 x 10
      const tw = N / 5;
      const th = N / 10;
      const row = Math.floor(y / th);
      const xx = x + (row % 2) * tw * 0.5;
      const col = Math.floor(xx / tw);
      const edge = Math.min(xx % tw, tw - (xx % tw), y % th, th - (y % th));
      const joint = edge < 3;
      const t = tint[(row * 13 + col * 7) % 4096];
      const k = 0.88 + t * 0.2 + (fine(x, y) - 0.5) * 0.06;
      const c = joint ? [0.5, 0.5, 0.48] : [color[0] * k, color[1] * k, color[2] * k];
      o[0] = c[0];
      o[1] = c[1];
      o[2] = c[2];
      o[3] = joint ? 0 : sstep(0, 6, edge) * 0.8;
      o[4] = joint ? 0.9 : 0.35 + t * 0.15;
    };
  })(), { normal: 2.5 });
}

// ── 사이딩 (주택 외벽 패널) ──
export function sidingSet(color = [0.86, 0.83, 0.76]) {
  return bake('siding' + color.join(','), 256, (() => {
    seed(Math.floor(color[2] * 1000));
    const N = 256;
    const fine = makeFbm(N, 32, 3);
    return (x, y, o) => {
      // 한 장 = 1m, 판 높이 25cm
      const ph = N / 4;
      const ly = y % ph;
      const groove = ly < 3 ? 1 : 0;
      const shade = ly / ph;
      const k = 0.92 + (fine(x, y) - 0.5) * 0.12 - groove * 0.25 + shade * 0.05;
      o[0] = color[0] * k;
      o[1] = color[1] * k;
      o[2] = color[2] * k;
      o[3] = groove ? 0 : 0.6 + fine(x, y) * 0.3;
      o[4] = 0.75;
    };
  })(), { normal: 2 });
}

// ── 기와 지붕 ──
export function roofTileSet(color = [0.24, 0.26, 0.3]) {
  return bake('roof' + color.join(','), 256, (() => {
    seed(Math.floor(color[0] * 999));
    const N = 256;
    const fine = makeFbm(N, 32, 2);
    return (x, y, o) => {
      // 한 장 = 1m: 기와 4열 x 4단, 골이 진 물결
      const cw = N / 4;
      const rh = N / 4;
      const u = (x % cw) / cw;
      const v = (y % rh) / rh;
      const wave = Math.sin(u * Math.PI);
      const lip = v > 0.9 ? 1 : 0;
      const h = wave * 0.7 + (1 - v) * 0.3 - lip * 0.4;
      const k = 0.75 + wave * 0.35 + (fine(x, y) - 0.5) * 0.15 - lip * 0.3;
      o[0] = color[0] * k;
      o[1] = color[1] * k;
      o[2] = color[2] * k;
      o[3] = h;
      o[4] = 0.45 + (1 - wave) * 0.2;
    };
  })(), { normal: 3 });
}

// ── 콘크리트 블록 담장 ──
export function blockWallSet() {
  return bake('block', 256, (() => {
    seed(61);
    const N = 256;
    const fine = makeFbm(N, 48, 3);
    const big = makeFbm(N, 4, 3);
    return (x, y, o) => {
      // 한 장 = 0.8m x 0.4m → 블록 2 x 2
      const bw = N / 2;
      const bh = N / 2;
      const row = Math.floor(y / bh);
      const xx = x + (row % 2) * bw * 0.5;
      const edge = Math.min(xx % bw, bw - (xx % bw), y % bh, bh - (y % bh));
      const joint = edge < 3;
      const v = (0.6 + (fine(x, y) - 0.5) * 0.2 + (big(x, y) - 0.5) * 0.15) * (joint ? 0.75 : 1);
      o[0] = v;
      o[1] = v * 0.99;
      o[2] = v * 0.96;
      o[3] = joint ? 0 : 0.7 + fine(x, y) * 0.3;
      o[4] = 0.9;
    };
  })(), { normal: 2.5 });
}

// ── 건물 정면: 텍스처 한 장 = 4칸 x 4층 (창마다 불 켜짐·블라인드가 다르다). 밤에 켜진 창은 발광 맵 ──
//  style: 'glass' 커튼월 · 'office' 띠창 · 'tile' 타일 벽 + 창 · 'apt' 맨션(발코니 난간) · 'concrete' 노출 콘크리트
export function facadeSet(style = 'office', wall = [0.72, 0.7, 0.66], lit = 0.35) {
  const key = `facade-${style}-${wall.join(',')}-${lit}`;
  if (_cache.has(key)) return _cache.get(key);
  const set = bake(key, 256, (() => {
    seed(Math.floor(wall[0] * 1000 + wall[1] * 100 + style.length * 7 + lit * 50));
    const N = 256;
    const C = N / 4;
    const fine = makeFbm(N, 32, 2);
    const big = makeFbm(N, 2, 2);
    const cells = [];
    for (let i = 0; i < 16; i++) cells.push({ lit: rnd() < lit, warm: rnd() < 0.55, blind: rnd(), room: 0.6 + rnd() * 0.4 });
    let wx0 = 0.12;
    let wx1 = 0.88;
    let wy0 = 0.18;
    let wy1 = 0.72;
    if (style === 'glass') [wx0, wx1, wy0, wy1] = [0.03, 0.97, 0.04, 0.9];
    else if (style === 'office') [wx0, wx1, wy0, wy1] = [0.02, 0.98, 0.28, 0.78];
    else if (style === 'apt') [wx0, wx1, wy0, wy1] = [0.1, 0.9, 0.12, 0.76];
    return (x, y, o) => {
      const cx = Math.floor(x / C);
      const cy = Math.floor(y / C);
      const cell = cells[cy * 4 + cx];
      const u = (x % C) / C;
      const v = (y % C) / C; // 0 = 위
      const f = fine(x, y);
      let c;
      let h;
      let r;
      const inWin = u > wx0 && u < wx1 && v > wy0 && v < wy1;
      const frame = inWin && (Math.abs(u - 0.5) < 0.012 || Math.min(u - wx0, wx1 - u, v - wy0, wy1 - v) < 0.02);
      if (inWin && !frame) {
        // 유리: 하늘을 비추는 어두운 청회색 + 블라인드
        const sky = 0.14 + (1 - v) * 0.08 + (big(x, y) - 0.5) * 0.1;
        const bl = v < wy0 + (wy1 - wy0) * cell.blind * 0.7 ? 0.08 : 0;
        c = [sky * 0.85 + bl, sky * 0.95 + bl, sky * 1.15 + bl];
        h = 0.1;
        r = 0.05;
        if (cell.lit) {
          const e = cell.room * (bl ? 0.6 : 1);
          const col = cell.warm ? [1.0, 0.8, 0.52] : [0.84, 0.92, 1.0];
          o[5] = col[0] * e;
          o[6] = col[1] * e;
          o[7] = col[2] * e;
        }
      } else if (frame) {
        c = [0.3, 0.31, 0.33];
        h = 0.55;
        r = 0.35;
      } else {
        const k = 0.92 + (f - 0.5) * 0.12 + (big(x, y) - 0.5) * 0.1;
        c = [wall[0] * k, wall[1] * k, wall[2] * k];
        h = 0.6 + f * 0.2;
        r = 0.8;
        if (style === 'tile') {
          if ((y % 8) < 1 || (x % 16) < 1) {
            c = c.map((q) => q * 0.82);
            h = 0.4;
          }
          r = 0.45;
        }
        if ((style === 'office' || style === 'glass') && v > 0.86) c = c.map((q) => q * 0.82);
        if (style === 'concrete' && Math.hypot((x % 32) - 16, (y % 32) - 16) < 2) c = c.map((q) => q * 0.6);
        // 창 아래 빗물 얼룩
        if (style !== 'glass' && v > wy1 && Math.abs(u - 0.5) < 0.35) {
          const st = sstep(wy1, 1, v) * 0.12 * (0.5 + f);
          c = c.map((q) => q * (1 - st));
        }
      }
      if (style === 'apt' && v > 0.8) {
        const bar = (x % 6) < 1.2 || v > 0.95 || v < 0.82;
        c = bar ? [0.82, 0.83, 0.84] : [0.15, 0.16, 0.18];
        h = bar ? 0.9 : 0.3;
        r = bar ? 0.4 : 0.6;
      }
      o[0] = c[0];
      o[1] = c[1];
      o[2] = c[2];
      o[3] = h;
      o[4] = r;
    };
  })(), { normal: 2.5, emissive: true });
  // UV 1 = 칸 하나 → 텍스처 한 장(4x4)을 덮도록
  for (const t of [set.map, set.normalMap, set.roughnessMap, set.emissiveMap]) t.repeat.set(0.25, 0.25);
  return set;
}

// ───────────────── 건물 상자 (층/칸 UV) ─────────────────
/**
 * 옆면 4개(정면 재질) + 지붕. UV 1 = 칸 1개 / 층 1개 → 같은 재질이면 건물끼리 합칠 수 있다
 * @returns {{ sides: BufferGeometry, top: BufferGeometry }}
 */
export function buildingGeo(w, h, d, { bay = 4, floorH = 3.4, x = 0, z = 0, rotY = 0, uOff = 0, vOff = 0, groundH = 0 } = {}) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const face = (ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, uw, vh) => {
    const i = pos.length / 3;
    // a=왼아래 b=오른아래 c=왼위 (평행사변형)
    pos.push(ax, ay, az, bx, by, bz, bx + cx - ax, by + cy - ay, bz + cz - az, cx, cy, cz);
    for (let k = 0; k < 4; k++) nor.push(nx, ny, nz);
    uv.push(uOff, vOff, uOff + uw, vOff, uOff + uw, vOff + vh, uOff, vOff + vh);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const hw = w / 2;
  const hd = d / 2;
  const y0 = groundH;
  const fl = (h - y0) / floorH;
  face(-hw, y0, hd, hw, y0, hd, -hw, h, hd, 0, 0, 1, w / bay, fl);
  face(hw, y0, -hd, -hw, y0, -hd, hw, h, -hd, 0, 0, -1, w / bay, fl);
  face(hw, y0, hd, hw, y0, -hd, hw, h, hd, 1, 0, 0, d / bay, fl);
  face(-hw, y0, -hd, -hw, y0, hd, -hw, h, -hd, -1, 0, 0, d / bay, fl);
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sides.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  sides.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  sides.setIndex(idx);
  const top = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, h, 0);
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  sides.applyMatrix4(m);
  top.applyMatrix4(m);
  return { sides, top };
}

/** 같은 재질끼리 기하를 모아 메시 하나로 */
export class Batch {
  constructor() {
    this.map = new Map();
  }

  add(mat, geo, matrix = null) {
    if (matrix) geo = geo.clone().applyMatrix4(matrix);
    // 합치려면 속성이 같아야 한다: uv 없는 기하엔 붙여 준다
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(geo);
  }

  /** Object3D 를 통째로 (메시마다 월드 행렬 적용) */
  addObject(obj) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh) this.add(o.material, o.geometry, o.matrixWorld);
    });
  }

  build(group, { shadow = true } = {}) {
    for (const [mat, list] of this.map) {
      const fixed = list.map((g) => (g.index ? g : (() => {
        const n = g.attributes.position.count;
        const ix = [];
        for (let i = 0; i < n; i++) ix.push(i);
        g.setIndex(ix);
        return g;
      })()));
      const merged = mergeGeometries(fixed, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadow && !mat.userData.noShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.map.clear();
  }
}

// ───────────────── 간판 아틀라스 ─────────────────
export const JP_SIGN_FONT = "'Noto Sans JP', 'Noto Serif JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif";

export class SignAtlas {
  constructor(size = 2048, cols = 8, rows = 16) {
    this.size = size;
    this.cols = cols;
    this.rows = rows;
    this.cw = size / cols;
    this.ch = size / rows;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.g = this.canvas.getContext('2d');
    this.g.fillStyle = '#000';
    this.g.fillRect(0, 0, size, size);
    this.n = 0;
    this.tex = toTexture(this.canvas, true);
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    // 간판은 스스로 빛난다 (밤) + 낮에도 색이 보이게
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, emissiveMap: this.tex, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.4, metalness: 0 });
    this.mat.userData.noShadow = true;
  }

  /**
   * 칸 하나에 간판을 그린다. 세로 간판은 칸 2개를 세로로 쓴다
   * @returns {{u0,v0,u1,v1, aspect}}
   */
  add(text, { bg = '#101010', fg = '#ffffff', border = null, vertical = false, glow = true, sub = null, font = JP_SIGN_FONT } = {}) {
    const span = vertical ? 2 : 1;
    if (!this.used) this.used = new Uint8Array(this.cols * this.rows);
    // 빈 칸 찾기 (세로 간판은 위아래 두 칸)
    let col = -1;
    let row = -1;
    for (let r = 0; r + span <= this.rows && col < 0; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.used[r * this.cols + c] && (span === 1 || !this.used[(r + 1) * this.cols + c])) {
          col = c;
          row = r;
          break;
        }
      }
    }
    if (col < 0) return null;
    for (let k = 0; k < span; k++) this.used[(row + k) * this.cols + col] = 1;
    const g = this.g;
    const x = col * this.cw;
    const y = row * this.ch;
    const w = this.cw;
    const h = this.ch * span;
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = bg;
    g.fillRect(x, y, w, h);
    if (border) {
      g.strokeStyle = border;
      g.lineWidth = 8;
      g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (glow) {
      g.shadowColor = fg;
      g.shadowBlur = 18;
    }
    let crop = w;
    if (vertical) {
      const chars = [...text];
      const fs = Math.min(w * 0.78, (h * 0.9) / chars.length);
      g.font = `900 ${fs}px ${font}`;
      const y0 = y + (h - fs * chars.length) / 2;
      chars.forEach((c, i) => g.fillText(c, x + w / 2, y0 + fs * (i + 0.5)));
      // 세로 간판은 글자 기둥 폭만 쓴다
      crop = Math.min(w, fs * 1.4);
      if (border) {
        g.shadowBlur = 0;
        g.strokeStyle = border;
        g.lineWidth = 6;
        g.strokeRect(x + (w - crop) / 2 + 4, y + 4, crop - 8, h - 8);
      }
    } else {
      let fs = h * 0.62;
      g.font = `900 ${fs}px ${font}`;
      while (g.measureText(text).width > w * 0.9 && fs > 10) g.font = `900 ${(fs -= 2)}px ${font}`;
      g.fillText(text, x + w / 2, y + h * (sub ? 0.42 : 0.53));
      if (sub) {
        g.shadowBlur = 0;
        g.font = `700 ${h * 0.18}px ${font}`;
        g.fillText(sub, x + w / 2, y + h * 0.82);
      }
    }
    g.restore();
    this.tex.needsUpdate = true;
    const pad = 2 / this.size;
    const cx0 = x + (w - crop) / 2;
    return { u0: cx0 / this.size + pad, u1: (cx0 + crop) / this.size - pad, v0: 1 - (y + h) / this.size + pad, v1: 1 - y / this.size - pad, aspect: crop / h };
  }

  /** 간판 판 (UV를 아틀라스 칸에 맞춘 사각형) */
  plane(rect, width, height) {
    const g = new THREE.PlaneGeometry(width, height);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) ? rect.u1 : rect.u0, uv.getY(i) ? rect.v1 : rect.v0);
    }
    return g;
  }
}

// ───────────────── 물리 하늘 ─────────────────
/**
 * 해 고도(도)·방위(도)로 Preetham 하늘. 밤이면 별이 있는 어두운 하늘
 */
export function physicalSky({ elevation = 35, azimuth = 160, turbidity = 6, rayleigh = 1.6, mie = 0.004, mieG = 0.85 } = {}) {
  const sky = new Sky();
  sky.scale.setScalar(800);
  const u = sky.material.uniforms;
  u.turbidity.value = turbidity;
  u.rayleigh.value = rayleigh;
  u.mieCoefficient.value = mie;
  u.mieDirectionalG.value = mieG;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sun);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.material.fog = false;
  sky.userData.sunDir = sun;
  return sky;
}

const nightVert = /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const nightFrag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uGlow;
float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  // 도시 불빛에 물든 지평선 → 위로 갈수록 짙은 남색
  vec3 col = mix(uGlow, vec3(0.008, 0.012, 0.03), smoothstep(-0.02, 0.45, d.y));
  col = mix(col, vec3(0.02, 0.02, 0.03), smoothstep(0.0, -0.2, d.y));
  float s = h(floor(d * 300.0));
  col += vec3(0.6) * step(0.9985, s) * smoothstep(0.15, 0.5, d.y);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function nightSky(glow = 0x4a3048) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({ vertexShader: nightVert, fragmentShader: nightFrag, uniforms: { uGlow: { value: new THREE.Color(glow) } }, side: THREE.BackSide, depthWrite: false, fog: false }));
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// ───────────────── 일본 거리 소품 ─────────────────
const _mats = {};
function M(key, make) {
  if (!_mats[key]) _mats[key] = make();
  return _mats[key];
}
export const MAT = {
  get poleConcrete() {
    return M('poleC', () => pbrMat(concreteSet(0.7), { color: 0xd8d4cc }));
  },
  get metalDark() {
    return M('metalD', () => new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.45, metalness: 0.7 }));
  },
  get metalLight() {
    return M('metalL', () => new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.8 }));
  },
  get rail() {
    return M('rail', () => new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.3, metalness: 0.5 }));
  },
  get wire() {
    return M('wire', () => new THREE.LineBasicMaterial({ color: 0x101010 }));
  },
  get lampOn() {
    return M('lampOn', () => {
      const m = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xfff0d8, emissiveIntensity: 3 });
      m.userData.noShadow = true;
      return m;
    });
  },
  get black() {
    return M('black', () => new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6 }));
  },
};

/** 전봇대: 콘크리트 기둥 · 완금 · 변압기 · 애자 */
export function utilityPole(B, x, z, { h = 10, rotY = 0, transformer = false } = {}) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  const mm = (geo, tx, ty, tz) => geo.translate(tx, ty, tz).applyMatrix4(m);
  B.add(MAT.poleConcrete, mm(new THREE.CylinderGeometry(0.13, 0.19, h, 12), 0, h / 2, 0));
  for (const [y, w] of [[h - 0.4, 1.8], [h - 1.3, 1.4]]) {
    B.add(MAT.metalDark, mm(new THREE.BoxGeometry(w, 0.09, 0.09), 0, y, 0));
    for (const s of [-1, 0, 1]) B.add(MAT.rail, mm(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 8), s * w * 0.42, y + 0.11, 0));
  }
  if (transformer) {
    B.add(MAT.metalLight, mm(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 14), 0.42, h - 3, 0));
    B.add(MAT.metalLight, mm(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 14), -0.38, h - 3.1, 0.1));
    B.add(MAT.metalDark, mm(new THREE.BoxGeometry(1.1, 0.08, 0.3), 0, h - 3.6, 0));
  }
  // 발판 볼트
  for (let i = 0; i < 8; i++) B.add(MAT.metalDark, mm(new THREE.BoxGeometry(0.3, 0.03, 0.03), 0, 2.2 + i * 0.45, 0).rotateY(0));
  const top = new THREE.Vector3(0, h - 0.3, 0).applyMatrix4(m);
  return top;
}

/** 전선: 기둥 꼭대기끼리 늘어진 선 */
export function wires(group, points, sag = 0.5, offsets = [-0.75, 0, 0.75], axis = new THREE.Vector3(1, 0, 0)) {
  const pts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (const o of offsets) {
      for (let s = 0; s < 10; s++) {
        const t0 = s / 10;
        const t1 = (s + 1) / 10;
        const p0 = a.clone().lerp(b, t0).addScaledVector(axis, o);
        const p1 = a.clone().lerp(b, t1).addScaledVector(axis, o);
        p0.y -= Math.sin(t0 * Math.PI) * sag;
        p1.y -= Math.sin(t1 * Math.PI) * sag;
        pts.push(p0, p1);
      }
    }
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), MAT.wire));
}

/** 자판기 (앞면은 아틀라스 간판처럼 빛나는 판) */
let _vendTex = null;
function vendingTexture() {
  if (_vendTex) return _vendTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#f4f6f8');
  grd.addColorStop(1, '#d9dee4');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 512);
  // 음료 진열 칸 3단 x 6열
  const cols = ['#c8102e', '#1f6fd1', '#f2a900', '#2a9d4f', '#6b3fa0', '#ff7a1a', '#ffffff', '#3a2a20', '#00a3a3'];
  for (let r = 0; r < 3; r++) {
    g.fillStyle = '#e9eef3';
    g.fillRect(14, 30 + r * 92, 228, 84);
    for (let k = 0; k < 6; k++) {
      const x = 22 + k * 37;
      const y = 40 + r * 92;
      g.fillStyle = cols[(r * 6 + k * 5) % cols.length];
      g.fillRect(x, y + 8, 26, 50);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(x + 3, y + 10, 5, 46);
      g.fillStyle = '#222';
      g.fillRect(x + 4, y + 64, 18, 7);
      g.fillStyle = r === 1 && k === 2 ? '#ff3030' : '#30c040';
      g.fillRect(x + 6, y + 65, 4, 4);
    }
  }
  g.fillStyle = '#2a2d33';
  g.fillRect(14, 320, 228, 30);
  g.fillStyle = '#7fe08f';
  g.font = '700 18px monospace';
  g.fillText('¥ 130', 30, 341);
  g.fillStyle = '#1a1c20';
  g.fillRect(40, 400, 176, 70);
  g.fillStyle = '#0a0a0a';
  g.fillRect(50, 410, 156, 40);
  _vendTex = new THREE.CanvasTexture(c);
  _vendTex.colorSpace = THREE.SRGBColorSpace;
  return _vendTex;
}
export function vendingMachine(B, x, z, rotY = 0, color = 0xf0f0f0) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  const body = M('vend' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 }));
  const front = M('vendFront', () => {
    const t = vendingTexture();
    const mm = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.15 });
    mm.userData.noShadow = true;
    return mm;
  });
  B.add(body, new THREE.BoxGeometry(1.0, 1.83, 0.75).translate(0, 0.915, 0).applyMatrix4(m));
  B.add(front, new THREE.PlaneGeometry(0.9, 1.6).translate(0, 0.95, 0.38).applyMatrix4(m));
}

/** 일본식 가로 신호등 (청·황·적) + 보행 신호 */
export function trafficSignal(B, x, z, { rotY = 0, armLen = 4, state = 'red' } = {}) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  const add = (mat, geo) => B.add(mat, geo.applyMatrix4(m));
  add(MAT.metalLight, new THREE.CylinderGeometry(0.09, 0.11, 6, 10).translate(0, 3, 0));
  add(MAT.metalLight, new THREE.CylinderGeometry(0.06, 0.06, armLen, 8).rotateZ(Math.PI / 2).translate(armLen / 2, 5.6, 0));
  add(MAT.metalDark, new THREE.BoxGeometry(1.25, 0.42, 0.28).translate(armLen - 0.5, 5.6, 0));
  const lens = (c, on) => M('lens' + c + on, () => {
    const mm = new THREE.MeshStandardMaterial({ color: on ? c : 0x111111, emissive: on ? c : 0x000000, emissiveIntensity: on ? 3 : 0, roughness: 0.2 });
    mm.userData.noShadow = true;
    return mm;
  });
  [[0x10c8a0, 'green'], [0xffb000, 'yellow'], [0xff2010, 'red']].forEach(([c, n], i) => add(lens(c, state === n), new THREE.CircleGeometry(0.15, 16).translate(armLen - 0.9 + i * 0.4, 5.6, 0.145)));
  // 보행 신호
  add(MAT.metalDark, new THREE.BoxGeometry(0.4, 0.75, 0.25).translate(0.3, 2.9, 0));
  add(lens(0xff2010, state !== 'green'), new THREE.PlaneGeometry(0.3, 0.28).translate(0.3, 3.1, 0.13));
  add(lens(0x10c8a0, state === 'green'), new THREE.PlaneGeometry(0.3, 0.28).translate(0.3, 2.75, 0.13));
}

/** 가드레일 (흰 파이프 난간) */
export function guardRail(B, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(x1 - x0, z1 - z0);
  const m = new THREE.Matrix4().makeRotationY(ang).setPosition(x0, 0, z0);
  for (const y of [0.55, 0.85]) B.add(MAT.rail, new THREE.CylinderGeometry(0.03, 0.03, len, 8).rotateX(Math.PI / 2).translate(0, y, len / 2).applyMatrix4(m));
  for (let t = 0; t <= len; t += 2) B.add(MAT.rail, new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8).translate(0, 0.45, t).applyMatrix4(m));
}

/** 가로등 (휘어진 팔 + 발광 등) */
export function streetLight(B, x, z, rotY = 0, h = 7) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  B.add(MAT.metalLight, new THREE.CylinderGeometry(0.08, 0.12, h, 10).translate(0, h / 2, 0).applyMatrix4(m));
  B.add(MAT.metalLight, new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8).rotateZ(Math.PI / 2 - 0.15).translate(0.75, h + 0.1, 0).applyMatrix4(m));
  B.add(MAT.metalDark, new THREE.BoxGeometry(0.6, 0.14, 0.28).translate(1.5, h + 0.2, 0).applyMatrix4(m));
  B.add(MAT.lampOn, new THREE.PlaneGeometry(0.5, 0.2).rotateX(Math.PI / 2).translate(1.5, h + 0.12, 0).applyMatrix4(m));
  return new THREE.Vector3(1.5, h, 0).applyMatrix4(m);
}

/** 커브 미러 (주황 기둥 + 둥근 거울) */
export function curveMirror(B, x, z, rotY = 0) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  const orange = M('mirrorPole', () => new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4 }));
  const mirror = M('mirror', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, metalness: 1 }));
  B.add(orange, new THREE.CylinderGeometry(0.05, 0.05, 2.8, 10).translate(0, 1.4, 0).applyMatrix4(m));
  B.add(orange, new THREE.TorusGeometry(0.32, 0.04, 8, 24).translate(0, 2.9, 0.05).applyMatrix4(m));
  B.add(mirror, new THREE.CircleGeometry(0.3, 24).translate(0, 2.9, 0.07).applyMatrix4(m));
}

/** 땅바닥 판 (홀수로 나눠 중심에 정점이 오지 않게) */
export function ground(w, d, mat, repeatMeters, x = 0, z = 0, y = 0) {
  const g = new THREE.PlaneGeometry(w, d, 7, 7).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / repeatMeters, (uv.getY(i) * d) / repeatMeters);
  g.translate(x, y, z);
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/** 도로 표시 (흰 띠) 기하 */
export function stripe(x, z, w, d, rotY = 0, y = 0.012) {
  return new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(rotY).translate(x, y, z);
}

export const roadPaint = () => M('paint', () => {
  const m = new THREE.MeshStandardMaterial({ color: 0xe9e7df, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.userData.noShadow = true;
  return m;
});

/** LED 대형 전광판: 캔버스 애니메이션 (가상의 광고) */
export class LedScreen {
  constructor(w = 384, h = 216, seedV = 1) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.t = seedV * 3.7;
    this.k = seedV;
    this._acc = 0;
    this.draw();
  }

  update(dt) {
    this.t += dt;
    this._acc += dt;
    if (this._acc < 1 / 12) return;
    this._acc = 0;
    this.draw();
  }

  draw() {
    const { g } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const t = this.t;
    const scene = Math.floor(t / 4 + this.k) % 4;
    const p = (t % 4) / 4;
    if (scene === 0) {
      // 음료 광고: 그라데이션 + 병 실루엣
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, `hsl(${(t * 20) % 360},80%,45%)`);
      grd.addColorStop(1, `hsl(${(t * 20 + 120) % 360},80%,25%)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      const x = W * (0.2 + p * 0.1);
      g.fillRect(x, H * 0.25, W * 0.08, H * 0.6);
      g.fillRect(x + W * 0.02, H * 0.12, W * 0.04, H * 0.15);
      g.font = `900 ${H * 0.2}px ${JP_SIGN_FONT}`;
      g.fillText('冷たい一杯', W * 0.42, H * 0.5);
      g.font = `700 ${H * 0.09}px ${JP_SIGN_FONT}`;
      g.fillText('NEW TASTE', W * 0.44, H * 0.7);
    } else if (scene === 1) {
      // 음악: 파형
      g.fillStyle = '#05050c';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 48; i++) {
        const a = Math.abs(Math.sin(i * 0.7 + t * 6) * Math.sin(i * 0.23 + t * 2));
        g.fillStyle = `hsl(${200 + i * 3},90%,${40 + a * 30}%)`;
        g.fillRect((i / 48) * W, H * (0.5 - a * 0.4), W / 52, H * a * 0.8);
      }
      g.fillStyle = '#fff';
      g.font = `900 ${H * 0.13}px ${JP_SIGN_FONT}`;
      g.fillText('LIVE 2026', W * 0.05, H * 0.92);
    } else if (scene === 2) {
      // 패션: 큰 글자 흐름
      g.fillStyle = '#f2f0ea';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#111';
      g.font = `900 ${H * 0.55}px ${JP_SIGN_FONT}`;
      g.fillText('渋谷', W * (0.9 - p * 1.2), H * 0.7);
      g.fillStyle = '#d6334a';
      g.fillRect(0, H * 0.82, W * p, H * 0.05);
    } else {
      // 뉴스 띠
      g.fillStyle = '#0a2a5a';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff';
      g.font = `900 ${H * 0.16}px ${JP_SIGN_FONT}`;
      g.fillText('本日の天気  晴れ  22℃', W * (1 - p * 1.6), H * 0.4);
      g.fillStyle = '#ffcc00';
      g.fillRect(0, H * 0.62, W, H * 0.2);
      g.fillStyle = '#111';
      g.font = `700 ${H * 0.12}px ${JP_SIGN_FONT}`;
      g.fillText('東京  ニュース速報', W * 0.04, H * 0.76);
    }
    this.tex.needsUpdate = true;
  }
}

/** 장면 하나를 플레이어 눈높이에서 찍어 반사 환경맵으로 */
export function captureEnvironment(renderer, objects, at, { lights = [] } = {}) {
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  scene.add(holder);
  const parents = objects.map((o) => o.parent);
  const pos = objects.map((o) => o.position.clone());
  for (const o of objects) {
    holder.add(o);
  }
  holder.position.set(-at.x, -at.y, -at.z);
  for (const l of lights) scene.add(l);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02, 0.1, 500);
  pm.dispose();
  objects.forEach((o, i) => {
    o.position.copy(pos[i]);
    if (parents[i]) parents[i].add(o);
    else holder.remove(o);
  });
  for (const l of lights) scene.remove(l);
  return rt.texture;
}

export { pick };
