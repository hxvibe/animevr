// 플레이어 몸의 대략적인 틀 (허리춤에 칼집·망치를 차기 위해)
//  · 허리 높이 = 눈높이 - 0.62m (앉거나 숙이면 같이 내려간다)
//  · 몸이 보는 방향 = 머리 방향을 느리게 따라간다 (고개만 돌리면 몸은 그대로, 35° 넘게 돌리면 따라 돈다)
import * as THREE from 'three';

const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class BodyFrame {
  constructor(ctx) {
    this.ctx = ctx;
    this.yaw = null;
    this.waist = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.t = -1;
  }

  /** 한 프레임에 한 번만 갱신 (여러 캐릭터 부품이 불러도) */
  update(dt) {
    const W = this.ctx.world;
    if (W && this.t === W.time) return this;
    this.t = W?.time ?? 0;
    const inp = this.ctx.input;
    const f = _v.copy(inp.headDir).setY(0);
    if (f.lengthSq() > 1e-4) {
      const want = Math.atan2(-f.x, -f.z);
      if (this.yaw === null) this.yaw = want;
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // 35° 안쪽은 천천히, 넘으면 빨리 따라간다
      const rate = Math.abs(d) > 0.6 ? 6 : 1.2;
      this.yaw += d * Math.min(1, dt * rate);
    }
    this.quat.setFromAxisAngle(UP, this.yaw ?? 0);
    // 허리: 머리 바로 아래, 살짝 뒤
    this.waist.copy(inp.head);
    this.waist.y = Math.max(0.5, inp.head.y - 0.62);
    this.waist.add(_v.set(0, 0, 0.06).applyQuaternion(this.quat));
    return this;
  }

  /** 몸 기준(x 오른쪽, y 위, -z 앞, 허리가 원점) → 월드 */
  point(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyQuaternion(this.quat).add(this.waist);
  }

  dir(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).normalize().applyQuaternion(this.quat);
  }
}

/** ctx 하나에 하나 */
export function bodyOf(ctx) {
  return (ctx._body ??= new BodyFrame(ctx));
}
