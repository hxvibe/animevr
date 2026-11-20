// 옷코츠 유타 — 특급 주술사 · 특급과주원령 리카
//  · 카타나: 주먹을 쥐면 칼이 쥐어진다 — 휘둘러 벤다 (칼끝 속도가 빠를수록 깊게)
//      아주 세게 휘두르면 칼날에 담은 주력이 터져 검기가 날아간다
//  · 리카: 왼손 주먹(반지)을 입술에 대고 0.5초 → 리카 완전 현현 / 다시 하면 돌려보낸다
//      리카는 곁에 떠 있다가 가까운 적을 후려치고, 붙잡아 쥐어짜고, 던진다. 왼손으로 가리키면 그 적에게 간다
//  · 순애빔(주력의 고출력 지향 방출): 리카 완전현현 중에만 — 두 손바닥을 마주 보게 모았다가 밀면 리카의 입에서
//  · 주언 「動くな」: 편 손바닥으로 입을 가렸다가 떼며 앞으로 → 바라본 적들이 멈춘다
//  · 반전술식: 체력이 천천히 차오른다
//  · 영역전개 「真贋相愛」: 수많은 일본도가 꽂힌 잔해 더미 — 모방한 술식이 깃든 칼이 날아든다
//      (해 · 주언 · 야곱의 사다리 중 무작위) / 수인: 손날을 펴 손등을 앞으로, 다른 손 주먹을 턱 앞에
import * as THREE from 'three';
import { cool } from '../../core/cooldown.js';
import { bodyOf } from '../../core/body.js';
import { Caster } from '../../core/caster.js';
import { HandAura } from '../../core/handAura.js';
import { ShellDomain } from '../../core/shellDomain.js';
import { RiggedBody } from '../../core/rigged.js';
import { makeCrescent } from '../sukuna/vfx.js';
import { loadModel, getModel } from '../../core/assets.js';
import { makeGlowSprite } from '../../core/fx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const AURA = { glow: 0xd8e8ff, hot: 0xffffff, inner: 0x10101a, line: 0x000000 };
const LOVE = new THREE.Color(0xff5ab0);
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (k) => k * k * (3 - 2 * k);

export const YUTA_MODELS = ['wpn_yuta_sword', 'wpn_yuta_sheath', 'curse_rika', 'item_megaphone'];

// ───────────────── 카타나 ─────────────────
function swordMesh(color = null) {
  const src = getModel('wpn_yuta_sword');
  const g = new THREE.Group();
  if (src) {
    // 스키닝 메시는 원본 뼈를 가리키므로 평범한 메시로 옮긴다 (바인드 자세 그대로)
    const c = new THREE.Group();
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      const mesh = new THREE.Mesh(o.geometry, new THREE.MeshToonMaterial({ color: color ?? m.color ?? 0xffffff, map: color ? null : m.map ?? null }));
      if (o.isSkinnedMesh && o.skeleton?.bones.length) {
        // 화면 위치 = 뼈 월드 × 역바인드 × bindMatrix (양자화 배율이 역바인드에 들어 있다)
        const bm = new THREE.Matrix4().multiplyMatrices(o.skeleton.bones[0].matrixWorld, o.skeleton.boneInverses[0]).multiply(o.bindMatrix);
        mesh.applyMatrix4(bm);
      } else mesh.applyMatrix4(o.matrixWorld);
      mesh.castShadow = true;
      c.add(mesh);
    });
    // 손잡이 가운데가 원점, +Z 가 칼끝
    c.position.z = 0.06;
    g.add(c);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.78).translate(0, 0, 0.53), new THREE.MeshToonMaterial({ color: 0xdfe6ee }));
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28).rotateX(Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x1a1a24 }));
    g.add(blade, grip);
  }
  return g;
}
const TIP = 0.97; // 원점에서 칼끝까지
const BASE = 0.22; // 날이 시작하는 곳

class Katana {
  constructor(ctx, side) {
    this.ctx = ctx;
    this.side = side;
    this.group = swordMesh();
    this.group.visible = false;
    this.k = 0;
    ctx.scene.add(this.group);
    this.tip = new THREE.Vector3();
    this.base = new THREE.Vector3();
    this.prevTip = new THREE.Vector3();
    this.tipVel = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.hits = new Map();
    this.trail = [];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 2 * 3), 3));
    tg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(16 * 2), 1));
    const idx = [];
    for (let i = 0; i < 15; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(idx);
    this.trailMesh = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(0.85,0.92,1.0), vA * 0.55); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    this.trailMesh.frustumCulled = false;
    ctx.scene.add(this.trailMesh);
  }

  /** h: 손 상태. 주먹(쥐기)일 때 칼이 나온다 */
  update(dt, h, want) {
    this.k = THREE.MathUtils.clamp(this.k + (want ? dt * 6 : -dt * 5), 0, 1);
    this.group.visible = this.k > 0.01;
    if (!this.group.visible) {
      this.trail.length = 0;
      this.trailMesh.visible = false;
      this.hasPrev = false;
      return 0;
    }
    // 칼 방향: 손 추적이면 주먹을 꿰뚫는 축(엄지 쪽) 그대로 — 주먹에 수직으로 선다. 컨트롤러는 가리키는 방향
    const F = _v.copy(h.fingersDir).normalize();
    const N = _v2.copy(h.palmNormal).normalize();
    if (h.source === 'hand') {
      const thumb = _v3.crossVectors(F, N);
      if (this.side === 'left') thumb.negate();
      this.dir.copy(thumb).normalize();
    } else this.dir.copy(h.dir).normalize();
    // 날은 손등(손가락 마디) 쪽을 향한다
    const edge = _v2.copy(h.source === 'hand' ? F : UP).addScaledVector(this.dir, -(h.source === 'hand' ? F : UP).dot(this.dir)).normalize();
    const side = _v3.crossVectors(this.dir, edge).normalize();
    _m.makeBasis(edge, side, this.dir);
    this.group.quaternion.setFromRotationMatrix(_m);
    this.group.position.copy(h.palm).addScaledVector(N, 0.035);
    this.group.scale.setScalar(Math.max(0.01, ease(this.k)));
    this.base.copy(this.group.position).addScaledVector(this.dir, BASE * this.k);
    this.tip.copy(this.group.position).addScaledVector(this.dir, TIP * this.k);
    let speed = 0;
    if (this.hasPrev && dt > 0) {
      this.tipVel.subVectors(this.tip, this.prevTip).divideScalar(dt);
      speed = this.tipVel.length();
    }
    this.prevTip.copy(this.tip);
    this.hasPrev = true;
    // 궤적
    this.trail.unshift({ a: this.base.clone(), b: this.tip.clone(), s: speed });
    if (this.trail.length > 16) this.trail.pop();
    const P = this.trailMesh.geometry.attributes.position;
    const A = this.trailMesh.geometry.attributes.alpha;
    for (let i = 0; i < 16; i++) {
      const t = this.trail[Math.min(i, this.trail.length - 1)];
      P.setXYZ(i * 2, t.a.x, t.a.y, t.a.z);
      P.setXYZ(i * 2 + 1, t.b.x, t.b.y, t.b.z);
      const a = THREE.MathUtils.clamp((t.s - 2.5) / 5, 0, 1) * (1 - i / 16);
      A.setX(i * 2, a * 0.2);
      A.setX(i * 2 + 1, a);
    }
    P.needsUpdate = true;
    A.needsUpdate = true;
    this.trailMesh.visible = true;
    return speed;
  }

  dispose() {
    this.ctx.scene.remove(this.group, this.trailMesh);
    this.trailMesh.geometry.dispose();
    this.trailMesh.material.dispose();
  }
}

