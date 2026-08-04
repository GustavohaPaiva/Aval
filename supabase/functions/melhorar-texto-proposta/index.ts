import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL =
  Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-2.5-flash";

function montarPrompt(texto: string, maxLinhas: number) {
  return `Você é redator de propostas comerciais de insumos agrícolas no Brasil.

Reescreva o texto abaixo em português brasileiro claro, objetivo e profissional.
Corrija gramática, ortografia e pontuação. Melhore a fluidez sem mudar o sentido nem inventar informações.
Use tom adequado a observações de proposta comercial agrícola (objetivo, cordial e preciso).

Regras obrigatórias:
- Máximo ${maxLinhas} linhas (quebras de linha só entre frases completas).
- Cada linha deve ser uma frase completa terminada em . ! ou ?
- A última linha DEVE fechar o texto com pontuação final — nunca pare no meio de palavra ou frase.
- Se o conteúdo for longo, resuma reescrevendo de forma mais concisa; não truncar nem cortar.

Não use markdown, títulos, bullets, aspas envolvendo o texto inteiro nem explicações.
Retorne APENAS o texto final reescrito.

Texto original:
"""
${texto}
"""`;
}

function montarPromptAjuste(texto: string, maxLinhas: number) {
  return `Você é redator de propostas comerciais de insumos agrícolas no Brasil.

Ajuste o texto abaixo para caber em no máximo ${maxLinhas} linhas.
Mantenha tom formal e todas as informações essenciais.
Cada linha = frase completa (. ! ?). A última linha deve encerrar o texto com ponto final.
Nunca interrompa palavras ou frases no meio — se precisar encurtar, resuma com outras palavras.

Retorne APENAS o texto ajustado.

Texto:
"""
${texto}
"""`;
}

function linhaTerminaFrase(linha: string) {
  const t = String(linha ?? "").trim();
  if (!t) return true;
  return /[.!?…]["')\]]*$/.test(t);
}

function contarLinhas(texto: string) {
  const t = String(texto ?? "").replace(/\r\n/g, "\n").trim();
  if (!t) return 0;
  return t.split("\n").length;
}

function textoTerminaCompleto(texto: string) {
  const linhas = String(texto ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!linhas.length) return true;
  return linhaTerminaFrase(linhas[linhas.length - 1]);
}

function removerFinalIncompleto(texto: string) {
  const linhas = String(texto ?? "").replace(/\r\n/g, "\n").split("\n");
  while (linhas.length > 0 && !linhaTerminaFrase(linhas[linhas.length - 1])) {
    linhas.pop();
  }
  return linhas.join("\n").trim();
}

function precisaAjuste(texto: string, maxLinhas: number) {
  const t = String(texto ?? "").trim();
  if (!t) return false;
  return contarLinhas(t) > maxLinhas || !textoTerminaCompleto(t);
}

function limparTextoGemini(raw: string) {
  return String(raw ?? "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

async function gerarComGemini(apiKey: string, prompt: string) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const json = await res.json();
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw?.trim()) throw new Error("Gemini não retornou texto.");
  return limparTextoGemini(raw);
}

async function finalizarSugestao(
  apiKey: string,
  textoBruto: string,
  maxLinhas: number,
) {
  let texto = limparTextoGemini(textoBruto);

  if (precisaAjuste(texto, maxLinhas)) {
    texto = await gerarComGemini(apiKey, montarPromptAjuste(texto, maxLinhas));
  }

  texto = removerFinalIncompleto(texto);

  if (contarLinhas(texto) > maxLinhas) {
    texto = removerFinalIncompleto(
      await gerarComGemini(apiKey, montarPromptAjuste(texto, maxLinhas)),
    );
  }

  return texto;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { texto, maxLinhas = 10 } = await req.json();
    const original = String(texto ?? "").trim();
    if (!original) {
      return new Response(JSON.stringify({ erro: "Texto vazio." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          erro:
            "GEMINI_API_KEY não configurada no Supabase (Secrets da Edge Function).",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const max = Math.min(Math.max(Number(maxLinhas) || 10, 1), 20);
    const bruto = await gerarComGemini(apiKey, montarPrompt(original, max));
    const sugerido = await finalizarSugestao(apiKey, bruto, max);

    return new Response(
      JSON.stringify({
        sugerido,
        origem: "gemini",
        modelo: GEMINI_MODEL,
        aviso:
          "Sugestão gerada por IA (Google Gemini). Revise antes de aplicar.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao processar texto.";
    return new Response(JSON.stringify({ erro: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
