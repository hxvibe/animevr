"""
기술 효과음 생성기 (오프라인 렌더링).
순수 사인파 대신 필터링한 잡음·과도음·잔향을 겹쳐 실제 효과음에 가까운 소리를 만든다.
실행: python3 tools/gen_sfx.py  → assets/audio/sfx/*.mp3
      python3 tools/gen_sfx.py zap ki_blast  → 이름을 주면 그 파일만 다시 쓴다 (다른 소리는 그대로)
"""
import os, sys, subprocess, tempfile
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio', 'sfx')
rng = np.random.default_rng(7)


def T(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def filt(x, kind, f, order=2):
    nyq = SR / 2
    if kind == 'bp':
        sos = signal.butter(order, [max(20, f[0]) / nyq, min(f[1], nyq * 0.95) / nyq], 'bandpass', output='sos')
    else:
        sos = signal.butter(order, min(f, nyq * 0.95) / nyq, {'lp': 'lowpass', 'hp': 'highpass'}[kind], output='sos')
    return signal.sosfilt(sos, x)


def sweep_noise(d, centers, widths, amp=None):
    """잡음을 STFT로 가공: 시간에 따라 중심 주파수/폭이 바뀌는 대역 (centers, widths: 시간 키프레임 배열)"""
    x = noise(d)
    f, t, Z = signal.stft(x, SR, nperseg=1024)
    tk = np.linspace(0, d, len(centers))
    c = np.interp(t, tk, centers)
    w = np.interp(t, tk, widths)
    lf = np.log2(np.maximum(f, 20))[:, None]
    mask = np.exp(-0.5 * ((lf - np.log2(c)[None, :]) / np.maximum(w, 0.05)[None, :]) ** 2)
    if amp is not None:
        mask *= np.interp(t, np.linspace(0, d, len(amp)), amp)[None, :]
    _, y = signal.istft(Z * mask, SR, nperseg=1024)
    return y[: int(d * SR)]


def env_exp(d, decay, attack=0.002):
    t = T(d)
    a = np.minimum(1, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)


def sine_sweep(d, f0, f1, curve=0.15):
    t = T(d)
    f = f1 + (f0 - f1) * np.exp(-t / curve)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def pad(x, d):
    n = int(d * SR)
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros(n - len(x))])


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def at(x, start, total):
    y = np.zeros(int(total * SR))
    s = int(start * SR)
    seg = x[: max(0, len(y) - s)]
    y[s : s + len(seg)] += seg
    return y


def reverb(x, size=1.2, wet=0.25, bright=4000):
    n = int(size * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t / size * 6.9)
    ir = filt(ir, 'lp', bright)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    ir /= np.sqrt(np.sum(ir ** 2))
    y = signal.fftconvolve(x, ir)[: len(x) + n]
    dry = np.zeros(len(y))
    dry[: len(x)] = x
    return dry * (1 - wet * 0.5) + y * wet


def sat(x, drive=2.0):
    return np.tanh(x * drive) / np.tanh(drive)


def crackles(d, rate, lo=1500, hi=6000, decay=0.004, amp_env=None):
    y = np.zeros(int(d * SR))
    n = rng.poisson(rate * d)
    for _ in range(n):
        s = rng.integers(0, len(y))
        L = int(0.02 * SR)
        g = rng.standard_normal(L) * np.exp(-np.arange(L) / SR / decay) * rng.uniform(0.3, 1)
        e = min(len(y), s + L)
        y[s:e] += g[: e - s]
    y = filt(y, 'bp', (lo, hi))
    if amp_env is not None:
        y *= np.interp(T(d), np.linspace(0, d, len(amp_env)), amp_env)
    return y


def bubbles(d, rate, f_lo=250, f_hi=900):
    """물방울/액체: 짧게 음높이가 올라가는 공명 (Minnaert)"""
    y = np.zeros(int(d * SR))
    n = rng.poisson(rate * d)
    for _ in range(n):
        s = rng.integers(0, len(y))
        dur = rng.uniform(0.015, 0.05)
        t = T(dur)
        f0 = rng.uniform(f_lo, f_hi)
        f = f0 * (1 + 1.8 * t / dur)
        g = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * 0.35)) * rng.uniform(0.2, 1)
        e = min(len(y), s + len(g))
        y[s:e] += g[: e - s]
    return y


def thump(f0=120, f1=45, d=0.25, decay=0.08, curve=0.04):
    return sine_sweep(d, f0, f1, curve) * env_exp(d, decay, 0.001)


def transient(d=0.006, hp=1500):
    x = noise(0.03) * env_exp(0.03, d, 0.0003)
    return filt(x, 'hp', hp)


