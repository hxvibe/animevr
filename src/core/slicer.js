// 절단(클리핑 평면) 조각과 SUPERHOT풍 유리 파편
import * as THREE from 'three';

/**
 * 잘린 조각의 안쪽(뒷면) 색. 단면은 평면 뚜껑(아래 Slicer 의 스텐실 캡)이 덮고,
 *  이건 뚜껑이 못 덮는 틈(열린 메시 가장자리 등)으로 보이는 안쪽만 칠한다.
 *  mode 'flesh': 검붉은 피 · 'solid': 그 재질의 색을 어둡게 (상자 · 소품 — 피가 없다)
 */
export function fleshInside(mat, mode = 'flesh') {
  const prev = mat.onBeforeCompile;
  const solid = mode === 'solid' && !!mat.color;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    const code = solid
      ? `
  if (!gl_FrontFacing) gl_FragColor = vec4(diffuse * 0.55, 1.0);
`
      : `
  if (!gl_FrontFacing) gl_FragColor = vec4(0.17, 0.0, 0.012, 1.0);
`;
    const f = sh.fragmentShader;
    const k = f.lastIndexOf('}');
    sh.fragmentShader = f.slice(0, k) + code + f.slice(k);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + (solid ? '|solidIn' : '|flesh');
  mat.needsUpdate = true;
  return mat;
}

