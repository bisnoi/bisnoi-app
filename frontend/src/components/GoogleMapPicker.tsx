import React, { useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, Platform, Text } from "react-native";
import { WebView } from "react-native-webview";
import { colors, radius, font } from "@/src/theme";

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export type PickedLocation = {
  lat: number;
  lng: number;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
};

/**
 * Interactive Google Maps address picker (Zomato/Swiggy style):
 * - center pin that stays fixed while the map pans underneath
 * - search box (Places Autocomplete + Geocoding fallback)
 * - "use my current location" via browser geolocation
 * - reverse geocoding -> formatted address reported via onChange
 */
export function GoogleMapPicker({
  lat = 0,
  lng = 0,
  onChange,
  height = 320,
  recenterTo,
}: {
  lat?: number;
  lng?: number;
  onChange: (loc: PickedLocation) => void;
  height?: number;
  /** Bump this with a new {lat,lng} to programmatically move the map (e.g. after fetching device GPS location natively). */
  recenterTo?: { lat: number; lng: number } | null;
}) {
  const webRef = useRef<WebView>(null);
  const instanceId = useRef(`pick-${Math.random().toString(36).slice(2)}`).current;

  const html = useMemo(() => {
    return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
html,body{margin:0;padding:0;height:100%;width:100%;font-family:-apple-system,Roboto,Arial}
#map{position:absolute;inset:0}
#pin{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);z-index:5;pointer-events:none;filter:drop-shadow(0 6px 6px rgba(0,0,0,.3))}
#pin .dot{position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);width:10px;height:10px;background:rgba(0,0,0,.25);border-radius:50%}
#bar{position:absolute;top:10px;left:10px;right:10px;z-index:6;display:flex;gap:8px}
#q{flex:1;border:0;border-radius:10px;padding:11px 12px;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.18);outline:none}
#loc{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:8px;
  border:0;background:rgba(17,24,39,.92);color:#fff;border-radius:999px;padding:11px 18px;font-size:14px;font-weight:700;
  box-shadow:0 6px 18px rgba(0,0,0,.28);cursor:pointer;white-space:nowrap}
#loc .dot16{width:16px;height:16px;border-radius:50%;border:2.5px solid #22C55E;position:relative;flex:0 0 auto}
#loc .dot16::after{content:'';position:absolute;left:50%;top:50%;width:5px;height:5px;background:#22C55E;border-radius:50%;transform:translate(-50%,-50%)}
.pac-container{z-index:99999 !important;border-radius:10px;margin-top:4px}
</style>
</head><body>
<div id="map"></div>
<div id="bar">
  <input id="q" placeholder="Search area, street, landmark..." />
</div>
<button id="loc" title="Use my location"><span class="dot16"></span>Use current location</button>
<div id="pin">
  <svg width="40" height="50" viewBox="0 0 40 50"><path d="M20 0C9 0 0 9 0 20c0 14 20 30 20 30s20-16 20-30C40 9 31 0 20 0z" fill="#16A34A" stroke="#fff" stroke-width="3"/><circle cx="20" cy="20" r="6" fill="#fff"/></svg>
  <div class="dot"></div>
</div>
<script>
(function(){
  window.gm_authFailure = function(){
    var el=document.getElementById('map');
    if(el){ el.innerHTML='<div style="display:flex;height:100%;width:100%;align-items:center;justify-content:center;text-align:center;padding:16px;color:#444;font:600 12px/1.4 -apple-system,Roboto,Arial;background:#eee">Map couldn\\'t load.<br/>Allow <b>Maps JavaScript API</b> + <b>Places</b> on the Google API key<br/>(Cloud Console → Credentials → API restrictions).</div>'; }
  };
  var ID='${instanceId}';
  var INIT_LAT=${lat}, INIT_LNG=${lng};
  var map, geocoder, lastSent=0;

  function send(la, ln, addr, city, state, pincode){
    var payload=JSON.stringify({__gmpicker:ID, lat:la, lng:ln, address:addr||'', city:city||'', state:state||'', pincode:pincode||''});
    if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(payload); }
    else if(window.parent){ window.parent.postMessage(payload, '*'); }
  }

  function pick(comps, types){
    for (var i=0;i<comps.length;i++){
      for (var j=0;j<types.length;j++){
        if (comps[i].types.indexOf(types[j])>=0) return comps[i].long_name;
      }
    }
    return '';
  }

  function buildAddr(comps){
    var skip=['street_number','premise','subpremise','plus_code'];
    var parts=[];
    for (var i=0;i<comps.length;i++){
      var skipThis=false;
      for (var j=0;j<skip.length;j++){
        if (comps[i].types.indexOf(skip[j])>=0){ skipThis=true; break; }
      }
      if (!skipThis) parts.push(comps[i].long_name);
    }
    return parts.join(', ');
  }

  function reverse(la, ln){
    geocoder.geocode({location:{lat:la,lng:ln}}, function(res, status){
      var addr='', city='', state='', pincode='';
      if(status==='OK' && res && res[0]){
        addr=buildAddr(res[0].address_components||[]);
        var comps=res[0].address_components||[];
        city = pick(comps, ['locality','sublocality','administrative_area_level_2']);
        state = pick(comps, ['administrative_area_level_1']);
        pincode = pick(comps, ['postal_code']);
      }
      send(la, ln, addr, city, state, pincode);
    });
  }

  window.__initPicker=function(){
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
    map.addListener('idle', function(){
      var c=map.getCenter(); var now=Date.now();
      if(now-lastSent<250) return; lastSent=now;
      reverse(c.lat(), c.lng());
    });

    // Search: Places Autocomplete with Geocoding fallback
    var input=document.getElementById('q');
    try {
      var ac=new google.maps.places.Autocomplete(input, { fields:['geometry','formatted_address'] });
      ac.addListener('place_changed', function(){
        var p=ac.getPlace();
        if(p && p.geometry && p.geometry.location){ map.panTo(p.geometry.location); map.setZoom(17); }
      });
    } catch(e){ /* Places not available -> use geocoding on Enter */ }
    input.addEventListener('keydown', function(ev){
      if(ev.key==='Enter'){ ev.preventDefault();
        geocoder.geocode({address:input.value}, function(res,status){
          if(status==='OK' && res && res[0]){ map.panTo(res[0].geometry.location); map.setZoom(17); }
        });
      }
    });

    // Locate me (browser geolocation)
    document.getElementById('loc').addEventListener('click', function(){
      if(!navigator.geolocation){ return; }
      navigator.geolocation.getCurrentPosition(function(pos){
        var la=pos.coords.latitude, ln=pos.coords.longitude;
        map.panTo({lat:la,lng:ln}); map.setZoom(17);
      }, function(){ /* denied/failed -> ignore */ }, { enableHighAccuracy:true, timeout:8000 });
    });

    // Allow the RN side to move the map programmatically (native GPS fetch).
    window.__recenterPicker = function(la, ln){
      map.panTo({lat:la, lng:ln});
      map.setZoom(17);
    };

    // Initial report
    reverse(INIT_LAT, INIT_LNG);
  };
})();
</script>
<script>
  function mapsScriptError(){
    var el=document.getElementById('map');
    if(el){ el.innerHTML='<div style="display:flex;height:100%;width:100%;align-items:center;justify-content:center;text-align:center;padding:16px;color:#444;font:600 12px/1.4 -apple-system,Roboto,Arial;background:#eee">DEBUG: Failed to load Google Maps script tag (network blocked or blocked by app).</div>'; }
  }
  window.onerror = function(msg, url, line, col, err){
    var el=document.getElementById('map');
    if(el){ el.innerHTML='<div style="display:flex;height:100%;width:100%;align-items:center;justify-content:center;text-align:center;padding:16px;color:#900;font:600 11px/1.4 -apple-system,Roboto,Arial;background:#fee;word-break:break-word">DEBUG JS Error: '+msg+' ('+line+':'+col+')</div>'; }
  };
  setTimeout(function(){
    if (typeof google === 'undefined' || !google.maps) {
      var el=document.getElementById('map');
      if(el){ el.innerHTML='<div style="display:flex;height:100%;width:100%;align-items:center;justify-content:center;text-align:center;padding:16px;color:#444;font:600 12px/1.4 -apple-system,Roboto,Arial;background:#eee">DEBUG: Maps script never initialised within 8s (blocked or very slow network).</div>'; }
    }
  }, 8000);
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places&callback=__initPicker&loading=async" onerror="mapsScriptError()"></script>
</body></html>`;
  // `lat`/`lng` are only the INITIAL center — deliberately excluded from
  // deps below. The map itself reports every new center back up via
  // onChange as the user pans (see the 'idle' listener), which would
  // otherwise update these props and regenerate this whole HTML string on
  // every pan, forcing the WebView to fully reload -> visible blink/flicker.
  // Programmatic re-centering after the fact goes through `recenterTo`
  // instead (see the effect below), which moves the existing map in place.
  }, [instanceId]);

  useEffect(() => {
    if (!recenterTo) return;
    if (Platform.OS === "web") return; // web iframe uses its own browser geolocation via the Locate button
    webRef.current?.injectJavaScript(
      `window.__recenterPicker && window.__recenterPicker(${recenterTo.lat}, ${recenterTo.lng}); true;`
    );
  }, [recenterTo]);

  // Web: listen for messages from the iframe
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d && d.__gmpicker === instanceId) {
          onChange({ lat: d.lat, lng: d.lng, address: d.address, city: d.city, state: d.state, pincode: d.pincode });
        }
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [instanceId, onChange]);

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
          srcDoc={html}
          allow="geolocation"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          style={{ width: "100%", height: "100%", border: 0, backgroundColor: colors.background, borderRadius: radius.lg }}
        />
      ) : (
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html, baseUrl: "https://bisnoi.com" }}
          style={{ backgroundColor: colors.background, borderRadius: radius.lg }}
          javaScriptEnabled
          domStorageEnabled
          geolocationEnabled
          cacheEnabled
          startInLoadingState
          // iOS's WKWebView identifies itself as an embedded webview by default,
          // which makes the Google Maps JS API fall back to a slower/degraded
          // rendering path. Spoofing a normal mobile-Safari user agent fixes
          // load speed (Android is unaffected and already fast).
          userAgent={Platform.OS === "ios" ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" : undefined}
          onMessage={(e) => {
            try {
              const d = JSON.parse(e.nativeEvent.data);
              if (d && d.__gmpicker === instanceId) onChange({ lat: d.lat, lng: d.lng, address: d.address, city: d.city, state: d.state, pincode: d.pincode });
            } catch {}
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
