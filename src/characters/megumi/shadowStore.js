// 메구미의 그림자 수납 (十種影法術의 응용)
//  · 그림자 속에 주구(呪具)와 물건을 넣어 두고 꺼내 쓴다
//  · 대신 그림자에 든 물건의 무게는 술사가 그대로 짊어진다 → 무거울수록 몸이 느려지고 주력이 덜 찬다
//    짊어질 수 있는 무게에는 한계(CAP_KG)가 있어 그보다 무거운 건 넣을 수 없다 (자동차 같은 건 처음부터 무리)
//
//  조작 (핸드트래킹 · 컨트롤러는 그립을 주먹으로)
//   · 꺼내기: 발밑 그림자(바로 아래 바닥 가까이, 영역전개 중엔 그림자 바다 어디든)에 손을 펴서 대면
//             고른 물건의 그림자가 떠오른다 → 주먹을 쥐면 꺼내 쥔다 · 편 손을 1초 대고 있으면 다음 물건
//   · 넣기:   물건을 쥔 채 그 그림자에 손을 넣고 손을 편다 / 주구는 손을 펴면 그림자로 돌아간다
//   · 데스크톱: G 꺼내기 · 넣기(T로 든 물건) · 주구 돌려보내기 / B 다음 물건
import * as THREE from 'three';
import { getModel } from '../../core/assets.js';
import { gripPoint } from '../../core/body.js';
import { shadowSplash } from './vfx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** 짊어질 수 있는 무게 (kg) */
export const CAP_KG = 150;

/** 주구: 모델 원점 = 쥐는 곳, +Y = 칼끝, +X = 날 (곡도는 외날) */
export const TOOLS = {
  blade: { model: 'wpn_megumi_blade', label: '주구 · 곡도', kg: 1.6, tip: 0.67, base: 0.12, dmg: 1 },
  sword: { model: 'wpn_megumi_sword', label: '주구 · 고리칼', kg: 2.6, tip: 0.67, base: 0.14, dmg: 1.2 },
};

function toolMesh(id) {
  const src = getModel(TOOLS[id].model);
  const g = new THREE.Group();
  if (src) {
    const c = src.clone(true);
    c.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    g.add(c);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.008).translate(0, 0.4, 0), new THREE.MeshStandardMaterial({ color: 0x30343a, metalness: 0.9, roughness: 0.4 }));
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a1a14 }));
    g.add(blade, grip);
  }
  return g;
}

