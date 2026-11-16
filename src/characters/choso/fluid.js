// 피의 유체 시뮬레이션 — 입자 기반 점탄성 유체 (Clavet et al. 2005, double density relaxation)
//  · 입자끼리 밀고 당겨 부피를 유지하고, 표면장력처럼 한 덩어리로 뭉친다
//  · 각 입자는 주인(손)이 있으면 그 손의 목표점으로 끌려가고, 없으면 중력에 따라 떨어져 바닥에 고인다
// three.js와 무관한 순수 계산부(FluidSim)와 그리기(FluidView)로 나뉜다.

export const OWNER_FREE = 0;
export const OWNER_LEFT = 1;
export const OWNER_RIGHT = 2;
export const OWNER_CONV = 3;

const TABLE = 4096;

export class FluidSim {
  constructor(max = 400) {
    this.max = max;
    this.n = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.prev = new Float32Array(max * 3);
    this.owner = new Uint8Array(max);
    this.rest = new Float32Array(max); // 바닥에 멈춰 있던 시간
    this.life = new Float32Array(max); // 사라지는 중이면 0~1
    this.h = 0.045; // 상호작용 반경
    this.rho0 = 3.5; // 목표 밀도 (이보다 성기면 서로 당겨 한 덩어리가 된다)
    this.k = 10; // 압력 강성
    this.kNear = 20; // 근거리 압력 (뭉침 방지)
    this.sigma = 1.5; // 점성 (선형)
    this.beta = 0.4; // 점성 (이차)
    this.g = -9.8;
    this.floor = 0.012;
    this.bounds = null; // { minX, maxX, minZ, maxZ }
    // 손 목표 { x,y,z, vx,vy,vz, kp, kd, active }
    this.ctrl = [null, null, null, null];
    for (let i = 0; i < 4; i++) this.ctrl[i] = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, kp: 200, kd: 12, amax: 80, r0: 0.15, sag: 0.15, active: false, absorb: 0 };
    // 공간 해시
    this.cellStart = new Int32Array(TABLE + 1);
    this.cellIdx = new Int32Array(max);
    this.hashOf = new Int32Array(max);
    this.absorbed = 0; // 이번 단계에 압축점으로 빨려 들어간 입자 수
  }

  add(x, y, z, vx, vy, vz, owner = OWNER_FREE) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.owner[i] = owner;
    this.rest[i] = 0;
    this.life[i] = 1;
    return i;
  }

  remove(i) {
    const last = --this.n;
    if (i !== last) {
      const i3 = i * 3;
      const l3 = last * 3;
      for (let k = 0; k < 3; k++) {
        this.p[i3 + k] = this.p[l3 + k];
        this.v[i3 + k] = this.v[l3 + k];
        this.prev[i3 + k] = this.prev[l3 + k];
      }
      this.owner[i] = this.owner[last];
      this.rest[i] = this.rest[last];
      this.life[i] = this.life[last];
    }
  }

  count(owner) {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.owner[i] === owner) c++;
    return c;
  }

  _hash(x, y, z) {
    const h = this.h;
    const ix = Math.floor(x / h);
    const iy = Math.floor(y / h);
    const iz = Math.floor(z / h);
    return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & (TABLE - 1);
  }

  _buildGrid() {
    const { n, p, cellStart, cellIdx, hashOf } = this;
    cellStart.fill(0);
    for (let i = 0; i < n; i++) {
      const hsh = this._hash(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      hashOf[i] = hsh;
      cellStart[hsh]++;
    }
    let acc = 0;
    for (let c = 0; c < TABLE; c++) {
      const cnt = cellStart[c];
      cellStart[c] = acc;
      acc += cnt;
    }
    cellStart[TABLE] = acc;
    const fill = this._fill ?? (this._fill = new Int32Array(TABLE));
    fill.set(cellStart.subarray(0, TABLE));
    for (let i = 0; i < n; i++) cellIdx[fill[hashOf[i]]++] = i;
  }

  /** i의 이웃 j(>i 아님, 전부)를 순회 */
  _neighbors(i, fn) {
    const { p, h, cellStart, cellIdx } = this;
    const x = p[i * 3];
    const y = p[i * 3 + 1];
    const z = p[i * 3 + 2];
    const ix = Math.floor(x / h);
    const iy = Math.floor(y / h);
    const iz = Math.floor(z / h);
    const seen = this._seen ?? (this._seen = new Int32Array(27));
    let ns = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const c = (((ix + dx) * 73856093) ^ ((iy + dy) * 19349663) ^ ((iz + dz) * 83492791)) & (TABLE - 1);
          // 해시 충돌로 같은 칸을 두 번 돌지 않게
          let dup = false;
          for (let s = 0; s < ns; s++) if (seen[s] === c) dup = true;
          if (dup) continue;
          seen[ns++] = c;
          for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
            const j = cellIdx[k];
            if (j === i) continue;
            const rx = p[j * 3] - x;
            const ry = p[j * 3 + 1] - y;
            const rz = p[j * 3 + 2] - z;
            const r2 = rx * rx + ry * ry + rz * rz;
            if (r2 >= h * h || r2 < 1e-12) continue;
            fn(j, rx, ry, rz, Math.sqrt(r2));
          }
        }
      }
    }
  }

  step(dt) {
    const { p, v, prev, owner, h } = this;
    const n = this.n;
    this.absorbed = 0;
    // 1) 외력: 중력 / 손 목표
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const o = owner[i];
      const C = o ? this.ctrl[o] : null;
      if (C && C.active) {
        // 손에 가까운 입자일수록 강하게 끌리고, 먼 입자는 약하게 끌려 응집력으로 따라온다 → 물처럼 늘어지고 출렁임
        const dx = C.x - p[i3];
        const dy = C.y - p[i3 + 1];
        const dz = C.z - p[i3 + 2];
        const d = Math.hypot(dx, dy, dz);
        const r0 = C.r0 ?? 0.07;
        const w = 1 / (1 + (d / r0) * (d / r0));
        let ax = C.kp * dx * w + C.kd * (C.vx - v[i3]) * w;
        let ay = C.kp * dy * w + C.kd * (C.vy - v[i3 + 1]) * w + this.g * (C.sag ?? 0.25);
        let az = C.kp * dz * w + C.kd * (C.vz - v[i3 + 2]) * w;
        const a = Math.hypot(ax, ay, az);
        const amax = C.amax ?? 70;
        if (a > amax) {
          ax *= amax / a;
          ay *= amax / a;
          az *= amax / a;
        }
        v[i3] += ax * dt;
        v[i3 + 1] += ay * dt;
        v[i3 + 2] += az * dt;
      } else {
        v[i3 + 1] += this.g * dt;
      }
    }
    // 2) 점성 (가까워지는 이웃끼리 속도를 나눔)
    this._buildGrid();
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      this._neighbors(i, (j, rx, ry, rz, r) => {
        if (j < i) return;
        const q = r / h;
        const nx = rx / r;
        const ny = ry / r;
        const nz = rz / r;
        const j3 = j * 3;
        const u = (v[i3] - v[j3]) * nx + (v[i3 + 1] - v[j3 + 1]) * ny + (v[i3 + 2] - v[j3 + 2]) * nz;
        if (u <= 0) return;
        const I = dt * (1 - q) * (this.sigma * u + this.beta * u * u) * 0.5;
        v[i3] -= I * nx; v[i3 + 1] -= I * ny; v[i3 + 2] -= I * nz;
        v[j3] += I * nx; v[j3 + 1] += I * ny; v[j3 + 2] += I * nz;
      });
    }
    // 3) 이동
    for (let i = 0; i < n * 3; i++) {
      prev[i] = p[i];
      p[i] += v[i] * dt;
    }
    // 4) 밀도 이완
    this._buildGrid();
    const dt2 = dt * dt;
    for (let i = 0; i < n; i++) {
      let rho = 0;
      let rhoN = 0;
      this._neighbors(i, (j, rx, ry, rz, r) => {
        const q = 1 - r / h;
        rho += q * q;
        rhoN += q * q * q;
      });
      const P = this.k * (rho - this.rho0);
      const PN = this.kNear * rhoN;
      let dx = 0;
      let dy = 0;
      let dz = 0;
      const i3 = i * 3;
      this._neighbors(i, (j, rx, ry, rz, r) => {
        const q = 1 - r / h;
        const D = dt2 * (P * q + PN * q * q) * 0.5;
        const nx = (rx / r) * D;
        const ny = (ry / r) * D;
        const nz = (rz / r) * D;
        const j3 = j * 3;
        p[j3] += nx; p[j3 + 1] += ny; p[j3 + 2] += nz;
        dx -= nx; dy -= ny; dz -= nz;
      });
      p[i3] += dx;
      p[i3 + 1] += dy;
      p[i3 + 2] += dz;
    }
    // 5) 충돌 · 속도 갱신 · 압축점 흡수
    const b = this.bounds;
    const C3 = this.ctrl[OWNER_CONV];
    for (let i = n - 1; i >= 0; i--) {
      const i3 = i * 3;
      if (p[i3 + 1] < this.floor) p[i3 + 1] = this.floor;
      if (b) {
        if (p[i3] < b.minX) p[i3] = b.minX;
        if (p[i3] > b.maxX) p[i3] = b.maxX;
        if (p[i3 + 2] < b.minZ) p[i3 + 2] = b.minZ;
        if (p[i3 + 2] > b.maxZ) p[i3 + 2] = b.maxZ;
      }
      for (let k = 0; k < 3; k++) v[i3 + k] = (p[i3 + k] - prev[i3 + k]) / dt;
      const onFloor = p[i3 + 1] <= this.floor + 0.002;
      if (onFloor) {
        // 바닥 마찰 → 고여서 퍼진다
        const f = Math.max(0, 1 - 6 * dt);
        v[i3] *= f;
        v[i3 + 2] *= f;
        if (v[i3 + 1] > 0) v[i3 + 1] *= 0.2;
      }
      if (owner[i] === OWNER_FREE && onFloor && Math.abs(v[i3]) + Math.abs(v[i3 + 2]) < 0.05) this.rest[i] += dt;
      else this.rest[i] = 0;
      if (owner[i] === OWNER_CONV && C3.active && C3.absorb > 0) {
        const d = Math.hypot(p[i3] - C3.x, p[i3 + 1] - C3.y, p[i3 + 2] - C3.z);
        if (d < C3.absorb) {
          this.remove(i);
          this.absorbed++;
        }
      }
    }
  }
}
