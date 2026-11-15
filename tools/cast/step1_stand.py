"""Step 1: bring a generated model in, stand it where the game wants it, and keep it as the 'high' model.
   python step1_stand.py <in.glb> <out.blend> [turn about the upright, degrees]"""
import sys, json, numpy as np, bpy, math
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import common as C
src, out, *rest = sys.argv[1:]
C.reset()
ob = C.import_glb(src)
ob.name = 'high'
if rest:
    co = C.points(ob); a = math.radians(float(rest[0])); c, s = math.cos(a), math.sin(a)
    C.set_points(ob, np.stack([c * co[:, 0] - s * co[:, 1], s * co[:, 0] + c * co[:, 1], co[:, 2]], 1))
scale = C.stand(ob)
co = C.points(ob)
info = {'triangles': C.tris(ob), 'points': len(co), 'scale': round(float(scale), 5), 'min': co.min(0).round(4).tolist(), 'max': co.max(0).round(4).tolist(),
        'materials': [m.name for m in ob.data.materials], 'uv layers': [u.name for u in ob.data.uv_layers]}
# how wide he is at each height, to see where things are
H = C.HEIGHT
prof = []
for k in range(20):
    sl = co[(co[:, 2] >= k * H / 20) & (co[:, 2] < (k + 1) * H / 20)]
    prof.append([round(k * H / 20, 3)] + ([round(float(v), 3) for v in (sl[:, 0].min(), sl[:, 0].max(), sl[:, 1].min(), sl[:, 1].max())] if len(sl) else []))
info['profile (z, x min, x max, y min, y max)'] = prof
print(json.dumps(info, indent=1))
for im in bpy.data.images: print('image', im.name, tuple(im.size), im.colorspace_settings.name)
bpy.ops.file.pack_all()
C.save(out)
