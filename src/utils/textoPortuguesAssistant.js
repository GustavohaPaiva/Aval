import {
  MAX_LINHAS_TEXTO,
  limitarLinhasTexto,
  precisaAjusteSugestaoIA,
  removerFinalIncompleto,
  textoExcedeLinhas,
} from "./textoPortuguesUtils";

const GEMINI_MODEL =
  import.meta.env.VITE_GEMINI_MODEL?.trim() || "gemini-2.5-flash";

function limparTextoGemini(raw) {
  return String(raw ?? "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function montarPromptGemini(texto, maxLinhas) {
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

function montarPromptAjuste(texto, maxLinhas) {
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

async function chamarGeminiDiretoPrompt(prompt) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;

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

async function finalizarSugestaoIA(textoBruto, maxLinhas, gerarPrompt) {
  let texto = limparTextoGemini(textoBruto);

  if (precisaAjusteSugestaoIA(texto, maxLinhas)) {
    const ajustado = await gerarPrompt(montarPromptAjuste(texto, maxLinhas));
    if (ajustado) texto = limparTextoGemini(ajustado);
  }

  texto = removerFinalIncompleto(texto);

  if (textoExcedeLinhas(texto, maxLinhas)) {
    const resumido = await gerarPrompt(montarPromptAjuste(texto, maxLinhas));
    if (resumido) texto = removerFinalIncompleto(limparTextoGemini(resumido));
  }

  return texto;
}

async function chamarGeminiDireto(texto, maxLinhas) {
  const gerar = (prompt) => chamarGeminiDiretoPrompt(prompt);
  const bruto = await gerar(montarPromptGemini(texto, maxLinhas));
  if (!bruto) return null;
  return finalizarSugestaoIA(bruto, maxLinhas, gerar);
}

function limpezaBasicaLocal(texto) {
  let t = String(texto ?? "").trim();
  if (!t) return t;
  t = t.replace(/\s+/g, " ");
  t = t.replace(/\s+([,.;:!?])/g, "$1");
  t = t.replace(/([.!?])([^\s\n])/g, "$1 $2");
  if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

export function geminiConfigurado() {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY?.trim());
}

/**
 * Melhora texto com IA generativa (Gemini via VITE_GEMINI_API_KEY).
 */
export async function melhorarTextoPortugues(
  texto,
  { contexto: _contexto = "simulacao", maxLinhas = MAX_LINHAS_TEXTO } = {},
) {
  const original = String(texto ?? "").trim();
  if (!original) {
    return { sugerido: "", origem: "nenhuma" };
  }

  if (!geminiConfigurado()) {
    return {
      sugerido: "",
      origem: "nenhuma",
      aviso:
        "Configure VITE_GEMINI_API_KEY e VITE_GEMINI_MODEL no .env e reinicie o servidor de desenvolvimento.",
    };
  }

  try {
    const direto = await chamarGeminiDireto(original, maxLinhas);
    if (direto) {
      return {
        sugerido: direto,
        origem: "gemini",
        modelo: GEMINI_MODEL,
        aviso:
          "Sugestão gerada por IA (Google Gemini). Revise antes de aplicar.",
      };
    }
  } catch (geminiErr) {
    console.warn("[melhorarTexto] Gemini:", geminiErr);
  }

  const local = limpezaBasicaLocal(original);
  return {
    sugerido: limitarLinhasTexto(local, maxLinhas),
    origem: "local",
    aviso:
      "IA indisponível. Aplicamos apenas ajustes básicos — revise antes de usar.",
  };
}
