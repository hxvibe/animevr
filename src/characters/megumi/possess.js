// 술사가 마허라가 된다
//  조복 전의 마허라에게 술사가 쓰러지면, 마허라가 술사를 삼켜 술사 자신이 마허라가 된다 (시점이 높아지고 몸이 강해진다)
//  · 머리 위의 법진이 받는 공격에 적응한다 (한 칸 돌 때마다 완전 회복) — 쓰러진 마허라의 적응을 그대로 잇는다
//  · 오른 주먹: 퇴마의 검 (정(正)의 주력 — 저주에 더 강하다) · 왼 주먹: 무거운 주먹
//  · 두 주먹을 가슴 앞에서 1초 맞대면 술사로 돌아온다 (또는 다시 쓰러지면)
import * as THREE from 'three';
import { MahoragaWheel, Adaptation } from './shikigami.js';
import { gripPoint } from '../../core/body.js';
import { HandAura } from '../../core/handAura.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const LIFT = 1.1; // 눈높이를 이만큼 올린다 (거인)
const BLADE = 1.45; // 칼날 길이
const GOLD = { glow: 0xffe6a0, hot: 0xffffff, inner: 0x3a2e10, line: 0x0a0804 };

function swordMesh() {
  const g = new THREE.Group();
  const steel = new THREE.MeshToonMaterial({ color: 0xe8edf2 });
  const gold = new THREE.MeshToonMaterial({ color: 0xc9a65a });
  const ink = new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide });
  // 넓적한 외날 (끝이 비스듬히 잘린)
  const shape = new THREE.Shape();
  shape.moveTo(-0.045, 0);
  shape.lineTo(0.05, 0);
  shape.lineTo(0.06, BLADE - 0.18);
  shape.lineTo(-0.02, BLADE);
  shape.lineTo(-0.045, BLADE - 0.1);
  shape.closePath();
  const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
  bg.translate(0, 0, -0.006);
  bg.rotateX(-Math.PI / 2); // +Y → -Z … 아래서 다시 +Z 로
  bg.rotateY(Math.PI);
  bg.translate(0, 0, 0.12);
  const blade = new THREE.Mesh(bg, steel);
  const bo = new THREE.Mesh(bg, ink);
  bo.scale.setScalar(1.02);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05).translate(0, 0, 0.1), gold);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8).rotateX(Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x2a2018 }));
  g.add(blade, bo, guard, grip);
  g.userData.mats = [steel, gold, ink, grip.material];
  return g;
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
    this.turns = this.wheel.ad.turns;
    this.sword = swordMesh();
    this.sword.visible = false;
    this.ctx.scene.add(this.sword);
    this.swordK = 0;
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
    ui.callout('술사가 쓰러져 마허라가 되었다 — 오른 주먹: 퇴마의 검 · 두 주먹을 가슴 앞에 1초 맞대면 돌아온다', { color: '#ffe0a0', dur: 4 });
  }

  update(dt) {
    const { input: inp, world, rig, fx, sfx, ui } = this.ctx;
    // 시점이 서서히 높아진다
    this.lift = Math.min(LIFT, this.lift + dt * 0.8);
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
    // 퇴마의 검: 오른 주먹
    const h = R;
    const want = fist(h) && !(fist(L) && L.palm.distanceTo(R.palm) < 0.2);
    this.swordK = THREE.MathUtils.clamp(this.swordK + (want ? dt * 6 : -dt * 5), 0, 1);
    this.sword.visible = this.swordK > 0.02;
    if (this.sword.visible && h.active) {
      const dir = _v.copy(h.source === 'hand' ? _v2.crossVectors(h.fingersDir, h.palmNormal) : h.dir).normalize();
      const edge = _v2.copy(h.source === 'hand' ? h.fingersDir : _v3.set(0, 1, 0)).addScaledVector(dir, -(h.source === 'hand' ? h.fingersDir : _v3.set(0, 1, 0)).dot(dir)).normalize();
      _m.makeBasis(edge, _v3.crossVectors(dir, edge), dir);
      this.sword.quaternion.setFromRotationMatrix(_m);
      gripPoint(h, rig, this.sword.position);
      this.sword.scale.setScalar(Math.max(0.01, this.swordK));
      this.tip.copy(this.sword.position).addScaledVector(dir, (BLADE + 0.12) * this.swordK);
      const speed = this.hasPrev ? this.tip.distanceTo(this.prevTip) / Math.max(dt, 1e-3) : 0;
      this.swing = (this.swing ?? new THREE.Vector3()).subVectors(this.tip, this.prevTip);
      this.prevTip.copy(this.tip);
      this.hasPrev = true;
      this.aura.set('right', 0.35 + Math.min(0.5, speed * 0.05));
      if (speed > 3 && this.swordK > 0.9) this._cut(this.sword.position, this.tip, speed);
      if (speed > 4 && Math.random() < 0.6) fx.spawn(this.tip, _v.randomDirection().multiplyScalar(0.4), new THREE.Color(0xfff0c0), 0.05, 0.3, 2, 0);
    } else {
      this.hasPrev = false;
      if (this.exitT <= 0) this.aura.set('right', 0);
    }
    if (this.exitT <= 0) this.aura.set('left', fist(L) ? 0.3 : 0);
    this.aura.update(dt);
    void sfx;
    return true;
  }

  /** 칼날이 지난 자리의 대상을 벤다 (정의 주력: 저주에 1.6배) */
  _cut(a, b, speed) {
    const { world, sfx, fx } = this.ctx;
    const now = world.time;
    for (const t of world.targets()) {
      if (!t.alive || t.heldBy) continue;
      if ((this.hitT.get(t) ?? -1) > now) continue;
      const c = t.center(_v);
      const r = 0.35 * (t.scale ?? 1);
      if (segDist(c, a, b) > r) continue;
      this.hitT.set(t, now + 0.35);
      const curse = !!(t.def?.curse || t.curse);
      const dmg = (60 + speed * 14) * (curse ? 1.6 : 1);
      const n = new THREE.Vector3().subVectors(b, a).cross(this.swing.lengthSq() > 1e-8 ? this.swing : _v3.set(0, 1, 0)).normalize();
      t.damage(dmg, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n.lengthSq() > 0.5 ? n : new THREE.Vector3(0, 1, 0), c), color: '#ffe0a0' });
      t.impulse?.(_v3.subVectors(c, a).setY(0).normalize().multiplyScalar(5).add(_v.set(0, 2, 0)), 5);
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
    rig.position.y = this.baseY;
    this.ctx.scene.remove(this.sword);
    for (const m of this.sword.userData.mats) m.dispose();
    this.sword.traverse((o) => o.geometry?.dispose());
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
