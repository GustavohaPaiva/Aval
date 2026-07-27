/** Cache em memória: lista completa de municípios do Brasil (IBGE). */
let municipiosCache = null
let municipiosPromise = null

/**
 * @typedef {{ id: string, nome: string, uf: string, label: string, value: string }} MunicipioOption
 */

/**
 * Carrega todos os municípios do Brasil via API de Localidades do IBGE.
 * Resultado cacheado para a sessão do app.
 * @returns {Promise<{ ok: true, options: MunicipioOption[] } | { ok: false, error: string }>}
 */
export async function fetchMunicipiosBrasil() {
  if (municipiosCache) {
    return { ok: true, options: municipiosCache }
  }
  if (municipiosPromise) {
    try {
      const options = await municipiosPromise
      return { ok: true, options }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Falha ao carregar municípios.',
      }
    }
  }

  municipiosPromise = (async () => {
    const res = await fetch(
      'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome',
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) {
      throw new Error('Falha ao consultar municípios do IBGE. Tente novamente.')
    }
    const body = await res.json()
    if (!Array.isArray(body)) {
      throw new Error('Resposta inválida da API do IBGE.')
    }

    /** @type {MunicipioOption[]} */
    const options = []
    for (const row of body) {
      if (!row || typeof row !== 'object') continue
      const nome = String(row.nome ?? '').trim()
      if (!nome) continue
      const uf =
        row.microrregiao?.mesorregiao?.UF?.sigla ??
        row['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ??
        ''
      const ufNorm = String(uf).trim().toUpperCase()
      const id = String(row.id ?? '')
      const value = ufNorm ? `${nome}|${ufNorm}` : nome
      options.push({
        id,
        nome,
        uf: ufNorm,
        value,
        label: ufNorm ? `${nome} — ${ufNorm}` : nome,
      })
    }

    municipiosCache = options
    return options
  })()

  try {
    const options = await municipiosPromise
    return { ok: true, options }
  } catch (err) {
    municipiosPromise = null
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha ao carregar municípios.',
    }
  }
}

/**
 * Filtra opções de município (opcionalmente por UF).
 * @param {MunicipioOption[]} options
 * @param {string} [uf]
 */
export function filterMunicipiosByUf(options, uf) {
  const ufNorm = String(uf ?? '').trim().toUpperCase()
  if (!ufNorm) return options
  return options.filter((o) => o.uf === ufNorm)
}
