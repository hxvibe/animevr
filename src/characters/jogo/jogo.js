// 죠고 — 대지의 분노가 낳은 작열하는 업화
//  · 화력충: 손을 휙 던지면 불벌레가 날아가 들이받고 터진다
//  · 열선: 검지(또는 검지·중지)로 가리키고 있으면 손끝에서 일직선의 불길
//  · 화산두: 두 손으로 정수리를 짚으면 머리의 분화구에서 용암을 쏜다
//  · 분화: 손바닥을 아래로 내리찍으면 바라본 땅에서 불기둥
//  · 연옥: 두 손바닥 사이에 불을 응축했다가 밀어 던진다
//  · 극번 「隕」: 두 손을 머리 위로 높이 들고 버티면 하늘에서 거대한 운석
//  · 도깨비불: 주먹에 고열 — 맞히면 불이 붙는다
//  · 영역전개 「蓋棺鉄囲山」: 용암이 들끓는 화산 속 — 들어온 것은 모두 탄다
import * as THREE from 'three';
import { cool } from '../../core/cooldown.js';
import { Caster } from '../../core/caster.js';
import { HandAura } from '../../core/handAura.js';
import { ShellDomain, DOMAIN_NOISE } from '../../core/shellDomain.js';
import { makeGlowSprite } from '../../core/fx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const AURA = { glow: 0xff5a10, hot: 0xffe0a0, inner: 0x2a0800, line: 0x000000 };
const FIRE = new THREE.Color(0xff6a10);
const rnd = (a, b) => a + Math.random() * (b - a);

// 용암 셰이더 조각 (운석 · 영역)
const LAVA_GLSL = /* glsl */ `
vec3 lava(vec3 p, float t) {
  float n = dfbm(p * 1.3 + vec3(0.0, t * 0.15, 0.0));
  float crack = smoothstep(0.47, 0.5, n) * (1.0 - smoothstep(0.5, 0.56, n));
  float hot = smoothstep(0.55, 0.75, dfbm(p * 0.7 - vec3(t * 0.05)));
  vec3 rock = mix(vec3(0.05, 0.035, 0.03), vec3(0.16, 0.1, 0.08), dn(p * 6.0));
  vec3 glow = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.4), hot);
  return mix(rock, glow * 2.2, max(crack * 1.4, hot * 0.25));
}
`;

// ───────────────── 투사체들 ─────────────────
class Insect {
  constructor(ctx, from, target, dir, delay) {
    this.ctx = ctx;
    this.p = from.clone();
    this.v = dir.clone().multiplyScalar(6).add(new THREE.Vector3(rnd(-2, 2), rnd(0.5, 2.5), rnd(-2, 2)));
    this.target = target;
    this.dir = dir.clone();
    this.delay = delay;
    this.life = 3.5;
    this.alive = true;
  }

  update(dt) {
    if (this.delay > 0) {
      this.delay -= dt;
      return true;
    }
    const { fx, world } = this.ctx;
    this.life -= dt;
    const t = this.target?.alive ? this.target : null;
    const want = t ? _v.subVectors(t.center(_v2), this.p).normalize().multiplyScalar(14) : _v.copy(this.dir).multiplyScalar(14);
    this.v.lerp(want, Math.min(1, dt * 3));
    this.p.addScaledVector(this.v, dt);
    fx.spawn(this.p, _v.set(0, 0, 0), new THREE.Color().setHSL(0.06 + Math.random() * 0.04, 1, 0.55), 0.09, 0.22, 0, 0);
    fx.fire.flame?.(this.p, _v.copy(this.v).multiplyScalar(-0.1), { size0: 0.08, size1: 0.18, life: 0.25, rise: 0.5 });
    let hit = this.p.y < 0.05 || this.life <= 0;
    for (const o of world.targets()) {
      if (o.alive && o.center(_v).distanceTo(this.p) < (o.kind === 'dummy' ? 0.45 * (o.scale ?? 1) : (o.radius ?? 0.3) + 0.1)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      boom(this.ctx, this.p, 1.6, 30, 0.6);
      return false;
    }
    return true;
  }
}

/** 폭발 + 범위 피해 */
function boom(ctx, p, R, dmg, size = 1) {
  const { fx, sfx, world } = ctx;
  fx.fire.explosion(_v.copy(p).setY(Math.max(0.2, p.y)), size, { lite: size < 1 });
  fx.flash(p, 0xff7020, 6 * size, 0.3, 10 * size);
  sfx.play(size > 1.2 ? 'fire_explode' : 'explosion_small', { at: p, vol: Math.min(1, 0.5 + size * 0.3), rate: 1.2 - Math.min(0.5, size * 0.2) });
  world.forEachTarget(p, R, (t, d, c) => {
    const k = 1 - Math.min(0.75, d / (R * 1.2));
    t.damage(dmg * k, { type: 'fire', burn: true });
    if (t.alive) t.impulse?.(_v2.subVectors(c, p).normalize().multiplyScalar(5 * k * Math.sqrt(size)).add(_v3.set(0, 3 * k, 0)), 3);
  });
}

class LavaBlob {
  constructor(ctx, from, to) {
    this.ctx = ctx;
    this.p = from.clone();
    const flat = _v.subVectors(to, from).setY(0);
    const d = flat.length();
    const T = Math.max(0.6, d / 12);
    this.v = flat.divideScalar(T).clone();
    this.v.y = (to.y - from.y + 0.5 * 9.8 * T * T) / T;
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshBasicMaterial({ color: 0xff7a20 }));
    this.mesh.position.copy(this.p);
    ctx.scene.add(this.mesh);
  }

