import { formatProdutoDisplayNome } from '../constants/mapeamentoCampos'
import { formatBRL } from './money'
import { roundMoney } from './roundMoney'

const AVISO_VARIACAO_CAMBIAL =
  'Os preços estão sujeitos a alterações devido a variação cambial ou por retiradas de listas.'

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

function whatsappBold(value) {
  const text = normalizePart(value) || '—'
  return `*${text}*`
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

function formatDestinoCif(simulation, client) {
  const destinoFrete = normalizePart(simulation?.destino_frete)
  if (destinoFrete) return destinoFrete

  const municipio =
    normalizePart(simulation?.pedido_municipio) ||
    normalizePart(client?.municipio)
  const uf =
    normalizePart(simulation?.pedido_uf) || normalizePart(client?.uf)
  const municipioUf = [municipio, uf].filter(Boolean).join(' / ')
  if (municipioUf) return municipioUf

  return '—'
}

function formatTipoEntregaLine(simulation, client) {
  const tipo = String(simulation?.tipo_frete ?? '').toUpperCase()
  if (tipo === 'CIF') {
    return `Tipo de entrega: CIF (destino: ${formatDestinoCif(simulation, client)})`
  }
  if (tipo === 'FOB') return 'Tipo de entrega: FOB'
  return `Tipo de entrega: ${tipo || '—'}`
}

function formatItemBlock(item) {
  const cultura = normalizePart(item.cultura) || '—'
  const volume = formatVolumeTon(item.volume)
  const produto = productDisplayNome(item)
  const vu = roundMoney(Number(item.proposta) || 0)
  const vt = roundMoney(vu * (Number(item.volume) || 0))
  return [
    `Cultura: ${cultura}`,
    `Volume: ${volume}`,
    `Produto: ${produto}`,
    `Val. Unt.: ${whatsappBold(formatBRL(vu))}`,
    `Val. Tot.: ${whatsappBold(formatBRL(vt))}`,
  ]
}

/**
 * Mensagem de cotação pronta para copiar (WhatsApp / texto).
 * @param {{ simulation: object, client: object, items?: object[] }} bundle
 */
export function formatPedidoCotacaoMensagem(bundle) {
  if (!bundle?.simulation || !bundle?.client) return ''

  const { simulation, client } = bundle
  const items = (bundle.items ?? []).filter((it) => it.product_id)
  const clienteNome = normalizePart(client.nome) || '—'

  const lines = [
    'Cotação:',
    '',
    `Cliente: ${whatsappBold(clienteNome)}`,
    `Data de vencimento: ${formatDateBr(simulation.data_pagamento)}`,
    formatTipoEntregaLine(simulation, client),
  ]

  if (items.length === 0) {
    lines.push('', '(Nenhum item)', '', AVISO_VARIACAO_CAMBIAL)
    return lines.join('\n')
  }

  for (const item of items) {
    lines.push('', ...formatItemBlock(item))
  }

  lines.push('', AVISO_VARIACAO_CAMBIAL)
  return lines.join('\n')
}
