(() => {
  // supabase/functions/enviar-push-notificacao/pushLogic.js
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var STALE_PROCESSING_MS = 10 * 60 * 1e3;
  function isUuid(value) {
    return typeof value === "string" && UUID_RE.test(value);
  }
  function stripControls(value) {
    let out = "";
    for (const char of value) {
      const code = char.charCodeAt(0);
      out += code <= 31 || code === 127 ? " " : char;
    }
    return out;
  }
  function hasControlChar(value) {
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code <= 31 || code === 127) return true;
    }
    return false;
  }
  function clip(value, max) {
    if (typeof value !== "string") return "";
    const cleaned = stripControls(value).trim();
    if (cleaned.length <= max) return cleaned;
    return `${cleaned.slice(0, Math.max(0, max - 1))}\u2026`;
  }
  function safeNotificationPath(input) {
    if (typeof input !== "string") return "/notificacoes";
    const trimmed = input.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/notificacoes";
    if (trimmed.includes("\\") || trimmed.includes("://")) return "/notificacoes";
    if (hasControlChar(trimmed)) return "/notificacoes";
    let url;
    try {
      url = new URL(trimmed, "https://aval.local");
    } catch {
      return "/notificacoes";
    }
    if (url.origin !== "https://aval.local") return "/notificacoes";
    if (url.username || url.password) return "/notificacoes";
    return `${url.pathname}${url.search}${url.hash}`;
  }
  function urlWithinAppScope(path, scope) {
    const safe = safeNotificationPath(path);
    let base;
    try {
      base = new URL(scope);
    } catch {
      return safe;
    }
    const resolved = new URL(safe.replace(/^\//, ""), base);
    if (resolved.origin !== base.origin) return base.href;
    if (!resolved.pathname.startsWith(base.pathname)) return base.href;
    return resolved.href;
  }
  function displayFields({ title, body, notificationId, url }) {
    return {
      title: clip(title, 120) || "Aval",
      body: clip(body, 240),
      notificationId: isUuid(notificationId) ? notificationId : null,
      url: safeNotificationPath(url)
    };
  }
  function pathFromNavigate(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "https:") return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  function pushDisplayFromPayload(raw) {
    const data = raw && typeof raw === "object" ? raw : {};
    const note = data.web_push === 8030 && data.notification && typeof data.notification === "object" ? data.notification : null;
    const nested = note?.data && typeof note.data === "object" ? note.data : {};
    return displayFields({
      title: note?.title ?? data.title,
      body: note?.body ?? data.body,
      notificationId: nested.notificationId ?? data.notificationId,
      url: nested.url ?? data.url ?? pathFromNavigate(note?.navigate)
    });
  }

  // src/sw.js
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });
  self.addEventListener("push", (event) => {
    event.waitUntil(
      (async () => {
        let raw;
        try {
          raw = event.data ? event.data.json() : {};
        } catch {
          raw = { title: "Aval", body: "" };
        }
        const display = pushDisplayFromPayload(raw);
        const options = {
          body: display.body,
          lang: "pt-BR",
          data: {
            url: display.url,
            notificationId: display.notificationId
          }
        };
        if (display.notificationId) options.tag = `aval-${display.notificationId}`;
        const icon = new URL("apple-touch-icon.png", self.registration.scope).href;
        try {
          await self.registration.showNotification(display.title, { ...options, icon });
        } catch {
          await self.registration.showNotification(display.title, options);
        }
      })()
    );
  });
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const path = safeNotificationPath(event.notification?.data?.url);
    const targetUrl = urlWithinAppScope(path, self.registration.scope);
    event.waitUntil(
      (async () => {
        const windows = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true
        });
        for (const client of windows) {
          if (new URL(client.url).origin !== self.location.origin) continue;
          if (typeof client.focus === "function") await client.focus();
          if (typeof client.navigate === "function") {
            try {
              await client.navigate(targetUrl);
              return;
            } catch {
            }
          }
          client.postMessage({ type: "aval:push-navigate", url: path });
          return;
        }
        await self.clients.openWindow(targetUrl);
      })()
    );
  });
})();
