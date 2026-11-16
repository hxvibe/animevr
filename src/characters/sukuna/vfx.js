// 스쿠나 VFX: 참격 초승달 · 절단선 · 화염 화살 · 불기둥
import * as THREE from 'three';
import { glowTexture } from '../../core/fx.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

// ── 참격 텍스처: 검은 칼날 + 하얀 빛 테두리, 양끝이 가늘게 빠지는 초승달 ──
let _bladeTex = null;
export function bladeTexture() {
  if (_bladeTex) return _bladeTex;
  const W = 1024;
  const H = 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cy = H / 2;
  // 살짝 휜 칼날 윤곽 (위·아래 곡선, 양끝 뾰족)
  const blade = (thick, x0 = 40, x1 = W - 40, bend = 7) => {
    g.beginPath();
    g.moveTo(x0, cy + bend);
    g.bezierCurveTo(W * 0.32, cy - thick * 1.05 + bend * 0.4, W * 0.62, cy - thick * 0.95 - bend * 0.4, x1, cy - bend);
    g.bezierCurveTo(W * 0.62, cy + thick * 0.95 - bend * 0.4, W * 0.32, cy + thick * 1.05 + bend * 0.4, x0, cy + bend);
    g.closePath();
  };
  // 바깥 하얀 빛
  g.save();
  g.shadowColor = 'rgba(255,255,255,1)';
  g.shadowBlur = 24;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  blade(52, 16, W - 16);
  g.fill();
  g.shadowBlur = 10;
  blade(47, 22, W - 22);
  g.fill();
  g.restore();
  // 검은 칼날
  g.fillStyle = '#050505';
  blade(38, 46, W - 46);
  g.fill();
  // 가장자리를 따라 갈라지는 얇은 검은 파편
  g.fillStyle = '#050505';
  for (const [x, y, len, dir] of [[300, cy - 34, 120, -1], [560, cy + 33, 150, 1], [760, cy - 26, 110, -1], [200, cy + 24, 90, 1]]) {
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len * 0.5, y + dir * 8, x + len, y + dir * 3);
    g.quadraticCurveTo(x + len * 0.5, y + dir * 1, x, y);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _bladeTex = t;
  return t;
}

function bladeMaterial(color = 0xffffff, opacity = 1) {
  return new THREE.MeshBasicMaterial({ map: bladeTexture(), color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
}

/** 순간적으로 번쩍이는 절단선 (인스턴스 묶음). 선 방향 축으로 카메라를 향해 돈다 */
export class SlashLines {
  constructor(scene, max = 120) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = bladeMaterial(0xffffff, 1);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.bright = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ life: 0, max: 1, pos: new THREE.Vector3(), along: new THREE.Vector3(1, 0, 0), len: 1, w: 0.02, color: new THREE.Color() });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.cursor = 0;
    this._y = new THREE.Vector3();
    this._z = new THREE.Vector3();
  }

  /**
   * @param pos 중심
   * @param along 선 방향 (절단면 위)
   * @param normal 절단면 법선 (호환용)
   */
  add(pos, along, normal, len = 1, w = 0.02, life = 0.15, color = 0xffffff) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.pos.copy(pos);
    it.along.copy(along).normalize();
    it.len = len;
    it.w = Math.max(w * 4, len * 0.075);
    it.life = it.max = life;
    // 칼날은 검정 고정, 빛 테두리만 살짝 물들인다
    it.color.set(color === 0xffffff ? 0xffffff : 0xffd0d0);
    void normal;
  }

  update(dt, camPos) {
    let any = false;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      any = true;
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      const grow = Math.min(1, (1 - k) * 5 + 0.25);
      const x = it.along;
      if (camPos) this._z.subVectors(camPos, it.pos).normalize();
      else this._z.set(0, 0, 1);
      this._y.crossVectors(this._z, x);
      if (this._y.lengthSq() < 1e-6) this._y.set(0, 1, 0);
      this._y.normalize();
      this._z.crossVectors(x, this._y);
      _m.makeBasis(x, this._y, this._z);
      _q.setFromRotationMatrix(_m);
      _s.set(it.len * grow, it.w * (0.35 + 0.65 * k), 1);
      this.mesh.setMatrixAt(i, _m.compose(it.pos, _q, it.life > 0 ? _s : _s.set(0, 0, 0)));
      this.mesh.setColorAt(i, it.color);
    }
    if (any) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

