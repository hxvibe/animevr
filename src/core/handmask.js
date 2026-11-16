// 손 위에 겹쳐 그리는 UI(기술명·안내 문구·데미지 숫자)가 손을 뚫고 보이지 않도록
// 손·컨트롤러 모델이 그린 픽셀에 스텐실 1을 기록하고, 오버레이는 스텐실 1인 곳을 건너뛴다.
import * as THREE from 'three';

export function markHand(mat) {
  if (!mat || mat.userData.__handMark) return;
  mat.userData.__handMark = true;
  mat.stencilWrite = true;
  mat.stencilRef = 1;
  mat.stencilFunc = THREE.AlwaysStencilFunc;
  mat.stencilZPass = THREE.ReplaceStencilOp;
  mat.stencilFail = THREE.KeepStencilOp;
  mat.stencilZFail = THREE.KeepStencilOp;
  mat.needsUpdate = true;
}

export function behindHands(mat) {
  mat.stencilWrite = true;
  mat.stencilRef = 1;
  mat.stencilWriteMask = 0;
  mat.stencilFunc = THREE.NotEqualStencilFunc;
  mat.stencilFail = THREE.KeepStencilOp;
  mat.stencilZFail = THREE.KeepStencilOp;
  mat.stencilZPass = THREE.KeepStencilOp;
  return mat;
}

/** 손/컨트롤러 모델 트리의 모든 재질을 표시 (모델이 비동기로 로드되므로 주기적으로 호출) */
export function markHandTree(root) {
  root.traverse((o) => {
    if (!o.material) return;
    if (Array.isArray(o.material)) o.material.forEach(markHand);
    else markHand(o.material);
  });
}
