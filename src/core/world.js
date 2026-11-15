// 간단한 구체 기반 물리 + 저주령(적) + 적 투사체 + 플레이어 상태
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const GRAVITY = 9.8;

let _seed = 1337;
function rand() {
  _seed = (_seed * 16807) % 2147483647;
  return (_seed - 1) / 2147483646;
}

export class Body {
  constructor(mesh, radius, mass, hp, kind) {
    this.mesh = mesh;
    this.pos = mesh.position;
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.radius = radius;
    this.mass = mass;
    this.hp = this.maxHp = hp;
    this.kind = kind; // 'debris' | 'enemy'
    this.asleep = kind === 'debris';
    this.alive = true;
    this.restTime = 0;
    this.crush = 0; // 창에 압축된 정도 0~1
    this.baseScale = mesh.scale.x;
    this.stun = 0;
    this.frozen = false;
    this.lastHitSpeed = 0;
  }
  wake() {
    this.asleep = false;
    this.restTime = 0;
  }
}

// ── 저주령 외형: 독자 디자인 (울퉁불퉁한 덩어리 + 여러 개의 빛나는 눈) ──
function makeBlobGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 2.0) * Math.sin(v.z * 3.3 + seed * 0.5);
    v.multiplyScalar(1 + n * 0.22 + (v.y < -0.4 ? -0.15 : 0));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export class World {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.bodies = [];
    this.projectiles = [];
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.kills = 0;
    this.maxEnemies = 6;
    this.spawnTimer = 1.5;
    this.sixEyes = false;
    this.shield = null; // (obj, dt) => void  캐릭터가 설정(무하한 등)
    this.domain = null; // { center, radius }
    this.player = { hp: 100, maxHp: 100, lastHit: -10, invuln: 0 };
    this.time = 0;
    this.onPlayerHit = null;

    // 공유 리소스
    this.geo = {
      crate: new THREE.BoxGeometry(0.7, 0.7, 0.7),
      block: new THREE.BoxGeometry(0.8, 0.8, 0.8),
      small: new THREE.BoxGeometry(0.45, 0.45, 0.45),
      blobs: [makeBlobGeometry(1), makeBlobGeometry(2.3), makeBlobGeometry(4.1)],
      eye: new THREE.SphereGeometry(0.1, 10, 8),
      proj: new THREE.IcosahedronGeometry(0.16, 1),
      bar: new THREE.PlaneGeometry(1, 0.08),
    };
    this.mat = {
      crate: new THREE.MeshLambertMaterial({ color: 0x8a6a48 }),
      crate2: new THREE.MeshLambertMaterial({ color: 0x6f5a44 }),
      block: new THREE.MeshLambertMaterial({ color: 0x8c8f9c }),
      block2: new THREE.MeshLambertMaterial({ color: 0x777b88 }),
      eye: new THREE.MeshBasicMaterial({ color: 0xfff27a }),
      proj: new THREE.MeshBasicMaterial({ color: 0x9a3cff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
      projCore: new THREE.MeshBasicMaterial({ color: 0x1a0028 }),
      outline: new THREE.MeshBasicMaterial({ color: 0x66e0ff, side: THREE.BackSide, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      barBg: new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6, depthTest: false }),
      barFg: new THREE.MeshBasicMaterial({ color: 0x66e0ff, depthTest: false }),
      traj: new THREE.LineBasicMaterial({ color: 0xff6688, transparent: true, opacity: 0.8 }),
    };
    this.reset();
  }

  clear() {
    for (const b of this.bodies) this.root.remove(b.mesh);
    for (const p of this.projectiles) this.root.remove(p.mesh);
    this.bodies.length = 0;
    this.projectiles.length = 0;
  }

  reset() {
    this.clear();
    _seed = 1337;
    // 돌기둥: 0.8m 블록 4~5단
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rand() * 0.3;
      const r = 6 + rand() * 9;
      const h = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < h; k++) {
        const m = new THREE.Mesh(this.geo.block, k % 2 ? this.mat.block : this.mat.block2);
        m.position.set(Math.cos(a) * r, 0.4 + k * 0.8, Math.sin(a) * r);
        m.rotation.y = rand() * 0.3;
        this.addBody(m, 0.42, 4, 60, 'debris');
      }
    }
    // 나무 상자 무더기
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2;
      const r = 4 + rand() * 12;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const n = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(this.geo.crate, k % 2 ? this.mat.crate : this.mat.crate2);
        const layer = k < 2 ? 0 : 1;
        m.position.set(cx + (k % 2) * 0.75 - 0.35 + (layer ? 0.35 : 0), 0.35 + layer * 0.7, cz);
        m.rotation.y = rand();
        this.addBody(m, 0.37, 1.5, 25, 'debris');
      }
    }
    this.spawnTimer = 1.0;
    this.player.hp = this.player.maxHp;
  }

  addBody(mesh, radius, mass, hp, kind) {
    const b = new Body(mesh, radius, mass, hp, kind);
    this.root.add(mesh);
    this.bodies.push(b);
    return b;
  }

  spawnEnemy() {
    const a = Math.random() * Math.PI * 2;
    const r = 11 + Math.random() * 9;
    const g = new THREE.Group();
    const size = 0.55 + Math.random() * 0.35;
    const mat = new THREE.MeshLambertMaterial({ color: 0x2b1838, emissive: 0x220a33 });
    const body = new THREE.Mesh(this.geo.blobs[Math.floor(Math.random() * 3)], mat);
    body.scale.setScalar(size);
    g.add(body);
    const eyes = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < eyes; i++) {
      const e = new THREE.Mesh(this.geo.eye, this.mat.eye);
      const th = (Math.random() - 0.5) * 1.6;
      const ph = (Math.random() - 0.3) * 1.0;
      e.position.set(Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)).multiplyScalar(size * 0.95);
      e.scale.setScalar(0.6 + Math.random() * 0.8);
      g.add(e);
    }
    const outline = new THREE.Mesh(body.geometry, this.mat.outline);
    outline.scale.setScalar(size * 1.12);
    outline.visible = this.sixEyes;
    g.add(outline);
    // 육안 전용 체력 바
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(this.geo.bar, this.mat.barBg);
    const fg = new THREE.Mesh(this.geo.bar, this.mat.barFg);
    fg.position.z = 0.001;
    bg.renderOrder = fg.renderOrder = 20;
    bar.add(bg, fg);
    bar.position.y = size + 0.35;
    bar.visible = this.sixEyes;
    g.add(bar);

    g.position.set(Math.cos(a) * r, 2 + Math.random() * 2, Math.sin(a) * r);
    const b = this.addBody(g, size * 0.95, 3, 100, 'enemy');
    b.asleep = false;
    b.mat = mat;
    b.outline = outline;
    b.bar = bar;
    b.barFg = fg;
    b.shootTimer = 2 + Math.random() * 3;
    b.wander = Math.random() * 100;
    b.hoverH = 1.8 + Math.random() * 2.2;
    b.desiredR = 8 + Math.random() * 7;
    this.ctx.fx.burst(g.position, 40, new THREE.Color(0x8a3cff), 3, 0.15, 0.8);
    return b;
  }

  shoot(enemy) {
    const head = this.ctx.input.head;
    const m = new THREE.Group();
    const core = new THREE.Mesh(this.geo.proj, this.mat.projCore);
    const glow = new THREE.Mesh(this.geo.proj, this.mat.proj);
    glow.scale.setScalar(1.7);
    core.scale.setScalar(0.7);
    m.add(core, glow);
    // 궤적 표시(육안)
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    const line = new THREE.Line(lg, this.mat.traj);
    line.frustumCulled = false;
    line.visible = this.sixEyes;
    this.root.add(line);
    m.position.copy(enemy.pos);
    const dir = _v.subVectors(head, enemy.pos).add(_v2.set(0, -0.3, 0)).normalize();
    const speed = 6 + Math.random() * 3;
    this.root.add(m);
    this.projectiles.push({ mesh: m, pos: m.position, vel: dir.clone().multiplyScalar(speed), speed, life: 8, stall: 0, line, alive: true, infinity: false });
    this.ctx.sfx.enemyShoot(enemy.pos);
  }

  setSixEyes(on) {
    if (this.sixEyes === on) return;
    this.sixEyes = on;
    for (const b of this.bodies) {
      if (b.outline) b.outline.visible = on;
      if (b.bar) b.bar.visible = on;
    }
    for (const p of this.projectiles) p.line.visible = on;
  }

  /** 반경 안의 물체 순회 */
  forEachInRadius(center, r, fn) {
    const r2 = r * r;
    for (const b of this.bodies) {
      if (!b.alive) continue;
      const d2 = b.pos.distanceToSquared(center);
      if (d2 < (r + b.radius) * (r + b.radius) || d2 < r2) fn(b, Math.sqrt(d2));
    }
  }

  damage(b, amount, style = 'shatter') {
    if (!b.alive) return;
    b.hp -= amount;
    if (b.kind === 'enemy' && b.mat) {
      b.mat.emissive.setHex(0xff3366);
      b.hitFlash = 0.12;
    }
    if (b.hp <= 0) this.destroy(b, style);
  }

  destroy(b, style = 'shatter') {
    if (!b.alive) return;
    b.alive = false;
    this.root.remove(b.mesh);
    const fx = this.ctx.fx;
    if (style === 'erase') {
      fx.burst(b.pos, 18, new THREE.Color(0xc07bff), 2.5, 0.12, 0.6, { drag: 3 });
    } else if (b.kind === 'enemy') {
      fx.burst(b.pos, 60, new THREE.Color(0x7a2cff), 5, 0.16, 1.0, { drag: 2.5 });
      fx.burst(b.pos, 25, new THREE.Color(0xfff27a), 3, 0.08, 0.6);
    } else {
      const c = b.mesh.material?.color ?? new THREE.Color(0x888888);
      fx.burst(b.pos, 22, c.clone().multiplyScalar(1.4), 4, 0.12, 1.2, { grav: 6, drag: 1 });
    }
    if (b.kind === 'enemy') {
      this.kills++;
      if (style !== 'erase') this.ctx.sfx.enemyDie(b.pos);
      b.mat?.dispose();
    }
  }

  erase(b) {
    this.destroy(b, 'erase');
  }

  removeProjectile(p, burst = true) {
    if (!p.alive) return;
    p.alive = false;
    this.root.remove(p.mesh);
    this.root.remove(p.line);
    p.line.geometry.dispose();
    if (burst) this.ctx.fx.burst(p.pos, 16, new THREE.Color(0xb04cff), 2, 0.08, 0.5);
  }

  enemyCount() {
    let n = 0;
    for (const b of this.bodies) if (b.alive && b.kind === 'enemy') n++;
    return n;
  }

  update(dt) {
    this.time += dt;
    const ctx = this.ctx;
    const head = ctx.input.head;
    const bc = ctx.input.bodyCenter(new THREE.Vector3());
    const dom = this.domain;

    // 스폰
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 3 + Math.random() * 2;
      if (this.enemyCount() < this.maxEnemies && !dom) this.spawnEnemy();
    }

    // 적 AI
    for (const b of this.bodies) {
      if (!b.alive || b.kind !== 'enemy') continue;
      b.frozen = !!(dom && b.pos.distanceTo(dom.center) < dom.radius);
      if (b.hitFlash > 0) {
        b.hitFlash -= dt;
        if (b.hitFlash <= 0) b.mat.emissive.setHex(0x220a33);
      }
      if (b.bar) {
        b.barFg.scale.x = Math.max(0.001, b.hp / b.maxHp);
        b.barFg.position.x = -(1 - b.barFg.scale.x) * 0.5;
        b.bar.quaternion.copy(ctx.input.headQuat).premultiply(_q.copy(b.mesh.quaternion).invert());
      }
      if (b.frozen) {
        // 무량공처: 무한한 정보가 흘러들어 아무것도 할 수 없다
        b.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
        b.mesh.position.x += (Math.random() - 0.5) * 0.01;
        b.mat.emissive.setHSL(0.6, 0.6, 0.15 + Math.random() * 0.25);
        b.hitFlash = 0.05;
        b.hp -= 3 * dt;
        if (b.hp <= 0) this.destroy(b);
        continue;
      }
      if (b.stun > 0) {
        b.stun -= dt;
        continue; // 중력/관성만
      }
      // 플레이어를 바라보며 원하는 거리/높이 유지
      b.wander += dt;
      _v.subVectors(b.pos, head).setY(0);
      const dist = _v.length() || 1;
      _v.divideScalar(dist);
      const tangent = _v2.set(-_v.z, 0, _v.x).multiplyScalar(Math.sin(b.wander * 0.4) * 1.5);
      const want = _n.copy(_v).multiplyScalar((b.desiredR - dist) * 0.8).add(tangent);
      want.y = (b.hoverH + Math.sin(b.wander * 1.3) * 0.3 - b.pos.y) * 1.5;
      b.vel.lerp(want, 1 - Math.exp(-dt * 1.5));
      b.mesh.lookAt(head.x, b.pos.y, head.z);
      b.shootTimer -= dt;
      if (b.shootTimer <= 0 && dist < 25) {
        b.shootTimer = 2.5 + Math.random() * 3;
        this.shoot(b);
      }
    }

    // 적분
    for (const b of this.bodies) {
      if (!b.alive || b.asleep) continue;
      const floating = b.kind === 'enemy' && b.stun <= 0;
      if (!floating && !b.frozen) b.vel.y -= GRAVITY * dt;
      if (b.vel.lengthSq() > 900) b.vel.setLength(30);
      b.pos.addScaledVector(b.vel, dt);
      // 바닥
      const floor = b.radius;
      if (b.pos.y < floor) {
        b.pos.y = floor;
        if (b.vel.y < 0) {
          const impact = -b.vel.y;
          if (impact > 8) this.damage(b, (impact - 8) * 3);
          b.vel.y = impact > 1 ? impact * 0.3 : 0;
        }
        b.vel.x *= Math.max(0, 1 - dt * 3);
        b.vel.z *= Math.max(0, 1 - dt * 3);
        b.spin.multiplyScalar(Math.max(0, 1 - dt * 4));
      }
      // 회전(시각적)
      if (b.kind === 'debris') {
        b.mesh.rotation.x += b.spin.x * dt;
        b.mesh.rotation.y += b.spin.y * dt;
        b.mesh.rotation.z += b.spin.z * dt;
        // 창에 압축되면 작아진다
        const s = b.baseScale * (1 - b.crush * 0.6);
        b.mesh.scale.setScalar(s);
      }
      // 영역 밖으로 너무 멀리 가면 제거
      if (b.pos.lengthSq() > 200 * 200 || b.pos.y > 120) {
        this.destroy(b, 'erase');
        continue;
      }
      // 수면
      if (b.kind === 'debris' && b.pos.y <= floor + 0.02 && b.vel.lengthSq() < 0.04) {
        b.restTime += dt;
        if (b.restTime > 1.0) {
          b.asleep = true;
          b.vel.set(0, 0, 0);
        }
      } else b.restTime = 0;
      // 무하한은 날아오는 물체도 멈춘다
      if (this.shield && b.vel.lengthSq() > 4) this.shield(b, dt, bc);
    }

    // 구체 충돌
    const B = this.bodies;
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < B.length; j++) {
        const c = B[j];
        if (!c.alive || (a.asleep && c.asleep)) continue;
        _v.subVectors(c.pos, a.pos);
        const rr = a.radius + c.radius;
        const d2 = _v.lengthSq();
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        _n.copy(_v).divideScalar(d);
        const pen = rr - d;
        const relV = _v2.subVectors(c.vel, a.vel).dot(_n);
        if (a.asleep || c.asleep) {
          // 잠든 물체는 충분히 세게 부딪혔을 때만 깨운다
          if (-relV > 1.2) {
            a.wake();
            c.wake();
          }
        }
        const ia = a.asleep ? 0 : 1 / a.mass;
        const ic = c.asleep ? 0 : 1 / c.mass;
        const sum = ia + ic;
        if (sum === 0) continue;
        a.pos.addScaledVector(_n, -pen * (ia / sum));
        c.pos.addScaledVector(_n, pen * (ic / sum));
        if (relV < 0) {
          const jImp = (-(1 + 0.25) * relV) / sum;
          a.vel.addScaledVector(_n, -jImp * ia);
          c.vel.addScaledVector(_n, jImp * ic);
          const sp = -relV;
          if (sp > 7) {
            this.damage(a, (sp - 7) * 4);
            this.damage(c, (sp - 7) * 4);
          }
          if (sp > 2) {
            a.spin.x += (Math.random() - 0.5) * sp;
            c.spin.z += (Math.random() - 0.5) * sp;
          }
        }
      }
    }

    // 적 투사체
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.life -= dt;
      const frozen = dom && p.pos.distanceTo(dom.center) < dom.radius;
      if (frozen) p.vel.multiplyScalar(Math.max(0, 1 - dt * 5));
      p.infinity = false;
      if (this.shield) this.shield(p, dt, bc);
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.y += dt * 3;
      if (p.line.visible) {
        const arr = p.line.geometry.attributes.position.array;
        arr[0] = p.pos.x; arr[1] = p.pos.y; arr[2] = p.pos.z;
        arr[3] = p.pos.x + p.vel.x * 1.5; arr[4] = p.pos.y + p.vel.y * 1.5; arr[5] = p.pos.z + p.vel.z * 1.5;
        p.line.geometry.attributes.position.needsUpdate = true;
      }
      if (p.vel.lengthSq() < 0.05) {
        p.stall += dt;
        if (p.stall > 2.0) this.removeProjectile(p);
      }
      if (p.life <= 0 || p.pos.y < 0) {
        this.removeProjectile(p);
        continue;
      }
      // 플레이어 피격
      if (p.pos.distanceTo(bc) < 0.45 || p.pos.distanceTo(head) < 0.25) {
        this.removeProjectile(p);
        this.hitPlayer(12);
      }
    }

    // 정리
    if (this.bodies.some((b) => !b.alive)) this.bodies = this.bodies.filter((b) => b.alive);
    if (this.projectiles.some((p) => !p.alive)) this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  hitPlayer(amount) {
    const P = this.player;
    P.hp = Math.max(0, P.hp - amount);
    P.lastHit = this.time;
    this.ctx.sfx.hit();
    this.onPlayerHit?.(amount);
    if (P.hp <= 0) {
      P.hp = P.maxHp;
      this.ctx.ui.callout('쓰러졌다… 다시 일어선다', null, { color: '#ff7a8a' });
    }
  }
}

const _q = new THREE.Quaternion();
