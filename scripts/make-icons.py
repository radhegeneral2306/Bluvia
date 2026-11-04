"""Builds the app icons from public/logo.jpg (the original logo, never edited).
The logo is placed on a square canvas of the logo's own background colour, so the logo pixels stay untouched
(512px icons use the logo at 1:1 pixel size; smaller icons are only scaled down, never stretched).
Run:  python3 scripts/make-icons.py
"""
from PIL import Image
from collections import Counter

logo = Image.open('public/logo.jpg').convert('RGB')
w, h = logo.size
edge = Counter([logo.getpixel((x, 0)) for x in range(w)] + [logo.getpixel((x, h - 1)) for x in range(w)]
               + [logo.getpixel((0, y)) for y in range(h)] + [logo.getpixel((w - 1, y)) for y in range(h)])
bg = edge.most_common(1)[0][0]
print('background colour', bg)

def make(size, out):
    canvas = Image.new('RGB', (size, size), bg)
    scale = size / 512
    lw, lh = round(w * scale), round(h * scale)
    l = logo if scale == 1 else logo.resize((lw, lh), Image.LANCZOS)
    canvas.paste(l, ((size - lw) // 2, (size - lh) // 2))
    canvas.save(out, 'PNG', optimize=True)

make(512, 'public/icons/icon-512.png')
make(512, 'public/icons/maskable-512.png')   # logo (364px) sits well inside the 80% maskable safe zone
make(192, 'public/icons/icon-192.png')
make(180, 'public/icons/apple-touch-icon.png')
make(64, 'public/favicon.png')
