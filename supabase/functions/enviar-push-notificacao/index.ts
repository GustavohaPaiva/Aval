import { createClient } from "npm:@supabase/supabase-js@2";
import { ApplicationServer, Urgency } from "jsr:@negrel/webpush@0.5.0";
import {
  buildPushPayload,
  canClaimDelivery,
  deliveryResultPatch,
  isUuid,
  notificationTargetPath,
} from "./pushLogic.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

let serverPromise = null;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  const len = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

function isServiceRole(bearer) {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!bearer || !expected) return false;
  return timingSafeEqual(bearer, expected);
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) throw new Error("Supabase admin não configurado.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + pad).replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function vapidConfigured() {
  const subject = Deno.env.get("VAPID_SUBJECT")?.trim() ?? "";
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim() ?? "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim() ?? "";
  const subjectOk = /^mailto:[^\s@]+@[^\s@]+$/.test(subject) ||
    /^https:\/\/\S+$/.test(subject);
  return Boolean(subjectOk && publicKey && privateKey);
}

async function getPushServer() {
  if (!serverPromise) {
    serverPromise = (async () => {
      const subject = Deno.env.get("VAPID_SUBJECT").trim();
      const publicRaw = base64UrlToBytes(Deno.env.get("VAPID_PUBLIC_KEY").trim());
      const privateRaw = base64UrlToBytes(Deno.env.get("VAPID_PRIVATE_KEY").trim());
      if (publicRaw.length !== 65 || publicRaw[0] !== 4) {
        throw new Error("VAPID_PUBLIC_KEY inválida");
      }
      if (privateRaw.length !== 32) throw new Error("VAPID_PRIVATE_KEY inválida");
      const x = bytesToBase64Url(publicRaw.slice(1, 33));
      const y = bytesToBase64Url(publicRaw.slice(33, 65));
      const d = bytesToBase64Url(privateRaw);
      const algorithm = { name: "ECDSA", namedCurve: "P-256" };
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x, y },
        algorithm,
        true,
        ["verify"],
      );
      const privateKey = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x, y, d },
        algorithm,
        true,
        ["sign"],
      );
      return await ApplicationServer.new({
        contactInformation: subject,
        vapidKeys: { publicKey, privateKey },
      });
    })().catch((error) => {
      serverPromise = null;
      throw error;
    });
  }
  return serverPromise;
}

async function getUser(authHeader) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon || !authHeader) return null;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

function isGoneError(error) {
  if (!error || typeof error !== "object") return false;
  if (typeof error.isGone === "function" && error.isGone()) return true;
  const status = error.response?.status ?? error.status;
  return status === 404 || status === 410;
}

