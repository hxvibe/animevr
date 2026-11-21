// 잡기 · 던지기 (모든 캐릭터 공통)
// 핸드트래킹: 더미(또는 소품)에 손을 대고 주먹 쥐기 → 잡기, 손을 펴면 놓기(손의 속도로 던짐)
// 컨트롤러: 그립 / 데스크톱: T 키
import * as THREE from 'three';
import { RAG } from './dummy.js';
import { PART_NAME } from './dismember.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _bloodC = new THREE.Color(0x5a0508);

/** 잡은 관절 → 뜯겨 나갈 부위 ('torso' = 몸통) */
function tearPart(pin) {
  const k = RAG[pin];
  if (k === 'head') return 'head';
  if (k === 'shL' || k === 'elL' || k === 'hdL') return 'shL';
  if (k === 'shR' || k === 'elR' || k === 'hdR') return 'shR';
  if (k === 'hpL' || k === 'knL' || k === 'ftL') return 'hpL';
  if (k === 'hpR' || k === 'knR' || k === 'ftR') return 'hpR';
  return 'torso';
}

export class Grab {
  constructor(ctx) {
    this.ctx = ctx;
    this.held = { left: null, right: null };
    this.desk = null;
    // 손마다 잡는 주체 (두 손으로 같은 적의 서로 다른 관절을 잡을 수 있다)
    this.by = {
      left: { side: 'left', drop: () => this._release('left', new THREE.Vector3()), onLimb: (p) => this._takePiece('left', p) },
      right: { side: 'right', drop: () => this._release('right', new THREE.Vector3()), onLimb: (p) => this._takePiece('right', p) },
    };
    this.tearS = null; // 뜯는 중인 상태
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
        else if (H.offL && t.obj) {
          // 소품 · 떨어진 팔다리: 손을 따라 함께 돈다 (쥔 순간의 자세를 손 기준으로 기억)
          target.copy(H.offL).applyQuaternion(h.quat).add(h.palm);
          t.pos.lerp(target, 1 - Math.exp(-dt * 25));
          t.obj.quaternion.slerp(_q.multiplyQuaternions(h.quat, H.rel), 1 - Math.exp(-dt * 25));
          t.vel.copy(h.vel); // 휘두르면 그 속도로 부딪힌다 (몽둥이처럼)
        } else t.pos.lerp(target, 1 - Math.exp(-dt * 25));
        if (t.kind === 'dummy') this._slam(H, t, h);
        if (release) this._release(side, h.vel.clone().multiplyScalar(1.7));
      }
    }
    this._tear(dt);
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

  /**
   * 뜯기: 두 손으로 같은 적의 다른 부위를 잡고 벌린다
   *  · 한 손은 몸통, 한 손은 팔·다리 → 그 팔·다리가 관절에서 뜯겨 나간다 (그 손엔 뜯긴 부위가 남는다)
   *  · 두 손이 서로 다른 팔·다리 → 둘 다 뜯긴다 (양팔을 잡고 벌리면 양팔 모두)
   *  · 머리를 잡아당기면 머리가 뽑혀 죽는다 · 두 손 모두 몸통(마허라) → 몸이 두 동강 난다
   *  벌릴수록 손에 떨림이 커지고 삐걱대는 소리와 핏방울이 나다가, 한계를 넘겨 잠깐 버티면(또는 홱 당기면) 뜯긴다.
   *  사람 힘으로는 다 죽어 가는 적(체력 30% 이하)만 — 마허라는 언제든 쉽게
   */
  _tear(dt) {
    const A = this.held.left;
    const B = this.held.right;
    if (!A || !B || A.t !== B.t || A.t.kind !== 'dummy' || !A.t.alive || A.t.dying) {
      this.tearS = null;
      return;
    }
    const t = A.t;
    const pa = t.holders?.get(this.by.left);
    const pb = t.holders?.get(this.by.right);
    if (pa === undefined || pb === undefined) return;
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    const d = L.palm.distanceTo(R.palm);
    const key = pa + ':' + pb;
    let S = this.tearS;
    if (!S || S.key !== key || S.t !== t) {
      S = this.tearS = { key, t, d0: d, hold: 0, tick: 0, creak: 0, told: false };
      return;
    }
    const partA = tearPart(pa);
    const partB = tearPart(pb);
    const mighty = this._mighty();
    let parts;
    if (partA === 'torso' && partB === 'torso') {
      if (!mighty) return;
      parts = ['split'];
    } else if (partA === partB) return; // 같은 팔(팔꿈치와 손 등)
    else parts = [partA, partB].filter((p) => p !== 'torso');
    const sc = t.scale ?? 1;
    const legs = parts.some((p) => p.startsWith('hp'));
    const need = (mighty ? 0.2 : 0.35) * sc * (legs ? 1.3 : parts[0] === 'split' ? 1.5 : 1);
    const allowed = mighty || (!t.infinite && t.hp <= t.maxHp * 0.3);
    let k = Math.max(0, (d - S.d0) / need);
    if (!allowed) k = Math.min(k, 0.75);
    const { fx, sfx, ui } = this.ctx;
    // 당기는 맛: 손 떨림 · 삐걱 · 몸이 붉게 · 관절에서 피가 맺힌다 · 몸부림
    const J = t._jointMap();
    const roots = parts[0] === 'split' ? [] : parts;
    if (k > 0.12) {
      S.tick -= dt;
      if (S.tick <= 0) {
        S.tick = 0.05;
        const amp = 0.12 + 0.6 * Math.min(1, k);
        L.pulse?.(amp, 45);
        R.pulse?.(amp, 45);
      }
      t._strain = Math.max(t._strain ?? 0, Math.min(1, k));
      if (t.rag) for (let i = 0; i < t.rag.v.length; i++) t.rag.v[i].add(_v3.randomDirection().multiplyScalar(0.5 * Math.min(1, k)));
    }
    if (k > 0.3) {
      S.creak -= dt;
      if (S.creak <= 0) {
        S.creak = 0.24 - 0.12 * Math.min(1, k);
        const at = roots.length ? J[roots[0]].getWorldPosition(_v3) : t.center(_v3);
        sfx.noise?.({ dur: 0.14, vol: 0.06 + 0.16 * Math.min(1, k), f0: 950 - 350 * Math.min(1, k), f1: 180, q: 7, type: 'bandpass', at });
      }
    }
    if (k > 0.55) {
      for (const r of roots) {
        if (Math.random() > dt * 40 * k) continue;
        const p = J[r].getWorldPosition(_v3);
        fx.spawnDark(p, _v2.randomDirection().multiplyScalar(0.5).add(_v.set(0, 0.4, 0)), _bloodC, 0.02 + Math.random() * 0.02, 0.6, 0.6, 9.8);
      }
    }
    if (!allowed && k >= 0.75 && !S.told) {
      S.told = true;
      if (!this._toldWeak || this._toldWeak < this.ctx.world.time) {
        this._toldWeak = this.ctx.world.time + 6;
        ui.callout('꿈쩍도 않는다 — 사람 힘으로는 다 죽어 가는 적(체력 30% 이하)만 뜯어낸다 · 마허라는 언제든', { color: '#ffb0a0', dur: 2 });
      }
    }
    S.hold = k >= 1 ? S.hold + dt : Math.max(0, S.hold - dt * 2);
    const dir = _v.subVectors(R.palm, L.palm).normalize();
    const apart = _v2.subVectors(R.vel, L.vel).dot(dir);
    const snap = allowed && k >= 1 && (S.hold >= (mighty ? 0.1 : 0.25) || apart > (mighty ? 1.5 : 3));
    if (!snap) return;
    this.tearS = null;
    // ── 뜯긴다 ──
    const mid = t.center(new THREE.Vector3());
    if (parts[0] === 'split') {
      const a = t.pinPos(this.by.left) ?? L.palm;
      const b = t.pinPos(this.by.right) ?? R.palm;
      mid.addVectors(a, b).multiplyScalar(0.5);
      const n = _v2.subVectors(b, a).normalize();
      t.damage(99999, { type: 'slash', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, mid), color: '#ff2020', push: n.clone().multiplyScalar(0.5) });
      fx.burst(mid, 40, _bloodC, 4, 0.06, 0.6, { dark: true, grav: 9 });
    } else {
      const handOf = (r) => (tearPart(pa) === r ? L : R);
      const names = [];
      parts.sort((x, y) => (x === 'head') - (y === 'head')); // 머리는 마지막에 (먼저 죽으면 다른 손이 놓친다)
      for (const r of parts) {
        if (!t.alive) break;
        const h = handOf(r);
        const at = J[r].getWorldPosition(new THREE.Vector3());
        const vel = h.vel.clone().clampLength(0, 6);
        const p = t.sever(r, { vel, cause: 'tear', dmg: r === 'head' ? 0 : t.maxHp * (mighty ? 0.25 : 0.2), spurt: 1.6, spin: 2, noDeath: true });
        if (p) {
          names.push(PART_NAME[r]);
          fx.burst(at, 30, _bloodC, 3.2, 0.05, 0.7, { dark: true, grav: 9, dir: _v2.subVectors(at, mid).normalize(), dirAmt: 0.8 });
          mid.copy(at);
        }
      }
      // 머리를 잃었거나 숨이 다했다 → 피를 쏟으며 쓰러진다
      if (t.alive && (t.lostRoots?.has('head') || (!t.infinite && t.hp <= 0))) t.bleedOut();
      if (names.length && !this._toldTear) {
        this._toldTear = true;
        ui.callout(`뜯어냈다 — ${names.join(' · ')} (쥔 부위는 휘두르거나 던질 수 있다)`, { color: '#ff8080', dur: 1.6 });
      }
    }
    sfx.play('punch_3', { at: mid, vol: 1, rate: mighty ? 0.45 : 0.6 });
    sfx.play('shatter_2', { at: mid, vol: 0.45, rate: 0.45 });
    sfx.noise?.({ dur: 0.38, vol: 0.5, f0: 1600, f1: 110, q: 1.2, type: 'lowpass', at: mid });
    sfx.rumble?.(0.15, 0.3);
    L.pulse?.(1, 140);
    R.pulse?.(1, 140);
    this.ctx.game.hitstop = Math.max(this.ctx.game.hitstop ?? 0, mighty ? 0.09 : 0.07);
  }

  /** 떨어져 나간 부위를 그 손에 쥐어 준다 (뜯기 · 잡은 부위가 잘렸을 때) */
  _takePiece(side, p) {
    const h = this.ctx.input[side];
    this.held[side] = null;
    if (!p?.alive || !h.active) return;
    const offset = _v.subVectors(p.pos, h.palm).clone();
    this.held[side] = { t: p, offset, offL: offset.clone().applyQuaternion(_q.copy(h.quat).invert()), rel: _q.clone().multiply(p.obj.quaternion) };
    p.held = true;
    p.asleep = false;
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
    if (t.kind !== 'dummy' && t.obj) {
      _q.copy(h.quat).invert();
      this.held[side].offL = offset.clone().applyQuaternion(_q);
      this.held[side].rel = _q.clone().multiply(t.obj.quaternion);
    }
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
