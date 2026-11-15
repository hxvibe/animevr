// 범용 VFX: GPU 파티클(발광/어두움), 번개 리본, 별 플레어, 충격파, 섬광 조명 풀
import * as THREE from 'three';

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
const fragAdd = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a * a * vAlpha, 1.0);
}`;
const fragDark = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.15, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

class ParticlePool {
  constructor(scene, max, dark) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.uniforms = { uScale: { value: 600 } };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: dark ? fragDark : fragAdd,
      uniforms: this.uniforms,
      blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = dark ? 9 : 10;
    scene.add(this.points);
    this.geo = geo;
    this.activeCount = 0;
  }

  spawn(p, v, c, size, life, drag, grav, grow = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
    this.size[i] = this.size0[i] = size;
    this.life[i] = this.maxLife[i] = life;
    this.alpha[i] = 1;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.grow[i] = grow;
  }

  update(dt, scale) {
    this.uniforms.uScale.value = scale;
    const P = this.pos;
    const V = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const l = (this.life[i] -= dt);
      if (l <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      const i3 = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      V[i3] *= k;
      V[i3 + 1] = V[i3 + 1] * k - this.grav[i] * dt;
      V[i3 + 2] *= k;
      P[i3] += V[i3] * dt;
      P[i3 + 1] += V[i3 + 1] * dt;
      P[i3 + 2] += V[i3 + 2] * dt;
      const f = l / this.maxLife[i];
      this.alpha[i] = Math.min(1, f * 2.2);
      this.size[i] = this.size0[i] * (this.grow[i] > 0 ? 1 + (1 - f) * this.grow[i] : 0.35 + 0.65 * f);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
}

// ── 텍스처 ──
const _tex = {};
function canvasTex(key, size, draw) {
  if (_tex[key]) return _tex[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _tex[key] = t;
  return t;
}

export function glowTexture() {
  return canvasTex('glow', 128, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
}

/** 4갈래 별 플레어 */
export function starTexture() {
  return canvasTex('star', 256, (g, s) => {
    const c = s / 2;
    g.translate(c, c);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, c * 0.35);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(-c, -c, s, s);
    g.fillStyle = 'white';
    for (let k = 0; k < 4; k++) {
      g.save();
      g.rotate((k * Math.PI) / 2);
      g.beginPath();
      g.moveTo(0, -c * 0.98);
      g.quadraticCurveTo(c * 0.05, -c * 0.1, c * 0.1, 0);
      g.quadraticCurveTo(c * 0.05, c * 0.1, 0, c * 0.0);
      g.quadraticCurveTo(-c * 0.05, -c * 0.1, 0, -c * 0.98);
      g.fill();
      g.restore();
    }
    for (let k = 0; k < 4; k++) {
      g.save();
      g.rotate((k * Math.PI) / 2 + Math.PI / 4);
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(0, -c * 0.45);
      g.lineTo(c * 0.04, 0);
      g.lineTo(-c * 0.04, 0);
      g.fill();
      g.restore();
    }
  });
}

export function makeGlowSprite(color, size, tex = glowTexture()) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size);
  return s;
}

// ── 번개 리본: 카메라를 향하는 띠를 CPU에서 주기적으로 재생성 ──
export class Bolts {
  constructor(scene, { count = 6, segs = 9, color = 0xffffff, width = 0.012, dark = false, opacity = 1 } = {}) {
    this.count = count;
    this.segs = segs;
    this.width = width;
    const n = count * segs * 2;
    this.positions = new Float32Array(n * 3);
    const idx = [];
    for (let b = 0; b < count; b++) {
      const o = b * segs * 2;
      for (let i = 0; i < segs - 1; i++) {
        const a = o + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.alphas = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: `attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: dark
        ? `uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uOpacity); }`
        : `uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA * uOpacity * 1.6, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = dark ? 8 : 11;
    scene.add(this.mesh);
    this.geo = geo;
    this._pts = [];
    for (let i = 0; i < segs; i++) this._pts.push(new THREE.Vector3());
  }

  /** 중심 center, 반지름 r 주변에서 바깥으로 뻗는 번개를 다시 그림 */
  regen(center, r, camPos, reach = 1.6, active = this.count) {
    const P = this.positions;
    const t = new THREE.Vector3();
    const side = new THREE.Vector3();
    const view = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const jitter = new THREE.Vector3();
    for (let b = 0; b < this.count; b++) {
      const o = b * this.segs * 2;
      if (b >= active) {
        for (let i = 0; i < this.segs * 2; i++) this.alphas[o + i] = 0;
        continue;
      }
      dir.randomDirection();
      const start = r * (0.55 + Math.random() * 0.4);
      const len = r * reach * (0.4 + Math.random() * 0.8);
      const curl = new THREE.Vector3().randomDirection().multiplyScalar(r * 0.5);
      for (let i = 0; i < this.segs; i++) {
        const k = i / (this.segs - 1);
        const p = this._pts[i];
        p.copy(center).addScaledVector(dir, start + len * k).addScaledVector(curl, Math.sin(k * Math.PI) * 0.6);
        if (i > 0) p.add(jitter.randomDirection().multiplyScalar(r * 0.12 * (0.3 + k)));
      }
      for (let i = 0; i < this.segs; i++) {
        const p = this._pts[i];
        const q = this._pts[Math.min(this.segs - 1, i + 1)];
        const pr = this._pts[Math.max(0, i - 1)];
        t.subVectors(q, pr).normalize();
        view.subVectors(camPos, p).normalize();
        side.crossVectors(t, view).normalize();
        const k = i / (this.segs - 1);
        const w = this.width * (1 - k * 0.8) * (r > 0.3 ? 1 + r * 0.6 : 1);
        const a = (o + i * 2) * 3;
        P[a] = p.x + side.x * w; P[a + 1] = p.y + side.y * w; P[a + 2] = p.z + side.z * w;
        P[a + 3] = p.x - side.x * w; P[a + 4] = p.y - side.y * w; P[a + 5] = p.z - side.z * w;
        const al = (1 - k) * (0.6 + Math.random() * 0.4);
        this.alphas[o + i * 2] = this.alphas[o + i * 2 + 1] = al;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  /** 두 점 사이를 잇는 번개 (흑섬 등) */
  regenBetween(list, camPos) {
    const P = this.positions;
    const t = new THREE.Vector3();
    const side = new THREE.Vector3();
    const view = new THREE.Vector3();
    for (let b = 0; b < this.count; b++) {
      const o = b * this.segs * 2;
      const pair = list[b];
      if (!pair) {
        for (let i = 0; i < this.segs * 2; i++) this.alphas[o + i] = 0;
        continue;
      }
      const [a0, a1, amp] = pair;
      for (let i = 0; i < this.segs; i++) {
        const k = i / (this.segs - 1);
        const p = this._pts[i].lerpVectors(a0, a1, k);
        if (i > 0 && i < this.segs - 1) p.add(t.randomDirection().multiplyScalar(amp * Math.sin(k * Math.PI)));
      }
      for (let i = 0; i < this.segs; i++) {
        const p = this._pts[i];
        t.subVectors(this._pts[Math.min(this.segs - 1, i + 1)], this._pts[Math.max(0, i - 1)]).normalize();
        view.subVectors(camPos, p).normalize();
        side.crossVectors(t, view).normalize();
        const w = this.width;
        const a = (o + i * 2) * 3;
        P[a] = p.x + side.x * w; P[a + 1] = p.y + side.y * w; P[a + 2] = p.z + side.z * w;
        P[a + 3] = p.x - side.x * w; P[a + 4] = p.y - side.y * w; P[a + 5] = p.z - side.z * w;
        this.alphas[o + i * 2] = this.alphas[o + i * 2 + 1] = 1;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  hide() {
    this.alphas.fill(0);
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _t3 = new THREE.Vector3();

export class Fx {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.add = new ParticlePool(scene, 4000, false);
    this.dark = new ParticlePool(scene, 1200, true);
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 12, 1.6);
      l.userData.busy = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.flashes = [];
    this.transients = [];
    this._ringGeo = new THREE.RingGeometry(0.88, 1, 64);
    this._ringGeo.rotateX(-Math.PI / 2);
    this._sphereGeo = new THREE.SphereGeometry(1, 24, 16);
    this.stars = [];
    this.brightBg = false; // 밝은 배경에서는 가산 혼합이 안 보이므로 일부를 일반 혼합으로

  }

  spawn(p, v, color, size = 0.05, life = 0.8, drag = 1, grav = 0, grow = 0) {
    if (this.brightBg && Math.random() < 0.5) this.dark.spawn(p, v, color, size * 0.7, life, drag, grav, grow);
    else this.add.spawn(p, v, color, size, life, drag, grav, grow);
  }

  spawnDark(p, v, color, size = 0.05, life = 0.8, drag = 1, grav = 0, grow = 0) {
    this.dark.spawn(p, v, color, size, life, drag, grav, grow);
  }

  burst(center, count, color, speed = 4, size = 0.06, life = 0.8, opts = {}) {
    const c = color.isColor ? color : new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const pool = opts.dark || (this.brightBg && i % 2 === 0) ? this.dark : this.add;
      _t1.randomDirection().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      if (opts.up) _t1.y = Math.abs(_t1.y) * opts.up;
      if (opts.dir) _t1.addScaledVector(opts.dir, speed * (opts.dirAmt ?? 1));
      const p = opts.spread ? _t2.copy(center).addScaledVector(_t3.randomDirection(), Math.random() * opts.spread) : center;
      pool.spawn(p, _t1, c, size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.6), opts.drag ?? 2, opts.grav ?? 0, opts.grow ?? 0);
    }
  }

  implode(center, count, color, radius = 1, life = 0.5, size = 0.04) {
    const c = color.isColor ? color : new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      _t2.randomDirection();
      _t1.copy(center).addScaledVector(_t2, radius * (0.6 + Math.random() * 0.4));
      _t3.copy(_t2).multiplyScalar(-radius / life);
      (this.brightBg && i % 2 === 0 ? this.dark : this.add).spawn(_t1, _t3, c, size, life, 0, 0, 0);
    }
  }

  /** 4갈래 별 반짝임 */
  starFlare(pos, color, size = 0.3, dur = 0.35) {
    const s = makeGlowSprite(color, size, starTexture());
    s.position.copy(pos);
    s.material.rotation = Math.random() * Math.PI;
    s.renderOrder = 12;
    this.addTransient(s, dur, (k) => {
      const e = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75;
      s.scale.setScalar(size * (0.3 + e * 0.9));
      s.material.opacity = e;
    });
  }

  shockwave(pos, color, maxR = 4, dur = 0.6, opts = {}) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: opts.dark || this.brightBg ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(this._ringGeo, m);
    mesh.position.copy(pos);
    if (opts.faceDir) mesh.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, opts.faceDir);
    this.addTransient(mesh, dur, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      mesh.scale.setScalar(0.05 + e * maxR);
      m.opacity = (1 - k) * (opts.opacity ?? 1);
    });
  }

  sphereBlast(pos, color, maxR = 2, dur = 0.35, opts = {}) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: opts.dark || this.brightBg ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, fog: false });
    const mesh = new THREE.Mesh(this._sphereGeo, m);
    mesh.position.copy(pos);
    this.addTransient(mesh, dur, (k) => {
      mesh.scale.setScalar(0.05 + Math.sqrt(k) * maxR);
      m.opacity = (1 - k) * (opts.opacity ?? 0.85);
    });
  }

  addTransient(mesh, dur, update, onEnd) {
    this.scene.add(mesh);
    this.transients.push({ mesh, t: 0, dur, update, onEnd });
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
    const scale = isXR ? 900 : this.renderer.domElement.height * 0.5;
    this.add.update(dt, scale);
    this.dark.update(dt, scale);
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
        t.mesh.material?.dispose?.();
        t.onEnd?.();
        this.transients.splice(i, 1);
      }
    }
  }
}