async function listCandidates(admin, notificationId) {
  const nowIso = new Date().toISOString();
  if (notificationId) {
    const { data, error } = await admin
      .from("push_deliveries")
      .select(
        "id, notification_id, recipient_id, attempts, status, processing_started_at, next_attempt_at",
      )
      .eq("notification_id", notificationId)
      .limit(1);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [due, stale] = await Promise.all([
    admin
      .from("push_deliveries")
      .select(
        "id, notification_id, recipient_id, attempts, status, processing_started_at, next_attempt_at",
      )
      .in("status", ["pending", "failed"])
      .lt("attempts", 5)
      .lte("next_attempt_at", nowIso)
      .order("created_at", { ascending: true })
      .limit(20),
    admin
      .from("push_deliveries")
      .select(
        "id, notification_id, recipient_id, attempts, status, processing_started_at, next_attempt_at",
      )
      .eq("status", "processing")
      .lt("attempts", 5)
      .lt("processing_started_at", staleBefore)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);
  if (due.error) throw new Error(due.error.message);
  if (stale.error) throw new Error(stale.error.message);
  const byId = new Map();
  for (const row of [...(due.data ?? []), ...(stale.data ?? [])]) {
    byId.set(row.id, row);
  }
  return [...byId.values()].slice(0, 20);
}

async function claimRow(admin, row) {
  const nowMs = Date.now();
  if (!canClaimDelivery(row, nowMs)) return null;
  const { data, error } = await admin
    .from("push_deliveries")
    .update({
      status: "processing",
      attempts: row.attempts + 1,
      processing_started_at: new Date(nowMs).toISOString(),
      last_error: null,
    })
    .eq("id", row.id)
    .eq("status", row.status)
    .eq("attempts", row.attempts)
    .select("id, notification_id, recipient_id, attempts")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function patchDelivery(admin, id, patch) {
  const { error } = await admin.from("push_deliveries").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

async function sendOne(admin, claimed) {
  const { data: notification, error: notificationError } = await admin
    .from("notifications")
    .select("id, recipient_id, type, title, body, simulation_id")
    .eq("id", claimed.notification_id)
    .maybeSingle();
  if (notificationError) throw new Error(notificationError.message);
  if (!notification) {
    await patchDelivery(
      admin,
      claimed.id,
      deliveryResultPatch(claimed.attempts, "skipped", "notification_missing", Date.now()),
    );
    return { outcome: "skipped" };
  }

  const { data: eventType, error: eventError } = await admin
    .from("push_event_types")
    .select("enabled")
    .eq("event_type", notification.type)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);
  if (!eventType?.enabled) {
    await patchDelivery(
      admin,
      claimed.id,
      deliveryResultPatch(claimed.attempts, "skipped", "event_disabled", Date.now()),
    );
    return { outcome: "skipped" };
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("push_subscriptions")
    .update({ active: false, disabled_reason: "expired" })
    .eq("user_id", notification.recipient_id)
    .eq("active", true)
    .lt("expiration_time", nowIso);

  const { data: subscriptions, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count")
    .eq("user_id", notification.recipient_id)
    .eq("active", true);
  if (subsError) throw new Error(subsError.message);

  if (!subscriptions?.length) {
    await patchDelivery(
      admin,
      claimed.id,
      deliveryResultPatch(claimed.attempts, "skipped", "no_subscription", Date.now()),
    );
    return { outcome: "skipped" };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", notification.recipient_id)
    .maybeSingle();

  const payload = buildPushPayload({
    title: notification.title,
    body: notification.body,
    notificationId: notification.id,
    url: notificationTargetPath({
      type: notification.type,
      simulationId: notification.simulation_id,
      role: profile?.role ?? null,
    }),
  });
  const server = await getPushServer();
  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    try {
      const subscriber = server.subscribe({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      });
      await subscriber.pushTextMessage(JSON.stringify(payload), {
        ttl: 12 * 60 * 60,
        urgency: Urgency.High,
      });
      sent += 1;
      await admin
        .from("push_subscriptions")
        .update({
          failure_count: 0,
          last_success_at: new Date().toISOString(),
          last_failure_at: null,
        })
        .eq("id", subscription.id);
    } catch (error) {
      failed += 1;
      if (isGoneError(error)) {
        await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        continue;
      }
      const failureCount = Number(subscription.failure_count ?? 0) + 1;
      await admin
        .from("push_subscriptions")
        .update({
          failure_count: failureCount,
          last_failure_at: new Date().toISOString(),
          active: failureCount < 5,
          disabled_reason: failureCount >= 5 ? "failures" : null,
        })
        .eq("id", subscription.id);
    }
  }

  if (sent > 0) {
    await patchDelivery(
      admin,
      claimed.id,
      deliveryResultPatch(
        claimed.attempts,
        "sent",
        failed > 0 ? `partial_failure:${failed}` : null,
        Date.now(),
      ),
    );
    return { outcome: "sent", sent, failed };
  }

  await patchDelivery(
    admin,
    claimed.id,
    deliveryResultPatch(claimed.attempts, "failed", `push_failed:${failed}`, Date.now()),
  );
  return { outcome: "failed", sent, failed };
}

async function dispatch(admin, notificationId) {
  if (!vapidConfigured()) {
    const later = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    let update = admin
      .from("push_deliveries")
      .update({
        last_error: "vapid_not_configured",
        next_attempt_at: later,
      })
      .in("status", ["pending", "failed"]);
    if (notificationId) update = update.eq("notification_id", notificationId);
    await update;
    return { ok: false, error: "vapid_not_configured", processed: 0 };
  }

  const rows = await listCandidates(admin, notificationId);
  const results = [];
  for (const row of rows) {
    const claimed = await claimRow(admin, row);
    if (!claimed) {
      results.push({ notificationId: row.notification_id, outcome: "duplicate" });
      continue;
    }
    try {
      const result = await sendOne(admin, claimed);
      results.push({ notificationId: claimed.notification_id, ...result });
    } catch (error) {
      await patchDelivery(
        admin,
        claimed.id,
        deliveryResultPatch(
          claimed.attempts,
          "failed",
          error instanceof Error ? error.message : "push_failed",
          Date.now(),
        ),
      );
      results.push({
        notificationId: claimed.notification_id,
        outcome: "failed",
      });
    }
  }
  return { ok: true, processed: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  let body = {};
  try {
    const text = await req.text();
    if (text.length > 4000) return json(413, { error: "Pedido grande demais" });
    body = text ? JSON.parse(text) : {};
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  try {
    if (body.action === "vapid-public-key") {
      const user = await getUser(authHeader);
      if (!user) return json(401, { error: "Não autenticado" });
      const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim() ?? "";
      if (!publicKey) return json(503, { error: "Chave pública VAPID ausente" });
      return json(200, { publicKey });
    }

    if (!isServiceRole(bearer)) {
      return json(403, { error: "Sem permissão para enviar push" });
    }

    const admin = adminClient();
    if (body.action === "retry") return json(200, await dispatch(admin, null));
    if (isUuid(body.notification_id)) {
      return json(200, await dispatch(admin, body.notification_id));
    }
    return json(400, { error: "Pedido inválido" });
  } catch (error) {
    console.error("enviar-push-notificacao", error instanceof Error ? error.message : "erro");
    return json(500, { error: "Falha ao processar o push" });
  }
});
