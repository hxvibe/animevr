// 조작법 탭의 "손 모양 영상": 퀘스트 손 모델(WebXR generic-hand)로 수인을 맺는 동작을 반복해서 보여준다.
// 손 모델의 뼈는 WebXR 관절 규칙(-Z = 손끝 방향, +Y = 손등)을 따르므로, 손가락마다 굽힘 각을 주어 FK 로 자세를 만든다.
// 무대 좌표 = 플레이어 기준 (x 오른쪽, y 위, -z 앞). 머리(눈)가 원점, 가슴 앞 손은 대략 (0, -0.3, -0.35)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const BASE = new URL('../../assets/profiles/generic-hand/', import.meta.url).href;
const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const SEG = { thumb: ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'], other: ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'] };
const D2R = Math.PI / 180;

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _m3 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);
const _y = new THREE.Vector3(0, 1, 0);
const _z = new THREE.Vector3(0, 0, 1);

// ───────────────── 손 모양 (굽힘 0 = 폄 ~ 1 = 쥠) ─────────────────
//  c: [엄지, 검지, 중지, 약지, 새끼] · s: 벌림 · o: 엄지 맞섬(손바닥 쪽으로)
export const SHAPES = {
  relax: { c: [0.15, 0.15, 0.2, 0.28, 0.35], s: 0.1, o: 0.2 },
  open: { c: [0, 0, 0, 0, 0], s: 0.35, o: 0 },
  flat: { c: [0, 0, 0, 0, 0], s: 0, o: 0 },
  wing: { c: [0, 0, 0, 0, 0], s: 1, o: 0 },
  fist: { c: [0.85, 1, 1, 1, 1], s: 0, o: 0.7 },
  point: { c: [0.8, 0, 1, 1, 1], s: 0, o: 0.7 },
  two: { c: [0.8, 0, 0, 1, 1], s: 0.05, o: 0.7 },
  scissors: { c: [0.8, 0, 0, 1, 1], s: 0.7, o: 0.7 },
  pinch: { c: [0.35, 0.45, 0.2, 0.15, 0.1], s: 0.1, o: 0.8 },
  snake: { c: [0.3, 0.3, 0.32, 0.34, 0.36], s: 0, o: 1 },
  snakeOpen: { c: [0.05, 0.15, 0.18, 0.2, 0.22], s: 0, o: 0.6 },
  claw: { c: [0.3, 0.45, 0.45, 0.45, 0.45], s: 0.3, o: 0.4 },
  purple: { c: [0.6, 1, 1, 0, 0], s: 0.2, o: 1 },
  cup: { c: [0.2, 0.25, 0.25, 0.25, 0.25], s: 0.15, o: 0.4 },
  diamond: { c: [0.1, 0.25, 0.55, 0.65, 0.7], s: 0, o: 0.1 },
  thumb: { c: [0, 1, 1, 1, 1], s: 0, o: 0 },
  clasp: { c: [0.35, 0.6, 0.62, 0.64, 0.66], s: 0.25, o: 0.35 }, // 깍지
  idxUp: { c: [0.45, 0, 0.75, 0.75, 0.75], s: 0.1, o: 0.4 }, // 깍지 + 검지만 세움
  roof: { c: [0.1, 0.12, 0.12, 0.12, 0.12], s: 0.55, o: 0 }, // 손가락을 엇갈려 끼운 지붕
  crossed: { c: [0.8, 0, 0, 1, 1], s: -2.6, o: 0.7 }, // 검지·중지 꼬기
  enma: { c: [0.3, 0, 1, 1, 0], s: 0.1, o: 0.3 }, // 검지·새끼만 세움
};

/** 자세 하나: p 손목 위치, f 손끝 방향, n 손바닥이 향하는 방향, k 손 모양 */
const P = (p, f, n, k, extra = {}) => ({ p, f, n, k, ...extra });
const REST_L = P([-0.2, -0.52, -0.2], [0, -0.6, -1], [1, 0, 0], 'relax');
const REST_R = P([0.2, -0.52, -0.2], [0, -0.6, -1], [-1, 0, 0], 'relax');

/**
 * 시연 만들기: 쉬기 → 수인 → (유지 / 움직임) → 쉬기. 반복
 * seq: [[시간, {L, R}] …] — L/R 가 없으면 쉬는 자세, null 이면 손을 숨긴다
 */
function demo(seq, { dur, holdLabel } = {}) {
  const last = seq[seq.length - 1][0];
  // 이 수인에 쓰이지 않는 손은 숨긴다
  const uses = { L: seq.some(([, k]) => k.L), R: seq.some(([, k]) => k.R) };
  return { keys: [[0, {}], ...seq, [last + 0.55, {}]], dur: dur ?? last + 1.1, holdLabel, uses };
}
/** 단순 수인: 0.6초 동안 맺고 hold 초 유지 */
const sign = (L, R, hold = 1.6) => demo([[0.6, { L, R }], [0.6 + hold, { L, R }]]);

