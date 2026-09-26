import itertools

from geom import INK, PAPER, arc, fill, line, mark

COUNTS = (2, 3, 4)
WIDTHS = (5, 6, 7)
GAPS = (("узкий", 19), ("средний", 17), ("широкий", 15))
BASE = (1, 1, 1)
OUTER = 28
SPAN = 48


def shape(n, w, r1):
    items = [fill(arc(16, 32, 6, 0, 360)), line(arc(16, 32, r1, -50, 50), w)]
    gap = 14 if n < 4 else 11
    seg = (2 * SPAN - (n - 1) * gap) / n
    for i in range(n):
        a0 = -SPAN + i * (seg + gap)
        items.append(line(arc(16, 32, OUTER, a0, a0 + seg), w * 0.72))
    return items


def key(ci, wi, gi):
    return f"{ci}{wi}{gi}"


def variant_svg(cid, k, in_circle):
    ci, wi, gi = (int(c) for c in k)
    return mark(shape(COUNTS[ci], WIDTHS[wi], GAPS[gi][1]), in_circle)


def tiles(axis, labels):
    out = []
    for i, label in enumerate(labels):
        idx = list(BASE)
        idx[axis] = i
        out.append((label, label, key(*idx), False, i == BASE[axis]))
    return out


NUMBER = 3
TITLE = "Волна 3 · параметры 2C"
PROMPT = ("2C выбран. Доводка по трём параметрам, в каждой карточке по одному ответу. Сверху — сборка "
          "выбранного сочетания без подложки и в круге, на светлом и тёмном.")
CHOSEN = ["штрихов 3", "толщина 6", "зазор средний"]

CARDS = [
    ("2C · параметры", [
        {"code": "Штрихи", "name": "дальний отклик", "radio": True,
         "note": "Сколько штрихов в распавшейся дуге. 2 — пауза, 4 — ближе к пунктиру.",
         "tiles": tiles(0, [f"штрихов {n}" for n in COUNTS])},
        {"code": "Толщина", "name": "линии", "radio": True,
         "note": "Толщина ближней дуги; дальняя — 72 % от неё. На 24 px толще = устойчивее.",
         "tiles": tiles(1, [f"толщина {w}" for w in WIDTHS])},
        {"code": "Зазор", "name": "между точкой и дугами", "radio": True,
         "note": "Радиус ближней дуги при неизменной дальней: узкий — дуги жмутся к краю, широкий — к точке.",
         "tiles": tiles(2, [f"зазор {name}" for name, _ in GAPS])},
    ]),
]

SUMMARY = ("Моё мнение: 3 штриха, толщина 6–7, средний зазор. 2 штриха на 24 px выглядят как две лишние точки, "
           "4 — сливаются в пунктир. Толщина 7 заметно спасает 24 px, особенно в круге.")


def themed(markup):
    for attr in ("fill", "stroke"):
        markup = markup.replace(f'{attr}="{INK}"', f'style="{attr}:var(--mk-ink)"')
        markup = markup.replace(f'{attr}="{PAPER}"', f'style="{attr}:var(--mk-paper)"')
    return markup


CSS = """
.build-tile.light{--mk-ink:#161618;--mk-paper:#f4f4f6}
.build-tile.dark{--mk-ink:#ececef;--mk-paper:#141416}
"""


def preview():
    symbols, combos = [], []
    for ci, wi, gi in itertools.product(range(3), repeat=3):
        k = key(ci, wi, gi)
        for circ in (False, True):
            sid = f"w3-{k}-{'c' if circ else 'b'}"
            symbols.append(f'<symbol id="{sid}" viewBox="0 0 64 64">{themed(variant_svg(sid, k, circ))}</symbol>')

        def use(circ, size=None, cls=""):
            attrs = (f' width="{size}" height="{size}"' if size else "") + (f' class="{cls}"' if cls else "")
            return f'<svg viewBox="0 0 64 64"{attrs} aria-hidden="true"><use href="#w3-{k}-{"c" if circ else "b"}"/></svg>'

        row = "".join(
            f'<div class="build-tile {theme}">{use(circ, cls="big")}<span class="sizes">'
            + "".join(f'<span class="size">{use(circ, px)}{px}</span>' for px in (48, 32, 24, 16))
            + "</span></div>"
            for circ in (False, True) for theme in ("light", "dark"))
        hidden = "" if (ci, wi, gi) == BASE else " hidden"
        combos.append(f'<div class="build" data-combo="{ci}-{wi}-{gi}"{hidden}><div class="build-row">{row}</div></div>')
    sprite = f'<svg width="0" height="0" style="position:absolute" aria-hidden="true">{"".join(symbols)}</svg>'
    return f'<div class="build"><h3>Сборка</h3>{sprite}{"".join(combos)}</div>'