/** 그림자에서 꺼내 쥔 주구 한 자루 (휘둘러 벤다) */
class HeldTool {
  constructor(ctx, id, side) {
    this.ctx = ctx;
    this.id = id;
    this.def = TOOLS[id];
    this.side = side;
    this.g = toolMesh(id);
    this.k = 0; // 그림자에서 솟아오르는 정도
    this.tip = new THREE.Vector3();
    this.base = new THREE.Vector3();
    this.prevTip = new THREE.Vector3();
    this.tipVel = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 1, 0);
    this.hits = new Map();
    this.arc = 0;
    this.hasPrev = false;
    this.time = 0;
    ctx.scene.add(this.g);
    // 휘두른 궤적 (그림자 빛)
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 2 * 3), 3));
    tg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(14 * 2), 1));
    const idx = [];
    for (let i = 0; i < 13; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(idx);
    this.trail = [];
    this.trailMesh = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.55, 0.62, 0.95, vA * 0.45); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    this.trailMesh.frustumCulled = false;
    ctx.scene.add(this.trailMesh);
  }

  /** 손을 따라간다. 돌려주는 값: 칼끝 속도 */
  update(dt, h) {
    this.time += dt;
    this.k = Math.min(1, this.k + dt * 5);
    const inp = this.ctx.input;
    const desk = h.source === 'desktop';
    // 칼 방향: 주먹을 꿰뚫는 축(엄지 쪽) · 컨트롤러는 가리키는 방향 · 데스크톱은 바라보는 쪽
    if (h.source === 'hand') {
      this.dir.crossVectors(h.fingersDir, h.palmNormal);
      if (this.side === 'left') this.dir.negate();
    } else if (desk) this.dir.copy(inp.headDir).add(_v.set(0, 0.25, 0));
    else this.dir.copy(h.dir);
    this.dir.normalize();
    // 날: 손가락이 감아쥔 쪽 (컨트롤러는 아래)
    const ref = h.source === 'hand' ? _v.copy(h.fingersDir) : _v.copy(UP);
    const edge = _v2.copy(ref).addScaledVector(this.dir, -ref.dot(this.dir));
    if (edge.lengthSq() < 1e-4) edge.set(1, 0, 0);
    edge.normalize().negate();
    const z = _v3.crossVectors(edge, this.dir).normalize();
    _m.makeBasis(edge, this.dir, z);
    this.g.quaternion.setFromRotationMatrix(_m);
    if (desk) this.g.position.copy(h.palm);
    else gripPoint(h, this.ctx.rig, this.g.position);
    // 그림자에서 솟듯이: 칼끝부터 자라 나온다
    const e = this.k * this.k * (3 - 2 * this.k);
    this.g.scale.setScalar(Math.max(0.01, e));
    this.base.copy(this.g.position).addScaledVector(this.dir, this.def.base * e);
    this.tip.copy(this.g.position).addScaledVector(this.dir, this.def.tip * e);
    let speed = 0;
    if (this.hasPrev && dt > 0) {
      this.tipVel.subVectors(this.tip, this.prevTip).divideScalar(dt);
      speed = this.tipVel.length();
    }
    this.prevTip.copy(this.tip);
    this.hasPrev = true;
    this.arc = speed > 1.8 ? this.arc + speed * dt : this.arc * Math.max(0, 1 - dt * 10);
    // 궤적
    this.trail.unshift({ a: this.base.clone(), b: this.tip.clone(), s: speed });
    if (this.trail.length > 14) this.trail.pop();
    const P = this.trailMesh.geometry.attributes.position;
    const A = this.trailMesh.geometry.attributes.alpha;
    for (let i = 0; i < 14; i++) {
      const t = this.trail[Math.min(i, this.trail.length - 1)];
      P.setXYZ(i * 2, t.a.x, t.a.y, t.a.z);
      P.setXYZ(i * 2 + 1, t.b.x, t.b.y, t.b.z);
      const a = THREE.MathUtils.clamp((t.s - 2.5) / 5, 0, 1) * (1 - i / 14);
      A.setX(i * 2, a * 0.2);
      A.setX(i * 2 + 1, a);
    }
    P.needsUpdate = true;
    A.needsUpdate = true;
    // 크게 휘둘러야 벤다
    const big = desk ? speed > 2.6 : speed > 4 && this.arc > 0.4;
    if (big && this.k > 0.9) this._slash(speed, h);
    return speed;
  }

  _slash(speed, h) {
    const { world, fx, sfx } = this.ctx;
    for (const t of world.targets()) {
      if (!t.alive || t.dying) continue;
      if (this.time - (this.hits.get(t) ?? -10) < 0.4) continue;
      const c = t.center(_v);
      const dummy = t.kind === 'dummy';
      const s = t.scale ?? 1;
      const r = (dummy ? 0.22 * s : t.big ? 0.05 : t.radius ?? 0.3) + 0.04;
      const g0 = dummy ? (t.root?.position.y ?? 0) + 0.25 * s : 0;
      const g1 = dummy ? (t.root?.position.y ?? 0) + 1.75 * s : 0;
      let best = Infinity;
      const near = _v3;
      for (let i = 0; i <= 6; i++) {
        const p = _v2.lerpVectors(this.base, this.tip, i / 6);
        let dd;
        if (dummy) dd = p.distanceTo(_v4.set(c.x, THREE.MathUtils.clamp(p.y, g0, g1), c.z));
        else dd = t.big ? t.distanceTo(p) : p.distanceTo(c);
        if (dd < best) {
          best = dd;
          near.copy(p);
        }
      }
      if (best > r) continue;
      if (dummy) c.y = THREE.MathUtils.clamp(near.y, g0 + 0.2 * s, g1 - 0.1 * s);
      else if (t.big) c.copy(near);
      this.hits.set(t, this.time);
      const n = _v2.crossVectors(this.dir, this.tipVel).normalize();
      if (n.lengthSq() < 0.5) n.set(0, 1, 0);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, c);
      const push = this.tipVel.clone().normalize().multiplyScalar(1.5);
      fx.burst(near, 12, new THREE.Color(0xc8d0ff), 2.5, 0.03, 0.3, { dir: push, dirAmt: 1 });
      sfx.cut(near);
      t.damage((28 + speed * 8) * this.def.dmg, { type: 'slash', plane, push });
      if (t.alive) t.impulse?.(push.multiplyScalar(1.2), 2);
      h.pulse?.(0.8, 60);
      this.ctx.game.hitstop = Math.max(this.ctx.game.hitstop ?? 0, 0.03);
    }
    if ((this._swish ?? 0) < this.time) {
      this._swish = this.time + 0.25;
      sfx.slash(this.tip, 1.1);
    }
  }

  dispose() {
    this.ctx.scene.remove(this.g, this.trailMesh);
    this.trailMesh.geometry.dispose();
    this.trailMesh.material.dispose();
  }
}

