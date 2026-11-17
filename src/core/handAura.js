// 손을 감싸는 오라: 손 메시(스키닝)를 그대로 빌려 바깥으로 부풀린 껍질 세 겹
//   ① 바깥 번짐(가산)  ② 먹선 테두리(뒷면)  ③ 빛나는 띠 + 어둡게 비치는 속(앞면)
// 세기(0~1)에 따라 처음엔 듬성듬성 흐릿하다가 점점 선명하게 손을 감싼다.
// 컨트롤러면 손 메시가 없으므로 컨트롤러를 감싸는 타원체로 대신한다.
import * as THREE from 'three';

const vert = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uInflate;
uniform float uFlame;
uniform float uTime;
varying vec3 vWN;
varying vec3 vWP;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  // 월드 공간(m)에서 부풀린다: 모델 크기와 관계없이 일정한 두께
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
  // 위로 흘러가는 일렁임 (불꽃처럼 위쪽 면이 더 출렁인다)
  float n = n3(wp.xyz * 28.0 + vec3(0.0, -uTime * 2.6, uTime * 0.7));
  float up = 0.6 + 0.4 * max(0.0, wn.y);
  wp.xyz += wn * (uInflate + uFlame * n * up);
  vWN = wn;
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uK;
uniform float uPass; // 0: 번짐  1: 먹선  2: 본체
uniform vec3 uGlow;
uniform vec3 uHot;
uniform vec3 uInner;
uniform vec3 uLine;
varying vec3 vWN;
varying vec3 vWP;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  // 세기가 낮을 땐 군데군데만 보이다가 점점 빈틈없이 감싼다
  float spot = n3(vWP * 14.0 + vec3(0.0, -uTime * 1.5, 0.0));
  if (spot > uK * 1.35 + 0.05) discard;
  float facing = abs(dot(normalize(vWN), normalize(cameraPosition - vWP)));
  float fres = 1.0 - facing;
  float flow = n3(vWP * 30.0 + vec3(0.0, -uTime * 3.2, uTime));
  if (uPass < 0.5) {
    gl_FragColor = vec4(uGlow * (0.25 + 0.35 * fres) * uK, 1.0);
    return;
  }
  if (uPass < 1.5) {
    gl_FragColor = vec4(uLine, 0.95 * min(1.0, uK * 1.6));
    return;
  }
  // 가장자리는 빛나는 띠, 가운데는 어둡게 비친다
  float band = smoothstep(0.35 - flow * 0.2, 0.72, fres);
  vec3 col = mix(uInner, uGlow, band);
  col = mix(col, uHot, smoothstep(0.78, 0.95, fres + flow * 0.12) * 0.7);
  // 띠 위의 먹 얼룩
  float speck = step(0.8, n3(vWP * 70.0 + vec3(0.0, -uTime * 2.0, 0.0))) * step(0.3, band);
  col = mix(col, uLine, speck * 0.85);
  float a = mix(0.28, 0.95, band) * min(1.0, uK * 1.3);
  gl_FragColor = vec4(col, a);
}`;

export const HAND_AURA_COLORS = {
  crimson: { glow: 0xff1e2e, hot: 0xff8080, inner: 0x3a0408, line: 0x070102 },
  cyan: { glow: 0x22d8e8, hot: 0xa0ffff, inner: 0x06323c, line: 0x02080a },
};

const _ctrlGeo = new THREE.SphereGeometry(1, 24, 16);

export class HandAura {
  constructor(ctx, colors = 'crimson') {
    this.ctx = ctx;
    const C = typeof colors === 'string' ? HAND_AURA_COLORS[colors] : colors;
    this.C = C;
    this.time = { value: 0 };
    this.sides = {};
    for (const side of ['left', 'right']) this.sides[side] = { k: 0, target: 0, src: null, layers: null, ctrl: null, u: this._uniforms() };
  }

  _uniforms() {
    const C = this.C;
    return {
      uTime: this.time,
      uK: { value: 0 },
      uGlow: { value: new THREE.Color(C.glow) },
      uHot: { value: new THREE.Color(C.hot) },
      uInner: { value: new THREE.Color(C.inner) },
      uLine: { value: new THREE.Color(C.line) },
    };
  }

  _materials(u) {
    // [번짐, 먹선, 본체] 각각 부풀림 두께(m)와 일렁임
    const make = (pass, inflate, flame, opts) =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { ...u, uPass: { value: pass }, uInflate: { value: inflate }, uFlame: { value: flame } },
        transparent: true,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        ...opts,
      });
    return [
      make(0, 0.03, 0.016, { blending: THREE.AdditiveBlending, side: THREE.BackSide }),
      make(1, 0.0165, 0.012, { side: THREE.BackSide }),
      make(2, 0.011, 0.012, { side: THREE.FrontSide }),
    ];
  }

  /** 이번 프레임에 이 손에 원하는 세기 (부르지 않으면 서서히 꺼진다) */
  set(side, k) {
    const s = this.sides[side];
    s.target = Math.max(s.target, THREE.MathUtils.clamp(k, 0, 1));
  }

  _handMesh(side) {
    const inp = this.ctx.input;
    for (const slot of inp.slots ?? []) {
      const m = slot.models?.[side];
      if (!m || !m.group.visible || slot.inputSource?.handedness !== side) continue;
      let sk = null;
      m.group.traverse((o) => {
        if (!sk && o.isSkinnedMesh && !o.userData.aura) sk = o;
      });
      if (sk) return sk;
    }
    return null;
  }

  _attach(s, sk) {
    this._detach(s);
    const mats = this._materials(s.u);
    s.layers = mats.map((mat, i) => {
      const m = new THREE.SkinnedMesh(sk.geometry, mat);
      m.bind(sk.skeleton, sk.bindMatrix);
      m.userData.aura = true;
      m.frustumCulled = false;
      m.renderOrder = 20 + i;
      m.position.copy(sk.position);
      m.quaternion.copy(sk.quaternion);
      m.scale.copy(sk.scale);
      sk.parent.add(m);
      return m;
    });
    s.src = sk;
  }

  _detach(s) {
    if (!s.layers) return;
    for (const m of s.layers) {
      m.parent?.remove(m);
      m.material.dispose();
    }
    s.layers = null;
    s.src = null;
  }

  _ctrl(s) {
    if (s.ctrl) return s.ctrl;
    const g = new THREE.Group();
    this._materials(s.u).forEach((mat, i) => {
      const m = new THREE.Mesh(_ctrlGeo, mat);
      m.renderOrder = 20 + i;
      g.add(m);
    });
    g.scale.set(0.045, 0.04, 0.075);
    this.ctx.scene.add(g);
    s.ctrl = g;
    return g;
  }

  update(dt) {
    this.time.value += dt;
    const inp = this.ctx.input;
    for (const side of ['left', 'right']) {
      const s = this.sides[side];
      const h = inp[side];
      // 켜질 땐 천천히 선명해지고, 꺼질 땐 조금 더 빨리
      const rate = s.target > s.k ? 2.5 : 3.5;
      s.k += (s.target - s.k) * Math.min(1, dt * rate);
      if (s.target === 0 && s.k < 0.01) s.k = 0;
      s.target = 0;
      s.u.uK.value = s.k;
      const on = s.k > 0.01 && h.active;
      // 손 추적: 지금 보이는 손 메시에 붙인다 (메시가 바뀌면 다시 붙임)
      const sk = on && h.source === 'hand' ? this._handMesh(side) : null;
      if (sk && sk !== s.src) this._attach(s, sk);
      if (s.layers) for (const m of s.layers) m.visible = !!sk && on;
      // 컨트롤러: 타원체로 감싼다
      const useCtrl = on && h.source === 'controller';
      if (useCtrl || s.ctrl) {
        const g = this._ctrl(s);
        g.visible = useCtrl;
        if (useCtrl) {
          g.position.copy(h.palm);
          g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), h.dir);
        }
      }
    }
  }

  dispose() {
    for (const s of Object.values(this.sides)) {
      this._detach(s);
      if (s.ctrl) {
        this.ctx.scene.remove(s.ctrl);
        s.ctrl.children.forEach((m) => m.material.dispose());
      }
    }
  }
}
