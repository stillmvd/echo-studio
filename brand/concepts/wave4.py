import itertools

from geom import render
from wave3 import shape

SHAPE = shape(3, 6, 17)
DARK = "#141416"
CIRCLES = (
    ("янтарный круг", "amber", "#2b1300"),
    ("тёмный круг", "#1c1c1f", "#ffa24c"),
    ("круг-градиент", "grad", "#2b1300"),
)
SHARES = (66, 72, 78, 84)
GLYPHS = (("янтарь", "#ffa24c"), ("тёмный янтарь", "#d9731a"), ("градиент", "grad"))
ICONS = ("в круге", "без подложки")
BASE = (0, 1, 0, 0)


def paint(color, gid):
    if color == "amber":
        return "#ffa24c", ""
    if color == "grad":
        return (f"url(#{gid})", f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
                f'<stop offset="0" stop-color="#ffc07a"/><stop offset="1" stop-color="#ff7f24"/></linearGradient></defs>')
    return color, ""


def circle_svg(cid, ci, si):
    _, bg, fg = CIRCLES[ci]
    fill, defs = paint(bg, f"{cid}-g")
    return f'{defs}<circle cx="32" cy="32" r="32" fill="{fill}"/>' + render(SHAPE, 64 * SHARES[si] / 100, fg)


def glyph_svg(cid, gi):
    fill, defs = paint(GLYPHS[gi][1], f"{cid}-g")
    return defs + render(SHAPE, 54, fill)


def variant_svg(cid, key, in_circle):
    if key[0] == "c":
        return circle_svg(cid, int(key[1]), int(key[2]))
    return glyph_svg(cid, int(key[1]))


NUMBER = 4
TITLE = "Волна 4 · цвет и доля глифа"
PROMPT = ("Форма закреплена: 3 штриха, толщина 6, средний зазор. Теперь фирменный янтарь #ffa24c, доля глифа "
          "в круге и что идёт в иконку .exe. Сверху — сборка: иконка на светлой и тёмной панели задач и знак "
          "в шапке приложения.")
CHOSEN = ["янтарный круг", "доля 72 %", "глиф янтарь", "иконка без подложки"]

CARDS = [
    ("Финал формы", [
        {"code": "Круг", "name": "цвет подложки", "radio": True,
         "note": "Янтарный круг с тёмным глифом — как акцентная кнопка приложения. Тёмный круг — как окно.",
         "tiles": [(name, name, f"c{i}{BASE[1]}", True, i == BASE[0]) for i, (name, *_) in enumerate(CIRCLES)]},
        {"code": "Доля", "name": "глифа в круге", "radio": True,
         "note": "Рабочий диапазон 72–80 %: меньше — глиф тонет, больше — штрихи липнут к краю и Windows их подрезает.",
         "tiles": [(f"доля {s} %", f"{s} %", f"c{BASE[0]}{i}", True, i == BASE[1]) for i, s in enumerate(SHARES)]},
        {"code": "Глиф", "name": "без подложки", "radio": True,
         "note": "Для шапки окна и About (фон всегда тёмный). Янтарь на светлой панели задач — контраст 1,9:1.",
         "tiles": [(f"глиф {name}", name, f"g{i}", False, i == BASE[2]) for i, (name, _) in enumerate(GLYPHS)]},
        {"code": "Иконка", "name": "приложения .exe", "radio": True,
         "note": "Что ставим в иконку файла и панель задач. Знак в шапке — всегда глиф без подложки.",
         "tiles": [(f"иконка {ICONS[0]}", ICONS[0], f"c{BASE[0]}{BASE[1]}", True, True),
                   (f"иконка {ICONS[1]}", ICONS[1], f"g{BASE[2]}", False, False)]},
    ]),
]

SUMMARY = ("Моё мнение: янтарный круг, доля 72–78 %, глиф без подложки — чистый янтарь, в иконку .exe — круг. "
           "Янтарь без подложки на светлой панели задач почти пропадает, круг держит знак на любой теме Windows "
           "и роднит его с круглыми кнопками рейла. Тёмный круг на тёмной панели сливается с ней.")