def lfo_noise(d, rate, depth=1.0):
    """느리게 흔들리는 무작위 값 (0..1)"""
    k = max(2, int(d * rate) + 2)
    pts = rng.uniform(0, 1, k)
    y = np.interp(T(d), np.linspace(0, d, k), pts)
    y = filt(y, 'lp', rate * 1.5, 1)
    y = (y - y.min()) / (np.ptp(y) + 1e-9)
    return 1 - depth + depth * y


def loopify(x, xf=0.5):
    n = int(xf * SR)
    body = x[: len(x) - n].copy()
    tail = x[len(x) - n :]
    w = np.linspace(0, 1, n)
    body[:n] = body[:n] * w + tail * (1 - w)
    return body


def norm(x, peak=0.89):
    m = np.max(np.abs(x)) + 1e-9
    return x / m * peak


def fade_out(x, d=0.05):
    n = min(len(x), int(d * SR))
    x = x.copy()
    x[-n:] *= np.linspace(1, 0, n)
    return x


ONLY = set(sys.argv[1:])


def write(name, x, peak=0.89, br='112k'):
    # 이름을 지정했으면 그것만 쓴다. 소리 생성은 그대로 돌려 난수 순서를 유지한다
    if ONLY and name not in ONLY:
        return
    x = fade_out(norm(x, peak))
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        wavfile.write(f.name, SR, (x * 32767).astype(np.int16))
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', f.name, '-ac', '1', '-b:a', br, os.path.join(OUT, name + '.mp3')], check=True)
    os.unlink(f.name)
    print(name, round(len(x) / SR, 2))


# ───────── 소리 정의 ─────────
def whoosh(d=0.35, lo=350, hi=2600):
    c = [lo, hi, lo * 1.4]
    x = sweep_noise(d, c, [0.9, 0.7, 1.0], [0, 1, 0.25, 0])
    return x


def punch(var=0):
    d = 0.5
    x = mix(
        thump(130 + var * 15, 48, d, 0.09) * 1.0,
        transient(0.004, 1800) * 0.5,
        filt(noise(d) * env_exp(d, 0.035), 'bp', (180, 1200)) * 0.8,
    )
    return reverb(sat(x, 1.6), 0.45, 0.12)


def explosion(size=1.0):
    d = 1.2 + size * 1.8
    sub = sine_sweep(d, 70, 26, 0.25) * env_exp(d, 0.35 + size * 0.5, 0.004)
    rumble = sweep_noise(d, [900, 300, 90], [1.2, 1.0, 0.9]) * env_exp(d, 0.5 + size * 0.6, 0.006)
    crack = transient(0.008, 600) * 1.5
    deb = crackles(d, 60 * size, 900, 5000, 0.006, [0, 1, 0.5, 0.15, 0])
    x = mix(sat(sub * 1.4, 2.2) * 0.9, rumble * 1.3, crack, deb * 0.5)
    return reverb(x, 1.6 + size * 0.6, 0.3, 3000)


def black_flash():
    d = 1.6
    x = mix(
        transient(0.003, 2500) * 1.6,
        sat(thump(180, 40, d, 0.25, 0.05) * 1.6, 3),
        sweep_noise(d, [4000, 900, 200], [1.0, 1.0, 0.8]) * env_exp(d, 0.25),
        crackles(d, 220, 2000, 9000, 0.003, [1, 0.4, 0.05, 0]) * 0.6,
    )
    return reverb(x, 1.4, 0.3, 5000)


def energy_loop(kind):
    d = 4.5
    t = T(d)
    if kind == 'blue':
        # 깊은 소용돌이 + 빨려드는 공기
        bands = []
        for f, r in [(110, 0.31), (230, 0.53), (420, 0.71)]:
            c = f * (1 + 0.35 * np.sin(2 * np.pi * r * np.linspace(0, d, 40) + rng.uniform(0, 6)))
            bands.append(sweep_noise(d, c, np.full(40, 0.18)))
        air = sweep_noise(d, [3500, 5000, 3800, 4500], [0.6] * 4) * lfo_noise(d, 1.2, 0.7) * 0.25
        sub = np.sin(2 * np.pi * 46 * t) * (0.8 + 0.2 * np.sin(2 * np.pi * 3.1 * t))
        x = mix(sum(bands) * 1.4, air, sat(sub * 0.5, 1.5) * 0.6)
    elif kind == 'red':
        # 거칠게 튀는 고압 에너지
        body = sweep_noise(d, [900, 1500, 1100, 1300], [0.5] * 4) * (0.6 + 0.4 * lfo_noise(d, 18))
        hum = filt(sat(np.sign(np.sin(2 * np.pi * 92 * t)) * 0.4 + noise(d) * 0.1, 2), 'lp', 600)
        x = mix(body * 1.2, hum * 0.35, crackles(d, 70, 2000, 8000, 0.003) * 0.7)
    elif kind == 'purple':
        roar = sat(filt(noise(d), 'lp', 700) * 3, 3) * (0.7 + 0.3 * lfo_noise(d, 7))
        growl = sweep_noise(d, [220, 320, 260, 300], [0.25] * 4) * (0.5 + 0.5 * np.sin(2 * np.pi * 6.5 * t) ** 2)
        sub = np.sin(2 * np.pi * 34 * t)
        x = mix(roar * 0.6, growl * 1.4, sub * 0.6, crackles(d, 40, 1500, 6000, 0.004) * 0.4)
    elif kind == 'fire':
        roar = filt(noise(d), 'lp', 1300) * (0.45 + 0.55 * lfo_noise(d, 11))
        low = filt(noise(d), 'lp', 160) * 1.5
        pops = crackles(d, 45, 1200, 7000, 0.002) * 0.9
        x = mix(roar, low, pops)
    return loopify(x)


