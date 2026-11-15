// 창/혁/자 구체 비주얼: 프레넬 코어 + 발광 스프라이트 + GPU 소용돌이 파티클
import * as THREE from 'three';
import { makeGlowSprite } from '../../core/fx.js';

const coreVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const coreFrag = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
uniform vec3 uCore;
uniform vec3 uRim;
uniform float uTime;
uniform float uPulse;
void main() {
  float f = 1.0 - max(0.0, dot(normalize(vN), normalize(vV)));
  float pulse = 1.0 + 0.15 * sin(uTime * 18.0) * uPulse;
  vec3 c = uCore * pow(1.0 - f, 2.0) * 1.4 + uRim * pow(f, 1.5) * 2.0;
  gl_FragColor = vec4(c * pulse, 1.0);
}`;

const swirlVert = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uRadius;
uniform float uDir;     // 1: 안으로 빨려듦, -1: 밖으로 뿜어냄
uniform float uSpeed;
uniform float uFlat;    // 원반 형태 정도
uniform float uScale;
varying float vA;
varying float vMix;
void main() {
  float ph = fract(aSeed.x + uTime * uSpeed * (0.6 + aSeed.z * 0.8));
  float t = uDir > 0.0 ? 1.0 - ph : ph;
  float r = uRadius * (0.15 + t);
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
uniform vec3 uColor;
uniform vec3 uColor2;
varying float vA;
varying float vMix;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  vec3 c = mix(uColor, uColor2, step(0.5, vMix));
  gl_FragColor = vec4(c * a * vA, 1.0);
}`;

const _sphere = new THREE.SphereGeometry(1, 32, 20);

export class Orb {
  /**
   * @param {object} o
   * @param {number} o.core 코어 색
   * @param {number} o.rim 테두리 색
   * @param {number} o.swirl 파티클 색
   * @param {number} [o.swirl2] 두 번째 파티클 색
   * @param {number} o.dir 1 흡입 / -1 방출
   */
  constructor(scene, o) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.time = Math.random() * 10;
    this.coreU = {
      uCore: { value: new THREE.Color(o.core) },
      uRim: { value: new THREE.Color(o.rim) },
      uTime: { value: 0 },
      uPulse: { value: o.pulse ?? 0.5 },
    };
    this.core = new THREE.Mesh(_sphere, new THREE.ShaderMaterial({
      vertexShader: coreVert, fragmentShader: coreFrag, uniforms: this.coreU,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.glow = makeGlowSprite(new THREE.Color(o.rim), 1);
    this.glow2 = makeGlowSprite(new THREE.Color(o.core), 1);
    const n = o.count ?? 400;
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) seeds[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
    this.swirlU = {
      uTime: { value: 0 },
      uRadius: { value: 1 },
      uDir: { value: o.dir ?? 1 },
      uSpeed: { value: o.speed ?? 0.9 },
      uFlat: { value: o.flat ?? 0.5 },
      uScale: { value: o.pointSize ?? 1 },
      uColor: { value: new THREE.Color(o.swirl) },
      uColor2: { value: new THREE.Color(o.swirl2 ?? o.swirl) },
    };
    this.swirl = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: swirlVert, fragmentShader: swirlFrag, uniforms: this.swirlU,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.swirl.frustumCulled = false;
    this.group.add(this.glow, this.glow2, this.core, this.swirl);
    this.swirlScale = o.swirlScale ?? 4;
    this.glowScale = o.glowScale ?? 5;
    this.setRadius(o.radius ?? 0.2);
    scene.add(this.group);
    this.light = null;
  }

  setRadius(r) {
    this.radius = r;
    this.core.scale.setScalar(r);
    this.glow.scale.setScalar(r * this.glowScale);
    this.glow2.scale.setScalar(r * 2.2);
    this.swirlU.uRadius.value = r * this.swirlScale;
    this.swirlU.uScale.value = Math.max(0.012, r * 0.18);
  }

  update(dt) {
    this.time += dt;
    this.coreU.uTime.value = this.time;
    this.swirlU.uTime.value = this.time;
    this.swirl.rotation.y += dt * 0.7;
    if (this.light) this.light.position.copy(this.pos);
  }

  dispose(fx) {
    this.scene.remove(this.group);
    this.core.material.dispose();
    this.swirl.material.dispose();
    this.swirl.geometry.dispose();
    this.glow.material.dispose();
    this.glow2.material.dispose();
    if (this.light && fx) fx.releaseLight(this.light);
    this.light = null;
  }
}