CSS = """
.scenes{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.scene{border-radius:22px;overflow:hidden;display:grid;border:1px solid #2e2e33;background:#141416;color:#ececef}
.titlebar{display:flex;align-items:center;gap:8px;padding:0 16px 0 20px;height:48px;font-size:14px;font-weight:700;letter-spacing:-.01em}
.titlebar svg{filter:drop-shadow(0 0 6px rgb(255 162 76 / 45%))}
.titlebar .dots{margin-left:auto;display:flex;gap:18px;opacity:.55;letter-spacing:.1em;font-weight:400;font-size:12px}
.doc{margin:0 10px;height:84px;border-radius:14px 14px 0 0;background:#1c1c1f}
.taskbar{display:flex;justify-content:center;align-items:center;gap:6px;height:52px}
.scene.light .taskbar{background:#f3f3f3;border-top:1px solid #e2e2e2}
.scene.dark .taskbar{background:#202020;border-top:1px solid #2c2c2c}
.tb{width:40px;height:40px;border-radius:6px;display:grid;place-items:center;position:relative}
.tb i{display:block;width:24px;height:24px;border-radius:6px}
.scene.light .tb i{background:#c9ccd1}
.scene.dark .tb i{background:#4a4a4f}
.tb.on::after{content:"";position:absolute;bottom:2px;width:16px;height:3px;border-radius:2px}
.scene.light .tb.on{background:#fdfdfd}
.scene.dark .tb.on{background:#2d2d2d}
.scene.light .tb.on::after{background:#6b6b73}
.scene.dark .tb.on::after{background:#a2a2a9}
"""


def preview():
    symbols = []
    for ci, si in itertools.product(range(len(CIRCLES)), range(len(SHARES))):
        symbols.append(f'<symbol id="w4c{ci}{si}" viewBox="0 0 64 64">{circle_svg(f"w4c{ci}{si}", ci, si)}</symbol>')
    for gi in range(len(GLYPHS)):
        symbols.append(f'<symbol id="w4g{gi}" viewBox="0 0 64 64">{glyph_svg(f"w4g{gi}", gi)}</symbol>')

    def use(ref, size=None, cls=""):
        attrs = (f' width="{size}" height="{size}"' if size else "") + (f' class="{cls}"' if cls else "")
        return f'<svg viewBox="0 0 64 64"{attrs} aria-hidden="true"><use href="#{ref}"/></svg>'

    combos = []
    for ci, si, gi, ii in itertools.product(range(len(CIRCLES)), range(len(SHARES)), range(len(GLYPHS)), range(2)):
        icon = f"w4c{ci}{si}" if ii == 0 else f"w4g{gi}"
        glyph = f"w4g{gi}"
        sizes = "".join(f'<span class="size">{use(icon, px)}{px}</span>' for px in (48, 32, 24, 16))
        tiles = "".join(f'<div class="build-tile {t}">{use(icon, cls="big")}<span class="sizes">{sizes}</span></div>'
                        for t in ("light", "dark"))
        scenes = "".join(
            f'<div class="scene {t}"><div class="titlebar">{use(glyph, 16)}<span>Echo Studio</span>'
            f'<span class="dots">— ▢ ✕</span></div><div class="doc"></div>'
            f'<div class="taskbar"><span class="tb"><i></i></span><span class="tb"><i></i></span>'
            f'<span class="tb on">{use(icon, 24)}</span><span class="tb"><i></i></span></div></div>'
            for t in ("light", "dark"))
        hidden = "" if (ci, si, gi, ii) == BASE else " hidden"
        combos.append(f'<div class="build" data-combo="{ci}-{si}-{gi}-{ii}"{hidden}>'
                      f'<div class="build-row">{tiles}</div><div class="scenes">{scenes}</div></div>')
    sprite = f'<svg width="0" height="0" style="position:absolute" aria-hidden="true">{"".join(symbols)}</svg>'
    return f'<div class="build"><h3>Сборка</h3>{sprite}{"".join(combos)}</div>'
