// 나루토 VFX: 나선환(회전하는 차크라 구) · 나선수리검 날개 · 바람 칼날 구 · 분신 연기
import * as THREE from 'three';
import { makeGlowSprite, glowTexture } from '../../core/fx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _sphere = new THREE.SphereGeometry(1, 40, 28);

const shellVert = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

// 안쪽: 빠르게 도는 나선 띠 + 하얀 중심
const coreFrag = /* glsl */ `
  uniform float uTime; uniform float uPower; uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uRim;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    vec3 n = normalize(vN);
    float f = 1.0 - max(0.0, dot(n, normalize(vV)));
    float ang = atan(vP.z, vP.x);
    float s1 = sin(ang * 3.0 + vP.y * 9.0 - uTime * 30.0);
    float s2 = sin(ang * 5.0 - vP.y * 7.0 - uTime * 23.0 + 1.7);
    float s3 = sin(ang * 2.0 + vP.y * 15.0 + uTime * 17.0);
    float bands = 0.5 + 0.2 * s1 + 0.2 * s2 + 0.1 * s3;
    float core = pow(1.0 - f, 2.2);
    vec3 c = mix(uMid, uCore, clamp(core * 0.95 + bands * 0.3 * (1.0 - core), 0.0, 1.0));
    c += uRim * pow(f, 1.6) * 1.3;
    float a = (0.45 + 0.55 * core + 0.35 * bands) * uPower;
    gl_FragColor = vec4(c * a, 1.0);
  }`;

// 밝은 배경용 바탕층 (일반 혼합)
const baseFrag = /* glsl */ `
  uniform float uTime; uniform vec3 uMid; uniform vec3 uRim;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    float f = 1.0 - max(0.0, dot(normalize(vN), normalize(vV)));
    float ang = atan(vP.z, vP.x);
    float b = 0.5 + 0.5 * sin(ang * 4.0 + vP.y * 10.0 - uTime * 28.0);
    vec3 c = mix(uMid, uRim, f * 0.7 + b * 0.25);
    gl_FragColor = vec4(c, 0.5 + 0.35 * f + 0.15 * b);
  }`;

/** 흰 중심에서 바깥으로 갈수록 흐려지는 날개 텍스처 */
let _bladeTex = null;
function bladeTex() {
  if (_bladeTex) return _bladeTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.8, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0.2)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 64);
  // 바람 결
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * 256, Math.random() * 64, 30 + Math.random() * 80, 1 + Math.random() * 3);
  }
  _bladeTex = new THREE.CanvasTexture(c);
  _bladeTex.colorSpace = THREE.SRGBColorSpace;
  return _bladeTex;
}

/** 수리검 날개 하나 (XY 평면, +X 바깥쪽으로 휘어진 초승달) */
let _bladeGeo = null;
function bladeGeo() {
  if (_bladeGeo) return _bladeGeo;
  const s = new THREE.Shape();
  s.moveTo(0.12, 0.07);
  s.quadraticCurveTo(0.55, 0.22, 1.0, 0.0);
  s.quadraticCurveTo(0.6, 0.02, 0.12, -0.09);
  s.lineTo(0.12, 0.07);
  const g = new THREE.ShapeGeometry(s, 12);
  // UV: x = 반지름 방향
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), (pos.getY(i) + 0.1) / 0.35);
  _bladeGeo = g;
  return g;
}

