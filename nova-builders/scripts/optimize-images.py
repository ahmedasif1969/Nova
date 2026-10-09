"""Generate responsive WebP assets from the preserved PNG originals.

Requires Pillow with WebP support: python -m pip install Pillow
Run from any directory: python nova-builders/scripts/optimize-images.py
"""

from pathlib import Path
from PIL import Image

assets = Path(__file__).resolve().parents[1] / "dist" / "assets"

for name in ("aurelian", "vela", "meridian"):
    original = assets / f"{name}.png"
    with Image.open(original) as source:
        image = source.convert("RGB")
        for width in (640, 960, 1536):
            height = round(image.height * width / image.width)
            output = assets / f"{name}-{width}.webp"
            image.resize((width, height), Image.Resampling.LANCZOS).save(
                output, "WEBP", quality=78, method=6
            )
            print(f"{output.name}: {output.stat().st_size:,} bytes")
