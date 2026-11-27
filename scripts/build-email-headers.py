#!/usr/bin/env python3
"""Bake the shared email header and footer assets once. Nothing here runs at send time.

Headers (design approved by the owner 26 Nov 2026, handover 3.13):
each kind in lib/email-header-copy.json becomes one slim black banner,
1200x234 (600x117 at 1x), colour #141414, flat edge to edge. Left: the
VibePeep lockup, the kind's title and a short orange-to-pink gradient
underline. Right: the kind's approved Tummer plate from
assets/email-header-source/<kind>.png, baked into the same black with no
frame, border, seam or halo: the art is contained to the header height,
right-aligned, every RGB channel is floored at #141414 (plate black becomes
banner black, brighter art untouched) and a 60px smoothstep fade runs at
the panel's left edge. Both a 2x master (<kind>.png) and a 1x copy
(<kind>-1x.png) are written to public/email-headers/. No WebP in mail.

Every kind has its own plate. A missing file stops the build.
Tummer's hands stay rounded mittens, a single thumb lobe is fine. Do not
add a plate with separate fingers.

Footer icons (handover 3.14): each social mark in SITE_SOCIAL order is
baked as one 72px PNG (36px at 1x) in public/email-icons/: a #2c2c2e
circle with the official Simple Icons glyph in #F5F5F7 at 36px, from the
source SVGs in assets/email-social-icons/. Rendering the SVGs needs
cairosvg (pip install cairosvg). The same run writes the small orange fact
icons (Calendar, Clock, Banknote, MapPin).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
COPY = ROOT / 'lib' / 'email-header-copy.json'
SOURCE = ROOT / 'assets' / 'email-header-source'
SOCIAL_SOURCE = ROOT / 'assets' / 'email-social-icons'
LOCKUP = ROOT / 'public' / 'brand' / 'vibepeep-lockup-dark@3x.png'
HEADERS = ROOT / 'public' / 'email-headers'
ICONS = ROOT / 'public' / 'email-icons'

# Slim bake: 117px at 600px email width, 234px at 2x. Logo 24px at 600 = 48px here.
W, H = 1200, 234
PAD = 48
LOGO_H = 48
TEXT_MAX_W = 440
BANNER = (20, 20, 20)  # #141414
ORANGE = (255, 122, 53, 255)  # #FF7A35
PINK = (240, 90, 157, 255)  # #F05A9D
INK = (247, 247, 247, 255)
FACT_ORANGE = ORANGE

SOCIAL_ORDER = ['instagram', 'tiktok', 'threads', 'youtube', 'x', 'facebook', 'linkedin']
ICON_CIRCLE = '#2c2c2e'
ICON_GLYPH = '#F5F5F7'

FONT_CANDIDATES = [
    # Inter variable (design environment): optical size 14, weight set per call.
    ('/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf', True),
    ('/usr/share/fonts/truetype/macos/Inter-Bold.ttf', False),
    ('/usr/share/fonts/truetype/inter/Inter-Bold.ttf', False),
    ('/usr/share/fonts/opentype/inter/Inter-Bold.otf', False),
    ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', False),
]


def _font_face() -> tuple[str, bool]:
    for path, variable in FONT_CANDIDATES:
        if Path(path).exists():
            return path, variable
    raise SystemExit('No bold sans font found for email headers')


def load_font(size: int, weight: int = 700) -> ImageFont.FreeTypeFont:
    path, variable = _font_face()
    font = ImageFont.truetype(path, size)
    if variable:
        font.set_variation_by_axes([14, weight])
    return font


class Plate:
    """An approved source plate: its RGB pixels and the subject bounding box."""

    def __init__(self, kind: str):
        self.kind = kind
        self.path = SOURCE / f'{kind}.png'
        if not self.path.exists():
            raise SystemExit(f'no approved plate for {kind}: {self.path}')
        self.rgb = np.array(Image.open(self.path).convert('RGB'))
        self.h, self.w = self.rgb.shape[:2]
        lum = self.rgb.max(axis=2).astype(np.int16)
        self.lum = lum
        self.sat = lum - self.rgb.min(axis=2).astype(np.int16)
        ys, xs = np.where((lum > 16) | (self.sat > 12))
        self.bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def art_natural_size(plate: Plate, th: int, atmosphere: int = 36) -> tuple[int, int, int, int, float]:
    """Source window (x0, y0, x1, y1) and scale that shows the full figure at height th.

    `atmosphere` adds a little of the plate's own glow to the left of the
    bbox so the subject is not hard-cropped on its left.
    """
    bx0, by0, bx1, by1 = plate.bbox
    pad = 8
    by0 = max(0, by0 - pad)
    by1 = min(plate.h, by1 + pad)
    bh = by1 - by0
    scale = th / bh
    ax0 = max(0, bx0 - atmosphere)
    ax1 = min(plate.w, bx1 + pad)
    return ax0, by0, ax1, by1, scale


def art_panel_width(plate: Plate, th: int, atmosphere: int = 36, min_w: int = 300, max_w: int = 600) -> int:
    ax0, by0, ax1, by1, scale = art_natural_size(plate, th, atmosphere)
    natural = int(round((ax1 - ax0) * scale))
    return max(min_w, min(max_w, natural))


def flatten_empty_black(art: Image.Image, ground: tuple[int, int, int], subj_x: int, fade: int = 28) -> Image.Image:
    """Match empty plate-black to the banner so no rectangle edge shows.

    Only the field to the left of the subject is remapped. Tummer's
    near-black body, and any sparkles, hearts or confetti, stay as approved.
    """
    arr = np.array(art).astype(np.float32)
    h, w, _ = arr.shape
    lum = arr.max(axis=2)
    sat = lum - arr.min(axis=2)
    sparkle = (lum > 40) | (sat > 25)

    xs = np.arange(w, dtype=np.float32)[None, :].repeat(h, axis=0)
    t = np.clip((xs - (subj_x - fade)) / max(1, fade), 0, 1)
    t = t * t * (3 - 2 * t)  # smoothstep
    alpha = np.where(sparkle, 1.0, t)

    g = np.array(ground, dtype=np.float32)
    out = arr * alpha[..., None] + g * (1.0 - alpha[..., None])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def panel_art_on_ground(plate: Plate, tw: int, th: int, ground: tuple[int, int, int], atmosphere: int = 36) -> Image.Image:
    """Contain-to-height, right-align, flatten empty left black into `ground`."""
    ax0, by0, ax1, by1, scale = art_natural_size(plate, th, atmosphere)
    src = Image.fromarray(plate.rgb, 'RGB')
    crop = src.crop((ax0, by0, ax1, by1))
    nw = max(1, int(round(crop.width * scale)))
    resized = crop.resize((nw, th), Image.Resampling.LANCZOS)

    bx0 = plate.bbox[0]
    if resized.width >= tw:
        cut = resized.width - tw
        resized = resized.crop((cut, 0, resized.width, th))
        src_x0 = ax0 + cut / scale
        ox = 0
    else:
        src_x0 = ax0
        ox = tw - resized.width

    canvas = Image.new('RGB', (tw, th), ground)
    canvas.paste(resized, (ox, 0))
    subj_x = int(round(ox + max(0, bx0 - src_x0) * scale))
    return flatten_empty_black(canvas, ground, subj_x)


def gradient_bar(width: int, height: int = 4) -> Image.Image:
    bar = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    px = bar.load()
    for x in range(width):
        t = x / max(1, width - 1)
        color = tuple(int(ORANGE[i] * (1 - t) + PINK[i] * t) for i in range(3)) + (255,)
        for y in range(height):
            px[x, y] = color
    return bar


def fit_title(text: str) -> tuple[ImageFont.FreeTypeFont, str, int]:
    """One line when it fits. Otherwise the split that keeps the largest type."""
    max_w = TEXT_MAX_W
    for size in range(48, 31, -2):
        font = load_font(size, 700)
        if font.getlength(text) <= max_w:
            return font, text, size
        words = text.split(' ')
        if len(words) < 2:
            continue
        best: tuple[float, str] | None = None
        for cut in range(1, len(words)):
            lines = (' '.join(words[:cut]), ' '.join(words[cut:]))
            longest = max(font.getlength(line) for line in lines)
            if longest <= max_w and (best is None or longest < best[0]):
                best = (longest, '\n'.join(lines))
        if best:
            return font, best[1], size
    font = load_font(32, 700)
    return font, text, 32


def left_stack(headline: str, lockup: Image.Image) -> tuple[Image.Image, int]:
    """Lockup + title + gradient underline, vertically packed."""
    logo_w = int(round(LOGO_H * (lockup.width / lockup.height)))
    logo = lockup.resize((logo_w, LOGO_H), Image.Resampling.LANCZOS)
    font, laid, size = fit_title(headline)
    ascent, descent = font.getmetrics()
    lines = laid.split('\n')
    spacing = 2
    line_h = ascent + descent
    title_h = len(lines) * line_h + spacing * (len(lines) - 1)
    longest = max(font.getlength(line) for line in lines)
    bar_w = max(96, min(220, int(longest * 0.72)))
    bar_h = 4
    gap_logo = 12
    gap_bar = 8
    block_h = LOGO_H + gap_logo + title_h + gap_bar + bar_h
    block_w = max(logo_w, int(longest) + 4, bar_w)
    block = Image.new('RGBA', (block_w, block_h), (0, 0, 0, 0))
    block.paste(logo, (0, 0), logo)
    draw = ImageDraw.Draw(block)
    draw.multiline_text((0, LOGO_H + gap_logo), laid, font=font, fill=INK, spacing=spacing)
    bar_y = LOGO_H + gap_logo + title_h + gap_bar
    block.paste(gradient_bar(bar_w, bar_h), (0, bar_y), gradient_bar(bar_w, bar_h))
    return block, block_h


def paste_left(canvas: Image.Image, headline: str, lockup: Image.Image) -> None:
    block, block_h = left_stack(headline, lockup)
    top = max(PAD // 2, (H - block_h) // 2)
    if canvas.mode == 'RGB':
        canvas.paste(block.convert('RGB'), (PAD, top), block)
    else:
        canvas.paste(block, (PAD, top), block)


def build_header(plate: Plate, headline: str, lockup: Image.Image) -> Image.Image:
    """The approved seamless bake: header and art in one PNG on #141414."""
    canvas = Image.new('RGBA', (W, H), BANNER + (255,))
    max_w = W - (PAD + TEXT_MAX_W + 24)
    pw = art_panel_width(plate, H, atmosphere=36, min_w=300, max_w=min(600, max_w))
    filled = panel_art_on_ground(plate, pw, H, BANNER, atmosphere=36)
    a = np.array(filled).astype(np.int16)
    g = np.array(BANNER, dtype=np.int16)
    # Floor every channel at the banner black: plate #000 becomes the
    # banner, brighter art untouched.
    a = np.maximum(a, g)
    # Soft fade at the panel's left edge so no vertical seam can exist.
    fade = 60
    t = np.clip(np.arange(pw) / fade, 0, 1)
    t = t * t * (3 - 2 * t)
    a = (a * t[None, :, None] + g * (1 - t[None, :, None])).astype(np.uint8)
    canvas.paste(Image.fromarray(a, 'RGB'), (W - pw, 0))
    paste_left(canvas, headline, lockup)
    return canvas.convert('RGB')


