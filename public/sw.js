// Service worker of the professional's PWA (D-76, D-78).
//
// Patient data is sensitive (PRD 7), so this worker never stores a screen or a
// response: it keeps only the offline page and an icon, which hold no data and are
// the same for everyone, so signing out has nothing here to clear. Without a
// connection a navigation gets that page; the agenda is never shown from a cache.
//
// Only navigations pass through it. Server Actions, RSC requests, the API and static
// files go straight to the network.

const CACHE = "agenda-offline-v1";
const OFFLINE_URL = "/offline.html";
const ICON = "/icons/icon-192.png";
const BADGE = "/icons/badge-72.png";
const HOME = "/pwa";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, ICON]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

function readPush(event) {
  try {
    const { title, body, url, tag } = event.data.json();
    if (typeof title === "string" && typeof body === "string") return { title, body, url, tag };
  } catch {
    // Browsers require a notification for every push, readable or not.
  }
  return { title: "Agenda", body: "Há novidades na sua agenda.", url: HOME };
}

self.addEventListener("push", (event) => {
  const { title, body, url, tag } = readPush(event);
  event.waitUntil(self.registration.showNotification(title, { body, tag, icon: ICON, badge: BADGE, data: { url } }));
});

/** A path of this site, or the app's home: a payload never opens another site. */
function targetOf(url) {
  const path = typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : HOME;
  return new URL(path, self.location.origin).href;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = targetOf(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((candidate) => candidate.url === target);
      return open ? open.focus() : self.clients.openWindow(target);
    }),
  );
});
