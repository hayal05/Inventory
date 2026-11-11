"""Regenerates the app icons in client/public/icons (needs Pillow: pip install pillow).
Run from the repo root:  python3 client/scripts/make-icons.py
Colours mirror the tokens in src/theme.css (--bg, --accent-cyan, --accent-magenta)."""
import math
from pathlib import Path
from PIL import Image, ImageDraw

BG = (7, 13, 36)          # --bg
CYAN = (34, 195, 255)     # --accent-cyan (top face)
MAGENTA = (214, 60, 255)  # --accent-magenta (left face)
MAGENTA_DARK = (140, 40, 175)  # right face, in shadow
OUT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
SS = 4  # draw at 4x and shrink for smooth edges


def icon(size, rounded):
    n = size * SS
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:  # "any" icons: rounded square on a transparent canvas
        d.rounded_rectangle((0, 0, n - 1, n - 1), radius=int(n * 0.22), fill=BG)
    else:        # maskable / Apple icons: full-bleed, the OS applies its own shape
        d.rectangle((0, 0, n, n), fill=BG)
    # An isometric box, centred. Its farthest corner is 0.30 x size from the centre, inside the 0.4 x size
    # safe circle that maskable icons guarantee.
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
    ('icon-192.png', 192, True),
    ('icon-512.png', 512, True),
    ('maskable-512.png', 512, False),
    ('apple-touch-icon.png', 180, False),
    ('favicon-32.png', 32, True),
]:
    icon(size, rounded).save(OUT / name, optimize=True)
    print('wrote', name)
