import { supabase } from './supabase'

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function dateKey(value) {
  if (!value) return null
  return String(value).slice(0, 10)
}

export function mapFinanceiroRow(row) {
  if (!row) return null
  return {
    simulationId: row.simulation_id,
    identificacao: row.identificacao ?? '',
    clienteNome: row.cliente_nome ?? '—',
    consultorNome: row.consultor_nome ?? '—',
    consultorId: row.consultor_id ?? null,
    statusPedido: row.status_pedido ?? null,
    ativo: row.ativo !== false,
    valorDevido: num(row.valor_devido),
    valorRecebido: num(row.valor_recebido),
    saldo: num(row.saldo),
    vencimento: dateKey(row.vencimento),
    pagamento: row.pagamento ?? 'pendente',
    situacaoVencimento: row.situacao_vencimento ?? 'sem_data',
    quitado: Boolean(row.quitado),
    comissaoLiberada: Boolean(row.comissao_liberada),
    tituloId: row.titulo_id ?? null,
    versao: Number(row.versao ?? 0),
    valorCongelado: Boolean(row.valor_congelado),
    podeOperar: Boolean(row.pode_operar),
    podeReceber: Boolean(row.pode_receber),
    podeRenegociar: Boolean(row.pode_renegociar),
  }
}

function rpcUnavailable(error) {
  const msg = String(error?.message ?? '')
  return (
    error?.code === 'PGRST202'
    || /could not find the function|does not exist|schema cache/i.test(msg)
  )
}

function fail(error) {
  return {
    ok: false,
    unavailable: rpcUnavailable(error),
    error: error?.message || 'Não foi possível concluir a operação financeira.',
  }
}

export async function listarCarteiraFinanceira({
  busca = '',
  pagamento = '',
  vencimento = '',
} = {}) {
  const { data, error } = await supabase.rpc('listar_carteira_financeira', {
    p_busca: busca.trim() || null,
    p_pagamento: pagamento || null,
    p_vencimento: vencimento || null,
  })
  if (error) return { ...fail(error), rows: [] }
  return { ok: true, rows: (data ?? []).map(mapFinanceiroRow) }
}

export async function resumoFinanceiroPedidos(ids) {
  const clean = [...new Set((ids ?? []).filter(Boolean))]
  if (clean.length === 0) return { ok: true, rows: [] }
  const { data, error } = await supabase.rpc('resumo_financeiro_pedidos', {
    p_ids: clean,
  })
  if (error) return { ...fail(error), rows: [] }
  return { ok: true, rows: (data ?? []).map(mapFinanceiroRow) }
}

function mapRecebimento(row) {
  return {
    id: row.id,
    valor: num(row.valor),
    dataRecebimento: dateKey(row.data_recebimento),
    observacao: row.observacao ?? '',
    status: row.status,
    motivoEstorno: row.motivo_estorno ?? '',
    estornadoEm: row.estornado_em ?? null,
    criadoEm: row.criado_em ?? null,
    registradoPorNome: row.registrado_por_nome ?? '—',
  }
}

function mapEvento(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    valor: row.valor == null ? null : num(row.valor),
    vencimentoAnterior: dateKey(row.vencimento_anterior),
    vencimentoNovo: dateKey(row.vencimento_novo),
    observacao: row.observacao ?? '',
    criadoEm: row.criado_em ?? null,
    recebimentoId: row.recebimento_id ?? null,
    atorNome: row.ator_nome ?? '—',
  }
}

export async function obterPedidoFinanceiro(simulationId) {
  const { data, error } = await supabase.rpc('obter_pedido_financeiro', {
    p_simulation_id: simulationId,
  })
  if (error) return fail(error)
  const pedido = mapFinanceiroRow(data?.pedido)
  return {
    ok: true,
    pedido,
    recebimentos: (data?.recebimentos ?? []).map(mapRecebimento),
    eventos: (data?.eventos ?? []).map(mapEvento),
  }
}

export async function registrarRecebimento(input) {
  const { data, error } = await supabase.rpc('registrar_recebimento', {
    p_simulation_id: input.simulationId,
    p_valor: input.valor,
    p_data: input.data,
    p_observacao: input.observacao || null,
    p_idempotency_key: input.idempotencyKey,
    p_versao: input.versao,
  })
  if (error) return fail(error)
  return { ok: true, id: data?.id ?? null, repetido: Boolean(data?.repetido) }
}

export async function estornarRecebimento(input) {
  const { data, error } = await supabase.rpc('estornar_recebimento', {
    p_recebimento_id: input.recebimentoId,
    p_motivo: input.motivo,
    p_versao: input.versao,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) return fail(error)
  return { ok: true, id: data?.id ?? null, repetido: Boolean(data?.repetido) }
}

export async function renegociarVencimento(input) {
  const { data, error } = await supabase.rpc('renegociar_vencimento', {
    p_simulation_id: input.simulationId,
    p_vencimento: input.vencimento,
    p_observacao: input.observacao || null,
    p_versao: input.versao,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) return fail(error)
  return { ok: true, id: data?.id ?? null, repetido: Boolean(data?.repetido) }
}
