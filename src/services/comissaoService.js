import { roundMoney } from '../utils/roundMoney'
import {
  calcComissaoLinha,
  calcComissaoValor,
  normalizeTipoComissao,
  toMargemPercentual,
} from '../utils/comissaoCalculations'
import { supabase } from './supabase'

const FAIXA_SELECT =
  'id, tipo_produto, margem_minima_percentual, comissao_percentual, ativo, updated_at'

/**
 * Lista faixas de comissão (ativas e inativas).
 * @param {{ tipoProduto?: string, apenasAtivas?: boolean }} [params]
 */
export async function fetchComissaoFaixas(params = {}) {
  let q = supabase
    .from('comissao_faixas')
    .select(FAIXA_SELECT)
    .order('tipo_produto', { ascending: true })
    .order('margem_minima_percentual', { ascending: true })

  if (params.tipoProduto) {
    q = q.eq('tipo_produto', normalizeTipoComissao(params.tipoProduto))
  }
  if (params.apenasAtivas) {
    q = q.eq('ativo', true)
  }

  const { data, error } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: data ?? [] }
}

/**
 * Atualiza uma faixa existente (margem mínima e/ou % de comissão e/ou ativo).
 */
export async function updateComissaoFaixa(id, patch = {}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session?.user) {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  }

  const payload = {
    updated_at: new Date().toISOString(),
    updated_by: session.user.id,
  }

  if (patch.margem_minima_percentual !== undefined) {
    const margem = Number(patch.margem_minima_percentual)
    if (!Number.isFinite(margem) || margem < 0) {
      return { ok: false, error: 'Informe uma margem mínima válida (≥ 0).' }
    }
    payload.margem_minima_percentual = margem
  }

  if (patch.comissao_percentual !== undefined) {
    const comissao = Number(patch.comissao_percentual)
    if (!Number.isFinite(comissao) || comissao < 0) {
      return { ok: false, error: 'Informe um percentual de comissão válido (≥ 0).' }
    }
    payload.comissao_percentual = comissao
  }

  if (patch.ativo !== undefined) {
    payload.ativo = Boolean(patch.ativo)
  }

  const { data, error } = await supabase
    .from('comissao_faixas')
    .update(payload)
    .eq('id', id)
    .select(FAIXA_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'Já existe uma faixa com essa margem mínima para este tipo.',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, row: data }
}

/**
 * Cria nova faixa (gestor).
 */
export async function createComissaoFaixa({
  tipo_produto,
  margem_minima_percentual,
  comissao_percentual,
} = {}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session?.user) {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  }

  const tipo = normalizeTipoComissao(tipo_produto)
  const margem = Number(margem_minima_percentual)
  const comissao = Number(comissao_percentual)

  if (!Number.isFinite(margem) || margem < 0) {
    return { ok: false, error: 'Informe uma margem mínima válida (≥ 0).' }
  }
  if (!Number.isFinite(comissao) || comissao < 0) {
    return { ok: false, error: 'Informe um percentual de comissão válido (≥ 0).' }
  }

  const { data, error } = await supabase
    .from('comissao_faixas')
    .insert({
      tipo_produto: tipo,
      margem_minima_percentual: margem,
      comissao_percentual: comissao,
      ativo: true,
      updated_by: session.user.id,
    })
    .select(FAIXA_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'Já existe uma faixa com essa margem mínima para este tipo.',
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, row: data }
}

/**
 * Remove faixa (gestor).
 */
