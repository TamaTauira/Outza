"""Cut the official T-pose into a jointed rig and clean the pose photos.

White backgrounds are flooded out. The Grok mark is cropped off. Arms hang
from shoulder caps that tuck into the egg so the joint does not gap.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

REF = Path("/cursor/stores/bot/grok-bot/agents/c878ed30-2b9c-4d7e-841d-4deefd513108/attachments")
PARTS = Path("public/mascot/parts")
POSES = Path("public/mascot/poses")
PARTS.mkdir(parents=True, exist_ok=True)
POSES.mkdir(parents=True, exist_ok=True)


def clean(path: Path, mark_from: float = 0.88) -> np.ndarray:
    arr = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    h, w = arr.shape[:2]
    lum = arr.mean(2)
    sat = arr.max(2) - arr.min(2)
    bg = (lum > 222) & (sat < 28)
    vis = np.zeros((h, w), bool)
    q = [(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)]
    q += [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)]
    head = 0
    while head < len(q):
        y, x = q[head]
        head += 1
        if y < 0 or x < 0 or y >= h or x >= w or vis[y, x] or not bg[y, x]:
            continue
        vis[y, x] = True
        q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    char = ~vis
    char[int(h * mark_from) :, int(w * 0.7) :] = False
    pale = (lum > 196) & (sat < 34)
    char &= ~pale
    ys, xs = np.where(char)
    pad = 6
    y0, y1 = max(0, int(ys.min()) - pad), min(h, int(ys.max()) + pad + 1)
    x0, x1 = max(0, int(xs.min()) - pad), min(w, int(xs.max()) + pad + 1)
    rgb = arr[y0:y1, x0:x1].astype(np.uint8)
    alpha = np.where(char[y0:y1, x0:x1], 255, 0).astype(np.uint8)
    return np.dstack([rgb, alpha])


def save_pose(name: str, path: Path, flip: bool = False) -> None:
    rgba = clean(path)
    im = Image.fromarray(rgba)
    if flip:
        im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    im.thumbnail((720, 900), Image.Resampling.LANCZOS)
    im.save(POSES / f"{name}.png")
    print("pose", name, im.size)


def tight(mask: np.ndarray, rgb: np.ndarray, alpha: np.ndarray, pad: int = 2):
    h, w = mask.shape
    ys, xs = np.where(mask)
    y0, y1 = max(0, int(ys.min()) - pad), min(h, int(ys.max()) + 1 + pad)
    x0, x1 = max(0, int(xs.min()) - pad), min(w, int(xs.max()) + 1 + pad)
    out = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    out[:, :, :3] = rgb[y0:y1, x0:x1]
    out[:, :, 3] = np.where(mask[y0:y1, x0:x1], alpha[y0:y1, x0:x1], 0)
    return Image.fromarray(out), (x0, y0)


def cap_and_hang(im: Image.Image, mitten_on_left: bool) -> tuple[Image.Image, float]:
    deg = 90 if mitten_on_left else -90
    rot = im.rotate(deg, expand=True, resample=Image.Resampling.BICUBIC)
    arr = np.asarray(rot)
    ys, xs = np.where(arr[:, :, 3] > 40)
    top = int(ys.min())
    band = ys <= top + 18
    cx = int(np.median(xs[band]))
    # trim the jagged cut, then add a round shoulder
    trimmed = Image.new("RGBA", rot.size, (0, 0, 0, 0))
    trimmed.paste(rot, (0, 0))
    tarr = np.array(trimmed)
    tarr[: top + 6, :, 3] = 0
    trimmed = Image.fromarray(tarr)
    col = arr[min(arr.shape[0] - 1, top + 24), cx, :3]
    pad = 34
    bigger = Image.new("RGBA", (rot.size[0] + 8, rot.size[1] + pad), (0, 0, 0, 0))
    draw = ImageDraw.Draw(bigger)
    r = int(rot.size[0] * 0.58)
    fill = tuple(int(c) for c in col) + (255,)
    draw.ellipse((cx + 4 - r, pad - r // 3, cx + 4 + r, pad + int(r * 0.95)), fill=fill)
    bigger.alpha_composite(trimmed, (4, pad))
    return bigger, (cx + 4) / bigger.size[0]


def main() -> None:
    tpose = clean(REF / "01M66F62CZ0N6MBK3NPQZRE3G5.jpg", 0.86)
    rgb, alpha = tpose[:, :, :3], tpose[:, :, 3]
    m = alpha > 40
    h, w = m.shape
    yy = np.arange(h)[:, None]
    xx = np.arange(w)[None, :]
    left = np.full(h, np.nan)
    right = np.full(h, np.nan)
    for y in range(h):
        xs = np.where(m[y])[0]
        if len(xs) < 8 or xs[-1] - xs[0] > 760 or y > 990:
            continue
        left[y] = xs[0]
        right[y] = xs[-1]
    xp = np.where(~np.isnan(left))[0]
    L = np.interp(np.arange(h), xp, left[xp])
    R = np.interp(np.arange(h), xp, right[xp])
    body = m & (xx >= L[:, None]) & (xx <= R[:, None]) & (yy >= 150) & (yy < 996)
    arm_band = (yy >= 598) & (yy <= 708)
    left_arm = m & arm_band & (xx < L[:, None] - 1)
    right_arm = m & arm_band & (xx > R[:, None] + 1)
    left_leg = m & (yy >= 934) & (xx >= 368) & (xx < 598)
    right_leg = m & (yy >= 934) & (xx >= 598) & (xx < 872)
    antenna = m & (yy < 152) & (xx > 508) & (xx < 704)

    body_im, body_xy = tight(body, rgb, alpha)
    la, _ = tight(left_arm, rgb, alpha)
    ra, _ = tight(right_arm, rgb, alpha)
    ll, ll_xy = tight(left_leg, rgb, alpha)
    rl, rl_xy = tight(right_leg, rgb, alpha)
    an, an_xy = tight(antenna, rgb, alpha)
    la_h, la_ox = cap_and_hang(la, True)
    ra_h, ra_ox = cap_and_hang(ra, False)

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(body_im, body_xy)
    canvas.alpha_composite(ll, ll_xy)
    canvas.alpha_composite(rl, rl_xy)
    canvas.alpha_composite(an, an_xy)

    def place_arm(im: Image.Image, ox: float, joint: tuple[float, float]) -> tuple[int, int]:
        jx, jy = joint
        pos = (int(jx - ox * im.size[0]), int(jy - im.size[1] * 0.06))
        canvas.alpha_composite(im, pos)
        return pos

    mid = 628
    la_pos = place_arm(la_h, la_ox, (float(L[mid]) - 10, float(mid)))
    ra_pos = place_arm(ra_h, ra_ox, (float(R[mid]) + 10, float(mid)))

    arr = np.asarray(canvas)
    ys, xs = np.where(arr[:, :, 3] > 12)
    box = (int(xs.min()) - 4, int(ys.min()) - 4, int(xs.max()) + 5, int(ys.max()) + 5)
    crop = canvas.crop(box)
    scale = 760 / crop.size[1]
    nw, nh = int(crop.size[0] * scale), 760

    def bake(im: Image.Image, xy: tuple[int, int]) -> dict:
        x = (xy[0] - box[0]) * scale
        y = (xy[1] - box[1]) * scale
        iw, ih = im.size
        return {
            "left": round(x / nw, 4),
            "top": round(y / nh, 4),
            "width": round(iw * scale / nw, 4),
            "height": round(ih * scale / nh, 4),
        }

    layout = {
        "body": {**bake(body_im, body_xy), "originX": 0.5, "originY": 0.45},
        "leg-l": {**bake(ll, ll_xy), "originX": 0.55, "originY": 0.08},
        "leg-r": {**bake(rl, rl_xy), "originX": 0.42, "originY": 0.08},
        "antenna": {**bake(an, an_xy), "originX": 0.5, "originY": 0.92},
        "arm-l": {**bake(la_h, la_pos), "originX": round(la_ox, 4), "originY": 0.08},
        "arm-r": {**bake(ra_h, ra_pos), "originX": round(ra_ox, 4), "originY": 0.08},
    }
    # pupils live in the body artwork; the json keeps a pivot so the rig test stays meaningful
    layout["pupil-l"] = {"left": 0.36, "top": 0.28, "width": 0.12, "height": 0.12, "originX": 0.5, "originY": 0.5}
    layout["pupil-r"] = {"left": 0.52, "top": 0.27, "width": 0.12, "height": 0.12, "originX": 0.5, "originY": 0.5}

    files = {
        "body": body_im,
        "arm-l": la_h,
        "arm-r": ra_h,
        "leg-l": ll,
        "leg-r": rl,
        "antenna": an,
    }
    for name, im in files.items():
        box_l = layout[name]
        out = im.resize(
            (max(1, int(box_l["width"] * nw)), max(1, int(box_l["height"] * nh))),
            Image.Resampling.LANCZOS,
        )
        out.save(PARTS / f"{name}.png")
        print(name, out.size, box_l)

    meta = {
        "width": nw,
        "height": nh,
        "srcWidth": nw,
        "srcHeight": nh,
        "layout": layout,
        "order": ["leg-l", "leg-r", "body", "arm-l", "arm-r", "antenna", "pupil-l", "pupil-r"],
    }
    Path("lib/mascot-rig.json").write_text(json.dumps(meta, indent=2) + "\n")
    crop.resize((nw, nh), Image.Resampling.LANCZOS).save("/tmp/rig-qa/rest-final.png")
    print("canvas", nw, nh)

    save_pose("wave", REF / "01M66F7M2X309TWMGKRWWQ7Q0V.jpg")
    save_pose("hips", REF / "01M66F76Q7GF33EHWBV3B1JJZ2.jpg")
    save_pose("sit", REF / "01M66F7H0N1ME1M6W96E7F5F5T.jpg")
    save_pose("jump", REF / "01M66F7WN1S4FRZYQX9YVF8MP1.jpg")
    save_pose("walk", REF / "01M66F6CG4846G8VRK1Y8JFDD0.jpg", flip=True)
    save_pose("back", REF / "01M66F6FX4KZBSF8KQ4Z9N56G7.jpg")
    save_pose("front-ref", REF / "01M66F5RKMHSDG4M4SYQQJTXHJ.jpg")


if __name__ == "__main__":
    main()
