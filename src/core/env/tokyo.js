// 도쿄 맵: 시부야 스크램블 교차로(해 질 녘) · 신주쿠 유흥가(밤) · 오피스가(낮) · 뒷골목(밤)
// 모두 1 유닛 = 1m. 정적인 기하는 재질별로 합쳐(Batch) 드로우콜을 줄인다.
import * as THREE from 'three';
import * as R from './realism.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ───────────────── 공용 키트 ─────────────────
const WALLS = {
  beige: [0.78, 0.72, 0.62],
  gray: [0.6, 0.61, 0.62],
  white: [0.86, 0.86, 0.84],
  brown: [0.5, 0.38, 0.3],
  dark: [0.3, 0.31, 0.33],
  cream: [0.88, 0.84, 0.74],
};

/** 건물 재질 묶음 (시간대에 따라 창 불빛 세기) */
function facadeMats(light) {
  const e = light === 'night' ? 1.4 : light === 'dusk' ? 0.9 : 0.0;
  const mk = (style, wall, lit) => {
    const m = R.pbrMat(R.facadeSet(style, wall, lit), { emissive: e, normal: 0.8 });
    if (style === 'glass') {
      m.metalness = 0.35;
      m.envMapIntensity = 1.4;
    }
    return m;
  };
  return {
    glassBlue: mk('glass', WALLS.dark, light === 'day' ? 0.2 : 0.6),
    glassGray: mk('glass', WALLS.gray, light === 'day' ? 0.2 : 0.55),
    office: mk('office', WALLS.gray, 0.5),
    officeW: mk('office', WALLS.white, 0.45),
    tileBeige: mk('tile', WALLS.beige, 0.4),
    tileBrown: mk('tile', WALLS.brown, 0.45),
    apt: mk('apt', WALLS.cream, 0.5),
    conc: mk('concrete', [0.62, 0.62, 0.6], 0.35),
    shop: mk('glass', WALLS.dark, 1),
    shopWarm: mk('glass', WALLS.brown, 1),
  };
}

function roofMats() {
  return {
    roof: R.pbrMat(R.concreteSet(0.5), { normal: 0.8 }),
    parapet: R.pbrMat(R.concreteSet(0.66)),
    unit: new THREE.MeshStandardMaterial({ color: 0xbfc3c6, roughness: 0.5, metalness: 0.4 }),
    tank: new THREE.MeshStandardMaterial({ color: 0x8fa0a8, roughness: 0.45, metalness: 0.6 }),
  };
}

/**
 * 건물 한 채: 1층 상가(유리 + 간판) + 위층 정면 + 옥상 설비 + 돌출 세로 간판
 * spec: { x, z, w, d, h, rotY, mat, shop?, signs?: [text...], vSigns?: [{ text, bg, fg }], roof? }
 * front = 로컬 +Z 면 (길 쪽)
 */
function building(B, atlas, F, RM, spec) {
  const { x, z, w, d, h, rotY = 0 } = spec;
  const m4 = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  const shopH = spec.shop === false ? 0 : 4.2;
  const bay = spec.bay ?? (spec.mat === F.glassBlue || spec.mat === F.glassGray ? 3 : 4);
  const g = R.buildingGeo(w, h, d, { bay, floorH: spec.floorH ?? 3.5, groundH: shopH, uOff: Math.floor(R.rnd() * 8), vOff: Math.floor(R.rnd() * 8) });
  B.add(spec.mat, g.sides, m4);
  B.add(RM.roof, g.top, m4);
  if (shopH > 0) {
    const s = R.buildingGeo(w, shopH, d, { bay: 3, floorH: shopH, uOff: Math.floor(R.rnd() * 4) });
    B.add(R.rnd() < 0.5 ? F.shop : F.shopWarm, s.sides, m4);
    // 1층과 위층 사이 처마
    B.add(RM.parapet, new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3).translate(0, shopH, 0), m4);
  }
  // 옥상 난간 · 실외기 · 물탱크
  if (spec.roof !== false) {
    for (const [px, pz, pw, pd] of [[0, d / 2, w, 0.25], [0, -d / 2, w, 0.25], [w / 2, 0, 0.25, d], [-w / 2, 0, 0.25, d]]) B.add(RM.parapet, new THREE.BoxGeometry(pw, 1.0, pd).translate(px, h + 0.5, pz), m4);
    const n = 1 + Math.floor(R.rnd() * 4);
    for (let i = 0; i < n; i++) B.add(RM.unit, new THREE.BoxGeometry(1.2, 0.9, 0.8).translate((R.rnd() - 0.5) * (w - 2), h + 0.45, (R.rnd() - 0.5) * (d - 2)), m4);
    if (R.rnd() < 0.4) {
      B.add(RM.tank, new THREE.CylinderGeometry(1, 1, 2, 14).translate((R.rnd() - 0.5) * (w - 3), h + 2.4, (R.rnd() - 0.5) * (d - 3)), m4);
      B.add(RM.unit, new THREE.BoxGeometry(2.2, 1.4, 2.2).translate(0, h + 0.7, 0), m4);
    }
  }
  // 1층 가로 간판
  if (atlas && spec.signs) {
    spec.signs.forEach((sg, i) => {
      const rect = atlas.add(sg.text, sg);
      if (!rect) return;
      const sw = Math.min(w * 0.8, 5.5);
      const geo = atlas.plane(rect, sw, sw / rect.aspect).translate((i - (spec.signs.length - 1) / 2) * (w / spec.signs.length), shopH - 0.9, d / 2 + 0.06);
      B.add(atlas.mat, geo, m4);
    });
  }
  // 돌출 세로 간판 (일본 상가의 상징)
  if (atlas && spec.vSigns) {
    spec.vSigns.forEach((sg, i) => {
      const rect = atlas.add(sg.text, { ...sg, vertical: true });
      if (!rect) return;
      const sh = sg.h ?? Math.min(h - shopH - 1.5, 1.6 + [...sg.text].length * 1.0);
      const sw = sh * rect.aspect;
      const side = i % 2 ? 1 : -1;
      const px = side * (w / 2 - 0.4);
      const py = shopH + 0.6 + sh / 2 + (i >> 1) * 0.4;
      const pz = d / 2 + sw / 2 + 0.15;
      // 양면 (뒷면은 글자가 뒤집히지 않게 UV 반전)
      const front = atlas.plane(rect, sw, sh).rotateY(Math.PI / 2).translate(px + 0.06, py, pz);
      const back = atlas.plane(rect, sw, sh).rotateY(-Math.PI / 2).translate(px - 0.06, py, pz);
      B.add(atlas.mat, front, m4);
      B.add(atlas.mat, back, m4);
      B.add(R.MAT.metalDark, new THREE.BoxGeometry(0.1, sh + 0.2, sw + 0.1).translate(px, py, pz), m4);
    });
  }
}

