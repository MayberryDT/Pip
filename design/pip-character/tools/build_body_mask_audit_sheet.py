#!/usr/bin/env python3
"""Build a reference-mask audit sheet for the Pip v001 body gate."""

from __future__ import annotations

from pathlib import Path
import statistics

from PIL import Image, ImageDraw, ImageFont


SCRIPT_PATH = Path(__file__).resolve()
DESIGN_ROOT = SCRIPT_PATH.parents[1]
REFERENCE_ROOT = DESIGN_ROOT / "references" / "crops" / "v001"
REFERENCE_MASK_ROOT = DESIGN_ROOT / "references" / "masks" / "v001"
PREVIEW_ROOT = DESIGN_ROOT / "generated" / "previews"
QA_ROOT = DESIGN_ROOT / "generated" / "qa"
GENERATED_MASK_ROOT = QA_ROOT / "masks"
OUTPUT_PATH = QA_ROOT / "body_mask_audit_sheet_v1.png"

VIEWS = (
    ("front", "Front"),
    ("three_quarter", "Three Quarter"),
    ("side", "Side"),
    ("back", "Back"),
)


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    path = Path("/usr/share/fonts/truetype/dejavu") / name
    try:
        return ImageFont.truetype(str(path), size)
    except Exception:
        return ImageFont.load_default()


def read_binary_mask(path: Path) -> Image.Image:
    original = Image.open(path)
    image = original.convert("RGBA")
    alpha = image.getchannel("A")
    gray = image.convert("L")
    mask = Image.new("L", image.size, 0)
    alpha_range = alpha.getextrema()
    use_alpha = original.mode in {"RGBA", "LA"} and alpha_range[0] < 16 and alpha_range[1] > 240
    alpha_pixels = alpha.load()
    gray_pixels = gray.load()
    output = mask.load()
    for y in range(image.size[1]):
        for x in range(image.size[0]):
            if alpha_pixels[x, y] > 16 if use_alpha else gray_pixels[x, y] > 80:
                output[x, y] = 255
    return mask


