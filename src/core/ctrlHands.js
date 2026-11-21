// 컨트롤러를 "손"으로: 버튼(그립·트리거·엄지 터치)으로 손가락을 굽힌 가상 손을 그리고,
// 그 손의 관절 25개를 핸드트래킹과 똑같이 만들어 같은 손 모양 판정·수인 판정에 넣는다.
//
//  손가락:  트리거 = 검지 · 그립 = 중지·약지·새끼 · 엄지 = 스틱/버튼/엄지받침에 닿아 있으면 접힘, 떼면 폄
//    아무것도 안 누름 → 편 손 / 그립+트리거 → 주먹 / 그립만(검지를 뗌) → 검지 / 그립만 + 엄지 뗌 → 두 손가락
//    트리거만 + 엄지 닿음 → 집기
//  손 추적으로도 컨트롤러로도 만들 수 없는 수인(손가락 꼬기·깍지·마름모 …)은
//  현실에서 비슷한 자세를 잡으면(두 손을 맞대기 등) 가상 손이 그 수인 모양으로 맞물린다 → 같은 판정으로 발동
import * as THREE from 'three';
import { DemoHand, SHAPES, demoPose, loadHandModels, resolve } from './handDemo.js';
import { JOINT_NAMES } from './gestures.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// 버튼 → 손 모양 (누른 버튼만으로 정한다 · 버튼에 손가락이 닿았는지는 보지 않는다)
//  아무것도 = 편 손 · 트리거 = 집기 · 그립 = 검지 · 그립+A(X) = 검지·중지
//  그립+트리거 = 주먹 · 그립+트리거+A(X) = 엄지 세운 주먹
function shapeOf(b) {
  const g = b.grip > 0.55;
  const t = b.trigger > 0.55;
  if (g && t) return b.thumbBtn ? 'fistUp' : 'fist';
  if (g) return b.thumbBtn ? 'two' : 'point';
  if (t) return 'pinch';
  return 'open';
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

// 조작법: 컨트롤러 버튼 범례 · 기술마다 무엇을 누르는지
export const CTRL_LEGEND = '아무것도 안 누름 = 편 손 · 트리거 = 집기 · 그립 = 검지 · 그립+A(X) = 검지·중지\n그립+트리거 = 주먹 · 그립+트리거+A(X) = 엄지 세운 주먹\nY 메뉴 · 왼쪽 스틱 이동 · 오른쪽 스틱 회전';
const N = '아무것도 누르지 않은';
export const CTRL_HELP = {
  'sukuna.dismantle': `${N} 손으로 컨트롤러를 빠르게 휘두르기 → 휘두른 방향으로 참격 (연속 가능)`,
  'sukuna.cleave': `${N} 손으로 적을 직접 건드리기`,
  'sukuna.fuga': `한 손은 ${N} 채, 다른 손 트리거를 당겨 그 손 앞에서 활처럼 뒤로 당겼다가 트리거를 놓기`,
  'sukuna.world': `오른손은 ${N} 채 앞으로 뻗고, 왼손 그립+트리거(주먹)로 오른 손목을 잡은 채 1.3초 (영창) → 오른손을 크게 휘두르기`,
  'sukuna.domain': '두 손 모두 그립만 쥐고, 얼굴 앞에서 두 컨트롤러 옆면을 맞대 세워 1.5초',
  'common.grab': '적에 대고 그립+트리거 → 잡기, 놓으면 던지기 · 그립+트리거로 빠르게 치면 흑섬',
  'gojo.blue': '그립+A(X)로 앞을 가리키면 생성 → 버튼을 모두 놓으면 창이 손을 따라 멀리',
  'gojo.red': '그립만 쥐어 충전 → 앞으로 찌르거나 버튼을 모두 놓으면 발사',
  'gojo.switch': '창일 때 그립만 → 혁 · 혁일 때 그립+A(X) → 창 · 그립+트리거 → 사라짐',
  'gojo.purple': '그립+트리거+A(X) (엄지 세운 주먹) → 창과 혁이 합쳐져 茈 → 버튼을 모두 놓거나 앞으로 밀어 발사',
  'gojo.domain': '그립만 쥐고 컨트롤러를 얼굴 앞에 세워 6초 (손가락이 꼬인 수인으로 바뀐다)',
  'gojo.infinity': `무하한: ${N} 두 손을 앞으로 1초 · 육안: 컨트롤러로 눈을 0.5초 가리기 · 잡기·흑섬: 그립+트리거`,
  'itadori.punch': '그립+트리거로 쥐고 치기 → 한 박자 뒤 한 번 더 (2타)',
  'itadori.blackflash': `${N} 채 휘두르다 닿기 직전에 그립+트리거 → 흑섬 확정`,
  'itadori.cut': '그립+A(X)(가위 손)로 적을 건드리기',
  'itadori.blood': `${N} 두 손을 맞대고 앞으로 0.5초 → 두 손을 떼면 발사`,
  'itadori.domain': '두 손 모두 그립만 쥐고, 가슴 앞에서 맞대 위로 세워 1.5초',
  'jogo.insects': '그립+트리거 → 앞으로 휙 던지며 모두 놓기',
  'jogo.ray': '그립만(또는 그립+A(X))으로 가리키고 있기',
  'jogo.head': `${N} 두 컨트롤러를 정수리에 0.4초`,
  'jogo.erupt': `${N} 채 손바닥 쪽(컨트롤러 안쪽)을 아래로 해 빠르게 내리찍기`,
  'jogo.purgatory': `${N} 두 손을 마주 보게 모았다가 앞으로 밀기`,
  'jogo.meteor': `${N} 두 손을 머리 위로 높이 들고 1.5초`,
  'jogo.domain': `${N} 두 손을 가슴 앞에서 컨트롤러 앞쪽이 서로 엇갈리게 1.2초`,
  'yuta.sword': '왼쪽 허리 칼집의 손잡이에 오른 컨트롤러를 대고 그립+트리거 → 칼집 끝까지 뽑아야 빠진다 → 휘둘러 베기 · 왼손 그립으로 칼집을 잡을 수 있다 · 칼집에 다시 꽂고 놓으면 납도',
  'yuta.rika': '왼손 그립+트리거(주먹)를 입술에 0.5초 → 리카 · 왼손 그립만으로 적을 가리키면 그 적에게',
  'yuta.beam': `리카 현현 중: ${N} 두 손을 마주 보게 모았다가 앞으로 밀기`,
  'yuta.speech': `${N} 손으로 입을 가렸다가 떼며 앞으로 내밀기`,
  'yuta.domain': `왼손 그립+트리거(주먹)를 턱 앞에, 오른손은 ${N} 채 세워 그 앞에 1.2초`,
  'nobara.hammer': '오른쪽 허리의 망치 손잡이에 대고 그립+트리거 → 휘둘러 치기 · 허리에 대고 놓으면 다시 찬다',
  'nobara.nails': '왼쪽 허리 못 주머니에 대고 트리거 → 못 세 개 → 트리거를 놓으며 위로 띄우기 → 망치로 후려치기',
  'nobara.kanzashi': `못이 박혀 있을 때: 왼손 ${N} 채 있다가 그립+트리거`,
  'nobara.resonance': '왼쪽 옆구리의 짚인형에 왼 컨트롤러를 대고 그립+트리거(주먹) → 쥔 채 앞으로 → 망치로 인형 가슴을 내리치기 · 놓으면 다시 꽂힌다',
  'mahito.touch': `${N} 손을 적에 0.2초 대기`,
  'mahito.blade': '그립+A(X)(검지·중지)를 옆으로 세워 0.35초 → 칼날 → 휘둘러 베기',
  'mahito.drill': '그립+트리거를 앞으로 겨누고 0.35초 → 드릴 → 앞으로 찌르기',
  'mahito.stretch': '그립만 쥐고 앞으로 빠르게 찌르기 → 팔이 늘어난다',
  'mahito.launch': '그립+트리거를 입에 0.25초 (스톡을 꺼내 쥔다) → 앞으로 던지며 모두 놓기',
  'mahito.repel': `${N} 두 손을 가슴 앞에서 맞대 0.4초 (스톡 8개가 모인다) → 앞으로 밀기`,
  'mahito.domain': `${N} 두 손을 가슴 앞에서 맞대고 위로 세워 1.2초`,
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
        // 손은 컨트롤러가 잡은 자리 그대로 — 손가락 모양만 수인으로 바뀐다
        const e = S.snapK * S.snapK * (3 - 2 * S.snapK);
        pose = {
          ...pose,
          c: pose.c.map((x, i) => x + (dp.c[i] - x) * e),
          s: pose.s + (dp.s - pose.s) * e,
          o: pose.o + (dp.o - pose.o) * e,
          thumbUp: pose.thumbUp + ((dp.thumbUp ?? 0) - pose.thumbUp) * e,
        };
      }
    }
    S.cur = pose;
    H.root.visible = !this.input.hideHands && !this.input.hideHand?.[side];
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

