const CACHE_NAME = "learnhub-v6";

const notificationIcon = () => {
  const origin = self.location.origin;
  return `${origin}/icon.svg`;
};

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

  const title = data.title || "LearnHub";
  const options = {
    body: data.body || "Новое уведомление",
    data: { url: data.url || "/" },
    icon: notificationIcon(),
    badge: notificationIcon(),
    tag: "learnhub-push",
    renotify: true,
  };

  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .catch(() => self.registration.showNotification(title, { body: options.body }))
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
