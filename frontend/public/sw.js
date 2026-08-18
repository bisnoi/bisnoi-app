/* Bisnoi — PWA service worker.
 * - Never caches API calls (always network).
 * - Navigation: network-first with cached app-shell fallback (offline support).
 * - Static assets: stale-while-revalidate.
 */
const CACHE = "bisnoi-v3";
const SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // Never intercept API traffic — must always hit the network fresh.
  if (url.pathname.startsWith("/api") || url.pathname.indexOf("/api/") !== -1) return;

  // App navigations -> network-first, fall back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  // Same-origin static assets -> stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

/* ---- Web Push (VAPID) ---- */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Bisnoi";
  const type = data.type || "bisnoi";
  // Order-related events are business-critical: keep the notification sticky
  // (requireInteraction), re-alert even when a same-type notif is already
  // present (renotify), and use a longer, "ringing"-feeling vibration pattern
  // so the phone/watch actually buzzes when the display is off.
  const isCritical = type === "new_order" || type === "pickup_available" || type === "order_update";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: type,
    data: { url: data.url || "/", order_id: data.order_id || null, type },
    vibrate: isCritical ? [300, 120, 300, 120, 300, 120, 500] : [80, 40, 80],
    requireInteraction: isCritical,
    renotify: isCritical,
    silent: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) { try { client.navigate(target); } catch (e) {} }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