/** 보도 + 연석 + 점자 블록 (축 정렬 직사각형) */
function sidewalk(group, B, mats, x0, z0, x1, z1, { tactile = true, axis = 'z' } = {}) {
  const w = x1 - x0;
  const d = z1 - z0;
  const top = R.ground(w, d, mats.paver, 1, (x0 + x1) / 2, (z0 + z1) / 2, 0.15);
  group.add(top);
  // 연석 옆면
  B.add(mats.curb, new THREE.BoxGeometry(w, 0.15, d).translate((x0 + x1) / 2, 0.075, (z0 + z1) / 2));
  if (tactile) {
    const tw = 0.3;
    const g = axis === 'z' ? R.ground(tw, d, mats.tactile, 0.3, x0 + w * 0.35, (z0 + z1) / 2, 0.152, 1) : R.ground(w, tw, mats.tactile, 0.3, (x0 + x1) / 2, z0 + d * 0.35, 0.152, 1);
    group.add(g);
  }
}

function streetMats(wet) {
  return {
    asphalt: R.pbrMat(R.asphaltSet(wet), { normal: 1, env: wet ? 1.6 : 1 }),
    paver: R.pbrMat(R.paverSet('gray'), { normal: 1 }),
    paverRed: R.pbrMat(R.paverSet('red'), { normal: 1 }),
    tactile: R.pbrMat(R.tactileSet(), { normal: 1 }),
    curb: R.pbrMat(R.concreteSet(0.7)),
    paint: R.roadPaint(),
  };
}

/** 횡단보도 (줄무늬). from→to 방향으로 건너는 줄 */
function crosswalk(B, paint, cx, cz, len, width, rotY) {
  const n = Math.floor(len / 0.9);
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * 0.9;
    B.add(paint, R.stripe(0, 0, 0.45, width, 0).translate(t, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(rotY).setPosition(cx, 0, cz)));
  }
}

/** 가로수 (느티나무): 줄기 + 잎 덩어리 */
let _treeMats = null;
function tree(B, x, z, s = 1) {
  if (!_treeMats) {
    _treeMats = {
      bark: new THREE.MeshStandardMaterial({ color: 0x4a3a2e, roughness: 0.95 }),
      leaf: R.pbrMat(R.concreteSet(0.4), { color: 0x6f9a48, normal: 2 }),
      leaf2: R.pbrMat(R.concreteSet(0.4), { color: 0x55803a, normal: 2 }),
    };
  }
  B.add(_treeMats.bark, new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 3.2 * s, 8).translate(x, 1.6 * s, z));
  for (let i = 0; i < 5; i++) {
    const r = (1.1 + R.rnd() * 0.6) * s;
    const geo = new THREE.IcosahedronGeometry(r, 1).translate(x + (R.rnd() - 0.5) * 1.6 * s, (3.4 + R.rnd() * 1.6) * s, z + (R.rnd() - 0.5) * 1.6 * s);
    B.add(i % 2 ? _treeMats.leaf : _treeMats.leaf2, geo);
  }
}

/** 택시·승용차 (파괴 가능한 소품) */
function car(ctx, group, x, z, rotY, color, taxi = false) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.05, metalness: 0.9 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const add = (geo, mat, px, py, pz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(1.7, 0.7, 4.4), body, 0, -0.15, 0);
  add(new THREE.BoxGeometry(1.55, 0.55, 2.3), glass, 0, 0.45, -0.15);
  add(new THREE.BoxGeometry(1.5, 0.06, 2.1), body, 0, 0.74, -0.15);
  for (const [px, pz] of [[0.78, 1.4], [-0.78, 1.4], [0.78, -1.4], [-0.78, -1.4]]) add(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16).rotateZ(Math.PI / 2), tire, px, -0.47, pz);
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 1.5 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0xff1010, emissiveIntensity: 1.2 });
  add(new THREE.BoxGeometry(0.35, 0.12, 0.05), head, 0.55, -0.05, 2.21);
  add(new THREE.BoxGeometry(0.35, 0.12, 0.05), head, -0.55, -0.05, 2.21);
  add(new THREE.BoxGeometry(0.3, 0.12, 0.05), tail, 0.6, 0.0, -2.21);
  add(new THREE.BoxGeometry(0.3, 0.12, 0.05), tail, -0.6, 0.0, -2.21);
  if (taxi) add(new THREE.BoxGeometry(0.5, 0.18, 0.22), new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffd060, emissiveIntensity: 1 }), 0, 0.86, 0);
  g.position.set(x, 0.8, z);
  g.rotation.y = rotY;
  group.add(g);
  ctx.world.addProp(g, { radius: 1.3, halfH: 0.8, mass: 25, hp: 260, color });
}

