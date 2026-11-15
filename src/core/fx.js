// 파티클 · 충격파 · 섬광 조명 풀 · 범용 발광 텍스처
import * as THREE from 'three';

const MAX = 3500;

const vert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale * projectionMatrix[1][1] / max(0.05, -mv.z);
  vAlpha = aAlpha;
  vColor = aColor;
}`;

const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}`;

let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

export function makeGlowSprite(color, size) {
  const m = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

export class Fx {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.cursor = 0;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.uniforms = { uScale: { value: 600 } };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: this.uniforms,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.geo = geo;
    this.alive = 0;

    // 조명 풀 (조명 개수를 고정해 셰이더 재컴파일을 막는다)
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 12, 1.6);
      l.userData.busy = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.flashes = [];
    this.transients = [];

    this._ringGeo = new THREE.RingGeometry(0.85, 1, 64);
    this._ringGeo.rotateX(-Math.PI / 2);
    this._sphereGeo = new THREE.SphereGeometry(1, 24, 16);
  }

  /** 파티클 한 개 생성 */
  spawn(p, v, color, size = 0.08, life = 0.8, drag = 1, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
    this.size[i] = this.size0[i] = size;
    this.life[i] = this.maxLife[i] = life;
    this.alpha[i] = 1;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  /** 구형 폭발 */
  burst(center, count, color, speed = 4, size = 0.1, life = 0.8, opts = {}) {
    const v = new THREE.Vector3();
    const c = color.isColor ? color : new THREE.Color(color);
    const spread = opts.spread ?? 0;
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      if (opts.up) v.y = Math.abs(v.y) * opts.up;
      const p = spread ? _tmp.copy(center).addScaledVector(_tmp2.randomDirection(), Math.random() * spread) : center;
      this.spawn(p, v, c, size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.6), opts.drag ?? 2, opts.grav ?? 0);
    }
  }

  /** 점으로 빨려드는 파티클 (창, 수렴) */
  implode(center, count, color, radius = 2, life = 0.5, size = 0.08) {
    const c = color.isColor ? color : new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      _tmp2.randomDirection();
      _tmp.copy(center).addScaledVector(_tmp2, radius * (0.6 + Math.random() * 0.4));
      const v = _tmp3.copy(_tmp2).multiplyScalar(-radius / life);
      this.spawn(_tmp, v, c, size, life, 0, 0);
    }
  }

  /** 바닥 충격파 고리 */
  shockwave(pos, color, maxR = 4, dur = 0.6, opts = {}) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this._ringGeo, m);
    mesh.position.copy(pos);
    if (opts.faceDir) {
      mesh.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, opts.faceDir);
    }
    this.scene.add(mesh);
    this.transients.push({
      mesh, t: 0, dur,
      update: (k) => {
        const e = 1 - Math.pow(1 - k, 3);
        mesh.scale.setScalar(0.05 + e * maxR);
        m.opacity = (1 - k) * (opts.opacity ?? 1);
      },
    });
  }

  /** 팽창하는 구체 (폭발 코어) */
  sphereBlast(pos, color, maxR = 2, dur = 0.35) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(this._sphereGeo, m);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.transients.push({
      mesh, t: 0, dur,
      update: (k) => {
        mesh.scale.setScalar(0.1 + Math.sqrt(k) * maxR);
        m.opacity = (1 - k) * 0.8;
      },
    });
  }

  /** 지속 시간이 있는 임의 메시 효과 */
  addTransient(mesh, dur, update) {
    this.scene.add(mesh);
    this.transients.push({ mesh, t: 0, dur, update });
  }

  borrowLight(color, intensity = 3, distance = 10) {
    const l = this.lights.find((x) => !x.userData.busy);
    if (!l) return null;
    l.userData.busy = true;
    l.color.set(color);
    l.intensity = intensity;
    l.distance = distance;
    return l;
  }

  releaseLight(l) {
    if (!l) return;
    l.intensity = 0;
    l.userData.busy = false;
  }

  flash(pos, color, intensity = 8, dur = 0.3, distance = 14) {
    const l = this.borrowLight(color, intensity, distance);
    if (!l) return;
    l.position.copy(pos);
    this.flashes.push({ l, t: 0, dur, intensity });
  }

  update(dt, isXR) {
    // 시야 스케일
    if (isXR) this.uniforms.uScale.value = 900;
    else this.uniforms.uScale.value = this.renderer.domElement.height * 0.5;

    const n = MAX;
    const P = this.pos, V = this.vel;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) continue;
      const l = (this.life[i] -= dt);
      if (l <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      const i3 = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      V[i3] *= k; V[i3 + 1] = V[i3 + 1] * k - this.grav[i] * dt; V[i3 + 2] *= k;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      const f = l / this.maxLife[i];
      this.alpha[i] = Math.min(1, f * 2);
      this.size[i] = this.size0[i] * (0.4 + 0.6 * f);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aAlpha.needsUpdate = true;

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        this.releaseLight(f.l);
        this.flashes.splice(i, 1);
      } else f.l.intensity = f.intensity * (1 - k) * (1 - k);
    }
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const t = this.transients[i];
      t.t += dt;
      const k = Math.min(1, t.t / t.dur);
      t.update(k, dt);
      if (k >= 1) {
        this.scene.remove(t.mesh);
        if (t.mesh.material && t.mesh.material.dispose) t.mesh.material.dispose();
        this.transients.splice(i, 1);
      }
    }
  }
}

const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _tmp3 = new THREE.Vector3();
