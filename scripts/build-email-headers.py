#!/usr/bin/env python3
"""Bake the option-5 email art once. Nothing here runs at send time.

Each kind in lib/email-header-copy.json becomes one 1200x560 PNG under
public/email-headers/. The plate is a black field, a soft orange-to-pink
glow, the dark VibePeep lockup, that kind's title, and that kind's approved
Tummer from assets/email-header-source/<kind>.png (props included).

Every kind has its own plate. A missing file stops the build.
Tummer's hands stay rounded mittens. Plates with fingers or a thumbs-up are not used.

The same run writes the footer glow and the small orange fact icons
(Calendar, Clock, Banknote, MapPin) plus the white social marks.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
COPY = ROOT / 'lib' / 'email-header-copy.json'
SOURCE = ROOT / 'assets' / 'email-header-source'
LOCKUP = ROOT / 'public' / 'brand' / 'vibepeep-lockup-dark@3x.png'
# Eyes land on this point, at this spacing, unless a prop would leave the frame.
TARGET_EYE = (900, 248)
TARGET_EYE_DIST = 148
CONTENT_BOX = (530, 4, 1196, 554)
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


def resolve_plate(kind: str) -> Path:
    """Each email type uses its own approved plate. Nothing is borrowed."""
    own = SOURCE / f'{kind}.png'
    if not own.exists():
        raise SystemExit(f'no approved plate for {kind}: {own}')
    return own


def _flood(gate: np.ndarray) -> np.ndarray:
    height, width = gate.shape
    seen = np.zeros((height, width), dtype=bool)
    stack: list[tuple[int, int]] = []

    def push(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= width or y >= height or seen[y, x] or not gate[y, x]:
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
    return seen


def _white_blobs(rgb: np.ndarray) -> list[tuple[float, float, int, int]]:
    lum = rgb.max(axis=2)
    sat = lum.astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    mask = (lum > 205) & (sat < 45)
    mask[:, :480] = False
    height, width = mask.shape
    seen = np.zeros((height, width), dtype=bool)
    blobs: list[tuple[float, float, int, int]] = []
    ys, xs = np.where(mask)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if seen[y0, x0]:
            continue
        stack = [(int(x0), int(y0))]
        seen[y0, x0] = True
        count = 0
        sx = sy = 0
        minx = maxx = int(x0)
        miny = maxy = int(y0)
        while stack:
            x, y = stack.pop()
            count += 1
            sx += x
            sy += y
            minx, maxx = min(minx, x), max(maxx, x)
            miny, maxy = min(miny, y), max(maxy, y)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((nx, ny))
        bw, bh = maxx - minx + 1, maxy - miny + 1
        if count >= 70 and bw > 34 and bh > 32 and 0.5 <= bw / bh <= 1.7:
            blobs.append((sx / count, sy / count, bw, bh))
    return blobs


def _eye_pair(blobs: list[tuple[float, float, int, int]]) -> tuple[float, float, float] | None:
    best: tuple[float, float, float, float] | None = None
    for i, left in enumerate(blobs):
        for right in blobs[i + 1:]:
            dx = abs(left[0] - right[0])
            dy = abs(left[1] - right[1])
            if not (85 <= dx <= 220 and dy <= 55):
                continue
            ratio = max(left[2], right[2]) / max(1, min(left[2], right[2]))
            if ratio > 1.7:
                continue
            score = dy * 3 + abs(dx - 145) + (left[1] + right[1]) * 0.05
            if best is None or score < best[0]:
                best = (score, (left[0] + right[0]) / 2, (left[1] + right[1]) / 2, math.hypot(dx, dy))
    if best is None:
        return None
    return best[1], best[2], best[3]


def extract_mascot(path: Path) -> tuple[Image.Image, tuple[float, float] | None, float | None]:
    """Cut Tummer and his props off the plate. Eyes are in crop coordinates."""
    rgb = np.array(Image.open(path).convert('RGB'))
    height, width = rgb.shape[:2]
    ground = np.median(rgb[:, :100].reshape(-1, 3), axis=0)
    dist = np.abs(rgb.astype(np.int16) - ground.astype(np.int16)).max(axis=2)
    sat = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    cleared = _flood((dist <= 14) & (sat <= 16))
    alpha = np.where(cleared, 0, 255).astype(np.uint8)
    # Neutral pixels just off the ground fade out, so the plate glow meets ours.
    rim = (~cleared) & (dist <= 28) & (sat <= 22)
    alpha = np.where(rim, np.clip((dist - 10) * 14, 0, 255).astype(np.uint8), alpha)
    ys, xs = np.where(alpha > 12)
    if len(xs) == 0:
        raise SystemExit(f'no mascot pixels in {path.name}')
    pad = 2
    x0, y0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
    x1, y1 = min(width, int(xs.max()) + 1 + pad), min(height, int(ys.max()) + 1 + pad)
    crop = np.dstack([rgb, alpha])[y0:y1, x0:x1].copy()
    fade = 18
    band = np.linspace(0, 1, fade, dtype=np.float32)
    edge = crop[:, :, 3].astype(np.float32)
    # Fade only the sides the original plate actually cut, so a prop inset from
    # the edge stays whole and a cut edge does not draw a hard line.
    if int(ys.min()) <= 2:
        edge[:fade] *= band[:, None]
    if int(ys.max()) >= height - 3:
        edge[-fade:] *= band[::-1][:, None]
    if int(xs.min()) <= 2:
        edge[:, :fade] *= band[None, :]
    if int(xs.max()) >= width - 3:
        edge[:, -fade:] *= band[::-1][None, :]
    crop[:, :, 3] = np.clip(edge, 0, 255).astype(np.uint8)
    eyes = _eye_pair(_white_blobs(rgb))
    eye_xy = None
    eye_dist = None
    if eyes is not None:
        eye_xy = (eyes[0] - x0, eyes[1] - y0)
        eye_dist = eyes[2]
    return Image.fromarray(crop, 'RGBA'), eye_xy, eye_dist


def paste_mascot(canvas: Image.Image, art: Image.Image, eye_xy: tuple[float, float] | None, eye_dist: float | None) -> None:
    """One size and one eye position, shrunk only when a prop would leave the frame."""
    if eye_xy and eye_dist and eye_dist > 40:
        scale = TARGET_EYE_DIST / eye_dist
    else:
        scale = 520 / art.height
    left, top, right, bottom = CONTENT_BOX
    slot_w, slot_h = right - left, bottom - top
    fit = min(slot_w / art.width, slot_h / art.height, scale)
    scale = max(0.7, min(scale, fit))
    placed = art.resize((max(1, int(art.width * scale)), max(1, int(art.height * scale))), Image.Resampling.LANCZOS)
    if eye_xy:
        anchor_x = eye_xy[0] * scale
        anchor_y = eye_xy[1] * scale
        origin_x = int(TARGET_EYE[0] - anchor_x)
        origin_y = int(TARGET_EYE[1] - anchor_y)
    else:
        origin_x = right - placed.width
        origin_y = bottom - placed.height
    # Keep every prop inside the right-hand frame. The title owns the left.
    origin_x = min(max(origin_x, left), right - placed.width)
    origin_y = min(max(origin_y, top), bottom - placed.height)
    canvas.paste(placed, (origin_x, origin_y), placed)


def fit_title(text: str, face: str) -> tuple[ImageFont.FreeTypeFont, str, int]:
    """One line when it fits. Otherwise the split that keeps the largest type."""
    max_w = 460
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


def build_header(headline: str, art: Image.Image, eye_xy: tuple[float, float] | None, eye_dist: float | None, lockup: Image.Image, face: str) -> Image.Image:
    canvas = glow_field(W, H)
    paste_mascot(canvas, art, eye_xy, eye_dist)
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
    lockup = Image.open(LOCKUP).convert('RGBA')
    HEADERS.mkdir(parents=True, exist_ok=True)
    cache: dict[str, tuple[Image.Image, tuple[float, float] | None, float | None]] = {}
    for kind, headline in headlines.items():
        plate = resolve_plate(kind)
        if plate.name not in cache:
            cache[plate.name] = extract_mascot(plate)
        art, eye_xy, eye_dist = cache[plate.name]
        image = build_header(headline, art, eye_xy, eye_dist, lockup, face)
        save_png(HEADERS / f'{kind}.png', image)
        print(f'{kind}: {headline}')
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
