"""Legacy cutter. The live buddy is the jointed figure in components/vibepeep-figure.tsx.

This script sliced a single pose into PNG layers. Those layers left holes in the
body and floating limb scraps, so the shipped mascot no longer uses them.
"""
from __future__ import annotations

import json
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path('public/vibepeep-mascot.png')
OUT = Path('public/mascot')
QA = Path('/tmp/mascot-qa')
SCALE_W = 480

im = Image.open(SRC).convert('RGBA')
arr = np.array(im)
h, w = arr.shape[:2]
alpha = arr[:, :, 3] > 28
rgb = arr[:, :, :3]


def barrier_mask(points, thick):
    blocked = np.zeros((h, w), bool)
    yy, xx = np.mgrid[0:h, 0:w]
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        vx, vy = float(x2 - x1), float(y2 - y1)
        L2 = vx * vx + vy * vy or 1.0
        t = np.clip(((xx - x1) * vx + (yy - y1) * vy) / L2, 0, 1)
        d2 = (xx - (x1 + t * vx)) ** 2 + (yy - (y1 + t * vy)) ** 2
        blocked |= d2 <= thick * thick
    return blocked


def flood(seed, blocked):
    vis = np.zeros((h, w), bool)
    sx, sy = int(seed[0]), int(seed[1])
    if not alpha[sy, sx] or blocked[sy, sx]:
        raise SystemExit(f'bad seed {seed}')
    q = deque([(sy, sx)])
    vis[sy, sx] = True
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if ny < 0 or nx < 0 or ny >= h or nx >= w:
                continue
            if vis[ny, nx] or blocked[ny, nx] or not alpha[ny, nx]:
                continue
            vis[ny, nx] = True
            q.append((ny, nx))
    return vis


def dilate(mask, n):
    out = mask.copy()
    for _ in range(n):
        nxt = out.copy()
        nxt[1:] |= out[:-1]
        nxt[:-1] |= out[1:]
        nxt[:, 1:] |= out[:, :-1]
        nxt[:, :-1] |= out[:, 1:]
        out = nxt
    return out


def erode(mask, n):
    out = mask.copy()
    for _ in range(n):
        nxt = out.copy()
        nxt[1:] &= out[:-1]
        nxt[:-1] &= out[1:]
        nxt[:, 1:] &= out[:, :-1]
        nxt[:, :-1] &= out[:, 1:]
        out = nxt
    return out


def reclaim(mask, blocked):
    body = alpha & ~mask & ~blocked
    near_limb = dilate(mask, 8)
    near_body = dilate(body, 2)
    extra = blocked & near_limb & ~near_body & alpha
    return mask | extra


def centroid(mask):
    ys, xs = np.where(mask)
    return float(xs.mean()), float(ys.mean())


def boundary_pivot(mask):
    """Centre of limb pixels that touch a non-limb opaque pixel."""
    body = alpha & ~mask
    near = dilate(body, 1) & mask
    if near.sum() < 8:
        return centroid(mask)
    ys, xs = np.where(near)
    return float(xs.mean()), float(ys.mean())


def disc(cx, cy, radius):
    yy, xx = np.mgrid[0:h, 0:w]
    return (xx - cx) ** 2 + (yy - cy) ** 2 <= radius * radius


def inpaint(base_rgba, hole):
    """Copy the nearest non-hole opaque colour into hole pixels."""
    out = base_rgba.copy()
    filled = (out[:, :, 3] > 28) & ~hole
    q = deque()
    # seed from filled pixels that border the hole
    border = dilate(hole, 1) & filled
    ys, xs = np.where(border)
    for y, x in zip(ys.tolist(), xs.tolist()):
        q.append((y, x))
    seen = filled.copy()
    while q:
        y, x = q.popleft()
        col = out[y, x].copy()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if ny < 0 or nx < 0 or ny >= h or nx >= w or seen[ny, nx]:
                continue
            if not hole[ny, nx]:
                continue
            seen[ny, nx] = True
            out[ny, nx] = col
            q.append((ny, nx))
    return out


