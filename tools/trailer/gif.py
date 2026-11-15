# Cuts the gifs from the shots that session.mjs (and rec.mjs) recorded.
#   python tools/trailer/gif.py <work dir> itch|reddit <out.gif> [width height [fps [colours]]]
# <work dir> holds frames/<shot>/0000.jpg... and (for reddit) cards/<name>.png from gifcards.mjs.
import os, sys, glob, subprocess, shutil
import numpy as np, cv2

WORK, KIND, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else ((315, 250) if KIND == 'itch' else (480, 270))
FPS = int(sys.argv[6]) if len(sys.argv) > 6 else 12
COLOURS = int(sys.argv[7]) if len(sys.argv) > 7 else 128

_c = {}
def frames(name, every=1):
    if name not in _c:
        fs = sorted(glob.glob(os.path.join(WORK, 'frames', name, '*.jpg')))[::every]
        if not fs: raise SystemExit('no frames for ' + name)
        _c[name] = [cv2.imread(f) for f in fs]
    return _c[name]
def card(name):
    im = cv2.imread(os.path.join(WORK, 'cards', name + '.png'), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
    if im.shape[2] == 3: im = np.dstack([im, np.ones(im.shape[:2], np.float32)])
    return cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)
DOCS = os.path.join(os.path.dirname(__file__), '..', '..', 'docs')
def still(name, n, z0, z1, c0, c1):
    """n frames of a picture from docs/, the camera pushing in (zoom z0 to z1) and across (centre c0 to c1)."""
    key = 'still:' + name
    if key not in _c: _c[key] = cv2.imread(os.path.join(DOCS, name + '.jpg'))
    img = _c[key]; ih, iw = img.shape[:2]; res = []
    for i in range(n):
        k = i / max(1, n - 1); z = z0 + (z1 - z0) * k; cx = c0[0] + (c1[0] - c0[0]) * k; cy = c0[1] + (c1[1] - c0[1]) * k
        s = max(W / iw, H / ih) * z
        cx = min(max(cx, W / 2 / (s * iw)), 1 - W / 2 / (s * iw)); cy = min(max(cy, H / 2 / (s * ih)), 1 - H / 2 / (s * ih))
        M = np.float32([[s, 0, W / 2 - s * cx * iw], [0, s, H / 2 - s * cy * ih]])
        small = cv2.resize(img, None, fx=max(s * 1.5, 0.2), fy=max(s * 1.5, 0.2), interpolation=cv2.INTER_AREA) if s < 0.6 else img
        k2 = small.shape[1] / iw
        M2 = np.float32([[s / k2, 0, M[0, 2]], [0, s / k2, M[1, 2]]])
        res.append(cv2.warpAffine(small, M2, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT))
    return res
def fit(img):
    """The middle of the picture, as much of it as fills the frame."""
    ih, iw = img.shape[:2]
    s = max(W / iw, H / ih)
    w, h = round(W / s), round(H / s)
    x, y = (iw - w) // 2, (ih - h) // 2
    return cv2.resize(img[y:y + h, x:x + w], (W, H), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)

# (shot, first frame, how many, the words over it); or, for a picture: ('still', name, how many, words, zoom from, to, centre from, to)
CUT = [
    ('still', 'elf-view', 12, 'mammoth', 1.0, 1.25, (0.5, 0.5), (0.52, 0.45)), ('play-walk', 0, 12, 'elf'), ('snip', 0, 18, None), ('play-mow', 5, 11, 'tools'), ('play-gnorman', 0, 10, None),
    ('play-mow', 13, 13, None), ('play-vacuum', 0, 10, None), ('raid-charge', 0, 12, 'ideas'), ('play-ladder', 0, 11, None), ('play-ladder', 11, 11, None),
    ('play-jet', 0, 12, None), ('play-mow2', 0, 10, None), ('still', 'lemmings-off', 10, None, 1.25, 1.5, (0.45, 0.6), (0.5, 0.62)), ('raid-standoff', 0, 12, None), ('play-jet', 12, 12, None),
    ('still', 'pink', 12, None, 1.05, 1.3, (0.45, 0.5), (0.4, 0.45)), ('play-mortimer', 0, 10, None), ('play-vacuum', 10, 10, None), ('still', 'the-elf', 10, None, 1.3, 1.6, (0.2, 0.42), (0.19, 0.4)), ('play-mow2', 10, 10, None),
    ('raid-sorry', 0, 12, None), ('still', 'thong', 18, None, 1.15, 1.5, (0.5, 0.42), (0.47, 0.55)), ('still', 'cut-hair', 10, None, 1.1, 1.35, (0.5, 0.5), (0.5, 0.45)), ('raid-charge', 12, 6, None), ('play-walk', 12, 6, None),
    ('still', 'under-the-coat', 8, None, 1.1, 1.3, (0.5, 0.5), (0.55, 0.45)), ('still', 'tattoo', 8, None, 1.2, 1.5, (0.55, 0.45), (0.55, 0.42)), ('play-gnorman', 10, 6, None), ('still', 'lemmings-at-work', 8, None, 1.1, 1.3, (0.5, 0.55), (0.5, 0.6)),
    ('raid-standoff', 12, 4, None), ('play-mortimer', 10, 4, None), ('still', 'into-the-sun', 14, None, 1.0, 1.2, (0.45, 0.5), (0.42, 0.5)),
]
if KIND == 'reddit':
    # shorter, with a few words and the name at the end
    CUT = CUT[:22]
out = []
for shot in CUT:
    if shot[0] == 'still':
        _, name, n, words, z0, z1, c0, c1 = shot
        got = still(name, n, z0, z1, c0, c1)
    else:
        name, a, n, words = shot
        fr = frames(name, 2 if name == 'snip' else 1)          # (the trailer's shot was taken at 24 a second)
        got = [fit(f) for f in fr[a:a + n]]
    c = card(words) if (words and KIND == 'reddit') else None
    for f in got:
        f = f.astype(np.float32)
        if c is not None: f = f * (1 - c[..., 3:4]) + c[..., :3] * 255 * c[..., 3:4]
        out.append(np.clip(f, 0, 255).astype(np.uint8))
if KIND == 'itch':
    while len(out) < 30 * 12: out.append(out[len(out) - 30 * 12])          # (to the half minute, with the start again)
    out = out[:30 * 12]
else:
    t = card('title'); end = (t[..., :3] * 255 * t[..., 3:4] + np.float32([10, 12, 15]) * (1 - t[..., 3:4])).astype(np.uint8)
    out += [end] * round(1.8 * 12)
SHOT = 12                                   # (the shots were taken at 12 a second: fewer a second means leaving some out)
if FPS != SHOT: out = [out[min(len(out) - 1, round(i * SHOT / FPS))] for i in range(round(len(out) * FPS / SHOT))]
tmp = os.path.join(WORK, 'gif-' + KIND)
shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
for i, f in enumerate(out): cv2.imwrite(os.path.join(tmp, f'{i:04d}.png'), f)
dither = os.environ.get('DITHER') or ('bayer:bayer_scale=4' if COLOURS >= 128 else 'bayer:bayer_scale=5')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(tmp, '%04d.png'),
                '-vf', f'split[a][b];[a]palettegen=max_colors={COLOURS}:stats_mode=full[p];[b][p]paletteuse=dither={dither}:diff_mode=rectangle', '-loop', '0', OUT], check=True)
print(f'{OUT}: {len(out)} frames, {len(out) / FPS:.1f} s, {W}x{H}, {os.path.getsize(OUT) / 1e6:.1f} MB')
