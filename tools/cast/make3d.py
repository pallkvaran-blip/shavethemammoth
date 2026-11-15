"""Make a 3D model from pictures.   python3 make3d.py <which> <out stem> <image> [more images]
which = rodin | rodin-raw | hunyuan | trellis2"""
import sys, json, pathlib, rep
which, stem, *images = sys.argv[1:]
urls = [rep.upload(p) for p in images]
stem = pathlib.Path(stem)
if which.startswith('rodin'):
    inputs = {'images': urls, 'quality': 'high', 'material': 'PBR', 'geometry_file_format': 'glb', 'mesh_mode': 'Raw' if which == 'rodin-raw' else 'Quad', 'tier': 'Gen-2', 'seed': 7,
              'prompt': 'A stout old garden gnome shopkeeper with a tall red felt hat, a big grey beard, a striped knitted jumper, a leather belt, blue trousers and brown boots, holding up a blue foam hand'}
    p = rep.run('hyper3d/rodin', inputs, note=stem.name)
elif which == 'hunyuan':
    p = rep.run('tencent/hunyuan-3d-3.1', {'image': urls[0], 'enable_pbr': True, 'face_count': 500000, 'generate_type': 'Normal'}, note=stem.name)
elif which == 'trellis2':
    p = rep.run('fishwowater/trellis2', {'image': urls[0], 'pipeline_type': '1536_cascade', 'generate_video': False, 'generate_model': True, 'decimation_target': 500000, 'texture_size': 4096, 'seed': 7},
                version='52e1ad6852599ea10ce8e257635a3c11485cba51c181ea5173e34d9b2955b226', note=stem.name)
else:
    raise SystemExit('which?')
print(json.dumps({k: p.get(k) for k in ('id', 'status', 'metrics')}))
print('output:', json.dumps(p.get('output'))[:600])
for i, u in enumerate(rep.outputs(p)):
    ext = pathlib.Path(u.split('?')[0]).suffix or '.bin'
    to = stem.with_name(stem.name + (f'-{i}' if i else '') + ext)
    rep.fetch(u, to); print('saved', to, to.stat().st_size)
