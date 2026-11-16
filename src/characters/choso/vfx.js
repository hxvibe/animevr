// 쵸소우 — 적혈조술 이펙트
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

const NOISE = /* glsl */ `
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
}`;

/** 현실적인 피 재질: 짙은 적갈색, 젖은 광택(환경 반사), 아주 약한 자체 발광 */
const _bloodMats = new Map();
export function bloodMaterial(envMap = null, opts = {}) {
  const key = (envMap?.uuid ?? 'none') + JSON.stringify(opts);
  if (_bloodMats.has(key)) return _bloodMats.get(key);
  const { wobble = 0, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({ color: 0x420006, roughness: 0.08, metalness: 0.05, envMap, envMapIntensity: 1.3, emissive: 0x140002, ...rest });
  // 표면이 살짝 출렁이도록 (액체)
  m.userData.time = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed += normal * (sin(position.x * 23.0 + uTime * 5.0) * sin(position.y * 19.0 - uTime * 4.0) * sin(position.z * 21.0 + uTime * 3.0)) * ${wobble.toFixed(3)};`);
  };
  _bloodMats.set(key, m);
  return m;
}

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
  constructor(scene, radius = 0.05, envMap = null) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.u = { uTime: { value: Math.random() * 10 }, uWobble: { value: 0.12 }, uGlow: { value: 0 } };
    this.mat = bloodMaterial(envMap, { wobble: 0.06 });
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), this.mat);
    // 압축되며 도는 피의 고리
    this.rings = [];
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x3a0005, roughness: 0.1, metalness: 0.05, envMap, envMapIntensity: 1.2, emissive: 0x120002, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.45 + i * 0.25, 0.07 - i * 0.015, 8, 48), ringMat);
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
    this.mat.userData.time.value += dt * (1 + energy);
    for (const r of this.rings) {
      r.rotation.x += r.userData.spin.x * dt * energy;
      r.rotation.y += r.userData.spin.y * dt * energy;
      r.rotation.z += r.userData.spin.z * dt * energy;
    }
    this.ringMat.opacity = 0.5 + 0.45 * energy;
  }

  dispose() {
    this.scene.remove(this.group);
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
  constructor(scene, envMap = null) {
    this.scene = scene;
    this.group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    geo.translate(0, 0.5, 0);
    geo.rotateX(-Math.PI / 2); // +Y → -Z 방향으로 뻗음
    this.uCore = { uTime: { value: 0 }, uLen: { value: 30 }, uColor: { value: new THREE.Color(0xff1020) }, uCore: { value: 1 }, uOpacity: { value: 1 } };
    this.uOuter = { uTime: this.uCore.uTime, uLen: this.uCore.uLen, uColor: { value: new THREE.Color(0x3a0004) }, uCore: { value: 0 }, uOpacity: { value: 0.5 } };
    // 심: 초음속으로 뿜어지는 피 (젖은 광택), 겉: 흩날리는 얇은 피 안개
    this.core = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5a0008, roughness: 0.05, metalness: 0.1, envMap, envMapIntensity: 1.6, emissive: 0x2a0004 }));
    this.outer = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamFrag, uniforms: this.uOuter, transparent: true, depthWrite: false, toneMapped: false }));
    this.core.frustumCulled = this.outer.frustumCulled = false;
    this.group.add(this.core, this.outer);
    scene.add(this.group);
  }

  set(origin, dir, len, radius, k = 1) {
    this.group.position.copy(origin);
    this.group.lookAt(origin.x - dir.x, origin.y - dir.y, origin.z - dir.z); // -Z가 dir
    this.core.scale.set(radius, radius, len);
    this.outer.scale.set(radius * 2.2, radius * 2.2, len);
    this.uCore.uLen.value = len;
    this.uOuter.uOpacity.value = 0.45 * k;
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
  constructor(scene, pos, power = 1, maxLen = 9, envMap = null) {
    this.scene = scene;
    const geo = new THREE.ConeGeometry(1, 1, 6, 1, true);
    geo.translate(0, 0.5, 0); // 밑면이 중심, 뾰족한 끝이 +Y
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0.05, envMap, envMapIntensity: 1.3, emissive: 0x140002 });
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
      this.color.setRGB(0.26 + 0.1 * shrink, 0.0, 0.025);
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

// 바닥에 고인 피: 입자를 밀도 텍스처에 찍고 문턱값으로 잘라 하나로 이어진 웅덩이를 그린다
const puddleVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const puddleFrag = /* glsl */ `
uniform sampler2D uDen;
uniform vec2 uTexel;
uniform float uSize;
varying vec2 vUv;
varying vec3 vW;
void main() {
  float d = texture2D(uDen, vUv).r;
  float a = smoothstep(0.28, 0.36, d);
  if (a < 0.02) discard;
  float dx = texture2D(uDen, vUv + vec2(uTexel.x, 0.0)).r - texture2D(uDen, vUv - vec2(uTexel.x, 0.0)).r;
  float dz = texture2D(uDen, vUv + vec2(0.0, uTexel.y)).r - texture2D(uDen, vUv - vec2(0.0, uTexel.y)).r;
  // 가장자리는 볼록하게, 가운데는 평평하게 (표면장력)
  vec3 N = normalize(vec3(-dx * 3.0, 1.0, dz * 3.0));
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(vec3(0.3, 1.0, 0.2));
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 80.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 c = vec3(0.2, 0.0, 0.015) * (0.7 + 0.3 * max(dot(N, L), 0.0));
  c += vec3(1.0, 0.85, 0.85) * spec * 0.9 + vec3(0.5, 0.1, 0.12) * fres * 0.5;
  gl_FragColor = vec4(c, a);
}`;

/**
 * 피 유체 그리기
 *  · 손에 들린 덩어리·모이는 피·감싼 피는 메타볼(마칭 큐브)로 이어진 매끈한 액체 표면
 *  · 공중의 방울은 개별로(빠르면 늘어남), 표면에서 떨어진 방울도 사라지지 않고 보인다
 *  · 바닥에 고인 피는 밀도 텍스처로 하나의 웅덩이
 */
export class FluidView {
  constructor(scene, envMap, max = 320, radius = 0.017) {
    this.scene = scene;
    this.radius = radius;
    const mat = bloodMaterial(envMap ?? null);
    this.mat = mat;
    const geo = new THREE.IcosahedronGeometry(1, 2);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    // 주인별(왼손·오른손·압축·감싸기) 액체 표면
    this.mcs = [];
    for (let k = 0; k < 5; k++) {
      const mc = new MarchingCubes(24, mat, false, false, 20000);
      mc.isolation = 28;
      mc.visible = false;
      mc.frustumCulled = false;
      scene.add(mc);
      this.mcs.push(mc);
    }
    this.ballR = 0.026;
    this.subtract = 12;
    // 웅덩이
    this.PW = 128;
    this.den = new Float32Array(this.PW * this.PW);
    this.denU8 = new Uint8Array(this.PW * this.PW);
    this.denTex = new THREE.DataTexture(this.denU8, this.PW, this.PW, THREE.RedFormat, THREE.UnsignedByteType);
    this.denTex.magFilter = THREE.LinearFilter;
    this.denTex.minFilter = THREE.LinearFilter;
    this.denTex.needsUpdate = true;
    this.puddleU = { uDen: { value: this.denTex }, uTexel: { value: new THREE.Vector2(1 / this.PW, 1 / this.PW) }, uSize: { value: 1 } };
    const pg = new THREE.PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.puddle = new THREE.Mesh(pg, new THREE.ShaderMaterial({ vertexShader: puddleVert, fragmentShader: puddleFrag, uniforms: this.puddleU, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.puddle.visible = false;
    this.puddle.renderOrder = 2;
    scene.add(this.puddle);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._lo = new THREE.Vector3();
    this._hi = new THREE.Vector3();
  }

  _isFloor(sim, i) {
    const i3 = i * 3;
    return sim.owner[i] === 0 && sim.p[i3 + 1] <= sim.floor + 0.004 && Math.abs(sim.v[i3]) + Math.abs(sim.v[i3 + 2]) < 0.8;
  }

  update(sim) {
    const n = sim.n;
    const r = this.radius;
    // 1) 주인 있는 입자 → 메타볼 표면
    for (let k = 0; k < this.mcs.length; k++) {
      const owner = k + 1;
      const mc = this.mcs[k];
      const lo = this._lo.set(Infinity, Infinity, Infinity);
      const hi = this._hi.set(-Infinity, -Infinity, -Infinity);
      let cnt = 0;
      for (let i = 0; i < n; i++) {
        if (sim.owner[i] !== owner) continue;
        const i3 = i * 3;
        lo.x = Math.min(lo.x, sim.p[i3]); lo.y = Math.min(lo.y, sim.p[i3 + 1]); lo.z = Math.min(lo.z, sim.p[i3 + 2]);
        hi.x = Math.max(hi.x, sim.p[i3]); hi.y = Math.max(hi.y, sim.p[i3 + 1]); hi.z = Math.max(hi.z, sim.p[i3 + 2]);
        cnt++;
      }
      if (cnt < 3) {
        mc.visible = false;
        continue;
      }
      const S = Math.min(2.2, Math.max(0.16, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) + this.ballR * 3);
      const cx = (lo.x + hi.x) / 2;
      const cy = (lo.y + hi.y) / 2;
      const cz = (lo.z + hi.z) / 2;
      mc.position.set(cx, cy, cz);
      mc.scale.setScalar(S / 2);
      mc.reset();
      // 칸이 커지면(넓게 퍼진 피) 공을 조금 키워 표면이 끊기지 않게
      const ballR = Math.max(this.ballR, (S / 24) * 1.1);
      const rn = ballR / S;
      const strength = this.subtract * rn * rn;
      for (let i = 0; i < n; i++) {
        if (sim.owner[i] !== owner) continue;
        const i3 = i * 3;
        const x = (sim.p[i3] - cx) / S + 0.5;
        const y = (sim.p[i3 + 1] - cy) / S + 0.5;
        const z = (sim.p[i3 + 2] - cz) / S + 0.5;
        if (x < 0.02 || x > 0.98 || y < 0.02 || y > 0.98 || z < 0.02 || z > 0.98) continue;
        mc.addBall(x, y, z, strength, this.subtract);
      }
      mc.update();
      mc.visible = true;
    }
    // 2) 방울: 공중의 모든 입자 (덩어리 안쪽 방울은 표면에 가려지고, 떨어져 나온 방울은 그대로 보인다)
    let floorN = 0;
    const lo = this._lo.set(Infinity, 0, Infinity);
    const hi = this._hi.set(-Infinity, 0, -Infinity);
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      if (this._isFloor(sim, i)) {
        this.mesh.setMatrixAt(i, this._zero);
        lo.x = Math.min(lo.x, sim.p[i3]); lo.z = Math.min(lo.z, sim.p[i3 + 2]);
        hi.x = Math.max(hi.x, sim.p[i3]); hi.z = Math.max(hi.z, sim.p[i3 + 2]);
        floorN++;
        continue;
      }
      this._p.set(sim.p[i3], sim.p[i3 + 1], sim.p[i3 + 2]);
      this._d.set(sim.v[i3], sim.v[i3 + 1], sim.v[i3 + 2]);
      const sp = this._d.length();
      const life = sim.life[i];
      if (sp > 0.05) this._q.setFromUnitVectors(this._up, this._d.multiplyScalar(1 / sp));
      else this._q.identity();
      const st = 1 + Math.min(1.8, sp * 0.12);
      const o = sim.owner[i];
      const rr = (o >= 4 ? r * 1.8 : o ? r * 0.75 : r) * life; // 감싼 피는 굵게 덮는다
      this._s.set(rr / Math.sqrt(st), rr * st, rr / Math.sqrt(st));
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    // 3) 웅덩이
    if (floorN < 2) {
      this.puddle.visible = false;
      return;
    }
    const W = this.PW;
    const L = Math.min(6, Math.max(0.5, hi.x - lo.x, hi.z - lo.z) + 0.25);
    const cx = (lo.x + hi.x) / 2;
    const cz = (lo.z + hi.z) / 2;
    const tex = L / W;
    const den = this.den;
    den.fill(0);
    const rad = Math.max(1.5, (r * 3.2) / tex);
    const R = Math.ceil(rad * 1.75);
    for (let i = 0; i < n; i++) {
      if (!this._isFloor(sim, i)) continue;
      const i3 = i * 3;
      const fx = ((sim.p[i3] - cx) / L + 0.5) * W;
      const fz = (-(sim.p[i3 + 2] - cz) / L + 0.5) * W; // 평면 uv의 v는 -z 방향
      const ix = Math.floor(fx);
      const iz = Math.floor(fz);
      const life = sim.life[i];
      for (let z = iz - R; z <= iz + R; z++) {
        if (z < 0 || z >= W) continue;
        for (let x = ix - R; x <= ix + R; x++) {
          if (x < 0 || x >= W) continue;
          const dd = ((x + 0.5 - fx) ** 2 + (z + 0.5 - fz) ** 2) / (rad * rad);
          if (dd < 3) den[z * W + x] += Math.exp(-dd) * life;
        }
      }
    }
    const u8 = this.denU8;
    for (let k = 0; k < den.length; k++) u8[k] = Math.min(255, den[k] * 200);
    this.denTex.needsUpdate = true;
    this.puddle.position.set(cx, sim.floor + 0.002, cz);
    this.puddle.scale.set(L, 1, L);
    this.puddle.visible = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.puddle);
    for (const mc of this.mcs) {
      this.scene.remove(mc);
      mc.geometry.dispose();
    }
    this.mesh.geometry.dispose();
    this.puddle.material.dispose();
    this.puddle.geometry.dispose();
    this.denTex.dispose();
  }
}
