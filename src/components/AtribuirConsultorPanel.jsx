import { useCallback, useMemo, useState } from 'react'
import { AlertMessage } from './ui/AlertMessage'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Select } from './ui/Select'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import {
  assignSimulationConsultor,
  fetchConsultoresForAssign,
} from '../services/simulationOrderService'

/**
 * Painel do gestor para atribuir a simulação/pedido a um consultor (user_id).
 */
export function AtribuirConsultorPanel({
  simulationId,
  currentUserId = null,
  currentVendedorNome = null,
  onAssigned,
  className = '',
}) {
  const [consultores, setConsultores] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [actionBanner, setActionBanner] = useState(null)

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoadError(null)
      const res = await fetchConsultoresForAssign()
      if (!isActive()) return
      if (!res.ok) {
        setLoadError(res.error)
        setConsultores([])
        return
      }
      setConsultores(res.rows)
      if (currentUserId) {
        const match = res.rows.find((r) => r.id === String(currentUserId))
        setSelectedId(match ? match.id : '')
      }
    },
    [currentUserId],
  )

  const options = useMemo(
    () =>
      consultores.map((c) => ({
        value: c.id,
        label: c.nome || c.id,
      })),
    [consultores],
  )

  const handleAssign = useCallback(async () => {
    if (!simulationId || !selectedId) {
      setActionError('Selecione um consultor.')
      return
    }
    setSaving(true)
    setActionError(null)
    setActionBanner(null)
    try {
      const res = await assignSimulationConsultor({
        simulationId,
        consultorId: selectedId,
      })
      if (!res.ok) {
        setActionError(res.error)
        return
      }
      const nome = res.vendedorNome || 'Consultor'
      setActionBanner(
        res.unchanged
          ? `Já atribuída a ${nome}.`
          : `Atribuída a ${nome}.`,
      )
      onAssigned?.({
        userId: res.userId,
        vendedorNome: res.vendedorNome,
        unchanged: Boolean(res.unchanged),
        notifyWarning: res.notifyWarning ?? null,
      })
    } finally {
      setSaving(false)
    }
  }, [simulationId, selectedId, onAssigned])

  const canAssign =
    Boolean(simulationId) && Boolean(selectedId) && !saving && !loadError

  return (
    <Card className={['rounded-3xl', className].filter(Boolean).join(' ')}>
      <h2 className="mb-1 text-sm font-semibold text-primary-800">
        Atribuir consultor
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        Define o consultor responsável pela proposta (vendedor no PDF e
        comissão).
        {currentVendedorNome ? (
          <>
            {' '}
            Atual:{' '}
            <span className="font-medium text-slate-800">
              {currentVendedorNome}
            </span>
            .
          </>
        ) : null}
      </p>

      {loadError ? (
        <AlertMessage className="mb-3">{loadError}</AlertMessage>
      ) : null}
      {actionError ? (
        <AlertMessage className="mb-3">{actionError}</AlertMessage>
      ) : null}
      {actionBanner ? (
        <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {actionBanner}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Select
            label="Consultor"
            placeholder="Selecione um consultor…"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value)
              setActionError(null)
              setActionBanner(null)
            }}
            options={options}
            searchable
            searchPlaceholder="Buscar consultor…"
            disabled={Boolean(loadError) || saving || options.length === 0}
          />
        </div>
        <Button
          type="button"
          variant="primary"
          className="shrink-0 sm:mb-0"
          onClick={handleAssign}
          disabled={!canAssign}
          loading={saving}
        >
          Atribuir
        </Button>
      </div>
    </Card>
  )
}
