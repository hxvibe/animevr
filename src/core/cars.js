// 자동차 소품 — "Generic passenger car pack" by Comrade1280 (Sketchfab, CC BY 4.0)
//   https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5
//   assets/models/prop_cars.glb (텍스처를 WebP 1024로 줄이고 메시를 압축함)
//  한 파일에 차 10대가 제각기 다른 방향으로 놓여 있고 바퀴는 따로 있다 → 차체마다 바퀴를 모아
//  가운데 · 바닥(y=0) · 길이 방향(+Z)을 맞춘 틀을 만들어 두고 복제해서 쓴다
import * as THREE from 'three';
import { getModel } from './assets.js';

export const CAR_FILE = 'prop_cars';
/** 차종: 모델 속 차체 이름 · 무게(kg) · 실제 길이(m, 모델을 이 길이로 맞춘다) · 이름 */
export const CARS = {
  compact: { body: /^compact.?body$/i, kg: 1050, len: 3.5, label: '경차' },
  coupe: { body: /^coupe.?body$/i, kg: 1400, len: 4.4, label: '쿠페' },
  hatchback: { body: /^hatchback.?body$/i, kg: 1200, len: 4.1, label: '해치백' },
  minivan: { body: /^minivan.?body$/i, kg: 1900, len: 4.8, label: '미니밴' },
  offroad: { body: /^offroad.?body$/i, kg: 2100, len: 4.5, label: '오프로드' },
  pickup: { body: /^pickup.?body$/i, kg: 2050, len: 5.3, label: '픽업트럭' },
  sedan: { body: /^sedan.?body$/i, kg: 1450, len: 4.7, label: '세단' },
  sport: { body: /^sport.?body$/i, kg: 1350, len: 4.4, label: '스포츠카' },
  suv: { body: /^suv.?body$/i, kg: 2000, len: 4.7, label: 'SUV' },
  wagon: { body: /^wagon.?body$/i, kg: 1550, len: 4.8, label: '왜건' },
};
export const CAR_IDS = Object.keys(CARS);

let templates = null;

function build() {
  const src = getModel(CAR_FILE);
  if (!src) return null;
  src.updateMatrixWorld(true);
  const bodies = [];
  const wheels = [];
  src.traverse((o) => {
    if (!o.name) return;
    if (/body$/i.test(o.name) && /(compact|coupe|hatchback|minivan|offroad|pickup|sedan|sport|suv|wagon)/i.test(o.name)) bodies.push(o);
    else if (/^wheel/i.test(o.name) && !wheels.some((w) => w === o.parent)) wheels.push(o);
  });
  const parts = new Map(bodies.map((b) => [b, { box: new THREE.Box3().setFromObject(b), wheels: [] }]));
  // 바퀴: 차체 경계 안(수평)에 있는 차체에 붙인다 (없으면 가장 가까운 차체)
  for (const w of wheels) {
    const c = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3());
    let best = null;
    let bd = Infinity;
    for (const [b, P] of parts) {
      const bc = P.box.getCenter(new THREE.Vector3());
      const inside = c.x > P.box.min.x - 0.3 && c.x < P.box.max.x + 0.3 && c.z > P.box.min.z - 0.3 && c.z < P.box.max.z + 0.3;
      const d = Math.hypot(c.x - bc.x, c.z - bc.z) - (inside ? 100 : 0);
      if (d < bd) {
        bd = d;
        best = P;
      }
    }
    best?.wheels.push({ o: w, c });
  }
  const out = {};
  for (const [id, def] of Object.entries(CARS)) {
    const body = bodies.find((b) => def.body.test(b.name));
    if (!body) continue;
    const P = parts.get(body);
    // 월드 자세 그대로 복제해 한데 모은다
    const inner = new THREE.Group();
    for (const o of [body, ...P.wheels.map((w) => w.o)]) {
      const c = o.clone(true);
      o.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      inner.add(c);
    }
    // 길이 방향: 바퀴 네 개의 주축 (없으면 차체 상자의 긴 변)
    const ws = P.wheels.map((w) => w.c);
    let dir = new THREE.Vector3(0, 0, 1);
    if (ws.length >= 3) {
      const m = ws.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(ws.length);
      let sxx = 0;
      let szz = 0;
      let sxz = 0;
      for (const p of ws) {
        sxx += (p.x - m.x) ** 2;
        szz += (p.z - m.z) ** 2;
        sxz += (p.x - m.x) * (p.z - m.z);
      }
      const a = 0.5 * Math.atan2(2 * sxz, sxx - szz);
      dir.set(Math.cos(a), 0, Math.sin(a));
    } else {
      const s = P.box.getSize(new THREE.Vector3());
      dir.set(s.x > s.z ? 1 : 0, 0, s.x > s.z ? 0 : 1);
    }
    const center = P.box.getCenter(new THREE.Vector3());
    for (const c of inner.children) c.position.sub(center);
    const turn = new THREE.Group();
    turn.add(inner);
    turn.quaternion.setFromUnitVectors(dir, new THREE.Vector3(0, 0, 1));
    turn.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(turn);
    turn.position.y = -box.min.y;
    const g = new THREE.Group();
    g.add(turn);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    g.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    g.userData.size = size;
    g.userData.car = id;
    out[id] = g;
  }
  return out;
}

/** 차 한 대 (바닥 y=0 · 가운데 원점 · 길이 방향 +Z). 모델이 없으면 null */
export function makeCar(id) {
  templates ??= build();
  const t = templates?.[id] ?? templates?.[CAR_IDS[0]];
  if (!t) return null;
  const g = t.clone(true);
  g.userData.size = t.userData.size.clone();
  g.userData.car = t.userData.car;
  return g;
}
