"""Build the holding images for the Local categories that have their own scene.

Pop-ups, garage sales, dog-friendly and charity events each get a mascot scene
(scripts/local-holding-art/<slug>.jpg) and a lockup in the same style as the
ten genre images: white headline, peach subline, accent rule and the VibePeep
wordmark. Every slot then uses the same layouts as build-holding-images.py, so
these files sit beside the genre ones without looking different.

The other Local categories reuse the genre images (see lib/placeholders.ts).
"""
from __future__ import annotations

import importlib.util
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ART = os.path.join(ROOT, "scripts", "local-holding-art")
FONT_DIR = os.environ.get("POPPINS_DIR", "/usr/share/fonts/truetype/sand-box/google/Poppins")

spec = importlib.util.spec_from_file_location("genre", os.path.join(ROOT, "scripts", "build-holding-images.py"))
genre = importlib.util.module_from_spec(spec)
spec.loader.exec_module(genre)

BG = (14, 10, 21)
BAR_TOP = (255, 122, 40)
BAR_BOT = (254, 62, 142)
SUB = (247, 190, 164)

# slug: headline, subline, rule colour. Picked by Tama on 13 Nov.
LOCAL = {
    "neighbourhood-popups": ("Pop on by!", "Here today, gone by Sunday.", "#8b5cf6"),
    "garage-sales": ("Bargain hunt\u2019s on!", "Someone\u2019s old lamp, your new treasure.", "#3b82f6"),
    "dog-friendly": ("Pupper approved.", "Puppuccinos and pats all round.", "#ff7a28"),
    "charity-events": ("Give a little!", "Every gold coin counts.", "#ec4899"),
}


def mascot_sprite(slug: str) -> Image.Image:
    art = Image.open(os.path.join(ART, f"{slug}.jpg")).convert("RGB")
    a = np.asarray(art).astype(np.int16)
    corner = np.median(np.concatenate([a[:24, :24].reshape(-1, 3), a[:24, -24:].reshape(-1, 3)]), axis=0)
    sig = np.abs(a - corner).sum(axis=2) > 60
    ys, xs = np.where(sig)
    # Ignore the faint glow: keep rows/columns with a real run of figure pixels.
    rows = np.where(sig.sum(axis=1) > 6)[0]
    cols = np.where(sig.sum(axis=0) > 6)[0]
    pad_x, pad_y = 56, 28
    x0 = max(0, cols.min() - pad_x)
    x1 = min(art.width, cols.max() + pad_x + 1)
    y0 = max(0, rows.min() - pad_y)
    y1 = min(art.height, rows.max() + pad_y + 1)
    crop = art.crop((x0, y0, x1, y1))
    # Shift the scene's backdrop onto the poster colour so no box edge shows.
    c = np.asarray(crop).astype(np.float32)
    c += np.array(BG, dtype=np.float32) - corner.astype(np.float32)
    crop = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8))
    return genre.feather_rgb(crop, BG, px=40)


def tracked(d: ImageDraw.ImageDraw, cx: float, y: float, text: str, font, fill, track: float) -> None:
    ws = [font.getlength(ch) for ch in text]
    x = cx - (sum(ws) + track * (len(text) - 1)) / 2
    for ch, w in zip(text, ws):
        d.text((x, y), ch, font=font, fill=fill)
        x += w + track


def text_sprite(head: str, sub: str, rule: str) -> Image.Image:
    hf = ImageFont.truetype(os.path.join(FONT_DIR, "Poppins-Bold.ttf"), 80)
    sf = ImageFont.truetype(os.path.join(FONT_DIR, "Poppins-SemiBold.ttf"), 34)
    wm = Image.open(os.path.join(ART, "wordmark.png")).convert("RGB")
    hw = sum(hf.getlength(ch) for ch in head) - 3 * (len(head) - 1)
    sw = sf.getlength(sub)
    W = int(max(hw, sw, wm.width) + 24)
    H = 300
    im = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(im)
    tracked(d, W / 2, 6 - hf.getbbox("G")[1], head, hf, (255, 255, 255), -3)
    tracked(d, W / 2, 95 - sf.getbbox("B")[1], sub, sf, SUB, 0)
    d.rounded_rectangle((W / 2 - 183, 153, W / 2 + 183, 160), radius=3, fill=rule)
    im.paste(wm, ((W - wm.width) // 2, 170))
    # Trim to the drawn pixels, then make the backdrop transparent so it blends.
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    ink = np.abs(a - np.array(BG)).sum(axis=2) > 24
    ys, xs = np.where(ink)
    im = im.crop((max(0, xs.min() - 4), max(0, ys.min() - 4), xs.max() + 5, ys.max() + 5))
    a = np.asarray(im).copy()
    diff = np.abs(a[:, :, :3].astype(np.int16) - np.array(BG)).sum(axis=2)
    a[:, :, 3] = np.clip(diff * 6, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def build(slug: str) -> None:
    head, sub, rule = LOCAL[slug]
    m = mascot_sprite(slug)
    t = text_sprite(head, sub, rule)
    sb = genre.side_by_side
    st = genre.stacked
    out = {
        # The genre hero is a 16:9 poster with the lockup under the scene.
        "hero": st(1600, 900, m, t, BG, BAR_TOP, BAR_BOT, inset=0.1, text_share=0.36),
        "hero-wide": sb(2400, 800, m, t, BG, BAR_TOP, BAR_BOT, pad=48, mascot_frac=0.42, text_frac=0.46, gap_frac=0.04, v_bias=0.5),
        "card": st(1600, 1200, m, t, BG, BAR_TOP, BAR_BOT, inset=0.08, text_share=0.30),
        "featured": sb(1920, 1080, m, t, BG, BAR_TOP, BAR_BOT, pad=72, mascot_frac=0.40, text_frac=0.42, gap_frac=0.05, v_bias=0.42),
        "square": st(1000, 1000, m, t, BG, None, None, inset=0.07, text_share=0.32),
        "marker": genre.marker_layout(m, t, BG),
        "popup": sb(1200, 480, m, t, BG, None, None, pad=20, mascot_frac=0.40, text_frac=0.50, gap_frac=0.03, v_bias=0.5),
        "band": sb(1600, 640, m, t, BG, BAR_TOP, BAR_BOT, pad=36, mascot_frac=0.40, text_frac=0.48, gap_frac=0.04, v_bias=0.5),
        "og": sb(2400, 1256, m, t, BG, BAR_TOP, BAR_BOT, pad=120, mascot_frac=0.40, text_frac=0.44, gap_frac=0.04, v_bias=0.5),
    }
    for slot, im in out.items():
        genre.save(im, slug, slot)
    print(slug, "mascot", m.size, "text", t.size)


if __name__ == "__main__":
    for slug in LOCAL:
        build(slug)
    print("done")
