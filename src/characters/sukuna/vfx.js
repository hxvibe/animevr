// 스쿠나 VFX: 참격 초승달 · 절단선 · 화염 화살 · 불기둥
import * as THREE from 'three';
import { glowTexture } from '../../core/fx.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

/** 순간적으로 번쩍이는 절단선 (인스턴스 묶음) */
export class SlashLines {
  constructor(scene, max = 120) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.bright = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ life: 0, max: 1, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), len: 1, w: 0.02, color: new THREE.Color() });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.cursor = 0;
  }

  /**
   * @param pos 중심
   * @param along 선 방향
   * @param normal 절단면 법선 (선은 이 면 위에 놓인다)
   */
  add(pos, along, normal, len = 1, w = 0.02, life = 0.15, color = 0xffffff) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.pos.copy(pos);
    const x = _v.copy(along).normalize();
    const z = new THREE.Vector3().copy(normal).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    // 평면 메시는 XY 평면: X=선 방향, Y=면 위의 직교 방향 → 면에 수직인 쪽에서도 보이도록 y를 normal 쪽으로 약간 기울임
    _m.makeBasis(x, y, z);
    it.quat.setFromRotationMatrix(_m);
    it.len = len;
    it.w = w;
    it.life = it.max = life;
    it.color.set(this.bright ? (color === 0xffffff ? 0x120000 : 0x8a0000) : color);
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      any = true;
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      const grow = Math.min(1, (1 - k) * 4 + 0.2);
      _s.set(it.len * grow, it.w * (0.2 + k), 1);
      this.mesh.setMatrixAt(i, _m.compose(it.pos, it.quat, it.life > 0 ? _s : _s.set(0, 0, 0)));
      this.mesh.setColorAt(i, it.color);
    }
    if (any) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

/** 해(解) 참격: 날아가는 초승달 */
export function makeCrescent(radius = 0.7) {
  const g = new THREE.Group();
  const mk = (inner, outer, color, opacity) => {
    const geo = new THREE.RingGeometry(radius * inner, radius * outer, 28, 1, -0.75, 1.5);
    geo.translate(-radius, 0, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    g.add(m);
    return m;
  };
  mk(0.9, 1.0, 0xff2040, 0.5);
  mk(0.95, 1.0, 0xffffff, 1.0);
  mk(0.82, 0.92, 0x801020, 0.35);
  // 밝은 배경용 먹선 (일반 혼합)
  const ink = new THREE.Mesh(new THREE.RingGeometry(radius * 0.93, radius * 0.97, 28, 1, -0.75, 1.5).translate(-radius, 0, 0), new THREE.MeshBasicMaterial({ color: 0x300008, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  g.add(ink);
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

/** 개(開): 화염 화살 */
export class FireArrow {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const geo = new THREE.ConeGeometry(0.06, 1, 12, 8, true);
    geo.rotateX(-Math.PI / 2); // 뾰족한 끝이 -Z
    geo.translate(0, 0, -0.5);
    this.mat = fireMaterial(4);
    this.cone = new THREE.Mesh(geo, this.mat);
    const tex = glowTexture();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff6a10, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff0c0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.group.add(this.cone, this.glow, this.tip);
    scene.add(this.group);
    this.setLength(0.5);
  }

  setLength(len, thick = 1) {
    this.len = len;
    this.cone.scale.set(thick * (1 + len), thick * (1 + len), len);
    this.glow.position.set(0, 0, -len * 0.5);
    this.glow.scale.setScalar(0.25 + len * 0.8);
    this.tip.position.set(0, 0, -len);
    this.tip.scale.setScalar(0.12 + len * 0.15);
  }

  update(dt) {
    this.mat.uniforms.uTime.value += dt;
    this.glow.material.opacity = 0.7 + Math.random() * 0.3;
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
