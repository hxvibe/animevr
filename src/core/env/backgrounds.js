// 배경: 하얀 방 / 도시 / 골목  (실제 크기 기준: 1 유닛 = 1m)
import * as THREE from 'three';
import * as T from './textures.js';
import { glowTexture } from '../fx.js';
import { getModel } from '../assets.js';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;
const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uSunSize;
void main() {
  float h = vDir.y;
  vec3 col = mix(uHor, uTop, smoothstep(0.0, 0.55, h));
  col = mix(col, uBot, smoothstep(0.0, -0.15, h));
  float s = max(0.0, dot(vDir, normalize(uSun)));
  col += uSunCol * (pow(s, uSunSize) * 2.0 + pow(s, 8.0) * 0.25);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeSky({ top, hor, bot, sun = [0.3, 0.6, -0.7], sunCol = 0xffffff, sunSize = 400 }) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(top) },
        uHor: { value: new THREE.Color(hor) },
        uBot: { value: new THREE.Color(bot) },
        uSun: { value: new THREE.Vector3(...sun) },
        uSunCol: { value: new THREE.Color(sunCol) },
        uSunSize: { value: sunSize },
      },
    }),
  );
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

function floor(size, mat, segs = 80) {
  const g = new THREE.PlaneGeometry(size[0], size[1], segs, segs);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  return m;
}

// ───────────────────────── 하얀 방 ─────────────────────────
export function buildWhiteRoom(ctx) {
  T.reseed(11);
  const glb = getModel('white_room');
  if (glb) return buildWhiteRoomGLB(ctx, glb);
  const group = new THREE.Group();
  const W = 44;
  const tiles = T.whiteTiles();
  tiles.repeat.set(W / 2, W / 2);
  const fl = floor([W, W], new THREE.MeshLambertMaterial({ map: tiles }), 60);
  group.add(fl);
  const wallTex = T.whiteWall();
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xffffff });
  const H = 10;
  const wt = 0.4;
  for (const [x, z, w, d] of [[0, -W / 2, W, wt], [0, W / 2, W, wt], [-W / 2, 0, wt, W], [W / 2, 0, wt, W]]) {
    const m = box(w, H, d, wallMat, x, H / 2, z, group);
    wallTex.repeat.set(Math.max(w, d) / 4, H / 4);
    m.renderOrder = -1;
  }
  // 바닥 몰딩
  const trim = new THREE.MeshLambertMaterial({ color: 0xdfe2e8 });
  for (const [x, z, w, d] of [[0, -W / 2 + 0.25, W, 0.1], [0, W / 2 - 0.25, W, 0.1], [-W / 2 + 0.25, 0, 0.1, W], [W / 2 - 0.25, 0, 0.1, W]]) box(w, 0.25, d, trim, x, 0.125, z, group);

  // 기하학적 구조물 (SUPERHOT 느낌의 하얀 블록)
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f3f5 });
  const shade = new THREE.MeshLambertMaterial({ color: 0xe3e6ec });
  const structures = [
    [-9, -10, 1.2, 4, 1.2], [9, -10, 1.2, 4, 1.2], [-9, 8, 1.2, 4, 1.2], [9, 8, 1.2, 4, 1.2],
    [0, -14, 6, 1.1, 0.5], [-14, 0, 0.5, 1.1, 5], [14, -3, 0.5, 1.1, 5],
    [-16, -16, 3, 2.5, 3], [16, 15, 4, 1.6, 2],
  ];
  for (const [x, z, w, h, d] of structures) box(w, h, d, x > 0 ? white : shade, x, h / 2, z, group);
  // 계단
  for (let i = 0; i < 5; i++) box(3, 0.2 * (i + 1), 0.4, white, 16, 0.1 * (i + 1), -14 + i * 0.4, group);
  box(3, 1, 3, white, 16, 0.5, -11, group);

  // 파괴 가능한 흰 큐브
  const cubeMat = new THREE.MeshLambertMaterial({ color: 0xfafafa });
  const cubeGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const stacks = [[-4, -7], [5, -6], [-6, 3], [7, 4], [0, 9]];
  for (const [sx, sz] of stacks) {
    const n = 3 + Math.floor(T.rnd() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(cubeGeo, cubeMat);
      const layer = k < 3 ? 0 : 1;
      m.position.set(sx + (k % 3) * 0.65 - 0.65 + layer * 0.3, 0.3 + layer * 0.6, sz + (T.rnd() - 0.5) * 0.1);
      m.rotation.y = (T.rnd() - 0.5) * 0.3;
      group.add(m);
      ctx.world.addProp(m, { radius: 0.32, mass: 1.5, hp: 30, color: 0xf0f0f0 });
    }
  }
  return {
    id: 'white',
    bright: true,
    group,
    sky: makeSky({ top: 0xf6f7fa, hor: 0xffffff, bot: 0xeef0f4, sunCol: 0x000000 }),
    fog: { color: 0xf3f4f7, near: 30, far: 120 },
    hemi: { sky: 0xffffff, ground: 0xc8ccd6, intensity: 1.7 },
    sun: { color: 0xffffff, intensity: 1.6, pos: [-10, 30, 12] },
    exposure: 0.95,
    bounds: { minX: -W / 2 + 0.5, maxX: W / 2 - 0.5, minZ: -W / 2 + 0.5, maxZ: W / 2 - 0.5 },
    spawn: new THREE.Vector3(0, 0, 4),
  };
}

