import math
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[3]
DESIGN_ROOT = REPO_ROOT / "design" / "pip-character"
GENERATED_ROOT = DESIGN_ROOT / "generated"
PREVIEW_ROOT = GENERATED_ROOT / "previews"
REFERENCE_CROP_ROOT = DESIGN_ROOT / "references" / "crops" / "v001"
BLEND_PATH = GENERATED_ROOT / "pip_v001_generated.blend"


COLLECTION_NAMES = [
    "Pip_Core",
    "Pip_Branch",
    "Pip_Expressions",
    "Cameras",
    "Lights",
    "Reference",
]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)

    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)

    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)

    for curve in list(bpy.data.curves):
        bpy.data.curves.remove(curve)

    for image in list(bpy.data.images):
        bpy.data.images.remove(image)


def make_collections():
    collections = {}
    for name in COLLECTION_NAMES:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
        collections[name] = collection
    return collections


def link_to_collection(obj, collection):
    for existing_collection in list(obj.users_collection):
        existing_collection.objects.unlink(obj)
    collection.objects.link(obj)


def make_principled_material(name, color, roughness=0.85, metallic=0.0, alpha=1.0, bump_strength=0.0, bump_scale=40.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    material.blend_method = "BLEND" if alpha < 1.0 else "OPAQUE"

    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = color
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.35
        elif "Specular" in bsdf.inputs:
            bsdf.inputs["Specular"].default_value = 0.35

        if bump_strength > 0 and "Normal" in bsdf.inputs:
            noise = material.node_tree.nodes.new(type="ShaderNodeTexNoise")
            noise.name = f"{name} fine clay grain"
            noise.inputs["Scale"].default_value = bump_scale
            noise.inputs["Detail"].default_value = 11
            noise.inputs["Roughness"].default_value = 0.58

            bump = material.node_tree.nodes.new(type="ShaderNodeBump")
            bump.name = f"{name} soft bump"
            bump.inputs["Strength"].default_value = bump_strength
            bump.inputs["Distance"].default_value = 0.045

            material.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
            material.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return material


def make_materials():
    return {
        "Pip Sage Matte": make_principled_material("Pip Sage Matte", (0.50, 0.55, 0.41, 1), 0.96, bump_strength=0.075, bump_scale=64.0),
        "Pip Sage Dark": make_principled_material("Pip Sage Dark", (0.51, 0.56, 0.42, 1), 0.96, bump_strength=0.050, bump_scale=52.0),
        "Pip Ink": make_principled_material("Pip Ink", (0.035, 0.034, 0.03, 1), 0.7),
        "Pip Eye Gloss": make_principled_material("Pip Eye Gloss", (0.02, 0.019, 0.016, 1), 0.24),
        "Pip Leaf": make_principled_material("Pip Leaf", (0.22, 0.31, 0.16, 1), 0.94, bump_strength=0.055, bump_scale=38.0),
        "Pip Branch Stem": make_principled_material("Pip Branch Stem", (0.17, 0.24, 0.11, 1), 0.92, bump_strength=0.045, bump_scale=42.0),
        "Warm Cream Background": make_principled_material("Warm Cream Background", (0.86, 0.81, 0.72, 1), 0.92),
    }


def shade_smooth(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)


def create_body(collections, materials):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=128,
        ring_count=64,
        location=(0, 0, 0.92),
        scale=(0.60, 0.50, 0.88),
    )
    body = bpy.context.object
    body.name = "Pip_Body_Unified_Pebble"
    body.data.name = "Pip_Body_Unified_Pebble_Mesh"
    link_to_collection(body, collections["Pip_Core"])
    body.data.materials.append(materials["Pip Sage Matte"])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    for vertex in body.data.vertices:
        z = vertex.co.z
        normalized_z = max(0.0, min(1.0, (z + 0.88) / 1.76))
        lower_belly = math.exp(-((normalized_z - 0.31) ** 2) / 0.080)
        base_weight = max(0.0, 1.0 - normalized_z)
        crown_taper = max(0.0, normalized_z - 0.66)
        soft_shoulder = math.exp(-((normalized_z - 0.55) ** 2) / 0.16)

        radius_factor = 0.98 + 0.09 * lower_belly + 0.04 * base_weight + 0.015 * soft_shoulder - 0.10 * crown_taper
        vertex.co.x *= radius_factor
        vertex.co.y *= radius_factor * (0.98 - 0.04 * normalized_z)

        if z < -0.76:
            vertex.co.z = -0.76 + (z + 0.76) * 0.10

        if 0.18 < normalized_z < 0.74 and vertex.co.y < 0:
            vertex.co.y *= 0.985

    body.data.update()

    subdivision = body.modifiers.new("Soft editable subdivision", "SUBSURF")
    subdivision.levels = 1
    subdivision.render_levels = 2

    clay_noise = bpy.data.textures.new("Pip_Clay_Subtle_Surface_Noise", "CLOUDS")
    clay_noise.noise_scale = 0.88
    clay_noise.noise_depth = 4
    clay_noise.contrast = 1.25

    displace = body.modifiers.new("Subtle clay surface bump", "DISPLACE")
    displace.strength = 0.016
    displace.texture = clay_noise

    shade_smooth(body)
    body["pip_identity"] = "sage_pebble_body"
    body["production_rule"] = "one_unified_body_no_separate_head_or_torso"
    return body


