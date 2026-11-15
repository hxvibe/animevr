// GLB 모델 로딩/캐시 (meshopt 압축 + WebP 텍스처)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = new URL('../../assets/models/', import.meta.url).href;
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = {};
const results = {};

/** 모델을 비동기로 로드 (한 번만) */
export function loadModel(name) {
  if (!cache[name]) {
    cache[name] = loader
      .loadAsync(BASE + name + '.glb')
      .then((g) => {
        results[name] = g.scene;
        return g.scene;
      })
      .catch((e) => {
        console.warn('모델 로드 실패:', name, e);
        results[name] = null;
        return null;
      });
  }
  return cache[name];
}

/** 이미 로드된 모델 (없으면 null) */
export function getModel(name) {
  return results[name] ?? null;
}

export function preload(names) {
  return Promise.all(names.map(loadModel));
}

/** 모델 크기를 맞추고 바닥/중심을 원점에 맞춘 래퍼 그룹 */
export function fitModel(src, { height, width, length, center = true, floor = true } = {}) {
  const obj = src.clone(true);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (height) s = height / size.y;
  else if (width) s = width / size.x;
  else if (length) s = length / size.z;
  const c = box.getCenter(new THREE.Vector3());
  const inner = new THREE.Group();
  inner.add(obj);
  obj.position.set(center ? -c.x : 0, floor ? -box.min.y : -c.y, center ? -c.z : 0);
  inner.scale.setScalar(s);
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.userData.size = size.clone().multiplyScalar(s);
  return wrap;
}
