import { useMemo } from 'react'
import {
  statusBadgeClass,
  statusLabelPt,
} from '../constants/simulationStatus'
import { formatBRL } from '../utils/money'
import { resolveSimulationListAction } from './SimulationListCard'
import { Button } from './ui/Button'
import { DataTable } from './ui/DataTable'

function formatListDate(value) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * @param {{
 *   rows: object[],
 *   consultorNomeById?: Record<string, string>,
 *   isGestor?: boolean,
 *   listKind?: 'simulacoes' | 'pedidos',
 *   onContinueEdit?: (id: string, status: string) => void,
 *   onViewDetails?: (id: string, status: string) => void,
 * }} props
 */
export function SimulationListTable({
  rows,
  consultorNomeById = {},
  isGestor = false,
  listKind = 'simulacoes',
  onContinueEdit,
  onViewDetails,
}) {
  const columns = useMemo(() => {
    const cols = [
      {
        key: 'client',
        header: 'Cliente',
        cell: (row) => (
          <span className="font-medium text-slate-900">
            {row.client_nome || '—'}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (row) => (
          <span
            className={[
              'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
              statusBadgeClass(row.status, { ativo: row.ativo }),
            ].join(' ')}
          >
            {statusLabelPt(row.status, { ativo: row.ativo })}
          </span>
        ),
      },
      {
        key: 'date',
        header: 'Data',
        cell: (row) => (
          <span className="whitespace-nowrap text-slate-600">
            {formatListDate(row.created_at)}
          </span>
        ),
      },
      {
        key: 'total',
        header: 'Valor',
        align: 'right',
        cell: (row) => (
          <span className="finance-text font-semibold text-slate-900">
            {formatBRL(row.total_proposta)}
          </span>
        ),
      },
    ]

    if (isGestor) {
      cols.push({
        key: 'consultor',
        header: 'Consultor',
        cell: (row) => (
          <span className="text-slate-700">
            {consultorNomeById[row.user_id] ?? '—'}
          </span>
        ),
      })
    }

    cols.push({
      key: 'action',
      header: 'Ação',
      align: 'right',
      cell: (row) => {
        const action = resolveSimulationListAction({
          row,
          isGestor,
          listKind,
        })
        if (action.kind === 'message') {
          return (
            <span className="text-xs text-slate-500">{action.message}</span>
          )
        }
        const handler =
          action.handler === 'onContinueEdit' ? onContinueEdit : onViewDetails
        return (
          <Button
            type="button"
            variant={action.variant}
            className="min-h-9 px-3 py-1.5 text-xs"
            onClick={() => handler?.(row.id, row.status)}
          >
            {action.label}
          </Button>
        )
      },
    })

    return cols
  }, [
    consultorNomeById,
    isGestor,
    listKind,
    onContinueEdit,
    onViewDetails,
  ])

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      onRowClick={(row) => {
        const action = resolveSimulationListAction({
          row,
          isGestor,
          listKind,
        })
        if (action.kind === 'message') return
        const handler =
          action.handler === 'onContinueEdit' ? onContinueEdit : onViewDetails
        handler?.(row.id, row.status)
      }}
      emptyMessage="Nenhum registro encontrado."
    />
  )
}
