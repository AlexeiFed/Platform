const CACHE_NAME = "learnhub-v5";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("push", (event) => {
  let data = { title: "LearnHub", body: "", url: "/" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        data = { ...data, ...parsed };
      }
    }
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url || "/" },
      icon: "/favicon.ico",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const fullUrl = new URL(url, self.location.origin).href;
      for (const client of clientList) {
        if (client.url === fullUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl);
      }
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  const accept = event.request.headers.get("Accept") ?? "";
  const isRscOrFlight =
    accept.includes("text/x-component") ||
    accept.includes("application/vnd.nextjs.rsc") ||
    event.request.headers.get("RSC") === "1" ||
    event.request.headers.get("Next-Router-Prefetch") === "1" ||
    event.request.headers.has("Next-Router-State-Tree") ||
    url.searchParams.has("_rsc");

  // Пропускаем: API, Next.js, RSC/flight (иначе клиентская навигация ломается — Safari:
  // access control / Load failed), админку (всегда свежие данные), cross-origin.
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/admin") ||
    isRscOrFlight
  )
    return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) => cached ?? new Response("Offline", { status: 503, statusText: "Offline" })
        )
      )
  );
});