export class ShadowStore {
  constructor(owner) {
    this.owner = owner; // 메구미
    this.ctx = owner.ctx;
    // 처음부터 그림자 속에 있는 주구 두 자루
    this.items = Object.keys(TOOLS).map((id) => ({ kind: 'tool', id, kg: TOOLS[id].kg, label: TOOLS[id].label }));
    this.sel = 0;
    this.tools = { left: null, right: null }; // 손에 든 주구
    this.reach = { left: 0, right: 0 }; // 편 손을 그림자에 댄 시간
    this.lastHeld = { left: null, right: null }; // 지난 프레임에 잡기로 쥐고 있던 물건
    this.inZone = { left: false, right: false };
    this._keys = {};
    // 꺼낼 물건의 그림자 (편 손 아래 바닥에서 떠오르는 검은 실루엣)
    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x05060c, transparent: true, opacity: 0.85, depthWrite: false });
    this.ctx.scene.add(this.ghost);
    this.ghostKey = null;
    // 발밑 그림자 웅덩이 (넣고 꺼낼 때 보인다)
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x020206, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.pool.renderOrder = 2;
    this.ctx.scene.add(this.pool);
  }

  /** 그림자에 든 무게 (손에 든 주구는 그림자 밖) */
  get load() {
    return this.items.reduce((s, x) => s + x.kg, 0);
  }

  /** 짊어진 정도 0~1 */
  get burden() {
    return Math.min(1, this.load / CAP_KG);
  }

  holds(side) {
    return !!this.tools[side];
  }

  /** 손이 그림자에 닿았는가: 발밑(가까운 바닥) 또는 영역전개의 그림자 바다 */
  _zone(h) {
    if (!h.active || h.uiBlock) return false;
    const inp = this.ctx.input;
    const low = h.palm.y < 0.4;
    if (!low) return false;
    const foot = Math.hypot(h.palm.x - inp.head.x, h.palm.z - inp.head.z) < 0.5;
    return foot || this.owner.garden.contains(h.palm);
  }

  hudRow() {
    const names = this.items.map((x) => x.label);
    const sel = this.items[this.sel];
    return { label: '그림자', text: `${Math.round(this.load)}/${CAP_KG}kg${sel ? ' · ▶' + sel.label : ''}${names.length > 1 ? ` (${names.length})` : ''}`, color: this.burden > 0.7 ? '#ffb0a0' : '#b8c4ff' };
  }

  update(dt) {
    const { input: inp, world } = this.ctx;
    const grab = this.ctx.grab;
    let ghostSide = null;
    for (const h of inp.hands) {
      const side = h.side;
      const tool = this.tools[side];
      const fist = h.source === 'hand' ? h.gesture === 'fist' : h.source === 'controller' ? h.btn.grip : false;
      const zone = this._zone(h);
      // ── 주구를 든 손: 휘두른다 · 손을 펴면 그림자로 돌아간다
      if (tool) {
        if (h.source === 'desktop') tool.update(dt, h);
        else if (!h.active || (!fist && h.gestureTime > 0.08) || (h.source === 'controller' && !h.btn.grip)) this.putTool(side);
        else tool.update(dt, h);
        continue;
      }
      // ── 잡기로 쥐고 있던 물건을 그림자에 넣고 손을 폈다 → 그림자 속으로
      const held = grab?.held?.[side]?.t ?? null;
      const was = this.lastHeld[side];
      if (was && !held && this.inZone[side] && was.alive && was.kind !== 'dummy') this.store(was, h);
      this.lastHeld[side] = held;
      this.inZone[side] = zone && !!held;
      if (held) {
        this.reach[side] = 0;
        continue;
      }
      // ── 빈손을 그림자에 댄다 → 꺼낼 물건이 떠오르고, 주먹을 쥐면 꺼낸다
      if (!zone || h.source === 'desktop' || !this.items.length) {
        this.reach[side] = 0;
        continue;
      }
      // 바닥에 놓인 물건이 손 닿는 곳에 있으면 그걸 집게 둔다 (꺼내기보다 줍기가 먼저)
      const near = world.nearestTarget(h.palm, 0.16, (t) => t.kind !== 'dummy' && !t.held);
      if (near) {
        this.reach[side] = 0;
        continue;
      }
      ghostSide = side;
      if (fist && (h.source !== 'hand' || h.gestureTime < 0.3)) {
        this.reach[side] = 0;
        this.take(side);
        continue;
      }
      this.reach[side] += dt;
      if (this.reach[side] > 1 && this.items.length > 1) {
        this.reach[side] = 0;
        this.next();
        h.pulse?.(0.4, 40);
      }
    }
    this._desktop();
    this._ghost(ghostSide, dt);
    // 발밑 웅덩이: 손이 그림자에 닿았거나 물건을 넣으려 할 때
    const want = ghostSide || this.inZone.left || this.inZone.right;
    const m = this.pool.material;
    m.opacity = THREE.MathUtils.lerp(m.opacity, want ? 0.75 : 0, 1 - Math.exp(-dt * 8));
    this.pool.visible = m.opacity > 0.01;
    this.pool.position.set(inp.head.x, 0.012, inp.head.z);
  }

  _desktop() {
    const inp = this.ctx.input;
    if (inp.mode !== 'desktop') return;
    const press = (code) => {
      const d = inp.keyDown(code);
      const p = d && !this._keys[code];
      this._keys[code] = d;
      return p;
    };
    if (press('KeyB')) this.next();
    if (!press('KeyG')) return;
    const grab = this.ctx.grab;
    if (this.tools.right) this.putTool('right');
    else if (grab?.desk && grab.desk.t.kind !== 'dummy') {
      const t = grab.desk.t;
      t.held = false;
      grab.desk = null;
      this.store(t, inp.right);
    } else this.take('right');
  }

  next() {
    if (!this.items.length) return;
    this.sel = (this.sel + 1) % this.items.length;
    this.ctx.ui.callout(`그림자 ▶ ${this.items[this.sel].label}`, { color: '#b8c4ff', size: 34, dur: 0.8 });
  }

  /** 물건을 그림자에 넣는다 (무게 한계를 넘으면 튕겨 나온다) */
  store(t, h) {
    const { ui, sfx, fx, world } = this.ctx;
    const kg = t.kg ?? 0;
    const at = t.center(new THREE.Vector3());
    if (this.load + kg > CAP_KG) {
      ui.callout(`그림자가 감당 못한다 — ${t.label ?? '물건'} ${Math.round(kg)}kg · 짊어진 무게 ${Math.round(this.load)}/${CAP_KG}kg`, { color: '#ff9a9a', dur: 2 });
      sfx.denied();
      h?.pulse?.(0.8, 120);
      return false;
    }
    // 소품 정보를 기억해 두고 세계에서 뺀다 (다시 꺼낼 때 그대로 만든다)
    const rec = { kind: 'prop', kg, label: t.label ?? '물건', obj: t.obj, opts: { radius: t.radius, halfH: t.halfH, mass: t.mass, kg, label: t.label, hp: t.hp, color: t.color.getHex() }, limb: !!t.limb, limbData: t.limb ? t : null };
    t.alive = false;
    t.obj.parent?.remove(t.obj);
    world.props = world.props.filter((p) => p !== t);
    if (world.limbs) world.limbs = world.limbs.filter((p) => p !== t);
    this.items.push(rec);
    this.sel = this.items.length - 1;
    shadowSplash(fx, _v.set(at.x, 0, at.z), 0.5, 18);
    sfx.play('whoosh_2', { at, vol: 0.5, rate: 0.6 });
    h?.pulse?.(0.5, 60);
    ui.callout(`그림자에 넣었다 — ${rec.label} ${kg < 10 ? kg.toFixed(1) : Math.round(kg)}kg · 짊어진 무게 ${Math.round(this.load)}/${CAP_KG}kg`, { color: '#b8c4ff', dur: 1.6 });
    return true;
  }

  /** 고른 물건을 그림자에서 꺼내 그 손에 쥔다 */
  take(side) {
    const it = this.items[this.sel];
    if (!it) return false;
    const { input: inp, sfx, fx, world, ui } = this.ctx;
    const h = inp[side];
    this.items.splice(this.sel, 1);
    if (this.sel >= this.items.length) this.sel = 0;
    const at = new THREE.Vector3(h.palm.x, 0, h.palm.z);
    shadowSplash(fx, at, 0.45, 22);
    sfx.play('whoosh_2', { at: h.palm, vol: 0.6, rate: 0.75 });
    h.pulse?.(0.7, 80);
    if (it.kind === 'tool') {
      this.tools[side] = new HeldTool(this.ctx, it.id, side);
      if (!this._toldTool) {
        this._toldTool = true;
        ui.callout(`${it.label} — 크게 휘둘러 벤다 · 손을 펴면 그림자로 돌아간다`, { color: '#b8c4ff', dur: 2 });
      }
      return true;
    }
    // 소품: 손 위치에 되살려 잡기로 쥐어 준다
    const o = it.obj;
    o.position.copy(h.palm);
    this.ctx.scene.add(o);
    const p = world.addProp(o, it.opts);
    if (it.limb) p.limb = true;
    p.asleep = false;
    if (this.ctx.grab?.hold) this.ctx.grab.hold(side, p, h);
    this.lastHeld[side] = p;
    return true;
  }

  /** 든 주구를 그림자로 돌려보낸다 */
  putTool(side) {
    const tool = this.tools[side];
    if (!tool) return;
    const { fx, sfx } = this.ctx;
    this.tools[side] = null;
    shadowSplash(fx, _v.set(tool.g.position.x, 0, tool.g.position.z), 0.35, 12);
    sfx.play('whoosh_2', { at: tool.g.position, vol: 0.35, rate: 0.9 });
    tool.dispose();
    this.items.push({ kind: 'tool', id: tool.id, kg: TOOLS[tool.id].kg, label: TOOLS[tool.id].label });
    this.sel = this.items.length - 1;
  }

  /** 꺼낼 물건의 그림자 실루엣 */
  _ghost(side, dt) {
    const it = side ? this.items[this.sel] : null;
    if (!it) {
      this.ghost.visible = false;
      this._gk = 0;
      return;
    }
    const key = it.kind === 'tool' ? 'tool:' + it.id : it.obj.uuid;
    if (this.ghostKey !== key) {
      this.ghostKey = key;
      this.ghost.clear();
      const src = it.kind === 'tool' ? toolMesh(it.id) : it.obj.clone(true);
      src.position.set(0, 0, 0);
      src.traverse((o) => {
        if (o.isMesh) {
          o.material = this.ghostMat;
          o.castShadow = false;
        }
      });
      const box = new THREE.Box3().setFromObject(src);
      const sz = box.getSize(_v).length();
      const s = sz > 0.9 ? 0.9 / sz : 1;
      src.scale.multiplyScalar(s);
      this.ghost.add(src);
      this._gk = 0;
    }
    const h = this.ctx.input[side];
    this._gk = Math.min(1, (this._gk ?? 0) + dt * 3);
    this.ghost.visible = true;
    this.ghost.position.set(h.palm.x, -0.25 + 0.3 * this._gk + Math.sin(performance.now() / 300) * 0.01, h.palm.z);
    this.ghost.rotation.y += dt * 0.8;
  }

  dispose() {
    for (const s of ['left', 'right']) {
      this.tools[s]?.dispose();
      this.tools[s] = null;
    }
    this.ctx.scene.remove(this.ghost, this.pool);
    this.pool.geometry.dispose();
    this.pool.material.dispose();
    this.ghostMat.dispose();
  }
}
