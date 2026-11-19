import { useState } from 'react'
import { FinanceiroSituacao } from './FinanceiroSituacao'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { obterPedidoFinanceiro } from '../../services/financeiroService'
import { formatDateBr } from '../../utils/formatDateBr'
import { formatBRL } from '../../utils/money'

export function FinanceiroResumoConsulta({ simulationId }) {
  const [data, setData] = useState(null)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!simulationId) return
      const res = await obterPedidoFinanceiro(simulationId)
      if (!isActive()) return
      if (!res.ok) {
        setData(null)
        return
      }
      setData(res)
    },
    [simulationId],
    Boolean(simulationId),
  )

  if (!data?.pedido) return null
  const { pedido, recebimentos, eventos } = data
  const renegociacoes = eventos.filter((evento) => evento.tipo === 'renegociacao')

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
          Situação financeira
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Consulta do recebimento deste pedido. O lançamento é feito no módulo financeiro.
        </p>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Valor</p>
          <p className="finance-text mt-1 text-lg font-semibold text-slate-900">
            {formatBRL(pedido.valorDevido)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recebido</p>
          <p className="finance-text mt-1 text-lg font-semibold text-slate-900">
            {formatBRL(pedido.valorRecebido)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Em aberto</p>
          <p className="finance-text mt-1 text-lg font-semibold text-slate-900">
            {formatBRL(pedido.saldo)}
          </p>
        </div>
      </div>
      <div className="px-4 pb-4 sm:px-6">
        <FinanceiroSituacao {...pedido} />
      </div>
      {renegociacoes.length > 0 ? (
        <div className="border-t border-slate-100 px-4 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Vencimentos
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {renegociacoes.map((evento) => (
              <li key={evento.id}>
                {formatDateBr(evento.vencimentoAnterior)} para {formatDateBr(evento.vencimentoNovo)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {recebimentos.length > 0 ? (
        <div className="border-t border-slate-100 px-4 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Recebimentos
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {recebimentos.map((row) => (
              <li key={row.id}>
                {formatDateBr(row.dataRecebimento)} · {formatBRL(row.valor)}
                {row.status === 'estornado' ? ' · estornado' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
