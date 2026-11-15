// 수련장(황혼의 석조 광장)과 영역전개용 공허 공간
import * as THREE from 'three';

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4f5c';
  g.fillRect(0, 0, 512, 512);
  const n = 8;
  const s = 512 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 70 + Math.floor(Math.random() * 22);
      g.fillStyle = `rgb(${v},${v + 4},${v + 14})`;
      g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      for (let k = 0; k < 30; k++) {
        const w = Math.random() * 10 - 5;
        g.fillStyle = `rgba(${v + w},${v + w},${v + w + 10},0.5)`;
        g.fillRect(x * s + Math.random() * s, y * s + Math.random() * s, 2, 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(100, 100);
  t.anisotropy = 4;
  return t;
}

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // 항상 가장 먼 곳
}`;

const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSun;
void main() {
  float h = vDir.y;
  vec3 top = vec3(0.07, 0.09, 0.22);
  vec3 mid = vec3(0.55, 0.32, 0.42);
  vec3 hor = vec3(1.0, 0.55, 0.32);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, h));
  col = mix(col, top, smoothstep(0.15, 0.7, h));
  col = mix(col, vec3(0.12, 0.1, 0.14), smoothstep(0.0, -0.2, h));
  float s = max(0.0, dot(vDir, normalize(uSun)));
  col += vec3(1.0, 0.6, 0.3) * pow(s, 64.0) * 1.5 + vec3(1.0, 0.45, 0.25) * pow(s, 6.0) * 0.25;
  gl_FragColor = vec4(col, 1.0);
}`;

