// 메구미 VFX: 그림자 웅덩이(식신이 드나드는 문) · 그림자 송곳 · 영역전개 「嵌合暗翳庭」 (그림자 바다)
import * as THREE from 'three';

const _v = new THREE.Vector3();

// ── 그림자 웅덩이: 먹물처럼 번진 검은 원. 가장자리가 일렁이고 안쪽은 물결친다 ──
const poolVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWP;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const poolFrag = /* glsl */ `
uniform float uTime;
uniform float uK;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vWP;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main() {
  float r = length(vUv);
  float a = atan(vUv.y, vUv.x);
  // 먹물이 번진 듯 들쭉날쭉한 가장자리
  float edge = 0.78 + 0.14 * n2(vec2(a * 3.0 + uSeed, uTime * 0.8)) + 0.06 * n2(vec2(a * 9.0 - uSeed, uTime * 1.6));
  edge *= uK;
  float inside = 1.0 - smoothstep(edge - 0.06, edge, r);
  if (inside < 0.01) discard;
  // 안쪽: 칠흑 + 느린 동심원 물결의 옅은 반사
  float ring = sin(r * 22.0 / max(0.3, uK) - uTime * 5.0) * 0.5 + 0.5;
  float gloss = pow(ring, 6.0) * (1.0 - r) * 0.12;
  vec3 col = vec3(0.01, 0.01, 0.018) + vec3(0.25, 0.3, 0.45) * gloss;
  // 가장자리에 얇은 남빛 테
  col += vec3(0.08, 0.1, 0.22) * smoothstep(edge - 0.12, edge - 0.03, r) * 0.6;
  gl_FragColor = vec4(col, inside * 0.97);
}`;

export class ShadowPools {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  }

  /**
   * 웅덩이를 연다. 반환값 { close() } 로 닫는다 (dur 생략 시 직접 닫을 때까지)
   */
  open(pos, radius, { dur = null, grow = 0.25 } = {}) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: poolVert,
      fragmentShader: poolFrag,
      uniforms: { uTime: { value: Math.random() * 10 }, uK: { value: 0 }, uSeed: { value: Math.random() * 50 } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.set(pos.x, 0.015 + Math.random() * 0.004, pos.z);
    m.scale.setScalar(radius);
    m.renderOrder = 2;
    this.scene.add(m);
    const it = { m, mat, k: 0, grow, dur, t: 0, closing: false, radius };
    it.close = () => (it.closing = true);
    it.moveTo = (p) => m.position.set(p.x, m.position.y, p.z);
    this.items.push(it);
    return it;
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.mat.uniforms.uTime.value += dt;
      if (it.dur !== null && it.t > it.dur) it.closing = true;
      if (it.closing) it.k -= dt / 0.35;
      else it.k = Math.min(1, it.k + dt / it.grow);
      it.mat.uniforms.uK.value = Math.max(0, it.k);
      if (it.closing && it.k <= 0) {
        this.scene.remove(it.m);
        it.mat.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const it of this.items) {
      this.scene.remove(it.m);
      it.mat.dispose();
    }
    this.items = [];
    this.geo.dispose();
  }
}

