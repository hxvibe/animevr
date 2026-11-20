// 컨트롤러를 "손"으로: 버튼(그립·트리거·엄지 터치)으로 손가락을 굽힌 가상 손을 그리고,
// 그 손의 관절 25개를 핸드트래킹과 똑같이 만들어 같은 손 모양 판정·수인 판정에 넣는다.
//
//  손가락:  트리거 = 검지 · 그립 = 중지·약지·새끼 · 엄지 = 스틱/버튼/엄지받침에 닿아 있으면 접힘, 떼면 폄
//    아무것도 안 누름 → 편 손 / 그립+트리거 → 주먹 / 그립만(검지를 뗌) → 검지 / 그립만 + 엄지 뗌 → 두 손가락
//    트리거만 + 엄지 닿음 → 집기
//  손 추적으로도 컨트롤러로도 만들 수 없는 수인(손가락 꼬기·깍지·마름모 …)은
//  현실에서 비슷한 자세를 잡으면(두 손을 맞대기 등) 가상 손이 그 수인 모양으로 맞물린다 → 같은 판정으로 발동
import * as THREE from 'three';
import { DemoHand, SHAPES, demoPose, loadHandModels, mix, resolve } from './handDemo.js';
import { JOINT_NAMES } from './gestures.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// 버튼 → 손 모양 (SHAPES 의 이름 + 판정에 쓰는 이름)
function shapeOf(b) {
  const thumb = b.thumbTouch;
  if (b.grip > 0.55 && b.trigger > 0.55) return thumb || !b.touchKnown ? 'fist' : 'fistUp';
  if (b.grip > 0.55) return thumb || !b.touchKnown ? 'point' : 'two';
  if (b.trigger > 0.55) return thumb ? 'pinch' : 'hook';
  return thumb ? 'flat' : 'open';
}

// 판정용 이름 (gestures.js 의 결과와 같은 말)
const GESTURE = { fist: 'fist', fistUp: 'fist', point: 'point', two: 'two', pinch: 'pinch', hook: 'open', flat: 'open', open: 'open', crossed: 'crossed', purple: 'purple' };

// 손 모양 그림 (SHAPES 에 없는 것)
const EXTRA = {
  hook: { c: [0.05, 0.75, 0.1, 0.12, 0.15], s: 0.2, o: 0.1 },
  fistUp: { c: [0.1, 1, 1, 1, 1], s: 0, o: 0.1 },
  open: { c: [0.05, 0.05, 0.05, 0.08, 0.1], s: 0.3, o: 0.05 },
};
const shapeDef = (k) => EXTRA[k] ?? SHAPES[k] ?? SHAPES.relax;

/**
 * 캐릭터별: 컨트롤러로는 손가락을 그렇게 못 만드는 수인 → 현실에서 비슷한 자세를 잡으면 수인으로 맞물린다
 *  test(L, R, inp): L/R = { shape, palm, F(손끝 방향), N(손바닥 방향) } (컨트롤러가 잡은 그대로) · 머리 기준 높이·앞
 *  demo: handDemo 의 시연 자세 (그 자세의 관절이 손 추적 판정을 그대로 통과한다)
 *  one: 한 손 수인 (side 'right' | 'left' | 'any')
 */
