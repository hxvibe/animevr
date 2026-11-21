// 체험장 · 연습장: 실내 훈련 시설 (스포츠 고무 바닥 · 패드 벽 · 철골 천장과 LED 조명 · 샌드백 · 타격 인형 · 매트 · 사물함)
//  1 유닛 = 1m. 플레이어는 (0, 0, 1)에서 −Z 쪽(훈련장 안)을 본다.
import * as THREE from 'three';
import * as R from './realism.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const X0 = -13;
const X1 = 13;
const Z0 = -31;
const Z1 = 6;
const H = 9;

// ── 스포츠 고무 바닥 (짙은 청회색에 알갱이 점) ──
function rubberSet() {
  return R.bake('rubberFloor', 512, (() => {
    R.seed(41);
    const N = 512;
    const fine = R.makeFbm(N, 128, 2);
    const mid = R.makeFbm(N, 8, 3);
    return (x, y, o) => {
      const f = fine(x, y);
      const fleck = f > 0.72 ? 1 : f < 0.24 ? -1 : 0;
      const m = (mid(x, y) - 0.5) * 0.05;
      const base = [0.2, 0.25, 0.3];
      const k = 1 + m + fleck * 0.18;
      o[0] = base[0] * k + (fleck > 0 ? 0.06 : 0);
      o[1] = base[1] * k + (fleck > 0 ? 0.05 : 0);
      o[2] = base[2] * k + (fleck > 0 ? 0.04 : 0);
      o[3] = f * 0.4;
      o[4] = 0.72 + (f - 0.5) * 0.1;
    };
  })(), { normal: 1.2 });
}

// ── 벽 아래의 충격 흡수 패드 (세로 이음매가 있는 비닐 패드) ──
function padSet() {
  return R.bake('wallPad', 256, (() => {
    R.seed(7);
    const N = 256;
    const fine = R.makeFbm(N, 48, 2);
    return (x, y, o) => {
      const pw = N / 2; // 한 장 = 0.6m 폭 (반복 1.2m)
      const lx = x % pw;
      const seam = Math.min(lx, pw - lx) < 3 ? 1 : 0;
      const puff = Math.sin((lx / pw) * Math.PI);
      const k = 0.9 + puff * 0.1 + (fine(x, y) - 0.5) * 0.04 - seam * 0.35;
      o[0] = 0.16 * k;
      o[1] = 0.24 * k;
      o[2] = 0.4 * k;
      o[3] = puff * 0.8;
      o[4] = 0.55 + seam * 0.3;
    };
  })(), { normal: 1.6 });
}

/** 바닥 위 선 (테이프) */
function lineRect(B, mat, cx, cz, w, d, t = 0.06) {
  B.add(mat, R.stripe(cx, cz - d / 2, w, t, 0, 0.004));
  B.add(mat, R.stripe(cx, cz + d / 2, w, t, 0, 0.004));
  B.add(mat, R.stripe(cx - w / 2, cz, t, d, 0, 0.004));
  B.add(mat, R.stripe(cx + w / 2, cz, t, d, 0, 0.004));
}

