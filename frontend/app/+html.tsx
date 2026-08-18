// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Runs synchronously before first paint: fetches the admin-chosen accent (only on
// first visit) so the very first render uses the right theme — no reload, no flash.
const themeBootstrap = `
(function(){
  try {
    var KEY='theme_accent';
    var acc = window.localStorage.getItem(KEY);
    if(!acc){
      try{
        var x=new XMLHttpRequest();
        x.open('GET','/api/settings/theme',false);
        x.send(null);
        if(x.status>=200&&x.status<300){
          var c=JSON.parse(x.responseText).color;
          if(c&&/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)){acc=c;window.localStorage.setItem(KEY,c);}
        }
      }catch(e){}
    }
    var bg = '#FFFFFF';
    document.documentElement.style.backgroundColor = bg;
    var col = acc || '#16A34A';
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name','theme-color'); document.head.appendChild(m); }
    m.setAttribute('content', col);
  } catch (e) {}
})();
`;

// Registers the PWA service worker after load.
const swRegister = `
(function(){
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    });
  }
})();
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="description" content="Bisnoi — Authentic Indian food, delivered hot. Order from your favourite restaurants." />

        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0B0F0C" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Bisnoi" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />

        {/* Apply saved theme before first paint */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />

        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
        */}
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
              /* Hide the Firebase phone-auth reCAPTCHA (invisible) badge in the corner */
              .grecaptcha-badge { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
        <script dangerouslySetInnerHTML={{ __html: swRegister }} />
      </body>
    </html>
  );
}
