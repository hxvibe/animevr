// 핸드트래킹 관절 데이터(WebXR XRHand 25개 관절)로 손 모양을 판별한다.
// 모든 계산은 기준 공간(rig 로컬) 좌표에서 이루어지므로 회전/이동에 무관하다.
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

/** 손가락 굽힘 정도(도). 펴면 0~40, 주먹이면 200 이상. */
export function fingerBend(J, f) {
  const m = J[f + '-metacarpal'];
  const p = J[f + '-phalanx-proximal'];
  const i = J[f + '-phalanx-intermediate'];
  const d = J[f + '-phalanx-distal'];
  const t = J[f + '-tip'];
  _v1.subVectors(p, m);
  _v2.subVectors(i, p);
  _v3.subVectors(d, i);
  _v4.subVectors(t, d);
  return angleBetween(_v1, _v2) + angleBetween(_v2, _v3) + angleBetween(_v3, _v4);
}

export function thumbBend(J) {
  _v1.subVectors(J['thumb-phalanx-proximal'], J['thumb-metacarpal']);
  _v2.subVectors(J['thumb-phalanx-distal'], J['thumb-phalanx-proximal']);
  _v3.subVectors(J['thumb-tip'], J['thumb-phalanx-distal']);
  return angleBetween(_v1, _v2) + angleBetween(_v2, _v3);
}

const EXT = 80; // 이 값보다 작으면 편 손가락
const CURL = 120; // 이 값보다 크면 굽힌 손가락

/**
 * 손 모양 분류.
 * @param {Record<string, THREE.Vector3>} J 관절 이름 → 위치(rig 로컬)
 * @param {'left'|'right'} side
 * @param {object} out 결과를 채울 객체
 */
export function classifyHand(J, side, out) {
  const bI = fingerBend(J, 'index-finger');
  const bM = fingerBend(J, 'middle-finger');
  const bR = fingerBend(J, 'ring-finger');
  const bP = fingerBend(J, 'pinky-finger');
  out.bends = [bI, bM, bR, bP];

  const iExt = bI < EXT;
  const mExt = bM < EXT;
  const rExt = bR < EXT;
  const pExt = bP < EXT;
  const iCurl = bI > CURL;
  const mCurl = bM > CURL;
  const rCurl = bR > CURL - 15;
  const pCurl = bP > CURL - 15;

  // 손바닥 중심과 법선
  const wrist = J['wrist'];
  out.palm.copy(wrist).lerp(J['middle-finger-phalanx-proximal'], 0.55);
  _a.subVectors(J['index-finger-metacarpal'], wrist);
  _b.subVectors(J['pinky-finger-metacarpal'], wrist);
  if (side === 'left') out.palmNormal.crossVectors(_b, _a);
  else out.palmNormal.crossVectors(_a, _b);
  out.palmNormal.normalize();

  // 교차(검지·중지 꼬기) 판정: 검지 끝이 중지 끝보다 새끼손가락 쪽으로 넘어가 있는지
  const lateral = _c.subVectors(J['pinky-finger-phalanx-proximal'], J['index-finger-phalanx-proximal']).normalize();
  const baseSep = _d.subVectors(J['middle-finger-phalanx-proximal'], J['index-finger-phalanx-proximal']).dot(lateral);
  const tipSep = _d.subVectors(J['middle-finger-tip'], J['index-finger-tip']).dot(lateral);
  const tipDist = J['middle-finger-tip'].distanceTo(J['index-finger-tip']);
  const crossed = bI < 110 && bM < 110 && rCurl && pCurl && baseSep > 0 && tipSep < 0.002 && tipDist < 0.04;
  out.crossValue = tipSep;

  let g = 'none';
  if (crossed) g = 'crossed';
  else if (iExt && mExt && rExt && pExt) g = 'open';
  else if (iExt && mExt && rCurl && pCurl) g = 'two';
  else if (iExt && mCurl && rCurl && pCurl) g = 'point';
  else if (iCurl && mCurl && rCurl && pCurl) g = 'fist';
  out.raw = g;

  // 조준 방향과 끝점
  if (g === 'two' || g === 'crossed') {
    out.tip.copy(J['index-finger-tip']).add(J['middle-finger-tip']).multiplyScalar(0.5);
    _a.copy(J['index-finger-phalanx-proximal']).add(J['middle-finger-phalanx-proximal']).multiplyScalar(0.5);
    out.dir.subVectors(out.tip, _a).normalize();
  } else {
    out.tip.copy(J['index-finger-tip']);
    out.dir.subVectors(J['index-finger-tip'], J['index-finger-phalanx-proximal']).normalize();
  }
  out.pinch = J['thumb-tip'].distanceTo(J['index-finger-tip']) < 0.02;
  return out;
}

export function makeGestureResult() {
  return {
    raw: 'none',
    bends: [0, 0, 0, 0],
    palm: new THREE.Vector3(),
    palmNormal: new THREE.Vector3(),
    tip: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, -1),
    pinch: false,
    crossValue: 0,
  };
}

export const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];
