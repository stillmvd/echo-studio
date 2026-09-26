import math
import re
import subprocess
import tempfile
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
INKSCAPE = "C:/Program Files/Inkscape/bin/inkscape.com"
FONTS = Path.home() / "Fonts"
BASELINE = 45
TS_OUT = PROJECT / "src/components/layout/echoMarkPath.ts"

AMBER = "#ffa24c"
AMBER_INK = "#2b1300"
TEXT_LIGHT = "#161618"
TEXT_DARK = "#ececef"

FULL = {"width": 6, "gap": 14, "field": 54}
SMALL = {"width": 7.4, "gap": 18, "field": 58}
CIRCLE_SHARE = 0.72
LF = "\n"

DOT = (16, 32, 6)
OUTER = 28
SPAN = 48
DASHES = 3
OUTER_RATIO = 0.72


def arc(cx, cy, r, a0, a1, step=2):
    n = max(2, int(abs(a1 - a0) / step) + 1)
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / (n - 1))),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / (n - 1)))) for i in range(n)]


def shape(width, gap, **_):
    cx, cy, r = DOT
    near = (r + OUTER - width * OUTER_RATIO / 2) / 2
    items = [("fill", arc(cx, cy, r, 0, 360), 0), ("line", arc(cx, cy, near, -50, 50), width)]
    seg = (2 * SPAN - (DASHES - 1) * gap) / DASHES
    for i in range(DASHES):
        a0 = -SPAN + i * (seg + gap)
        items.append(("line", arc(cx, cy, OUTER, a0, a0 + seg), width * OUTER_RATIO))
    return items


def stroked(items, size):
    xs = [x + s * w / 2 for _, pts, w in items for x, _ in pts for s in (-1, 1)]
    ys = [y + s * w / 2 for _, pts, w in items for _, y in pts for s in (-1, 1)]
    k = size / max(max(xs) - min(xs), max(ys) - min(ys))
    ox = 32 - (min(xs) + max(xs)) / 2 * k
    oy = 32 - (min(ys) + max(ys)) / 2 * k
    out = []
    for kind, pts, w in items:
        d = "M" + " L".join(f"{ox + x * k:.3f} {oy + y * k:.3f}" for x, y in pts)
        if kind == "fill":
            out.append(f'<path d="{d} Z" fill="#000"/>')
        else:
            out.append(f'<path d="{d}" fill="none" stroke="#000" stroke-width="{w * k:.3f}" '
                       f'stroke-linecap="round" stroke-linejoin="round"/>')
    return "".join(out)


def outline(params, size):
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "in.svg", Path(tmp) / "out.svg"
        src.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{stroked(shape(**params), size)}</svg>',
                       encoding="utf-8")
        subprocess.run([INKSCAPE, str(src), "--actions=select-all;object-stroke-to-path;path-combine;"
                        f"export-filename:{dst};export-plain-svg;export-do"], check=True, capture_output=True)
        return " ".join(re.findall(r'\sd="([^"]+)"', dst.read_text(encoding="utf-8")))


def doc(body, view="0 0 64 64"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">{body}</svg>\n'


def text_paths(size=36, tracking=-0.02):
    parts, x = [], 0.0
    for word, face in (("Echo ", "Light"), ("Studio", "Bold")):
        font = TTFont(FONTS / f"KockersSans-{face}.ttf")
        glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
        k = size / font["head"].unitsPerEm
        for ch in word:
            name = cmap[ord(ch)]
            pen = SVGPathPen(glyphs)
            glyphs[name].draw(TransformPen(pen, (k, 0, 0, -k, x, BASELINE)))
            parts.append(pen.getCommands())
            x += glyphs[name].width * k + tracking * size
    return " ".join(p for p in parts if p), x


def main():
    full = outline(FULL, FULL["field"])
    small = outline(SMALL, SMALL["field"])
    in_circle = outline(FULL, 64 * CIRCLE_SHARE)
    files = {
        "mark.svg": doc(f'<path d="{full}" fill="{AMBER}"/>'),
        "mark-small.svg": doc(f'<path d="{small}" fill="{AMBER}"/>'),
        "mark-mono.svg": doc(f'<path d="{full}" fill="currentColor"/>'),
        "mark-circle.svg": doc(f'<circle cx="32" cy="32" r="32" fill="{AMBER}"/><path d="{in_circle}" fill="{AMBER_INK}"/>'),
        "app-icon.svg": doc(f'<path d="{full}" fill="{AMBER}"/>'),
        "favicon.svg": doc(f'<path d="{small}" fill="{AMBER}"/>'),
    }
    words, width = text_paths()
    view = f"0 0 {80 + width:.0f} 64"
    for name, color in (("lockup.svg", TEXT_LIGHT), ("lockup-on-dark.svg", TEXT_DARK)):
        files[name] = doc(f'<path d="{full}" fill="{AMBER}"/>'
                          f'<path d="{words}" fill="{color}" transform="translate(76 0)"/>', view)
    for name, text in files.items():
        (ROOT / name).write_text(text, encoding="utf-8", newline=LF)
    TS_OUT.write_text(f"export const ECHO_MARK_PATH =\n  '{small}';\n", encoding="utf-8", newline=LF)
    print("ok", len(files), "svg +", TS_OUT.name)


if __name__ == "__main__":
    main()
