import math
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[3]
DESIGN_ROOT = REPO_ROOT / "design" / "pip-character"
GENERATED_ROOT = DESIGN_ROOT / "generated"
PREVIEW_ROOT = GENERATED_ROOT / "previews"
REFERENCE_ROOT = DESIGN_ROOT / "references" / "crops" / "v001"
BLEND_PATH = GENERATED_ROOT / "pip_v001_reference_matched.blend"

BODY_BASE_Z = 0.02
BODY_HEIGHT = 1.20
BODY_TOP_Z = BODY_BASE_Z + BODY_HEIGHT


def ensure_dir(path):
    Path(path).mkdir(parents=True, exist_ok=True)


def ensure_collection(name, parent=None):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    if parent is None:
        if collection.name not in bpy.context.scene.collection.children:
            try:
                bpy.context.scene.collection.children.link(collection)
            except RuntimeError:
                pass
    else:
        if collection.name not in parent.children:
            try:
                parent.children.link(collection)
            except RuntimeError:
                pass
    return collection


def unlink_from_collections(obj):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)


def link_to_collection(obj, collection):
    if obj.name not in collection.objects:
        collection.objects.link(obj)


def move_to_collection(obj, collection):
    unlink_from_collections(obj)
    collection.objects.link(obj)


def delete_collection_objects(collection):
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def make_collections():
    backup = ensure_collection("Backup")
    collections = {
        "Backup": backup,
        "Pip_Core": ensure_collection("Pip_Core"),
        "Pip_Face": ensure_collection("Pip_Face"),
        "Pip_Arms": ensure_collection("Pip_Arms"),
        "Pip_Branch": ensure_collection("Pip_Branch"),
        "Pip_Expressions": ensure_collection("Pip_Expressions"),
        "Reference_Working": ensure_collection("Reference_Working"),
        "Cameras": ensure_collection("Cameras"),
        "Lights": ensure_collection("Lights"),
    }
    return collections


def preserve_blockout_backup(collections):
    backup_root = collections["Backup"]
    blockout = ensure_collection("Pip_Blockout_To_Replace", backup_root)
    if len(blockout.objects) > 0:
        blockout.hide_viewport = True
        blockout.hide_render = True
        return

    source_collection_names = [
        "Pip_Core",
        "Pip_Face",
        "Pip_Arms",
        "Pip_Branch",
        "Pip_Expressions",
    ]
    seen = set()
    for collection_name in source_collection_names:
        collection = bpy.data.collections.get(collection_name)
        if not collection:
            continue
        for obj in collection.objects:
            if obj.name in seen:
                continue
            seen.add(obj.name)
            copy = obj.copy()
            if obj.data:
                copy.data = obj.data.copy()
            copy.name = f"{obj.name}_BlockoutBackup"
            copy.hide_viewport = True
            copy.hide_render = True
            blockout.objects.link(copy)

    blockout.hide_viewport = True
    blockout.hide_render = True


def clear_rebuild_collections(collections):
    for name in [
        "Pip_Core",
        "Pip_Face",
        "Pip_Arms",
        "Pip_Branch",
        "Pip_Expressions",
        "Reference_Working",
        "Cameras",
        "Lights",
    ]:
        delete_collection_objects(collections[name])


def hide_legacy_reference_objects():
    reference_collection = bpy.data.collections.get("Reference")
    if reference_collection:
        reference_collection.hide_render = True
        for obj in reference_collection.objects:
            obj.hide_render = True
            obj.hide_viewport = True
    for obj in bpy.data.objects:
        if obj.name.startswith("Reference_") and "Reference_Working" not in obj.name:
            obj.hide_render = True
            obj.hide_viewport = True


def make_material(
    name,
    color,
    roughness=0.9,
    specular=0.08,
    bump=False,
    bump_strength=0.02,
    bump_scale=55.0,
    bump_distance=0.035,
    sheen=0.0,
    tonal_low=0.90,
    tonal_high=1.06,
    noise_detail=13,
):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    material.blend_method = "OPAQUE"
    material.use_backface_culling = False

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = color
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        for key in ("Specular IOR Level", "Specular"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = specular
        for key in ("Sheen Weight", "Sheen"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = sheen

        if bump and "Normal" in bsdf.inputs:
            # Remove older procedural normal nodes created by previous runs.
            for node in list(nodes):
                if node.name.startswith(f"{name} procedural"):
                    nodes.remove(node)
            noise = nodes.new(type="ShaderNodeTexNoise")
            noise.name = f"{name} procedural fine fiber"
            noise.inputs["Scale"].default_value = bump_scale
            noise.inputs["Detail"].default_value = noise_detail
            noise.inputs["Roughness"].default_value = 0.62

            if "Base Color" in bsdf.inputs:
                color_ramp = nodes.new(type="ShaderNodeValToRGB")
                color_ramp.name = f"{name} procedural tonal variation"
                low = color_ramp.color_ramp.elements[0]
                high = color_ramp.color_ramp.elements[1]
                low.position = 0.24
                high.position = 1.0
                low.color = (
                    max(0.0, color[0] * tonal_low),
                    max(0.0, color[1] * tonal_low),
                    max(0.0, color[2] * tonal_low),
                    color[3],
                )
                high.color = (
                    min(1.0, color[0] * tonal_high),
                    min(1.0, color[1] * tonal_high),
                    min(1.0, color[2] * tonal_high),
                    color[3],
                )
                links.new(noise.outputs["Fac"], color_ramp.inputs["Fac"])
                links.new(color_ramp.outputs["Color"], bsdf.inputs["Base Color"])

            bump_node = nodes.new(type="ShaderNodeBump")
            bump_node.name = f"{name} procedural soft bump"
            bump_node.inputs["Strength"].default_value = bump_strength
            bump_node.inputs["Distance"].default_value = bump_distance
            links.new(noise.outputs["Fac"], bump_node.inputs["Height"])
            links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])

    return material


