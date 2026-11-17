// 손오공 VFX: 에네르기파 빔 · 기탄 · 원기옥 · 순간이동 깜빡임
import * as THREE from 'three';
import { makeGlowSprite, glowTexture } from '../../core/fx.js';
import { ORB_PRESETS } from '../gojo/vfx.js';

const _v = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);

// 기를 모은 구체 (에너지 구체를 기 색으로)
ORB_PRESETS.ki = { core: 0xffffff, mid: 0x3aa8ff, rim: 0x8fdcff, bolt: 0xbfeaff, swirl: 0x5ab8ff, swirl2: 0xe8f8ff, dir: 1, spin: 0.9, flat: 0.1, swirlScale: 2.0 };
ORB_PRESETS.kiGold = { core: 0xffffff, mid: 0xffb000, rim: 0xffe27a, bolt: 0xfff2b0, swirl: 0xffc21a, swirl2: 0xfff8e0, dir: 1, spin: 0.9, flat: 0.1, swirlScale: 2.0 };
ORB_PRESETS.spiritGold = { core: 0xffffff, mid: 0xffd24a, rim: 0xfff6d0, bolt: 0xfff2c0, swirl: 0xffd860, swirl2: 0xffffff, dir: 1, spin: 0.35, flat: 0.0, swirlScale: 1.35, noBolts: true, baseA: 0.4 };
ORB_PRESETS.spirit = { core: 0xffffff, mid: 0x9ad8ff, rim: 0xf0faff, bolt: 0xe6f8ff, swirl: 0x9fe0ff, swirl2: 0xffffff, dir: 1, spin: 0.35, flat: 0.0, swirlScale: 1.35, noBolts: true, baseA: 0.4 };

