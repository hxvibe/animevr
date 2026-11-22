// 잡기 · 던지기 (모든 캐릭터 공통)
// 핸드트래킹: 더미(또는 소품)에 손을 대고 주먹 쥐기 → 잡기, 손을 펴면 놓기(손의 속도로 던짐)
// 컨트롤러: 그립 / 데스크톱: T 키
import * as THREE from 'three';
import { RAG, RAD } from './dummy.js';
import { PART_NAME } from './dismember.js';
import { gripPoint } from './body.js';
import { onGrabStuck, holdStuck, afterHoldStuck, onReleaseStuck } from './stab.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _bloodC = new THREE.Color(0x5a0508);
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HAND_R = 0.035; // 손(손바닥 · 손가락) 두께

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
    // 손마다 쥔 것의 두께(반지름, m): 손가락이 그만큼만 접힌다 (null = 빈손)
    this.gripR = { left: null, right: null };
  }

  /** 다른 기능(메구미의 그림자 등)이 꺼낸 물건을 그 손에 바로 쥐여 준다 */
  hold(side, t, h) {
    if (this.held[side] || !t?.alive) return false;
    this._grab(side, t, h ?? this.ctx.input[side]);
    return !!this.held[side];
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
        const other = this.held[side === 'left' ? 'right' : 'left']?.t;
        // 받기: 주먹을 쥔(그립을 쥔) 채로 날아오는 물체(던진 칼 등)가 손에 닿으면 붙잡는다
        if (!want) {
          const closed = h.source === 'hand' ? h.gesture === 'fist' : h.btn.grip;
          // 방금 놓은 손은 잠깐 받지 않는다 (던지자마자 다시 쥐지 않게)
          if (!closed || world.time - (this._relT?.[side] ?? -9) < 0.3) continue;
          const fly = world.nearestTarget(h.palm, 0.1, (x) => x.kind !== 'dummy' && !x.held && !x.noGrab && !x.asleep && x.vel?.lengthSq() > 2);
          if (fly && this._canLift(fly, h)) this._grab(side, fly, h);
          continue;
        }
        if (h.speed > 1.6) continue;
        // 다른 손이 이미 잡은 적도 한 손 더 잡을 수 있다 (두 손 잡기) · 날붙이도 두 손으로
        const foes = this.canGrabFoes();
        const t = world.nearestTarget(h.palm, this._mighty() ? 0.26 : 0.13, (x) => !x.dying && !x.noGrab && (x.kind === 'dummy' ? foes && (!x.heldBy || (x === other && (x.holdCount?.() ?? 1) < 2)) : !x.held || (x.weapon && x === other)));
        if (t && t.kind !== 'dummy' && !this._canLift(t, h)) continue;
        if (t) this._grab(side, t, h);
      } else {
        const t = H.t;
        if (!t.alive) {
          this.held[side] = null;
          this.gripR[side] = null;
          continue;
        }
        const release = !h.active || (h.source === 'hand' ? h.gesture !== 'fist' && h.gestureTime > 0.05 : !h.btn.grip);
        // 손을 따라감 (더미는 잡은 관절만 손에 붙고 나머지는 중력에 늘어진다)
        const target = _v.copy(h.palm).add(H.offset);
        if (t.kind === 'dummy') {
          // 쥔 자리는 손을 따라 돈다: 손을 돌려도 손바닥이 몸 겉면에 남는다 (몸 속으로 파고들지 않게)
          if (H.offL) target.copy(H.offL).applyQuaternion(h.quat).add(h.palm);
          if (H.headTear) this._headTear(side, H, t, h, target, dt);
          else t.holdAt(target, this.by[side], h.quat);
        }
        else if (H.weapon) this._holdWeapon(side, H, t, h, dt);
        else if (H.offL && t.obj) {
          // 소품 · 떨어진 팔다리: 손을 따라 함께 돈다 (쥔 순간의 자세를 손 기준으로 기억)
          // 무거울수록 손을 굼뜨게 따라온다 (들 수 있는 무게에 가까울수록)
          const rate = 25 / (1 + (2 * (t.kg ?? 0)) / this._liftKg());
          target.copy(H.offL).applyQuaternion(h.quat).add(h.palm);
          const prev = (H.prev ??= t.pos.clone());
          prev.copy(t.pos);
          t.pos.lerp(target, 1 - Math.exp(-dt * rate));
          t.obj.quaternion.slerp(_q.multiplyQuaternions(h.quat, H.rel), 1 - Math.exp(-dt * rate));
          // 휘두르면 실제로 움직인 속도로 부딪힌다 (몽둥이처럼 · 차로 후려치기)
          if (dt > 0) t.vel.lerp(_v2.subVectors(t.pos, prev).divideScalar(dt), 0.6);
        } else t.pos.lerp(target, 1 - Math.exp(-dt * 25));
        if (t.kind === 'dummy') this._slam(H, t, h);
        if (release) this._release(side, h.vel.clone().multiplyScalar(1.7));
      }
    }
    this._tear(dt);
    this._block(dt);
    // 데스크톱
    if (inp.mode === 'desktop') {
      const down = inp.keyDown('KeyT');
      if (down && !this.desk) {
        // 조준선 근처 5m 이내에서 가장 가까운 대상
        let t = null;
        let best = Infinity;
        for (const x of world.targets()) {
          if (x.heldBy || x.held || x.dying || x.noGrab) continue;
          if (x.kind === 'dummy' && !this.canGrabFoes()) continue;
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
        if (t && t.kind !== 'dummy' && !this._canLift(t, inp.right)) t = null;
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

  /** 손바닥 가운데 (월드): 마허라의 큰 손은 손가락 쪽으로 6cm 더 나가 있다 */
  _palmPoint(h, out) {
    out.copy(h.palm);
    if (this._mighty()) out.addScaledVector(h.source === 'hand' ? h.fingersDir : h.dir, 0.06);
    return out;
  }

  /** 손바닥 두께 (반) */
  _palmThick() {
    return this._mighty() ? 0.045 : 0.025;
  }

  /** 들 수 있는 무게(kg): 마허라는 차도 번쩍 · 이타도리·스쿠나는 장사 · 나머지는 사람 힘 */
  _liftKg() {
    const c = this.ctx.character;
    if (c?.possessed) return 3000;
    return { itadori: 300, sukuna: 500 }[c?.id] ?? 60;
  }

  /** 이 물체를 들 수 있나 (못 들면 알려 준다) */
  _canLift(t, h) {
    const kg = t.kg ?? 0;
    const cap = this._liftKg();
    if (kg <= cap) return true;
    if (!((this._heavyT ?? -9) > this.ctx.world.time)) {
      this._heavyT = this.ctx.world.time + 2.5;
      const name = t.label ? `${t.label} ` : '';
      this.ctx.ui.callout(`꿈쩍도 않는다 — ${name}${Math.round(kg).toLocaleString()}kg (들 수 있는 무게 ${cap}kg · 마허라라면 든다)`, { color: '#ffb0a0', dur: 1.8 });
      h?.pulse?.(0.9, 120);
    }
    return false;
  }

  /** 고죠의 무량공처 안에서 정보에 굳은 적인가 */
  _voidFrozen(t) {
    return this.ctx.character?.id === 'gojo' && !!this.ctx.world.domain?.freeze && !!t.frozen;
  }

  /**
   * 무량공처 머리 뜯기: 머리만 조금(10cm) 딸려 오고 발은 땅에 붙은 채, 손이 멀어질수록 목이 당겨진다.
   *  당길수록 진동 · 삐걱 · 붉어짐 · 목에 맺히는 핏방울 → 30cm 넘게 당긴 채 잠깐 버티거나 홱 당기면 머리가 뜯겨 손에 남는다
   */
  _headTear(side, H, t, h, target, dt) {
    const S = H.headTear;
    const by = this.by[side];
    const sc = t.scale ?? 1;
    const pull = _v3.subVectors(target, S.p0);
    const dist = pull.length();
    // 머리는 조금만 따라온다
    t.holdAt(_v2.copy(S.p0).add(pull.clampLength(0, 0.1 * sc)), by, h.quat);
    const k = dist / (0.3 * sc);
    const { fx, sfx } = this.ctx;
    const neck = t._jointMap().neck.getWorldPosition(new THREE.Vector3());
    if (k > 0.12) {
      S.tick -= dt;
      if (S.tick <= 0) {
        S.tick = 0.05;
        h.pulse?.(0.12 + 0.6 * Math.min(1, k), 45);
      }
      t._strain = Math.max(t._strain ?? 0, Math.min(1, k));
    }
    if (k > 0.3) {
      S.creak -= dt;
      if (S.creak <= 0) {
        S.creak = 0.24 - 0.12 * Math.min(1, k);
        sfx.noise?.({ dur: 0.14, vol: 0.06 + 0.16 * Math.min(1, k), f0: 950 - 350 * Math.min(1, k), f1: 180, q: 7, type: 'bandpass', at: neck });
      }
    }
    if (k > 0.55 && Math.random() < dt * 40 * k) fx.spawnDark(neck, _v.randomDirection().multiplyScalar(0.5).add(_v2.set(0, 0.4, 0)), _bloodC, 0.02 + Math.random() * 0.02, 0.6, 0.6, 9.8);
    S.hold = k >= 1 ? S.hold + dt : Math.max(0, S.hold - dt * 2);
    const yank = h.vel.dot(pull.lengthSq() > 1e-6 ? _v.copy(pull).normalize() : _v.set(0, 1, 0));
    if (!(k >= 1 && (S.hold >= 0.12 || yank > 2.5))) return;
    // ── 뜯긴다 ──
    H.headTear = null;
    t.anchorFeet(false);
    const p = t.sever('head', { vel: h.vel.clone().clampLength(0, 5), cause: 'tear', spurt: 1.8, spin: 2 });
    if (!p) return;
    fx.burst(neck, 34, _bloodC, 3.4, 0.05, 0.7, { dark: true, grav: 9, dir: _v.set(0, 1, 0), dirAmt: 0.8 });
    sfx.play('punch_3', { at: neck, vol: 1, rate: 0.55 });
    sfx.play('shatter_2', { at: neck, vol: 0.45, rate: 0.45 });
    sfx.noise?.({ dur: 0.38, vol: 0.5, f0: 1600, f1: 110, q: 1.2, type: 'lowpass', at: neck });
    h.pulse?.(1, 140);
    this.ctx.game.hitstop = Math.max(this.ctx.game.hitstop ?? 0, 0.08);
  }

  /** 적을 붙잡을 수 있는가: 고죠 사토루 · 마히토 · 마허라(빙의)만 (다른 캐릭터는 물체만 집는다) */
  canGrabFoes() {
    const c = this.ctx.character;
    return !!c && (c.possessed ? true : c.id === 'gojo' || c.id === 'mahito');
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
    t.knock?.(0.4 + (sp * k) / 6); // 내리꽂힌 적은 한참 못 일어난다
    t.damage(dmg, { type: 'impact', dir: h.vel.clone().normalize(), point: lead.clone(), color: '#ffffff' });
    fx.burst(lead, Math.round(16 * k), new THREE.Color(0xd8d0c0), 3 + k, 0.06, 0.5);
    // 바닥이 패이고 벽이 부서진다
    const im = world.impacts;
    if (im) {
      const str = 0.35 + (sp * k) / 9;
      if (ground) im.floor(_v3.set(lead.x, Math.max(0, lead.y - 0.3 * sc), lead.z), str);
      else im.wall(lead, _v3.copy(h.vel).setY(0), str);
    }
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
    this.gripR[side] = Math.min(0.06, (p.radius ?? 0.06) * 0.6);
    p.held = true;
    p.asleep = false;
  }

  _grab(side, t, h) {
    let offset = new THREE.Vector3();
    if (t.kind === 'dummy') {
      const wasStanding = t.state === 'stand';
      // 손에 가장 가까운 관절을 잡는다 (손바닥에서 조금만 떨어지게)
      // 손바닥 (마허라의 큰 손은 손바닥이 손가락 쪽으로 더 나가 있다)
      const P = this._palmPoint(h, _v3);
      offset = t.grab(this.by[side], P);
      if (!offset) return;
      // 겉면을 쥔다: 잡힌 부위의 중심은 손바닥에서 (부위 두께 + 손바닥 두께)만큼 손바닥이 향한 쪽에 있다
      //  (머리를 쥐면 손바닥이 머리 겉에 닿고 손가락이 머리를 감싼다 — 손이 머리 속에 묻히지 않게)
      const key = RAG[t.holders.get(this.by[side])];
      const r = (RAD[key] ?? 0.1) * (t.scale ?? 1);
      const toJ = _v2.copy(offset).add(P).sub(h.palm);
      const pn = _n.copy(h.palmNormal ?? h.dir).normalize();
      const dir = toJ.lengthSq() > 1e-6 && toJ.clone().normalize().dot(pn) < 0.3 ? toJ.normalize() : pn;
      offset = _v.subVectors(P, h.palm).addScaledVector(dir, r + this._palmThick()).clone();
      this.gripR[side] = r;
      this.held[side] = { t, offset, offL: offset.clone().applyQuaternion(_q.copy(h.quat).invert()) };
      // 무량공처: 정보에 굳은 적의 머리를 한 손으로 쥐었다 → 발이 땅에 붙은 채 당겨지다 머리가 뜯긴다
      if (RAG[t.holders?.get(this.by[side])] === 'head' && wasStanding && this._voidFrozen(t)) {
        t.anchorFeet(true);
        this.held[side].headTear = { p0: t.rag.p[t.holders.get(this.by[side])].clone(), hold: 0, tick: 0, creak: 0 };
        if (!this._toldVoid) {
          this._toldVoid = true;
          this.ctx.ui.callout('무량공처 — 굳은 몸은 버티지 못한다: 머리를 쥐고 당기면 뜯긴다', { color: '#9fe8ff', dur: 1.8 });
        }
      }
      h.pulse(0.6, 60);
      this.ctx.sfx.play('grab', { at: h.palm, vol: 0.8 });
      return;
    } else {
      offset.subVectors(t.pos, h.palm);
      // 겉면을 쥔다: 물체 겉면이 손바닥에 닿게 (손이 물체 속에 묻히거나 떠 있지 않게) — 날붙이는 손잡이를 감싸 쥔다
      if (!t.weapon && t.obj && t.he) {
        const P = this._palmPoint(h, _v3);
        const pen = this._penetrate(t, P, _n); // n: 물체 → 손바닥
        const gap = pen > 0 ? -pen : (() => {
          const cl = t.closest(P, new THREE.Vector3());
          _n.subVectors(P, cl);
          const d = _n.length();
          if (d > 1e-6) _n.divideScalar(d);
          return d - HAND_R - this._palmThick() * 0.3;
        })();
        if (_n.lengthSq() > 0.5) offset.addScaledVector(_n, gap);
        this.gripR[side] = Math.min(t.he.x, t.he.y, t.he.z);
      } else this.gripR[side] = 0.015;
      t.held = true;
      t.asleep = false;
    }
    this.held[side] = { t, offset };
    if (t.weapon) this._gripWeapon(side, t, h);
    else if (t.kind !== 'dummy' && t.obj) {
      _q.copy(h.quat).invert();
      this.held[side].offL = offset.clone().applyQuaternion(_q);
      this.held[side].rel = _q.clone().multiply(t.obj.quaternion);
    }
    h.pulse(0.6, 60);
    this.ctx.sfx.play('grab', { at: h.palm, vol: 0.8 });
  }

  // ───────────── 날붙이 쥐기 ─────────────
  /** 손의 쥐는 점 · 칼끝 방향(엄지 쪽) · 날 기준 방향 */
  _weaponGrip(h, out) {
    const inp = this.ctx.input;
    if (h.source === 'desktop') {
      out.G.copy(h.palm);
      out.dir.copy(inp.headDir).add(_w.set(0, 0.25, 0)).normalize();
      out.ref.copy(UP);
      return out;
    }
    gripPoint(h, this.ctx.rig, out.G);
    if (h.source === 'hand') {
      out.dir.crossVectors(h.fingersDir, h.palmNormal);
      if (h.side === 'left') out.dir.negate();
      out.ref.copy(h.fingersDir);
    } else {
      out.dir.copy(h.dir);
      out.ref.copy(UP);
    }
    out.dir.normalize();
    return out;
  }

  /**
   * 날붙이를 손이 닿은 자리 그대로 쥔다 (손잡이든 칼날이든). 칼끝은 언제나 엄지 쪽(앞) — 거꾸로 쥐어 칼날이 나를 향하지 않게.
   *  날이 향한 쪽(손가락 쪽/손등 쪽)은 쥔 순간의 모양을 따른다. 다른 손이 이미 쥐고 있으면 두 손 쥐기
   */
  _gripWeapon(side, t, h) {
    const H = this.held[side];
    const W = t.weapon;
    const g = this._weaponGrip(h, { G: new THREE.Vector3(), dir: new THREE.Vector3(), ref: new THREE.Vector3() });
    const A = _w.set(0, 1, 0).applyQuaternion(t.obj.quaternion);
    const other = this.held[side === 'left' ? 'right' : 'left'];
    H.second = !!(other && other.t === t);
    const y = THREE.MathUtils.clamp(_v.subVectors(g.G, t.pos).dot(A), W.lo, W.tip - 0.04);
    // 날이 향한 쪽: 지금 칼의 +X 와 가까운 쪽
    const X = _v2.set(1, 0, 0).applyQuaternion(t.obj.quaternion);
    const edge = _v3.copy(g.ref).addScaledVector(g.dir, -g.ref.dot(g.dir)).normalize().negate();
    H.weapon = { y, es: X.dot(edge) >= 0 ? 1 : -1, blend: 0, prevQ: t.obj.quaternion.clone(), prevP: t.pos.clone(), w: new THREE.Vector3() };
    H.offL = null;
    // 꽂혀 있던 칼: 적에 꽂혀 있으면 적을 칼에 꿴 채 쥔다
    if (!H.second && W.stuck) onGrabStuck(this.ctx, t);
    if (H.second && !this._told2) {
      this._told2 = true;
      this.ctx.ui.callout('두 손으로 쥐었다 — 두 손을 잇는 방향으로 칼이 선다', { color: '#c8d0ff', dur: 1.4 });
    }
  }

  _holdWeapon(side, H, t, h, dt) {
    const W = H.weapon;
    const oSide = side === 'left' ? 'right' : 'left';
    const O = this.held[oSide];
    const two = O && O.t === t && O.weapon;
    if (H.second) {
      if (two) return; // 두 손일 땐 먼저 쥔 손이 움직인다
      H.second = false; // 앞손이 놓았다 → 이 손이 이어받는다
      W.blend = 0;
    }
    const g = this._weaponGrip(h, (this._g1 ??= { G: new THREE.Vector3(), dir: new THREE.Vector3(), ref: new THREE.Vector3() }));
    const dir = _v.copy(g.dir);
    if (two) {
      // 두 손: 칼끝 쪽 손을 향해 칼이 선다 (두 쥔 점을 잇는 축)
      const g2 = this._weaponGrip(this.ctx.input[oSide], (this._g2 ??= { G: new THREE.Vector3(), dir: new THREE.Vector3(), ref: new THREE.Vector3() }));
      const d = _v2.subVectors(g2.G, g.G);
      if (d.length() > 0.05) {
        d.normalize();
        if (O.weapon.y < W.y) d.negate();
        // 앞손이 뒤로 밀려 엇갈리면 축이 뒤집힌다 → 그땐 한 손 방향을 그대로
        if (d.dot(g.dir) > -0.2) dir.copy(d);
      }
    }
    const edge = _v2.copy(g.ref).addScaledVector(dir, -g.ref.dot(dir));
    if (edge.lengthSq() < 1e-5) edge.set(1, 0, 0).addScaledVector(dir, -dir.x);
    edge.normalize().multiplyScalar(-W.es);
    const Z = _v3.crossVectors(edge, dir).normalize();
    _m.makeBasis(edge, dir, Z);
    _q.setFromRotationMatrix(_m);
    const target = _w.copy(g.G).addScaledVector(dir, -W.y);
    if (t.weapon.block) target.add(t.weapon.block); // 바닥 · 벽 · 몸에 막혀 있다
    // 꽂힌 칼: 박힌 채 움직이지 않거나(바닥 · 벽 · 무거운 물체) 꿰인 적 · 물체를 끌고 온다 (stab.js)
    if (t.weapon.stuck && holdStuck(this.ctx, t, h, target, this._liftKg())) {
      W.w.set(0, 0, 0);
      t.heldHand = h;
      return;
    }
    // 쥔 순간엔 지금 자세에서 손 자세로 부드럽게 (휙 순간이동하지 않게) · 무거울수록 굼뜨다 (꿰인 적의 몸무게까지)
    W.blend = Math.min(1, W.blend + dt * 7);
    const kgAll = (t.kg ?? 0) + (t.weapon.stuck ? t.weapon.extraKg ?? 0 : 0);
    const rate = (8 + 32 * W.blend) / (1 + (2 * kgAll) / this._liftKg());
    const k = 1 - Math.exp(-dt * rate);
    W.prevP.copy(t.pos);
    W.prevQ.copy(t.obj.quaternion);
    t.pos.lerp(target, k);
    t.obj.quaternion.slerp(_q, k);
    if (dt > 0) {
      t.vel.lerp(_n.subVectors(t.pos, W.prevP).divideScalar(dt), 0.5);
      // 각속도 (던질 때 손목 스냅이 그대로 회전이 된다)
      _q2.copy(t.obj.quaternion).multiply(W.prevQ.clone().invert());
      if (_q2.w < 0) _q2.set(-_q2.x, -_q2.y, -_q2.z, -_q2.w);
      W.w.lerp(_n.set(_q2.x, _q2.y, _q2.z).multiplyScalar(2 / dt), 0.5);
    }
    t.heldHand = h;
    if (t.weapon.stuck) afterHoldStuck(this.ctx, t);
  }

  // ───────────── 손이 물체를 뚫지 못하게 ─────────────
  /**
   * 빈손(과 다른 손에 든 물체)이 물체에 파고들면: 가벼운 물체는 손에 밀려나고(툭 치면 튕긴다),
   *  무겁거나 고정됐거나 다른 손에 쥔 물체면 보이는 손이 그 겉면에 멈춘다 (실제 손 위치 · 판정은 그대로)
   */
  _block(dt) {
    const inp = this.ctx.input;
    const props = this.ctx.world.props;
    const lift = this._liftKg();
    for (const h of inp.hands) {
      const off = (this._off ??= { left: new THREE.Vector3(), right: new THREE.Vector3() })[h.side].set(0, 0, 0);
      if (h.active && h.source !== 'desktop') {
        const mine = this.held[h.side]?.t;
        const pts = [h.palm, _v3.copy(h.palm).addScaledVector(h.fingersDir ?? h.dir, 0.075)];
        for (const p of props) {
          if (!p.alive || p.away || p === mine || !p.obj) continue;
          const reach = Math.max(p.he.x, p.he.y, p.he.z) * 1.8 + 0.2;
          if (p.center(_w).distanceToSquared(h.palm) > reach * reach) continue;
          for (const pt of pts) {
            const pen = this._penetrate(p, pt, _n);
            if (pen <= 0) continue;
            const movable = !p.held && !p.fixed && (p.kg ?? 0) <= lift * 0.5;
            if (movable) {
              p.pos.addScaledVector(_n, -pen);
              const vn = -h.vel.dot(_n);
              if (vn > 0) p.vel.addScaledVector(_n, (-vn * 1.3 * 5) / (5 + (p.kg ?? 1)));
              p.asleep = false;
              p.restT = 0;
            } else off.addScaledVector(_n, pen);
          }
        }
      }
      // 쥔 칼이 바닥 · 벽 · 몸에 막혀 밀려났으면 그 칼을 쥔 손도 같이 (손잡이를 놓지 않은 것처럼)
      const push = this.held[h.side]?.t?.weapon?.block;
      if (push && push.lengthSq() > 1e-8) off.add(push);
      off.clampLength(0, 0.3);
      inp.handOff[h.side].lerp(off, 1 - Math.exp(-dt * 30));
    }
  }

  /** 점(손 두께 HAND_R)이 소품 상자에 파고든 깊이 · n = 상자에서 손 쪽으로 */
  _penetrate(p, pt, n) {
    const c = p.center(_v);
    _q.copy(p.obj.quaternion).invert();
    const L = _v2.subVectors(pt, c).applyQuaternion(_q);
    const he = p.he;
    const dx = he.x - Math.abs(L.x);
    const dy = he.y - Math.abs(L.y);
    const dz = he.z - Math.abs(L.z);
    if (dx > 0 && dy > 0 && dz > 0) {
      // 안에 들어왔다: 가장 얕은 면으로
      if (dx <= dy && dx <= dz) n.set(Math.sign(L.x) || 1, 0, 0);
      else if (dy <= dz) n.set(0, Math.sign(L.y) || 1, 0);
      else n.set(0, 0, Math.sign(L.z) || 1);
      n.applyQuaternion(p.obj.quaternion);
      return Math.min(dx, dy, dz) + HAND_R;
    }
    const cl = p.closest(pt, _v3.clone());
    n.subVectors(pt, cl);
    const d = n.length();
    if (d >= HAND_R || d < 1e-6) return 0;
    n.divideScalar(d);
    return HAND_R - d;
  }

  _release(side, vel) {
    const H = this.held[side];
    if (!H) return;
    this.held[side] = null;
    this.gripR[side] = null;
    (this._relT ??= {})[side] = this.ctx.world.time;
    const t = H.t;
    if (H.weapon) {
      const oSide = side === 'left' ? 'right' : 'left';
      const O = this.held[oSide];
      if (O && O.t === t) {
        // 한 손은 아직 쥐고 있다 → 그 손이 이어받는다
        O.second = false;
        return;
      }
      // 꽂힌 칼을 놓았다: 그대로 꽂혀 있다 (꿰인 적은 놓여 쓰러진다)
      if (t.weapon.stuck && onReleaseStuck(this.ctx, t, t.vel)) {
        t.held = false;
        t.heldHand = null;
        return;
      }
      // 던진다: 실제로 움직이던 속도와 손목이 돌던 회전 그대로 (위로 던져 돌다 떨어지는 칼을 다시 받을 수 있다)
      t.held = false;
      t.heldHand = null;
      t.asleep = false;
      t.restT = 0;
      t.vel.multiplyScalar(1.15).clampLength(0, 18);
      t.spin.copy(H.weapon.w).clampLength(0, 30);
      return;
    }
    if (vel.length() > 18) vel.setLength(18);
    if (t.kind === 'dummy') {
      if (t.heldBy) t.release(vel, this.by[side]);
    } else {
      // 무거울수록 덜 날아간다 · 덜 돈다
      const k = 1 / (1 + (t.kg ?? 0) / this._liftKg());
      t.held = false;
      t.vel.copy(vel).multiplyScalar(k);
      t.asleep = false;
      t.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(vel.length() * k);
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