/** 파괴 가능한 작은 소품 (쓰레기통 · 콘 · 자전거 대신 상자) */
function props(ctx, group, list) {
  const bin = new THREE.MeshStandardMaterial({ color: 0x5a6a6e, roughness: 0.5, metalness: 0.5 });
  const cone = new THREE.MeshStandardMaterial({ color: 0xff5a10, roughness: 0.5 });
  const crate = new THREE.MeshStandardMaterial({ color: 0x2c5fa8, roughness: 0.6 });
  for (const [kind, x, z] of list) {
    let m;
    if (kind === 'bin') {
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.25, 0.9, 14), bin);
      m.position.set(x, 0.45 + 0.15, z);
      ctx.world.addProp(m, { radius: 0.32, mass: 2, hp: 30, color: 0x5a6a6e });
    } else if (kind === 'cone') {
      m = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.7, 12), cone);
      m.position.set(x, 0.35, z);
      ctx.world.addProp(m, { radius: 0.2, mass: 0.6, hp: 10, color: 0xff5a10 });
    } else {
      // 맥주 상자 (플라스틱)
      m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.36), crate);
      m.position.set(x, 0.16 + 0.15, z);
      ctx.world.addProp(m, { radius: 0.26, mass: 1, hp: 15, color: 0x2c5fa8 });
    }
    m.castShadow = true;
    group.add(m);
  }
}

const SHOP_SIGNS = [
  ['ラーメン', '#c8102e', '#fff4d0'], ['カラオケ', '#101060', '#5ad8ff'], ['居酒屋', '#2a1208', '#ffb040'], ['焼肉', '#101010', '#ff4030'],
  ['寿司', '#f4efe2', '#1a1a1a'], ['薬', '#0a6a3a', '#ffffff'], ['書店', '#1a2a6a', '#ffffff'], ['珈琲', '#3a2414', '#f0d8b0'],
  ['牛丼', '#ff7a00', '#ffffff'], ['ゲーム', '#202020', '#ff3af0'], ['眼鏡', '#ffffff', '#1a3a8a'], ['不動産', '#0a3a6a', '#ffffff'],
  ['うどん', '#f5e9c8', '#7a2a10'], ['バー', '#100810', '#ff5a8a'], ['餃子', '#c81010', '#ffe080'], ['靴', '#202428', '#ffffff'],
];
const V_SIGNS = [
  ['カラオケ', '#ffd000', '#d0001a'], ['居酒屋', '#c8102e', '#ffffff'], ['焼肉', '#101010', '#ff7020'], ['漫画喫茶', '#1050c0', '#ffffff'],
  ['ホテル', '#2a0a3a', '#ff7af0'], ['ラーメン', '#ffffff', '#c8102e'], ['中華料理', '#c81010', '#ffe080'], ['美容室', '#f2f2f2', '#d0306a'],
  ['歯科', '#ffffff', '#1a6ac0'], ['麻雀', '#0a5a2a', '#ffffff'], ['パーラー', '#ff3a7a', '#ffffff'], ['英会話', '#ffffff', '#1a3a8a'],
  ['焼鳥', '#2a1208', '#ffb040'], ['整骨院', '#ffffff', '#0a7a3a'], ['質屋', '#101010', '#ffd060'], ['回転寿司', '#1a3a8a', '#ffffff'],
];
const sg = (a) => ({ text: a[0], bg: a[1], fg: a[2] });

function lightsFor(time) {
  if (time === 'day') return { hemi: { sky: 0xcfe0ff, ground: 0x6a6660, intensity: 1.0 }, sun: { color: 0xfff1dc, intensity: 3.0 }, exposure: 0.75 };
  if (time === 'dusk') return { hemi: { sky: 0xffb08a, ground: 0x3a3030, intensity: 0.7 }, sun: { color: 0xffa060, intensity: 2.2 }, exposure: 0.85 };
  return { hemi: { sky: 0x6070a0, ground: 0x201820, intensity: 0.45 }, sun: { color: 0x9aa8ff, intensity: 0.25 }, exposure: 1.1 };
}

function finish(group, B, bg) {
  B.build(group);
  group.traverse((o) => {
    if (o.isMesh && !o.userData.isProp) o.receiveShadow = true;
  });
  return bg;
}