// ───────────────── 허리춤 칼집 ─────────────────
//  왼쪽 허리에 비스듬히 (칼집 입구가 앞·위, 끝이 뒤·아래). 칼을 꽂아 둔 채로 보이고, 손잡이를 쥐면 뽑힌다
function sheathMesh() {
  const src = getModel('wpn_yuta_sheath');
  const g = new THREE.Group();
  if (!src) {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.78).rotateX(Math.PI / 2).translate(0, 0, 0.53), new THREE.MeshToonMaterial({ color: 0x14141c })));
    return g;
  }
  const c = new THREE.Group();
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    if (!o.isMesh) return;
    const mesh = new THREE.Mesh(o.geometry, new THREE.MeshToonMaterial({ color: o.material.color ?? 0xffffff, map: o.material.map ?? null }));
    if (o.isSkinnedMesh && o.skeleton?.bones.length) {
      const bm = new THREE.Matrix4().multiplyMatrices(o.skeleton.bones[0].matrixWorld, o.skeleton.boneInverses[0]).multiply(o.bindMatrix);
      mesh.applyMatrix4(bm);
    } else mesh.applyMatrix4(o.matrixWorld);
    mesh.castShadow = true;
    c.add(mesh);
  });
  // 칼집 모델은 칼과 반대로(-Z 쪽으로) 놓여 있다 → 뒤집어 칼날(코등이 0.14 ~ 칼끝 0.97)을 감싸게
  c.rotation.y = Math.PI;
  c.position.z = 0.38;
  g.add(c);
  return g;
}
// 몸 기준: 칼집 입구 근처의 손잡이 가운데 · 칼끝 방향 (뒤·아래)
const HILT = [-0.2, 0.02, -0.16];
const SHEATH_DIR = [0.18, -0.55, 1];
class Sheath {
  constructor(ctx) {
    this.ctx = ctx;
    this.g = new THREE.Group();
    this.sheath = sheathMesh();
    this.sword = swordMesh();
    this.g.add(this.sheath, this.sword);
    ctx.scene.add(this.g);
    this.hilt = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.flash = 0;
  }

  update(dt, drawn) {
    const B = bodyOf(this.ctx).update(dt);
    B.point(...HILT, this.hilt);
    B.dir(...SHEATH_DIR, this.dir);
    // 칼날 면은 위(칼등이 위)
    const side = _v.crossVectors(this.dir, UP).normalize();
    const edge = _v2.crossVectors(side, this.dir).normalize().negate();
    _m.makeBasis(edge, _v3.crossVectors(this.dir, edge), this.dir);
    this.g.quaternion.setFromRotationMatrix(_m);
    this.g.position.copy(this.hilt);
    this.sword.visible = !drawn;
    this.g.visible = this.ctx.input.mode !== 'desktop';
  }

  dispose() {
    this.ctx.scene.remove(this.g);
  }
}

// ───────────────── 주언 확성기 ─────────────────
//  모델: 손잡이가 아래(원점 = 손잡이 끝), 나팔이 -Z, 입에 대는 곳이 +Z (원래 크기 약 8.7)
//  외친 손에 쥐어진다: 손잡이를 쥐고 나팔은 손끝(컨트롤러는 가리키는) 방향
const MEGA_S = 0.046;
class Megaphone {
  constructor(ctx) {
    this.ctx = ctx;
    this.g = new THREE.Group();
    this.g.visible = false;
    this.t = 0;
    this.on = 0;
    ctx.scene.add(this.g);
  }

  _build() {
    if (this.inner || !getModel('item_megaphone')) return !!this.inner;
    const m = getModel('item_megaphone').clone(true);
    const meshes = [];
    m.traverse((o) => o.isMesh && meshes.push(o));
    meshes.forEach((o) => {
      const src = o.material;
      o.material = new THREE.MeshToonMaterial({ color: src.color ?? 0xffffff, map: src.map ?? null });
      o.castShadow = true;
      const ol = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({ color: 0x060606, side: THREE.BackSide }));
      ol.scale.setScalar(1.03);
      o.add(ol);
    });
    m.scale.setScalar(MEGA_S);
    // 손잡이 가운데가 원점(손바닥)에 오게
    m.position.set(0, -1.8 * MEGA_S, 0);
    this.inner = m;
    this.g.add(m);
    return true;
  }

  /** 손(side)에 쥐고 dur 초 동안 외친다 */
  shout(side = 'right', dur = 1.3) {
    if (!this._build()) return false;
    this.side = side;
    this.t = dur;
    return true;
  }

  /** 나팔 끝 위치 */
  bell(out = new THREE.Vector3()) {
    this.g.updateMatrixWorld(true);
    return out.set(0, 3.8 * MEGA_S, -3.8 * MEGA_S).applyMatrix4(this.g.matrixWorld);
  }

  update(dt) {
    this.t -= dt;
    this.on = THREE.MathUtils.clamp(this.on + (this.t > 0 ? dt * 10 : -dt * 6), 0, 1);
    this.g.visible = this.on > 0.01;
    if (!this.g.visible) return;
    const inp = this.ctx.input;
    const h = inp[this.side ?? 'right'];
    // 손에 쥔다: 나팔 축 = 손끝 방향(컨트롤러·데스크톱은 가리키는 방향), 손잡이는 아래로
    const fwd = _v.copy(h.source === 'hand' ? h.fingersDir : h.dir);
    if (!h.active || fwd.lengthSq() < 1e-4) fwd.copy(inp.headDir);
    fwd.normalize();
    const up = _v2.set(0, 1, 0).addScaledVector(fwd, -fwd.y);
    if (up.lengthSq() < 1e-4) up.set(0, 0, 1);
    up.normalize();
    const x = _v3.crossVectors(up, fwd.clone().negate()).normalize();
    this.g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, fwd.clone().negate()));
    this.g.position.copy(h.active ? h.palm : _v.copy(inp.head).add(_v2.set(0.2, -0.3, -0.3).applyQuaternion(inp.headQuat)));
    const e = this.on * this.on * (3 - 2 * this.on);
    this.g.scale.setScalar(Math.max(0.01, e) * (1 + Math.max(0, this.t - 1.0) * 0.6)); // 외치는 순간 들썩
  }

  /** 나팔 앞에서 퍼지는 소리 고리 */
  rings() {
    const fx = this.ctx.fx;
    const inp = this.ctx.input;
    this.update(0);
    const from = this.bell(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.g.quaternion);
    const q = this.g.quaternion.clone();
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
      ring.quaternion.copy(q);
      ring.visible = false;
      fx.addTransient(ring, 0.9 + i * 0.15, (k, dt) => {
        const kk = Math.max(0, (k * (0.9 + i * 0.15) - i * 0.15) / 0.9);
        ring.visible = kk > 0;
        ring.position.copy(from).addScaledVector(dir, kk * 6);
        ring.scale.setScalar(1 + kk * 7);
        ring.material.opacity = 0.9 * (1 - kk);
        void dt;
      }, () => ring.geometry.dispose());
    }
  }

  dispose() {
    this.ctx.scene.remove(this.g);
  }
}

