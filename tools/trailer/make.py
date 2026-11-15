# Cuts the trailer together: the shots recorded by rec.mjs, the stills in docs/, the lettering drawn by cards.mjs,
# and a soundtrack made here from nothing (drums, a horn, a choir of sawtooth waves, a very small pair of scissors).
#   python tools/trailer/make.py <work dir> <out.mp4>          (needs numpy, scipy, opencv; and ffmpeg)
# <work dir> holds frames/<shot>/0000.jpg..., cards/<name>.png and stills/<name>.png.
import os, sys, glob, subprocess
import numpy as np, cv2
from scipy import signal

WORK, OUT = sys.argv[1], sys.argv[2]
DOCS = os.path.join(os.path.dirname(__file__), '..', '..', 'docs')
W, H, FPS, SR = 1280, 720, 24, 48000
BAR = (H - round(W / 2.39)) // 2            # the black bands above and below the picture
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- pictures
_cache = {}
def image(name):
    if name not in _cache:
        for p in (os.path.join(WORK, 'stills', name + '.png'), os.path.join(DOCS, name + '.jpg')):
            if os.path.exists(p): _cache[name] = cv2.imread(p); break
        else: raise SystemExit('no picture called ' + name)
    return _cache[name]
def frames(name):
    if name not in _cache:
        _cache[name] = [cv2.imread(f) for f in sorted(glob.glob(os.path.join(WORK, 'frames', name, '*.jpg')))]
        if not _cache[name]: raise SystemExit('no frames for ' + name)
    return _cache[name]
def lettering(name):
    key = 'card:' + name
    if key not in _cache:
        im = cv2.imread(os.path.join(WORK, 'cards', name + '.png'), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
        im[..., :3] *= im[..., 3:4]          # (premultiplied, so that it can be scaled and laid on)
        _cache[key] = im
    return _cache[key]

ease = lambda x: x * x * (3 - 2 * x)
def framed(img, zoom=1.0, cx=0.5, cy=0.5, shake=(0, 0)):
    """The picture filling the frame: zoom 1 just covers it; (cx, cy) is the part of it in the middle."""
    ih, iw = img.shape[:2]
    s = max(W / iw, H / ih) * zoom
    cx = min(max(cx, W / 2 / (s * iw)), 1 - W / 2 / (s * iw)); cy = min(max(cy, H / 2 / (s * ih)), 1 - H / 2 / (s * ih))
    M = np.float32([[s, 0, W / 2 - s * cx * iw + shake[0]], [0, s, H / 2 - s * cy * ih + shake[1]]])
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_AREA if s < 0.75 else cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
def graded(img):
    """A little colder and harder than the game: this is a serious film."""
    f = img.astype(np.float32)
    grey = f.mean(axis=2, keepdims=True)
    f = grey + (f - grey) * 0.86
    f = (f - 118) * 1.12 + 112
    f[..., 0] += 5; f[..., 2] -= 3           # (blue up, red down, a touch)
    return f
def lay(frame, card, alpha=1.0, zoom=1.0):
    c = card
    if zoom != 1.0:
        M = np.float32([[zoom, 0, W / 2 * (1 - zoom)], [0, zoom, H / 2 * (1 - zoom)]])
        c = cv2.warpAffine(card, M, (W, H), flags=cv2.INTER_LINEAR)
    a = c[..., 3:4] * alpha
    return frame * (1 - a) + c[..., :3] * 255 * alpha     # (the card is BGRA already: cv2 read it so)

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
VIGNETTE = (1 - 0.42 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) ** 1.2).clip(0.3, 1)[..., None]
NIGHT = np.zeros((H, W, 3), np.float32) + np.float32([9, 10, 13])

