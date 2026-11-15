// 영역전개 「伏魔御廚子(복마어주자)」 연출
// 결계를 닫지 않고 현실에 사찰을 세운다. 사찰 주위에 소 두개골, 안쪽에 거대한 입. 하늘이 핏빛으로 물든다.
import * as THREE from 'three';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform float uTime; uniform float uFade;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float n = fbm(d * 3.0 + vec3(uTime * 0.03, 0.0, uTime * 0.02));
  vec3 col = mix(vec3(0.35, 0.02, 0.02), vec3(0.03, 0.0, 0.0), smoothstep(-0.05, 0.6, h));
  col += vec3(0.5, 0.05, 0.02) * pow(n, 3.0) * smoothstep(0.7, 0.0, h);
  col *= 0.6 + 0.6 * n;
  col = mix(col, vec3(0.02, 0.0, 0.0), smoothstep(0.0, -0.3, h));
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

function boneMat() {
  return new THREE.MeshStandardMaterial({ color: 0xd9cdb4, roughness: 0.7, metalness: 0, flatShading: true });
}

function buildShrine(envMap) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x1c0d0b, roughness: 0.6, flatShading: true, envMap, envMapIntensity: 0.3 });
  const darkRed = new THREE.MeshStandardMaterial({ color: 0x3a0606, roughness: 0.5, flatShading: true, emissive: 0x200000 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x241c1c, roughness: 0.9, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x120a0a, roughness: 0.4, flatShading: true, envMap, envMapIntensity: 0.6 });
  const box = (w, h, d, m, x, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  // 기단
  box(8, 0.6, 6, stone, 0, 0.3, 0);
  box(6.8, 0.4, 5, stone, 0, 0.8, 0);
  // 기둥
  for (const [x, z] of [[-2.8, -2], [2.8, -2], [-2.8, 2], [2.8, 2], [-1.2, -2.1], [1.2, -2.1]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.2, 8), wood);
    p.position.set(x, 3.1, z);
    g.add(p);
  }
  // 가로보
  box(6.4, 0.35, 0.4, darkRed, 0, 5.1, -2.05);
  box(6.4, 0.35, 0.4, darkRed, 0, 5.1, 2.05);
  // 지붕 (2단, 처마가 넓은 우진각)
  const roof1 = new THREE.Mesh(new THREE.ConeGeometry(5.6, 1.9, 4, 1), roofMat);
  roof1.rotation.y = Math.PI / 4;
  roof1.scale.set(1.25, 1, 0.95);
  roof1.position.set(0, 6.25, 0);
  g.add(roof1);
  box(5.2, 1.1, 3.8, darkRed, 0, 7.1, 0);
  const roof2 = new THREE.Mesh(new THREE.ConeGeometry(3.9, 1.6, 4, 1), roofMat);
  roof2.rotation.y = Math.PI / 4;
  roof2.scale.set(1.25, 1, 0.95);
  roof2.position.set(0, 8.4, 0);
  g.add(roof2);
  // 거대한 입 (정면, -z 방향을 플레이어 쪽으로 돌린다)
  const maw = new THREE.Group();
  const flesh = new THREE.MeshStandardMaterial({ color: 0x5a0a10, roughness: 0.35, emissive: 0x2a0004 });
  const throat = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x0a0000 }));
  throat.scale.set(1.3, 0.9, 0.5);
  maw.add(throat);
  const lipU = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.22, 8, 24, Math.PI), flesh);
  lipU.scale.set(1.2, 0.7, 1);
  const lipD = lipU.clone();
  lipD.rotation.z = Math.PI;
  maw.add(lipU, lipD);
  const teeth = boneMat();
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI;
    const tU = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 5), teeth);
    tU.position.set(Math.cos(a) * 1.3, Math.sin(a) * 0.72 - 0.1, 0.1);
    tU.rotation.z = Math.PI + (a - Math.PI / 2) * 0.4;
    const tD = tU.clone();
    tD.position.y = -tU.position.y;
    tD.rotation.z = -(a - Math.PI / 2) * 0.4;
    maw.add(tU, tD);
  }
  maw.position.set(0, 3.1, -2.2);
  g.add(maw);
  // 소 두개골 무더기
  const skullGeo = new THREE.IcosahedronGeometry(0.28, 0);
  skullGeo.scale(0.85, 0.7, 1.3);
  const hornGeo = new THREE.ConeGeometry(0.06, 0.45, 5);
  hornGeo.translate(0, 0.22, 0);
  const N = 90;
  const skulls = new THREE.InstancedMesh(skullGeo, boneMat(), N);
  const horns = new THREE.InstancedMesh(hornGeo, boneMat(), N * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 4.2 + Math.random() * 3.2;
    const x = Math.cos(a) * r * 1.1;
    const z = Math.sin(a) * r * 0.9;
    const y = 0.2 + Math.random() * 0.8 * (1 - (r - 4.2) / 3.2);
    e.set((Math.random() - 0.5) * 0.8, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.8);
    q.setFromEuler(e);
    const s = 0.8 + Math.random() * 0.6;
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
    skulls.setMatrixAt(i, m);
    for (const side of [-1, 1]) {
      const hq = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, side * 1.0)));
      const off = new THREE.Vector3(side * 0.2 * s, 0.1 * s, -0.15 * s).applyQuaternion(q);
      m.compose(new THREE.Vector3(x, y, z).add(off), hq, new THREE.Vector3(s, s, s));
      horns.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), m);
    }
  }
  g.add(skulls, horns);
  return g;
}