/**
 * 해(解) 참격: 날아가는 칼날. 그룹의 로컬 X = 칼날 길이 방향(along), Z = 진행 방향(카메라 쪽을 향함)
 * 겹친 두 장(정면 + 살짝 기운 면)으로 어느 각도에서도 보이게 한다
 */
export function makeCrescent(radius = 0.7) {
  const g = new THREE.Group();
  const len = radius * 2.6;
  const geo = new THREE.PlaneGeometry(1, 1, 16, 1);
  // 진행 방향으로 살짝 휜 초승달
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    P.setZ(i, (1 - 4 * x * x) * 0.12);
  }
  const front = new THREE.Mesh(geo, bladeMaterial(0xffffff, 1));
  front.scale.set(len, len * 0.15, len);
  const tilt = new THREE.Mesh(geo, bladeMaterial(0xffffff, 0.75));
  tilt.scale.copy(front.scale);
  tilt.rotation.x = Math.PI / 2;
  g.add(front, tilt);
  g.userData.blade = true;
  return g;
}

const fireVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const fireFrag = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
uniform float uTime;
uniform float uFade;
uniform float uScroll;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }
void main() {
  float n = fbm(vec2(vUv.x * 6.0, vUv.y * 3.0 - uTime * uScroll));
  float edge = abs(dot(normalize(vN), normalize(vV)));
  float body = smoothstep(0.0, 0.6, edge) ;
  float f = clamp(n * 1.4 - (1.0 - vUv.y) * 0.15, 0.0, 1.0) * (0.35 + body);
  vec3 c = mix(vec3(0.6, 0.05, 0.0), vec3(1.0, 0.45, 0.05), smoothstep(0.2, 0.6, f));
  c = mix(c, vec3(1.0, 0.95, 0.7), smoothstep(0.65, 0.95, f));
  gl_FragColor = vec4(c * f * 2.2 * uFade, 1.0);
}`;

export function fireMaterial(scroll = 2.0) {
  return new THREE.ShaderMaterial({
    vertexShader: fireVert,
    fragmentShader: fireFrag,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uScroll: { value: scroll } },
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

// ── 개(開) 화염 화살: 셀 애니메이션풍 불새 모양 화살 ──
let _flameTex = null;
function flameArrowTexture() {
  if (_flameTex) return _flameTex;
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cy = H / 2;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // 머리(오른쪽 끝)에서 꼬리로 흐르는 불꽃 혀들
  const tongues = [];
  // 몸통
  tongues.push({ x0: W * 0.97, y0: cy, x1: W * 0.06, y1: cy + 10, w: 64, wave: 18, ph: 0 });
  // 날개처럼 퍼지는 갈래 (위·아래)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const start = W * (0.72 - i * 0.1);
      tongues.push({
        x0: start, y0: cy + side * 12,
        x1: start - W * (0.28 + rnd() * 0.18), y1: cy + side * (90 + i * 38 + rnd() * 30),
        w: 34 - i * 4, wave: 14 + rnd() * 10, ph: rnd() * 6,
      });
    }
  }
  // 몸통을 따라 뒤로 끌리는 가는 꼬리
  for (let i = 0; i < 6; i++) {
    tongues.push({ x0: W * (0.55 - i * 0.06), y0: cy + (rnd() - 0.5) * 40, x1: W * (0.02 + rnd() * 0.1), y1: cy + (rnd() - 0.5) * 150, w: 16 + rnd() * 10, wave: 16, ph: rnd() * 6 });
  }
  const path = (t, scale) => {
    const N = 26;
    const up = [];
    const dn = [];
    for (let i = 0; i <= N; i++) {
      const k = i / N;
      const x = t.x0 + (t.x1 - t.x0) * k;
      const y = t.y0 + (t.y1 - t.y0) * (k * k * 0.6 + k * 0.4) + Math.sin(k * 7 + t.ph) * t.wave * k;
      // 머리 쪽은 뾰족하게, 가운데 굵고, 꼬리로 가늘게
      const w = t.w * scale * Math.pow(Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5 + 0.0001), 0.8) * Math.pow(1 - k, 0.9);
      up.push([x, y - w * 0.5]);
      dn.push([x, y + w * 0.5]);
    }
    g.beginPath();
    g.moveTo(up[0][0], up[0][1]);
    for (const p of up) g.lineTo(p[0], p[1]);
    for (let i = dn.length - 1; i >= 0; i--) g.lineTo(dn[i][0], dn[i][1]);
    g.closePath();
  };
  // 1) 짙은 적갈색 외곽선
  g.lineJoin = 'round';
  g.fillStyle = '#5a1206';
  g.strokeStyle = '#5a1206';
  g.lineWidth = 8;
  for (const t of tongues) {
    path(t, 1.0);
    g.fill();
    g.stroke();
  }
  // 2) 주황 몸통
  g.fillStyle = '#ff6a18';
  for (const t of tongues) {
    path(t, 0.86);
    g.fill();
  }
  // 3) 밝은 주황 결
  g.fillStyle = '#ff9a30';
  for (const t of tongues) {
    path({ ...t, y0: t.y0 - 3, y1: t.y1 - 4 }, 0.5);
    g.fill();
  }
  // 4) 노랑·흰색 빛줄기 (셀 하이라이트)
  g.fillStyle = '#ffd56a';
  for (const t of tongues) {
    path({ ...t, x1: t.x0 + (t.x1 - t.x0) * 0.75, ph: t.ph + 0.4 }, 0.28);
    g.fill();
  }
  g.fillStyle = '#fff6d8';
  for (const t of tongues.slice(0, 5)) {
    path({ ...t, x1: t.x0 + (t.x1 - t.x0) * 0.5, ph: t.ph + 0.8 }, 0.12);
    g.fill();
  }
  // 5) 뾰족한 머리
  g.fillStyle = '#5a1206';
  g.beginPath();
  g.moveTo(W - 6, cy);
  g.quadraticCurveTo(W * 0.86, cy - 46, W * 0.74, cy - 30);
  g.lineTo(W * 0.78, cy);
  g.lineTo(W * 0.74, cy + 30);
  g.quadraticCurveTo(W * 0.86, cy + 46, W - 6, cy);
  g.fill();
  g.fillStyle = '#ff7a20';
  g.beginPath();
  g.moveTo(W - 16, cy);
  g.quadraticCurveTo(W * 0.86, cy - 36, W * 0.76, cy - 22);
  g.lineTo(W * 0.8, cy);
  g.lineTo(W * 0.76, cy + 22);
  g.quadraticCurveTo(W * 0.86, cy + 36, W - 16, cy);
  g.fill();
  g.fillStyle = '#fff3c8';
  g.beginPath();
  g.moveTo(W - 22, cy);
  g.quadraticCurveTo(W * 0.88, cy - 10, W * 0.8, cy - 4);
  g.lineTo(W * 0.8, cy + 4);
  g.quadraticCurveTo(W * 0.88, cy + 10, W - 22, cy);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _flameTex = t;
  return t;
}

const flameVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const flameFrag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uTime;
uniform float uFade;
uniform float uSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main() {
  // 꼬리 쪽일수록 크게 일렁인다 (u=1 머리, u=0 꼬리)
  float tail = 1.0 - vUv.x;
  vec2 uv = vUv;
  float t = uTime * 9.0 + uSeed;
  uv.y += (sin(vUv.x * 18.0 - t) * 0.018 + (noise(vec2(vUv.x * 9.0 - t * 0.6, vUv.y * 4.0)) - 0.5) * 0.06) * tail;
  uv.x += (noise(vec2(vUv.y * 6.0, t * 0.5)) - 0.5) * 0.03 * tail;
  vec4 c = texture2D(uMap, uv);
  // 꼬리 끝은 조각조각 끊기며 사라진다
  float br = noise(vec2(vUv.x * 14.0 + t * 0.8, vUv.y * 10.0));
  c.a *= smoothstep(0.0, 0.25, vUv.x + br * 0.25 - 0.08);
  if (c.a < 0.04) discard;
  gl_FragColor = vec4(c.rgb * 1.15, c.a * uFade);
}`;

