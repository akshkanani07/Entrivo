// ============================================================================
// Entrivo Service Worker v2 (Production PWA & Offline Protection)
// ============================================================================

const CACHE_NAME = "entrivo-static-v3";

// Only precache non-PII, immutable app shell assets and the offline fallback page
const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon.svg",
];

// Install: Precache safe app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Do not automatically skip waiting so that user can be notified via "Update Available"
});

// Activate: Purge obsolete caches and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("[SW] Deleting obsolete cache:", name);
            return caches.delete(name);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Message: Allow clients to request immediate worker takeover
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch: Strict security routing
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. SECURITY REQUIREMENT: NEVER cache API responses or non-GET requests in Cache Storage
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") {
    return; // Pass through to network with zero caching
  }

  // 2. Navigation Requests: Network first, fall back to offline.html
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/offline.html")) || Response.error();
      })
    );
    return;
  }

  // 3. Next.js Static Build Assets & Icons: Cache First with Network Fallback
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico";

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Default: Network with graceful offline error (never store dynamic authenticated HTML)
});

// Background Sync Event (Supported in Chromium / Android)
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-offline-checkins") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "TRIGGER_OFFLINE_SYNC" });
        });
      })
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
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