def social_icon(name: str) -> Image.Image:
    """One footer social icon: a 72px #2c2c2e circle, official glyph at 36px."""
    try:
        import cairosvg
    except ImportError as exc:
        raise SystemExit('cairosvg is required to bake the social icons: pip install cairosvg') from exc
    source = SOCIAL_SOURCE / f'{name}.svg'
    if not source.exists():
        raise SystemExit(f'no Simple Icons source for {name}: {source}')
    text = source.read_text()
    match = re.search(r'<path d="([^"]+)"', text)
    if not match:
        raise SystemExit(f'no path found in {source}')
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">'
        f'<circle cx="36" cy="36" r="36" fill="{ICON_CIRCLE}"/>'
        f'<g transform="translate(18 18) scale(1.5)"><path d="{match.group(1)}" fill="{ICON_GLYPH}"/></g>'
        '</svg>'
    )
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=72, output_height=72)
    return Image.open(__import__('io').BytesIO(png)).convert('RGBA')


def rounded_stroke(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, width: int, color: tuple[int, int, int, int]) -> None:
    draw.rounded_rectangle(box, radius=radius, outline=color, width=width)


def cap(draw: ImageDraw.ImageDraw, xy: tuple[float, float], width: int, color: tuple[int, int, int, int]) -> None:
    r = width / 2
    draw.ellipse((xy[0] - r, xy[1] - r, xy[0] + r, xy[1] + r), fill=color)


