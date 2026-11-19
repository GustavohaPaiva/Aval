import { useCallback, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FinanceiroSituacao } from '../../components/financeiro/FinanceiroSituacao'
import { AlertMessage } from '../../components/ui/AlertMessage'
import { Button } from '../../components/ui/Button'
import { DatePicker } from '../../components/ui/DatePicker'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { ModalFormFooter } from '../../components/ui/ModalFormFooter'
import { PageBackLink } from '../../components/ui/PageBackLink'
import { PageHeader } from '../../components/ui/PageHeader'
import { useSyncPageLoading } from '../../contexts/PageLoadingContext'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import {
  estornarRecebimento,
  obterPedidoFinanceiro,
  registrarRecebimento,
  renegociarVencimento,
} from '../../services/financeiroService'
import { statusLabelPt } from '../../constants/simulationStatus'
import { formatDateBr } from '../../utils/formatDateBr'
import { formatBRL } from '../../utils/money'
import {
  fromCents,
  hojeSaoPaulo,
  toCents,
  validarNovoRecebimento,
  validarRenegociacao,
} from '../../utils/financeiroSituacao'

const EVENTO_LABEL = {
  titulo_aberto: 'Condição registrada',
  recebimento: 'Recebimento',
  estorno: 'Estorno',
  renegociacao: 'Renegociação',
}

