// 외부 음원 없이 WebAudio로 합성하는 효과음. 위치가 주어지면 HRTF 3D 사운드로 재생한다.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._noise = null;
    this._raw = new Map(); // name → ArrayBuffer (미디코딩)
    this._buf = new Map(); // name → AudioBuffer
  }

  /** 효과음 묶음 (tools/gen_sfx.py로 렌더링한 파일 + 제공된 참격음) */
  preloadSfx() {
    const names = [
      'whoosh', 'whoosh_2', 'whoosh_3', 'punch', 'punch_2', 'punch_3', 'explosion', 'explosion_2', 'explosion_small', 'black_flash',
      'loop_blue', 'loop_red', 'loop_purple', 'loop_fire', 'charge_rise', 'zap', 'red_fire', 'purple_launch',
      'shatter', 'shatter_2', 'click', 'toggle_on', 'toggle_off', 'denied', 'gunshot', 'rumble', 'shimmer', 'domain_open', 'void_open',
      'fire_ignite', 'fire_whoosh', 'fire_explode', 'chant', 'grab', 'slash',
    ];
    this.preloadClips(Object.fromEntries(names.map((n) => [n, `assets/audio/sfx/${n}.mp3`])));
  }

  /**
   * 효과음 재생. name_2, name_3 변형이 있으면 무작위로 고른다.
   * @returns 재생했으면 true (파일이 아직 없으면 false → 호출 측에서 합성음으로 대체 가능)
   */
  play(name, { at = null, vol = 1, rate = 1, jitter = 0.05, delay = 0 } = {}) {
    if (!this.ctx) return false;
    const vars = [name, name + '_2', name + '_3'].map((n) => this._buf.get(n)).filter(Boolean);
    if (!vars.length) return false;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = vars[Math.floor(Math.random() * vars.length)];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this._out(at));
    src.start(ctx.currentTime + delay);
    return true;
  }

  /** 음성·음악 파일을 미리 받아 둔다 (디코딩은 오디오가 열린 뒤) */
  preloadClips(map) {
    for (const [name, url] of Object.entries(map)) {
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => {
          if (!ab) return;
          this._raw.set(name, ab);
          this._decode(name);
        })
        .catch(() => {});
    }
  }

  _decode(name) {
    if (!this.ctx || this._buf.has(name) || !this._raw.has(name)) return null;
    const ab = this._raw.get(name);
    this._raw.delete(name);
    const p = this.ctx.decodeAudioData(ab).then((b) => {
      this._buf.set(name, b);
      return b;
    }).catch(() => null);
    this._buf.set(name, null);
    p.then((b) => this._buf.set(name, b));
    return p;
  }

  clipDuration(name) {
    return this._buf.get(name)?.duration ?? 0;
  }

  /** 디코딩된 파일 재생. 반환: { stop(fade), duration } */
  playClip(name, { vol = 1, delay = 0, loop = false, fadeIn = 0 } = {}) {
    const none = { stop() {}, duration: 0 };
    if (!this.ctx) return none;
    const buf = this._buf.get(name);
    if (!buf) return none;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + Math.max(0, delay);
    if (fadeIn > 0) {
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + fadeIn);
    } else g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start(t0);
    let stopped = false;
    return {
      duration: buf.duration,
      stop(fade = 0.6) {
        if (stopped) return;
        stopped = true;
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + fade);
        try {
          src.stop(Math.max(now, t0) + fade + 0.05);
        } catch (_) {}
      },
    };
  }

  /** 사용자 제스처(버튼 클릭) 안에서 호출해야 한다 */
  unlock() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    for (const name of [...this._raw.keys()]) this._decode(name);
  }

  get ok() {
    return !!this.ctx;
  }

  updateListener(pos, fwd, up) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else if (L.setPosition) {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  _out(at) {
    if (!at) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 2;
    p.rolloffFactor = 0.8;
    if (p.positionX) {
      p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z;
    } else p.setPosition(at.x, at.y, at.z);
    p.connect(this.master);
    return p;
  }

  _env(gain, t0, a, peak, dur) {
    const g = gain.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  _noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.loop = true;
    return s;
  }

  tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.3, vol = 0.3, at = null, attack = 0.01 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this._env(g, t, attack, vol, dur);
    o.connect(g).connect(this._out(at));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.4, vol = 0.3, f0 = 2000, f1 = 200, q = 1, at = null, type = 'lowpass', attack = 0.005 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this._noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, attack, vol, dur);
    s.connect(f).connect(g).connect(this._out(at));
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  /** 지속음 핸들 { set(level, pitch), pos(v), stop() } */
  loop({ sample = null, base = 60, type = 'sine', noiseF = 400, vol = 0.25 } = {}) {
    if (!this.ctx) return { set() {}, pos() {}, stop() {} };
    const ctx = this.ctx;
    const buf = sample && this._buf.get('loop_' + sample);
    if (buf) {
      // 녹음(렌더링)된 지속음: 음량과 재생 속도로 세기·높이를 표현
      const t = ctx.currentTime;
      const panner = this._out({ x: 0, y: 0, z: 0 });
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.12);
      g.connect(panner);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(g);
      src.start(t, Math.random() * buf.duration);
      let stopped = false;
      return {
        set(level = 1, pitch = 1) {
          if (stopped) return;
          const now = ctx.currentTime;
          src.playbackRate.setTargetAtTime(Math.min(2.2, Math.max(0.5, Math.sqrt(pitch))), now, 0.08);
          g.gain.setTargetAtTime(Math.max(0.0001, vol * level), now, 0.06);
        },
        pos(p) {
          if (stopped || !panner.positionX) return;
          const now = ctx.currentTime;
          panner.positionX.setTargetAtTime(p.x, now, 0.03);
          panner.positionY.setTargetAtTime(p.y, now, 0.03);
          panner.positionZ.setTargetAtTime(p.z, now, 0.03);
        },
        stop(fade = 0.25) {
          if (stopped) return;
          stopped = true;
          const now = ctx.currentTime;
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
          g.gain.exponentialRampToValueAtTime(0.0001, now + fade);
          src.stop(now + fade + 0.05);
        },
      };
    }
    const t = ctx.currentTime;
    const panner = this._out({ x: 0, y: 0, z: 0 });
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.15);
    g.connect(panner);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = base;
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = base * 1.5;
    const og = ctx.createGain();
    og.gain.value = 0.15;
    o2.connect(og).connect(g);
    o.connect(g);
    const n = this._noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.value = noiseF;
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    n.connect(f).connect(ng).connect(g);
    o.start(); o2.start(); n.start();
    let stopped = false;
    return {
      set(level = 1, pitch = 1) {
        if (stopped) return;
        const now = ctx.currentTime;
        o.frequency.setTargetAtTime(base * pitch, now, 0.05);
        o2.frequency.setTargetAtTime(base * 1.5 * pitch, now, 0.05);
        f.frequency.setTargetAtTime(noiseF * pitch, now, 0.05);
        g.gain.setTargetAtTime(Math.max(0.0001, vol * level), now, 0.05);
      },
      pos(p) {
        if (stopped || !panner.positionX) return;
        const now = ctx.currentTime;
        panner.positionX.setTargetAtTime(p.x, now, 0.03);
        panner.positionY.setTargetAtTime(p.y, now, 0.03);
        panner.positionZ.setTargetAtTime(p.z, now, 0.03);
      },
      stop(fade = 0.25) {
        if (stopped) return;
        stopped = true;
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + fade);
        for (const s of [o, o2, n]) s.stop(now + fade + 0.05);
      },
    };
  }

  // ── 프리셋 (파일이 없으면 합성음으로 대체) ──
  explosion(at, size = 1) {
    if (this.play(size < 0.8 ? 'explosion_small' : 'explosion', { at, vol: Math.min(1.3, 0.6 + size * 0.35), rate: size > 1.6 ? 0.85 : 1 })) return;
    this.noise({ dur: 0.6 + size * 0.6, vol: 0.5 * Math.min(1.5, size), f0: 3000, f1: 80, at });
  }
  zap(at) {
    if (this.play('zap', { at, vol: 0.8 })) return;
    this.noise({ dur: 0.2, vol: 0.25, f0: 6000, f1: 800, type: 'bandpass', q: 2, at });
  }
  ripple(at) {
    this.play('shimmer', { at, vol: 0.35, rate: 1.2 });
  }
  hit() {
    if (this.play('punch', { vol: 0.8, rate: 0.8 })) return;
    this.noise({ dur: 0.25, vol: 0.4, f0: 1500, f1: 100 });
  }
  enemyShoot(at) {
    this.play('gunshot', { at, vol: 0.45, rate: 1.15 });
  }
  enemyDie(at) {
    if (this.play('shatter', { at, vol: 0.8 })) return;
    this.noise({ dur: 0.7, vol: 0.35, f0: 800, f1: 60, at });
  }
  toggle(on) {
    this.play(on ? 'toggle_on' : 'toggle_off', { vol: 0.8 });
  }
  denied() {
    this.play('denied', { vol: 0.6 });
  }
  click() {
    this.play('click', { vol: 0.7 });
  }
  gunshot(at) {
    this.play('gunshot', { at, vol: 0.6 });
  }
  slash(at, pitch = 1) {
    if (this.play('slash', { at, vol: 1, rate: pitch })) return;
    this.noise({ dur: 0.22, vol: 0.35, f0: 9000 * pitch, f1: 1200, type: 'bandpass', q: 1.5, at, attack: 0.002 });
  }
  cut(at) {
    if (this.play('slash', { at, vol: 0.45, rate: 1.35, jitter: 0.1 })) return;
    this.noise({ dur: 0.1, vol: 0.3, f0: 7000, f1: 2500, type: 'highpass', q: 0.7, at, attack: 0.001 });
  }
  shatter(at) {
    this.play('shatter', { at, vol: 0.9 });
  }
  fire(at, size = 1) {
    if (this.play('fire_explode', { at, vol: Math.min(1.3, 0.7 + size * 0.3), rate: size > 1.4 ? 0.85 : 1 })) return;
    this.noise({ dur: 1.2 * size, vol: 0.5, f0: 1200, f1: 120, at, attack: 0.02 });
  }
  punch(at) {
    if (this.play('punch', { at, vol: 0.9 })) return;
    this.noise({ dur: 0.12, vol: 0.4, f0: 1800, f1: 200, at });
  }
  blackFlash(at) {
    if (this.play('black_flash', { at, vol: 1.1 })) return;
    this.noise({ dur: 0.5, vol: 0.6, f0: 4000, f1: 60, at, attack: 0.001 });
  }
  whoosh(at, vol = 0.6, rate = 1) {
    this.play('whoosh', { at, vol, rate, jitter: 0.12 });
  }
  rumble(dur = 2, vol = 0.4) {
    if (this.play('rumble', { vol: vol * 1.6, rate: Math.max(0.7, Math.min(1.3, 3.5 / Math.max(1, dur * 1.4))) })) return;
    this.noise({ dur, vol, f0: 300, f1: 60, attack: 0.3 });
  }
  domain() {
    if (!this.ctx) return;
    if (this.play('domain_open', { vol: 1 })) {
      this.play('void_open', { vol: 0.5 });
      return;
    }
    this.noise({ dur: 2.5, vol: 0.3, f0: 200, f1: 8000, type: 'bandpass', q: 0.7, attack: 1.2 });
  }
}