LIMB_CUTS = {
    'arm-l': ((140, 810), [(175, 648), (250, 730), (275, 790)], 7, 78),
    'arm-r': ((1000, 420), [(905, 450), (890, 560), (850, 660), (890, 730)], 8, 72),
    'leg-l': ((300, 1050), [(210, 905), (360, 890), (500, 940), (560, 1020)], 8, 86),
    'leg-r': ((880, 980), [(650, 980), (740, 910), (880, 870), (1000, 900)], 9, 78),
    # Stem is still a separate blob at y=147. The barrier has to reach transparent
    # pixels on both sides; a line inside the head floods the whole body.
    'antenna': ((450, 60), [(300, 147), (498, 147)], 4, 14),
}

limbs = {}
pivots = {}
for name, (seed, pts, thick, radius) in LIMB_CUTS.items():
    blocked = barrier_mask(pts, thick)
    mask = reclaim(flood(seed, blocked), blocked)
    px, py = boundary_pivot(mask)
    hub = disc(px, py, radius) & alpha & ~mask
    # Don't let the hub swallow another limb later; applied after all floods.
    limbs[name] = {'mask': mask, 'hub': hub, 'pivot': (px, py), 'radius': radius}
    pivots[name] = (px, py)
    ys, xs = np.where(mask)
    print(f'{name:8} limb {int(mask.sum()):6}  pivot ({px:.1f},{py:.1f})  bbox {xs.min()},{ys.min()} {xs.max()},{ys.max()}')

# Hubs must not overlap another limb's mask.
claimed = np.zeros((h, w), bool)
for name in limbs:
    claimed |= limbs[name]['mask']
for name in limbs:
    limbs[name]['hub'] &= ~claimed
    limbs[name]['full'] = limbs[name]['mask'] | limbs[name]['hub']

# A few pixels of the original joint travel with the limb so a turn covers the socket
# instead of opening a gap. Antenna stays a clean cut.
for name in list(limbs):
    if name == 'antenna':
        continue
    others = np.zeros((h, w), bool)
    for other_name, other_limb in limbs.items():
        if other_name != name:
            others |= other_limb['full']
    extra = dilate(limbs[name]['full'], 6) & alpha & ~limbs[name]['full'] & ~others
    limbs[name]['full'] |= extra

# Sparks: opaque pixels in the dash boxes, not already a limb.
spark_boxes = {
    'spark-a': (8, 100, 210, 340),
    'spark-b': (70, 90, 220, 250),
    'spark-c': (840, 20, 960, 170),
    'spark-d': (900, 110, 1040, 230),
}
# Better: connected components of orange outside the face.
r, g, b = rgb[:, :, 0].astype(int), rgb[:, :, 1].astype(int), rgb[:, :, 2].astype(int)
orange = (arr[:, :, 3] > 80) & (r > 180) & (g > 60) & (g < 190) & (b < 110) & (r > g + 30)
# kill the face ring
orange[280:720, 250:820] = False
vis = np.zeros_like(orange)
ys, xs = np.where(orange)
comps = []
for y, x in zip(ys.tolist(), xs.tolist()):
    if vis[y, x]:
        continue
    q = deque([(y, x)])
    vis[y, x] = True
    pts = []
    while q:
        cy, cx = q.popleft()
        pts.append((cy, cx))
        for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
            if 0 <= ny < h and 0 <= nx < w and orange[ny, nx] and not vis[ny, nx]:
                vis[ny, nx] = True
                q.append((ny, nx))
    if len(pts) > 400:
        comps.append(pts)
comps.sort(key=len, reverse=True)
print('spark comps', [len(c) for c in comps])
sparks = {}
for i, pts in enumerate(comps[:4]):
    mask = np.zeros((h, w), bool)
    for y, x in pts:
        mask[y, x] = True
    # include antialiased neighbours that are opaque and not body-dark
    grown = dilate(mask, 2) & alpha
    # only keep pixels whose colour is warm (not the black body)
    warm = (r > 140) & (r > g) & (b < 140)
    mask = grown & (warm | mask)
    name = f'spark-{i}'
    sparks[name] = mask
    ys, xs = np.where(mask)
    pivots[name] = (float(xs.mean()), float(ys.mean()))
    print(f'{name:8} {int(mask.sum()):5} bbox {xs.min()},{ys.min()} {xs.max()},{ys.max()}')

