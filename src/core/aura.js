// 오라 불꽃: 먹선 테두리 안에서 빛나는 액체 같은 불꽃 혀 (만화풍 주력·오라 표현)
// 한 장 = 카메라를 향한 사각형. 진행 방향으로 늘어나고, 잡음으로 일렁이다 갉아먹히듯 사라진다
import * as THREE from 'three';

const vert = /* glsl */ `
attribute float aSeed;
attribute float aLife;
varying vec2 vUv;
varying float vSeed;
varying float vLife;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vLife = aLife;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform vec3 uGlow;
uniform vec3 uHot;
uniform vec3 uInner;
uniform vec3 uLine;
varying vec2 vUv;
varying float vSeed;
varying float vLife;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.1 + 1.7; a *= 0.5; } return s; }
void main() {
  // x: 꼬리(0) → 머리(1), y: 폭
  float u = vUv.x;
  float v = vUv.y - 0.5;
  float t = uTime * 1.6 + vSeed * 17.0;
  // 불꽃 혀: 뒤쪽(u=0)이 둥글고 나아가는 쪽(u=1)으로 가늘고 뾰족하게 빠진다 + 끝이 꿈틀거림
  float w = 0.4 * pow(smoothstep(0.0, 0.3, u), 0.6) * pow(1.0 - smoothstep(0.25, 1.0, u), 1.3);
  v += sin(u * 6.0 - t * 2.4) * 0.1 * u + sin(u * 13.0 - t * 3.1) * 0.025;
  float n = fbm(vec2(u * 3.0 - t, v * 3.5 + vSeed * 5.0));
  float m = w - abs(v) + (n - 0.5) * 0.22;
  // 시들 때: 안쪽부터 갉아먹히듯
  float die = smoothstep(0.55, 0.0, vLife);
  m -= die * 0.25 * (0.6 + fbm(vec2(u * 6.0, v * 6.0 + vSeed)) );
  float glow = smoothstep(-0.14, 0.0, m) * 0.45;   // 바깥 번짐
  if (m < -0.14) discard;
  vec3 col;
  float a;
  if (m < 0.0) { col = uGlow; a = glow * (1.0 - die); }
  else if (m < 0.016) { col = uLine; a = 1.0; }                     // 먹선
  else if (m < 0.085) {                                              // 빛나는 띠
    float sp = step(0.8, noise(vec2(u * 30.0, v * 30.0 + t)));       // 띠 위 검은 얼룩
    col = mix(uHot, uLine, sp * 0.85); a = 1.0;
  }
  else {                                                             // 안쪽: 어둡고 투명하게 비침
    float k = smoothstep(0.085, 0.22, m);
    col = mix(uGlow * 0.85, uInner, k);
    a = mix(0.95, 0.45, k);
  }
  gl_FragColor = vec4(col, a * smoothstep(0.0, 0.08, vLife));
}`;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

export const AURA_COLORS = {
  // 스쿠나: 핏빛 주력 (붉은 빛띠 · 검붉은 속)
  crimson: { glow: 0xff1a2a, hot: 0xff6a6a, inner: 0x2a0306, line: 0x080102 },
  cyan: { glow: 0x2ad8e8, hot: 0x8ff8ff, inner: 0x062a34, line: 0x03080c },
};

export class AuraFlames {
  constructor(scene, colors = AURA_COLORS.crimson, max = 120) {
    const C = typeof colors === 'string' ? AURA_COLORS[colors] : colors;
    this.u = {
      uTime: { value: 0 },
      uGlow: { value: new THREE.Color(C.glow) },
      uHot: { value: new THREE.Color(C.hot) },
      uInner: { value: new THREE.Color(C.inner) },
      uLine: { value: new THREE.Color(C.line) },
    };
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0.3, 0, 0); // 뿌리(둥근 쪽)가 기준점, 끝이 진행 방향으로
    this.seed = new Float32Array(max);
    this.lifeA = new Float32Array(max);
    for (let i = 0; i < max; i++) this.seed[i] = Math.random();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(this.seed, 1));
    this.lifeAttr = new THREE.InstancedBufferAttribute(this.lifeA, 1);
    this.lifeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aLife', this.lifeAttr);
    this.mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    scene.add(this.mesh);
    this.scene = scene;
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0.2, drag: 1 });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.cursor = 0;
  }

  /** 불꽃 혀 하나: pos에서 vel 방향으로 늘어나며 흐른다 */
  spawn(pos, vel, size = 0.25, life = 0.8, drag = 1.2) {
    const it = this.items[this.cursor];
    this.seed[this.cursor] = Math.random();
    this.cursor = (this.cursor + 1) % this.items.length;
    it.pos.copy(pos);
    it.vel.copy(vel);
    it.size = size;
    it.life = it.max = life;
    it.drag = drag;
  }

  update(dt, camPos) {
    this.u.uTime.value += dt;
    let any = false;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.life <= 0) {
        if (this.lifeA[i] !== 0) {
          this.lifeA[i] = 0;
          this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
          any = true;
        }
        continue;
      }
      any = true;
      it.life -= dt;
      it.pos.addScaledVector(it.vel, dt);
      it.vel.multiplyScalar(Math.exp(-it.drag * dt));
      const k = Math.max(0, it.life / it.max);
      this.lifeA[i] = k;
      // 진행 방향(화면에 투영)으로 길게, 카메라를 향해
      _z.subVectors(camPos, it.pos).normalize();
      _x.copy(it.vel);
      if (_x.lengthSq() < 1e-4) _x.set(0, 1, 0);
      _x.addScaledVector(_z, -_x.dot(_z));
      if (_x.lengthSq() < 1e-6) _x.set(0, 1, 0).addScaledVector(_z, -_z.y);
      _x.normalize();
      _y.crossVectors(_z, _x).normalize();
      _m.makeBasis(_x, _y, _z);
      _q.setFromRotationMatrix(_m);
      const grow = 0.55 + 0.45 * Math.min(1, (1 - k) * 4);
      const len = it.size * (2.4 + Math.min(2, it.vel.length() * 0.8)) * grow;
      _s.set(len, it.size * grow, 1);
      this.mesh.setMatrixAt(i, _m.compose(it.pos, _q, _s));
    }
    if (any) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.lifeAttr.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
