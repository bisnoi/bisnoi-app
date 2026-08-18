path = "src/components/GoogleMapPicker.tsx"
with open(path) as f:
    c = f.read()

old = '''#bar{position:absolute;top:10px;left:10px;right:10px;z-index:6;display:flex;gap:8px}
#q{flex:1;border:0;border-radius:10px;padding:11px 12px;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.18);outline:none}
#loc{border:0;background:#16A34A;color:#fff;border-radius:10px;padding:0 12px;font-size:13px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer}
.pac-container{z-index:99999 !important;border-radius:10px;margin-top:4px}
</style>
</head><body>
<div id="map"></div>
<div id="bar">
  <input id="q" placeholder="Search area, street, landmark..." />
  <button id="loc" title="Use my location">◎ Locate</button>
</div>'''

new = '''#bar{position:absolute;top:10px;left:10px;right:10px;z-index:6;display:flex;gap:8px}
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
<button id="loc" title="Use my location"><span class="dot16"></span>Use current location</button>'''

assert old in c, "ANCHOR NOT FOUND"
c = c.replace(old, new, 1)

with open(path, "w") as f:
    f.write(c)
print("MAP PICKER LOCATION BUTTON PATCH APPLIED SUCCESSFULLY")
