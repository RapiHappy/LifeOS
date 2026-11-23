import math
from PIL import Image, ImageDraw

def create_icon(size, output_path):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background with smooth gradient
    pad = int(size * 0.06)
    radius = int(size * 0.22)
    
    # Base gradient: Indigo #4f46e5 to Sky #0284c7
    for y in range(pad, size - pad):
        factor = (y - pad) / max(1, (size - 2 * pad))
        r = int(79 + (14 - 79) * factor)
        g = int(70 + (165 - 70) * factor)
        b = int(229 + (233 - 229) * factor)
        draw.line([(pad, y), (size - pad, y)], fill=(r, g, b, 255))

    # Mask to rounded rectangle
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=255)
    
    base = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    base.paste(img, (0, 0), mask)
    draw = ImageDraw.Draw(base)

    # Central Symbol: Stylized geometric "L" + spark/star + clock circle
    cx, cy = size // 2, size // 2
    r_outer = int(size * 0.26)
    
    # Outer white ring
    draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], outline=(255, 255, 255, 220), width=max(2, int(size * 0.035)))
    
    # Hour/minute hands forming dynamic checkmark/spark
    hand_w = max(2, int(size * 0.04))
    # Clock hands: center to 2 o'clock and center to 6 o'clock
    draw.line([cx, cy, cx, int(cy - r_outer * 0.55)], fill=(255, 255, 255, 255), width=hand_w)
    draw.line([cx, cy, int(cx + r_outer * 0.6), cy], fill=(255, 255, 255, 255), width=hand_w)
    draw.ellipse([cx - hand_w, cy - hand_w, cx + hand_w, cy + hand_w], fill=(255, 255, 255, 255))
    
    # Small glowing star/accent top-right
    sx, sy = int(cx + r_outer * 0.8), int(cy - r_outer * 0.8)
    star_r = int(size * 0.06)
    draw.ellipse([sx - star_r, sy - star_r, sx + star_r, sy + star_r], fill=(245, 158, 11, 240))

    base.save(output_path, 'PNG')

create_icon(192, 'assets/icons/icon-192.png')
create_icon(512, 'assets/icons/icon-512.png')
create_icon(64, 'assets/icons/favicon.png')
print("Icons created successfully")
