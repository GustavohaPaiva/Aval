import { formatDateBr } from '../../utils/formatDateBr'
import { formatBRL } from '../../utils/money'
import {
  STATUS_PRINCIPAL_LABEL,
  statusPrincipalFinanceiro,
} from '../../utils/financeiroSituacao'

const STATUS_CLASS = {
  quitado: 'bg-emerald-50 text-emerald-800',
  atrasado: 'bg-red-50 text-red-800',
  proximo: 'bg-orange-50 text-orange-800',
  parcial: 'bg-amber-50 text-amber-800',
  pendente: 'bg-slate-100 text-slate-700',
  sem_vencimento: 'bg-slate-100 text-slate-600',
}

const BAR_CLASS = {
  quitado: 'bg-emerald-500',
  atrasado: 'bg-red-500',
  proximo: 'bg-orange-500',
  parcial: 'bg-amber-500',
  pendente: 'bg-primary-500',
  sem_vencimento: 'bg-slate-400',
}

export function FinanceiroStatusBadge(props) {
  const status = statusPrincipalFinanceiro(props)
  return (
    <span
      className={[
        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        STATUS_CLASS[status] ?? STATUS_CLASS.pendente,
      ].join(' ')}
    >
      {STATUS_PRINCIPAL_LABEL[status] ?? 'Pendente'}
    </span>
  )
}

export function FinanceiroSituacao({
  pagamento = 'pendente',
  valorDevido = 0,
  valorRecebido = 0,
  saldo = 0,
  vencimento = null,
  quitado = false,
  compact = false,
  progress = true,
  showAmounts = true,
}) {
  const status = statusPrincipalFinanceiro({
    pagamento,
    valorRecebido,
    saldo,
    quitado,
    vencimento,
  })
  const devido = Number(valorDevido) || 0
  const recebido = Number(valorRecebido) || 0
  const progresso =
    devido > 0
      ? Math.min(100, Math.max(0, (recebido / devido) * 100))
      : status === 'quitado'
        ? 100
        : 0

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <FinanceiroStatusBadge
        pagamento={pagamento}
        valorRecebido={valorRecebido}
        saldo={saldo}
        quitado={quitado}
        vencimento={vencimento}
      />
      {progress ? (
        <div>
          {showAmounts ? (
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>Recebido {formatBRL(recebido)}</span>
              <span>Saldo {formatBRL(saldo)}</span>
            </div>
          ) : null}
          <div
            className="h-1.5 overflow-hidden rounded-full bg-slate-100"
            role="meter"
            aria-label="Progresso do recebimento"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progresso)}
          >
            <div
              className={['h-full rounded-full', BAR_CLASS[status] ?? BAR_CLASS.pendente].join(' ')}
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>
      ) : null}
      {compact ? null : (
        <p className="text-xs text-slate-500">Vencimento: {formatDateBr(vencimento)}</p>
      )}
    </div>
  )
}
