"""Working in the picture rather than on the mesh: for every dot of the mesh's texture, which face it lies in and where
in that face, and so where on him it is, which way it faces and what it is made of."""
import numpy as np, cv2


def raster(uv, tri_loops, size):
    """uv: one pair for each corner of each face (n, 3, 2) in 0..1, v up. Returns (face index or -1, the three shares)
    for every dot of a size x size picture (row 0 at the top)."""
    face = np.full((size, size), -1, np.int32); bary = np.zeros((size, size, 3), np.float32)
    p = uv.copy(); p[:, :, 0] *= size; p[:, :, 1] = (1 - p[:, :, 1]) * size
    lo = np.floor(p.min(1) - 0.5).astype(int); hi = np.ceil(p.max(1) + 0.5).astype(int)
    lo = np.clip(lo, 0, size - 1); hi = np.clip(hi, 0, size - 1)
    for t in range(len(p)):
        x0, y0 = lo[t]; x1, y1 = hi[t]
        if x1 < x0 or y1 < y0: continue
        a, b, c = p[t]
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12: continue
        xs = np.arange(x0, x1 + 1) + 0.5; ys = np.arange(y0, y1 + 1) + 0.5
        X, Y = np.meshgrid(xs, ys)
        w0 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / den
        w1 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / den
        w2 = 1 - w0 - w1
        # (a little over the edges, so that neighbouring faces leave no dot between them unclaimed)
        m = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not m.any(): continue
        sub_f = face[y0:y1 + 1, x0:x1 + 1]; sub_b = bary[y0:y1 + 1, x0:x1 + 1]
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        take = m & ((sub_f < 0) | inside)
        sub_f[take] = t
        sub_b[take] = np.stack([w0, w1, w2], -1)[take]
    return face, bary


def carry(face, bary, corner_values):
    """Per-corner values (n faces, 3, k) spread over the picture: (size, size, k), nothing where no face lies."""
    out = np.zeros(face.shape + (corner_values.shape[-1],), np.float32)
    m = face >= 0
    v = corner_values[face[m]]                      # (dots, 3, k)
    out[m] = (v * bary[m][:, :, None]).sum(1)
    return out


def pad(img, covered, rounds=12):
    """Colour spread outwards from the covered dots into the uncovered ones round them (so that nothing bleeds in at a seam)."""
    img = img.copy(); have = covered.copy()
    k = np.ones((3, 3), np.float32)
    for _ in range(rounds):
        if have.all(): break
        s = cv2.filter2D(img * have[..., None].astype(np.float32), -1, k, borderType=cv2.BORDER_CONSTANT)
        n = cv2.filter2D(have.astype(np.float32), -1, k, borderType=cv2.BORDER_CONSTANT)
        new = (~have) & (n > 0)
        img[new] = s[new] / n[new][:, None]
        have |= new
    return img
