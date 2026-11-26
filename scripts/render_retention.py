#!/usr/bin/env python3
"""Render a synthetic IG-style retention screenshot for the example pipeline."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Same example curve as src/lib/retention.ts (not real analytics).
POINTS = [
    (0, 100),
    (1, 88),
    (3, 62),
    (4.2, 59),
    (8.4, 56),
    (12.6, 46),
    (16.8, 36),
    (21, 34),
    (25.2, 32),
    (29.4, 31),
    (31.5, 29),
    (33.6, 15),
    (37.8, 13),
    (42, 11),
]
DURATION = 42.0

W, H = 780, 390
LEFT, TOP, RIGHT, BOTTOM = 88, 58, 742, 342


def xy(t: float, p: float) -> tuple[int, int]:
    x = LEFT + (t / DURATION) * (RIGHT - LEFT)
    y = BOTTOM - (p / 100.0) * (BOTTOM - TOP)
    return int(round(x)), int(round(y))


def main() -> None:
    img = Image.new("RGB", (W, H), "#121212")
    draw = ImageDraw.Draw(img, "RGBA")
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
        small = font

    draw.text((24, 16), "Retention", fill="#F5F5F1", font=font)

    for pct in (0, 25, 50, 75, 100):
        y = BOTTOM - (pct / 100.0) * (BOTTOM - TOP)
        draw.line([(LEFT, y), (RIGHT, y)], fill=(255, 255, 255, 22), width=1)
        label = f"{pct}%"
        draw.text((18, y - 7), label, fill="#8A8A84", font=small)

    poly = [xy(t, p) for t, p in POINTS]
    fill = poly + [xy(DURATION, 0), xy(0, 0)]
    draw.polygon(fill, fill=(91, 159, 255, 38))
    draw.line(poly, fill="#5B9FFF", width=3)

    out = Path(__file__).resolve().parents[1] / "public" / "assets" / "example-retention.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG")
    print(out, img.size)


if __name__ == "__main__":
    main()