// ───────────────── 리카 ─────────────────
class Rika {
  constructor(yuta) {
    this.y = yuta;
    this.ctx = yuta.ctx;
    this.B = new RiggedBody('rika', { height: 2.3, outline: 0.025, hide: [] });
    this.root = new THREE.Group();
    this.alive = true;
    this.t = 0;
    this.mode = 'appear';
    this.modeT = 0;
    this.cd = 0.6;
    this.target = null;
    this.held = null;
    this.vel = new THREE.Vector3();
    this.home = new THREE.Vector3();
    const inp = this.ctx.input;
    const f = yuta.flatFwd(_v);
    this.root.position.copy(inp.head).setY(0).addScaledVector(f, -1.4).add(_v2.set(f.z, 0, -f.x).multiplyScalar(-1.3));
    this.root.rotation.y = Math.atan2(f.x, f.z);
    if (this.B.ok) {
      this.root.add(this.B.model);
      this.B.model.position.y = 2.0;
    }
    this.glow = makeGlowSprite(new THREE.Color(0x6040a0), 5);
    this.glow.material.opacity = 0;
    this.glow.position.y = 3.2;
    this.root.add(this.glow);
    this.ctx.scene.add(this.root);
    this.ctx.sfx.play('void_open', { at: this.root.position, vol: 0.7, rate: 0.7 });
    this.ctx.sfx.rumble(0.8, 0.4);
    this.ctx.fx.burst(_v.copy(this.root.position).setY(2.5), 60, new THREE.Color(0x1a1020), 4, 0.12, 1.0, { dark: true, spread: 1.5 });
    this.duration = 60; // 원작은 5분 — 게임에선 1분
  }

  setMode(m) {
    this.mode = m;
    this.modeT = 0;
  }

  /** 입 위치(월드) */
  mouth(out = new THREE.Vector3()) {
    const b = this.B.bones?.jaw_A ?? this.B.bones?.head;
    if (b) return b.getWorldPosition(out).add(_v3.set(0, 0, 0).applyQuaternion(this.root.quaternion));
    return out.copy(this.root.position).setY(4);
  }

  hand(side, out = new THREE.Vector3()) {
    const b = this.B.bones?.[side + '_hand'];
    return b ? b.getWorldPosition(out) : out.copy(this.root.position).setY(2.5);
  }

  face(p, dt, k = 6) {
    const d = _v.subVectors(p, this.root.position).setY(0);
    if (d.lengthSq() < 1e-4) return;
    const want = Math.atan2(d.x, d.z);
    let dy = want - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * Math.min(1, dt * k);
  }

  dismiss() {
    if (this.mode === 'leave') return;
    this._drop();
    this.setMode('leave');
    this.ctx.sfx.play('void_open', { at: this.root.position, vol: 0.5, rate: 1.1 });
  }

  _drop(vel = null) {
    if (this.held) {
      this.held.release?.(vel ?? new THREE.Vector3(0, -1, 0));
      this.held = null;
    }
  }

  drop() {
    this.held = null;
  }

  update(dt) {
    if (!this.alive) return false;
    if (!this.B.ok) {
      this.alive = false;
      return false;
    }
    this.t += dt;
    this.modeT += dt;
    this.cd -= dt;
    this.duration -= dt;
    if (this.duration <= 0 && this.mode !== 'leave') this.dismiss();
    const inp = this.ctx.input;
    const f = this.y.flatFwd(_v2);
    const right = _v3.set(-f.z, 0, f.x);
    this.home.copy(inp.head).setY(0).addScaledVector(f, -1.2).addScaledVector(right, 1.4);
    const J = this.B.J;
    const M = this.B.model;
    let armR = 0; // 오른팔: 0 늘어뜨림 → 1 머리 위 → -1 앞으로 내지름
    let armL = 0;
    let lean = 0;
    let open = 0;
    const W = this.ctx.world;
    // 떠 있는 흔들림
    M.position.y = 2.0 + Math.sin(this.t * 1.6) * 0.12;
    if (this.mode === 'appear') {
      const k = Math.min(1, this.modeT / 0.8);
      this.root.scale.setScalar(Math.max(0.01, ease(k)));
      this.glow.material.opacity = 0.6 * (1 - k);
      if (k >= 1) this.setMode('idle');
    } else if (this.mode === 'leave') {
      const k = Math.min(1, this.modeT / 0.6);
      this.root.scale.setScalar(Math.max(0.01, 1 - ease(k)));
      this.glow.material.opacity = 0.6 * k;
      if (k >= 1) {
        this.dispose();
        return false;
      }
    } else if (this.mode === 'idle') {
      this.root.position.lerp(this.home, Math.min(1, dt * 2.5));
      this.face(_v.copy(inp.head).addScaledVector(inp.headDir, 6), dt, 3);
      armR = armL = 0.05 + Math.sin(this.t * 1.3) * 0.05;
      if (this.cd <= 0) {
        const t = this.y.order ?? this._nearest(9);
        this.y.order = null;
        if (t) {
          this.target = t;
          this.setMode('approach');
        }
      }
    } else if (this.mode === 'approach') {
      const t = this.target;
      if (!t?.alive || t.dying) {
        this.setMode('idle');
      } else {
        const c = t.center(_v);
        const to = _v2.subVectors(c, this.root.position).setY(0);
        const d = to.length();
        this.face(c, dt, 8);
        if (d > 2.4) this.root.position.addScaledVector(to.normalize(), Math.min(d - 2.2, 9 * dt));
        armR = 0.3;
        lean = 0.2;
        if (d < 2.6 || this.modeT > 2.5) this.setMode(Math.random() < 0.45 && !t.def?.big && (t.scale ?? 1) < 1.6 ? 'grab' : 'punch');
      }
    } else if (this.mode === 'punch') {
      const t = this.target;
      if (t?.alive) this.face(t.center(_v), dt, 8);
      if (this.modeT < 0.35) {
        armR = ease(this.modeT / 0.35);
        lean = -0.15;
      } else {
        const k = Math.min(1, (this.modeT - 0.35) / 0.12);
        armR = 1 - k * 2;
        lean = -0.15 + k * 0.6;
        if (k >= 1 && !this._hit) {
          this._hit = true;
          this._smash();
        }
      }
      if (this.modeT > 0.9) {
        this._hit = false;
        this.cd = 0.7;
        this.setMode('idle');
      }
    } else if (this.mode === 'grab') {
      const t = this.target;
      const hp = this.hand('R', _v);
      if (!t?.alive || t.dying) {
        this._drop();
        this.cd = 0.4;
        this.setMode('idle');
      } else {
        this.face(t.center(_v2), dt, 8);
        if (!this.held) {
          armR = -0.6 * ease(Math.min(1, this.modeT / 0.3));
          open = 1;
          lean = 0.35;
          if (this.modeT > 0.3) {
            if (t.grab?.(this, t.center(_v2))) this.held = t;
            else this.setMode('punch');
            this.ctx.sfx.play('grab', { at: hp, vol: 0.8, rate: 0.7 });
          }
        } else {
          // 들어 올려 쥐어짠다 → 내던진다
          const k = this.modeT - 0.3;
          armR = k < 0.9 ? 0.2 + k * 0.6 : 0.8 - Math.min(1, (k - 0.9) / 0.15) * 1.8;
          t.holdAt(hp);
          if (k > 0.5 && k < 0.9 && Math.random() < dt * 6) {
            t.damage(12, { type: 'impact', silent: true });
            this.ctx.fx.burst(hp, 6, new THREE.Color(0x601020), 1.5, 0.04, 0.4);
          }
          if (k >= 1.05) {
            const f2 = _v2.subVectors(t.center(_v3), this.root.position).setY(0).normalize();
            if (f2.lengthSq() < 0.1) f2.copy(this.y.flatFwd(_v3));
            const vel = f2.multiplyScalar(14).add(_v3.set(0, -5, 0));
            t.damage(60, { type: 'impact' });
            this._drop(vel);
            this.ctx.sfx.whoosh(hp, 0.9, 0.6);
            this.cd = 1.0;
            this.setMode('idle');
          }
        }
      }
    }
    // 자세 (T자 바인드: 팔이 옆으로 비스듬히 뻗어 있다)
    for (const [sh, el, s, a] of [[J.shL, J.elL, 1, armL], [J.shR, J.elR, -1, armR]]) {
      if (!sh) continue;
      const up = Math.max(0, a);
      const fwd = Math.max(0, -a);
      // 늘어뜨림 → 위로 → 앞으로
      sh.rotation.set(-up * 2.2 - fwd * 1.3, s * -0.2 * up, s * (0.75 - up * 0.6 - fwd * 0.55));
      el.rotation.set(-0.5 - up * 0.9 + fwd * 0.4 + open * 0.2, 0, 0);
    }
    if (J.chest) J.chest.rotation.x = lean;
    if (J.spine) J.spine.rotation.x = lean * 0.5;
    if (J.head) J.head.rotation.set(-lean * 0.4 + Math.sin(this.t * 2.1) * 0.06, Math.sin(this.t * 0.7) * 0.15, 0);
    this.B.sync();
    return true;
  }