# ---------------------------------------------------------------- the cut
# Each piece: (kind, name, frames, options). Kinds: black, card, still, clip.
# Options: fi/fo (fade in/out, frames), z (zoom from, to), c (centre from, to), snd (sounds, each (what, at frame, loudness)),
# over (a card laid on a picture: name, from frame), flash, shake, speed.
F = lambda seconds: round(seconds * FPS)
MONTAGE = [('gnorman', 24, (0.5, 0.52)), ('mortimer', 24, (0.42, 0.45)), ('you-got-clippers', 18, (0.5, 0.5)), ('ladder', 18, (0.5, 0.5)),
           ('electric-shears', 18, (0.5, 0.55)), ('lemmings-off', 12, (0.5, 0.6)), ('under-the-coat', 12, (0.5, 0.5)), ('tattoo', 12, (0.55, 0.45)),
           ('pink', 12, (0.45, 0.5)), ('cavemen-rude', 12, (0.5, 0.55)), ('small-scissors', 6, (0.5, 0.6)), ('in-hand', 6, (0.5, 0.6)),
           ('broom', 6, (0.5, 0.6)), ('coat-close-up', 6, (0.5, 0.5)), ('shears', 6, (0.5, 0.6)), ('cut-hair', 6, (0.5, 0.5))]
CUT = [
    ('black', None, F(0.5), {}),
    ('card', 'years', F(2.75), dict(fi=12, fo=9, snd=[('boom', 0, 0.9)])),
    ('still', 'land', F(4.25), dict(fi=16, z=(1.0, 1.12), c=((0.5, 0.5), (0.54, 0.47)), snd=[('choir', 0, 0.5, 4.6)])),
    ('card', 'ice', F(2.0), dict(fi=5, fo=6, snd=[('boom', 0, 1.0)])),
    ('still', 'into-the-sun', F(2.5), dict(z=(1.0, 1.1), c=((0.45, 0.5), (0.42, 0.52)))),
    ('card', 'spears', F(2.0), dict(fi=5, fo=6, snd=[('boom', 0, 1.0)])),
    ('clip', 'charge', F(1.5), dict(snd=[('hit', 0, 0.9), ('hit', 9, 0.6), ('hit', 18, 0.7), ('hit', 27, 0.6)], shake=3)),
    ('still', 'cavemen-standoff', F(1.5), dict(z=(1.08, 1.16), c=((0.5, 0.5), (0.52, 0.5)), snd=[('hit', 0, 1.0)], flash=0.3)),
    ('card', 'nothing', F(2.5), dict(fi=6, fo=6, snd=[('boom', 0, 0.8), ('ticks', 0, 0.5, 5.2), ('strings', 0, 0.5, 5.4)])),
    ('still', 'elf-view', F(2.75), dict(z=(1.0, 1.32), c=((0.5, 0.5), (0.6, 0.42)), snd=[('riser', 0, 0.7, 2.75)])),
    ('card', 'haircut', F(2.75), dict(fo=8, snd=[('braam', 0, 1.0)], flash=0.5)),
    ('still', 'the-elf', F(2.0), dict(z=(1.25, 1.4), c=((0.2, 0.42), (0.19, 0.4)), snd=[('hit', 0, 0.9)], flash=0.25)),
    ('card', 'elf', F(1.25), dict(fo=3, snd=[('boom', 0, 0.8)])),
    ('card', 'tall', F(1.5), dict(fo=3, snd=[('boom', 0, 0.8)])),
    ('still', 'lookout', F(1.75), dict(z=(1.0, 1.08), c=((0.5, 0.55), (0.5, 0.6)), snd=[('hit', 0, 0.8)])),
    ('card', 'scissors', F(2.0), dict(fo=3, snd=[('boom', 0, 0.9)])),
    ('clip', 'snip', F(1.75), dict(snd=[('snip', 3, 0.8), ('snip', 12, 0.8), ('snip', 21, 0.8), ('snip', 30, 0.8), ('snip', 39, 0.8)])),
    ('card', 'excuse', F(2.5), dict(fi=4, fo=5)),
] + [
    ('still', n, d, dict(z=(1.04, 1.04 + 0.004 * d), c=(c, c), snd=[('hit', 0, 0.55 + 0.03 * i)] + ([('riser', 0, 0.8, 8.25), ('ostinato', 0, 0.6, 8.25)] if i == 0 else []), flash=0.18, shake=1.5))
    for i, (n, d, c) in enumerate(MONTAGE)
] + [
    ('card', 'every', 12, dict(snd=[('hit', 0, 1.0), ('boom', 0, 0.7)], zc=(1.0, 1.04))),
    ('card', 'last', 12, dict(snd=[('hit', 0, 1.0), ('boom', 0, 0.8)], zc=(1.0, 1.04))),
    ('card', 'hair', 18, dict(snd=[('hit', 0, 1.0), ('boom', 0, 1.0)], zc=(1.0, 1.05), flash=0.35)),
    ('black', None, F(1.25), {}),          # (silence, and one small snip: see soundtrack())
    ('card', 'title', F(4.5), dict(fo=14, snd=[('braam', 0, 1.0), ('boom', 0, 1.0), ('choir', 2, 0.9, 4.8)], zc=(1.0, 1.07), flash=0.6)),
    ('card', 'now', F(3.0), dict(fi=8, fo=10, snd=[('boom', 0, 0.7)])),
    ('still', 'thong', F(3.75), dict(z=(1.06, 1.14), c=((0.55, 0.45), (0.58, 0.43)), over=('look', 22), snd=[('hit', 0, 0.9), ('snip', 26, 0.45)], fo=6)),
    ('black', None, F(0.75), {}),
]
TOTAL = sum(p[2] for p in CUT)
print(f'{TOTAL / FPS:.1f} s, {TOTAL} frames, {len(CUT)} pieces')