export const DEMOS = {
  // ── 메구미 ──
  'megumi.dogs': sign(undefined, P([0.08, -0.28, -0.38], [0, 0, -1], [-1, 0, 0], 'flat', { thumbUp: 1 }), 1.8),
  'megumi.nue': demo([
    [0.6, { L: P([0.05, -0.3, -0.26], [-0.5, 0.85, 0], [0, 0, 1], 'wing'), R: P([-0.05, -0.3, -0.26], [0.5, 0.85, 0], [0, 0, 1], 'wing') }],
    [1.0, { L: P([0.05, -0.3, -0.26], [-0.75, 0.6, 0], [0, 0, 1], 'wing'), R: P([-0.05, -0.3, -0.26], [0.75, 0.6, 0], [0, 0, 1], 'wing') }],
    [1.4, { L: P([0.05, -0.3, -0.26], [-0.5, 0.85, 0], [0, 0, 1], 'wing'), R: P([-0.05, -0.3, -0.26], [0.5, 0.85, 0], [0, 0, 1], 'wing') }],
    [1.8, { L: P([0.05, -0.3, -0.26], [-0.75, 0.6, 0], [0, 0, 1], 'wing'), R: P([-0.05, -0.3, -0.26], [0.75, 0.6, 0], [0, 0, 1], 'wing') }],
  ]),
  'megumi.toad': sign(P([-0.075, -0.3, -0.36], [0.45, 0.88, 0], [0, 0, -1], 'diamond'), P([0.075, -0.3, -0.36], [-0.45, 0.88, 0], [0, 0, -1], 'diamond'), 1.8),
  'megumi.orochi': demo([
    [0.6, { R: P([0.08, -0.3, -0.36], [0, -0.05, -1], [0, -1, 0], 'snake') }],
    [1.0, { R: P([0.08, -0.29, -0.38], [0, 0.05, -1], [0, -1, 0], 'snakeOpen') }],
    [1.3, { R: P([0.08, -0.3, -0.4], [0, -0.05, -1], [0, -1, 0], 'snake') }],
    [2.1, { R: P([0.08, -0.3, -0.4], [0, -0.05, -1], [0, -1, 0], 'snake') }],
  ]),
  'megumi.elephant': demo([
    [0.6, { R: P([0.06, -0.24, -0.38], [0, -1, -0.15], [0, 0.15, 1], 'two') }],
    [1.1, { R: P([0.06, -0.24, -0.38], [0.25, -1, -0.15], [0, 0.15, 1], 'two') }],
    [1.6, { R: P([0.06, -0.24, -0.38], [-0.25, -1, -0.15], [0, 0.15, 1], 'two') }],
    [2.0, { R: P([0.06, -0.24, -0.38], [0, -1, -0.15], [0, 0.15, 1], 'two') }],
  ]),
  'megumi.rabbits': demo([
    [0.6, { R: P([0.17, -0.12, -0.16], [0, 1, 0.1], [-1, 0, -0.3], 'two') }],
    [1.0, { R: P([0.17, -0.12, -0.16], [0.15, 1, 0.1], [-1, 0, -0.3], 'scissors') }],
    [1.4, { R: P([0.17, -0.12, -0.16], [0, 1, 0.1], [-1, 0, -0.3], 'two') }],
    [2.0, { R: P([0.17, -0.12, -0.16], [0, 1, 0.1], [-1, 0, -0.3], 'two') }],
  ]),
  'megumi.ox': sign(P([-0.06, -0.34, -0.36], [1, 0, -0.3], [0, -1, 0], 'flat'), P([0.0, -0.27, -0.37], [0, 1, -0.2], [-1, 0, 0], 'point', { thumbUp: 1 }), 1.8),
  'megumi.mahoraga': demo([
    [0.6, { L: P([-0.11, -0.34, -0.3], [0.3, 0.2, -1], [1, 0, 0], 'fist'), R: P([0.11, -0.34, -0.3], [-0.3, 0.2, -1], [-1, 0, 0], 'fist') }],
    [1.0, { L: P([-0.05, -0.34, -0.3], [0.3, 0.2, -1], [1, 0, 0], 'fist'), R: P([0.05, -0.34, -0.3], [-0.3, 0.2, -1], [-1, 0, 0], 'fist') }],
    [2.2, { L: P([-0.05, -0.34, -0.3], [0.3, 0.2, -1], [1, 0, 0], 'fist'), R: P([0.05, -0.34, -0.3], [-0.3, 0.2, -1], [-1, 0, 0], 'fist') }],
  ]),
  'megumi.domain': demo([
    [0.6, { L: P([-0.07, -0.34, -0.3], [0.6, 0.6, -0.3], [1, 0, 0], 'clasp'), R: P([0.07, -0.34, -0.3], [-0.6, 0.6, -0.3], [-1, 0, 0], 'clasp') }],
    [2.4, { L: P([-0.07, -0.34, -0.3], [0.6, 0.6, -0.3], [1, 0, 0], 'clasp'), R: P([0.07, -0.34, -0.3], [-0.6, 0.6, -0.3], [-1, 0, 0], 'clasp') }],
  ]),
  // ── 이타도리 ──
  'itadori.punch': demo([
    [0.4, { R: P([0.14, -0.34, -0.22], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
    [0.6, { R: P([0.1, -0.3, -0.62], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
    [0.9, { R: P([0.14, -0.34, -0.22], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
    [1.1, { R: P([0.1, -0.3, -0.62], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
    [1.4, { R: P([0.14, -0.34, -0.22], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
  ]),
  'itadori.blackflash': demo([
    [0.5, { R: P([0.16, -0.34, -0.2], [0, 0, -1], [-0.3, -1, 0], 'open') }],
    [0.75, { R: P([0.11, -0.3, -0.52], [0, 0, -1], [-0.3, -1, 0], 'open') }],
    [0.85, { R: P([0.1, -0.3, -0.62], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
    [1.6, { R: P([0.1, -0.3, -0.62], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
  ]),
  'itadori.cut': demo([
    [0.6, { R: P([0.1, -0.3, -0.4], [0, 0, -1], [-1, 0, 0], 'scissors') }],
    [0.9, { R: P([0.1, -0.3, -0.55], [0, 0, -1], [-1, 0, 0], 'two') }],
    [1.2, { R: P([0.1, -0.3, -0.55], [0, 0, -1], [-1, 0, 0], 'scissors') }],
    [1.5, { R: P([0.1, -0.3, -0.55], [0, 0, -1], [-1, 0, 0], 'two') }],
  ]),
  'itadori.blood': demo([
    [0.6, { L: P([-0.015, -0.3, -0.3], [0, 0.2, -1], [1, 0, 0], 'flat'), R: P([0.015, -0.3, -0.3], [0, 0.2, -1], [-1, 0, 0], 'flat') }],
    [1.6, { L: P([-0.015, -0.3, -0.3], [0, 0.2, -1], [1, 0, 0], 'flat'), R: P([0.015, -0.3, -0.3], [0, 0.2, -1], [-1, 0, 0], 'flat') }],
    [1.9, { L: P([-0.14, -0.3, -0.34], [0, 0.2, -1], [1, 0, 0], 'open'), R: P([0.14, -0.3, -0.34], [0, 0.2, -1], [-1, 0, 0], 'open') }],
  ]),
  'itadori.domain': sign(P([-0.03, -0.24, -0.3], [0.15, 1, -0.1], [1, 0, 0], 'idxUp'), P([0.03, -0.24, -0.3], [-0.15, 1, -0.1], [-1, 0, 0], 'idxUp'), 1.8),
  'common.grab': demo([
    [0.6, { R: P([0.08, -0.32, -0.45], [0, -0.2, -1], [0, -0.3, -1], 'open') }],
    [1.0, { R: P([0.08, -0.32, -0.45], [0, -0.2, -1], [0, -0.3, -1], 'fist') }],
    [1.5, { R: P([0.12, -0.25, -0.3], [0, -0.2, -1], [0, -0.3, -1], 'fist') }],
    [1.8, { R: P([0.1, -0.2, -0.6], [0, 0, -1], [0, -0.3, -1], 'open') }],
  ]),
  'common.loco': demo([
    [0.6, { L: P([-0.14, -0.4, -0.3], [0, 0, -1], [1, 0, 0], 'thumb', { thumbUp: 1 }) }],
    [1.0, { L: P([-0.14, -0.4, -0.3], [0, 0, -1], [1, 0, 0], 'thumb', { thumbUp: 1 }) }],
    [1.6, { L: P([-0.14, -0.4, -0.46], [0, 0, -1], [1, 0, 0], 'thumb', { thumbUp: 1 }) }],
    [2.2, { L: P([-0.14, -0.4, -0.46], [0, 0, -1], [1, 0, 0], 'thumb', { thumbUp: 1 }) }],
    [2.6, { R: P([0.12, -0.4, -0.3], [0, 0, -1], [-1, 0, 0], 'thumb', { thumbUp: 1 }) }],
    [3.1, { R: P([0.26, -0.4, -0.3], [0, 0, -1], [-1, 0, 0], 'thumb', { thumbUp: 1 }) }],
    [3.5, { R: P([0.26, -0.4, -0.3], [0, 0, -1], [-1, 0, 0], 'thumb', { thumbUp: 1 }) }],
  ]),
  // ── 고죠 ──
  'gojo.blue': demo([
    [0.6, { R: P([0.1, -0.28, -0.42], [0, 0.05, -1], [-0.3, -1, 0], 'two') }],
    [1.3, { R: P([0.1, -0.28, -0.42], [0, 0.05, -1], [-0.3, -1, 0], 'two') }],
    [1.6, { R: P([0.1, -0.26, -0.55], [0, 0.05, -1], [0, -0.2, -1], 'open') }],
    [2.1, { R: P([0.12, -0.22, -0.68], [0, 0.05, -1], [0, -0.2, -1], 'open') }],
  ]),
  'gojo.red': demo([
    [0.6, { R: P([0.12, -0.28, -0.32], [0, 0.05, -1], [-0.3, -1, 0], 'point') }],
    [1.4, { R: P([0.12, -0.28, -0.32], [0, 0.05, -1], [-0.3, -1, 0], 'point') }],
    [1.6, { R: P([0.1, -0.26, -0.62], [0, 0.05, -1], [-0.3, -1, 0], 'point') }],
  ]),
  'gojo.switch': demo([
    [0.6, { R: P([0.1, -0.28, -0.42], [0, 0.05, -1], [-0.3, -1, 0], 'two') }],
    [1.2, { R: P([0.1, -0.28, -0.42], [0, 0.05, -1], [-0.3, -1, 0], 'point') }],
    [1.8, { R: P([0.1, -0.28, -0.42], [0, 0.05, -1], [-0.3, -1, 0], 'two') }],
    [2.3, { R: P([0.1, -0.28, -0.42], [0, 0.05, -1], [-0.3, -1, 0], 'fist') }],
  ]),
  'gojo.purple': sign(undefined, P([0.08, -0.25, -0.38], [0, 0.6, -0.8], [-1, 0, 0], 'purple'), 1.8),
  'gojo.domain': sign(undefined, P([0.02, -0.24, -0.28], [0, 1, 0], [-1, 0, 0], 'crossed'), 2),
  'gojo.infinity': demo([
    [0.6, { L: P([-0.15, -0.25, -0.42], [0, 1, 0], [0, 0, -1], 'open'), R: P([0.15, -0.25, -0.42], [0, 1, 0], [0, 0, -1], 'open') }],
    [1.6, { L: P([-0.15, -0.25, -0.42], [0, 1, 0], [0, 0, -1], 'open'), R: P([0.15, -0.25, -0.42], [0, 1, 0], [0, 0, -1], 'open') }],
    [2.1, { R: P([0.04, -0.02, -0.1], [-1, 0.2, 0], [0, 0, 1], 'flat') }],
    [2.7, { R: P([0.04, -0.02, -0.1], [-1, 0.2, 0], [0, 0, 1], 'flat') }],
  ]),
  // ── 스쿠나 ──
  'sukuna.dismantle': demo([
    [0.5, { R: P([0.3, -0.2, -0.3], [0.5, 0.2, -1], [0, -1, 0], 'flat') }],
    [0.75, { R: P([-0.2, -0.3, -0.45], [-0.5, -0.1, -1], [0, -1, 0], 'flat') }],
    [1.1, { R: P([0.3, -0.2, -0.3], [0.5, 0.2, -1], [0, -1, 0], 'flat') }],
    [1.35, { R: P([-0.2, -0.3, -0.45], [-0.5, -0.1, -1], [0, -1, 0], 'flat') }],
  ]),
  'sukuna.cleave': demo([
    [0.6, { R: P([0.08, -0.3, -0.5], [0, 0, -1], [0, -0.2, -1], 'open') }],
    [0.9, { R: P([0.08, -0.3, -0.6], [0, 0, -1], [0, -0.2, -1], 'open') }],
    [1.3, { R: P([0.08, -0.3, -0.5], [0, 0, -1], [0, -0.2, -1], 'open') }],
  ]),
  'sukuna.fuga': demo([
    [0.6, { L: P([-0.06, -0.24, -0.55], [0, 0.3, -1], [1, 0, 0], 'open'), R: P([0.0, -0.24, -0.48], [-0.3, 0, -1], [0, -1, 0], 'pinch') }],
    [1.5, { L: P([-0.06, -0.24, -0.55], [0, 0.3, -1], [1, 0, 0], 'open'), R: P([0.08, -0.22, -0.12], [-0.3, 0, -1], [0, -1, 0], 'pinch') }],
    [1.8, { L: P([-0.06, -0.24, -0.55], [0, 0.3, -1], [1, 0, 0], 'open'), R: P([0.1, -0.22, -0.12], [-0.3, 0, -1], [0, -1, 0], 'open') }],
  ]),
  'sukuna.world': demo([
    [0.6, { R: P([0.1, -0.2, -0.58], [0, 1, -0.2], [0, 0, -1], 'open') }],
    [1.9, { R: P([0.1, -0.2, -0.58], [0, 1, -0.2], [0, 0, -1], 'open') }],
    [2.25, { R: P([-0.3, -0.35, -0.45], [-0.6, 0.5, -0.6], [0, 0, -1], 'open') }],
  ]),
  'sukuna.domain': sign(P([-0.03, -0.26, -0.27], [0.2, 1, -0.1], [1, 0, 0], 'enma'), P([0.03, -0.26, -0.27], [-0.2, 1, -0.1], [-1, 0, 0], 'enma'), 1.8),
  // ── 게토 ──
  'geto.tray': demo([
    [0.6, { L: P([-0.07, -0.42, -0.3], [0.35, 0.1, -1], [0, 1, 0], 'open') }],
    [1.2, { L: P([-0.07, -0.42, -0.3], [0.35, 0.1, -1], [0, 1, 0], 'open'), R: P([-0.02, -0.3, -0.36], [-0.3, -0.5, -1], [0, -1, 0], 'open') }],
    [1.45, { L: P([-0.07, -0.42, -0.3], [0.35, 0.1, -1], [0, 1, 0], 'open'), R: P([-0.02, -0.31, -0.36], [-0.3, -0.5, -1], [0, -1, 0], 'fist') }],
    [1.9, { L: P([-0.07, -0.42, -0.3], [0.35, 0.1, -1], [0, 1, 0], 'open'), R: P([0.22, -0.12, -0.12], [0, 0.4, -1], [0, -0.3, -1], 'fist') }],
    [2.15, { R: P([0.12, -0.22, -0.65], [0, 0, -1], [0, -0.3, -1], 'open') }],
  ]),
  'geto.absorb': demo([
    [0.6, { R: P([0.15, -0.2, -0.62], [0, 0.6, -1], [0, 0, -1], 'open') }],
    [1.1, { R: P([0.15, -0.24, -0.32], [0, 0.6, -1], [0, 0, -1], 'open') }],
    [1.4, { R: P([0.12, -0.26, -0.32], [0, 0.3, -1], [0, -0.3, -1], 'fist') }],
    [2.0, { R: P([0.03, -0.12, -0.1], [-0.6, 0.6, -0.3], [-0.3, 0, 1], 'fist') }],
    [2.4, { R: P([0.03, -0.12, -0.1], [-0.6, 0.6, -0.3], [-0.3, 0, 1], 'fist') }],
  ]),
  'geto.uzumaki': demo([
    [0.6, { L: P([-0.14, -0.32, -0.36], [0.1, 0.4, -1], [1, 0, 0], 'cup'), R: P([0.14, -0.32, -0.36], [-0.1, 0.4, -1], [-1, 0, 0], 'cup') }],
    [1.4, { L: P([-0.12, -0.32, -0.36], [0.1, 0.4, -1], [1, 0, 0], 'cup'), R: P([0.12, -0.32, -0.36], [-0.1, 0.4, -1], [-1, 0, 0], 'cup') }],
    [2.2, { L: P([-0.15, -0.32, -0.36], [0.1, 0.4, -1], [1, 0, 0], 'cup'), R: P([0.15, -0.32, -0.36], [-0.1, 0.4, -1], [-1, 0, 0], 'cup') }],
    [2.45, { L: P([-0.14, -0.28, -0.66], [0, 0.3, -1], [0.6, 0, -1], 'open'), R: P([0.14, -0.28, -0.66], [0, 0.3, -1], [-0.6, 0, -1], 'open') }],
  ]),
  // ── 마히토 ──
  'mahito.touch': demo([
    [0.6, { R: P([0.1, -0.3, -0.32], [0, 0.4, -1], [0, 0, -1], 'open') }],
    [1.0, { R: P([0.1, -0.28, -0.58], [0, 0.4, -1], [0, 0, -1], 'open') }],
    [1.8, { R: P([0.1, -0.28, -0.58], [0, 0.4, -1], [0, 0, -1], 'open') }],
  ]),
  'mahito.blade': demo([
    [0.6, { R: P([0.24, -0.22, -0.3], [0.3, 0.2, -1], [-1, 0, 0], 'flat') }],
    [1.0, { R: P([0.24, -0.22, -0.3], [0.3, 0.2, -1], [-1, 0, 0], 'flat') }],
    [1.25, { R: P([-0.18, -0.32, -0.45], [-0.4, -0.1, -1], [-1, 0, 0], 'flat') }],
  ]),
  'mahito.drill': demo([
    [0.6, { R: P([0.12, -0.3, -0.28], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
    [1.0, { R: P([0.12, -0.3, -0.28], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
    [1.2, { R: P([0.1, -0.28, -0.62], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
  ]),
  'mahito.stretch': demo([
    [0.6, { R: P([0.12, -0.3, -0.3], [0, 0, -1], [-0.3, -1, 0], 'point') }],
    [0.9, { R: P([0.12, -0.3, -0.3], [0, 0, -1], [-0.3, -1, 0], 'point') }],
    [1.05, { R: P([0.1, -0.28, -0.62], [0, 0, -1], [-0.3, -1, 0], 'point') }],
  ]),
  'mahito.repel': demo([
    [0.6, { L: P([-0.015, -0.3, -0.3], [0, 1, -0.2], [1, 0, 0], 'flat'), R: P([0.015, -0.3, -0.3], [0, 1, -0.2], [-1, 0, 0], 'flat') }],
    [1.1, { L: P([-0.015, -0.3, -0.3], [0, 1, -0.2], [1, 0, 0], 'flat'), R: P([0.015, -0.3, -0.3], [0, 1, -0.2], [-1, 0, 0], 'flat') }],
    [1.35, { L: P([-0.12, -0.28, -0.6], [0, 1, -0.2], [0.3, 0, -1], 'open'), R: P([0.12, -0.28, -0.6], [0, 1, -0.2], [-0.3, 0, -1], 'open') }],
  ]),
  'mahito.launch': demo([
    [0.6, { R: P([0.03, -0.13, -0.08], [-0.5, 0.6, -0.4], [-0.3, -0.3, 1], 'fist') }],
    [1.0, { R: P([0.03, -0.13, -0.08], [-0.5, 0.6, -0.4], [-0.3, -0.3, 1], 'fist') }],
    [1.25, { R: P([0.12, -0.2, -0.6], [0, 0.2, -1], [0, -0.4, -1], 'open') }],
  ]),
  'mahito.domain': sign(P([-0.06, -0.24, -0.32], [0.4, 0.9, 0], [0.3, 0, -1], 'diamond'), P([0.06, -0.24, -0.32], [-0.4, 0.9, 0], [-0.3, 0, -1], 'diamond'), 1.8),
  // ── 죠고 ──
  'jogo.insects': demo([
    [0.6, { R: P([0.16, -0.24, -0.2], [0, 0.3, -1], [-0.3, -1, 0], 'fist') }],
    [0.9, { R: P([0.16, -0.24, -0.2], [0, 0.3, -1], [-0.3, -1, 0], 'fist') }],
    [1.1, { R: P([0.1, -0.2, -0.6], [0, 0.2, -1], [0, -0.4, -1], 'open') }],
  ]),
  'jogo.ray': demo([
    [0.6, { R: P([0.12, -0.26, -0.4], [0, 0, -1], [-0.3, -1, 0], 'point') }],
    [2.0, { R: P([0.12, -0.26, -0.4], [0, 0, -1], [-0.3, -1, 0], 'point') }],
  ]),
  'jogo.head': sign(P([-0.07, 0.1, -0.02], [0.6, 0.3, 0], [0, -1, 0], 'open'), P([0.07, 0.1, -0.02], [-0.6, 0.3, 0], [0, -1, 0], 'open'), 1.4),
  'jogo.erupt': demo([
    [0.6, { R: P([0.12, -0.15, -0.4], [0, 0, -1], [0, -1, 0], 'open') }],
    [0.9, { R: P([0.12, -0.15, -0.4], [0, 0, -1], [0, -1, 0], 'open') }],
    [1.1, { R: P([0.12, -0.5, -0.4], [0, 0, -1], [0, -1, 0], 'open') }],
  ]),
  'jogo.purgatory': demo([
    [0.6, { L: P([-0.1, -0.3, -0.36], [0.1, 0.4, -1], [1, 0, 0], 'cup'), R: P([0.1, -0.3, -0.36], [-0.1, 0.4, -1], [-1, 0, 0], 'cup') }],
    [1.8, { L: P([-0.1, -0.3, -0.36], [0.1, 0.4, -1], [1, 0, 0], 'cup'), R: P([0.1, -0.3, -0.36], [-0.1, 0.4, -1], [-1, 0, 0], 'cup') }],
    [2.05, { L: P([-0.1, -0.26, -0.66], [0, 0.3, -1], [0.6, 0, -1], 'open'), R: P([0.1, -0.26, -0.66], [0, 0.3, -1], [-0.6, 0, -1], 'open') }],
  ]),
  'jogo.meteor': sign(P([-0.18, 0.3, -0.12], [0, 1, 0], [0, 1, 0.2], 'open'), P([0.18, 0.3, -0.12], [0, 1, 0], [0, 1, 0.2], 'open'), 1.8),
  'jogo.domain': sign(P([-0.05, -0.22, -0.32], [0.85, 0.5, -0.1], [0.3, -0.6, -0.5], 'roof'), P([0.05, -0.22, -0.32], [-0.85, 0.5, -0.1], [-0.3, -0.6, -0.5], 'roof'), 1.8),
  // ── 유타 ──
  'yuta.sword': demo([
    [0.6, { R: P([0.18, -0.3, -0.3], [0, 0, -1], [-0.3, -1, 0], 'fist') }],
    [1.0, { R: P([0.3, -0.1, -0.3], [0, 0.3, -1], [-0.3, -1, 0], 'fist') }],
    [1.25, { R: P([-0.15, -0.4, -0.45], [-0.3, -0.2, -1], [-0.3, -1, 0], 'fist') }],
    [1.6, { R: P([-0.15, -0.4, -0.45], [-0.3, -0.2, -1], [-0.3, -1, 0], 'fist') }],
  ]),
  'yuta.rika': demo([
    [0.7, { L: P([-0.02, -0.14, -0.1], [0.6, 0.6, -0.2], [0.3, 0, 1], 'fist') }],
    [1.8, { L: P([-0.02, -0.14, -0.1], [0.6, 0.6, -0.2], [0.3, 0, 1], 'fist') }],
  ]),
  'yuta.beam': demo([
    [0.6, { L: P([-0.1, -0.3, -0.36], [0.1, 0.4, -1], [1, 0, 0], 'cup'), R: P([0.1, -0.3, -0.36], [-0.1, 0.4, -1], [-1, 0, 0], 'cup') }],
    [1.6, { L: P([-0.1, -0.3, -0.36], [0.1, 0.4, -1], [1, 0, 0], 'cup'), R: P([0.1, -0.3, -0.36], [-0.1, 0.4, -1], [-1, 0, 0], 'cup') }],
    [1.85, { L: P([-0.1, -0.26, -0.66], [0, 0.3, -1], [0.6, 0, -1], 'open'), R: P([0.1, -0.26, -0.66], [0, 0.3, -1], [-0.6, 0, -1], 'open') }],
  ]),
  'yuta.speech': demo([
    [0.6, { R: P([0.03, -0.2, -0.08], [-0.6, 0.6, -0.2], [0, 0, 1], 'flat') }],
    [1.2, { R: P([0.03, -0.2, -0.08], [-0.6, 0.6, -0.2], [0, 0, 1], 'flat') }],
    [1.45, { R: P([0.1, -0.22, -0.45], [0, 0.4, -1], [0, 0, -1], 'open') }],
  ]),
  'yuta.domain': sign(P([-0.03, -0.3, -0.2], [0.4, 0.6, -0.4], [0.2, -0.3, 1], 'fist'), P([0.07, -0.32, -0.32], [0, 1, 0], [0, 0, 1], 'flat'), 1.8),
};

// ───────────────── 손 모델 ─────────────────
class DemoHand {
  constructor(src, side, mat) {
    this.side = side;
    this.root = new THREE.Group();
    const model = skClone(src); // 그냥 clone 하면 원본 뼈를 그대로 가리킨다
    this.root.add(model);
    this.bones = {};
    let mesh = null;
    model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) mesh = o;
    });
    if (mesh) {
      mesh.material = mat;
      mesh.frustumCulled = false;
      mesh.renderOrder = 60;
    }
    model.updateMatrixWorld(true);
    // 바인드 자세: 관절의 손 루트 기준 행렬 (루트는 아직 원점) · 뼈는 Armature 의 자식이므로 쓸 때 되돌린다
    const arm = this.bones.wrist.parent;
    this.armInv = new THREE.Matrix4().copy(arm.matrixWorld).invert();
    this.bind = {};
    for (const [n, b] of Object.entries(this.bones)) this.bind[n] = b.matrixWorld.clone();
    // 손가락 사슬마다 부모 → 자식 로컬 변환
    this.chains = FINGERS.map((f) => {
      const segs = (f === 'thumb' ? SEG.thumb : SEG.other).map((s) => `${f}-${s}`);
      const local = segs.map((n, i) => new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(i ? this.bind[segs[i - 1]] : this.bind.wrist).invert(), this.bind[n]));
      return { f, segs, local };
    });
    // 바인드의 손 틀 (손끝 방향, 손바닥 방향)
    const pos = (n) => new THREE.Vector3().setFromMatrixPosition(this.bind[n]);
    const w = pos('wrist');
    const F = pos('middle-finger-phalanx-proximal').sub(w).normalize();
    const a = pos('index-finger-metacarpal').sub(w);
    const b = pos('pinky-finger-metacarpal').sub(w);
    const N = side === 'left' ? new THREE.Vector3().crossVectors(b, a) : new THREE.Vector3().crossVectors(a, b);
    N.addScaledVector(F, -N.dot(F)).normalize();
    this.bindBasis = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(N, F), N, F);
    this.wristBind = w;
    this.arm = arm;
    this.out = {};
  }

  /** 자세 적용: pose {p, f, n, c[5], s, o, thumbUp} */
  apply(pose) {
    // 1) 손 전체: 바인드 틀 → 목표 틀
    const F = _v.set(...pose.f).normalize();
    const N = new THREE.Vector3(...pose.n);
    N.addScaledVector(F, -N.dot(F)).normalize();
    const X = new THREE.Vector3().crossVectors(N, F);
    _m.makeBasis(X, N, F).multiply(_m2.copy(this.bindBasis).transpose());
    this.root.quaternion.setFromRotationMatrix(_m);
    this.root.position.set(...pose.p).sub(this.wristBind.clone().applyQuaternion(this.root.quaternion));
    // 2) 손가락: 손목에서부터 FK
    const wristM = this.bind.wrist;
    this._set('wrist', wristM);
    const mirror = this.side === 'left' ? -1 : 1;
    this.chains.forEach((ch, fi) => {
      let M = wristM.clone();
      const curl = pose.c[fi];
      const spread = (fi === 0 ? 0 : (fi - 2.2) * 0.12) * (pose.s ?? 0);
      ch.segs.forEach((n, si) => {
        M = M.clone().multiply(ch.local[si]);
        // 굽힘: 관절의 X 축 (음수 = 손바닥 쪽)
        let ang = 0;
        let side = 0;
        let twist = 0;
        if (fi === 0) {
          if (si === 0) {
            side = (pose.o ?? 0) * 35 * D2R; // 맞섬: 엄지를 손바닥 앞으로
            ang = -(pose.o ?? 0) * 15 * D2R;
            if (pose.thumbUp) side -= 25 * D2R;
          }
          if (si === 1) ang = -curl * 45 * D2R;
          if (si === 2) ang = -curl * 70 * D2R;
        } else {
          if (si === 1) {
            ang = -curl * 82 * D2R;
            side = spread;
          }
          if (si === 2) ang = -curl * 100 * D2R;
          if (si === 3) ang = -curl * 65 * D2R;
        }
        if (ang || side || twist) {
          _q.setFromAxisAngle(_x, ang);
          if (side) _q.premultiply(new THREE.Quaternion().setFromAxisAngle(_y, side * mirror));
          M.multiply(_m2.makeRotationFromQuaternion(_q));
        }
        this._set(n, M);
      });
    });
  }

  _set(n, M) {
    const b = this.bones[n];
    if (!b) return;
    _m3.multiplyMatrices(this.armInv, M).decompose(b.position, b.quaternion, b.scale);
  }
}

// 자세 보간
const lerpA = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
function resolve(p, side) {
  const base = p ?? (side === 'left' ? REST_L : REST_R);
  const S = SHAPES[base.k] ?? SHAPES.relax;
  return { p: base.p, f: base.f, n: base.n, c: S.c, s: S.s, o: S.o, thumbUp: base.thumbUp ?? 0 };
}
function mix(a, b, k) {
  const e = k * k * (3 - 2 * k);
  return { p: lerpA(a.p, b.p, e), f: lerpA(a.f, b.f, e), n: lerpA(a.n, b.n, e), c: lerpA(a.c, b.c, e), s: a.s + (b.s - a.s) * e, o: a.o + (b.o - a.o) * e, thumbUp: a.thumbUp + (b.thumbUp - a.thumbUp) * e };
}

/** 조작법 패널의 시연 무대 */
export class HandDemo {
  constructor() {
    this.group = new THREE.Group();
    this.stage = new THREE.Group(); // 플레이어 기준 좌표 (머리 = 원점)
    this.group.add(this.stage);
    this.ready = false;
    this.id = null;
    this.t = 0;
    const mat = new THREE.MeshStandardMaterial({ color: 0xf0d8c8, roughness: 0.55, metalness: 0, emissive: 0x3a2a24 });
    this.mat = mat;
    // 기준이 되는 머리·어깨 (반투명)
    const ghost = new THREE.MeshBasicMaterial({ color: 0x8aa0d0, transparent: true, opacity: 0.18, depthWrite: false });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 14).scale(0.85, 1.1, 1), ghost);
    head.position.set(0, 0.02, 0.06);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.35, 4, 12).scale(1.25, 1, 0.6), ghost);
    torso.position.set(0, -0.48, 0.1);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.01), new THREE.MeshBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.5 }));
    eyes.position.set(0, 0.02, -0.02);
    void torso;
    this.stage.add(head, eyes);
    const loader = new GLTFLoader();
    Promise.all(['left', 'right'].map((s) => loader.loadAsync(BASE + s + '.glb')))
      .then(([l, r]) => {
        this.L = new DemoHand(l.scene, 'left', mat);
        this.R = new DemoHand(r.scene, 'right', mat);
        this.stage.add(this.L.root, this.R.root);
        this.ready = true;
      })
      .catch((e) => console.warn('손 모델을 불러오지 못함', e));
  }

  durOf(id) {
    return DEMOS[id]?.dur ?? 3;
  }

  play(id) {
    if (id === this.id) return;
    this.id = id;
    this.t = 0;
  }

  update(dt) {
    const D = this.id && DEMOS[this.id];
    this.group.visible = !!D && this.ready;
    if (!D || !this.ready) return;
    this.t = (this.t + dt) % D.dur;
    const t = this.t;
    const keys = D.keys;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] <= t) i++;
    const [t0, a] = keys[i];
    const [t1, b] = keys[Math.min(i + 1, keys.length - 1)];
    const k = t1 > t0 ? Math.min(1, (t - t0) / (t1 - t0)) : 1;
    for (const side of ['left', 'right']) {
      const key = side === 'left' ? 'L' : 'R';
      (side === 'left' ? this.L : this.R).root.visible = D.uses[key];
      const pa = resolve(a[key], side);
      const pb = resolve(b[key], side);
      (side === 'left' ? this.L : this.R).apply(mix(pa, pb, k));
    }
  }
}
