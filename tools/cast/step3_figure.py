"""Step 3: the lighter mesh as the game wants a figure, and its pictures put right.

What each part of him is made of (by its colour and where it is); bones, and how far each point goes with each; how
thin he is at each point of his skin; room made for real eyes; a map of how far every point of the space round his
head and chest is from him, so that hair grown in the game keeps out of him; and the colour picture cleaned of the
light he was painted in. Written as one squeezed file of numbers and three pictures (see src/game/people/cast.js).

   python step3_figure.py <folder with low.blend and base, normal, rough and ao pictures> <out folder>
   e.g. python tools/cast/step3_figure.py tools/cast/gnorman/low src/game/people/casts/gnorman"""
import sys, json, struct, pathlib, time, numpy as np, bpy, cv2
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import common as C, gnorman as G, texspace as T
folder, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
t0 = time.time()
bpy.ops.wm.open_mainfile(filepath=str(folder / 'low.blend'))
low = bpy.data.objects['low']; me = low.data
me.calc_loop_triangles()
cb = C.points(low)
P = np.stack([cb[:, 0], cb[:, 2], -cb[:, 1]], 1).astype(np.float64)        # the game's axes
nv = len(P); x, y, z = P[:, 0].copy(), P[:, 1].copy(), P[:, 2].copy()
uvl = np.empty(len(me.loops) * 2, dtype=np.float32); me.uv_layers[0].data.foreach_get('uv', uvl); uvl = uvl.reshape(-1, 2)
lv = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get('vertex_index', lv)
tl = np.empty(len(me.loop_triangles) * 3, dtype=np.int32); me.loop_triangles.foreach_get('loops', tl); tl = tl.reshape(-1, 3)
edges = np.empty(len(me.edges) * 2, dtype=np.int32); me.edges.foreach_get('vertices', edges); edges = edges.reshape(-1, 2)

def picture(name, colour=True):
    path = next(p for p in (folder / (name + ext) for ext in ('.png', '.jpg')) if p.exists())
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if im.ndim == 3: im = cv2.cvtColor(im, cv2.COLOR_BGR2RGB)
    return im.astype(np.float32) / (65535 if im.dtype == np.uint16 else 255)

def at_loops(im):
    s = im.shape[0]
    px = np.clip((uvl[:, 0] * s).astype(int), 0, s - 1); py = np.clip(((1 - uvl[:, 1]) * s).astype(int), 0, s - 1)
    return im[py, px]

def at_points(im):
    v = at_loops(im if im.ndim == 3 else im[:, :, None])
    o = np.zeros((nv, v.shape[1]), np.float32); c = np.zeros(nv, np.float32)
    np.add.at(o, lv, v); np.add.at(c, lv, 1); return o / np.maximum(c, 1)[:, None]

def spread(v, times=1, keep=0.5):
    """Each point's value moved towards the average of its neighbours'."""
    v = np.asarray(v, np.float32)
    for _ in range(times):
        s = np.zeros_like(v); c = np.zeros(nv, np.float32)
        np.add.at(s, edges[:, 0], v[edges[:, 1]]); np.add.at(s, edges[:, 1], v[edges[:, 0]]); np.add.at(c, edges[:, 0], 1); np.add.at(c, edges[:, 1], 1)
        v = keep * v + (1 - keep) * s / np.maximum(c, 1).reshape((-1,) + (1,) * (v.ndim - 1))
    return v