# Pupils: holes in the eye white.
white = (arr[:, :, 3] > 180) & (r > 215) & (g > 210) & (b > 200)
pupils = {}
for name, box in (('pupil-l', (300, 330, 580, 600)), ('pupil-r', (600, 320, 830, 560))):
    x0, y0, x1, y1 = box
    window = np.zeros((h, w), bool)
    window[y0:y1, x0:x1] = True
    sclera = white & window
    # largest white component
    vis = np.zeros((h, w), bool)
    best = None
    ys, xs = np.where(sclera)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if vis[y, x]:
            continue
        q = deque([(y, x)])
        vis[y, x] = True
        pts = []
        while q:
            cy, cx = q.popleft()
            pts.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and sclera[ny, nx] and not vis[ny, nx]:
                    vis[ny, nx] = True
                    q.append((ny, nx))
        if best is None or len(pts) > len(best):
            best = pts
    sclera_mask = np.zeros((h, w), bool)
    for y, x in best:
        sclera_mask[y, x] = True
    # dark pixels enclosed: flood dark inside a dilated sclera ring
    ring = dilate(sclera_mask, 2)
    dark = window & (arr[:, :, 3] > 160) & (r < 60) & (g < 60) & (b < 60) & ~sclera_mask
    # keep dark components whose centroid sits inside the sclera bbox
    vis = np.zeros((h, w), bool)
    pupil = np.zeros((h, w), bool)
    ys, xs = np.where(dark)
    sy0, sy1 = int(np.where(sclera_mask)[0].min()), int(np.where(sclera_mask)[0].max())
    sx0, sx1 = int(np.where(sclera_mask)[1].min()), int(np.where(sclera_mask)[1].max())
    for y, x in zip(ys.tolist(), xs.tolist()):
        if vis[y, x]:
            continue
        q = deque([(y, x)])
        vis[y, x] = True
        pts = []
        while q:
            cy, cx = q.popleft()
            pts.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not vis[ny, nx]:
                    vis[ny, nx] = True
                    q.append((ny, nx))
        if len(pts) < 80:
            continue
        cy = sum(p[0] for p in pts) / len(pts)
        cx = sum(p[1] for p in pts) / len(pts)
        if sy0 - 8 <= cy <= sy1 + 8 and sx0 - 8 <= cx <= sx1 + 8:
            for py, px in pts:
                pupil[py, px] = True
    # highlights: small white components inside the pupil bbox, not the sclera
    dil_p = dilate(pupil, 3)
    highlight = white & dil_p & ~sclera_mask
    mask = pupil | highlight
    # Keep the antialiased dark edge. Leave the orange/pink eyelid on the body —
    # if it travels with the pupil, a glance pulls a coloured seam across the eye.
    soft = dilate(mask, 1) & alpha & window
    warm = (r > 100) & (r > b + 18)
    mask = (mask | soft) & ~warm
    pupils[name] = mask
    ys, xs = np.where(mask)
    pivots[name] = (float(xs.mean()), float(ys.mean()))
    print(f'{name:8} {int(mask.sum()):5} bbox {xs.min()},{ys.min()} {xs.max()},{ys.max()} center {pivots[name]}')

# Build body: original minus parts. Sockets and eye holes are inpainted and
# kept, because the limb/pupil sprites cover them exactly at rest.
erase = np.zeros((h, w), bool)
for limb in limbs.values():
    # The mask only. The joint hub is a disc that would eat the cheek and hip.
    erase |= limb['mask']
for mask in sparks.values():
    erase |= mask
for mask in pupils.values():
    erase |= mask

hole = np.zeros((h, w), bool)
for mask in pupils.values():
    hole |= mask

source = (arr[:, :, 3] > 28) & ~erase
# Let the fill walk through the hole from real body pixels only.
body = arr.copy()
body[erase, 3] = 0
body[erase, :3] = 0
filled = source.copy()
q = deque()
border = dilate(hole, 1) & source
ys, xs = np.where(border)
for y, x in zip(ys.tolist(), xs.tolist()):
    q.append((y, x))
seen = filled.copy()
while q:
    y, x = q.popleft()
    col = body[y, x].copy()
    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
        if ny < 0 or nx < 0 or ny >= h or nx >= w or seen[ny, nx]:
            continue
        if not hole[ny, nx]:
            continue
        seen[ny, nx] = True
        body[ny, nx] = col
        q.append((ny, nx))