def line(draw: ImageDraw.ImageDraw, a: tuple[float, float], b: tuple[float, float], width: int, color: tuple[int, int, int, int]) -> None:
    draw.line((a, b), fill=color, width=width)
    cap(draw, a, width, color)
    cap(draw, b, width, color)


def s(n: float) -> float:
    return n * 64 / 24


def fact_calendar() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    rounded_stroke(draw, (int(s(3)), int(s(4)), int(s(21)), int(s(22))), int(s(2)), 5, FACT_ORANGE)
    line(draw, (s(3.4), s(10)), (s(20.6), s(10)), 5, FACT_ORANGE)
    line(draw, (s(8), s(2)), (s(8), s(6)), 5, FACT_ORANGE)
    line(draw, (s(16), s(2)), (s(16), s(6)), 5, FACT_ORANGE)
    return im


def fact_clock() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.ellipse((s(2), s(2), s(22), s(22)), outline=FACT_ORANGE, width=5)
    line(draw, (s(12), s(12)), (s(12), s(7)), 5, FACT_ORANGE)
    line(draw, (s(12), s(12)), (s(16), s(14.2)), 5, FACT_ORANGE)
    return im


def fact_banknote() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    rounded_stroke(draw, (int(s(2)), int(s(6)), int(s(22)), int(s(18))), int(s(2)), 5, FACT_ORANGE)
    draw.ellipse((s(10), s(10), s(14), s(14)), outline=FACT_ORANGE, width=4)
    cap(draw, (s(6), s(12)), 5, FACT_ORANGE)
    cap(draw, (s(18), s(12)), 5, FACT_ORANGE)
    return im


