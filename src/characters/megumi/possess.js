// 술사가 마허라가 된다
//  조복 전의 마허라에게 술사가 쓰러지면, 마허라가 술사를 삼켜 술사 자신이 마허라가 된다 (시점이 높아지고 몸이 강해진다)
//  · 머리 위의 법진이 받는 공격에 적응한다 (한 칸 돌 때마다 완전 회복) — 쓰러진 마허라의 적응을 그대로 잇는다
//  · 두 손이 마허라의 팔로 바뀐다 (손가락은 내 손가락을 그대로 따른다) — 오른팔엔 퇴마의 검이 늘 붙어 있다 (정(正)의 주력: 저주에 더 강하다)
//  · 주먹은 거인의 주먹
//  · 두 주먹을 가슴 앞에서 1초 맞대면 술사로 돌아온다 (또는 다시 쓰러지면)
import * as THREE from 'three';
import { MahoragaWheel, Adaptation, spaceCut } from './shikigami.js';
import { HandAura } from '../../core/handAura.js';
import { makeShiki } from './models.js';
import { FingerRig } from '../../core/enemies.js';
import { bodyHit, addWound } from '../../core/stab.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const LIFT = 1.1; // 눈높이를 이만큼 올린다 (거인)
const GOLD = { glow: 0xffe6a0, hot: 0xffffff, inner: 0x3a2e10, line: 0x0a0804 };

// ───────────────── 마허라의 팔 (내 손 대신) ─────────────────
const HAND_LEN = 0.3; // 손목~가운뎃손가락 끝 (사람 손의 1.5배쯤)
const FINGERS = [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ...['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].map((f) => [`${f}-metacarpal`, `${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`]),
];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/** 스킨 메시에서 keep 뼈에 주로 붙은 삼각형만 남긴 새 인덱스 (없으면 null) */
function filterGeo(geo, skeleton, keep) {
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  if (!si || !sw) return null;
  const n = si.count;
  const ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bw = -1;
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(i, c);
      if (w > bw) {
        bw = w;
        best = si.getComponent(i, c);
      }
    }
    ok[i] = keep.has(skeleton.bones[best]) ? 1 : 0;
  }
  const src = geo.index ? geo.index.array : Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (let t = 0; t < src.length; t += 3) if (ok[src[t]] && ok[src[t + 1]] && ok[src[t + 2]]) out.push(src[t], src[t + 1], src[t + 2]);
  if (!out.length) return null;
  const g = geo.clone();
  g.setIndex(out);
  return g;
}