# Anything in the hole the fill didn't reach stays transparent — shouldn't happen.
unfilled = hole & (body[:, :, 3] == 0)
if int(unfilled.sum()):
    # Only close gaps that sit inside the silhouette. A sticker outside the belly reads as a blob.
    closed = 0
    for y in range(h):
        cols = np.where(body[y, :, 3] > 40)[0]
        if cols.size < 2:
            continue
        span = unfilled[y, cols[0]:cols[-1] + 1]
        if not span.any():
            continue
        src = int(cols[np.argmin(np.abs(cols - (cols[0] + cols[-1]) / 2))])
        block = body[y, cols[0]:cols[-1] + 1]
        block[span] = body[y, src]
        body[y, cols[0]:cols[-1] + 1] = block
        closed += int(span.sum())
    print('unfilled socket px', int(unfilled.sum()), 'closed inside', closed)

# Keep the drawn belly and face. Shave only the torn stumps the jump cuts left,
# then close one-row bites where the outline drops inward.
for y in range(648, 708):
    body[y, :236] = 0
for y in range(848, 910):
    body[y, 836:] = 0


def _edge_fit(y0, y1, step, side):
    ysamp, edge = [], []
    for y in range(y0, y1, step):
        cols = np.where(body[y, :, 3] > 40)[0]
        if cols.size > 30:
            ysamp.append(y)
            edge.append(int(cols.min() if side < 0 else cols.max()))
    return np.polyfit(np.array(ysamp, float), np.array(edge, float), 2)


left_coef = _edge_fit(760, 845, 4, -1)
right_coef = _edge_fit(760, 845, 4, 1)
trimmed = 0
for y in range(845, h):
    cols = np.where(body[y, :, 3] > 40)[0]
    if cols.size == 0:
        continue
    left = float(np.polyval(left_coef, y))
    right = float(np.polyval(right_coef, y))
    if right - left < 36:
        body[y] = 0
        trimmed += int(cols.size)
        continue
    kill = (cols < left) | (cols > right)
    body[y, cols[kill]] = 0
    trimmed += int(kill.sum())
print('belly trim', trimmed)


def fill_outline_bites(side, y0, y1):
    """Extend a row when both neighbours stick out past it."""
    filled = 0
    for _ in range(3):
        edges = {}
        for y in range(y0, y1):
            cols = np.where(body[y, :, 3] > 40)[0]
            if cols.size:
                edges[y] = int(cols.max() if side > 0 else cols.min())
        for y, edge in list(edges.items()):
            if y - 1 not in edges or y + 1 not in edges:
                continue
            if side > 0 and edge + 5 < edges[y - 1] and edge + 5 < edges[y + 1]:
                dest = min(edge + 22, max(edges[y - 1], edges[y + 1]))
                body[y, edge:dest + 1] = body[y, max(0, edge - 8)]
                filled += dest - edge
            elif side < 0 and edge - 5 > edges[y - 1] and edge - 5 > edges[y + 1]:
                dest = max(edge - 22, min(edges[y - 1], edges[y + 1]))
                body[y, dest:edge + 1] = body[y, min(w - 1, edge + 8)]
                filled += edge - dest
    return filled


print('outline bites', fill_outline_bites(1, 240, 980), fill_outline_bites(-1, 240, 980))


def layer_from(mask):
    out = np.zeros_like(arr)
    out[mask] = arr[mask]
    return out


def premultiplied_resize(image, size):
    src = np.array(image).astype(np.float32)
    a = src[:, :, 3:4] / 255.0
    prem = np.dstack([src[:, :, :3] * a, src[:, :, 3]])
    resized = Image.fromarray(np.clip(prem, 0, 255).astype(np.uint8), 'RGBA').resize(size, Image.Resampling.LANCZOS)
    out = np.array(resized).astype(np.float32)
    aa = out[:, :, 3:4]
    rgb_out = np.zeros_like(out[:, :, :3])
    np.divide(out[:, :, :3], np.maximum(aa / 255.0, 1e-6), out=rgb_out, where=aa > 0)
    rgb_out = np.clip(rgb_out, 0, 255)
    result = np.dstack([rgb_out, aa]).astype(np.uint8)
    result[aa[:, :, 0] == 0, :3] = 0
    return Image.fromarray(result, 'RGBA')


