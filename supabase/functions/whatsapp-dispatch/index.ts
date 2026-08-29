import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type OutboxRow = {
  id: string;
  phone_e164: string;
  message_type: "text" | "template";
  template_name: string | null;
  template_language: string | null;
  message_body: string | null;
  attempts: number;
};

const jsonHeaders = { "Content-Type": "application/json" };

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} não configurado.`);
  return value;
}

function metaPayload(row: OutboxRow) {
  const to = row.phone_e164.replace(/\D/g, "");
  if (row.message_type === "template") {
    return {
      messaging_product: "whatsapp", to, type: "template",
      template: { name: row.template_name, language: { code: row.template_language } },
    };
  }
  return {
    messaging_product: "whatsapp", recipient_type: "individual", to, type: "text",
    text: { preview_url: false, body: row.message_body },
  };
}

function retryDelayMinutes(attempts: number) {
  return Math.min(2 ** Math.max(attempts - 1, 0), 60);
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers: jsonHeaders });
  }

  try {
    if (req.headers.get("x-dispatch-secret") !== requiredEnv("WHATSAPP_DISPATCH_SECRET")) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), { status: 401, headers: jsonHeaders });
    }

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const accessToken = requiredEnv("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = requiredEnv("WHATSAPP_PHONE_NUMBER_ID");
    const graphVersion = requiredEnv("WHATSAPP_GRAPH_API_VERSION");
    const requestBody = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(Number(requestBody?.batch_size) || 20, 1), 100);
    const { data, error } = await supabase.rpc("claim_whatsapp_outbox", { p_batch_size: batchSize });
    if (error) throw new Error(`Falha ao reservar fila: ${error.message}`);

    const rows = (data ?? []) as OutboxRow[];
    const results = [];
    for (const row of rows) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(metaPayload(row)),
          },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error?.message ?? `Meta HTTP ${response.status}`).slice(0, 1000));
        }

        const { error: updateError } = await supabase.from("whatsapp_outbox").update({
          status: "sent", sent_at: new Date().toISOString(),
          meta_message_id: payload?.messages?.[0]?.id ?? null,
          processing_started_at: null, last_error: null,
        }).eq("id", row.id);
        if (updateError) throw updateError;
        results.push({ id: row.id, status: "sent" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha desconhecida";
        const terminal = row.attempts >= 5;
        await supabase.from("whatsapp_outbox").update({
          status: terminal ? "cancelled" : "failed",
          next_attempt_at: new Date(Date.now() + retryDelayMinutes(row.attempts) * 60_000).toISOString(),
          processing_started_at: null, last_error: message.slice(0, 1000),
        }).eq("id", row.id);
        results.push({ id: row.id, status: terminal ? "cancelled" : "failed" });
      }
    }

    return new Response(JSON.stringify({ claimed: rows.length, results }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});