class MahoragaArm {
  constructor(ctx, side) {
    this.ctx = ctx;
    this.side = side;
    const S = side === 'left' ? 'L' : 'R';
    this.M = makeShiki('mahoraga', 5.4, { outline: 0.012, skip: ['teeth', 'mouth'] });
    if (!this.M) return;
    const R = this.M.rig;
    const keep = new Set();
    R.get(`${S}_elbow`)?.traverse((b) => b.isBone && keep.add(b));
    const cache = new Map();
    this.geos = [];
    this.M.root.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.isSkinnedMesh) {
        o.visible = false;
        return;
      }
      let g = cache.get(o.geometry);
      if (g === undefined) {
        g = filterGeo(o.geometry, o.skeleton, keep);
        cache.set(o.geometry, g);
        if (g) this.geos.push(g);
      }
      if (!g) o.visible = false;
      else o.geometry = g;
      o.frustumCulled = false;
      o.castShadow = true;
      // 눈앞(카메라 35cm 안)으로 지나가는 팔 · 검은 그리지 않는다 — 휘두를 때 한쪽 눈 화면이 팔 속에 묻혀 까매지지 않게
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.userData.nearCut) continue;
        m.userData.nearCut = true;
        const prev = m.onBeforeCompile;
        m.onBeforeCompile = (sh, r) => {
          prev?.call(m, sh, r);
          if (!sh.fragmentShader.includes('vViewPosition')) return;
          sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() {\n  if (length(vViewPosition) < 0.35) discard;');
        };
        const key = m.customProgramCacheKey?.bind(m);
        m.customProgramCacheKey = () => (key ? key() : '') + '|nearCut';
        m.needsUpdate = true;
      }
    });
    // 바인드 자세에서 손의 틀 (뿌리 공간): 손목 위치 · 손가락 방향 · 손바닥 방향
    const root = this.M.root;
    root.updateMatrixWorld(true);
    const P = (n) => root.worldToLocal(R.pos(n, new THREE.Vector3()));
    this.wrist = P(`${S}_hand`);
    const mid = P(`${S}_middlefinger_A`);
    const idx = P(`${S}_indexfinger_A`);
    const pin = P(`${S}_littlefinger_A`);
    const tip = P(`${S}_middlefinger_C_end`) ?? mid;
    const f = mid.clone().sub(this.wrist).normalize();
    const a = idx.clone().sub(this.wrist);
    const b = pin.clone().sub(this.wrist);
    const nrm = side === 'left' ? new THREE.Vector3().crossVectors(b, a) : new THREE.Vector3().crossVectors(a, b);
    nrm.addScaledVector(f, -nrm.dot(f)).normalize();
    const sd = new THREE.Vector3().crossVectors(f, nrm);
    this.bindQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(sd, f, nrm)).invert();
    this.scale = HAND_LEN / Math.max(0.01, tip.distanceTo(this.wrist));
    root.scale.setScalar(this.scale);
    root.visible = false;
    ctx.scene.add(root);
    this.fingers = new FingerRig({ mapId: 'jjk', clone: this.M.model, bones: R.bones });
    this.curls = [0, 0, 0, 0, 0];
  }

  /** 내 손을 따라간다: 손목 자리 · 손가락 방향 · 손바닥 방향을 맞추고, 손가락 굽힘을 옮긴다 */
  update(dt, h) {
    if (!this.M) return;
    const root = this.M.root;
    root.visible = h.active;
    if (!h.active) return;
    const f = _a.copy(h.source === 'hand' ? h.fingersDir : h.dir).normalize();
    const n = _b.copy(h.palmNormal ?? _b.set(0, -1, 0));
    n.addScaledVector(f, -n.dot(f)).normalize();
    const sd = _v3.crossVectors(f, n);
    _q.setFromRotationMatrix(_m.makeBasis(sd, f, n));
    root.quaternion.copy(_q).multiply(this.bindQ);
    // 손목
    const J = h.joints;
    if (J?.wrist) _v.copy(J.wrist).applyMatrix4(this.ctx.rig.matrixWorld);
    else _v.copy(h.palm).addScaledVector(f, -0.07);
    root.position.copy(_v).sub(_v2.copy(this.wrist).multiplyScalar(this.scale).applyQuaternion(root.quaternion));
    root.updateMatrixWorld(true);
    // 손가락: 마디마다 꺾인 각도를 더해 굽힘으로
    const want = [0, 0, 0, 0, 0];
    if (J && J['index-finger-tip']) {
      FINGERS.forEach((names, i) => {
        let ang = 0;
        for (let k = 0; k + 2 < names.length; k++) {
          _a.subVectors(J[names[k + 1]], J[names[k]]).normalize();
          _b.subVectors(J[names[k + 2]], J[names[k + 1]]).normalize();
          ang += Math.acos(THREE.MathUtils.clamp(_a.dot(_b), -1, 1));
        }
        want[i] = THREE.MathUtils.clamp(ang / (i === 0 ? 1.4 : 2.8), 0, 1);
      });
    } else {
      // 컨트롤러: 트리거 = 검지, 그립 = 나머지, A/X = 엄지
      const g = h.gripValue ?? (h.btn?.grip ? 1 : 0);
      want[1] = h.triggerValue ?? (h.btn?.trigger ? 1 : 0);
      want[2] = want[3] = want[4] = g;
      want[0] = h.btn?.a ? 1 : g * 0.6;
    }
    for (let i = 0; i < 5; i++) this.curls[i] += (want[i] - this.curls[i]) * Math.min(1, dt * 20);
    this.fingers.applyEach(this.side === 'left' ? 'L' : 'R', this.curls);
  }

  /** 오른팔의 퇴마의 검: 칼자루 쪽 · 칼끝 (월드) */
  blade(base, tip) {
    const R = this.M?.rig;
    const bone = R?.bones.R_sword;
    if (!bone) return false;
    bone.updateWorldMatrix(true, false);
    // 칼끝: 뼈 끝(R_sword_end)은 칼자루에서 3cm 남짓이라 칼자루만 판정되던 문제 →
    //  검 뼈에 붙은 정점 중 가장 먼 점을 뼈 기준으로 한 번 재 둔다
    if (!this._tipLocal) {
      const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
      const v = new THREE.Vector3();
      let best = 0;
      for (const o of this.M.meshes ?? []) {
        if (!o.isSkinnedMesh) continue;
        const bi = o.skeleton.bones.indexOf(bone);
        if (bi < 0) continue;
        o.skeleton.update();
        const si = o.geometry.attributes.skinIndex;
        const sw = o.geometry.attributes.skinWeight;
        for (let i = 0; i < si.count; i++) {
          let w = 0;
          for (let j = 0; j < 4; j++) if (si.getComponent(i, j) === bi) w += sw.getComponent(i, j);
          if (w < 0.5) continue;
          v.fromBufferAttribute(o.geometry.attributes.position, i);
          o.applyBoneTransform(i, v);
          v.applyMatrix4(o.matrixWorld).applyMatrix4(inv);
          if (v.length() > best) {
            best = v.length();
            this._tipLocal = v.clone();
          }
        }
      }
      if (!this._tipLocal) {
        const e = R.bones.R_sword_end;
        this._tipLocal = e ? e.position.clone().normalize().multiplyScalar(1.2 / bone.getWorldScale(v).x) : new THREE.Vector3(0, 1, 0);
      }
    }
    bone.getWorldPosition(base);
    tip.copy(this._tipLocal).applyMatrix4(bone.matrixWorld);
    return true;
  }

  dispose() {
    if (!this.M) return;
    this.ctx.scene.remove(this.M.root);
    for (const g of this.geos) g.dispose();
  }
}

