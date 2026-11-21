// 영역전개 공통 껍질: 검은 구가 시전자 둘레로 퍼지며 배경을 지우고, 안쪽을 영역의 풍경으로 채운다.
//  wall/floor 셰이더와 장식(decorate)·조명만 영역마다 다르게 준다.
import * as THREE from 'three';
import { CLASH_U, CLASH_GLSL } from './clashBoundary.js';

export const DOMAIN_NOISE = /* glsl */ `
float dh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dn(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh(i), dh(i + vec3(1,0,0)), f.x), mix(dh(i + vec3(0,1,0)), dh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dh(i + vec3(0,0,1)), dh(i + vec3(1,0,1)), f.x), mix(dh(i + vec3(0,1,1)), dh(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float dfbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * dn(p); p *= 2.02; a *= 0.5; } return s; }
`;

const VERT = /* glsl */ `
varying vec3 vP; varying vec3 vW; varying vec2 vUv;
void main() {
  vP = position; vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export class ShellDomain {
  /**
   * @param o { radius, wall: frag 본문(vec3 col 계산), floor: frag 본문, lights: {hemi, ground, hemiI, sun, sunI, fog, fogNear, fogFar, exposure}, decorate(group, R) }
   *  셰이더에서 쓸 수 있는 것: uTime, uOpen, vP(로컬), vW(월드), vUv, DOMAIN_NOISE 함수
   */
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    this.radius = o.radius ?? 16;
    this.state = 'idle';
    this.t = 0;
    this.center = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.visible = false;
    ctx.scene.add(this.group);
    this.uniforms = { uTime: { value: 0 }, uOpen: { value: 0 }, ...CLASH_U }; // 영역 싸움 경계 (적 영역 쪽은 지운다)
    const mk = (body, side) => new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: `uniform float uTime; uniform float uOpen; varying vec3 vP; varying vec3 vW; varying vec2 vUv;\n${DOMAIN_NOISE}\n${CLASH_GLSL}\n${o.glsl ?? ''}\nvoid main(){ float clashS = uClashOn > 0.5 ? clashSide(vW) : -1.0; if (clashS > 0.0) discard; vec3 col = vec3(0.0); float alpha = 1.0;\n${body}\n col += clashSeam(vW, clashS); gl_FragColor = vec4(col, alpha); }`,
      side, depthWrite: true, fog: false,
    });
    this.wallMat = mk(o.wall, THREE.BackSide);
    this.wall = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.wallMat);
    this.wall.renderOrder = -2;
    this.group.add(this.wall);
    if (o.floor) {
      this.floorMat = mk(o.floor, THREE.FrontSide);
      this.floorMat.polygonOffset = true;
      this.floorMat.polygonOffsetFactor = -2;
      this.floorMat.polygonOffsetUnits = -8;
      this.floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), this.floorMat);
      this.floor.position.y = 0.006;
      this.group.add(this.floor);
    }
    this.deco = new THREE.Group();
    this.group.add(this.deco);
    o.decorate?.(this.deco, this);
  }

  contains(p) {
    return this.state !== 'idle' && Math.hypot(p.x - this.center.x, p.z - this.center.z) < this.radius * this.size;
  }

  get size() {
    return this.wall.scale.x / this.radius;
  }

  start(center) {
    this.center.set(center.x, 0, center.z);
    this.group.position.copy(this.center);
    this.group.visible = true;
    this.state = 'opening';
    this.t = 0;
    this._setSize(0.02);
  }

  stop() {
    if (this.state === 'idle' || this.state === 'closing') return;
    this.state = 'closing';
    this.t = 0;
  }

  cancel() {
    if (this.state !== 'idle') this._hide();
  }

  _setSize(k) {
    const r = Math.max(0.05, this.radius * k);
    this.wall.scale.setScalar(r);
    if (this.floor) this.floor.scale.setScalar(r);
    this.deco.scale.setScalar(Math.max(0.001, k));
  }

  update(dt) {
    if (this.state === 'idle') return;
    this.t += dt;
    this.uniforms.uTime.value += dt;
    this.o.anim?.(dt, this);
    const env = this.ctx.env;
    const L = this.o.lights ?? {};
    if (this.state === 'opening') {
      const k = Math.min(1, this.t / 1.0);
      const e = 1 - Math.pow(1 - k, 3);
      this._setSize(e);
      this.uniforms.uOpen.value = e;
      if (k > 0.35 && !this._saved) {
        env.setHidden(true);
        this._saved = { exposure: this.ctx.renderer.toneMappingExposure, cast: env.sun.castShadow };
        if (L.hemi !== undefined) env.hemi.color.set(L.hemi);
        if (L.ground !== undefined) env.hemi.groundColor.set(L.ground);
        if (L.hemiI !== undefined) env.hemi.intensity = L.hemiI;
        if (L.sun !== undefined) env.sun.color.set(L.sun);
        if (L.sunI !== undefined) env.sun.intensity = L.sunI;
        if (L.exposure !== undefined) this.ctx.renderer.toneMappingExposure = L.exposure;
      }
      if (L.fog !== undefined) {
        env.fog.color.lerp(new THREE.Color(L.fog), Math.min(1, dt * 3));
        env.fog.near = THREE.MathUtils.lerp(env.fog.near, L.fogNear ?? 30, dt * 2);
        env.fog.far = THREE.MathUtils.lerp(env.fog.far, L.fogFar ?? 120, dt * 2);
      }
      if (k >= 1) this.state = 'active';
    } else if (this.state === 'active') {
      this.o.tick?.(dt, this);
    } else if (this.state === 'closing') {
      const k = Math.min(1, this.t / 0.7);
      this._setSize(1 - k);
      this.uniforms.uOpen.value = 1 - k;
      if (k >= 1) this._hide();
    }
  }

  _hide() {
    this.state = 'idle';
    this.group.visible = false;
    const env = this.ctx.env;
    if (this._saved) {
      env.setHidden(false);
      this._saved = null;
    }
    env.restore();
    env.applyShadows();
  }

  dispose() {
    this.cancel();
    this.ctx.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material && !o.material.userData?.shared) o.material.dispose?.();
    });
  }
}