def picture(kind, name, i, n, o, at):
    """Frame i of n of one piece (at: its number in the whole film, for what trembles)."""
    k = i / max(1, n - 1)
    sh = o.get('shake', 0)
    shake = (sh * np.sin(at * 2.1) * np.exp(-i / 9), sh * np.cos(at * 2.9) * np.exp(-i / 9)) if sh else (0, 0)
    if kind == 'black':
        f = NIGHT.copy()
    elif kind == 'card':
        z0, z1 = o.get('zc', (1.0, 1.035))
        a = min(1, (i + 1) / o['fi']) if o.get('fi') else 1.0
        if o.get('fo'): a *= min(1, (n - i) / o['fo'])
        f = lay(NIGHT.copy(), lettering(name), ease(a), z0 + (z1 - z0) * k)
    else:
        if kind == 'still':
            (z0, z1), (c0, c1) = o.get('z', (1.0, 1.06)), o.get('c', ((0.5, 0.5), (0.5, 0.5)))
            f = framed(image(name), z0 + (z1 - z0) * k, c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, shake)
        else:
            fr = frames(name)
            x = k * (len(fr) - 1) if o.get('speed', 1) is None else min(len(fr) - 1, i * o.get('speed', 1))   # (speed None: stretched to fit)
            a, b = int(np.floor(x)), min(len(fr) - 1, int(np.floor(x)) + 1)
            f = framed(cv2.addWeighted(fr[a], 1 - (x - a), fr[b], x - a, 0), 1.02, shake=shake)
        f = graded(f) * VIGNETTE
        f[:BAR] = NIGHT[:BAR]; f[H - BAR:] = NIGHT[H - BAR:]
        if o.get('over') and i >= o['over'][1]:
            f = lay(f, lettering(o['over'][0]), ease(min(1, (i - o['over'][1] + 1) / 6)))
        a = min(1, (i + 1) / o['fi']) if o.get('fi') else 1.0
        if o.get('fo'): a *= min(1, (n - i) / o['fo'])
        if a < 1: f = NIGHT + (f - NIGHT) * ease(a)
    if o.get('flash') and i < 6: f = f + 255 * o['flash'] * np.exp(-i / 1.4)
    return f