export class MahoragaSelf {
  constructor(megumi, from) {
    this.m = megumi;
    this.ctx = megumi.ctx;
    const { world, input: inp, ui, sfx, fx, rig } = this.ctx;
    this.baseY = rig.position.y;
    this.lift = 0;
    // 법진: 쓰러진 마허라의 적응을 잇는다
    this.wheel = new MahoragaWheel(megumi);
    if (from?.ad) this.wheel.ad = new Adaptation(from.ad.snapshot());
    this.wheel.growth = from?.growth ?? 1; // 참격 ②로 키운 몸집도 잇는다
    this.turns = this.wheel.ad.turns;
    // 두 손이 마허라의 팔이 된다 (내 손 모델은 숨긴다)
    this.arms = { left: new MahoragaArm(this.ctx, 'left'), right: new MahoragaArm(this.ctx, 'right') };
    this.ctx.input.hideHands = true;
    this.base = new THREE.Vector3();
    this.tip = new THREE.Vector3();
    this.prevTip = new THREE.Vector3();
    this.hasPrev = false;
    this.hitT = new Map();
    this.aura = new HandAura(this.ctx, GOLD);
    this.exitT = 0;
    // 몸: 체력이 늘고, 받는 피해는 법진이 적응한 만큼 준다
    this.savedHp = world.player.maxHp;
    world.player.maxHp = world.player.hp = Math.max(300, this.savedHp * 3);
    this.savedMul = world.playerDamageMul;
    world.playerDamageMul = (type, info) => this.wheel.onPlayerHit(type, info);
    fx.flash(inp.head, new THREE.Color(0xffe0a0), 6, 0.5, 10);
    sfx.rumble(2, 0.7);
    sfx.play('domain_open', { vol: 0.8, rate: 0.6 });
    ui.manga({ top: '八握剣 異戒神将', main: '魔虚羅', ruby: 'まこら', color: '#ffd28a', big: true });
    ui.callout('술사가 쓰러져 마허라가 되었다 — 두 손이 마허라의 팔, 오른팔엔 퇴마의 검 · 두 주먹을 가슴 앞에 1초 맞대면 돌아온다', { color: '#ffe0a0', dur: 4 });
  }

