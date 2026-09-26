import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "brand/logo"
ICONS = ROOT / "src-tauri/icons"
INKSCAPE = Path(r"C:\Program Files\Inkscape\bin\inkscape.com")

SMALL_MAX = 32
ICO_SIZES = [24, 30, 32, 36, 40, 48, 60, 64, 72, 96, 128, 256]
ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]

PNG_TARGETS = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 512,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

def source_for(size):
    return LOGO / ("mark-small.svg" if size <= SMALL_MAX else "mark.svg")


def render(size, out):
    subprocess.run([str(INKSCAPE), str(source_for(size)),
                    f"--actions=export-filename:{out};export-width:{size};export-height:{size};export-do"],
                   check=True, capture_output=True, timeout=180)


def frames(sizes, tmp):
    result = []
    for size in sizes:
        path = tmp / f"{size}.png"
        if not path.exists():
            render(size, path)
        result.append(Image.open(path).convert("RGBA"))
    return result


def main():
    if not INKSCAPE.exists():
        sys.exit(f"Inkscape не найден: {INKSCAPE}")
    for name, size in PNG_TARGETS.items():
        render(size, ICONS / name)

    tmp = ICONS / "_frames"
    tmp.mkdir(exist_ok=True)
    ico = frames(ICO_SIZES, tmp)
    ico[-1].save(ICONS / "icon.ico", format="ICO", sizes=[(s, s) for s in ICO_SIZES], append_images=ico[:-1])
    icns = frames(ICNS_SIZES, tmp)
    icns[-1].save(ICONS / "icon.icns", format="ICNS", append_images=icns[:-1])
    for image in ico + icns:
        image.close()
    for path in tmp.glob("*.png"):
        path.unlink()
    tmp.rmdir()
    print(f"PNG: {len(PNG_TARGETS)}, ICO: {len(ICO_SIZES)}, ICNS: {len(ICNS_SIZES)} -> {ICONS}")


if __name__ == "__main__":
    main()