def create_curve_object(name, points, bevel_depth, material, collection, resolution=14):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 5
    curve.fill_mode = "FULL"
    curve.use_fill_caps = True
    curve.use_path = False

    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"

    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(material)
    collection.objects.link(obj)
    return obj


def create_face(collections, materials):
    eye_locations = {
        "Pip_Eye_Left": (-0.175, -0.455, 1.225),
        "Pip_Eye_Right": (0.175, -0.455, 1.225),
    }

    for name, location in eye_locations.items():
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=32,
            ring_count=16,
            location=location,
            scale=(0.042, 0.012, 0.042),
        )
        eye = bpy.context.object
        eye.name = name
        eye.data.name = f"{name}_Mesh"
        link_to_collection(eye, collections["Pip_Core"])
        eye.data.materials.append(materials["Pip Eye Gloss"])
        shade_smooth(eye)

    mouth_specs = {
        "Expression_Mouth_Normal": [
            Vector((-0.115, -0.532, 1.090)),
            Vector((-0.055, -0.540, 1.055)),
            Vector((0.0, -0.543, 1.043)),
            Vector((0.055, -0.540, 1.055)),
            Vector((0.115, -0.532, 1.090)),
        ],
        "Expression_Mouth_Happy": [
            Vector((-0.125, -0.532, 1.100)),
            Vector((-0.050, -0.543, 1.035)),
            Vector((0.0, -0.546, 1.020)),
            Vector((0.050, -0.543, 1.035)),
            Vector((0.125, -0.532, 1.100)),
        ],
        "Expression_Mouth_Careful": [
            Vector((-0.090, -0.536, 1.065)),
            Vector((-0.028, -0.540, 1.063)),
            Vector((0.028, -0.540, 1.063)),
            Vector((0.090, -0.536, 1.065)),
        ],
        "Expression_Mouth_Concerned": [
            Vector((-0.115, -0.534, 1.045)),
            Vector((-0.055, -0.542, 1.078)),
            Vector((0.0, -0.545, 1.088)),
            Vector((0.055, -0.542, 1.078)),
            Vector((0.115, -0.534, 1.045)),
        ],
        "Expression_Mouth_Uncertain": [
            Vector((-0.090, -0.536, 1.068)),
            Vector((-0.028, -0.543, 1.085)),
            Vector((0.028, -0.536, 1.058)),
            Vector((0.090, -0.543, 1.075)),
        ],
        "Expression_Mouth_Shortfall": [
            Vector((-0.100, -0.534, 1.075)),
            Vector((-0.043, -0.541, 1.040)),
            Vector((0.0, -0.544, 1.034)),
            Vector((0.043, -0.541, 1.040)),
            Vector((0.100, -0.534, 1.075)),
        ],
    }

    for name, points in mouth_specs.items():
        mouth = create_curve_object(name, points, 0.0075, materials["Pip Ink"], collections["Pip_Expressions"])
        mouth.visible_shadow = False
        mouth.hide_viewport = name != "Expression_Mouth_Normal"
        mouth.hide_render = name != "Expression_Mouth_Normal"

    brow_specs = {
        "Expression_Brow_Concerned_Left": [
            Vector((-0.255, -0.510, 1.365)),
            Vector((-0.215, -0.515, 1.388)),
            Vector((-0.165, -0.510, 1.374)),
        ],
        "Expression_Brow_Concerned_Right": [
            Vector((0.165, -0.510, 1.374)),
            Vector((0.215, -0.515, 1.388)),
            Vector((0.255, -0.510, 1.365)),
        ],
        "Expression_Brow_Careful_Left": [
            Vector((-0.255, -0.510, 1.382)),
            Vector((-0.215, -0.515, 1.398)),
            Vector((-0.165, -0.510, 1.398)),
        ],
        "Expression_Brow_Careful_Right": [
            Vector((0.160, -0.510, 1.405)),
            Vector((0.215, -0.515, 1.382)),
            Vector((0.265, -0.510, 1.376)),
        ],
        "Expression_Eye_Closed_Left": [
            Vector((-0.235, -0.515, 1.230)),
            Vector((-0.175, -0.522, 1.204)),
            Vector((-0.115, -0.515, 1.230)),
        ],
        "Expression_Eye_Closed_Right": [
            Vector((0.115, -0.515, 1.230)),
            Vector((0.175, -0.522, 1.204)),
            Vector((0.235, -0.515, 1.230)),
        ],
    }

    for name, points in brow_specs.items():
        brow = create_curve_object(name, points, 0.008, materials["Pip Ink"], collections["Pip_Expressions"])
        brow.visible_shadow = False
        brow.hide_viewport = True
        brow.hide_render = True


