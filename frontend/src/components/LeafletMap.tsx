import React, { useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { colors, radius } from "@/src/theme";

export type MarkerInput = {
  lat: number;
  lng: number;
  label?: string;
  color?: string; // hex without #
  icon?: "rider" | "home" | "shop" | "restaurant";
  /**
   * Stable key for this marker across rerenders. Required to enable smooth
   * live interpolation (otherwise we re-create the marker every update).
   */
  key?: string;
};

/**
 * LeafletMap built once via WebView HTML, then mutated in-place via
 * `injectJavaScript` so subsequent marker updates (e.g. rider location
 * polling) animate smoothly instead of re-rendering the entire map.
 */
export function LeafletMap({
  markers,
  height = 240,
  showPath = true,
}: { markers: MarkerInput[]; height?: number; showPath?: boolean }) {
  const webRef = useRef<WebView>(null);

  // Build HTML only once based on first render; the live update path takes
  // over for all subsequent prop changes. The dependencies are deliberately
  // empty so the WebView never reloads.
  const html = useMemo(() => {
    return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#FDFBF7}
.tag{background:#fff;border:1px solid #E0D9CB;border-radius:10px;padding:4px 8px;font:600 11px/1 -apple-system,Roboto,Arial;color:#2D2323;box-shadow:0 2px 6px rgba(0,0,0,0.1);white-space:nowrap}
.pin{width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.25);font-size:18px;transition:transform .35s ease}
.pin span{transform:rotate(45deg);color:#fff}
.pin.rider{animation:pulse 1.6s infinite}
.leaflet-marker-icon{transition:transform .9s linear !important}
@keyframes pulse{0%,100%{box-shadow:0 3px 10px rgba(0,0,0,0.25),0 0 0 0 rgba(217,72,56,0.5)}50%{box-shadow:0 3px 10px rgba(0,0,0,0.25),0 0 0 12px rgba(217,72,56,0)}}
</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  var map = L.map('map', { zoomControl:false, attributionControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false, touchZoom:false }).setView([0, 0], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  var EMOJI = { rider:'\uD83D\uDEF5', home:'\uD83C\uDFE0', shop:'\uD83C\uDF74', restaurant:'\uD83C\uDF74' };

  var markers = {};   // key -> L.marker
  var line = null;

  function makeIcon(m){
    var color = '#' + (m.color || 'D94838');
    var em = EMOJI[m.icon||'home'] || '\uD83D\uDCCD';
    var cls = (m.icon||'') === 'rider' ? 'pin rider' : 'pin';
    return L.divIcon({ className:'', html:'<div class="'+cls+'" style="background:'+color+'"><span>'+em+'</span></div>', iconSize:[34,40], iconAnchor:[17,40] });
  }

  window.applyMarkers = function(input, showPath){
    var incomingKeys = {};
    var coords = [];
    input.forEach(function(m){
      var key = m.key || (m.icon + '_' + m.lat.toFixed(4) + '_' + m.lng.toFixed(4));
      incomingKeys[key] = true;
      coords.push([m.lat, m.lng]);
      if (markers[key]){
        // Smooth move
        markers[key].setLatLng([m.lat, m.lng]);
        if (m.label && markers[key].getTooltip()){
          markers[key].setTooltipContent(m.label);
        }
      } else {
        var mk = L.marker([m.lat, m.lng], { icon: makeIcon(m) }).addTo(map);
        if (m.label){ mk.bindTooltip(m.label, { permanent:true, direction:'top', offset:[0,-32], className:'tag' }); }
        markers[key] = mk;
      }
    });
    // Remove markers no longer present
    Object.keys(markers).forEach(function(k){
      if (!incomingKeys[k]){ map.removeLayer(markers[k]); delete markers[k]; }
    });
    // Path polyline
    if (line){ map.removeLayer(line); line = null; }
    if (showPath && coords.length >= 2){
      line = L.polyline(coords, { color:'#D94838', weight:4, opacity:0.7, dashArray:'8,8' }).addTo(map);
    }
    if (coords.length >= 2){
      try { map.fitBounds(coords, { padding:[40,40], maxZoom:16, animate:true, duration:0.5 }); } catch(e){}
    } else if (coords.length === 1){
      map.setView(coords[0], 15, { animate:true });
    }
  };

  // Signal ready so RN can push the first batch
  function ready(){
    if (window.ReactNativeWebView){ window.ReactNativeWebView.postMessage('ready'); }
  }
  if (document.readyState === 'complete'){ ready(); } else { window.addEventListener('load', ready); }
})();
</script>
</body></html>`;
  }, []);

  // Push markers whenever props change
  useEffect(() => {
    const payload = JSON.stringify(markers);
    const js = `window.applyMarkers && window.applyMarkers(${payload}, ${showPath ? "true" : "false"}); true;`;
    if (Platform.OS === "web") {
      const iframe = document.getElementById("leaflet-iframe") as HTMLIFrameElement | null;
      try {
        (iframe?.contentWindow as any)?.applyMarkers?.(markers, showPath);
      } catch {}
    } else {
      webRef.current?.injectJavaScript(js);
    }
  }, [markers, showPath]);

  return (
    <View style={[styles.wrap, { height }]}>
      {Platform.OS === "web" ? (
        // @ts-ignore - web-only DOM element
        <iframe
          id="leaflet-iframe"
          srcDoc={html}
          sandbox="allow-scripts allow-same-origin"
          onLoad={() => {
            const iframe = document.getElementById("leaflet-iframe") as HTMLIFrameElement | null;
            try {
              (iframe?.contentWindow as any)?.applyMarkers?.(markers, showPath);
            } catch {}
          }}
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            backgroundColor: colors.background,
            borderRadius: radius.lg,
          }}
        />
      ) : (
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          style={{ backgroundColor: colors.background, borderRadius: radius.lg }}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          onMessage={(e) => {
            if (e.nativeEvent.data === "ready") {
              const payload = JSON.stringify(markers);
              webRef.current?.injectJavaScript(
                `window.applyMarkers && window.applyMarkers(${payload}, ${showPath ? "true" : "false"}); true;`,
              );
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
});