/** 재질별로 기하를 모았다가 한 번에 합친다 (그리기 호출 줄이기) */
class Batch {
  constructor() {
    this.m = new Map();
  }
  add(mat, geo) {
    if (!this.m.has(mat)) this.m.set(mat, []);
    this.m.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
  }
  box(mat, w, h, d, x, y, z, ry = 0) {
    this.add(mat, new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z));
  }
  cyl(mat, r0, r1, h, x, y, z, seg = 12) {
    this.add(mat, new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z));
  }
  flush(group, { shadow = true } = {}) {
    for (const [mat, geos] of this.m) {
      const g = mergeGeometries(geos.map((x) => {
        // 속성 맞추기 (uv 없는 것 등)
        for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k);
        return x;
      }));
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = shadow && !mat.userData.noShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

function textTexture(lines, { w = 1024, h = 256, bg = '#f4f1ea', fg = '#1d2430', font = "900 120px 'Noto Serif JP', serif" } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font;
  lines.forEach((l, i) => g.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function clockTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbf8';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#222';
  g.lineWidth = 8;
  g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineWidth = i % 3 ? 4 : 9;
    g.beginPath();
    g.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100);
    g.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114);
    g.stroke();
  }
  const hand = (a, len, wd) => {
    g.lineWidth = wd;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len);
    g.stroke();
  };
  hand(((10 + 8 / 60) / 12) * Math.PI * 2, 60, 9);
  hand((8 / 60) * Math.PI * 2, 92, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTrainingHall(ctx) {
  R.seed(23);
  const group = new THREE.Group();
  const B = new Batch();
  const W = X1 - X0;
  const D = Z1 - Z0;
  const cx = (X0 + X1) / 2;
  const cz = (Z0 + Z1) / 2;

  // ── 바닥: 가운데는 고무 바닥, 둘레는 광을 낸 콘크리트 ──
  const cset = R.concreteSet(0.74);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd8d8d4, map: cset.map, normalMap: cset.normalMap, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.32, envMapIntensity: 0.8 });
  group.add(R.ground(W, D, concrete, 3, cx, cz, 0));
  const rubber = R.pbrMat(rubberSet(), { normal: 0.6, env: 0.5 });
  const AW = 20;
  const AZ0 = -27;
  const AZ1 = 3;
  group.add(R.ground(AW, AZ1 - AZ0, rubber, 2, 0, (AZ0 + AZ1) / 2, 0.006, 1));
  // 코트 선: 흰 테두리 · 가운데 원 · 노란 안전선
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 });
  white.userData.noShadow = true;
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 });
  yellow.userData.noShadow = true;
  const red = new THREE.MeshStandardMaterial({ color: 0xc8262e, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 });
  red.userData.noShadow = true;
  lineRect(B, white, 0, (AZ0 + AZ1) / 2, AW - 1.2, AZ1 - AZ0 - 1.2, 0.07);
  B.add(white, R.stripe(0, -12, AW - 1.2, 0.07, 0, 0.004));
  B.add(white, new THREE.RingGeometry(3.4, 3.47, 72).rotateX(-Math.PI / 2).translate(0, 0.004, -12));
  B.add(red, new THREE.RingGeometry(0.0, 0.3, 24).rotateX(-Math.PI / 2).translate(0, 0.004, -12));
  lineRect(B, yellow, 0, (AZ0 + AZ1) / 2, AW + 0.6, AZ1 - AZ0 + 0.6, 0.1);
  // 시작 위치 표시 (발 모양 대신 작은 십자)
  B.add(yellow, R.stripe(0, 1, 0.6, 0.06, 0, 0.004));
  B.add(yellow, R.stripe(0, 1, 0.06, 0.6, 0, 0.004));

  // ── 벽: 아래는 충격 흡수 패드, 위는 흰 도장 블록 벽 ──
  const pad = R.pbrMat(padSet(), { normal: 1, env: 0.6 });
  const wset = R.blockWallSet();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, map: wset.map, normalMap: wset.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.85 });
  const padH = 1.8;
  const wallGeo = (w, h, x, y, z, ry, rep) => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / rep), uv.getY(i) * (h / rep));
    return g.rotateY(ry).translate(x, y, z);
  };
  const walls = [
    [W, cx, Z0, 0], // 뒤 (−Z)
    [W, cx, Z1, Math.PI], // 앞
    [D, X0, cz, Math.PI / 2], // 왼쪽
    [D, X1, cz, -Math.PI / 2], // 오른쪽
  ];
  for (const [len, x, z, ry] of walls) {
    B.add(pad, wallGeo(len, padH, x, padH / 2, z, ry, 1.2).translate(...new THREE.Vector3(0, 0, 0.12).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).toArray()));
    B.add(wallMat, wallGeo(len, H - padH, x, padH + (H - padH) / 2, z, ry, 2.4));
    // 패드 위 마감 (알루미늄 띠)
    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    B.box(new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.7, roughness: 0.35 }), Math.abs(n.z) > 0.5 ? len : 0.06, 0.05, Math.abs(n.z) > 0.5 ? 0.06 : len, x + n.x * 0.13, padH + 0.02, z + n.z * 0.13);
  }
  // 걸레받이 (콘크리트 둘레)
  const base = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.6 });

  // ── 천장: 어두운 데크 + 철골 트러스 + LED 판 조명 + 덕트 ──
  const deck = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.9, side: THREE.DoubleSide });
  B.add(deck, new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2).translate(cx, H, cz));
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a6068, metalness: 0.6, roughness: 0.45 });
  for (let z = Z0 + 3; z < Z1; z += 6) {
    B.box(steel, W, 0.5, 0.25, cx, H - 0.6, z); // 보
    B.box(steel, W, 0.08, 0.25, cx, H - 1.3, z); // 아래 현
    for (let x = X0 + 1; x < X1; x += 2) B.box(steel, 0.06, 0.75, 0.06, x, H - 0.95, z, 0); // 수직재
  }
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffbf2, emissiveIntensity: 2.2, roughness: 0.4 });
  ledMat.userData.noShadow = true;
  for (let z = Z0 + 6; z < Z1 - 1; z += 6) for (let x = -9; x <= 9; x += 4.5) B.add(ledMat, new THREE.PlaneGeometry(2.4, 0.6).rotateX(Math.PI / 2).translate(x, H - 1.45, z));
  const duct = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.75, roughness: 0.32 });
  B.add(duct, new THREE.CylinderGeometry(0.45, 0.45, D - 1, 16).rotateX(Math.PI / 2).translate(X0 + 3, H - 2.1, cz));
  B.add(duct, new THREE.CylinderGeometry(0.45, 0.45, D - 1, 16).rotateX(Math.PI / 2).translate(X1 - 3, H - 2.1, cz));
  // 높은 창 (오른쪽 벽 위): 바깥 하늘빛
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfd8f0, emissive: 0x9ec4ea, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.2 });
  glass.userData.noShadow = true;
  const frame = new THREE.MeshStandardMaterial({ color: 0x2c3038, metalness: 0.5, roughness: 0.5 });
  for (let z = Z0 + 4; z < Z1 - 2; z += 5) {
    B.add(glass, new THREE.PlaneGeometry(3.6, 1.6).rotateY(-Math.PI / 2).translate(X1 - 0.02, H - 3.2, z));
    B.box(frame, 0.1, 1.8, 0.1, X1 - 0.05, H - 3.2, z - 1.85);
    B.box(frame, 0.1, 0.1, 3.8, X1 - 0.05, H - 2.35, z);
    B.box(frame, 0.1, 0.1, 3.8, X1 - 0.05, H - 4.05, z);
  }
  // 뒤 벽: 관람실 유리창 + 현판 「鍛錬場」 + 시계
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.05, metalness: 0.4, envMapIntensity: 1.4 });
  B.add(darkGlass, new THREE.PlaneGeometry(10, 2.2).translate(0, 4.6, Z0 + 0.03));
  B.box(frame, 10.3, 0.12, 0.15, 0, 3.45, Z0 + 0.06);
  B.box(frame, 10.3, 0.12, 0.15, 0, 5.75, Z0 + 0.06);
  for (let x = -5; x <= 5; x += 2.5) B.box(frame, 0.1, 2.3, 0.15, x, 4.6, Z0 + 0.06);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshStandardMaterial({ map: textTexture(['鍛 錬 場']), roughness: 0.8 }));
  banner.position.set(0, 7.1, Z0 + 0.05);
  group.add(banner);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.4 }));
  clock.position.set(6.5, 7.1, Z0 + 0.05);
  group.add(clock);
  // 비상구 등 (초록) — 앞 벽 문 위
  const exitTex = textTexture(['非常口  EXIT'], { w: 512, h: 160, bg: '#13a35a', fg: '#ffffff', font: "900 64px sans-serif" });
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), new THREE.MeshStandardMaterial({ map: exitTex, emissive: 0xffffff, emissiveMap: exitTex, emissiveIntensity: 0.9 }));
  exit.position.set(-8, 2.75, Z1 - 0.05);
  exit.rotation.y = Math.PI;
  group.add(exit);
  // 문 (앞 벽 · 양개 철문)
  const door = new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: 0.5, roughness: 0.45 });
  B.box(door, 2.2, 2.4, 0.08, -8, 1.2, Z1 - 0.14);
  B.box(frame, 0.04, 2.3, 0.1, -8, 1.2, Z1 - 0.2);

  // ── 왼쪽 벽: 샌드백 (철골 보에 사슬로) ──
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x7a1e22, roughness: 0.55 });
  const bagTop = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 });
  const chain = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.3 });
  B.box(steel, 0.2, 0.25, 16, X0 + 2.2, 4.2, -12);
  for (const z of [-19, -15, -11, -7]) {
    B.add(chain, new THREE.CylinderGeometry(0.012, 0.012, 2.2, 4).translate(X0 + 2.2, 3.1, z));
    B.cyl(bagTop, 0.18, 0.18, 0.12, X0 + 2.2, 1.98, z, 18);
    B.cyl(bagMat, 0.18, 0.18, 1.2, X0 + 2.2, 1.35, z, 18);
    B.cyl(bagTop, 0.18, 0.16, 0.08, X0 + 2.2, 0.72, z, 18);
  }
  // 오른쪽 벽: 타격 인형 (받침 + 기둥 + 몸통 패드)
  const standMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5 });
  const dummyMat = new THREE.MeshStandardMaterial({ color: 0xd8b48a, roughness: 0.75 });
  for (const z of [-20, -16, -12]) {
    B.cyl(standMat, 0.38, 0.42, 0.35, X1 - 2.2, 0.175, z, 24);
    B.cyl(standMat, 0.05, 0.05, 1.0, X1 - 2.2, 0.8, z, 10);
    B.cyl(dummyMat, 0.17, 0.2, 0.75, X1 - 2.2, 1.45, z, 18);
    B.add(dummyMat, new THREE.SphereGeometry(0.13, 16, 12).translate(X1 - 2.2, 1.98, z));
  }
  // 벽에 세운 매트 더미 (파랑 · 노랑) · 벤치 · 사물함 · 정수기 · 목검 걸이 · 소화기
  const matBlue = new THREE.MeshStandardMaterial({ color: 0x2a5ea8, roughness: 0.6 });
  const matYel = new THREE.MeshStandardMaterial({ color: 0xe8b828, roughness: 0.6 });
  for (let i = 0; i < 6; i++) B.box(i % 2 ? matYel : matBlue, 1.8, 0.05, 1.2, X0 + 1.2, 0.025 + i * 0.05, -24, 0.02 * (i - 3));
  for (let i = 0; i < 4; i++) B.box(matBlue, 1.2, 1.9, 0.05, X1 - 0.35, 0.95, -25 + i * 0.07, 0);
  const wood = new THREE.MeshStandardMaterial({ color: 0xa87a4a, roughness: 0.6 });
  for (const [x, z, ry] of [[X0 + 0.9, -2, Math.PI / 2], [X1 - 0.9, -6, Math.PI / 2]]) {
    B.box(wood, 2.4, 0.06, 0.38, x, 0.45, z, ry);
    B.box(standMat, 0.06, 0.45, 0.32, x, 0.225, z - 1.0, 0);
    B.box(standMat, 0.06, 0.45, 0.32, x, 0.225, z + 1.0, 0);
  }
  const locker = new THREE.MeshStandardMaterial({ color: 0x5c7a96, metalness: 0.45, roughness: 0.5 });
  const lockerLine = new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const x = 2 + i * 0.62;
    B.box(locker, 0.6, 1.9, 0.5, x, 0.95, Z1 - 0.4);
    B.box(lockerLine, 0.02, 1.85, 0.51, x + 0.31, 0.95, Z1 - 0.4);
    B.box(lockerLine, 0.4, 0.02, 0.51, x, 1.6, Z1 - 0.4);
  }
  const cooler = new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.4 });
  B.box(cooler, 0.35, 1.0, 0.35, X0 + 0.6, 0.5, 2);
  B.add(new THREE.MeshStandardMaterial({ color: 0x8cc4ee, transparent: true, opacity: 0.75, roughness: 0.1 }), new THREE.CylinderGeometry(0.14, 0.14, 0.42, 16).translate(X0 + 0.6, 1.2, 2));
  // 목검 걸이
  B.box(wood, 1.6, 0.08, 0.1, X1 - 0.15, 2.0, -9, Math.PI / 2);
  for (let i = 0; i < 5; i++) B.add(new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.5 }), new THREE.CylinderGeometry(0.018, 0.022, 1.0, 6).rotateZ(0.08).translate(X1 - 0.22, 1.55, -9.6 + i * 0.3));
  const extMat = new THREE.MeshStandardMaterial({ color: 0xc8161e, roughness: 0.35, metalness: 0.2 });
  B.cyl(extMat, 0.08, 0.08, 0.5, -6, 0.3, Z1 - 0.2, 14);
  // 모서리 기둥
  const col = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.8 });
  for (const [x, z] of [[X0 + 0.3, Z0 + 0.3], [X1 - 0.3, Z0 + 0.3], [X0 + 0.3, Z1 - 0.3], [X1 - 0.3, Z1 - 0.3]]) B.box(col, 0.6, H, 0.6, x, H / 2, z);
  void base;
  B.flush(group);

  // ── 부서지는 소품: 폼 블록 · 라바콘 (주먹으로 날려 보내기 좋은 것) ──
  const foamCols = [0x2a6ad0, 0xe8b828, 0xd84a3a, 0x3aa86a];
  const foamGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  let ci = 0;
  for (const [sx, sz] of [[-4, -7], [5, -6], [-6, -1], [6, -14], [0, -18], [-5, -21]]) {
    const n = 3 + Math.floor(R.rnd() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(foamGeo, new THREE.MeshStandardMaterial({ color: foamCols[ci++ % foamCols.length], roughness: 0.75 }));
      const layer = k < 3 ? 0 : 1;
      m.position.set(sx + (k % 3) * 0.65 - 0.65 + layer * 0.3, 0.3 + layer * 0.6, sz + (R.rnd() - 0.5) * 0.1);
      m.rotation.y = (R.rnd() - 0.5) * 0.3;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      ctx.world.addProp(m, { radius: 0.32, mass: 1.2, hp: 30, color: 0xf0f0f0 });
    }
  }
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xf06a1a, roughness: 0.5 });
  const coneGeo = new THREE.ConeGeometry(0.16, 0.5, 16).translate(0, 0.25, 0);
  for (const [x, z] of [[-8, -9], [-8, -13], [8, -9], [8, -13], [-3, -25], [3, -25]]) {
    const m = new THREE.Mesh(coneGeo, coneMat);
    m.position.set(x, 0, z);
    m.castShadow = true;
    group.add(m);
    ctx.world.addProp(m, { radius: 0.18, mass: 0.6, hp: 20, color: 0xf06a1a });
  }

  // 조명: LED 판을 대신하는 넓은 사각 조명 몇 개 (그림자는 해 하나로)
  const fill = new THREE.Group();
  for (const z of [-20, -8]) {
    const l = new THREE.PointLight(0xfff6ea, 18, 22, 1.6);
    l.position.set(0, H - 2, z);
    fill.add(l);
  }
  group.add(fill);

  return {
    id: 'white',
    bright: true,
    group,
    sky: new THREE.Mesh(new THREE.SphereGeometry(400, 16, 8), new THREE.MeshBasicMaterial({ color: 0x2a2d33, side: THREE.BackSide, fog: false })),
    fog: { color: 0xd9dce2, near: 40, far: 140 },
    hemi: { sky: 0xfbf8f2, ground: 0x6c7480, intensity: 1.25 },
    sun: { color: 0xfff4e6, intensity: 1.5, pos: [-6, 30, 10] },
    exposure: 1.0,
    capture: true,
    shadows: true,
    bounds: { minX: X0 + 0.5, maxX: X1 - 0.5, minZ: Z0 + 0.5, maxZ: Z1 - 0.5 },
    spawn: new THREE.Vector3(0, 0, 1),
  };
}
