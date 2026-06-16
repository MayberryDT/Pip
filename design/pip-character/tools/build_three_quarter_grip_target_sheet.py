#!/usr/bin/env python3
"""Build a focused target sheet for the Pip three-quarter grip silhouette failure."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from build_pip_reference_qa_sheet import content_bbox, fit, load_font


SCRIPT_PATH = Path(__file__).resolve()
DESIGN_ROOT = SCRIPT_PATH.parents[1]
REFERENCE_PATH = DESIGN_ROOT / "references" / "crops" / "v001" / "three_quarter.png"
GENERATED_PATH = DESIGN_ROOT / "generated" / "previews" / "pip_reference_matched_three_quarter.png"
QA_ROOT = DESIGN_ROOT / "generated" / "qa"
OUTPUT_PATH = QA_ROOT / "three_quarter_grip_target_sheet_v1.png"
JSON_PATH = QA_ROOT / "three_quarter_grip_target_v1.json"


def stats(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGB")
    bbox = content_bbox(image)
    left, top, right, bottom = bbox
    width = right - left
    height = bottom - top
    return {
        "path": str(path),
        "image_width": image.size[0],
        "image_height": image.size[1],
        "bbox": [left, top, right, bottom],
        "width": width,
        "height": height,
        "ratio": width / height if height else 0.0,
    }


def draw_bbox(image: Image.Image, bbox: list[int], color: tuple[int, int, int], width: int = 4) -> Image.Image:
    output = image.copy()
    draw = ImageDraw.Draw(output)
    left, top, right, bottom = bbox
    for offset in range(width):
        draw.rectangle((left - offset, top - offset, right + offset, bottom + offset), outline=color)
    return output


def main() -> None:
    QA_ROOT.mkdir(parents=True, exist_ok=True)
    title_font = load_font(30, bold=True)
    header_font = load_font(18, bold=True)
    body_font = load_font(15)
    small_font = load_font(13)

    ref = stats(REFERENCE_PATH)
    gen = stats(GENERATED_PATH)
    target_width = int(round(float(ref["ratio"]) * int(gen["height"])))
    current_width = int(gen["width"])
    missing_width = target_width - current_width
    left, top, right, bottom = list(gen["bbox"])
    target_right = right + max(0, missing_width)
    target_bbox = [left, top, target_right, bottom]

    sheet = Image.new("RGB", (1180, 820), (246, 241, 232))
    draw = ImageDraw.Draw(sheet)
    draw.text((32, 24), "Pip Three-Quarter Grip Target", fill=(42, 42, 38), font=title_font)
    draw.text(
        (32, 64),
        "Current accepted residual versus reference crop. Blue is current generated bbox; amber is target width if height stays fixed.",
        fill=(92, 86, 76),
        font=small_font,
    )

    ref_image = Image.open(REFERENCE_PATH).convert("RGB")
    gen_image = Image.open(GENERATED_PATH).convert("RGB")
    ref_overlay = draw_bbox(ref_image, list(ref["bbox"]), (205, 67, 53))
    gen_overlay = draw_bbox(gen_image, list(gen["bbox"]), (50, 121, 196))
    gen_target = draw_bbox(gen_overlay, target_bbox, (214, 142, 35), width=5)

    draw.rounded_rectangle((32, 104, 364, 690), radius=8, outline=(205, 190, 168), fill=(249, 245, 237))
    draw.text((54, 126), "Reference", fill=(52, 49, 44), font=header_font)
    sheet.paste(fit(ref_overlay, (270, 390)), (62, 178))
    draw.text((54, 606), f"ratio {ref['ratio']:.3f}", fill=(84, 78, 70), font=body_font)
    draw.text((54, 632), f"bbox {ref['width']} x {ref['height']}", fill=(84, 78, 70), font=body_font)

    draw.rounded_rectangle((400, 104, 828, 690), radius=8, outline=(205, 190, 168), fill=(249, 245, 237))
    draw.text((422, 126), "Generated + Target Width", fill=(52, 49, 44), font=header_font)
    sheet.paste(fit(gen_target, (340, 390)), (444, 178))
    draw.text((422, 606), f"current ratio {gen['ratio']:.3f}", fill=(84, 78, 70), font=body_font)
    draw.text((422, 632), f"target ratio {ref['ratio']:.3f}", fill=(84, 78, 70), font=body_font)
    draw.text((422, 658), f"missing width {missing_width}px at generated scale", fill=(132, 75, 28), font=body_font)

    draw.rounded_rectangle((864, 104, 1148, 690), radius=8, outline=(205, 190, 168), fill=(249, 245, 237))
    draw.text((886, 126), "Modeling Target", fill=(52, 49, 44), font=header_font)
    notes = [
        "Do not widen the body.",
        "Preserve front ratio near 0.812.",
        "Preserve clean back silhouette.",
        "Keep side below 0.789 guardrail.",
        "Add three-quarter width through",
        "a real right-hand/stem grip mass",
        "or sculptable sprig blockout.",
        "Curve/depth leaf tuning failed.",
    ]
    y = 178
    for note in notes:
        draw.text((886, y), note, fill=(64, 60, 54), font=body_font)
        y += 34

    payload = {
        "run_id": "three-quarter-grip-target-v1",
        "reference": ref,
        "generated": gen,
        "target_width_at_generated_height": target_width,
        "current_width": current_width,
        "missing_width": missing_width,
        "target_bbox": target_bbox,
        "output_path": str(OUTPUT_PATH),
    }
    JSON_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    sheet.save(OUTPUT_PATH)
    print(OUTPUT_PATH)
    print(JSON_PATH)


if __name__ == "__main__":
    main()
