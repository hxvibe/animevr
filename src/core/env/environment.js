// 배경 전환 + 조명/안개 관리. 영역전개는 배경을 숨기고 자체 연출을 띄운다.
import * as THREE from 'three';
import { BACKGROUNDS } from './backgrounds.js';

export class Environment {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 2);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.fog = new THREE.Fog(0xffffff, 30, 120);
    this.scene.fog = this.fog;
    this.current = null;
    this.id = null;
    this.bounds = null;
    this.hidden = false;
    this.base = null; // 원래 조명/안개 값
  }

  setBackground(id) {
    const def = BACKGROUNDS[id] ?? BACKGROUNDS.white;
    const W = this.ctx.world;
    if (this.current) {
      this.scene.remove(this.current.group, this.current.sky);
      this.current.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    W.clearProps();
    W.clearDummies();
    W.clearDebris();
    const bg = def.build(this.ctx);
    this.current = bg;
    this.id = bg.id;
    this.scene.add(bg.group, bg.sky);
    this.bounds = bg.bounds;
    this.base = {
      fog: { color: new THREE.Color(bg.fog.color), near: bg.fog.near, far: bg.fog.far },
      hemi: { sky: new THREE.Color(bg.hemi.sky), ground: new THREE.Color(bg.hemi.ground), intensity: bg.hemi.intensity },
      sun: { color: new THREE.Color(bg.sun.color), intensity: bg.sun.intensity },
      exposure: bg.exposure ?? 1,
    };
    this.sun.position.set(...bg.sun.pos);
    this.restore();
    this.setHidden(false);
    return bg;
  }

  /** 기본 조명/안개로 복귀 */
  restore() {
    const b = this.base;
    if (!b) return;
    this.fog.color.copy(b.fog.color);
    this.fog.near = b.fog.near;
    this.fog.far = b.fog.far;
    this.hemi.color.copy(b.hemi.sky);
    this.hemi.groundColor.copy(b.hemi.ground);
    this.hemi.intensity = b.hemi.intensity;
    this.sun.color.copy(b.sun.color);
    this.sun.intensity = b.sun.intensity;
    this.ctx.renderer.toneMappingExposure = b.exposure;
  }

  /** 영역전개 등에서 배경(건물·하늘)만 숨김. 소품과 더미는 남는다 */
  setHidden(hidden) {
    this.hidden = hidden;
    if (!this.current) return;
    this.current.sky.visible = !hidden;
    this.current.group.traverse((o) => {
      if (o === this.current.group) return;
      if (o.isMesh || o.isLine || o.isSprite || o.isInstancedMesh) {
        // 소품(파괴 가능한 물체)은 남겨둔다
        if (o.userData.isProp) return;
        if (o.userData._vis === undefined) o.userData._vis = o.visible;
        o.visible = hidden ? false : o.userData._vis;
      }
    });
    for (const p of this.ctx.world.props) p.obj.traverse((o) => (o.visible = true));
  }

  update() {}
}
