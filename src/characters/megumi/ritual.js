// 조복의 의식 — 「布瑠部由良由良 … 八握剣 異戒神将 魔虚羅」 (사용자 제공 음성 35.8초에 맞춘 연출)
//
//  0초      쿵 — 주위가 검게 꺼진다
//  8초      늑대 하울링 — 하얗게 빛나는 두꺼비들과, 그 뒤에서 울부짖는 늑대 그림자 (좌우로, 메구미는 가운데 뒤)
//  15초     하울링이 사라지고 법진 소리 — 정면 멀리 번데기에 갇힌 마허라. 하얀 실이 사방 먼 곳으로 이어져 있다
//  18초     「八握剣 異戒神将 魔虚羅」
//  25.6초   찢어지는 소리 — 번데기에서 벌린 입만 드러난다
//  27초     번데기에서 연기
//  28.6초   팅! — 이어져 있던 실이 풀린다
//  30~34초  머리의 두 쌍 날개가 아래에서 삐걱거리며 솟아 커졌다가 다시 작아진다. 번데기가 점점 느슨해진다
//  34초~    번데기가 위에서부터 풀려 6.5초 만에 다 벗겨진다 → 마허라
import * as THREE from 'three';
import { makeShiki, AX } from './models.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (k) => k * k * (3 - 2 * k);

export const RITUAL = {
  black: 0.25,
  pack: 8.0,
  packOut: 14.6,
  cocoon: 15.0,
  name: 18.2,
  mouth: 25.6,
  smoke: 27.0,
  ting: 28.6,
  wings: 30.0,
  wingsTop: 33.0,
  wingsBack: 34.0,
  unwrap: 34.0,
  end: 40.5,
};

// 울부짖는 늑대: 뒷다리를 접어 앉고 앞다리로 가슴을 받친 채 목을 하늘로 길게 뺀다
export const HOWL = { pitch: -0.5, y: 0, thigh: -1.15, calf: 1.9, link: -0.9, arm: 0.5, fore: 0.05, neck: -0.6, head: -0.5, jaw: 0.55, tail: 0.5, spine: -0.1 };
// 머리 날개(눈 자리의 두 쌍) · 턱 — 축과 각도는 모델 공간 기준
export const WING = { axis: 'Z', down: 2.3, up: -0.3, grow: 4.2, jaw: 0.5 };

// 번데기: 붕대처럼 감긴 결 · 먹선 · 속에서 비치는 빛 · 입 자리 찢김 · 위에서부터 풀림
const COCOON_VERT = /* glsl */ `
uniform float uLoose; uniform float uTime;
varying vec3 vW; varying vec3 vN; varying vec3 vL;
void main() {
  vec3 p = position;
  // 느슨해질수록 붕대가 울퉁불퉁 들뜬다
  float w = sin(p.y * 7.0 + atan(p.z, p.x) * 3.0 + uTime * 0.7) * 0.5 + 0.5;
  p += normal * (uLoose * 0.18 * w);
  vL = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const COCOON_FRAG = /* glsl */ `
