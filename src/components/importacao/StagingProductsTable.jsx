import { IconPencil, IconTrash } from '../icons'
import { ESTADOS_PRODUTO } from '../../constants/mapeamentoCampos'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { EditableNumber } from '../ui/EditableNumber'
import { EditableSelect } from '../ui/EditableSelect'
import { MobileCardList } from '../ui/MobileCardList'
import { StagingStatusBadge } from './StagingStatusBadge'
import { formatBRL } from '../../utils/money'

function effectiveDescontoUsd(row, loteDescontoUsd) {
  if (row.desconto_usd !== undefined && row.desconto_usd !== null) {
    return Number(row.desconto_usd)
  }
  return Number(loteDescontoUsd ?? 0)
}

function effectiveEstado(row, loteEstadoPadrao) {
  return String(row.estado ?? '').trim() || String(loteEstadoPadrao ?? '').trim()
}

function StagingRowCard({
  row,
  readOnly,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  loteMoeda,
  loteDescontoUsd,
  loteEstadoPadrao,
}) {
  const estado = effectiveEstado(row, loteEstadoPadrao)

  return (
    <li
      className={[
        'overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm',
        !readOnly ? 'cursor-pointer hover:border-primary-200' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={!readOnly ? () => onEdit(row) : undefined}
      onKeyDown={
        !readOnly
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onEdit(row)
              }
            }
          : undefined
      }
      role={!readOnly ? 'button' : undefined}
      tabIndex={!readOnly ? 0 : undefined}
    >
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {!readOnly ? (
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(row.id)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 size-4 rounded border-slate-300"
                aria-label={`Selecionar ${row.nome}`}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {row.nome || '—'}
              </p>
              <p className="font-mono text-xs text-slate-500">
                {row.referencia_complementar || row.sku_fornecedor || '—'}
              </p>
            </div>
          </div>
          {!readOnly ? (
            <StagingStatusBadge status={row.status_linha} compact />
          ) : null}
        </div>
      </div>
      <div className="p-4">
        {row.staging_erros?.length > 0 ? (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
            {row.staging_erros.join(' · ')}
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-2.5 text-xs text-slate-600">
          <div>
            <dt className="font-medium text-slate-500">Estado</dt>
            <dd className="mt-0.5 font-medium text-slate-800">
              {estado || '—'}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Classe</dt>
            <dd className="mt-0.5 font-medium text-slate-800">
              {row.classe || 'Convencional'}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Quarter</dt>
            <dd className="mt-0.5">
              <span className="inline-flex rounded-md bg-primary-50 px-1.5 py-0.5 text-[0.7rem] font-semibold text-primary-800">
                {row.quarter || '—'}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Desconto USD</dt>
            <dd className="mt-0.5 font-medium text-slate-800">
              {formatBRL(effectiveDescontoUsd(row, loteDescontoUsd))}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="font-medium text-slate-500">Preço de custo</dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-900">
              {formatBRL(row.preco_original)}{' '}
              <span className="text-xs font-normal text-slate-500">
                {loteMoeda ?? row.moeda}
              </span>
            </dd>
          </div>
          {readOnly && row.taxa_antecipacao != null ? (
            <div>
              <dt className="font-medium text-slate-500">Antecipação %</dt>
              <dd className="mt-0.5">{String(row.taxa_antecipacao)}</dd>
            </div>
          ) : null}
          {readOnly && row.taxa_juros != null ? (
            <div>
              <dt className="font-medium text-slate-500">Juros %</dt>
              <dd className="mt-0.5">{String(row.taxa_juros)}</dd>
            </div>
          ) : null}
        </dl>
        {!readOnly ? (
          <div className="mt-3 flex gap-2" data-no-row-click>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(row)
              }}
            >
              <IconPencil className="size-4" aria-hidden />
              Editar
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(row.id)
              }}
            >
              <IconTrash className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

export function StagingProductsTable({
  rows,
  loading,
  readOnly = false,
  loteMoeda,
  loteDescontoUsd = 0,
  loteEstadoPadrao = '',
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
  onRowChange,
  onEdit,
  onDelete,
  emptyMessage = 'Nenhum produto neste lote.',
}) {
  const allSelected =
    rows.length > 0 && rows.every((r) => selectedIds.includes(r.id))

  const columns = [
    ...(!readOnly
      ? [
          {
            key: 'select',
            header: (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="size-4 rounded border-slate-300"
                aria-label="Selecionar todos"
                data-no-row-click
              />
            ),
            cell: (row) => (
              <input
                type="checkbox"
                checked={selectedIds.includes(row.id)}
                onChange={() => onToggleSelect(row.id)}
                className="size-4 rounded border-slate-300"
                aria-label={`Selecionar ${row.nome}`}
                data-no-row-click
              />
            ),
          },
        ]
      : []),
    {
      key: 'produto',
      header: 'Fertilizante',
      cell: (row) => (
        <span className="font-medium text-slate-900">{row.nome || '—'}</span>
      ),
    },
    {
      key: 'ref',
      header: 'Ref. complementar',
      cell: (row) => (
        <span className="font-mono text-xs text-slate-800">
          {row.referencia_complementar || row.sku_fornecedor || '—'}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      cell: (row) => {
        const estado = effectiveEstado(row, loteEstadoPadrao)
        return readOnly ? (
          estado || '—'
        ) : (
          <EditableSelect
            value={estado}
            onChange={(v) => onRowChange(row.id, { estado: v })}
            options={ESTADOS_PRODUTO}
            ariaLabel={`Estado de ${row.nome}`}
          />
        )
      },
    },
    {
      key: 'classe',
      header: 'Classe',
      cell: (row) => row.classe || 'Convencional',
    },
    {
      key: 'quarter',
      header: 'Quarter',
      cell: (row) => (
        <span className="inline-flex rounded-md bg-primary-50 px-1.5 py-0.5 text-[0.7rem] font-semibold text-primary-800 ring-1 ring-inset ring-primary-100">
          {row.quarter || '—'}
        </span>
      ),
    },
    {
      key: 'desconto',
      header: 'Desconto USD',
      align: 'right',
      cell: (row) => {
        const display = effectiveDescontoUsd(row, loteDescontoUsd)
        return readOnly ? (
          <span>{formatBRL(display)}</span>
        ) : (
          <EditableNumber
            value={display}
            onChange={(v) => onRowChange(row.id, { desconto_usd: v })}
            decimals={2}
            ariaLabel={`Desconto USD de ${row.nome}`}
          />
        )
      },
    },
    {
      key: 'preco',
      header: 'Preço de custo',
      align: 'right',
      cell: (row) =>
        readOnly ? (
          <span>
            {formatBRL(row.preco_original)}{' '}
            <span className="text-xs text-slate-500">
              {loteMoeda ?? row.moeda}
            </span>
          </span>
        ) : (
          <EditableNumber
            value={Number(row.preco_original)}
            onChange={(v) => onRowChange(row.id, { preco_original: v })}
            decimals={2}
            ariaLabel={`Preço de ${row.nome}`}
          />
        ),
    },
    ...(readOnly
      ? [
          {
            key: 'taxa_antecipacao',
            header: 'Antecipação %',
            align: 'right',
            cell: (row) =>
              row.taxa_antecipacao != null
                ? String(row.taxa_antecipacao)
                : '—',
          },
          {
            key: 'taxa_juros',
            header: 'Juros %',
            align: 'right',
            cell: (row) =>
              row.taxa_juros != null ? String(row.taxa_juros) : '—',
          },
        ]
      : [
          {
            key: 'status',
            header: 'Status',
            cell: (row) => (
              <div className="min-w-[7rem]">
                <StagingStatusBadge status={row.status_linha} compact />
                {row.staging_erros?.length > 0 ? (
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-red-700">
                    {row.staging_erros.join(' · ')}
                  </p>
                ) : null}
              </div>
            ),
          },
        ]),
  ]

  if (!readOnly) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-1" data-no-row-click>
          <Button
            type="button"
            variant="secondary"
            className="!px-2 !py-1"
            onClick={() => onEdit(row)}
            aria-label={`Editar ${row.nome}`}
          >
            <IconPencil className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="!px-2 !py-1"
            onClick={() => onDelete(row.id)}
            aria-label={`Excluir ${row.nome}`}
          >
            <IconTrash className="size-4" aria-hidden />
          </Button>
        </div>
      ),
    })
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        loadingMessage="Carregando produtos extraídos…"
        emptyMessage={emptyMessage}
        getRowKey={(row) => row.id}
        onRowClick={!readOnly && onEdit ? (row) => onEdit(row) : undefined}
        density="compact"
      />
      <MobileCardList
        items={rows}
        loading={loading}
        emptyMessage={emptyMessage}
        renderItem={(row) => (
          <StagingRowCard
            key={row.id}
            row={row}
            readOnly={readOnly}
            selected={selectedIds.includes(row.id)}
            onToggleSelect={onToggleSelect}
            onEdit={onEdit}
            onDelete={onDelete}
            loteMoeda={loteMoeda}
            loteDescontoUsd={loteDescontoUsd}
            loteEstadoPadrao={loteEstadoPadrao}
          />
        )}
      />
    </>
  )
}

export function StagingMatchSummary({ summary }) {
  if (!summary) return null

  const items = [
    {
      key: 'novos',
      label: 'Novos',
      value: summary.novos,
      className: 'border-emerald-200 bg-emerald-50/70 text-emerald-800',
      labelClass: 'text-emerald-700',
    },
    {
      key: 'atualizacoes',
      label: 'Atualizações',
      value: summary.atualizacoes,
      className: 'border-sky-200 bg-sky-50/70 text-sky-800',
      labelClass: 'text-sky-700',
    },
    {
      key: 'erros',
      label: 'Erros',
      value: summary.erros,
      className: 'border-red-200 bg-red-50/70 text-red-800',
      labelClass: 'text-red-700',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <div
          key={item.key}
          className={[
            'rounded-2xl border px-3 py-3 text-center shadow-sm sm:px-4',
            item.className,
          ].join(' ')}
        >
          <p className="text-xl font-semibold tabular-nums sm:text-2xl">
            {item.value}
          </p>
          <p
            className={[
              'mt-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em]',
              item.labelClass,
            ].join(' ')}
          >
            {item.label}
          </p>
        </div>
      ))}
    </div>
  )
}
