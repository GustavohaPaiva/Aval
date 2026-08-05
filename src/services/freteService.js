import { FRETE_ORIGEM_VALUES } from '../constants/fretes'
import { normalizeFreteLocation, normalizeFreteValor } from '../utils/normalizeFrete'
import { supabase } from './supabase'

const DUPLICATE_ERROR =
  'Já existe um frete cadastrado para esta origem e destino.'

function mapFreteRow(row) {
  return {
    id: String(row.id),
    origem: String(row.origem ?? ''),
    destino: String(row.destino ?? ''),
    valor: Number(row.valor),
    ativo: Boolean(row.ativo),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function parseDbError(error) {
  if (!error) return 'Não foi possível concluir a operação.'
  if (error.code === '23505') return DUPLICATE_ERROR
  return error.message
}

function validateFreteOrigem(origem) {
  if (!FRETE_ORIGEM_VALUES.includes(origem)) {
    return { ok: false, error: 'Selecione uma origem de frete válida.' }
  }
  return { ok: true }
}

export async function fetchFretesList(params = {}) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 50))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('fretes')
    .select('id, origem, destino, valor, ativo, created_at, updated_at', {
      count: 'exact',
    })
    .neq('origem', 'FOB')
    .order('origem', { ascending: true })
    .order('destino', { ascending: true })
    .range(from, to)

  const origemSearch = (params.origemSearch ?? '').trim().replace(/[%_,]/g, ' ')
  const destinoSearch = (params.destinoSearch ?? '').trim().replace(/[%_,]/g, ' ')

  if (origemSearch) {
    q = q.ilike('origem', `%${origemSearch}%`)
  }

  if (destinoSearch) {
    q = q.ilike('destino', `%${destinoSearch}%`)
  }

  const { data, error, count } = await q
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    rows: (data ?? []).map(mapFreteRow),
    total: count ?? 0,
    page,
    pageSize,
  }
}

export async function findFreteDuplicate({ origem, destino, excludeId }) {
  const origemNorm = normalizeFreteLocation(origem)
  const destinoNorm = normalizeFreteLocation(destino)

  if (!origemNorm || !destinoNorm) {
    return { ok: false, error: 'Informe origem e destino.' }
  }

  let q = supabase
    .from('fretes')
    .select('id, origem, destino, valor')
    .eq('origem', origemNorm)
    .eq('destino', destinoNorm)
    .limit(1)

  if (excludeId) {
    q = q.neq('id', excludeId)
  }

  const { data, error } = await q.maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: true, duplicate: null }

  return { ok: true, duplicate: mapFreteRow(data) }
}

export async function createFrete(input) {
  const origem = normalizeFreteLocation(input.origem)
  const destino = normalizeFreteLocation(input.destino)
  const valor = normalizeFreteValor(input.valor)

  if (!origem || !destino) {
    return { ok: false, error: 'Informe origem e destino.' }
  }
  const origemCheck = validateFreteOrigem(origem)
  if (!origemCheck.ok) return origemCheck
  if (valor == null) {
    return { ok: false, error: 'Informe um valor válido (R$).' }
  }

  const duplicateCheck = await findFreteDuplicate({ origem, destino })
  if (!duplicateCheck.ok) return duplicateCheck
  if (duplicateCheck.duplicate) {
    return { ok: false, error: DUPLICATE_ERROR }
  }

  const { data, error } = await supabase
    .from('fretes')
    .insert({ origem, destino, valor })
    .select('id, origem, destino, valor, ativo, created_at, updated_at')
    .single()

  if (error) return { ok: false, error: parseDbError(error) }
  return { ok: true, frete: mapFreteRow(data) }
}

export async function updateFrete(id, input) {
  const origem = normalizeFreteLocation(input.origem)
  const destino = normalizeFreteLocation(input.destino)
  const valor = normalizeFreteValor(input.valor)

  if (!origem || !destino) {
    return { ok: false, error: 'Informe origem e destino.' }
  }
  const origemCheck = validateFreteOrigem(origem)
  if (!origemCheck.ok) return origemCheck
  if (valor == null) {
    return { ok: false, error: 'Informe um valor válido (R$).' }
  }

  const duplicateCheck = await findFreteDuplicate({
    origem,
    destino,
    excludeId: id,
  })
  if (!duplicateCheck.ok) return duplicateCheck
  if (duplicateCheck.duplicate) {
    return { ok: false, error: DUPLICATE_ERROR }
  }

  const { data, error } = await supabase
    .from('fretes')
    .update({ origem, destino, valor })
    .eq('id', id)
    .select('id, origem, destino, valor, ativo, created_at, updated_at')
    .single()

  if (error) return { ok: false, error: parseDbError(error) }
  return { ok: true, frete: mapFreteRow(data) }
}

