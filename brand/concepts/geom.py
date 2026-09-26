import math

INK = "#161618"
PAPER = "#f4f4f6"


def arc(cx, cy, r, a0, a1, step=2):
    n = max(2, int(abs(a1 - a0) / step) + 1)
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / (n - 1))),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / (n - 1)))) for i in range(n)]


def rounded_rect(x0, y0, x1, y1, r):
    pts = []
    for cx, cy, a in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        pts += arc(cx, cy, r, a, a + 90)
    return pts


def line(pts, w):
    return ("line", pts, w)


def fill(pts):
    return ("fill", pts, 0)


def bbox(items):
    xs, ys = [], []
    for _, pts, w in items:
        for x, y in pts:
            xs += [x - w / 2, x + w / 2]
            ys += [y - w / 2, y + w / 2]
    return min(xs), min(ys), max(xs), max(ys)


def render(items, size, color):
    x0, y0, x1, y1 = bbox(items)
    k = size / max(x1 - x0, y1 - y0)
    ox = 32 - (x0 + x1) / 2 * k
    oy = 32 - (y0 + y1) / 2 * k
    out = []
    for kind, pts, w in items:
        d = "M" + " L".join(f"{ox + x * k:.2f} {oy + y * k:.2f}" for x, y in pts)
        if kind == "fill":
            out.append(f'<path d="{d} Z" fill="{color}"/>')
        else:
            out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w * k:.2f}" '
                       f'stroke-linecap="round" stroke-linejoin="round"/>')
    return "".join(out)


def mark(items, in_circle, share=0.72, bare=54):
    if in_circle:
        return f'<circle cx="32" cy="32" r="32" fill="{INK}"/>' + render(items, 64 * share, PAPER)
    return render(items, bare, INK)