const fistLike = (s) => s === 'fist' || s === 'fistUp';
const idxLike = (s) => s === 'point' || s === 'two';
const openLike = (s) => s === 'open' || s === 'flat';
function rel(inp, p) {
  const f = _v3.copy(inp.headDir).setY(0).normalize();
  const d = _v2.subVectors(p, inp.head);
  return { drop: -d.y, front: d.dot(f) };
}
export const CTRL_MUDRAS = {
  // 고죠: 검지(·중지)를 세워 얼굴 앞에 → 검지·중지를 꼰 수인
  gojo: [
    { demo: 'gojo.domain', one: 'any', g: 'crossed', test: (h, inp) => idxLike(h.shape) && h.F.y > 0.5 && rel(inp, h.palm).drop < 0.38 && rel(inp, h.palm).front > 0.1 && h.palm.distanceTo(inp.head) < 0.5 },
  ],
  // 스쿠나: 두 손(검지를 뗀 채)을 가슴 앞에서 맞댄다 → 염마천 수인
  sukuna: [{ demo: 'sukuna.domain', test: (L, R, inp) => idxLike(L.shape) && idxLike(R.shape) && together(L, R, 0.2) && facing(L, R) && chest(inp, L, R) }],
  // 이타도리: 두 손(검지를 뗀 채)을 가슴 앞에서 맞대고 위로 → 깍지 + 검지 세우기
  itadori: [{ demo: 'itadori.domain', test: (L, R, inp) => idxLike(L.shape) && idxLike(R.shape) && together(L, R, 0.2) && L.F.y > 0.4 && R.F.y > 0.4 && chest(inp, L, R) }],
  // 메구미: 두 주먹을 허리 아래에서, 팔을 앞으로 뻗어 맞댄다 / 가슴 높이면 마허라
  megumi: [
    { demo: 'megumi.domain', test: (L, R, inp) => fistLike(L.shape) && fistLike(R.shape) && together(L, R, 0.26) && rel(inp, mid(L, R)).drop > 0.6 && rel(inp, mid(L, R)).front > 0.28 },
    { demo: 'megumi.mahoraga', test: (L, R, inp) => fistLike(L.shape) && fistLike(R.shape) && together(L, R, 0.22) && rel(inp, mid(L, R)).drop > 0.15 && rel(inp, mid(L, R)).drop <= 0.5 },
  ],
  // 마히토: 편 두 손을 가슴 앞에서 맞대고 손끝을 위로 → 마름모
  mahito: [{ demo: 'mahito.domain', test: (L, R, inp) => openLike(L.shape) && openLike(R.shape) && together(L, R, 0.2) && L.F.y > 0.45 && R.F.y > 0.45 && chest(inp, L, R) }],
  // 죠고: 편 두 손 손끝을 서로 맞은편으로 엇갈려 (지붕)
  jogo: [{ demo: 'jogo.domain', test: (L, R, inp) => openLike(L.shape) && openLike(R.shape) && together(L, R, 0.22) && L.F.dot(R.F) < -0.2 && chest(inp, L, R) }],
  // 유타: 왼주먹을 턱 앞 + 오른손을 세워 그 앞에
  yuta: [{ demo: 'yuta.domain', test: (L, R, inp) => fistLike(L.shape) && openLike(R.shape) && rel(inp, L.palm).drop < 0.4 && rel(inp, L.palm).front > 0.05 && R.F.y > 0.5 && L.palm.distanceTo(R.palm) < 0.25 }],
};
function mid(L, R) {
  return _v.addVectors(L.palm, R.palm).multiplyScalar(0.5);
}
function together(L, R, d) {
  return L.palm.distanceTo(R.palm) < d;
}
function facing(L, R, k = 0.3) {
  const lr = _v.subVectors(R.palm, L.palm).normalize();
  return L.N.dot(lr) > k && R.N.dot(lr) < -k;
}
function chest(inp, L, R) {
  const r = rel(inp, mid(L, R));
  return r.drop > 0.1 && r.drop < 0.6 && r.front > 0.1;
}

// 조작법: 컨트롤러로 수인을 맺는 법 (시연 이름 → 설명)
export const CTRL_HELP = {
  'gojo.domain': '컨트롤러: 그립만 쥐고(검지를 떼고) 손을 얼굴 앞에 세우면 꼰 손가락으로 맞물린다 → 6초',
  'gojo.purple': '컨트롤러: 그립 + 트리거를 쥐고 엄지를 버튼에서 뗀다 (검지·중지를 접고 엄지를 세운 모양)',
  'sukuna.domain': '컨트롤러: 그립만 쥔(검지를 뗀) 두 손을 가슴~얼굴 앞에서 손바닥을 마주 대고 세운다',
  'itadori.domain': '컨트롤러: 그립만 쥔 두 손을 가슴 앞에서 맞대고 위로 세운다',
  'megumi.domain': '컨트롤러: 그립 + 트리거로 두 주먹 → 팔을 앞으로 뻗어 허리 아래에서 맞댄다',
  'megumi.mahoraga': '컨트롤러: 두 주먹(그립 + 트리거)을 가슴 높이에서 맞댄다',
  'mahito.domain': '컨트롤러: 아무것도 누르지 않은(편) 두 손을 가슴 앞에서 맞대고 손끝을 위로',
  'jogo.domain': '컨트롤러: 편 두 손을 가슴 앞에서 손끝이 서로 엇갈리게 (지붕)',
  'yuta.domain': '컨트롤러: 왼손 주먹(그립 + 트리거)을 턱 앞에, 편 오른손을 세워 그 앞에',
};