  _nearest(maxD) {
    const p = this.ctx.input.head;
    let best = null;
    let bd = maxD;
    for (const t of this.ctx.world.enemies()) {
      if (!t.alive || t.dying) continue;
      const d = t.center(_v).distanceTo(p);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  _smash() {
    const { fx, sfx, world } = this.ctx;
    const p = this.hand('R', new THREE.Vector3());
    const t = this.target;
    const at = t?.alive ? t.center(new THREE.Vector3()) : p;
    fx.shockwave(at.clone(), 0x202020, 2.4, 0.4, { dark: true, opacity: 0.6 });
    fx.burst(at, 30, new THREE.Color(0x1a1020), 5, 0.08, 0.6, { dark: true });
    sfx.explosion(at, 0.5);
    sfx.play('punch', { at, vol: 1, rate: 0.6 });
    const dir = _v.subVectors(at, this.root.position).setY(0).normalize();
    world.forEachEnemy(at, 1.6, (e, d) => {
      e.damage(90 * (1 - Math.min(0.5, d / 3)), { type: 'impact', dir: dir.clone(), dirAmt: 3 });
      if (e.alive) e.impulse?.(dir.clone().multiplyScalar(12).add(_v2.set(0, 4, 0)), 6);
    });
    this.ctx.game.hitstop = Math.max(this.ctx.game.hitstop, 0.05);
  }

  dispose() {
    this.alive = false;
    this._drop();
    this.ctx.scene.remove(this.root);
    this.glow.material.dispose();
    this.B.dispose?.();
  }
}

// 순애빔
class LoveBeam {
  constructor(ctx, from, dir, power, big) {
    this.ctx = ctx;
    this.t = 0;
    this.dur = big ? 1.4 : 0.6;
    const R = (big ? 1.5 : 0.3) * (0.5 + power * 0.5);
    const len = 40;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe6f4, transparent: true, toneMapped: false, depthWrite: false }));
    this.outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: LOVE, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.g = new THREE.Group();
    this.g.add(this.outer, this.core);
    this.g.position.copy(from);
    this.g.lookAt(_v.copy(from).add(dir)); // 지오메트리는 +Z 로 뻗는다
    this.core.scale.set(R * 0.4, R * 0.4, len);
    this.outer.scale.set(R, R, len);
    ctx.scene.add(this.g);
    this.R = R;
    this.from = from.clone();
    this.dir = dir.clone().normalize();
    this.len = len;
    this.hit = new Set();
    this.dmg = (big ? 520 : 140) * (0.5 + power * 0.5);
    ctx.fx.flash(from, 0xff80c0, big ? 20 : 8, 0.6, 30);
    ctx.sfx.play('purple_launch', { at: from, vol: 1, rate: big ? 0.8 : 1.2 });
    if (big) ctx.sfx.rumble(1.4, 0.6);
    ctx.game.hitstop = big ? 0.08 : 0.02;
  }

  update(dt) {
    this.t += dt;
    const k = this.t / this.dur;
    const w = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
    const s = Math.max(0.01, w) * (1 + Math.sin(this.t * 50) * 0.04);
    this.core.scale.x = this.core.scale.y = this.R * 0.4 * s;
    this.outer.scale.x = this.outer.scale.y = this.R * s;
    this.core.material.opacity = w;
    this.outer.material.opacity = 0.9 * w;
    if (Math.random() < 0.7) this.ctx.fx.spawn(_v.copy(this.from).addScaledVector(this.dir, Math.random() * this.len).add(_v2.randomDirection().multiplyScalar(this.R)), _v2.copy(this.dir).multiplyScalar(6), LOVE, 0.08, 0.4, 1, 0);
    if (k < 0.7) {
      for (const t of this.ctx.world.targets()) {
        if (this.hit.has(t) || !t.alive) continue;
        const c = t.center(_v);
        const along = _v2.subVectors(c, this.from).dot(this.dir);
        if (along < 0 || along > this.len) continue;
        const off = _v2.subVectors(c, this.from).addScaledVector(this.dir, -along).length();
        if (off < this.R + 0.4 * (t.scale ?? 1)) {
          this.hit.add(t);
          t.damage(this.dmg, { type: 'erase', dir: this.dir.clone(), dirAmt: 6 });
          if (t.alive) t.impulse?.(this.dir.clone().multiplyScalar(14), 6);
          this.ctx.fx.burst(c, 30, LOVE, 5, 0.06, 0.5);
        }
      }
    }
    if (k >= 1) {
      this.ctx.scene.remove(this.g);
      this.core.geometry.dispose();
      this.core.material.dispose();
      this.outer.material.dispose();
      return false;
    }
    return true;
  }
}

// 검기: 칼날에 담은 주력을 터뜨려 날린다
class SwordQi {
  constructor(ctx, from, travel, along) {
    this.ctx = ctx;
    this.travel = travel.clone().normalize();
    this.along = along.clone().addScaledVector(this.travel, -along.dot(this.travel)).normalize();
    this.n = new THREE.Vector3().crossVectors(this.travel, this.along).normalize();
    this.g = makeCrescent(0.8);
    this.g.traverse((o) => o.material && o.material.color?.set(0xd8e4ff));
    this.g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(this.along, this.n, this.travel));
    this.g.position.copy(from);
    this.start = from.clone();
    ctx.scene.add(this.g);
    this.life = 0.6;
    this.hit = new Set();
  }

  update(dt) {
    this.life -= dt;
    const { world, fx, sfx } = this.ctx;
    const steps = 3;
    for (let k = 0; k < steps; k++) {
      this.g.position.addScaledVector(this.travel, (24 * dt) / steps);
      for (const t of world.targets()) {
        if (this.hit.has(t) || !t.alive) continue;
        const c = t.center(_v);
        const rel = _v2.subVectors(c, this.g.position);
        const r = (t.kind === 'dummy' ? 0.45 : t.radius ?? 0.3) * (t.scale ?? 1);
        if (Math.abs(rel.dot(this.n)) < r * 0.8 && Math.abs(rel.dot(this.along)) < 1 + r && Math.abs(rel.dot(this.travel)) < 0.4 + r * 0.5) {
          this.hit.add(t);
          sfx.cut(c);
          fx.burst(c, 16, new THREE.Color(0xd8e4ff), 3, 0.03, 0.35, { dir: this.travel, dirAmt: 1 });
          t.damage(70, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(this.n, c), push: this.travel.clone().multiplyScalar(2) });
          if (t.alive) t.impulse?.(this.travel.clone().multiplyScalar(2));
        }
      }
    }
    const k = Math.max(0, this.life / 0.6);
    this.g.children.forEach((m, j) => (m.material.opacity = [1, 0.75][j] * Math.min(1, k * 3)));
    this.g.scale.set(1 + (1 - k) * 0.5, 1, 1);
    if (this.life <= 0 || this.g.position.y < 0.05) {
      this.ctx.scene.remove(this.g);
      this.g.traverse((o) => o.material?.dispose());
      return false;
    }
    return true;
  }
}