def charge_rise(d=1.5):
    x = sweep_noise(d, [180, 600, 2500, 6000], [0.8, 0.6, 0.5, 0.5], [0, 0.3, 0.7, 1])
    x = mix(x, crackles(d, 50, 2000, 7000, 0.003, [0, 0.2, 1]) * 0.4)
    return reverb(x, 0.8, 0.2)


def zap():
    d = 0.6
    return reverb(mix(crackles(d, 400, 2500, 10000, 0.002, [1, 0.6, 0.2, 0]), transient(0.004, 3000) * 0.8), 0.5, 0.15)


def red_fire():
    d = 1.4
    x = mix(
        transient(0.006, 900) * 1.5,
        sat(thump(110, 38, d, 0.35, 0.08) * 1.4, 2),
        sweep_noise(d, [2500, 900, 300], [0.9, 0.9, 0.9]) * env_exp(d, 0.25, 0.003) * 1.2,
        crackles(d, 120, 2000, 8000, 0.003, [1, 0.3, 0]) * 0.4,
    )
    return reverb(x, 1.3, 0.3)


def purple_launch():
    pre = sweep_noise(0.45, [300, 1200, 5000], [0.9, 0.8, 0.6], [0, 0.4, 1])
    boom = explosion(2.2)
    roar = sat(filt(noise(3.5), 'lp', 500) * 3, 3) * env_exp(3.5, 1.2, 0.2) * 0.5
    total = 0.45 + len(boom) / SR
    return mix(at(pre * 0.8, 0, total), at(boom, 0.42, total), at(roar, 0.45, total))


def shatter(var=0):
    d = 0.7
    grains = np.zeros(int(d * SR))
    for _ in range(90 + var * 20):
        s = int(rng.uniform(0, 0.35) ** 1.6 * SR)
        L = int(rng.uniform(0.004, 0.02) * SR)
        f0 = rng.uniform(1200, 6500)
        g = filt(rng.standard_normal(L + 64), 'bp', (f0 * 0.8, f0 * 1.25))[64:] * np.exp(-np.arange(L) / SR / 0.004)
        e = min(len(grains), s + L)
        grains[s:e] += g[: e - s] * rng.uniform(0.2, 1)
    x = mix(grains, thump(160, 60, d, 0.07) * 0.7, transient(0.005, 1500) * 0.6)
    return reverb(x, 0.7, 0.2)


def click():
    d = 0.06
    return filt(noise(d) * env_exp(d, 0.004, 0.0005), 'bp', (1800, 4200)) + thump(400, 200, d, 0.01) * 0.3


def toggle(up=True):
    a = click()
    b = filt(noise(0.06) * env_exp(0.06, 0.004, 0.0005), 'bp', (3000, 6500) if up else (900, 2000))
    return mix(at(a, 0, 0.16), at(b * 0.9, 0.06, 0.16))


def denied():
    k = thump(220, 150, 0.12, 0.03, 0.02) + filt(noise(0.12) * env_exp(0.12, 0.01), 'lp', 600) * 0.5
    return mix(at(k, 0, 0.3), at(k, 0.11, 0.3))


def gunshot():
    d = 0.8
    x = mix(transient(0.004, 1200) * 1.3, filt(noise(d) * env_exp(d, 0.05), 'lp', 2500), thump(150, 60, d, 0.06) * 0.8)
    return reverb(sat(x, 2), 0.9, 0.3)


def rumble(d=3.5):
    t = T(d)
    a = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 1.2)
    x = mix(filt(noise(d), 'lp', 140) * 3, np.sin(2 * np.pi * 38 * t) * 0.4, crackles(d, 30, 300, 1500, 0.01) * 0.6)
    return x * a


def shimmer(d=0.6):
    parts = []
    for f in [2100, 3150, 4720, 6300]:
        parts.append(filt(noise(d), 'bp', (f * 0.985, f * 1.015), 2) * rng.uniform(0.6, 1))
    t = T(d)
    a = np.sin(np.pi * np.minimum(1, t / d)) ** 2
    return reverb(sum(parts) * a, 0.9, 0.35, 8000)


