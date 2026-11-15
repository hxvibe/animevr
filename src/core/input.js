// 컨트롤러 · 핸드트래킹 · 데스크톱(마우스/키보드) 입력을 하나의 HandState로 통합한다.
// 캐릭터 스킬 코드는 입력 장치를 몰라도 되며 "의도(intent)"만 읽는다.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { classifyHand, makeGestureResult, JOINT_NAMES } from './gestures.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();

export class HandState {
  constructor(side) {
    this.side = side;
    this.source = null; // 'controller' | 'hand' | 'desktop' | null
    this.active = false;
    this.pos = new THREE.Vector3(); // 조준 원점(월드)
    this.dir = new THREE.Vector3(0, 0, -1); // 조준 방향(월드)
    this.palm = new THREE.Vector3(); // 손바닥/그립 위치(월드)
    this.palmNormal = new THREE.Vector3(0, -1, 0);
    this.vel = new THREE.Vector3(); // 손 속도(월드, 평활화)
    this._prev = new THREE.Vector3();
    this._hasPrev = false;
    this.thrust = 0; // 조준 방향으로의 속도 m/s

    this.gesture = 'none';
    this._rawGesture = 'none';
    this._rawCount = 0;

    // 의도
    this.blue = false;
    this.red = false;
    this.domainSign = false;
    this.open = false;

    // 컨트롤러
    this.inputSource = null;
    this.gamepad = null;
    this.btn = { trigger: false, grip: false, a: false, b: false, stick: false };
    this.prevBtn = { ...this.btn };
    this.axes = [0, 0];
    this.triggerValue = 0;

    this.uiBlock = false; // UI 패널을 가리키는 중이면 스킬 입력 차단
    this.joints = null; // 핸드트래킹 시 rig-로컬 관절 위치
    this.indexTipWorld = new THREE.Vector3();
  }

  pressed(name) {
    return this.btn[name] && !this.prevBtn[name];
  }

  released(name) {
    return !this.btn[name] && this.prevBtn[name];
  }

  pulse(intensity = 0.5, ms = 40) {
    const act = this.gamepad?.hapticActuators?.[0];
    if (!act) return;
    try {
      if (act.pulse) act.pulse(intensity, ms);
      else if (act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch (_) { /* 일부 기기는 지원하지 않음 */ }
  }

  _resetIntents() {
    this.blue = this.red = this.domainSign = this.open = false;
  }
}

export class Input {
  constructor(renderer, rig, camera, dom) {
    this.renderer = renderer;
    this.rig = rig;
    this.camera = camera;
    this.dom = dom;
    this.left = new HandState('left');
    this.right = new HandState('right');
    this.hands = [this.left, this.right];
    this.head = new THREE.Vector3(0, 1.6, 0);
    this.headDir = new THREE.Vector3(0, 0, -1);
    this.headQuat = new THREE.Quaternion();
    this.mode = 'none'; // 'xr' | 'desktop'

    // 한 프레임짜리 전역 액션
    this.actions = { toggleInfinity: false, toggleSixEyes: false, reset: false, toggleHelp: false };
    this.desktopFuse = false;
    this.blueDistance = 5; // 데스크톱/컨트롤러 기본 창 거리

    this.slots = [];
    this._gest = { left: makeGestureResult(), right: makeGestureResult() };
    this._jointPos = { left: {}, right: {} };
    for (const n of JOINT_NAMES) {
      this._jointPos.left[n] = new THREE.Vector3();
      this._jointPos.right[n] = new THREE.Vector3();
    }
    this._holds = { palmOut: 0, sixEyesArm: 0, sixEyesArmed: false, palmUp: 0 };
    this._snapReady = true;

    this._setupXR();
    this._setupDesktop();
  }

  _setupXR() {
    const xr = this.renderer.xr;
    const cmf = new XRControllerModelFactory();
    const hmf = new XRHandModelFactory();
    const rayGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    for (let i = 0; i < 2; i++) {
      const controller = xr.getController(i);
      const grip = xr.getControllerGrip(i);
      const hand = xr.getHand(i);
      this.rig.add(controller, grip, hand);
      grip.add(cmf.createControllerModel(grip));
      hand.add(hmf.createHandModel(hand, 'mesh'));
      const ray = new THREE.Line(rayGeom, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35 }));
      ray.scale.z = 3;
      ray.visible = false;
      controller.add(ray);
      const slot = { controller, grip, hand, ray, inputSource: null };
      this.slots.push(slot);
      controller.addEventListener('connected', (e) => {
        slot.inputSource = e.data;
        ray.visible = !e.data.hand;
      });
      controller.addEventListener('disconnected', () => {
        slot.inputSource = null;
        ray.visible = false;
      });
    }
  }