// 영역: 모방한 술식이 깃든 칼이 날아든다
const COPIED = [
  { id: 'kai', label: '解', color: 0xff3040 },
  { id: 'speech', label: '動くな', color: 0xffe080 },
  { id: 'jacob', label: 'ヤコブの梯子', color: 0xfff6d0 },
];
class FlyingSword {
  constructor(ctx, from, target) {
    this.ctx = ctx;
    this.tech = COPIED[Math.floor(Math.random() * COPIED.length)];
    this.g = swordMesh(0xdfe6ee);
    this.g.scale.setScalar(1.4);
    this.glow = makeGlowSprite(new THREE.Color(this.tech.color), 0.9);
    this.glow.position.z = 0.6;
    this.g.add(this.glow);
    this.p = from.clone();
    this.target = target;
    this.t = 0;
    this.g.position.copy(this.p);
    ctx.scene.add(this.g);
  }

  update(dt) {
    this.t += dt;
    const t = this.target;
    if (!t?.alive || this.t > 2) {
      this.ctx.scene.remove(this.g);
      this.glow.material.dispose();
      return false;
    }
    const c = t.center(_v);
    const to = _v2.subVectors(c, this.p);
    const d = to.length();
    to.normalize();
    this.p.addScaledVector(to, Math.min(d, 22 * dt));
    this.g.position.copy(this.p);
    this.g.lookAt(_v3.copy(this.p).add(to));
    if (d < 0.5) {
      const n = _v3.randomDirection();
      n.addScaledVector(to, -n.dot(to)).normalize();
      this.ctx.sfx.cut(c);
      const { fx, world } = this.ctx;
      fx.burst(c, 16, new THREE.Color(this.tech.color), 3, 0.03, 0.4);
      if (this.tech.id === 'speech') {
        // 주언: 멈춰 세우고 벤다
        t.stunUntil = world.time + 2;
        fx.starFlare(c, new THREE.Color(0xffe080), 0.4);
        t.damage(60, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, c), push: to.clone() });
      } else if (this.tech.id === 'jacob') {
        // 야곱의 사다리: 하늘에서 내리꽂는 빛의 기둥 (주령에게 특히 강하다)
        const g = c.clone().setY(0);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 20, 1, true).translate(0, 15, 0), new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        col.position.copy(g);
        fx.addTransient(col, 0.7, (k) => {
          col.material.opacity = 0.8 * (1 - k);
          col.scale.set(1 - k * 0.6, 1, 1 - k * 0.6);
        }, () => col.geometry.dispose());
        fx.flash(c, 0xfff0c0, 12, 0.5, 20);
        world.forEachEnemy(g, 1.4, (e) => e.damage(e.def?.curse ? 160 : 90, { type: 'erase' }));
      } else {
        t.damage(85, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, c), push: to.clone().multiplyScalar(2) });
      }
      this.ctx.ui.manga({ main: this.tech.label, color: '#' + new THREE.Color(this.tech.color).getHexString(), dur: 0.6, side: Math.random() < 0.5 ? 'left' : 'right' });
      this.ctx.scene.remove(this.g);
      this.glow.material.dispose();
      return false;
    }
    return true;
  }
}

