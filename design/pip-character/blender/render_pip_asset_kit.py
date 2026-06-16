import os
from pathlib import Path

import bpy


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[3]
DESIGN_ROOT = REPO_ROOT / "design" / "pip-character"
EXPORT_ROOT = DESIGN_ROOT / "exports" / "v001"
REFERENCE_CROP_ROOT = DESIGN_ROOT / "references" / "crops" / "v001"


ASSETS = [
    {
        "path": "tiny/normal-front.png",
        "state": "normal",
        "camera": "Camera_TinyAvatar",
        "resolution": (256, 256),
        "branch": "tiny",
        "background": "transparent",
    },
    {
        "path": "tiny/normal-three-quarter.png",
        "state": "normal",
        "camera": "Camera_ThreeQuarter",
        "resolution": (256, 256),
        "branch": "tiny",
        "background": "transparent",
    },
    {
        "path": "small/normal-front.png",
        "state": "normal",
        "camera": "Camera_Front",
        "resolution": (512, 512),
        "branch": "full",
        "background": "transparent",
    },
    {
        "path": "small/happy-front.png",
        "state": "happy",
        "camera": "Camera_Front",
        "resolution": (512, 512),
        "branch": "full",
        "background": "transparent",
    },
    {
        "path": "small/concerned-front.png",
        "state": "concerned",
        "camera": "Camera_Front",
        "resolution": (512, 512),
        "branch": "full",
        "background": "transparent",
    },
    {
        "path": "small/thinking-front.png",
        "state": "thinking",
        "camera": "Camera_Front",
        "resolution": (512, 512),
        "branch": "full",
        "background": "transparent",
    },
    {
        "path": "medium/normal-branch.png",
        "state": "normal",
        "camera": "Camera_Front",
        "resolution": (1024, 1024),
        "branch": "full",
        "background": "transparent",
    },
    {
        "path": "medium/happy-branch.png",
        "state": "happy",
        "camera": "Camera_Front",
        "resolution": (1024, 1024),
        "branch": "full",
        "background": "transparent",
    },
    {
        "path": "medium/careful-branch.png",
        "state": "careful",
        "camera": "Camera_Front",
        "resolution": (1024, 1024),
        "branch": "full",
        "background": "transparent",
    },
    {
        "path": "medium/shortfall-branch.png",
        "state": "shortfall",
        "camera": "Camera_Front",
        "resolution": (1024, 1024),
        "branch": "full",
        "background": "transparent",
    },
    {
        "path": "medium/wave-branch.png",
        "state": "wave",
        "camera": "Camera_Front",
        "resolution": (1024, 1024),
        "branch": "full",
        "background": "transparent",
    },
    {
        "path": "hero/onboarding-branch.png",
        "state": "normal",
        "camera": "Camera_Hero",
        "resolution": (1600, 1200),
        "branch": "full",
        "background": "cream",
        "ortho_scale": 3.25,
    },
    {
        "path": "hero/marketing-three-quarter.png",
        "state": "happy",
        "camera": "Camera_ThreeQuarter",
        "resolution": (1600, 1200),
        "branch": "full",
        "background": "cream",
        "ortho_scale": 3.25,
    },
    {
        "path": "hero/reference-front.png",
        "state": "normal",
        "camera": "Camera_Front",
        "resolution": (1600, 1200),
        "branch": "full",
        "background": "cream",
        "ortho_scale": 3.25,
    },
    {
        "path": "hero/reference-three-quarter.png",
        "state": "normal",
        "camera": "Camera_ThreeQuarter",
        "resolution": (1600, 1200),
        "branch": "full",
        "background": "cream",
        "ortho_scale": 3.25,
    },
]


def configure_render_settings():
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 80
        scene.cycles.use_denoising = True
    except Exception:
        pass
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except Exception:
        pass
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1


def set_branch_variant(variant):
    branch_collection = bpy.data.collections.get("Pip_Branch")
    if not branch_collection:
        raise RuntimeError("Missing Pip_Branch collection. Cannot render branch-bearing Pip assets.")

    for obj in branch_collection.objects:
        is_tiny = obj.name.startswith("Tiny_Branch")
        should_show = is_tiny if variant == "tiny" else not is_tiny
        obj.hide_viewport = not should_show
        obj.hide_render = not should_show


def set_object_visibility(name, visible):
    obj = bpy.data.objects.get(name)
    if not obj:
        return
    obj.hide_viewport = not visible
    obj.hide_render = not visible


