// 외부 음원 없이 WebAudio로 합성하는 효과음. 위치가 주어지면 HRTF 3D 사운드로 재생한다.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._noise = null;
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
  loop({ base = 60, type = 'sine', noiseF = 400, vol = 0.25 } = {}) {
    if (!this.ctx) return { set() {}, pos() {}, stop() {} };
    const ctx = this.ctx;
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

  // ── 프리셋 ──
  explosion(at, size = 1) {
    this.noise({ dur: 0.6 + size * 0.6, vol: 0.5 * Math.min(1.5, size), f0: 3000, f1: 80, at });
    this.tone({ type: 'sine', f0: 120, f1: 30, dur: 0.5 + size * 0.4, vol: 0.5, at });
  }
  zap(at) {
    this.tone({ type: 'sawtooth', f0: 1800, f1: 200, dur: 0.25, vol: 0.25, at });
    this.noise({ dur: 0.2, vol: 0.25, f0: 6000, f1: 800, type: 'bandpass', q: 2, at });
  }
  ripple(at) {
    this.tone({ type: 'sine', f0: 900, f1: 1400, dur: 0.35, vol: 0.12, at, attack: 0.02 });
  }
  hit() {
    this.noise({ dur: 0.25, vol: 0.4, f0: 1500, f1: 100 });
    this.tone({ type: 'square', f0: 200, f1: 60, dur: 0.2, vol: 0.2 });
  }
  enemyShoot(at) {
    this.tone({ type: 'triangle', f0: 300, f1: 160, dur: 0.3, vol: 0.15, at });
  }
  enemyDie(at) {
    this.noise({ dur: 0.7, vol: 0.35, f0: 800, f1: 60, at });
    this.tone({ type: 'sawtooth', f0: 220, f1: 40, dur: 0.6, vol: 0.18, at });
  }
  toggle(on) {
    this.tone({ type: 'sine', f0: on ? 600 : 900, f1: on ? 1200 : 400, dur: 0.18, vol: 0.15 });
  }
  denied() {
    this.tone({ type: 'square', f0: 180, f1: 150, dur: 0.2, vol: 0.12 });
  }
  domain() {
    if (!this.ctx) return;
    this.tone({ type: 'sine', f0: 55, f1: 40, dur: 4, vol: 0.5, attack: 0.3 });
    this.tone({ type: 'sine', f0: 880, f1: 1760, dur: 3, vol: 0.08, attack: 1 });
    this.tone({ type: 'triangle', f0: 1320, f1: 2640, dur: 3.5, vol: 0.05, attack: 1.5 });
    this.noise({ dur: 2.5, vol: 0.3, f0: 200, f1: 8000, type: 'bandpass', q: 0.7, attack: 1.2 });
  }
}
