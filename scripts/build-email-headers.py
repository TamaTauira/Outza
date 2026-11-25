#!/usr/bin/env python3
"""Bake one opaque 1200x240 header per email kind.

The logo is recoloured from vibepeep-logo-new-v2.png (white "Vibe", tagline
removed, a thin rim on the icon). It is never redrawn. Mascots are cropped
from the existing public/email-headers art, kept as masters under
assets/email-header-source/.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LOGO_SRC = Path('/cursor/stores/bot/handoff/vibepeep-logo-new-v2.png')
SOURCE = ROOT / 'assets' / 'email-header-source'
PUBLIC = ROOT / 'public' / 'email-headers'
COPY = ROOT / 'lib' / 'email-header-copy.json'
FONT = '/usr/share/fonts/truetype/macos/Inter-Bold.ttf'

W, H = 1200, 240
BG = (14, 14, 14)
INK = (247, 247, 247)
ORANGE = (255, 122, 53)
PINK = (240, 90, 157)
RIM = (58, 58, 58)


def ensure_sources() -> None:
    SOURCE.mkdir(parents=True, exist_ok=True)
    if any(SOURCE.glob('*.png')):
        return
    for path in sorted(PUBLIC.glob('*.png')):
        shutil.copy2(path, SOURCE / path.name)


def ondark_logo() -> Image.Image:
    im = Image.open(LOGO_SRC).convert('RGBA')
    px = im.load()
    width, height = im.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if x >= 600 and y >= 490:
                px[x, y] = (0, 0, 0, 0)
                continue
            if x >= 600 and a > 16 and max(r, g, b) < 90:
                px[x, y] = (247, 247, 247, a)
    alpha = im.split()[-1]
    # Rim only around the icon tile, which sits left of the wordmark.
    icon_mask = Image.new('L', im.size, 0)
    icon_alpha = alpha.crop((0, 0, 610, height))
    icon_mask.paste(icon_alpha, (0, 0))
    dilated = icon_mask.filter(ImageFilter.MaxFilter(5))
    rim = ImageChops.subtract(dilated, icon_mask)
    rim_layer = Image.new('RGBA', im.size, RIM + (0,))
    rim_layer.putalpha(rim)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.alpha_composite(rim_layer)
    out.alpha_composite(im)
    bbox = out.split()[-1].getbbox()
    if not bbox:
        raise SystemExit('logo has no pixels')
    cropped = out.crop(bbox)
    target_h = 48
    target_w = max(1, round(cropped.width * target_h / cropped.height))
    return cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)


def content_bbox(im: Image.Image, threshold: int = 26) -> tuple[int, int, int, int] | None:
    gray = im.convert('L')
    mask = gray.point(lambda p: 255 if p > threshold else 0)
    return mask.getbbox()


def mascot_for(kind: str) -> Image.Image | None:
    path = SOURCE / f'{kind}.png'
    if not path.exists():
        path = SOURCE / 'welcome.png'
    if not path.exists():
        return None
    im = Image.open(path).convert('RGBA')
    box = content_bbox(im)
    if not box:
        return None
    crop = im.crop(box)
    # Knock the baked black field out so the mascot sits on our opaque ground.
    px = crop.load()
    cw, ch = crop.size
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = px[x, y]
            peak = max(r, g, b)
            if peak < 22:
                px[x, y] = (0, 0, 0, 0)
            elif peak < 42 and abs(r - g) < 8 and abs(g - b) < 8:
                fade = int(255 * (peak - 22) / 20)
                px[x, y] = (r, g, b, fade)
    target_h = 220
    target_w = 500
    scale = min(target_w / cw, target_h / ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    return crop.resize((nw, nh), Image.Resampling.LANCZOS)


def gradient_bar() -> Image.Image:
    bar = Image.new('RGB', (320, 8))
    px = bar.load()
    for x in range(320):
        t = x / 319
        color = tuple(int(ORANGE[i] * (1 - t) + PINK[i] * t) for i in range(3))
        for y in range(8):
            px[x, y] = color
    return bar


def draw_headline(canvas: Image.Image, text: str) -> None:
    draw = ImageDraw.Draw(canvas)
    size = 52
    font = ImageFont.truetype(FONT, size)
    while size > 32 and font.getlength(text) > 640:
        size -= 2
        font = ImageFont.truetype(FONT, size)
    # 26px at 1x is 52px here. Baseline sits near y=164 when the face is 52px.
    ascent, descent = font.getmetrics()
    baseline = 168 if size >= 48 else 172
    top = baseline - ascent
    draw.text((48, top), text, font=font, fill=INK)


def build_one(kind: str, headline: str, logo: Image.Image, bar: Image.Image) -> Image.Image:
    canvas = Image.new('RGB', (W, H), BG)
    mascot = mascot_for(kind)
    if mascot:
        x = W - mascot.width - 8
        y = H - mascot.height - 4
        canvas.paste(mascot, (x, y), mascot)
    canvas.paste(logo, (48, 28), logo)
    canvas.paste(bar, (48, 186))
    draw_headline(canvas, headline)
    return canvas


def main() -> None:
    ensure_sources()
    headlines: dict[str, str] = json.loads(COPY.read_text())
    logo = ondark_logo()
    bar = gradient_bar()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for kind, headline in headlines.items():
        image = build_one(kind, headline, logo, bar)
        image.save(PUBLIC / f'{kind}.png', format='PNG', optimize=True)
        print(f'{kind}: {image.size} {headline}')


if __name__ == '__main__':
    main()
