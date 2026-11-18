// 공통 근접 공격: 주먹(컨트롤러는 그립)으로 더미를 치면 타격, 일정 확률로 흑섬(黒閃)
import * as THREE from 'three';
import { Bolts } from './fx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const RED = new THREE.Color(0xff1a2a);
const BLACK = new THREE.Color(0x050005);

export class Melee {
  constructor(ctx) {
    this.ctx = ctx;
    this.cd = { left: 0, right: 0 };
    this.combo = 0;
    this.lastHit = -10;
    this.dark = new Bolts(ctx.scene, { count: 8, segs: 10, color: 0x000000, width: 0.018, dark: true });
    this.red = new Bolts(ctx.scene, { count: 6, segs: 10, color: 0xff1a30, width: 0.01 });
    this.dark.hide();
    this.red.hide();
    this.flashT = 0;
    this.flashPos = new THREE.Vector3();
  }

  update(dt) {
    const { input: inp, world } = this.ctx;
    for (const h of inp.hands) {
      this.cd[h.side] -= dt;
      if (!h.active || h.uiBlock || this.cd[h.side] > 0) continue;
      if (h.source === 'desktop') continue;
      if (!h.gripping || h.speed < 2.0) continue;
      // 잡고 있는 대상은 치지 않는다
      if (this.ctx.grab?.isHolding(h.side)) continue;
      const t = world.nearestTarget(h.palm, 0.09, (x) => !x.heldBy && !x.held);
      if (!t) continue;
      this.cd[h.side] = 0.3;
      this.hit(t, h.palm.clone(), _v.copy(h.vel).normalize(), h.speed, h);
    }
    if (inp.mode === 'desktop' && inp.keys.has('KeyV') && this.cd.right <= 0) {
      this.cd.right = 0.4;
      const p = _v2.copy(inp.head).addScaledVector(inp.headDir, 1.0);
      const t = world.nearestTarget(p, 0.9);
      if (t) this.hit(t, t.center(new THREE.Vector3()), inp.headDir.clone(), 4, inp.right);
    }
    // 흑섬 번개 깜빡임
    if (this.flashT > 0) {
      this.flashT -= dt;
      const cam = inp.head;
      const P = this.flashPos;
      const r = 0.6;
      const list = [];
      for (let i = 0; i < 8; i++) list.push([P.clone().add(_v.randomDirection().multiplyScalar(r * 0.2)), P.clone().add(_v2.randomDirection().multiplyScalar(r * (0.6 + Math.random()))), 0.12]);
      this.dark.regenBetween(list, cam);
      this.red.regenBetween(list.slice(0, 6).map(([a, b]) => [a, b.clone().multiplyScalar(1).add(_v.randomDirection().multiplyScalar(0.1)), 0.1]), cam);
      this.dark.mat.uniforms.uOpacity.value = Math.min(1, this.flashT * 5);
      this.red.mat.uniforms.uOpacity.value = Math.min(1, this.flashT * 5);
      if (this.flashT <= 0) {
        this.dark.hide();
        this.red.hide();
      }
    }
  }

  hit(target, pos, dir, speed, hand) {
    const { world, settings } = this.ctx;
    // 캐릭터가 자기 방식의 타격을 쓰면 그쪽으로 (흑섬은 주술회전 캐릭터만)
    if (this.ctx.character?.meleeHit?.(target, pos, dir, speed, hand)) return;
    const now = world.time;
    this.combo = now - this.lastHit < 1.2 ? this.combo + 1 : 1;
    this.lastHit = now;
    const black = Math.random() < (settings.blackFlashChance ?? 0.2) + Math.min(0.15, this.combo * 0.03);
    const base = 10 + speed * 3;
    if (black) this.blackFlash(target, pos, dir, base, hand);
    else this.normalHit(target, pos, dir, base, speed, hand);
  }

  /** 흑섬: 타격과 주력의 오차가 0.000001초 이내 → 위력 2.5승. 캐릭터 타격에서도 부른다 */
  blackFlash(target, pos, dir, base, hand, { mul = 1, label = null, top = null } = {}) {
    const { fx, sfx, ui } = this.ctx;
    const dmg = Math.pow(base, 1.25) * 2.5 * mul;
    target.damage(dmg, { type: 'punch', dir, color: '#ff3040' });
    target.impulse?.(_v.copy(dir).multiplyScalar(9 * Math.sqrt(mul)).add(_v2.set(0, 3, 0)), 10);
    this.ctx.game.hitstop = 0.09;
    this.flashT = 0.3;
    this.flashPos.copy(pos);
    fx.burst(pos, 60, BLACK, 5, 0.06, 0.5, { dark: true, drag: 3 });
    fx.burst(pos, 50, RED, 6, 0.05, 0.4, { drag: 2 });
    fx.shockwave(pos, 0x000000, 1.8, 0.35, { dark: true, faceDir: dir.clone(), opacity: 0.9 });
    fx.shockwave(pos, RED, 2.4, 0.45, { faceDir: dir.clone() });
    fx.sphereBlast(pos, 0x000000, 0.8, 0.25, { dark: true, opacity: 0.8 });
    fx.flash(pos, RED, 10, 0.3);
    sfx.blackFlash(pos);
    ui.manga({ top, main: label ?? '黒閃', ruby: 'こくせん', color: '#ff1a30', side: hand?.side });
    hand?.pulse?.(1, 160);
    return dmg;
  }

  /** 보통 주먹 */
  normalHit(target, pos, dir, base, speed, hand, { mul = 1, push = 1 } = {}) {
    const { fx, sfx } = this.ctx;
    const dmg = base * mul;
    target.damage(dmg, { type: 'punch', dir });
    target.impulse?.(_v.copy(dir).multiplyScalar((2 + speed * 0.6) * push).add(_v2.set(0, 0.8 * push, 0)), 3);
    fx.burst(pos, 14, new THREE.Color(0xffffff), 2, 0.03, 0.25);
    sfx.punch(pos);
    hand?.pulse?.(0.7, 60);
    return dmg;
  }
}
