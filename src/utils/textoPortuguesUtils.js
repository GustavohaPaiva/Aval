export const MAX_LINHAS_TEXTO = 10;

function linhaTerminaFrase(linha) {
  const t = String(linha ?? "").trim();
  if (!t) return true;
  return /[.!?…]["')\]]*$/.test(t);
}

export function contarLinhasTexto(texto) {
  const t = String(texto ?? "").replace(/\r\n/g, "\n");
  if (!t) return 1;
  return t.split("\n").length;
}

export function limitarLinhasTexto(texto, maxLinhas = MAX_LINHAS_TEXTO) {
  return String(texto ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .slice(0, maxLinhas)
    .join("\n");
}

export function textoTerminaFraseCompleta(texto) {
  const linhas = String(texto ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!linhas.length) return true;
  return linhaTerminaFrase(linhas[linhas.length - 1]);
}

export function textoExcedeLinhas(texto, maxLinhas = MAX_LINHAS_TEXTO) {
  return contarLinhasTexto(texto) > maxLinhas;
}

export function precisaAjusteSugestaoIA(texto, maxLinhas = MAX_LINHAS_TEXTO) {
  const t = String(texto ?? "").trim();
  if (!t) return false;
  return textoExcedeLinhas(t, maxLinhas) || !textoTerminaFraseCompleta(t);
}

export function removerFinalIncompleto(texto) {
  const linhas = String(texto ?? "").replace(/\r\n/g, "\n").split("\n");
  while (linhas.length > 0 && !linhaTerminaFrase(linhas[linhas.length - 1])) {
    linhas.pop();
  }
  return linhas.join("\n").trim();
}
