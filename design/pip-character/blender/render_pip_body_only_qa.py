"""Render body-only Pip QA views and generated body masks from Blender."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import bpy


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[3]
DESIGN_ROOT = REPO_ROOT / "design" / "pip-character"
GENERATED_ROOT = DESIGN_ROOT / "generated"
PREVIEW_ROOT = GENERATED_ROOT / "previews"
QA_ROOT = GENERATED_ROOT / "qa"
MASK_ROOT = QA_ROOT / "masks"
BLEND_PATH = GENERATED_ROOT / "pip_v001_reference_matched.blend"

BODY_OBJECT_NAME = "Pip_Body_Unified_Pebble"
HIDE_COLLECTIONS = ("Pip_Face", "Pip_Arms", "Pip_Branch", "Pip_Expressions", "Reference_Working")
VIEWS = {
    "front": "Camera_Front",
    "side": "Camera_Side",
    "back": "Camera_Back",
    "three_quarter": "Camera_ThreeQuarter",
}


def ensure_dirs() -> None:
    PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    MASK_ROOT.mkdir(parents=True, exist_ok=True)


def snapshot_visibility() -> dict[str, tuple[bool, bool]]:
    return {obj.name: (obj.hide_viewport, obj.hide_render) for obj in bpy.data.objects}


def restore_visibility(snapshot: dict[str, tuple[bool, bool]]) -> None:
    for name, state in snapshot.items():
        obj = bpy.data.objects.get(name)
        if obj:
            obj.hide_viewport, obj.hide_render = state


def set_backdrop_for_view(view: str) -> None:
    visible_for_view = {
        "front": {"Pip_Cyclorama_FrontRender", "Pip_BackdropFill_FrontRender"},
        "three_quarter": {"Pip_Cyclorama_FrontRender", "Pip_BackdropFill_FrontRender"},
        "side": {"Pip_Cyclorama_SideRender", "Pip_BackdropFill_SideRender"},
        "back": {"Pip_Cyclorama_BackRender", "Pip_BackdropFill_BackRender"},
    }
    allowed = visible_for_view.get(view, visible_for_view["front"])
    for obj in bpy.data.objects:
        if obj.name.startswith("Pip_Cyclorama_") or obj.name.startswith("Pip_BackdropFill_"):
            is_visible = obj.name in allowed
            obj.hide_viewport = not is_visible
            obj.hide_render = not is_visible


def hide_appendages_for_body_only() -> None:
    for collection_name in HIDE_COLLECTIONS:
        collection = bpy.data.collections.get(collection_name)
        if not collection:
            continue
        for obj in collection.objects:
            obj.hide_viewport = True
            obj.hide_render = True

    shadow = bpy.data.objects.get("Pip_Ground_Soft_Contact_Shadow")
    if shadow:
        shadow.hide_viewport = True
        shadow.hide_render = True


def show_only_body_for_mask() -> None:
    body = bpy.data.objects.get(BODY_OBJECT_NAME)
    if body is None:
        raise RuntimeError(f"Missing body object: {BODY_OBJECT_NAME}")
    for obj in bpy.data.objects:
        is_body = obj.name == BODY_OBJECT_NAME
        if obj.type not in {"CAMERA", "LIGHT"}:
            obj.hide_viewport = not is_body
            obj.hide_render = not is_body


def configure_render(resolution: tuple[int, int], transparent: bool) -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = transparent
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def make_mask_material():
    material = bpy.data.materials.get("Pip QA Mask White Emission") or bpy.data.materials.new("Pip QA Mask White Emission")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new(type="ShaderNodeOutputMaterial")
    emission = nodes.new(type="ShaderNodeEmission")
    emission.inputs["Color"].default_value = (1, 1, 1, 1)
    emission.inputs["Strength"].default_value = 1
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    material.diffuse_color = (1, 1, 1, 1)
    return material


def render(camera_name: str, output_path: Path) -> None:
    camera = bpy.data.objects.get(camera_name)
    if camera is None:
        raise RuntimeError(f"Missing camera: {camera_name}")
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)


def render_body_only_views() -> dict[str, str]:
    outputs: dict[str, str] = {}
    for view, camera_name in VIEWS.items():
        set_backdrop_for_view(view)
        output = PREVIEW_ROOT / f"body_only_{view}.png"
        configure_render((1024, 1024), transparent=False)
        render(camera_name, output)
        outputs[view] = str(output)
    return outputs


def render_generated_masks() -> dict[str, str]:
    body = bpy.data.objects.get(BODY_OBJECT_NAME)
    if body is None:
        raise RuntimeError(f"Missing body object: {BODY_OBJECT_NAME}")
    original_materials = list(body.data.materials)
    body.data.materials.clear()
    body.data.materials.append(make_mask_material())
    outputs: dict[str, str] = {}
    try:
        show_only_body_for_mask()
        configure_render((1024, 1024), transparent=True)
        for view, camera_name in VIEWS.items():
            output = MASK_ROOT / f"body_generated_{view}_mask.png"
            render(camera_name, output)
            outputs[view] = str(output)
    finally:
        body.data.materials.clear()
        for material in original_materials:
            body.data.materials.append(material)
    return outputs


def scene_audit(outputs: dict[str, dict[str, str]]) -> dict:
    body = bpy.data.objects.get(BODY_OBJECT_NAME)
    collections = {
        collection.name: {
            "objects": len(collection.objects),
            "hide_viewport": collection.hide_viewport,
            "hide_render": collection.hide_render,
        }
        for collection in bpy.data.collections
        if collection.name.startswith("Pip_") or collection.name in {"Reference_Working", "Cameras", "Lights", "Backup"}
    }
    cameras = {
        name: {
            "ortho_scale": bpy.data.objects[name].data.ortho_scale,
            "location": list(bpy.data.objects[name].location),
            "rotation": list(bpy.data.objects[name].rotation_euler),
        }
        for name in VIEWS.values()
        if bpy.data.objects.get(name)
    }
    return {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "blender_version": bpy.app.version_string,
        "render_engine": bpy.context.scene.render.engine,
        "blend_path": bpy.data.filepath,
        "script_path": str(SCRIPT_PATH),
        "body_object_name": BODY_OBJECT_NAME,
        "body_dimensions": list(body.dimensions) if body else None,
        "body_modifiers": [modifier.name for modifier in body.modifiers] if body else [],
        "hidden_collections_for_body_only": list(HIDE_COLLECTIONS),
        "collections": collections,
        "cameras": cameras,
        "outputs": outputs,
    }


def main() -> dict:
    ensure_dirs()
    if not bpy.data.filepath and BLEND_PATH.exists():
        bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH))

    visibility = snapshot_visibility()
    try:
        hide_appendages_for_body_only()
        visual_outputs = render_body_only_views()
        mask_visibility = snapshot_visibility()
        try:
            mask_outputs = render_generated_masks()
        finally:
            restore_visibility(mask_visibility)
        outputs = {"visual": visual_outputs, "masks": mask_outputs}
        audit = scene_audit(outputs)
        audit_path = QA_ROOT / "body_scene_audit.json"
        audit_path.write_text(json.dumps(audit, indent=2), encoding="utf-8")
        outputs["audit"] = {"path": str(audit_path)}
        return outputs
    finally:
        restore_visibility(visibility)


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2))