export function FinanceiroPedidoDetalhePage() {
  const { simulationId } = useParams()
  const [loading, setLoading] = useState(Boolean(simulationId))
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [pedido, setPedido] = useState(null)
  const [recebimentos, setRecebimentos] = useState([])
  const [eventos, setEventos] = useState([])
  const [reloadToken, setReloadToken] = useState(0)
  const [recebimentoOpen, setRecebimentoOpen] = useState(false)
  const [renegociacaoOpen, setRenegociacaoOpen] = useState(false)
  const [estorno, setEstorno] = useState(null)

  useSyncPageLoading(loading)

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!simulationId) return
      setLoading(true)
      setError(null)
      const res = await obterPedidoFinanceiro(simulationId)
      if (!isActive()) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setPedido(null)
        return
      }
      setPedido(res.pedido)
      setRecebimentos(res.recebimentos)
      setEventos(res.eventos)
    },
    [simulationId, reloadToken],
    Boolean(simulationId),
  )

  if (!simulationId) {
    return <AlertMessage>Pedido não informado.</AlertMessage>
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to="/financeiro">Voltar para recebimentos</PageBackLink>
      {loading ? (
        <EmptyState title="Carregando pedido…" description="Aguarde um instante." />
      ) : error ? (
        <AlertMessage>{error}</AlertMessage>
      ) : pedido ? (
        <>
          <section className="rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-5 shadow-sm sm:rounded-[2rem] sm:p-8">
            <PageHeader
              eyebrow={`Pedido ${pedido.identificacao}`}
              title={pedido.clienteNome}
              description={`Consultor ${pedido.consultorNome} · ${statusLabelPt(pedido.statusPedido, { ativo: pedido.ativo })}`}
              className="mb-0"
              actions={
                pedido.podeOperar ? (
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      disabled={!pedido.podeRenegociar}
                      onClick={() => {
                        setActionError(null)
                        setRenegociacaoOpen(true)
                      }}
                    >
                      Renegociar vencimento
                    </Button>
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={!pedido.podeReceber}
                      onClick={() => {
                        setActionError(null)
                        setRecebimentoOpen(true)
                      }}
                    >
                      Registrar recebimento
                    </Button>
                  </div>
                ) : null
              }
            />
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Valor label="Valor total" value={pedido.valorDevido} />
              <Valor label="Valor recebido" value={pedido.valorRecebido} />
              <Valor label="Saldo em aberto" value={pedido.saldo} emphasis />
            </div>
            <div className="mt-5">
              <FinanceiroSituacao {...pedido} showAmounts={false} />
            </div>
            {pedido.valorCongelado ? (
              <p className="mt-3 text-xs text-slate-500">
                O valor devido ficou fixo no primeiro lançamento financeiro deste pedido.
              </p>
            ) : null}
          </section>

          {actionError ? <AlertMessage>{actionError}</AlertMessage> : null}

          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <header className="border-b border-slate-100 px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold text-slate-900">Recebimentos</h2>
              <p className="mt-1 text-sm text-slate-600">
                Para corrigir um valor, estorne o lançamento e registre outro. O original permanece no histórico.
              </p>
            </header>
            {recebimentos.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 sm:px-6">Nenhum recebimento registrado.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recebimentos.map((row) => (
                  <li key={row.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                      <p className="finance-text font-semibold text-slate-900">{formatBRL(row.valor)}</p>
                      <p className="text-sm text-slate-600">
                        {formatDateBr(row.dataRecebimento)} · {row.registradoPorNome}
                        {row.status === 'estornado' ? ' · estornado' : ''}
                      </p>
                      {row.observacao ? <p className="text-sm text-slate-500">{row.observacao}</p> : null}
                      {row.motivoEstorno ? (
                        <p className="text-sm text-red-700">Estorno: {row.motivoEstorno}</p>
                      ) : null}
                    </div>
                    {pedido.podeOperar && row.status === 'ativo' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9"
                        onClick={() => setEstorno(row)}
                      >
                        Estornar
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <header className="border-b border-slate-100 px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold text-slate-900">Histórico</h2>
            </header>
            {eventos.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 sm:px-6">Nenhuma movimentação.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {eventos.map((evento) => (
                  <li key={evento.id} className="px-4 py-4 sm:px-6">
                    <p className="text-sm font-medium text-slate-900">
                      {EVENTO_LABEL[evento.tipo] ?? evento.tipo}
                    </p>
                    <p className="text-sm text-slate-600">
                      {formatDateBr(evento.criadoEm)} · {evento.atorNome}
                      {evento.valor != null ? ` · ${formatBRL(evento.valor)}` : ''}
                    </p>
                    {evento.tipo === 'renegociacao' ? (
                      <p className="text-sm text-slate-600">
                        Vencimento {formatDateBr(evento.vencimentoAnterior)} para {formatDateBr(evento.vencimentoNovo)}
                      </p>
                    ) : null}
                    {evento.observacao ? <p className="text-sm text-slate-500">{evento.observacao}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ModalRecebimento
            open={recebimentoOpen}
            pedido={pedido}
            recebimentos={recebimentos}
            onClose={() => setRecebimentoOpen(false)}
            onSaved={() => {
              setRecebimentoOpen(false)
              reload()
            }}
            onError={setActionError}
          />
          <ModalRenegociacao
            open={renegociacaoOpen}
            pedido={pedido}
            onClose={() => setRenegociacaoOpen(false)}
            onSaved={() => {
              setRenegociacaoOpen(false)
              reload()
            }}
            onError={setActionError}
          />
          <ModalEstorno
            recebimento={estorno}
            versao={pedido.versao}
            onClose={() => setEstorno(null)}
            onSaved={() => {
              setEstorno(null)
              reload()
            }}
            onError={setActionError}
          />
        </>
      ) : null}
    </div>
  )
}

function Valor({ label, value, emphasis = false }) {
  return (
    <div className="rounded-2xl bg-white/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p
        className={[
          'finance-text mt-1 text-xl font-semibold',
          emphasis ? 'text-slate-950' : 'text-slate-900',
        ].join(' ')}
      >
        {formatBRL(value)}
      </p>
    </div>
  )
}

function recebimentosAtivos(recebimentos) {
  return (recebimentos ?? [])
    .filter((row) => row.status === 'ativo')
    .map((row) => ({ valor: row.valor, status: 'ativo', idempotencyKey: row.id }))
}

function ModalRecebimento({ open, pedido, recebimentos, onClose, onSaved, onError }) {
  const [valorCents, setValorCents] = useState(null)
  const [valorConfirmado, setValorConfirmado] = useState(null)
  const [data, setData] = useState(() => hojeSaoPaulo())
  const [observacao, setObservacao] = useState('')
  const [step, setStep] = useState('dados')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [key, setKey] = useState('')
  const savingRef = useRef(false)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive() || !open) return
      savingRef.current = false
      setValorCents(null)
      setValorConfirmado(null)
      setData(hojeSaoPaulo())
      setObservacao('')
      setStep('dados')
      setFormError(null)
      setSaving(false)
      setKey(crypto.randomUUID())
    },
    [open],
    open,
  )

  const saldoCents = toCents(pedido?.saldo) ?? 0

  function validarValor(cents) {
    return validarNovoRecebimento({
      valorDevido: pedido.valorDevido,
      recebimentos: recebimentosAtivos(recebimentos),
      valor: cents == null ? null : fromCents(cents),
      idempotencyKey: key,
    })
  }

  function irParaConfirmacao(event) {
    event.preventDefault()
    if (savingRef.current) return
    if (!data) {
      setFormError('Informe a data do recebimento.')
      return
    }
    const check = validarValor(valorCents)
    if (!check.ok) {
      setFormError(check.error)
      return
    }
    setFormError(null)
    setValorConfirmado(toCents(check.valor))
    setStep('confirmar')
  }

  async function confirmar() {
    if (savingRef.current || valorConfirmado == null) return
    savingRef.current = true
    setSaving(true)
    const check = validarValor(valorConfirmado)
    if (!check.ok) {
      savingRef.current = false
      setSaving(false)
      setFormError(check.error)
      setStep('dados')
      return
    }
    const res = await registrarRecebimento({
      simulationId: pedido.simulationId,
      valor: check.valor,
      data,
      observacao,
      idempotencyKey: key,
      versao: pedido.versao,
    })
    if (!res.ok) {
      savingRef.current = false
      setSaving(false)
      setFormError(res.error)
      onError(res.error)
      return
    }
    onSaved()
  }

  const saldoDepois =
    valorConfirmado == null ? pedido?.saldo : fromCents(Math.max(saldoCents - valorConfirmado, 0))
  const quitaSaldo = valorConfirmado != null && valorConfirmado === saldoCents

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={step === 'confirmar' ? 'Confirmar recebimento' : 'Registrar recebimento'}
      size="md"
      footer={
        step === 'confirmar' ? (
          <ModalFormFooter
            formId="form-recebimento-confirmar"
            submitLabel="Confirmar recebimento"
            cancelLabel="Voltar"
            loading={saving}
            onCancel={() => {
              if (saving) return
              setFormError(null)
              setStep('dados')
            }}
          />
        ) : (
          <ModalFormFooter
            formId="form-recebimento"
            submitLabel="Revisar"
            loading={saving}
            onCancel={onClose}
          />
        )
      }
    >
      {step === 'confirmar' ? (
        <form id="form-recebimento-confirmar" className="space-y-4" onSubmit={(event) => {
          event.preventDefault()
          void confirmar()
        }}>
          {formError ? <AlertMessage>{formError}</AlertMessage> : null}
          <p className="text-sm text-slate-600">
            {quitaSaldo
              ? 'Este lançamento quita o saldo do pedido.'
              : 'O valor entra como pagamento parcial. O pedido só fica quitado com 100% pago.'}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ResumoLinha label="Recebimento" value={formatBRL(fromCents(valorConfirmado ?? 0))} />
            <ResumoLinha label="Data" value={formatDateBr(data)} />
            <ResumoLinha label="Saldo atual" value={formatBRL(pedido?.saldo)} />
            <ResumoLinha label="Saldo depois" value={formatBRL(saldoDepois)} />
          </div>
          {observacao.trim() ? (
            <p className="text-sm text-slate-600">Observação: {observacao.trim()}</p>
          ) : null}
        </form>
      ) : (
        <form id="form-recebimento" className="space-y-4" onSubmit={irParaConfirmacao}>
          {formError ? <AlertMessage>{formError}</AlertMessage> : null}
          <div className="grid grid-cols-3 gap-2">
            <ResumoLinha label="Total" value={formatBRL(pedido?.valorDevido)} />
            <ResumoLinha label="Recebido" value={formatBRL(pedido?.valorRecebido)} />
            <ResumoLinha label="Saldo" value={formatBRL(pedido?.saldo)} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <CampoMonetario valueCents={valorCents} onChangeCents={setValorCents} disabled={saving} />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={saving || saldoCents <= 0}
              onClick={() => {
                setFormError(null)
                setValorCents(saldoCents)
              }}
            >
              Pagamento total
            </Button>
          </div>
          <DatePicker label="Data" value={data} onChange={(e) => setData(e.target.value)} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Observação
            <textarea
              className="min-h-20 rounded-2xl border border-gray-200 px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              value={observacao}
              maxLength={500}
              placeholder="Opcional"
              onChange={(e) => setObservacao(e.target.value)}
            />
          </label>
        </form>
      )}
    </Modal>
  )
}