# The rest sprites are already arms-down and feet-down. CSS rotations are
# relative to that, so hang stays at zero (no second tilt).
HANG = {
    'arm-l': 0.0,
    'arm-r': 0.0,
    'leg-l': 0.0,
    'leg-r': 0.0,
}


def _project_all(pts, poly):
    """pts (N,2). Returns dist, arc length, signed offset, total length."""
    best_dist = np.full(len(pts), 1e9)
    best_s = np.zeros(len(pts))
    best_signed = np.zeros(len(pts))
    arc = 0.0
    for i in range(len(poly) - 1):
        a = poly[i]
        b = poly[i + 1]
        ab = b - a
        L = float(np.linalg.norm(ab)) or 1e-6
        t = np.clip(((pts - a) @ ab) / (L * L), 0.0, 1.0)
        q = a + t[:, None] * ab
        delta = pts - q
        dist = np.linalg.norm(delta, axis=1)
        tangent = ab / L
        normal = np.array([-tangent[1], tangent[0]])
        signed = delta @ normal
        better = dist < best_dist
        best_dist = np.where(better, dist, best_dist)
        best_s = np.where(better, arc + t * L, best_s)
        best_signed = np.where(better, signed, best_signed)
        arc += L
    return best_dist, best_s, best_signed, arc


def _point_on(poly, s):
    left = float(s)
    for i in range(len(poly) - 1):
        a = poly[i]
        b = poly[i + 1]
        ab = b - a
        L = float(np.linalg.norm(ab)) or 1e-6
        if left <= L or i == len(poly) - 2:
            t = min(1.0, max(0.0, left / L))
            tangent = ab / L
            normal = np.array([-tangent[1], tangent[0]])
            return a + ab * t, normal
        left -= L
    return poly[-1], np.array([1.0, 0.0])


def heading(v):
    return math.atan2(float(v[0]), float(v[1]))


