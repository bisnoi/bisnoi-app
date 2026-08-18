#!/usr/bin/env python3
"""
patch_map_autolocate.py

frontend/src/components/GoogleMapPicker.tsx

Right after the Google Map object is created inside __initPicker, this adds
an automatic navigator.geolocation.getCurrentPosition() call that re-centers
the map on the device's real location and re-runs reverse geocoding — no
button tap required. If permission is denied or geolocation fails, the map
silently stays on whatever center was passed in (unchanged behaviour).

This one file is shared by the customer address picker, owner registration,
and rider registration screens, so the fix applies everywhere at once.

Usage:
    cd ~/original_version
    python3 patch_map_autolocate.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "frontend" / "src" / "components" / "GoogleMapPicker.tsx"


def apply_patch(path: Path, old: str, new: str, label: str) -> bool:
    if not path.exists():
        print(f"[SKIP] {label}: file not found at {path}")
        return False
    text = path.read_text(encoding="utf-8")

    if new.strip() and new in text:
        print(f"[OK]   {label}: already patched, nothing to do")
        return True

    count = text.count(old)
    if count == 0:
        print(f"[FAIL] {label}: could not find the expected original code.")
        print("       No changes made to this file.")
        return False
    if count > 1:
        print(f"[FAIL] {label}: found {count} matches, expected exactly 1 — refusing to guess.")
        print("       No changes made to this file.")
        return False

    backup = path.with_suffix(path.suffix + ".bak")
    if not backup.exists():
        backup.write_text(text, encoding="utf-8")
        print(f"       backup written: {backup}")

    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"[DONE] {label}: patched {path}")
    return True


OLD = '''  window.__initPicker=function(){
    geocoder=new google.maps.Geocoder();
    map=new google.maps.Map(document.getElementById('map'),{
      center:{lat:INIT_LAT,lng:INIT_LNG}, zoom:16, disableDefaultUI:true, gestureHandling:'greedy',
      clickableIcons:false, zoomControl:true
    });
    // Report whenever the map stops moving (center pin = chosen point)
    map.addListener('idle', function(){'''

NEW = '''  window.__initPicker=function(){
    geocoder=new google.maps.Geocoder();
    map=new google.maps.Map(document.getElementById('map'),{
      center:{lat:INIT_LAT,lng:INIT_LNG}, zoom:16, disableDefaultUI:true, gestureHandling:'greedy',
      clickableIcons:false, zoomControl:true
    });

    // Auto-center on the device's real location the moment the map loads,
    // instead of sitting on the hardcoded default until the user taps
    // "Use current location" themselves. Silently keeps the default center
    // if permission is denied / location is unavailable.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(pos){
        map.setCenter({lat: pos.coords.latitude, lng: pos.coords.longitude});
        map.setZoom(17);
      }, function(){ /* denied/failed -> keep default center */ }, { enableHighAccuracy:true, timeout:8000 });
    }

    // Report whenever the map stops moving (center pin = chosen point)
    map.addListener('idle', function(){'''


def main() -> int:
    ok = apply_patch(TARGET, OLD, NEW, "auto-locate on map load")
    print()
    if ok:
        print("Patch applied (or already present). Redeploy frontend and test on all three flows:")
        print("  - customer delivery address picker")
        print("  - owner registration")
        print("  - rider registration")
        return 0
    print("Patch did NOT apply — see [FAIL]/[SKIP] above. Nothing was written.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