# ---------------------------------------------------------------- sound
def tone(n): return np.arange(n) / SR
def lowpass(x, hz, order=2): return signal.sosfilt(signal.butter(order, hz, 'low', fs=SR, output='sos'), x)
def highpass(x, hz, order=2): return signal.sosfilt(signal.butter(order, hz, 'high', fs=SR, output='sos'), x)
def bandpass(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)
def noise(n): return rng.standard_normal(n)
def sweep(f0, f1, tau, t): return 2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t / tau)) / SR

def boom(dur=3.2):
    t = tone(int(dur * SR))
    body = np.tanh(2.6 * np.sin(sweep(96, 31, 0.16, t))) * (0.25 + 0.75 * np.exp(-t / 0.25)) * np.exp(-t / 1.1)
    skin = signal.sawtooth(sweep(190, 58, 0.07, t), 0.5) * np.exp(-t / 0.07) * 0.45
    air = lowpass(noise(len(t)), 260) * np.exp(-t / 0.5) * 0.9
    return body + skin + air
def hit(dur=0.9):
    t = tone(int(dur * SR))
    return np.sin(sweep(150, 52, 0.05, t)) * np.exp(-t / 0.2) + lowpass(noise(len(t)), 900) * np.exp(-t / 0.05) * 0.8 + bandpass(noise(len(t)), 2000, 5000) * np.exp(-t / 0.012) * 0.25
def braam(dur=5.0, root=36.71):
    t = tone(int(dur * SR)); x = np.zeros(len(t))
    for mult, amp in ((1, 1.0), (2, 0.9), (3, 0.55), (4, 0.5), (6, 0.25), (1.5, 0.3)):
        for det in (-0.007, 0.0, 0.006, 0.011):
            x += amp * signal.sawtooth(2 * np.pi * root * mult * (1 + det) * t + rng.uniform(0, 6.28))
    swell = (1 - np.exp(-t / 0.035)) * (0.35 + 0.65 * np.exp(-t / 1.3)) * np.exp(-t / 2.4)
    bright = lowpass(x, 2600) * np.exp(-t / 0.7) + lowpass(x, 700) * 0.9 + lowpass(x, 180) * 1.4
    growl = 1 + 0.25 * np.sin(2 * np.pi * 27 * t) * np.exp(-t / 1.5)
    return np.tanh(0.5 * bright * swell * growl) + boom(dur)[:len(t)] * 0.6
def choir(dur, notes=(146.83, 174.61, 220.0, 293.66, 110.0, 73.42)):
    t = tone(int(dur * SR)); x = np.zeros(len(t))
    for f in notes:
        for v in range(4):
            vib = 1 + 0.004 * np.sin(2 * np.pi * (4.6 + 0.5 * v) * t + rng.uniform(0, 6.28))
            x += signal.sawtooth(2 * np.pi * np.cumsum(f * (1 + 0.004 * (v - 1.5)) * vib) / SR + rng.uniform(0, 6.28)) * (0.5 if f < 100 else 1)
    ah = bandpass(x, 520, 760) + 0.7 * bandpass(x, 980, 1250) + 0.3 * bandpass(x, 2300, 2900) + 0.25 * lowpass(x, 300)
    env = np.minimum(1, t / 1.3) ** 1.5 * np.minimum(1, (dur - t) / 1.4).clip(0)
    return ah * env * 0.12
def strings(dur):
    t = tone(int(dur * SR)); x = np.zeros(len(t))
    for f in (587.33, 622.25, 1174.66, 293.66):
        for v in range(3): x += signal.sawtooth(2 * np.pi * f * (1 + 0.003 * (v - 1)) * t + rng.uniform(0, 6.28))
    trem = 0.6 + 0.4 * signal.sawtooth(2 * np.pi * 11 * t, 0.5)
    return lowpass(highpass(x, 250), 3800) * trem * (t / dur) ** 1.6 * 0.07