// 길이는 미터 단위 그대로(uLen에서 잘림). 손 가까이는 가늘게 시작해 2m쯤에서 제 굵기
const beamVert = /* glsl */ `
  uniform float uLen;
  varying float vZ; varying float vA; varying vec3 vN; varying vec3 vV;
  void main(){
    vec3 p = position;
    float z = min(p.z, uLen);
    float taper = mix(0.28, 1.0, smoothstep(0.0, 2.2, z));
    // 끝은 둥글게 오므린다
    float cap = sqrt(clamp((uLen - z) / 0.6, 0.0, 1.0));
    p.xy *= taper * mix(0.55, 1.0, cap);
    p.z = z;
    vZ = z;
    vA = atan(position.y, position.x);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

// 중심은 희고 바깥은 푸른 빛. 길이 방향으로 흐르는 결
const beamCoreFrag = /* glsl */ `
  uniform float uTime; uniform float uLen; uniform float uOpacity; uniform vec3 uColor; uniform vec3 uCore;
  varying float vZ; varying float vA; varying vec3 vN; varying vec3 vV;
  void main(){
    float facing = abs(dot(vN, vV));
    float core = pow(facing, 2.5);
    float z = vZ;
    float flow = 0.5 + 0.5 * sin(z * 3.0 - uTime * 45.0 + vA * 3.0);
    float flow2 = 0.5 + 0.5 * sin(z * 1.3 - uTime * 30.0 - vA * 2.0);
    vec3 c = mix(uColor, uCore, clamp(core * 1.2, 0.0, 1.0));
    float a = (0.35 + 0.65 * facing) * (0.75 + 0.25 * flow * flow2);
    gl_FragColor = vec4(c * a * uOpacity, 1.0);
  }`;

// 밝은 배경용 바깥층 (일반 혼합)
const beamOuterFrag = /* glsl */ `
  uniform float uTime; uniform float uLen; uniform float uOpacity; uniform vec3 uColor;
  varying float vZ; varying float vA; varying vec3 vN; varying vec3 vV;
  void main(){
    float facing = abs(dot(vN, vV));
    float rim = 1.0 - facing;
    float z = vZ;
    float flow = 0.5 + 0.5 * sin(z * 2.2 - uTime * 38.0 + vA * 4.0);
    float a = (0.25 + 0.55 * pow(rim, 1.5) + 0.2 * flow) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }`;

// 반지름 1, 길이 방향 +Z(미터). 손 가까이에 고리를 촘촘히 둬서 가늘어지는 모양이 매끄럽게
function beamGeometry() {
  const rings = [0, 0.08, 0.2, 0.35, 0.55, 0.8, 1.1, 1.5, 2.0, 2.6, 3.5, 5, 7, 10, 14, 20, 28, 40, 60, 90];
  const seg = 24;
  const pos = [];
  const nrm = [];
  const idx = [];
  for (const z of rings) {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a), Math.sin(a), z);
      nrm.push(Math.cos(a), Math.sin(a), 0);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < seg; i++) {
      const a = r * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 45), 60);
  return g;
}
const _cyl = beamGeometry();

export class KiBeam {
  constructor(ctx, { color = 0x3aa8ff, core = 0xffffff, outer = 0x2a7ce0 } = {}) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.u = { uTime: { value: 0 }, uLen: { value: 1 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(core) } };
    this.core = new THREE.Mesh(_cyl, new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamCoreFrag, uniforms: this.u, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.core.renderOrder = 9;
    this.outerU = { uTime: this.u.uTime, uLen: this.u.uLen, uOpacity: { value: 1 }, uColor: { value: new THREE.Color(outer) } };
    this.outer = new THREE.Mesh(_cyl, new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamOuterFrag, uniforms: this.outerU, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.outer.renderOrder = 8;
    this.haloU = { uTime: this.u.uTime, uLen: this.u.uLen, uOpacity: { value: 0.25 }, uColor: { value: new THREE.Color(color) } };
    this.halo = new THREE.Mesh(_cyl, new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamOuterFrag, uniforms: this.haloU, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.group.add(this.outer, this.halo, this.core);
    // 손끝의 섬광과 끝부분의 충돌 섬광
    this.muzzle = makeGlowSprite(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4), 1);
    this.tip = makeGlowSprite(new THREE.Color(0xffffff), 1, glowTexture());
    this.tipColor = makeGlowSprite(new THREE.Color(color), 1);
    this.muzzle.renderOrder = this.tip.renderOrder = this.tipColor.renderOrder = 10;
    ctx.scene.add(this.group, this.muzzle, this.tip, this.tipColor);
    this.len = 0.01;
    this.r = 0.2;
    this.origin = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
  }

  set(origin, dir, len, r, opacity, dt) {
    this.origin.copy(origin);
    this.dir.copy(dir);
    this.len = len;
    this.r = r;
    this.u.uTime.value += dt;
    this.u.uLen.value = len;
    this.u.uOpacity.value = opacity;
    this.outerU.uOpacity.value = opacity * (this.ctx.fx.brightBg ? 1 : 0.35);
    this.group.position.copy(origin);
    this.group.quaternion.setFromUnitVectors(_z, dir);
    const wob = 1 + Math.sin(this.u.uTime.value * 60) * 0.04;
    this.core.scale.set(r * 0.62 * wob, r * 0.62 * wob, 1);
    this.outer.scale.set(r * wob, r * wob, 1);
    this.halo.scale.set(r * 1.6, r * 1.6, 1);
    this.haloU.uOpacity.value = 0.3 * opacity;
    this.muzzle.position.copy(origin);
    this.muzzle.scale.setScalar(r * 2.2 * wob);
    this.muzzle.material.opacity = opacity;
    _v.copy(origin).addScaledVector(dir, len);
    this.tip.position.copy(_v);
    this.tipColor.position.copy(_v);
    this.tip.scale.setScalar(r * (3 + Math.random()));
    this.tipColor.scale.setScalar(r * (5.5 + Math.random() * 1.5));
    this.tip.material.opacity = opacity;
    this.tipColor.material.opacity = 0.8 * opacity;
  }

  dispose() {
    this.ctx.scene.remove(this.group, this.muzzle, this.tip, this.tipColor);
    this.core.material.dispose();
    this.outer.material.dispose();
    this.halo.material.dispose();
    for (const s of [this.muzzle, this.tip, this.tipColor]) s.material.dispose();
  }
}

const _small = new THREE.SphereGeometry(1, 16, 12);

/** 가벼운 기탄 (연사용) */
export class KiShot {
  constructor(ctx, color = 0xffe07a, r = 0.06) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.core = new THREE.Mesh(_small, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.base = new THREE.Mesh(_small, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.85), transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
    this.glow = makeGlowSprite(new THREE.Color(color), 1);
    this.group.add(this.base, this.glow, this.core);
    this.base.visible = !!ctx.fx.brightBg;
    ctx.scene.add(this.group);
    this.setRadius(r);
  }

  setRadius(r) {
    this.radius = r;
    this.core.scale.setScalar(r * 0.7);
    this.base.scale.setScalar(r);
    this.glow.scale.setScalar(r * 6);
  }

  update() {
    this.glow.material.opacity = 0.75 + Math.random() * 0.25;
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    this.core.material.dispose();
    this.base.material.dispose();
    this.glow.material.dispose();
  }
}

/** 순간이동할 때 눈앞이 잠깐 하얗게 (시야 전환을 부드럽게) */
export class Blink {
  constructor(camera) {
    this.camera = camera;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false }),
    );
    this.mesh.renderOrder = 99;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this.t = 0;
  }

  fire(color = 0xffffff) {
    this.mesh.material.color.set(color);
    this.t = 0.28;
    this.mesh.visible = true;
  }

  update(dt) {
    if (this.t <= 0) return;
    this.t -= dt;
    this.mesh.material.opacity = Math.max(0, this.t / 0.28) * 0.85;
    if (this.t <= 0) this.mesh.visible = false;
  }

  dispose() {
    this.camera.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
