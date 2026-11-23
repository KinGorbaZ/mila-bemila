# Draws the app icon: a bone tile with the letter mem on the sea-green board.
import os
from PIL import Image, ImageDraw, ImageFont

out = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(out, exist_ok=True)
SEA, BONE, EDGE, INK, SAFFRON = '#12414a', '#f6ecd3', '#cdbb8e', '#17262e', '#f2b134'


def icon(size, pad):
    s = size * 4  # supersample
    img = Image.new('RGB', (s, s), SEA)
    d = ImageDraw.Draw(img)
    m = int(s * pad)
    r = int((s - 2 * m) * 0.16)
    d.rounded_rectangle([m, m + int(s * 0.03), s - m, s - m + int(s * 0.03)], r, fill=EDGE)
    d.rounded_rectangle([m, m, s - m, s - m], r, fill=BONE)
    font = ImageFont.truetype('C:/Windows/Fonts/frank.ttf', int((s - 2 * m) * 0.78))
    d.text((s / 2, s / 2 - (s - 2 * m) * 0.03), 'מ', font=font, fill=INK, anchor='mm')
    star = int((s - 2 * m) * 0.09)
    cx, cy = s - m - star * 2, s - m - star * 2
    d.ellipse([cx - star, cy - star, cx + star, cy + star], fill=SAFFRON)
    return img.resize((size, size), Image.LANCZOS)


icon(192, 0.12).save(os.path.join(out, 'icon-192.png'))
icon(512, 0.12).save(os.path.join(out, 'icon-512.png'))
icon(512, 0.22).save(os.path.join(out, 'icon-maskable-512.png'))
print('icons written')
