/**
 * Mesma regra da rotina diária notificacoes.avisar_vencimentos_financeiros.
 * O saldo segue classificarFinanceiro / financeiro_classificar, sem alterá-lo.
 * O envio real é o INSERT em public.notifications; o push sai pelo gatilho
 * notifications_enqueue_web_push.
 */

import { classificarFinanceiro, dateKey } from '../utils/financeiroSituacao'

export const AVISO_VENCIMENTO_TIPO = 'pagamento_vencimento'
export const AVISO_VENCIMENTO_TITULO = 'Pagamento próximo do vencimento'
export const DIAS_AVISO_VENCIMENTO = 3

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

function addDays(iso, days) {
  const match = DATE_KEY.exec(iso)
  if (!match) return null
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** R$ 1.234,56 — o mesmo agrupamento de notificacoes.formatar_brl. */
export function formatarBrl(valor) {
  const cents = Math.round(Number(valor) * 100)
  if (!Number.isFinite(cents)) return 'R$ 0,00'
  const negative = cents < 0
  const abs = Math.abs(cents)
  const inteiro = String(Math.trunc(abs / 100))
  const decimos = String(abs % 100).padStart(2, '0')
  const grupos = []
  for (let i = inteiro.length; i > 0; i -= 3) {
    grupos.unshift(inteiro.slice(Math.max(0, i - 3), i))
  }
  return `${negative ? '-R$ ' : 'R$ '}${grupos.join('.')},${decimos}`
}

function nomeCliente(value) {
  const raw = String(value ?? '')
  let out = ''
  for (const char of raw) {
    const code = char.charCodeAt(0)
    if (code > 31 && code !== 127) out += char
  }
  return out.trim() || '—'
}

export function textoAvisoVencimento({ clienteNome, saldo }) {
  return `O pedido do cliente ${nomeCliente(clienteNome)} vence em 3 dias. Saldo pendente: ${formatarBrl(saldo)}.`
}

export function vencimentoVigente(pedido) {
  return dateKey(pedido?.vencimentoTitulo) ?? dateKey(pedido?.dataPagamento)
}

export function chaveAviso(simulationId, vencimento) {
  return `${simulationId}|${vencimento}`
}

/**
 * Pedidos que recebem o aviso nesta data.
 * Uma linha por pedido e vencimento vigente. O destinatário é o consultor atual.
 */
export function selecionarAvisosVencimento(pedidos, { hoje, enviados = [] } = {}) {
  const hojeKey = dateKey(hoje)
  if (!hojeKey) return []
  const alvo = addDays(hojeKey, DIAS_AVISO_VENCIMENTO)
  const vistos = new Set(
    (enviados ?? []).map((item) => chaveAviso(item.simulationId, dateKey(item.vencimento))),
  )
  const criados = []

  for (const pedido of pedidos ?? []) {
    if (pedido?.status !== 'converted' || pedido.ativo !== true) continue
    if (pedido.role !== 'consultor' || pedido.consultorId == null || pedido.consultorId === '') {
      continue
    }
    const vencimento = vencimentoVigente(pedido)
    if (!vencimento || vencimento !== alvo) continue

    const situacao = classificarFinanceiro({
      valorDevido: pedido.valorDevido ?? 0,
      valorRecebido: pedido.valorRecebido ?? 0,
      vencimento,
      hoje: hojeKey,
    })
    if (!situacao || !(situacao.saldo > 0)) continue

    const chave = chaveAviso(pedido.simulationId, vencimento)
    if (vistos.has(chave)) continue
    vistos.add(chave)

    criados.push({
      simulationId: String(pedido.simulationId),
      vencimento,
      recipientId: String(pedido.consultorId),
      saldo: situacao.saldo,
      type: AVISO_VENCIMENTO_TIPO,
      title: AVISO_VENCIMENTO_TITULO,
      body: textoAvisoVencimento({ clienteNome: pedido.clienteNome, saldo: situacao.saldo }),
    })
  }

  return criados
}

export function registrarEnvios(enviados, avisos) {
  return [
    ...(enviados ?? []),
    ...(avisos ?? []).map((aviso) => ({
      simulationId: aviso.simulationId,
      vencimento: aviso.vencimento,
      recipientId: aviso.recipientId,
    })),
  ]
}
