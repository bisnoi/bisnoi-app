path = "src/components/GoogleMapView.tsx"
with open(path) as f:
    c = f.read()

# --- 1. Props: add optional pathKeys ---
old_props = '''export function GoogleMapView({
  markers,
  height = 240,
  showPath = true,
  interactive = false,
}: {
  markers: MarkerInput[];
  height?: number;
  showPath?: boolean;
  interactive?: boolean;
}) {'''

new_props = '''export function GoogleMapView({
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
}) {'''

assert old_props in c, "PROPS ANCHOR NOT FOUND"
c = c.replace(old_props, new_props, 1)

# --- 2. applyMarkers: accept pathKeys, filter which coords form the line ---
old_apply = '''  window.applyMarkers = function(input, showPath){
    if(!map){ pending = {input:input, showPath:showPath}; return; }
    input = dedupeOverlaps(input.slice());
    var keys={}, coords=[];
    input.forEach(function(m){
      var key=m.key||(m.icon+'_'+m.lat.toFixed(4)+'_'+m.lng.toFixed(4));
      keys[key]=true; coords.push({lat:m.lat,lng:m.lng});
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
    if(showPath && coords.length>=2){ line=new google.maps.Polyline({ path:coords, geodesic:true, strokeColor:'#D94838', strokeOpacity:0.85, strokeWeight:4, map:map }); }
    if(coords.length>=2){ var b=new google.maps.LatLngBounds(); coords.forEach(function(c){b.extend(c);}); map.fitBounds(b,{top:48,bottom:48,left:48,right:48}); }
    else if(coords.length===1){ map.setCenter(coords[0]); map.setZoom(15); }'''

new_apply = '''  window.applyMarkers = function(input, showPath, pathKeys){
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
    else if(coords.length===1){ map.setCenter(coords[0]); map.setZoom(15); }'''

assert old_apply in c, "APPLYMARKERS ANCHOR NOT FOUND"
c = c.replace(old_apply, new_apply, 1)

# --- 3. pending flush: carry pathKeys through ---
old_flush = "    if(pending){ window.applyMarkers(pending.input, pending.showPath); pending=null; }"
new_flush = "    if(pending){ window.applyMarkers(pending.input, pending.showPath, pending.pathKeys); pending=null; }"
assert c.count(old_flush) == 1, "FLUSH ANCHOR NOT FOUND OR NOT UNIQUE"
c = c.replace(old_flush, new_flush, 1)

# --- 4. Web useEffect call site ---
old_effect = '''  // Push markers whenever props change
  useEffect(() => {
    if (Platform.OS === "web") {
      const iframe = document.getElementById(frameId) as HTMLIFrameElement | null;
      try {
        (iframe?.contentWindow as any)?.applyMarkers?.(markers, showPath);
      } catch {}
    } else {
      const js = `window.applyMarkers && window.applyMarkers(${JSON.stringify(markers)}, ${showPath ? "true" : "false"}); true;`;
      webRef.current?.injectJavaScript(js);
    }
  }, [markers, showPath, frameId]);'''

new_effect = '''  // Push markers whenever props change
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
  }, [markers, showPath, pathKeys, frameId]);'''

assert old_effect in c, "EFFECT ANCHOR NOT FOUND"
c = c.replace(old_effect, new_effect, 1)

# --- 5. Web onLoad call site ---
old_onload = '''          onLoad={() => {
            const iframe = document.getElementById(frameId) as HTMLIFrameElement | null;
            // Give the async Maps script a tick to init, then push.
            const push = () => {
              try {
                (iframe?.contentWindow as any)?.applyMarkers?.(markers, showPath);
              } catch {}
            };
            push();
            setTimeout(push, 600);
            setTimeout(push, 1500);
          }}'''

new_onload = '''          onLoad={() => {
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
          }}'''

assert old_onload in c, "ONLOAD ANCHOR NOT FOUND"
c = c.replace(old_onload, new_onload, 1)

# --- 6. Native onLoadEnd call site ---
old_onloadend = '''          onLoadEnd={() => {
            const js = `window.applyMarkers && window.applyMarkers(${JSON.stringify(markers)}, ${showPath ? "true" : "false"}); true;`;
            setTimeout(() => webRef.current?.injectJavaScript(js), 800);
          }}'''

new_onloadend = '''          onLoadEnd={() => {
            const js = `window.applyMarkers && window.applyMarkers(${JSON.stringify(markers)}, ${showPath ? "true" : "false"}, ${JSON.stringify(pathKeys || null)}); true;`;
            setTimeout(() => webRef.current?.injectJavaScript(js), 800);
          }}'''

assert old_onloadend in c, "ONLOADEND ANCHOR NOT FOUND"
c = c.replace(old_onloadend, new_onloadend, 1)

with open(path, "w") as f:
    f.write(c)
print("GOOGLEMAPVIEW PATCH APPLIED SUCCESSFULLY (6/6 anchors matched)")