def set_expression(state):
    for obj in bpy.data.objects:
        if obj.name.startswith("Expression_Mouth_"):
            obj.hide_viewport = True
            obj.hide_render = True
        if obj.name.startswith("Expression_Brow_") or obj.name.startswith("Expression_Eye_Closed_"):
            obj.hide_viewport = True
            obj.hide_render = True

    mouth_by_state = {
        "normal": "Expression_Mouth_Normal",
        "happy": "Expression_Mouth_Happy",
        "thinking": "Expression_Mouth_Careful",
        "careful": "Expression_Mouth_Careful",
        "concerned": "Expression_Mouth_Concerned",
        "uncertain": "Expression_Mouth_Uncertain",
        "shortfall": "Expression_Mouth_Shortfall",
        "wave": "Expression_Mouth_Happy",
    }

    mouth = bpy.data.objects.get(mouth_by_state.get(state, "Expression_Mouth_Normal"))
    if mouth:
        mouth.hide_viewport = False
        mouth.hide_render = False

    for eye_name in ("Pip_Eye_Left", "Pip_Eye_Right"):
        set_object_visibility(eye_name, state != "shortfall")

    if state == "shortfall":
        set_object_visibility("Expression_Eye_Closed_Left", True)
        set_object_visibility("Expression_Eye_Closed_Right", True)

    if state == "concerned":
        set_object_visibility("Expression_Brow_Concerned_Left", True)
        set_object_visibility("Expression_Brow_Concerned_Right", True)

    if state in {"thinking", "careful"}:
        set_object_visibility("Expression_Brow_Careful_Left", True)
        set_object_visibility("Expression_Brow_Careful_Right", True)

    set_object_visibility("Pip_Left_Arm_Soft_Capsule", state != "wave")
    set_object_visibility("Pip_Left_Arm_Wave", state == "wave")


def set_background(mode):
    scene = bpy.context.scene
    transparent = mode == "transparent"
    scene.render.film_transparent = transparent
    if scene.world:
        color = (1.0, 0.94, 0.86, 1) if mode == "cream" else (0.86, 0.81, 0.72, 1)
        scene.world.color = color[:3]
        scene.world.use_nodes = True
        background = scene.world.node_tree.nodes.get("Background")
        if background:
            background.inputs["Color"].default_value = color
            background.inputs["Strength"].default_value = 0.82 if mode == "cream" else 0.55
    set_object_visibility("Pip_Contact_Shadow_Plane", not transparent)


def render_asset(asset):
    output_path = EXPORT_ROOT / asset["path"]
    output_path.parent.mkdir(parents=True, exist_ok=True)

    scene = bpy.context.scene
    camera = bpy.data.objects[asset["camera"]]
    previous_ortho_scale = camera.data.ortho_scale
    if "ortho_scale" in asset:
        camera.data.ortho_scale = asset["ortho_scale"]
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = asset["resolution"]
    scene.render.filepath = str(output_path)

    set_expression(asset["state"])
    set_branch_variant(asset["branch"])
    set_background(asset["background"])

    bpy.ops.render.render(write_still=True)
    camera.data.ortho_scale = previous_ortho_scale
    print(f"Rendered {output_path}")


def make_emission_image_material(name, image_path):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.blend_method = "BLEND"
    material.show_transparent_back = True
    nodes = material.node_tree.nodes
    nodes.clear()

    output = nodes.new(type="ShaderNodeOutputMaterial")
    emission = nodes.new(type="ShaderNodeEmission")
    transparent = nodes.new(type="ShaderNodeBsdfTransparent")
    mix = nodes.new(type="ShaderNodeMixShader")
    image_node = nodes.new(type="ShaderNodeTexImage")
    image_node.image = bpy.data.images.load(str(image_path), check_existing=True)

    material.node_tree.links.new(image_node.outputs["Color"], emission.inputs["Color"])
    material.node_tree.links.new(image_node.outputs["Alpha"], mix.inputs["Fac"])
    material.node_tree.links.new(transparent.outputs["BSDF"], mix.inputs[1])
    material.node_tree.links.new(emission.outputs["Emission"], mix.inputs[2])
    material.node_tree.links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return material


def make_solid_material(name, color):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf and "Base Color" in bsdf.inputs:
        bsdf.inputs["Base Color"].default_value = color
    return material


