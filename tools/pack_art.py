"""Optimize raw artwork in art/raw/ into small, crisp WebP files in art/ and generate js/art.js."""
import os
import json
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "art" / "raw"
OUT_DIR = ROOT / "art"
MANIFEST_JS = ROOT / "js" / "art.js"

CARD_SIZE = (448, 320)
LEADER_SIZE = (320, 320)
QUALITY = 82


def process_one(src: Path, dst: Path) -> tuple[int, int]:
    is_leader = src.stem.startswith("leader_")
    target = LEADER_SIZE if is_leader else CARD_SIZE
    with Image.open(src) as im:
        im = im.convert("RGB")
        # For portraits, bias crop slightly upward (centering=(0.5, 0.35)) to keep faces framed cleanly.
        centering = (0.5, 0.32) if is_leader else (0.5, 0.5)
        fitted = ImageOps.fit(im, target, method=Image.Resampling.LANCZOS, centering=centering)
        fitted = fitted.filter(ImageFilter.UnsharpMask(radius=0.8, percent=55, threshold=2))
        fitted.save(dst, "WEBP", quality=QUALITY, method=6)
    return src.stat().st_size, dst.stat().st_size


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    exts = {".png", ".jpg", ".jpeg", ".webp"}
    raw_files = sorted(p for p in RAW_DIR.iterdir() if p.is_file() and p.suffix.lower() in exts)

    for src in raw_files:
        dst = OUT_DIR / f"{src.stem}.webp"
        if not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime:
            orig_b, out_b = process_one(src, dst)
            print(f"Packed {src.stem}.webp: {orig_b/1024:.0f} KB -> {out_b/1024:.1f} KB")

    ready = sorted(p.stem for p in OUT_DIR.glob("*.webp"))
    manifest = {stem: 1 for stem in ready}
    js = (
        "/* TAU CETI — generated artwork manifest (run tools/pack_art.py after adding art/raw/*). */\n"
        "(function (root) {\n"
        "  'use strict';\n"
        "  const V = (root.TauCeti = root.TauCeti || {});\n"
        f"  V.ART = {json.dumps(manifest)};\n"
        "})(typeof globalThis !== 'undefined' ? globalThis : this);\n"
    )
    MANIFEST_JS.write_text(js, encoding="utf-8")
    total_kb = sum((OUT_DIR / f"{s}.webp").stat().st_size for s in ready) / 1024
    print(f"Manifest written: {len(ready)} artworks ({total_kb:.1f} KB total)")


if __name__ == "__main__":
    main()