// ───────────────── 시부야 스크램블 교차로 (해 질 녘) ─────────────────
export function buildShibuya(ctx) {
  R.seed(109);
  const group = new THREE.Group();
  const B = new R.Batch();
  const S = streetMats(false);
  const F = facadeMats('dusk');
  const RM = roofMats();
  const atlas = new R.SignAtlas(2048, 8, 16);
  const screens = [];
  // 땅: 교차로 + 네 갈래 길
  group.add(R.ground(240, 240, S.asphalt, 4, 0, 0, 0));
  const RW = 22; // 길 폭
  const SW = 6; // 보도 폭
  const L = 110;
  // 네 모퉁이 보도 (교차로 주변 블록)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx > 0 ? RW / 2 : -RW / 2 - SW;
      const z0 = sz > 0 ? RW / 2 : -L;
      sidewalk(group, B, S, x0, z0, x0 + SW, sz > 0 ? L : -RW / 2, { axis: 'z' });
      const zz0 = sz > 0 ? RW / 2 : -RW / 2 - SW;
      const xx0 = sx > 0 ? RW / 2 + SW : -L;
      sidewalk(group, B, S, xx0, zz0, sx > 0 ? L : -RW / 2 - SW, zz0 + SW, { axis: 'x' });
    }
  }
  // 스크램블: 네 변 + 두 대각선
  const cw = 5;
  crosswalk(B, S.paint, 0, -RW / 2 - 0.5 + cw / 2 - 2.5, RW, cw, 0);
  crosswalk(B, S.paint, 0, RW / 2 + 0.5 - cw / 2 + 2.5, RW, cw, 0);
  crosswalk(B, S.paint, -RW / 2 - 0.5 + cw / 2 - 2.5, 0, RW, cw, Math.PI / 2);
  crosswalk(B, S.paint, RW / 2 + 0.5 - cw / 2 + 2.5, 0, RW, cw, Math.PI / 2);
  crosswalk(B, S.paint, 0, 0, RW * 1.3, 4, Math.PI / 4);
  crosswalk(B, S.paint, 0, 0, RW * 1.3, 4, -Math.PI / 4);
  // 정지선 · 차선
  for (const [x, z, w, d] of [[-RW / 4, -RW / 2 - 6, RW / 2, 0.4], [RW / 4, RW / 2 + 6, RW / 2, 0.4], [-RW / 2 - 6, RW / 4, 0.4, RW / 2], [RW / 2 + 6, -RW / 4, 0.4, RW / 2]]) B.add(S.paint, R.stripe(x, z, w, d));
  for (let t = RW / 2 + 9; t < L; t += 8) {
    for (const s of [-1, 1]) {
      B.add(S.paint, R.stripe(0, s * t, 0.15, 3.5));
      B.add(S.paint, R.stripe(s * t, 0, 3.5, 0.15));
      for (const o of [-RW / 4, RW / 4]) {
        B.add(S.paint, R.stripe(o, s * t, 0.12, 3));
        B.add(S.paint, R.stripe(s * t, o, 3, 0.12));
      }
    }
  }
  // 모퉁이 건물들 (교차로를 향한 랜드마크)
  const corner = (cx, cz, rot, spec) => building(B, atlas, F, RM, { x: cx, z: cz, rotY: rot, ...spec });
  const off = RW / 2 + SW;
  // 북동: 유리 커튼월 + 대형 전광판 3장
  corner(off + 10, -off - 9, -Math.PI / 4, { w: 20, d: 18, h: 42, mat: F.glassBlue, signs: [sg(SHOP_SIGNS[6])] });
  // 북서: 타일 건물 + 전광판
  corner(-off - 11, -off - 10, Math.PI / 4, { w: 22, d: 20, h: 34, mat: F.tileBrown, signs: [sg(SHOP_SIGNS[1]), sg(SHOP_SIGNS[8])], vSigns: [sg(V_SIGNS[0]), sg(V_SIGNS[3])] });
  // 남동: 둥근 탑 (은빛 원통)
  const towerMat = R.pbrMat(R.facadeSet('glass', WALLS.gray, 0.6), { emissive: 0.9 });
  towerMat.metalness = 0.5;
  const tower = new THREE.CylinderGeometry(9, 9, 46, 40, 1, true);
  const tuv = tower.attributes.uv;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * 18, tuv.getY(i) * 13);
  B.add(towerMat, tower.translate(off + 10, 23, off + 10));
  B.add(RM.roof, new THREE.CircleGeometry(9, 40).rotateX(-Math.PI / 2).translate(off + 10, 46, off + 10));
  // 남서: 역 광장 (나무 · 벤치) + 고가 철도
  for (let i = 0; i < 6; i++) tree(B, -off - 6 - (i % 3) * 5, off + 6 + Math.floor(i / 3) * 6, 1.1);
  const plaza = R.ground(30, 26, S.paverRed, 1, -off - 15, off + 13, 0.155, 2);
  group.add(plaza);
  // 고가 철도 (서쪽)
  const viaduct = R.pbrMat(R.concreteSet(0.6));
  const vx = -off - 32;
  B.add(viaduct, new THREE.BoxGeometry(14, 1.6, 200).translate(vx, 8.5, 0));
  for (let z = -95; z <= 95; z += 12) for (const s of [-1, 1]) B.add(viaduct, new THREE.BoxGeometry(1.4, 8, 1.4).translate(vx + s * 5, 4, z));
  // 전철 (연두색 띠를 두른 은색 차량)
  const trainBody = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.3, metalness: 0.8 });
  const trainLine = new THREE.MeshStandardMaterial({ color: 0x7ac943, roughness: 0.4 });
  const trainWin = R.pbrMat(R.facadeSet('glass', WALLS.gray, 1), { emissive: 1.2 });
  for (let k = 0; k < 6; k++) {
    const z = -60 + k * 20.5;
    B.add(trainBody, new THREE.BoxGeometry(2.9, 3.2, 20).translate(vx - 2.5, 11, z));
    B.add(trainLine, new THREE.BoxGeometry(2.95, 0.35, 20).translate(vx - 2.5, 10.2, z));
    const win = R.buildingGeo(2.92, 12.3, 19.6, { bay: 2.5, floorH: 1.2, groundH: 11.1 });
    B.add(trainWin, win.sides, new THREE.Matrix4().makeTranslation(vx - 2.5, 0, z));
  }
  // 대로변 건물 줄
  const mats = [F.office, F.officeW, F.tileBeige, F.tileBrown, F.apt, F.conc, F.glassGray];
  let si = 0;
  let vi = 0;
  const row = (axis, sign) => {
    let t = off + 26;
    while (t < L - 6) {
      const w = 9 + R.rnd() * 10;
      const d = 14 + R.rnd() * 6;
      const h = 14 + R.rnd() * R.rnd() * 40;
      const tc = t + w / 2;
      t += w + 0.4;
      for (const side of [-1, 1]) {
        const nS = 1 + Math.floor(R.rnd() * 2);
        const signs = [];
        for (let k = 0; k < nS; k++) signs.push(sg(SHOP_SIGNS[si++ % SHOP_SIGNS.length]));
        const vSigns = R.rnd() < 0.6 ? [sg(V_SIGNS[vi++ % V_SIGNS.length])] : [];
        if (axis === 'z') building(B, atlas, F, RM, { x: side * (off + d / 2), z: sign * tc, w, d, h, rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2, mat: R.pick(mats), signs, vSigns });
        else building(B, atlas, F, RM, { x: sign * tc, z: side * (off + d / 2), w, d, h, rotY: side > 0 ? Math.PI : 0, mat: R.pick(mats), signs, vSigns });
      }
    }
  };
  row('z', -1);
  row('z', 1);
  row('x', 1);
  // 대형 전광판 (모퉁이 건물 벽면)
  const screenAt = (w, h, x, y, z, rotY, k) => {
    const sc = new R.LedScreen(384, Math.round((384 * h) / w), k);
    screens.push(sc);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sc.mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    group.add(m);
    // 테두리
    B.add(R.MAT.black, new THREE.BoxGeometry(w + 0.6, h + 0.6, 0.3).applyMatrix4(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.2))));
  };
  const ne = V(off + 10, 0, -off - 9);
  const neF = V(-Math.SQRT1_2, 0, Math.SQRT1_2); // 교차로를 향한 면
  screenAt(13, 7.5, ne.x + neF.x * 9.4, 24, ne.z + neF.z * 9.4, -Math.PI / 4, 1);
  screenAt(10, 5.6, ne.x + neF.x * 9.4, 14, ne.z + neF.z * 9.4, -Math.PI / 4, 2);
  const nw = V(-off - 11, 0, -off - 10);
  screenAt(12, 7, nw.x + Math.SQRT1_2 * 10.4, 22, nw.z + Math.SQRT1_2 * 10.4, Math.PI / 4, 3);
  screenAt(8, 4.5, off + 10 - 9.3 * Math.SQRT1_2, 30, off + 10 - 9.3 * Math.SQRT1_2, -Math.PI * 0.75, 4);
  // 신호등 · 가로등 · 가드레일 · 자판기 · 전봇대
  for (const [x, z, r] of [[off - 1, off - 1, Math.PI], [-off + 1, off - 1, -Math.PI / 2], [-off + 1, -off + 1, 0], [off - 1, -off + 1, Math.PI / 2]]) R.trafficSignal(B, x, z, { rotY: r, armLen: 5, state: 'red' });
  for (let t = off + 8; t < L; t += 14) {
    for (const s of [-1, 1]) {
      R.streetLight(B, s * (RW / 2 + 0.6), t * (s > 0 ? 1 : -1), s > 0 ? Math.PI : 0);
      R.streetLight(B, t * (s > 0 ? 1 : -1), s * (RW / 2 + 0.6), s > 0 ? Math.PI / 2 : -Math.PI / 2);
      R.guardRail(B, s * (RW / 2 + 0.35), t, s * (RW / 2 + 0.35), t + 8);
      R.guardRail(B, s * (RW / 2 + 0.35), -t, s * (RW / 2 + 0.35), -t - 8);
    }
  }
  R.vendingMachine(B, off + 4.8, off + 2, -Math.PI / 2, 0xf2f2f2);
  R.vendingMachine(B, off + 4.8, off + 3.1, -Math.PI / 2, 0xc8102e);
  R.vendingMachine(B, -off - 4.6, -off - 14, Math.PI / 2, 0x1a5ac0);
  // 차 · 택시 (멈춘 신호에 서 있는 차)
  car(ctx, group, -RW / 4, -RW / 2 - 9, 0, 0x1a1a1a, true);
  car(ctx, group, -RW / 4 - 3.2, -RW / 2 - 9.5, 0, 0xe8e8e8);
  car(ctx, group, RW / 4, RW / 2 + 9, Math.PI, 0xffd000, true);
  car(ctx, group, RW / 2 + 9, -RW / 4, -Math.PI / 2, 0x7a1818);
  car(ctx, group, -RW / 2 - 9, RW / 4, Math.PI / 2, 0x2a3a5a);
  props(ctx, group, [['bin', off - 1.2, off + 4], ['bin', -off + 1.2, -off - 4], ['cone', 3, -RW / 2 - 7], ['cone', 4.5, -RW / 2 - 7], ['crate', off + 4.5, off + 6], ['crate', off + 4.5, off + 6.5]]);
  const sky = R.physicalSky({ elevation: 1.5, azimuth: 250, turbidity: 10, rayleigh: 3, mie: 0.008, mieG: 0.9 });
  const lt = lightsFor('dusk');
  return finish(group, B, {
    id: 'shibuya',
    bright: false,
    group,
    sky,
    fog: { color: 0xc89a8a, near: 60, far: 320 },
    hemi: lt.hemi,
    sun: { ...lt.sun, pos: sky.userData.sunDir.clone().multiplyScalar(100).toArray() },
    exposure: lt.exposure,
    capture: true,
    shadows: true,
    bounds: { minX: -off + 0.5, maxX: off - 0.5, minZ: -L + 6, maxZ: L - 6 },
    spawn: V(RW / 2 + 2, 0, RW / 2 + 3),
    update: (dt) => screens.forEach((s) => s.update(dt)),
  });
}

