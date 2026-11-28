#!/usr/bin/env python3
"""Bake the shared email header and footer assets once. Nothing here runs at send time.

Headers (design approved by the owner 28 Nov 2026, the v6 banner):
each kind in lib/email-header-copy.json becomes one tall black banner,
1200x400 (600x200 at 1x), colour #141414, flat edge to edge. Left: the
VibePeep lockup at (44, 36), height 56, and under it the kind's title in
Manrope extrabold 72px, white #F5F5F7, at (42, 128). Right: the kind's
approved Tummer plate from assets/email-header-source/<kind>.png — the
plate's right window (x 480..1200) scaled to height 356 and pasted at the
bottom right, every RGB channel floored at #141414 (plate black becomes
banner black, brighter art untouched), a 100px smoothstep fade at the
panel's left edge, and a mild contrast/colour lift plus unsharp so the
art stays crisp. An 8px orange-to-pink gradient strip runs along the
bottom edge. The whole banner is rendered at 2x and downscaled, so type
and art land anti-aliased. Both a 2x master (<kind>.png) and a 1x copy
(<kind>-1x.png) are written to public/email-headers/. No WebP in mail.

City variants: the kinds whose send path knows the reader's city
(newsletter, daily-drop, big-month, matches, reminder — see
EMAIL_HEADER_CITY_KINDS in lib/email-brand.ts) are also baked once per
catalogue city as <kind>-<city-slug>.png (+ -1x). Those carry an area
locator under the title: the city's eyebrow from CITY_LABELS in
lib/cities.ts (Manrope bold 17px, letter-spaced, peach #FFB088, at
(44, 252)), the area name in Manrope extrabold 36px at (42, 282) — for
Sydney "Sydney & " in white and "the NSW Coast" in the orange-to-pink
gradient, other cities all white — and a 5px gradient underline at
(44, 336), about 55% of the name's width. Keep CITY_LABELS below in sync
with lib/cities.ts.

Every kind has its own plate. A missing file stops the build.
Tummer's hands stay rounded mittens, a single thumb lobe is fine. Do not
add a plate with separate fingers. (Known exception, owner-flagged: the
account plate as supplied has separated fingers; its mitten re-render is
separate ART-stream work.)

Manrope is required. Set VIBEPEEP_MANROPE_FONT to a Manrope variable
font if it is not in one of the candidate paths below.

Footer icons (handover 3.14): each social mark in SITE_SOCIAL order is
baked as one 72px PNG (36px at 1x) in public/email-icons/: a #2c2c2e
circle with the official Simple Icons glyph in #F5F5F7 at 36px, from the
source SVGs in assets/email-social-icons/. Rendering the SVGs needs
cairosvg (pip install cairosvg). The same run writes the small orange fact
icons (Calendar, Clock, Banknote, MapPin).
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
COPY = ROOT / 'lib' / 'email-header-copy.json'
SOURCE = ROOT / 'assets' / 'email-header-source'
SOCIAL_SOURCE = ROOT / 'assets' / 'email-social-icons'
LOCKUP = ROOT / 'public' / 'brand' / 'vibepeep-lockup-dark@3x.png'
HEADERS = ROOT / 'public' / 'email-headers'
ICONS = ROOT / 'public' / 'email-icons'

# v6 bake: 200px tall at 600px email width, 400px at 2x. Everything is
# drawn on a 2x-supersampled canvas (2400x800) and downscaled once.
SS = 2
W, H = 1200, 400
GROUND = (20, 20, 20)  # #141414
ORANGE = (255, 122, 53)  # #FF7A35
PINK = (240, 90, 157)  # #F05A9D
INK = (245, 245, 247)  # #F5F5F7
PEACH = (255, 176, 136)  # #FFB088
FACT_ORANGE = ORANGE + (255,)

LOGO_X, LOGO_Y, LOGO_H = 44, 36, 56
TITLE_X, TITLE_Y, TITLE_SIZE, TITLE_MAX_W = 42, 128, 72, 660
PLATE_CROP_X = 480
PLATE_H = 356
PLATE_FADE = 100
EYEBROW_X, EYEBROW_Y, EYEBROW_SIZE = 44, 252, 17
AREA_X, AREA_Y, AREA_SIZE = 42, 282, 36
UNDERLINE_X, UNDERLINE_Y, UNDERLINE_H = 44, 336, 5
STRIP_H = 8

# Kinds whose send path knows the reader's city. Mirrors
# EMAIL_HEADER_CITY_KINDS in lib/email-brand.ts.
CITY_KINDS = ['newsletter', 'daily-drop', 'big-month', 'matches', 'reminder']

# Mirror of CITY_LABELS in lib/cities.ts: city -> (eyebrow, label).
CITY_LABELS = {
    'Sydney': ('NSW · THE HARBOUR STATE', 'Sydney & the NSW Coast'),
    'Melbourne': ('VIC · THE GARDEN STATE', 'Melbourne'),
    'Brisbane': ('QLD · THE SUNSHINE STATE', 'Brisbane'),
    'Gold Coast': ('QLD · THE SUNSHINE STATE', 'Gold Coast'),
    'Perth': ('WA · THE WILDFLOWER STATE', 'Perth'),
    'Adelaide': ('SA · THE FESTIVAL STATE', 'Adelaide'),
    'Canberra': ('ACT · THE BUSH CAPITAL', 'Canberra'),
    'Hobart': ('TAS · THE APPLE ISLE', 'Hobart'),
    'Darwin': ('NT · THE TOP END', 'Darwin'),
}

SOCIAL_ORDER = ['instagram', 'tiktok', 'threads', 'youtube', 'x', 'facebook', 'linkedin']
ICON_CIRCLE = '#2c2c2e'
ICON_GLYPH = '#F5F5F7'

FONT_CANDIDATES = [
    (os.environ.get('VIBEPEEP_MANROPE_FONT'), True),
    ('/usr/share/fonts/truetype/manrope/Manrope-VariableFont_wght.ttf', True),
    ('/usr/share/fonts/truetype/manrope/Manrope[wght].ttf', True),
    ('/usr/share/fonts/truetype/manrope/Manrope-Bold.ttf', False),
    ('/usr/share/fonts/truetype/macos/Manrope-Bold.ttf', False),
]


def _font_face() -> tuple[str, bool]:
    for path, variable in FONT_CANDIDATES:
        if path and Path(path).exists():
            return path, variable
    raise SystemExit('No Manrope font found for email headers (set VIBEPEEP_MANROPE_FONT)')


def load_font(size: int, weight: int = 800) -> ImageFont.FreeTypeFont:
    path, variable = _font_face()
    font = ImageFont.truetype(path, size)
    if variable:
        font.set_variation_by_axes([weight])
    return font


def gradient_strip(width: int, height: int) -> Image.Image:
    """One orange-to-pink horizontal gradient, sized to draw at SS scale."""
    strip = Image.new('RGB', (width, 1))
    px = strip.load()
    for x in range(width):
        t = x / max(1, width - 1)
        px[x, 0] = tuple(int(ORANGE[i] + (PINK[i] - ORANGE[i]) * t) for i in range(3))
    return strip.resize((width, height))


def gradient_text(canvas: Image.Image, xy: tuple[int, int], text: str, font: ImageFont.FreeTypeFont) -> None:
    """Draw text filled with the brand gradient, positioned on the full canvas."""
    mask = Image.new('L', canvas.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255)
    canvas.paste(gradient_strip(canvas.size[0], canvas.size[1]), (0, 0), mask)


def plate_panel(kind: str) -> Image.Image:
    """The kind's Tummer plate, treated and ready to paste bottom-right.

    Crop the plate's right window, scale to PLATE_H, lift contrast and
    colour a touch, floor every channel at the banner black, sharpen,
    then smoothstep-fade the panel's left edge into the ground. The
    figure itself is never faded or cropped.
    """
    path = SOURCE / f'{kind}.png'
    if not path.exists():
        raise SystemExit(f'no approved plate for {kind}: {path}')
    plate = Image.open(path).convert('RGB')
    crop = plate.crop((PLATE_CROP_X, 0, plate.width, plate.height))
    pw = int(round(crop.width * (PLATE_H * SS) / crop.height))
    panel = crop.resize((pw, PLATE_H * SS), Image.Resampling.LANCZOS)
    panel = ImageEnhance.Contrast(panel).enhance(1.04)
    panel = ImageEnhance.Color(panel).enhance(1.05)
    arr = np.maximum(np.asarray(panel).astype(np.int16), GROUND[0])
    panel = Image.fromarray(arr.astype('uint8'))
    panel = panel.filter(ImageFilter.UnsharpMask(radius=2.2, percent=68, threshold=2))
    pa = np.asarray(panel).astype(np.float32)
    fade = PLATE_FADE * SS
    t = np.clip(np.arange(pw, dtype=np.float32) / fade, 0, 1)
    t = t * t * (3 - 2 * t)
    g = np.array(GROUND, dtype=np.float32)
    pa = pa * t[None, :, None] + g * (1 - t[None, :, None])
    return Image.fromarray(np.clip(pa, 0, 255).astype('uint8'))


def fit_title(text: str) -> ImageFont.FreeTypeFont:
    """Manrope extrabold at TITLE_SIZE, stepped down until the line fits."""
    size = TITLE_SIZE
    while size > 56:
        font = load_font(size * SS, 800)
        if font.getlength(text) <= TITLE_MAX_W * SS:
            return font
        size -= 2
    return load_font(size * SS, 800)


def draw_area_locator(canvas: Image.Image, city: str) -> None:
    """Eyebrow + area name + gradient underline, under the title."""
    eyebrow, label = CITY_LABELS[city]
    draw = ImageDraw.Draw(canvas)
    font_e = load_font(EYEBROW_SIZE * SS, 700)
    x = EYEBROW_X * SS
    tracking = 3 * SS
    for ch in eyebrow:
        draw.text((x, EYEBROW_Y * SS), ch, font=font_e, fill=PEACH)
        x += draw.textlength(ch, font=font_e) + tracking
    font_a = load_font(AREA_SIZE * SS, 800)
    y = AREA_Y * SS
    if ' & the ' in label:
        head, tail = label.split(' & the ', 1)
        head += ' & '
        tail = 'the ' + tail
        draw.text((AREA_X * SS, y), head, font=font_a, fill=INK)
        head_w = draw.textlength(head, font=font_a)
        gradient_text(canvas, (AREA_X * SS + head_w, y), tail, font_a)
        name_w = head_w + draw.textlength(tail, font=font_a)
    else:
        draw.text((AREA_X * SS, y), label, font=font_a, fill=INK)
        name_w = draw.textlength(label, font=font_a)
    underline_w = int(name_w * 0.55)
    canvas.paste(gradient_strip(underline_w, UNDERLINE_H * SS), (UNDERLINE_X * SS, UNDERLINE_Y * SS))


def build_header(kind: str, headline: str, lockup: Image.Image, city: str | None = None) -> Image.Image:
    """One v6 banner on #141414: lockup, title, plate, bottom strip."""
    canvas = Image.new('RGB', (W * SS, H * SS), GROUND)
    panel = plate_panel(kind)
    canvas.paste(panel, (W * SS - panel.width, H * SS - panel.height))
    logo_w = int(round(LOGO_H * SS * (lockup.width / lockup.height)))
    logo = lockup.resize((logo_w, LOGO_H * SS), Image.Resampling.LANCZOS)
    canvas.paste(logo, (LOGO_X * SS, LOGO_Y * SS), logo)
    draw = ImageDraw.Draw(canvas)
    draw.text((TITLE_X * SS, TITLE_Y * SS), headline, font=fit_title(headline), fill=INK)
    if city:
        draw_area_locator(canvas, city)
    canvas.paste(gradient_strip(W * SS, STRIP_H * SS), (0, (H - STRIP_H) * SS))
    return canvas.resize((W, H), Image.Resampling.LANCZOS)


