#!/usr/bin/env python3
"""Compare generated Pip body masks to authored reference body masks."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


SCRIPT_PATH = Path(__file__).resolve()
DESIGN_ROOT = SCRIPT_PATH.parents[1]
PREVIEW_ROOT = DESIGN_ROOT / "generated" / "previews"
QA_ROOT = DESIGN_ROOT / "generated" / "qa"
GENERATED_MASK_ROOT = QA_ROOT / "masks"
REFERENCE_MASK_ROOT = DESIGN_ROOT / "references" / "masks" / "v001"
TECHNICAL_QA_PATH = PREVIEW_ROOT / "pip_reference_matched_technical_qa_sheet.png"
METRICS_PATH = QA_ROOT / "body_silhouette_metrics.json"
LANDMARKS_PATH = QA_ROOT / "body_silhouette_landmarks.json"
RUN_LOG_PATH = QA_ROOT / "body_qa_run_log.md"
SCENE_AUDIT_PATH = QA_ROOT / "body_scene_audit.json"

VIEWS = ("front", "side", "back", "three_quarter")


def read_binary_mask(path: Path) -> Image.Image:
    original = Image.open(path)
    image = original.convert("RGBA")
    alpha = image.getchannel("A")
    gray = image.convert("L")
    mask = Image.new("L", image.size, 0)
    alpha_pixels = alpha.load()
    gray_pixels = gray.load()
    out = mask.load()
    alpha_range = alpha.getextrema()
    use_alpha = original.mode in {"RGBA", "LA"} and alpha_range[0] < 16 and alpha_range[1] > 240
    for y in range(image.size[1]):
        for x in range(image.size[0]):
            if (alpha_pixels[x, y] > 16 if use_alpha else gray_pixels[x, y] > 80):
                out[x, y] = 255
    return mask


def mask_bbox(mask: Image.Image) -> tuple[int, int, int, int] | None:
    pix = mask.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(mask.size[1]):
        for x in range(mask.size[0]):
            if pix[x, y] > 0:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def longest_contiguous_run(values: list[int]) -> int:
    if not values:
        return 0
    sorted_values = sorted(set(values))
    best = 1
    current = 1
    previous = sorted_values[0]
    for value in sorted_values[1:]:
        if value == previous + 1:
            current += 1
        else:
            best = max(best, current)
            current = 1
        previous = value
    return max(best, current)


def normalize_mask(mask: Image.Image, canvas_size: int = 1024, target_height: int = 820) -> Image.Image:
    bbox = mask_bbox(mask)
    normalized = Image.new("L", (canvas_size, canvas_size), 0)
    if bbox is None:
        return normalized
    crop = mask.crop(bbox)
    if crop.size[1] <= 0:
        return normalized
    scale = target_height / crop.size[1]
    resized = crop.resize(
        (max(1, round(crop.size[0] * scale)), target_height),
        Image.Resampling.LANCZOS,
    )
    thresholded = Image.new("L", resized.size, 0)
    src = resized.load()
    dst = thresholded.load()
    for y in range(resized.size[1]):
        for x in range(resized.size[0]):
            if src[x, y] > 96:
                dst[x, y] = 255
    x0 = (canvas_size - thresholded.size[0]) // 2
    y0 = canvas_size - target_height - 82
    normalized.paste(thresholded, (x0, y0))
    return normalized


def mask_stats(mask: Image.Image) -> dict[str, float | None]:
    bbox = mask_bbox(mask)
    if bbox is None:
        return {
            "top_y_percent": None,
            "widest_y_percent": None,
            "base_width_percent": None,
            "flat_contact_width_percent": None,
        }

    left, top, right, bottom = bbox
    height = bottom - top
    width = right - left
    pix = mask.load()
    widest_span = 0
    widest_y = top
    bottom_band_start = bottom - max(1, round(height * 0.08))
    base_left = right
    base_right = left

    for y in range(top, bottom):
        row = [x for x in range(left, right) if pix[x, y] > 0]
        if not row:
            continue
        span = max(row) - min(row) + 1
        if span > widest_span:
            widest_span = span
            widest_y = y
        if y >= bottom_band_start:
            base_left = min(base_left, min(row))
            base_right = max(base_right, max(row))

    base_width = max(0, base_right - base_left + 1)

    floor_y = bottom - 1
    floor_tolerance = max(1, round(height * 0.0025))
    contact_columns: list[int] = []
    for x in range(left, right):
        column_bottom = None
        for y in range(bottom - 1, top - 1, -1):
            if pix[x, y] > 0:
                column_bottom = y
                break
        if column_bottom is not None and floor_y - column_bottom <= floor_tolerance:
            contact_columns.append(x)
    flat_contact = longest_contiguous_run(contact_columns)

    return {
        "top_y_percent": 0.0,
        "widest_y_percent": (widest_y - top) / height,
        "base_width_percent": base_width / width if width else None,
        "flat_contact_width_percent": flat_contact / width if width else None,
    }


def compare_masks(reference: Image.Image, generated: Image.Image) -> dict[str, Any]:
    ref = normalize_mask(reference)
    gen = normalize_mask(generated)
    ref_pix = ref.load()
    gen_pix = gen.load()
    width, height = ref.size
    ref_area = 0
    gen_area = 0
    intersection = 0
    union = 0
    generated_outside = 0
    reference_missing = 0

    overlay = Image.new("RGBA", ref.size, (246, 241, 232, 255))
    error = Image.new("RGBA", ref.size, (246, 241, 232, 255))
    overlay_pix = overlay.load()
    error_pix = error.load()

    for y in range(height):
        for x in range(width):
            r = ref_pix[x, y] > 0
            g = gen_pix[x, y] > 0
            if r:
                ref_area += 1
            if g:
                gen_area += 1
            if r or g:
                union += 1
            if r and g:
                intersection += 1
                overlay_pix[x, y] = (80, 165, 95, 210)
            elif g and not r:
                generated_outside += 1
                overlay_pix[x, y] = (220, 70, 56, 220)
                error_pix[x, y] = (220, 70, 56, 235)
            elif r and not g:
                reference_missing += 1
                overlay_pix[x, y] = (55, 105, 210, 220)
                error_pix[x, y] = (55, 105, 210, 235)

    reference_stats = mask_stats(ref)
    generated_stats = mask_stats(gen)
    metrics = {
        "mask_area_reference": ref_area,
        "mask_area_generated": gen_area,
        "mask_iou": intersection / union if union else 0,
        "generated_outside_reference_area_percent": generated_outside / ref_area if ref_area else 0,
        "reference_missing_from_generated_area_percent": reference_missing / ref_area if ref_area else 0,
    }
    metrics.update(generated_stats)
    metrics.update({f"generated_{key}": value for key, value in generated_stats.items()})
    metrics.update({f"reference_{key}": value for key, value in reference_stats.items()})
    return {"reference": ref, "generated": gen, "overlay": overlay, "error": error, "metrics": metrics}


def git_status_summary() -> str:
    try:
        return subprocess.check_output(
            ["git", "status", "--short", "design/pip-character"],
            cwd=DESIGN_ROOT.parents[1],
            text=True,
        ).strip()
    except Exception as exc:
        return f"git status unavailable: {exc}"


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    path = Path("/usr/share/fonts/truetype/dejavu") / name
    try:
        return ImageFont.truetype(str(path), size)
    except Exception:
        return ImageFont.load_default()


def fit_image(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    output = Image.new("RGBA", size, (250, 246, 238, 255))
    copy = image.convert("RGBA")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    output.alpha_composite(copy, ((size[0] - copy.size[0]) // 2, (size[1] - copy.size[1]) // 2))
    return output.convert("RGB")


def format_metric(value: Any) -> str:
    if isinstance(value, int | float):
        return f"{value:.3f}"
    return "n/a"


def build_technical_sheet(results: dict[str, dict[str, Any]], run_id: str) -> None:
    PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGB", (1320, 1680), (246, 241, 232))
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(30, bold=True)
    header_font = load_font(18, bold=True)
    small_font = load_font(13)

    draw.text((32, 24), "Pip Body-Only Technical QA", fill=(42, 42, 38), font=title_font)
    draw.text((32, 62), f"Run: {run_id}", fill=(84, 78, 70), font=small_font)
    draw.text((32, 82), "Green overlap, red generated outside target, blue target missing from generated body.", fill=(84, 78, 70), font=small_font)

    tile_w = 620
    tile_h = 360
    positions = {
        "front": (32, 120),
        "side": (668, 120),
        "back": (32, 520),
        "three_quarter": (668, 520),
    }
    for view, (x, y) in positions.items():
        result = results[view]
        draw.rounded_rectangle((x, y, x + tile_w, y + tile_h), radius=8, outline=(205, 190, 168), fill=(249, 245, 237))
        draw.text((x + 18, y + 16), view.replace("_", " ").title(), fill=(42, 42, 38), font=header_font)
        ref_img = fit_image(result["reference"].convert("RGBA"), (130, 210))
        gen_img = fit_image(result["generated"].convert("RGBA"), (130, 210))
        overlay_img = fit_image(result["overlay"], (210, 210))
        error_img = fit_image(result["error"], (130, 210))
        sheet.paste(ref_img, (x + 18, y + 66))
        sheet.paste(gen_img, (x + 160, y + 66))
        sheet.paste(overlay_img, (x + 302, y + 66))
        sheet.paste(error_img, (x + 524 - 18, y + 66))
        draw.text((x + 26, y + 284), "ref", fill=(84, 78, 70), font=small_font)
        draw.text((x + 168, y + 284), "gen", fill=(84, 78, 70), font=small_font)
        draw.text((x + 360, y + 284), "overlay", fill=(84, 78, 70), font=small_font)
        draw.text((x + 505, y + 284), "error", fill=(84, 78, 70), font=small_font)
        metrics = result["metrics"]
        draw.text(
            (x + 18, y + 318),
            f"IoU {metrics['mask_iou']:.3f}  outside {metrics['generated_outside_reference_area_percent']:.3f}  missing {metrics['reference_missing_from_generated_area_percent']:.3f}",
            fill=(84, 78, 70),
            font=small_font,
        )
        draw.text(
            (x + 18, y + 338),
            f"gen base {format_metric(metrics.get('base_width_percent'))}  flat {format_metric(metrics.get('flat_contact_width_percent'))}",
            fill=(84, 78, 70),
            font=small_font,
        )
        draw.text(
            (x + 18, y + 358),
            f"ref base {format_metric(metrics.get('reference_base_width_percent'))}  flat {format_metric(metrics.get('reference_flat_contact_width_percent'))}",
            fill=(84, 78, 70),
            font=small_font,
        )

    draw.text((32, 928), "Decision guidance", fill=(42, 42, 38), font=header_font)
    guidance = [
        "This sheet is body-only. Face, arms, branch, expressions, and shadows must not influence these masks.",
        "Use visual overlay first. Metrics are support evidence, not approval by themselves.",
        "Current threshold targets from the plan: front error < 3%, side < 4%, back < 3.5%.",
    ]
    for index, line in enumerate(guidance):
        draw.text((32, 960 + index * 24), line, fill=(84, 78, 70), font=small_font)

    sheet.save(TECHNICAL_QA_PATH)


def append_run_log(run_id: str, metrics: list[dict[str, Any]], decision: str, hypothesis: str) -> None:
    QA_ROOT.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().isoformat(timespec="seconds")
    existing = RUN_LOG_PATH.read_text(encoding="utf-8") if RUN_LOG_PATH.exists() else ""
    with RUN_LOG_PATH.open("a", encoding="utf-8") as handle:
        if existing and not existing.endswith("\n\n"):
            handle.write("\n" if existing.endswith("\n") else "\n\n")
        handle.write(f"## {run_id}\n\n")
        handle.write(f"- timestamp: `{timestamp}`\n")
        handle.write(f"- hypothesis: {hypothesis}\n")
        handle.write(f"- decision: `{decision}`\n")
        handle.write(f"- git status: `{git_status_summary()}`\n")
        for row in metrics:
            handle.write(
                f"- {row['view']}: IoU `{row['mask_iou']:.3f}`, outside `{row['generated_outside_reference_area_percent']:.3f}`, "
                f"missing `{row['reference_missing_from_generated_area_percent']:.3f}`, base `{format_metric(row.get('base_width_percent'))}`, "
                f"flat contact `{format_metric(row.get('flat_contact_width_percent'))}`, ref base `{format_metric(row.get('reference_base_width_percent'))}`, "
                f"ref flat `{format_metric(row.get('reference_flat_contact_width_percent'))}`\n"
            )
        handle.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="body-only-baseline-current")
    parser.add_argument("--hypothesis", default="Baseline body-only QA before geometry changes.")
    parser.add_argument("--decision", default="baseline")
    args = parser.parse_args()

    QA_ROOT.mkdir(parents=True, exist_ok=True)
    PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    scene_audit = {}
    if SCENE_AUDIT_PATH.exists():
        scene_audit = json.loads(SCENE_AUDIT_PATH.read_text(encoding="utf-8"))

    results: dict[str, dict[str, Any]] = {}
    metrics_rows: list[dict[str, Any]] = []
    landmarks: dict[str, Any] = {}

    for view in VIEWS:
        ref_path = REFERENCE_MASK_ROOT / f"body_{view}_mask.png"
        generated_path = GENERATED_MASK_ROOT / f"body_generated_{view}_mask.png"
        if not ref_path.exists():
            raise FileNotFoundError(f"Missing reference mask: {ref_path}")
        if not generated_path.exists():
            raise FileNotFoundError(f"Missing generated mask: {generated_path}")

        result = compare_masks(read_binary_mask(ref_path), read_binary_mask(generated_path))
        overlay_path = PREVIEW_ROOT / f"body_overlay_{view}.png"
        error_path = PREVIEW_ROOT / f"body_error_{view}.png"
        result["overlay"].save(overlay_path)
        result["error"].save(error_path)
        result["metrics"].update(
            {
                "run_id": args.run_id,
                "blender_version": scene_audit.get("blender_version"),
                "render_engine": scene_audit.get("render_engine"),
                "body_object_name": scene_audit.get("body_object_name"),
                "body_dimensions": scene_audit.get("body_dimensions"),
                "view": view,
                "reference_mask_path": str(ref_path),
                "generated_mask_path": str(generated_path),
                "overlay_path": str(overlay_path),
                "error_path": str(error_path),
                "decision": args.decision,
            }
        )
        metrics_rows.append(result["metrics"])
        landmarks[view] = {
            key: result["metrics"].get(key)
            for key in ("top_y_percent", "widest_y_percent", "base_width_percent", "flat_contact_width_percent")
        }
        landmarks[view]["reference"] = {
            key: result["metrics"].get(f"reference_{key}")
            for key in ("top_y_percent", "widest_y_percent", "base_width_percent", "flat_contact_width_percent")
        }
        landmarks[view]["generated"] = {
            key: result["metrics"].get(f"generated_{key}")
            for key in ("top_y_percent", "widest_y_percent", "base_width_percent", "flat_contact_width_percent")
        }
        results[view] = result

    METRICS_PATH.write_text(json.dumps(metrics_rows, indent=2), encoding="utf-8")
    LANDMARKS_PATH.write_text(json.dumps(landmarks, indent=2), encoding="utf-8")
    build_technical_sheet(results, args.run_id)
    append_run_log(args.run_id, metrics_rows, args.decision, args.hypothesis)

    print(METRICS_PATH)
    print(LANDMARKS_PATH)
    print(TECHNICAL_QA_PATH)


if __name__ == "__main__":
    main()