// 첨부 GLB 하얀 방
function buildWhiteRoomGLB(ctx, src) {
  const group = new THREE.Group();
  const S = 0.08; // 원본 단위 → m (폭 약 19m, 높이 10m)
  const room = src.clone(true);
  room.scale.setScalar(S);
  room.position.set(-1 * S, 0, 4 - 64 * S);
  room.traverse((o) => {
    if (o.isMesh) {
      o.material = new THREE.MeshLambertMaterial({ color: 0xf6f7f9, side: THREE.DoubleSide });
    }
  });
  group.add(room);
  // 바닥 타일 느낌의 옅은 격자 (원본 바닥 위)
  const tiles = T.whiteTiles();
  tiles.repeat.set(9, 15);
  const grid = floor([18, 30], new THREE.MeshLambertMaterial({ map: tiles, transparent: true, opacity: 0.5, depthWrite: false }), 4);
  grid.position.set(0, 0.012, -11);
  group.add(grid);
  // 파괴 가능한 흰 큐브
  const cubeMat = new THREE.MeshLambertMaterial({ color: 0xfafafa });
  const cubeGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  for (const [sx, sz] of [[-4, -7], [5, -6], [-6, -1], [6, -12], [0, -15]]) {
    const n = 3 + Math.floor(T.rnd() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(cubeGeo, cubeMat);
      const layer = k < 3 ? 0 : 1;
      m.position.set(sx + (k % 3) * 0.65 - 0.65 + layer * 0.3, 0.3 + layer * 0.6, sz + (T.rnd() - 0.5) * 0.1);
      m.rotation.y = (T.rnd() - 0.5) * 0.3;
      group.add(m);
      ctx.world.addProp(m, { radius: 0.32, mass: 1.5, hp: 30, color: 0xf0f0f0 });
    }
  }
  return {
    id: 'white',
    bright: true,
    group,
    sky: makeSky({ top: 0xf6f7fa, hor: 0xffffff, bot: 0xeef0f4, sunCol: 0x000000 }),
    fog: { color: 0xf3f4f7, near: 25, far: 90 },
    hemi: { sky: 0xffffff, ground: 0xc8ccd6, intensity: 1.8 },
    sun: { color: 0xffffff, intensity: 1.4, pos: [-6, 30, 10] },
    exposure: 0.95,
    bounds: { minX: -8.4, maxX: 8.4, minZ: -25, maxZ: 3.4 },
    spawn: new THREE.Vector3(0, 0, 1),
  };
}

// ───────────────────────── 도시 ─────────────────────────
function makeCar(color, envMap) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.4, envMap, envMapIntensity: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.05, metalness: 0.6, envMap, envMapIntensity: 1 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const light = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
  const red = new THREE.MeshBasicMaterial({ color: 0xaa1010 });
  box(4.3, 0.75, 1.8, body, 0, 0.62, 0, g);
  box(2.3, 0.6, 1.6, glass, -0.2, 1.28, 0, g);
  box(2.1, 0.08, 1.55, body, -0.2, 1.6, 0, g);
  for (const [x, z] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 14), dark);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.34, z);
    g.add(w);
  }
  box(0.05, 0.14, 0.4, light, 2.16, 0.75, 0.6, g);
  box(0.05, 0.14, 0.4, light, 2.16, 0.75, -0.6, g);
  box(0.05, 0.12, 0.35, red, -2.16, 0.8, 0.62, g);
  box(0.05, 0.12, 0.35, red, -2.16, 0.8, -0.62, g);
  return g;
}

