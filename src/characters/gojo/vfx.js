// 창 · 혁 · 자 에너지 구체: 플라즈마 셰이더 + 외곽 링 + 번개 + 별 플레어 + 소용돌이 입자 (+ 자: 검은 기류)
import * as THREE from 'three';
import { Bolts, makeGlowSprite, glowTexture } from '../../core/fx.js';

const orbVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const orbFrag = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uRim;
uniform float uTime;
uniform float uPower;
uniform float uSpin;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
void main() {
  vec3 N = normalize(vN);
  float fres = 1.0 - max(0.0, dot(N, normalize(vV)));
  // 회전하는 플라즈마
  float t = uTime * uSpin;
  float c = cos(t), s = sin(t);
  vec3 p = vec3(c * vP.x - s * vP.z, vP.y, s * vP.x + c * vP.z);
  float n = fbm(p * 2.6 + vec3(0.0, uTime * 0.7, 0.0));
  float ang = atan(p.z, p.x);
  float swirl = sin(ang * 3.0 + p.y * 5.0 - uTime * 4.0 * uSpin + n * 6.0);
  float arcs = pow(1.0 - abs(swirl), 10.0);
  float veins = pow(1.0 - abs(n * 2.0 - 1.0), 12.0);
  // 중심만 하얗게 빛나고 바깥 40%는 고유색이 살아 있게
  float center = pow(1.0 - fres, 6.0);
  vec3 col = uCore * center * 1.1 + uCore * pow(1.0 - fres, 14.0) * 0.8;
  col += uMid * (0.25 + n * 0.7) * (1.0 - fres * 0.6);
  col += mix(uMid, uCore, 0.6) * (arcs * 0.9 + veins * 1.4) * (0.4 + fres);
  col += uRim * pow(fres, 2.2) * 3.0;
  col *= 0.6 + 0.6 * uPower;
  gl_FragColor = vec4(col, 1.0);
}`;

// 3D 에너지 껍질: 구를 감싼 반투명 막 위로 빛줄기가 소용돌이친다 (안쪽 면은 흐리게 비쳐 깊이감)
const shellFrag = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
uniform vec3 uMid;
uniform vec3 uRim;
uniform vec3 uCore;
uniform float uTime;
uniform float uSpin;
uniform float uPower;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
void main() {
  vec3 N = normalize(vN);
  float facing = abs(dot(N, normalize(vV)));
  float fres = 1.0 - facing;
  float t = uTime * uSpin * 0.8;
  float c = cos(t), s = sin(t);
  vec3 p = vec3(c * vP.x - s * vP.z, vP.y, s * vP.x + c * vP.z);
  float n = fbm(p * 1.7 + vec3(0.0, uTime * 0.35, uTime * 0.2));
  float ang = atan(p.z, p.x);
  // 흐르는 막의 결 (가는 빛줄기 두 겹)
  float b1 = sin(ang * 2.0 + p.y * 4.5 + n * 7.0 - uTime * 2.6 * uSpin);
  float b2 = sin(ang * 3.0 - p.y * 3.0 + n * 9.0 + uTime * 1.9 * uSpin + 1.3);
  float streak = pow(1.0 - abs(b1), 7.0) + 0.6 * pow(1.0 - abs(b2), 10.0);
  // 막의 가장자리는 진하게, 정면은 거의 투명
  float film = 0.12 + 0.88 * pow(fres, 1.6);
  vec3 col = uMid * film * (0.55 + n * 0.7);
  col += mix(uRim, uCore, 0.35) * streak * (0.35 + 0.9 * fres);
  col += uRim * pow(fres, 3.5) * 1.4;
  // 바깥 테두리에서 사라지는 부드러운 끝
  col *= smoothstep(0.0, 0.18, facing + 0.05);
  col *= (gl_FrontFacing ? 1.0 : 0.45) * (0.55 + 0.45 * uPower);
  gl_FragColor = vec4(col, 1.0);
}`;

