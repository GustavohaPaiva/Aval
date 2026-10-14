import { useId, useMemo, useState } from 'react'
import {
  quantidadesProgramarTudo,
  validarProgramacao,
} from '../../constants/logisticaProgramacao'
import { formatItemLinha, formatVolumeTon } from '../../constants/logisticaStatus'
import { AlertMessage } from '../ui/AlertMessage'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

function itensPendentes(pedido) {
  return (pedido?.itens ?? []).filter((item) => Number(item.volume) > 0)
}

function FormularioProgramacao({ pedido, saving, onClose, onConfirm }) {
  const formId = useId()
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [valores, setValores] = useState({})
  const [confirmarTudo, setConfirmarTudo] = useState(false)
  const [erro, setErro] = useState(null)

  const itens = useMemo(() => itensPendentes(pedido), [pedido])

  const validacao = useMemo(
    () => validarProgramacao(itens, valores),
    [itens, valores],
  )
  const erroPorItem = useMemo(() => {
    const map = new Map()
    for (const item of validacao.erros) {
      if (item.itemId) map.set(item.itemId, item.mensagem)
    }
    return map
  }, [validacao.erros])

  const resumoTudo = useMemo(() => {
    const quantidades = quantidadesProgramarTudo(itens)
    return validarProgramacao(itens, quantidades)
  }, [itens])

  async function confirmar(quantidades) {
    if (saving) return
    const checagem = validarProgramacao(itens, quantidades)
    if (!checagem.ok) {
      setErro(checagem.erros[0]?.mensagem || 'Quantidade inválida.')
      return
    }
    setErro(null)
    const resultado = await onConfirm({
      modo: checagem.modo,
      linhas: checagem.linhas,
      idempotencyKey,
    })
    if (resultado && resultado.ok === false && !resultado.ignored) {
      setErro(resultado.error || 'Não foi possível programar a entrega.')
    }
  }

  const tituloCliente = pedido?.clientNome || 'Pedido'
  const acoes = confirmarTudo ? (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="h-14 w-full text-base"
        loading={saving}
        onClick={() => {
          void confirmar(quantidadesProgramarTudo(itens))
        }}
      >
        Confirmar programação
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="h-12 w-full"
        disabled={saving}
        onClick={() => setConfirmarTudo(false)}
      >
        Voltar
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="h-14 w-full text-base"
        loading={saving}
        disabled={!validacao.ok}
        onClick={() => {
          void confirmar(valores)
        }}
      >
        {validacao.modo === 'total' ? 'Confirmar programação total' : 'Confirmar programação parcial'}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="h-12 w-full"
        disabled={saving}
        onClick={onClose}
      >
        Cancelar
      </Button>
    </div>
  )

  return (
    <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          {tituloCliente}. Escolha programar todo o saldo pendente ou informe a quantidade de cada item.
        </p>

        {erro ? <AlertMessage>{erro}</AlertMessage> : null}

        {confirmarTudo ? (
          <div className="space-y-3 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-100">
            <p className="text-base font-semibold text-slate-900">Programar tudo</p>
            <p className="text-sm leading-relaxed text-slate-700">
              {formatVolumeTon(resumoTudo.totalProgramado)} saem da Carteira e vão para Programado.
              {pedido?.entregaParcial
                ? ' As entregas já separadas deste pedido não mudam.'
                : ' O pedido segue inteiro, sem divisão.'}
            </p>
            <ul className="space-y-2">
              {itens.map((item) => (
                <li key={item.id} className="text-sm text-slate-800">
                  {formatItemLinha(item)}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <Button
              type="button"
              className="h-14 w-full text-base"
              disabled={saving || itens.length === 0}
              onClick={() => {
                setErro(null)
                setConfirmarTudo(true)
              }}
            >
              Programar tudo
              <span className="font-normal opacity-90">
                {formatVolumeTon(resumoTudo.totalProgramado)}
              </span>
            </Button>

            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              ou programar parcialmente
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="space-y-4">
              {itens.map((item) => {
                const fieldId = `${formId}-${item.id}`
                const mensagem = erroPorItem.get(item.id)
                return (
                  <div key={item.id} className="space-y-2">
                    <label htmlFor={fieldId} className="block text-sm font-semibold text-slate-900">
                      {formatItemLinha({ ...item, volume: item.volumeOriginal ?? item.volume })}
                    </label>
                    <p className="text-xs text-slate-500">
                      Pendente {formatVolumeTon(item.volume)}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        id={fieldId}
                        inputMode="decimal"
                        autoComplete="off"
                        disabled={saving}
                        value={valores[item.id] ?? ''}
                        placeholder="0"
                        aria-invalid={mensagem ? 'true' : undefined}
                        onChange={(event) => {
                          const next = event.target.value
                          setValores((current) => ({ ...current, [item.id]: next }))
                          setErro(null)
                        }}
                        className="h-14 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-lg text-slate-900 shadow-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-14 shrink-0 px-4"
                        disabled={saving}
                        onClick={() => {
                          setValores((current) => ({ ...current, [item.id]: String(item.volume) }))
                          setErro(null)
                        }}
                      >
                        Tudo
                      </Button>
                    </div>
                    {mensagem ? <p className="text-sm font-medium text-red-700">{mensagem}</p> : null}
                  </div>
                )
              })}
            </div>

            <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-700" aria-live="polite">
              {validacao.ok
                ? validacao.modo === 'total'
                  ? `Confirmação: todo o saldo (${formatVolumeTon(validacao.totalProgramado)}) sai da Carteira.`
                  : `Confirmação: programar ${formatVolumeTon(validacao.totalProgramado)}. Permanecem ${formatVolumeTon(validacao.totalRestante)} na Carteira.`
                : validacao.erros.find((item) => !item.itemId)?.mensagem ||
                  'Preencha as quantidades para ver o resumo.'}
            </p>
          </>
        )}

        <div className="sticky bottom-0 -mx-5 border-t border-slate-100 bg-white px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {acoes}
        </div>
      </div>
  )
}

export function ModalProgramarEntrega({ open, pedido, saving = false, onClose, onConfirm }) {
  return (
    <Modal
      open={open}
      sheet
      size="md"
      title="Programar entrega"
      onClose={() => {
        if (!saving) onClose()
      }}
      footer={null}
    >
      {open ? (
        <FormularioProgramacao
          key={pedido?.cardId || pedido?.simulationId || 'programacao'}
          pedido={pedido}
          saving={saving}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Modal>
  )
}