def riser(dur):
    t = tone(int(dur * SR)); k = t / dur
    return (bandpass(noise(len(t)), 300, 6000) * 0.35 * k ** 2.5 + np.sin(2 * np.pi * np.cumsum(70 * (14 ** k)) / SR) * 0.22 * k ** 2
            + np.sin(2 * np.pi * np.cumsum(46 * (9 ** k)) / SR) * 0.3 * k ** 1.5)
def ticks(dur):
    x = np.zeros(int(dur * SR)); t = tone(int(0.12 * SR))
    for j in range(int(dur / 0.5)):
        f = 1900 if j % 2 == 0 else 1500
        tick = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012) + bandpass(noise(len(t)), 3000, 8000) * np.exp(-t / 0.003)) * (0.5 + 0.5 * j / (dur / 0.5))
        at = int(j * 0.5 * SR); x[at:at + len(t)] += tick[:len(x) - at]
    return x * 0.5
def ostinato(dur, step=0.25):
    x = np.zeros(int(dur * SR)); t = tone(int(step * SR))
    pattern = (73.42, 73.42, 87.31, 73.42, 73.42, 73.42, 110.0, 98.0)
    for j in range(int(dur / (step / 2))):
        f = pattern[j % len(pattern)]
        note = lowpass(signal.sawtooth(2 * np.pi * f * t[:len(t) // 2]) + signal.sawtooth(2 * np.pi * f * 2.005 * t[:len(t) // 2]) * 0.6, 1500) * np.exp(-t[:len(t) // 2] / 0.05)
        at = int(j * step / 2 * SR); x[at:at + len(note)] += note[:len(x) - at] * (0.25 + 0.75 * (at / len(x)) ** 1.3) * (1.0 if j % 2 == 0 else 0.6)
    return x * 0.5
def snip(dur=0.5):
    t = tone(int(dur * SR)); x = np.zeros(len(t))
    for at, f in ((0.0, 1.0), (0.085, 0.86)):
        s = np.maximum(0, t - at); on = (t >= at)
        x += on * (bandpass(noise(len(t)), 2600, 9000) * np.exp(-s / 0.006) * 1.2 + (np.sin(2 * np.pi * 3150 * f * s) + 0.6 * np.sin(2 * np.pi * 4720 * f * s) + 0.4 * np.sin(2 * np.pi * 6890 * f * s)) * np.exp(-s / 0.03) * 0.5)
    return x * 0.6
def drone(dur):
    t = tone(int(dur * SR))
    return (np.sin(2 * np.pi * 36.71 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.09 * t)) + 0.5 * np.sin(2 * np.pi * 55.2 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.13 * t + 1)) + lowpass(noise(len(t)), 140) * 1.2) * 0.1

def soundtrack():
    n = int(TOTAL / FPS * SR) + SR
    dry, wet = np.zeros((n, 2)), np.zeros((n, 2))
    def put(x, at, gain, pan=0.0, send=0.3):
        a = int(at * SR); x = x[:n - a] * gain
        l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
        dry[a:a + len(x), 0] += x * l * 1.41; dry[a:a + len(x), 1] += x * r * 1.41
        wet[a:a + len(x), 0] += x * send; wet[a:a + len(x), 1] += x * send
    made = dict(boom=boom(), hit=hit(), braam=braam(), snip=snip())
    at = 0; marks = {}
    for kind, name, frames_, o in CUT:
        marks[name] = at / FPS
        for s in o.get('snd', []):
            what, f, g = s[0], s[1], s[2]
            when = (at + f) / FPS
            if what in made: put(made[what], when, g * dict(boom=0.85, hit=0.75, braam=0.95, snip=0.9)[what], pan=rng.uniform(-0.25, 0.25) if what == 'hit' else 0, send=dict(boom=0.35, hit=0.3, braam=0.45, snip=0.5)[what])
            elif what == 'choir': put(choir(s[3]), when, g, send=0.6)
            elif what == 'strings': put(strings(s[3]), when, g, send=0.4)
            elif what == 'riser': put(riser(s[3]), when, g, send=0.2)
            elif what == 'ticks': put(ticks(s[3]), when, g, pan=0.15, send=0.25)
            elif what == 'ostinato': put(ostinato(s[3]), when, g, send=0.2)
        at += frames_
    # a low drone under everything up to the title's silence, and again, quieter, under the end
    hush = marks['title'] - 1.25
    d = drone(hush); d *= np.minimum(1, tone(len(d)) / 2.0) * np.minimum(1, (hush - tone(len(d))) / 0.15).clip(0)
    put(d, 0, 1.0, send=0.1)
    d2 = drone(TOTAL / FPS - marks['now']); d2 *= np.minimum(1, tone(len(d2)) / 1.0) * np.minimum(1, (len(d2) / SR - tone(len(d2))) / 1.5).clip(0)
    put(d2, marks['now'], 0.7, send=0.1)
    # a hall for it all to happen in
    t = tone(int(2.8 * SR)); out = dry.copy()
    for ch in range(2):
        ir = lowpass(noise(len(t)), 5200) * np.exp(-t / 0.75) * (t > 0.012 + 0.004 * ch)
        out[:, ch] += signal.fftconvolve(wet[:, ch], ir / np.sqrt((ir ** 2).sum()), mode='full')[:n] * 0.55
    # nothing at all in the moment before the title, bar the scissors
    a, b = int(hush * SR), int(marks['title'] * SR)
    gate = np.ones(n); gate[a:b] = 0.0; gate[a:a + 4800] = np.linspace(1, 0, 4800)
    sn = np.zeros(n); x = snip(); w = int((marks['title'] - 1.25 + 16 / FPS) * SR); sn[w:w + len(x)] = x * 0.5
    out = out * gate[:, None] + sn[:, None]
    out = np.tanh(out * 1.15)
    out *= 0.92 / np.abs(out).max()
    return out

# ---------------------------------------------------------------- out
if __name__ == '__main__':
    only = os.environ.get('ONLY')            # ONLY=sheet: a contact sheet of the cut, and nothing else
    audio = soundtrack()
    wav = os.path.join(WORK, 'soundtrack.wav')
    from scipy.io import wavfile
    wavfile.write(wav, SR, (audio * 32767).astype(np.int16))
    grain = lambda: cv2.resize(rng.standard_normal((H // 2, W // 2, 1)).astype(np.float32), (W, H))[..., None] * 2.4
    if only == 'sound':
        for sec in range(0, len(audio) // SR):
            seg = audio[sec * SR:(sec + 1) * SR]; print(f'{sec:3d} s  rms {np.sqrt((seg ** 2).mean()):.3f}  peak {np.abs(seg).max():.2f}  ' + '#' * int(60 * np.sqrt((seg ** 2).mean())))
        sys.exit()
    if only == 'sheet':
        thumbs = []; at = 0
        for kind, name, n, o in CUT:
            for i in ({0, n // 2} if n > 12 else {n // 2}): thumbs.append(cv2.resize(np.clip(picture(kind, name, i, n, o, at + i), 0, 255).astype(np.uint8), (320, 180)))
            at += n
        rows = [np.hstack(thumbs[r:r + 6] + [np.zeros((180, 320, 3), np.uint8)] * (6 - len(thumbs[r:r + 6]))) for r in range(0, len(thumbs), 6)]
        cv2.imwrite(OUT, np.vstack(rows)); print('sheet', OUT); sys.exit()
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', wav,
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
    at = 0
    for kind, name, n, o in CUT:
        for i in range(n):
            f = picture(kind, name, i, n, o, at) + grain()
            ff.stdin.write(np.clip(f, 0, 255).astype(np.uint8).tobytes()); at += 1
    ff.stdin.close(); ff.wait()
    print('made', OUT, f'{os.path.getsize(OUT) / 1e6:.1f} MB')