function ModalRenegociacao({ open, pedido, onClose, onSaved, onError }) {
  const [vencimento, setVencimento] = useState('')
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [key, setKey] = useState('')
  const savingRef = useRef(false)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive() || !open) return
      savingRef.current = false
      setVencimento('')
      setObservacao('')
      setFormError(null)
      setSaving(false)
      setKey(crypto.randomUUID())
    },
    [open],
    open,
  )

  async function handleSubmit(event) {
    event.preventDefault()
    if (savingRef.current) return
    const check = validarRenegociacao({
      vencimentoAtual: pedido.vencimento,
      vencimentoNovo: vencimento,
    })
    if (!check.ok) {
      setFormError(check.error)
      return
    }
    savingRef.current = true
    setSaving(true)
    const res = await renegociarVencimento({
      simulationId: pedido.simulationId,
      vencimento: check.vencimentoNovo,
      observacao,
      versao: pedido.versao,
      idempotencyKey: key,
    })
    if (!res.ok) {
      savingRef.current = false
      setSaving(false)
      setFormError(res.error)
      onError(res.error)
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Renegociar vencimento"
      size="md"
      footer={
        <ModalFormFooter
          formId="form-renegociacao"
          submitLabel="Atualizar vencimento"
          loading={saving}
          onCancel={onClose}
        />
      }
    >
      <form id="form-renegociacao" className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Vencimento atual
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {formatDateBr(pedido?.vencimento)}
            </p>
          </div>
          <div className="rounded-2xl bg-primary-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-700">
              Novo vencimento
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {vencimento ? formatDateBr(vencimento) : 'Escolha a data'}
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          A data anterior permanece no histórico. O valor devido não muda.
        </p>
        <DatePicker
          label="Nova data"
          value={vencimento}
          onChange={(e) => setVencimento(e.target.value)}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Observação
          <textarea
            className="min-h-20 rounded-2xl border border-gray-200 px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            value={observacao}
            maxLength={500}
            placeholder="Opcional"
            onChange={(e) => setObservacao(e.target.value)}
          />
        </label>
      </form>
    </Modal>
  )
}

