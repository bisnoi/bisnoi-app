import React, { useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, Platform, Text } from "react-native";
import { WebView } from "react-native-webview";
import { colors, radius, font } from "@/src/theme";

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
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

export type MarkerInput = {
  lat: number;
  lng: number;
  label?: string;
  color?: string; // hex without #
  icon?: "rider" | "home" | "shop" | "restaurant";
  key?: string; // stable key enables smooth live interpolation
};

/**
 * Google Maps display component (markers + path) built once via an isolated
 * iframe/WebView, then mutated in place via `applyMarkers` so live rider
 * tracking animates smoothly instead of reloading the whole map.
 */
export function GoogleMapView({
  markers,
  height = 240,
  showPath = true,
  interactive = false,
  pathKeys,
}: {
  markers: MarkerInput[];
  height?: number;
  showPath?: boolean;
  interactive?: boolean;
  /** Optional: restrict the drawn route line to just these marker keys (e.g.
   * ["rider","rest"] while a rider is heading to pick up, or ["rest","drop"]
   * once picked up / before assignment) instead of connecting every marker
   * in sequence. All markers are still shown regardless of this prop. */
  pathKeys?: string[];
}) {
  const webRef = useRef<WebView>(null);
  const frameId = useRef(`gmap-${Math.random().toString(36).slice(2)}`).current;

  const html = useMemo(() => {
    const gesture = interactive ? "greedy" : "cooperative";
    const mapExtraJS = MAP_ID
      ? `mapOpts.mapId = ${JSON.stringify(MAP_ID)}; mapOpts.tilt = 45;`
      : `mapOpts.styles = ${JSON.stringify(LIGHT_MAP_STYLE)};`;
    return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#eef2f0}
.tag{position:absolute;transform:translate(-50%,-100%);background:#fff;border:1px solid #d9d2c5;border-radius:9px;padding:3px 8px;font:600 11px/1 -apple-system,Roboto,Arial;color:#1b1b1b;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap;pointer-events:none}
</style>
</head><body>
<div id="map"></div>
<script>
(function(){
  window.gm_authFailure = function(){
    var el=document.getElementById('map');
    if(el){ el.innerHTML='<div style="display:flex;height:100%;width:100%;align-items:center;justify-content:center;text-align:center;padding:16px;color:#5b6b63;font:600 12px/1.4 -apple-system,Roboto,Arial;background:#eef2f0">Map couldn\\'t load.<br/>Allow <b>Maps JavaScript API</b> on the Google API key<br/>(Cloud Console → Credentials → API restrictions).</div>'; }
  };
  var EMOJI = { rider:'\\uD83D\\uDEF5', home:'\\uD83C\\uDFE0', shop:'\\uD83C\\uDF74', restaurant:'\\uD83C\\uDF74', drop:'\\uD83D\\uDCCD' };
  var map, markers = {}, labels = {}, line = null, anims = {};
  var pending = null;

  function pinSvg(color, emoji){
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">'
      + '<path d="M20 0C9 0 0 9 0 20c0 14 20 30 20 30s20-16 20-30C40 9 31 0 20 0z" fill="#'+color+'" stroke="#ffffff" stroke-width="3"/>'
      + '<text x="20" y="24" font-size="17" text-anchor="middle" dominant-baseline="middle">'+emoji+'</text></svg>';
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function LabelOverlay(map, position, text){
    var ov = new google.maps.OverlayView();
    ov.position = position; ov.text = text;
    ov.onAdd = function(){ var d=document.createElement('div'); d.className='tag'; d.textContent=this.text; this.div=d; this.getPanes().floatPane.appendChild(d); };
    ov.draw = function(){ if(!this.div) return; var proj=this.getProjection(); if(!proj) return; var p=proj.fromLatLngToDivPixel(this.position); if(!p) return; this.div.style.left=p.x+'px'; this.div.style.top=(p.y-46)+'px'; };
    ov.onRemove = function(){ if(this.div){ this.div.remove(); this.div=null; } };
    ov.move = function(pos,text){ this.position=pos; if(text!=null){ this.text=text; if(this.div) this.div.textContent=text; } this.draw(); };
    ov.setMap(map);
    return ov;
  }

  function animateTo(key, mk, lbl, toLat, toLng){
    if(anims[key]) cancelAnimationFrame(anims[key]);
    var from = mk.getPosition(); if(!from){ mk.setPosition({lat:toLat,lng:toLng}); return; }
    var fLat=from.lat(), fLng=from.lng(), start=null, dur=850;
    function step(ts){ if(!start) start=ts; var t=Math.min(1,(ts-start)/dur); var e=t<.5?2*t*t:-1+(4-2*t)*t;
      var la=fLat+(toLat-fLat)*e, ln=fLng+(toLng-fLng)*e; var pos=new google.maps.LatLng(la,ln);
      mk.setPosition(pos); if(lbl) lbl.move(pos);
      if(t<1) anims[key]=requestAnimationFrame(step); }
    anims[key]=requestAnimationFrame(step);
  }

  function dedupeOverlaps(list){
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

  window.applyMarkers = function(input, showPath, pathKeys){
    if(!map){ pending = {input:input, showPath:showPath, pathKeys:pathKeys}; return; }
    input = dedupeOverlaps(input.slice());
    var pathSet = null;
    if (pathKeys && pathKeys.length){ pathSet = {}; pathKeys.forEach(function(k){ pathSet[k]=true; }); }
    var keys={}, coords=[], lineCoords=[];
    input.forEach(function(m){
      var key=m.key||(m.icon+'_'+m.lat.toFixed(4)+'_'+m.lng.toFixed(4));
      keys[key]=true; coords.push({lat:m.lat,lng:m.lng});
      if(!pathSet || pathSet[key]) lineCoords.push({lat:m.lat,lng:m.lng});
      var emoji=EMOJI[m.icon||'drop']||EMOJI.drop;
      if(markers[key]){
        animateTo(key, markers[key], labels[key], m.lat, m.lng);
        if(m.label && labels[key]) labels[key].move(new google.maps.LatLng(m.lat,m.lng), m.label);
      } else {
        var mk=new google.maps.Marker({ position:{lat:m.lat,lng:m.lng}, map:map,
          icon:{ url:pinSvg(m.color||'D94838', emoji), scaledSize:new google.maps.Size(40,50), anchor:new google.maps.Point(20,50) },
          title:m.label||'' });
        markers[key]=mk;
        if(m.label) labels[key]=LabelOverlay(map, new google.maps.LatLng(m.lat,m.lng), m.label);
      }
    });
    Object.keys(markers).forEach(function(k){ if(!keys[k]){ markers[k].setMap(null); delete markers[k]; if(labels[k]){labels[k].setMap(null); delete labels[k];} } });
    if(line){ line.setMap(null); line=null; }
    if(showPath && lineCoords.length>=2){ line=new google.maps.Polyline({ path:lineCoords, geodesic:true, strokeColor:'#D94838', strokeOpacity:0.85, strokeWeight:4, map:map }); }
    if(coords.length>=2){ var b=new google.maps.LatLngBounds(); coords.forEach(function(c){b.extend(c);}); map.fitBounds(b,{top:48,bottom:48,left:48,right:48}); }
    else if(coords.length===1){ map.setCenter(coords[0]); map.setZoom(15); }
  };

  window.__initGMap = function(){
    var mapOpts = {
      center:{lat:0,lng:0}, zoom:14, gestureHandling:'${gesture}',
      clickableIcons:false, keyboardShortcuts:false,
      disableDefaultUI:true, zoomControl:true
    };
    ${mapExtraJS}
    map=new google.maps.Map(document.getElementById('map'), mapOpts);
    if(pending){ window.applyMarkers(pending.input, pending.showPath, pending.pathKeys); pending=null; }
  };
})();
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=__initGMap&loading=async"></script>
</body></html>`;
  }, [interactive]);

  // Push markers whenever props change
  useEffect(() => {
    if (Platform.OS === "web") {
      const iframe = document.getElementById(frameId) as HTMLIFrameElement | null;
      try {
        (iframe?.contentWindow as any)?.applyMarkers?.(markers, showPath, pathKeys);
      } catch {}
    } else {
      const js = `window.applyMarkers && window.applyMarkers(${JSON.stringify(markers)}, ${showPath ? "true" : "false"}, ${JSON.stringify(pathKeys || null)}); true;`;
      webRef.current?.injectJavaScript(js);
    }
  }, [markers, showPath, pathKeys, frameId]);

  if (!MAPS_KEY) {
    return (
      <View style={[styles.wrap, styles.fallback, { height }]}>
        <Text style={styles.fallbackTxt}>Map unavailable — Google Maps key not configured.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]}>
      {Platform.OS === "web" ? (
        // @ts-ignore web-only DOM element
        <iframe
          id={frameId}
          srcDoc={html}
          sandbox="allow-scripts allow-same-origin allow-popups"
          onLoad={() => {
            const iframe = document.getElementById(frameId) as HTMLIFrameElement | null;
            // Give the async Maps script a tick to init, then push.
            const push = () => {
              try {
                (iframe?.contentWindow as any)?.applyMarkers?.(markers, showPath, pathKeys);
              } catch {}
            };
            push();
            setTimeout(push, 600);
            setTimeout(push, 1500);
          }}
          style={{ width: "100%", height: "100%", border: 0, backgroundColor: colors.background, borderRadius: radius.lg }}
        />
      ) : (
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          style={{ backgroundColor: colors.background, borderRadius: radius.lg }}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={interactive}
          onLoadEnd={() => {
            const js = `window.applyMarkers && window.applyMarkers(${JSON.stringify(markers)}, ${showPath ? "true" : "false"}, ${JSON.stringify(pathKeys || null)}); true;`;
            setTimeout(() => webRef.current?.injectJavaScript(js), 800);
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
  fallback: { alignItems: "center", justifyContent: "center", padding: 16 },
  fallbackTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: font.semi, textAlign: "center" },
});