def create_arms(collections, materials):
    arm_material = materials["Pip Sage Dark"]
    core = collections["Pip_Core"]

    left = create_curve_object(
        "Pip_Left_Arm_Soft_Capsule",
        [
            Vector((-0.430, -0.390, 0.815)),
            Vector((-0.375, -0.465, 0.720)),
            Vector((-0.270, -0.512, 0.682)),
            Vector((-0.180, -0.500, 0.710)),
        ],
        0.052,
        arm_material,
        core,
    )
    left["pip_identity"] = "tiny_rounded_arm"

    right = create_curve_object(
        "Pip_Right_Arm_Holding_Branch",
        [
            Vector((0.170, -0.465, 0.770)),
            Vector((0.275, -0.520, 0.675)),
            Vector((0.385, -0.532, 0.695)),
            Vector((0.465, -0.530, 0.775)),
        ],
        0.052,
        arm_material,
        core,
    )
    right["pip_identity"] = "tiny_rounded_arm_branch_hold"

    blend_specs = [
        ("Pip_Left_Arm_Root_Blend", (-0.432, -0.382, 0.815), (0.086, 0.032, 0.090)),
        ("Pip_Left_Arm_Hand_Round", (-0.182, -0.502, 0.710), (0.054, 0.026, 0.050)),
        ("Pip_Right_Arm_Root_Blend", (0.170, -0.455, 0.770), (0.082, 0.032, 0.084)),
        ("Pip_Right_Arm_Hand_Round", (0.465, -0.530, 0.775), (0.052, 0.026, 0.048)),
    ]
    for name, location, scale in blend_specs:
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=32,
            ring_count=16,
            location=location,
            scale=scale,
        )
        blend = bpy.context.object
        blend.name = name
        blend.data.name = f"{name}_Mesh"
        link_to_collection(blend, core)
        blend.data.materials.append(arm_material)
        shade_smooth(blend)

    wave = create_curve_object(
        "Pip_Left_Arm_Wave",
        [
            Vector((-0.430, -0.390, 0.850)),
            Vector((-0.520, -0.470, 1.000)),
            Vector((-0.585, -0.505, 1.165)),
            Vector((-0.535, -0.490, 1.285)),
        ],
        0.050,
        arm_material,
        core,
    )
    wave.hide_viewport = True
    wave.hide_render = True


def add_leaf(name, location, angle_degrees, scale, materials, collections, tiny=False):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=40,
        ring_count=16,
        location=location,
        rotation=(math.radians(4), math.radians(angle_degrees), 0),
        scale=scale,
    )
    leaf = bpy.context.object
    leaf.name = name
    leaf.data.name = f"{name}_Mesh"
    link_to_collection(leaf, collections["Pip_Branch"])
    leaf.data.materials.append(materials["Pip Leaf"])
    shade_smooth(leaf)
    leaf["pip_identity"] = "leafy_branch_leaf"
    if tiny:
        leaf.hide_viewport = True
        leaf.hide_render = True
    return leaf


