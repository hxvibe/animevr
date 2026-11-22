// 메구미의 그림자 수납 (十種影法術의 응용)
//  · 그림자 속에 주구(呪具)와 물건을 넣어 두고 꺼내 쓴다
//  · 대신 그림자에 든 물건의 무게는 술사가 그대로 짊어진다 → 무거울수록 몸이 느려지고 주력이 덜 찬다
//    짊어질 수 있는 무게에는 한계(CAP_KG)가 있어 그보다 무거운 건 넣을 수 없다 (자동차 같은 건 처음부터 무리)
//
//  조작 (핸드트래킹 · 컨트롤러는 그립을 주먹으로)
//   · 꺼내기: 발밑 그림자(바로 아래 바닥 가까이, 영역전개 중엔 그림자 바다 어디든)에 손을 펴서 대면
//             고른 물건의 그림자가 떠오른다 → 주먹을 쥐면 꺼내 쥔다 · 편 손을 1초 대고 있으면 다음 물건
//   · 넣기:   물건(주구 포함)을 쥔 채 그 그림자에 손을 넣고 손을 편다
//   · 주구는 진짜 물체: 손을 펴면 떨어지고, 던지면 돌며 날아가 벤다 · 다시 쥐거나 날아오는 걸 받을 수 있다 · 두 손으로 쥔다
//   · 데스크톱: G 꺼내기 · 넣기(T로 든 물건) / B 다음 물건
import * as THREE from 'three';
import { getModel } from '../../core/assets.js';
import { makeWeapon, disposeWeaponFx } from '../../core/weapons.js';
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

/** 주구: 모델 원점 = 기본으로 쥐는 곳, +Y = 칼끝, +X = 날 (곡도는 외날) · lo = 손잡이 끝 · base = 날이 시작하는 곳 */
export const TOOLS = {
  blade: { model: 'wpn_megumi_blade', label: '주구 · 곡도', kg: 1.6, tip: 0.67, base: 0.12, lo: -0.18, dmg: 1 },
  sword: { model: 'wpn_megumi_sword', label: '주구 · 고리칼', kg: 2.6, tip: 0.67, base: 0.18, lo: -0.12, dmg: 1.2 },
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

export class ShadowStore {
  constructor(owner) {
    this.owner = owner; // 메구미
    this.ctx = owner.ctx;
    // 처음부터 그림자 속에 있는 주구 두 자루
    this.items = Object.keys(TOOLS).map((id) => ({ kind: 'tool', id, kg: TOOLS[id].kg, label: TOOLS[id].label }));
    this.sel = 0;
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

  /** 그림자에 든 무게 (꺼낸 주구는 그림자 밖) */
  get load() {
    return this.items.reduce((s, x) => s + x.kg, 0);
  }

  /** 짊어진 정도 0~1 */
  get burden() {
    return Math.min(1, this.load / CAP_KG);
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
      const fist = h.source === 'hand' ? h.gesture === 'fist' : h.source === 'controller' ? h.btn.grip : false;
      const zone = this._zone(h);
      // ── 잡기로 쥐고 있던 물건을 그림자에 넣고 손을 폈다 → 그림자 속으로
      const held = grab?.held?.[side]?.t ?? null;
      const was = this.lastHeld[side];
      if (was && !held && !was.held && this.inZone[side] && was.alive && was.kind !== 'dummy') this.store(was, h);
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
    if (grab?.desk && grab.desk.t.kind !== 'dummy') {
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
    // 소품 정보를 기억해 두고 세계에서 뺀다 (다시 꺼낼 때 그대로 만든다) · 주구는 주구로
    const tool = t.weapon?.toolId;
    const rec = tool ? { kind: 'tool', id: tool, kg: TOOLS[tool].kg, label: TOOLS[tool].label } : { kind: 'prop', kg, label: t.label ?? '물건', obj: t.obj, opts: { radius: t.radius, halfH: t.halfH, mass: t.mass, kg, label: t.label, hp: t.hp, color: t.color.getHex() }, limb: !!t.limb, limbData: t.limb ? t : null };
    t.alive = false;
    if (t.weapon) disposeWeaponFx(this.ctx, t);
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
      // 주구: 진짜 물체로 만들어 그 손에 쥐여 준다 (손을 펴면 떨어지고 던질 수 있다)
      const def = TOOLS[it.id];
      const g = toolMesh(it.id);
      g.position.copy(h.palm);
      this.ctx.scene.add(g);
      const p = world.addProp(g, { radius: 0.08, mass: 0.5, kg: def.kg, label: def.label, hp: 1e9, color: 0x1a1a1a });
      makeWeapon(p, { tip: def.tip, base: def.base, lo: def.lo, dmg: def.dmg, toolId: it.id });
      p.asleep = false;
      if (h.source === 'desktop') {
        p.held = true;
        this.ctx.grab.desk = { t: p };
      } else this.ctx.grab?.hold?.(side, p, h);
      this.lastHeld[side] = p;
      if (!this._toldTool) {
        this._toldTool = true;
        ui.callout(`${it.label} — 크게 휘둘러 벤다 · 던지고 받을 수 있다 · 발밑 그림자에 넣고 손을 펴면 돌려보낸다`, { color: '#b8c4ff', dur: 2.2 });
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
    // 꺼내 둔 주구는 메구미와 함께 사라진다
    const W = this.ctx.world;
    for (const p of W.props) {
      if (!p.weapon?.toolId) continue;
      disposeWeaponFx(this.ctx, p);
      p.alive = false;
      p.obj.parent?.remove(p.obj);
    }
    W.props = W.props.filter((p) => p.alive);
    const g = this.ctx.grab;
    if (g) for (const sd of ['left', 'right']) if (g.held[sd] && !g.held[sd].t.alive) g.held[sd] = null;
    this.ctx.scene.remove(this.ghost, this.pool);
    this.pool.geometry.dispose();
    this.pool.material.dispose();
    this.ghostMat.dispose();
  }
}