  update(dt) {
    const { input: inp, world, rig, fx, sfx, ui } = this.ctx;
    // 시점이 서서히 높아진다
    this.lift = Math.min(LIFT * (this.wheel.growth ?? 1), this.lift + dt * 0.8);
    rig.position.y = this.baseY + this.lift;
    this.wheel.update(dt);
    // 법진이 한 칸 돌면(적응) 몸이 완전히 회복된다
    if (this.wheel.ad.turns !== this.turns) {
      this.turns = this.wheel.ad.turns;
      world.player.hp = world.player.maxHp;
      fx.burst(inp.head.clone().add(_v.set(0, -0.6, 0)), 20, new THREE.Color(0xffffff), 2, 0.05, 0.6, { up: 1 });
    }
    // 돌아가기: 두 주먹을 가슴 앞에서 맞댄다
    const L = inp.left;
    const R = inp.right;
    const fist = (h) => h.active && (h.source === 'controller' ? h.btn.grip : h.gesture === 'fist');
    const chest = _v.addVectors(L.palm, R.palm).multiplyScalar(0.5);
    const drop = inp.head.y - chest.y;
    if (fist(L) && fist(R) && L.palm.distanceTo(R.palm) < 0.16 && drop > 0.12 && drop < 0.55 && !ui.menuOpen) {
      this.exitT += dt;
      this.aura.set('left', this.exitT);
      this.aura.set('right', this.exitT);
      if (this.exitT > 1) return this.exit('back');
    } else this.exitT = Math.max(0, this.exitT - dt * 2);
    // 마허라의 팔: 내 손을 따라가고, 오른팔의 퇴마의 검은 늘 붙어 있다
    this.arms.left.update(dt, L);
    this.arms.right.update(dt, R);
    if (R.active && this.arms.right.blade(this.base, this.tip)) {
      // 칼끝 속도는 몸(리그) 기준: 이동 · 회전만으로는 휘두른 것이 아니다
      const tipL = _v2.copy(this.tip);
      rig.worldToLocal(tipL);
      const speed = this.hasPrev ? tipL.distanceTo(this.prevTip) / Math.max(dt, 1e-3) : 0;
      this.swing = (this.swing ?? new THREE.Vector3()).subVectors(tipL, this.prevTip).transformDirection(rig.matrixWorld);
      this.prevTip.copy(tipL);
      this.hasPrev = true;
      // 무하한에 적응(②)하면: 크게 휘두르면 공간째 베는 참격이 날아간다 (무하한을 무시한다)
      if (speed > 9 && this._infStage() >= 2 && (this.cutCd ?? 0) <= world.time) this._spaceSlash();
      if (this.exitT <= 0) this.aura.set('right', 0.2 + Math.min(0.5, speed * 0.05));
      this._impale(dt, speed); // 칼끝으로 찌르면 꽂힌다 (꿴 채 휘두르고, 홱 빼면 빠진다)
      this._cut(this.base, this.tip, speed); // 닿기만 해도 (세기는 칼끝 속도)
      if (speed > 4 && Math.random() < 0.6) fx.spawn(this.tip, _v.randomDirection().multiplyScalar(0.4), new THREE.Color(0xfff0c0), 0.05, 0.3, 2, 0);
    } else this.hasPrev = false;
    if (this.exitT <= 0) this.aura.set('left', fist(L) ? 0.3 : 0);
    this.aura.update(dt);
    void sfx;
    return true;
  }