export class MalevolentShrine {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.state = 'idle';
    this.t = 0;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);
    this.shrine = buildShrine(ctx.world.envMap);
    this.group.add(this.shrine);
    this.skyU = { uTime: { value: 0 }, uFade: { value: 0 } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 16), new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.sky.renderOrder = -9;
    this.sky.frustumCulled = false;
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x2a0003, roughness: 0.06, metalness: 0.7, envMap: ctx.world.envMap, envMapIntensity: 0.8 }));
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.012;
    this.group.add(this.sky, this.pool);
    this.center = new THREE.Vector3();
    this.radius = 30;
  }

  get active() {
    return this.state === 'rise' || this.state === 'active';
  }

  start(center, dir) {
    this.state = 'rise';
    this.t = 0;
    this.center.copy(center);
    const d = dir.clone().setY(0).normalize();
    const pos = center.clone().addScaledVector(d, 10);
    this.shrine.position.set(pos.x, -10, pos.z);
    this.shrine.rotation.y = Math.atan2(-d.x, -d.z);
    this.pool.position.set(center.x, 0.012, center.z);
    this.pool.scale.setScalar(0.01);
    this.group.visible = true;
    this.sky.visible = false;
    this.skyU.uFade.value = 0;
  }

  stop() {
    if (this.state === 'idle' || this.state === 'sink') return;
    this.state = 'sink';
    this.t = 0;
  }

  update(dt) {
    if (this.state === 'idle') return;
    this.t += dt;
    this.skyU.uTime.value += dt;
    const { env, fx } = this.ctx;
    if (this.state === 'rise') {
      const k = Math.min(1, this.t / 1.6);
      const e = 1 - Math.pow(1 - k, 3);
      this.shrine.position.y = -10 + e * 10;
      this.pool.scale.setScalar(0.01 + e * this.radius);
      // 하늘과 조명을 핏빛으로
      env.fog.color.lerp(new THREE.Color(0x200000), Math.min(1, dt * 3));
      env.fog.near = THREE.MathUtils.lerp(env.fog.near, 20, dt * 2);
      env.fog.far = THREE.MathUtils.lerp(env.fog.far, 90, dt * 2);
      env.hemi.color.lerp(new THREE.Color(0xff6050), dt * 2);
      env.hemi.groundColor.lerp(new THREE.Color(0x200000), dt * 2);
      env.hemi.intensity = THREE.MathUtils.lerp(env.hemi.intensity, 1.0, dt * 2);
      env.sun.color.lerp(new THREE.Color(0xff3020), dt * 2);
      if (Math.random() < 0.8) fx.burst(this.shrine.position.clone().setY(0.3), 3, new THREE.Color(0x3a2a24), 4, 0.15, 1.2, { up: 1, grav: 3, drag: 1 });
      if (k > 0.5 && !this.sky.visible) {
        env.setHidden(true);
        this.sky.visible = true;
      }
      if (this.sky.visible) this.skyU.uFade.value = Math.min(1, this.skyU.uFade.value + dt * 2);
      if (k >= 1) {
        this.state = 'active';
        this.t = 0;
      }
    } else if (this.state === 'sink') {
      const k = Math.min(1, this.t / 1.2);
      this.shrine.position.y = -k * k * 10;
      this.pool.scale.setScalar(Math.max(0.01, this.radius * (1 - k)));
      this.skyU.uFade.value = 1 - k;
      if (k > 0.5 && this.sky.visible) {
        this.sky.visible = false;
        env.setHidden(false);
        env.restore();
      }
      if (k >= 1) {
        this.state = 'idle';
        this.group.visible = false;
        env.restore();
      }
    }
  }

  dispose() {
    if (this.state !== 'idle') {
      this.ctx.env.setHidden(false);
      this.ctx.env.restore();
    }
    this.scene.remove(this.group);
  }
}