  _setupDesktop() {
    this.keys = new Set();
    this.mouse = { left: false, right: false };
    this.yaw = 0;
    this.pitch = 0;
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (this.mode !== 'desktop') return;
      if (document.pointerLockElement !== el) {
        el.requestPointerLock?.();
        return;
      }
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.mode !== 'desktop' || document.pointerLockElement !== el) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.4, 1.4);
    });
    window.addEventListener('wheel', (e) => {
      if (this.mode !== 'desktop') return;
      this.blueDistance = THREE.MathUtils.clamp(this.blueDistance - Math.sign(e.deltaY) * 0.5, 2, 12);
    });
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'desktop') return;
      const k = e.code;
      if (!this.keys.has(k)) {
        if (k === 'KeyI') this.actions.toggleInfinity = true;
        if (k === 'KeyO') this.actions.toggleSixEyes = true;
        if (k === 'KeyR') this.actions.reset = true;
        if (k === 'KeyH') this.actions.toggleHelp = true;
      }
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
  }

  /** 프레임 끝에서 호출: 일회성 액션 초기화 */
  endFrame() {
    for (const k in this.actions) this.actions[k] = false;
    for (const h of this.hands) Object.assign(h.prevBtn, h.btn);
  }

  update(dt, frame) {
    const xr = this.renderer.xr;
    if (xr.isPresenting) {
      this.mode = 'xr';
      xr.updateCamera(this.camera);
    }
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldQuaternion(this.headQuat);
    this.headDir.set(0, 0, -1).applyQuaternion(this.headQuat);

    for (const h of this.hands) {
      h.active = false;
      h._resetIntents();
    }

    if (this.mode === 'xr') this._updateXR(dt);
    else if (this.mode === 'desktop') this._updateDesktop(dt);

    for (const h of this.hands) {
      if (!h.active) {
        h._hasPrev = false;
        h.vel.set(0, 0, 0);
        h.thrust = 0;
        continue;
      }
      if (h._hasPrev && dt > 0) {
        _v.subVectors(h.palm, h._prev).divideScalar(dt);
        h.vel.lerp(_v, 0.45);
      }
      h._prev.copy(h.palm);
      h._hasPrev = true;
      h.thrust = h.vel.dot(h.dir);
    }

    if (this.mode === 'xr') this._globalGestures(dt);
  }

  _updateXR(dt) {
    const L = this.left;
    const R = this.right;
    for (const slot of this.slots) {
      const src = slot.inputSource;
      if (!src) continue;
      const h = src.handedness === 'left' ? L : src.handedness === 'right' ? R : null;
      if (!h) continue;
      h.inputSource = src;
      if (src.hand) this._readHand(h, slot);
      else if (src.gamepad) this._readController(h, slot, dt);
    }

    // 컨트롤러: 양손 그립을 함께 쥐면 영역전개 수인
    if (L.source === 'controller' && R.source === 'controller' && L.active && R.active) {
      const both = L.btn.grip && R.btn.grip;
      L.domainSign = R.domainSign = both;
    }

    // 로코모션 (컨트롤러 전용)
    if (L.source === 'controller' && L.active) {
      const [x, y] = L.axes;
      if (Math.hypot(x, y) > 0.15) {
        _fwd.copy(this.headDir).setY(0).normalize();
        const rightV = _v.set(-_fwd.z, 0, _fwd.x);
        const speed = 2.6 * dt;
        this.rig.position.addScaledVector(_fwd, -y * speed).addScaledVector(rightV, x * speed);
      }
    }
    if (R.source === 'controller' && R.active) {
      const x = R.axes[0];
      if (Math.abs(x) > 0.7 && this._snapReady) {
        this._snapTurn(x > 0 ? -Math.PI / 6 : Math.PI / 6);
        this._snapReady = false;
      } else if (Math.abs(x) < 0.3) this._snapReady = true;
    }

    if (L.source === 'controller') {
      if (L.pressed('a')) this.actions.toggleInfinity = true; // X
      if (L.pressed('b')) this.actions.toggleHelp = true; // Y
    }
    if (R.source === 'controller') {
      if (R.pressed('a')) this.actions.toggleSixEyes = true; // A
      if (R.pressed('b')) this.actions.reset = true; // B
    }
  }

  _snapTurn(angle) {
    // 머리 위치를 축으로 rig 회전
    const pivot = this.head.clone();
    this.rig.position.sub(pivot).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).add(pivot);
    this.rig.rotation.y += angle;
  }

  _readController(h, slot, dt) {
    const src = slot.inputSource;
    const gp = src.gamepad;
    h.source = 'controller';
    h.gamepad = gp;
    h.active = true;
    slot.controller.getWorldPosition(h.pos);
    slot.controller.getWorldQuaternion(_q);
    h.dir.set(0, 0, -1).applyQuaternion(_q);
    slot.grip.getWorldPosition(h.palm);
    if (h.palm.lengthSq() === 0) h.palm.copy(h.pos);
    h.palmNormal.set(0, -1, 0).applyQuaternion(_q);
    h.indexTipWorld.copy(h.pos);

    const b = gp.buttons;
    h.triggerValue = b[0]?.value ?? 0;
    // 히스테리시스
    h.btn.trigger = h.btn.trigger ? h.triggerValue > 0.3 : h.triggerValue > 0.6;
    h.btn.grip = !!(b[1]?.pressed);
    h.btn.stick = !!(b[3]?.pressed);
    h.btn.a = !!(b[4]?.pressed);
    h.btn.b = !!(b[5]?.pressed);
    const ax = gp.axes;
    if (ax.length >= 4) {
      h.axes[0] = ax[2];
      h.axes[1] = ax[3];
    } else {
      h.axes[0] = ax[0] ?? 0;
      h.axes[1] = ax[1] ?? 0;
    }

    if (!h.uiBlock) {
      if (h.side === 'left') h.blue = h.btn.trigger;
      else h.red = h.btn.trigger;
    }
    h.open = !h.btn.trigger;
    h.gesture = h.btn.trigger ? (h.side === 'left' ? 'two' : 'point') : 'open';
  }

  _readHand(h, slot) {
    const joints = slot.hand.joints;
    const wrist = joints?.['wrist'];
    if (!wrist || !wrist.visible) return;
    const J = this._jointPos[h.side];
    for (const n of JOINT_NAMES) {
      const j = joints[n];
      if (!j) return;
      J[n].copy(j.position);
    }
    h.source = 'hand';
    h.gamepad = null;
    h.active = true;
    h.joints = J;

    const g = this._gest[h.side];
    classifyHand(J, h.side, g);

    // 프레임 간 안정화: 같은 결과가 3프레임 연속일 때 확정
    if (g.raw === h._rawGesture) h._rawCount++;
    else {
      h._rawGesture = g.raw;
      h._rawCount = 1;
    }
    if (h._rawCount >= 3) h.gesture = g.raw;

    const m = this.rig.matrixWorld;
    h.pos.copy(g.tip).applyMatrix4(m);
    h.dir.copy(g.dir).transformDirection(m);
    h.palm.copy(g.palm).applyMatrix4(m);
    h.palmNormal.copy(g.palmNormal).transformDirection(m);
    h.indexTipWorld.copy(J['index-finger-tip']).applyMatrix4(m);

    // 손가락을 위로 세워 얼굴 앞에 두면(=수인) 창 대신 영역전개 사인으로 처리
    const nearFace = h.palm.distanceTo(this.head) < 0.35;
    const upright = h.dir.y > 0.75;
    const signPose = nearFace && upright;

    if (!h.uiBlock) {
      h.blue = h.gesture === 'two' && !signPose;
      h.red = h.gesture === 'point';
      h.domainSign = h.gesture === 'crossed' || (h.gesture === 'two' && signPose);
    }
    h.open = h.gesture === 'open';
  }

  /** 핸드트래킹 전용 전역 제스처: 토글류 */
  _globalGestures(dt) {
    const L = this.left;
    const R = this.right;
    const H = this._holds;
    const handMode = (h) => h.active && h.source === 'hand';

    // 무하한 토글: 양 손바닥을 앞으로 내밀고 1초 유지
    const palmOut = (h) => {
      if (!handMode(h) || h.gesture !== 'open') return false;
      _v.subVectors(h.palm, this.head).normalize();
      return h.palmNormal.dot(_v) > 0.6 && h.palm.distanceTo(this.head) > 0.3;
    };
    if (palmOut(L) && palmOut(R)) {
      H.palmOut += dt;
      if (H.palmOut > 1.0) {
        this.actions.toggleInfinity = true;
        H.palmOut = -1.5; // 재발동 방지
      }
    } else if (H.palmOut > 0) H.palmOut = 0;
    else H.palmOut = Math.min(0, H.palmOut + dt);

    // 육안 토글: 펼친 손으로 눈을 가렸다가(0.5초) 떼면 토글 — 안대를 벗는 동작
    let covering = false;
    for (const h of this.hands) {
      if (!handMode(h) || h.gesture !== 'open') continue;
      _v.subVectors(this.head, h.palm);
      const d = _v.length();
      if (d < 0.16 && h.palmNormal.dot(_v.normalize()) > 0.4) covering = true;
    }
    if (covering) {
      H.sixEyesArm += dt;
      if (H.sixEyesArm > 0.5) H.sixEyesArmed = true;
    } else {
      if (H.sixEyesArmed) this.actions.toggleSixEyes = true;
      H.sixEyesArmed = false;
      H.sixEyesArm = 0;
    }

    // 메뉴 호출: 왼손바닥을 하늘로 펴고 0.8초
    if (handMode(L) && L.gesture === 'open' && L.palmNormal.y > 0.8) {
      H.palmUp += dt;
      if (H.palmUp > 0.8) {
        this.actions.toggleHelp = true;
        H.palmUp = -2;
      }
    } else if (H.palmUp > 0) H.palmUp = 0;
    else H.palmUp = Math.min(0, H.palmUp + dt);
  }

  _updateDesktop(dt) {
    // 시점
    this.rig.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(this.pitch, 0, 0);
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldQuaternion(this.headQuat);
    this.headDir.set(0, 0, -1).applyQuaternion(this.headQuat);

    // 이동
    const k = this.keys;
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rightV = _v.set(-_fwd.z, 0, _fwd.x);
    const sp = (k.has('ShiftLeft') ? 6 : 3) * dt;
    if (k.has('KeyW')) this.rig.position.addScaledVector(_fwd, sp);
    if (k.has('KeyS')) this.rig.position.addScaledVector(_fwd, -sp);
    if (k.has('KeyD')) this.rig.position.addScaledVector(rightV, sp);
    if (k.has('KeyA')) this.rig.position.addScaledVector(rightV, -sp);

    // 가상의 양손: 화면 좌하단/우하단
    const place = (h, x) => {
      h.source = 'desktop';
      h.active = true;
      h.gamepad = null;
      h.pos.set(x, -0.22, -0.45).applyQuaternion(this.headQuat).add(this.head);
      h.palm.copy(h.pos);
      h.dir.copy(this.headDir);
      h.palmNormal.copy(this.headDir);
      h.indexTipWorld.copy(h.pos);
    };
    place(this.left, -0.2);
    place(this.right, 0.2);
    const dpos = 0.06;
    this.desktopFuse = k.has('KeyE');
    if (this.desktopFuse) {
      // 두 손을 가운데로 모은다
      this.left.pos.lerp(this.right.pos, 0.5 - dpos);
      this.right.pos.copy(this.left.pos);
      this.left.palm.copy(this.left.pos);
      this.right.palm.copy(this.right.pos);
    }
    this.left.blue = this.mouse.right;
    this.right.red = this.mouse.left;
    this.left.open = !this.mouse.right;
    this.right.open = !this.mouse.left;
    this.left.gesture = this.mouse.right ? 'two' : 'open';
    this.right.gesture = this.mouse.left ? 'point' : 'open';
    const q = k.has('KeyQ');
    this.left.domainSign = this.right.domainSign = q;
    if (k.has('KeyF')) {
      // F: 앞으로 밀기(발사)
      this.left.vel.copy(this.headDir).multiplyScalar(3);
      this.right.vel.copy(this.headDir).multiplyScalar(3);
      this.left._hasPrev = this.right._hasPrev = false;
    }
  }

  /** 두 손이 맞닿았는가 (허식 「자」 융합 조건) */
  handsTogether() {
    if (this.mode === 'desktop') return this.desktopFuse;
    const L = this.left;
    const R = this.right;
    if (!L.active || !R.active) return false;
    const thr = L.source === 'controller' || R.source === 'controller' ? 0.2 : 0.14;
    return L.pos.distanceTo(R.pos) < thr || L.palm.distanceTo(R.palm) < thr;
  }

  /** 플레이어 몸통 중심 (투사체 판정용) */
  bodyCenter(out) {
    return out.copy(this.head).add(_v.set(0, -0.35, 0));
  }
}