def make_alpha_material(name, color, alpha, roughness=0.95, specular=0.01):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (color[0], color[1], color[2], alpha)
    material.use_nodes = True
    material.blend_method = "BLEND"
    if hasattr(material, "use_screen_refraction"):
        material.use_screen_refraction = False

    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], alpha)
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        for key in ("Specular IOR Level", "Specular"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = specular
    return material


def make_emission_material(name, color, strength=1.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    material.blend_method = "OPAQUE"
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    output = nodes.new(type="ShaderNodeOutputMaterial")
    emission = nodes.new(type="ShaderNodeEmission")
    emission.inputs["Color"].default_value = color
    emission.inputs["Strength"].default_value = strength
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def make_alpha_image_material(name, image_path, alpha=0.42):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    material.blend_method = "BLEND"
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    for node in list(nodes):
        if node.type == "TEX_IMAGE":
            nodes.remove(node)
    image_node = nodes.new(type="ShaderNodeTexImage")
    image_node.image = bpy.data.images.load(str(image_path), check_existing=True)
    if bsdf:
        links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.92
    material.diffuse_color = (1.0, 1.0, 1.0, alpha)
    return material


def make_materials():
    return {
        "body": make_material(
            "Pip Final Body Sage Felt",
            (0.430, 0.455, 0.360, 1.0),
            roughness=0.985,
            specular=0.025,
            bump=True,
            bump_strength=0.011,
            bump_scale=132.0,
            bump_distance=0.024,
            sheen=0.18,
            tonal_low=0.940,
            tonal_high=1.045,
            noise_detail=15,
        ),
        "body_shadow": make_material(
            "Pip Final Contact Soft Sage",
            (0.395, 0.425, 0.330, 1.0),
            roughness=0.98,
            specular=0.02,
        ),
        "eye_socket_shadows": [
            make_alpha_material(
                "Pip Final Eye Socket Contact Core",
                (0.255, 0.295, 0.210),
                0.038,
                roughness=0.99,
                specular=0.0,
            ),
            make_alpha_material(
                "Pip Final Eye Socket Contact Mid",
                (0.255, 0.295, 0.210),
                0.020,
                roughness=0.99,
                specular=0.0,
            ),
            make_alpha_material(
                "Pip Final Eye Socket Contact Feather",
                (0.255, 0.295, 0.210),
                0.008,
                roughness=0.99,
                specular=0.0,
            ),
        ],
        "mouth_contact_shadow": make_alpha_material(
            "Pip Final Mouth Contact Soft Shadow",
            (0.235, 0.270, 0.195),
            0.060,
            roughness=0.99,
            specular=0.0,
        ),
        "arm_contact_shadows": [
            make_alpha_material(
                "Pip Final Arm Contact Shadow Core",
                (0.27, 0.31, 0.22),
                0.115,
                roughness=0.99,
                specular=0.0,
            ),
            make_alpha_material(
                "Pip Final Arm Contact Shadow Mid",
                (0.27, 0.31, 0.22),
                0.065,
                roughness=0.99,
                specular=0.0,
            ),
            make_alpha_material(
                "Pip Final Arm Contact Shadow Feather",
                (0.27, 0.31, 0.22),
                0.030,
                roughness=0.99,
                specular=0.0,
            ),
        ],
        "arm_attachment_blends": [
            make_alpha_material(
                "Pip Final Arm Attachment Blend Core",
                (0.468, 0.472, 0.360),
                0.320,
                roughness=0.99,
                specular=0.0,
            ),
            make_alpha_material(
                "Pip Final Arm Attachment Blend Mid",
                (0.468, 0.472, 0.360),
                0.155,
                roughness=0.99,
                specular=0.0,
            ),
            make_alpha_material(
                "Pip Final Arm Attachment Blend Feather",
                (0.468, 0.472, 0.360),
                0.052,
                roughness=0.99,
                specular=0.0,
            ),
        ],
        "arms": make_material(
            "Pip Final Arm Warm Sage Felt",
            (0.468, 0.472, 0.360, 1.0),
            roughness=0.985,
            specular=0.025,
            bump=True,
            bump_strength=0.008,
            bump_scale=118.0,
            bump_distance=0.022,
            sheen=0.16,
            tonal_low=0.955,
            tonal_high=1.035,
            noise_detail=15,
        ),
        "arms_front_facing": make_material(
            "Pip Final Arm Warm Sage Felt Front Facing",
            (0.468, 0.472, 0.360, 1.0),
            roughness=0.985,
            specular=0.025,
            bump=True,
            bump_strength=0.008,
            bump_scale=118.0,
            bump_distance=0.022,
            sheen=0.16,
            tonal_low=0.955,
            tonal_high=1.035,
            noise_detail=15,
        ),
        "eyes": make_material(
            "Pip Final Glossy Black Eye",
            (0.004, 0.004, 0.003, 1.0),
            roughness=0.44,
            specular=0.12,
        ),
        "highlight": make_material(
            "Pip Final Eye Pin Highlight",
            (1.0, 0.97, 0.88, 1.0),
            roughness=0.18,
            specular=0.22,
        ),
        "mouth": make_material(
            "Pip Final Soft Ink Mouth",
            (0.028, 0.026, 0.022, 1.0),
            roughness=0.78,
            specular=0.04,
        ),
        "stem": make_material(
            "Pip Final Branch Stem Muted Green Brown",
            (0.185, 0.250, 0.125, 1.0),
            roughness=0.90,
            specular=0.05,
            bump=True,
            bump_strength=0.004,
            bump_scale=68.0,
            bump_distance=0.018,
            sheen=0.05,
            tonal_low=0.920,
            tonal_high=1.040,
        ),
        "stem_front_facing": make_material(
            "Pip Final Branch Stem Muted Green Brown Front Facing",
            (0.185, 0.250, 0.125, 1.0),
            roughness=0.90,
            specular=0.05,
            bump=True,
            bump_strength=0.004,
            bump_scale=68.0,
            bump_distance=0.018,
            sheen=0.05,
            tonal_low=0.920,
            tonal_high=1.040,
        ),
        "leaf": make_material(
            "Pip Final Muted Olive Leaf",
            (0.225, 0.315, 0.168, 1.0),
            roughness=0.94,
            specular=0.04,
            bump=True,
            bump_strength=0.005,
            bump_scale=82.0,
            bump_distance=0.018,
            sheen=0.08,
            tonal_low=0.925,
            tonal_high=1.040,
        ),
        "leaf_front_facing": make_material(
            "Pip Final Muted Olive Leaf Front Facing",
            (0.225, 0.315, 0.168, 1.0),
            roughness=0.94,
            specular=0.04,
            bump=True,
            bump_strength=0.005,
            bump_scale=82.0,
            bump_distance=0.018,
            sheen=0.08,
            tonal_low=0.925,
            tonal_high=1.040,
        ),
        "leaf_vein": make_material(
            "Pip Final Subtle Leaf Vein",
            (0.20, 0.27, 0.14, 1.0),
            roughness=0.96,
            specular=0.025,
        ),
        "ground": make_material(
            "Pip Final Warm Cream Ground",
            (0.86, 0.82, 0.74, 1.0),
            roughness=0.96,
            specular=0.02,
        ),
        "backdrop": make_emission_material(
            "Pip Final Warm Cream Backdrop",
            (0.985, 0.955, 0.885, 1.0),
            strength=0.95,
        ),
        "guide": make_material(
            "Pip Final Reference Guide Blue",
            (0.25, 0.36, 0.74, 1.0),
            roughness=0.8,
            specular=0.02,
        ),
        "ground_shadow": make_alpha_material(
            "Pip Final Soft Ground Contact Shadow",
            (0.38, 0.39, 0.31),
            0.030,
            roughness=0.99,
            specular=0.0,
        ),
        "ground_shadow_layers": [
            make_alpha_material(
                "Pip Final Soft Ground Contact Core",
                (0.38, 0.39, 0.31),
                0.050,
                roughness=0.99,
                specular=0.0,
            ),
            make_alpha_material(
                "Pip Final Soft Ground Contact Mid",
                (0.38, 0.39, 0.31),
                0.022,
                roughness=0.99,
                specular=0.0,
            ),
            make_alpha_material(
                "Pip Final Soft Ground Contact Feather",
                (0.38, 0.39, 0.31),
                0.006,
                roughness=0.99,
                specular=0.0,
            ),
        ],
    }


def smoothstep(edge0, edge1, value):
    if edge0 == edge1:
        return 0.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def body_z(t):
    return BODY_BASE_Z + BODY_HEIGHT * t


def interpolate_profile_curve(points, t):
    if t <= points[0][0]:
        return points[0][1]
    if t >= points[-1][0]:
        return points[-1][1]
    for index in range(len(points) - 1):
        t0, v0 = points[index]
        t1, v1 = points[index + 1]
        if t0 <= t <= t1:
            local = smoothstep(0.0, 1.0, (t - t0) / (t1 - t0))
            return v0 + (v1 - v0) * local
    return points[-1][1]


def body_profile_at_t(t):
    # Smooth reference-scaled profile. The dense and low-frequency sampled
    # profile attempts improved mask metrics but created visible banding and a
    # pinched cap in final renders, so this keeps a continuous analytic curve
    # while preserving the narrower reference-derived width/depth.
    t = max(0.0, min(1.0, t))
    belly_t = 0.305
    max_rx = 0.486
    max_ry = 0.410
    contact_rx = 0.180
    contact_ry = 0.104

    if t <= belly_t:
        lower = (1.0 - math.exp(-t / 0.060)) / (1.0 - math.exp(-belly_t / 0.060))
        lower = max(0.0, min(1.0, lower))
        lower = lower ** 0.82
        rx = contact_rx + (max_rx - contact_rx) * lower
        ry = contact_ry + (max_ry - contact_ry) * lower
    else:
        u = (t - belly_t) / (1.0 - belly_t)
        dome = math.sqrt(max(0.0, 1.0 - u * u))
        shoulder_softness = 1.0 - 0.035 * smoothstep(0.45, 0.78, t)
        rx = max_rx * dome * shoulder_softness
        ry = max_ry * dome
        if t > 0.920:
            apex_soft = smoothstep(0.920, 1.0, t)
            rx *= 1.0 - 0.025 * apex_soft
            ry *= 1.0 - 0.020 * apex_soft
    return rx, ry


def body_profile_at_z(z):
    t = max(0.0, min(1.0, (z - BODY_BASE_Z) / BODY_HEIGHT))
    return body_profile_at_t(t)


def body_front_y(x, z, inset=0.0):
    rx, ry = body_profile_at_z(z)
    if rx <= 0.001:
        return -inset
    ratio = max(0.0, min(1.0, 1.0 - (x / rx) ** 2))
    return -ry * math.sqrt(ratio) * 0.985 - inset


def body_front_attachment_dent(x, z):
    dents = [
        (-0.278, body_z(0.392), 0.160, 0.144, 0.020),
        (0.278, body_z(0.392), 0.158, 0.142, 0.020),
        (-0.154, body_z(0.262), 0.118, 0.078, 0.010),
        (0.232, body_z(0.316), 0.112, 0.082, 0.012),
    ]
    amount = 0.0
    for center_x, center_z, width, height, depth in dents:
        dx = (x - center_x) / width
        dz = (z - center_z) / height
        amount += depth * math.exp(-2.7 * (dx * dx + dz * dz))
    return amount


def lower_body_direct_deform(t, angle, x, y):
    lower_roll = 1.0 - smoothstep(0.0, 0.235, t)
    if lower_roll <= 0.0:
        radial_scale = 1.0
    else:
        radial_scale = 1.0 - 0.055 * lower_roll
    x *= radial_scale
    y *= radial_scale

    lower_side_trim = smoothstep(0.035, 0.120, t) * (1.0 - smoothstep(0.205, 0.305, t))
    side_axis = abs(math.cos(angle)) ** 2.4
    x *= 1.0 - 0.026 * lower_side_trim * side_axis

    audited_sidewall_trim = smoothstep(0.245, 0.360, t) * (1.0 - smoothstep(0.735, 0.880, t))
    audited_lower_sidewall_trim = smoothstep(0.110, 0.190, t) * (1.0 - smoothstep(0.290, 0.390, t))
    local_sidewall_axis = abs(math.cos(angle)) ** 3.2
    x *= 1.0 - (0.064 * audited_sidewall_trim + 0.026 * audited_lower_sidewall_trim) * local_sidewall_axis

    mid_depth_fullness = smoothstep(0.240, 0.390, t) * (1.0 - smoothstep(0.560, 0.720, t))
    front_back_axis = abs(math.sin(angle)) ** 2.2
    y *= 1.0 + 0.030 * mid_depth_fullness * front_back_axis

    upper_shoulder_taper = smoothstep(0.720, 0.940, t)
    upper_scale = 1.0 - 0.060 * upper_shoulder_taper
    x *= upper_scale
    y *= upper_scale
    return x, y


def make_body(collections, materials):
    segments = 192
    rings = 128
    verts = [(0.0, 0.0, BODY_BASE_Z + BODY_HEIGHT * 0.001)]
    faces = []

    for ring in range(rings):
        linear_t = ring / rings
        t = 0.5 - 0.5 * math.cos(math.pi * linear_t)
        z = body_z(t)
        rx, ry = body_profile_at_t(t)
        for column in range(segments):
            angle = 2.0 * math.pi * column / segments
            middle = smoothstep(0.06, 0.42, t) * (1.0 - smoothstep(0.82, 1.0, t))
            handmade_x = 1.0 + middle * (0.010 * math.sin(angle * 2.0 + 0.55) + 0.006 * math.sin(angle * 3.0 + t * 5.0))
            handmade_y = 1.0 + middle * (0.012 * math.sin(angle * 2.0 - 0.35) + 0.004 * math.cos(angle * 5.0))
            base_edge_lift = 0.0
            if t < 0.105:
                side_weight = abs(math.cos(angle)) ** 5
                front_back_weight = abs(math.sin(angle)) ** 8
                low_handmade = 0.5 + 0.5 * math.sin(angle * 2.0 + 0.35)
                lift_weight = side_weight * 0.006 + front_back_weight * 0.0025 + low_handmade * 0.0005
                base_edge_lift = BODY_HEIGHT * lift_weight * (1.0 - smoothstep(0.0, 0.105, t))
            x = rx * math.cos(angle) * handmade_x
            y = ry * math.sin(angle) * handmade_y
            x, y = lower_body_direct_deform(t, angle, x, y)
            vertex_z = z + base_edge_lift
            if y < 0.0:
                y += body_front_attachment_dent(x, vertex_z)
                y *= 0.985
            verts.append((x, y, vertex_z))

    for column in range(segments):
        faces.append((0, 1 + ((column + 1) % segments), 1 + column))
    for ring in range(rings - 1):
        start_a = 1 + ring * segments
        start_b = 1 + (ring + 1) * segments
        for column in range(segments):
            faces.append(
                (
                    start_a + column,
                    start_a + ((column + 1) % segments),
                    start_b + ((column + 1) % segments),
                    start_b + column,
                )
            )
    last_ring = 1 + (rings - 1) * segments
    top_center = len(verts)
    verts.append((0.0, 0.0, BODY_TOP_Z))
    for column in range(segments):
        faces.append((last_ring + column, last_ring + ((column + 1) % segments), top_center))

    mesh = bpy.data.meshes.new("Pip_Body_ReferenceMatched_SculptMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    body = bpy.data.objects.new("Pip_Body_Unified_Pebble", mesh)
    body.data.materials.append(materials["body"])
    collections["Pip_Core"].objects.link(body)
    body["pip_identity"] = "unified_reference_matched_sage_pebble_body"
    body["reference_height"] = BODY_HEIGHT
    body["acceptance_note"] = "Custom sculptable mesh, not a scaled UV sphere."

    subdivision = body.modifiers.new("reference matched soft subdivision", "SUBSURF")
    subdivision.levels = 1
    subdivision.render_levels = 2

    body["surface_note"] = "Softness is shader based; no visible spike-like particle fuzz."

    return body


def make_ellipsoid_mesh(name, location, scale, material, collection, segments=40, rings=18, rotation=(0.0, 0.0, 0.0)):
    verts = [(0.0, 0.0, 1.0)]
    faces = []
    for ring in range(1, rings):
        theta = math.pi * ring / rings
        z = math.cos(theta)
        r = math.sin(theta)
        for column in range(segments):
            angle = 2.0 * math.pi * column / segments
            verts.append((r * math.cos(angle), r * math.sin(angle), z))
    bottom = len(verts)
    verts.append((0.0, 0.0, -1.0))
    for column in range(segments):
        faces.append((0, 1 + column, 1 + ((column + 1) % segments)))
    for ring in range(rings - 2):
        start_a = 1 + ring * segments
        start_b = 1 + (ring + 1) * segments
        for column in range(segments):
            faces.append(
                (
                    start_a + column,
                    start_b + column,
                    start_b + ((column + 1) % segments),
                    start_a + ((column + 1) % segments),
                )
            )
    last_ring = 1 + (rings - 2) * segments
    for column in range(segments):
        faces.append((last_ring + ((column + 1) % segments), last_ring + column, bottom))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.scale = scale
    obj.rotation_euler = rotation
    obj.data.materials.append(material)
    collection.objects.link(obj)
    return obj


def make_flat_ellipse(name, center, radius_x, radius_y, material, collection, segments=96):
    verts = [center]
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        verts.append((center[0] + math.cos(angle) * radius_x, center[1] + math.sin(angle) * radius_y, center[2]))
    faces = []
    for index in range(segments):
        faces.append((0, 1 + index, 1 + ((index + 1) % segments)))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    collection.objects.link(obj)
    return obj


def make_soft_ground_ellipse(name, center, radius_x, radius_y, materials, collection, segments=128):
    rings = len(materials)
    verts = [center]
    for ring in range(1, rings + 1):
        scale = ring / rings
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            verts.append((center[0] + math.cos(angle) * radius_x * scale, center[1] + math.sin(angle) * radius_y * scale, center[2]))

    faces = []
    material_indices = []
    for index in range(segments):
        faces.append((0, 1 + index, 1 + ((index + 1) % segments)))
        material_indices.append(0)
    for ring in range(1, rings):
        inner = 1 + (ring - 1) * segments
        outer = 1 + ring * segments
        for index in range(segments):
            faces.append((inner + index, outer + index, outer + ((index + 1) % segments), inner + ((index + 1) % segments)))
            material_indices.append(min(ring, len(materials) - 1))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for material in materials:
        mesh.materials.append(material)
    for polygon, material_index in zip(mesh.polygons, material_indices):
        polygon.use_smooth = True
        polygon.material_index = material_index
    obj = bpy.data.objects.new(name, mesh)
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    collection.objects.link(obj)
    return obj


def make_ground_contact_shadow(collections, materials):
    shadow = make_soft_ground_ellipse(
        "Pip_Ground_Soft_Contact_Shadow",
        (0.0, -0.054, BODY_BASE_Z - 0.033),
        0.430,
        0.124,
        materials["ground_shadow_layers"],
        collections["Pip_Core"],
        segments=128,
    )
    shadow["purpose"] = "multi-ring soft floor contact shadow to reduce mechanical flat-base read without a hard stripe"
    return shadow


def make_face_disc(name, x, z, radius_x, radius_z, material, collection, inset=0.006, segments=40):
    center = face_point(x, z, inset)
    verts = [tuple(center)]
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        px = x + math.cos(angle) * radius_x
        pz = z + math.sin(angle) * radius_z
        verts.append(tuple(face_point(px, pz, inset)))
    faces = []
    for index in range(segments):
        faces.append((0, 1 + index, 1 + ((index + 1) % segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    collection.objects.link(obj)
    obj["attachment"] = "surface-projected disc following body curvature"
    return obj


def make_face_soft_disc(name, x, z, radius_x, radius_z, materials, collection, inset=0.004, segments=64):
    rings = len(materials)
    verts = [tuple(face_point(x, z, inset))]
    for ring in range(1, rings + 1):
        scale = ring / rings
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            px = x + math.cos(angle) * radius_x * scale
            pz = z + math.sin(angle) * radius_z * scale
            verts.append(tuple(face_point(px, pz, inset)))

    faces = []
    material_indices = []
    for index in range(segments):
        faces.append((0, 1 + index, 1 + ((index + 1) % segments)))
        material_indices.append(0)
    for ring in range(1, rings):
        inner = 1 + (ring - 1) * segments
        outer = 1 + ring * segments
        for index in range(segments):
            faces.append((inner + index, outer + index, outer + ((index + 1) % segments), inner + ((index + 1) % segments)))
            material_indices.append(min(ring, len(materials) - 1))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for material in materials:
        mesh.materials.append(material)
    for polygon, material_index in zip(mesh.polygons, material_indices):
        polygon.use_smooth = True
        polygon.material_index = material_index
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["attachment"] = "soft radial contact shadow projected to Pip surface"
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    return obj


def make_face_soft_teardrop(name, x, z, radius_x, radius_z, materials, collection, direction=(0.0, -1.0), inset=0.005, segments=72):
    direction_x, direction_z = direction
    direction_length = math.hypot(direction_x, direction_z)
    if direction_length < 0.001:
        direction_x, direction_z = 0.0, -1.0
    else:
        direction_x /= direction_length
        direction_z /= direction_length

    rings = len(materials)
    verts = [tuple(face_point(x, z, inset))]
    for ring in range(1, rings + 1):
        scale = ring / rings
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            local_x = math.cos(angle)
            local_z = math.sin(angle)
            along = local_x * direction_x + local_z * direction_z
            across = -local_x * direction_z + local_z * direction_x
            organic = 1.0 + 0.060 * math.sin(angle * 3.0 + ring * 0.7) + 0.035 * math.cos(angle * 5.0 - ring)
            stretch = 1.0 + 0.30 * max(0.0, along) - 0.12 * max(0.0, -along)
            waist = 1.0 - 0.10 * abs(across) * max(0.0, along)
            px = x + local_x * radius_x * scale * organic * stretch * waist
            pz = z + local_z * radius_z * scale * organic * stretch
            verts.append(tuple(face_point(px, pz, inset)))

    faces = []
    material_indices = []
    for index in range(segments):
        faces.append((0, 1 + index, 1 + ((index + 1) % segments)))
        material_indices.append(0)
    for ring in range(1, rings):
        inner = 1 + (ring - 1) * segments
        outer = 1 + ring * segments
        for index in range(segments):
            faces.append((inner + index, outer + index, outer + ((index + 1) % segments), inner + ((index + 1) % segments)))
            material_indices.append(min(ring, len(materials) - 1))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for material in materials:
        mesh.materials.append(material)
    for polygon, material_index in zip(mesh.polygons, material_indices):
        polygon.use_smooth = True
        polygon.material_index = material_index
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["attachment"] = "transparent organic arm-color blend projected to Pip surface, not a hard root pad"
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    return obj


def make_curve(name, points, material, collection, bevel_depth=0.006, resolution=18, hide=False):
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 4
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(material)
    obj.hide_viewport = hide
    obj.hide_render = hide
    collection.objects.link(obj)
    return obj


def face_point(x, z, inset=0.008):
    return Vector((x, body_front_y(x, z, inset), z))


def make_face(collections, materials):
    eye_specs = [
        ("Pip_Eye_Left", -0.137, body_z(0.690)),
        ("Pip_Eye_Right", 0.137, body_z(0.690)),
    ]
    for name, x, z in eye_specs:
        socket = make_face_soft_disc(
            f"{name}_Socket_Shadow",
            x,
            z - 0.001,
            0.047,
            0.050,
            materials["eye_socket_shadows"],
            collections["Pip_Face"],
            inset=0.004,
            segments=56,
        )
        socket["attachment"] = "visible shallow socket/contact shadow around surface-projected eye"
        eye = make_face_disc(
            name,
            x,
            z + 0.001,
            0.031,
            0.035,
            materials["eyes"],
            collections["Pip_Face"],
            inset=0.012,
            segments=44,
        )
        eye["attachment"] = "surface-projected shallow eye; no side-view bead volume"
        highlight_x = x - 0.011
        highlight_z = z + 0.014
        make_face_disc(
            f"{name}_Highlight",
            highlight_x,
            highlight_z,
            0.0048,
            0.0058,
            materials["highlight"],
            collections["Pip_Face"],
            inset=0.014,
            segments=20,
        )

    mouth_points = [
        face_point(-0.078, body_z(0.590), 0.019),
        face_point(-0.034, body_z(0.560), 0.020),
        face_point(0.000, body_z(0.550), 0.020),
        face_point(0.034, body_z(0.560), 0.020),
        face_point(0.078, body_z(0.590), 0.019),
    ]
    mouth_shadow_points = [
        face_point(-0.078, body_z(0.590), 0.014),
        face_point(-0.034, body_z(0.560), 0.015),
        face_point(0.000, body_z(0.550), 0.015),
        face_point(0.034, body_z(0.560), 0.015),
        face_point(0.078, body_z(0.590), 0.014),
    ]
    mouth_shadow = make_curve(
        "Expression_Mouth_Normal_Contact_Shadow",
        mouth_shadow_points,
        materials["mouth_contact_shadow"],
        collections["Pip_Expressions"],
        bevel_depth=0.0062,
        resolution=24,
    )
    mouth_shadow["attachment"] = "subtle surface contact shadow behind the normal smile"
    mouth = make_curve(
        "Expression_Mouth_Normal",
        mouth_points,
        materials["mouth"],
        collections["Pip_Expressions"],
        bevel_depth=0.0042,
        resolution=24,
    )
    mouth["attachment"] = "surface-following projected smile"

    expression_specs = {
        "Expression_Mouth_Happy": [(-0.086, body_z(0.596)), (-0.038, body_z(0.536)), (0.000, body_z(0.520)), (0.038, body_z(0.536)), (0.086, body_z(0.596))],
        "Expression_Mouth_Careful": [(-0.068, body_z(0.566)), (-0.024, body_z(0.562)), (0.024, body_z(0.562)), (0.068, body_z(0.566))],
        "Expression_Mouth_Concerned": [(-0.077, body_z(0.548)), (-0.033, body_z(0.575)), (0.000, body_z(0.585)), (0.033, body_z(0.575)), (0.077, body_z(0.548))],
        "Expression_Mouth_Uncertain": [(-0.070, body_z(0.566)), (-0.024, body_z(0.582)), (0.024, body_z(0.552)), (0.070, body_z(0.570))],
        "Expression_Mouth_Shortfall": [(-0.075, body_z(0.576)), (-0.029, body_z(0.536)), (0.000, body_z(0.528)), (0.029, body_z(0.536)), (0.075, body_z(0.576))],
        "Expression_Eye_Closed_Left": [(-0.190, body_z(0.698)), (-0.145, body_z(0.676)), (-0.100, body_z(0.698))],
        "Expression_Eye_Closed_Right": [(0.100, body_z(0.698)), (0.145, body_z(0.676)), (0.190, body_z(0.698))],
        "Expression_Brow_Concerned_Left": [(-0.207, body_z(0.770)), (-0.158, body_z(0.788)), (-0.108, body_z(0.772))],
        "Expression_Brow_Concerned_Right": [(0.108, body_z(0.772)), (0.158, body_z(0.788)), (0.207, body_z(0.770))],
        "Expression_Brow_Careful_Left": [(-0.207, body_z(0.780)), (-0.158, body_z(0.792)), (-0.108, body_z(0.792))],
        "Expression_Brow_Careful_Right": [(0.108, body_z(0.794)), (0.158, body_z(0.778)), (0.207, body_z(0.772))],
    }
    for name, pairs in expression_specs.items():
        points = [face_point(x, z, 0.012) for x, z in pairs]
        obj = make_curve(
            name,
            points,
            materials["mouth"],
            collections["Pip_Expressions"],
            bevel_depth=0.0055,
            resolution=16,
            hide=True,
        )
        obj["attachment"] = "hidden expression variant projected to body surface"


def cubic_bezier(points, t):
    p0, p1, p2, p3 = [Vector(point) for point in points]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def make_tube_mesh(name, control_points, radii, material, collection, samples=28, sides=28, hide=False):
    path = []
    for index in range(samples):
        t = index / (samples - 1)
        path.append(cubic_bezier(control_points, t))

    verts = []
    faces = []
    y_axis = Vector((0.0, 1.0, 0.0))
    for index, point in enumerate(path):
        if index == 0:
            tangent = path[1] - point
        elif index == len(path) - 1:
            tangent = point - path[index - 1]
        else:
            tangent = path[index + 1] - path[index - 1]
        tangent.normalize()
        binormal = tangent.cross(y_axis)
        if binormal.length < 0.001:
            binormal = Vector((1.0, 0.0, 0.0))
        binormal.normalize()
        normal = binormal.cross(tangent)
        normal.normalize()
        u = index / (samples - 1)
        def unpack_radius(value):
            if isinstance(value, (tuple, list)):
                return float(value[0]), float(value[1])
            return float(value) * 0.92, float(value)

        start_normal, start_binormal = unpack_radius(radii[0])
        end_normal, end_binormal = unpack_radius(radii[1])
        root_squash = 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.22, u))
        normal_radius = (start_normal + (end_normal - start_normal) * smoothstep(0.0, 1.0, u)) * root_squash
        binormal_radius = start_binormal + (end_binormal - start_binormal) * smoothstep(0.0, 1.0, u)
        for side in range(sides):
            angle = 2.0 * math.pi * side / sides
            verts.append(point + normal * (math.cos(angle) * normal_radius) + binormal * (math.sin(angle) * binormal_radius))

    for index in range(samples - 1):
        a_start = index * sides
        b_start = (index + 1) * sides
        for side in range(sides):
            faces.append((a_start + side, a_start + ((side + 1) % sides), b_start + ((side + 1) % sides), b_start + side))

    start_center = len(verts)
    verts.append(path[0])
    end_center = len(verts)
    verts.append(path[-1])
    for side in range(sides):
        faces.append((start_center, side, (side + 1) % sides))
        end_a = (samples - 1) * sides + side
        end_b = (samples - 1) * sides + ((side + 1) % sides)
        faces.append((end_center, end_b, end_a))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    obj.hide_viewport = hide
    obj.hide_render = hide
    collection.objects.link(obj)
    return obj


def profile_radius_at(profile, u):
    if u <= profile[0][0]:
        return profile[0][1], profile[0][2]
    for index in range(len(profile) - 1):
        u0, n0, b0 = profile[index]
        u1, n1, b1 = profile[index + 1]
        if u <= u1:
            mix = smoothstep(u0, u1, u)
            return n0 + (n1 - n0) * mix, b0 + (b1 - b0) * mix
    return profile[-1][1], profile[-1][2]


def path_frame(path, index):
    point = path[index]
    if index == 0:
        tangent = path[1] - point
    elif index == len(path) - 1:
        tangent = point - path[index - 1]
    else:
        tangent = path[index + 1] - path[index - 1]
    tangent.normalize()
    y_axis = Vector((0.0, 1.0, 0.0))
    binormal = tangent.cross(y_axis)
    if binormal.length < 0.001:
        binormal = Vector((1.0, 0.0, 0.0))
    binormal.normalize()
    normal = binormal.cross(tangent)
    normal.normalize()
    return tangent, normal, binormal


def make_plush_limb_mesh(name, control_points, profile, material, collection, samples=34, sides=32, hide=False):
    path = []
    for index in range(samples):
        t = index / (samples - 1)
        path.append(cubic_bezier(control_points, t))

    rings = []
    frames = []
    for index, point in enumerate(path):
        u = index / (samples - 1)
        tangent, normal, binormal = path_frame(path, index)
        frames.append((tangent, normal, binormal))
        normal_radius, binormal_radius = profile_radius_at(profile, u)
        ring = []
        for side in range(sides):
            angle = 2.0 * math.pi * side / sides
            handmade = 1.0 + 0.018 * math.sin(side * 3.0 + u * 7.5) + 0.010 * math.cos(side * 5.0 + u * 4.0)
            mitten = smoothstep(0.64, 1.0, u)
            handmade += mitten * (0.030 * math.cos(angle - 0.85) + 0.018 * math.sin(angle * 2.0 + 0.40))
            ring.append(point + normal * (math.cos(angle) * normal_radius * handmade) + binormal * (math.sin(angle) * binormal_radius * handmade))
        rings.append(ring)

    tangent, normal, binormal = frames[-1]
    end_normal_radius, end_binormal_radius = profile_radius_at(profile, 1.0)
    cap_length = max(end_normal_radius, end_binormal_radius) * 0.95
    for cap_index in range(1, 5):
        theta = (math.pi * 0.5) * cap_index / 5
        center = path[-1] + tangent * (cap_length * math.sin(theta))
        normal_radius = end_normal_radius * math.cos(theta)
        binormal_radius = end_binormal_radius * math.cos(theta)
        ring = []
        for side in range(sides):
            angle = 2.0 * math.pi * side / sides
            ring.append(center + normal * (math.cos(angle) * normal_radius) + binormal * (math.sin(angle) * binormal_radius))
        rings.append(ring)
    end_tip = path[-1] + tangent * cap_length

    verts = [tuple(point) for ring in rings for point in ring]
    faces = []
    for ring_index in range(len(rings) - 1):
        a_start = ring_index * sides
        b_start = (ring_index + 1) * sides
        for side in range(sides):
            faces.append((a_start + side, a_start + ((side + 1) % sides), b_start + ((side + 1) % sides), b_start + side))

    tip_index = len(verts)
    verts.append(tuple(end_tip))
    last_start = (len(rings) - 1) * sides
    for side in range(sides):
        faces.append((last_start + side, last_start + ((side + 1) % sides), tip_index))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    obj.hide_viewport = hide
    obj.hide_render = hide
    collection.objects.link(obj)
    subdivision = obj.modifiers.new("single mesh plush limb smoothing", "SUBSURF")
    subdivision.levels = 1
    subdivision.render_levels = 1
    obj["attachment"] = "single domed plush limb mesh with buried root and integrated hand end"
    return obj


def make_oriented_grip_blockout(name, center, radius_u, radius_v, material, collection, rings=6, segments=64):
    horizontal = Vector((0.7981, 0.6026, 0.0))
    horizontal.normalize()
    vertical = Vector((0.0, 0.0, 1.0))
    normal = horizontal.cross(vertical)
    normal.normalize()
    center = Vector(center)

    verts = [tuple(center + normal * 0.006)]
    for ring in range(1, rings + 1):
        scale = ring / rings
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            u = math.cos(angle)
            v = math.sin(angle)
            organic = 1.0 + 0.035 * math.sin(angle * 3.0 + ring * 0.6) + 0.018 * math.cos(angle * 5.0)
            dome = normal * (0.018 * (1.0 - scale) + 0.004 * max(0.0, v))
            point = center + horizontal * (u * radius_u * scale * organic) + vertical * (v * radius_v * scale * organic) + dome
            verts.append(tuple(point))

    faces = []
    for index in range(segments):
        faces.append((0, 1 + index, 1 + ((index + 1) % segments)))
    for ring in range(1, rings):
        inner = 1 + (ring - 1) * segments
        outer = 1 + ring * segments
        for index in range(segments):
            faces.append((inner + index, outer + index, outer + ((index + 1) % segments), inner + ((index + 1) % segments)))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    collection.objects.link(obj)
    subdivision = obj.modifiers.new("sculptable grip blockout smoothing", "SUBSURF")
    subdivision.levels = 1
    subdivision.render_levels = 1
    obj["attachment"] = "three-quarter-oriented sculptable right hand/stem grip blockout"
    obj["blockout_note"] = "Targets missing three-quarter hand/branch silhouette; encode or replace with final sculpted grip."
    return obj


def make_camera_oriented_attached_leaf(name, base, tip, width, material, collection, length_steps=14, width_steps=8):
    horizontal = Vector((0.7981, 0.6026, 0.0))
    horizontal.normalize()
    vertical = Vector((0.0, 0.0, 1.0))
    plane_normal = horizontal.cross(vertical)
    plane_normal.normalize()

    base = Vector(base)
    tip = Vector(tip)
    axis = tip - base
    axis_length = axis.length
    if axis_length <= 0.0001:
        axis = horizontal * 0.001
        axis_length = axis.length
    axis_dir = axis.normalized()
    side = plane_normal.cross(axis_dir)
    if side.length <= 0.0001:
        side = vertical.copy()
    side.normalize()

    seed = sum(ord(char) for char in name)
    asymmetry = ((seed % 9) - 4) / 4.0
    twist = (((seed // 5) % 9) - 4) / 4.0

    verts = []
    for i in range(length_steps + 1):
        u = i / length_steps
        taper = math.sin(math.pi * u)
        taper = max(0.0, taper) ** 0.58
        taper *= 0.88 + 0.10 * math.sin(math.pi * u)
        center = base + axis * u
        center += side * (0.006 * asymmetry * math.sin(math.pi * u) * (1.0 - 0.25 * u))
        for j in range(width_steps + 1):
            v = -1.0 + 2.0 * j / width_steps
            edge_taper = 1.0 - 0.08 * abs(v)
            across = side * (v * width * taper * edge_taper)
            cup = plane_normal * (-0.0065 * taper * (1.0 - min(1.0, abs(v)) ** 1.7))
            twist_offset = plane_normal * (0.0025 * twist * (u - 0.5) * v * taper)
            rib = plane_normal * (0.0025 * taper * (1.0 - min(1.0, abs(v))))
            p = center + across + cup + twist_offset + rib
            verts.append(tuple(p))

    faces = []
    for i in range(length_steps):
        row = i * (width_steps + 1)
        next_row = (i + 1) * (width_steps + 1)
        for j in range(width_steps):
            faces.append((row + j, next_row + j, next_row + j + 1, row + j + 1))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    collection.objects.link(obj)
    subdivision = obj.modifiers.new("attached tapered leaf smoothing", "SUBSURF")
    subdivision.levels = 1
    subdivision.render_levels = 1
    obj["leaf_style"] = "attached tapered outer sprig leaf carrying three-quarter silhouette"
    obj["attachment"] = "base is tied to outer sprig stem; replaces temporary blockout patch"
    return obj


def make_camera_oriented_stem_ribbon(name, points, width, material, collection):
    horizontal = Vector((0.7981, 0.6026, 0.0))
    horizontal.normalize()
    vertical = Vector((0.0, 0.0, 1.0))
    plane_normal = horizontal.cross(vertical)
    plane_normal.normalize()
    points = [Vector(point) for point in points]

    verts = []
    for index, point in enumerate(points):
        if index == 0:
            tangent = points[1] - point
        elif index == len(points) - 1:
            tangent = point - points[index - 1]
        else:
            tangent = points[index + 1] - points[index - 1]
        if tangent.length <= 0.0001:
            tangent = vertical.copy()
        tangent.normalize()
        side = plane_normal.cross(tangent)
        if side.length <= 0.0001:
            side = horizontal.copy()
        side.normalize()
        taper = 0.72 + 0.28 * (1.0 - index / max(1, len(points) - 1))
        half_width = width * taper
        verts.append(tuple(point - side * half_width))
        verts.append(tuple(point + side * half_width))

    faces = []
    for index in range(len(points) - 1):
        faces.append((index * 2, index * 2 + 2, index * 2 + 3, index * 2 + 1))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    collection.objects.link(obj)
    obj["attachment"] = "front-facing ribbon stem for unified grip silhouette; avoids back protrusion"
    return obj


def make_arms(collections, materials):
    if hasattr(materials["arms_front_facing"], "use_backface_culling"):
        materials["arms_front_facing"].use_backface_culling = True

    for name, x, z, rx, rz, direction in [
        ("Pip_Left_Arm_Root_Soft_Blend", -0.334, body_z(0.386), 0.124, 0.108, (0.82, -0.58)),
        ("Pip_Right_Arm_Root_Soft_Blend", 0.326, body_z(0.388), 0.122, 0.106, (-0.46, -0.89)),
        ("Pip_Left_Hand_Body_Soft_Blend", -0.198, body_z(0.282), 0.100, 0.058, (0.92, -0.18)),
        ("Pip_Right_Hand_Body_Soft_Blend", 0.286, body_z(0.326), 0.100, 0.064, (-0.34, 0.94)),
    ]:
        blend = make_face_soft_teardrop(
            name,
            x,
            z,
            rx,
            rz,
            materials["arm_attachment_blends"],
            collections["Pip_Arms"],
            direction=direction,
            inset=0.005,
            segments=72,
        )
        blend["purpose"] = "soft arm-color transition so limb appears pressed into Pip's surface"

    for name, x, z, rx, rz in [
        ("Pip_Left_Arm_Root_Contact_Shadow", -0.316, body_z(0.392), 0.134, 0.120),
        ("Pip_Right_Arm_Root_Contact_Shadow", 0.314, body_z(0.392), 0.132, 0.118),
        ("Pip_Left_Hand_Body_Contact_Shadow", -0.184, body_z(0.278), 0.116, 0.068),
        ("Pip_Right_Hand_Body_Contact_Shadow", 0.286, body_z(0.326), 0.116, 0.074),
    ]:
        shadow = make_face_soft_disc(
            name,
            x,
            z,
            rx,
            rz,
            materials["arm_contact_shadows"],
            collections["Pip_Arms"],
            inset=0.006,
            segments=64,
        )
        shadow["attachment"] = "subtle arm/body compression shadow projected to Pip surface"

    left_path = [
        (-0.348, -0.142, body_z(0.410)),
        (-0.405, -0.276, body_z(0.374)),
        (-0.332, -0.410, body_z(0.310)),
        (-0.198, -0.428, body_z(0.280)),
    ]
    right_path = [
        (0.342, -0.142, body_z(0.410)),
        (0.390, -0.278, body_z(0.374)),
        (0.360, -0.404, body_z(0.344)),
        (0.292, -0.426, body_z(0.320)),
    ]
    left = make_plush_limb_mesh(
        "Pip_Left_Arm_Integrated_Crescent",
        left_path,
        [
            (0.00, 0.021, 0.013),
            (0.20, 0.037, 0.032),
            (0.54, 0.033, 0.041),
            (0.78, 0.032, 0.046),
            (1.00, 0.052, 0.054),
        ],
        materials["arms"],
        collections["Pip_Arms"],
        samples=34,
        sides=32,
    )
    right = make_plush_limb_mesh(
        "Pip_Right_Arm_Integrated_Hug",
        right_path,
        [
            (0.00, 0.021, 0.013),
            (0.20, 0.037, 0.033),
            (0.54, 0.035, 0.044),
            (0.78, 0.033, 0.050),
            (1.00, 0.058, 0.060),
        ],
        materials["arms"],
        collections["Pip_Arms"],
        samples=34,
        sides=32,
    )
    for obj in (left, right):
        obj["attachment"] = "root starts inside body and overlaps surface; no visible cap"

    grip_thumb = make_plush_limb_mesh(
        "Pip_Right_Hand_Stem_Overlap_Thumb",
        [
            (0.286, -0.482, body_z(0.318)),
            (0.308, -0.492, body_z(0.340)),
            (0.330, -0.492, body_z(0.364)),
            (0.346, -0.482, body_z(0.380)),
        ],
        [
            (0.00, 0.006, 0.004),
            (0.38, 0.013, 0.007),
            (0.72, 0.011, 0.006),
            (1.00, 0.004, 0.003),
        ],
        materials["arms"],
        collections["Pip_Arms"],
        samples=16,
        sides=18,
    )
    grip_thumb["attachment"] = "small soft thumb ridge in front of lower stem; integrated grip anatomy, not a bead"
    if hasattr(grip_thumb, "visible_shadow"):
        grip_thumb.visible_shadow = False

    hand_lobes = []
    for name, location, scale, rotation in hand_lobes:
        lobe = make_ellipsoid_mesh(
            name,
            location,
            scale,
            materials["arms"],
            collections["Pip_Arms"],
            segments=30,
            rings=14,
            rotation=rotation,
        )
        if hasattr(lobe, "visible_shadow"):
            lobe.visible_shadow = False
        lobe["attachment"] = "subtle overlapping mitten lobe; same material, not a separate bead detail"

    wave_path = [
        (-0.296, -0.205, body_z(0.452)),
        (-0.510, -0.392, body_z(0.595)),
        (-0.548, -0.438, body_z(0.735)),
        (-0.500, -0.430, body_z(0.850)),
    ]
    wave = make_tube_mesh("Pip_Left_Arm_Wave", wave_path, ((0.050, 0.036), (0.040, 0.044)), materials["arms"], collections["Pip_Arms"], hide=True)
    wave["attachment"] = "hidden wave variant with embedded root"


def branch_path_points():
    return [
        Vector((0.150, -0.486, body_z(0.190))),
        Vector((0.205, -0.470, body_z(0.302))),
        Vector((0.315, -0.458, body_z(0.430))),
        Vector((0.350, -0.452, body_z(0.560))),
        Vector((0.318, -0.446, body_z(0.688))),
        Vector((0.285, -0.438, body_z(0.804))),
    ]


def stem_point_at_t(t):
    points = branch_path_points()
    t = max(0.0, min(1.0, t))
    segment_float = t * (len(points) - 1)
    index = min(len(points) - 2, int(segment_float))
    local = segment_float - index
    eased = smoothstep(0.0, 1.0, local)
    return points[index].lerp(points[index + 1], eased)


def make_leaf_mesh(name, center, angle_degrees, length, width, material, collection, y_offset=-0.520):
    angle = math.radians(angle_degrees)
    direction = Vector((math.cos(angle), 0.0, math.sin(angle)))
    side = Vector((-math.sin(angle) * 0.82, 0.36, math.cos(angle) * 0.82))
    side.normalize()
    center = Vector((center[0], y_offset, center[2]))
    seed = sum(ord(char) for char in name)
    asymmetry = ((seed % 9) - 4) / 4.0
    twist = (((seed // 7) % 9) - 4) / 4.0
    rib_curve = (((seed // 13) % 7) - 3) / 3.0
    verts = []
    length_steps = 12
    width_steps = 8
    for i in range(length_steps + 1):
        u = -1.0 + 2.0 * i / length_steps
        taper = math.sin((u + 1.0) * math.pi * 0.5)
        taper = max(0.0, taper) ** 0.62
        taper *= 1.0 - 0.12 * max(0.0, u)
        for j in range(width_steps + 1):
            v = -1.0 + 2.0 * j / width_steps
            center_bias = 0.075 * asymmetry * math.sin((u + 1.0) * math.pi * 0.5) * (1.0 - min(1.0, abs(v)))
            across = (v + center_bias) * width * taper
            cup = -0.011 * taper * (1.0 - min(1.0, abs(v)) ** 1.8)
            cup += -0.003 * twist * u * v * taper
            rib_lift = 0.004 * (1.0 - min(1.0, abs(v))) * taper
            rib_offset = rib_curve * 0.004 * math.sin((u + 1.0) * math.pi) * (1.0 - min(1.0, abs(v)))
            p = center + direction * (u * length * 0.50 + rib_offset) + side * across
            verts.append((p.x, p.y + cup + rib_lift + 0.003 * u, p.z))

    faces = []
    for i in range(length_steps):
        row = i * (width_steps + 1)
        next_row = (i + 1) * (width_steps + 1)
        for j in range(width_steps):
            faces.append((row + j, next_row + j, next_row + j + 1, row + j + 1))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    collection.objects.link(obj)
    obj["leaf_style"] = "custom cupped oval mesh, not scaled sphere"
    return obj


def make_branch(collections, materials):
    if hasattr(materials["leaf_front_facing"], "use_backface_culling"):
        materials["leaf_front_facing"].use_backface_culling = True
    if hasattr(materials["leaf_front_facing"], "show_transparent_back"):
        materials["leaf_front_facing"].show_transparent_back = False
    if hasattr(materials["stem_front_facing"], "use_backface_culling"):
        materials["stem_front_facing"].use_backface_culling = True
    if hasattr(materials["stem_front_facing"], "show_transparent_back"):
        materials["stem_front_facing"].show_transparent_back = False

    stem_points = branch_path_points()
    stem = make_curve(
        "Pip_Branch_Stem_Full",
        stem_points,
        materials["stem"],
        collections["Pip_Branch"],
        bevel_depth=0.0052,
        resolution=28,
    )
    stem["pip_identity"] = "mandatory natural held leafy branch"
    stem["attachment"] = "runs behind right hand, close to body"

    leaves = [
        ("Pip_Branch_Leaf_01", 0.31, 142, 0.066, 0.021),
        ("Pip_Branch_Leaf_02", 0.43, 24, 0.150, 0.034),
        ("Pip_Branch_Leaf_03", 0.56, 154, 0.082, 0.026),
        ("Pip_Branch_Leaf_04", 0.69, 9, 0.150, 0.031),
        ("Pip_Branch_Leaf_05", 0.81, 116, 0.056, 0.018),
        ("Pip_Branch_Leaf_06", 0.91, 86, 0.026, 0.009),
    ]
    depth_offsets = {
        "Pip_Branch_Leaf_01": -0.002,
        "Pip_Branch_Leaf_02": 0.012,
        "Pip_Branch_Leaf_03": -0.006,
        "Pip_Branch_Leaf_04": 0.007,
        "Pip_Branch_Leaf_05": -0.010,
        "Pip_Branch_Leaf_06": 0.004,
    }
    for name, t, angle, length, width in leaves:
        attach = stem_point_at_t(t)
        leaf_dir = Vector((math.cos(math.radians(angle)), 0.0, math.sin(math.radians(angle))))
        center_bias = 0.62 if -60 <= angle <= 70 else 0.44
        center = attach + leaf_dir * (length * center_bias)
        depth_spread = depth_offsets.get(name, 0.0)
        center.y = attach.y + 0.010 * math.sin(t * math.pi) + (0.010 if angle > 0 else -0.004) + depth_spread
        petiole_end = Vector((center.x - leaf_dir.x * length * 0.22, center.y, center.z - leaf_dir.z * length * 0.22))
        petiole_mid = attach.lerp(petiole_end, 0.55)
        petiole_mid += Vector((0.0, 0.003 if angle > 0 else -0.002, 0.006 * math.sin(t * math.pi * 1.7)))
        make_curve(
            f"{name}_Petiole",
            [attach, petiole_mid, petiole_end],
            materials["stem"],
            collections["Pip_Branch"],
            bevel_depth=0.0015,
            resolution=10,
        )
        leaf_material = materials["leaf_front_facing"] if name in {"Pip_Branch_Leaf_02", "Pip_Branch_Leaf_04"} else materials["leaf"]
        leaf = make_leaf_mesh(name, center, angle, length, width, leaf_material, collections["Pip_Branch"], y_offset=center.y)
        vein_start = Vector((center.x - leaf_dir.x * length * 0.36, center.y - 0.004, center.z - leaf_dir.z * length * 0.36))
        vein_end = Vector((center.x + leaf_dir.x * length * 0.34, center.y - 0.004, center.z + leaf_dir.z * length * 0.34))
        vein = make_curve(
            f"{name}_Vein",
            [vein_start, vein_end],
            materials["leaf_vein"],
            collections["Pip_Branch"],
            bevel_depth=0.0014,
            resolution=5,
        )
        vein.hide_viewport = True
        vein.hide_render = True
        leaf["attach_t"] = t

    outer_stem = make_camera_oriented_stem_ribbon(
        "Pip_Branch_Outer_Sprig_Stem",
        [
            Vector((0.298, -0.420, body_z(0.322))),
            Vector((0.348, -0.210, body_z(0.402))),
            Vector((0.374, 0.112, body_z(0.520))),
            Vector((0.390, 0.224, body_z(0.618))),
        ],
        0.0042,
        materials["stem_front_facing"],
        collections["Pip_Branch"],
    )
    outer_stem["attachment"] = "continuous outer sprig path tied into grip zone; replaces detached target leaves"

    outer_leaves = [
        (
            "Pip_Branch_Outer_Leaf_07",
            (0.375, 0.160, body_z(0.426)),
            (0.435, 0.410, body_z(0.456)),
            0.024,
        ),
        (
            "Pip_Branch_Outer_Leaf_08",
            (0.388, 0.205, body_z(0.542)),
            (0.428, 0.400, body_z(0.600)),
            0.021,
        ),
    ]
    for name, base, tip, width in outer_leaves:
        petiole_end = Vector(base)
        petiole_start = petiole_end - (Vector(tip) - petiole_end).normalized() * 0.030
        petiole = make_camera_oriented_stem_ribbon(
            f"{name}_Petiole",
            [petiole_start, petiole_end],
            0.0018,
            materials["stem_front_facing"],
            collections["Pip_Branch"],
        )
        petiole["attachment"] = "short connector from outer sprig stem into tapered leaf"
        outer_leaf = make_camera_oriented_attached_leaf(
            name,
            base,
            tip,
            width,
            materials["leaf_front_facing"],
            collections["Pip_Branch"],
        )
        if hasattr(outer_leaf, "visible_shadow"):
            outer_leaf.visible_shadow = False

    tiny_stem = make_curve(
        "Tiny_Branch_Stem",
        [
            Vector((0.170, -0.585, 0.300)),
            Vector((0.280, -0.590, 0.610)),
            Vector((0.455, -0.585, 1.030)),
        ],
        materials["stem"],
        collections["Pip_Branch"],
        bevel_depth=0.016,
        resolution=16,
        hide=True,
    )
    tiny_stem["pip_identity"] = "mandatory simplified tiny branch"
    for index, (attach, angle) in enumerate(
        [
            (Vector((0.255, -0.590, 0.555)), 36),
            (Vector((0.315, -0.590, 0.710)), -128),
            (Vector((0.385, -0.590, 0.885)), 42),
            (Vector((0.455, -0.590, 1.030)), 68),
        ],
        start=1,
    ):
        leaf_dir = Vector((math.cos(math.radians(angle)), 0.0, math.sin(math.radians(angle))))
        center = attach + leaf_dir * 0.072
        obj = make_leaf_mesh(
            f"Tiny_Branch_Leaf_{index:02d}",
            center,
            angle,
            0.105,
            0.034,
            materials["leaf"],
            collections["Pip_Branch"],
            y_offset=-0.600,
        )
        obj.hide_viewport = True
        obj.hide_render = True

    for obj in collections["Pip_Branch"].objects:
        if hasattr(obj, "visible_shadow"):
            obj.visible_shadow = False


def look_at(obj, target):
    direction = Vector(target) - Vector(obj.location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def create_camera(name, location, target, ortho_scale, collections):
    camera_data = bpy.data.cameras.new(f"{name}_Data")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ortho_scale
    camera = bpy.data.objects.new(name, camera_data)
    camera.location = location
    look_at(camera, target)
    collections["Cameras"].objects.link(camera)
    return camera


def create_cyclorama(name, orientation, materials, collection):
    width = 5.5
    depth_back = 2.35
    depth_front = -4.15
    curve_start = 1.05
    radius = depth_back - curve_start
    height = 4.0
    path = [(depth_front, 0.0), (curve_start, 0.0)]
    for index in range(1, 10):
        angle = (math.pi * 0.5) * index / 9
        path.append((curve_start + radius * math.sin(angle), radius * (1.0 - math.cos(angle))))
    path.append((depth_back, height))

    verts = []
    for lateral in (-width, width):
        for depth, z in path:
            if orientation == "front":
                verts.append((lateral, depth, z))
            elif orientation == "back":
                verts.append((-lateral, -depth, z))
            else:
                verts.append((-depth, lateral, z))

    faces = []
    row = len(path)
    for index in range(row - 1):
        faces.append((index, row + index, row + index + 1, index + 1))

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(materials["backdrop"])
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = True
    collection.objects.link(obj)
    return obj


def cyclorama_point(lateral, depth, z, orientation):
    if orientation == "front":
        return (lateral, depth, z)
    if orientation == "back":
        return (-lateral, -depth, z)
    return (-depth, lateral, z)


def create_backdrop_fill(name, orientation, materials, collection):
    width = 5.5
    depth = 2.38
    z_min = -1.2
    z_max = 4.2
    verts = [
        cyclorama_point(-width, depth, z_min, orientation),
        cyclorama_point(width, depth, z_min, orientation),
        cyclorama_point(width, depth, z_max, orientation),
        cyclorama_point(-width, depth, z_max, orientation),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(materials["backdrop"])
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    collection.objects.link(obj)
    return obj


def make_lights_and_cameras(collections, materials):
    create_cyclorama("Pip_Cyclorama_FrontRender", "front", materials, collections["Lights"])
    create_cyclorama("Pip_Cyclorama_BackRender", "back", materials, collections["Lights"])
    create_cyclorama("Pip_Cyclorama_SideRender", "side", materials, collections["Lights"])
    create_backdrop_fill("Pip_BackdropFill_FrontRender", "front", materials, collections["Lights"])
    create_backdrop_fill("Pip_BackdropFill_BackRender", "back", materials, collections["Lights"])
    create_backdrop_fill("Pip_BackdropFill_SideRender", "side", materials, collections["Lights"])

    key_data = bpy.data.lights.new("Pip_Final_Key_Area_Data", "AREA")
    key_data.energy = 300
    key_data.size = 4.2
    key = bpy.data.objects.new("Pip_Final_Key_Area", key_data)
    key.location = (-2.4, -3.4, 3.8)
    look_at(key, (0, -0.20, 0.68))
    collections["Lights"].objects.link(key)

    fill_data = bpy.data.lights.new("Pip_Final_Fill_Area_Data", "AREA")
    fill_data.energy = 65
    fill_data.size = 4.2
    fill = bpy.data.objects.new("Pip_Final_Fill_Area", fill_data)
    fill.location = (2.4, -2.0, 1.8)
    look_at(fill, (0, -0.20, 0.68))
    collections["Lights"].objects.link(fill)

    rear_data = bpy.data.lights.new("Pip_Final_Rear_Softbox_Data", "AREA")
    rear_data.energy = 120
    rear_data.size = 5.0
    rear = bpy.data.objects.new("Pip_Final_Rear_Softbox", rear_data)
    rear.location = (0.0, 3.2, 2.6)
    look_at(rear, (0.0, 0.02, 0.72))
    collections["Lights"].objects.link(rear)

    overhead_data = bpy.data.lights.new("Pip_Final_Overhead_Soft_Ambient_Data", "AREA")
    overhead_data.energy = 65
    overhead_data.size = 5.4
    overhead = bpy.data.objects.new("Pip_Final_Overhead_Soft_Ambient", overhead_data)
    overhead.location = (0.0, -0.4, 3.9)
    look_at(overhead, (0.0, -0.15, 0.70))
    collections["Lights"].objects.link(overhead)

    target = (0.03, -0.18, 0.67)
    cameras = {
        "front": create_camera("Camera_Front", Vector((0.0, -4.5, 0.72)), target, 1.55, collections),
        "side": create_camera("Camera_Side", Vector((4.5, 0.0, 0.72)), (0.03, -0.10, 0.67), 1.55, collections),
        "three_quarter": create_camera("Camera_ThreeQuarter", Vector((2.65, -3.65, 0.78)), target, 1.55, collections),
        "back": create_camera("Camera_Back", Vector((0.0, 4.5, 0.72)), (0.0, 0.0, 0.67), 1.55, collections),
        "hero": create_camera("Camera_Hero", Vector((2.4, -4.3, 0.86)), target, 1.82, collections),
        "tiny": create_camera("Camera_TinyAvatar", Vector((0.0, -4.7, 0.70)), target, 1.35, collections),
    }
    bpy.context.scene.camera = cameras["front"]
    return cameras


def create_image_plane(name, image_path, location, scale, rotation, collections):
    material = make_alpha_image_material(f"{name}_Material", image_path)
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([(-0.5, -0.5, 0.0), (0.5, -0.5, 0.0), (0.5, 0.5, 0.0), (-0.5, 0.5, 0.0)], [], [(0, 1, 2, 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.scale = scale
    obj.rotation_euler = rotation
    obj.data.materials.append(material)
    obj.hide_render = True
    obj.lock_location = (True, True, True)
    obj.lock_rotation = (True, True, True)
    obj.lock_scale = (True, True, True)
    collections["Reference_Working"].objects.link(obj)
    return obj


def make_reference_setup(collections, materials):
    # Planes are visible in viewport but hidden from render. They act as calibrated working overlays/guides.
    create_image_plane(
        "Reference_Working_Front_Crop",
        REFERENCE_ROOT / "front.png",
        (0.0, 0.62, 0.69),
        (1.08, 1.36, 1.0),
        (math.radians(90), 0.0, 0.0),
        collections,
    )
    create_image_plane(
        "Reference_Working_Side_Crop",
        REFERENCE_ROOT / "side.png",
        (0.72, 0.0, 0.69),
        (1.00, 1.36, 1.0),
        (math.radians(90), 0.0, math.radians(90)),
        collections,
    )
    create_image_plane(
        "Reference_Working_ThreeQuarter_Crop",
        REFERENCE_ROOT / "three_quarter.png",
        (-1.45, 0.72, 0.69),
        (1.16, 1.36, 1.0),
        (math.radians(90), 0.0, 0.0),
        collections,
    )
    create_image_plane(
        "Reference_Working_Back_Crop",
        REFERENCE_ROOT / "back.png",
        (1.45, 0.72, 0.69),
        (1.05, 1.36, 1.0),
        (math.radians(90), 0.0, 0.0),
        collections,
    )
    guide = make_curve(
        "Pip_Reference_Height_Guide_1x",
        [Vector((-0.62, -0.56, BODY_BASE_Z)), Vector((-0.62, -0.56, BODY_TOP_Z))],
        materials["guide"],
        collections["Reference_Working"],
        bevel_depth=0.003,
        resolution=1,
    )
    guide.lock_location = (True, True, True)
    guide.lock_rotation = (True, True, True)
    guide.lock_scale = (True, True, True)
    guide.hide_render = True
    guide["reference_height"] = "1.0 Pip body height"


def configure_render():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = 64
        if hasattr(scene.eevee, "use_gtao"):
            scene.eevee.use_gtao = True
        if hasattr(scene.eevee, "gtao_distance"):
            scene.eevee.gtao_distance = 2
        if hasattr(scene.eevee, "gtao_factor"):
            scene.eevee.gtao_factor = 1.25
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Pip Final Warm World")
    scene.world.color = (0.98, 0.93, 0.84)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.98, 0.93, 0.84, 1.0)
        background.inputs["Strength"].default_value = 0.58
    scene.render.film_transparent = False


def render_camera(camera, output_path, resolution):
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)


def set_branch_variant(tiny=False):
    branch_collection = bpy.data.collections.get("Pip_Branch")
    if not branch_collection:
        return
    for obj in branch_collection.objects:
        is_tiny = obj.name.startswith("Tiny_Branch")
        if obj.name.endswith("_Vein"):
            obj.hide_viewport = True
            obj.hide_render = True
        else:
            obj.hide_viewport = is_tiny != tiny
            obj.hide_render = is_tiny != tiny


def set_backdrop_for_view(key):
    visible_for_key = {
        "front": {"Pip_Cyclorama_FrontRender", "Pip_BackdropFill_FrontRender"},
        "three_quarter": {"Pip_Cyclorama_FrontRender", "Pip_BackdropFill_FrontRender"},
        "hero": {"Pip_Cyclorama_FrontRender", "Pip_BackdropFill_FrontRender"},
        "tiny_64": {"Pip_Cyclorama_FrontRender", "Pip_BackdropFill_FrontRender"},
        "tiny_32": {"Pip_Cyclorama_FrontRender", "Pip_BackdropFill_FrontRender"},
        "side": {"Pip_Cyclorama_SideRender", "Pip_BackdropFill_SideRender"},
        "back": {"Pip_Cyclorama_BackRender", "Pip_BackdropFill_BackRender"},
    }
    allowed = visible_for_key.get(key, {"Pip_Cyclorama_FrontRender", "Pip_BackdropFill_FrontRender"})
    for obj in bpy.data.objects:
        if obj.name.startswith("Pip_Cyclorama_") or obj.name.startswith("Pip_BackdropFill_"):
            is_visible = obj.name in allowed
            obj.hide_viewport = not is_visible
            obj.hide_render = not is_visible


def render_review_set(cameras):
    ensure_dir(PREVIEW_ROOT)
    outputs = {}
    specs = {
        "front": ((1024, 1024), "pip_reference_matched_front.png"),
        "three_quarter": ((1024, 1024), "pip_reference_matched_three_quarter.png"),
        "side": ((1024, 1024), "pip_reference_matched_side.png"),
        "back": ((1024, 1024), "pip_reference_matched_back.png"),
        "hero": ((1024, 1024), "pip_reference_matched_hero.png"),
        "tiny_64": ((64, 64), "pip_reference_matched_tiny_64.png"),
        "tiny_32": ((32, 32), "pip_reference_matched_tiny_32.png"),
    }
    for key, (resolution, filename) in specs.items():
        set_branch_variant(tiny=key.startswith("tiny"))
        set_backdrop_for_view(key)
        camera = cameras["tiny"] if key.startswith("tiny") else cameras[key]
        path = PREVIEW_ROOT / filename
        render_camera(camera, path, resolution)
        outputs[key] = str(path)
    set_branch_variant(tiny=False)
    set_backdrop_for_view("front")
    bpy.context.scene.camera = cameras["front"]
    return outputs


def build_reference_matched_pip(save_file=True, render=False):
    ensure_dir(GENERATED_ROOT)
    collections = make_collections()
    preserve_blockout_backup(collections)
    clear_rebuild_collections(collections)
    hide_legacy_reference_objects()
    materials = make_materials()

    body = make_body(collections, materials)
    make_ground_contact_shadow(collections, materials)
    make_face(collections, materials)
    make_arms(collections, materials)
    make_branch(collections, materials)
    make_reference_setup(collections, materials)
    cameras = make_lights_and_cameras(collections, materials)
    configure_render()

    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.context.view_layer.update()

    for area in getattr(bpy.context.window, "screen", []).areas if getattr(bpy.context, "window", None) else []:
        if area.type == "VIEW_3D":
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.shading.type = "MATERIAL"
                    space.overlay.show_floor = True

    outputs = {}
    if save_file:
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
        outputs["blend"] = str(BLEND_PATH)
    if render:
        outputs.update(render_review_set(cameras))

    return {
        "status": "ok",
        "blend_path": str(BLEND_PATH),
        "body_dimensions": list(body.dimensions),
        "collections": list(collections.keys()),
        "outputs": outputs,
    }


if __name__ == "__main__":
    result = build_reference_matched_pip(save_file=True, render=True)
    print(result)
