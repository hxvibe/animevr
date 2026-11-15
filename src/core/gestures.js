// 핸드트래킹 관절 데이터(WebXR XRHand 25개 관절)로 손 모양을 판별한다.
// 팔을 뻗어 손가락 일부가 가려지는 상황에서도 흔들리지 않도록
// 1) 관절 굽힘 각도  2) 손가락 직선도(끝-뿌리 거리 / 뼈 길이 합)  두 지표를 함께 쓴다.
import * as THREE from 'three';

export const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const RAD2DEG = 180 / Math.PI;

function angleBetween(a, b) {
  const la = a.length();
  const lb = b.length();
  if (la < 1e-6 || lb < 1e-6) return 0;
  return Math.acos(THREE.MathUtils.clamp(a.dot(b) / (la * lb), -1, 1)) * RAD2DEG;
}

/** 손가락 굽힘(도) 과 직선도(0~1) */
export function fingerMetrics(J, f, out) {
  const m = J[f + '-metacarpal'];
  const p = J[f + '-phalanx-proximal'];
  const i = J[f + '-phalanx-intermediate'];
  const d = J[f + '-phalanx-distal'];
  const t = J[f + '-tip'];
  _v1.subVectors(p, m);
  _v2.subVectors(i, p);
  _v3.subVectors(d, i);
  _v4.subVectors(t, d);
  out.bend = angleBetween(_v1, _v2) + angleBetween(_v2, _v3) + angleBetween(_v3, _v4);
  const len = _v2.length() + _v3.length() + _v4.length();
  out.straight = len > 1e-5 ? t.distanceTo(p) / len : 1;
  // 상태: 2 = 폄, 0 = 굽힘, 1 = 애매
  if (out.bend < 70 || (out.straight > 0.93 && out.bend < 110)) out.state = 2;
  else if (out.bend > 125 && out.straight < 0.78) out.state = 0;
  else out.state = 1;
  return out;
}

export function fingerBend(J, f) {
  return fingerMetrics(J, f, {}).bend;
}

export function makeGestureResult() {
  return {
    raw: 'none',
    bends: [0, 0, 0, 0],
    states: [1, 1, 1, 1],
    straight: [1, 1, 1, 1],
    palm: new THREE.Vector3(),
    palmNormal: new THREE.Vector3(),
    tip: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, -1),
    fingersDir: new THREE.Vector3(0, 0, -1),
    pinch: false,
    pinchDist: 1,
    crossValue: 0,
    _f: [{}, {}, {}, {}],
  };
}

/**
 * 손 모양 분류. 결과 raw:
 *  open(손바닥 펼침) / fist(주먹) / point(검지) / two(검지+중지) / crossed(검지·중지 꼬기) / purple(茈 수인) / pinch / none
 */
export function classifyHand(J, side, out) {
  for (let k = 0; k < 4; k++) {
    const r = fingerMetrics(J, FINGERS[k], out._f[k]);
    out.bends[k] = r.bend;
    out.states[k] = r.state;
    out.straight[k] = r.straight;
  }
  const [sI, sM, sR, sP] = out.states;
  const [bI, bM, bR, bP] = out.bends;

  // 손바닥 중심과 법선
  const wrist = J['wrist'];
  out.palm.copy(wrist).lerp(J['middle-finger-phalanx-proximal'], 0.55);
  _a.subVectors(J['index-finger-metacarpal'], wrist);
  _b.subVectors(J['pinky-finger-metacarpal'], wrist);
  if (side === 'left') out.palmNormal.crossVectors(_b, _a);
  else out.palmNormal.crossVectors(_a, _b);
  out.palmNormal.normalize();
  out.fingersDir.subVectors(J['middle-finger-phalanx-proximal'], wrist).normalize();

  out.pinchDist = J['thumb-tip'].distanceTo(J['index-finger-tip']);
  out.pinch = out.pinchDist < 0.022;

  // 교차 판정: 검지 끝이 중지 끝보다 새끼손가락 쪽으로 넘어가 있는지
  const lateral = _c.subVectors(J['pinky-finger-phalanx-proximal'], J['index-finger-phalanx-proximal']).normalize();
  const baseSep = _d.subVectors(J['middle-finger-phalanx-proximal'], J['index-finger-phalanx-proximal']).dot(lateral);
  const tipSep = _d.subVectors(J['middle-finger-tip'], J['index-finger-tip']).dot(lateral);
  const tipDist = J['middle-finger-tip'].distanceTo(J['index-finger-tip']);
  out.crossValue = tipSep;
  const lowerCurled = sR !== 2 && sP !== 2 && (bR > 95 || bP > 95);
  const crossed = sI !== 0 && sM !== 0 && lowerCurled && baseSep > 0 && tipSep < 0.003 && tipDist < 0.045;

  // 중지가 약지·새끼보다 확실히 더 펴져 있으면 "두 손가락"으로 본다 (팔을 뻗었을 때 중지가 덜 펴져 보이는 문제 대응)
  const middleUp = sM === 2 || (sM === 1 && bM < bR - 55 && out.straight[1] > 0.8);
  const middleDown = sM === 0 || (sM === 1 && bM > 110 && bM > bI + 70);

  // 허식 「茈」 수인: 검지·중지를 접고 그 위에 엄지를 얹은 채 약지·새끼를 편다
  const th = J['thumb-tip'];
  let thumbOn = 1;
  for (const k of ['index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip']) {
    thumbOn = Math.min(thumbOn, th.distanceTo(J[k]));
  }
  out.thumbOn = thumbOn;
  const purpleSign = sI !== 2 && sM !== 2 && bI > 95 && bM > 95 && sR !== 0 && sP !== 0 && bR + bP < 200 && bR < bM - 40 && thumbOn < 0.04;

  let g = 'none';
  if (purpleSign) g = 'purple';
  else if (crossed) g = 'crossed';
  else if (sI === 2 && sM === 2 && sR === 2 && sP !== 0) g = 'open';
  else if (sI === 2 && middleUp && lowerCurled) g = 'two';
  else if (sI === 2 && middleDown && lowerCurled) g = 'point';
  else if (sI === 0 && sM === 0 && sR === 0 && sP !== 2) g = 'fist';
  else if (out.pinch) g = 'pinch';
  else if (sI !== 0 && sM !== 0 && sR !== 0 && sP !== 0 && bI + bM + bR + bP < 250) g = 'open';
  out.raw = g;

  // 조준 방향과 끝점
  if (g === 'two' || g === 'crossed') {
    out.tip.copy(J['index-finger-tip']).add(J['middle-finger-tip']).multiplyScalar(0.5);
    _a.copy(J['index-finger-phalanx-proximal']).add(J['middle-finger-phalanx-proximal']).multiplyScalar(0.5);
    out.dir.subVectors(out.tip, _a).normalize();
  } else if (g === 'point') {
    out.tip.copy(J['index-finger-tip']);
    out.dir.subVectors(J['index-finger-tip'], J['index-finger-phalanx-proximal']).normalize();
  } else {
    out.tip.copy(J['index-finger-tip']);
    out.dir.copy(out.fingersDir);
  }
  return out;
}

export const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];