// 캐릭터별 한 손 모양 바꾸기 (예: 고죠는 그립+트리거에 엄지를 떼면 허식 「茈」 수인)
export const CTRL_SHAPE = {
  gojo: { fistUp: 'purple' },
};

export class CtrlHands {
  constructor(input) {
    this.input = input;
    this.hands = { left: null, right: null };
    this.state = { left: this._mk(), right: this._mk() };
    this.charId = null;
    this.touchKnown = false;
    loadHandModels().then((src) => {
      for (const side of ['left', 'right']) {
        const H = new DemoHand(src[side], side, null);
        H.root.visible = false;
        H.root.traverse((o) => {
          if (o.isSkinnedMesh) {
            o.renderOrder = 0;
            o.castShadow = true;
          }
        });
        input.rig.add(H.root);
        this.hands[side] = H;
      }
    });
  }

  _mk() {
    return { pose: null, snapK: 0, mudra: null, mudraT: 0, shape: 'open', palm: new THREE.Vector3(), F: new THREE.Vector3(0, 0, -1), N: new THREE.Vector3(), cur: null };
  }

  get ready() {
    return !!this.hands.left && !!this.hands.right;
  }

  hide(side) {
    const H = this.hands[side];
    if (H) H.root.visible = false;
  }

  /** 한 손의 컨트롤러 → 손 모양 (먼저 두 손 모두 이걸 부른다) */
  sense(h, slot, b) {
    if (b.thumbTouch) this.touchKnown = true;
    b.touchKnown = this.touchKnown;
    const S = this.state[h.side];
    // 손 방향: 조준 방향(-Z)이 손등에서 본 손가락 방향, 손바닥은 안쪽(오른손 -X / 왼손 +X)
    slot.controller.getWorldQuaternion(_q);
    S.F.set(0, 0, -1).applyQuaternion(_q);
    S.N.set(h.side === 'left' ? 1 : -1, 0, 0).applyQuaternion(_q);
    slot.grip.getWorldPosition(S.palm);
    if (S.palm.lengthSq() === 0) slot.controller.getWorldPosition(S.palm);
    let shape = shapeOf(b);
    const over = CTRL_SHAPE[this.charId]?.[shape];
    S.shape = shape;
    S.drawShape = over ?? shape;
    S.b = b;
  }

  /** 두 손을 다 읽은 뒤: 수인 맞물림 판단 → 손을 그리고 관절을 만든다 */
  build(dt, jointOut) {
    const inp = this.input;
    const L = this.state.left;
    const R = this.state.right;
    const list = CTRL_MUDRAS[this.charId] ?? [];
    let want = null;
    if (this.charId && !inp.ctx?.ui?.menuOpen && inp.left.active && inp.right.active) {
      for (const m of list) {
        if (m.one) continue;
        if (m.test(L, R, inp)) {
          want = { m, sides: ['left', 'right'] };
          break;
        }
      }
    }
    if (!want) {
      for (const m of list) {
        if (!m.one) continue;
        for (const side of m.one === 'any' ? ['right', 'left'] : [m.one]) {
          const S = this.state[side];
          if ((side === 'left' ? inp.left : inp.right).active && m.test(S, inp)) {
            want = { m, sides: [side] };
            break;
          }
        }
        if (want) break;
      }
    }
    for (const side of ['left', 'right']) {
      const S = this.state[side];
      const on = want && want.sides.includes(side);
      const id = on ? want.m.demo : null;
      if (id !== S.mudra) {
        // 잠깐 흐트러진 건 봐준다 (맞물림이 깜빡이지 않게)
        S.mudraT += dt;
        if (!id && S.mudraT < 0.2) {
          /* 유지 */
        } else {
          S.mudra = id;
          S.mudraT = 0;
        }
      } else S.mudraT = 0;
      S.snapK = THREE.MathUtils.clamp(S.snapK + (S.mudra ? dt * 7 : -dt * 7), 0, 1);
    }
    for (const side of ['left', 'right']) this._pose(side, jointOut[side]);
    // 맞물린 수인 (캐릭터가 손 추적 판정과 함께 본다)
    inp.ctrlMudra = (L.mudra && L.snapK > 0.6 && L.mudra) || (R.mudra && R.snapK > 0.6 && R.mudra) || null;
  }

