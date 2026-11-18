// 잡기 · 던지기 (모든 캐릭터 공통)
// 핸드트래킹: 더미(또는 소품)에 손을 대고 주먹 쥐기 → 잡기, 손을 펴면 놓기(손의 속도로 던짐)
// 컨트롤러: 그립 / 데스크톱: T 키
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Grab {
  constructor(ctx) {
    this.ctx = ctx;
    this.held = { left: null, right: null };
    this.desk = null;
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
        const t = world.nearestTarget(h.palm, 0.13, (x) => !x.heldBy && !x.held && !x.dying && !x.noGrab);
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
        if (t.kind === 'dummy') t.holdAt(target);
        else t.pos.lerp(target, 1 - Math.exp(-dt * 25));
        if (release) this._release(side, h.vel.clone().multiplyScalar(1.7));
      }
    }
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

  _grab(side, t, h) {
    let offset = new THREE.Vector3();
    if (t.kind === 'dummy') {
      // 손에 가장 가까운 관절을 잡는다 (손바닥에서 조금만 떨어지게)
      offset = t.grab({ drop: () => this._release(side, new THREE.Vector3()) }, h.palm);
      if (!offset) return;
      if (offset.length() > 0.06) offset.setLength(0.06);
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
      if (t.heldBy) t.release(vel);
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
