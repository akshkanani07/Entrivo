const CACHE_NAME = "entrivo-cache-v2";
const OFFLINE_URLS = ["/", "/manifest.json", "/kiosk"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((res) => res || caches.match("/kiosk"))
      )
    );
  }
});

// ── Web Push Notification Events ─────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    let payload;
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "Entrivo Workplace", body: event.data.text() };
    }

    const title = payload.title || "Entrivo Workplace Notification";
    const options = {
      body: payload.body || "You have a new workplace visitor alert.",
      icon: payload.icon || "/icons/icon-192x192.png",
      badge: payload.badge || "/icons/icon-192x192.png",
      data: payload.data || { url: "/notifications" },
      tag: payload.tag || `entrivo-${Date.now()}`,
      vibrate: [200, 100, 200],
      requireInteraction: true,
      actions: [
        { action: "open", title: "View Details" },
        { action: "dismiss", title: "Dismiss" },
      ],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("[SW] Push handling failed:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/notifications";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a tab is already open on this origin, focus and navigate it
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
