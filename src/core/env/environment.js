// 배경 전환 + 조명/안개 관리. 영역전개는 배경을 숨기고 자체 연출을 띄운다.
import * as THREE from 'three';
import { BACKGROUNDS } from './backgrounds.js';
import { captureEnvironment } from './realism.js';

export class Environment {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 2);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    // 해 그림자: 플레이어 주변만 (그림자 카메라가 따라다닌다)
    const r = ctx.renderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -24;
    sc.right = sc.top = 24;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
    this.envTex = null;
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
    this.sunDir.set(...bg.sun.pos).normalize();
    this.restore();
    this.setHidden(false);
    this.applyShadows();
    // 이 배경을 플레이어 눈높이에서 찍어 반사 환경맵으로 (젖은 바닥·유리에 거리가 비친다)
    this.envTex?.dispose();
    this.envTex = null;
    if (bg.capture) {
      try {
        const lights = [this.hemi.clone(), this.sun.clone()];
        this.envTex = captureEnvironment(this.ctx.renderer, [bg.group, bg.sky], new THREE.Vector3(bg.spawn.x, 1.6, bg.spawn.z), { lights });
      } catch (e) {
        console.warn('환경맵 실패', e);
      }
    }
    this.scene.environment = this.envTex;
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

  /** 설정(그림자)과 배경에 맞춰 그림자를 켜고 끈다 */
  applyShadows() {
    const on = !!(this.ctx.settings.shadows && this.current?.shadows);
    this.sun.castShadow = on;
  }

  update(dt) {
    this.current?.update?.(dt);
    if (this.sun.castShadow) {
      // 그림자 카메라를 플레이어 주변으로 (텍셀 단위로 맞춰 흔들림 방지)
      const h = this.ctx.input.head;
      const step = 48 / 2048;
      const cx = Math.round(h.x / step) * step;
      const cz = Math.round(h.z / step) * step;
      this.sun.target.position.set(cx, 0, cz);
      this.sun.position.set(cx, 0, cz).addScaledVector(this.sunDir, 100);
      this.sun.target.updateMatrixWorld();
    }
  }
}
