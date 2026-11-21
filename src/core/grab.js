// 잡기 · 던지기 (모든 캐릭터 공통)
// 핸드트래킹: 더미(또는 소품)에 손을 대고 주먹 쥐기 → 잡기, 손을 펴면 놓기(손의 속도로 던짐)
// 컨트롤러: 그립 / 데스크톱: T 키
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export class Grab {
  constructor(ctx) {
    this.ctx = ctx;
    this.held = { left: null, right: null };
    this.desk = null;
    // 손마다 잡는 주체 (두 손으로 같은 적의 서로 다른 관절을 잡을 수 있다)
    this.by = {
      left: { side: 'left', drop: () => this._release('left', new THREE.Vector3()) },
      right: { side: 'right', drop: () => this._release('right', new THREE.Vector3()) },
    };
  }

  isHolding(side) {
    return !!this.held[side];
  }

  update(dt) {
    const { input: inp, world } = this.ctx;
    const busy = (side) => this.ctx.character?.handBusy?.(side);
    for (const h of inp.hands) {
      const side = h.side;
      const H = this.held[side];
      if (!H) {
        if (!h.active || h.uiBlock || h.source === 'desktop' || busy(side)) continue;
        const want = h.source === 'hand' ? h.gesture === 'fist' && h.gestureTime < 0.25 : h.pressed('grip');
        if (!want || h.speed > 1.6) continue;
        const other = this.held[side === 'left' ? 'right' : 'left']?.t;
        // 다른 손이 이미 잡은 적도 한 손 더 잡을 수 있다 (두 손 잡기)
        const t = world.nearestTarget(h.palm, this._mighty() ? 0.26 : 0.13, (x) => !x.dying && !x.noGrab && (x.kind === 'dummy' ? !x.heldBy || (x === other && (x.holdCount?.() ?? 1) < 2) : !x.held));
        if (t) this._grab(side, t, h);
      } else {
        const t = H.t;
        if (!t.alive) {
          this.held[side] = null;
          continue;
        }
        const release = !h.active || (h.source === 'hand' ? h.gesture !== 'fist' && h.gestureTime > 0.05 : !h.btn.grip);
        // 손을 따라감 (더미는 잡은 관절만 손에 붙고 나머지는 중력에 늘어진다)
        const target = _v.copy(h.palm).add(H.offset);
        if (t.kind === 'dummy') t.holdAt(target, this.by[side]);
        else t.pos.lerp(target, 1 - Math.exp(-dt * 25));
        if (t.kind === 'dummy') this._slam(H, t, h);
        if (release) this._release(side, h.vel.clone().multiplyScalar(1.7));
      }
    }
    this._tear();
    // 데스크톱
    if (inp.mode === 'desktop') {
      const down = inp.keyDown('KeyT');
      if (down && !this.desk) {
        // 조준선 근처 5m 이내에서 가장 가까운 대상
        let t = null;
        let best = Infinity;
        for (const x of world.targets()) {
          if (x.heldBy || x.held || x.dying || x.noGrab) continue;
          const c = x.center(new THREE.Vector3());
          const rel = c.sub(inp.head);
          const along = rel.dot(inp.headDir);
          if (along < 0.3 || along > 5) continue;
          const off = rel.addScaledVector(inp.headDir, -along).length();
          if (off < 0.8 && along < best) {
            best = along;
            t = x;
          }
        }
        if (t) {
          this.desk = { t };
          if (t.kind === 'dummy') t.grab({ drop: () => (this.desk = null) }, null);
          else t.held = true;
        }
      } else if (this.desk) {
        const t = this.desk.t;
        const target = _v.copy(inp.head).addScaledVector(inp.headDir, 1.4).add(new THREE.Vector3(0, -0.2, 0));
        if (t.kind === 'dummy') t.holdAt(target);
        else t.pos.lerp(target, 1 - Math.exp(-dt * 15));
        if (!down || !t.alive) {
          const v = inp.headDir.clone().multiplyScalar(11).add(new THREE.Vector3(0, 2, 0));
          if (t.kind === 'dummy') t.release(v);
          else {
            t.held = false;
            t.impulse(v);
          }
          this.desk = null;
        }
      }
    }
  }

  /** 마허라(빙의)의 힘: 박기 · 뜯기 배율 */
  _mighty() {
    return !!this.ctx.character?.possessed;
  }

  /** 벽 · 물체 속이거나 맵 끝인가 */
  _inWall(p, m = 0.15) {
    const env = this.ctx.env;
    const b = env.bounds;
    if (b && (p.x < b.minX + m || p.x > b.maxX - m || p.z < b.minZ + m || p.z > b.maxZ - m)) return true;
    for (const c of env.colliders ?? []) {
      if (p.y > (c.maxY ?? 99)) continue;
      if (p.x > c.minX - m && p.x < c.maxX + m && p.z > c.minZ - m && p.z < c.maxZ + m) return true;
    }
    return false;
  }

  /** 잡은 채로 땅이나 벽에 세게 박으면 피해 (마허라는 훨씬 크게) */
  _slam(H, t, h) {
    const { world, fx, sfx } = this.ctx;
    if ((H.slamT ?? 0) > world.time || !t.alive) return;
    const sp = h.vel.length();
    if (sp < 3) return;
    const sc = t.scale ?? 1;
    const p = t.pinPos?.(this.by[h.side]) ?? t.center(_v);
    // 몸통이 닿는 곳: 잡은 관절에서 손이 움직이는 쪽으로 조금 앞
    const lead = _v2.copy(t.center(_v3)).addScaledVector(h.vel, 0.04);
    const ground = (lead.y < 0.3 * sc || p.y < 0.2 * sc) && h.vel.y < -2.5;
    const wall = this._inWall(lead, 0.1) && h.vel.clone().setY(0).length() > 3;
    if (!ground && !wall) return;
    H.slamT = world.time + 0.35;
    const k = this._mighty() ? 3.2 : 1;
    const dmg = sp * 9 * k;
    t.damage(dmg, { type: 'impact', dir: h.vel.clone().normalize(), point: lead.clone(), color: '#ffffff' });
    fx.burst(lead, Math.round(16 * k), new THREE.Color(0xd8d0c0), 3 + k, 0.06, 0.5);
    fx.shockwave?.(lead, new THREE.Color(0xd8d0c0), 0.8 * k, 0.35);
    sfx.play('punch_3', { at: lead, vol: Math.min(1, 0.5 + sp * 0.06), rate: this._mighty() ? 0.55 : 0.85 });
    sfx.rumble?.(0.2 * k, 0.25);
    h.pulse?.(1, 80);
    this.ctx.game.hitstop = Math.max(this.ctx.game.hitstop ?? 0, 0.04 * k);
  }

  /** 두 손으로 같은 적을 잡고 세게 벌리면 그 사이가 뜯겨 나간다 (마허라의 괴력) */
  _tear() {
    const A = this.held.left;
    const B = this.held.right;
    if (!A || !B || A.t !== B.t || A.t.kind !== 'dummy' || !A.t.alive) return;
    const t = A.t;
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    const d = L.palm.distanceTo(R.palm);
    A.d0 ??= d;
    const dir = _v.subVectors(R.palm, L.palm).normalize();
    const apart = _v2.subVectors(R.vel, L.vel).dot(dir);
    const need = this._mighty() ? 0.3 : 0.6;
    if (d - A.d0 < need * (t.scale ?? 1) || apart < (this._mighty() ? 2 : 4)) return;
    if (!this._mighty() && t.hp > t.maxHp * 0.25) return; // 사람 힘으로는 다 죽어 가는 적만
    const pa = t.pinPos(this.by.left) ?? L.palm;
    const pb = t.pinPos(this.by.right) ?? R.palm;
    const mid = _v3.addVectors(pa, pb).multiplyScalar(0.5);
    const n = _v2.subVectors(pb, pa).normalize();
    const { fx, sfx, ui } = this.ctx;
    t.damage(99999, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, mid), color: '#ff2020', push: n.clone().multiplyScalar(0.5) });
    fx.burst(mid, 40, new THREE.Color(0x9a0a0a), 4, 0.06, 0.6);
    sfx.play('shatter_2', { at: mid, vol: 0.9, rate: 0.6 });
    L.pulse?.(1, 120);
    R.pulse?.(1, 120);
    if (!this._toldTear) {
      this._toldTear = true;
      ui.callout('뜯어냈다', { color: '#ff8080', dur: 1 });
    }
  }

  _grab(side, t, h) {
    let offset = new THREE.Vector3();
    if (t.kind === 'dummy') {
      // 손에 가장 가까운 관절을 잡는다 (손바닥에서 조금만 떨어지게)
      offset = t.grab(this.by[side], h.palm);
      if (!offset) return;
      // 손이 몸을 뚫지 않게: 관절은 손바닥에서 몸 두께만큼 떨어져 있다 (손은 겉면을 쥔다)
      if (offset.lengthSq() < 1e-6) offset.copy(h.palmNormal ?? h.dir).multiplyScalar(0.1);
      // 마허라의 큰 손은 더 떨어져서 쥔다
      const big = this._mighty() ? 1.9 : 1;
      offset.setLength(THREE.MathUtils.clamp(offset.length(), 0.085, 0.15) * (t.scale ?? 1) * big);
    } else {
      offset.subVectors(t.pos, h.palm);
      t.held = true;
      t.asleep = false;
    }
    this.held[side] = { t, offset };
    h.pulse(0.6, 60);
    this.ctx.sfx.play('grab', { at: h.palm, vol: 0.8 });
  }

  _release(side, vel) {
    const H = this.held[side];
    if (!H) return;
    this.held[side] = null;
    const t = H.t;
    if (vel.length() > 18) vel.setLength(18);
    if (t.kind === 'dummy') {
      if (t.heldBy) t.release(vel, this.by[side]);
    } else {
      t.held = false;
      t.vel.copy(vel);
      t.asleep = false;
      t.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(vel.length());
    }
  }

  releaseAll() {
    for (const s of ['left', 'right']) this._release(s, new THREE.Vector3());
    if (this.desk) {
      const t = this.desk.t;
      if (t.kind === 'dummy') t.release(new THREE.Vector3());
      else t.held = false;
      this.desk = null;
    }
  }
}