def mask_bbox(mask: Image.Image) -> tuple[int, int, int, int] | None:
    pixels = mask.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(mask.size[1]):
        for x in range(mask.size[0]):
            if pixels[x, y] > 0:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def mask_ratio(mask: Image.Image) -> float:
    bbox = mask_bbox(mask)
    if bbox is None:
        return 0.0
    left, top, right, bottom = bbox
    height = bottom - top
    return (right - left) / height if height else 0.0


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


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    output = Image.new("RGB", size, (250, 246, 238))
    copy = image.convert("RGB")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    output.paste(copy, ((size[0] - copy.size[0]) // 2, (size[1] - copy.size[1]) // 2))
    return output


def outline_mask(mask: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    mask = mask.convert("L")
    output = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    pixels = mask.load()
    draw = ImageDraw.Draw(output)
    width, height = mask.size
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            if pixels[x, y] == 0:
                continue
            if (
                pixels[x - 1, y] == 0
                or pixels[x + 1, y] == 0
                or pixels[x, y - 1] == 0
                or pixels[x, y + 1] == 0
            ):
                draw.point((x, y), fill=color)
    return output


def overlay_mask(reference: Image.Image, mask: Image.Image) -> Image.Image:
    reference = reference.convert("RGBA")
    mask = mask.convert("L")
    fill = Image.new("RGBA", reference.size, (55, 130, 220, 0))
    fill.putalpha(mask.point(lambda value: 82 if value > 0 else 0))
    reference.alpha_composite(fill)
    reference.alpha_composite(outline_mask(mask, (220, 55, 45, 255)))
    return reference.convert("RGB")


def mask_card(mask: Image.Image, label: str, font: ImageFont.ImageFont) -> Image.Image:
    bbox = mask_bbox(mask)
    card = Image.new("RGB", (190, 230), (250, 246, 238))
    draw = ImageDraw.Draw(card)
    if bbox is not None:
        crop = mask.crop(bbox)
        preview = Image.new("RGB", crop.size, (0, 0, 0))
        preview_pixels = preview.load()
        mask_pixels = crop.load()
        for y in range(crop.size[1]):
            for x in range(crop.size[0]):
                if mask_pixels[x, y] > 0:
                    preview_pixels[x, y] = (255, 255, 255)
        card.paste(fit(preview, (170, 180)), (10, 10))
    draw.text((12, 204), label, fill=(84, 78, 70), font=font)
    return card


def make_row(view: str, title: str, y: int, sheet: Image.Image, draw: ImageDraw.ImageDraw) -> dict[str, float]:
    title_font = load_font(18, bold=True)
    small_font = load_font(12)
    label_font = load_font(13, bold=True)
    panel_x = 32
    panel_w = 1456
    panel_h = 310
    draw.rounded_rectangle((panel_x, y, panel_x + panel_w, y + panel_h), radius=8, outline=(205, 190, 168), fill=(249, 245, 237))
    draw.text((panel_x + 18, y + 14), title, fill=(42, 42, 38), font=title_font)

    reference = Image.open(REFERENCE_ROOT / f"{view}.png").convert("RGB")
    reference_mask = read_binary_mask(REFERENCE_MASK_ROOT / f"body_{view}_mask.png")
    generated_mask = read_binary_mask(GENERATED_MASK_ROOT / f"body_generated_{view}_mask.png")
    generated_full, broad_generated_ratio = crop_content(PREVIEW_ROOT / f"pip_reference_matched_{view}.png")
    reference_crop, broad_reference_ratio = crop_content(REFERENCE_ROOT / f"{view}.png")

    columns = [
        ("Reference crop", reference_crop),
        ("Ref mask over crop", overlay_mask(reference, reference_mask)),
        ("Ref body mask", mask_card(reference_mask, "ref body-only", small_font)),
        ("Generated mask", mask_card(generated_mask, "generated body-only", small_font)),
        ("Generated full crop", generated_full),
    ]
    x = panel_x + 18
    top = y + 56
    for label, image in columns:
        draw.text((x, top - 24), label, fill=(84, 78, 70), font=label_font)
        sheet.paste(fit(image, (250, 218)), (x, top))
        x += 278

    ref_body_ratio = mask_ratio(reference_mask)
    gen_body_ratio = mask_ratio(generated_mask)
    text_x = panel_x + 18
    text_y = y + panel_h - 28
    draw.text(
        (text_x, text_y),
        (
            f"broad ratio ref {broad_reference_ratio:.3f} / gen {broad_generated_ratio:.3f}    "
            f"body-mask ratio ref {ref_body_ratio:.3f} / gen {gen_body_ratio:.3f}"
        ),
        fill=(84, 78, 70),
        font=small_font,
    )
    return {
        "broad_reference_ratio": broad_reference_ratio,
        "broad_generated_ratio": broad_generated_ratio,
        "reference_body_mask_ratio": ref_body_ratio,
        "generated_body_mask_ratio": gen_body_ratio,
    }


def main() -> None:
    QA_ROOT.mkdir(parents=True, exist_ok=True)
    title_font = load_font(30, bold=True)
    small_font = load_font(13)
    sheet = Image.new("RGB", (1520, 1390), (246, 241, 232))
    draw = ImageDraw.Draw(sheet)
    draw.text((32, 24), "Pip v001 Reference Body-Mask Audit", fill=(42, 42, 38), font=title_font)
    draw.text(
        (32, 64),
        "Blue fill/red outline is the authored reference body mask; ratios compare broad crops and body-only masks.",
        fill=(84, 78, 70),
        font=small_font,
    )

    results: dict[str, dict[str, float]] = {}
    y = 102
    for view, title in VIEWS:
        results[view] = make_row(view, title, y, sheet, draw)
        y += 318

    sheet.save(OUTPUT_PATH)
    print(OUTPUT_PATH)
    for view, data in results.items():
        print(
            view,
            f"broad ref {data['broad_reference_ratio']:.3f}",
            f"broad gen {data['broad_generated_ratio']:.3f}",
            f"body ref {data['reference_body_mask_ratio']:.3f}",
            f"body gen {data['generated_body_mask_ratio']:.3f}",
        )


if __name__ == "__main__":
    main()