export async function deleteComissaoFaixa(id) {
  const { error } = await supabase.from('comissao_faixas').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Upsert do registro de comissão do consultor a partir das linhas já calculadas.
 * @param {{
 *   simulationId: string,
 *   consultorId: string,
 *   status?: 'calculada' | 'confirmada' | 'cancelada',
 *   itens: Array<{
 *     simulationItemId?: string | null,
 *     productId?: string | null,
 *     classe?: string,
 *     volume?: number,
 *     proposta?: number,
 *     margemPercentual?: number | null,
 *     comissaoPercentual?: number,
 *     comissaoValor?: number,
 *     baseCalculo?: number,
 *   }>
 * }} input
 */
export async function upsertComissaoRegistro(input) {
  const simulationId = input?.simulationId
  const consultorId = input?.consultorId
  if (!simulationId || !consultorId) {
    return { ok: false, error: 'Simulação e consultor são obrigatórios para a comissão.' }
  }

  const itens = Array.isArray(input.itens) ? input.itens : []
  const status = input.status ?? 'calculada'

  let baseTotal = 0
  let comissaoTotal = 0
  let margemAcum = 0
  let margemPeso = 0

  const itensPayload = itens.map((item) => {
    const base =
      item.baseCalculo != null
        ? roundMoney(Number(item.baseCalculo))
        : roundMoney(Number(item.volume ?? 0) * Number(item.proposta ?? 0))
    const valor =
      item.comissaoValor != null
        ? roundMoney(Number(item.comissaoValor))
        : 0
    const margem = toMargemPercentual(item.margemPercentual)
    baseTotal += base
    comissaoTotal += valor
    if (margem != null && base > 0) {
      margemAcum += margem * base
      margemPeso += base
    }
    return {
      simulation_item_id: item.simulationItemId ?? null,
      product_id: item.productId ?? null,
      classe: normalizeTipoComissao(item.classe),
      volume: item.volume != null ? Number(item.volume) : null,
      proposta_unitaria:
        item.proposta != null ? roundMoney(Number(item.proposta)) : null,
      base_calculo: base,
      margem_percentual: margem,
      comissao_percentual: Number(item.comissaoPercentual ?? 0),
      comissao_valor: valor,
    }
  })

  baseTotal = roundMoney(baseTotal)
  comissaoTotal = roundMoney(comissaoTotal)
  const margemMedia = margemPeso > 0 ? margemAcum / margemPeso : null

  const { data: existing, error: existingError } = await supabase
    .from('comissao_registros')
    .select('id')
    .eq('simulation_id', simulationId)
    .maybeSingle()

  if (existingError) return { ok: false, error: existingError.message }

  let registroId = existing?.id ?? null

  if (registroId) {
    const { error: updError } = await supabase
      .from('comissao_registros')
      .update({
        consultor_id: consultorId,
        base_calculo: baseTotal,
        comissao_valor: comissaoTotal,
        margem_media_percentual: margemMedia,
        status,
        calculado_em: new Date().toISOString(),
      })
      .eq('id', registroId)
    if (updError) return { ok: false, error: updError.message }

    const { error: delError } = await supabase
      .from('comissao_registro_itens')
      .delete()
      .eq('comissao_registro_id', registroId)
    if (delError) return { ok: false, error: delError.message }
  } else {
    const { data: inserted, error: insError } = await supabase
      .from('comissao_registros')
      .insert({
        simulation_id: simulationId,
        consultor_id: consultorId,
        base_calculo: baseTotal,
        comissao_valor: comissaoTotal,
        margem_media_percentual: margemMedia,
        status,
      })
      .select('id')
      .single()
    if (insError || !inserted) {
      return { ok: false, error: insError?.message ?? 'Falha ao criar registro de comissão.' }
    }
    registroId = inserted.id
  }

  if (itensPayload.length > 0) {
    const { error: itensError } = await supabase
      .from('comissao_registro_itens')
      .insert(
        itensPayload.map((row) => ({
          ...row,
          comissao_registro_id: registroId,
        })),
      )
    if (itensError) return { ok: false, error: itensError.message }
  }

  const { error: simError } = await supabase
    .from('simulations')
    .update({ comissao_valor_total: comissaoTotal })
    .eq('id', simulationId)
  if (simError) return { ok: false, error: simError.message }

  return {
    ok: true,
    registroId,
    comissaoValor: comissaoTotal,
    baseCalculo: baseTotal,
  }
}

/**
 * Recalcula e grava comissão a partir dos itens já salvos da simulação + faixas atuais.
 * Usado na conversão do pedido e como fallback quando o cliente não enviou os campos.
 */
export async function syncComissaoRegistroFromSimulation(
  simulationId,
  { status = 'calculada' } = {},
) {
  if (!simulationId) {
    return { ok: false, error: 'Simulação inválida.' }
  }

  const { data: sim, error: simError } = await supabase
    .from('simulations')
    .select('id, user_id, status')
    .eq('id', simulationId)
    .maybeSingle()

  if (simError) return { ok: false, error: simError.message }
  if (!sim) return { ok: false, error: 'Simulação não encontrada.' }

  const { data: items, error: itemsError } = await supabase
    .from('simulation_items')
    .select(
      'id, product_id, volume, proposta, produto_classe, margem_percentual, comissao_percentual, comissao_valor, produtos_oficiais(classe)',
    )
    .eq('simulation_id', simulationId)

  if (itemsError) return { ok: false, error: itemsError.message }

  const faixasRes = await fetchComissaoFaixas({ apenasAtivas: true })
  if (!faixasRes.ok) return faixasRes

  const itens = (items ?? []).map((row) => {
    const classe = normalizeTipoComissao(
      row.produto_classe ?? row.produtos_oficiais?.classe ?? 'Convencional',
    )
    const volume = Number(row.volume ?? 0)
    const proposta = Number(row.proposta ?? 0)
    const margemStored = toMargemPercentual(row.margem_percentual)

    // Se já há snapshot completo, respeita; senão recalcula % a partir da margem e faixas.
    if (
      row.comissao_percentual != null &&
      row.comissao_valor != null &&
      margemStored != null
    ) {
      return {
        simulationItemId: row.id,
        productId: row.product_id,
        classe,
        volume,
        proposta,
        margemPercentual: margemStored,
        comissaoPercentual: Number(row.comissao_percentual),
        comissaoValor: Number(row.comissao_valor),
        baseCalculo: roundMoney(volume * proposta),
      }
    }

    const calc = calcComissaoLinha({
      margem: margemStored,
      classe,
      volume,
      proposta,
      faixas: faixasRes.rows,
    })

    return {
      simulationItemId: row.id,
      productId: row.product_id,
      classe: calc.classe,
      volume,
      proposta,
      margemPercentual: calc.margemPercentual,
      comissaoPercentual: calc.comissaoPercentual,
      comissaoValor: calc.comissaoValor,
      baseCalculo: calc.baseCalculo,
    }
  })

  const registroStatus =
    status === 'confirmada' || sim.status === 'converted'
      ? 'confirmada'
      : status

  return upsertComissaoRegistro({
    simulationId: sim.id,
    consultorId: sim.user_id,
    status: registroStatus,
    itens,
  })
}

const REGISTRO_SELECT = `
  id,
  simulation_id,
  consultor_id,
  base_calculo,
  comissao_valor,
  margem_media_percentual,
  status,
  calculado_em,
  faixas_override,
  simulations ( id, status, total_proposta, created_at, clients ( nome ) )
`

/**
 * Lista registros de comissão (histórico gerado por simulação/pedido).
 * @param {{ consultorId?: string, status?: string }} [params]
 */
export async function fetchComissaoRegistros(params = {}) {
  let q = supabase
    .from('comissao_registros')
    .select(REGISTRO_SELECT)
    .order('calculado_em', { ascending: false })

  if (params.consultorId) {
    q = q.eq('consultor_id', params.consultorId)
  }
  if (params.status) {
    q = q.eq('status', params.status)
  }

  const { data, error } = await q
  if (error) return { ok: false, error: error.message }

  const rows = data ?? []
  const consultorIds = [...new Set(rows.map((r) => r.consultor_id).filter(Boolean))]
  let consultorNomeById = {}

  if (consultorIds.length > 0) {
    const { data: profs, error: pErr } = await supabase
      .from('profiles')
      .select('id, nome')
      .in('id', consultorIds)
    if (pErr) return { ok: false, error: pErr.message }
    consultorNomeById = Object.fromEntries(
      (profs ?? []).map((p) => [String(p.id), String(p.nome ?? '')]),
    )
  }

  return {
    ok: true,
    rows: rows.map((row) => ({
      ...row,
      consultor_nome: consultorNomeById[String(row.consultor_id)] || null,
    })),
  }
}

/**
 * Lista registros de comissão de um consultor.
 */
export async function fetchComissoesByConsultor(consultorId) {
  if (!consultorId) {
    return { ok: false, error: 'Consultor inválido.' }
  }
  return fetchComissaoRegistros({ consultorId })
}

async function requireGestorSession() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session?.user) {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle()

  if (profileError) return { ok: false, error: profileError.message }
  if (profile?.role !== 'gestor') {
    return {
      ok: false,
      error: 'Apenas gestores podem editar parâmetros de comissão do pedido.',
    }
  }

  return { ok: true, user: session.user }
}

