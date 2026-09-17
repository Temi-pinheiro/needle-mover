/* Service worker for the midday nudge. Deliberately minimal — it exists to
   show one notification a day and open the app when it is clicked. */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Needle Mover", body: event.data.text(), url: "/" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Needle Mover", {
      body: payload.body ?? "",
      // A stable tag means a second nudge replaces the first rather than
      // stacking up behind it.
      tag: "needle-mover-nudge",
      renotify: false,
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Focus a tab that already has the app open rather than opening another.
      for (const client of windows) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
