// 배경: 하얀 방 / 도시 / 골목  (실제 크기 기준: 1 유닛 = 1m)
import * as THREE from 'three';
import * as T from './textures.js';
import { glowTexture } from '../fx.js';
import { getModel } from '../assets.js';
import * as R from './realism.js';
import { buildCity, buildAlley, buildShibuya, buildShinjuku } from './tokyo.js';

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
      // 무광 흰 도장 벽 (살짝 거친 결)
      o.material = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
      o.receiveShadow = true;
    }
  });
  group.add(room);
  // 바닥: 광을 낸 흰 콘크리트 (주변이 은은하게 비친다) + 이음매
  const cset = R.concreteSet(0.92);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, map: cset.map, normalMap: cset.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.22, metalness: 0, envMapIntensity: 0.9 });
  const fl = R.ground(18, 30, floorMat, 3, 0, -11, 0.012, 1); // 방 모델 자체의 바닥 위에 깐다
  group.add(fl);
  const seam = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 });
  for (let x = -9; x <= 9; x += 3) group.add(new THREE.Mesh(R.stripe(x, -11, 0.015, 30, 0, 0.014), seam));
  for (let z = -26; z <= 4; z += 3) group.add(new THREE.Mesh(R.stripe(0, z, 18, 0.015, 0, 0.014), seam));
  // 파괴 가능한 흰 큐브
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 });
  const cubeGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  for (const [sx, sz] of [[-4, -7], [5, -6], [-6, -1], [6, -12], [0, -15]]) {
    const n = 3 + Math.floor(T.rnd() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(cubeGeo, cubeMat);
      const layer = k < 3 ? 0 : 1;
      m.position.set(sx + (k % 3) * 0.65 - 0.65 + layer * 0.3, 0.3 + layer * 0.6, sz + (T.rnd() - 0.5) * 0.1);
      m.rotation.y = (T.rnd() - 0.5) * 0.3;
      m.castShadow = true;
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
    hemi: { sky: 0xffffff, ground: 0xc8ccd6, intensity: 1.3 },
    sun: { color: 0xffffff, intensity: 1.6, pos: [-6, 30, 10] },
    exposure: 0.95,
    capture: true,
    shadows: true,
    bounds: { minX: -8.4, maxX: 8.4, minZ: -25, maxZ: 3.4 },
    spawn: new THREE.Vector3(0, 0, 1),
  };
}

/** 패스스루(MR): 현실 방이 배경. 바닥엔 그림자만 받는 투명 판 */
function buildPassthrough() {
  const group = new THREE.Group();
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.35 }));
  catcher.position.y = 0.002;
  catcher.receiveShadow = true;
  group.add(catcher);
  return {
    id: 'passthrough',
    passthrough: true,
    bright: true,
    group,
    sky: new THREE.Group(),
    fog: { color: 0xffffff, near: 900, far: 5000 },
    hemi: { sky: 0xffffff, ground: 0x9a9aa2, intensity: 1.4 },
    sun: { color: 0xffffff, intensity: 1.5, pos: [-6, 30, 10] },
    exposure: 1,
    capture: false,
    shadows: true,
    bounds: null,
    spawn: new THREE.Vector3(0, 0, 0),
  };
}

export const BACKGROUNDS = {
  white: { label: '하얀 방', build: buildWhiteRoom },
  city: { label: '도쿄 오피스가', build: buildCity },
  alley: { label: '뒷골목', build: buildAlley },
  shibuya: { label: '시부야', build: buildShibuya },
  shinjuku: { label: '신주쿠', build: buildShinjuku },
  passthrough: { label: '패스스루 (현실)', build: buildPassthrough },
};