// 무량공처: 끝없이 흘러드는 정보 — 별의 바다와 빛의 고리
const voidFrag = /* glsl */ `
varying vec3 vDir;
uniform float uTime;
uniform float uFade;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
float stars(vec3 d, float scale, float thr) {
  vec3 p = d * scale;
  vec3 i = floor(p);
  float h = hash(i);
  vec3 c = i + 0.5 + (vec3(hash(i + 1.3), hash(i + 2.7), hash(i + 4.1)) - 0.5) * 0.6;
  float dist = length(p - c);
  float tw = 0.6 + 0.4 * sin(uTime * (2.0 + h * 5.0) + h * 40.0);
  return step(thr, h) * smoothstep(0.12, 0.0, dist) * tw;
}
void main() {
  vec3 d = normalize(vDir);
  // 정보의 흐름: 방향을 시간에 따라 비틀어 별이 빨려드는 느낌
  float ang = uTime * 0.05;
  mat2 r = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec3 rd = d; rd.xz = r * rd.xz;
  vec3 col = vec3(0.0, 0.003, 0.012);
  float neb = fbm(rd * 2.5 + vec3(0.0, uTime * 0.03, 0.0));
  col += vec3(0.05, 0.1, 0.28) * pow(neb, 3.0) * 1.6 + vec3(0.18, 0.06, 0.25) * pow(fbm(rd * 4.0 + 7.0), 4.0);
  col += vec3(0.8, 0.9, 1.0) * stars(rd, 60.0, 0.82);
  col += vec3(0.6, 0.8, 1.0) * stars(rd, 140.0, 0.9) * 0.7;
  col += vec3(1.0) * stars(rd, 260.0, 0.94) * 0.5;
  // 거대한 빛의 고리(지평선 너머의 은하)
  vec3 ringN = normalize(vec3(0.25, 1.0, -0.35));
  float plane = dot(d, ringN);
  vec3 center = normalize(vec3(0.0, 0.18, -1.0));
  float cd = acos(clamp(dot(d, center), -1.0, 1.0));
  float ring = exp(-abs(plane) * 28.0) * smoothstep(1.6, 0.2, cd);
  float swirl = 0.6 + 0.4 * sin(cd * 30.0 - uTime * 2.0 + atan(d.x, d.z) * 6.0);
  col += vec3(0.75, 0.85, 1.0) * ring * swirl * 1.2;
  col += vec3(1.0, 0.95, 0.9) * exp(-cd * 7.0) * 1.8;
  col += vec3(0.3, 0.5, 1.0) * exp(-cd * 2.5) * 0.25;
  // 위아래로 흘러가는 빛줄기
  float streak = pow(noise(vec3(atan(d.x, d.z) * 40.0, d.y * 2.0 - uTime * 3.0, 0.0)), 18.0);
  col += vec3(0.6, 0.8, 1.0) * streak * 0.8;
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

const voidFloorVert = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const voidFloorFrag = /* glsl */ `
varying vec3 vPos;
uniform float uTime;
uniform float uFade;
uniform vec3 uCenter;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 p = vPos.xz;
  float r = length(p - uCenter.xz);
  vec3 col = vec3(0.0, 0.005, 0.02);
  // 반사된 별빛
  vec2 g = p * 3.0;
  vec2 i = floor(g);
  float h = hash(i);
  float d = length(fract(g) - 0.5);
  col += vec3(0.6, 0.8, 1.0) * step(0.93, h) * smoothstep(0.15, 0.0, d) * (0.5 + 0.5 * sin(uTime * 3.0 + h * 50.0));
  // 퍼져나가는 파문
  float w = sin(r * 2.2 - uTime * 2.5) * 0.5 + 0.5;
  col += vec3(0.1, 0.25, 0.6) * pow(w, 20.0) * exp(-r * 0.06) * 0.6;
  col += vec3(0.2, 0.4, 1.0) * exp(-r * 0.5) * 0.15;
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.arena = new THREE.Group();
    this.domainGroup = new THREE.Group();
    scene.add(this.arena, this.domainGroup);

    this.fog = new THREE.Fog(0x8a5a68, 40, 190);
    this.fogBase = { color: new THREE.Color(0x8a5a68), near: 40, far: 190 };
    scene.fog = this.fog;

    this.hemi = new THREE.HemisphereLight(0xffd8c8, 0x404060, 1.9);
    this.sun = new THREE.DirectionalLight(0xffb48a, 2.2);
    this.sun.position.set(-30, 25, -40);
    scene.add(this.hemi, this.sun);
    this.hemiBase = { sky: this.hemi.color.clone(), ground: this.hemi.groundColor.clone(), i: this.hemi.intensity, sun: this.sun.intensity };

    // 하늘
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, uniforms: { uSun: { value: new THREE.Vector3(-30, 6, -40) } } }),
    );
    sky.renderOrder = -10;
    this.arena.add(sky);

    // 바닥
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300, 120, 120), new THREE.MeshLambertMaterial({ map: groundTexture() }));
    ground.rotation.x = -Math.PI / 2;
    this.arena.add(ground);

    // 경계 결계 원
    const ring = new THREE.Mesh(new THREE.RingGeometry(34.6, 35, 128), new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.35 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.arena.add(ring);
    // 중앙 마법진 느낌의 원
    const c1 = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.0, 64), new THREE.MeshBasicMaterial({ color: 0xaad8ff, transparent: true, opacity: 0.4 }));
    c1.rotation.x = -Math.PI / 2;
    c1.position.y = 0.01;
    this.arena.add(c1);

    // 먼 도시 실루엣
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    bGeo.translate(0, 0.5, 0);
    const count = 140;
    const bld = new THREE.InstancedMesh(bGeo, new THREE.MeshLambertMaterial({ color: 0x2a2433 }), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.03;
      const r = 70 + Math.random() * 50;
      const h = 8 + Math.random() * Math.random() * 60;
      const w = 5 + Math.random() * 10;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -a);
      m.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), q, new THREE.Vector3(w, h, w));
      bld.setMatrixAt(i, m);
    }
    this.arena.add(bld);

    // 석등
    const lanternGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.4, 8);
    const lanternMat = new THREE.MeshLambertMaterial({ color: 0x6b6f7a });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc57a });
    const glowGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const g = new THREE.Group();
      const base = new THREE.Mesh(lanternGeo, lanternMat);
      base.position.y = 0.7;
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = 1.55;
      g.add(base, glow);
      g.position.set(Math.cos(a) * 30, 0, Math.sin(a) * 30);
      this.arena.add(g);
    }

    // ── 무량공처 ──
    this.voidUniforms = { uTime: { value: 0 }, uFade: { value: 0 } };
    const vSphere = new THREE.Mesh(
      new THREE.SphereGeometry(300, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: voidFrag, side: THREE.BackSide, depthWrite: false, uniforms: this.voidUniforms }),
    );
    vSphere.renderOrder = -10;
    this.floorUniforms = { uTime: this.voidUniforms.uTime, uFade: this.voidUniforms.uFade, uCenter: { value: new THREE.Vector3() } };
    const vFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300, 120, 120),
      new THREE.ShaderMaterial({ vertexShader: voidFloorVert, fragmentShader: voidFloorFrag, uniforms: this.floorUniforms }),
    );
    vFloor.rotation.x = -Math.PI / 2;
    this.domainGroup.add(vSphere, vFloor);
    this.domainGroup.visible = false;

    this.domainTarget = 0; // 0: 수련장, 1: 영역
    this.closed = 0; // 0: 열림, 1: 완전히 닫힘(어둠)
    this.inDomain = false;
    this.time = 0;
    this._black = new THREE.Color(0x000000);
  }

  setDomain(on, center) {
    this.domainTarget = on ? 1 : 0;
    if (center) this.floorUniforms.uCenter.value.copy(center);
  }

  /** 영역 연출 진행도: 0(평소) ~ 1(완전한 영역) */
  get domainAmount() {
    return this.inDomain ? 1 - this.closed : 0;
  }

  update(dt) {
    this.time += dt;
    this.voidUniforms.uTime.value = this.time;

    // 전환: 안개가 닫혔다가(어둠), 장면을 바꾼 뒤 다시 열린다
    const wantDomain = this.domainTarget === 1;
    const speed = 1.6;
    if (wantDomain !== this.inDomain) {
      this.closed = Math.min(1, this.closed + dt * speed);
      if (this.closed >= 1) {
        this.inDomain = wantDomain;
        this.arena.visible = !wantDomain;
        this.domainGroup.visible = wantDomain;
      }
    } else {
      this.closed = Math.max(0, this.closed - dt * speed);
    }
    const closed = this.closed;
    const e = closed * closed * (3 - 2 * closed);
    const baseFar = this.inDomain ? 400 : this.fogBase.far;
    const baseNear = this.inDomain ? 300 : this.fogBase.near;
    this.fog.far = THREE.MathUtils.lerp(baseFar, 1.5, e);
    this.fog.near = THREE.MathUtils.lerp(baseNear, 0.2, e);
    this.fog.color.copy(this.inDomain ? this._black : this.fogBase.color).lerp(this._black, e);
    this.voidUniforms.uFade.value = this.inDomain ? 1 - e : 0;

    if (this.inDomain) {
      this.hemi.color.set(0x9fc4ff);
      this.hemi.groundColor.set(0x0a1030);
      this.hemi.intensity = 0.9;
      this.sun.intensity = 0.3;
    } else {
      this.hemi.color.copy(this.hemiBase.sky);
      this.hemi.groundColor.copy(this.hemiBase.ground);
      this.hemi.intensity = this.hemiBase.i;
      this.sun.intensity = this.hemiBase.sun;
    }
  }
}