// ── 그림자 송곳: 바닥에서 솟구치는 검은 가시 ──
export class ShadowSpikes {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.ConeGeometry(1, 1, 7, 1, false).translate(0, 0.5, 0);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.15, metalness: 0.3, emissive: 0x05060e });
  }

  spawn(pos, height = 2, radius = 0.14, tilt = null, delay = 0) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.set(pos.x, 0, pos.z);
    if (tilt) m.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, tilt);
    m.scale.set(radius, 0.001, radius);
    m.visible = false;
    this.scene.add(m);
    this.items.push({ m, t: -delay, h: height, r: radius });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i];
      s.t += dt;
      if (s.t < 0) continue;
      s.m.visible = true;
      // 0.08초 만에 솟구쳤다가 잠시 머문 뒤 가라앉는다
      const up = Math.min(1, s.t / 0.08);
      const down = s.t > 0.6 ? Math.min(1, (s.t - 0.6) / 0.3) : 0;
      s.m.scale.y = Math.max(0.001, s.h * up * (1 - down));
      if (down >= 1) {
        this.scene.remove(s.m);
        this.items.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const s of this.items) this.scene.remove(s.m);
    this.items = [];
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ── 영역전개 「嵌合暗翳庭」: 바닥 전체가 출렁이는 그림자 바다, 하늘은 어둠 ──
const seaVert = /* glsl */ `
varying vec3 vWP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const seaFrag = /* glsl */ `
uniform float uTime;
uniform float uK;
uniform float uR;
uniform vec3 uCenter;
varying vec3 vWP;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main() {
  vec2 d = vWP.xz - uCenter.xz;
  float r = length(d);
  float a = atan(d.y, d.x);
  float edge = uR * uK * (0.92 + 0.08 * n2(vec2(a * 5.0, uTime * 0.5)));
  float inside = 1.0 - smoothstep(edge - 0.6, edge, r);
  if (inside < 0.01) discard;
  // 출렁이는 수면: 겹친 물결로 만든 법선 → 위에서 비친 희미한 빛
  vec2 p = vWP.xz;
  float w1 = sin(dot(p, vec2(0.8, 0.3)) * 1.7 + uTime * 1.3);
  float w2 = sin(dot(p, vec2(-0.4, 0.9)) * 2.3 - uTime * 1.1);
  float w3 = sin(r * 2.6 - uTime * 2.0) * 0.6;
  float nn = n2(p * 0.9 + uTime * 0.15);
  vec3 N = normalize(vec3((w1 * 0.8 + w3 * d.x / max(r, 0.001)) * 0.08 + (nn - 0.5) * 0.1, 1.0, (w2 * 0.8 + w3 * d.y / max(r, 0.001)) * 0.08));
  vec3 V = normalize(cameraPosition - vWP);
  vec3 L = normalize(vec3(0.3, 1.0, 0.2));
  float spec = pow(max(0.0, dot(reflect(-L, N), V)), 60.0);
  float fres = pow(1.0 - max(0.0, dot(N, V)), 4.0);
  vec3 col = vec3(0.006, 0.006, 0.012) + vec3(0.18, 0.22, 0.38) * spec * 0.6 + vec3(0.05, 0.06, 0.12) * fres;
  // 바닥 아래서 비치는 식신들의 실루엣 같은 얼룩
  col += vec3(0.02, 0.025, 0.05) * smoothstep(0.6, 0.9, n2(p * 0.25 - uTime * 0.05));
  gl_FragColor = vec4(col, inside);
}`;
const skyVert = /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform float uTime;
uniform float uFade;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main() {
  vec3 d = normalize(vDir);
  float a = atan(d.z, d.x);
  // 그림자가 위로 피어오르는 세로 결
  float streak = n2(vec2(a * 18.0, d.y * 2.0 - uTime * 0.25)) * n2(vec2(a * 7.0, d.y * 1.0 - uTime * 0.12));
  vec3 col = mix(vec3(0.05, 0.05, 0.09), vec3(0.008, 0.008, 0.016), smoothstep(-0.05, 0.6, d.y));
  col += vec3(0.04, 0.05, 0.1) * streak * smoothstep(0.7, 0.0, d.y);
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

export class ChimeraShadowGarden {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = 'idle';
    this.t = 0;
    this.radius = 15;
    this.center = new THREE.Vector3();
    this.u = { uTime: { value: 0 }, uK: { value: 0 }, uR: { value: this.radius }, uCenter: { value: this.center } };
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(this.radius * 2 + 2, this.radius * 2 + 2, 7, 7).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: seaVert, fragmentShader: seaFrag, uniforms: this.u, transparent: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.sea.position.y = 0.01;
    this.sea.renderOrder = 1;
    this.sea.visible = false;
    this.skyU = { uTime: this.u.uTime, uFade: { value: 0 } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.sky.renderOrder = -9;
    this.sky.frustumCulled = false;
    this.sky.visible = false;
    ctx.scene.add(this.sea, this.sky);
  }

  /**
   * 嵌合暗翳庭는 미완성 영역: 결계를 스스로 닫지 못한다.
   *  막힌 공간(실내)이면 벽과 천장이 결계 구실을 해 배경이 그림자에 잠기고, 탁 트인 곳이면 바닥만 그림자 바다가 된다
   */
  start(center) {
    this.closed = !!this.ctx.env.enclosed;
    this.center.copy(center);
    this.sea.position.set(center.x, this.closed ? 0.01 : this._seaLevel(center), center.z);
    this.state = 'opening';
    this.t = 0;
    this.sea.visible = true;
  }

  /**
   * 바깥(거리)에선 보도처럼 살짝 높은 바닥이 있어 바다가 그 밑에 숨는다 →
   *  둘레의 바닥 높이를 몇 군데 재서 가장 높은 곳 바로 위에 그림자 바다를 깐다 (발목까지 그림자에 잠긴 느낌)
   */
  _seaLevel(c) {
    const G = this.ctx.env.current?.group;
    if (!G) return 0.01;
    const ray = new THREE.Raycaster();
    let top = 0;
    for (let i = 0; i < 25; i++) {
      const a = i * 2.4;
      const r = i === 0 ? 0 : 1.5 + (i % 5) * 2;
      ray.set(new THREE.Vector3(c.x + Math.cos(a) * r, 1.2, c.z + Math.sin(a) * r), new THREE.Vector3(0, -1, 0));
      ray.far = 1.6;
      const h = ray.intersectObject(G, true).find((x) => x.object.visible && !x.object.userData.isProp && x.face && x.face.normal.y > 0.5);
      if (h && h.point.y < 0.35) top = Math.max(top, h.point.y);
    }
    return top + 0.02;
  }

  stop() {
    if (this.state === 'idle') return;
    this.state = 'closing';
    this.t = 0;
  }

  /** 점이 그림자 바다 위인지 */
  contains(p) {
    return this.state !== 'idle' && Math.hypot(p.x - this.center.x, p.z - this.center.z) < this.radius * this.u.uK.value;
  }

  update(dt) {
    if (this.state === 'idle') return;
    const env = this.ctx.env;
    this.t += dt;
    this.u.uTime.value += dt;
    if (this.state === 'opening') {
      const k = Math.min(1, this.t / 1.2);
      this.u.uK.value = 1 - Math.pow(1 - k, 2);
      if (this.closed) {
        if (k > 0.5 && !this.sky.visible) {
          env.setHidden(true);
          this.sky.visible = true;
        }
        this.skyU.uFade.value = Math.max(0, (k - 0.5) * 2);
        env.fog.color.lerp(new THREE.Color(0x05060c), Math.min(1, dt * 3));
        env.fog.near = THREE.MathUtils.lerp(env.fog.near, 12, dt * 2);
        env.fog.far = THREE.MathUtils.lerp(env.fog.far, 60, dt * 2);
        env.hemi.color.lerp(new THREE.Color(0x8090c0), dt * 2);
        env.hemi.groundColor.lerp(new THREE.Color(0x000000), dt * 2);
        env.hemi.intensity = THREE.MathUtils.lerp(env.hemi.intensity, 0.9, dt * 2);
        env.sun.color.lerp(new THREE.Color(0x6070a0), dt * 2);
      } else {
        // 탁 트인 곳: 하늘 · 건물은 그대로, 발밑만 그림자 바다 (빛이 아주 조금 가라앉는다)
        env.hemi.groundColor.lerp(new THREE.Color(0x05060c), dt * 2);
      }
      if (k >= 1) this.state = 'active';
    } else if (this.state === 'closing') {
      const k = Math.min(1, this.t / 0.8);
      this.u.uK.value = 1 - k;
      this.skyU.uFade.value = 1 - k;
      if (k >= 1) this._hide();
    }
  }

  _hide() {
    this.state = 'idle';
    this.sea.visible = false;
    if (this.sky.visible) {
      this.sky.visible = false;
      this.ctx.env.setHidden(false);
    }
    this.ctx.env.restore();
  }

  cancel() {
    if (this.state !== 'idle') this._hide();
  }

  dispose() {
    this.cancel();
    this.ctx.scene.remove(this.sea, this.sky);
    this.sea.geometry.dispose();
    this.sea.material.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}

/** 먹물 같은 그림자 튀김 (식신이 드나들 때) */
export function shadowSplash(fx, pos, r = 1, n = 30) {
  const c = new THREE.Color(0x06060c);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * r;
    _v.set(pos.x + Math.cos(a) * rr, 0.05, pos.z + Math.sin(a) * rr);
    fx.spawnDark(_v, new THREE.Vector3(Math.cos(a) * 0.6, 1.5 + Math.random() * 2.5, Math.sin(a) * 0.6), c, 0.04 + Math.random() * 0.05, 0.5 + Math.random() * 0.4, 1.5, 6);
  }
}