// 조작법(데스크톱): 기술마다 누르는 키 · 마우스 — `캐릭터:시연` 으로 찾는다
export const DESK_LEGEND = '화면 클릭 → 마우스 고정 · 마우스로 둘러보기 · WASD 이동 · H/Tab 메뉴\nV 주먹 · T 조준한 대상 잡기(다시 T: 던지기)';
export const DESK_HELP = {
  'gojo:gojo.blue': '마우스 우클릭을 누르고 있기 → 창 · 휠로 거리 조절 · 떼면 사라짐',
  'gojo:gojo.red': '마우스 좌클릭을 누르고 있기(충전) → 떼면 발사',
  'gojo:gojo.switch': '우클릭(창) ↔ 좌클릭(혁)을 바꿔 누르기',
  'gojo:gojo.purple': 'E 누르고 있기 → 창과 혁이 섞여 茈 완성 → E를 떼면 발사',
  'gojo:gojo.domain': 'Q 6초 누르고 있기',
  'gojo:gojo.infinity': 'I 무하한 켜기/끄기 · O 육안 켜기/끄기 · V 주먹 · T 잡기',
  'sukuna:sukuna.dismantle': '마우스 좌클릭 (누르고 있으면 연사, 마우스를 움직인 방향으로 벰)',
  'sukuna:sukuna.cleave': '마우스 우클릭: 조준한 2.5m 이내 대상',
  'sukuna:sukuna.fuga': 'F 길게 눌러 당기기 → 떼면 발사',
  'sukuna:sukuna.world': 'G 1.3초 누르고 있기(영창) → 마우스 좌클릭',
  'sukuna:sukuna.domain': 'Q 1초 누르고 있기',
  'sukuna:common.grab': 'T 잡기 → 다시 T 던지기 · V 주먹(흑섬)',
  'itadori:itadori.punch': '마우스 좌클릭: 조준한 2.6m 이내 대상 (경정권 2타)',
  'itadori:itadori.blackflash': '마우스 좌클릭 — 일정 확률로 흑섬',
  'itadori:itadori.cut': '마우스 우클릭: 조준한 2.6m 이내 대상 (영역 안에서는 거리 무관)',
  'itadori:itadori.blood': 'C 길게 눌러 모으기 → 떼면 발사',
  'itadori:itadori.domain': 'Q 1.5초 누르고 있기',
  'itadori:common.grab': 'T 잡기 → 다시 T 던지기',
  'yuta:yuta.sword': 'E 누르고 있기: 칼을 뽑아 든다 → 마우스를 휙 돌려 베기 (세게 돌리면 검기)',
  'yuta:yuta.rika': 'F: 리카 현현 / 돌려보내기',
  'yuta:yuta.beam': '리카 현현 중 1 누르고 있다 떼기',
  'yuta:yuta.speech': '2',
  'yuta:yuta.domain': 'Q 1.2초 누르고 있기',
  'mahito:mahito.touch': 'E: 1.6m 안의 조준한 대상을 만진다',
  'mahito:mahito.blade': '1: 칼날 팔로 베기',
  'mahito:mahito.drill': '2: 드릴 팔로 찌르기',
  'mahito:mahito.stretch': '3: 팔을 늘려 때리기',
  'mahito:mahito.launch': '5: 입에서 스톡을 꺼내 던진다 → 개조 인간',
  'mahito:mahito.repel': '4: 스톡 8개를 모아 다중혼 발체',
  'mahito:mahito.domain': 'Q 1.2초 누르고 있기',
  'jogo:jogo.insects': '1',
  'jogo:jogo.ray': '2 누르고 있기',
  'jogo:jogo.head': '3',
  'jogo:jogo.erupt': '4: 조준한 땅에서 불기둥',
  'jogo:jogo.purgatory': '5 누르고 있다 떼기 (오래 모을수록 크다)',
  'jogo:jogo.meteor': '6',
  'jogo:jogo.domain': 'Q 1.2초 누르고 있기',
  'jogo:itadori.punch': 'V 주먹',
  'nobara:nobara.hammer': 'V: 망치로 치기',
  'nobara:nobara.nails': '1: 못을 띄우고 망치로 쏘기 (조준한 대상)',
  'nobara:nobara.kanzashi': '2',
  'nobara:nobara.resonance': '3: 짚인형을 꺼내 망치로 내리치기',
};