uniform float uOpacity; uniform float uTear; uniform vec3 uTearPos; uniform float uUnwrap; uniform float uTop; uniform float uH; uniform float uTime;
varying vec3 vW; varying vec3 vN; varying vec3 vL;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float az = atan(vL.z, vL.x);
  // 위에서부터 풀린다 (들쭉날쭉한 붕대 끝)
  float cut = uTop - uUnwrap * (uH + 0.6) + (n(vec2(az * 3.0, 0.0)) - 0.5) * 0.8;
  if (vL.y > cut) discard;
  // 입 자리 찢김
  if (uTear > 0.0) {
    vec3 d = vW - uTearPos;
    d.y *= 0.8;
    if (length(d) < uTear * (0.85 + 0.3 * n(vec2(az * 12.0, vL.y * 12.0)))) discard;
  }
  // 붕대 결: 비스듬히 감긴 띠 + 띠 사이의 먹선
  float band = vL.y * 3.2 + az * 0.55 + n(vec2(az * 2.0, vL.y)) * 0.8;
  float f = fract(band);
  float line = smoothstep(0.06, 0.0, f) + smoothstep(0.94, 1.0, f);
  float scratch = smoothstep(0.02, 0.0, abs(fract(band * 2.7 + n(vec2(az * 9.0, vL.y * 5.0)) * 1.6) - 0.5)) * 0.6;
  vec3 V = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), V));
  vec3 base = mix(vec3(0.78, 0.78, 0.68), vec3(1.0, 1.0, 0.93), facing);
  // 그늘진 띠 (셀)
  base *= mix(0.72, 1.0, step(0.45, fract(band + 0.5)));
  vec3 col = mix(base, vec3(0.12, 0.12, 0.1), max(line, scratch) * 0.85);
  // 가장자리는 희게 번진다
  col += vec3(0.25, 0.27, 0.22) * pow(1.0 - facing, 2.0);
  // 풀리는 끝은 밝게
  col += vec3(0.6) * smoothstep(0.25, 0.0, cut - vL.y) * step(0.001, uUnwrap);
  gl_FragColor = vec4(col, uOpacity);
}`;

/** 먹 얼룩이 있는 흰 두꺼비 결 */
function patchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4ee';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#0c0c10';
  for (let i = 0; i < 11; i++) {
    g.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 4 + Math.random() * 10;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rr = r * (0.5 + Math.random() * 0.8);
      g.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr);
    }
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class MahoragaRitual {
  /**
   * @param owner 메구미
   * @param onDone (pos, yaw) => 진짜 마허라를 세운다
   */
  constructor(owner, onDone) {
    this.owner = owner;
    this.ctx = owner.ctx;
    this.onDone = onDone;
    this.t = 0;
    this.alive = true;
    const { input: inp, sfx, env } = this.ctx;
    // 무대: 플레이어 앞 (머리 수평 방향)
    const fwd = _v.copy(inp.headDir).setY(0);
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    this.fwd = fwd.clone();
    this.right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.origin = new THREE.Vector3(inp.head.x, 0, inp.head.z);
    this.cocoonPos = this.origin.clone().addScaledVector(fwd, 9);
    this.yaw = Math.atan2(-fwd.x, -fwd.z); // 마허라가 플레이어를 본다
    this.group = new THREE.Group();
    this.ctx.scene.add(this.group);
    this.mats = [];
    this.geos = [];
    // 0) 어둠: 배경을 끄고 검은 공간 (이미 영역 등으로 꺼져 있으면 그대로)
    this.hidEnv = !env.hidden;
    if (this.hidEnv) env.setHidden(true);
    this.savedLight = { hemi: env.hemi.intensity, sun: env.sun.intensity, fog: env.fog.color.clone(), near: env.fog.near, far: env.fog.far };
    const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.dark = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16), black);
    this.dark.position.copy(this.origin);
    this.dark.renderOrder = -5;
    this.mats.push(black);
    this.geos.push(this.dark.geometry);
    this.group.add(this.dark);
    // 1) 두꺼비와 늑대
    this.pack = [];
    this.patchTex = patchTexture();
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x050505, fog: false });
    this.mats.push(this.eyeMat);
    // 두꺼비: 좌우 앞쪽에 둘씩 · 늑대: 그 뒤에 좌우 둘씩 (메구미는 가운데 뒤)
    const frogAt = [[-1.5, -3.0, 1.25], [-2.7, -3.7, 1.45], [1.5, -3.0, 1.25], [2.7, -3.7, 1.45]];
    const wolfAt = [[-2.6, -6.2, 2.9], [-4.4, -7.2, 3.3], [2.6, -6.2, 2.9], [4.4, -7.2, 3.3]];
    for (const [x, z, h] of frogAt) this._spawnPack('toad', x, z, h, true);
    for (const [x, z, h] of wolfAt) this._spawnPack('dogWhite', x, z, h, false);
    // 2) 번데기 속 마허라 · 번데기 · 실
    this.M = makeShiki('mahoraga', 5.4, { outline: 0.02, skip: ['teeth', 'mouth'] });
    if (this.M) {
      this.M.root.position.copy(this.cocoonPos);
      this.M.root.quaternion.setFromAxisAngle(UP, this.yaw);
      this.M.root.visible = false;
      this.group.add(this.M.root);
      this.head = this.M.rig.get('head');
      this.pose = { jaw: 0, wing: 0, wingS: 1 };
    }
    const H = 5.9;
    const prof = [[0.05, 0], [0.55, 0.15], [0.75, 0.9], [0.95, 1.9], [1.35, 3.1], [1.55, 3.9], [1.45, 4.6], [1.05, 5.3], [0.55, 5.75], [0.05, H]].map(([r, y]) => new THREE.Vector2(r, y));
    this.cU = {
      uOpacity: { value: 0 }, uTear: { value: 0 }, uTearPos: { value: new THREE.Vector3() }, uUnwrap: { value: 0 }, uTop: { value: H }, uH: { value: H },
      uLoose: { value: 0 }, uTime: { value: 0 },
    };
    const cMat = new THREE.ShaderMaterial({ uniforms: this.cU, vertexShader: COCOON_VERT, fragmentShader: COCOON_FRAG, transparent: true, side: THREE.DoubleSide, fog: false });
    this.cocoon = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), cMat);
    this.cocoon.position.copy(this.cocoonPos);
    this.cocoon.visible = false;
    this.mats.push(cMat);
    this.geos.push(this.cocoon.geometry);
    this.group.add(this.cocoon);
    // 번데기 뒤의 은은한 빛
    const glowMat = new THREE.SpriteMaterial({ map: this._glowTex(), color: 0xe8f0e0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.glow = new THREE.Sprite(glowMat);
    this.glow.scale.set(11, 13, 1);
    this.glow.position.copy(this.cocoonPos).setY(3);
    this.mats.push(glowMat);
    this.group.add(this.glow);
    // 실: 번데기에서 먼 곳으로
    const pts = [];
    this.threadEnds = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rnd(-0.12, 0.12);
      const el = rnd(-0.25, 0.75);
      const from = new THREE.Vector3(Math.cos(a) * 1.2, rnd(1.5, 5), Math.sin(a) * 1.2).add(this.cocoonPos);
      const to = from.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).multiplyScalar(rnd(30, 55)));
      pts.push(from, to);
      this.threadEnds.push({ from, to });
    }
    const tg = new THREE.BufferGeometry().setFromPoints(pts);
    const tMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.threads = new THREE.LineSegments(tg, tMat);
    this.mats.push(tMat);
    this.geos.push(tg);
    this.group.add(this.threads);
    this.strips = [];
    // 소리: 사용자 음성 (처음 0.4초 페이드 인 · 끝 1.5초 페이드 아웃이 파일에 들어 있다)
    this.voice = sfx.playClip('mahoragaSummon', { vol: 1.1, fadeIn: 0.4 });
    // 의식이 끝날 때까지 술사도 적도 공격하지 못한다
    this.ctx.world.cinematic = true;
    sfx.rumble(1.5, 0.6);
    this.flags = {};
  }

  _glowTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.25)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    this.tex = t;
    return t;
  }

  /** 늑대의 울부짖는 자세 (k: 0 쉼 → 1 가장 크게 울부짖음) */
  _howl(S, k) {
    const H = HOWL;
    const R = S.rig;
    R.begin();
    S.model.rotation.x = H.pitch;
    S.model.position.y = H.y * S.scale;
    for (const sd of ['L', 'R']) {
      R.rot(`Bip002_${sd}_Thigh`, AX.X, H.thigh);
      R.rot(`Bip002_${sd}_Calf`, AX.X, H.calf);
      R.rot(`Bip002_${sd}_HorseLink`, AX.X, H.link);
      R.rot(`Bip002_${sd}_UpperArm`, AX.X, H.arm);
      R.rot(`Bip002_${sd}_Forearm`, AX.X, H.fore);
    }
    R.rot('Bip002_Spine', AX.X, H.spine);
    R.rot('Bip002_Neck', AX.X, H.neck - 0.15 * k);
    R.rot('Bip002_Head', AX.X, H.head - 0.15 * k);
    R.rot('Bone015', AX.X, H.jaw * (0.4 + 0.6 * k));
    for (const n of ['Bone017', 'Bone018', 'Bone019']) R.rot(n, AX.X, H.tail * 0.4);
  }

  _spawnPack(key, x, z, h, frog) {
    const S = makeShiki(key, h, { outline: 0.018, toonShade: false });
    if (!S) return;
    // 어둠 속에서 하얗게 빛나는 그림자 식신 (두꺼비는 먹 얼룩, 늑대는 푸르스름한 흰빛)
    const mat = frog
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, map: this.patchTex, transparent: true, opacity: 0, fog: false })
      : new THREE.MeshBasicMaterial({ color: 0xe6ecf4, transparent: true, opacity: 0, fog: false });
    for (const m of S.meshes) {
      if (m.name.includes('eyeshine')) m.visible = false;
      else m.material = m.name.includes('eyes') ? this.eyeMat : mat;
    }
    for (const o of S.outlines) o.visible = false;
    this.mats.push(mat);
    const p = this.origin.clone().addScaledVector(this.right, x).addScaledVector(this.fwd, -z);
    S.root.position.copy(p);
    // 두꺼비는 플레이어 쪽 대각선을, 늑대는 바깥을 보며 하늘로 고개를 든다 (울부짖기)
    const toMe = Math.atan2(-this.fwd.x, -this.fwd.z);
    const look = toMe + (frog ? (x < 0 ? 0.35 : -0.35) : x < 0 ? 0.9 : -0.9);
    S.root.quaternion.setFromAxisAngle(UP, look);
    if (!frog) this._howl(S, 0);
    else {
      // 두꺼비: 웅크려 앉은 자세 (가마와 같은 자세, 혀는 입속에)
      const R = S.rig;
      const pitch = 0.56;
      R.scale('tongue_A', 0.01);
      R.rot('COG', AX.X, pitch);
      R.rot('neck', AX.X, -pitch * 0.45);
      R.rot('head', AX.X, -pitch * 0.35 - 0.08);
      for (const [sd, sg] of [['L', 1], ['R', -1]]) {
        R.rot(sd + '_leg', AX.X, -pitch - 1.2);
        R.rot(sd + '_leg', AX.Z, 0.28 * sg);
        R.rot(sd + '_knee', AX.X, 2.3);
        R.rot(sd + '_ankle', AX.X, -1.05);
        R.rot(sd + '_arm', AX.Z, -0.95 * sg);
        R.rot(sd + '_arm', AX.X, -pitch - 0.35 + 0.05);
        R.rot(sd + '_elbow', AX.X, -0.35);
        R.rot(sd + '_hand', AX.X, 0.9 + pitch * 0.4);
      }
    }
    S.root.visible = false;
    this.group.add(S.root);
    this.pack.push({ S, mat, frog, phase: Math.random() * 6, base: S.root.position.clone() });
  }

  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const t = this.t;
    const R = RITUAL;
    const { fx, sfx, ui, env } = this.ctx;
    // 어둠
    const darkK = clamp01((t - R.black) / 0.35) * (1 - clamp01((t - R.end + 0.8) / 0.8));
    this.dark.material.opacity = darkK;
    env.hemi.intensity = THREE.MathUtils.lerp(this.savedLight.hemi, 0.35, darkK);
    env.sun.intensity = THREE.MathUtils.lerp(this.savedLight.sun, 0.2, darkK);
    if (!this.flags.black && t >= R.black) {
      this.flags.black = true;
      sfx.rumble(1.2, 0.8);
      this.ctx.input.left.pulse?.(0.8, 120);
      this.ctx.input.right.pulse?.(0.8, 120);
    }
    // 두꺼비 · 늑대
    const packK = clamp01((t - R.pack) / 0.9) * (1 - clamp01((t - R.packOut) / 0.8));
    for (const P of this.pack) {
      P.S.root.visible = packK > 0.01;
      P.mat.opacity = packK;
      P.mat.transparent = packK < 0.99;
      P.mat.depthWrite = packK > 0.5;
      for (const o of P.S.outlines) o.visible = packK > 0.6;
      if (P.frog) {
        // 목주머니가 벌렁인다
        const s = 1 + Math.sin(t * 5 + P.phase) * 0.03;
        P.S.model.scale.setScalar(P.S.scale * s);
      } else {
        // 울부짖을 때 고개를 더 치켜들고 입을 벌린다 (숨을 들이쉬었다가 길게)
        this._howl(P.S, Math.max(0, Math.sin(t * 0.9 + P.phase)));
      }
    }
    // 번데기
    if (t >= R.cocoon) {
      const k = clamp01((t - R.cocoon) / 1.2);
      if (this.M) this.M.root.visible = true;
      this.cocoon.visible = true;
      this.cU.uOpacity.value = ease(k);
      this.cU.uTime.value = t;
      this.glow.material.opacity = 0.35 * ease(k) * (1 - clamp01((t - R.end + 1) / 1));
      // 실: 반짝이며 이어져 있다 → 팅! 하고 풀려 사라진다
      const tk = t < R.ting ? ease(k) * (0.55 + 0.25 * Math.sin(t * 7)) : Math.max(0, 1 - (t - R.ting) / 0.35);
      this.threads.material.opacity = tk;
      if (t >= R.ting) {
        const r = clamp01((t - R.ting) / 0.35);
        const P = this.threads.geometry.attributes.position;
        this.threadEnds.forEach((e, i) => {
          _v.lerpVectors(e.to, e.from, ease(r));
          P.setXYZ(i * 2 + 1, _v.x, _v.y, _v.z);
        });
        P.needsUpdate = true;
      }
    }
    if (!this.flags.cocoon && t >= R.cocoon) {
      this.flags.cocoon = true;
      sfx.play('mahoragaWheel', { at: this.cocoonPos, vol: 0.8 });
    }
    if (!this.flags.name && t >= R.name) {
      this.flags.name = true;
      ui.manga({ top: '八握剣', main: '異戒神将魔虚羅', ruby: 'やつかのつるぎ いかいしんしょう まこら', color: '#ffd28a', big: true });
    }
    // 입 자리 찢김 + 턱이 벌어진다
    if (this.head && t >= R.cocoon) {
      // 찢김 자리: 턱(입) 앞, 번데기 겉면 쪽
      this.M.root.updateMatrixWorld(true);
      (this.M.rig.pos('jaw_A', this.cU.uTearPos.value) ?? this.head.getWorldPosition(this.cU.uTearPos.value)).addScaledVector(this.fwd, -0.55);
    }
    if (t >= R.mouth) {
      const k = clamp01((t - R.mouth) / 0.35);
      this.cU.uTear.value = 0.62 * ease(k);
      if (this.pose) this.pose.jaw = WING.jaw * ease(k);
      if (!this.flags.mouth) {
        this.flags.mouth = true;
        fx.burst(this.cU.uTearPos.value, 30, new THREE.Color(0xf4f4e8), 3, 0.04, 0.5);
      }
    }
    // 연기
    // 연기: 찢긴 입과 번데기 틈에서 하얀 김이 새어 나온다 (27~29초에 짙고, 그 뒤엔 옅게)
    if (t >= R.smoke && t < R.end - 1.5) {
      const rate = t < R.ting + 0.8 ? 7 : 2.5;
      if (Math.random() < dt * rate) {
        const a = Math.random() * Math.PI * 2;
        const fromMouth = Math.random() < 0.5;
        if (fromMouth) _v.copy(this.cU.uTearPos.value);
        else _v.set(Math.cos(a) * 1.3, rnd(1, 4.5), Math.sin(a) * 1.3).add(this.cocoonPos);
        const out = fromMouth ? _v2.copy(this.fwd).multiplyScalar(-0.4) : _v2.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
        out.y += rnd(0.25, 0.6);
        fx.fire?.smoke?.(_v, out, { size0: 0.35, size1: 1.6, life: 2.2, shade: 1, lit: 0, opacity: 0.22, rise: 0.35 });
      }
    }
    if (!this.flags.ting && t >= R.ting) {
      this.flags.ting = true;
      fx.flash(this.cocoonPos.clone().setY(3), new THREE.Color(0xffffff), 8, 0.25);
      for (const e of this.threadEnds) fx.burst(e.from, 3, new THREE.Color(0xffffff), 2, 0.03, 0.3);
    }
    // 날개: 30초에 아래에서 삐걱거리며 솟아 커졌다가, 33~34초에 제자리로
    if (this.pose) {
      let up = 0;
      if (t >= R.wings && t < R.wingsTop) {
        // 삐걱: 0.25초마다 한 칸씩 끊어서 (칸마다 살짝 넘쳤다 돌아온다)
        const u = (t - R.wings) / (R.wingsTop - R.wings);
        const st = Math.floor(u * 12);
        const within = (u * 12) % 1;
        up = (st + (within < 0.35 ? ease(within / 0.35) * 1.15 : 1 + 0.15 * (1 - ease((within - 0.35) / 0.65)))) / 12;
        if (st !== this._lastStep) {
          this._lastStep = st;
          sfx.play('click', { at: this.cocoonPos, vol: 0.35, rate: rnd(0.35, 0.5) });
        }
      }
      up = clamp01(up);
      if (t < R.wings) {
        // 번데기 속: 날개는 아래로 접혀 있다
        this.pose.wing = WING.down;
        this.pose.wingS = 1;
      } else if (t < R.wingsTop) {
        this.pose.wing = THREE.MathUtils.lerp(WING.down, WING.up, up);
        this.pose.wingS = 1 + WING.grow * up;
      } else {
        // 다 솟은 뒤: 작아지며 제자리(평소 모양)로
        const k = ease(clamp01((t - R.wingsTop) / (R.wingsBack - R.wingsTop)));
        this.pose.wing = WING.up * (1 - k);
        this.pose.wingS = 1 + WING.grow * (1 - k);
      }
      this.pose.ring = ease(clamp01((t - R.unwrap - 2.5) / 2.5));
      this._applyPose();
    }
    // 번데기가 느슨해지고 → 위에서부터 풀린다
    this.cU.uLoose.value = clamp01((t - R.wings) / (R.unwrap - R.wings)) * 0.5 + clamp01((t - R.unwrap) / 2) * 0.5;
    if (t >= R.unwrap) {
      const k = clamp01((t - R.unwrap) / (R.end - R.unwrap - 0.3));
      this.cU.uUnwrap.value = k;
      // 벗겨진 붕대 조각이 떨어진다
      if (Math.random() < dt * 14 && k < 0.98) {
        const y = this.cU.uTop.value - k * (this.cU.uH.value + 0.6);
        this._strip(y);
      }
    }
    this._updateStrips(dt);
    if (t >= R.end) {
      this._finish();
      return false;
    }
    return true;
  }

  /** 번데기 속 자세: 팔을 내려 몸에 붙이고 고개를 숙인 채 — 턱 · 머리 날개만 움직인다 */
  _applyPose() {
    const R = this.M.rig;
    const P = this.pose;
    R.begin();
    R.rot('L_arm', AX.Z, -0.85);
    R.rot('R_arm', AX.Z, 0.85);
    R.rot('L_elbow', AX.X, -0.25);
    R.rot('R_elbow', AX.X, -0.25);
    R.rot('head', AX.X, 0.22);
    R.rot('backhead_A', AX.X, -1.25);
    R.rot('jaw_A', AX.X, P.jaw);
    // 법진은 번데기가 풀린 뒤에 머리 위에 나타난다
    R.scale('ring', Math.max(0.001, P.ring ?? 0));
    const ax = AX[WING.axis];
    for (const n of ['L_headwing_A1', 'L_headwing_B1']) {
      R.rot(n, ax, -P.wing);
      if (P.wingS !== 1) R.scale(n, P.wingS);
    }
    for (const n of ['R_headwing_A1', 'R_headwing_B1']) {
      R.rot(n, ax, P.wing);
      if (P.wingS !== 1) R.scale(n, P.wingS);
    }
  }

  _strip(y) {
    const a = Math.random() * Math.PI * 2;
    const g = new THREE.PlaneGeometry(0.18, rnd(0.6, 1.4));
    const m = new THREE.MeshBasicMaterial({ color: 0xf0f0e2, side: THREE.DoubleSide, transparent: true, fog: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(Math.cos(a) * 1.3, Math.max(0.4, y), Math.sin(a) * 1.3).add(this.cocoonPos);
    mesh.rotation.set(rnd(-1, 1), a, rnd(-1, 1));
    this.group.add(mesh);
    this.strips.push({ mesh, v: new THREE.Vector3(Math.cos(a) * rnd(0.4, 1.2), rnd(-0.2, 0.6), Math.sin(a) * rnd(0.4, 1.2)), spin: rnd(-3, 3), t: 0 });
  }

  _updateStrips(dt) {
    this.strips = this.strips.filter((s) => {
      s.t += dt;
      s.v.y -= 2.2 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.rotation.x += s.spin * dt;
      s.mesh.material.opacity = 1 - clamp01((s.t - 1.2) / 0.8);
      if (s.mesh.position.y < 0.02) {
        s.mesh.position.y = 0.02;
        s.v.set(0, 0, 0);
      }
      if (s.t > 2) {
        this.group.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  _finish() {
    if (!this.alive) return;
    this.alive = false;
    const pos = this.cocoonPos.clone();
    const yaw = this.yaw;
    this._cleanup();
    this.onDone?.(pos, yaw);
  }

  /** 도중에 그만두기 (캐릭터 교체 · 배경 전환) */
  cancel() {
    if (!this.alive) return;
    this.alive = false;
    this.voice?.stop?.(0.3);
    this._cleanup();
  }

  _cleanup() {
    const env = this.ctx.env;
    this.ctx.world.cinematic = false;
    for (const s of this.strips) {
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    }
    this.strips = [];
    this.ctx.scene.remove(this.group);
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
    this.patchTex?.dispose();
    this.tex?.dispose();
    env.hemi.intensity = this.savedLight.hemi;
    env.sun.intensity = this.savedLight.sun;
    if (this.hidEnv && !this.ctx.world.domain) {
      env.setHidden(false);
      env.restore?.();
      env.applyShadows?.();
    }
  }
}
