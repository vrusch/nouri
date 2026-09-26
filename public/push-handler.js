// Fáze C (REFERENCE/STRICT_COACHING_SPEC.md, sekce 7) — obsluha push notifikací ve stávajícím
// service workeru (vite-plugin-pwa ho sem natáhne přes workbox.importScripts). FCM SDK v SW
// záměrně není: server posílá data-only zprávu a notifikaci zobrazuje tenhle handler.
//
// KAŽDÝ push musí skončit zobrazenou notifikací, i když payload nejde přečíst — Safari/iOS
// tichý push trestá zrušením odběru.

const FALLBACK_NOTIFICATION = { title: "Nouri", body: "Mya ti něco připomíná — otevři appku.", kind: "generic", url: "/" };

function readPayload(event) {
  try {
    const raw = event.data ? event.data.json() : null;
    // FCM zabalí data zprávy do { data: {...} }; notifikační tvar ({ notification: {...} })
    // handler snese taky, kdyby se server někdy změnil.
    const data = (raw && (raw.data || raw.notification)) || raw || {};
    return {
      title: typeof data.title === "string" && data.title ? data.title : FALLBACK_NOTIFICATION.title,
      body: typeof data.body === "string" && data.body ? data.body : FALLBACK_NOTIFICATION.body,
      kind: typeof data.kind === "string" && data.kind ? data.kind : FALLBACK_NOTIFICATION.kind,
      url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : FALLBACK_NOTIFICATION.url,
    };
  } catch (error) {
    console.error("Push payload nejde přečíst:", error);
    return FALLBACK_NOTIFICATION;
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      // Stejný druh připomínky nahradí předchozí (nová připomínka vody přepíše starou).
      tag: `nouri-${payload.kind}`,
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        // Otevřená appka dostane cílovou adresu (zápis jídla) přes navigaci jen když to jde.
        if (url !== "/" && "navigate" in existing) await existing.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
