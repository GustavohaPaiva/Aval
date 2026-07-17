import { supabase } from './supabase'
import { CATALOG_PRODUCTS } from '../constants/catalogProducts'
import { lookupFreteValor } from './freteService'

/**
 * Busca produtos oficiais ativos para o simulador.
 * Quarter é obrigatório; filtra também por estado quando informado.
 */
export async function fetchCatalogoSimulador({ quarter, estado } = {}) {
  if (!quarter) {
    return { ok: true, rows: [] }
  }

  let query = supabase
    .from('produtos_oficiais')
    .select(
      'id, nome, referencia_complementar, fornecedor_id, estado, classe, quarter, moeda_origem, preco_original, desconto_usd, preco_interno_calculado, custo_icms, vencimento_lista, ativo, fornecedores(nome)',
    )
    .eq('ativo', true)
    .ilike('quarter', `${quarter}%`)
    .order('nome', { ascending: true })

  if (estado) {
    query = query.eq('estado', estado)
  }

  const { data, error } = await query

  if (error) return { ok: false, error: error.message }

  const rows = (data ?? []).map((p) => {
    const fornecedorNome = p.fornecedores?.nome ?? ''
    const displayNome = [p.nome, p.referencia_complementar, fornecedorNome]
      .filter((x) => String(x ?? '').trim())
      .join(' · ')

    const custoUsd = Number(p.preco_original ?? 0)
    const descontoUsd = Number(p.desconto_usd ?? 0)
    const custoBrl = Number(p.preco_interno_calculado ?? 0)
    const liquidoUsd = custoUsd - descontoUsd
    const taxa = liquidoUsd > 0 ? custoBrl / liquidoUsd : 0

    return {
      id: p.id,
      nome: p.nome,
      displayNome,
      referenciaComplementar: p.referencia_complementar ?? '',
      fornecedorNome,
      estado: p.estado,
      classe: p.classe,
      quarter: p.quarter,
      moedaOrigem: p.moeda_origem,
      custoUsd,
      descontoUsd,
      taxa,
      custoBrl,
      custoIcms: Number(p.custo_icms ?? p.preco_interno_calculado * 0.96),
      vencimentoLista: p.vencimento_lista ?? '',
    }
  })

  return { ok: true, rows }
}

/** Fallback para dev quando não há produtos lançados. */
export function getFallbackCatalog() {
  return CATALOG_PRODUCTS.map((p) => ({
    ...p,
    displayNome: p.nome,
    referenciaComplementar: '',
    fornecedorNome: '',
    estado: 'MG',
    classe: 'Convencional',
    moedaOrigem: 'BRL',
    custoUsd: p.precoBase,
    descontoUsd: 0,
    taxa: 1,
    custoBrl: p.precoBase,
    custoIcms: p.precoBase * 0.96,
    vencimentoLista: '',
  }))
}

export async function fetchFreteValor(origem, destino) {
  if (!String(origem ?? '').trim() || !String(destino ?? '').trim()) {
    return { ok: true, valor: 0 }
  }
  const res = await lookupFreteValor(origem, destino)
  if (!res.ok) return { ok: true, valor: 0 }
  return { ok: true, valor: res.frete.valor }
}
