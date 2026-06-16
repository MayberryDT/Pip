#!/usr/bin/env python3
"""Build the broad Pip reference-match QA sheet from current renders."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import statistics

from PIL import Image, ImageDraw, ImageFont


SCRIPT_PATH = Path(__file__).resolve()
DESIGN_ROOT = SCRIPT_PATH.parents[1]
REFERENCE_ROOT = DESIGN_ROOT / "references" / "crops" / "v001"
PREVIEW_ROOT = DESIGN_ROOT / "generated" / "previews"
QA_ROOT = DESIGN_ROOT / "generated" / "qa"
OUTPUT_PATH = PREVIEW_ROOT / "pip_reference_matched_qa_sheet.png"
METRICS_PATH = QA_ROOT / "broad_crop_metrics.json"
DEBUG_PATH = QA_ROOT / "broad_crop_debug_sheet.png"


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    path = Path("/usr/share/fonts/truetype/dejavu") / name
    try:
        return ImageFont.truetype(str(path), size)
    except Exception:
        return ImageFont.load_default()


def content_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    sample = max(5, min(width, height) // 18)
    corners = []
    for xs, xe, ys, ye in (
        (0, sample, 0, sample),
        (width - sample, width, 0, sample),
        (0, sample, height - sample, height),
        (width - sample, width, height - sample, height),
    ):
        for y in range(ys, ye):
            for x in range(xs, xe):
                corners.append(pixels[x, y])
    bg = tuple(int(statistics.median([p[i] for p in corners])) for i in range(3))
    bg_lum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]
    xs: list[int] = []
    ys: list[int] = []
    for y in range(height):
        for x in range(width):
            red, green, blue = pixels[x, y]
            lum = 0.2126 * red + 0.7152 * green + 0.0722 * blue
            diff = abs(red - bg[0]) + abs(green - bg[1]) + abs(blue - bg[2])
            sage = green >= red - 4 and green >= blue + 5 and lum < 248
            dark = lum < bg_lum - 17
            if diff > 42 or dark or sage:
                xs.append(x)
                ys.append(y)
    if not xs:
        return (0, 0, width, height)
    left, top, right, bottom = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    if (right - left) > width * 0.94 or (bottom - top) > height * 0.94:
        xs = []
        ys = []
        for y in range(height):
            for x in range(width):
                red, green, blue = pixels[x, y]
                lum = 0.2126 * red + 0.7152 * green + 0.0722 * blue
                sage = green >= red - 3 and green >= blue + 8 and lum < 240
                dark = lum < bg_lum - 28
                if sage or dark:
                    xs.append(x)
                    ys.append(y)
        if xs:
            left, top, right, bottom = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    pad_x = int((right - left) * 0.035)
    pad_y = int((bottom - top) * 0.035)
    return (max(0, left - pad_x), max(0, top - pad_y), min(width, right + pad_x), min(height, bottom + pad_y))


def crop_content(path: Path) -> tuple[Image.Image, float]:
    image = Image.open(path).convert("RGB")
    crop = image.crop(content_bbox(image))
    ratio = crop.size[0] / crop.size[1] if crop.size[1] else 0.0
    return crop, ratio


def crop_stats(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGB")
    bbox = content_bbox(image)
    left, top, right, bottom = bbox
    width = right - left
    height = bottom - top
    return {
        "source_path": str(path),
        "image_width": image.size[0],
        "image_height": image.size[1],
        "bbox": [left, top, right, bottom],
        "detected_width": width,
        "detected_height": height,
        "ratio": width / height if height else 0.0,
    }


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    output = Image.new("RGB", size, (250, 246, 238))
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    output.paste(copy, ((size[0] - copy.size[0]) // 2, (size[1] - copy.size[1]) // 2))
    return output


def image_with_bbox(path: Path, bbox: list[int], color: tuple[int, int, int]) -> Image.Image:
    image = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(image)
    left, top, right, bottom = bbox
    line_width = max(3, min(image.size) // 120)
    for offset in range(line_width):
        draw.rectangle(
            (left - offset, top - offset, right + offset - 1, bottom + offset - 1),
            outline=color,
        )
    return image


def safe_filename_part(value: str) -> str:
    return "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in value)


def build_debug_sheet(metrics: list[dict[str, object]], output_path: Path) -> None:
    title_font = load_font(30, bold=True)
    header_font = load_font(18)
    small_font = load_font(13)

    sheet = Image.new("RGB", (980, 1320), (246, 241, 232))
    draw = ImageDraw.Draw(sheet)
    draw.text((32, 24), "Pip v001 Broad Crop Debug", fill=(42, 42, 38), font=title_font)
    draw.text(
        (32, 64),
        "Detected content boxes used for broad full-character ratio checks.",
        fill=(92, 86, 76),
        font=small_font,
    )

    positions = [(32, 88), (508, 88), (32, 630), (508, 630)]
    panel_w, panel_h = 440, 510
    for entry, (px, py) in zip(metrics, positions):
        label = str(entry["label"])
        reference = entry["reference"]
        generated = entry["generated"]
        assert isinstance(reference, dict)
        assert isinstance(generated, dict)
        draw.rounded_rectangle((px, py, px + panel_w, py + panel_h), radius=8, outline=(205, 190, 168), fill=(249, 245, 237))
        draw.text((px + 18, py + 18), label, fill=(52, 49, 44), font=header_font)
        draw.text((px + 22, py + 62), "Reference", fill=(90, 84, 75), font=small_font)
        draw.text((px + 238, py + 62), "Generated", fill=(90, 84, 75), font=small_font)

        ref_path = Path(str(reference["source_path"]))
        gen_path = Path(str(generated["source_path"]))
        ref_overlay = image_with_bbox(ref_path, list(reference["bbox"]), (205, 67, 53))
        gen_overlay = image_with_bbox(gen_path, list(generated["bbox"]), (50, 121, 196))
        sheet.paste(fit(ref_overlay, (190, 265)), (px + 18, py + 106))
        sheet.paste(fit(gen_overlay, (190, 265)), (px + 234, py + 106))

        draw.text((px + 22, py + 410), f"bbox {reference['detected_width']} x {reference['detected_height']}", fill=(84, 78, 70), font=small_font)
        draw.text((px + 238, py + 410), f"bbox {generated['detected_width']} x {generated['detected_height']}", fill=(84, 78, 70), font=small_font)
        draw.text((px + 22, py + 450), f"ratio ref {reference['ratio']:.3f}", fill=(84, 78, 70), font=small_font)
        draw.text((px + 238, py + 450), f"gen {generated['ratio']:.3f}", fill=(84, 78, 70), font=small_font)

    sheet.save(output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", default="broad-crop-audit-v1", help="Run ID to store in broad crop metrics.")
    args = parser.parse_args()
    safe_run_id = safe_filename_part(args.run_id)
    run_metrics_path = QA_ROOT / f"broad_crop_metrics_{safe_run_id}.json"
    run_debug_path = QA_ROOT / f"broad_crop_debug_sheet_{safe_run_id}.png"

    PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    QA_ROOT.mkdir(parents=True, exist_ok=True)
    title_font = load_font(30, bold=True)
    header_font = load_font(18)
    small_font = load_font(13)

    sheet = Image.new("RGB", (980, 1320), (246, 241, 232))
    draw = ImageDraw.Draw(sheet)
    draw.text((32, 24), "Pip v001 Reference Match QA", fill=(42, 42, 38), font=title_font)
    draw.text((32, 64), "Content-cropped reference and generated renders for proportion and attachment review.", fill=(92, 86, 76), font=small_font)

    views = [
        ("Front", "front", "front"),
        ("Three quarter", "three_quarter", "three_quarter"),
        ("Side", "side", "side"),
        ("Back", "back", "back"),
    ]
    positions = [(32, 88), (508, 88), (32, 630), (508, 630)]
    panel_w, panel_h = 440, 510
    ratios = {}
    metrics = []
    for (label, ref_name, gen_name), (px, py) in zip(views, positions):
        draw.rounded_rectangle((px, py, px + panel_w, py + panel_h), radius=8, outline=(205, 190, 168), fill=(249, 245, 237))
        draw.text((px + 18, py + 18), label, fill=(52, 49, 44), font=header_font)
        draw.text((px + 22, py + 62), "Reference", fill=(90, 84, 75), font=small_font)
        draw.text((px + 238, py + 62), "Generated", fill=(90, 84, 75), font=small_font)
        ref_path = REFERENCE_ROOT / f"{ref_name}.png"
        gen_path = PREVIEW_ROOT / f"pip_reference_matched_{gen_name}.png"
        ref_crop, ref_ratio = crop_content(ref_path)
        gen_crop, gen_ratio = crop_content(gen_path)
        ref_stats = crop_stats(ref_path)
        gen_stats = crop_stats(gen_path)
        ratios[gen_name] = (ref_ratio, gen_ratio)
        metrics.append(
            {
                "label": label,
                "view": gen_name,
                "run_id": args.run_id,
                "reference": ref_stats,
                "generated": gen_stats,
                "ratio_delta": gen_ratio - ref_ratio,
                "ratio_delta_abs": abs(gen_ratio - ref_ratio),
            }
        )
        sheet.paste(fit(ref_crop, (190, 265)), (px + 18, py + 106))
        sheet.paste(fit(gen_crop, (190, 265)), (px + 234, py + 106))
        draw.text((px + 22, py + 450), f"ratio ref {ref_ratio:.3f}", fill=(84, 78, 70), font=small_font)
        draw.text((px + 238, py + 450), f"gen {gen_ratio:.3f}", fill=(84, 78, 70), font=small_font)

    draw.text((32, 1146), "Render checks", fill=(52, 49, 44), font=header_font)
    for index, (label, filename) in enumerate(
        [
            ("Hero", "pip_reference_matched_hero.png"),
            ("Tiny 64", "pip_reference_matched_tiny_64.png"),
            ("Tiny 32", "pip_reference_matched_tiny_32.png"),
        ]
    ):
        px = 32 + index * 318
        py = 1170
        draw.rounded_rectangle((px, py, px + 286, py + 118), radius=8, outline=(205, 190, 168), fill=(249, 245, 237))
        draw.text((px + 14, py + 14), label, fill=(90, 84, 75), font=small_font)
        crop, _ = crop_content(PREVIEW_ROOT / filename)
        sheet.paste(fit(crop, (130, 70)), (px + 78, py + 40))

    sheet.save(OUTPUT_PATH)
    build_debug_sheet(metrics, DEBUG_PATH)
    if run_debug_path != DEBUG_PATH:
        build_debug_sheet(metrics, run_debug_path)

    current_payload = {
        "run_id": args.run_id,
        "qa_sheet_path": str(OUTPUT_PATH),
        "debug_sheet_path": str(DEBUG_PATH),
        "run_specific_metrics_path": str(run_metrics_path),
        "run_specific_debug_sheet_path": str(run_debug_path),
        "views": metrics,
    }
    run_payload = dict(current_payload)
    run_payload["debug_sheet_path"] = str(run_debug_path)
    run_payload["metrics_path"] = str(run_metrics_path)
    METRICS_PATH.write_text(json.dumps(current_payload, indent=2) + "\n", encoding="utf-8")
    run_metrics_path.write_text(json.dumps(run_payload, indent=2) + "\n", encoding="utf-8")
    for key, (ref_ratio, gen_ratio) in ratios.items():
        print(key, f"ref {ref_ratio:.3f}", f"gen {gen_ratio:.3f}")
    print(OUTPUT_PATH)
    print(METRICS_PATH)
    print(DEBUG_PATH)
    print(run_metrics_path)
    print(run_debug_path)


if __name__ == "__main__":
    main()
