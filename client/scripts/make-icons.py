"""Regenerates app icons (requires Pillow: pip install pillow)."""
import math
from pathlib import Path
from PIL import Image, ImageDraw

BG = (7, 13, 36)
CYAN = (34, 195, 255)
MAGENTA = (214, 60, 255)
MAGENTA_DARK = (140, 40, 175)
OUT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
SS = 4

def icon(size, rounded):
    n = size * SS
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle((0, 0, n - 1, n - 1), radius=int(n * 0.22), fill=BG)
    else:
        d.rectangle((0, 0, n, n), fill=BG)
    s = 0.30 * n
    cx = cy = n / 2
    w = math.sqrt(3) / 2 * s
    top = [(cx, cy - s), (cx + w, cy - s / 2), (cx, cy), (cx - w, cy - s / 2)]
    left = [(cx - w, cy - s / 2), (cx, cy), (cx, cy + s), (cx - w, cy + s / 2)]
    right = [(cx, cy), (cx + w, cy - s / 2), (cx + w, cy + s / 2), (cx, cy + s)]
    d.polygon(left, fill=MAGENTA)
    d.polygon(right, fill=MAGENTA_DARK)
    d.polygon(top, fill=CYAN)
    return img.resize((size, size), Image.LANCZOS)

OUT.mkdir(parents=True, exist_ok=True)
for name, size, rounded in [
    ('icon-192.png', 192, True), ('icon-512.png', 512, True),
    ('maskable-512.png', 512, False), ('apple-touch-icon.png', 180, False),
    ('favicon-32.png', 32, True),
]:
    icon(size, rounded).save(OUT / name, optimize=True)
    print('wrote', name)
