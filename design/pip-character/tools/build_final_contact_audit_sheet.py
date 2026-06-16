#!/usr/bin/env python3
"""Build final Pip contact-audit crops from the current review renders."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SCRIPT_PATH = Path(__file__).resolve()
DESIGN_ROOT = SCRIPT_PATH.parents[1]
PREVIEW_ROOT = DESIGN_ROOT / "generated" / "previews"
QA_ROOT = DESIGN_ROOT / "generated" / "qa"
CONTACT_ROOT = QA_ROOT / "contact_audit"
SHEET_PATH = PREVIEW_ROOT / "pip_reference_matched_contact_audit_sheet.png"
BODY_TECHNICAL_QA_PATH = PREVIEW_ROOT / "pip_reference_matched_technical_qa_sheet.png"
FINAL_TECHNICAL_QA_PATH = PREVIEW_ROOT / "pip_reference_matched_final_technical_qa_sheet.png"
MANIFEST_PATH = CONTACT_ROOT / "final_contact_audit_v1.json"


CROPS = [
    {
        "id": "eyes_front_contact",
        "title": "Front Eyes",
        "source": "pip_reference_matched_front.png",
        "box": (330, 300, 650, 455),
        "review_focus": "Eyes should sit on the face surface with subtle contact, not read as floating beads.",
    },
    {
        "id": "mouth_front_contact",
        "title": "Front Mouth",
        "source": "pip_reference_matched_front.png",
        "box": (385, 410, 635, 570),
        "review_focus": "Smile should be visible and surface-following without an obvious air gap.",
    },
    {
        "id": "eyes_side_contact",
        "title": "Side Eye",
        "source": "pip_reference_matched_side.png",
        "box": (250, 305, 440, 430),
        "review_focus": "Side view should not expose the eye as a detached protruding bead.",
    },
    {
        "id": "mouth_side_contact",
        "title": "Side Mouth",
        "source": "pip_reference_matched_side.png",
        "box": (245, 410, 440, 535),
        "review_focus": "Side view should show the mouth as a surface-following mark, not a hovering curve.",
    },
    {
        "id": "left_arm_root_front",
        "title": "Left Arm Root",
        "source": "pip_reference_matched_front.png",
        "box": (165, 555, 485, 800),
        "review_focus": "Left arm root should look buried into the body, without a visible disk or tube cap.",
    },
    {
        "id": "right_arm_root_front",
        "title": "Right Arm Root",
        "source": "pip_reference_matched_front.png",
        "box": (590, 550, 830, 790),
        "review_focus": "Right arm root and hand should read as soft mitten anatomy attached to the body.",
    },
    {
        "id": "right_hand_branch_grip_three_quarter",
        "title": "Right Grip 3/4",
        "source": "pip_reference_matched_three_quarter.png",
        "box": (465, 520, 760, 760),
        "review_focus": "The stem should read as passing through or behind the mitten grip, not pasted over it.",
    },
    {
        "id": "side_arm_branch_contact",
        "title": "Side Grip",
        "source": "pip_reference_matched_side.png",
        "box": (215, 500, 500, 760),
        "review_focus": "Side view should not reveal floating arm, hand, petiole, or stem construction.",
    },
    {
        "id": "base_contact_front",
        "title": "Front Base",
        "source": "pip_reference_matched_front.png",
        "box": (170, 795, 840, 950),
        "review_focus": "Base should sit softly on the ground, not like a clipped shelf or suction cup.",
    },
    {
        "id": "base_contact_side",
        "title": "Side Base",
        "source": "pip_reference_matched_side.png",
        "box": (300, 785, 885, 950),
        "review_focus": "Side base should roll into the floor with a short flat contact patch.",
    },
]


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    path = Path("/usr/share/fonts/truetype/dejavu") / name
    try:
        return ImageFont.truetype(str(path), size)
    except Exception:
        return ImageFont.load_default()


def fit_image(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    output = Image.new("RGB", size, (250, 246, 238))
    copy = image.convert("RGB")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    output.paste(copy, ((size[0] - copy.size[0]) // 2, (size[1] - copy.size[1]) // 2))
    return output


def crop_source(source_path: Path, box: tuple[int, int, int, int]) -> Image.Image:
    image = Image.open(source_path).convert("RGB")
    left, top, right, bottom = box
    if left < 0 or top < 0 or right > image.width or bottom > image.height or left >= right or top >= bottom:
        raise ValueError(f"Invalid crop box {box} for {source_path} with size {image.size}")
    return image.crop(box)


def wrapped_lines(text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    scratch = Image.new("RGB", (1, 1))
    draw = ImageDraw.Draw(scratch)
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def build_sheet(crop_records: list[dict], run_id: str) -> None:
    PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGB", (1440, 1900), (246, 241, 232))
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(34, bold=True)
    header_font = load_font(19, bold=True)
    small_font = load_font(13)

    draw.text((36, 28), "Pip Final Contact Audit", fill=(42, 42, 38), font=title_font)
    draw.text((36, 72), f"Run: {run_id}", fill=(84, 78, 70), font=small_font)
    draw.text(
        (36, 94),
        "Deterministic crops from current final renders for attachment, grip, and base-contact review.",
        fill=(84, 78, 70),
        font=small_font,
    )

    tile_w = 420
    tile_h = 320
    margin_x = 36
    gap = 30
    start_y = 135

    for index, record in enumerate(crop_records):
        col = index % 3
        row = index // 3
        x = margin_x + col * (tile_w + gap)
        y = start_y + row * (tile_h + gap)
        draw.rounded_rectangle((x, y, x + tile_w, y + tile_h), radius=8, outline=(205, 190, 168), fill=(249, 245, 237))
        draw.text((x + 16, y + 14), record["title"], fill=(42, 42, 38), font=header_font)
        draw.text((x + 16, y + 42), record["source"], fill=(84, 78, 70), font=small_font)
        image = fit_image(Image.open(record["path"]), (tile_w - 32, 170))
        sheet.paste(image, (x + 16, y + 68))
        draw.text((x + 16, y + 246), f"box {tuple(record['box'])}", fill=(84, 78, 70), font=small_font)
        for line_index, line in enumerate(wrapped_lines(record["review_focus"], small_font, tile_w - 32)[:3]):
            draw.text((x + 16, y + 270 + line_index * 17), line, fill=(84, 78, 70), font=small_font)

    footer_y = start_y + 4 * (tile_h + gap) + 20
    draw.text((36, footer_y), "Decision Guidance", fill=(42, 42, 38), font=header_font)
    guidance = [
        "Use this sheet with the broad QA and body-only technical QA. It is a targeted attachment review, not a metric pass.",
        "Reject only the specific area that fails: shape/base, arms/hands, branch/grip, or face/material.",
        "Do not approve production export until the human review decision is recorded in the final dossier.",
    ]
    for line_index, line in enumerate(guidance):
        draw.text((36, footer_y + 32 + line_index * 24), line, fill=(84, 78, 70), font=small_font)

    sheet.save(SHEET_PATH)


def build_combined_technical_sheet(run_id: str) -> None:
    if not BODY_TECHNICAL_QA_PATH.exists():
        raise FileNotFoundError(f"Missing body technical QA sheet: {BODY_TECHNICAL_QA_PATH}")
    if not SHEET_PATH.exists():
        raise FileNotFoundError(f"Missing contact audit sheet: {SHEET_PATH}")

    body = Image.open(BODY_TECHNICAL_QA_PATH).convert("RGB")
    contact = Image.open(SHEET_PATH).convert("RGB")
    width = max(body.width, contact.width)
    header_h = 90
    gap = 28
    height = header_h + body.height + gap + contact.height + 42
    sheet = Image.new("RGB", (width, height), (246, 241, 232))
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(32, bold=True)
    small_font = load_font(13)

    draw.text((36, 26), "Pip Final Technical QA", fill=(42, 42, 38), font=title_font)
    draw.text(
        (36, 66),
        f"Run: {run_id}. Body masks/overlays plus final contact audit crops.",
        fill=(84, 78, 70),
        font=small_font,
    )

    body_x = (width - body.width) // 2
    contact_x = (width - contact.width) // 2
    body_y = header_h
    contact_y = body_y + body.height + gap
    sheet.paste(body, (body_x, body_y))
    sheet.paste(contact, (contact_x, contact_y))
    sheet.save(FINAL_TECHNICAL_QA_PATH)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="final-contact-audit-v1")
    args = parser.parse_args()

    CONTACT_ROOT.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    for spec in CROPS:
        source_path = PREVIEW_ROOT / spec["source"]
        if not source_path.exists():
            raise FileNotFoundError(f"Missing source render: {source_path}")
        crop = crop_source(source_path, spec["box"])
        crop_path = CONTACT_ROOT / f"{spec['id']}.png"
        crop.save(crop_path)
        records.append(
            {
                "id": spec["id"],
                "title": spec["title"],
                "source": spec["source"],
                "source_path": str(source_path),
                "box": list(spec["box"]),
                "path": str(crop_path),
                "review_focus": spec["review_focus"],
            }
        )

    build_sheet(records, args.run_id)
    build_combined_technical_sheet(args.run_id)
    manifest = {
        "run_id": args.run_id,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "sheet_path": str(SHEET_PATH),
        "final_technical_qa_sheet_path": str(FINAL_TECHNICAL_QA_PATH),
        "contact_root": str(CONTACT_ROOT),
        "crops": records,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(SHEET_PATH)
    print(FINAL_TECHNICAL_QA_PATH)
    print(MANIFEST_PATH)


if __name__ == "__main__":
    main()