  update(dt) {
    this.v.y -= 9.8 * dt;
    this.p.addScaledVector(this.v, dt);
    this.mesh.position.copy(this.p);
    this.ctx.fx.fire.flame?.(this.p, _v.set(0, 0.5, 0), { size0: 0.3, size1: 0.6, life: 0.4 });
    this.ctx.fx.fire.smoke?.(this.p, _v.set(0, 0.5, 0), { size0: 0.2, size1: 0.8, life: 1.2, shade: 0.2, opacity: 0.5 });
    if (this.p.y <= 0.1) {
      boom(this.ctx, this.p, 2.6, 85, 1.3);
      this.ctx.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      return false;
    }
    return true;
  }
}

class Eruption {
  constructor(ctx, at) {
    this.ctx = ctx;
    this.at = at.clone().setY(0);
    this.t = 0;
    this.done = false;
    ctx.fx.shockwave(_v.copy(this.at).setY(0.04), 0xff4010, 1.8, 0.5, { opacity: 0.6 });
    ctx.sfx.rumble(0.6, 0.35);
  }

  update(dt) {
    this.t += dt;
    const { fx } = this.ctx;
    if (this.t < 0.35) {
      // 땅이 달아오른다
      const a = Math.random() * Math.PI * 2;
      fx.spawn(_v.set(this.at.x + Math.cos(a) * rnd(0, 1.4), 0.05, this.at.z + Math.sin(a) * rnd(0, 1.4)), _v2.set(0, 1, 0), FIRE, 0.12, 0.4, 1, -1);
      return true;
    }
    if (!this.done) {
      this.done = true;
      fx.fire.explosion(_v.copy(this.at).setY(0.3), 1.3, { height: 6, colR: 0.9 });
      boom(this.ctx, this.at, 2.2, 95, 0.1);
      this.ctx.world.forEachTarget(this.at, 2.2, (t) => t.impulse?.(_v.set(0, 9, 0), 5));
    }
    return this.t < 0.6;
  }
}

class Fireball {
  constructor(ctx, sphere, from, dir, power) {
    this.ctx = ctx;
    this.s = sphere;
    this.p = from.clone();
    this.dir = dir.clone();
    this.power = power;
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    this.p.addScaledVector(this.dir, 18 * dt);
    this.s.position.copy(this.p);
    const r = this.s.scale.x;
    for (let i = 0; i < 3; i++) this.ctx.fx.fire.flame?.(_v.copy(this.p).add(_v2.randomDirection().multiplyScalar(r)), _v3.copy(this.dir).multiplyScalar(-3), { size0: r * 0.8, size1: r * 0.3, life: 0.35 });
    let hit = this.p.y < 0.1 || this.t > 2.5;
    for (const o of this.ctx.world.targets()) if (o.alive && o.center(_v).distanceTo(this.p) < r + 0.4) hit = true;
    if (hit) {
      boom(this.ctx, this.p, 2.5 + this.power * 3.5, 90 + this.power * 200, 1.4 + this.power * 1.6);
      this.ctx.scene.remove(this.s);
      return false;
    }
    return true;
  }
}

