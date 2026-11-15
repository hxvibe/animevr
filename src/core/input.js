// 컨트롤러 · 핸드트래킹 · 데스크톱(마우스/키보드) 입력을 HandState 하나로 통합한다.
// 기술 판정(의도)은 각 캐릭터가 이 상태를 읽어 직접 결정한다.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { classifyHand, makeGestureResult, JOINT_NAMES } from './gestures.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const PROFILES = new URL('../../assets/profiles/', import.meta.url).href;

export class HandState {
  constructor(side) {
    this.side = side;
    this.source = null; // 'controller' | 'hand' | 'desktop'
    this.active = false;
    this.pos = new THREE.Vector3(); // 조준 원점(손끝 / 컨트롤러 끝)
    this.dir = new THREE.Vector3(0, 0, -1); // 조준 방향
    this.palm = new THREE.Vector3(); // 손바닥 / 그립 위치
    this.palmNormal = new THREE.Vector3(0, -1, 0);
    this.fingersDir = new THREE.Vector3(0, 0, -1);
    this.vel = new THREE.Vector3();
    this.speed = 0;
    this.thrust = 0;
    this._prev = new THREE.Vector3();
    this._hasPrev = false;

    this.gesture = 'none'; // 안정화된 손 모양
    this.gestureTime = 0; // 현재 손 모양이 유지된 시간
    this.prevGesture = 'none';
    this._raw = 'none';
    this._rawT = 0;
    this.pinch = false;
    this.pinchDist = 1;

    this.inputSource = null;
    this.gamepad = null;
    this.btn = { trigger: false, grip: false, a: false, b: false, stick: false };
    this.prevBtn = { ...this.btn };
    this.axes = [0, 0];
    this.triggerValue = 0;
    this.gripValue = 0;
    this.uiBlock = false; // 메뉴를 조작 중이면 true → 캐릭터는 이 손을 무시
    this.joints = null;
    this.indexTip = new THREE.Vector3();
  }

  pressed(name) {
    return this.btn[name] && !this.prevBtn[name];
  }

  released(name) {
    return !this.btn[name] && this.prevBtn[name];
  }

  /** 핸드트래킹이면 손 모양, 컨트롤러면 버튼으로 판단하는 "주먹 쥐기" */
  get gripping() {
    if (this.source === 'controller') return this.btn.grip;
    return this.gesture === 'fist';
  }