  /**
   * 퇴마의 검으로 꽂기: 칼끝이 칼날 방향으로 빠르게(찌르기) 몸에 들어가면 꽂혀 적이 칼에 꿰인다.
   *  고죠(무하한)는 법진이 무하한에 다 적응(②)했을 때만. 꿴 채로 칼을 움직이면 적이 따라오고,
   *  칼자루 쪽으로 홱 당기면 빠지고, 아주 세게 휘두르면 내동댕이쳐진다
   */
  _impale(dt, speed) {
    const { world, fx, sfx, ui } = this.ctx;
    const axis = _v.subVectors(this.tip, this.base).normalize();
    const along0 = this.swing && dt > 0 ? this.swing.dot(axis) / dt : 0;
    // 내지르는 속도는 잠깐 동안 부드럽게 (찌르는 동작 한 번 내내 이어지게)
    this._along = THREE.MathUtils.lerp(this._along ?? 0, along0, 1 - Math.exp(-dt * 10));
    const along = Math.max(along0, this._along);
    // 칼날 방향으로 내지르는 중이면 베지 않고 찌른다 (_cut 이 건너뛴다)
    this._thrust = along > 2 && along > 0.6 * speed;
    const I = this.impaled;
    if (I) {
      const d = I.t;
      if (!d.alive || !d.holders?.has(I.by)) {
        this.impaled = null;
        return;
      }
      // 칼끝에서 조금 안쪽(칼날 위)에 꿰여 있다
      d.holdAt(_v2.copy(this.tip).addScaledVector(axis, -0.35 * (d.scale ?? 1)), I.by);
      if (along < -3 || speed > 11) {
        const fling = speed > 11 ? this.swing.clone().normalize().multiplyScalar(Math.min(14, speed)) : new THREE.Vector3();
        d.release(fling, I.by);
        this.impaled = null;
        if (I.wound) {
          I.wound.getWorldPosition(_v2);
          fx.burst(_v2, 34, new THREE.Color(0x5a0508), 3.4, 0.05, 0.7, { dark: true, grav: 9 });
          world.bleed(I.wound, 5, 22);
        }
        sfx.cut?.(this.tip);
      }
      return;
    }
    if (!this._thrust) return;
    for (const d of world.dummies) {
      if (!d.alive || d.dying || d.heldBy) continue;
      if (d.center(_v2).distanceTo(this.tip) > 2 * (d.scale ?? 1)) continue;
      const hit = bodyHit(d, this.tip);
      if (!hit) continue;
      if (d.def?.infinity && this._infStage() < 2) return; // 무하한: 다 적응하기 전엔 닿지 않는다
      const by = { side: 'mahoraga', drop: () => (this.impaled = null), onLimb: () => {} };
      if (!d.grab(by, this.tip, hit.key)) return;
      const entry = _v2.copy(this.tip).addScaledVector(axis, -0.2);
      const wound = addWound(this.ctx, d, hit.key, entry, axis.clone().negate(), { dur: 8, rate: 18 });
      this.impaled = { t: d, by, wound };
      d.damage((60 + Math.min(along, 12) * 10) * (d.def?.curse ? 1.6 : 1), { type: 'pierce', dir: axis.clone(), point: entry.clone(), color: '#ffe0a0', vsInf: this._infStage() });
      fx.burst(entry, 30, new THREE.Color(0x5a0508), 3, 0.05, 0.6, { dark: true, grav: 9, dir: axis.clone().negate(), dirAmt: 0.8 });
      sfx.cut?.(entry);
      this.hitT.set(d, world.time + 0.5);
      this.ctx.input.right.pulse?.(1, 100);
      this.ctx.game.hitstop = Math.max(this.ctx.game.hitstop, 0.07);
      if (!this._toldImpale) {
        this._toldImpale = true;
        ui.callout(d.def?.infinity ? '무하한을 꿰뚫었다 — 퇴마의 검에 꿰였다' : '퇴마의 검에 꿰였다 — 칼자루 쪽으로 홱 당기면 빠지고, 세게 휘두르면 내던진다', { color: '#ffe0a0', dur: 2 });
      }
      return;
    }
  }

  /** 칼날이 지난 자리의 대상을 벤다 (정의 주력: 저주에 1.6배) */
  /** 법진이 무하한에 적응한 정도 (0 · 1 중화 · 2 공간째 벰) */
  _infStage() {
    return Math.min(2, this.wheel.ad.res.get('infinity') ?? 0);
  }

