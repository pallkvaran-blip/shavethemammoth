"""Step 2: a lighter mesh with a texture layout of its own, and the fine model's colour, roughness, creases and shading
baked on to it (base, rough, normal and ao pictures, and low.blend, in the out folder).
   python step2_low.py <high.blend> <out folder> [triangles] [texture size]"""
import sys, json, time, pathlib, numpy as np, bpy
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import common as C
src, out, target, size = sys.argv[1], pathlib.Path(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 60000, int(sys.argv[4]) if len(sys.argv) > 4 else 2048
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src)
high = bpy.data.objects['high']
t0 = time.time()

# ---- the lighter mesh ----
bpy.ops.object.select_all(action='DESELECT')
high.select_set(True); bpy.context.view_layer.objects.active = high
bpy.ops.object.duplicate()
low = bpy.context.view_layer.objects.active
low.name = 'low'; low.data.name = 'low'
n0 = C.tris(low)
# (points that the generator left doubled along its texture seams are joined first, or the mesh tears there as it is thinned)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-6); bpy.ops.object.mode_set(mode='OBJECT')
mod = low.modifiers.new('thin', 'DECIMATE'); mod.ratio = target / max(1, C.tris(low)); mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier='thin')
while low.data.uv_layers: low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name='uv')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=np.radians(66), island_margin=0.003, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()
print(f'thinned {n0} -> {C.tris(low)} triangles, {len(low.data.vertices)} points, in {time.time() - t0:.0f} s')

# ---- baking ----
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = 0.0025
scene.render.bake.max_ray_distance = 0.006
scene.render.bake.margin = 8
scene.render.bake.margin_type = 'EXTEND'
mat = bpy.data.materials.new('baked'); mat.use_nodes = True
low.data.materials.clear(); low.data.materials.append(mat)
nodes = mat.node_tree.nodes
target_node = nodes.new('ShaderNodeTexImage'); nodes.active = target_node


def bake(name, kind, colour=True, filters=None, samples=1):
    t = time.time()
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    target_node.image = img
    scene.cycles.samples = samples
    bpy.ops.object.select_all(action='DESELECT')
    high.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
    kw = {'type': kind}
    if filters: kw['pass_filter'] = filters
    bpy.ops.object.bake(**kw)
    img.filepath_raw = str(out / (name + '.png')); img.file_format = 'PNG'; img.save()
    print(f'baked {name} in {time.time() - t:.0f} s')
    return img


bake('base', 'DIFFUSE', True, {'COLOR'})
bake('rough', 'ROUGHNESS', False)
bake('normal', 'NORMAL', False)
# how much of the sky each point sees: worked out on the fine model and carried across like the rest (the creases are its)
world = bpy.data.worlds.new('sky'); scene.world = world
try: world.light_settings.distance = 0.05
except Exception as e: print('no distance for the occlusion:', e)
bake('ao', 'AO', False, None, 24)

bpy.data.objects.remove(high, do_unlink=True)
C.save(out / 'low.blend')
print('done in', round(time.time() - t0), 's')
