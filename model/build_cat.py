import bpy
import bmesh
import math
import os
from mathutils import Vector, Euler

ROOT = r"C:\Users\陈懒人\Desktop\Token-Cat-v0.5.0\LuluPet"
MODEL_DIR = os.path.join(ROOT, "model")
APP_ASSETS = os.path.join(ROOT, "app", "assets")
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(APP_ASSETS, exist_ok=True)

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

# ---------------------------------------------------------------- materials
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def orient_outward(obj):
    """For open shells (shorts) make each face normal point away from the shell centre."""
    import bmesh
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    if len(bm.verts) == 0:
        bm.free()
        return obj
    centre = sum((v.co for v in bm.verts), bm.verts[0].co * 0.0) / len(bm.verts)
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.dot(c - centre) < 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()
    me.update()
    return obj


def recalc_normals(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def mat_solid(name, hexcol, rough=0.5, metallic=0.0, spec=0.35, emission=None):
    rgb = tuple(srgb_to_linear(int(hexcol[i:i + 2], 16) / 255.0) for i in (0, 2, 4))
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = False
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = spec
    if emission:
        er = tuple(srgb_to_linear(int(emission[i:i + 2], 16) / 255.0) for i in (0, 2, 4))
        bsdf.inputs["Emission Color"].default_value = (*er, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 0.35
    return m

MAT_BODY = bpy.data.materials.new("LuluBodyVertexColor")
MAT_BODY.use_nodes = True
nt = MAT_BODY.node_tree
bsdf = nt.nodes.get("Principled BSDF")
vcol = nt.nodes.new("ShaderNodeVertexColor")
vcol.layer_name = "Col"
nt.links.new(vcol.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.42
if "Specular IOR Level" in bsdf.inputs:
    bsdf.inputs["Specular IOR Level"].default_value = 0.38
if "Coat Weight" in bsdf.inputs:
    bsdf.inputs["Coat Weight"].default_value = 0.10
    bsdf.inputs["Coat Roughness"].default_value = 0.24
if "Subsurface Weight" in bsdf.inputs:
    bsdf.inputs["Subsurface Weight"].default_value = 0.035
    bsdf.inputs["Subsurface Radius"].default_value = (0.20, 0.12, 0.06)

MAT_SHORTS = mat_solid("Shorts", "7B3A22", rough=0.76, spec=0.12)
MAT_SHORTS_DARK = mat_solid("ShortsDark", "552615", rough=0.74, spec=0.10)
MAT_EYE_WHITE = mat_solid("EyeWhite", "FFF4E2", rough=0.30)
MAT_EYE_INK = mat_solid("EyeInk", "24140F", rough=0.22, spec=0.50)
MAT_BLUSH = mat_solid("Blush", "F3A39D", rough=0.62, spec=0.18)
MAT_WHISKER = mat_solid("Whisker", "9A6B55", rough=0.72)
MAT_IRIS_AMBER = mat_solid("IrisAmber", "D79A38", rough=0.24, spec=0.45)
MAT_IRIS = mat_solid("Iris", "2A180F", rough=0.28)
MAT_PUPIL = mat_solid("Pupil", "100A07", rough=0.25)
MAT_GLINT = mat_solid("Glint", "FFFFFF", rough=0.18, emission="FFFFFF")
MAT_NOSTRIL = mat_solid("Nostril", "4A2518", rough=0.55)
MAT_NOSE_PINK = mat_solid("NosePink", "E88F86", rough=0.42, spec=0.35)
MAT_MOUTH = mat_solid("Mouth", "32100D", rough=1.0, spec=0.0)
MAT_MOUTH_INNER = mat_solid("MouthInner", "6B2522", rough=0.82, spec=0.10)
MAT_JAW = mat_solid("JawCream", "FCE4C8", rough=0.62, spec=0.18)
MAT_TONGUE = mat_solid("Tongue", "EC7A86", rough=0.45)
MAT_TEETH = mat_solid("Teeth", "FFFDF8", rough=0.30)
MAT_INNER_EAR = mat_solid("InnerEar", "D96C2C", rough=0.60)

# ---------------------------------------------------------------- helpers
def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)

def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True

def add_sphere(name, loc, scale, rot=(0, 0, 0), seg=32, ring=20, mat=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=1.0, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.rotation_euler = Euler(rot, 'XYZ')
    apply_all(o)
    smooth(o)
    if mat:
        o.data.materials.append(mat)
    return o

def add_cube_round(name, loc, scale, bevel=0.15, mat=None):
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    apply_all(o)
    mod = o.modifiers.new("Bevel", 'BEVEL')
    mod.width = bevel
    mod.segments = 5
    mod.limit_method = 'NONE'
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=mod.name)
    smooth(o)
    if mat:
        o.data.materials.append(mat)
    return o

def make_loft(name, sections, nseg=64, open_ends=False, mat=None):
    """sections: list of (z, rx, ry, cy). Closed with caps unless open_ends."""
    verts = []
    faces = []
    for s in sections:
        z, rx, ry, cy = s
        for i in range(nseg):
            a = 2 * math.pi * i / nseg
            verts.append((rx * math.cos(a), cy + ry * math.sin(a), z))
    for j in range(len(sections) - 1):
        for i in range(nseg):
            i2 = (i + 1) % nseg
            a = j * nseg + i
            b = j * nseg + i2
            c = (j + 1) * nseg + i2
            d = (j + 1) * nseg + i
            faces.append((a, b, c, d))
    if not open_ends:
        bot = len(verts)
        verts.append((0, sections[0][3], sections[0][0]))
        top = len(verts)
        verts.append((0, sections[-1][3], sections[-1][0]))
        for i in range(nseg):
            i2 = (i + 1) % nseg
            faces.append((bot, i2, i))
            faces.append((top, (len(sections) - 1) * nseg + i, (len(sections) - 1) * nseg + i2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    smooth(o)
    if mat:
        o.data.materials.append(mat)
    return o

def make_tube(name, points, radii, nseg=24, mat=None, cap=True):
    pts = [Vector(p) for p in points]
    verts = []
    faces = []
    for i, p in enumerate(pts):
        if i == 0:
            tan = (pts[1] - pts[0]).normalized()
        elif i == len(pts) - 1:
            tan = (pts[-1] - pts[-2]).normalized()
        else:
            tan = (pts[i + 1] - pts[i - 1]).normalized()
        ref = Vector((0, 1, 0)) if abs(tan.dot(Vector((0, 1, 0)))) < 0.9 else Vector((1, 0, 0))
        side = tan.cross(ref).normalized()
        up = side.cross(tan).normalized()
        for k in range(nseg):
            a = 2 * math.pi * k / nseg
            verts.append(tuple(p + side * radii[i] * math.cos(a) + up * radii[i] * math.sin(a)))
    for j in range(len(pts) - 1):
        for i in range(nseg):
            i2 = (i + 1) % nseg
            faces.append((j * nseg + i, j * nseg + i2, (j + 1) * nseg + i2, (j + 1) * nseg + i))
    if cap:
        b = len(verts)
        verts.append(tuple(pts[0]))
        t = len(verts)
        verts.append(tuple(pts[-1]))
        for i in range(nseg):
            i2 = (i + 1) % nseg
            faces.append((b, i2, i))
            faces.append((t, (len(pts) - 1) * nseg + i, (len(pts) - 1) * nseg + i2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    smooth(o)
    if mat:
        o.data.materials.append(mat)
    return o

def make_notched_shell(name, sections, bottom_notch=0.09, nseg=96, mat=None):
    """A shorts shell whose lower edge rises at the front/back centre,
    forming a readable crotch notch instead of a skirt hem."""
    verts = []
    faces = []
    # bottom ring: z varies around the body
    z0, rx0, ry0, cy0 = sections[0]
    for i in range(nseg):
        a = 2 * math.pi * i / nseg
        z = z0 + bottom_notch * (abs(math.sin(a)) ** 3)
        verts.append((rx0 * math.cos(a), cy0 + ry0 * math.sin(a), z))
    for s in sections[1:]:
        z, rx, ry, cy = s
        for i in range(nseg):
            a = 2 * math.pi * i / nseg
            verts.append((rx * math.cos(a), cy + ry * math.sin(a), z))
    for j in range(len(sections) - 1):
        for i in range(nseg):
            i2 = (i + 1) % nseg
            faces.append((j * nseg + i, j * nseg + i2, (j + 1) * nseg + i2, (j + 1) * nseg + i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    smooth(o)
    if mat:
        o.data.materials.append(mat)
    return o

def join_objects(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return o

def remesh_clean(obj, voxel=0.013, smooth_iter=5):
    mod = obj.modifiers.new("Remesh", 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = voxel
    mod.use_smooth_shade = True
    mod.use_remove_disconnected = True
    mod.threshold = 0.08
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod = obj.modifiers.new("Smooth", 'SMOOTH')
    mod.factor = 0.22
    mod.iterations = smooth_iter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod = obj.modifiers.new("Decimate", 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = 0.55
    bpy.ops.object.modifier_apply(modifier=mod.name)
    smooth(obj)
    return obj

# ---------------------------------------------------------------- body silhouette
# Body and head are one lofted surface: no separate head sphere, no neck seam.
body_sections = [
    (0.340, 0.230, 0.190, -0.02),
    (0.420, 0.300, 0.250, -0.02),
    (0.520, 0.355, 0.290, -0.02),
    (0.660, 0.390, 0.315, -0.02),
    (0.800, 0.400, 0.325, -0.03),
    (0.940, 0.380, 0.310, -0.03),
    (1.060, 0.350, 0.290, -0.02),
    (1.160, 0.330, 0.280, -0.02),
    (1.250, 0.320, 0.275, -0.02),
    (1.320, 0.310, 0.270, -0.02),
    (1.380, 0.360, 0.310, -0.02),
    (1.470, 0.470, 0.390, -0.02),
    (1.600, 0.575, 0.450, -0.02),
    (1.740, 0.610, 0.480, -0.02),
    (1.880, 0.585, 0.460, -0.02),
    (1.990, 0.520, 0.420, -0.02),
    (2.080, 0.420, 0.350, -0.02),
    (2.140, 0.230, 0.250, -0.03),
    (2.165, 0.020, 0.050, -0.03),
]
body = make_loft("BodyCore", body_sections, nseg=96)

parts = [body]

# small cat muzzle and whisker pads, merged into the same continuous head
muzzle = add_sphere("Muzzle", (0, -0.430, 1.630), (0.245, 0.145, 0.155), seg=36, ring=26)
parts.append(muzzle)
for sx in (-1, 1):
    parts.append(add_sphere("WhiskerPad", (sx * 0.105, -0.485, 1.610), (0.115, 0.090, 0.090), seg=24, ring=16))
parts.append(add_sphere("Chin", (0, -0.395, 1.505), (0.150, 0.105, 0.080), seg=24, ring=16))

# slim cat arms with small three-lobed paws
arm_pts = [(0.320, -0.005, 1.255), (0.400, -0.040, 1.140), (0.455, -0.090, 1.020), (0.485, -0.125, 0.925)]
arm_r = [0.115, 0.100, 0.088, 0.075]
for sx in (-1, 1):
    p = [(sx * x, y, z) for x, y, z in arm_pts]
    parts.append(add_sphere("ShoulderBlend", (sx * 0.320, -0.010, 1.235), (0.145, 0.135, 0.145), seg=24, ring=16))
    # arms are separate two-segment pieces so the elbow can actually lift a paw


# short cat legs, slightly longer than the capybara's, with soft toe pads
leg_pts = [(0.190, 0.00, 0.500), (0.205, -0.020, 0.360), (0.225, -0.050, 0.205)]
leg_r = [0.145, 0.135, 0.120]
for sx in (-1, 1):
    p = [(sx * x, y, z) for x, y, z in leg_pts]
    parts.append(make_tube("Leg", p, leg_r, nseg=26))
    foot = add_sphere("Foot", (sx * 0.225, -0.120, 0.140), (0.150, 0.190, 0.105), seg=30, ring=18)
    parts.append(foot)
    for k, fx in enumerate((-0.065, 0, 0.065)):
        parts.append(add_sphere("Toe", (sx * 0.225 + fx, -0.275 - abs(fx) * 0.20, 0.060 + (0.006 if k == 1 else 0)),
                                (0.042, 0.048, 0.042), seg=18, ring=12))

# no cauda or ears in the merged skin: the long tail and pointed cat ears are
# separate clean pieces so their silhouettes are not eaten by the voxel remesh.

# one continuous skin: overlapping parts become a single watertight surface
body = join_objects(parts, "LuluBody")
body = remesh_clean(body, voxel=0.0125, smooth_iter=7)
body.data.materials.clear()
body.data.materials.append(MAT_BODY)

# two-segment arms, separate from the remeshed torso so the shoulder/elbow can pose
for sx, side in ((-1, "L"), (1, "R")):
    upper = make_tube("UpperArm." + side,
                      [(sx * 0.320, -0.005, 1.235), (sx * 0.400, -0.040, 1.140)],
                      [0.115, 0.100], nseg=24, mat=MAT_JAW, cap=False)
    upper["rigid_bone"] = "upper_arm." + side
    fore = make_tube("Forearm." + side,
                     [(sx * 0.400, -0.040, 1.140), (sx * 0.455, -0.090, 1.020),
                      (sx * 0.495, -0.130, 0.925)],
                     [0.100, 0.088, 0.075], nseg=24, mat=MAT_JAW, cap=False)
    fore["rigid_bone"] = "forearm." + side
    elbow = add_sphere("Elbow." + side, (sx * 0.400, -0.040, 1.140),
                       (0.105, 0.098, 0.105), seg=22, ring=14, mat=MAT_JAW)
    elbow["rigid_bone"] = "forearm." + side

# separate mitten paws, so the three toe lobes survive in the silhouette
for sx, side in ((-1, "L"), (1, "R")):
    hand = add_sphere("Hand." + side, (sx * 0.495, -0.145, 0.865),
                      (0.095, 0.085, 0.090), seg=26, ring=16, mat=MAT_JAW)
    hand["rigid_bone"] = "forearm." + side
    for k, fx in enumerate((-0.050, 0, 0.050)):
        finger = add_sphere("PawFinger.%s.%d" % (side, k),
                            (sx * (0.495 + fx), -0.190, 0.785 + (0.008 if k == 1 else 0)),
                            (0.034, 0.040, 0.062), seg=18, ring=12, mat=MAT_JAW)
        finger["rigid_bone"] = "forearm." + side

# pointed cat ears, kept separate so the tips stay sharp after remeshing
MAT_EAR_OUTER = mat_solid("EarOuter", "DE8A45", rough=0.56, spec=0.30)
MAT_EAR_INNER = mat_solid("EarInnerPink", "F0A08B", rough=0.62, spec=0.22)
MAT_TAIL_ORANGE = mat_solid("TailOrange", "E48038", rough=0.58, spec=0.26)
MAT_TAIL_CREAM = mat_solid("TailCream", "FFF0D8", rough=0.60, spec=0.20)
MAT_COLLAR = mat_solid("CollarTeal", "2F5D6B", rough=0.46, spec=0.45)
MAT_BELL = mat_solid("CollarBell", "E9B94E", rough=0.24, metallic=0.55, spec=0.50)

for sx in (-1, 1):
    tilt = 0.48 if sx < 0 else 0.10
    ear_z = 2.105 if sx < 0 else 2.125
    ear_depth = 0.305 if sx < 0 else 0.345
    bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.195 if sx < 0 else 0.205,
                                    radius2=0.026, depth=ear_depth,
                                    location=(sx * 0.330, -0.005, ear_z))
    ear = bpy.context.object
    ear.name = "CatEar." + ("L" if sx < 0 else "R")
    ear.rotation_euler = (0.02, sx * tilt, 0.0)
    ear.scale = (1.0, 0.62, 1.0)
    apply_all(ear)
    mod = ear.modifiers.new("Bevel", 'BEVEL')
    mod.width = 0.055
    mod.segments = 4
    bpy.context.view_layer.objects.active = ear
    bpy.ops.object.modifier_apply(modifier=mod.name)
    smooth(ear)
    ear.data.materials.append(MAT_EAR_OUTER)
    ear["rigid_bone"] = "ear." + ("L" if sx < 0 else "R")

    inner = add_sphere("EarInner." + ("L" if sx < 0 else "R"),
                       (sx * 0.326, -0.075, ear_z - 0.040), (0.095, 0.026, 0.130),
                       rot=(0.02, sx * tilt, 0), seg=24, ring=16, mat=MAT_EAR_INNER)
    inner["rigid_bone"] = "ear." + ("L" if sx < 0 else "R")

# one deliberately crooked cowlick between the ears
MAT_TUFT = mat_solid("CowlickOrange", "E98A3E", rough=0.55, spec=0.28)
cowlick = make_tube("Cowlick", [
    (0.000, -0.020, 2.120),
    (0.020, -0.030, 2.205),
    (0.075, -0.040, 2.265),
    (0.120, -0.020, 2.285),
], [0.045, 0.034, 0.020, 0.005], nseg=12, mat=MAT_TUFT, cap=True)
recalc_normals(cowlick)
cowlick["rigid_bone"] = "head"

# long soft cat tail, separate from the body so it can swish as one clean piece
tail_obj = make_tube("CatTail", [
    (0.000, 0.290, 0.600),
    (0.060, 0.420, 0.665),
    (0.150, 0.500, 0.760),
    (0.285, 0.540, 0.885),
    (0.400, 0.535, 1.020),
], [0.090, 0.087, 0.081, 0.072, 0.058], nseg=18, mat=MAT_TAIL_ORANGE, cap=True)
recalc_normals(tail_obj)
tail_obj["rigid_bone"] = "tail"
tail_tip = make_tube("TailTip", [
    (0.400, 0.535, 1.020),
    (0.455, 0.500, 1.135),
    (0.470, 0.425, 1.235),
], [0.058, 0.042, 0.022], nseg=18, mat=MAT_TAIL_CREAM, cap=True)
recalc_normals(tail_tip)
tail_tip["rigid_bone"] = "tail"

# simple teal collar and small brass bell; no shorts on the cat
bpy.ops.mesh.primitive_torus_add(major_radius=0.335, minor_radius=0.040,
                                 major_segments=64, minor_segments=12,
                                 location=(0, -0.012, 1.300))
collar = bpy.context.object
collar.name = "Collar"
collar.scale = (1.0, 0.92, 1.0)
apply_all(collar)
smooth(collar)
collar.data.materials.append(MAT_COLLAR)
collar["rigid_bone"] = "neck"

bell = add_sphere("CollarBell", (0, -0.360, 1.240), (0.050, 0.038, 0.050),
                  seg=24, ring=16, mat=MAT_BELL)
bell["rigid_bone"] = "neck"

# ---------------------------------------------------------------- vertex colours
color_layer = body.data.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='POINT')

def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))

def mix(c1, c2, t):
    return tuple(c1[i] * (1 - t) + c2[i] * t for i in range(3))

FUR = tuple(srgb_to_linear(v) for v in (1.000, 0.885, 0.720))
FUR_LIGHT = tuple(srgb_to_linear(v) for v in (1.000, 0.965, 0.885))
ORANGE = tuple(srgb_to_linear(v) for v in (0.955, 0.535, 0.180))
CREAM = tuple(srgb_to_linear(v) for v in (1.000, 0.945, 0.830))

for i, v in enumerate(body.data.vertices):
    x, y, z = v.co
    col = FUR
    # cream chest, belly and muzzle mask
    if y < 0.05:
        col = mix(col, FUR_LIGHT, clamp((1.35 - abs(z - 0.95)) / 1.4) * 0.60)
    if y < -0.06 and 1.42 < z < 1.94:
        col = mix(col, FUR_LIGHT, 0.72)
    # warm orange cap over the top of the head, blending down the forehead
    if z > 1.96:
        cap = clamp((z - 1.96) / 0.18)
        col = mix(col, ORANGE, cap * 0.92)
    # tabby patch over the back and hips
    if y > 0.10 and 0.40 < z < 1.45:
        back = clamp((y - 0.10) / 0.18) * clamp((1.45 - z) / 0.22)
        col = mix(col, ORANGE, back * 0.60)
    # creamy paw tips
    if z < 0.18 and y < -0.04:
        col = mix(col, CREAM, clamp((0.18 - z) / 0.12) * 0.92)
    color_layer.data[i].color = (*col, 1.0)

# ---------------------------------------------------------------- eyes / face details
for sx, side in ((-1, "L"), (1, "R")):
    # deliberately mismatched eyes: one a little bigger and higher than the other
    ex = sx * 0.185
    eye_z = 1.848 if sx < 0 else 1.842
    eye_w = 0.098 if sx < 0 else 0.091
    eye_h = 0.128 if sx < 0 else 0.120
    eye = add_sphere("Eye." + side, (ex, -0.485, eye_z), (eye_w, 0.026, eye_h),
                     rot=(0, 0, sx * 0.045), seg=30, ring=20, mat=MAT_EYE_INK)
    glint_big = add_sphere("GlintBig." + side, (ex - (0.027 if sx < 0 else 0.024), -0.505, eye_z + 0.034),
                           (0.027 if sx < 0 else 0.024, 0.006, 0.031 if sx < 0 else 0.028),
                           seg=18, ring=12, mat=MAT_GLINT)
    glint_small = add_sphere("GlintSmall." + side, (ex + (0.029 if sx < 0 else 0.026), -0.502, eye_z - 0.034),
                             (0.013 if sx < 0 else 0.011, 0.005, 0.015 if sx < 0 else 0.013),
                             seg=14, ring=10, mat=MAT_GLINT)
    for o in (eye, glint_big, glint_small):
        o["rigid_bone"] = "eye." + side

# soft blush patches make the face read as friendly rather than blank
for sx in (-1, 1):
    blush = add_sphere("Blush." + ("L" if sx < 0 else "R"), (sx * 0.265, -0.455, 1.715),
                       (0.068 if sx < 0 else 0.062, 0.014, 0.037 if sx < 0 else 0.034),
                       seg=22, ring=14, mat=MAT_BLUSH)
    blush["rigid_bone"] = "cheek." + ("L" if sx < 0 else "R")

# tiny pink nose, short philtrum and a small W mouth with a blep tongue
nose = add_sphere("Nose", (0, -0.582, 1.655), (0.052, 0.024, 0.040),
                  rot=(0, 0, 0), seg=26, ring=16, mat=MAT_NOSE_PINK)
nose["rigid_bone"] = "head"
philtrum = make_tube("Philtrum", [(0.0, -0.575, 1.610), (0.0, -0.574, 1.585), (0.0, -0.572, 1.562)],
                     [0.005, 0.005, 0.004], nseg=8, mat=MAT_NOSTRIL, cap=True)
recalc_normals(philtrum)
philtrum["rigid_bone"] = "head"
for sx, side in ((-1, "L"), (1, "R")):
    x_curve = 0.055 if sx < 0 else 0.042
    x_end = 0.112 if sx < 0 else 0.094
    end_z = 1.566 if sx < 0 else 1.552
    mouth = make_tube("Mouth." + side, [
        (0.0, -0.568, 1.552),
        (sx * x_curve, -0.566, 1.541 if sx < 0 else 1.545),
        (sx * 0.088, -0.556, 1.552),
        (sx * x_end, -0.546, end_z),
    ], [0.006, 0.007, 0.005, 0.002], nseg=8, mat=MAT_MOUTH, cap=True)
    recalc_normals(mouth)
    mouth["rigid_bone"] = "head"

# dark mouth interior stays behind the lip line; the jaw can open around it
cavity = add_sphere("MouthCavity", (0, -0.568, 1.532), (0.060, 0.014, 0.038),
                    seg=22, ring=14, mat=MAT_MOUTH_INNER)
cavity["rigid_bone"] = "head"

# a small cream chin/lower lip that the jaw bone can swing down, exposing the dark cavity
lower_jaw = add_sphere("LowerJaw", (0, -0.566, 1.486), (0.092, 0.042, 0.024),
                       seg=26, ring=16, mat=MAT_JAW)
lower_jaw["rigid_bone"] = "jaw"

# derpy little tongue sticking out to one side below the mouth
tongue = add_sphere("Tongue", (0.038, -0.583, 1.512), (0.037, 0.024, 0.030),
                    rot=(0, 0, 0.16), seg=24, ring=16, mat=MAT_TONGUE)
tongue["rigid_bone"] = "tongue"

# two small upper incisors: a hint of teeth, not a full set of dentures
for sx, side in ((-1, "L"), (1, "R")):
    tooth = add_sphere("ToothUpper." + side, (sx * 0.017, -0.579, 1.540),
                       (0.008, 0.004, 0.011), seg=12, ring=8, mat=MAT_TEETH)
    tooth["rigid_bone"] = "head"

# two softer whiskers per side instead of three stiff wires
for sx, side in ((-1, "L"), (1, "R")):
    for k, (z0, z1) in enumerate(((1.590, 1.605), (1.635, 1.665))):
        wh = make_tube("Whisker.%s.%d" % (side, k), [
            (sx * 0.105, -0.515, z0),
            (sx * 0.275, -0.540, (z0 + z1) * 0.5 + 0.008),
            (sx * 0.440, -0.545, z1),
        ], [0.0045, 0.0032, 0.0015], nseg=6, mat=MAT_WHISKER, cap=True)
        recalc_normals(wh)
        wh["rigid_bone"] = "head"

# ---------------------------------------------------------------- no shorts on the cat
# The cat keeps its natural cream/orange coat; the collar and bell are the only
# pieces of clothing, both bound rigidly to the neck.

# tiny three-toe paw nubs on each hand, so the front paws don't read as plain balls
# (the real paw meshes are built above; these were hidden inside the old remeshed paws)

# ---------------------------------------------------------------- armature
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
arm = bpy.context.object
arm.name = "LuluRig"
arm.data.name = "LuluRig"
eb = arm.data.edit_bones
# remove default bone
for b in list(eb):
    eb.remove(b)

def bone(name, head, tail, parent=None, connect=False, deform=True):
    b = eb.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    b.use_deform = deform
    return b

bone("root", (0, 0, 0.02), (0, 0, 0.20), deform=False)
bone("hips", (0, 0, 0.40), (0, 0, 0.72), "root")
bone("spine", (0, 0, 0.72), (0, 0, 1.08), "hips", True)
bone("chest", (0, 0, 1.08), (0, 0, 1.25), "spine", True)
bone("neck", (0, 0, 1.25), (0, 0, 1.35), "chest", True)
bone("head", (0, 0, 1.35), (0, 0, 2.30), "neck", True)
for sx, side in ((-1, "L"), (1, "R")):
    bone("ear." + side, (sx * 0.330, -0.005, 2.030), (sx * 0.330, -0.025, 2.300), "head", deform=False)
    bone("cheek." + side, (sx * 0.265, -0.455, 1.715), (sx * 0.265, -0.600, 1.715), "head", deform=False)
for sx, side in ((-1, "L"), (1, "R")):
    bone("shoulder." + side, (sx * 0.14, -0.01, 1.235), (sx * 0.32, -0.01, 1.235), "chest")
    bone("upper_arm." + side, (sx * 0.32, -0.01, 1.235), (sx * 0.40, -0.04, 1.14), "shoulder." + side, True)
    bone("forearm." + side, (sx * 0.40, -0.04, 1.14), (sx * 0.495, -0.13, 0.925), "upper_arm." + side, True)
    bone("thigh." + side, (sx * 0.190, 0.0, 0.50), (sx * 0.210, -0.02, 0.205), "hips")
    bone("shin." + side, (sx * 0.210, -0.02, 0.205), (sx * 0.225, -0.10, 0.10), "thigh." + side, True)
    bone("foot." + side, (sx * 0.225, -0.10, 0.10), (sx * 0.225, -0.28, 0.07), "shin." + side, True)
    bone("eye." + side, (sx * 0.185, -0.485, 1.845), (sx * 0.185, -0.585, 1.845), "head", deform=False)
bone("mouth", (0, -0.555, 1.585), (0, -0.555, 1.44), "head", deform=False)
bone("jaw", (0, -0.440, 1.600), (0, -0.560, 1.470), "head")
bone("tongue", (0, -0.550, 1.520), (0, -0.620, 1.460), "jaw", deform=False)
bone("tail", (0, 0.290, 0.600), (0, 0.450, 0.650), "hips", deform=False)

bpy.ops.object.mode_set(mode='OBJECT')
arm.show_in_front = True

# body weights: automatic, after hiding the tiny control bones from the solver
for b in arm.data.bones:
    if b.name in ("eye.L", "eye.R", "mouth", "jaw", "tail", "ear.L", "ear.R", "cheek.L", "cheek.R"):
        b.use_deform = False
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for b in arm.data.bones:
    b.use_deform = True

def rigid_bind(obj, bone_name):
    vg = obj.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    md = obj.modifiers.new("Armature", 'ARMATURE')
    md.object = arm
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()

for obj in [eye for eye in bpy.data.objects if eye.name.startswith(("EyeWhite", "Iris", "Pupil", "Glint"))]:
    rigid_bind(obj, obj["rigid_bone"])
for obj in [o for o in bpy.data.objects if "rigid_bone" in o.keys()]:
    if obj.name == body.name:
        continue
    if obj.parent is None:
        rigid_bind(obj, obj["rigid_bone"])

# the shorts pieces are bound individually by their rigid_bone tags above

# mouth bone is kept in the rig for runtime eating/yawn control; no static cavity.

# ---------------------------------------------------------------- studio / renders
world = bpy.data.worlds.new("LuluWorld")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.96, 0.93, 0.88, 1)
bg.inputs[1].default_value = 0.40

# floor
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "Floor"
floor.data.materials.append(mat_solid("FloorMat", "F4EFE4", rough=0.85))

def area_light(name, loc, energy, size, color=(1, 0.96, 0.90)):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object
    l.name = name
    l.data.energy = energy
    l.data.shape = 'DISK'
    l.data.size = size
    l.data.color = color
    d = Vector((0, 0, 1.25)) - Vector(loc)
    l.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return l

area_light("Key", (-4.0, -4.0, 6.0), 520, 5.0)
area_light("Fill", (4.2, -2.0, 4.2), 260, 4.0, (0.88, 0.93, 1.0))
area_light("Rim", (0.0, 4.2, 5.5), 380, 3.5, (1.0, 0.90, 0.78))

cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
cam.data.lens = 72
cam.data.sensor_width = 36
scene.camera = cam

scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 620
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
try:
    scene.eevee.taa_render_samples = 64
except Exception:
    pass
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = -0.15

def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

views = [
    ("front", (0.0, -6.0, 1.55), (0, 0, 1.30)),
    ("threequarter", (3.9, -5.0, 2.05), (0, 0, 1.28)),
    ("side", (5.8, -0.6, 1.55), (0, 0, 1.28)),
    ("back", (0.0, 5.6, 1.65), (0, 0, 1.28)),
]
for name, loc, target in views:
    cam.location = loc
    look_at(cam, target)
    scene.render.filepath = os.path.join(MODEL_DIR, "lulu_static_%s.png" % name)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", scene.render.filepath)

# ---------------------------------------------------------------- animations
# Each clip is keyed on the whole rig, so clips never inherit a stale pose.
arm.animation_data_create()
for pb in arm.pose.bones:
    pb.rotation_mode = 'XYZ'

def rest_pose():
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)

def apply_spec(spec):
    rest_pose()
    for bname, vals in spec.items():
        pb = arm.pose.bones[bname]
        if "rot" in vals:
            pb.rotation_euler = vals["rot"]
        if "loc" in vals:
            pb.location = vals["loc"]
        if "scale" in vals:
            pb.scale = vals["scale"]

def key_all(frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_euler", frame=frame)
        pb.keyframe_insert("location", frame=frame)
        pb.keyframe_insert("scale", frame=frame)

def make_action(name, frames):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for frame, spec in frames:
        apply_spec(spec)
        key_all(frame)
    # put the action on an NLA track so the glTF ACTIONS exporter sees it
    arm.animation_data.action = None
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, act)
    strip.name = name
    track.mute = False
    return act

# 1. soft breathing, tail sway
make_action("Idle_Breathe", [
    (1, {}),
    (24, {"root": {"loc": (0, 0.018, 0)},
          "spine": {"scale": (1.010, 1.016, 1.010)},
          "chest": {"scale": (1.008, 1.014, 1.008)},
          "head": {"rot": (0.014, 0.0, 0.0)},
          "tail": {"rot": (0.0, 0.0, 0.10)}}),
    (48, {}),
    (72, {"root": {"loc": (0, 0.018, 0)},
          "spine": {"scale": (1.010, 1.016, 1.010)},
          "chest": {"scale": (1.008, 1.014, 1.008)},
          "head": {"rot": (-0.010, 0.0, 0.0)},
          "tail": {"rot": (0.0, 0.0, -0.10)}}),
    (96, {}),
])

# 2. look left / right, blink, tail counter-sway
make_action("Idle_Look", [
    (1, {}),
    (25, {"head": {"rot": (0.0, 0.28, 0.05)},
          "spine": {"rot": (0.0, 0.03, 0.0)},
          "ear.L": {"rot": (0.10, 0.0, 0.0)},
          "tail": {"rot": (0.0, 0.0, -0.12)}}),
    (40, {"head": {"rot": (0.0, 0.28, 0.05)},
          "eye.L": {"scale": (0.12, 0.12, 0.12)},
          "eye.R": {"scale": (0.12, 0.12, 0.12)}}),
    (43, {"head": {"rot": (0.0, 0.28, 0.05)},
          "tail": {"rot": (0.0, 0.0, -0.12)}}),
    (55, {}),
    (80, {"head": {"rot": (0.0, -0.24, -0.04)},
          "spine": {"rot": (0.0, -0.03, 0.0)},
          "ear.R": {"rot": (0.10, 0.0, 0.0)},
          "tail": {"rot": (0.0, 0.0, 0.12)}}),
    (95, {"head": {"rot": (0.0, -0.24, -0.04)},
          "eye.L": {"scale": (0.12, 0.12, 0.12)},
          "eye.R": {"scale": (0.12, 0.12, 0.12)}}),
    (99, {"head": {"rot": (0.0, -0.24, -0.04)},
          "tail": {"rot": (0.0, 0.0, 0.12)}}),
    (115, {}),
    (120, {}),
])

# 3. little side-to-side wiggle, arms and tail
make_action("Idle_Wiggle", [
    (1, {}),
    (18, {"hips": {"rot": (0.0, 0.07, 0.0)},
          "root": {"loc": (0.012, 0.012, 0)},
          "head": {"rot": (0.0, -0.05, -0.06)},
          "upper_arm.L": {"rot": (0.0, 0.0, 0.09)},
          "upper_arm.R": {"rot": (0.0, 0.0, -0.09)},
          "tail": {"rot": (0.0, 0.0, 0.16)}}),
    (45, {"hips": {"rot": (0.0, -0.07, 0.0)},
          "root": {"loc": (-0.012, 0.012, 0)},
          "head": {"rot": (0.0, 0.05, 0.06)},
          "upper_arm.L": {"rot": (0.0, 0.0, -0.09)},
          "upper_arm.R": {"rot": (0.0, 0.0, 0.09)},
          "tail": {"rot": (0.0, 0.0, -0.16)}}),
    (72, {"root": {"loc": (0.006, 0.008, 0)},
          "head": {"rot": (0.0, -0.02, -0.03)},
          "tail": {"rot": (0.0, 0.0, 0.08)}}),
    (90, {}),
])

# 4. touched: hop, squash, happy eyes
make_action("Touch_Happy", [
    (1, {}),
    (10, {"root": {"loc": (0, 0.10, 0)},
          "spine": {"scale": (0.985, 1.030, 0.985)},
          "head": {"rot": (-0.07, 0.0, 0.0)},
          "eye.L": {"scale": (0.78, 0.78, 0.78)},
          "eye.R": {"scale": (0.78, 0.78, 0.78)},
          "upper_arm.L": {"rot": (0.0, 0.0, 0.16)},
          "upper_arm.R": {"rot": (0.0, 0.0, -0.16)},
          "tail": {"rot": (0.0, 0.0, 0.20)}}),
    (20, {"root": {"loc": (0, 0.16, 0)},
          "head": {"rot": (-0.11, 0.0, 0.05)},
          "eye.L": {"scale": (1.0, 1.0, 0.22)},
          "eye.R": {"scale": (1.0, 1.0, 0.22)},
          "tail": {"rot": (0.0, 0.0, -0.20)}}),
    (30, {"spine": {"scale": (1.050, 0.940, 1.050)},
          "head": {"rot": (0.07, 0.0, 0.0)},
          "eye.L": {"scale": (0.78, 0.78, 0.78)},
          "eye.R": {"scale": (0.78, 0.78, 0.78)}}),
    (42, {"root": {"loc": (0, 0.10, 0)},
          "spine": {"scale": (0.990, 1.025, 0.990)},
          "head": {"rot": (-0.05, 0.0, 0.0)},
          "eye.L": {"scale": (0.78, 0.78, 0.78)},
          "eye.R": {"scale": (0.78, 0.78, 0.78)},
          "tail": {"rot": (0.0, 0.0, 0.18)}}),
    (58, {}),
    (72, {}),
])

# 5. licking an ice cream: both paws up, head tips back, little happy bounces
make_action("Eat_IceCream", [
    (1, {}),
    (12, {"root": {"loc": (0, 0.020, 0)},
          "head": {"rot": (-0.14, 0.0, 0.03)},
          "spine": {"rot": (-0.030, 0.0, 0.0)},
          "eye.L": {"scale": (0.78, 0.78, 0.78)},
          "eye.R": {"scale": (0.78, 0.78, 0.78)},
          "upper_arm.L": {"rot": (0.55, 0.0, 0.20)},
          "upper_arm.R": {"rot": (0.55, 0.0, -0.20)},
          "ear.L": {"rot": (0.10, 0.0, 0.0)},
          "tail": {"rot": (0.0, 0.0, 0.14)}}),
    (24, {"root": {"loc": (0, 0.030, 0)},
          "head": {"rot": (-0.07, 0.0, -0.02)},
          "eye.L": {"scale": (0.70, 0.70, 0.70)},
          "eye.R": {"scale": (0.70, 0.70, 0.70)},
          "upper_arm.L": {"rot": (0.58, 0.0, 0.22)},
          "upper_arm.R": {"rot": (0.58, 0.0, -0.22)}}),
    (34, {"root": {"loc": (0, 0.040, 0)},
          "head": {"rot": (-0.22, 0.0, 0.04)},
          "spine": {"rot": (-0.040, 0.0, 0.0)},
          "upper_arm.L": {"rot": (0.62, 0.0, 0.24)},
          "upper_arm.R": {"rot": (0.62, 0.0, -0.24)},
          "tail": {"rot": (0.0, 0.0, -0.12)}}),
    (46, {"root": {"loc": (0, 0.018, 0)},
          "head": {"rot": (-0.09, 0.0, 0.0)},
          "eye.L": {"scale": (0.74, 0.74, 0.74)},
          "eye.R": {"scale": (0.74, 0.74, 0.74)},
          "upper_arm.L": {"rot": (0.56, 0.0, 0.20)},
          "upper_arm.R": {"rot": (0.56, 0.0, -0.20)}}),
    (58, {"root": {"loc": (0, 0.042, 0)},
          "head": {"rot": (-0.23, 0.0, 0.03)},
          "upper_arm.L": {"rot": (0.62, 0.0, 0.24)},
          "upper_arm.R": {"rot": (0.62, 0.0, -0.24)},
          "tail": {"rot": (0.0, 0.0, 0.14)}}),
    (72, {"root": {"loc": (0, 0.020, 0)},
          "head": {"rot": (-0.08, 0.0, 0.0)},
          "eye.L": {"scale": (0.76, 0.76, 0.76)},
          "eye.R": {"scale": (0.76, 0.76, 0.76)},
          "upper_arm.L": {"rot": (0.56, 0.0, 0.20)},
          "upper_arm.R": {"rot": (0.56, 0.0, -0.20)}}),
    (84, {"head": {"rot": (-0.18, 0.0, -0.02)},
          "tail": {"rot": (0.0, 0.0, -0.10)}}),
    (96, {}),
    (110, {}),
])

# 6. eating a bowl: dip, chew, happy eyes, tiny hip wiggle
make_action("Eat_Meal", [
    (1, {}),
    (12, {"root": {"loc": (0, -0.040, 0)},
          "head": {"rot": (0.22, 0.0, 0.02)},
          "spine": {"rot": (0.040, 0.0, 0.0)},
          "hips": {"rot": (0.0, 0.05, 0.0)},
          "eye.L": {"scale": (0.78, 0.78, 0.78)},
          "eye.R": {"scale": (0.78, 0.78, 0.78)},
          "upper_arm.L": {"rot": (0.0, 0.0, -0.16)},
          "upper_arm.R": {"rot": (0.0, 0.0, 0.16)},
          "tail": {"rot": (0.0, 0.0, 0.12)}}),
    (22, {"root": {"loc": (0, -0.030, 0)},
          "head": {"rot": (0.26, 0.0, -0.03)},
          "eye.L": {"scale": (0.72, 0.72, 0.72)},
          "eye.R": {"scale": (0.72, 0.72, 0.72)},
          "ear.R": {"rot": (0.10, 0.0, 0.0)}}),
    (30, {"root": {"loc": (0, -0.010, 0)},
          "head": {"rot": (0.10, 0.0, 0.02)},
          "hips": {"rot": (0.0, -0.05, 0.0)},
          "eye.L": {"scale": (0.76, 0.76, 0.76)},
          "eye.R": {"scale": (0.76, 0.76, 0.76)}}),
    (40, {"root": {"loc": (0, -0.042, 0)},
          "head": {"rot": (0.25, 0.0, 0.0)},
          "tail": {"rot": (0.0, 0.0, -0.12)}}),
    (50, {"root": {"loc": (0, -0.012, 0)},
          "head": {"rot": (0.09, 0.0, 0.0)},
          "eye.L": {"scale": (0.72, 0.72, 0.72)},
          "eye.R": {"scale": (0.72, 0.72, 0.72)}}),
    (60, {"root": {"loc": (0, -0.040, 0)},
          "head": {"rot": (0.24, 0.0, 0.03)},
          "hips": {"rot": (0.0, 0.05, 0.0)},
          "tail": {"rot": (0.0, 0.0, 0.12)}}),
    (72, {"root": {"loc": (0, -0.008, 0)},
          "head": {"rot": (0.06, 0.0, 0.0)},
          "eye.L": {"scale": (0.78, 0.78, 0.78)},
          "eye.R": {"scale": (0.78, 0.78, 0.78)}}),
    (84, {"head": {"rot": (0.16, 0.0, -0.02)}}),
    (96, {}),
    (110, {}),
])

# add jaw opening and tongue motion on top of the hand-keyed eat clips
def add_jaw_motion(action_name, keys):
    act = bpy.data.actions[action_name]
    arm.animation_data.action = act
    for frame, jaw_open, tongue_scale in keys:
        jaw_pb = arm.pose.bones["jaw"]
        jaw_pb.rotation_mode = "XYZ"
        jaw_pb.rotation_euler = (jaw_open, 0.0, 0.0)
        jaw_pb.keyframe_insert("rotation_euler", frame=frame)
        tongue_pb = arm.pose.bones["tongue"]
        tongue_pb.scale = (1.0, tongue_scale, 1.0)
        tongue_pb.keyframe_insert("scale", frame=frame)
    arm.animation_data.action = None

add_jaw_motion("Eat_IceCream", [
    (1, 0.0, 1.0), (12, 0.62, 1.20), (24, 0.10, 1.02),
    (34, 0.78, 1.34), (46, 0.16, 1.10), (58, 0.72, 1.30),
    (72, 0.12, 1.02), (84, 0.52, 1.16), (96, 0.0, 1.0),
])
add_jaw_motion("Eat_Meal", [
    (1, 0.0, 1.0), (12, 0.55, 0.86), (22, 0.88, 0.82),
    (30, 0.10, 0.90), (40, 0.74, 0.84), (50, 0.08, 0.90),
    (60, 0.74, 0.84), (72, 0.08, 0.90), (84, 0.48, 0.88),
    (96, 0.0, 1.0),
])

def add_cheek_motion(action_name, keys):
    """Puff the blush/cheek pads without touching the body mesh."""
    act = bpy.data.actions[action_name]
    arm.animation_data.action = act
    for frame, puff in keys:
        for side in ("L", "R"):
            pb = arm.pose.bones["cheek." + side]
            pb.scale = (puff, 1.0, puff)
            pb.keyframe_insert("scale", frame=frame)
    arm.animation_data.action = None

add_cheek_motion("Eat_IceCream", [
    (1, 1.0), (12, 1.16), (24, 1.04), (34, 1.22),
    (46, 1.06), (58, 1.20), (72, 1.04), (84, 1.10), (96, 1.0),
])
add_cheek_motion("Eat_Meal", [
    (1, 1.0), (12, 1.08), (22, 1.18), (30, 1.04),
    (40, 1.14), (50, 1.05), (60, 1.12), (72, 1.04), (84, 1.08), (96, 1.0),
])

# 7. cat stretch: both paws out, chest lifted, tail up, ears perked
make_action("Idle_Stretch", [
    (1, {}),
    (18, {"root": {"loc": (0, 0.020, 0)},
          "spine": {"scale": (1.015, 1.055, 1.015)},
          "chest": {"rot": (-0.06, 0.0, 0.0)},
          "head": {"rot": (-0.10, 0.0, 0.0)},
          "upper_arm.L": {"rot": (0.0, 0.0, 0.42)},
          "upper_arm.R": {"rot": (0.0, 0.0, -0.42)},
          "ear.L": {"rot": (0.10, 0.0, 0.0)},
          "ear.R": {"rot": (0.10, 0.0, 0.0)},
          "tail": {"rot": (0.0, 0.0, 0.24)}}),
    (32, {"root": {"loc": (0, 0.032, 0)},
          "spine": {"scale": (1.025, 1.080, 1.025)},
          "head": {"rot": (-0.14, 0.0, 0.0)},
          "upper_arm.L": {"rot": (0.0, 0.0, 0.58)},
          "upper_arm.R": {"rot": (0.0, 0.0, -0.58)},
          "tail": {"rot": (0.0, 0.0, 0.32)}}),
    (48, {"root": {"loc": (0, 0.026, 0)},
          "spine": {"scale": (1.010, 1.030, 1.010)},
          "head": {"rot": (-0.06, 0.0, 0.0)},
          "upper_arm.L": {"rot": (0.0, 0.0, 0.38)},
          "upper_arm.R": {"rot": (0.0, 0.0, -0.38)},
          "tail": {"rot": (0.0, 0.0, 0.12)}}),
    (64, {}),
    (80, {}),
])

# 8. yawn: head tips back, jaw opens, eyes squeeze, tail lifts
make_action("Idle_Yawn", [
    (1, {}),
    (18, {"root": {"loc": (0, 0.012, 0)},
          "head": {"rot": (-0.18, 0.0, 0.04)},
          "chest": {"scale": (1.010, 1.025, 1.010)},
          "eye.L": {"scale": (0.78, 0.78, 0.78)},
          "eye.R": {"scale": (0.78, 0.78, 0.78)},
          "tail": {"rot": (0.0, 0.0, 0.14)}}),
    (32, {"root": {"loc": (0, 0.020, 0)},
          "head": {"rot": (-0.26, 0.0, 0.02)},
          "chest": {"scale": (1.018, 1.045, 1.018)},
          "eye.L": {"scale": (0.55, 0.55, 0.55)},
          "eye.R": {"scale": (0.55, 0.55, 0.55)},
          "ear.L": {"rot": (0.12, 0.0, 0.0)},
          "ear.R": {"rot": (0.12, 0.0, 0.0)}}),
    (48, {"root": {"loc": (0, 0.008, 0)},
          "head": {"rot": (-0.10, 0.0, -0.03)},
          "eye.L": {"scale": (0.74, 0.74, 0.74)},
          "eye.R": {"scale": (0.74, 0.74, 0.74)},
          "tail": {"rot": (0.0, 0.0, -0.08)}}),
    (64, {"head": {"rot": (0.03, 0.0, 0.02)}}),
    (90, {}),
    (110, {}),
])
add_jaw_motion("Idle_Yawn", [
    (1, 0.0, 1.0), (18, 0.35, 1.08), (32, 0.62, 1.18),
    (48, 0.30, 1.08), (64, 0.05, 1.0), (80, 0.0, 1.0),
])

# 9. groom: rub one cheek, then the other, with a small head tilt
make_action("Idle_Groom", [
    (1, {}),
    (16, {"head": {"rot": (0.0, 0.0, 0.0)},
          "eye.L": {"scale": (0.72, 0.72, 0.72)},
          "eye.R": {"scale": (0.72, 0.72, 0.72)},
          "upper_arm.L": {"rot": (1.20, 0.0, 0.40)},
          "forearm.L": {"rot": (1.20, 0.0, 0.80)},
          "tail": {"rot": (0.0, 0.0, 0.12)}}),
    (30, {"head": {"rot": (0.0, 0.0, 0.0)},
          "eye.L": {"scale": (0.66, 0.66, 0.66)},
          "eye.R": {"scale": (0.66, 0.66, 0.66)},
          "upper_arm.L": {"rot": (1.20, 0.0, 0.40)},
          "forearm.L": {"rot": (1.20, 0.0, 0.80)}}),
    (44, {"head": {"rot": (0.0, 0.05, -0.10)},
          "eye.L": {"scale": (0.82, 0.82, 0.82)},
          "eye.R": {"scale": (0.82, 0.82, 0.82)},
          "forearm.L": {"rot": (0.20, 0.0, 0.0)},
          "tail": {"rot": (0.0, 0.0, -0.08)}}),
    (60, {"head": {"rot": (0.0, 0.0, 0.0)},
          "eye.L": {"scale": (0.72, 0.72, 0.72)},
          "eye.R": {"scale": (0.72, 0.72, 0.72)},
          "upper_arm.R": {"rot": (1.20, 0.0, -0.40)},
          "forearm.R": {"rot": (1.20, 0.0, -0.80)}}),
    (76, {"head": {"rot": (0.0, 0.0, 0.0)},
          "eye.L": {"scale": (0.66, 0.66, 0.66)},
          "eye.R": {"scale": (0.66, 0.66, 0.66)},
          "upper_arm.R": {"rot": (1.20, 0.0, -0.40)},
          "forearm.R": {"rot": (1.20, 0.0, -0.80)}}),
    (96, {}),
    (116, {}),
])

rest_pose()
arm.animation_data.action = None

# save and export
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MODEL_DIR, "lulu_static.blend"))
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type in {'MESH', 'ARMATURE'} and o.name != "Floor":
        o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=os.path.join(APP_ASSETS, "lulu.glb"),
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_optimize_animation_size=False,
    export_anim_single_armature=True,
    export_materials='EXPORT',
    export_extras=True,
)
print("EXPORTED", os.path.join(APP_ASSETS, "lulu.glb"))
