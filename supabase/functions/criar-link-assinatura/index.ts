const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeBase64(data: string): Uint8Array {
  const cleaned = String(data ?? "").replace(/^data:[^;]+;base64,/, "").trim();
  if (!cleaned) throw new Error("PDF vazio.");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function bearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function parseCreateBody(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const simulationId = String(form.get("simulation_id") ?? "").trim();
    const expiresDays = Number(form.get("expires_days") || 7);
    const snapshotRaw = String(form.get("pedido_snapshot") ?? "");
    let snapshot: unknown = null;
    try {
      snapshot = snapshotRaw ? JSON.parse(snapshotRaw) : null;
    } catch {
      throw new Error("pedido_snapshot inválido.");
    }

    const pdfEntry = form.get("pdf");
    let pdfBytes: Uint8Array | null = null;
    if (pdfEntry instanceof File) {
      pdfBytes = new Uint8Array(await pdfEntry.arrayBuffer());
    } else if (typeof pdfEntry === "string" && pdfEntry) {
      pdfBytes = decodeBase64(pdfEntry);
    }

    return { simulationId, expiresDays, snapshot, pdfBytes };
  }

  const body = await req.json();
  const simulationId = String(body?.simulation_id ?? "").trim();
  const expiresDays = Number(body?.expires_days || 7);
  const snapshot = body?.pedido_snapshot;
  const pdfBytes = body?.pdf_base64
    ? decodeBase64(String(body.pdf_base64))
    : null;

  return { simulationId, expiresDays, snapshot, pdfBytes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2.49.1"
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SECRET_KEY") ??
      "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ erro: "Supabase não configurado na function." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const jwt = bearerToken(req);
    if (!jwt) {
      return jsonResponse({ erro: "Não autenticado." }, 401);
    }

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(jwt);
    if (userError || !user) {
      return jsonResponse(
        { erro: userError?.message || "Não autenticado." },
        401,
      );
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      return jsonResponse({ erro: profileError.message }, 500);
    }
    const role = profile?.role;
    if (role !== "gestor" && role !== "consultor") {
      return jsonResponse({ erro: "Sem permissão." }, 403);
    }

    const { simulationId, expiresDays, snapshot, pdfBytes } =
      await parseCreateBody(req);
    const expires = Math.min(Math.max(expiresDays || 7, 1), 30);

    if (!simulationId) {
      return jsonResponse({ erro: "simulation_id obrigatório." }, 400);
    }
    if (!pdfBytes || pdfBytes.byteLength < 100) {
      return jsonResponse({ erro: "PDF obrigatório ou inválido." }, 400);
    }
    if (!snapshot || typeof snapshot !== "object") {
      return jsonResponse({ erro: "pedido_snapshot obrigatório." }, 400);
    }

    const { data: simulation, error: simError } = await admin
      .from("simulations")
      .select("id, user_id, status")
      .eq("id", simulationId)
      .maybeSingle();
    if (simError) {
      return jsonResponse({ erro: simError.message }, 500);
    }
    if (!simulation) {
      return jsonResponse({ erro: "Pedido não encontrado." }, 404);
    }
    if (role === "consultor" && simulation.user_id !== user.id) {
      return jsonResponse({ erro: "Sem permissão neste pedido." }, 403);
    }

    const orderStatuses = [
      "order_pending",
      "converted",
      "order_rejected",
      "cancelled",
    ];
    if (!orderStatuses.includes(String(simulation.status))) {
      return jsonResponse(
        {
          erro:
            "Só é possível gerar link para simulações já convertidas em pedido.",
        },
        400,
      );
    }

    await admin
      .from("pedido_assinaturas")
      .update({ status: "revoked" })
      .eq("simulation_id", simulationId)
      .eq("status", "pending");

    const id = crypto.randomUUID();
    const token = randomToken();
    const expiresAt = new Date(
      Date.now() + expires * 24 * 60 * 60 * 1000,
    ).toISOString();
    const pdfPath = `${simulationId}/${id}/original.pdf`;
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });

    const { error: uploadError } = await admin.storage
      .from("pedido-documentos")
      .upload(pdfPath, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: "3600",
      });
    if (uploadError) {
      return jsonResponse(
        {
          erro: `Falha ao salvar PDF: ${uploadError.message}`,
          detalhe: uploadError,
        },
        500,
      );
    }

    const { data: row, error: insertError } = await admin
      .from("pedido_assinaturas")
      .insert({
        id,
        simulation_id: simulationId,
        token,
        status: "pending",
        expires_at: expiresAt,
        pdf_original_path: pdfPath,
        pedido_snapshot: snapshot,
        created_by: user.id,
      })
      .select(
        "id, simulation_id, token, status, expires_at, pdf_original_path, created_at",
      )
      .single();

    if (insertError) {
      return jsonResponse({ erro: insertError.message }, 500);
    }

    return jsonResponse({ ok: true, assinatura: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar link.";
    return jsonResponse({ erro: msg }, 500);
  }
});
