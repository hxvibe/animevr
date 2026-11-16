// 쵸소우 — 적혈조술 이펙트
import * as THREE from 'three';

const NOISE = /* glsl */ `
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
}`;

// 액체 피 구슬: 출렁이는 표면 + 광택 + 가장자리 빛
const orbVert = /* glsl */ `
uniform float uTime;
uniform float uWobble;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
${NOISE}
void main() {
  vec3 p = position;
  float n = noise(p * 4.0 + vec3(uTime * 2.0, uTime * 1.3, -uTime * 1.7));
  p += normal * (n - 0.5) * uWobble;
  vP = p;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const orbFrag = /* glsl */ `
uniform float uTime;
uniform float uGlow;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
${NOISE}
void main() {
  vec3 N = normalize(vN);
  float fres = pow(1.0 - abs(dot(N, vV)), 2.5);
  // 안쪽으로 소용돌이치는 결
  float swirl = noise(vec3(vP.x * 6.0 + uTime * 3.0, vP.y * 6.0 - uTime * 2.0, vP.z * 6.0));
  vec3 deep = vec3(0.22, 0.0, 0.02);
  vec3 red = vec3(0.75, 0.02, 0.06);
  vec3 c = mix(deep, red, smoothstep(0.3, 0.8, swirl));
  // 젖은 광택
  vec3 L = normalize(vec3(0.4, 0.8, 0.5));
  vec3 H = normalize(L + vV);
  float spec = pow(max(dot(N, H), 0.0), 60.0);
  c += vec3(1.0, 0.75, 0.75) * spec * 1.2;
  c += vec3(1.0, 0.15, 0.2) * fres * (0.6 + uGlow);
  gl_FragColor = vec4(c, 1.0);
}`;

export class BloodOrb {
  constructor(scene, radius = 0.05) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.u = { uTime: { value: Math.random() * 10 }, uWobble: { value: 0.12 }, uGlow: { value: 0 } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: orbVert, fragmentShader: orbFrag, uniforms: this.u, toneMapped: false });
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), this.mat);
    // 압축되며 도는 피의 고리
    this.rings = [];
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8a0010, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.45 + i * 0.25, 0.05 - i * 0.012, 6, 40), ringMat);
      r.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      r.userData.spin = new THREE.Vector3((Math.random() - 0.5) * 8, 6 + i * 3, (Math.random() - 0.5) * 8);
      this.rings.push(r);
      this.group.add(r);
    }
    this.ringMat = ringMat;
    this.group.add(this.ball);
    scene.add(this.group);
    this.pos = this.group.position;
    this.setRadius(radius);
  }

  setRadius(r) {
    this.radius = r;
    this.group.scale.setScalar(r);
  }

  update(dt, energy = 1) {
    this.u.uTime.value += dt * (1 + energy);
    this.u.uGlow.value = energy * 0.6;
    for (const r of this.rings) {
      r.rotation.x += r.userData.spin.x * dt * energy;
      r.rotation.y += r.userData.spin.y * dt * energy;
      r.rotation.z += r.userData.spin.z * dt * energy;
    }
    this.ringMat.opacity = 0.35 + 0.5 * energy;
  }

  dispose() {
    this.scene.remove(this.group);
    this.mat.dispose();
    this.ringMat.dispose();
    this.ball.geometry.dispose();
    for (const r of this.rings) r.geometry.dispose();
  }
}

// 穿血 광선: 가늘고 밝은 심 + 짙은 피의 외피, 길이 방향으로 흐르는 결
const beamVert = /* glsl */ `
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
const beamFrag = /* glsl */ `
uniform float uTime;
uniform float uLen;
uniform vec3 uColor;
uniform float uCore;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
${NOISE}
void main() {
  float facing = abs(dot(normalize(vN), vV));
  float flow = noise(vec3(vUv.y * uLen * 3.0 - uTime * 60.0, vUv.x * 6.0, uTime));
  vec3 c = uColor * (0.7 + 0.6 * flow);
  c = mix(c, vec3(1.0, 0.75, 0.75), uCore * smoothstep(0.55, 1.0, facing));
  float a = uOpacity * mix(0.5, 1.0, facing);
  gl_FragColor = vec4(c, a);
}`;

export class BloodBeam {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    geo.translate(0, 0.5, 0);
    geo.rotateX(-Math.PI / 2); // +Y → -Z 방향으로 뻗음
    this.uCore = { uTime: { value: 0 }, uLen: { value: 30 }, uColor: { value: new THREE.Color(0xff1020) }, uCore: { value: 1 }, uOpacity: { value: 1 } };
    this.uOuter = { uTime: this.uCore.uTime, uLen: this.uCore.uLen, uColor: { value: new THREE.Color(0x6a0008) }, uCore: { value: 0 }, uOpacity: { value: 0.7 } };
    this.core = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamFrag, uniforms: this.uCore, toneMapped: false }));
    this.outer = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamFrag, uniforms: this.uOuter, transparent: true, depthWrite: false, toneMapped: false }));
    this.core.frustumCulled = this.outer.frustumCulled = false;
    this.group.add(this.core, this.outer);
    scene.add(this.group);
  }

  set(origin, dir, len, radius, k = 1) {
    this.group.position.copy(origin);
    this.group.lookAt(origin.x - dir.x, origin.y - dir.y, origin.z - dir.z); // -Z가 dir
    this.core.scale.set(radius, radius, len);
    this.outer.scale.set(radius * 2.6, radius * 2.6, len);
    this.uCore.uLen.value = len;
    this.uOuter.uOpacity.value = 0.65 * k;
    this.core.visible = k > 0.05;
  }

  update(dt) {
    this.uCore.uTime.value += dt;
  }

  dispose() {
    this.scene.remove(this.group);
    this.core.material.dispose();
    this.outer.material.dispose();
    this.core.geometry.dispose();
  }
}

// 超新星: 사방으로 튀어나오는 피의 가시
const SPIKES = 46;
export class Supernova {
  constructor(scene, pos, power = 1, maxLen = 9) {
    this.scene = scene;
    const geo = new THREE.ConeGeometry(1, 1, 6, 1, true);
    geo.translate(0, 0.5, 0); // 밑면이 중심, 뾰족한 끝이 +Y
    const mat = new THREE.MeshBasicMaterial({ color: 0x9a0010, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, SPIKES);
    this.mesh.frustumCulled = false;
    this.dirs = [];
    this.lens = [];
    for (let i = 0; i < SPIKES; i++) {
      this.dirs.push(new THREE.Vector3().randomDirection());
      this.lens.push(Math.min(maxLen, (0.5 + Math.random() * 0.9) * power));
    }
    this.pos = pos.clone();
    this.t = 0;
    this.power = power;
    this.color = new THREE.Color();
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /** @returns 끝났으면 false */
  update(dt) {
    this.t += dt;
    const D = 0.7;
    const k = this.t / D;
    if (k >= 1) return false;
    const grow = k < 0.12 ? k / 0.12 : 1;
    const shrink = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
    for (let i = 0; i < SPIKES; i++) {
      const L = this.lens[i] * grow * (0.4 + 0.6 * shrink);
      const w = 0.035 * this.power * shrink + 0.005;
      this._q.setFromUnitVectors(this._up, this.dirs[i]);
      this._s.set(w, L, w);
      this._m.compose(this.pos, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      this.color.setRGB(0.6 + 0.3 * shrink, 0.0, 0.05);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