// ───────────────── 캐릭터 ─────────────────
export class Yuta extends Caster {
  constructor(ctx) {
    super(ctx, { id: 'yuta', name: '옷코츠 유타', energy: 160 });
    this.domainLabel = '영역전개';
    this.reviveText = '반전술식으로 몸을 고쳤다';
    for (const m of YUTA_MODELS) loadModel(m);
    this.aura = new HandAura(ctx, AURA);
    this.swords = null;
    this.rika = null;
    this.order = null;
    this.list = [];
    this.cds = {};
    this.charge = { on: false, t: 0, s: null };
    this._keys = {};
    this.mouthCover = 0;
    this.mega = new Megaphone(ctx);
    this.shell = new ShellDomain(ctx, {
      radius: 18,
      wall: `vec3 n = normalize(vP);
             float h = n.y * 0.5 + 0.5;
             vec3 sky = mix(vec3(0.95, 0.72, 0.5), vec3(0.35, 0.3, 0.45), smoothstep(0.35, 1.0, h));
             float cl = dfbm(n * 3.0 + vec3(uTime * 0.02, 0.0, 0.0));
             sky = mix(sky, vec3(1.0, 0.9, 0.82), smoothstep(0.55, 0.75, cl) * 0.6);
             col = mix(vec3(0.0), sky, uOpen);`,
      floor: `float g = dfbm(vec3(vW.x, 0.0, vW.z) * 0.6);
              col = mix(vec3(0.28, 0.24, 0.2), vec3(0.45, 0.4, 0.33), g) * smoothstep(1.0, 0.9, length(vP.xz));`,
      lights: { hemi: 0xffe8d0, ground: 0x4a3a30, hemiI: 1.1, sun: 0xffc890, sunI: 2.0, fog: 0xe8b890, fogNear: 14, fogFar: 70, exposure: 1.0 },
      decorate: (g) => {
        // 박살 난 잔해 더미
        const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x4a423a, roughness: 1, flatShading: true }), 70);
        {
          let seed = 11;
          const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
          for (let i = 0; i < 70; i++) {
            const a = r() * Math.PI * 2;
            const d = 3 + Math.sqrt(r()) * 14;
            const s = 0.2 + r() * r() * 1.3;
            rubble.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, s * 0.3, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3(s, s * (0.4 + r() * 0.6), s)));
          }
        }
        rubble.castShadow = rubble.receiveShadow = true;
        g.add(rubble);
        // 땅에 꽂힌 무수한 칼
        const src = swordMesh(0xcfd6de);
        const parts = [];
        src.updateMatrixWorld(true);
        src.traverse((o) => o.isMesh && parts.push(o));
        const N = 260;
        for (const part of parts) {
          const inst = new THREE.InstancedMesh(part.geometry, part.material, N);
          const local = part.matrixWorld.clone();
          let seed = 7;
          const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
          for (let i = 0; i < N; i++) {
            const a = r() * Math.PI * 2;
            const d = 2.5 + Math.sqrt(r()) * 15;
            const m = new THREE.Matrix4().compose(
              new THREE.Vector3(Math.cos(a) * d, 0.75 + r() * 0.2, Math.sin(a) * d),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + (r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5)),
              new THREE.Vector3(1.2, 1.2, 1.2),
            );
            inst.setMatrixAt(i, m.multiply(local));
          }
          inst.castShadow = true;
          g.add(inst);
        }
      },
      tick: (dt, sh) => {
        if (Math.random() < 0.3) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * sh.radius;
          ctx.fx.spawn(_v.set(sh.center.x + Math.cos(a) * r, rnd(0.5, 4), sh.center.z + Math.sin(a) * r), _v2.set(rnd(-0.3, 0.3), rnd(-0.1, 0.2), rnd(-0.3, 0.3)), new THREE.Color(0xfff0e0), 0.03, 2, 0.5, 0);
        }
      },
    });
  }

  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '카타나 · 검기', demo: 'yuta.sword', color: '#e0e8ff', text: '왼쪽 허리춤 칼집에서 비스듬히 나온 손잡이에 손을 대고 주먹을 쥐면 칼이 뽑힌다 → 휘둘러 벤다 (칼끝이 빠를수록 깊게)\n아주 세게 휘두르면 칼날의 주력이 터져 검기가 날아간다 · 손을 펴면 칼이 칼집으로 돌아간다' },
        { head: '리카 현현', demo: 'yuta.rika', color: '#c8a0ff', text: '왼손 주먹(반지)을 입술에 0.5초 → 리카 완전현현, 곁에서 싸운다 (1분)\n왼손 검지로 적을 가리키면 그 적에게 · 다시 하면 돌려보낸다' },
        { head: '순애빔', demo: 'yuta.beam', color: '#ff7ac0', text: '리카 완전현현 중에: 두 손바닥을 마주 보게 모았다가 앞으로 밀기\n리카의 입에서 주력의 고출력 지향 방출 (오래 모을수록 굵다)' },
        { head: '주언 「動くな」', demo: 'yuta.speech', color: '#ffe080', text: '편 손바닥으로 입을 가렸다가 떼며 앞으로 내밀기 → 그 손에 확성기가 쥐어지고 외친다\n바라본 적들이 3초 동안 멈춘다 (특급은 절반)' },
        { head: '반전술식', color: '#9fffb0', text: '가만히 있어도 체력이 천천히 차오른다' },
        { head: '영역전개 「真贋相愛」', demo: 'yuta.domain', color: '#ffd0a0', text: '손날을 펴 세우고 손등을 앞으로, 다른 손은 주먹을 쥐어 턱 앞에 1.2초\n(수인표처럼 편 손 옆에 만 손을 붙여도 OK)\n모방한 술식(해 · 주언 · 야곱의 사다리)이 깃든 칼이 날아든다 · 메뉴에서도 발동' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴 · R 더미 소환' },
        { head: '기술', color: '#e0e8ff', text: 'E 누르고 있기: 칼 뽑기(마우스를 휙 돌려 베기) · F 리카 · 1 순애빔(누르고 떼기) · 2 주언 「動くな」 · Q 1.2초 영역전개' },
      ];
    }
    return [
      { head: '칼', color: '#e0e8ff', text: '오른쪽 그립: 칼을 쥐고 휘두르기' },
      { head: '리카 · 주언', color: '#c8a0ff', text: 'X: 리카 현현/돌려보내기 · 왼쪽 트리거: 리카에게 바라본 적을 공격시키기 · A: 주언 「動くな」' },
      { head: '순애빔 · 영역', color: '#ff7ac0', text: '두 트리거를 쥐고 손을 모았다가 밀기: 순애빔 · 양쪽 스틱 1.2초: 영역전개' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const d = this.domain;
    const dom = this.shell.state === 'active' ? `전개 중 ${Math.max(0, Math.ceil(d.duration - d.t))}s` : d.cd > 0 ? `재사용 ${Math.ceil(d.cd)}s` : '준비';
    return [
      { label: '주력', bar: this.energy / this.maxEnergy, color: '#c8a0ff' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#9fffb0' },
      { label: '리카', text: this.rika ? `현현 ${Math.ceil(this.rika.duration)}s` : (this.cds.rika ?? 0) > 0 ? `재사용 ${Math.ceil(this.cds.rika)}s` : '준비' },
      { label: '영역', text: dom },
      { label: '처치', text: `${w.kills}` },
    ];
  }

  update(dt) {
    const { input: inp, ui, world } = this.ctx;
    this.tickCommon(dt, 10);
    for (const k in this.cds) this.cds[k] -= dt;
    // 반전술식
    const P = world.player;
    if (P.hp > 0 && P.hp < P.maxHp && world.time - (P.lastHit ?? -10) > 1.5) P.hp = Math.min(P.maxHp, P.hp + 5 * dt);
    if (!this.swords && (getModel('wpn_yuta_sword') || this.time > 4)) {
      this.swords = { left: new Katana(this.ctx, 'left'), right: new Katana(this.ctx, 'right') };
      this.sheath = new Sheath(this.ctx);
    }
    this.sheath?.update(dt, !!this.drawnBy);
    if (!this.swords) {
      // 칼 모델을 받는 중
    } else if (!ui.menuOpen) {
      for (const h of [inp.left, inp.right]) this._hand(h, dt);
      this._twoHands(dt);
      if (inp.mode === 'desktop') this._desktop(dt);
    } else for (const s of ['left', 'right']) this.swords[s].update(dt, inp[s], false);
    if (this.rika && !this.rika.update(dt)) {
      this.rika = null;
      this.cds.rika = 6;
    }
    this.list = this.list.filter((o) => o.update(dt));
    this.mega.update(dt);
    if (this.runDomain(this.shell, dt)) this._domainTick(dt);
    this.aura.update(dt);
  }

  _hand(h, dt) {
    const inp = this.ctx.input;
    const S = this.swords[h.side];
    const ctrl = h.source === 'controller';
    const desk = h.source === 'desktop';
    if (!h.active || h.uiBlock) {
      S.update(dt, h, false);
      return;
    }
    const nearFace = h.palm.distanceTo(inp.head) < 0.2;
    // 칼: 허리춤 칼집의 손잡이를 쥐면 뽑힌다 → 쥔 동안 손에. 손을 펴면 칼집으로 돌아간다 (데스크톱은 E)
    const fistNow = ctrl ? h.btn.grip : h.gesture === 'fist';
    if (!desk && this.sheath) {
      const grabAt = _v3.copy(h.palm);
      if (!this.drawnBy && fistNow && h.palm.distanceTo(this.sheath.hilt) < 0.14 && (h.gestureTime < 0.4 || ctrl)) {
        this.drawnBy = h.side;
        this._sheatheT = 0;
        this.ctx.sfx.play('click', { at: grabAt, vol: 0.7, rate: 0.55 });
        this.ctx.sfx.whoosh(grabAt, 0.6, 1.6);
        h.pulse?.(0.6, 60);
        S.k = 1; // 칼집에서 그대로 뽑아 든다 (커지며 나타나지 않게)
      }
      if (this.drawnBy === h.side && !fistNow) {
        this._sheatheT = (this._sheatheT ?? 0) + dt;
        if (this._sheatheT > 0.15) {
          this.drawnBy = null;
          S.k = 0;
          this.ctx.sfx.play('click', { at: this.sheath.hilt, vol: 0.6, rate: 0.7 });
        }
      } else if (this.drawnBy === h.side) this._sheatheT = 0;
    }
    let want = desk ? h.side === 'right' && inp.keyDown('KeyE') : this.drawnBy === h.side && fistNow && !(h.side === 'left' && nearFace);
    if (this.charge.on || (this.mega.t > 0 && this.mega.side === h.side)) want = false;
    const speed = S.update(dt, desk ? { ...h, source: 'controller', dir: _v.copy(inp.headDir).add(_v2.set(0, 0.2, 0)).normalize() } : h, want);
    if (want && speed > 2.6) this._slash(S, speed);
    // 아주 세게 휘두르면 검기
    if (want && speed > 7 && S.k > 0.9 && (this.cds[h.side + 'qi'] ?? 0) <= 0 && this.energy > 12) {
      this.cds[h.side + 'qi'] = 0.45;
      this.energy -= 12;
      const travel = _v.copy(inp.headDir).addScaledVector(S.dir, 0.3).normalize();
      this.list.push(new SwordQi(this.ctx, _v2.copy(S.tip).addScaledVector(travel, 0.2), travel, S.tipVel));
      this.ctx.sfx.whoosh(S.tip, 0.8, 1.3);
    }
    // 리카: 왼손 주먹을 입에
    const mouth = _v3.copy(inp.head).add(_v.set(0, -0.09, 0)).addScaledVector(inp.headDir, 0.06);
    if (h.side === 'left') {
      const kiss = ctrl ? h.pressed('a') : h.source === 'hand' && h.gesture === 'fist' && h.palm.distanceTo(mouth) < 0.13;
      if (ctrl ? kiss : this.held('rika', kiss, dt, 0.5)) this.toggleRika();
      // 가리키면 리카에게 지시
      const point = ctrl ? h.btn.trigger : h.gesture === 'point' && h.gestureTime > 0.3 && !nearFace;
      if (point && this.rika && (this.cds.order ?? 0) <= 0) {
        const t = this.gazeTarget(h.palm, h.dir, 0.25, 25, false) ?? (ctrl ? this.gazeTarget(undefined, undefined, 0.3, 25, false) : null);
        if (t) {
          this.cds.order = 1;
          this.order = t;
          if (this.rika.mode === 'idle') this.rika.cd = 0;
          this.ctx.fx.starFlare(t.center(_v), new THREE.Color(0xc8a0ff), 0.4);
        }
      }
    }
    // 주언: 편 손바닥으로 입을 가렸다가 떼며 앞으로
    if (!ctrl && h.source === 'hand') {
      const toFace = _v.subVectors(inp.head, h.palm).normalize();
      const cover = (h.gesture === 'open' || h.gesture === 'none') && h.palm.distanceTo(mouth) < 0.12 && h.palmNormal.dot(toFace) > 0.5;
      if (cover) this.mouthCover = Math.min(1, this.mouthCover + dt * 3);
      else if (this.mouthCover > 0.6 && h.palm.distanceTo(mouth) > 0.18 && h.vel.dot(inp.headDir) > 0.8) {
        this.mouthCover = 0;
        this.speech(h.side);
      } else if (!cover && h.palm.distanceTo(mouth) > 0.3) this.mouthCover = Math.max(0, this.mouthCover - dt * 2);
    } else if (ctrl && h.side === 'right' && h.pressed('a')) this.speech('right');
  }

  _slash(S, speed) {
    const { world, fx, sfx } = this.ctx;
    const dir = S.dir;
    for (const t of world.targets()) {
      if (!t.alive || t.dying) continue;
      const last = S.hits.get(t) ?? -10;
      if (this.time - last < 0.4) continue;
      const c = t.center(_v);
      // 칼날을 몇 점으로 나눠 몸(사람은 발~머리의 세로 기둥, 소품은 구)과의 거리
      const dummy = t.kind === 'dummy';
      const s = t.scale ?? 1;
      const r = (dummy ? 0.22 * s : t.radius ?? 0.3) + 0.04;
      const g0 = dummy ? (t.root?.position.y ?? 0) + 0.25 * s : 0;
      const g1 = dummy ? (t.root?.position.y ?? 0) + 1.75 * s : 0;
      let best = Infinity;
      const near = _v3;
      for (let i = 0; i <= 6; i++) {
        const p = _v2.lerpVectors(S.base, S.tip, i / 6);
        const ax = dummy ? _v4.set(c.x, THREE.MathUtils.clamp(p.y, g0, g1), c.z) : c;
        const dd = p.distanceTo(ax);
        if (dd < best) {
          best = dd;
          near.copy(p);
        }
      }
      if (best > r) continue;
      if (dummy) c.y = THREE.MathUtils.clamp(near.y, g0 + 0.2 * s, g1 - 0.1 * s); // 벤 높이로 자른다
      S.hits.set(t, this.time);
      const n = _v2.crossVectors(dir, S.tipVel).normalize();
      if (n.lengthSq() < 0.5) n.set(0, 1, 0);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, c);
      const dmg = 30 + speed * 9;
      const push = S.tipVel.clone().normalize().multiplyScalar(1.5);
      fx.burst(near, 14, new THREE.Color(0xe0e8ff), 2.5, 0.03, 0.3, { dir: push, dirAmt: 1 });
      sfx.cut(near);
      t.damage(dmg, { type: 'slash', plane, push });
      if (t.alive) t.impulse?.(push.multiplyScalar(1.5), 2);
      this.ctx.input[S.side]?.pulse?.(0.8, 60);
      this.ctx.game.hitstop = Math.max(this.ctx.game.hitstop, 0.03);
    }
    // 잘린 조각도 다시
    for (const pc of [...world.slicer.pieces]) {
      if (S.hits.has(pc) || pc.pivot.position.distanceTo(S.tip) > 0.5) continue;
      S.hits.set(pc, this.time);
      if (pc.localPlanes.length < 3) world.slicer.sliceAgain(pc, new THREE.Plane().setFromNormalAndCoplanarPoint(_v.crossVectors(dir, S.tipVel).normalize(), pc.pivot.position), { sep: 0.6, radius: pc.radius * 0.7 });
    }
    if ((this.cds.swish ?? 0) <= 0) {
      this.cds.swish = 0.25;
      sfx.slash(S.tip, 1.2);
    }
  }

  toggleRika() {
    if (this.rika) {
      this.rika.dismiss();
      return;
    }
    if ((this.cds.rika ?? 0) > 0) {
      this.ctx.ui.callout(`리카 재사용 ${Math.ceil(this.cds.rika)}s`);
      return;
    }
    if (!getModel('curse_rika')) {
      this.ctx.ui.callout('리카 모델을 불러오는 중…');
      return;
    }
    if (!this.spend(40)) return;
    this.rika = new Rika(this);
    this.ctx.ui.manga({ top: '完全顕現', main: '里香', ruby: 'りか', color: '#c8a0ff', big: true });
  }

  speech(side = 'right') {
    if ((this.cds.speech ?? 0) > 0 || !cool(this.ctx, 'speech', 6, '주언') || !this.spend(20)) return;
    this.cds.speech = 4;
    const { input: inp, world, ui, fx, sfx } = this.ctx;
    ui.manga({ main: '動くな', ruby: 'うごくな', color: '#ffe080' });
    sfx.play('chant', { vol: 0.9, rate: 0.8 });
    // 이누마키의 주언 — 확성기를 입에 대고 외친다
    if (this.mega.shout(side, 1.3)) this.mega.rings();
    fx.shockwave(_v.copy(inp.head).setY(0.05), 0xffe080, 6, 0.5, { opacity: 0.4 });
    let n = 0;
    for (const t of world.enemies()) {
      if (!t.alive) continue;
      const rel = _v.subVectors(t.center(_v2), inp.head);
      const d = rel.length();
      if (d > 18 || rel.normalize().dot(inp.headDir) < 0.6) continue;
      t.stunUntil = world.time + 3 * (t.def?.grade === '특급' ? 0.5 : 1);
      t.vel?.set?.(0, Math.min(0, t.vel.y), 0);
      fx.starFlare(t.headPos ? t.headPos(_v) : t.center(_v), new THREE.Color(0xffe080), 0.35);
      n++;
    }
    if (!n) ui.callout('바라본 곳에 적이 없다');
  }

  _twoHands(dt) {
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    const both = L.active && R.active && !L.uiBlock && !R.uiBlock;
    const hands = both && L.source === 'hand' && R.source === 'hand';
    // 영역: 한 손은 세우고, 다른 손은 말아 옆에
    let dsign = false;
    if (inp.mode === 'desktop') dsign = inp.keyDown('KeyQ');
    else if (hands && this.ctx.settings.domainGesture) {
      const near = L.palm.distanceTo(R.palm) < 0.13;
      const flatUp = (h) => (h.gesture === 'open' || h.gesture === 'none') && h.fingersDir.y > 0.6 && Math.abs(h.palmNormal.y) < 0.5;
      const curled = (h) => h.gesture === 'fist' || h.gesture === 'pinch' || h.gesture === 'none';
      // 원작: 손날을 펴 손등을 앞으로, 다른 손은 주먹을 쥐어 턱 앞에
      const fwd = this.flatFwd(_v3);
      const chin = _v.copy(inp.head).add(_v2.set(0, -0.12, 0)).addScaledVector(fwd, 0.1);
      const knife = (h) => (h.gesture === 'open' || h.gesture === 'none') && h.fingersDir.y > 0.55 && h.palmNormal.dot(fwd) < -0.3 && h.palm.distanceTo(inp.head) < 0.55;
      const chinFist = (h) => h.gesture === 'fist' && h.palm.distanceTo(chin) < 0.14;
      const wiki = (knife(L) && chinFist(R)) || (knife(R) && chinFist(L));
      dsign = (wiki || (near && ((flatUp(L) && curled(R)) || (flatUp(R) && curled(L))))) && L.speed < 0.6 && R.speed < 0.6;
    } else if (both && L.source === 'controller') dsign = L.btn.stick && R.btn.stick;
    if (this.ctx.settings.domainGesture && inp.ctrlMudra === 'yuta.domain') dsign = true;
    if (this.shell.state === 'idle' && this.held('domain', dsign, dt, 1.2)) this.castDomain();
    // 순애빔: 두 손바닥 마주 보기 → 밀기
    const C = this.charge;
    let cupped = false;
    if (hands) {
      const lr = _v.subVectors(R.palm, L.palm);
      const d = lr.length();
      lr.normalize();
      cupped = d > 0.08 && d < 0.4 && L.palmNormal.dot(lr) > 0.45 && R.palmNormal.dot(lr) < -0.45 && L.gesture !== 'fist' && R.gesture !== 'fist' && !dsign;
    } else if (both && L.source === 'controller') cupped = L.btn.trigger && R.btn.trigger && L.palm.distanceTo(R.palm) < 0.4;
    if (inp.mode === 'desktop' && inp.keyDown('Digit1')) cupped = true;
    const mid = inp.mode === 'desktop' ? _v2.copy(inp.head).addScaledVector(inp.headDir, 0.5).add(_v.set(0, -0.15, 0)) : _v2.addVectors(L.palm, R.palm).multiplyScalar(0.5);
    const rikaOn = !!this.rika && this.rika.mode !== 'leave';
    if (cupped && !rikaOn) {
      if ((this.cds.beamHint ?? 0) <= 0) {
        this.cds.beamHint = 3;
        this.ctx.ui.callout('순애빔은 리카 완전현현 중에만 — 왼손 주먹(반지)을 입술에', { color: '#ff9ad0' });
      }
      cupped = false;
    }
    if (cupped && !C.on && this.energy > 20) {
      C.on = true;
      C.t = 0;
      C.s = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xffc0e0, toneMapped: false }));
      C.s.add(makeGlowSprite(LOVE, 4));
      this.ctx.scene.add(C.s);
      this.ctx.sfx.play('charge_rise', { at: mid, vol: 0.6, rate: 1.1 });
    }
    if (C.on) {
      C.t += dt;
      const power = Math.min(1, C.t / 2);
      const big = rikaOn;
      if (!big) C.lost = 1;
      const at = big ? this.rika.mouth(_v3) : mid;
      C.s.position.copy(at);
      C.s.scale.setScalar((big ? 0.25 + power * 0.5 : 0.04 + power * 0.08) * (1 + Math.sin(this.time * 30) * 0.05));
      if (big) this.rika.face(_v.copy(inp.head).addScaledVector(inp.headDir, 12), dt, 6);
      this.aura.set('left', 0.4 + power * 0.6);
      this.aura.set('right', 0.4 + power * 0.6);
      const push = (L.vel.dot(inp.headDir) + R.vel.dot(inp.headDir)) / 2;
      const deskRelease = inp.mode === 'desktop' && L.source !== 'hand' && !inp.keyDown('Digit1');
      if ((push > 1.4 && C.t > 0.4) || deskRelease) {
        C.on = false;
        this.ctx.scene.remove(C.s);
        C.s = null;
        const cost = big ? 50 : 20;
        if (cool(this.ctx, big ? 'beamBig' : 'beam', big ? 15 : 3, big ? '純愛砲' : '순애빔') && this.spend(cost)) {
          const from = at.clone();
          const aimT = this.gazeTarget(undefined, undefined, 0.3, 40, false);
          const dir = aimT ? aimT.center(new THREE.Vector3()).sub(from).normalize() : inp.headDir.clone();
          this.list.push(new LoveBeam(this.ctx, from, dir, power, big));
          if (big) this.ctx.ui.manga({ main: '純愛砲', ruby: 'じゅんあいほう', color: '#ff7ac0', big: true });
        }
      } else if (!cupped && C.t > 0.2) {
        C.lost = (C.lost ?? 0) + dt;
        if (C.lost > 0.3) {
          C.on = false;
          this.ctx.scene.remove(C.s);
          C.s = null;
        }
      } else C.lost = 0;
    }
  }

  castDomain() {
    if (this.openDomain(this.shell, { cost: 60, name: '真贋相愛', ruby: 'しんがんそうあい', color: '#ffd0a0', duration: 18 })) this._sure = 0.6;
  }

  _domainTick(dt) {
    this._sure -= dt;
    if (this._sure > 0) return;
    this._sure = 0.7;
    const list = this.inDomain(this.shell).filter((t) => t.kind !== 'prop');
    if (!list.length) return;
    const t = list[Math.floor(Math.random() * list.length)];
    const a = Math.random() * Math.PI * 2;
    const from = t.center(new THREE.Vector3()).add(_v.set(Math.cos(a) * 4, 0.3, Math.sin(a) * 4));
    this.list.push(new FlyingSword(this.ctx, from, t));
    this.ctx.sfx.whoosh(from, 0.5, 1.4);
  }

  cancelDomain() {
    this.closeDomain(this.shell);
  }

  _desktop() {
    const inp = this.ctx.input;
    const press = (code) => {
      const d = inp.keyDown(code);
      const p = d && !this._keys[code];
      this._keys[code] = d;
      return p;
    };
    if (press('KeyF')) this.toggleRika();
    if (press('Digit2')) this.speech();
  }

  dispose() {
    this.cancelDomain();
    this.shell.dispose?.();
    this.rika?.dispose();
    this.mega.dispose();
    if (this.swords) for (const s of ['left', 'right']) this.swords[s].dispose();
    this.sheath?.dispose();
    if (this.charge.s) this.ctx.scene.remove(this.charge.s);
    for (const o of this.list) o.g && this.ctx.scene.remove(o.g);
    this.aura.dispose();
  }
}
