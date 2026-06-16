#!/usr/bin/env python3
"""Generate authored body-only masks for the Pip v001 reference crops.

The reference crops contain arms, branch, face details, and shadows that overlap
the body. A pure color threshold will not produce a body-only target, so these
masks are deliberate low-frequency silhouette targets derived from the visible
reference body form.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


SCRIPT_PATH = Path(__file__).resolve()
DESIGN_ROOT = SCRIPT_PATH.parents[1]
REFERENCE_ROOT = DESIGN_ROOT / "references" / "crops" / "v001"
MASK_ROOT = DESIGN_ROOT / "references" / "masks" / "v001"
MASK_REVIEW_PATH = MASK_ROOT / "body_reference_mask_review_sheet.png"


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def interpolate(points: list[tuple[float, float]], t: float) -> float:
    if t <= points[0][0]:
        return points[0][1]
    if t >= points[-1][0]:
        return points[-1][1]
    for index in range(len(points) - 1):
        t0, v0 = points[index]
        t1, v1 = points[index + 1]
        if t0 <= t <= t1:
            local = smoothstep((t - t0) / (t1 - t0))
            return v0 + (v1 - v0) * local
    return points[-1][1]


def profile_polygon(
    width: int,
    top: float,
    bottom: float,
    center_points: list[tuple[float, float]],
    left_width_points: list[tuple[float, float]],
    right_width_points: list[tuple[float, float]],
    samples: int = 260,
) -> list[tuple[float, float]]:
    left: list[tuple[float, float]] = []
    right: list[tuple[float, float]] = []
    for sample in range(samples + 1):
        t = sample / samples
        y = top + (bottom - top) * t
        center = interpolate(center_points, t)
        left_width = interpolate(left_width_points, t)
        right_width = interpolate(right_width_points, t)
        left.append((center - left_width, y))
        right.append((center + right_width, y))
    return left + list(reversed(right))


def make_mask(image_name: str, spec: dict) -> Path:
    source = Image.open(REFERENCE_ROOT / f"{image_name}.png").convert("RGB")
    mask = Image.new("L", source.size, 0)
    polygon = profile_polygon(
        source.size[0],
        spec["top"],
        spec["bottom"],
        spec["center"],
        spec["left"],
        spec["right"],
    )
    draw = ImageDraw.Draw(mask)
    draw.polygon(polygon, fill=255)

    # The reference base has a soft, slightly flattened plush contact. Keep a
    # short flat contact in the target without matching cast-shadow pixels.
    if spec.get("base_rect"):
        draw.rounded_rectangle(spec["base_rect"], radius=spec.get("base_radius", 10), fill=255)

    output = MASK_ROOT / f"body_{image_name}_mask.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    mask.save(output)
    return output


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    font_name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    path = Path("/usr/share/fonts/truetype/dejavu") / font_name
    try:
        return ImageFont.truetype(str(path), size)
    except Exception:
        return ImageFont.load_default()


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    output = Image.new("RGBA", size, (250, 246, 238, 255))
    copy = image.convert("RGBA")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    output.alpha_composite(copy, ((size[0] - copy.size[0]) // 2, (size[1] - copy.size[1]) // 2))
    return output


def overlay_mask_on_reference(image_name: str) -> Image.Image:
    reference = Image.open(REFERENCE_ROOT / f"{image_name}.png").convert("RGBA")
    mask = Image.open(MASK_ROOT / f"body_{image_name}_mask.png").convert("L")
    overlay = Image.new("RGBA", reference.size, (0, 0, 0, 0))
    overlay_pixels = overlay.load()
    mask_pixels = mask.load()
    width, height = reference.size
    for y in range(height):
        for x in range(width):
            if mask_pixels[x, y] > 0:
                overlay_pixels[x, y] = (55, 130, 220, 72)

    outline = Image.new("RGBA", reference.size, (0, 0, 0, 0))
    outline_draw = ImageDraw.Draw(outline)
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            if mask_pixels[x, y] == 0:
                continue
            if (
                mask_pixels[x - 1, y] == 0
                or mask_pixels[x + 1, y] == 0
                or mask_pixels[x, y - 1] == 0
                or mask_pixels[x, y + 1] == 0
            ):
                outline_draw.point((x, y), fill=(220, 55, 45, 255))

    reference.alpha_composite(overlay)
    reference.alpha_composite(outline)
    return reference


def build_review_sheet(image_names: list[str]) -> None:
    MASK_ROOT.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGB", (1120, 780), (246, 241, 232))
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(28, bold=True)
    label_font = load_font(16, bold=True)
    small_font = load_font(13)
    draw.text((32, 24), "Pip Reference Body Mask Review", fill=(42, 42, 38), font=title_font)
    draw.text((32, 62), "Blue fill and red outline show the authored body-only target over each reference crop.", fill=(84, 78, 70), font=small_font)
    positions = {
        "front": (32, 104),
        "three_quarter": (310, 104),
        "side": (588, 104),
        "back": (824, 104),
    }
    for name in image_names:
        x, y = positions[name]
        panel_w = 250
        panel_h = 610
        draw.rounded_rectangle((x, y, x + panel_w, y + panel_h), radius=8, outline=(205, 190, 168), fill=(249, 245, 237))
        draw.text((x + 16, y + 14), name.replace("_", " ").title(), fill=(42, 42, 38), font=label_font)
        image = fit(overlay_mask_on_reference(name), (210, 500)).convert("RGB")
        sheet.paste(image, (x + 20, y + 58))
    sheet.save(MASK_REVIEW_PATH)


def main() -> None:
    # Coordinates are in source crop pixels. They are intentionally smooth and
    # low-frequency so the generated body does not chase branch/arm occlusions.
    specs = {
        "front": {
            "top": 31,
            "bottom": 356,
            "center": [(0.0, 145), (0.30, 145), (0.65, 145), (1.0, 143)],
            "left": [
                (0.00, 0),
                (0.05, 42),
                (0.14, 72),
                (0.30, 96),
                (0.52, 112),
                (0.72, 115),
                (0.88, 98),
                (1.00, 76),
            ],
            "right": [
                (0.00, 0),
                (0.05, 43),
                (0.14, 74),
                (0.30, 100),
                (0.52, 120),
                (0.72, 123),
                (0.88, 104),
                (1.00, 80),
            ],
            "base_rect": (64, 344, 226, 357),
            "base_radius": 8,
        },
        "side": {
            "top": 40,
            "bottom": 351,
            "center": [(0.0, 157), (0.28, 158), (0.58, 156), (1.0, 160)],
            "left": [
                (0.00, 0),
                (0.07, 42),
                (0.20, 73),
                (0.40, 100),
                (0.63, 110),
                (0.82, 90),
                (1.00, 63),
            ],
            "right": [
                (0.00, 0),
                (0.07, 38),
                (0.20, 71),
                (0.40, 101),
                (0.63, 111),
                (0.82, 96),
                (1.00, 75),
            ],
            "base_rect": (94, 339, 238, 352),
            "base_radius": 8,
        },
        "back": {
            "top": 34,
            "bottom": 352,
            "center": [(0.0, 146), (0.35, 146), (0.70, 145), (1.0, 145)],
            "left": [
                (0.00, 0),
                (0.05, 39),
                (0.16, 72),
                (0.34, 105),
                (0.58, 123),
                (0.76, 121),
                (0.91, 100),
                (1.00, 66),
            ],
            "right": [
                (0.00, 0),
                (0.05, 39),
                (0.16, 72),
                (0.34, 105),
                (0.58, 124),
                (0.76, 121),
                (0.91, 100),
                (1.00, 67),
            ],
            "base_rect": (80, 340, 213, 353),
            "base_radius": 8,
        },
        "three_quarter": {
            "top": 32,
            "bottom": 352,
            "center": [(0.0, 162), (0.25, 163), (0.62, 158), (1.0, 160)],
            "left": [
                (0.00, 0),
                (0.06, 43),
                (0.18, 76),
                (0.36, 104),
                (0.58, 114),
                (0.78, 105),
                (1.00, 72),
            ],
            "right": [
                (0.00, 0),
                (0.06, 45),
                (0.18, 82),
                (0.36, 112),
                (0.58, 122),
                (0.78, 111),
                (1.00, 77),
            ],
            "base_rect": (88, 340, 241, 353),
            "base_radius": 8,
        },
    }

    image_names = list(specs.keys())
    for name, spec in specs.items():
        output = make_mask(name, spec)
        print(output)
    build_review_sheet(image_names)
    print(MASK_REVIEW_PATH)


if __name__ == "__main__":
    main()