def add_leaf_details(name, attach, leaf_location, angle_degrees, leaf_length, materials, collections, tiny=False):
    branch_collection = collections["Pip_Branch"]
    attach_point = Vector(attach)
    leaf_center = Vector(leaf_location)

    petiole = create_curve_object(
        f"{name}_Petiole",
        [attach_point, leaf_center],
        0.0045 if not tiny else 0.0055,
        materials["Pip Branch Stem"],
        branch_collection,
        resolution=8,
    )

    direction = Vector((math.sin(math.radians(angle_degrees)), 0, math.cos(math.radians(angle_degrees))))
    vein_start = leaf_center - direction * (leaf_length * 0.34)
    vein_end = leaf_center + direction * (leaf_length * 0.34)
    vein_start.y -= 0.006
    vein_end.y -= 0.006
    vein = create_curve_object(
        f"{name}_Vein",
        [vein_start, vein_end],
        0.0025 if not tiny else 0.003,
        materials["Pip Branch Stem"],
        branch_collection,
        resolution=6,
    )

    for detail in (petiole, vein):
        detail.hide_viewport = tiny
        detail.hide_render = tiny


def create_branch(collections, materials):
    branch_collection = collections["Pip_Branch"]

    stem = create_curve_object(
        "Pip_Branch_Stem_Full",
        [
            Vector((0.225, -0.535, 0.420)),
            Vector((0.310, -0.526, 0.670)),
            Vector((0.395, -0.510, 0.915)),
            Vector((0.485, -0.490, 1.170)),
        ],
        0.0085,
        materials["Pip Branch Stem"],
        branch_collection,
    )
    stem["pip_identity"] = "mandatory_leafy_branch_stem"

    leaves = [
        ("Pip_Branch_Leaf_01", (0.345, -0.555, 0.705), (0.300, -0.527, 0.665), -52),
        ("Pip_Branch_Leaf_02", (0.235, -0.552, 0.785), (0.325, -0.524, 0.715), 46),
        ("Pip_Branch_Leaf_03", (0.430, -0.546, 0.895), (0.380, -0.514, 0.850), -46),
        ("Pip_Branch_Leaf_04", (0.325, -0.540, 0.980), (0.410, -0.508, 0.915), 44),
        ("Pip_Branch_Leaf_05", (0.505, -0.526, 1.070), (0.455, -0.500, 1.035), -36),
        ("Pip_Branch_Leaf_06", (0.400, -0.522, 1.160), (0.475, -0.494, 1.115), 34),
        ("Pip_Branch_Leaf_07", (0.535, -0.514, 1.235), (0.488, -0.490, 1.170), -18),
    ]

    for name, location, attach, angle in leaves:
        add_leaf_details(name, attach, location, angle, 0.070, materials, collections)
        add_leaf(name, location, angle, (0.030, 0.007, 0.070), materials, collections)

    tiny_stem = create_curve_object(
        "Tiny_Branch_Stem",
        [
            Vector((0.155, -0.500, 0.500)),
            Vector((0.235, -0.505, 0.735)),
            Vector((0.330, -0.488, 0.960)),
        ],
        0.010,
        materials["Pip Branch Stem"],
        branch_collection,
    )
    tiny_stem["pip_identity"] = "mandatory_tiny_leafy_branch_stem"
    tiny_stem.hide_viewport = True
    tiny_stem.hide_render = True

    tiny_leaves = [
        ("Tiny_Branch_Leaf_01", (0.270, -0.528, 0.755), (0.220, -0.505, 0.690), -44),
        ("Tiny_Branch_Leaf_02", (0.150, -0.525, 0.845), (0.260, -0.500, 0.790), 44),
        ("Tiny_Branch_Leaf_03", (0.370, -0.510, 0.960), (0.320, -0.490, 0.930), -30),
    ]

    for name, location, attach, angle in tiny_leaves:
        add_leaf_details(name, attach, location, angle, 0.062, materials, collections, tiny=True)
        add_leaf(name, location, angle, (0.034, 0.008, 0.068), materials, collections, tiny=True)


def create_lighting_and_background(collections, materials):
    bpy.ops.mesh.primitive_plane_add(size=5.5, location=(0, 0, 0.06))
    plane = bpy.context.object
    plane.name = "Pip_Contact_Shadow_Plane"
    link_to_collection(plane, collections["Lights"])
    plane.data.materials.append(materials["Warm Cream Background"])

    bpy.ops.object.light_add(type="AREA", location=(-2.6, -3.8, 4.5))
    key = bpy.context.object
    key.name = "Pip_Key_Area_Light"
    key.data.energy = 520
    key.data.size = 4.5
    link_to_collection(key, collections["Lights"])

    bpy.ops.object.light_add(type="POINT", location=(2.6, -2.2, 2.8))
    fill = bpy.context.object
    fill.name = "Pip_Soft_Fill_Light"
    fill.data.energy = 55
    fill.data.shadow_soft_size = 4.0
    link_to_collection(fill, collections["Lights"])

    bpy.context.scene.world.color = (0.86, 0.81, 0.72)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def create_camera(name, location, target, ortho_scale, collections):
    camera_data = bpy.data.cameras.new(name)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ortho_scale
    camera = bpy.data.objects.new(name, camera_data)
    camera.location = location
    look_at(camera, target)
    collections["Cameras"].objects.link(camera)
    return camera


