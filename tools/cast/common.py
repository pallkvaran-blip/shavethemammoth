"""Shared by the Blender steps: getting a generated model in, measuring it, and standing it where the game's Gnorman stands.

Blender's axes are used throughout: z is up, he faces -y, his left is +x. (The file format has y up and +z forward; Blender's
importer and exporter convert.)"""
import bpy, bmesh, numpy as np
from mathutils import Vector, Matrix

HEIGHT = 0.402          # metres from the soles to the tip of the hat, as the present Gnorman is


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    assert meshes, 'no mesh in ' + str(path)
    for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    # (free of any parent the importer gave it, with its place and size worked into its points)
    world = ob.matrix_world.copy()
    ob.parent = None
    ob.matrix_world = world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o != ob: bpy.data.objects.remove(o, do_unlink=True)
    return ob


def points(ob):
    n = len(ob.data.vertices)
    co = np.empty(n * 3, dtype=np.float32)
    ob.data.vertices.foreach_get('co', co)
    return co.reshape(n, 3)


def set_points(ob, co):
    ob.data.vertices.foreach_set('co', np.asarray(co, dtype=np.float32).reshape(-1))
    ob.data.update()


def stand(ob, height=HEIGHT):
    """Scale him to the game's height, soles on the ground, the middle of his body over the origin. Returns the scale used."""
    co = points(ob)
    lo, hi = co.min(0), co.max(0)
    s = height / (hi[2] - lo[2])
    co = (co - [0, 0, lo[2]]) * s
    # the middle of him: side to side, half way between his boots (an arm in the air, or a fist at his side, would pull the
    # middle of anything higher up sideways); front to back, the middle of the slice of him at the height of his belt
    boots = co[co[:, 2] < 0.1 * height]
    belt = co[(co[:, 2] > 0.2 * height) & (co[:, 2] < 0.32 * height)]
    cx, cy = (boots[:, 0].min() + boots[:, 0].max()) / 2, (belt[:, 1].min() + belt[:, 1].max()) / 2
    co[:, 0] -= cx; co[:, 1] -= cy
    set_points(ob, co)
    return s


def tris(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


def save(path):
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)