def fact_pin() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.ellipse((s(4), s(2), s(20), s(18)), outline=FACT_ORANGE, width=5)
    line(draw, (s(6.2), s(14.2)), (s(12), s(22)), 5, FACT_ORANGE)
    line(draw, (s(17.8), s(14.2)), (s(12), s(22)), 5, FACT_ORANGE)
    draw.ellipse((s(9), s(7), s(15), s(13)), outline=FACT_ORANGE, width=4)
    return im


def save_png(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format='PNG', optimize=True)


def main() -> None:
    headlines: dict[str, str] = json.loads(COPY.read_text())
    lockup = Image.open(LOCKUP).convert('RGBA')
    HEADERS.mkdir(parents=True, exist_ok=True)
    for kind, headline in headlines.items():
        plate = Plate(kind)
        image = build_header(plate, headline, lockup)
        save_png(HEADERS / f'{kind}.png', image)
        save_png(HEADERS / f'{kind}-1x.png', image.resize((600, 117), Image.Resampling.LANCZOS))
        print(f'{kind}: {headline}')
    icons = {
        'calendar.png': fact_calendar(),
        'clock.png': fact_clock(),
        'banknote.png': fact_banknote(),
        'map-pin.png': fact_pin(),
    }
    for name in SOCIAL_ORDER:
        icons[f'{name}.png'] = social_icon(name)
    for name, image in icons.items():
        save_png(ICONS / name, image)
    print(f'{len(headlines)} headers (2x + 1x), {len(icons)} icons')


if __name__ == '__main__':
    main()