export class RasenganOrb {
  constructor(ctx, radius = 0.06, { gold = false } = {}) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.time = Math.random() * 10;
    const col = gold
      ? { core: 0xfffbe8, mid: 0xffa020, rim: 0xffd060, line: 0xffe0a0, base: 0xff9a20, baseRim: 0xffe090 }
      : { core: 0xf4fbff, mid: 0x2a90ff, rim: 0x8fd4ff, line: 0xcdeeff, base: 0x2e86e8, baseRim: 0xa8dcff };
    this.col = col;
    this.u = {
      uTime: { value: 0 }, uPower: { value: 1 },
      uCore: { value: new THREE.Color(col.core) }, uMid: { value: new THREE.Color(col.mid) }, uRim: { value: new THREE.Color(col.rim) },
    };
    this.core = new THREE.Mesh(_sphere, new THREE.ShaderMaterial({ vertexShader: shellVert, fragmentShader: coreFrag, uniforms: this.u, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.core.renderOrder = 8;
    this.base = new THREE.Mesh(_sphere, new THREE.ShaderMaterial({
      vertexShader: shellVert, fragmentShader: baseFrag, transparent: true, depthWrite: false,
      uniforms: { uTime: this.u.uTime, uMid: { value: new THREE.Color(col.base) }, uRim: { value: new THREE.Color(col.baseRim) } },
    }));
    this.base.renderOrder = 7;
    this.halo = makeGlowSprite(new THREE.Color(col.rim), 1);
    this.halo.material.opacity = 0.7;
    this.hot = makeGlowSprite(new THREE.Color(0xffffff), 1, glowTexture());
    this.group.add(this.base, this.core, this.halo, this.hot);
    // 구를 감싸고 미친 듯이 도는 바람 줄기 (부분 원환)
    this.streaks = [];
    const lineMat = new THREE.MeshBasicMaterial({ color: col.line, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const lineMatB = new THREE.MeshBasicMaterial({ color: col.base, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
    this.lineMats = [lineMat, lineMatB];
    for (let i = 0; i < 9; i++) {
      const arc = 2.2 + Math.random() * 2.6;
      const geo = new THREE.TorusGeometry(1, 0.018 + Math.random() * 0.02, 3, 28, arc);
      const holder = new THREE.Group();
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v.randomDirection());
      const m = new THREE.Mesh(geo, lineMat);
      m.scale.setScalar(1.05 + Math.random() * 0.3);
      holder.add(m);
      this.group.add(holder);
      this.streaks.push({ holder, m, spin: (14 + Math.random() * 16) * (Math.random() < 0.5 ? -1 : 1), axis: _v.randomDirection().clone(), prec: 1 + Math.random() * 3 });
    }
    this.shuriken = null;
    this.shurikenK = 0;
    this.spinAxis = new THREE.Vector3(0, 0, -1);
    this.light = null;
    this._bright = null;
    this.scene.add(this.group);
    this.setRadius(radius);
  }

  setRadius(r) {
    this.radius = r;
    this.core.scale.setScalar(r);
    this.base.scale.setScalar(r * 0.97);
    this.halo.scale.setScalar(r * 4);
    this.hot.scale.setScalar(r * 1.5);
    for (const s of this.streaks) s.holder.scale.setScalar(r);
    if (this.shuriken) this.shuriken.scale.setScalar(this._bladeR ?? r * 4);
  }

  /** 나선수리검: 날개 4장 + 고리 */
  setShuriken(on, bladeR = 0.45) {
    this._bladeR = bladeR;
    if (on && !this.shuriken) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ map: bladeTex(), color: this.col.line, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const matB = new THREE.MeshBasicMaterial({ map: bladeTex(), color: this.col.base, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: false });
      this.bladeMats = [mat, matB];
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(bladeGeo(), mat);
        b.rotation.z = (i * Math.PI) / 2;
        b.renderOrder = 9;
        g.add(b);
        // 겹친 잔상 날개
        const b2 = new THREE.Mesh(bladeGeo(), mat);
        b2.rotation.z = (i * Math.PI) / 2 - 0.35;
        b2.scale.setScalar(0.85);
        b2.material = mat.clone();
        b2.material.opacity = 0.35;
        g.add(b2);
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: this.col.line, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      g.add(ring);
      this.shurikenRing = ring;
      this.shuriken = g;
      this.shurikenHolder = new THREE.Group();
      this.shurikenHolder.add(g);
      this.group.add(this.shurikenHolder);
      this.shurikenK = 0;
      this._bright = null;
    } else if (!on && this.shuriken) {
      this.group.remove(this.shurikenHolder);
      this.shuriken.traverse((o) => o.material?.dispose?.());
      this.shuriken = null;
    }
    this.setRadius(this.radius);
  }

  update(dt, power = 1) {
    this.time += dt;
    this.u.uTime.value = this.time;
    this.u.uPower.value = 0.5 + 0.5 * power;
    const bright = !!this.ctx.fx.brightBg;
    if (bright !== this._bright) {
      this._bright = bright;
      this.base.visible = bright;
      for (const s of this.streaks) s.m.material = bright ? this.lineMats[1] : this.lineMats[0];
      if (this.shuriken) {
        this.shuriken.children.forEach((b) => {
          if (b.geometry !== _bladeGeo) return;
          b.material.blending = bright ? THREE.NormalBlending : THREE.AdditiveBlending;
          b.material.color.set(bright ? this.col.base : this.col.line);
          b.material.needsUpdate = true;
        });
      }
    }
    for (const s of this.streaks) {
      s.m.rotation.z += s.spin * dt;
      _q.setFromAxisAngle(s.axis, s.prec * dt);
      s.holder.quaternion.premultiply(_q);
    }
    this.halo.material.opacity = 0.55 + Math.random() * 0.25;
    this.hot.material.opacity = 0.7 + Math.random() * 0.3;
    // 빛 번짐 스프라이트를 카메라 쪽으로 살짝 당겨 손가락과 교차해 잘려 보이지 않게
    const cam = this.ctx.input.head;
    _v.subVectors(cam, this.pos);
    const d = _v.length();
    _v.multiplyScalar(Math.min(this.radius * 1.5, 0.12, d * 0.4) / Math.max(1e-4, d));
    this.halo.position.copy(_v);
    this.hot.position.copy(_v);
    if (this.shuriken) {
      this.shurikenK = Math.min(1, this.shurikenK + dt * 3);
      this.shurikenHolder.quaternion.setFromUnitVectors(_v2.set(0, 0, 1), this.spinAxis);
      this.shuriken.rotation.z += dt * 38;
      this.shuriken.scale.setScalar((this._bladeR ?? 0.4) * this.shurikenK);
      this.shurikenRing.material.opacity = 0.2 + Math.random() * 0.25;
    }
    if (this.light) this.light.position.copy(this.pos);
  }

  dispose() {
    this.scene.remove(this.group);
    this.core.material.dispose();
    this.base.material.dispose();
    this.halo.material.dispose();
    this.hot.material.dispose();
    for (const m of this.lineMats) m.dispose();
    for (const s of this.streaks) s.m.geometry.dispose();
    if (this.shuriken) this.shuriken.traverse((o) => o.material?.dispose?.());
    if (this.light) this.ctx.fx.releaseLight(this.light);
    this.light = null;
  }
}

// ── 풍둔·나선수리검이 터진 뒤의 바람 칼날 구 ──
const windFrag = /* glsl */ `
  uniform float uTime; uniform float uOpacity; uniform vec3 uColor;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float ang = atan(vP.z, vP.x);
    float s = 0.5 + 0.5 * sin(ang * 14.0 + vP.y * 20.0 + uTime * 32.0);
    float s2 = 0.5 + 0.5 * sin(ang * 9.0 - vP.y * 13.0 - uTime * 24.0);
    float s3 = 0.5 + 0.5 * sin(ang * 23.0 + vP.y * 5.0 + uTime * 41.0);
    float streak = pow(s * s2, 3.0) + pow(s3, 12.0) * 0.6;
    float a = (0.08 + 0.55 * pow(f, 2.2) + 0.55 * streak) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }`;

export class WindSphere {
  constructor(ctx, pos, radius, bright) {
    this.ctx = ctx;
    this.u = { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(bright ? 0x4a9ee8 : 0xdff4ff) } };
    const mat = new THREE.ShaderMaterial({ vertexShader: shellVert, fragmentShader: windFrag, uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.Mesh(_sphere, mat);
    this.mesh.renderOrder = 6;
    this.mesh.position.copy(pos);
    this.mesh.scale.setScalar(0.01);
    this.inner = new THREE.Mesh(_sphere, mat.clone());
    this.inner.material.uniforms = { uTime: this.u.uTime, uOpacity: { value: 0 }, uColor: this.u.uColor };
    this.inner.scale.setScalar(0.6);
    this.inner.rotation.set(1.1, 0.4, 0.7);
    this.mesh.add(this.inner);
    ctx.scene.add(this.mesh);
    this.radius = radius;
    this.r = 0.01;
  }

  set(r, opacity, dt) {
    this.r = r;
    this.u.uTime.value += dt;
    this.mesh.scale.setScalar(Math.max(0.01, r));
    this.mesh.rotation.y += dt * 2.5;
    this.inner.rotation.x -= dt * 3.1;
    this.u.uOpacity.value = opacity;
    this.inner.material.uniforms.uOpacity.value = opacity * 0.7;
  }

  dispose() {
    this.ctx.scene.remove(this.mesh);
    this.mesh.material.dispose();
    this.inner.material.dispose();
  }
}

/** 미세한 바람 칼날 (흰 선 인스턴스, 카메라를 향해 돈다) */
let _needleTex = null;
function needleTex() {
  if (_needleTex) return _needleTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 5, 128, 6);
  _needleTex = new THREE.CanvasTexture(c);
  return _needleTex;
}

export class WindNeedles {
  constructor(scene, max = 200) {
    this.mat = new THREE.MeshBasicMaterial({ map: needleTex(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ life: 0, max: 1, pos: new THREE.Vector3(), along: new THREE.Vector3(1, 0, 0), len: 1, w: 0.02 });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.cursor = 0;
    this._y = new THREE.Vector3();
    this._z = new THREE.Vector3();
    this._bright = false;
  }

  add(pos, along, len = 0.6, w = 0.02, life = 0.12) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.pos.copy(pos);
    it.along.copy(along).normalize();
    it.len = len;
    it.w = w;
    it.life = it.max = life;
  }

  update(dt, camPos, bright) {
    if (bright !== this._bright) {
      this._bright = bright;
      this.mat.blending = bright ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.mat.color.set(bright ? 0x3a86d8 : 0xffffff);
      this.mat.needsUpdate = true;
    }
    let any = false;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      any = true;
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      this._z.subVectors(camPos, it.pos).normalize();
      this._y.crossVectors(this._z, it.along);
      if (this._y.lengthSq() < 1e-6) this._y.set(0, 1, 0);
      this._y.normalize();
      this._z.crossVectors(it.along, this._y);
      _m.makeBasis(it.along, this._y, this._z);
      _q.setFromRotationMatrix(_m);
      _s.set(it.len * (0.4 + 0.6 * (1 - k)), it.w * (0.3 + 0.7 * k), 1);
      if (it.life <= 0) _s.set(0, 0, 0);
      this.mesh.setMatrixAt(i, _m.compose(it.pos, _q, _s));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** 펑! 하는 분신 연기 */
export function poofSmoke(fx, pos, scale = 1) {
  const white = new THREE.Color(0xf2f2f2);
  const grey = new THREE.Color(0xbdbdbd);
  fx.burst(pos, 26, white, 1.6 * scale, 0.16 * scale, 0.7, { dark: true, spread: 0.35 * scale, drag: 4, grow: 2.2, up: 0.6 });
  fx.burst(pos, 14, grey, 1.1 * scale, 0.12 * scale, 0.9, { dark: true, spread: 0.4 * scale, drag: 3, grow: 2, grav: -0.4 });
  fx.burst(pos, 12, new THREE.Color(0xffffff), 2.2 * scale, 0.05, 0.3, { spread: 0.2 });
}
