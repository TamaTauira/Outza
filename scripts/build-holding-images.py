"""Rebuild VibePeep holding images so each slot is composed at that slot's aspect ratio.

The mascot and the original lockup (headline, subline, rule, wordmark) are taken
from the existing 1600×900 posters. Nothing is redrawn. The black body stays
intact because the mascot is a padded crop, not a colour key.
"""
from __future__ import annotations

import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "public", "placeholders")
OUT = SRC
SLUGS = [
    "arts-culture",
    "business",
    "community",
    "education",
    "family",
    "food-drink",
    "music",
    "nightlife",
    "sports",
    "wellness",
]

# 2× the slot's on-screen box. hero is the original poster (already 1600×900).
SLOTS = {
    "hero": (1600, 900),
    "hero-wide": (2400, 800),
    "card": (1600, 1200),
    "featured": (1920, 1080),
    "square": (1000, 1000),
    "marker": (512, 512),
    "popup": (1200, 480),
    "band": (1600, 640),
    "og": (2400, 1256),
}


def fit(sprite: Image.Image, max_w: int, max_h: int) -> Image.Image:
    if max_w < 8 or max_h < 8:
        return sprite.resize((max(1, max_w), max(1, max_h)), Image.Resampling.LANCZOS)
    s = sprite.copy()
    s.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    return s


