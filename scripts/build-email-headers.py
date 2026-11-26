#!/usr/bin/env python3
"""Bake the option-5 email art once. Nothing here runs at send time.

Each kind in lib/email-header-copy.json becomes one 1200x560 PNG under
public/email-headers/. The plate is a black field, a soft orange-to-pink
glow, the dark VibePeep lockup, the kind's title, and the approved
newspaper-reading Tummer cut from assets/email-header-source/daily-drop.png.

The same run writes the footer glow and the small orange fact icons
(Calendar, Clock, Banknote, MapPin) plus the white social marks.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
COPY = ROOT / 'lib' / 'email-header-copy.json'
MASCOT_SRC = ROOT / 'assets' / 'email-header-source' / 'daily-drop.png'
LOCKUP = ROOT / 'public' / 'brand' / 'vibepeep-lockup-dark@3x.png'
HEADERS = ROOT / 'public' / 'email-headers'
ICONS = ROOT / 'public' / 'email-icons'
FOOTER = ROOT / 'public' / 'email-footer' / 'glow.png'

W, H = 1200, 560
ORANGE = (255, 122, 53, 255)
PINK = (240, 90, 157, 255)
WHITE = (247, 247, 247, 255)
INK = (255, 255, 255, 255)

FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/macos/Inter-Bold.ttf',
    '/usr/share/fonts/truetype/inter/Inter-Bold.ttf',
    '/usr/share/fonts/opentype/inter/Inter-Bold.otf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]


def font_path() -> str:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return path
    raise SystemExit('No bold sans font found for email headers')


def add_glow(canvas: np.ndarray, cx: float, cy: float, radius: float, color: tuple[int, int, int], peak: float) -> None:
    height, width = canvas.shape[:2]
    ys, xs = np.mgrid[0:height, 0:width]
    fall = np.clip(1 - np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / radius, 0, 1) ** 1.55
    canvas += fall[..., None] * np.array(color, dtype=np.float32) * peak


def glow_field(width: int, height: int, scale: float = 1.0) -> Image.Image:
    canvas = np.zeros((height, width, 3), dtype=np.float32)
    sx, sy = width / W, height / H
    add_glow(canvas, 860 * sx, 80 * sy, 640 * scale, (255, 112, 36), 0.55)
    add_glow(canvas, 1020 * sx, 220 * sy, 420 * scale, (255, 86, 34), 0.28)
    add_glow(canvas, 1160 * sx, 160 * sy, 280 * scale, (240, 90, 157), 0.22)
    add_glow(canvas, 1100 * sx, 500 * sy, 380 * scale, (240, 90, 157), 0.42)
    add_glow(canvas, 700 * sx, 640 * sy, 500 * scale, (255, 122, 53), 0.16)
    add_glow(canvas, 240 * sx, 600 * sy, 360 * scale, (140, 48, 22), 0.12)
    return Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), 'RGB')


def extract_mascot() -> Image.Image:
    src = Image.open(MASCOT_SRC).convert('RGB')
    pixels = np.array(src)
    lum = pixels.max(axis=2)
    height, width = lum.shape
    seen = np.zeros((height, width), dtype=bool)
    stack: list[tuple[int, int]] = []

    def push(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= width or y >= height or seen[y, x]:
            return
        if lum[y, x] > 22:
            return
        seen[y, x] = True
        stack.append((x, y))

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)
    while stack:
        x, y = stack.pop()
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    # Ease the cut so a near-black rim does not halo on the glow.
    rim = (lum < 36) & ~seen
    alpha = np.where(rim, np.clip((lum.astype(np.int16) - 22) * 18, 0, 255).astype(np.uint8), alpha)
    rgba = np.dstack([pixels, alpha])
    ys, xs = np.where(alpha > 8)
    if len(xs) == 0:
        raise SystemExit(f'no mascot pixels in {MASCOT_SRC}')
    crop = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    # The source plate cuts the glow in a straight line. Fade that edge so it
    # meets the generated bloom instead of showing a seam.
    fade = 36
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    crop[:fade, :, 3] = (crop[:fade, :, 3].astype(np.float32) * ramp[:, None]).astype(np.uint8)
    crop[:, -fade:, 3] = (crop[:, -fade:, 3].astype(np.float32) * ramp[::-1][None, :]).astype(np.uint8)
    return Image.fromarray(crop, 'RGBA')


def fit_title(text: str, face: str) -> tuple[ImageFont.FreeTypeFont, str, int]:
    """One line when it fits. Otherwise the split that keeps the largest type."""
    max_w = 500
    for size in range(76, 43, -2):
        font = ImageFont.truetype(face, size)
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
    font = ImageFont.truetype(face, 44)
    return font, text, 44


def gradient_bar(width: int) -> Image.Image:
    bar = Image.new('RGBA', (width, 6), (0, 0, 0, 0))
    px = bar.load()
    for x in range(width):
        t = x / max(1, width - 1)
        color = tuple(int(ORANGE[i] * (1 - t) + PINK[i] * t) for i in range(3)) + (255,)
        for y in range(6):
            px[x, y] = color
    return bar


def build_header(headline: str, mascot: Image.Image, lockup: Image.Image, face: str) -> Image.Image:
    canvas = glow_field(W, H)
    target_w = 720
    scale = target_w / mascot.width
    placed = mascot.resize((target_w, max(1, int(mascot.height * scale))), Image.Resampling.LANCZOS)
    x = W - placed.width + 8
    y = 78
    canvas.paste(placed, (x, y), placed)
    logo = lockup.resize((277, 72), Image.Resampling.LANCZOS)
    canvas.paste(logo, (64, 72), logo)
    font, laid, size = fit_title(headline, face)
    draw = ImageDraw.Draw(canvas)
    title_top = 236
    spacing = 4
    draw.multiline_text((64, title_top), laid, font=font, fill=INK, spacing=spacing)
    lines = laid.split('\n')
    longest = max(font.getlength(line) for line in lines)
    ascent, descent = font.getmetrics()
    block = len(lines) * (ascent + descent) + spacing * (len(lines) - 1)
    bar_w = max(148, min(336, int(longest * 0.72)))
    bar_y = title_top + block + (10 if size >= 64 else 12)
    canvas.paste(gradient_bar(bar_w), (64, bar_y), gradient_bar(bar_w))
    return canvas


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
    rounded_stroke(draw, (int(s(3)), int(s(4)), int(s(21)), int(s(22))), int(s(2)), 5, ORANGE)
    line(draw, (s(3.4), s(10)), (s(20.6), s(10)), 5, ORANGE)
    line(draw, (s(8), s(2)), (s(8), s(6)), 5, ORANGE)
    line(draw, (s(16), s(2)), (s(16), s(6)), 5, ORANGE)
    return im


def fact_clock() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.ellipse((s(2), s(2), s(22), s(22)), outline=ORANGE, width=5)
    line(draw, (s(12), s(12)), (s(12), s(7)), 5, ORANGE)
    line(draw, (s(12), s(12)), (s(16), s(14.2)), 5, ORANGE)
    return im


def fact_banknote() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    rounded_stroke(draw, (int(s(2)), int(s(6)), int(s(22)), int(s(18))), int(s(2)), 5, ORANGE)
    draw.ellipse((s(10), s(10), s(14), s(14)), outline=ORANGE, width=4)
    cap(draw, (s(6), s(12)), 5, ORANGE)
    cap(draw, (s(18), s(12)), 5, ORANGE)
    return im


def fact_pin() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.ellipse((s(4), s(2), s(20), s(18)), outline=ORANGE, width=5)
    line(draw, (s(6.2), s(14.2)), (s(12), s(22)), 5, ORANGE)
    line(draw, (s(17.8), s(14.2)), (s(12), s(22)), 5, ORANGE)
    draw.ellipse((s(9), s(7), s(15), s(13)), outline=ORANGE, width=4)
    return im


def social_instagram() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    rounded_stroke(draw, (8, 8, 56, 56), 14, 5, WHITE)
    draw.ellipse((20, 20, 44, 44), outline=WHITE, width=5)
    cap(draw, (46, 18), 6, WHITE)
    return im


def social_tiktok() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    # A note: stem, flag, and the round head.
    line(draw, (28, 50), (28, 16), 6, WHITE)
    draw.polygon([(28, 16), (48, 22), (46, 30), (28, 24)], fill=WHITE)
    draw.ellipse((16, 40, 34, 56), outline=WHITE, width=5)
    return im


def social_threads() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.arc((12, 10, 52, 54), 20, 340, fill=WHITE, width=5)
    draw.arc((22, 22, 44, 46), 200, 40, fill=WHITE, width=5)
    return im


def social_youtube() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    rounded_stroke(draw, (6, 16, 58, 48), 12, 5, WHITE)
    draw.polygon([(28, 24), (28, 40), (42, 32)], fill=WHITE)
    return im


def social_x() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    line(draw, (16, 16), (48, 48), 6, WHITE)
    line(draw, (48, 16), (16, 48), 6, WHITE)
    return im


def social_facebook() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    line(draw, (38, 14), (38, 50), 6, WHITE)
    line(draw, (24, 26), (46, 26), 6, WHITE)
    draw.arc((22, 12, 40, 30), 180, 360, fill=WHITE, width=6)
    return im


def social_linkedin() -> Image.Image:
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    cap(draw, (18, 16), 8, WHITE)
    line(draw, (18, 26), (18, 50), 6, WHITE)
    line(draw, (30, 50), (30, 34), 6, WHITE)
    draw.arc((30, 26, 48, 42), 200, 20, fill=WHITE, width=6)
    line(draw, (46, 34), (46, 50), 6, WHITE)
    return im


def save_png(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format='PNG', optimize=True)


def main() -> None:
    face = font_path()
    headlines: dict[str, str] = json.loads(COPY.read_text())
    mascot = extract_mascot()
    lockup = Image.open(LOCKUP).convert('RGBA')
    HEADERS.mkdir(parents=True, exist_ok=True)
    for kind, headline in headlines.items():
        image = build_header(headline, mascot, lockup, face)
        save_png(HEADERS / f'{kind}.png', image)
        print(f'{kind}: {image.size[0]}x{image.size[1]} {headline}')
    save_png(FOOTER, glow_field(1200, 480, scale=1.15))
    icons = {
        'calendar.png': fact_calendar(),
        'clock.png': fact_clock(),
        'banknote.png': fact_banknote(),
        'map-pin.png': fact_pin(),
        'instagram.png': social_instagram(),
        'tiktok.png': social_tiktok(),
        'threads.png': social_threads(),
        'youtube.png': social_youtube(),
        'x.png': social_x(),
        'facebook.png': social_facebook(),
        'linkedin.png': social_linkedin(),
    }
    for name, image in icons.items():
        save_png(ICONS / name, image)
    print(f'footer {FOOTER.name}, {len(icons)} icons')


if __name__ == '__main__':
    main()
