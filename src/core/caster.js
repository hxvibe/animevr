// 술사 캐릭터 공통: 주력 · 바라보는 대상/지점 · 손동작 유지 시간 · 늦게 실행 · 영역전개 진행
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Caster {
  constructor(ctx, { id, name, energy = 100 } = {}) {
    this.ctx = ctx;
    this.id = id;
    this.name = name;
    this.energy = energy;
    this.maxEnergy = energy;
    this.pending = [];
    this.holds = {};
    this.time = 0;
    this.domain = { cd: 0, t: 0, duration: 18, sign: 0 };
  }

  spend(x) {
    if (this.energy < x) {
      this.denied();
      return false;
    }
    this.energy -= x;
    return true;
  }

  denied(msg = '주력 부족') {
    if (this._deniedT && this._deniedT > performance.now()) return;
    this._deniedT = performance.now() + 1500;
    this.ctx.sfx.denied();
    this.ctx.ui.callout(msg, { color: '#ff8a8a' });
  }

  flatFwd(out = new THREE.Vector3()) {
    out.copy(this.ctx.input.headDir).setY(0);
    if (out.lengthSq() < 1e-4) out.set(0, 0, -1);
    return out.normalize();
  }

  /** 시선(또는 dir) 원뿔 안에서 가장 가까운 대상 */
  gazeTarget(from = this.ctx.input.head, dir = this.ctx.input.headDir, cone = 0.3, maxD = 30, all = true) {
    let best = null;
    let bs = cone;
    for (const t of all ? this.ctx.world.targets() : this.ctx.world.enemies()) {
      if (!t.alive || t.dying) continue;
      const rel = _v.subVectors(t.center(_v2), from);
      const along = rel.dot(dir);
      if (along < 0.3 || along > maxD) continue;
      const s = rel.addScaledVector(dir, -along).length() / along;
      if (s < bs) {
        bs = s;
        best = t;
      }
    }
    return best;
  }

  /** 바라보는 바닥 지점 */
  gazePoint(maxD = 12, out = new THREE.Vector3()) {
    const inp = this.ctx.input;
    const d = inp.headDir;
    if (d.y < -0.04) {
      const k = Math.min(maxD, inp.head.y / -d.y);
      return out.copy(inp.head).addScaledVector(d, k).setY(0);
    }
    return out.copy(inp.head).addScaledVector(this.flatFwd(_v), maxD * 0.5).setY(0);
  }

  /** 반직선에 처음 걸리는 대상과 거리 */
  rayTarget(from, dir, maxD = 25, pad = 0.15) {
    let best = null;
    let bd = maxD;
    for (const t of this.ctx.world.targets()) {
      if (!t.alive) continue;
      const c = t.center(_v2);
      const along = _v.subVectors(c, from).dot(dir);
      if (along < 0 || along > bd) continue;
      const r = (t.kind === 'dummy' ? 0.35 * (t.scale ?? 1) : t.radius ?? 0.3) + pad;
      const off = _v.subVectors(c, from).addScaledVector(dir, -along).length();
      if (off < r) {
        bd = along;
        best = t;
      }
    }
    return { t: best, d: bd };
  }

  /** 조건을 hold 초 동안 지키면 true 를 한 번 (떼야 다시) */
  held(key, cond, dt, hold) {
    const H = (this.holds[key] ??= { t: 0, lock: false });
    if (!cond) {
      H.t = 0;
      H.lock = false;
      return false;
    }
    if (H.lock) return false;
    H.t += dt;
    if (H.t >= hold) {
      H.lock = true;
      return true;
    }
    return false;
  }

  holdK(key, hold) {
    const H = this.holds[key];
    return H && !H.lock ? Math.min(1, H.t / hold) : 0;
  }

  later(t, fn) {
    this.pending.push({ t, fn });
  }

  tickCommon(dt, regen = 10) {
    this.time += dt;
    this.energy = Math.min(this.maxEnergy, this.energy + regen * dt);
    this.domain.cd = Math.max(0, this.domain.cd - dt);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        p.fn();
      }
    }
  }

  /** 영역전개 시작 (shell: ShellDomain) */
  openDomain(shell, { cost = 50, name, ruby, color = '#ffffff', duration = 18 } = {}) {
    const { input: inp, ui, sfx, world } = this.ctx;
    if (shell.state !== 'idle' || this.domain.cd > 0) {
      ui.callout('영역전개 재사용 대기 중');
      return false;
    }
    if (!this.spend(cost)) return false;
    shell.start(inp.head);
    this.domain.t = 0;
    this.domain.duration = duration;
    world.domain = { center: shell.center, radius: shell.radius, freeze: false };
    ui.manga({ top: '領域展開', main: name, ruby, color, big: true });
    sfx.rumble(2, 0.5);
    sfx.play('domain_open', { vol: 0.9 });
    inp.left.pulse?.(1, 400);
    inp.right.pulse?.(1, 400);
    return true;
  }

  /** 영역 진행: 끝나면 닫는다. 열려 있으면 true */
  runDomain(shell, dt) {
    shell.update(dt);
    if (shell.state !== 'active') return false;
    this.domain.t += dt;
    if (this.domain.t >= this.domain.duration) {
      shell.stop();
      this.domain.cd = 12;
      this.ctx.world.domain = null;
      return false;
    }
    return true;
  }

  closeDomain(shell) {
    shell.cancel();
    this.ctx.world.domain = null;
  }

  /** 영역 안의 적 */
  inDomain(shell) {
    return this.ctx.world.targets().filter((t) => t.alive && !t.dying && shell.contains(t.center(_v)));
  }
}
