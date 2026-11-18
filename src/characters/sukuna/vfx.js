// 스쿠나 VFX: 참격 초승달 · 절단선 · 실사풍 화염 화살 · 불기둥
import * as THREE from 'three';
import { glowTexture } from '../../core/fx.js';
import { fireNoiseTexture, FIRE_RAMP_GLSL } from '../../core/realFire.js';

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
  add(pos, along, normal, len = 1, w = 0.02, life = 0.15, color = 0xffffff, ratio = 0.075) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.pos.copy(pos);
    it.along.copy(along).normalize();
    it.len = len;
    it.w = Math.max(w * 4, len * ratio);
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
  // 굵기: 더미에 맞았을 때 남는 절단선(SlashLines)과 같은 비율 (길이의 7.5% · 검은 칼날은 그 절반 남짓)
  front.scale.set(len, len * 0.058, len);
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

// ── 개(開) 화염 화살: 실사풍. 백열하는 가는 심 + 그 둘레를 핥으며 타오르는 불꽃 빌보드 + 연기 꼬리 ──
// 화살 축: 꼬리 z=0 → 머리 z=-1 (단위 길이)

let _coreGeo = null;
function arrowCoreGeometry() {
  if (_coreGeo) return _coreGeo;
  // 뾰족한 머리 → 앞쪽이 가장 굵고 → 꼬리로 가늘게
  const prof = [[0, 0], [0.07, 0.03], [0.14, 0.08], [0.18, 0.16], [0.17, 0.3], [0.13, 0.5], [0.08, 0.72], [0.03, 0.9], [0.005, 1]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), 16, 0, Math.PI * 2);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -1);
  g.computeBoundingSphere();
  _coreGeo = g;
  return g;
}

const coreVert = /* glsl */ `
uniform float uTime;
varying float vT;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main() {
  vec3 p = position;
  vT = clamp(-p.z, 0.0, 1.0);
  vT = 1.0 - vT; // 0 머리 ~ 1 꼬리
  float w = smoothstep(0.2, 1.0, vT);
  p.x += sin(vT * 13.0 - uTime * 17.0) * 0.06 * w;
  p.y += cos(vT * 11.0 - uTime * 14.0) * 0.06 * w;
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const coreFrag = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform float uFade;
uniform float uOcc;
varying float vT;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
${FIRE_RAMP_GLSL}
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float n = texture2D(uNoise, vec2(vUv.x * 2.0, vT * 1.4 - uTime * 2.6)).a;
  float n2 = texture2D(uNoise, vec2(vUv.x * 4.0 + 0.3, vT * 3.0 - uTime * 4.2)).g;
  float body = pow(facing, 1.3);
  float tailCut = 1.0 - smoothstep(0.4, 1.0, vT + (n - 0.5) * 0.55);
  float T = (0.6 + 0.95 * body) * (1.0 - vT * 0.5) * (0.82 + 0.36 * n2);
  float a = (0.2 + 0.8 * body) * tailCut * uFade;
  gl_FragColor = vec4(fireRamp(T) * a, a * uOcc * 0.5);
}`;

const _h = new THREE.Vector3();
const _t = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mv = new THREE.Vector3();
const _p = new THREE.Vector3();
const _r = new THREE.Vector3();
const _vel = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const count = (x) => Math.floor(x) + (Math.random() < x % 1 ? 1 : 0);