// ───────────────── 신주쿠 유흥가 (밤, 젖은 거리) ─────────────────
export function buildShinjuku(ctx) {
  R.seed(1660);
  const group = new THREE.Group();
  const B = new R.Batch();
  const S = streetMats(true);
  const F = facadeMats('night');
  const RM = roofMats();
  const atlas = new R.SignAtlas(2048, 8, 16);
  const W = 11; // 길 폭
  const SWW = 2.5;
  const L = 130;
  group.add(R.ground(W + SWW * 2 + 40, L + 60, S.asphalt, 4, 0, -L / 2 + 10, 0));
  for (const s of [-1, 1]) sidewalk(group, B, S, s > 0 ? W / 2 : -W / 2 - SWW, -L, s > 0 ? W / 2 + SWW : -W / 2, 20, { tactile: false });
  // 차선 없는 보행자 거리: 가운데 점선
  for (let z = -L; z < 18; z += 4) B.add(S.paint, R.stripe(0, z, 0.12, 1.6));
  // 입구 아치 (붉은 철골 + 빛나는 글자)
  const red = new THREE.MeshStandardMaterial({ color: 0xc8101e, roughness: 0.4, metalness: 0.5, emissive: 0x400004 });
  for (const s of [-1, 1]) B.add(red, new THREE.CylinderGeometry(0.25, 0.3, 7.5, 12).translate(s * (W / 2 - 0.3), 3.75, 12));
  B.add(red, new THREE.BoxGeometry(W + 0.6, 0.5, 0.5).translate(0, 7.6, 12));
  const archRect = atlas.add('一番街', { bg: '#1a0004', fg: '#ff3040', border: '#ff9a9a' });
  if (archRect) {
    B.add(atlas.mat, atlas.plane(archRect, 6, 6 / archRect.aspect).translate(0, 6.6, 12.28));
    B.add(atlas.mat, atlas.plane(archRect, 6, 6 / archRect.aspect).rotateY(Math.PI).translate(0, 6.6, 11.72));
  }
  // 빽빽한 건물 + 간판
  const mats = [F.tileBeige, F.tileBrown, F.conc, F.office, F.apt, F.glassGray];
  let si = 3;
  let vi = 0;
  for (const side of [-1, 1]) {
    let z = 8;
    while (z > -L) {
      const w = 7 + R.rnd() * 7;
      const d = 14;
      const h = 12 + R.rnd() * 26;
      const zc = z - w / 2;
      z -= w + 0.2;
      const vSigns = [];
      const nV = 1 + Math.floor(R.rnd() * 3);
      for (let k = 0; k < nV; k++) vSigns.push(sg(V_SIGNS[vi++ % V_SIGNS.length]));
      building(B, atlas, F, RM, { x: side * (W / 2 + SWW + d / 2), z: zc, w, d, h, rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2, mat: R.pick(mats), signs: [sg(SHOP_SIGNS[si++ % SHOP_SIGNS.length])], vSigns });
    }
  }
  // 막다른 끝의 큰 전광판 빌딩
  building(B, atlas, F, RM, { x: 0, z: -L - 10, w: 40, d: 16, h: 50, mat: F.glassBlue, signs: [sg(SHOP_SIGNS[1])] });
  const screen = new R.LedScreen(384, 216, 5);
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(18, 10.1), screen.mat);
  sm.position.set(0, 22, -L - 1.9);
  group.add(sm);
  // 가로등 · 자판기 · 맥주 상자 · 전선
  for (let z = 4; z > -L; z -= 12) {
    R.streetLight(B, -W / 2 - 0.4, z, 0, 6);
    R.streetLight(B, W / 2 + 0.4, z - 6, Math.PI, 6);
  }
  for (let i = 0; i < 4; i++) R.vendingMachine(B, (i % 2 ? 1 : -1) * (W / 2 + SWW - 0.5), -15 - i * 23, i % 2 ? -Math.PI / 2 : Math.PI / 2, [0xf2f2f2, 0xc8102e, 0x1a5ac0, 0x202020][i]);
  props(ctx, group, [['crate', -W / 2 - 1, -8], ['crate', -W / 2 - 1, -8.4], ['crate', -W / 2 - 1.4, -8.2], ['bin', W / 2 + 1, -20], ['bin', -W / 2 - 1, -40], ['cone', 1.5, -30], ['cone', -1.2, -52], ['crate', W / 2 + 1.2, -60], ['crate', W / 2 + 1.2, -60.4]]);
  car(ctx, group, 3, -70, Math.PI, 0x101010, true);
  // 네온 빛이 젖은 바닥에 번진다: 거리 곳곳의 색 조명 (몇 개만)
  const colors = [0xff3a7a, 0x3ac8ff, 0xffb040, 0xb040ff];
  for (let i = 0; i < 4; i++) {
    const pl = new THREE.PointLight(colors[i], 14, 22, 2);
    pl.position.set((i % 2 ? 1 : -1) * 4, 4.5, -10 - i * 26);
    group.add(pl);
  }
  const lt = lightsFor('night');
  return finish(group, B, {
    id: 'shinjuku',
    bright: false,
    group,
    sky: R.nightSky(0x5a2a4a),
    fog: { color: 0x2a1a2a, near: 25, far: 150 },
    hemi: lt.hemi,
    sun: { ...lt.sun, pos: [20, 60, 30] },
    exposure: lt.exposure,
    capture: true,
    shadows: false,
    bounds: { minX: -W / 2 - SWW + 0.4, maxX: W / 2 + SWW - 0.4, minZ: -L + 2, maxZ: 18 },
    spawn: V(0, 0, 14),
    update: (dt) => screen.update(dt),
  });
}