def create_cameras(collections):
    target = (0, 0, 0.88)
    create_camera("Camera_Front", Vector((0, -5.8, 0.94)), target, 1.95, collections)
    create_camera("Camera_ThreeQuarter", Vector((3.1, -5.2, 1.00)), target, 2.02, collections)
    create_camera("Camera_Side", Vector((5.8, 0, 0.94)), target, 1.95, collections)
    create_camera("Camera_Back", Vector((0, 5.8, 0.94)), target, 1.95, collections)
    create_camera("Camera_Hero", Vector((2.7, -5.3, 1.08)), (0.05, 0, 0.88), 2.35, collections)
    create_camera("Camera_TinyAvatar", Vector((0, -6.2, 0.88)), target, 1.72, collections)


def create_image_material(name, image_path):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.blend_method = "BLEND"
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    image_node = nodes.new(type="ShaderNodeTexImage")
    image_node.image = bpy.data.images.load(str(image_path), check_existing=True)
    material.node_tree.links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
    if "Alpha" in bsdf.inputs:
        material.node_tree.links.new(image_node.outputs["Alpha"], bsdf.inputs["Alpha"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.9
    return material


def create_reference_plane(name, image_path, location, collections):
    if not image_path.exists():
        return

    image = bpy.data.images.load(str(image_path), check_existing=True)
    aspect = image.size[0] / image.size[1]
    width = 1.1
    height = width / aspect

    bpy.ops.mesh.primitive_plane_add(
        size=1,
        location=location,
        rotation=(math.radians(90), 0, 0),
    )
    plane = bpy.context.object
    plane.name = name
    plane.scale = (width, height, 1)
    link_to_collection(plane, collections["Reference"])
    plane.data.materials.append(create_image_material(f"{name}_Material", image_path))


def create_reference_planes(collections):
    create_reference_plane(
        "Reference_Front_Crop_Hidden",
        REFERENCE_CROP_ROOT / "front.png",
        (-1.55, 1.1, 1.35),
        collections,
    )
    create_reference_plane(
        "Reference_ThreeQuarter_Crop_Hidden",
        REFERENCE_CROP_ROOT / "three_quarter.png",
        (0.0, 1.1, 1.35),
        collections,
    )
    create_reference_plane(
        "Reference_Side_Crop_Hidden",
        REFERENCE_CROP_ROOT / "side.png",
        (1.55, 1.1, 1.35),
        collections,
    )
    collections["Reference"].hide_viewport = True
    collections["Reference"].hide_render = True


def set_branch_variant(tiny):
    for obj in bpy.data.collections["Pip_Branch"].objects:
        is_tiny = obj.name.startswith("Tiny_Branch")
        obj.hide_viewport = is_tiny != tiny
        obj.hide_render = is_tiny != tiny


def configure_render_settings():
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 48
        scene.cycles.use_denoising = True
    except Exception:
        pass
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1


def render_preview(camera_name, filename, tiny_branch=False):
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[camera_name]
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = False
    set_branch_variant(tiny_branch)
    scene.render.filepath = str(PREVIEW_ROOT / filename)
    bpy.ops.render.render(write_still=True)


def main():
    GENERATED_ROOT.mkdir(parents=True, exist_ok=True)
    PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)

    clear_scene()
    collections = make_collections()
    materials = make_materials()

    create_body(collections, materials)
    create_face(collections, materials)
    create_arms(collections, materials)
    create_branch(collections, materials)
    create_lighting_and_background(collections, materials)
    create_cameras(collections)
    create_reference_planes(collections)
    configure_render_settings()

    set_branch_variant(False)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    render_preview("Camera_Front", "front-preview.png", tiny_branch=False)
    render_preview("Camera_ThreeQuarter", "three-quarter-preview.png", tiny_branch=False)
    render_preview("Camera_Side", "side-preview.png", tiny_branch=False)
    render_preview("Camera_TinyAvatar", "tiny-avatar-preview.png", tiny_branch=True)

    set_branch_variant(False)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"Saved Pip v001 generated blend: {BLEND_PATH}")
    print(f"Saved quick previews: {PREVIEW_ROOT}")


if __name__ == "__main__":
    main()