class Meteor {
  constructor(ctx, at) {
    this.ctx = ctx;
    this.at = at.clone().setY(0);
    this.t = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${DOMAIN_NOISE} ${LAVA_GLSL}
        void main(){ vec3 c = lava(vP * 1.5, uTime); float rim = pow(1.0 - max(0.0, dot(vN, vV)), 2.0); c += vec3(1.0, 0.4, 0.05) * rim * 1.5; gl_FragColor = vec4(c, 1.0); }`,
    });
    const geo = new THREE.IcosahedronGeometry(4, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      _v.multiplyScalar(1 + (Math.sin(_v.x * 1.7) * Math.cos(_v.y * 1.3 + _v.z) * 0.08));
      p.setXYZ(i, _v.x, _v.y, _v.z);
    }
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, mat);
    this.mat = mat;
    this.start = this.at.clone().add(new THREE.Vector3(rnd(-15, 15), 70, rnd(-15, 15)));
    this.mesh.position.copy(this.start);
    this.glow = makeGlowSprite(new THREE.Color(0xff6010), 22);
    this.mesh.add(this.glow);
    ctx.scene.add(this.mesh);
    this.fall = 3.0;
    ctx.sfx.rumble(3.5, 0.6);
    ctx.fx.shockwave(_v.copy(this.at).setY(0.04), 0xff3010, 9, 3.0, { opacity: 0.35 });
  }

  update(dt) {
    this.t += dt;
    this.mat.uniforms.uTime.value += dt;
    const k = Math.min(1, this.t / this.fall);
    this.mesh.position.lerpVectors(this.start, _v.copy(this.at).setY(3), k * k);
    this.mesh.rotation.x += dt * 0.6;
    this.mesh.rotation.z += dt * 0.4;
    for (let i = 0; i < 4; i++) this.ctx.fx.fire.flame?.(_v.copy(this.mesh.position).add(_v2.randomDirection().multiplyScalar(4)), _v3.subVectors(this.start, this.at).normalize().multiplyScalar(8), { size0: 2, size1: 4, life: 0.6 });
    if (k >= 1) {
      const { fx, sfx, game } = this.ctx;
      for (let i = 0; i < 8; i++) fx.fire.explosion(_v.copy(this.at).add(_v2.set(rnd(-4, 4), 0.5, rnd(-4, 4))), 2.2, { height: i < 2 ? 10 : 0 });
      fx.shockwave(_v.copy(this.at).setY(0.1), 0xff6020, 22, 1.2, { opacity: 0.8 });
      fx.flash(this.at, 0xff8030, 20, 1, 60);
      sfx.explosion(this.at, 3);
      sfx.play('fire_explode', { at: this.at, vol: 1, rate: 0.5 });
      game.hitstop = 0.12;
      this.ctx.world.forEachTarget(this.at, 10, (t, d, c) => {
        const kk = 1 - Math.min(0.8, d / 12);
        t.damage(420 * kk, { type: 'fire', burn: true });
        if (t.alive) t.impulse?.(_v2.subVectors(c, this.at).setY(0).normalize().multiplyScalar(16 * kk).add(_v3.set(0, 10 * kk, 0)), 8);
      });
      this.ctx.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mat.dispose();
      this.glow.material.dispose();
      return false;
    }
    return true;
  }
}

// 열선
class HeatRay {
  constructor(ctx) {
    this.ctx = ctx;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2); // +Z 로 뻗는다 (lookAt 방향)
    this.core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }));
    this.outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff5010, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.core.visible = this.outer.visible = false;
    ctx.scene.add(this.core, this.outer);
    this.on = false;
    this.loop = null;
  }

  set(on, from, dir, len) {
    this.on = on;
    this.core.visible = this.outer.visible = on;
    if (on) {
      for (const [m, r] of [[this.core, 0.035], [this.outer, 0.11]]) {
        m.position.copy(from);
        m.lookAt(_v.copy(from).add(dir));
        m.scale.set(r * (0.85 + Math.random() * 0.3), r * (0.85 + Math.random() * 0.3), len);
      }
      if (!this.loop) this.loop = this.ctx.sfx.loop({ sample: 'fire', vol: 0.3 });
    } else if (this.loop) {
      this.loop.stop?.();
      this.loop = null;
    }
  }

  dispose() {
    this.set(false);
    this.ctx.scene.remove(this.core, this.outer);
    this.core.geometry.dispose();
    this.core.material.dispose();
    this.outer.material.dispose();
  }
}

// ───────────────── 캐릭터 ─────────────────
export class Jogo extends Caster {
  constructor(ctx) {
    super(ctx, { id: 'jogo', name: '죠고' });
    this.domainLabel = '영역전개';
    this.reviveText = '화산이 다시 끓어오른다';
    this.aura = new HandAura(ctx, AURA);
    this.list = [];
    this.rays = { left: new HeatRay(ctx), right: new HeatRay(ctx) };
    this.charge = { on: false, t: 0, s: null };
    this._keys = {};
    this.cds = {};
    this.shell = new ShellDomain(ctx, {
      radius: 18,
      glsl: LAVA_GLSL,
      wall: `vec3 n = normalize(vP); vec3 c = lava(n * 6.0, uTime);
             float sky = smoothstep(0.55, 0.95, n.y); c = mix(c, mix(vec3(0.25, 0.04, 0.0), vec3(0.06, 0.02, 0.02), dfbm(n * 4.0 + uTime * 0.05)), sky);
             col = mix(vec3(0.0), c, uOpen);`,
      floor: `vec3 c = lava(vec3(vW.x, 0.0, vW.z) * 0.35, uTime); col = c * smoothstep(1.0, 0.9, length(vP.xz));`,
      lights: { hemi: 0xff8040, ground: 0x401008, hemiI: 1.0, sun: 0xff6020, sunI: 1.6, fog: 0x401006, fogNear: 12, fogFar: 60, exposure: 0.9 },
      decorate: (g) => {
        // 둘레의 화산 봉우리
        const rock = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.95, emissive: 0x3a0a00, emissiveIntensity: 0.6 });
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + rnd(-0.2, 0.2);
          const h = rnd(5, 11);
          const m = new THREE.Mesh(new THREE.ConeGeometry(rnd(2.5, 4.5), h, 9, 1, true), rock);
          m.position.set(Math.cos(a) * 14, h / 2 - 0.3, Math.sin(a) * 14);
          g.add(m);
        }
      },
      tick: (dt, sh) => {
        if (Math.random() < 0.8) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * sh.radius;
          ctx.fx.spawn(_v.set(sh.center.x + Math.cos(a) * r, 0.1, sh.center.z + Math.sin(a) * r), _v2.set(rnd(-0.3, 0.3), rnd(1, 3), rnd(-0.3, 0.3)), new THREE.Color().setHSL(0.05, 1, 0.55), 0.06, 1.2, 0.5, -0.5);
        }
      },
    });
  }

  helpLines(mode) {
    if (mode === 'hand') {
      return [
        { head: '화력충', demo: 'jogo.insects', color: '#ff9a40', text: '주먹을 쥐었다가 앞으로 휙 던지며 손을 펴기 → 불벌레 넷이 바라본 대상에게 날아가 터진다' },
        { head: '열선', demo: 'jogo.ray', color: '#ffd080', text: '검지(또는 검지·중지)로 가리키고 있으면 손끝에서 일직선의 불길 (주력을 계속 쓴다)' },
        { head: '화산두', demo: 'jogo.head', color: '#ff7020', text: '두 손으로 정수리를 짚고 0.4초 → 머리의 분화구에서 바라본 곳으로 용암을 쏜다' },
        { head: '분화', demo: 'jogo.erupt', color: '#ff5010', text: '손바닥을 아래로 해 빠르게 내리찍기 → 바라본 땅에서 불기둥' },
        { head: '연옥', demo: 'jogo.purgatory', color: '#ffb060', text: '두 손바닥을 마주 보게 해 불을 모은다 → 두 손을 앞으로 밀어 던지기 (오래 모을수록 크다)' },
        { head: '극번 「隕」', demo: 'jogo.meteor', color: '#ff3010', text: '두 손을 머리 위로 높이 들고 손바닥을 하늘로 1.5초 → 바라본 곳에 거대한 운석' },
        { head: '영역전개 「蓋棺鉄囲山」', demo: 'jogo.domain', color: '#ff8a50', text: '두 손 손가락을 서로 엇갈려 끼우고 손끝을 맞은편으로 (지붕 모양) 1.2초\n들어온 것은 모두 탄다 · 메뉴에서도 발동' },
        { head: '도깨비불', demo: 'itadori.punch', color: '#ffffff', text: '주먹으로 치면 고열로 불이 붙는다' },
      ];
    }
    if (mode === 'desktop') {
      return [
        { head: '조작 (데스크톱)', color: '#ffffff', text: '클릭 → 마우스 고정 · WASD 이동 · H/Tab 메뉴' },
        { head: '불', color: '#ff9a40', text: '1 화력충 · 2 열선(누르고 있기) · 3 화산두 · 4 분화 · 5 연옥(누르고 떼기) · 6 극번 「隕」 · Q 1.2초 영역전개' },
      ];
    }
    return [
      { head: '불', color: '#ff9a40', text: '오른쪽 트리거: 열선 · 왼쪽 트리거: 화력충 · A: 분화 · B 길게: 화산두' },
      { head: '연옥 · 극번', color: '#ff5010', text: '두 그립을 쥐고 손을 모았다가 밀기: 연옥 · 두 그립을 머리 위로 1.5초: 극번 「隕」' },
      { head: '영역전개', color: '#ff8a50', text: '양쪽 스틱을 눌러 1.2초' },
    ];
  }

  hudRows() {
    const w = this.ctx.world;
    const d = this.domain;
    const dom = this.shell.state === 'active' ? `전개 중 ${Math.max(0, Math.ceil(d.duration - d.t))}s` : d.cd > 0 ? `재사용 ${Math.ceil(d.cd)}s` : '준비';
    return [
      { label: '주력', bar: this.energy / this.maxEnergy, color: '#ff8a40' },
      { label: '체력', bar: w.player.hp / w.player.maxHp, color: '#ff9fa0' },
      { label: '극번', text: (this.cds.meteor ?? 0) > 0 ? `재사용 ${Math.ceil(this.cds.meteor)}s` : '준비' },
      { label: '영역', text: dom },
      { label: '처치', text: `${w.kills}` },
    ];
  }

  update(dt) {
    const { input: inp, ui } = this.ctx;
    this.tickCommon(dt, 12);
    for (const k in this.cds) this.cds[k] -= dt;
    if (!ui.menuOpen) {
      for (const h of [inp.left, inp.right]) if (h.active && !h.uiBlock) this._hand(h, dt);
      this._twoHands(dt);
      if (inp.mode === 'desktop') this._desktop(dt);
    } else for (const s of ['left', 'right']) this.rays[s].set(false);
    this.list = this.list.filter((o) => o.update(dt));
    if (this.runDomain(this.shell, dt)) this._domainTick(dt);
    this.aura.update(dt);
  }

  _hand(h, dt) {
    const ctrl = h.source === 'controller';
    const g = h.gesture;
    // 열선
    const aiming = ctrl ? h.side === 'right' && h.btn.trigger : (g === 'point' || g === 'two') && h.gestureTime > 0.25 && h.palm.distanceTo(this.ctx.input.head) > 0.22;
    this._ray(h, aiming && this.energy > 1, dt);
    // 화력충: 주먹 → 던지며 펴기
    const flick = ctrl ? h.side === 'left' && h.pressed('trigger') : g === 'open' && h.prevGesture === 'fist' && h.gestureTime < 0.15 && h.thrust > 1.8;
    if (flick && (this.cds[h.side + 'bug'] ?? 0) <= 0) {
      this.cds[h.side + 'bug'] = 0.5;
      this.insects(h.palm, ctrl ? h.dir : h.vel.clone().normalize());
    }
    // 분화: 손바닥을 아래로 내리찍기
    const slam = ctrl ? h.side === 'right' && h.pressed('a') : (g === 'open' || g === 'none') && h.palmNormal.y < -0.6 && h.vel.y < -1.8;
    if (slam && (this.cds.erupt ?? 0) <= 0) {
      this.cds.erupt = 1.2;
      this.eruption();
    }
  }

  _ray(h, on, dt) {
    const R = this.rays[h.side];
    if (!on) {
      R.set(false);
      return;
    }
    this.energy -= 14 * dt;
    const from = (h.source === 'hand' ? h.indexTip : h.pos).clone();
    const dir = h.dir.clone().normalize();
    const { t, d } = this.rayTarget(from, dir, 25, 0.1);
    R.set(true, from, dir, d);
    const end = _v.copy(from).addScaledVector(dir, d);
    this.ctx.fx.fire.flame?.(end, _v2.set(0, 1, 0), { size0: 0.25, size1: 0.5, life: 0.3 });
    if (t) {
      t.damage(70 * dt, { type: 'fire', burn: true, silent: true });
      if (Math.random() < dt * 4) t.impulse?.(_v2.copy(dir).multiplyScalar(1.5), 1);
    }
    this.aura.set(h.side, 0.6);
    if (Math.random() < 0.3) h.pulse?.(0.2, 15);
  }

  insects(from, dir) {
    if (!this.spend(8)) return;
    const inp = this.ctx.input;
    const t = this.gazeTarget(inp.head, inp.headDir, 0.35, 30, false) ?? this.gazeTarget(from, dir, 0.4, 30, false);
    const d = (dir.lengthSq() > 0.1 ? dir : inp.headDir).clone().normalize();
    for (let i = 0; i < 4; i++) this.list.push(new Insect(this.ctx, from, t, d, i * 0.07));
    this.ctx.sfx.play('fire_whoosh', { at: from, vol: 0.7, rate: 1.3 });
  }

  eruption() {
    if (!this.spend(14)) return;
    const t = this.gazeTarget(undefined, undefined, 0.3, 30, false);
    const at = t ? t.center(new THREE.Vector3()).setY(0) : this.gazePoint(14, new THREE.Vector3());
    this.list.push(new Eruption(this.ctx, at));
  }

  headVolcano() {
    if (!cool(this.ctx, 'volcano', 6, '火山頭') || !this.spend(16)) return;
    const inp = this.ctx.input;
    const from = inp.head.clone().add(_v.set(0, 0.25, 0));
    const t = this.gazeTarget(undefined, undefined, 0.3, 40, false);
    const to = t ? t.center(new THREE.Vector3()) : this.gazePoint(25, new THREE.Vector3());
    this.list.push(new LavaBlob(this.ctx, from, to));
    this.ctx.fx.fire.explosion(from, 0.4, { lite: true, head: inp.head });
    this.ctx.sfx.play('fire_ignite', { at: from, vol: 0.9, rate: 0.7 });
    this.ctx.ui.manga({ main: '火山頭', ruby: 'かざんとう', color: '#ff7020' });
  }

  meteor() {
    if ((this.cds.meteor ?? 0) > 0) {
      this.ctx.ui.callout(`극번 재사용 ${Math.ceil(this.cds.meteor)}s`);
      return;
    }
    if (!this.spend(70)) return;
    this.cds.meteor = 25;
    const t = this.gazeTarget(undefined, undefined, 0.3, 50, false);
    const at = t ? t.center(new THREE.Vector3()).setY(0) : this.gazePoint(25, new THREE.Vector3());
    this.list.push(new Meteor(this.ctx, at));
    this.ctx.ui.manga({ top: '極ノ番', main: '隕', ruby: 'いん', color: '#ff3010', big: true });
  }

  // 두 손 동작: 연옥 · 화산두 · 극번 · 영역
  _twoHands(dt) {
    const inp = this.ctx.input;
    const L = inp.left;
    const R = inp.right;
    const both = L.active && R.active && !L.uiBlock && !R.uiBlock;
    const hands = both && L.source === 'hand' && R.source === 'hand';
    const head = inp.head;
    const right = _v3.set(-inp.headDir.z, 0, inp.headDir.x).normalize();
    // 화산두: 두 손으로 정수리
    const crown = hands && L.palm.y > head.y + 0.02 && R.palm.y > head.y + 0.02 && L.palm.distanceTo(head) < 0.32 && R.palm.distanceTo(head) < 0.32;
    const crownC = (R.source === 'controller' && R.btn.b);
    if (this.held('crown', crown || crownC, dt, 0.4) && (this.cds.head ?? 0) <= 0) {
      this.cds.head = 1.5;
      this.headVolcano();
    }
    // 극번: 두 손을 머리 위로 높이, 손바닥은 하늘
    const sky = hands ? L.palm.y > head.y + 0.22 && R.palm.y > head.y + 0.22 && L.palmNormal.y > 0.4 && R.palmNormal.y > 0.4 : both && L.btn.grip && R.btn.grip && L.palm.y > head.y + 0.15 && R.palm.y > head.y + 0.15;
    if (this.held('meteor', sky, dt, 1.5)) this.meteor();
    const mk = this.holdK('meteor', 1.5);
    if (mk > 0) {
      this.aura.set('left', 0.3 + mk * 0.7);
      this.aura.set('right', 0.3 + mk * 0.7);
    }
    // 영역: 손가락을 엇갈려 끼워 손끝이 맞은편을 향한다
    let dsign = false;
    if (inp.mode === 'desktop') dsign = inp.keyDown('KeyQ');
    else if (hands && this.ctx.settings.domainGesture) dsign = L.palm.distanceTo(R.palm) < 0.13 && L.fingersDir.dot(right) > 0.35 && R.fingersDir.dot(right) < -0.35 && L.gesture !== 'fist' && R.gesture !== 'fist' && L.speed < 0.6 && R.speed < 0.6;
    else if (both && L.source === 'controller') dsign = L.btn.stick && R.btn.stick;
    if (this.ctx.settings.domainGesture && inp.ctrlMudra === 'jogo.domain') dsign = true;
    if (this.shell.state === 'idle' && this.held('domain', dsign, dt, 1.2)) this.castDomain();
    // 연옥: 두 손바닥 마주 보기 → 모으기 → 밀기
    const C = this.charge;
    let cupped = false;
    if (hands) {
      const lr = _v.subVectors(R.palm, L.palm);
      const d = lr.length();
      lr.normalize();
      // 엄격하게: 옆으로 나란히 · 손바닥이 확실히 마주 봄 · 몸 앞 · 거의 멈춘 손 · 검지/집게 손 아님
      const front = _v3.subVectors(L.palm, head).add(_v4.subVectors(R.palm, head)).multiplyScalar(0.5).dot(inp.headDir);
      cupped = d > 0.1 && d < 0.4 && Math.abs(lr.y) < 0.35 && L.palmNormal.dot(lr) > 0.7 && R.palmNormal.dot(lr) < -0.7 && front > 0.18 && L.speed < 0.7 && R.speed < 0.7 &&
        !['fist', 'point', 'pinch'].includes(L.gesture) && !['fist', 'point', 'pinch'].includes(R.gesture) && !dsign;
    } else if (both && L.source === 'controller') cupped = L.btn.grip && R.btn.grip && !L.btn.trigger && !R.btn.trigger && L.palm.distanceTo(R.palm) < 0.4 && !sky;
    if (inp.mode === 'desktop' && inp.keyDown('Digit5')) cupped = true;
    const mid = inp.mode === 'desktop' ? _v2.copy(head).addScaledVector(inp.headDir, 0.5).add(_v.set(0, -0.15, 0)) : _v2.addVectors(L.palm, R.palm).multiplyScalar(0.5);
    // 자세를 0.5초 유지해야 불이 모이기 시작한다 (스치듯 마주 본 손에 발동하지 않게)
    C.pre = cupped && !C.on ? (C.pre ?? 0) + dt : 0;
    if (cupped && !C.on && this.energy > 15 && (C.pre >= 0.5 || inp.mode === 'desktop')) {
      C.on = true;
      C.t = 0;
      C.s = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xffb040, toneMapped: false }));
      C.s.add(makeGlowSprite(new THREE.Color(0xff6010), 4));
      this.ctx.scene.add(C.s);
      this.ctx.sfx.play('charge_rise', { at: mid, vol: 0.6, rate: 0.8 });
    }
    if (C.on) {
      C.t += dt;
      this.energy -= 10 * dt;
      const power = Math.min(1, C.t / 2.5);
      C.s.position.copy(mid);
      C.s.scale.setScalar(0.05 + power * 0.16 + Math.sin(this.time * 30) * 0.008);
      this.ctx.fx.fire.flame?.(_v.copy(mid).add(_v3.randomDirection().multiplyScalar(0.2)), _v3.subVectors(mid, _v).multiplyScalar(3), { size0: 0.06, size1: 0.02, life: 0.2 });
      this.aura.set('left', 0.4 + power * 0.6);
      this.aura.set('right', 0.4 + power * 0.6);
      const push = (L.vel.dot(inp.headDir) + R.vel.dot(inp.headDir)) / 2;
      const deskRelease = inp.mode === 'desktop' && L.source !== 'hand' && !inp.keyDown('Digit5');
      if ((push > 1.4 && C.t > 0.4) || deskRelease) {
        C.on = false;
        this.list.push(new Fireball(this.ctx, C.s, mid, inp.headDir.clone(), power));
        this.ctx.ui.manga({ main: '煉獄', ruby: 'れんごく', color: '#ffb060' });
        this.ctx.sfx.play('fire_whoosh', { at: mid, vol: 1, rate: 0.6 });
        C.s = null;
      } else if (!cupped && C.t > 0.2) {
        C.lost = (C.lost ?? 0) + dt;
        if (C.lost > 0.3) {
          C.on = false;
          this.ctx.scene.remove(C.s);
          C.s = null;
        }
      } else C.lost = 0;
      if (this.energy <= 0 && C.s) {
        C.on = false;
        this.list.push(new Fireball(this.ctx, C.s, mid, inp.headDir.clone(), power));
        C.s = null;
      }
    }
  }

  castDomain() {
    if (this.openDomain(this.shell, { cost: 50, name: '蓋棺鉄囲山', ruby: 'がいかんてっちせん', color: '#ff8a50', duration: 16 })) this._sure = 0.5;
  }

  _domainTick(dt) {
    // 필중: 들어온 것은 모두 타오르고, 이따금 용암 덩어리가 날아든다
    for (const t of this.inDomain(this.shell)) {
      t.damage(32 * dt, { type: 'fire', burn: true, silent: true });
      if (Math.random() < dt * 3) this.ctx.fx.fire.flame?.(t.center(_v), _v2.set(0, 1.5, 0), { size0: 0.4, size1: 0.8, life: 0.6 });
    }
    this._sure -= dt;
    if (this._sure <= 0) {
      this._sure = 1.2;
      const list = this.inDomain(this.shell).filter((t) => t.kind !== 'prop');
      if (list.length) {
        const t = list[Math.floor(Math.random() * list.length)];
        const from = this.shell.center.clone().add(_v.set(rnd(-12, 12), 8, rnd(-12, 12)));
        this.list.push(new LavaBlob(this.ctx, from, t.center(new THREE.Vector3())));
      }
    }
  }

  cancelDomain() {
    this.closeDomain(this.shell);
  }

  /** 도깨비불: 주먹에 불이 붙는다 */
  meleeHit(target, pos, dir, speed, hand) {
    const melee = this.ctx.melee;
    melee.normalHit(target, pos, dir, 12 + speed * 3, speed, hand, { mul: 1.2 });
    target.damage(8, { type: 'fire', burn: true, silent: true });
    this.ctx.fx.fire.flame?.(pos, _v.copy(dir).multiplyScalar(2), { size0: 0.25, size1: 0.6, life: 0.4 });
    this.ctx.fx.burst(pos, 14, FIRE, 3, 0.05, 0.35);
    return true;
  }

  _desktop(dt) {
    const inp = this.ctx.input;
    const press = (code) => {
      const d = inp.keyDown(code);
      const p = d && !this._keys[code];
      this._keys[code] = d;
      return p;
    };
    if (press('Digit1')) this.insects(inp.right.palm, inp.headDir.clone());
    const r = inp.right;
    this._ray({ ...r, side: 'right', source: 'desktop', pos: r.pos, dir: inp.headDir, pulse: null, palm: r.palm, indexTip: r.pos }, inp.keyDown('Digit2') && this.energy > 1, dt);
    if (press('Digit3')) this.headVolcano();
    if (press('Digit4')) this.eruption();
    if (press('Digit6')) this.meteor();
  }

  dispose() {
    this.cancelDomain();
    this.shell.dispose();
    for (const s of ['left', 'right']) this.rays[s].dispose();
    if (this.charge.s) this.ctx.scene.remove(this.charge.s);
    this.aura.dispose();
  }
}