def smooth(v, a, b): t = np.clip((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def band(v, a, b): return (v >= a) & (v < b)

# ---- what each part of him is made of ----
base = picture('base')
col = at_points(cv2.GaussianBlur(base, (0, 0), 2.0))
hsv = cv2.cvtColor(col.reshape(-1, 1, 3), cv2.COLOR_RGB2HSV).reshape(-1, 3); hue, sat, val = hsv.T
REGIONS = ['skin', 'knit', 'felt', 'leather', 'cloth', 'foam', 'hair', 'metal']
R = {n: i for i, n in enumerate(REGIONS)}
blue = band(hue, 195, 265) & (sat > 0.35)
reddish = (hue < 30) | (hue > 335)
pale = (sat < 0.26) & (val > 0.28)                    # cream wool and grey hair alike: where it is decides which
pink = reddish & band(sat, 0.2, 0.62) & (val > 0.4)
ax = np.abs(x)
# his raised arm and the foam hand on it; his other arm and its fist
armL = (x > 0.066) & (y > 0.165) & ((x - 0.066) * 1.6 + (y - 0.165) > 0.05) & ~((y > 0.222) & (y < 0.256) & (x < 0.1) & pale & (z < 0.03))
foam = (x > 0.058) & (y > 0.232) & blue
armR = (x < -0.07) & (y < 0.2) & (y > 0.06) & ((-x - 0.07) * 1.2 + (0.2 - y) * 0.5 > 0.012)
fist = (x < -0.084) & (y < 0.106) & (y > 0.06)
label = np.full(nv, R['knit'])
label[y < 0.064] = R['leather']                                                # boots
label[band(y, 0.05, 0.1) & blue & (ax < 0.1)] = R['cloth']                    # trousers
label[band(y, 0.084, 0.118) & (val < 0.3) & ~blue & ~fist] = R['leather']     # belt
label[band(y, 0.084, 0.116) & band(hue, 34, 66) & (sat > 0.42) & (val > 0.33) & (z > 0.05) & (ax < 0.02)] = R['metal']
# the beard: pale, on his front, inside the outline a beard has (wide at the chin, a point at the belt)
half = 0.016 + 0.064 * smooth(y, 0.112, 0.19)
label[band(y, 0.108, 0.222) & pale & (z > 0.012) & (ax < half + 0.012) & ~armL & ~armR] = R['hair']
# the head: above the collar, and neither arm
head = (y > 0.196) & ~armL & ~foam & ~armR
label[head & pale] = R['hair']
label[head & (pink | (reddish & (sat < 0.5)) | ((val < 0.45) & (z > 0.02) & (y < 0.252)))] = R['skin']
label[head & pale & (sat < 0.2)] = R['hair']
# (his eyes are painted on: skin, for now, and real ones will stand in front of them)
for s in (1, -1):
    label[(np.hypot(x - s * G.EYE[0], y - G.EYE[1]) < G.EYE_R * 1.25) & (z > 0.02) & head] = R['skin']
label[(np.hypot(x - G.NOSE[0], y - G.NOSE[1]) < 0.024) & (z > 0.05)] = R['skin']
label[head & reddish & (sat > 0.5) & (y > 0.238) & ~((z > 0.03) & (y < 0.25) & (ax < 0.04))] = R['felt']
label[(y > 0.268) & ~armL & ~foam] = R['felt']
label[fist & (pink | (val > 0.5))] = R['skin']
label[foam] = R['foam']
label[(x > 0.06) & (y > 0.244) & ~(label == R['felt']) & ((x - 0.06) + (y - 0.244) * 0.6 > 0.012)] = R['foam']
for it in range(5):                                   # specks go, edges stay
    votes = np.zeros((nv, len(REGIONS)), np.float32); votes[np.arange(nv), label] += 1.5
    np.add.at(votes, (edges[:, 0], label[edges[:, 1]]), 1); np.add.at(votes, (edges[:, 1], label[edges[:, 0]]), 1)
    metal = label == R['metal']; label = votes.argmax(1); label[metal] = R['metal']
print({n: int((label == i).sum()) for i, n in enumerate(REGIONS)})
onehot = np.zeros((nv, len(REGIONS)), np.float32); onehot[np.arange(nv), label] = 1
soft = spread(onehot, 1, 0.5); soft /= soft.sum(1, keepdims=True)

# ---- room for his eyes: what is painted there is pushed back out of the way of the real ones ----
for s in (1, -1):
    d = np.hypot(x - s * G.EYE[0], y - G.EYE[1])
    m = (d < G.EYE_R * 0.93) & (z > G.EYE[2] - 0.004) & head
    z[m] = np.minimum(z[m], G.EYE[2] - 0.0045 - 0.004 * (1 - d[m] / G.EYE_R))
P[:, 2] = z
print('pushed back for the eyes:', int(((P[:, 2] != -cb[:, 1]) ).sum()), 'points')

# ---- bones, and how far each point goes with each ----
B = {b['name']: i for i, b in enumerate(G.BONES)}; at = {b['name']: np.array(b['at']) for b in G.BONES}
W = np.zeros((nv, len(G.BONES)), np.float32)
W[:, B['torso']] = smooth(y, 0.066, 0.096)
W[:, B['hips']] = 1 - W[:, B['torso']]
def claim(bone, w):
    w = np.clip(w, 0, 1).astype(np.float32); W[:] *= (1 - w)[:, None]; W[:, B[bone]] += w
# the head, turning in its collar: all of it above the collar; of the beard, more the nearer the chin
is_hair = soft[:, R['hair']]
front_beard = is_hair * (z > 0.0) * (y < 0.215)
w_head = np.where(head | (label == R['hair']), smooth(y, 0.186, 0.212), 0.0)
w_head = np.maximum(w_head, front_beard * smooth(y, 0.118, 0.205) * 0.96)
w_head[armL | foam | armR] = 0
claim('head', spread(w_head, 2, 0.4))
claim('hat2', np.where(label == R['felt'], smooth(y, 0.296, 0.356), 0.0))
def along(a, b):                                       # how far along the line from a to b a point is (0 at a, 1 at b), and how far from it
    d = b - a; t = (P - a) @ d / (d @ d); return t, np.linalg.norm(P - (a + np.clip(t, 0, 1)[:, None] * d), axis=1)
tL, dL = along(at['armL'], at['handL'])
claim('armL', spread(np.where(armL | foam, smooth(tL, -0.22, 0.2), 0.0), 2, 0.4))
tR, dR = along(at['armR'], at['handR'])
claim('armR', spread(np.where(armR, smooth(tR, -0.12, 0.22), 0.0), 2, 0.4))
for s, name in ((1, 'browL'), (-1, 'browR')):
    c = at[name]; d = np.hypot((x - c[0]) / 0.024, (y - c[1] - 0.001) / 0.0085)
    claim(name, np.where((z > 0.03) & head, (1 - smooth(d, 0.75, 1.25)) * 0.85, 0.0))
c = at['tash']
claim('tash', np.where((z > 0.03), (1 - smooth(np.hypot((x - c[0]) / 0.07, (y - c[1]) / 0.014), 0.7, 1.2)) * is_hair * 0.7, 0.0))
W /= W.sum(1, keepdims=True)
order = np.argsort(-W, axis=1)[:, :4]
skinIndex = order.astype(np.uint16); skinWeight = np.take_along_axis(W, order, 1); skinWeight /= skinWeight.sum(1, keepdims=True)
print('points that go with:', {b['name']: int((W[:, i] > 0.5).sum()) for i, b in enumerate(G.BONES) if (W[:, i] > 0.5).any()})

# ---- normals (of the mesh as it now is), sky seen, and thinness ----
def blender(p): return np.stack([p[:, 0], -p[:, 2], p[:, 1]], 1)
C.set_points(low, blender(P))
nb = np.empty(nv * 3, dtype=np.float32); me.vertices.foreach_get('normal', nb); nb = nb.reshape(nv, 3)
N = np.stack([nb[:, 0], nb[:, 2], -nb[:, 1]], 1)
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(low, dg)
thin = np.zeros(nv, np.float32)
skin = np.where(soft[:, R['skin']] > 0.3)[0]
for i in skin:
    p = Vector(blender(P[i:i + 1])[0]); n = Vector(nb[i])
    hit = bvh.ray_cast(p - n * 0.0006, -n, 0.02)
    if hit[0] is not None: thin[i] = max(0.0, 1 - hit[3] / 0.009)
thin = spread(thin, 2, 0.5)

# ---- how far from him each point of the space round his head and chest is ----
cell = 0.0025; lo = np.array([-0.125, 0.085, -0.095]); dims = np.array([100, 84, 84])
gx, gy, gz = [lo[a] + (np.arange(dims[a]) + 0.5) * cell for a in range(3)]
sdf = np.empty((dims[2], dims[1], dims[0]), np.float32)
for k, zz in enumerate(gz):
    for j, yy in enumerate(gy):
        for i, xx in enumerate(gx):
            loc, nrm, idx, dist = bvh.find_nearest(Vector((xx, -zz, yy)))
            sdf[k, j, i] = dist if (Vector((xx, -zz, yy)) - loc).dot(nrm) >= 0 else -dist
print(f'distance map {dims.tolist()} at {cell * 1000} mm, inside for {float((sdf < 0).mean()) * 100:.0f}% of it; so far {time.time() - t0:.0f} s')
sdf8 = np.clip(np.round(sdf / 0.016 * 127), -127, 127).astype(np.int8)

# ---- the mesh as the game draws it: a point for every place a point has in the picture ----
key = np.concatenate([lv[:, None].astype(np.int64), np.round(uvl * 16384).astype(np.int64)], 1)
uniq, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
src = uniq[:, 0].astype(np.int64)
index = inverse.reshape(-1)[tl].astype(np.uint32)
# (Blender's triangles wind the other way once y and z change places)
ao = at_loops(picture('ao')[:, :, None] if picture('ao').ndim == 2 else picture('ao')[:, :, :1])[first][:, 0]
arrays = {
    'position': P[src].astype(np.float32), 'normal': N[src].astype(np.float32), 'uv': uvl[first].astype(np.float32),
    'shade': np.stack([ao, thin[src]], 1).astype(np.float32),
    'tint': soft[src][:, [R['skin'], R['knit'], R['felt'], R['leather']]].astype(np.float32),
    'regb': soft[src][:, [R['cloth'], R['foam'], R['hair'], R['metal']]].astype(np.float32),
    'skinIndex': skinIndex[src], 'skinWeight': skinWeight[src].astype(np.float32), 'index': index, 'sdf': sdf8,
    # which limb a point is on (0 his body, 1 his left arm, 2 his right): knitting runs round each of them its own way
    'limb': np.where(armL | foam, 1.0, np.where(armR, 2.0, 0.0)).astype(np.float32)[src],
}
# which way round are the triangles? (outward, by the normals)
a, b, c = arrays['position'][index[:, 0]], arrays['position'][index[:, 1]], arrays['position'][index[:, 2]]
facing = (np.cross(b - a, c - a) * arrays['normal'][index[:, 0]]).sum(1)
if (facing < 0).mean() > 0.5: arrays['index'] = index[:, ::-1].copy(); print('triangles turned over')
arrays['index'] = arrays['index'].reshape(-1)

# ---- its pictures ----
# The colour picture is put right where it can be: the generator painted him as he was lit when his portrait was made,
# with the shine of that light on his nose and boots and its shadow under his hat, and painted eyes where he is to
# have real ones.
size = base.shape[0]
uv_tri = uvl[tl]                                               # (faces, 3, 2)
face, bary = T.raster(uv_tri, tl, size)
covered = face >= 0
vt = lv[tl]                                                    # the mesh's points at each face's corners
pos = T.carry(face, bary, P[vt].astype(np.float32))
reg = T.carry(face, bary, soft[vt])
img = base.copy()
lum = lambda a: a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
def region_blur(v, mask, sigma):                               # an average over the neighbourhood, of the masked dots only
    m = mask.astype(np.float32)
    return cv2.GaussianBlur(v * (m[..., None] if v.ndim == 3 else m), (0, 0), sigma) / np.maximum(cv2.GaussianBlur(m, (0, 0), sigma), 1e-4)[(..., None) if v.ndim == 3 else ...]
# 1. shine: dots much brighter and greyer than what is round them, on skin and leather, are given what is round them
for name, strength in (('skin', 1.0), ('leather', 1.0), ('felt', 0.7)):
    m = covered & (reg[:, :, R[name]] > 0.5)
    if not m.any(): continue
    near_col = region_blur(img, m, size / 2048 * 14)
    hsv_i = cv2.cvtColor(img, cv2.COLOR_RGB2HSV); hsv_n = cv2.cvtColor(near_col.astype(np.float32), cv2.COLOR_RGB2HSV)
    brighter = np.clip((hsv_i[:, :, 2] - hsv_n[:, :, 2] - 0.05) / 0.12, 0, 1); greyer = np.clip((hsv_n[:, :, 1] - hsv_i[:, :, 1] - 0.03) / 0.1, 0, 1)
    shine = cv2.GaussianBlur((brighter * greyer * m).astype(np.float32), (0, 0), 1.5) * strength
    img = img * (1 - shine[..., None]) + near_col * shine[..., None]
    print(f'shine taken off {name}: {float((shine > 0.3).sum()) / max(1, int(m.sum())) * 100:.1f}% of it')
# What follows changes the slow run of colour over him, and has to be worked out on the mesh, not in the picture: in the
# picture he is in dozens of separate pieces, and anything averaged within a piece comes out different either side of
# each cut between pieces, which shows as a line across his face.
lin = lambda a: np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
srgb = lambda a: np.where(a <= 0.0031308, a * 12.92, 1.055 * np.clip(a, 0, None) ** (1 / 2.4) - 0.055)
def among(v, mask, times):
    """Each masked point's value averaged with its masked neighbours', over and over: the slow run of it within the mask."""
    v = np.asarray(v, np.float32).copy(); mk = mask.astype(np.float32)
    e0, e1 = edges[:, 0], edges[:, 1]
    for _ in range(times):
        s_ = np.zeros_like(v); c = np.zeros(nv, np.float32)
        w01 = mk[e1]; w10 = mk[e0]
        np.add.at(s_, e0, v[e1] * (w01[:, None] if v.ndim == 2 else w01)); np.add.at(c, e0, w01)
        np.add.at(s_, e1, v[e0] * (w10[:, None] if v.ndim == 2 else w10)); np.add.at(c, e1, w10)
        avg = s_ / np.maximum(c, 1e-6).reshape((-1,) + (1,) * (v.ndim - 1))
        has = (c > 0).reshape((-1,) + (1,) * (v.ndim - 1))
        v = np.where(has, 0.5 * v + 0.5 * avg, v)
    return v
L = lin(np.clip(img, 0, 1))
Lv = at_points(cv2.GaussianBlur(L.astype(np.float32), (0, 0), 1.2))        # his colour at each point of the mesh (linear light)
lum_v = Lv @ np.array([0.2126, 0.7152, 0.0722], np.float32)
# 2. shadow: within each kind of thing, the slow changes of brightness are evened out some of the way
gain_v = np.ones(nv, np.float32)
for name, amount, times in (('felt', 0.6, 40), ('leather', 0.45, 30), ('foam', 0.5, 30), ('cloth', 0.5, 30), ('hair', 0.3, 30)):
    mk = label == R[name]
    if not mk.any(): continue
    slow_l = among(lum_v, mk, times); want = np.median(lum_v[mk])
    gain_v[mk] = np.clip((want / np.maximum(slow_l[mk], 1e-4)) ** amount, 0.6, 1.9)
gain = T.carry(face, bary, gain_v[vt][:, :, None])[:, :, 0]
L = np.where(covered[..., None], L * gain[..., None], L)
# (and the black the generator put in the folds of his hat is let up: the light will find the folds for itself)
felt_t = covered & (reg[:, :, R['felt']] > 0.5)
if felt_t.any():
    lum_t = L @ np.array([0.2126, 0.7152, 0.0722], np.float32); floor_l = 0.62 * np.median(lum_t[felt_t])
    lift = np.where(felt_t, np.maximum(1.0, floor_l / np.maximum(lum_t, 1e-4)) ** 0.8, 1.0)
    L = L * lift[..., None]
# 2b. skin: the generator's is blotched (the shadow of his brows, the paint of his eyes, smears where it guessed). It is
# made again as one clean colour, redder where the blood shows (nose, cheeks, ears, knuckles), with only the fine
# lines of the generator's kept, and a share of its slow changes of colour.
mk = soft[:, R['skin']] > 0.3
if mk.any():
    slow_v = among(Lv, mk, 10)
    tone = np.percentile(Lv[label == R['skin']], 62, axis=0) * np.array([1.06, 1.0, 0.97], np.float32)
    def blush(c, r): d = np.linalg.norm(P - np.array(c), axis=1) / r; return np.clip(1 - d * d, 0, 1) ** 2
    red = np.clip(blush(G.NOSE, 0.034) * 0.95 + blush((0.036, 0.221, 0.04), 0.03) * 0.7 + blush((-0.036, 0.221, 0.04), 0.03) * 0.7
                  + np.clip((np.abs(P[:, 0]) - 0.058) / 0.02, 0, 1) * (P[:, 1] > 0.2) * 0.55 + blush((-0.108, 0.078, 0.02), 0.026) * 0.35, 0, 1).astype(np.float32)
    clean_v = (tone[None, :] * (1 + red[:, None] * np.array([0.1, -0.3, -0.33], np.float32))) * 0.72 + slow_v * 0.28
    # what is finer than the mesh: the picture over the picture as the mesh's points alone would give it
    coarse = T.carry(face, bary, Lv[vt]); fine = np.clip(L / np.maximum(coarse, 1e-4), 0.6, 1.5) ** 0.85
    new = T.carry(face, bary, clean_v[vt]) * fine
    wgt = np.clip((T.carry(face, bary, soft[vt][:, :, R['skin']:R['skin'] + 1]) - 0.3) / 0.4, 0, 1)
    L = np.where(covered[..., None], L * (1 - wgt) + new * wgt, L)
img = np.clip(srgb(L), 0, 1).astype(np.float32)
# 3. his painted eyes: skin over them, darker towards the middle where a real eye will stand in front
lids = []
for s_ in (1, -1):
    d = np.hypot(pos[:, :, 0] - s_ * G.EYE[0], pos[:, :, 1] - G.EYE[1]) / G.EYE_R
    zone = covered & (pos[:, :, 2] > G.EYE[2] - 0.012) & (pos[:, :, 1] > 0.2)
    ring = zone & (d > 1.45) & (d < 2.0) & (pos[:, :, 1] < G.EYE[1] + 0.2 * G.EYE_R) & (reg[:, :, R['skin']] > 0.6)
    skin_here = np.median(img[ring], axis=0) if ring.sum() > 50 else np.array([0.72, 0.5, 0.44], np.float32)
    lids.append(skin_here)
    w = np.clip((1.38 - d) / 0.3, 0, 1) * zone
    shade_in = 1 - 0.45 * np.clip((1.0 - d) / 0.7, 0, 1)
    img = img * (1 - w[..., None]) + (skin_here[None, None, :] * shade_in[..., None] * np.array([1.0, 0.9, 0.88], np.float32)) * w[..., None]
lid = np.mean(lids, axis=0)
header_lid = [float(v) for v in lid]
img = T.pad(np.clip(img, 0, 1).astype(np.float32), covered, 16)
cv2.imwrite(str(out / 'base.jpg'), cv2.cvtColor((img * 255 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 87])
nm = cv2.imread(str(next(p for p in (folder / 'normal.png', folder / 'normal.jpg') if p.exists()))); cv2.imwrite(str(out / 'normal.jpg'), cv2.resize(nm, (1024, 1024), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 93])
rough = picture('rough'); rough = rough if rough.ndim == 2 else rough[:, :, 0]
aoim = picture('ao'); aoim = aoim if aoim.ndim == 2 else aoim[:, :, 0]
aoim = cv2.resize(aoim, (rough.shape[1], rough.shape[0]), interpolation=cv2.INTER_LINEAR)
orm = cv2.resize(np.stack([aoim, cv2.GaussianBlur(rough, (0, 0), 1.0), np.zeros_like(rough)], 2), (1024, 1024), interpolation=cv2.INTER_AREA)
cv2.imwrite(str(out / 'orm.jpg'), cv2.cvtColor((orm * 255).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 86])
header = {'name': 'gnome', 'bones': G.BONES, 'eye': {'at': G.EYE, 'r': G.EYE_R, 'lid': header_lid}, 'nose': G.NOSE, 'hatTip': G.HAT_TIP, 'regions': {'tint': ['skin', 'knit', 'felt', 'leather'], 'regb': ['cloth', 'foam', 'hair', 'metal']},
          'sdf': {'cell': cell, 'lo': lo.tolist(), 'dims': dims.tolist(), 'unit': 0.016 / 127}, 'points': int(len(src)), 'triangles': int(len(index))}
# The file, small: every list of numbers in as few bits as it can stand (what each stands for is in the description:
# the game turns them back into the numbers it draws with), and the whole of it squeezed.
import gzip
def small(name, arr):
    arr = np.asarray(arr)
    if name == 'position':
        lo_, hi_ = arr.min(0), arr.max(0); q = np.round((arr - lo_) / (hi_ - lo_) * 65535).astype(np.uint16)
        return q, {'as': 'float32', 'scale': ((hi_ - lo_) / 65535).tolist(), 'from': lo_.tolist()}
    if name == 'normal': return np.round(np.clip(arr, -1, 1) * 127).astype(np.int8), {'as': 'float32', 'scale': 1 / 127}
    if name == 'uv': return np.round(np.clip(arr, 0, 1) * 65535).astype(np.uint16), {'as': 'float32', 'scale': 1 / 65535}
    if name in ('shade', 'tint', 'regb'): return np.round(np.clip(arr, 0, 1) * 255).astype(np.uint8), {'as': 'float32', 'scale': 1 / 255}
    if name == 'limb': return arr.astype(np.uint8), {'as': 'float32', 'scale': 1}
    if name == 'skinIndex': return arr.astype(np.uint8), {'as': 'uint16'}
    if name == 'skinWeight':
        q = np.round(arr / arr.sum(1, keepdims=True) * 255).astype(np.int32); q[:, 0] += 255 - q.sum(1)          # (they add up to one, exactly)
        return q.astype(np.uint8), {'as': 'float32', 'scale': 1 / 255}
    if name == 'index' and arr.max() < 65536: return arr.astype(np.uint16), {}
    return arr, {}
blobs = []; off = 0; table = {}
for name, arr in arrays.items():
    arr, how = small(name, arr)
    arr = np.ascontiguousarray(arr); pad = (-off) % 8; blobs.append(b'\0' * pad); off += pad
    table[name] = {'type': arr.dtype.name, 'offset': off, 'length': int(arr.size), 'itemSize': int(arr.shape[1]) if arr.ndim == 2 else 1, **how}
    blobs.append(arr.tobytes()); off += arr.nbytes
head_bytes = json.dumps({**header, 'arrays': table}).encode(); head_bytes += b' ' * ((-len(head_bytes)) % 8)
raw = b'FIG2' + struct.pack('<I', len(head_bytes)) + head_bytes + b''.join(blobs)
# (squeezed, and then spelt out in letters: a file of plain text is served by anything that serves a page, where a file
# of bytes of no known kind is refused by some)
import base64
(out / 'gnorman.fig.txt').write_bytes(base64.b64encode(gzip.compress(raw, 9, mtime=0)))
print(f'figure: {len(src)} points, {len(index)} triangles, {len(raw) / 1e6:.2f} MB of numbers, {(out / "gnorman.fig.txt").stat().st_size / 1e6:.2f} MB squeezed and spelt out')

print('done in', round(time.time() - t0), 's')
