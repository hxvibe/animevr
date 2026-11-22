// 박힌 자국: 적이나 무거운 물체를 바닥에 내리꽂으면 바닥이 패이고(크레이터), 벽에 쳐박으면 벽이 금 가며 부서진다
//  · 자국은 배경 표면에 붙인 데칼 (금 · 패인 그늘) + 가장자리의 돌 부스러기 + 튀는 파편 · 먼지
//  · 표면은 배경 메시에 광선을 쏴서 찾는다 (보도 · 벽 · 기둥 어디든). 맞는 면이 없으면(초원의 끝 등) 자국도 없다
//  · 오래된 자국부터 천천히 사라진다 (최대 MAX개)
import * as THREE from 'three';

const MAX = 28;
const LIFE = 40; // 초
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ray = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

let _seed = 1;
const rnd = () => ((_seed = (_seed * 16807) % 2147483647) - 1) / 2147483646;

/** 패인 자국 / 금 간 벽 텍스처 (캔버스로 한 번만) */
function makeTex(kind) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const c = S / 2;
  _seed = kind === 'floor' ? 7 : 13;
  if (kind === 'floor') {
    // 패인 그늘: 가운데가 가장 어둡고, 테두리는 밀려 올라와 살짝 밝다
    let gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(18,16,14,0.92)');
    gr.addColorStop(0.32, 'rgba(34,31,28,0.82)');
    gr.addColorStop(0.55, 'rgba(60,56,50,0.55)');
    gr.addColorStop(0.7, 'rgba(185,178,166,0.38)');
    gr.addColorStop(0.8, 'rgba(90,84,76,0.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  } else {
    // 벽: 가운데 부서져 떨어진 구멍
    const gr = g.createRadialGradient(c, c, 0, c, c, c * 0.5);
    gr.addColorStop(0, 'rgba(20,18,16,0.95)');
    gr.addColorStop(0.6, 'rgba(48,44,40,0.8)');
    gr.addColorStop(0.85, 'rgba(170,162,150,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  }
  // 금: 가운데서 뻗는 들쭉날쭉한 선 (갈라지기도 한다)
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const crack = (x, y, a, len, w, depth) => {
    g.beginPath();
    g.moveTo(x, y);
    let px = x;
    let py = y;
    const steps = 6 + Math.floor(rnd() * 4);
    for (let i = 1; i <= steps; i++) {
      a += (rnd() - 0.5) * 0.7;
      px += (Math.cos(a) * len) / steps;
      py += (Math.sin(a) * len) / steps;
      g.lineTo(px, py);
      if (depth < 2 && rnd() < 0.22) {
        g.strokeStyle = `rgba(14,12,10,${0.85 - depth * 0.2})`;
        g.lineWidth = w;
        g.stroke();
        crack(px, py, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), len * (0.35 + rnd() * 0.3), w * 0.6, depth + 1);
        g.beginPath();
        g.moveTo(px, py);
      }
    }
    g.strokeStyle = `rgba(14,12,10,${0.85 - depth * 0.2})`;
    g.lineWidth = w;
    g.stroke();
  };
  const n = kind === 'floor' ? 11 : 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
    const r0 = kind === 'floor' ? c * 0.18 : c * 0.25;
    crack(c + Math.cos(a) * r0, c + Math.sin(a) * r0, a, c * (0.55 + rnd() * 0.3), kind === 'floor' ? 3.2 : 4.5, 0);
  }
  if (kind === 'wall') {
    // 거미줄처럼 둘러 가는 금
    for (const rr of [0.42, 0.62]) {
      g.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const r = c * rr * (0.9 + rnd() * 0.2);
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else if (rnd() < 0.8) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.strokeStyle = 'rgba(16,14,12,0.6)';
      g.lineWidth = 1.6;
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Impacts {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'impacts';
    ctx.scene.add(this.group);
    this.marks = [];
    this.mats = null;
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.rock = new THREE.DodecahedronGeometry(1, 0);
  }

  _init() {
    if (this.mats) return;
    const base = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 1, metalness: 0 };
    this.mats = {
      floor: new THREE.MeshStandardMaterial({ ...base, map: makeTex('floor') }),
      wall: new THREE.MeshStandardMaterial({ ...base, map: makeTex('wall') }),
      rock: new THREE.MeshStandardMaterial({ color: 0x8a857c, roughness: 0.95, flatShading: true }),
    };
  }

  /** 배경 표면 찾기: from 에서 dir 쪽으로 far 안 (소품 · 숨긴 것 제외) */
  _surface(from, dir, far) {
    const env = this.ctx.env;
    const G = env?.current?.group;
    if (!G || env.hidden) return null;
    _ray.set(from, dir);
    _ray.far = far;
    const hits = _ray.intersectObject(G, true);
    for (const h of hits) {
      const o = h.object;
      if (o.userData.isProp || !o.visible || !h.face) continue;
      let vis = true;
      for (let p = o.parent; p && p !== G; p = p.parent) if (!p.visible) vis = false;
      if (!vis) continue;
      const n = h.face.normal.clone().transformDirection(o.matrixWorld);
      if (n.dot(dir) > 0) n.negate();
      return { point: h.point.clone(), normal: n };
    }
    return null;
  }

  /** 바닥이 패인다: p 근처 바닥에 (s = 세기 0~2) */
  floor(p, s = 1, opts = {}) {
    s = THREE.MathUtils.clamp(s, 0.3, 2.2);
    // 바닥 찾기 (못 찾으면 땅 y=0)
    let hit = this._surface(_v.set(p.x, p.y + 0.6, p.z), _v2.set(0, -1, 0), 2.5);
    if (!hit || hit.normal.y < 0.6) {
      if (this.ctx.env?.hidden || this.ctx.env?.current?.passthrough) return false;
      hit = { point: new THREE.Vector3(p.x, 0, p.z), normal: UP.clone() };
    }
    return this._mark('floor', hit.point, hit.normal, s, opts);
  }

  /** 벽이 금 가고 부서진다: p 에서 dir(벽 쪽) 으로 */
  wall(p, dir, s = 1, opts = {}) {
    s = THREE.MathUtils.clamp(s, 0.3, 2.2);
    const d = _v2.copy(dir).setY(0);
    if (d.lengthSq() < 1e-4) return false;
    d.normalize();
    const hit = this._surface(_v.copy(p).addScaledVector(d, -0.3), d, 1.8);
    if (!hit || Math.abs(hit.normal.y) > 0.5) return false;
    return this._mark('wall', hit.point, hit.normal, s, opts);
  }

  /** 가까운 곳에 이미 자국이 있으면 그걸 키운다 (같은 자리를 여러 번 내리꽂으면 더 깊게) */
  _mark(kind, point, normal, s, opts) {
    this._init();
    const { fx, sfx } = this.ctx;
    const W = this.ctx.world;
    const size = (kind === 'floor' ? 0.9 : 0.8) * s * (opts.size ?? 1);
    let M = this.marks.find((m) => m.kind === kind && m.point.distanceTo(point) < m.size * 0.35);
    if (M) {
      M.size = Math.min(M.size * 1.18, size * 1.6 + 0.4);
      M.decal.scale.setScalar(M.size);
      M.t = 0;
    } else {
      const g = new THREE.Group();
      g.position.copy(point).addScaledVector(normal, 0.008);
      g.quaternion.setFromUnitVectors(Z, normal);
      const decal = new THREE.Mesh(this.plane, this.mats[kind]);
      decal.rotation.z = Math.random() * Math.PI * 2;
      decal.scale.setScalar(size);
      decal.renderOrder = 2;
      decal.receiveShadow = true;
      g.add(decal);
      // 테두리의 돌 부스러기 (패인 바닥은 밀려 올라와 둘레에 남는다)
      const n = Math.round(5 + s * 5);
      for (let i = 0; i < n; i++) {
        const r = new THREE.Mesh(this.rock, this.mats.rock);
        const a = Math.random() * Math.PI * 2;
        const rr = size * (kind === 'floor' ? 0.3 + Math.random() * 0.2 : 0.12 + Math.random() * 0.25);
        const sz = (0.025 + Math.random() * 0.045) * Math.sqrt(s);
        r.position.set(Math.cos(a) * rr, Math.sin(a) * rr, sz * 0.25);
        r.scale.set(sz * (0.8 + Math.random() * 0.6), sz * (0.8 + Math.random() * 0.6), sz * 0.6);
        r.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        r.castShadow = true;
        g.add(r);
      }
      this.group.add(g);
      M = { kind, g, decal, point: point.clone(), normal: normal.clone(), size, t: 0 };
      this.marks.push(M);
      if (this.marks.length > MAX) this._drop(this.marks[0]);
    }
    // 튀는 파편 · 먼지 · 소리
    const c = _v.copy(point).addScaledVector(normal, 0.05);
    W?.shatter?.emit(c, Math.round(12 + s * 14), opts.color ?? 0x8c877e, { spread: size * 0.25, speed: 2.5 + s * 2, dir: normal, dirAmt: 1.6, size: 0.035 + s * 0.02 });
    fx?.burst?.(c, Math.round(10 + s * 10), new THREE.Color(0xb8b0a2), 2 + s * 1.5, 0.05, 0.5, { dir: normal, dirAmt: 1 });
    const smoke = fx?.fire?.smoke;
    if (smoke) {
      for (let i = 0; i < 3 + Math.round(s * 2); i++) {
        const a = Math.random() * Math.PI * 2;
        _q.setFromUnitVectors(Z, normal);
        const off = _v2.set(Math.cos(a), Math.sin(a), 0).multiplyScalar(size * 0.3).applyQuaternion(_q);
        fx.fire.smoke(c.clone().add(off), off.clone().multiplyScalar(2.5).addScaledVector(normal, 0.6), { size0: 0.2 * s, size1: 0.9 * s, life: 1.1, shade: 0.6, lit: 0, opacity: 0.32, drag: 2.5, rise: 0.25 });
      }
    }
    sfx?.play?.('shatter_2', { at: c, vol: Math.min(1, 0.35 + s * 0.3), rate: 0.45 + Math.random() * 0.1 });
    sfx?.noise?.({ dur: 0.3, vol: 0.25 + 0.2 * Math.min(1, s), f0: 900, f1: 60, q: 0.8, type: 'lowpass', at: c });
    return M;
  }

  _drop(M) {
    this.group.remove(M.g);
    this.marks.splice(this.marks.indexOf(M), 1);
  }

  update(dt) {
    // 영역전개로 배경이 숨으면 자국도 같이 (떠 있지 않게)
    this.group.visible = !this.ctx.env?.hidden;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const M = this.marks[i];
      M.t += dt;
      if (M.t > LIFE) {
        const k = 1 - (M.t - LIFE) / 3;
        if (k <= 0) this._drop(M);
        else M.g.scale.setScalar(k);
      }
    }
  }

  clear() {
    for (const M of [...this.marks]) this._drop(M);
  }
}
