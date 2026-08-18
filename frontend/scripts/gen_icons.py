"""Regenerate all web/PWA icons from the real Bisnoi logo (assets/images/logo-mark.png).
Run from /app/frontend:  python3 scripts/gen_icons.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "images", "logo-mark.png")
ICONS = os.path.join(ROOT, "public", "icons")
ASSETS = os.path.join(ROOT, "assets", "images")

GREEN = (40, 121, 57, 255)  # #287939 — the logo's exact brand green (fills corners for masked icons)

logo = Image.open(SRC).convert("RGBA")


def resized(size):
    """Transparent-corner logo resized (best for favicons & 'any' PWA icons)."""
    return logo.resize((size, size), Image.LANCZOS)


def on_green(size, scale=1.0):
    """Logo composited on a full-bleed brand-green square (iOS / maskable friendly)."""
    canvas = Image.new("RGBA", (size, size), GREEN)
    inner = int(size * scale)
    lg = logo.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.alpha_composite(lg, (off, off))
    return canvas


# --- PWA icons ---
resized(192).save(os.path.join(ICONS, "icon-192.png"))
resized(512).save(os.path.join(ICONS, "icon-512.png"))
on_green(180).save(os.path.join(ICONS, "apple-touch-icon.png"))       # iOS home screen (no transparency)
on_green(512, scale=0.80).save(os.path.join(ICONS, "maskable-512.png"))  # Android maskable safe-zone

# --- Browser-tab favicon.ico (multi-size) in public/icons ---
resized(256).save(os.path.join(ICONS, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])

# --- Expo web favicon source (app.json web.favicon -> dist/favicon.ico on build) ---
resized(256).save(os.path.join(ASSETS, "favicon.png"))

# --- Native app icon + adaptive icon (bonus: keeps mobile builds on-brand) ---
resized(512).save(os.path.join(ASSETS, "icon.png"))
on_green(512, scale=0.82).save(os.path.join(ASSETS, "adaptive-icon.png"))

print("Icons regenerated from logo-mark.png:")
for f in ["icon-192.png", "icon-512.png", "apple-touch-icon.png", "maskable-512.png", "favicon.ico"]:
    print("  public/icons/" + f)
print("  assets/images/favicon.png, icon.png, adaptive-icon.png")