def rotate_point(pivot, point, deg):
    """Match rotate_layer: positive degrees move a point clockwise."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    dx, dy = float(point[0] - pivot[0]), float(point[1] - pivot[1])
    return np.array([pivot[0] + c * dx - s * dy, pivot[1] + s * dx + c * dy])


def translate_layer(image_arr, dx, dy):
    if abs(dx) < 0.15 and abs(dy) < 0.15:
        return image_arr
    src = image_arr.astype(np.float32)
    alpha_px = src[:, :, 3:4] / 255.0
    prem = np.dstack([src[:, :, :3] * alpha_px, src[:, :, 3]])
    image = Image.fromarray(np.clip(prem, 0, 255).astype(np.uint8), 'RGBA')
    moved = image.transform(image.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), resample=Image.BICUBIC)
    out = np.array(moved).astype(np.float32)
    aa = out[:, :, 3:4]
    rgb = np.zeros_like(out[:, :, :3])
    np.divide(out[:, :, :3], np.maximum(aa / 255.0, 1e-6), out=rgb, where=aa[:, :, 0:1] > 0)
    result = np.dstack([np.clip(rgb, 0, 255), aa]).astype(np.uint8)
    result[aa[:, :, 0] < 12] = 0
    return result


# Shoulders on the flanks, hips on the lower belly.
ATTACH = {
    'arm-l': (252.0, 705.0),
    'arm-r': (848.0, 705.0),
    'leg-l': (450.0, 875.0),
    'leg-r': (660.0, 875.0),
}
AIM = {'arm-l': -16.0, 'arm-r': 16.0, 'leg-l': -6.0, 'leg-r': 6.0}
REACH = {'arm-l': 215.0, 'arm-r': 215.0, 'leg-l': 200.0, 'leg-r': 200.0}



def prem_affine(image_arr, matrix):
    src = image_arr.astype(np.float32)
    a = src[:, :, 3:4] / 255.0
    prem = np.dstack([src[:, :, :3] * a, src[:, :, 3]])
    image = Image.fromarray(np.clip(prem, 0, 255).astype(np.uint8), 'RGBA')
    turned = np.array(image.transform(image.size, Image.AFFINE, matrix, resample=Image.BICUBIC)).astype(np.float32)
    aa = turned[:, :, 3:4]
    rgb = np.zeros_like(turned[:, :, :3])
    np.divide(turned[:, :, :3], np.maximum(aa / 255.0, 1e-6), out=rgb, where=aa > 0)
    out = np.dstack([np.clip(rgb, 0, 255), aa]).astype(np.uint8)
    out[aa[:, :, 0] < 12] = 0
    return out


def scale_layer(image_arr, pivot, factor):
    if abs(factor - 1.0) < 0.015:
        return image_arr
    px, py = pivot
    inv = 1.0 / factor
    return prem_affine(image_arr, (inv, 0, px * (1 - inv), 0, inv, py * (1 - inv)))


def hang_limb(name):
    """Turn his own arm or leg so it hangs, then tuck the root into the body."""
    mask = limbs[name]['mask']
    px, py = limbs[name]['pivot']
    ys, xs = np.where(mask)
    pts = np.stack([xs, ys], 1).astype(np.float64)
    dist = np.hypot(pts[:, 0] - px, pts[:, 1] - py)
    far = dist >= np.quantile(dist, 0.88)
    tip = pts[far].mean(axis=0)
    length = float(np.hypot(tip[0] - px, tip[1] - py)) or 1.0
    current = math.degrees(math.atan2(tip[0] - px, tip[1] - py))
    rot = current - AIM[name]
    scale = float(np.clip(REACH[name] / length, 0.82, 1.12))
    ax, ay = ATTACH[name]
    layer = scale_layer(layer_from(mask), (px, py), scale)
    layer = rotate_layer(layer, (px, py), rot)
    layer = translate_layer(layer, ax - px, ay - py)
    ang = math.radians(AIM[name])
    direction = np.array([math.sin(ang), math.cos(ang)])
    # The art pivot sits on the shoulder. Tuck the sprite into the body so the
    # cut root is covered, and keep the rotation pivot on the surface.
    tuck = 42.0
    layer = translate_layer(layer, float(-direction[0] * tuck), float(-direction[1] * tuck))
    jx, jy = ax, ay
    all_y, all_x = np.where(layer[:, :, 3] > 16)
    along = np.stack([all_x - jx, all_y - jy], 1) @ direction
    # Keep the root tucked under the belly. Only drop a tail that would cross the face.
    layer[all_y[along < -70], all_x[along < -70]] = 0
    limbs[name]['pivot'] = (jx, jy)
    pivots[name] = (jx, jy)
    limbs[name]['posed'] = layer
    print(f'{name} scale {scale:.2f} rot {rot:.0f} joint ({jx:.0f},{jy:.0f})')


def paint_joint(target, cx, cy, radius, col):
    yy, xx = np.ogrid[0:h, 0:w]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    core = d <= radius - 1.2
    edge = (d > radius - 1.2) & (d < radius + 0.8)
    target[core] = col
    if edge.any():
        t = ((radius + 0.8) - d[edge]) / 2.0
        t = np.clip(t, 0, 1)[:, None]
        base = target[edge].astype(np.float32)
        ink = col.astype(np.float32)
        # Only cover pixels that are already opaque, so the cap does not grow a fringe.
        already = base[:, 3] > 20
        mixed = base.copy()
        mixed[already] = ink * t[already] + base[already] * (1 - t[already])
        mixed[already, 3] = np.maximum(base[already, 3], ink[3] * t[already, 0])
        target[edge] = np.clip(mixed, 0, 255).astype(np.uint8)


def rotate_layer(image_arr, pivot, deg):
    """Rotate in premultiplied space so the cut edge does not grow a light halo."""
    if abs(deg) < 0.01:
        return image_arr
    src = image_arr.astype(np.float32)
    alpha_px = src[:, :, 3:4] / 255.0
    prem = np.dstack([src[:, :, :3] * alpha_px, src[:, :, 3]])
    image = Image.fromarray(np.clip(prem, 0, 255).astype(np.uint8), 'RGBA')
    px, py = pivot
    a = np.deg2rad(deg)
    c, s = float(np.cos(a)), float(np.sin(a))
    matrix = (c, s, px - c * px - s * py, -s, c, py + s * px - c * py)
    turned = np.array(image.transform(image.size, Image.AFFINE, matrix, resample=Image.BICUBIC)).astype(np.float32)
    aa = turned[:, :, 3:4]
    rgb = np.zeros_like(turned[:, :, :3])
    np.divide(turned[:, :, :3], np.maximum(aa / 255.0, 1e-6), out=rgb, where=aa > 0)
    out = np.dstack([np.clip(rgb, 0, 255), aa]).astype(np.uint8)
    out[aa[:, :, 0] < 12, 3] = 0
    out[aa[:, :, 0] < 12, :3] = 0
    return out


def defringe(image_arr):
    """Drop the light rim the cut leaves where a limb meets the belly."""
    out = image_arr.copy()
    a = out[:, :, 3]
    rgb_px = out[:, :, :3].astype(np.int16)
    bright = rgb_px.max(axis=2) > 70
    ghost = bright & (a > 0) & (a < 80)
    out[ghost] = 0
    opaque = a > 40
    inner = erode(opaque, 1)
    rim = opaque & ~inner & bright
    if rim.any():
        out[rim, :3] = np.clip(rgb_px[rim] * 0.35, 0, 255).astype(np.uint8)
    return out


for name in ('arm-l', 'arm-r', 'leg-l', 'leg-r'):
    hang_limb(name)

layers = {'body': defringe(body)}
foot_points = {}
for name, limb in limbs.items():
    if 'posed' in limb:
        layer = defringe(limb['posed'])
    else:
        layer = defringe(layer_from(limb['full']))
    layers[name] = layer
    mask = layer[:, :, 3] > 40
    if name.startswith('leg') and mask.any():
        ys, xs = np.where(mask)
        y_cut = np.quantile(ys, 0.82)
        foot = ys >= y_cut
        foot_points[name] = {
            'hip': [float(limb['pivot'][0]), float(limb['pivot'][1])],
            'foot': [float(xs[foot].mean()), float(ys[foot].mean())],
        }
        print(f'{name} foot {foot_points[name]}')
for name, mask in {**sparks, **pupils}.items():
    layers[name] = defringe(layer_from(mask))

# Full-res rest composite
rest = np.zeros_like(arr)
# Limbs sit under the belly so the tucked root never shows a seam.
order = ['leg-l', 'leg-r', 'arm-l', 'arm-r', 'body', *sparks.keys(), 'antenna', 'pupil-l', 'pupil-r']
for name in order:
    layer = layers[name]
    m = layer[:, :, 3] > 0
    rest[m] = layer[m]
diff = np.abs(rest.astype(np.int16) - arr.astype(np.int16))
visible = (rest[:, :, 3] > 16) | (arr[:, :, 3] > 16)
print('full rest max diff', int(diff[visible].max()) if visible.any() else 0, 'mean', float(diff[visible].mean()) if visible.any() else 0, 'px>8', int((diff.max(axis=2) > 8).sum() if False else ((diff.max(axis=2) > 8) & visible).sum()))

scale = SCALE_W / w
size = (SCALE_W, int(round(h * scale)))
print('export', size)

OUT.mkdir(parents=True, exist_ok=True)
QA.mkdir(parents=True, exist_ok=True)

def part_bbox(mask, pad=3):
    ys, xs = np.where(mask)
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(w - 1, int(xs.max()) + pad)
    y1 = min(h - 1, int(ys.max()) + pad)
    return x0, y0, x1, y1

layout = {}
for name, image_arr in layers.items():
    full = Image.fromarray(image_arr, 'RGBA')
    if name == 'body':
        small = premultiplied_resize(full, size)
        box = (0, 0, w - 1, h - 1)
        origin = (0.5, 0.5)
        chk = np.array(small)
        print('saved body', chk.shape, 'opaque', int((chk[:, :, 3] > 40).sum()))
    else:
        mask = image_arr[:, :, 3] > 0
        x0, y0, x1, y1 = part_bbox(mask)
        crop = full.crop((x0, y0, x1 + 1, y1 + 1))
        cw, ch = crop.size
        small = premultiplied_resize(crop, (max(1, round(cw * scale)), max(1, round(ch * scale))))
        px, py = pivots.get(name, ((x0 + x1) / 2, (y0 + y1) / 2))
        origin = ((px - x0) / (x1 - x0 + 1), (py - y0) / (y1 - y0 + 1))
        box = (x0, y0, x1, y1)
        if name.startswith('pupil'):
            # Resize can revive an orange eyelid fringe. Keep only the pupil and highlight.
            px = np.array(small)
            rr, gg, bb, aa = px[:, :, 0].astype(int), px[:, :, 1].astype(int), px[:, :, 2].astype(int), px[:, :, 3]
            kill = (aa > 0) & (rr > 110) & (rr > bb + 24) & (rr > gg + 16)
            px[kill, 3] = 0
            px[kill, :3] = 0
            small = Image.fromarray(px, 'RGBA')
    small.save(OUT / f'{name}.png', optimize=True)
    x0, y0, x1, y1 = box
    layout[name] = {
        'left': round(x0 / w, 4),
        'top': round(y0 / h, 4),
        'width': round((x1 - x0 + 1) / w, 4),
        'height': round((y1 - y0 + 1) / h, 4),
        'originX': round(origin[0], 4),
        'originY': round(origin[1], 4),
    }

walk = {}
for name, pts in foot_points.items():
    walk[name] = {
        'hipX': round(pts['hip'][0] / w, 4),
        'hipY': round(pts['hip'][1] / h, 4),
        'footX': round(pts['foot'][0] / w, 4),
        'footY': round(pts['foot'][1] / h, 4),
    }

meta = {
    'width': size[0],
    'height': size[1],
    'srcWidth': w,
    'srcHeight': h,
    'layout': layout,
    'order': order,
    'hang': HANG,
    'walk': walk,
}
Path('lib/mascot-rig.json').write_text(json.dumps(meta, indent=2) + '\n')
print(json.dumps(layout, indent=2))

# QA frames
def rot(image, pivot, deg):
    if abs(deg) < 0.01:
        return image
    px, py = pivot
    a = np.deg2rad(deg)
    c, s = float(np.cos(a)), float(np.sin(a))
    # inverse map: output pixel samples the image rotated by +deg around pivot
    matrix = (c, s, px - c * px - s * py, -s, c, py + s * px - c * py)
    return image.transform(image.size, Image.AFFINE, matrix, resample=Image.BICUBIC)


def compose(poses, scale_to=420):
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for name in order:
        layer = Image.fromarray(layers[name], 'RGBA')
        deg = poses.get(name, 0)
        if name in pivots and deg:
            layer = rot(layer, pivots[name], deg)
        canvas = Image.alpha_composite(canvas, layer)
    bg = Image.new('RGBA', canvas.size, (246, 244, 238, 255))
    out = Image.alpha_composite(bg, canvas)
    out.thumbnail((scale_to, scale_to), Image.Resampling.LANCZOS)
    return out.convert('RGB')


frames = {
    'rest': {},
    'walk-a': {'leg-l': 16, 'leg-r': -14, 'arm-l': -12, 'arm-r': 10},
    'walk-b': {'leg-l': -14, 'leg-r': 16, 'arm-l': 10, 'arm-r': -12},
    'raise': {'arm-l': -70, 'arm-r': 72},
}
sheet = []
for name, pose in frames.items():
    frame = compose(pose, 360)
    frame.save(QA / f'{name}.jpg', quality=90)
    sheet.append(frame)
# pupils shifted
pupil_shift = Image.fromarray(layers['body'], 'RGBA')
for name, (dx, dy) in (('pupil-l', (18, -8)), ('pupil-r', (18, -8))):
    layer = Image.fromarray(layers[name], 'RGBA')
    layer = layer.transform(layer.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), resample=Image.BICUBIC)
    pupil_shift = Image.alpha_composite(pupil_shift, layer)
for name in order:
    if name in ('body', 'pupil-l', 'pupil-r'):
        continue
    pupil_shift = Image.alpha_composite(pupil_shift, Image.fromarray(layers[name], 'RGBA'))
bg = Image.new('RGBA', pupil_shift.size, (246, 244, 238, 255))
look = Image.alpha_composite(bg, pupil_shift).convert('RGB')
look.thumbnail((360, 360), Image.Resampling.LANCZOS)
look.save(QA / 'look.jpg', quality=90)

contact = Image.new('RGB', (360 * len(sheet), 360), (246, 244, 238))
for i, frame in enumerate(sheet):
    contact.paste(frame, (i * 360, 0))
contact.save(QA / 'contact.jpg', quality=88)
print('qa written', QA)