// ───────────────── 도쿄 오피스가 (낮) ─────────────────
export function buildCity(ctx) {
  R.seed(23);
  const group = new THREE.Group();
  const B = new R.Batch();
  const S = streetMats(false);
  const F = facadeMats('day');
  const RM = roofMats();
  const atlas = new R.SignAtlas(1024, 4, 8);
  const RW = 16;
  const SW = 6;
  const L = 200;
  group.add(R.ground(260, L + 60, S.asphalt, 4, 0, 0, 0));
  for (const s of [-1, 1]) sidewalk(group, B, S, s > 0 ? RW / 2 : -RW / 2 - SW, -L / 2, s > 0 ? RW / 2 + SW : -RW / 2, L / 2, { axis: 'z' });
  // 교차로 (z = -30) + 횡단보도
  crosswalk(B, S.paint, 0, -30 + RW / 2 + 2.5, RW, 4, 0);
  crosswalk(B, S.paint, 0, -30 - RW / 2 - 2.5, RW, 4, 0);
  // 중앙선(노랑) · 차선
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
  for (let z = -L / 2; z < L / 2; z += 1) if (Math.abs(z + 30) > RW / 2 + 5) B.add(yellow, R.stripe(0, z, 0.15, 1.02));
  for (let z = -L / 2; z < L / 2; z += 8) {
    if (Math.abs(z + 30) < RW / 2 + 5) continue;
    for (const x of [-RW / 4, RW / 4]) B.add(S.paint, R.stripe(x, z, 0.14, 4));
  }
  // 유리 고층 빌딩 + 사무 빌딩
  const mats = [F.glassBlue, F.glassGray, F.office, F.officeW, F.tileBeige];
  for (const side of [-1, 1]) {
    let z = -L / 2 + 6;
    while (z < L / 2 - 6) {
      const w = 16 + R.rnd() * 14;
      const zc = z + w / 2;
      z += w + 4;
      if (Math.abs(zc + 30) < w / 2 + RW / 2 + 2) continue;
      const d = 22;
      const tall = R.rnd() < 0.45;
      const h = tall ? 70 + R.rnd() * 60 : 25 + R.rnd() * 25;
      building(B, atlas, F, RM, { x: side * (RW / 2 + SW + d / 2), z: zc, w, d, h, rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2, mat: tall ? (R.rnd() < 0.5 ? F.glassBlue : F.glassGray) : R.pick(mats), signs: R.rnd() < 0.5 ? [sg(SHOP_SIGNS[Math.floor(R.rnd() * 16)])] : null, floorH: 3.8 });
    }
  }
  // 가로수 · 가로등 · 신호등 · 가드레일
  for (let z = -L / 2 + 5; z < L / 2; z += 9) {
    if (Math.abs(z + 30) < RW / 2 + 3) continue;
    for (const s of [-1, 1]) tree(B, s * (RW / 2 + 1.3), z, 1.2);
  }
  for (let z = -L / 2; z < L / 2; z += 20) for (const s of [-1, 1]) R.streetLight(B, s * (RW / 2 + 0.5), z + (s > 0 ? 10 : 0), s > 0 ? Math.PI : 0, 8);
  R.trafficSignal(B, RW / 2 + 0.5, -30 + RW / 2 + 5, { rotY: Math.PI, armLen: 6, state: 'green' });
  R.trafficSignal(B, -RW / 2 - 0.5, -30 - RW / 2 - 5, { rotY: 0, armLen: 6, state: 'green' });
  for (let z = -L / 2; z < L / 2; z += 10) for (const s of [-1, 1]) if (Math.abs(z + 30) > RW / 2 + 6) R.guardRail(B, s * (RW / 2 + 0.3), z, s * (RW / 2 + 0.3), z + 8);
  R.vendingMachine(B, RW / 2 + SW - 0.5, 8, -Math.PI / 2);
  R.vendingMachine(B, RW / 2 + SW - 0.5, 9.1, -Math.PI / 2, 0xc8102e);
  // 차
  const cols = [0x1a1a1a, 0xe8e8e8, 0x2a3a5a, 0x8a8d92, 0x7a1818, 0xffd000];
  [[-RW / 4, 12, 0], [-RW / 4, 22, 0], [RW / 4, -8, Math.PI], [RW / 4, 30, Math.PI], [-RW / 4, -55, 0], [RW / 4, 60, Math.PI]].forEach(([x, z, r], i) => car(ctx, group, x, z, r, cols[i], i === 5));
  props(ctx, group, [['bin', RW / 2 + 1.2, 4], ['bin', -RW / 2 - 1.2, -6], ['cone', -2, -12], ['cone', -0.5, -12], ['cone', 1, -12], ['crate', 3, -14], ['crate', 3.5, -14]]);
  const sky = R.physicalSky({ elevation: 48, azimuth: 150, turbidity: 4, rayleigh: 1.2 });
  const lt = lightsFor('day');
  return finish(group, B, {
    id: 'city',
    bright: true,
    group,
    sky,
    fog: { color: 0xb8c8d8, near: 80, far: 420 },
    hemi: lt.hemi,
    sun: { ...lt.sun, pos: sky.userData.sunDir.clone().multiplyScalar(100).toArray() },
    exposure: lt.exposure,
    capture: true,
    shadows: true,
    bounds: { minX: -RW / 2 - SW + 0.5, maxX: RW / 2 + SW - 0.5, minZ: -L / 2 + 5, maxZ: L / 2 - 5 },
    spawn: V(0, 0, 0),
  });
}

