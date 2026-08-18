#!/usr/bin/env node
/* Post-export step for SPA (output: "single") web builds.
 * Expo's single-output ignores app/+html.tsx, so we inject PWA + theme tags
 * into dist/index.html here. Idempotent. */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "dist", "index.html");
if (!fs.existsSync(file)) {
  console.error("[inject-pwa] dist/index.html not found — run expo export first.");
  process.exit(1);
}

let html = fs.readFileSync(file, "utf8");

if (html.includes("data-pwa-injected")) {
  console.log("[inject-pwa] already injected, skipping.");
  process.exit(0);
}

const themeBootstrap = `(function(){try{var KEY='theme_accent';var acc=window.localStorage.getItem(KEY);if(!acc){try{var x=new XMLHttpRequest();x.open('GET','/api/settings/theme',false);x.send(null);if(x.status>=200&&x.status<300){var c=JSON.parse(x.responseText).color;if(c&&/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)){acc=c;window.localStorage.setItem(KEY,c);}}}catch(e){}}var bg='#FFFFFF';document.documentElement.style.backgroundColor=bg;var col=acc||'#16A34A';try{var _h=col.replace('#','');if(_h.length===3){_h=_h[0]+_h[0]+_h[1]+_h[1]+_h[2]+_h[2];}var _r=parseInt(_h.substr(0,2),16),_g=parseInt(_h.substr(2,2),16),_b=parseInt(_h.substr(4,2),16);var _l=(0.299*_r+0.587*_g+0.114*_b)/255;var _fg=_l>0.62?'#0B0F0C':'#FFFFFF';document.documentElement.style.setProperty('--accent',col);document.documentElement.style.setProperty('--tabfg',_fg);}catch(e){}var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',col);}catch(e){}})();`;

// Capture the PWA install prompt as early as possible so the in-app "Install" button can use it.
const bipCapture = `window.__bip=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bip=e;window.dispatchEvent(new Event('bipchange'));});window.addEventListener('appinstalled',function(){window.__bip=null;try{localStorage.setItem('pwa_installed','1');}catch(_){}window.dispatchEvent(new Event('bipchange'));});`;

const swRegister = `(function(){if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}})();`;

// Pre-JS splash: shown BEFORE React parses/mounts. Hidden as soon as the React
// splash overlay mounts (which unmounts this element) OR after 3s as a safety
// net if JS fails. Only shown ONCE per browser session via sessionStorage.
const preSplashHtml = `
<div id="pre-splash" style="position:fixed;inset:0;z-index:99999;background:#287939;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;transition:opacity 300ms ease;">
  <img src="/logo-full.png" alt="Bisnoi" style="width:260px;height:260px;object-fit:contain;" />
  <div style="position:absolute;bottom:40px;font-size:13px;font-weight:800;letter-spacing:1.5px;">
    <span style="color:#B4EFC6;">\\u2022</span>&nbsp; PURE VEG. PURE GOODNESS. &nbsp;<span style="color:#B4EFC6;">\\u2022</span>
  </div>
</div>
<script>
(function(){
  try{
    var KEY='__bisnoi_splash_shown';
    var shown=window.sessionStorage.getItem(KEY);
    var pre=document.getElementById('pre-splash');
    if(shown && pre){ pre.parentNode && pre.parentNode.removeChild(pre); return; }
    // safety net: remove after 3.5s regardless
    setTimeout(function(){
      var el=document.getElementById('pre-splash');
      if(el){ el.style.opacity='0'; setTimeout(function(){ el.parentNode && el.parentNode.removeChild(el); },400); }
    }, 3500);
  }catch(e){}
})();
</script>
`;

// Admin-authored "Custom CSS" (hotfix styles editable from /admin/custom-css).
// Applies cached CSS instantly (no flash), then refreshes from the backend.
// Uses textContent (never innerHTML) so the payload can only ever be CSS.
const customCssBootstrap = `(function(){try{var el=document.createElement('style');el.id='admin-custom-css';document.head.appendChild(el);try{var c=window.localStorage.getItem('custom_css_cache');if(c){el.textContent=c;}}catch(e){}fetch('/api/settings/custom-css').then(function(r){return r.json();}).then(function(d){var css=(d&&typeof d.css==='string')?d.css:'';el.textContent=css;try{window.localStorage.setItem('custom_css_cache',css);}catch(e){}}).catch(function(){});}catch(e){}})();`;

// Global CSS fixes that app/+html.tsx would normally provide, but which Expo's
// output:"single" build ignores. Most important: stop the bottom tab-bar LABELS
// from being vertically clipped (descenders cut off) on web, paint the bar in the
// ACCENT theme color (via the --accent CSS var set in themeBootstrap), and kill the
// default link-blue that some icon glyph layers inherit. --tabfg is the readable
// foreground (white on dark accents, near-black on light ones). React-navigation's
// per-tab active/inactive inline colors still win for the active/inactive distinction.
const globalCss = `
    /* Keep the inner tablist container TRANSPARENT so the outer floating pill
       (styled by tabBarStyle with rgba(accent,0.85)) shows uniformly — no
       double-shade of solid + translucent green. */
    [role="tablist"] { background-color: transparent !important; }
    [role="tablist"] [role="tab"] { overflow: visible !important; color: var(--tabfg, #FFFFFF); background-color: transparent !important; }
    [role="tablist"] [role="tab"] * { overflow: visible !important; }
    [role="tablist"] [role="tab"] svg { fill: currentColor !important; }
    [role="heading"], [role="heading"] * { overflow: visible !important; }
    /* Hide the Firebase phone-auth reCAPTCHA (invisible) badge in the bottom-right
       corner. visibility:hidden keeps invisible-reCAPTCHA fully functional. */
    .grecaptcha-badge { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
    #recaptcha-container { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
`;

const headTags = `
    <meta name="data-pwa-injected" content="1" />
    <meta name="description" content="Bisnoi — Authentic Indian food, delivered hot. Order from your favourite restaurants." />
    <meta name="apple-mobile-web-app-title" content="Bisnoi" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#0B0F0C" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
    <style>${globalCss}</style>
    <script>${bipCapture}</script>
    <script>${themeBootstrap}</script>
    <script>${customCssBootstrap}</script>
`;
// Improve viewport for standalone PWA (notch-safe, no zoom jank).
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no, viewport-fit=cover" />'
);

// Inject head tags before </head>
html = html.replace("</head>", `${headTags}</head>`);

// Inject SW registration + pre-splash before </body>
html = html.replace("</body>", `  ${preSplashHtml}\n  <script>${swRegister}</script>\n</body>`);

fs.writeFileSync(file, html, "utf8");
console.log("[inject-pwa] injected PWA + theme tags into dist/index.html");
