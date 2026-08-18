path = "GoogleMapPicker.tsx"
with open(path) as f:
    c = f.read()

old = '''<script async src="https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places&callback=__initPicker&loading=async"></script>
</body></html>`;'''

new = '''<script>
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
</body></html>`;'''

if old in c:
    c = c.replace(old, new, 1)
    with open(path, "w") as f:
        f.write(c)
    print("MAP DEBUG PATCH APPLIED SUCCESSFULLY")
else:
    print("ANCHOR NOT FOUND - no changes made")