export class FireArrow {
  /** @param ctx 게임 컨텍스트 (ctx.fx.fire 로 불꽃을 뿌린다). 예전 호출(scene)도 지원 */
  constructor(ctxOrScene) {
    const isCtx = !!ctxOrScene?.scene;
    this.scene = isCtx ? ctxOrScene.scene : ctxOrScene;
    this.ctx = isCtx ? ctxOrScene : null;
    this.fire = this.ctx?.fx?.fire ?? null;
    this.group = new THREE.Group();
    this.time = { value: Math.random() * 10 };
    this.fade = { value: 1 };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: coreVert,
      fragmentShader: coreFrag,
      uniforms: { uTime: this.time, uFade: this.fade, uNoise: { value: fireNoiseTexture() }, uOcc: { value: 0.15 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      fog: false,
    });
    this.body = new THREE.Mesh(arrowCoreGeometry(), this.mat);
    this.body.frustumCulled = false;
    this.body.renderOrder = 12;
    const tex = glowTexture();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff5a14, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.35 }));
    this.tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff1d6, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.group.add(this.glow, this.body, this.tip);
    this.scene.add(this.group);
    this._prev = new THREE.Vector3();
    this._hasPrev = false;
    this.setLength(0.5);
  }

  /** 길이만 바뀌고 굵기는 고정 (당길수록 길어진다) */
  setLength(len, thick = 1) {
    this.len = len;
    this.width = 0.4 * thick;
    this.body.scale.set(this.width, this.width, len);
    this.glow.position.set(0, 0, -len * 0.6);
    this.glow.scale.set(0.5 + len * 0.22, 0.5 + len * 0.22, 1);
    this.tip.position.set(0, 0, -len * 0.97);
    this.tip.scale.setScalar(0.16);
  }

  update(dt) {
    this.time.value += dt;
    this.glow.material.opacity = 0.28 + Math.random() * 0.14;
    const fire = this.fire;
    if (!fire || !(dt > 0)) return;
    this.mat.uniforms.uOcc.value = this.ctx.fx.brightBg ? 0.5 : 0.12;
    this.group.updateMatrixWorld(true);
    const head = this.group.localToWorld(_h.set(0, 0, -this.len));
    const tail = this.group.localToWorld(_t.set(0, 0, 0));
    _dir.subVectors(head, tail).normalize();
    let speed = 0;
    if (this._hasPrev) {
      _mv.subVectors(head, this._prev);
      speed = _mv.length() / dt;
    }
    const moving = speed > 4;
    const coreR = this.width * 0.17;
    // 화살 몸을 핥으며 위로 타오르는 불꽃 (날아갈 땐 지나온 자리에 남아 꼬리가 된다)
    const n = count(this.len * (moving ? 160 : 200) * dt);
    for (let i = 0; i < n; i++) {
      const u = Math.pow(Math.random(), 0.85); // 0 머리 ~ 1 꼬리
      _p.lerpVectors(head, tail, u).addScaledVector(_r.randomDirection(), coreR * 1.3);
      if (moving) _p.addScaledVector(_mv, -Math.random());
      const s = this.width * (0.36 - u * 0.14) * rnd(0.8, 1.2);
      _vel.randomDirection().multiplyScalar(0.35);
      _vel.y += rnd(0.3, 0.9);
      if (moving) _vel.addScaledVector(_dir, -speed * 0.04);
      // 위로 늘어난 불꽃 혀 (속도 방향으로 길어진다)
      fire.flame(_p, _vel, { size0: s * 0.6, size1: s * rnd(1.3, 1.8), life: moving ? rnd(0.18, 0.34) : rnd(0.22, 0.4), heat: (moving ? 1.3 : 1.15) - u * 0.35, cool: 0.95, drag: 2, rise: 4, stretch: 0.45 });
    }
    // 날아가는 중: 머리가 지나온 길을 촘촘히 메워 끊기지 않는 불꼬리
    if (moving) {
      const np = count(speed * dt * 28);
      for (let i = 0; i < np; i++) {
        _p.copy(head).addScaledVector(_mv, -Math.random()).addScaledVector(_dir, -Math.random() * this.len * 0.3).addScaledVector(_r.randomDirection(), coreR * 1.5);
        const s = this.width * rnd(0.45, 0.7);
        _vel.randomDirection().multiplyScalar(0.6);
        _vel.y += 0.5;
        fire.flame(_p, _vel, { size0: s * 0.7, size1: s * rnd(1.6, 2.4), life: rnd(0.25, 0.45), heat: rnd(1.15, 1.35), cool: 1, drag: 2, rise: 3 });
      }
    }
    // 머리의 백열
    if (Math.random() < 0.7) {
      _p.copy(head).addScaledVector(_dir, -this.width * 0.15);
      fire.flame(_p, _vel.set(0, 0.3, 0), { size0: this.width * 0.3, size1: this.width * 0.45, life: 0.12, heat: 1.45, cool: 0.4, drag: 3, rise: 1 });
    }
    // 꼬리에서 피어오르는 연기
    const ns = count((moving ? 45 : 9) * dt);
    for (let i = 0; i < ns; i++) {
      const u = rnd(0.55, 1);
      _p.lerpVectors(head, tail, u).addScaledVector(_r.randomDirection(), coreR * 2);
      if (moving) _p.addScaledVector(_mv, -Math.random());
      fire.smoke(_p, _vel.set((Math.random() - 0.5) * 0.4, rnd(0.5, 1.1), (Math.random() - 0.5) * 0.4), {
        size0: this.width * 0.3, size1: moving ? rnd(0.8, 1.3) : rnd(0.2, 0.35), life: moving ? rnd(1.6, 2.6) : rnd(0.9, 1.4),
        shade: rnd(0.1, 0.25), lit: moving ? 0.5 : 0.15, opacity: moving ? 0.45 : 0.16, rise: 0.4, drag: 1.2,
      });
    }
    // 튀는 불티
    const nk = count((moving ? 40 : 22) * dt);
    for (let i = 0; i < nk; i++) {
      _p.lerpVectors(head, tail, Math.random() * 0.7);
      if (moving) _p.addScaledVector(_mv, -Math.random());
      _vel.randomDirection().multiplyScalar(rnd(1, 3));
      _vel.y += 1;
      fire.spark(_p, _vel, { life: rnd(0.4, 0.9), size: rnd(0.014, 0.024), grav: 3, drag: 1 });
    }
    this._prev.copy(head);
    this._hasPrev = true;
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
