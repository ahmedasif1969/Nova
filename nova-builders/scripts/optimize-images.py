"""Generate separate fast hero and high-detail project WebP assets.

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
        # The first-screen hero remains lightweight. Below-fold imagery uses
        # separate quality-95 files, always re-encoded from the original PNGs.
        variants = [(f"{name}-detail", 95)]
        if name == "aurelian":
            variants.append((name, 78))
        for prefix, quality in variants:
            for width in (640, 960, 1536):
                height = round(image.height * width / image.width)
                output = assets / f"{prefix}-{width}.webp"
                image.resize((width, height), Image.Resampling.LANCZOS).save(
                    output, "WEBP", quality=quality, method=6
                )
                print(f"{output.name}: {output.stat().st_size:,} bytes (quality {quality})")
