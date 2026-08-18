import React, { useMemo, useRef } from "react";
import { View, StyleSheet, Text, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { colors, radius, font } from "@/src/theme";

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
export type MapRestaurant = {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  cuisine?: string;
  rating?: number;
};

/**
 * Read-only mini-map used inside the rider Available screen. Drops a green pin
 * at each nearby restaurant (only those with lat/lng) and centres on the rider's
 * cached location when available.
 *
 * We reuse the WebView-embed pattern from GoogleMapPicker so the same Google
 * Maps JS key + Places libraries are loaded once by the app.
 */
export function NearbyRestaurantsMap({
  center,
  restaurants,
  height = 220,
}: {
  center?: { lat: number; lng: number } | null;
  restaurants: MapRestaurant[];
  height?: number;
}) {
  const webRef = useRef<WebView>(null);
  const c = center || { lat: 0, lng: 0 }; // Bengaluru fallback

  const pins = useMemo(
    () =>
      restaurants
        .filter((r) => typeof r.lat === "number" && typeof r.lng === "number")
        .map((r) => ({
          id: r.id,
          name: r.name,
          lat: Number(r.lat),
          lng: Number(r.lng),
          rating: r.rating || 0,
          cuisine: r.cuisine || "",
        })),
    [restaurants],
  );

  const html = useMemo(
    () => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
html,body{margin:0;padding:0;height:100%;width:100%;background:#f1f5f9}
#map{position:absolute;inset:0}
#riderPin{position:absolute;z-index:6;pointer-events:none;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}
#riderPin .dot{position:absolute;left:50%;bottom:-3px;transform:translateX(-50%);width:8px;height:8px;background:rgba(0,0,0,.25);border-radius:50%}
.gm-style .info-card{font-family:-apple-system,Roboto,Arial;padding:6px 8px}
.gm-style .info-card b{display:block;font-size:13px;color:#111;margin-bottom:2px}
.gm-style .info-card small{font-size:11px;color:#555}
</style></head><body>
<div id="map"></div>
<script>
(function(){
  window.gm_authFailure = function(){
    var el=document.getElementById('map');
    if(el){ el.innerHTML='<div style="display:flex;height:100%;width:100%;align-items:center;justify-content:center;color:#666;font:600 12px -apple-system,Roboto;background:#eee">Map key issue — allow Maps JavaScript API</div>'; }
  };
  var PINS = ${JSON.stringify(pins)};
  var CENTER = ${JSON.stringify(c)};
  window.__initMap = function(){
    var map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: CENTER.lat, lng: CENTER.lng },
      zoom: 13,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      styles: [
        {featureType:'poi',stylers:[{visibility:'off'}]},
        {featureType:'transit',stylers:[{visibility:'off'}]}
      ]
    });
    // Rider "you are here" marker (blue dot)
    new google.maps.Marker({
      map: map,
      position: { lat: CENTER.lat, lng: CENTER.lng },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#2563eb',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3,
      },
      zIndex: 10,
    });
    // Restaurant pins (green droplets)
    var bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: CENTER.lat, lng: CENTER.lng });
    var info = new google.maps.InfoWindow();
    PINS.forEach(function(p){
      var m = new google.maps.Marker({
        map: map,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        icon: {
          path: 'M20 0C9 0 0 9 0 20c0 14 20 30 20 30s20-16 20-30C40 9 31 0 20 0z',
          fillColor: '#16A34A',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 0.6,
          anchor: new google.maps.Point(20, 50),
        },
      });
      m.addListener('click', function(){
        info.setContent('<div class="info-card"><b>' + p.name + '</b>' +
          (p.cuisine ? '<small>' + p.cuisine + '</small><br/>' : '') +
          (p.rating ? '<small>&#9733; ' + p.rating.toFixed(1) + '</small>' : '') +
          '</div>');
        info.open(map, m);
      });
      bounds.extend({ lat: p.lat, lng: p.lng });
    });
    if (PINS.length > 0) {
      map.fitBounds(bounds, 48);
    }
  };
  var s = document.createElement('script');
  s.async = true;
  s.defer = true;
  s.src = 'https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=__initMap';
  document.head.appendChild(s);
})();
</script>
</body></html>`,
    // Depend on a stable content-key, not the `pins`/`restaurants` array
    // references themselves -- an upstream re-render that rebuilds the
    // restaurants array (even with identical data, e.g. a polling refresh)
    // would otherwise regenerate this HTML string and force the WebView to
    // fully reload, causing a visible blink every refresh cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pins.map((p) => `${p.id}:${p.lat}:${p.lng}`).join("|"), c.lat, c.lng],
  );

  if (Platform.OS !== "web") {
    // Native (iOS/Android) — use WebView. Kept lazy so we don't ship the
    // WebView bundle in the web build.
    return (
      <View style={[styles.wrap, { height }]}>
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          style={{ flex: 1, borderRadius: radius.lg }}
        />
      </View>
    );
  }
  if (!MAPS_KEY) {
    return (
      <View style={[styles.wrap, { height }]}>
        <Text style={styles.fallback}>Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map.</Text>
      </View>
    );
  }

  // On web, `react-native-webview` isn't supported — render a real iframe
  // pointing at a Blob URL that contains the same interactive Google Maps
  // HTML we build for the WebView. Blob URL keeps everything sandboxed and
  // avoids CSP issues from inline srcdoc on some browsers.
  const blobUrl = useMemo(() => {
    if (typeof window === "undefined" || typeof Blob === "undefined") return "";
    const blob = new Blob([html], { type: "text/html" });
    return URL.createObjectURL(blob);
  }, [html]);

  return (
    <View style={[styles.wrap, { height }]}>
      {/* @ts-ignore - iframe is a web-only DOM element */}
      <iframe
        title="Nearby restaurants"
        src={blobUrl}
        style={{ width: "100%", height: "100%", border: "0", borderRadius: 16 } as any}
        allow="geolocation"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallback: {
    flex: 1,
    textAlign: "center",
    textAlignVertical: "center",
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: font.semi,
    padding: 16,
  },
});
