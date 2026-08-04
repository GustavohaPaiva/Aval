import { formatProdutoDisplayNome } from '../constants/mapeamentoCampos'
import { formatBRL } from './money'
import { roundMoney } from './roundMoney'

function formatDateBr(isoOrDate) {
  if (!isoOrDate) return '—'
  const raw = String(isoOrDate)
  const dayOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = dayOnly
    ? new Date(`${dayOnly[1]}-${dayOnly[2]}-${dayOnly[3]}T12:00:00`)
    : new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatVolumeTon(volume) {
  const n = Number(volume) || 0
  const formatted = Number.isInteger(n)
    ? String(n)
    : n.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      })
  return `${formatted} ton`
}

function normalizePart(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function pushUnique(parts, value) {
  const next = normalizePart(value)
  if (!next) return
  const key = next.toLocaleLowerCase('pt-BR')
  if (parts.some((p) => p.toLocaleLowerCase('pt-BR') === key)) return
  // Evita repetir trecho já contido em outra parte (ex.: destino = município).
  if (
    parts.some((p) => {
      const existing = p.toLocaleLowerCase('pt-BR')
      return existing.includes(key) || key.includes(existing)
    })
  ) {
    return
  }
  parts.push(next)
}

/**
 * Monta o endereço de entrega CIF com o máximo de informações disponíveis.
 */
export function buildEnderecoEntregaCif(simulation, client) {
  const parts = []
  pushUnique(parts, simulation?.fazenda)

  pushUnique(parts, client?.endereco)

  const municipio =
    normalizePart(simulation?.pedido_municipio) ||
    normalizePart(client?.municipio)
  const uf =
    normalizePart(simulation?.pedido_uf) || normalizePart(client?.uf)
  const municipioUf = [municipio, uf].filter(Boolean).join(' / ')
  pushUnique(parts, municipioUf)

  pushUnique(parts, simulation?.destino_frete)

  return parts.join(' · ') || '—'
}

function productDisplayNome(item) {
  if (!item?.product) return '—'
  const p = item.product
  return (
    formatProdutoDisplayNome({
      nome: p.nome,
      referencia_complementar: p.referencia_complementar,
      fornecedor_nome: p.fornecedor_nome,
    }) || '—'
  )
}

function formatFreteLine(simulation, client) {
  const tipo = String(simulation?.tipo_frete ?? '').toUpperCase()
  if (tipo === 'FOB') return 'FOB'
  if (tipo === 'CIF') {
    return `CIF — ${buildEnderecoEntregaCif(simulation, client)}`
  }
  return tipo || '—'
}

function formatItemLine(item) {
  const cultura = normalizePart(item.cultura) || '—'
  const volume = formatVolumeTon(item.volume)
  const produto = productDisplayNome(item)
  const vu = roundMoney(Number(item.proposta) || 0)
  const vt = roundMoney(vu * (Number(item.volume) || 0))
  return `${cultura} - ${volume} - ${produto} - VU: ${formatBRL(vu)} - VT: ${formatBRL(vt)}`
}

/**
 * Mensagem de cotação pronta para copiar (WhatsApp / texto).
 * @param {{ simulation: object, client: object, items?: object[] }} bundle
 */
export function formatPedidoCotacaoMensagem(bundle) {
  if (!bundle?.simulation || !bundle?.client) return ''

  const { simulation, client } = bundle
  const items = (bundle.items ?? []).filter((it) => it.product_id)

  const lines = [
    'Cotação:',
    '',
    `Cliente: ${normalizePart(client.nome) || '—'}`,
    `Data de vencimento: ${formatDateBr(simulation.data_pagamento)}`,
    formatFreteLine(simulation, client),
    '',
  ]

  if (items.length === 0) {
    lines.push('(Nenhum item)')
  } else {
    for (const item of items) {
      lines.push(formatItemLine(item))
    }
  }

  return lines.join('\n')
}