def domain_open():
    d = 5.0
    t = T(d)
    boom = explosion(1.4)
    rise = sweep_noise(d, [120, 200, 900, 3000, 600], [0.8] * 5, [0, 0.2, 0.6, 1, 0])
    drone = sweep_noise(d, [70, 75, 72], [0.25] * 3) * np.minimum(1, t / 0.5) * np.minimum(1, (d - t) / 1.5) * 2
    return mix(boom, rise * 0.7, drone)


def void_open():
    d = 4.0
    return mix(shimmer(d) * 1.0, sweep_noise(d, [200, 2000, 8000], [1.0, 0.8, 0.6], [0, 0.5, 1, 0]) * 0.5)


def fire_ignite():
    d = 1.0
    return reverb(mix(whoosh(0.5, 200, 1400) * 1.2, filt(noise(d), 'lp', 900) * env_exp(d, 0.3, 0.05), crackles(d, 60, 1500, 7000, 0.002, [0.2, 1, 0.3, 0]) * 0.6), 0.6, 0.15)


def fire_whoosh():
    d = 1.4
    return mix(whoosh(0.7, 250, 1800) * 1.4, filt(noise(d), 'lp', 1200) * env_exp(d, 0.5, 0.02) * (0.6 + 0.4 * lfo_noise(d, 12)), crackles(d, 80, 1500, 7000, 0.002) * 0.5)


def fire_explode():
    d = 3.2
    burn = filt(noise(d), 'lp', 1500) * (0.5 + 0.5 * lfo_noise(d, 9)) * env_exp(d, 1.0, 0.05)
    return mix(explosion(1.3), burn * 1.1, crackles(d, 120, 1500, 8000, 0.002, [1, 0.6, 0.2, 0]) * 0.7)


def chant():
    d = 1.4
    x = mix(thump(90, 55, d, 0.4, 0.2) * 0.9, sweep_noise(d, [160, 140], [0.2, 0.2]) * env_exp(d, 0.5, 0.01) * 1.5)
    return reverb(x, 1.8, 0.4, 2500)


def grab():
    d = 0.15
    return mix(filt(noise(d) * env_exp(d, 0.025, 0.002), 'bp', (250, 1500)), thump(160, 90, d, 0.03) * 0.5)


# ── 바람 · 기 (만상 · 이타도리) ──


def wind_burst():
    d = 4.0
    t = T(d)
    howl = sweep_noise(d, [700, 2600, 1400, 500], [0.5, 0.4, 0.5, 0.7], [0, 1, 0.6, 0]) * (0.5 + 0.5 * np.sin(2 * np.pi * 45 * t) ** 6)
    hiss = sweep_noise(d, [5000, 7000, 3000], [0.6] * 3, [0.2, 1, 0.3, 0]) * 0.5
    return mix(explosion(1.5), howl * 1.3, hiss)


def ki_blast():
    d = 0.7
    pew = sine_sweep(d, 1700, 260, 0.05) * env_exp(d, 0.08, 0.002) * 0.6
    hiss = sweep_noise(d, [3200, 900], [0.8, 0.8]) * env_exp(d, 0.1, 0.002)
    return reverb(mix(pew, hiss, transient(0.004, 2000) * 0.6, thump(140, 60, d, 0.06) * 0.6), 0.6, 0.2)






if __name__ == '__main__':
    for i in range(3):
        write(f'whoosh{"_" + str(i + 1) if i else ""}', whoosh(0.28 + i * 0.08, 300 + i * 80, 2200 + i * 500))
        write(f'punch{"_" + str(i + 1) if i else ""}', punch(i))
    write('explosion', explosion(1.0))
    write('explosion_2', explosion(1.1))
    write('explosion_small', explosion(0.45))
    write('black_flash', black_flash())
    for k in ['blue', 'red', 'purple', 'fire']:
        write(f'loop_{k}', energy_loop(k), 0.8)
    write('charge_rise', charge_rise())
    write('zap', zap())
    write('red_fire', red_fire())
    write('purple_launch', purple_launch())
    write('shatter', shatter(0))
    write('shatter_2', shatter(1))
    write('click', click(), 0.5)
    write('toggle_on', toggle(True), 0.5)
    write('toggle_off', toggle(False), 0.5)
    write('denied', denied(), 0.5)
    write('gunshot', gunshot())
    write('rumble', rumble())
    write('shimmer', shimmer())
    write('domain_open', domain_open())
    write('void_open', void_open())
    write('fire_ignite', fire_ignite())
    write('fire_whoosh', fire_whoosh())
    write('fire_explode', fire_explode())
    write('chant', chant())
    write('grab', grab(), 0.6)
    write('wind_burst', wind_burst())
    write('ki_blast', ki_blast())