export async function deleteFrete(id) {
  const { error } = await supabase.from('fretes').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function fetchFreteOrigensAtivas() {
  // Uma query por origem conhecida (limit 1) evita o teto de 1000 rows do
  // PostgREST — puxar todas as linhas só para montar o distinct cortava UBERABA.
  const values = []

  for (const origem of FRETE_ORIGEM_VALUES) {
    const { data, error } = await supabase
      .from('fretes')
      .select('origem')
      .eq('ativo', true)
      .eq('origem', origem)
      .limit(1)

    if (error) return { ok: false, error: error.message }
    if ((data ?? []).length > 0) values.push(origem)
  }

  return { ok: true, values }
}

export async function fetchFreteDestinosAtivos(origem) {
  const origemNorm = normalizeFreteLocation(origem)
  if (!origemNorm) return { ok: true, values: [] }

  const pageSize = 1000
  let from = 0
  const seen = new Set()

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('fretes')
      .select('destino')
      .eq('ativo', true)
      .eq('origem', origemNorm)
      .order('destino', { ascending: true })
      .range(from, to)

    if (error) return { ok: false, error: error.message }

    const rows = data ?? []
    for (const row of rows) {
      seen.add(String(row.destino))
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  return { ok: true, values: [...seen] }
}

export async function lookupFreteValor(origem, destino) {
  const result = await findFreteDuplicate({
    origem: normalizeFreteLocation(origem),
    destino: normalizeFreteLocation(destino),
  })
  if (!result.ok) return result
  if (!result.duplicate) {
    return { ok: false, error: 'Frete não encontrado para esta rota.' }
  }
  return { ok: true, frete: result.duplicate }
}

async function fetchAllFretesMap() {
  const pageSize = 1000
  let from = 0
  const map = new Map()

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('fretes')
      .select('id, origem, destino, valor')
      .order('id', { ascending: true })
      .range(from, to)

    if (error) return { ok: false, error: error.message }

    const rows = data ?? []
    for (const row of rows) {
      const key = `${row.origem}||${row.destino}`
      map.set(key, {
        id: String(row.id),
        origem: String(row.origem),
        destino: String(row.destino),
        valor: Number(row.valor),
      })
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  return { ok: true, map }
}

/**
 * Importa linhas já validadas: cria frete novo ou atualiza apenas o valor.
 * Erros por linha não interrompem o restante.
 *
 * @param {Array<{ origem: string, destino: string, valor: number, rowNumber?: number }>} rows
 * @param {{ onProgress?: (done: number, total: number) => void }} [options]
 */
export async function importFretesFromRows(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) {
    return {
      ok: true,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      failures: [],
    }
  }

  const existingResult = await fetchAllFretesMap()
  if (!existingResult.ok) return existingResult

  const existingMap = existingResult.map
  const failures = []
  let created = 0
  let updated = 0
  let unchanged = 0
  const total = list.length
  let done = 0

  const reportProgress = () => {
    options.onProgress?.(done, total)
  }

  reportProgress()

  for (const row of list) {
    const origem = normalizeFreteLocation(row.origem)
    const destino = normalizeFreteLocation(row.destino)
    const valor = normalizeFreteValor(row.valor)
    const rowNumber = row.rowNumber
    const key = `${origem}||${destino}`

    if (!origem || !destino || valor == null) {
      failures.push({
        rowNumber,
        origem,
        destino,
        error: 'Dados inválidos para importação.',
      })
      done += 1
      reportProgress()
      continue
    }

    const origemCheck = validateFreteOrigem(origem)
    if (!origemCheck.ok) {
      failures.push({
        rowNumber,
        origem,
        destino,
        error: origemCheck.error,
      })
      done += 1
      reportProgress()
      continue
    }

    const existing = existingMap.get(key)

    if (existing) {
      if (Number(existing.valor) === valor) {
        unchanged += 1
        done += 1
        reportProgress()
        continue
      }

      const { error } = await supabase
        .from('fretes')
        .update({ valor })
        .eq('id', existing.id)

      if (error) {
        failures.push({
          rowNumber,
          origem,
          destino,
          error: parseDbError(error),
        })
      } else {
        existing.valor = valor
        updated += 1
      }
    } else {
      const { data, error } = await supabase
        .from('fretes')
        .insert({ origem, destino, valor })
        .select('id, origem, destino, valor')
        .single()

      if (error) {
        // Corrida / duplicata: tenta atualizar o valor do registro existente
        if (error.code === '23505') {
          const retry = await findFreteDuplicate({ origem, destino })
          if (retry.ok && retry.duplicate) {
            if (Number(retry.duplicate.valor) === valor) {
              existingMap.set(key, {
                id: retry.duplicate.id,
                origem,
                destino,
                valor,
              })
              unchanged += 1
            } else {
              const { error: updateError } = await supabase
                .from('fretes')
                .update({ valor })
                .eq('id', retry.duplicate.id)

              if (updateError) {
                failures.push({
                  rowNumber,
                  origem,
                  destino,
                  error: parseDbError(updateError),
                })
              } else {
                existingMap.set(key, {
                  id: retry.duplicate.id,
                  origem,
                  destino,
                  valor,
                })
                updated += 1
              }
            }
          } else {
            failures.push({
              rowNumber,
              origem,
              destino,
              error: parseDbError(error),
            })
          }
        } else {
          failures.push({
            rowNumber,
            origem,
            destino,
            error: parseDbError(error),
          })
        }
      } else if (data) {
        existingMap.set(key, {
          id: String(data.id),
          origem: String(data.origem),
          destino: String(data.destino),
          valor: Number(data.valor),
        })
        created += 1
      }
    }

    done += 1
    reportProgress()
  }

  return {
    ok: true,
    created,
    updated,
    unchanged,
    failed: failures.length,
    failures,
  }
}