  /** 현재 자세(rig 공간)를 만들고 손 모델에 입힌 뒤 관절을 jointOut 에 */
  _pose(side, J) {
    const H = this.hands[side];
    const S = this.state[side];
    const h = side === 'left' ? this.input.left : this.input.right;
    if (!H || !h.active) {
      if (H) H.root.visible = false;
      return false;
    }
    const rig = this.input.rig;
    const inv = _q.copy(rig.quaternion).invert();
    // 1) 컨트롤러가 잡은 손: 손바닥 = 그립에서 손바닥 쪽으로 3.5cm, 손목 = 거기서 손끝 반대로 6cm
    const F = _v.copy(S.F).applyQuaternion(inv);
    const N = _v2.copy(S.N).applyQuaternion(inv);
    const palm = rig.worldToLocal(_v3.copy(S.palm)).addScaledVector(N, -0.035);
    const wrist = palm.addScaledVector(F, -0.065);
    const sh = shapeDef(S.drawShape);
    // 손가락은 버튼 깊이에 따라 부드럽게 (편 손 → 모양)
    const b = S.b;
    const depth = Math.max(b?.grip ?? 0, b?.trigger ?? 0, S.drawShape === 'flat' || S.drawShape === 'two' || S.drawShape === 'point' ? 1 : 0);
    const open = shapeDef('open');
    const k = THREE.MathUtils.clamp(depth * 1.3, 0, 1);
    let pose = {
      p: [wrist.x, wrist.y, wrist.z],
      f: [F.x, F.y, F.z],
      n: [N.x, N.y, N.z],
      c: open.c.map((x, i) => x + (sh.c[i] - x) * k),
      s: open.s + (sh.s - open.s) * k,
      o: open.o + (sh.o - open.o) * k,
      thumbUp: S.drawShape === 'two' || S.drawShape === 'fistUp' ? 0.6 : 0,
    };
    // 2) 수인 맞물림: 시연 자세(머리 기준) → rig 공간
    if (S.snapK > 0 && S.mudra) {
      const dp = demoPose(S.mudra, side);
      if (dp) {
        const target = this._stageToRig(dp);
        pose = mix(pose, target, S.snapK);
      }
    }
    S.cur = pose;
    H.root.visible = true;
    H.apply(pose);
    H.root.updateMatrixWorld(true);
    // 3) 관절: 뼈 위치 (rig 공간)
    rig.updateMatrixWorld();
    const rigInv = _m.copy(rig.matrixWorld).invert();
    for (const n of JOINT_NAMES) {
      const bone = H.bones[n];
      if (!bone) return false;
      J[n].setFromMatrixPosition(bone.matrixWorld).applyMatrix4(rigInv);
    }
    return true;
  }

  /** 시연 무대(눈 = 원점, 앞 = -Z, 머리 수평 방향 기준) → rig 공간 자세 */
  _stageToRig(dp) {
    const inp = this.input;
    const rig = inp.rig;
    const head = rig.worldToLocal(_v.copy(inp.head));
    const f = _v2.copy(inp.headDir).applyQuaternion(_q.copy(rig.quaternion).invert()).setY(0);
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    const yaw = Math.atan2(-f.x, -f.z);
    const qy = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    const rot = (a) => new THREE.Vector3(...a).applyQuaternion(qy).toArray();
    const p = new THREE.Vector3(...dp.p).applyQuaternion(qy).add(head).toArray();
    return { ...dp, p, f: rot(dp.f), n: rot(dp.n) };
  }

  /** 지금 판정에 쓸 손 모양 이름 (맞물린 수인이면 관절 판정에 맡긴다 → null) */
  gestureFor(side) {
    const S = this.state[side];
    if (S.mudra && S.snapK > 0.6) {
      const m = Object.values(CTRL_MUDRAS).flat().find((x) => x.demo === S.mudra);
      return m?.g ?? null;
    }
    return GESTURE[S.drawShape] ?? 'open';
  }

  dispose() {
    for (const side of ['left', 'right']) {
      const H = this.hands[side];
      if (H) this.input.rig.remove(H.root);
    }
  }
}

export { resolve };