def add_plane_to_scene(scene, name, image_path, center_x, center_y, max_width, max_height):
    image = bpy.data.images.load(str(image_path), check_existing=True)
    aspect = image.size[0] / image.size[1]
    target_aspect = max_width / max_height
    if aspect >= target_aspect:
        width = max_width
        height = max_width / aspect
    else:
        height = max_height
        width = max_height * aspect

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    half_w = width / 2
    half_h = height / 2
    verts = [
        (center_x - half_w, center_y - half_h, 0),
        (center_x + half_w, center_y - half_h, 0),
        (center_x + half_w, center_y + half_h, 0),
        (center_x - half_w, center_y + half_h, 0),
    ]
    faces = [(0, 1, 2, 3)]
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name=f"{name}_UV")
    for loop, uv in zip(uv_layer.data, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop.uv = uv

    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(make_emission_image_material(f"{name}_Material", image_path))
    scene.collection.objects.link(obj)
    return obj


def add_label(scene, label, x, y, material):
    font = bpy.data.curves.new(f"Label_{label}", "FONT")
    font.body = label
    font.align_x = "CENTER"
    font.align_y = "CENTER"
    font.size = 0.11

    obj = bpy.data.objects.new(f"Label_{label}", font)
    obj.location = (x, y, 0.03)
    obj.data.materials.append(material)
    scene.collection.objects.link(obj)


def configure_contact_scene(scene):
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"

    scene.render.resolution_x = 2048
    scene.render.resolution_y = 1536
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world = bpy.data.worlds.new("Pip_Contact_Sheet_World")
    scene.world.color = (0.88, 0.84, 0.76)

    camera_data = bpy.data.cameras.new("ContactSheetCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 7.0
    camera = bpy.data.objects.new("ContactSheetCamera", camera_data)
    camera.location = (0, 0, 10)
    camera.rotation_euler = (0, 0, 0)
    scene.collection.objects.link(camera)
    scene.camera = camera


def create_contact_sheet():
    contact_scene = bpy.data.scenes.new("Pip_v001_Contact_Sheet")
    configure_contact_scene(contact_scene)

    label_material = make_solid_material("Contact Sheet Label Ink", (0.08, 0.075, 0.065, 1))

    cells = [
        ("Ref front", REFERENCE_CROP_ROOT / "front.png", -3.3, 2.35),
        ("Gen front", EXPORT_ROOT / "hero/reference-front.png", -1.1, 2.35),
        ("Ref 3/4", REFERENCE_CROP_ROOT / "three_quarter.png", 1.1, 2.35),
        ("Gen 3/4", EXPORT_ROOT / "hero/reference-three-quarter.png", 3.3, 2.35),
        ("Normal", EXPORT_ROOT / "small/normal-front.png", -3.3, 0.75),
        ("Happy", EXPORT_ROOT / "small/happy-front.png", -1.1, 0.75),
        ("Concerned", EXPORT_ROOT / "small/concerned-front.png", 1.1, 0.75),
        ("Thinking", EXPORT_ROOT / "small/thinking-front.png", 3.3, 0.75),
        ("Medium normal", EXPORT_ROOT / "medium/normal-branch.png", -3.3, -0.85),
        ("Careful", EXPORT_ROOT / "medium/careful-branch.png", -1.1, -0.85),
        ("Shortfall", EXPORT_ROOT / "medium/shortfall-branch.png", 1.1, -0.85),
        ("Wave", EXPORT_ROOT / "medium/wave-branch.png", 3.3, -0.85),
        ("Tiny front", EXPORT_ROOT / "tiny/normal-front.png", -1.1, -2.45),
        ("Tiny 3/4", EXPORT_ROOT / "tiny/normal-three-quarter.png", 1.1, -2.45),
    ]

    for label, image_path, x, y in cells:
        if not image_path.exists():
            continue
        add_plane_to_scene(contact_scene, f"Contact_{label.replace(' ', '_').replace('/', '_')}", image_path, x, y, 1.65, 1.2)
        add_label(contact_scene, label, x, y - 0.72, label_material)

    output_path = EXPORT_ROOT / "contact-sheet.png"
    contact_scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True, scene=contact_scene.name)
    print(f"Rendered {output_path}")


def main():
    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)

    if os.environ.get("PIP_CONTACT_SHEET_ONLY") == "1":
        create_contact_sheet()
        return

    configure_render_settings()

    asset_filter = os.environ.get("PIP_RENDER_FILTER")
    for asset in ASSETS:
        if asset_filter and not asset["path"].startswith(asset_filter):
            continue
        render_asset(asset)

    create_contact_sheet()


if __name__ == "__main__":
    main()