// ───────── 단면 뚜껑 (스텐실 캡) ─────────
// 조각의 메시를 그 절단면으로만 잘라 뒷면 +1 · 앞면 −1 로 스텐실에 센다 → 0 이 아닌 곳이 '평면이 물체 속을 지나는 곳'
//  → 그 평면 위 사각형을 스텐실 ≠ 0 인 곳에만 그린다 (다른 절단면으로는 잘라 둔다) → 정확히 평평한 단면
let _ro = 100; // 뚜껑마다 그리는 순서 (스텐실 세기 → 뚜껑 → 지우기)
const _capMats = new Map();
/** 피 단면: 월드 좌표 잡음으로 짙은 피 · 엉긴 피 · 번들거리는 선홍 */
function bloodCapMat() {
  let m = _capMats.get('blood');
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCapW;').replace('#include <project_vertex>', '#include <project_vertex>\nvCapW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCapW;
float capH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float capN(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(capH(i), capH(i + vec3(1, 0, 0)), f.x), mix(capH(i + vec3(0, 1, 0)), capH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(capH(i + vec3(0, 0, 1)), capH(i + vec3(1, 0, 1)), f.x), mix(capH(i + vec3(0, 1, 1)), capH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  float cn = capN(vCapW * 14.0) * 0.6 + capN(vCapW * 37.0) * 0.4;
  vec3 bc = mix(vec3(0.1, 0.0, 0.008), vec3(0.3, 0.012, 0.02), smoothstep(0.25, 0.7, cn));
  bc = mix(bc, vec3(0.48, 0.03, 0.035), smoothstep(0.72, 0.85, cn) * 0.6);
  bc *= mix(0.55, 1.0, smoothstep(0.12, 0.3, capN(vCapW * 9.0 + 3.0)));
  diffuseColor.rgb = bc;`
      );
  };
  m.customProgramCacheKey = () => 'bloodCap';
  _capMats.set('blood', m);
  return m;
}

/** 조각 obj 의 i 번째 절단면 뚜껑을 만든다 (obj 로컬 좌표) */
function addCap(obj, piece, i, centerL, R, o) {
  const ro = (_ro += 4);
  const wp = piece.worldPlanes;
  const stencil = (side, op) =>
    new THREE.MeshBasicMaterial({
      side,
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: op,
      stencilZFail: op,
      stencilZPass: op,
      clippingPlanes: [wp[i]],
    });
  const back = stencil(THREE.BackSide, THREE.IncrementWrapStencilOp);
  const front = stencil(THREE.FrontSide, THREE.DecrementWrapStencilOp);
  const meshes = [];
  obj.traverse((m) => {
    // 반투명 · 머리카락 같은 양면 판 · 피 반구(열린 메시)는 세지 않는다
    if (m.isMesh && !m.userData.capPart && m.userData.capSolid) meshes.push(m);
  });
  if (!meshes.length) return [];
  for (const m of meshes) {
    for (const mat of [back, front]) {
      const sm = new THREE.Mesh(m.geometry, mat);
      sm.renderOrder = ro + 1;
      sm.userData.capPart = true;
      sm.castShadow = false;
      sm.frustumCulled = m.frustumCulled;
      m.add(sm);
    }
  }
  const lp = piece.localPlanes[i];
  const others = wp.filter((_, j) => j !== i);
  let capMat;
  if (o.inside === 'solid') {
    capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.capColor ?? o.color ?? 0x888888).multiplyScalar(0.8), roughness: 0.85, side: THREE.DoubleSide });
  } else capMat = bloodCapMat().clone();
  if (o.inside !== 'solid') capMat.onBeforeCompile = bloodCapMat().onBeforeCompile;
  if (o.inside !== 'solid') capMat.customProgramCacheKey = () => 'bloodCap';
  Object.assign(capMat, { stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp, clippingPlanes: others });
  const geo = new THREE.PlaneGeometry(R * 2.4, R * 2.4);
  const cap = new THREE.Mesh(geo, capMat);
  cap.position.copy(lp.projectPoint(centerL, new THREE.Vector3()));
  cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), lp.normal);
  cap.renderOrder = ro + 2;
  cap.castShadow = false;
  cap.userData.capPart = true;
  obj.add(cap);
  // 뚜껑이 다른 절단면에 잘려 남은 스텐실까지 지운다 (다음 조각이 오염되지 않게)
  const clr = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp }));
  clr.position.copy(cap.position);
  clr.quaternion.copy(cap.quaternion);
  clr.renderOrder = ro + 3;
  clr.userData.capPart = true;
  obj.add(clr);
  return [back, front, capMat, clr.material, geo];
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

const MAX_SHARDS = 900;
const MAX_PIECES = 36;

export class Shatter {
  constructor(scene, envMap) {
    const geo = new THREE.TetrahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1, flatShading: true, envMap, envMapIntensity: 1.2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_SHARDS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHARDS * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = MAX_SHARDS;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.items.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), size: 0 });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.cursor = 0;
    this.color = new THREE.Color();
  }

  /** 반경 안에서 파편을 흩뿌림 */
  emit(center, count, color, opts = {}) {
    const c = this.color.set(color);
    const spread = opts.spread ?? 0.4;
    const speed = opts.speed ?? 3;
    const size = opts.size ?? 0.06;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_SHARDS;
      const it = this.items[i];
      it.pos.copy(center).add(_v.randomDirection().multiplyScalar(Math.random() * spread));
      if (opts.box) it.pos.set(center.x + (Math.random() - 0.5) * opts.box.x, center.y + (Math.random() - 0.5) * opts.box.y, center.z + (Math.random() - 0.5) * opts.box.z);
      it.vel.copy(_v.randomDirection()).multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      if (opts.dir) it.vel.addScaledVector(opts.dir, opts.dirAmt ?? speed);
      it.vel.y += opts.up ?? 1.5;
      it.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      it.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      it.size = size * (0.4 + Math.random() * 1.0);
      it.life = it.maxLife = (opts.life ?? 3) * (0.7 + Math.random() * 0.5);
      it.grav = opts.grav ?? 9.8;
      const shade = 0.75 + Math.random() * 0.35;
      this.mesh.instanceColor.setXYZ(i, c.r * shade, c.g * shade, c.b * shade);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX_SHARDS; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      any = true;
      it.life -= dt;
      it.vel.y -= it.grav * dt;
      it.pos.addScaledVector(it.vel, dt);
      if (it.pos.y < it.size * 0.5) {
        it.pos.y = it.size * 0.5;
        it.vel.y = Math.abs(it.vel.y) * 0.25;
        it.vel.x *= 0.7;
        it.vel.z *= 0.7;
        it.spin.multiplyScalar(0.7);
      }
      it.rot.x += it.spin.x * dt;
      it.rot.y += it.spin.y * dt;
      it.rot.z += it.spin.z * dt;
      const k = it.life <= 0 ? 0 : Math.min(1, it.life / 0.6);
      _q.setFromEuler(it.rot);
      _s.setScalar(it.size * k);
      this.mesh.setMatrixAt(i, _m.compose(it.pos, _q, _s));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.items[i].life = 0;
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * 평면으로 물체를 둘로 자른다. 원본 Object3D의 복제본 두 개에
 * 각자 반대쪽을 잘라내는 클리핑 평면을 붙여 "조각"으로 만든다.
 */
export class Slicer {
  constructor(scene, shatter) {
    this.scene = scene;
    this.shatter = shatter;
    this.pieces = [];
  }

  /**
   * @param {THREE.Object3D} obj 자를 대상(장면에 붙어 있어야 함)
   * @param {THREE.Plane} plane 월드 좌표 절단면
   * @param {object} o { color, vel, localPlanes(기존 조각이면), center }
   * @returns 생성된 조각 배열
   */
  slice(obj, plane, o = {}) {
    obj.updateMatrixWorld(true);
    // 조각이 너무 많으면 가장 오래된 것부터 파편으로 흩어 자리를 만든다
    //  (예전엔 그냥 돌아가서, 자르려던 원본(죽은 더미)이 장면에 그대로 남아 사라지지 않았다)
    while (this.pieces.length >= MAX_PIECES - 1) this.shatterPiece(this.pieces[0], 8);
    const center = o.center ? o.center.clone() : new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    const out = [];
    // 바닥 충돌용 표본점: 모든 메시의 꼭짓점 일부 (obj 로컬 좌표) — 조각마다 남는 쪽만 골라 쓴다
    const invObj = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    const all = [];
    obj.traverse((m) => {
      if (!m.isMesh || !m.geometry?.attributes?.position || m.userData.capPart) return;
      const n = m.geometry.attributes.position.count;
      const step = Math.max(1, Math.ceil(n / 300));
      for (let i = 0; i < n; i += step) {
        const v = new THREE.Vector3();
        try {
          if (m.getVertexPosition) m.getVertexPosition(i, v);
          else v.fromBufferAttribute(m.geometry.attributes.position, i);
        } catch (_) {
          v.fromBufferAttribute(m.geometry.attributes.position, i);
        }
        all.push(v.applyMatrix4(m.matrixWorld).applyMatrix4(invObj));
      }
    });
    for (const s of [1, -1]) {
      const clone = obj.clone(true);
      // 예전 뚜껑 · 스텐실은 버리고 새로 만든다
      const old = [];
      clone.traverse((m) => m.userData.capPart && old.push(m));
      for (const m of old) m.parent?.remove(m);
      const matMap = new Map();
      const worldPlanes = [];
      const localPlanes = [];
      // 기존 조각이 가진 절단면 유지
      for (const lp of o.localPlanes ?? []) {
        localPlanes.push(lp.clone());
        worldPlanes.push(new THREE.Plane());
      }
      const p = plane.clone();
      if (s < 0) p.negate();
      // 월드 평면 → obj 로컬 좌표 평면
      const inv = _m.copy(obj.matrixWorld).invert();
      localPlanes.push(p.clone().applyMatrix4(inv));
      worldPlanes.push(new THREE.Plane());
      clone.traverse((m) => {
        if (!m.isMesh) return;
        const src = m.material;
        let cm = matMap.get(src);
        if (!cm) {
          cm = src.clone();
          cm.side = THREE.DoubleSide;
          cm.clippingPlanes = worldPlanes;
          cm.clipShadows = false;
          fleshInside(cm, o.inside);
          matMap.set(src, cm);
        }
        // 단면 세기에 넣을 메시인가 (처음 자를 때의 재질로 정해 두고, 다시 자를 때도 그대로 쓴다)
        m.userData.capSolid ??= !(src.transparent || src.alphaTest > 0 || src.side === THREE.DoubleSide || src.userData?.noFlash);
        m.material = cm;
      });
      // 조각 중심을 피벗으로 사용
      const pivot = new THREE.Group();
      const pc = center.clone().addScaledVector(plane.normal, 0.18 * s);
      pivot.position.copy(pc);
      this.scene.add(pivot);
      // clone을 피벗 아래에 동일한 월드 변환으로 배치
      obj.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
      clone.position.sub(pc);
      pivot.add(clone);
      const piece = {
        pivot,
        obj: clone,
        localPlanes,
        worldPlanes,
        materials: [...matMap.values()],
        vel: (o.vel ? o.vel.clone() : new THREE.Vector3()).addScaledVector(plane.normal, s * (o.sep ?? 1.6)).add(_v.set(0, 1.2, 0)),
        spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
        life: o.life ?? 6,
        color: o.color ?? 0xff3311,
        radius: o.radius ?? 0.3,
        grounded: false,
        samples: pickSamples(all, localPlanes),
        inside: o.inside ?? 'flesh',
        capColor: o.capColor,
      };
      this._updatePlanes(piece);
      // 절단면마다 평평한 뚜껑 (몸: 피 · 소품: 제 색)
      const cl = center.clone().applyMatrix4(invObj);
      let R = 0;
      for (const v of all) R = Math.max(R, v.distanceTo(cl));
      for (let i = 0; i < localPlanes.length; i++) piece.materials.push(...addCap(clone, piece, i, cl, R || 0.5, { ...o, color: piece.color }));
      this.pieces.push(piece);
      out.push(piece);
    }
    // 원본 제거
    obj.parent?.remove(obj);
    return out;
  }

  /** 이미 존재하는 조각을 다시 자르기 */
  sliceAgain(piece, plane, o = {}) {
    this.remove(piece, false);
    piece.pivot.updateMatrixWorld(true);
    const res = this.slice(piece.obj, plane, { ...o, localPlanes: piece.localPlanes, color: piece.color, vel: piece.vel, center: piece.pivot.position, inside: piece.inside, capColor: piece.capColor });
    this.scene.remove(piece.pivot);
    for (const m of piece.materials) m.dispose();
    return res;
  }

  _updatePlanes(piece) {
    piece.pivot.updateMatrixWorld(true);
    const mw = piece.obj.matrixWorld;
    for (let i = 0; i < piece.localPlanes.length; i++) piece.worldPlanes[i].copy(piece.localPlanes[i]).applyMatrix4(mw);
  }

  remove(piece, dispose = true) {
    const i = this.pieces.indexOf(piece);
    if (i >= 0) this.pieces.splice(i, 1);
    if (dispose) {
      this.scene.remove(piece.pivot);
      for (const m of piece.materials) m.dispose();
    }
  }

  /** 조각을 파편으로 만들어 제거 */
  shatterPiece(piece, count = 18) {
    this.shatter.emit(piece.pivot.position, count, piece.color, { spread: piece.radius, speed: 2 });
    this.remove(piece);
  }

  clear() {
    for (const p of [...this.pieces]) this.remove(p);
  }

  update(dt, forceFn) {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.shatterPiece(p, 14);
        continue;
      }
      if (forceFn) forceFn(p, dt);
      p.vel.y -= 9.8 * dt;
      p.pivot.position.addScaledVector(p.vel, dt);
      _e.set(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt);
      p.pivot.quaternion.multiply(_q.setFromEuler(_e));
      if (p.wspin) {
        const w = p.wspin.length();
        if (w > 1e-4) p.pivot.quaternion.premultiply(_q.setFromAxisAngle(_v2.copy(p.wspin).divideScalar(w), w * dt));
        p.wspin.multiplyScalar(Math.max(0, 1 - dt * 5));
      }
      // 바닥: 실제 남은 조각의 가장 낮은 점이 땅 위에 오도록 (조각이 땅에 박히지 않게)
      let low = null;
      if (p.samples?.length) {
        p.pivot.updateMatrixWorld(true);
        const mw = p.obj.matrixWorld;
        let minY = Infinity;
        for (const q of p.samples) {
          _v2.copy(q).applyMatrix4(mw);
          if (_v2.y < minY) {
            minY = _v2.y;
            low = _v.copy(_v2);
          }
        }
        if (minY < 0) p.pivot.position.y -= minY;
        else low = null;
      } else if (p.pivot.position.y < p.radius * 0.6) {
        p.pivot.position.y = p.radius * 0.6;
        low = _v.copy(p.pivot.position).setY(0);
      }
      if (low) {
        if (p.vel.y < 0) p.vel.y = -p.vel.y * 0.2;
        if (Math.abs(p.vel.y) < 0.4) p.vel.y = 0;
        // 마찰
        p.vel.x *= Math.max(0, 1 - dt * 6);
        p.vel.z *= Math.max(0, 1 - dt * 6);
        // 넘어짐: 닿은 점을 축으로 무게중심이 아래로 가도록 돈다
        const rx = p.pivot.position.x - low.x;
        const rz = p.pivot.position.z - low.z;
        p.wspin ??= new THREE.Vector3();
        p.wspin.x += rz * 40 * dt;
        p.wspin.z -= rx * 40 * dt;
        p.spin.multiplyScalar(Math.max(0, 1 - dt * 6));
        // 지면을 구르는 만큼만 미끄러진다
        p.grounded = true;
      }
      this._updatePlanes(p);
    }
  }
}

/** 남는 쪽(모든 절단면의 앞)에 있는 표본만, 최대 96개 */
function pickSamples(all, planes) {
  const keep = [];
  for (const v of all) {
    let ok = true;
    for (const pl of planes) {
      if (pl.distanceToPoint(v) < -0.002) {
        ok = false;
        break;
      }
    }
    if (ok) keep.push(v);
  }
  if (keep.length <= 96) return keep;
  const out = [];
  const step = keep.length / 96;
  for (let i = 0; i < 96; i++) out.push(keep[Math.floor(i * step)]);
  return out;
}

export { MAX_PIECES };
void _v2;