  /** 공간째 베기: 칼을 휘두른 방향으로 12m 앞까지의 평면 — 무하한을 무시한다 */
  _spaceSlash() {
    const { world, fx, sfx, ui, input: inp } = this.ctx;
    this.cutCd = world.time + 0.9;
    const dir = _v3.copy(inp.headDir).setY(0).normalize();
    const n = (this.swing?.lengthSq() > 1e-6 ? this.swing.clone() : new THREE.Vector3(1, 0, 0)).cross(dir).normalize();
    if (n.lengthSq() < 0.5) n.set(0, 1, 0);
    spaceCut(this.ctx, inp.head.clone().addScaledVector(dir, 2), dir);
    sfx.slash(inp.head, 1);
    for (const t of world.targets()) {
      if (!t.alive) continue;
      const c = t.center(new THREE.Vector3());
      const rel = c.clone().sub(inp.head);
      const along = rel.dot(dir);
      if (along < 0.5 || along > 12) continue;
      if (Math.abs(rel.dot(n)) > 1.2 * (t.scale ?? 1)) continue;
      t.damage(220, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, c), color: '#ffe0a0', vsInf: 2 });
      fx.burst(c, 30, new THREE.Color(0xfff2c8), 4, 0.04, 0.4);
    }
    if (!this._toldSpace) {
      this._toldSpace = true;
      ui.callout('공간째 벤다 — 무하한이 의미를 잃는다', { color: '#ffe0a0', dur: 1.6 });
    }
  }

  _cut(a, b, speed) {
    const { world, sfx, fx } = this.ctx;
    if (this._thrust) return;
    const now = world.time;
    for (const t of world.targets()) {
      if (!t.alive) continue;
      if ((this.hitT.get(t) ?? -1) > now || this.impaled?.t === t) continue;
      const c = t.center(_v);
      // 몸 전체(발~머리 기둥)와 칼날 선분의 거리 — 가슴 한 점만 보던 것을 바꿈
      const sc = t.scale ?? 1;
      const foot = _a.copy(t.root?.position ?? t.pos ?? c);
      const headP = _b.copy(foot).add(_v3.set(0, 1.75 * sc, 0));
      if (t.kind !== 'dummy') {
        foot.copy(c).y -= 0.3 * sc;
        headP.copy(c).y += 0.3 * sc;
      }
      if (segSegDist(a, b, foot, headP) > 0.38 * sc) continue;
      this.hitT.set(t, now + 0.35);
      const curse = !!(t.def?.curse || t.curse);
      // 공략 적응: 같은 종류를 벨 때마다 분석해, 끝나면 그 상대에게 더 깊이 들어간다 (팔다리도 더 잘 잘린다)
      const key = t.type ?? t.kind;
      const atkLv = this.wheel.ad.atk.get(key) ?? 0; // (a 는 칼자루 위치 — 같은 이름으로 가리면 안 된다)
      if (t.kind !== 'prop') this.wheel.ad.expose('atk:' + key);
      // 살짝 닿기만 해도 베인다 (휘두를수록 깊게)
      const dmg = (speed < 3 ? 30 + speed * 8 : 60 + speed * 14) * (curse ? 1.6 : 1) * (1 + atkLv * 0.35);
      const n = new THREE.Vector3().subVectors(b, a).cross(this.swing?.lengthSq() > 1e-8 ? this.swing : _v3.set(0, 1, 0)).normalize();
      // 무하한: 법진이 분석해 적응한다 (① 절반 · ② 전부 들어간다)
      if (t.infinityOn) this.wheel.ad.expose('infinity');
      t.damage(dmg, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n.lengthSq() > 0.5 ? n : new THREE.Vector3(0, 1, 0), c), color: '#ffe0a0', vsInf: this._infStage() });
      if (t.infinityOn && this._infStage() >= 2) spaceCut(this.ctx, c, this.swing?.clone().normalize() ?? new THREE.Vector3(0, 0, -1));
      if (speed >= 3) t.impulse?.(_v3.subVectors(c, a).setY(0).normalize().multiplyScalar(5).add(_v.set(0, 2, 0)), 5);
      fx.burst(c, 18, new THREE.Color(0xfff2c8), 3.5, 0.03, 0.3);
      sfx.slash(c, 0.6);
      this.ctx.input.right.pulse?.(0.8, 60);
      this.ctx.game.hitstop = Math.max(this.ctx.game.hitstop, 0.05);
    }
  }

  /** 왼 주먹(과 칼을 안 든 주먹): 거인의 주먹 */
  meleeHit(target, pos, dir, speed, hand) {
    this.ctx.melee.normalHit(target, pos, dir, 25 + speed * 6, speed, hand, { mul: 2.5, push: 3 });
    return true;
  }

  exit(why = 'back') {
    const { world, rig, ui, sfx, fx, input: inp } = this.ctx;
    if (this.impaled) {
      this.impaled.t.release?.(new THREE.Vector3(), this.impaled.by);
      this.impaled = null;
    }
    rig.position.y = this.baseY;
    this.arms.left.dispose();
    this.arms.right.dispose();
    this.ctx.input.hideHands = false;
    this.wheel.dismiss();
    this.m.fadingWheels.push(this.wheel);
    this.aura.dispose();
    world.player.maxHp = this.savedHp;
    world.player.hp = Math.min(world.player.hp, this.savedHp);
    if (why === 'dead') world.player.hp = this.savedHp;
    world.playerDamageMul = this.savedMul;
    fx.flash(inp.head, new THREE.Color(0x6f86ff), 4, 0.4, 6);
    sfx.play('whoosh_2', { vol: 0.6, rate: 0.6 });
    ui.callout(why === 'dead' ? '마허라의 몸이 무너졌다… 술사로 돌아왔다' : '술사로 돌아왔다', { color: '#c0ccff', dur: 2.5 });
    this.m.possessed = null;
    return false;
  }

  /** 마허라가 된 동안의 조작법 */
  helpLines(mode) {
    const stage = this._infStage();
    const space = stage >= 2 ? '무하한에 적응(②)했다 — 크게 휘두르면 공간째 베는 참격이 12m 앞까지 날아가 무하한을 무시한다' : '무하한을 두른 적을 베면 법진이 분석한다 → ① 절반이 들어가고 ② 공간째 벤다 (그 뒤로 크게 휘두르면 공간 베기)';
    if (mode === 'desktop') {
      return [
        { head: '마허라 (나)', color: '#ffd28a', text: '데스크톱에선 마허라가 된 뒤에도 V 주먹 · T 잡기만 쓸 수 있다 · H 메뉴' },
        { head: '퇴마의 검 · 공간 베기', color: '#ffe0a0', text: space },
      ];
    }
    const ctrl = mode === 'controller';
    return [
      { head: '퇴마의 검 (오른팔)', color: '#ffe0a0', text: '오른팔에 늘 붙어 있다 · 휘두르면 칼날이 지난 자리의 적을 벤다 (빠를수록 깊게, 저주에는 1.6배)' },
      { head: '공간 베기 · 무하한', color: '#ffd28a', text: space },
      { head: '꽂기', color: '#ff9a9a', text: '칼날 방향으로 내지르면 베지 않고 꽂혀 적이 칼에 꿰인다 → 꿴 채로 칼을 움직이면 따라오고, 칼자루 쪽으로 홱 당기면 빠지고, 아주 세게 휘두르면 내던진다\n고죠(무하한)는 법진이 무하한에 다 적응(②)한 뒤에만 꽂힌다' },
      { head: '거인의 주먹 (왼팔)', color: '#ffd0a0', text: ctrl ? '왼쪽 그립+트리거로 주먹을 쥐고 휘둘러 친다' : '왼손 주먹으로 친다 — 사람 주먹의 2.5배' },
      { head: '잡기 · 박기 · 뜯기', color: '#ffb0a0', text: (ctrl ? '그립으로 잡기' : '손을 대고 주먹으로 잡기') + ' → 잡은 채로 땅이나 벽에 세게 박으면 큰 피해\n한 손은 몸통, 한 손은 팔·다리를 잡고 벌리면 그 부위가 뜯겨 손에 남는다 (양팔을 잡으면 양팔 모두 · 머리는 뽑으면 죽는다)\n뜯긴 부위는 휘둘러 치거나 던질 수 있다' },
      { head: '법진 · 적응', color: '#ffe0a0', text: '맞은 성질을 분석해 적응하면 법진이 한 칸 돌며 몸이 완전히 회복된다' },
      { head: '돌아가기', color: '#ffffff', text: ctrl ? '두 그립+트리거(주먹)를 가슴 앞에서 1초 맞대기' : '두 주먹을 가슴 앞에서 1초 맞대기' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    return [
      { label: '마허라(나)', bar: w.player.hp / w.player.maxHp, color: '#ffd28a' },
      { label: '법진 적응', text: (this.wheel.ad.summary() || '—') + (this.wheel.ad.spin ? ' · 무한회전' : ''), color: '#ffe0a0' },
    ];
  }
}

function segDist(p, a, b) {
  const ab = _v3.subVectors(b, a);
  const t = THREE.MathUtils.clamp(_v2.subVectors(p, a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
  return p.distanceTo(_v2.copy(a).addScaledVector(ab, t));
}

/** 두 선분 사이의 가장 가까운 거리 */
function segSegDist(p1, q1, p2, q2) {
  const d1 = _sA.subVectors(q1, p1);
  const d2 = _sB.subVectors(q2, p2);
  const r = _sC.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s = 0;
  let t = 0;
  if (a <= 1e-9 && e <= 1e-9) return r.length();
  if (a <= 1e-9) t = THREE.MathUtils.clamp(f / e, 0, 1);
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) s = THREE.MathUtils.clamp(-c / a, 0, 1);
    else {
      const b = d1.dot(d2);
      const den = a * e - b * b;
      s = den !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  return _sD.copy(p1).addScaledVector(d1, s).sub(_sC.copy(p2).addScaledVector(d2, t)).length();
}
const _sA = new THREE.Vector3();
const _sB = new THREE.Vector3();
const _sC = new THREE.Vector3();
const _sD = new THREE.Vector3();
