import { roundMoney } from '../utils/roundMoney'
import {
  calcComissaoLinha,
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

/**
 * Lista registros de comissão de um consultor (para a futura tela de detalhe).
 */
export async function fetchComissoesByConsultor(consultorId) {
  if (!consultorId) {
    return { ok: false, error: 'Consultor inválido.' }
  }

  const { data, error } = await supabase
    .from('comissao_registros')
    .select(
      `
      id,
      simulation_id,
      consultor_id,
      base_calculo,
      comissao_valor,
      margem_media_percentual,
      status,
      calculado_em,
      simulations ( id, status, total_proposta, created_at, clients ( nome ) )
    `,
    )
    .eq('consultor_id', consultorId)
    .order('calculado_em', { ascending: false })

  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: data ?? [] }
}