export class FireArrow {
  /** @param ctx 게임 컨텍스트 (카메라 위치를 향해 화살 면을 돌리기 위함). 예전 호출(scene)도 지원 */
  constructor(ctxOrScene) {
    const isCtx = !!ctxOrScene?.scene;
    this.scene = isCtx ? ctxOrScene.scene : ctxOrScene;
    this.ctx = isCtx ? ctxOrScene : null;
    this.group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(1, 1, 24, 4);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI / 2); // u=1(머리) → -Z
    geo.translate(0, 0, -0.5); // 꼬리 0, 머리 -1
    this.u = { uMap: { value: flameArrowTexture() }, uTime: { value: Math.random() * 10 }, uFade: { value: 1 }, uSeed: { value: Math.random() * 50 } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: flameVert, fragmentShader: flameFrag, uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    // 축을 중심으로 카메라를 향하는 주 면 + 직교하는 보조 면
    this.axis = new THREE.Group();
    this.main = new THREE.Mesh(geo, this.mat);
    this.cross = new THREE.Mesh(geo, this.mat);
    this.cross.rotation.z = Math.PI / 2;
    this.cross.scale.set(0.7, 1, 0.92);
    this.axis.add(this.cross, this.main);
    this.main.renderOrder = 7;
    this.cross.renderOrder = 6;
    const tex = glowTexture();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff5a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.6 }));
    this.tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff0c0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.group.add(this.glow, this.axis, this.tip);
    this.scene.add(this.group);
    this._c = new THREE.Vector3();
    this.setLength(0.5);
  }

  setLength(len, thick = 1) {
    this.len = len;
    const w = (0.06 + len * 0.3) * thick;
    this.axis.scale.set(w, 1, len);
    this.glow.position.set(0, 0, -len * 0.55);
    this.glow.scale.setScalar(0.3 + len * 0.7);
    this.tip.position.set(0, 0, -len * 0.97);
    this.tip.scale.setScalar(0.08 + len * 0.1);
  }

  update(dt) {
    this.u.uTime.value += dt;
    this.glow.material.opacity = 0.45 + Math.random() * 0.25;
    // 화살 축(로컬 Z)을 중심으로 면을 카메라 쪽으로 돌린다
    const cam = this.ctx?.input?.head;
    if (cam) {
      this.group.updateMatrixWorld();
      this._c.copy(cam);
      this.group.worldToLocal(this._c);
      this.axis.rotation.z = Math.atan2(-this._c.x, this._c.y);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.mat.dispose();
    this.glow.material.dispose();
    this.tip.material.dispose();
  }
}

/** 竈(카미노): 착탄 후 솟구치는 불기둥 */
export function spawnFirePillar(fx, pos, height = 9, radius = 1.6, dur = 2.2) {
  const geo = new THREE.CylinderGeometry(radius * 0.6, radius, height, 24, 6, true);
  geo.translate(0, height / 2, 0);
  const mat = fireMaterial(1.6);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos.x, 0, pos.z);
  m.renderOrder = 6;
  fx.addTransient(m, dur, (k, dt) => {
    mat.uniforms.uTime.value += dt ?? 0.016;
    const rise = Math.min(1, k * 5);
    m.scale.set(1 + k * 0.6, rise, 1 + k * 0.6);
    mat.uniforms.uFade.value = k < 0.7 ? 1 : (1 - k) / 0.3;
  }, () => geo.dispose());
}
