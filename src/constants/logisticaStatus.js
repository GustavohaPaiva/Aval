import { formatProdutoDisplayNome } from './mapeamentoCampos'
import {
  endOfWeekSaturday,
  formatDateOnly,
  startOfWeekSunday,
  toDateOnly,
} from '../utils/calendarWeek'

/** Estágios do Kanban. Independentes do status comercial da simulação. */
export const STATUS_LOGISTICA_CARTEIRA = 'carteira'
export const STATUS_LOGISTICA_PROGRAMADO = 'programado'
export const STATUS_LOGISTICA_EM_TRANSITO = 'em_transito'
export const STATUS_LOGISTICA_ENTREGUE = 'entregue'

export const LOGISTICA_STATUS_FLOW = [
  {
    id: STATUS_LOGISTICA_CARTEIRA,
    label: 'Carteira',
    hint: 'Saldo pronto para programar a entrega',
  },
  {
    id: STATUS_LOGISTICA_PROGRAMADO,
    label: 'Programado',
    hint: 'Entrega programada, ainda não saiu',
  },
  {
    id: STATUS_LOGISTICA_EM_TRANSITO,
    label: 'Em trânsito',
    hint: 'Carga a caminho do destino',
  },
  {
    id: STATUS_LOGISTICA_ENTREGUE,
    label: 'Entregue',
    hint: 'Entrega concluída',
  },
]

const STATUS_IDS = new Set(LOGISTICA_STATUS_FLOW.map((status) => status.id))

/** Status gravados antes da troca para Carteira / Programado / Em trânsito / Entregue. */
const LEGACY_STATUS_LOGISTICA = {
  aguardando_inicio: STATUS_LOGISTICA_CARTEIRA,
  em_andamento: STATUS_LOGISTICA_CARTEIRA,
  pedido_realizado: STATUS_LOGISTICA_PROGRAMADO,
  aguardando_recebimento: STATUS_LOGISTICA_EM_TRANSITO,
  concluido: STATUS_LOGISTICA_ENTREGUE,
}

export const LOGISTICA_COLUMN_CLASS = {
  carteira: 'border-slate-200/90 bg-slate-50/80',
  programado: 'border-sky-200/80 bg-sky-50/50',
  em_transito: 'border-violet-200/80 bg-violet-50/40',
  entregue: 'border-emerald-200/80 bg-emerald-50/50',
}

export const PRAZO_INDICADOR_LABEL = {
  vencido: 'Prazo vencido',
  esta_semana: 'Entrega nesta semana',
}

export function isStatusLogistica(value) {
  return STATUS_IDS.has(value)
}

export function normalizeStatusLogistica(value) {
  if (isStatusLogistica(value)) return value
  return LEGACY_STATUS_LOGISTICA[value] ?? STATUS_LOGISTICA_CARTEIRA
}

function chaveCard(row) {
  return row.cardId || row.simulationId
}

export function statusLogisticaLabel(value) {
  const id = normalizeStatusLogistica(value)
  return LOGISTICA_STATUS_FLOW.find((status) => status.id === id)?.label ?? id
}

/**
 * Mantém uma movimentação ainda não confirmada pelo retorno do servidor.
 * Quando o banco já devolve o mesmo status, a pendência é descartada.
 */
export function reconcilePedidosComPendencias(serverRows, pending) {
  const nextPending = new Map(pending)
  const rows = (serverRows ?? []).map((row) => {
    const chave = chaveCard(row)
    const overlay = nextPending.get(chave)
    if (!overlay) return row
    if (normalizeStatusLogistica(row.statusLogistica) === overlay.statusLogistica) {
      nextPending.delete(chave)
      return row
    }
    return { ...row, ...overlay }
  })
  return { rows, pending: nextPending }
}

export function groupPedidosPorStatus(rows) {
  const groups = Object.fromEntries(
    LOGISTICA_STATUS_FLOW.map((status) => [status.id, []]),
  )
  for (const row of rows ?? []) {
    groups[normalizeStatusLogistica(row.statusLogistica)].push(row)
  }
  return groups
}

/**
 * @param {string|null|undefined} prazoSemanaInicio domingo da semana de entrega
 * @param {string|null|undefined} statusLogistica
 * @param {Date} [hoje]
 * @returns {'vencido'|'esta_semana'|null}
 */
export function prazoIndicador(prazoSemanaInicio, statusLogistica, hoje = new Date()) {
  if (normalizeStatusLogistica(statusLogistica) === STATUS_LOGISTICA_ENTREGUE) return null
  const start = toDateOnly(startOfWeekSunday(prazoSemanaInicio))
  const end = endOfWeekSaturday(prazoSemanaInicio)
  const today = formatDateOnly(hoje)
  if (!start || !end || !today) return null
  if (end < today) return 'vencido'
  if (today >= start && today <= end) return 'esta_semana'
  return null
}

export function formatVolumeTon(volume) {
  const n = Number(volume)
  if (!Number.isFinite(n)) return '—'
  const formatted = Number.isInteger(n)
    ? String(n)
    : n.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      })
  return `${formatted} ton`
}

export function formatItemLinha(item) {
  const nome = formatProdutoDisplayNome({
    nome: item?.nome,
    referencia_complementar: item?.referenciaComplementar,
    fornecedor_nome: item?.fornecedorNome,
  })
  const volume = formatVolumeTon(item?.volume)
  if (!nome) return volume
  return `${nome} · ${volume}`
}

export function pedidoMatchesSearch(row, search) {
  const query = String(search ?? '').trim().toLowerCase()
  if (!query) return true
  const itens = (row?.itens ?? [])
    .map((item) =>
      [item?.nome, item?.referenciaComplementar, item?.fornecedorNome]
        .filter(Boolean)
        .join(' '),
    )
    .join(' ')
  const haystack = [
    row?.clientNome,
    row?.fazenda,
    row?.municipio,
    row?.uf,
    row?.simulationId,
    itens,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}
