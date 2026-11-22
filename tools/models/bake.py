# 2단계: 줄인 메시 → 축 정렬 · 부위 나누기 · UV · 모서리 각진 법선 · 텍스처(색 · 거칠기/금속 · 노멀) 그리기
#  STL에서 온 모델이라 UV·재질이 없다 → 참고 이미지처럼 손으로 칠한 듯한 텍스처를 코드로 만든다
import numpy as np, json, sys
from PIL import Image

rng = np.random.default_rng(3)

# 부위 경계 (손잡이 끝 s=0 → 칼끝 s=1)
CFG = {
    'v1': dict(length=0.86, grip=0.22, parts=[('ferrule', 0.067), ('handle', 0.312), ('guard', 0.35), ('blade', 1.01)], edge='hi', single=True),
    'v2': dict(length=0.80, grip=0.16, parts=[('ring', 0.065), ('wrap', 0.25), ('flare', 0.378), ('blade', 1.01)]),
}
TW, TH = 2048, 512


def smooth1d(a, k=5):
    ker = np.ones(k) / k
    pad = np.pad(a, k // 2, mode='edge')
    return np.convolve(pad, ker, mode='valid')


def noise2(h, w, scale, seed):
    """부드러운 값 노이즈 (격자 보간)"""
    r = np.random.default_rng(seed)
    gh, gw = max(2, int(h / scale) + 2), max(2, int(w / scale) + 2)
    g = r.random((gh, gw))
    y = np.linspace(0, gh - 1.001, h)
    x = np.linspace(0, gw - 1.001, w)
    y0 = y.astype(int); x0 = x.astype(int)
    fy = (y - y0)[:, None]; fx = (x - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


def fbm(h, w, scale, seed, oct=4):
    out = np.zeros((h, w)); amp = 1; tot = 0
    for o in range(oct):
        out += amp * noise2(h, w, scale / (2 ** o), seed + o); tot += amp; amp *= 0.5
    return out / tot


def hexc(s):
    s = s.lstrip('#')
    return np.array([int(s[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def run(name):
    C = CFG[name]
    P = np.fromfile(f'{name}.pos.bin', dtype=np.float32).reshape(-1, 3).astype(np.float64)
    I = np.fromfile(f'{name}.idx.bin', dtype=np.uint32).reshape(-1, 3)
    c = P.mean(0)
    X = P - c
    ev, V = np.linalg.eigh(X.T @ X)
    ax, wx, tx = V[:, 2].copy(), V[:, 1].copy(), V[:, 0].copy()
    sa = X @ ax
    lo, hi = sa.min(), sa.max()
    s = (sa - lo) / (hi - lo)
    w = X @ wx
    wid = lambda m: (w[m].max() - w[m].min()) if m.any() else 0
    if wid(s > 0.97) > wid(s < 0.03) * 1.5:  # 칼끝(좁은 쪽)이 s=1 이 되게
        ax = -ax; wx = -wx; s = 1 - s
    if np.linalg.det(np.stack([wx, ax, tx])) < 0:
        tx = -tx
    w = X @ wx; t = X @ tx
    L = hi - lo
    sc = C['length'] / L
    pos = np.stack([w * sc, (s - C['grip']) * C['length'], t * sc], 1)

    bounds = [b for _, b in C['parts']]
    names = [n for n, _ in C['parts']]
    tri_s = s[I].mean(1)
    tri_part = np.searchsorted(bounds, tri_s, side='right')
    tri_part = np.minimum(tri_part, len(bounds) - 1)
    blade_id = names.index('blade')

    # 날 단면의 폭 범위 (s 구간별) → wn: 0(한쪽 날) ~ 1(반대쪽)
    nb = 160
    bins = np.minimum((s * nb).astype(int), nb - 1)
    wmin = np.full(nb, np.nan); wmax = np.full(nb, np.nan); tc = np.zeros(nb); wc = np.zeros(nb)
    tmin_side = np.zeros(nb)
    for b in range(nb):
        m = bins == b
        if m.sum() < 3:
            continue
        wmin[b] = w[m].min(); wmax[b] = w[m].max()
        wc[b] = (wmin[b] + wmax[b]) / 2; tc[b] = (t[m].min() + t[m].max()) / 2
    for arr in (wmin, wmax):
        idx = np.arange(nb); ok = ~np.isnan(arr)
        arr[:] = np.interp(idx, idx[ok], arr[ok])
    wc = (wmin + wmax) / 2
    # 외날(v1): 얇아지는 쪽이 날. 날 구간에서 양 끝 10% 정점들의 두께 비교
    bm = s > bounds[blade_id - 1] + 0.03
    wn_all = (w - wmin[bins]) / np.maximum(1e-6, wmax[bins] - wmin[bins])
    th_lo = np.abs(t[bm & (wn_all < 0.12)] - tc[bins][bm & (wn_all < 0.12)]).mean()
    th_hi = np.abs(t[bm & (wn_all > 0.88)] - tc[bins][bm & (wn_all > 0.88)]).mean()
    edge_lo = th_lo < th_hi  # wn=0 쪽이 날
    if 'edge' in C:
        edge_lo = C['edge'] == 'lo'  # 모양으로 확인한 값 (두께로는 잘 안 갈린다)
    print(name, 'edge side thickness lo/hi', round(th_lo, 3), round(th_hi, 3))

    # 모서리 법선: 인접 면 중 각도가 40° 안인 면들만 평균 (날의 각진 모서리는 각지게)
    fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
    area = np.linalg.norm(fn, axis=1, keepdims=True)
    fnu = fn / np.maximum(area, 1e-12)
    # 위치 공간 법선 → 새 좌표로
    def tonew(n):
        q = n @ V
        if (q is not None):
            pass
        return q
    vf = [[] for _ in range(len(P))]
    for f, (a, b, cc) in enumerate(I):
        vf[a].append(f); vf[b].append(f); vf[cc].append(f)
    cos = np.cos(np.radians(40))
    corner_n = np.zeros((len(I), 3, 3))
    for f in range(len(I)):
        for k in range(3):
            v = I[f, k]
            adj = np.array(vf[v])
            d = fnu[adj] @ fnu[f]
            sel = adj[d > cos]
            n = (fn[sel]).sum(0)
            corner_n[f, k] = n / max(1e-12, np.linalg.norm(n))
    Nc = corner_n.reshape(-1, 3)
    Nn = np.stack([Nc @ wx, Nc @ ax, Nc @ tx], 1)

    # 모서리마다 UV
    cs = s[I].reshape(-1)
    cbin = bins[I].reshape(-1)
    cw = w[I].reshape(-1); ct = t[I].reshape(-1)
    cpart = np.repeat(tri_part, 3)
    u = cs.copy()
    wn = (cw - wmin[cbin]) / np.maximum(1e-6, wmax[cbin] - wmin[cbin])
    if not edge_lo:
        wn = 1 - wn  # 언제나 wn=0 쪽이 (주된) 날
    ang = (np.arctan2(ct - tc[cbin], cw - wc[cbin]) / (2 * np.pi)) % 1.0
    # 칼날은 면 방향으로 나눈다: 넓은 면(법선 ≈ 두께 축) = 어두운 강철, 갈아 낸 날 면(법선이 폭 쪽으로 기움) = 밝은 날
    #  텍스처 v: 0.02~0.24 = 날 면 · 0.3~0.96 = 넓은 면(폭 위치 wn)
    tn = np.stack([fnu @ wx, fnu @ ax, fnu @ tx], 1)
    side = tn[:, 0] * (1 if not edge_lo else -1)  # +: 날 쪽을 향한 면 (wn=0 쪽)
    tri_s3 = tri_s
    bevel = np.abs(tn[:, 2]) < 0.93
    if C.get('single'):
        bevel = bevel & ((side > 0) | (tri_s3 > 0.80))
    cb = np.repeat(bevel, 3)
    vflat = 0.3 + 0.66 * np.clip(wn, 0, 1)
    vbev = 0.02 + 0.22 * np.clip(wn, 0, 1)
    vb = np.where(cb, vbev, vflat)
    vv = np.where(cpart == blade_id, vb, ang)
    vv = vv.reshape(-1, 3)
    # 둘레를 감는 UV의 이음매: 한 삼각형이 0과 1을 건너면 작은 쪽에 1을 더한다
    wrap = (vv.max(1) - vv.min(1)) > 0.5
    vv[wrap] = np.where(vv[wrap] < 0.5, vv[wrap] + 1, vv[wrap])
    uv = np.stack([u, 1 - vv.reshape(-1)], 1)  # glTF: v 아래로

    cpos = pos[I].reshape(-1, 3)
    out = dict(pos=cpos.astype(np.float32), nrm=Nn.astype(np.float32), uv=uv.astype(np.float32))
    for k, a in out.items():
        a.tofile(f'{name}.out.{k}.bin')

    paint(name, C, bounds, names, edge_lo)
    meta = dict(length=C['length'], grip=C['grip'], parts={n: b for n, b in C['parts']})
    json.dump(meta, open(f'{name}.meta.json', 'w'))
    print(name, 'corners', len(cpos), 'bbox', cpos.min(0).round(3), cpos.max(0).round(3))


def paint(name, C, bounds, names, edge_lo):
    H, W = TH, TW
    U = (np.arange(W) + 0.5) / W
    Vt = (np.arange(H) + 0.5) / H
    uu, vv = np.meshgrid(U, Vt)  # vv: 텍스처 위→아래 = glTF v 0→1 = 우리 vv(1-v)… 아래에서 맞춤
    vq = 1 - vv  # 우리 쪽 v (블레이드 wn / 둘레 각)
    col = np.zeros((H, W, 3)); rough = np.ones((H, W)); metal = np.zeros((H, W)); hgt = np.zeros((H, W))
    part = np.minimum(np.searchsorted(bounds, uu, side='right'), len(bounds) - 1)
    L = C['length']
    n_big = fbm(H, W, 64, 11)
    n_mid = fbm(H, W, 18, 21)
    n_fine = noise2(H, W, 2.5, 31)
    streak = fbm(H, W * 1, 6, 41, 3)  # 결

    def region(nm):
        return part == names.index(nm)

    if name == 'v1':
        # ── 칼날: 짙은 강철 · v<0.27 은 갈아 낸 날 면 (밝은 강철, 길이 방향 결)
        b = region('blade')
        edge = (vq < 0.27).astype(float)
        brushed = fbm(H, W, 40, 43, 3) * 0.6 + 0.4 * noise2(H, W, 1.5, 44)
        steel = hexc('#2a2f37') * (0.8 + 0.35 * n_big[..., None]) + 0.04 * (n_mid[..., None] - 0.5)
        bright = hexc('#aab2bb') * (0.8 + 0.25 * brushed[..., None])
        wn = (vq - 0.3) / 0.66
        hamon = np.exp(-((wn - (0.12 + 0.03 * np.sin(uu * 80) * n_mid)) / 0.03) ** 2)[..., None] * 0.08
        c = steel * (1 - edge[..., None]) + bright * edge[..., None] + hamon * (1 - edge[..., None])
        col[b] = c[b]
        rough[b] = (0.4 + 0.18 * n_mid - 0.18 * edge)[b]
        metal[b] = 0.92
        hgt[b] = (0.15 * n_fine + 0.3 * brushed * edge)[b] * 0.3
        # ── 코등이: 놋쇠
        g = region('guard')
        brass = hexc('#c99a35') * (0.8 + 0.35 * n_mid[..., None]) + 0.06 * (n_fine[..., None] - 0.5)
        col[g] = brass[g]; rough[g] = (0.28 + 0.15 * n_mid)[g]; metal[g] = 1.0; hgt[g] = 0.1 * n_fine[g]
        # ── 손잡이: 검붉은 나무 (결이 길이 방향)
        h = region('handle')
        grain = fbm(H, W, 3, 51, 3)
        rings = 0.5 + 0.5 * np.sin(vq * 2 * np.pi * 9 + grain * 6 + uu * 30)
        wood = hexc('#3d1812') * (0.75 + 0.35 * rings[..., None]) * (0.85 + 0.3 * n_big[..., None])
        col[h] = wood[h]; rough[h] = (0.62 + 0.15 * grain)[h]; metal[h] = 0.0; hgt[h] = (0.6 * rings + 0.3 * grain)[h]
        # ── 손잡이 끝 고리(병두): 더 검은 옻칠
        f = region('ferrule')
        dark = hexc('#2a110d') * (0.8 + 0.3 * n_mid[..., None])
        col[f] = dark[f]; rough[f] = (0.5 + 0.2 * n_mid)[f]; metal[f] = 0.05; hgt[f] = 0.2 * n_fine[f]
    else:
        # ── 칼날: 어두운 은색 금속 (참고 이미지) · 날 면은 조금 밝은 은색, 모서리 쪽이 닳아 밝은 점무늬
        b = region('blade')
        edge = (vq < 0.27).astype(float)
        bv = np.clip(vq / 0.24, 0, 1)  # 날 면 안에서: 0 = 날 끝 쪽
        speck = (noise2(H, W, 1.2, 65) > 0.72).astype(float) * np.clip(fbm(H, W, 20, 66) * 1.6 - 0.4, 0, 1)
        brushed = fbm(H, W, 40, 67, 3) * 0.6 + 0.4 * noise2(H, W, 1.5, 68)
        iron = hexc('#5d6064') * (0.82 + 0.22 * n_big[..., None]) * (0.92 + 0.12 * brushed[..., None]) + 0.03 * (n_mid[..., None] - 0.5)
        bevc = hexc('#74777b') * (0.85 + 0.2 * brushed[..., None])
        wearc = speck[..., None] * hexc('#b9b7b0') * (1 - bv[..., None]) * 0.7
        line = np.exp(-((vq - 0.015) / 0.008) ** 2)[..., None] * 0.35 + np.exp(-((vq - 0.255) / 0.006) ** 2)[..., None] * 0.12
        scr = np.zeros((H, W))
        r = np.random.default_rng(7)
        for _ in range(90):
            x0 = r.uniform(bounds[names.index('flare')], 1); y0 = r.uniform(0.3, 0.96)
            ln = r.uniform(0.004, 0.025); a = r.uniform(-0.5, 0.5)
            xs = np.linspace(x0, x0 + ln * np.cos(a), 40); ys = np.clip(y0 + ln * 4 * np.sin(a) * np.linspace(0, 1, 40), 0, 0.999)
            xi = np.clip((xs * W).astype(int), 0, W - 1); yi = np.clip(((1 - ys) * H).astype(int), 0, H - 1)
            scr[yi, xi] = r.uniform(0.2, 0.45)
        c = iron * (1 - edge[..., None]) + (bevc + wearc + line * hexc('#c9c7c0')) * edge[..., None] + scr[..., None] * 0.18
        col[b] = c[b]
        rough[b] = (0.42 + 0.12 * n_mid - 0.1 * edge - 0.12 * scr)[b]
        metal[b] = (0.9 + 0.05 * edge)[b]
        hgt[b] = (0.12 * n_fine - 0.4 * scr + 0.3 * speck * edge + 0.15 * brushed)[b] * 0.4
        # ── 손잡이 · 고리 · 칼날 밑동: 감은 천 (나선 띠 · 띠 사이 그늘 · 때)
        cloth = region('wrap') | region('ring') | region('flare')
        Ls = uu * L
        k = 46.0  # 미터당 띠 수
        ph = (Ls * k + vq * 1.0 + 0.3 * n_mid) % 1.0
        band = np.sin(np.pi * ph) ** 0.6
        fiber = fbm(H, W, 1.6, 81, 2)
        dirt = np.clip(fbm(H, W, 40, 91) * 1.4 - 0.35, 0, 1)
        clothc = hexc('#c9c5ba') * (0.68 + 0.32 * band[..., None]) * (0.85 + 0.2 * fiber[..., None])
        clothc = clothc * (1 - 0.35 * dirt[..., None]) + hexc('#6b6256') * 0.35 * dirt[..., None]
        col[cloth] = clothc[cloth]
        rough[cloth] = (0.9 + 0.08 * fiber)[cloth]; metal[cloth] = 0.0
        hgt[cloth] = (band * 0.8 + 0.25 * fiber)[cloth]

    col = np.clip(col, 0, 1)
    Image.fromarray((col ** (1 / 1.0) * 255).astype(np.uint8)).save(f'{name}_color.png')
    orm = np.stack([np.ones_like(rough), np.clip(rough, 0.05, 1), np.clip(metal, 0, 1)], -1)
    Image.fromarray((orm * 255).astype(np.uint8)).resize((W // 2, H // 2), Image.BILINEAR).save(f'{name}_orm.png')
    # 높이 → 노멀 (접선 공간: u=+X, v=+Y)
    gy, gx = np.gradient(hgt)
    strength = 2.2
    nx = -gx * strength; ny = gy * strength; nz = np.ones_like(hgt)
    nl = np.sqrt(nx * nx + ny * ny + nz * nz)
    nm = np.stack([nx / nl, ny / nl, nz / nl], -1) * 0.5 + 0.5
    Image.fromarray((nm * 255).astype(np.uint8)).save(f'{name}_normal.png')


for n in sys.argv[1:]:
    run(n)