function streetLamp(group, x, z, side) {
  const pole = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.5, 8), pole);
  p.position.set(x, 3.25, z);
  group.add(p);
  box(1.6, 0.08, 0.08, pole, x - side * 0.8, 6.4, z, group);
  const lamp = box(0.5, 0.12, 0.25, new THREE.MeshBasicMaterial({ color: 0xfff1d0 }), x - side * 1.5, 6.32, z, group);
  return lamp;
}

export function buildCity(ctx) {
  T.reseed(23);
  const group = new THREE.Group();
  const L = 200;
  const roadW = 12;
  const swW = 4;
  const at = T.asphalt();
  at.repeat.set(roadW / 6, L / 6);
  const road = floor([roadW, L], new THREE.MeshLambertMaterial({ map: at }), 40);
  group.add(road);
  const sw = T.sidewalk();
  sw.repeat.set(swW / 2, L / 2);
  const swMat = new THREE.MeshLambertMaterial({ map: sw });
  for (const s of [-1, 1]) {
    const m = floor([swW, L], swMat, 30);
    m.position.set(s * (roadW / 2 + swW / 2), 0.01, 0);
    group.add(m);
    box(0.2, 0.12, L, new THREE.MeshLambertMaterial({ color: 0x9c9890 }), s * (roadW / 2 + 0.1), 0.06, 0, group);
  }
  // 교차로
  const cross = floor([L, roadW], new THREE.MeshLambertMaterial({ map: (() => { const t = T.asphalt(); t.repeat.set(L / 6, 2); return t; })() }), 40);
  cross.position.set(0, 0.005, -30);
  group.add(cross);
  // 차선
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e2c8 });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xe0b020 });
  box(0.12, 0.01, L, yellow, -0.1, 0.012, 0, group);
  box(0.12, 0.01, L, yellow, 0.1, 0.012, 0, group);
  for (let z = -L / 2; z < L / 2; z += 6) {
    if (Math.abs(z + 30) < 8) continue;
    for (const x of [-3, 3]) box(0.12, 0.01, 3, lineMat, x, 0.012, z, group);
  }
  // 횡단보도
  for (let i = -5; i <= 5; i++) {
    box(0.5, 0.01, 3, lineMat, i * 1.0, 0.014, -21.5, group);
    box(0.5, 0.01, 3, lineMat, i * 1.0, 0.014, -38.5, group);
  }

  // 건물
  const palettes = [
    { wall: '#b8b0a4', glass: '#2b3644' }, { wall: '#8e8a86', glass: '#2a3340' }, { wall: '#c9c2b2', glass: '#33414f' },
    { wall: '#6f7680', glass: '#22303d', style: 1 }, { wall: '#a46d55', glass: '#2b2f38' }, { wall: '#d6d2c8', glass: '#3a4a5a' },
  ];
  const facades = palettes.map((p) => T.facade({ ...p, lit: 0.12 }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4b4d52 });
  for (const s of [-1, 1]) {
    let z = -L / 2 + 4;
    while (z < L / 2 - 4) {
      const w = 10 + T.rnd() * 10;
      const zc = z + w / 2;
      z += w + 0.6;
      if (Math.abs(zc + 30) < w / 2 + 6) continue; // 교차로
      const d = 12 + T.rnd() * 8;
      const h = 12 + T.rnd() * T.rnd() * 45;
      const fi = Math.floor(T.rnd() * facades.length);
      const tex = facades[fi].clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 12)));
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const x = s * (roadW / 2 + swW + d / 2);
      const b = box(d, h, w, [mat, mat, roofMat, roofMat, mat, mat], x, h / 2, zc, group);
      void b;
      // 1층 상가 차양
      const awning = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(T.rnd(), 0.5, 0.35) });
      box(1.2, 0.12, w * 0.8, awning, s * (roadW / 2 + swW - 0.6), 3.2, zc, group);
      box(d + 0.4, 0.6, w + 0.4, roofMat, x, h + 0.3, zc, group);
    }
  }
  // 먼 스카이라인
  const sky = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x7d8796 }), 120);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const r = 130 + T.rnd() * 60;
    m4.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(12 + T.rnd() * 15, 20 + T.rnd() * 70, 12 + T.rnd() * 15));
    sky.setMatrixAt(i, m4);
  }
  group.add(sky);

  // 가로등
  for (let z = -90; z < 90; z += 16) {
    streetLamp(group, -(roadW / 2 + 0.6), z, -1);
    streetLamp(group, roadW / 2 + 0.6, z + 8, 1);
  }
  // 신호등
  const tl = new THREE.MeshLambertMaterial({ color: 0x2b2d30 });
  for (const [x, z, s] of [[-6.6, -22, -1], [6.6, -38, 1]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.5, 8), tl);
    p.position.set(x, 2.75, z);
    group.add(p);
    box(3, 0.1, 0.1, tl, x - s * 1.5, 5.4, z, group);
    box(0.35, 0.9, 0.3, tl, x - s * 2.8, 5.0, z, group);
    box(0.2, 0.2, 0.05, new THREE.MeshBasicMaterial({ color: 0xff2a10 }), x - s * 2.8, 5.3, z + 0.16, group);
    box(0.2, 0.2, 0.05, new THREE.MeshBasicMaterial({ color: 0x1a3a1a }), x - s * 2.8, 4.8, z + 0.16, group);
  }
  // 주차된 차 (절단 가능)
  const carColors = [0x9a1e1e, 0xe8e8e8, 0x1d1f24, 0x2a4a8a, 0x7a7d82, 0xc9b28a];
  const carSpots = [[-4.6, 6], [-4.6, 14], [4.6, -6], [4.6, 18], [-4.6, -50], [4.6, -60]];
  carSpots.forEach(([x, z], i) => {
    const inner = makeCar(carColors[i % carColors.length], ctx.world.envMap);
    inner.position.y = -0.8;
    const car = new THREE.Group();
    car.add(inner);
    car.position.set(x, 0.8, z);
    car.rotation.y = Math.PI / 2 + (x > 0 ? Math.PI : 0);
    group.add(car);
    ctx.world.addProp(car, { radius: 1.3, halfH: 0.8, mass: 25, hp: 260, color: carColors[i % carColors.length] });
  });
  // 소품: 쓰레기통, 콘
  const binMat = new THREE.MeshLambertMaterial({ color: 0x2e5a3a });
  const coneMat = new THREE.MeshLambertMaterial({ color: 0xff6a10 });
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.25, 0.85, 10), binMat);
    b.position.set(s * (roadW / 2 + 1.0), 0.43, -40 + i * 11);
    group.add(b);
    ctx.world.addProp(b, { radius: 0.32, mass: 2, hp: 30, color: 0x2e5a3a });
  }
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.6, 10), coneMat);
    c.position.set(-2 + (i % 3) * 1.6, 0.3, -12 - Math.floor(i / 3) * 1.6);
    group.add(c);
    ctx.world.addProp(c, { radius: 0.2, mass: 0.6, hp: 10, color: 0xff6a10 });
  }
  // 나무 상자 더미 (공사장)
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7448 });
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), crateMat);
    c.position.set(3 + (i % 3) * 0.75, 0.35 + Math.floor(i / 3) * 0.7, -14);
    group.add(c);
    ctx.world.addProp(c, { radius: 0.38, mass: 1.5, hp: 25, color: 0x9a7448 });
  }
  return {
    id: 'city',
    bright: true,
    group,
    sky: makeSky({ top: 0x4f86c9, hor: 0xcfe0ef, bot: 0x9aa4ae, sun: [0.4, 0.55, -0.6], sunCol: 0xfff2d8, sunSize: 600 }),
    fog: { color: 0xc4d2df, near: 50, far: 260 },
    hemi: { sky: 0xdfeaff, ground: 0x6a6660, intensity: 1.7 },
    sun: { color: 0xfff1dc, intensity: 2.0, pos: [40, 55, -45] },
    exposure: 1.0,
    bounds: { minX: -roadW / 2 - swW + 0.5, maxX: roadW / 2 + swW - 0.5, minZ: -90, maxZ: 90 },
    spawn: new THREE.Vector3(0, 0, 0),
  };
}