  pulse(intensity = 0.5, ms = 40) {
    const act = this.gamepad?.hapticActuators?.[0];
    if (!act) return;
    try {
      if (act.pulse) act.pulse(Math.min(1, intensity), ms);
      else if (act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch (_) { /* 미지원 기기 */ }
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
    this.mode = 'none'; // 'xr' | 'desktop' | 'none'
    this.heightOffset = 0;

    this.actions = { toggleMenu: false, quickSpawn: false };
    this.slots = [];
    this._gest = { left: makeGestureResult(), right: makeGestureResult() };
    this._jointPos = { left: {}, right: {} };
    for (const n of JOINT_NAMES) {
      this._jointPos.left[n] = new THREE.Vector3();
      this._jointPos.right[n] = new THREE.Vector3();
    }
    this._palmUp = 0;
    this._snapReady = true;
    this.locomotion = true;

    this._setupXR();
    this._setupDesktop();
  }

  _setupXR() {
    const xr = this.renderer.xr;
    const cmf = new XRControllerModelFactory();
    cmf.setPath(PROFILES);
    const hmf = new XRHandModelFactory();
    hmf.setPath(PROFILES + 'generic-hand/');
    const rayGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    for (let i = 0; i < 2; i++) {
      const controller = xr.getController(i);
      const grip = xr.getControllerGrip(i);
      const hand = xr.getHand(i);
      this.rig.add(controller, grip, hand);
      grip.add(cmf.createControllerModel(grip));
      // 메타 퀘스트 기본 손 모델 (WebXR generic-hand 프로필, 로컬 번들)
      hand.add(hmf.createHandModel(hand, 'mesh'));
      const ray = new THREE.Line(rayGeom, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
      ray.scale.z = 2.5;
      ray.visible = false;
      controller.add(ray);
      const slot = { controller, grip, hand, ray, inputSource: null };
      this.slots.push(slot);
      controller.addEventListener('connected', (e) => {
        slot.inputSource = e.data;
      });
      controller.addEventListener('disconnected', () => {
        slot.inputSource = null;
        ray.visible = false;
      });
    }
  }

  /** 메뉴가 열렸을 때만 컨트롤러 레이저 표시 */
  setRaysVisible(on) {
    for (const s of this.slots) s.ray.visible = on && !!s.inputSource && !s.inputSource.hand;
  }

  _setupDesktop() {
    this.keys = new Set();
    this.mouse = { left: false, right: false, leftPrev: false, rightPrev: false, dx: 0, dy: 0 };
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
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'desktop') return;
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) {
        if (e.code === 'KeyH' || e.code === 'Tab') this.actions.toggleMenu = true;
        if (e.code === 'KeyR') this.actions.quickSpawn = true;
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
  }

  keyDown(code) {
    return this.keys.has(code);
  }

  get mouseLeftPressed() {
    return this.mouse.left && !this.mouse.leftPrev;
  }

  get mouseRightPressed() {
    return this.mouse.right && !this.mouse.rightPrev;
  }

  endFrame() {
    for (const k in this.actions) this.actions[k] = false;
    for (const h of this.hands) Object.assign(h.prevBtn, h.btn);
    this.mouse.leftPrev = this.mouse.left;
    this.mouse.rightPrev = this.mouse.right;
    this.mouse.dx = this.mouse.dy = 0;
  }

  update(dt) {
    const xr = this.renderer.xr;
    if (xr.isPresenting) {
      this.mode = 'xr';
      xr.updateCamera(this.camera);
    }
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldQuaternion(this.headQuat);
    this.headDir.set(0, 0, -1).applyQuaternion(this.headQuat);

    for (const h of this.hands) h.active = false;
    if (this.mode === 'xr') this._updateXR(dt);
    else if (this.mode === 'desktop') this._updateDesktop(dt);

    for (const h of this.hands) {
      if (!h.active) {
        h._hasPrev = false;
        h.vel.set(0, 0, 0);
        h.speed = h.thrust = 0;
        continue;
      }
      if (h._hasPrev && dt > 0) {
        _v.subVectors(h.palm, h._prev).divideScalar(dt);
        h.vel.lerp(_v, 0.5);
      }
      h._prev.copy(h.palm);
      h._hasPrev = true;
      h.speed = h.vel.length();
      h.thrust = h.vel.dot(h.dir);
    }
  }

  _setGesture(h, raw, dt) {
    // 같은 손 모양이 60ms 이상 유지되어야 확정 (순간적인 오인식 무시)
    if (raw === h._raw) h._rawT += dt;
    else {
      h._raw = raw;
      h._rawT = 0;
    }
    if (h._raw !== h.gesture && h._rawT >= 0.06) {
      h.prevGesture = h.gesture;
      h.gesture = h._raw;
      h.gestureTime = 0;
    } else h.gestureTime += dt;
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
      if (src.hand) this._readHand(h, slot, dt);
      else if (src.gamepad) this._readController(h, slot, dt);
    }

    // 로코모션 / 스냅 회전 (컨트롤러)
    if (this.locomotion && L.source === 'controller' && L.active) {
      const [x, y] = L.axes;
      if (Math.hypot(x, y) > 0.15) {
        _fwd.copy(this.headDir).setY(0).normalize();
        const rightV = _v.set(-_fwd.z, 0, _fwd.x);
        const speed = 2.4 * dt;
        this.rig.position.addScaledVector(_fwd, -y * speed).addScaledVector(rightV, x * speed);
      }
    }
    if (R.source === 'controller' && R.active) {
      const x = R.axes[0];
      if (Math.abs(x) > 0.7 && this._snapReady) {
        this.snapTurn(x > 0 ? -Math.PI / 6 : Math.PI / 6);
        this._snapReady = false;
      } else if (Math.abs(x) < 0.3) this._snapReady = true;
    }

    if (L.source === 'controller' && L.pressed('b')) this.actions.toggleMenu = true; // Y
    if (R.source === 'controller' && R.pressed('b')) this.actions.quickSpawn = true; // B

    // 핸드트래킹 메뉴: 왼손바닥을 하늘로 펴고 0.8초
    if (L.active && L.source === 'hand' && L.gesture === 'open' && L.palmNormal.y > 0.75 && L.palm.y > this.head.y - 0.6) {
      this._palmUp += dt;
      if (this._palmUp > 0.8) {
        this.actions.toggleMenu = true;
        this._palmUp = -2;
      }
    } else if (this._palmUp > 0) this._palmUp = 0;
    else this._palmUp = Math.min(0, this._palmUp + dt);
  }

  snapTurn(angle) {
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
    h.joints = null;
    slot.controller.getWorldPosition(h.pos);
    slot.controller.getWorldQuaternion(_q);
    h.dir.set(0, 0, -1).applyQuaternion(_q);
    h.fingersDir.copy(h.dir);
    slot.grip.getWorldPosition(h.palm);
    if (h.palm.lengthSq() === 0) h.palm.copy(h.pos);
    h.palmNormal.set(h.side === 'left' ? 1 : -1, 0, 0).applyQuaternion(_q);
    h.indexTip.copy(h.pos);

    const b = gp.buttons;
    h.triggerValue = b[0]?.value ?? 0;
    h.gripValue = b[1]?.value ?? (b[1]?.pressed ? 1 : 0);
    h.btn.trigger = h.btn.trigger ? h.triggerValue > 0.3 : h.triggerValue > 0.6;
    h.btn.grip = h.btn.grip ? h.gripValue > 0.3 : h.gripValue > 0.6;
    h.btn.stick = !!b[3]?.pressed;
    h.btn.a = !!b[4]?.pressed;
    h.btn.b = !!b[5]?.pressed;
    const ax = gp.axes;
    if (ax.length >= 4) {
      h.axes[0] = ax[2];
      h.axes[1] = ax[3];
    } else {
      h.axes[0] = ax[0] ?? 0;
      h.axes[1] = ax[1] ?? 0;
    }
    // 컨트롤러도 대략적인 손 모양을 제공
    const g = h.btn.grip && h.btn.trigger ? 'fist' : h.btn.trigger ? 'point' : h.btn.grip ? 'fist' : 'open';
    this._setGesture(h, g, dt);
    h.pinch = h.btn.trigger;
  }

  _readHand(h, slot, dt) {
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
    for (const k in h.btn) h.btn[k] = false;

    const g = this._gest[h.side];
    classifyHand(J, h.side, g);
    this._setGesture(h, g.raw, dt);
    h.pinch = g.pinch;
    h.pinchDist = g.pinchDist;

    const m = this.rig.matrixWorld;
    h.pos.copy(g.tip).applyMatrix4(m);
    h.dir.copy(g.dir).transformDirection(m);
    h.fingersDir.copy(g.fingersDir).transformDirection(m);
    h.palm.copy(g.palm).applyMatrix4(m);
    h.palmNormal.copy(g.palmNormal).transformDirection(m);
    h.indexTip.copy(J['index-finger-tip']).applyMatrix4(m);
  }

  _updateDesktop(dt) {
    this.rig.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(this.pitch, 0, 0);
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(this.head);
    this.camera.getWorldQuaternion(this.headQuat);
    this.headDir.set(0, 0, -1).applyQuaternion(this.headQuat);

    const k = this.keys;
    if (this.locomotion) {
      _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const rightV = _v.set(-_fwd.z, 0, _fwd.x);
      const sp = (k.has('ShiftLeft') ? 6 : 3) * dt;
      if (k.has('KeyW')) this.rig.position.addScaledVector(_fwd, sp);
      if (k.has('KeyS')) this.rig.position.addScaledVector(_fwd, -sp);
      if (k.has('KeyD')) this.rig.position.addScaledVector(rightV, sp);
      if (k.has('KeyA')) this.rig.position.addScaledVector(rightV, -sp);
    }
    const place = (h, x) => {
      h.source = 'desktop';
      h.active = true;
      h.gamepad = null;
      h.pos.set(x, -0.2, -0.42).applyQuaternion(this.headQuat).add(this.head);
      h.palm.copy(h.pos);
      h.dir.copy(this.headDir);
      h.fingersDir.copy(this.headDir);
      h.palmNormal.copy(this.headDir);
      h.indexTip.copy(h.pos);
    };
    place(this.left, -0.2);
    place(this.right, 0.2);
  }

  /** 플레이어 몸통 중심 (투사체 판정용) */
  bodyCenter(out) {
    return out.copy(this.head).add(_v.set(0, -0.35, 0));
  }
}