/**
 * Normaliza lista de faixas para o formato persistido em faixas_override.
 * @param {Array<{ tipo_produto?: string, tipoProduto?: string, margem_minima_percentual?: number, margemMinimaPercentual?: number, comissao_percentual?: number, comissaoPercentual?: number }>} faixas
 */
export function normalizeFaixasOverride(faixas = []) {
  const rows = []
  const seen = new Set()

  for (const f of faixas ?? []) {
    const tipo = normalizeTipoComissao(f.tipo_produto ?? f.tipoProduto)
    const margem = Number(f.margem_minima_percentual ?? f.margemMinimaPercentual)
    const comissao = Number(f.comissao_percentual ?? f.comissaoPercentual)
    if (!Number.isFinite(margem) || margem < 0) continue
    if (!Number.isFinite(comissao) || comissao < 0) continue
    const key = `${tipo}:${margem}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      tipo_produto: tipo,
      margem_minima_percentual: margem,
      comissao_percentual: comissao,
      ativo: true,
    })
  }

  return rows.sort((a, b) => {
    if (a.tipo_produto !== b.tipo_produto) {
      return a.tipo_produto.localeCompare(b.tipo_produto, 'pt-BR')
    }
    return a.margem_minima_percentual - b.margem_minima_percentual
  })
}

/**
 * Detalhe do registro + faixas efetivas (override ou cópia das globais).
 * @param {string} registroId
 */
export async function fetchComissaoRegistroDetalhe(registroId) {
  if (!registroId) {
    return { ok: false, error: 'Registro de comissão inválido.' }
  }

  const { data: registro, error: regError } = await supabase
    .from('comissao_registros')
    .select(REGISTRO_SELECT)
    .eq('id', registroId)
    .maybeSingle()

  if (regError) return { ok: false, error: regError.message }
  if (!registro) {
    return { ok: false, error: 'Registro de comissão não encontrado.' }
  }

  let consultorNome = null
  if (registro.consultor_id) {
    const { data: prof, error: pErr } = await supabase
      .from('profiles')
      .select('nome')
      .eq('id', registro.consultor_id)
      .maybeSingle()
    if (pErr) return { ok: false, error: pErr.message }
    consultorNome = prof?.nome ? String(prof.nome) : null
  }

  const override = Array.isArray(registro.faixas_override)
    ? normalizeFaixasOverride(registro.faixas_override)
    : null

  let faixas = override
  let usingOverride = Boolean(override && override.length > 0)

  if (!usingOverride) {
    const globais = await fetchComissaoFaixas({ apenasAtivas: true })
    if (!globais.ok) return globais
    faixas = normalizeFaixasOverride(globais.rows)
    usingOverride = false
  }

  return {
    ok: true,
    registro: {
      ...registro,
      consultor_nome: consultorNome,
    },
    faixas,
    usingOverride,
  }
}

/**
 * Aplica faixas só neste registro: grava override, recalcula itens e totais.
 * @param {{
 *   registroId: string,
 *   faixas: Array<{ tipo_produto: string, margem_minima_percentual: number, comissao_percentual: number }>
 * }} input
 */
export async function applyComissaoRegistroFaixas(input) {
  const registroId = input?.registroId
  const faixas = normalizeFaixasOverride(input?.faixas)

  if (!registroId) {
    return { ok: false, error: 'Registro de comissão inválido.' }
  }
  if (faixas.length === 0) {
    return {
      ok: false,
      error: 'Informe ao menos uma faixa de margem × comissão.',
    }
  }

  const auth = await requireGestorSession()
  if (!auth.ok) return auth

  const { data: registro, error: regError } = await supabase
    .from('comissao_registros')
    .select('id, simulation_id')
    .eq('id', registroId)
    .maybeSingle()

  if (regError) return { ok: false, error: regError.message }
  if (!registro) {
    return { ok: false, error: 'Registro de comissão não encontrado.' }
  }

  const { data: itens, error: itensError } = await supabase
    .from('comissao_registro_itens')
    .select(
      'id, simulation_item_id, product_id, classe, volume, proposta_unitaria, base_calculo, margem_percentual',
    )
    .eq('comissao_registro_id', registroId)

  if (itensError) return { ok: false, error: itensError.message }

  let baseTotal = 0
  let comissaoTotal = 0
  let margemAcum = 0
  let margemPeso = 0

  const computed = (itens ?? []).map((item) => {
    const volume = Number(item.volume ?? 0)
    const proposta = Number(item.proposta_unitaria ?? 0)
    const calc = calcComissaoLinha({
      margem: item.margem_percentual,
      classe: item.classe,
      volume,
      proposta,
      faixas,
    })
    // Se volume/proposta faltarem, mantém base já gravada e recalcula só o %.
    const base =
      calc.baseCalculo > 0
        ? calc.baseCalculo
        : roundMoney(Number(item.base_calculo) || 0)
    const comissaoPercentual = calc.comissaoPercentual
    const comissaoValor =
      calc.baseCalculo > 0
        ? calc.comissaoValor
        : calcComissaoValor(base, comissaoPercentual)

    baseTotal += base
    comissaoTotal += comissaoValor
    if (calc.margemPercentual != null && base > 0) {
      margemAcum += calc.margemPercentual * base
      margemPeso += base
    }

    return {
      id: item.id,
      simulation_item_id: item.simulation_item_id,
      base_calculo: base,
      margem_percentual: calc.margemPercentual,
      comissao_percentual: comissaoPercentual,
      comissao_valor: comissaoValor,
    }
  })

  baseTotal = roundMoney(baseTotal)
  comissaoTotal = roundMoney(comissaoTotal)
  const margemMedia = margemPeso > 0 ? margemAcum / margemPeso : null

  for (const row of computed) {
    const { error: updError } = await supabase
      .from('comissao_registro_itens')
      .update({
        base_calculo: row.base_calculo,
        margem_percentual: row.margem_percentual,
        comissao_percentual: row.comissao_percentual,
        comissao_valor: row.comissao_valor,
      })
      .eq('id', row.id)
      .eq('comissao_registro_id', registroId)

    if (updError) return { ok: false, error: updError.message }
  }

  const { error: regUpdError } = await supabase
    .from('comissao_registros')
    .update({
      faixas_override: faixas,
      base_calculo: baseTotal,
      comissao_valor: comissaoTotal,
      margem_media_percentual: margemMedia,
      calculado_em: new Date().toISOString(),
    })
    .eq('id', registroId)

  if (regUpdError) return { ok: false, error: regUpdError.message }

  for (const row of computed) {
    if (!row.simulation_item_id) continue
    const { error: simItemError } = await supabase
      .from('simulation_items')
      .update({
        comissao_percentual: row.comissao_percentual,
        comissao_valor: row.comissao_valor,
        margem_percentual: row.margem_percentual,
      })
      .eq('id', row.simulation_item_id)

    if (simItemError) return { ok: false, error: simItemError.message }
  }

  if (registro.simulation_id) {
    const { error: simError } = await supabase
      .from('simulations')
      .update({ comissao_valor_total: comissaoTotal })
      .eq('id', registro.simulation_id)

    if (simError) return { ok: false, error: simError.message }
  }

  return {
    ok: true,
    comissaoValor: comissaoTotal,
    baseCalculo: baseTotal,
    faixas,
  }
}

/**
 * Agrega totais de comissão pelos status do Prompt 10.
 * Canceladas entram só em `cancelada` / `count` — não somam em `total`.
 * @param {Array<{ status?: string, comissao_valor?: number }>} registros
 */
export function aggregateComissaoTotais(registros = []) {
  let confirmada = 0
  let calculada = 0
  let cancelada = 0

  for (const row of registros) {
    const valor = Number(row.comissao_valor) || 0
    if (row.status === 'confirmada') confirmada += valor
    else if (row.status === 'calculada') calculada += valor
    else if (row.status === 'cancelada') cancelada += valor
  }

  return {
    confirmada: roundMoney(confirmada),
    calculada: roundMoney(calculada),
    cancelada: roundMoney(cancelada),
    total: roundMoney(confirmada + calculada),
    count: registros.length,
  }
}

/**
 * Valor e quantidade de vendas (pedidos convertidos) do consultor — total geral.
 * @param {string} consultorId
 */
export async function fetchConsultorVendasResumo(consultorId) {
  if (!consultorId) {
    return { ok: false, error: 'Consultor inválido.' }
  }

  const { data, error } = await supabase
    .from('simulations')
    .select('id, total_proposta')
    .eq('user_id', consultorId)
    .eq('status', 'converted')

  if (error) return { ok: false, error: error.message }

  const rows = data ?? []
  const valor = roundMoney(
    rows.reduce((acc, row) => acc + (Number(row.total_proposta) || 0), 0),
  )

  return {
    ok: true,
    quantidade: rows.length,
    valor,
  }
}