def city_slug(name: str) -> str:
    """'Gold Coast' -> 'gold-coast'. Mirrors emailHeaderCitySlug in lib/email-brand.ts."""
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


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


def bake_headers() -> int:
    headlines: dict[str, str] = json.loads(COPY.read_text())
    lockup = Image.open(LOCKUP).convert('RGBA')
    HEADERS.mkdir(parents=True, exist_ok=True)
    count = 0
    for kind, headline in headlines.items():
        image = build_header(kind, headline, lockup)
        save_png(HEADERS / f'{kind}.png', image)
        save_png(HEADERS / f'{kind}-1x.png', image.resize((600, 200), Image.Resampling.LANCZOS))
        count += 2
        print(f'{kind}: {headline}')
        if kind in CITY_KINDS:
            for city in CITY_LABELS:
                slug = city_slug(city)
                variant = build_header(kind, headline, lockup, city=city)
                save_png(HEADERS / f'{kind}-{slug}.png', variant)
                save_png(HEADERS / f'{kind}-{slug}-1x.png', variant.resize((600, 200), Image.Resampling.LANCZOS))
                count += 2
            print(f'{kind}: + {len(CITY_LABELS)} city variants')
    return count


def main() -> None:
    count = bake_headers()
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
    print(f'{count} header PNGs, {len(icons)} icons')


if __name__ == '__main__':
    main()
