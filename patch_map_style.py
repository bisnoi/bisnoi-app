#!/usr/bin/env python3
"""
patch_map_style.py

frontend/src/components/GoogleMapView.tsx

1. gestureHandling was "none" for non-interactive maps, which makes Google
   Maps hide zoom controls entirely (that's how the API works — 'none' means
   no controls at all). Switched to "cooperative": zoom buttons + pinch/
   scroll-zoom work, one-finger drag still won't hijack page scroll.

2. Replaced the hardcoded dark theme with a clean light style closer to
   stock Google Maps (white roads, light water, visible labels) — plus real
   zoomControl:true so the +/- buttons actually render.

3. Added dedupeOverlaps(): when two markers sit almost on top of each other
   (e.g. restaurant + drop address very close together) their pins/labels
   get nudged apart so labels don't collide, like in the "Drop"/restaurant
   overlap you saw.

4. Optional 3D tilt: if EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID is set, the map uses
   that Map ID + tilt:45 for the tilted 3D-building look. Google Maps JS
   cannot render 3D buildings without a Map ID created with Vector
   rendering enabled — that part must be done once in Google Cloud Console
   (Maps → Map Management → Create Map ID → renderer: Vector, then turn on
   "3D buildings" in that map style). Without it the map still works, just
   flat with the new light style — this patch alone can't fake 3D.

Usage:
    cd ~/original_version
    python3 patch_map_style.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "frontend" / "src" / "components" / "GoogleMapView.tsx"


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
        print("       No changes made to this file for this step.")
        return False
    if count > 1:
        print(f"[FAIL] {label}: found {count} matches, expected exactly 1 — refusing to guess.")
        print("       No changes made to this file for this step.")
        return False

    backup = path.with_suffix(path.suffix + ".bak")
    if not backup.exists():
        backup.write_text(text, encoding="utf-8")
        print(f"       backup written: {backup}")

    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"[DONE] {label}: patched {path}")
    return True


# ---------------------------------------------------------------------------
# 1. constants — add MAP_ID + LIGHT_MAP_STYLE
# ---------------------------------------------------------------------------

CONST_OLD = '''const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export type MarkerInput = {'''

CONST_NEW = '''const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
// Optional: set this to a Map ID created in Google Cloud Console -> Maps ->
// Map Management (renderer: Vector, with "3D buildings" turned on in that
// map's style) to get the tilted 3D-building look. Without it the map
// falls back to a clean flat style -- Maps JS cannot render 3D buildings
// without a Map ID, that part has to be set up once in the console.
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || "";
const LIGHT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#eef2f0" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5b6b63" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9e3ea" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d7dfe0" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export type MarkerInput = {'''


# ---------------------------------------------------------------------------
# 2. page background — lighten to match the new style
# ---------------------------------------------------------------------------

BG_OLD = "html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#0B0F0C}"
BG_NEW = "html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#eef2f0}"

AUTHFAIL_OLD = '''if(el){ el.innerHTML='<div style="display:flex;height:100%;width:100%;align-items:center;justify-content:center;text-align:center;padding:16px;color:#cfd8d2;font:600 12px/1.4 -apple-system,Roboto,Arial;background:#0B0F0C">Map couldn\\\\'t load.<br/>Allow <b>Maps JavaScript API</b> on the Google API key<br/>(Cloud Console \u2192 Credentials \u2192 API restrictions).</div>'; }'''
AUTHFAIL_NEW = '''if(el){ el.innerHTML='<div style="display:flex;height:100%;width:100%;align-items:center;justify-content:center;text-align:center;padding:16px;color:#5b6b63;font:600 12px/1.4 -apple-system,Roboto,Arial;background:#eef2f0">Map couldn\\\\'t load.<br/>Allow <b>Maps JavaScript API</b> on the Google API key<br/>(Cloud Console \u2192 Credentials \u2192 API restrictions).</div>'; }'''


# ---------------------------------------------------------------------------
# 3. gesture handling — "none" hides zoom controls entirely; use
#    "cooperative" instead so zoom buttons/pinch/scroll-zoom actually work
# ---------------------------------------------------------------------------

GESTURE_OLD = '''  const html = useMemo(() => {
    const gesture = interactive ? "greedy" : "none";
    return `<!DOCTYPE html>'''

GESTURE_NEW = '''  const html = useMemo(() => {
    const gesture = interactive ? "greedy" : "cooperative";
    const mapExtraJS = MAP_ID
      ? `mapOpts.mapId = ${JSON.stringify(MAP_ID)}; mapOpts.tilt = 45;`
      : `mapOpts.styles = ${JSON.stringify(LIGHT_MAP_STYLE)};`;
    return `<!DOCTYPE html>'''


# ---------------------------------------------------------------------------
# 4. dedupe overlapping markers
# ---------------------------------------------------------------------------

DEDUPE_OLD = '''  window.applyMarkers = function(input, showPath){
    if(!map){ pending = {input:input, showPath:showPath}; return; }
    var keys={}, coords=[];'''

DEDUPE_NEW = '''  function dedupeOverlaps(list){
    // Nudge markers that sit almost exactly on top of each other (e.g. the
    // restaurant and the drop address very close together) so their pins
    // and labels don't visually collide.
    var THRESH = 0.00035; // ~35m
    for (var i=0;i<list.length;i++){
      for (var j=0;j<i;j++){
        var dLat = Math.abs(list[i].lat - list[j].lat);
        var dLng = Math.abs(list[i].lng - list[j].lng);
        if (dLat < THRESH && dLng < THRESH){
          list[i] = Object.assign({}, list[i], { lat: list[i].lat + THRESH*1.6, lng: list[i].lng + THRESH*1.6 });
        }
      }
    }
    return list;
  }

  window.applyMarkers = function(input, showPath){
    if(!map){ pending = {input:input, showPath:showPath}; return; }
    input = dedupeOverlaps(input.slice());
    var keys={}, coords=[];'''


# ---------------------------------------------------------------------------
# 5. map init — real zoom control + light style / optional 3D tilt
# ---------------------------------------------------------------------------

INIT_OLD = '''  window.__initGMap = function(){
    map=new google.maps.Map(document.getElementById('map'),{
      center:{lat:12.9716,lng:77.5946}, zoom:14, disableDefaultUI:true, gestureHandling:'${gesture}',
      clickableIcons:false, keyboardShortcuts:false,
      styles:[{elementType:'geometry',stylers:[{color:'#1d2b22'}]},{elementType:'labels.text.fill',stylers:[{color:'#9fb8a8'}]},{elementType:'labels.text.stroke',stylers:[{color:'#0b0f0c'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#16313f'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#33433a'}]},{featureType:'poi',stylers:[{visibility:'off'}]},{featureType:'transit',stylers:[{visibility:'off'}]}]
    });
    if(pending){ window.applyMarkers(pending.input, pending.showPath); pending=null; }
  };'''

INIT_NEW = '''  window.__initGMap = function(){
    var mapOpts = {
      center:{lat:12.9716,lng:77.5946}, zoom:14, gestureHandling:'${gesture}',
      clickableIcons:false, keyboardShortcuts:false,
      disableDefaultUI:true, zoomControl:true
    };
    ${mapExtraJS}
    map=new google.maps.Map(document.getElementById('map'), mapOpts);
    if(pending){ window.applyMarkers(pending.input, pending.showPath); pending=null; }
  };'''


def main() -> int:
    results = [
        apply_patch(TARGET, CONST_OLD, CONST_NEW, "add MAP_ID + LIGHT_MAP_STYLE constants"),
        apply_patch(TARGET, BG_OLD, BG_NEW, "lighten page background"),
        apply_patch(TARGET, AUTHFAIL_OLD, AUTHFAIL_NEW, "lighten auth-failure fallback"),
        apply_patch(TARGET, GESTURE_OLD, GESTURE_NEW, "fix gesture handling + map-id/style JS"),
        apply_patch(TARGET, DEDUPE_OLD, DEDUPE_NEW, "dedupe overlapping markers"),
        apply_patch(TARGET, INIT_OLD, INIT_NEW, "zoom control + light style / 3D tilt"),
    ]

    print()
    if all(results):
        print("All 6 steps applied (or already present). Redeploy frontend and test the tracking screen.")
        print()
        print("For real 3D tilt: create a Map ID in Google Cloud Console (Maps -> Map")
        print("Management -> Create Map ID, renderer = Vector, enable 3D buildings in its")
        print("style), then set EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID to that ID and redeploy.")
        return 0
    print("One or more steps did NOT apply — see [FAIL]/[SKIP] above.")
    print("Steps that succeeded were still written; only failed steps were skipped.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