function CampoMonetario({ valueCents, onChangeCents, disabled }) {
  const texto =
    valueCents == null
      ? ''
      : (valueCents / 100).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="recebimento-valor" className="text-sm font-medium text-slate-700">
        Valor
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
          R$
        </span>
        <input
          id="recebimento-valor"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={texto}
          placeholder="0,00"
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 12)
            onChangeCents(digits === '' ? null : Number(digits))
          }}
          className="finance-text h-11 w-full rounded-2xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
      </div>
    </div>
  )
}

function ResumoLinha({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="finance-text mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function ModalEstorno({ recebimento, versao, onClose, onSaved, onError }) {
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [key, setKey] = useState('')

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive() || !recebimento) return
      setMotivo('')
      setFormError(null)
      setSaving(false)
      setKey(crypto.randomUUID())
    },
    [recebimento?.id],
    Boolean(recebimento),
  )

  async function handleSubmit(event) {
    event.preventDefault()
    if (!motivo.trim()) {
      setFormError('Informe o motivo do estorno.')
      return
    }
    setSaving(true)
    const res = await estornarRecebimento({
      recebimentoId: recebimento.id,
      motivo: motivo.trim(),
      versao,
      idempotencyKey: key,
    })
    setSaving(false)
    if (!res.ok) {
      setFormError(res.error)
      onError(res.error)
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={Boolean(recebimento)}
      onClose={() => !saving && onClose()}
      title="Estornar recebimento"
      footer={
        <ModalFormFooter
          formId="form-estorno"
          submitLabel="Estornar"
          loading={saving}
          onCancel={onClose}
        />
      }
    >
      <form id="form-estorno" className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
        <p className="text-sm text-slate-600">
          O lançamento de {formatBRL(recebimento?.valor)} sai do saldo e continua visível como estornado.
        </p>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Motivo
          <textarea
            className="min-h-24 rounded-2xl border border-gray-200 px-3 py-2 text-sm font-normal text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            value={motivo}
            maxLength={500}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
        </label>
      </form>
    </Modal>
  )
}
