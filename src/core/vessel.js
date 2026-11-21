// 스쿠나의 손가락 (메구미 · 유지)
//  허리춤(오른쪽 앞)에 손가락 하나를 차고 있다 → 주먹(또는 집게)으로 쥐어 입에 가져가면 먹는다
//  먹으면 스쿠나의 술식(解 · 捌 · 竈開 · 세계를 가르는 해)을 함께 쓴다
//  영역전개는 두 영역의 장점을 합친다: 내 영역(필중 · 지형) + 복마어주자의 참격 난사와 사당
import * as THREE from 'three';
import { getModel, loadModel } from './assets.js';
import { bodyOf, gripPoint } from './body.js';
import { Sukuna } from '../characters/sukuna/sukuna.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const BELT = [0.17, 0.03, -0.1]; // 오른쪽 허리 앞
const LEN = 0.09; // 손가락 길이 (m)

function fingerMesh() {
  const src = getModel('item_sukuna_finger');
  const g = new THREE.Group();
  if (!src) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, LEN - 0.022, 4, 8), new THREE.MeshToonMaterial({ color: 0x5a3a30 }));
    g.add(m);
    return g;
  }
  const c = src.clone(true);
  c.traverse((o) => {
    if (!o.isMesh) return;
    o.material = new THREE.MeshToonMaterial({ color: o.material.color ?? 0xffffff, map: o.material.map ?? null });
    o.castShadow = true;
  });
  // 크기 맞추기: 가장 긴 변 = LEN, 가운데가 원점, 긴 축을 Y로
  const box = new THREE.Box3().setFromObject(c);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = LEN / Math.max(size.x, size.y, size.z);
  c.position.sub(center);
  const w = new THREE.Group();
  w.add(c);
  w.scale.setScalar(s);
  if (size.x >= size.y && size.x >= size.z) w.rotation.z = Math.PI / 2;
  else if (size.z >= size.y) w.rotation.x = Math.PI / 2;
  g.add(w);
  // 먹선
  w.traverse((o) => {
    if (!o.isMesh || o.userData.ol) return;
    const ol = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide }));
    ol.userData.ol = true;
    ol.scale.setScalar(1.06);
    o.add(ol);
  });
  return g;
}

export class Vessel {
  constructor(host) {
    this.host = host;
    this.ctx = host.ctx;
    this.eaten = false;
    this.heldBy = null;
    this.g = new THREE.Group();
    this.ctx.scene.add(this.g);
    this.mesh = null;
    this.sukuna = null;
    this.guestOn = false;
    loadModel('item_sukuna_finger').then(() => this._build()).catch(() => this._build());
    this.glow = 0;
  }

  _build() {
    if (this.mesh || this.eaten || !this.g.parent) return;
    this.mesh = fingerMesh();
    this.g.add(this.mesh);
  }

  /** 지금 손가락을 쥔 손이 그 손인가 (캐릭터가 이 손의 주먹을 다른 데 쓰지 않게) */
  holds(side) {
    return this.heldBy === side;
  }

  update(dt) {
    const { input: inp } = this.ctx;
    if (this.eaten) {
      this._guest(dt);
      return;
    }
    if (!this.mesh) return;
    const B = bodyOf(this.ctx).update(dt);
    const desk = inp.mode === 'desktop';
    this.g.visible = !desk;
    // 데스크톱: X 키로 먹는다
    if (desk) {
      if (inp.keyDown?.('KeyX')) this._eat();
      return;
    }
    const mouth = _v2.copy(inp.head).add(_v.set(0, -0.09, 0)).addScaledVector(inp.headDir, 0.06);
    if (this.heldBy) {
      const h = inp[this.heldBy];
      const closed = h.active && (h.source === 'controller' ? h.btn.grip || h.btn.trigger : h.gesture === 'fist' || h.gesture === 'pinch' || h.pinch);
      if (!closed) {
        this.heldBy = null; // 손을 펴면 허리춤으로 돌아간다
      } else {
        // 쥔 손 안에 (집게면 엄지·검지 사이)
        if (h.source === 'hand' && (h.gesture === 'pinch' || h.pinch)) this.g.position.copy(h.indexTip);
        else gripPoint(h, this.ctx.rig, this.g.position);
        this.g.quaternion.setFromUnitVectors(_v.set(0, 1, 0), h.dir);
        if (this.g.position.distanceTo(mouth) < 0.11) this._eat();
        return;
      }
    }
    B.point(...BELT, this.g.position);
    this.g.quaternion.copy(B.quat).multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), 0.5));
    // 은은한 저주의 기운
    this.glow += dt;
    if (Math.random() < dt * 2) this.ctx.fx.burst(this.g.position, 1, new THREE.Color(0x601010), 0.3, 0.01, 0.6, { up: 0.3 });
    for (const h of [inp.left, inp.right]) {
      if (!h.active || h.uiBlock) continue;
      const closing = h.source === 'controller' ? h.pressed('grip') || h.pressed('trigger') : (h.gesture === 'fist' || h.gesture === 'pinch') && h.gestureTime < 0.25;
      const near = Math.min(h.palm.distanceTo(this.g.position), h.indexTip.distanceTo(this.g.position)) < 0.12;
      if (closing && near && !this.host.handBusy?.(h.side)) {
        this.heldBy = h.side;
        h.pulse?.(0.4, 30);
        this.ctx.sfx.play('click', { at: this.g.position, vol: 0.4, rate: 0.8 });
        break;
      }
    }
  }

  _eat() {
    const { ui, sfx, fx, input: inp } = this.ctx;
    this.eaten = true;
    this.heldBy = null;
    this.ctx.scene.remove(this.g);
    sfx.rumble(1.5, 0.7);
    sfx.play('domain_open', { vol: 0.7, rate: 1.3 });
    sfx.play('chant', { vol: 0.8, rate: 0.6 });
    fx.flash(inp.head.clone().addScaledVector(inp.headDir, 0.4), new THREE.Color(0xff2020), 3, 0.35);
    ui.manga({ top: '宿儺の指', main: '受肉', ruby: 'じゅにく', color: '#ff3030', big: true });
    ui.callout('스쿠나의 손가락을 삼켰다 — 解 · 捌 · 竈開 · 세계를 가르는 해를 함께 쓴다', { color: '#ff9a9a', dur: 3.5 });
    inp.left.pulse?.(1, 300);
    inp.right.pulse?.(1, 300);
    this.sukuna = new Sukuna(this.ctx);
    this.sukuna.guest = this.host;
  }

  /** 먹은 뒤: 스쿠나의 술식 + 영역 합치기 */
  _guest(dt) {
    const S = this.sukuna;
    if (!S) return;
    S.guestUpdate(dt);
    const info = this.host.domainInfo?.();
    if (info && !this.guestOn) {
      this.guestOn = true;
      S.guestDomain(info.center, info.dir ?? this.ctx.input.headDir, info.radius);
      this.ctx.ui.manga({ top: '合', main: '伏魔御廚子', ruby: 'ふくまみづし', color: '#ff2020', dur: 2 });
    } else if (!info && this.guestOn) {
      this.guestOn = false;
      S.guestStop();
    }
  }

  hudRow() {
    return { label: '宿儺の指', text: this.eaten ? '먹음 — 스쿠나의 술식' : '허리춤 (쥐어서 입으로)' };
  }

  cancelDomain() {
    if (this.guestOn) {
      this.guestOn = false;
      this.sukuna?.guestStop(true);
    }
  }

  dispose() {
    this.ctx.scene.remove(this.g);
    this.sukuna?.dispose();
    this.sukuna = null;
  }
}
