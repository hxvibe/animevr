// 손을 감싸는 오라: 손 메시(스키닝)를 그대로 빌려 바깥으로 부풀린 껍질 세 겹
//   ① 바깥 번짐(가산)  ② 먹선 테두리(뒷면)  ③ 빛나는 띠 + 어둡게 비치는 속(앞면)
// 세기(0~1)에 따라 처음엔 듬성듬성 흐릿하다가 점점 선명하게 손을 감싼다.
// 컨트롤러면 손 메시가 없으므로 컨트롤러를 감싸는 타원체로 대신한다.
import * as THREE from 'three';

// 2026-11 새 디자인: 손에서 위로 핥아 오르는 셀 셰이딩 불꽃 — 주력이 넘쳐 흐르는 느낌
//   · 위를 향한 면의 정점을 노이즈만큼 위로 끌어올려 불꽃 혀를 만든다 (흐르며 바뀐다)
//   · 세로로 늘인 노이즈로 군데군데 잘라 낸 갈래 → 먹선 · 색 · 하얗게 달아오른 속을 단계로 칠한다
//   · 바깥 번짐(가산) + 먹선(뒷면, 같은 갈래 모양보다 조금 크게) + 본체(앞면)
const NOISE = /* glsl */ `
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z);
}`;

const vert = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uInflate;
uniform float uFlame;
uniform float uLick;
uniform float uTime;
uniform float uK;
varying vec3 vWN;
varying vec3 vWP;
varying float vLift;
${NOISE}
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
  float n = n3(wp.xyz * 26.0 + vec3(0.0, -uTime * 3.0, uTime * 0.6));
  // 불꽃 혀: 위를 향한 면일수록, 노이즈가 높은 곳일수록 위로 길게 (세기가 셀수록 길다)
  float tongue = n3(wp.xyz * vec3(11.0, 5.0, 11.0) + vec3(0.0, -uTime * 2.2, 0.0));
  float upF = clamp(wn.y * 0.5 + 0.6, 0.0, 1.0);
  float lick = pow(tongue, 2.2) * upF * uLick * (0.4 + 0.6 * uK);
  wp.xyz += wn * (uInflate + uFlame * n);
  wp.y += lick;
  vLift = clamp(lick / max(uLick, 1e-4), 0.0, 1.0);
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
varying float vLift;
${NOISE}
void main() {
  // 세로로 늘인 흐르는 노이즈 → 갈래진 불꽃 (끝으로 갈수록 가늘고 듬성듬성)
  float f = n3(vWP * vec3(30.0, 13.0, 30.0) + vec3(0.0, -uTime * 4.2, uTime * 0.5)) * 0.75 + n3(vWP * 70.0 + vec3(0.0, -uTime * 6.0, 0.0)) * 0.25;
  float cut = mix(0.3, 0.62, vLift) + (1.0 - uK) * 0.4;
  if (uPass > 0.5 && uPass < 1.5) cut -= 0.07; // 먹선: 같은 갈래보다 조금 넓게
  if (uPass < 0.5) cut -= 0.12;
  if (f < cut) discard;
  float e = f - cut;
  float facing = abs(dot(normalize(vWN), normalize(cameraPosition - vWP)));
  float fres = 1.0 - facing;
  if (uPass < 0.5) {
    gl_FragColor = vec4(uGlow * (0.18 + 0.4 * fres) * uK, 1.0);
    return;
  }
  if (uPass < 1.5) {
    gl_FragColor = vec4(uLine, min(1.0, uK * 1.6));
    return;
  }
  // 셀 단계: 가장자리 = 색, 깊은 곳 = 달아오른 빛, 손에 붙은 아래쪽은 어둡게 비치는 속
  vec3 col = uGlow;
  col = mix(col, uHot, step(0.2, e) * (0.55 + 0.45 * vLift));
  col = mix(col, uInner, step(0.55, facing) * (1.0 - vLift) * 0.75);
  // 띠 위의 먹 얼룩
  float speck = step(0.83, n3(vWP * 80.0 + vec3(0.0, -uTime * 2.5, 0.0)));
  col = mix(col, uLine, speck * 0.8);
  // 손을 마주 보는 가운데는 비쳐 손이 보이고, 가장자리·불꽃 혀는 진하게
  float a = mix(0.18, 0.95, max(smoothstep(0.3, 0.75, fres), vLift)) * (0.6 + 0.4 * step(0.08, e)) * min(1.0, uK * 1.4);
  gl_FragColor = vec4(col, a);
}`;

export const HAND_AURA_COLORS = {
  crimson: { glow: 0xff1e2e, hot: 0xff8080, inner: 0x3a0408, line: 0x070102 },
  cyan: { glow: 0x22d8e8, hot: 0xa0ffff, inner: 0x06323c, line: 0x02080a },
};

const _ctrlGeo = new THREE.SphereGeometry(1, 24, 16);
const _sp = new THREE.Vector3();
const _sp2 = new THREE.Vector3();
const _spC = new THREE.Color();

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
        uniforms: { ...u, uPass: { value: pass }, uInflate: { value: inflate }, uFlame: { value: flame }, uLick: { value: opts.lick ?? 0.05 } },
        transparent: true,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        ...opts,
      });
    const strip = (o) => {
      const { lick, ...rest } = o;
      void lick;
      return rest;
    };
    const mk = (pass, inflate, flame, o) => {
      const m = make(pass, inflate, flame, strip(o));
      m.uniforms.uLick.value = o.lick;
      return m;
    };
    return [
      mk(0, 0.026, 0.012, { blending: THREE.AdditiveBlending, side: THREE.BackSide, lick: 0.13 }),
      mk(1, 0.015, 0.009, { side: THREE.BackSide, lick: 0.12 }),
      mk(2, 0.01, 0.009, { side: THREE.FrontSide, lick: 0.115 }),
    ];
  }

  /** 이번 프레임에 이 손에 원하는 세기 (부르지 않으면 서서히 꺼진다) */
  set(side, k) {
    const s = this.sides[side];
    s.target = Math.max(s.target, THREE.MathUtils.clamp(k, 0, 1));
  }

  _handMesh(side) {
    const inp = this.ctx.input;
    // 컨트롤러 손(가상 손)
    if (inp[side]?.emulated) {
      const H = inp.ctrlHands?.hands?.[side];
      let sk = null;
      H?.root.traverse((o) => {
        if (!sk && o.isSkinnedMesh && !o.userData.aura) sk = o;
      });
      return H?.root.visible ? sk : null;
    }
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
      // 불티: 손에서 위로 흩날린다
      if (sk && on && s.k > 0.25 && Math.random() < s.k * 0.5) {
        const fx = this.ctx.fx;
        _sp.copy(h.palm).add(_sp2.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.3) * 0.08, (Math.random() - 0.5) * 0.08));
        fx.spawn?.(_sp, _sp2.set((Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 0.15), _spC.setHex(Math.random() < 0.6 ? this.C.glow : this.C.hot), 0.012 + Math.random() * 0.012, 0.35 + Math.random() * 0.3, 0, 0);
      }
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

/**
 * 물건(못 등)을 감싸는 같은 오라: 메시마다 부풀린 껍질 세 겹을 자식으로 붙인다 (재질은 하나를 함께 쓴다)
 *  size: 부풀림·불꽃 혀 길이 배율 (작은 물건은 작게)
 */
export class MeshAura {
  constructor(colors = 'crimson', size = 1) {
    this.C = typeof colors === 'string' ? HAND_AURA_COLORS[colors] : colors;
    this.time = { value: 0 };
    this.u = HandAura.prototype._uniforms.call(this);
    this.mats = HandAura.prototype._materials.call(this, this.u);
    for (const m of this.mats) {
      m.uniforms.uInflate.value *= size;
      m.uniforms.uFlame.value *= size;
      m.uniforms.uLick.value *= size;
    }
    this.k = 0;
    this.target = 0;
  }

  /** obj 안의 메시마다 껍질을 붙인다 (먹선 메시는 건너뜀) */
  attach(obj) {
    const list = [];
    obj.traverse((m) => {
      if (!m.isMesh || m.userData.aura || (m.material?.side === THREE.BackSide && m.material.isMeshBasicMaterial)) return;
      list.push(m);
    });
    for (const m of list) {
      this.mats.forEach((mat, i) => {
        const a = new THREE.Mesh(m.geometry, mat);
        a.userData.aura = true;
        a.renderOrder = 20 + i;
        a.frustumCulled = false;
        m.add(a);
      });
    }
  }

  set(k) {
    this.target = Math.max(this.target, THREE.MathUtils.clamp(k, 0, 1));
  }

  update(dt) {
    this.time.value += dt;
    this.k += (this.target - this.k) * Math.min(1, dt * (this.target > this.k ? 2.5 : 3.5));
    this.target = 0;
    this.u.uK.value = this.k;
    for (const m of this.mats) m.visible = this.k > 0.01;
  }

  dispose() {
    for (const m of this.mats) m.dispose();
  }
}
