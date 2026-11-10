"""Orca Deck: physical device concept, top-down render for the app skin.

Units: 1 unit = 100 pt of the phone screen (624 x 784 pt => 6.24 x 7.84 units).
Derived from deck_scene.py: same Cycles materials, lighting, camera and crop pipeline.
Portrait wide face only; commands have a separate grid.
Run: blender -b -noaudio -P deck_wide_scene.py -- OUT.png SCALE SAMPLES
"""
import bpy, bmesh, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if len(argv) > 0 else '/tmp/deck.png'
SCALE = float(argv[1]) if len(argv) > 1 else 0.25
SAMPLES = int(argv[2]) if len(argv) > 2 else 24
MODE = argv[3] if len(argv) > 3 else 'hero'      # hero | base | sprites
ONLY = set(argv[5].split(',')) if len(argv)>5 else set()
OUTDIR = argv[4] if len(argv) > 4 else None       # raw sprite output folder

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hexstr):
    h = hexstr.lstrip('#')
    return tuple(lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def set_in(bsdf, name, value):
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = value


def material(name, base, metallic=0.0, rough=0.5, **extra):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    set_in(b, 'Base Color', (*rgb(base), 1.0))
    set_in(b, 'Metallic', metallic)
    set_in(b, 'Roughness', rough)
    for k, v in extra.items():
        set_in(b, k.replace('_', ' '), v)
    return m


def add_noise_bump(mat, scale, stretch, strength, detail=6.0):
    nt = mat.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = stretch
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = detail
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = strength
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return nz


def rbox(name, w, h, d, rv, re, loc, mat=None):
    """Rounded box: vertical edges radius rv, top edges radius re."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, h, d), verts=bm.verts)
    ve = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co).normalized().z) > 0.99]
    bmesh.ops.bevel(bm, geom=ve, offset=rv, segments=10, affect='EDGES', profile=0.5)
    if re > 0:
        bm.edges.ensure_lookup_table()
        top = [e for e in bm.edges if all(abs(v.co.z - d / 2) < 1e-4 for v in e.verts)]
        bmesh.ops.bevel(bm, geom=top, offset=re, segments=6, affect='EDGES', profile=0.55)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    if mat:
        ob.data.materials.append(mat)
    smooth(ob)
    return ob


def smooth(ob):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
    except Exception:
        bpy.ops.object.shade_smooth()


def cyl(name, r, depth, loc, mat, verts=96, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    if bevel > 0:
        md = ob.modifiers.new('bv', 'BEVEL')
        md.width = bevel
        md.segments = 6
        md.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier='bv')
    smooth(ob)
    return ob


# ---------------------------------------------------------------- layout (units)
CX = [-2.46, -1.34, -0.22, 0.90]
AGENT_Y = [1.10, -0.10, -1.30]
CMD_X = [1.88, 2.66]
CMD_Y = AGENT_Y
LCD = (0.0, 2.68, 5.84, 1.52)
BOT_Y = -2.90
STICK = (-2.10, BOT_Y)
DIAL = (2.10, BOT_Y)
PTT = (0.0, BOT_Y, 1.02, 1.06)

KEY_COLORS = ['#FFB020', '#BBA2FF', '#FFB020', '#5BAEFF', '#5BAEFF', '#5FD38D']
KEY_COLORS *= 2
KEY_GLOW = [2.4, 4.0, 2.0, 1.6, 1.6, 1.2] * 2


def tint(hexcol, t, base='#E9EDF5'):
    a = [int(hexcol.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]
    b = [int(base.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]
    return '#%02X%02X%02X' % tuple(int(b[i] + (a[i] - b[i]) * t) for i in range(3))

# ---------------------------------------------------------------- materials
# black hairline stainless: very fine parallel lines along X, roughness varying with the same grain
m_chassis = material('chassis', '#14171C', metallic=1.0, rough=0.34)
_nz = add_noise_bump(m_chassis, scale=1.2, stretch=(0.5, 1100.0, 1.0), strength=0.55, detail=8.0)
_nt = m_chassis.node_tree
_ramp = _nt.nodes.new('ShaderNodeValToRGB')
_ramp.color_ramp.elements[0].position = 0.35
_ramp.color_ramp.elements[0].color = (0.17, 0.17, 0.17, 1.0)
_ramp.color_ramp.elements[1].position = 0.65
_ramp.color_ramp.elements[1].color = (0.46, 0.46, 0.46, 1.0)
_nt.links.new(_nz.outputs['Fac'], _ramp.inputs['Fac'])
_nt.links.new(_ramp.outputs['Color'], _nt.nodes['Principled BSDF'].inputs['Roughness'])
m_well = material('well', '#07090C', metallic=0.2, rough=0.6)
m_bezel = material('bezel', '#05070A', metallic=0.0, rough=0.25, Coat_Weight=0.6)
m_glass = material('lcd', '#04110D', metallic=0.0, rough=0.34, Coat_Weight=0.0,
                   Specular_IOR_Level=0.08,
                   Emission_Color=(*rgb('#0F4A3A'), 1.0), Emission_Strength=0.42)
m_cmd = material('cmdcap', '#2D3541', metallic=0.0, rough=0.42, Specular_IOR_Level=0.5)
add_noise_bump(m_cmd, scale=900.0, stretch=(1.0, 1.0, 1.0), strength=0.12, detail=2.0)
m_ptt = material('pttcap', '#F6F8FC', metallic=0.0, rough=0.34, Coat_Weight=0.4,
                 Emission_Color=(*rgb('#F6F8FC'), 1.0), Emission_Strength=0.75)
m_rubber = material('rubber', '#0C0F13', metallic=0.0, rough=0.7)
m_alu = material('alu', '#B9C2CE', metallic=1.0, rough=0.26)
m_tick = material('tick', '#8794A6', metallic=0.0, rough=0.4, Emission_Color=(*rgb('#8FA6C4'), 1.0), Emission_Strength=1.3)


def frosted(name, hexcol):
    m = material(name, tint(hexcol, 0.72), metallic=0.0, rough=0.46,
                 Transmission_Weight=0.78, IOR=1.46,
                 Emission_Color=(*rgb(hexcol), 1.0), Emission_Strength=0.2)
    # brighter in the middle of the cap, like light diffusing through frosted plastic
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1.85, 1.95, 1.0)
    gr = nt.nodes.new('ShaderNodeTexGradient')
    gr.gradient_type = 'QUADRATIC_SPHERE'
    mu = nt.nodes.new('ShaderNodeMath')
    mu.operation = 'MULTIPLY_ADD'
    mu.inputs[1].default_value = 2.2
    mu.inputs[2].default_value = 0.15
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
    nt.links.new(gr.outputs['Fac'], mu.inputs[0])
    nt.links.new(mu.outputs['Value'], b.inputs['Emission Strength'])
    return m


def emitter(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*rgb(color), 1.0)
    e.inputs['Strength'].default_value = strength
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs['Emission'], o.inputs['Surface'])
    return m


# ---------------------------------------------------------------- chassis with wells
chassis = rbox('chassis', 7.0, 9.0, 0.5, 0.05, 0.0, (0, 0, -0.25), m_chassis)

cutters = []


def cutter(name, w, h, r, x, y, floor=-0.12):
    """Cutter spans floor .. floor+0.4, so it always passes through the top surface (z=0)."""
    c = rbox(name, w, h, 0.4, r, 0.0, (x, y, floor + 0.2))
    return c


cutters.append(cutter('c_bezel', LCD[2] + 0.10, LCD[3] + 0.10, 0.14, LCD[0], LCD[1], floor=-0.07))
# panel seams between the display, key and control sections
cutters.append(cutter('c_seam1', 6.7, 0.018, 0.008, 0.0, 1.785, floor=-0.03))
cutters.append(cutter('c_seam2', 6.7, 0.018, 0.008, 0.0, -2.17, floor=-0.03))
for ix, x in enumerate(CX):
    for iy, y in enumerate(AGENT_Y):
        cutters.append(cutter(f'c_a{ix}{iy}', 1.10, 1.14, 0.20, x, y))
for ix, x in enumerate(CMD_X):
    for iy, y in enumerate(CMD_Y):
        cutters.append(cutter(f'c_k{ix}{iy}', 0.70, 1.14, 0.18, x, y))
cutters.append(cutter('c_ptt', PTT[2] + 0.12, PTT[3] + 0.12, 0.24, PTT[0], PTT[1]))
for nm, (x, y) in (('c_stick', STICK), ('c_dial', DIAL)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.54, depth=0.4, location=(x, y, 0.08))
    c = bpy.context.active_object
    c.name = nm
    cutters.append(c)

bpy.ops.object.select_all(action='DESELECT')
for c in cutters:
    c.select_set(True)
bpy.context.view_layer.objects.active = cutters[0]
bpy.ops.object.join()
cut = bpy.context.active_object
cut.name = 'cut_all'
md = chassis.modifiers.new('cut', 'BOOLEAN')
md.operation = 'DIFFERENCE'
md.object = cut
md.solver = 'EXACT'
md.use_self = True
bpy.context.view_layer.objects.active = chassis
bpy.ops.object.modifier_apply(modifier='cut')
bpy.data.objects.remove(cut, do_unlink=True)
bv = chassis.modifiers.new('rim', 'BEVEL')
bv.width = 0.018
bv.segments = 3
bv.limit_method = 'ANGLE'
bv.angle_limit = math.radians(30)
bpy.context.view_layer.objects.active = chassis
bpy.ops.object.modifier_apply(modifier='rim')

# ---------------------------------------------------------------- LCD
rbox('lcd_bezel_floor', LCD[2] + 0.08, LCD[3] + 0.08, 0.02, 0.13, 0.0, (LCD[0], LCD[1], -0.06), m_bezel)
rbox('lcd_glass', LCD[2] - 0.02, LCD[3] - 0.02, 0.05, 0.11, 0.012, (LCD[0], LCD[1], -0.02), m_glass)

# ---------------------------------------------------------------- agent keys (frosted RGB)
n = 0
for iy, y in enumerate(AGENT_Y):
    for ix, x in enumerate(CX):
        col = KEY_COLORS[n]
        lift = 0.035 if n == 1 else 0.0
        plane = rbox(f'em_a{n}', 1.04, 1.08, 0.01, 0.18, 0.0, (x, y, -0.105), emitter(f'em{n}', col, KEY_GLOW[n]))
        rbox(f'agent{n}', 1.00, 1.04, 0.17, 0.17, 0.055, (x, y, -0.06 + 0.085 + lift), frosted(f'frost{n}', col))
        n += 1

# ---------------------------------------------------------------- command keys (matte PBT)
for ix, x in enumerate(CMD_X):
    for iy, y in enumerate(CMD_Y):
        rbox(f'cmd{ix}{iy}', 0.60, 1.04, 0.11, 0.14, 0.05, (x, y, -0.05 + 0.055), m_cmd)

# ---------------------------------------------------------------- PTT
rbox('em_ptt', PTT[2] + 0.06, PTT[3] + 0.06, 0.01, 0.2, 0.0, (PTT[0], PTT[1], -0.105), emitter('em_ptt', '#DDE6F5', 2.2))
rbox('ptt', PTT[2], PTT[3], 0.13, 0.22, 0.05, (PTT[0], PTT[1], -0.06 + 0.065), m_ptt)

# ---------------------------------------------------------------- joystick
sx, sy = STICK
bpy.ops.mesh.primitive_torus_add(major_radius=0.47, minor_radius=0.045, location=(sx, sy, -0.045), major_segments=96, minor_segments=24)
ring = bpy.context.active_object
ring.name = 'stick_ring'
ring.data.materials.append(m_alu)
smooth(ring)
cyl('stick_base', 0.40, 0.06, (sx, sy, -0.09), m_well)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.32, segments=64, ring_count=32, location=(sx, sy, -0.01))
dome = bpy.context.active_object
dome.name = 'dome'
dome.scale = (1.0, 1.0, 0.55)
dome.data.materials.append(m_rubber)
smooth(dome)

# ---------------------------------------------------------------- dial
dx, dy = DIAL
for i in range(32):
    a = 2 * math.pi * i / 32
    big = (i % 4 == 0)
    L = 0.10 if big else 0.06
    t = rbox(f'tick{i}', 0.028, L, 0.02, 0.012, 0.0, (dx + 0.455 * math.cos(a), dy + 0.455 * math.sin(a), -0.075), m_tick)
    t.rotation_euler = (0, 0, a + math.pi / 2)
knob = cyl('dial_knob', 0.33, 0.20, (dx, dy, -0.02), m_alu, verts=128, bevel=0.03)
# concentric turned-metal rings on top via bump
nt = m_alu.node_tree
b = nt.nodes['Principled BSDF']
tc = nt.nodes.new('ShaderNodeTexCoord')
wv = nt.nodes.new('ShaderNodeTexWave')
wv.wave_type = 'RINGS'
wv.inputs['Scale'].default_value = 130.0
wv.inputs['Distortion'].default_value = 0.3
bp = nt.nodes.new('ShaderNodeBump')
bp.inputs['Strength'].default_value = 0.22
nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
nt.links.new(wv.outputs['Fac'], bp.inputs['Height'])
nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])

# ---------------------------------------------------------------- real-device details: screws, wordmark
m_screw = material('screw', '#3A4049', metallic=1.0, rough=0.3)
m_hex = material('hex', '#050607', metallic=0.0, rough=0.7)
for sx_ in (-2.75, 2.75):
    cyl(f'screw{sx_}', 0.072, 0.03, (sx_, -3.72, 0.0), m_screw, verts=48, bevel=0.012)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.034, depth=0.03, location=(sx_, -3.72, 0.012))
    hexo = bpy.context.active_object
    hexo.data.materials.append(m_hex)

m_mark = material('wordmark', '#9AA4B2', metallic=1.0, rough=0.24)
wm = bpy.data.curves.new('wordmark', 'FONT')
wm.body = 'ORCA DECK'
wm.size = 0.115
wm.extrude = 0.004
wm.align_x = 'CENTER'
wm.align_y = 'CENTER'
wm.space_character = 1.6
wmo = bpy.data.objects.new('wordmark', wm)
bpy.context.collection.objects.link(wmo)
wmo.location = (0.0, -3.72, 0.0)
wmo.data.materials.append(m_mark)

# ---------------------------------------------------------------- lights, camera, world
world = bpy.data.worlds.new('W')
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.010, 0.012, 0.016, 1.0)
bg.inputs['Strength'].default_value = 1.0
scene.world = world


def area(name, loc, size, energy, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy
    ld.size = size
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    tr = ob.constraints.new('TRACK_TO')
    tgt = bpy.data.objects.get('aim')
    if tgt is None:
        tgt = bpy.data.objects.new('aim', None)
        bpy.context.collection.objects.link(tgt)
        tgt.location = (0, 0, 0)
    tr.target = tgt
    tr.track_axis = 'TRACK_NEGATIVE_Z'
    tr.up_axis = 'UP_Y'
    return ob


area('key', (-4.5, 6.0, 9.0), 7.0, 2200, (1.0, 0.97, 0.94))
area('fill', (5.0, -2.5, 8.0), 9.0, 420, (0.85, 0.92, 1.0))
area('rim', (0.0, -7.0, 3.0), 5.0, 260, (0.9, 0.95, 1.0))

cam = bpy.data.cameras.new('cam')
cam.lens = 100
cam.sensor_fit = 'HORIZONTAL'
cam.sensor_width = 36
cam.clip_end = 100
camob = bpy.data.objects.new('cam', cam)
bpy.context.collection.objects.link(camob)
camob.location = (0, 0, 6.24 * 100 / 36)
camob.rotation_euler = (0, 0, 0)
scene.camera = camob

# ---------------------------------------------------------------- render
scene.render.engine = 'CYCLES'
cy = scene.cycles
cy.samples = SAMPLES
cy.use_denoising = True
try:
    cy.denoiser = 'OPENIMAGEDENOISE'
except Exception:
    pass
cy.max_bounces = 8
cy.transmission_bounces = 8
cy.glossy_bounces = 6
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    cy.device = 'GPU'
except Exception as ex:
    print('GPU setup failed, using CPU:', ex)
    cy.device = 'CPU'

scene.render.resolution_x = int(1872 * SCALE)
scene.render.resolution_y = int(2352 * SCALE)
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '8'
scene.render.filepath = OUT
try:
    scene.view_settings.view_transform = 'Khronos PBR Neutral'
    scene.view_settings.exposure = -0.1
except Exception as ex:
    print('view transform fallback:', ex)
    try:
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.exposure = -0.2
    except Exception:
        pass
W_PX, H_PX = scene.render.resolution_x, scene.render.resolution_y
PX_PER_UNIT = 300.0


def px_box(cx, cy, w, h):
    """Integer pixel box (x0, y0, x1, y1), top-left origin, for a centered rect given in scene units."""
    x0 = int(math.floor((cx - w / 2 + 3.12) * PX_PER_UNIT))
    x1 = int(math.ceil((cx + w / 2 + 3.12) * PX_PER_UNIT))
    y0 = int(math.floor((3.92 - (cy + h / 2)) * PX_PER_UNIT))
    y1 = int(math.ceil((3.92 - (cy - h / 2)) * PX_PER_UNIT))
    return x0, y0, x1, y1


def render_crop(path, box):
    if ONLY and __import__('pathlib').Path(path).stem not in ONLY: return
    x0, y0, x1, y1 = box
    r = scene.render
    r.use_border = True
    r.use_crop_to_border = True
    r.border_min_x = (x0 + 0.01) / W_PX
    r.border_max_x = (x1 + 0.01) / W_PX
    r.border_min_y = (H_PX - y1 + 0.01) / H_PX
    r.border_max_y = (H_PX - y0 + 0.01) / H_PX
    r.filepath = path
    bpy.ops.render.render(write_still=True)


def part(name):
    return bpy.data.objects[name]


PART_PREFIXES = ('agent', 'em_a', 'cmd', 'ptt', 'em_ptt', 'dome', 'dial_knob')


def hide_parts(visible=()):
    for ob in bpy.data.objects:
        if ob.name.startswith(PART_PREFIXES):
            ob.hide_render = ob.name not in visible


if MODE == 'hero':
    bpy.ops.render.render(write_still=True)
    print('RENDER_DONE', OUT, W_PX, H_PX)
elif MODE == 'base':
    hide_parts()
    scene.render.use_border = False
    scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print('RENDER_DONE', OUT, W_PX, H_PX)
else:
    import json, os
    assert OUTDIR and SCALE == 1.0, 'sprite mode needs an output folder and scale 1.0'
    os.makedirs(OUTDIR, exist_ok=True)
    manifest = {'pxPerPt': 3, 'basePt': {'w': 624, 'h': 784}, 'sprites': {}}

    TONES = {  # name: (hex, emitter strength)
        'amber': ('#FFB020', 2.4), 'violet': ('#BBA2FF', 3.2), 'blue': ('#5BAEFF', 1.6),
        'green': ('#5FD38D', 1.3), 'red': ('#FF7A8A', 2.4), 'gray': ('#8794A6', 0.9),
    }
    frost_mats = {t: frosted('frost_' + t, h) for t, (h, _) in TONES.items()}
    frost_mats['off'] = material('frost_off', '#59616D', metallic=0.0, rough=0.5, Transmission_Weight=0.5, IOR=1.46)
    em_mats = {t: emitter('em_' + t, h, s) for t, (h, s) in TONES.items()}

    def record(name, box, shape, radius=0):
        x0, y0, x1, y1 = box
        manifest['sprites'][name] = {'file': name + '.png', 'x': x0 / 3.0, 'y': y0 / 3.0, 'w': (x1 - x0) / 3.0, 'h': (y1 - y0) / 3.0,
                                     'px': {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0}, 'mask': shape, 'radiusPx': radius}

    # agent keys: rendered in place at the reference slot (column 2, row 1)
    ref_x, ref_y = CX[1], AGENT_Y[0]
    box = px_box(ref_x, ref_y, 1.14, 1.18)
    cap, em = part('agent1'), part('em_a1')
    cap_z = 0.025   # resting height of an agent cap (hero lifts agent1 for its selected look)
    for tone in list(TONES) + ['off']:
        for state, dz, gain in (('up', 0.0, 1.0), ('pressed', -0.03, 1.15), ('selected', 0.035, 1.7)):
            hide_parts(('agent1', 'em_a1') if tone != 'off' else ('agent1',))
            cap.data.materials[0] = frost_mats[tone]
            cap.location.z = cap_z + dz
            if tone != 'off':
                em.data.materials[0] = em_mats[tone]
                em.data.materials[0].node_tree.nodes['Emission'].inputs['Strength'].default_value = TONES[tone][1] * gain
            name = f'agent_{tone}_{state}'
            render_crop(os.path.join(OUTDIR, name + '.png'), box)
            record(name, box, 'rrect', 60)
    cap.location.z = cap_z

    # command keys: reference slot (column 2, row 1)
    cmd_ref = part('cmd10')
    cz = cmd_ref.location.z
    cbox = px_box(CMD_X[1], CMD_Y[0], 0.74, 1.18)
    for state, dz in (('up', 0.0), ('pressed', -0.03)):
        hide_parts(('cmd10',))
        cmd_ref.location.z = cz + dz
        name = f'cmd_{state}'
        render_crop(os.path.join(OUTDIR, name + '.png'), cbox)
        record(name, cbox, 'rrect', 54)
    cmd_ref.location.z = cz

    # push-to-talk
    pz = part('ptt').location.z
    pbox = px_box(PTT[0], PTT[1], 1.18, 1.22)
    for state, dz, gain in (('up', 0.0, 1.0), ('pressed', -0.03, 1.0), ('active', 0.0, 1.0)):
        hide_parts(('ptt', 'em_ptt'))
        part('ptt').location.z = pz + dz
        part('em_ptt').data.materials[0].node_tree.nodes['Emission'].inputs['Strength'].default_value = 2.2 * (3.0 if state == 'active' else 1.0)
        name = f'ptt_{state}'
        render_crop(os.path.join(OUTDIR, name + '.png'), pbox)
        record(name, pbox, 'rrect', 66)
    part('ptt').location.z = pz
    part('em_ptt').data.materials[0].node_tree.nodes['Emission'].inputs['Strength'].default_value = 2.2

    # joystick: five tilts of the dome
    jbox = px_box(STICK[0], STICK[1], 1.12, 1.12)
    tilts = {'center': (0, 0), 'left': (0, -0.2), 'right': (0, 0.2), 'up': (-0.2, 0), 'down': (0.2, 0)}
    for name_, (rx, ry) in tilts.items():
        hide_parts(('dome',))
        dome.rotation_euler = (rx, ry, 0)
        name = f'stick_{name_}'
        render_crop(os.path.join(OUTDIR, name + '.png'), jbox)
        record(name, jbox, 'circle', 0)
    dome.rotation_euler = (0, 0, 0)

    # dial knob
    hide_parts(('dial_knob',))
    dbox = px_box(DIAL[0], DIAL[1], 1.12, 1.12)
    render_crop(os.path.join(OUTDIR, 'dial.png'), dbox)
    record('dial', dbox, 'circle', 0)

    manifest['layout'] = {
        'agentSlotsPt': [[round((x + 3.12) * 100 - 50, 2), round((3.92 - y) * 100 - 52, 2)] for y in AGENT_Y for x in CX],
        'cmdSlotsPt': [[round((x + 3.12) * 100 - 30, 2), round((3.92 - y) * 100 - 52, 2)] for y in CMD_Y for x in CMD_X],
        'agentSpriteRefPt': [round((ref_x + 3.12) * 100 - 50, 2), round((3.92 - ref_y) * 100 - 52, 2)],
    }
    with open(os.path.join(OUTDIR, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    print('SPRITES_DONE', len(manifest['sprites']))
