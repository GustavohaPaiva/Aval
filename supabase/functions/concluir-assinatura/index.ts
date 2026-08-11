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
  if (!cleaned) throw new Error("Arquivo vazio.");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function digitsOnly(value: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function isValidCpf(digits: string) {
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === Number(digits[10]);
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
    const body = await req.json();
    const token = String(body?.token ?? "").trim();
    const signerName = String(body?.signer_name ?? "").trim();
    const signerCpf = digitsOnly(String(body?.signer_cpf ?? ""));
    const signatureBase64 = String(body?.signature_png_base64 ?? "").trim();
    const signedPdfBase64 = String(body?.signed_pdf_base64 ?? "").trim();

    if (!token || token.length < 32) {
      return jsonResponse({ erro: "Token inválido." }, 400);
    }
    if (signerName.length < 3) {
      return jsonResponse({ erro: "Informe o nome completo." }, 400);
    }
    if (!isValidCpf(signerCpf)) {
      return jsonResponse({ erro: "CPF inválido." }, 400);
    }
    if (!signatureBase64) {
      return jsonResponse({ erro: "Assinatura obrigatória." }, 400);
    }
    if (!signedPdfBase64) {
      return jsonResponse({ erro: "PDF assinado obrigatório." }, 400);
    }

    const { data: row, error } = await admin
      .from("pedido_assinaturas")
      .select("id, simulation_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      return jsonResponse({ erro: error.message }, 500);
    }
    if (!row) {
      return jsonResponse({ erro: "Link não encontrado." }, 404);
    }

    if (row.status !== "pending") {
      return jsonResponse(
        {
          erro:
            row.status === "signed"
              ? "Este pedido já foi assinado."
              : "Link indisponível para assinatura.",
        },
        409,
      );
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      await admin
        .from("pedido_assinaturas")
        .update({ status: "expired" })
        .eq("id", row.id)
        .eq("status", "pending");
      return jsonResponse({ erro: "Este link expirou." }, 410);
    }

    const signaturePath = `${row.simulation_id}/${row.id}/assinatura.png`;
    const signedPdfPath = `${row.simulation_id}/${row.id}/assinado.pdf`;

    const signatureBytes = decodeBase64(signatureBase64);
    const signedPdfBytes = decodeBase64(signedPdfBase64);
    const signatureBlob = new Blob([signatureBytes], { type: "image/png" });
    const signedPdfBlob = new Blob([signedPdfBytes], { type: "application/pdf" });

    const { error: sigUploadError } = await admin.storage
      .from("pedido-documentos")
      .upload(signaturePath, signatureBlob, {
        contentType: "image/png",
        upsert: true,
      });
    if (sigUploadError) {
      return jsonResponse(
        { erro: `Falha ao salvar assinatura: ${sigUploadError.message}` },
        500,
      );
    }

    const { error: pdfUploadError } = await admin.storage
      .from("pedido-documentos")
      .upload(signedPdfPath, signedPdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (pdfUploadError) {
      return jsonResponse(
        { erro: `Falha ao salvar PDF assinado: ${pdfUploadError.message}` },
        500,
      );
    }

    const signerIp =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const signerUa = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    const { data: updated, error: updateError } = await admin
      .from("pedido_assinaturas")
      .update({
        status: "signed",
        signer_name: signerName,
        signer_cpf: signerCpf,
        signature_image_path: signaturePath,
        pdf_signed_path: signedPdfPath,
        signed_at: new Date().toISOString(),
        signer_ip: signerIp,
        signer_user_agent: signerUa,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id, status, signed_at, signer_name")
      .maybeSingle();

    if (updateError) {
      return jsonResponse({ erro: updateError.message }, 500);
    }
    if (!updated) {
      return jsonResponse(
        { erro: "Este pedido já foi assinado por outra pessoa." },
        409,
      );
    }

    const { data: signedUrlData } = await admin.storage
      .from("pedido-documentos")
      .createSignedUrl(signedPdfPath, 60 * 10);

    return jsonResponse({
      ok: true,
      assinatura: updated,
      pdf_url: signedUrlData?.signedUrl ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao concluir assinatura.";
    return jsonResponse({ erro: msg }, 500);
  }
});