let _ringTex = null;
function ringTexture() {
  if (_ringTex) return _ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 70, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.0)');
  grd.addColorStop(0.66, 'rgba(255,255,255,1)');
  grd.addColorStop(0.72, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  _ringTex = new THREE.CanvasTexture(c);
  _ringTex.colorSpace = THREE.SRGBColorSpace;
  return _ringTex;
}

let _arcTex = null;
function arcTexture() {
  if (_arcTex) return _arcTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    const a0 = i * 2.1 + Math.random();
    g.arc(0, 0, 70 + i * 14, a0, a0 + 0.9 + Math.random() * 0.6);
    g.strokeStyle = `rgba(255,255,255,${0.9 - i * 0.2})`;
    g.lineWidth = 6 - i * 1.5;
    g.shadowColor = 'white';
    g.shadowBlur = 12;
    g.stroke();
  }
  _arcTex = new THREE.CanvasTexture(c);
  _arcTex.colorSpace = THREE.SRGBColorSpace;
  return _arcTex;
}

const swirlVert = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime; uniform float uRadius; uniform float uDir; uniform float uSpeed; uniform float uFlat; uniform float uScale;
varying float vA; varying float vMix;
void main() {
  float ph = fract(aSeed.x + uTime * uSpeed * (0.6 + aSeed.z * 0.8));
  float t = uDir > 0.0 ? 1.0 - ph : ph;
  float r = uRadius * (0.35 + t);
  float th = aSeed.y * 6.2831853 + uTime * (1.5 + aSeed.z * 2.5) + (1.0 - t) * 4.0 * uDir;
  float cph = (aSeed.z * 2.0 - 1.0) * (1.0 - uFlat);
  float sph = sqrt(max(0.0, 1.0 - cph * cph));
  vec3 p = vec3(cos(th) * sph, cph, sin(th) * sph) * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * (0.5 + aSeed.z) * projectionMatrix[1][1] / max(0.05, -mv.z);
  vA = sin(ph * 3.14159);
  vMix = aSeed.y;
}`;
const swirlFrag = /* glsl */ `
uniform vec3 uColor; uniform vec3 uColor2; varying float vA; varying float vMix;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(mix(uColor, uColor2, step(0.5, vMix)) * a * vA, 1.0);
}`;

const _sphere = new THREE.SphereGeometry(1, 48, 32);
const _v = new THREE.Vector3();

export const ORB_PRESETS = {
  blue: { core: 0xf0faff, mid: 0x2f86ff, rim: 0x6cc4ff, bolt: 0xe8f6ff, swirl: 0x4aa8ff, swirl2: 0xd0f0ff, dir: 1, spin: 1.2, flat: 0.55, swirlScale: 3.2, shell: true },
  red: { core: 0xfff4ee, mid: 0xff1a2a, rim: 0xff5a48, bolt: 0xfff0e8, swirl: 0xff3a2a, swirl2: 0xffc080, dir: -1, spin: -1.6, flat: 0.15, swirlScale: 2.2, shell: true },
  purple: { core: 0xfff2ff, mid: 0x8a2cff, rim: 0xc070ff, bolt: 0xf6eaff, swirl: 0x9a4cff, swirl2: 0xf0c0ff, dir: 1, spin: 1.0, flat: 0.3, swirlScale: 1.9, dark: true, shell: true },
};

export class EnergyOrb {
  constructor(ctx, presetName, radius = 0.1) {
    this.ctx = ctx;
    const P = ORB_PRESETS[presetName];
    this.P = P;
    this.name = presetName;
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.time = Math.random() * 10;
    this.power = 1;
    this.u = {
      uCore: { value: new THREE.Color(P.core) },
      uMid: { value: new THREE.Color(P.mid) },
      uRim: { value: new THREE.Color(P.rim) },
      uTime: { value: 0 },
      uPower: { value: 1 },
      uSpin: { value: P.spin },
    };
    this.core = new THREE.Mesh(_sphere, new THREE.ShaderMaterial({ vertexShader: orbVert, fragmentShader: orbFrag, uniforms: this.u, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.halo = makeGlowSprite(new THREE.Color(P.rim), 1);
    this.halo.material.opacity = 0.8;
    this.ring = makeGlowSprite(new THREE.Color(P.rim).lerp(new THREE.Color(0xffffff), 0.3), 1, ringTexture());
    this.arcs = [makeGlowSprite(new THREE.Color(P.core), 1, arcTexture()), makeGlowSprite(new THREE.Color(P.rim), 1, arcTexture())];
    this.hot = makeGlowSprite(new THREE.Color(0xffffff), 1, glowTexture());
    const n = 420;
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) seeds[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    this.su = {
      uTime: { value: 0 }, uRadius: { value: 1 }, uDir: { value: P.dir }, uSpeed: { value: 1.1 }, uFlat: { value: P.flat }, uScale: { value: 0.02 },
      uColor: { value: new THREE.Color(P.swirl) }, uColor2: { value: new THREE.Color(P.swirl2) },
    };
    this.swirl = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: swirlVert, fragmentShader: swirlFrag, uniforms: this.su, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.swirl.frustumCulled = false;
    // 밝은 배경에서도 보이도록 일반 혼합 바탕층
    this.base = new THREE.Mesh(_sphere, new THREE.ShaderMaterial({
      vertexShader: orbVert,
      fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uMid; uniform vec3 uRim; uniform float uBaseA;
        void main(){ float f = 1.0 - max(0.0, dot(normalize(vN), normalize(vV)));
          vec3 c = mix(uMid * 0.85, uRim * 0.6, f); gl_FragColor = vec4(c, (0.55 + 0.4 * f) * uBaseA); }`,
      uniforms: { uMid: this.u.uMid, uRim: this.u.uRim, uBaseA: { value: P.baseA ?? 1 } },
      transparent: true, depthWrite: false,
    }));
    this.base.scale.setScalar(0.98);
    this.base.renderOrder = 7;
    this.base.visible = !!ctx.fx.brightBg;
    this.tint = makeGlowSprite(new THREE.Color(P.mid), 1);
    this.tint.material.blending = THREE.NormalBlending;
    this.tint.material.opacity = 0.35;
    this.tint.visible = !!ctx.fx.brightBg;
    // 3D 껍질 (창·혁·자): 2D 고리/호 스프라이트 대신 입체 막
    this.shell = null;
    if (P.shell) {
      this.shell = new THREE.Mesh(_sphere, new THREE.ShaderMaterial({ vertexShader: orbVert, fragmentShader: shellFrag, uniforms: this.u, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide }));
      this.shell.renderOrder = 9;
      this.ring.visible = false;
      for (const a of this.arcs) a.visible = false;
      // 바깥 안개는 고유색(mid)으로: 가운데가 하얗게 바래지 않도록
      this.halo.material.color.set(P.mid);
      this.halo.material.opacity = 0.6;
    }
    this.group.add(this.tint, this.halo, this.ring, ...this.arcs, this.base, this.core, this.hot, this.swirl);
    if (this.shell) this.group.add(this.shell);
    this.scene.add(this.group);
    this.bolts = new Bolts(this.scene, { count: 7, segs: 9, color: P.bolt, width: 0.006 });
    this.darkBolts = new Bolts(this.scene, { count: P.dark ? 4 : 3, segs: 9, color: P.dark ? 0x08000f : P.mid, width: 0.008, dark: true });
    this.boltT = 0;
    this.starT = 0.2;
    this.wispT = 0;
    this.light = null;
    this.setRadius(radius);
  }

  setRadius(r) {
    this.radius = r;
    this.core.scale.setScalar(r);
    this.halo.scale.setScalar(r * (this.shell ? 5.2 : 4.2));
    if (this.shell) this.shell.scale.setScalar(r * 1.42);
    this.ring.scale.setScalar(r * 2.9);
    this.hot.scale.setScalar(r * (this.shell ? 0.9 : 1.6));
    this.base.scale.setScalar(r * 0.98);
    this.tint.scale.setScalar(r * 3.5);
    for (const a of this.arcs) a.scale.setScalar(r * 3.3);
    this.su.uRadius.value = r * this.P.swirlScale;
    this.su.uScale.value = Math.max(0.01, r * (this.shell ? 0.07 : 0.12));
  }

  update(dt, intensity = 1) {
    const fx = this.ctx.fx;
    this.time += dt;
    this.u.uTime.value = this.time;
    this.u.uPower.value = intensity;
    this.su.uTime.value = this.time;
    this.swirl.rotation.y += dt * 0.6;
    this.arcs[0].material.rotation += dt * 4 * this.P.spin;
    this.arcs[1].material.rotation -= dt * 3 * this.P.spin;
    this.arcs[0].material.opacity = 0.5 + Math.random() * 0.5;
    this.arcs[1].material.opacity = 0.3 + Math.random() * 0.5;
    this.ring.material.opacity = 0.75 + Math.sin(this.time * 20) * 0.15;
    if (this.shell) this.shell.rotation.x += dt * 0.7 * this.P.spin;
    this.hot.material.opacity = (this.shell ? 0.3 : 0.7) + Math.random() * (this.shell ? 0.15 : 0.3);
    const r = this.radius;
    const cam = this.ctx.input.head;
    // 빛 번짐 스프라이트를 카메라 쪽으로 살짝 당겨, 손가락과 교차하며 손이 잘려 보이는 현상을 막는다
    _v.subVectors(cam, this.pos);
    const camD = _v.length();
    _v.multiplyScalar(Math.min(r * 1.6, 0.14, camD * 0.4) / Math.max(1e-4, camD));
    for (const sp of [this.halo, this.tint, this.ring, this.hot, ...this.arcs]) sp.position.copy(_v);
    this.boltT -= dt;
    if (this.boltT <= 0) {
      this.boltT = 0.05 + Math.random() * 0.04;
      this.bolts.width = Math.max(0.004, r * 0.05);
      const nb = !!this.P.noBolts; // 번개 없는 구체
      this.bolts.regen(this.pos, r, cam, 1.1, nb ? 0 : Math.round(3 + 4 * intensity));
      this.darkBolts.width = Math.max(0.004, r * (this.P.dark ? 0.07 : 0.035));
      this.darkBolts.regen(this.pos, r * 1.05, cam, 1.3, !nb && (this.P.dark || this.ctx.fx.brightBg) ? 3 : 0);
    }
    this.starT -= dt;
    if (this.starT <= 0) {
      this.starT = (this.shell ? 0.5 : 0.18) + Math.random() * 0.3;
      _v.randomDirection().multiplyScalar(r * (0.8 + Math.random() * 0.6)).add(this.pos);
      fx.starFlare(_v, 0xffffff, r * (1.5 + Math.random() * 1.5), 0.3);
    }
    if (this.P.dark) {
      this.wispT -= dt;
      if (this.wispT <= 0) {
        this.wispT = 0.02;
        for (let i = 0; i < 2; i++) {
          const d = _v.randomDirection();
          const p = d.clone().multiplyScalar(r * 1.02).add(this.pos);
          fx.spawnDark(p, d.multiplyScalar(r * (1.5 + Math.random() * 2.5)), new THREE.Color(0x0a0012), r * 0.1, 0.35 + Math.random() * 0.3, 1.5, 0, 0.6);
        }
      }
    }
    if (this.light) this.light.position.copy(this.pos);
  }

  dispose() {
    this.scene.remove(this.group);
    this.core.material.dispose();
    this.shell?.material.dispose();
    this.swirl.material.dispose();
    this.swirl.geometry.dispose();
    for (const s of [this.halo, this.ring, this.hot, this.tint, ...this.arcs]) s.material.dispose();
    this.base.material.dispose();
    this.bolts.dispose(this.scene);
    this.darkBolts.dispose(this.scene);
    if (this.light) this.ctx.fx.releaseLight(this.light);
    this.light = null;
  }
}