def feather_rgb(im: Image.Image, bg: tuple[int, int, int], px: int = 48) -> Image.Image:
    """Fade only background-like pixels near the crop edge. The figure stays solid."""
    im = im.convert("RGBA")
    a = np.array(im)
    h, w = a.shape[:2]
    rgb = a[:, :, :3].astype(np.int16)
    dist = np.abs(rgb - np.array(bg, dtype=np.int16)).sum(axis=2)
    yy = np.minimum(np.arange(h), np.arange(h - 1, -1, -1))
    xx = np.minimum(np.arange(w), np.arange(w - 1, -1, -1))
    edge = np.minimum(yy[:, None], xx[None, :]).astype(np.float32)
    fade = np.clip(edge / px, 0, 1)
    alpha = np.where(dist < 70, fade * 255.0, 255.0)
    a[:, :, 3] = alpha.astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def parts(path: str):
    im = Image.open(path).convert("RGB")
    arr = np.asarray(im).astype(np.float32)
    h, w = arr.shape[:2]
    lum = arr[:, :, 0] * 0.2126 + arr[:, :, 1] * 0.7152 + arr[:, :, 2] * 0.0722
    gy, gx = np.gradient(lum)
    mag = np.hypot(gx, gy)
    sat = arr.max(axis=2) - arr.min(axis=2)
    row_sat = sat.mean(axis=1)
    top = 0
    while top < h and row_sat[top] > 80:
        top += 1
    bot = h - 1
    while bot > 0 and row_sat[bot] > 80:
        bot -= 1
    bg = tuple(int(v) for v in np.median(arr[top + 8 : top + 40, 8:48].reshape(-1, 3), axis=0))
    sig = (mag > 12) | (sat > 40)
    sig[: top + 2] = False
    sig[bot - 2 :] = False
    # Artwork (including crossed legs and the wellness leaf) ends by y=548.
    # The headline glyphs start just below that. A row of low edge-counts inside
    # the letters is not a gap, so this cut is measured, not guessed from a gap.
    art_bottom = 548
    split = 552

    upper = sig[:art_bottom]
    ys, xs = np.where(upper)
    pad_x, pad_top = 72, 28
    x0 = max(0, int(xs.min()) - pad_x)
    x1 = min(w, int(xs.max()) + pad_x + 1)
    y_top = max(top, int(ys.min()) - pad_top)
    y_bot = art_bottom
    mascot = feather_rgb(im.crop((x0, y_top, x1, y_bot)), bg)

    # Text lockup: flood-fill the smooth background, keep the high-contrast type.
    mag_img = Image.fromarray(np.clip(mag, 0, 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    barrier = np.asarray(mag_img).astype(np.float32) > 12
    barrier |= sat > 50
    reached = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def try_push(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not reached[y, x] and not barrier[y, x]:
            reached[y, x] = True
            q.append((x, y))

    for x in range(w):
        try_push(x, 0)
        try_push(x, h - 1)
    for y in range(h):
        try_push(0, y)
        try_push(w - 1, y)
    while q:
        x, y = q.popleft()
        try_push(x + 1, y)
        try_push(x - 1, y)
        try_push(x, y + 1)
        try_push(x, y - 1)
    fg = ~reached
    fg[:split] = False
    fg[max(0, bot - 10) :] = False
    alpha = np.array(
        Image.fromarray((fg * 255).astype(np.uint8))
        .filter(ImageFilter.MaxFilter(3))
        .filter(ImageFilter.GaussianBlur(0.55))
    )
    # Drop faint full-width residue (a row or column with only a few pixels).
    keep_y = (alpha > 50).sum(axis=1) > 20
    keep_x = (alpha > 50).sum(axis=0) > 20
    if keep_y.any() and keep_x.any():
        y_idx = np.where(keep_y)[0]
        x_idx = np.where(keep_x)[0]
        alpha_c = alpha[y_idx[0] : y_idx[-1] + 1, x_idx[0] : x_idx[-1] + 1]
        rgb_c = arr[y_idx[0] : y_idx[-1] + 1, x_idx[0] : x_idx[-1] + 1].astype(np.uint8)
        text = Image.fromarray(np.dstack([rgb_c, alpha_c]), "RGBA")
    else:
        text = Image.new("RGBA", (10, 10), (0, 0, 0, 0))

    bar_top = tuple(int(v) for v in arr[2, w // 2])
    bar_bot = tuple(int(v) for v in arr[h - 3, w // 2])
    return mascot, text, bg, bar_top, bar_bot


def bars(canvas: Image.Image, top: tuple[int, int, int], bot: tuple[int, int, int], top_h: int, bot_h: int) -> None:
    d = ImageDraw.Draw(canvas)
    w, h = canvas.size
    d.rectangle([0, 0, w, top_h], fill=top + (255,))
    d.rectangle([0, h - bot_h, w, h], fill=bot + (255,))


def side_by_side(
    W: int,
    H: int,
    mascot: Image.Image,
    text: Image.Image,
    bg: tuple[int, int, int],
    bar_top: tuple[int, int, int] | None,
    bar_bot: tuple[int, int, int] | None,
    *,
    pad: int,
    mascot_frac: float,
    text_frac: float,
    gap_frac: float,
    v_bias: float = 0.5,
) -> Image.Image:
    canvas = Image.new("RGBA", (W, H), bg + (255,))
    top_h = 14 if bar_top else 0
    bot_h = 12 if bar_bot else 0
    avail_h = H - top_h - bot_h - pad
    avail_w = W - pad * 2
    gap = max(16, int(W * gap_frac))
    m = fit(mascot, int(avail_w * mascot_frac), int(avail_h * 0.96))
    t = fit(text, int(avail_w * text_frac), int(avail_h * 0.72))
    total = m.size[0] + gap + t.size[0]
    if total > avail_w:
        scale = avail_w / total
        m = m.resize((max(1, int(m.size[0] * scale)), max(1, int(m.size[1] * scale))), Image.Resampling.LANCZOS)
        t = t.resize((max(1, int(t.size[0] * scale)), max(1, int(t.size[1] * scale))), Image.Resampling.LANCZOS)
        total = m.size[0] + gap + t.size[0]
    x = (W - total) // 2
    region_top = top_h + (H - top_h - bot_h - max(m.size[1], t.size[1])) // 2
    # v_bias 0.5 is centred. Lower pulls the lockup up, clear of a bottom scrim.
    my = top_h + int((H - top_h - bot_h - m.size[1]) * v_bias)
    ty = top_h + int((H - top_h - bot_h - t.size[1]) * v_bias)
    canvas.alpha_composite(m, (x, my))
    canvas.alpha_composite(t, (x + m.size[0] + gap, ty))
    if bar_top and bar_bot:
        bars(canvas, bar_top, bar_bot, top_h, bot_h)
    return canvas.convert("RGB")


def stacked(
    W: int,
    H: int,
    mascot: Image.Image,
    text: Image.Image,
    bg: tuple[int, int, int],
    bar_top: tuple[int, int, int] | None,
    bar_bot: tuple[int, int, int] | None,
    *,
    inset: float,
    text_share: float,
) -> Image.Image:
    canvas = Image.new("RGBA", (W, H), bg + (255,))
    top_h = 16 if bar_top else 0
    bot_h = 14 if bar_bot else 0
    margin_x = int(W * inset)
    margin_y = int(H * 0.035)
    top = top_h + margin_y
    bot = H - bot_h - margin_y
    avail_h = bot - top
    avail_w = W - margin_x * 2
    gap = max(10, int(avail_h * 0.03))
    t_h = int(avail_h * text_share)
    m_h = avail_h - t_h - gap
    m = fit(mascot, avail_w, m_h)
    t = fit(text, avail_w, t_h)
    # If the pair still leaves a big hole, keep them grouped in the middle.
    block = m.size[1] + gap + t.size[1]
    y = top + max(0, (avail_h - block) // 2)
    canvas.alpha_composite(m, ((W - m.size[0]) // 2, y))
    canvas.alpha_composite(t, ((W - t.size[0]) // 2, y + m.size[1] + gap))
    if bar_top and bar_bot:
        bars(canvas, bar_top, bar_bot, top_h, bot_h)
    return canvas.convert("RGB")


def marker_layout(mascot: Image.Image, text: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    """Content sits inside the inscribed circle so a round map pin does not clip it."""
    S = 512
    canvas = Image.new("RGBA", (S, S), bg + (255,))
    safe = int(S / (2 ** 0.5)) - 8  # square that fits in the circle
    # Wordmark-and-headline lockup, scaled small under the mascot.
    t = fit(text, int(safe * 0.92), int(safe * 0.28))
    m = fit(mascot, int(safe * 0.96), int(safe * 0.70))
    gap = 6
    block = m.size[1] + gap + t.size[1]
    if block > safe:
        scale = (safe - gap) / block
        m = m.resize((max(1, int(m.size[0] * scale)), max(1, int(m.size[1] * scale))), Image.Resampling.LANCZOS)
        t = t.resize((max(1, int(t.size[0] * scale)), max(1, int(t.size[1] * scale))), Image.Resampling.LANCZOS)
        block = m.size[1] + gap + t.size[1]
    y = (S - block) // 2
    canvas.alpha_composite(m, ((S - m.size[0]) // 2, y))
    canvas.alpha_composite(t, ((S - t.size[0]) // 2, y + m.size[1] + gap))
    return canvas.convert("RGB")


def save(im: Image.Image, slug: str, slot: str) -> None:
    folder = os.path.join(OUT, slug)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{slot}.webp")
    im.save(path, "WEBP", quality=82, method=6)
    w, h = SLOTS[slot]
    if im.size != (w, h):
        raise SystemExit(f"{slug}/{slot} is {im.size}, expected {(w, h)}")


def build(slug: str) -> None:
    src = os.path.join(SRC, f"{slug}.webp")
    mascot, text, bg, bar_top, bar_bot = parts(src)
    # Phone / email hero is the original 16:9 poster. It already fits that frame.
    hero = Image.open(src).convert("RGB")
    if hero.size != SLOTS["hero"]:
        hero = hero.resize(SLOTS["hero"], Image.Resampling.LANCZOS)
    save(hero, slug, "hero")
    save(
        side_by_side(2400, 800, mascot, text, bg, bar_top, bar_bot, pad=48, mascot_frac=0.42, text_frac=0.46, gap_frac=0.04, v_bias=0.5),
        slug,
        "hero-wide",
    )
    save(
        stacked(1600, 1200, mascot, text, bg, bar_top, bar_bot, inset=0.08, text_share=0.30),
        slug,
        "card",
    )
    # Hot right now: 16:9, type lifted so the bottom scrim and corner badges miss it.
    save(
        side_by_side(1920, 1080, mascot, text, bg, bar_top, bar_bot, pad=72, mascot_frac=0.40, text_frac=0.42, gap_frac=0.05, v_bias=0.42),
        slug,
        "featured",
    )
    save(stacked(1000, 1000, mascot, text, bg, None, None, inset=0.07, text_share=0.32), slug, "square")
    save(marker_layout(mascot, text, bg), slug, "marker")
    save(
        side_by_side(1200, 480, mascot, text, bg, None, None, pad=20, mascot_frac=0.40, text_frac=0.50, gap_frac=0.03, v_bias=0.5),
        slug,
        "popup",
    )
    save(
        side_by_side(1600, 640, mascot, text, bg, bar_top, bar_bot, pad=36, mascot_frac=0.40, text_frac=0.48, gap_frac=0.04, v_bias=0.5),
        slug,
        "band",
    )
    save(
        side_by_side(2400, 1256, mascot, text, bg, bar_top, bar_bot, pad=120, mascot_frac=0.40, text_frac=0.44, gap_frac=0.04, v_bias=0.5),
        slug,
        "og",
    )
    print(slug, "bg", bg, "mascot", mascot.size, "text", text.size, "split was baked into crop")


if __name__ == "__main__":
    for slug in SLUGS:
        build(slug)
    print("done")