// ───────────────────────── 골목 ─────────────────────────
export function buildAlley(ctx) {
  T.reseed(37);
  const group = new THREE.Group();
  const AW = 5.2;
  const z0 = -32;
  const z1 = 22;
  const len = z1 - z0;
  const at = T.asphalt(true);
  at.repeat.set(2, len / 4);
  const ground = floor([AW + 2, len + 30], new THREE.MeshStandardMaterial({ map: at, roughness: 0.55, metalness: 0.1, envMap: ctx.world.envMap, envMapIntensity: 0.4 }), 40);
  ground.position.z = (z0 + z1) / 2 - 10;
  group.add(ground);
  // 웅덩이
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.02, metalness: 0.9, envMap: ctx.world.envMap, envMapIntensity: 1 });
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.4 + T.rnd() * 0.8, 20), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(1, 0.5 + T.rnd() * 0.6, 1);
    p.position.set((T.rnd() - 0.5) * 3, 0.006, z0 + 4 + T.rnd() * (len - 8));
    group.add(p);
  }
  // 벽 (건물)
  const brickA = T.brick('#7b3b2c');
  const brickB = T.brick('#5f5550');
  const conc = T.concrete('#76787c');
  const segs = [];
  for (const s of [-1, 1]) {
    let z = z0;
    while (z < z1) {
      const w = 6 + T.rnd() * 6;
      const h = 12 + T.rnd() * 10;
      const pick = T.rnd();
      const tex = (pick < 0.45 ? brickA : pick < 0.8 ? brickB : conc).clone();
      tex.needsUpdate = true;
      tex.repeat.set(w / 3, h / 3);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      box(4, h, w, mat, s * (AW / 2 + 2), h / 2, z + w / 2, group);
      segs.push({ s, z, w, h });
      z += w;
    }
  }
  // 막다른 벽
  const endTex = brickB.clone();
  endTex.needsUpdate = true;
  endTex.repeat.set(3, 5);
  box(AW + 8, 16, 1, new THREE.MeshLambertMaterial({ map: endTex }), 0, 8, z1 + 0.5, group);
  // 골목 입구 너머 큰길(밝음)
  const street = floor([60, 14], new THREE.MeshLambertMaterial({ color: 0x55575c }), 10);
  street.position.set(0, -0.002, z0 - 7);
  group.add(street);
  const far = T.facade({ wall: '#9aa0a8', glass: '#2a3544', lit: 0.4 });
  far.repeat.set(6, 3);
  box(60, 24, 2, new THREE.MeshLambertMaterial({ map: far }), 0, 12, z0 - 16, group);

  // 배관, 실외기, 비상계단, 전선
  const metal = new THREE.MeshLambertMaterial({ color: 0x6d7378 });
  const rust = new THREE.MeshLambertMaterial({ color: 0x6b4a36 });
  const acMat = new THREE.MeshLambertMaterial({ color: 0xc9cbc6 });
  for (const sg of segs) {
    const x = sg.s * (AW / 2 + 0.06);
    if (T.rnd() < 0.7) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, sg.h, 8), T.rnd() < 0.5 ? metal : rust);
      pipe.position.set(x + sg.s * 0.05, sg.h / 2, sg.z + 0.5 + T.rnd() * (sg.w - 1));
      group.add(pipe);
    }
    for (let k = 0; k < 2; k++) {
      if (T.rnd() < 0.55) {
        const y = 2.5 + T.rnd() * 6;
        box(0.45, 0.6, 0.8, acMat, x - sg.s * 0.2, y, sg.z + 1 + T.rnd() * (sg.w - 2), group);
      }
    }
    if (T.rnd() < 0.35 && sg.w > 6) {
      // 비상계단 층
      for (let fl = 1; fl <= 3; fl++) {
        const y = fl * 3.2;
        box(0.9, 0.06, 2.6, metal, x - sg.s * 0.45, y, sg.z + sg.w / 2, group);
        box(0.04, 0.9, 2.6, metal, x - sg.s * 0.88, y + 0.45, sg.z + sg.w / 2, group);
      }
    }
  }
  // 전선
  const wireMat = new THREE.LineBasicMaterial({ color: 0x111111 });
  for (let i = 0; i < 7; i++) {
    const z = z0 + 5 + i * 7 + T.rnd() * 3;
    const y = 6 + T.rnd() * 4;
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      pts.push(new THREE.Vector3(-AW / 2 + AW * t, y - Math.sin(t * Math.PI) * 0.7, z + (T.rnd() - 0.5) * 0.05));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }
  // 벽등 + 간판
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    const z = z0 + 6 + i * 8;
    box(0.15, 0.2, 0.3, lampMat, s * (AW / 2 - 0.1), 3.2, z, group);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffa040, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture() }));
    glow.position.set(s * (AW / 2 - 0.4), 3.2, z);
    glow.scale.setScalar(1.6);
    group.add(glow);
  }
  const signs = [['포장마차', '#ff5a8a'], ['노래방', '#5ad8ff'], ['24시 국밥', '#ffd25a']];
  signs.forEach(([t, c], i) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), new THREE.MeshBasicMaterial({ map: T.sign(t, '#120e14', c), fog: true }));
    const s = i % 2 ? 1 : -1;
    mesh.position.set(s * (AW / 2 - 0.02), 4.5 + i * 0.6, z0 + 10 + i * 12);
    mesh.rotation.y = -s * Math.PI / 2;
    group.add(mesh);
  });

  // 파괴 가능한 소품: 쓰레기 컨테이너, 상자, 드럼통, 쓰레기봉투
  const dumpMat = new THREE.MeshLambertMaterial({ color: 0x2f5a3c });
  const dumpLid = new THREE.MeshLambertMaterial({ color: 0x1d2a22 });
  for (const [x, z] of [[-1.7, 4], [1.6, -14]]) {
    const g = new THREE.Group();
    box(1.0, 1.1, 1.8, dumpMat, 0, -0.04, 0, g);
    box(1.05, 0.08, 1.85, dumpLid, 0, 0.55, 0, g);
    g.position.set(x, 0.59, z);
    group.add(g);
    ctx.world.addProp(g, { radius: 0.85, halfH: 0.59, mass: 12, hp: 160, color: 0x2f5a3c });
  }
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x8b6a44 });
  const barrelMat = new THREE.MeshLambertMaterial({ color: 0x3a5f8a });
  const bagMat = new THREE.MeshLambertMaterial({ color: 0x15161a });
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), crateMat);
    c.position.set(1.8 - (i % 2) * 0.65, 0.3 + Math.floor(i / 4) * 0.6, 8 + (i % 4) * 0.62);
    c.rotation.y = (T.rnd() - 0.5) * 0.4;
    group.add(c);
    ctx.world.addProp(c, { radius: 0.32, mass: 1.5, hp: 25, color: 0x8b6a44 });
  }
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), barrelMat);
    b.position.set(-1.9 + (i % 2) * 0.62, 0.45, -6 - Math.floor(i / 2) * 0.65);
    group.add(b);
    ctx.world.addProp(b, { radius: 0.36, mass: 3, hp: 40, color: 0x3a5f8a });
  }
  for (let i = 0; i < 6; i++) {
    const g = new THREE.IcosahedronGeometry(0.3, 1);
    const b = new THREE.Mesh(g, bagMat);
    b.scale.set(1, 0.75, 1);
    b.position.set(-1.6 + T.rnd() * 0.6, 0.22, -2 + i * 0.5 + T.rnd() * 0.2);
    group.add(b);
    ctx.world.addProp(b, { radius: 0.26, mass: 0.8, hp: 8, color: 0x15161a });
  }
  return {
    id: 'alley',
    group,
    sky: makeSky({ top: 0x0b1028, hor: 0x5a3a5a, bot: 0x14121a, sun: [0, 0.1, -1], sunCol: 0xff9a60, sunSize: 30 }),
    fog: { color: 0x2c2636, near: 14, far: 90 },
    hemi: { sky: 0xa0a8d8, ground: 0x3a3236, intensity: 1.8 },
    sun: { color: 0xffb07a, intensity: 1.2, pos: [-6, 20, -40] },
    exposure: 1.25,
    bounds: { minX: -AW / 2 + 0.4, maxX: AW / 2 - 0.4, minZ: z0 - 4, maxZ: z1 - 1 },
    spawn: new THREE.Vector3(0, 0, 14),
  };
}

export const BACKGROUNDS = {
  white: { label: '하얀 방', build: buildWhiteRoom },
  city: { label: '도시', build: buildCity },
  alley: { label: '골목', build: buildAlley },
};