// ───────────────── 도쿄 뒷골목 (밤: 초롱 · 이자카야 · 젖은 바닥) ─────────────────
export function buildAlley(ctx) {
  R.seed(37);
  const group = new THREE.Group();
  const B = new R.Batch();
  const S = streetMats(true);
  const F = facadeMats('night');
  const RM = roofMats();
  const atlas = new R.SignAtlas(1024, 4, 8);
  const AW = 4.6;
  const z0 = -34;
  const z1 = 22;
  group.add(R.ground(AW + 30, z1 - z0 + 60, S.asphalt, 3, 0, (z0 + z1) / 2 - 10, 0));
  // 양옆 낮은 목조풍 가게 (2~3층)
  const wood = R.pbrMat(R.sidingSet([0.42, 0.3, 0.22]), { normal: 1 });
  const mats = [F.tileBrown, F.conc, F.apt, wood];
  const izakaya = [['焼鳥', '#2a1208', '#ffb040'], ['おでん', '#1a1a2a', '#ffe0a0'], ['酒', '#c8102e', '#ffffff'], ['もつ焼', '#101010', '#ff7a30'], ['定食', '#f4efe2', '#7a2a10'], ['串カツ', '#2a1208', '#ffd060'], ['立呑み', '#0a2a4a', '#ffffff'], ['ラーメン', '#c8102e', '#fff4d0']];
  let si = 0;
  const lanternPos = [];
  for (const side of [-1, 1]) {
    let z = z0;
    while (z < z1) {
      const w = 3.2 + R.rnd() * 3;
      const d = 8;
      const h = 6 + R.rnd() * 6;
      const zc = z + w / 2;
      z += w + 0.05;
      building(B, atlas, F, RM, { x: side * (AW / 2 + d / 2), z: zc, w, d, h, rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2, mat: R.pick(mats), signs: [sg(izakaya[si++ % izakaya.length])], vSigns: R.rnd() < 0.5 ? [sg(V_SIGNS[(si * 3) % V_SIGNS.length])] : [], floorH: 3, bay: 3 });
      lanternPos.push([side * (AW / 2 - 0.35), 2.7, zc]);
    }
  }
  // 막다른 벽 · 입구 너머 큰길 불빛
  building(B, null, F, RM, { x: 0, z: z1 + 5, w: AW + 16, d: 8, h: 16, mat: F.tileBrown, shop: false });
  building(B, null, F, RM, { x: 0, z: z0 - 22, w: 60, d: 10, h: 30, mat: F.office, shop: false });
  // 붉은 초롱 (발광)
  const lantern = new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2a10, emissiveIntensity: 2.2, roughness: 0.6 });
  lantern.userData.noShadow = true;
  for (const [x, y, z] of lanternPos) {
    B.add(lantern, new THREE.SphereGeometry(0.28, 14, 10).scale(1, 1.35, 1).translate(x, y, z));
    B.add(R.MAT.black, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10).translate(x, y + 0.38, z));
  }
  // 실외기 · 배관 · 전봇대 · 전선 · 자판기
  const ac = new THREE.MeshStandardMaterial({ color: 0xc9cbc6, roughness: 0.5, metalness: 0.3 });
  const pipe = new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.4, metalness: 0.7 });
  for (let i = 0; i < 18; i++) {
    const s = i % 2 ? 1 : -1;
    const z = z0 + 2 + i * 3;
    if (R.rnd() < 0.6) B.add(ac, new THREE.BoxGeometry(0.4, 0.6, 0.8).translate(s * (AW / 2 - 0.2), 3.6 + R.rnd() * 3, z));
    if (R.rnd() < 0.5) B.add(pipe, new THREE.CylinderGeometry(0.05, 0.05, 9, 8).translate(s * (AW / 2 - 0.08), 4.5, z + 1));
  }
  const tops = [];
  for (let z = z0 + 4; z < z1; z += 14) tops.push(R.utilityPole(B, AW / 2 - 0.35, z, { h: 9, transformer: z > 0 }));
  R.wires(group, tops, 0.6, [-0.7, 0, 0.7], V(1, 0, 0));
  R.vendingMachine(B, -AW / 2 + 0.45, 6, Math.PI / 2, 0xf2f2f2);
  R.vendingMachine(B, -AW / 2 + 0.45, 7.1, Math.PI / 2, 0x1a5ac0);
  props(ctx, group, [['crate', 1.6, 4], ['crate', 1.6, 4.4], ['crate', 1.2, 4.2], ['bin', -1.7, -6], ['bin', 1.7, -14], ['crate', -1.6, 12], ['crate', -1.6, 12.4]]);
  for (let i = 0; i < 3; i++) {
    const pl = new THREE.PointLight(0xff6030, 6, 12, 2);
    pl.position.set(0, 3, z0 + 8 + i * 16);
    group.add(pl);
  }
  const lt = lightsFor('night');
  return finish(group, B, {
    id: 'alley',
    bright: false,
    group,
    sky: R.nightSky(0x3a2a40),
    fog: { color: 0x1e1820, near: 12, far: 80 },
    hemi: { ...lt.hemi, intensity: 0.6 },
    sun: { ...lt.sun, pos: [-6, 20, -40] },
    exposure: 1.2,
    capture: true,
    shadows: false,
    bounds: { minX: -AW / 2 + 0.4, maxX: AW / 2 - 0.4, minZ: z0 - 4, maxZ: z1 - 1 },
    spawn: V(0, 0, 14),
  });
}
