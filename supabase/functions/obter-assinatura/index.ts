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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2.49.1"
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ erro: "Supabase não configurado na function." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const token = String(body?.token ?? "").trim();
    if (!token || token.length < 32) {
      return jsonResponse({ erro: "Token inválido." }, 400);
    }

    const { data: row, error } = await admin
      .from("pedido_assinaturas")
      .select(
        "id, simulation_id, status, expires_at, pdf_original_path, pdf_signed_path, pedido_snapshot, signer_name, signed_at",
      )
      .eq("token", token)
      .maybeSingle();

    if (error) {
      return jsonResponse({ erro: error.message }, 500);
    }
    if (!row) {
      return jsonResponse({ erro: "Link não encontrado." }, 404);
    }

    let status = row.status;
    if (
      status === "pending" &&
      row.expires_at &&
      new Date(row.expires_at).getTime() < Date.now()
    ) {
      await admin
        .from("pedido_assinaturas")
        .update({ status: "expired" })
        .eq("id", row.id)
        .eq("status", "pending");
      status = "expired";
    }

    if (status !== "pending" && status !== "signed") {
      return jsonResponse({
        ok: true,
        status,
        erro:
          status === "expired"
            ? "Este link expirou."
            : status === "revoked"
            ? "Este link foi revogado."
            : "Link indisponível.",
      });
    }

    const path =
      status === "signed" && row.pdf_signed_path
        ? row.pdf_signed_path
        : row.pdf_original_path;

    if (!path) {
      return jsonResponse({ erro: "Documento indisponível." }, 404);
    }

    const wantsPdf = body?.as === "pdf" || body?.format === "pdf";
    if (wantsPdf) {
      const { data: file, error: dlError } = await admin.storage
        .from("pedido-documentos")
        .download(path);
      if (dlError || !file) {
        return jsonResponse(
          { erro: dlError?.message ?? "Falha ao obter documento." },
          500,
        );
      }
      return new Response(file, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="pedido.pdf"',
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    const { data: signed, error: signedError } = await admin.storage
      .from("pedido-documentos")
      .createSignedUrl(path, 60 * 10);

    if (signedError || !signed?.signedUrl) {
      return jsonResponse(
        { erro: signedError?.message ?? "Falha ao obter documento." },
        500,
      );
    }

    const snapshot = row.pedido_snapshot;
    const clientNome =
      snapshot && typeof snapshot === "object"
        ? String(
          (snapshot as { client?: { nome?: string } }).client?.nome ?? "",
        ).trim() || null
        : null;

    return jsonResponse({
      ok: true,
      status,
      expires_at: row.expires_at,
      signed_at: row.signed_at,
      signer_name: row.signer_name,
      client_nome: clientNome,
      pdf_url: signed.signedUrl,
      pedido_snapshot: status === "pending" ? snapshot : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao obter assinatura.";
    return jsonResponse({ erro: msg }, 500);
  }
});
