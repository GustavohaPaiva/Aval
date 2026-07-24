import { useState } from 'react'
import { formatProdutoDisplayNome } from '../../constants/mapeamentoCampos'
import { IconBan, IconChevronDown, IconHistory, IconPencil, IconRotateCw } from '../icons'
import { IconActionButton } from '../fretes/FreteCard'
import { DataTable } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { MobileCardList } from '../ui/MobileCardList'
import { formatBRL } from '../../utils/money'

function StatusBadge({ ativo }) {
  return (
    <span
      className={[
        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
        ativo
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
          : 'bg-slate-100 text-slate-600 ring-slate-200',
      ].join(' ')}
    >
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function formatListaLabel(row) {
  if (!row.lista_id && !row.lista_quarter && !row.lista_validade) {
    return null
  }
  const parts = [row.lista_quarter, row.lista_validade]
    .filter((x) => String(x ?? '').trim())
    .map((x, i) =>
      i === 1 && /^\d{4}-\d{2}-\d{2}/.test(String(x))
        ? new Date(`${String(x).slice(0, 10)}T12:00:00`).toLocaleDateString(
            'pt-BR',
          )
        : x,
    )
  return parts.join(' · ') || 'Lista'
}

function ListaBadge({ row }) {
  const label = formatListaLabel(row)
  if (!label) return <span className="text-slate-400">—</span>
  return (
    <span
      className={[
        'inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
        row.lista_ativa === false
          ? 'bg-slate-100 text-slate-600 ring-slate-200'
          : 'bg-sky-50 text-sky-800 ring-sky-200',
      ].join(' ')}
      title={label}
    >
      {label}
    </span>
  )
}

function TruncateText({ children, className = '', title }) {
  const text = children == null || children === '' ? '—' : children
  return (
    <span className={['block truncate', className].filter(Boolean).join(' ')} title={title ?? String(text)}>
      {text}
    </span>
  )
}

function ProdutoNomeCell({ row }) {
  const nome = String(row.nome ?? '').trim() || '—'
  const ref = String(row.referencia_complementar ?? '').trim()
  return (
    <div className="min-w-0">
      <TruncateText className="font-medium text-slate-900" title={nome}>
        {nome}
      </TruncateText>
      {ref ? (
        <TruncateText className="mt-0.5 font-mono text-xs text-slate-500" title={ref}>
          {ref}
        </TruncateText>
      ) : null}
    </div>
  )
}

function ProdutoDetailPanel({ row }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-xs sm:grid-cols-3">
      <div>
        <dt className="font-medium text-slate-500">Classe</dt>
        <dd className="mt-0.5 text-slate-800">{row.classe ?? 'Convencional'}</dd>
      </div>
      <div>
        <dt className="font-medium text-slate-500">Quarter</dt>
        <dd className="mt-0.5 text-slate-800">{row.quarter || '—'}</dd>
      </div>
      <div>
        <dt className="font-medium text-slate-500">Moeda origem</dt>
        <dd className="mt-0.5 text-slate-800">{row.moeda_origem || '—'}</dd>
      </div>
    </dl>
  )
}

function ProdutoRowActions({ row, onEdit, onInativar, onReativar, onViewHistorico }) {
  const produtoLabel = formatProdutoDisplayNome({
    nome: row.nome,
    referencia_complementar: row.referencia_complementar,
    fornecedor_nome: row.fornecedor_nome,
  })

  return (
    <div className="flex justify-end gap-0.5" data-no-row-click>
      <IconActionButton
        label={`Ver histórico de ${produtoLabel}`}
        onClick={() => onViewHistorico(row)}
      >
        <IconHistory className="size-3.5" />
      </IconActionButton>
      <IconActionButton
        label={`Editar ${produtoLabel}`}
        onClick={() => onEdit(row)}
      >
        <IconPencil className="size-3.5" />
      </IconActionButton>
      {row.ativo ? (
        <IconActionButton
          label={`Inativar ${produtoLabel}`}
          tone="danger"
          onClick={() => onInativar(row.id)}
        >
          <IconBan className="size-3.5" />
        </IconActionButton>
      ) : (
        <IconActionButton
          label={`Reativar ${produtoLabel}`}
          onClick={() => onReativar?.(row.id)}
        >
          <IconRotateCw className="size-3.5" />
        </IconActionButton>
      )}
    </div>
  )
}

function ProdutoMobileCard({
  row,
  expanded,
  onToggleExpand,
  onEdit,
  onInativar,
  onReativar,
  onViewHistorico,
}) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900" title={row.nome}>
            {row.nome || '—'}
          </p>
          {row.referencia_complementar ? (
            <p className="truncate font-mono text-xs text-slate-500" title={row.referencia_complementar}>
              {row.referencia_complementar}
            </p>
          ) : null}
          <p className="mt-1 truncate text-xs text-slate-600" title={row.fornecedor_nome}>
            {row.fornecedor_nome ?? '—'}
          </p>
        </div>
        <StatusBadge ativo={row.ativo} />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div>
          <dt className="font-medium text-slate-500">Estado</dt>
          <dd>{row.estado ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Lista</dt>
          <dd className="truncate" title={formatListaLabel(row) ?? undefined}>
            <ListaBadge row={row} />
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Custo R$</dt>
          <dd className="finance-text font-medium text-slate-900">
            {formatBRL(row.preco_interno_calculado)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Custo − ICMS</dt>
          <dd className="finance-text font-medium text-slate-900">
            {row.custo_icms != null && Number.isFinite(Number(row.custo_icms))
              ? formatBRL(row.custo_icms)
              : '—'}
          </dd>
        </div>
      </dl>

      {expanded ? (
        <div className="mt-3">
          <ProdutoDetailPanel row={row} />
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          onClick={() => onToggleExpand(row.id)}
          aria-expanded={expanded}
        >
          <IconChevronDown
            className={[
              'size-3.5 transition-transform',
              expanded ? 'rotate-180' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
          {expanded ? 'Menos detalhes' : 'Mais detalhes'}
        </button>
        <ProdutoRowActions
          row={row}
          onEdit={onEdit}
          onInativar={onInativar}
          onReativar={onReativar}
          onViewHistorico={onViewHistorico}
        />
      </div>
    </li>
  )
}

export function ProdutoTable({
  rows,
  loading,
  emptyMessage,
  onEdit,
  onInativar,
  onReativar,
  onViewHistorico,
}) {
  const [expandedId, setExpandedId] = useState(null)

  const toggleExpand = (id) => {
    setExpandedId((current) => (current === id ? null : id))
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm sm:rounded-3xl">
        Carregando produtos…
      </section>
    )
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:rounded-3xl sm:p-10">
        <EmptyState title={emptyMessage} />
      </section>
    )
  }

  const columns = [
    {
      key: 'expand',
      header: '',
      headerClassName: 'w-8 px-1.5!',
      cellClassName: 'w-8 px-1.5!',
      cell: (row) => {
        const open = expandedId === row.id
        return (
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label={open ? 'Ocultar detalhes' : 'Mostrar detalhes'}
            aria-expanded={open}
            data-no-row-click
            onClick={() => toggleExpand(row.id)}
          >
            <IconChevronDown
              className={[
                'size-3.5 transition-transform',
                open ? 'rotate-180' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          </button>
        )
      },
    },
    {
      key: 'nome',
      header: 'Produto',
      headerClassName: 'min-w-0',
      cellClassName: 'min-w-0',
      cell: (row) => <ProdutoNomeCell row={row} />,
    },
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      headerClassName: 'w-[9.5rem]',
      cellClassName: 'w-[9.5rem]',
      cell: (row) => (
        <TruncateText className="text-slate-700">
          {row.fornecedor_nome ?? '—'}
        </TruncateText>
      ),
    },
    {
      key: 'estado',
      header: 'UF',
      headerClassName: 'w-12 text-center',
      cellClassName: 'w-12 text-center',
      align: 'center',
      cell: (row) => (
        <span className="font-medium tabular-nums text-slate-800">
          {row.estado ?? '—'}
        </span>
      ),
    },
    {
      key: 'lista',
      header: 'Lista',
      headerClassName: 'w-[8.5rem]',
      cellClassName: 'w-[8.5rem]',
      cell: (row) => <ListaBadge row={row} />,
    },
    {
      key: 'preco',
      header: 'Custo R$',
      align: 'right',
      headerClassName: 'w-[6.5rem] whitespace-nowrap',
      cellClassName: 'w-[6.5rem]',
      cell: (row) => (
        <span className="finance-text whitespace-nowrap tabular-nums text-slate-800">
          {formatBRL(row.preco_interno_calculado)}
        </span>
      ),
    },
    {
      key: 'icms',
      header: '− ICMS',
      align: 'right',
      headerClassName: 'w-[6.5rem] whitespace-nowrap',
      cellClassName: 'w-[6.5rem]',
      cell: (row) => (
        <span className="finance-text whitespace-nowrap tabular-nums text-slate-800">
          {row.custo_icms != null && Number.isFinite(Number(row.custo_icms))
            ? formatBRL(row.custo_icms)
            : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      headerClassName: 'w-[4.75rem]',
      cellClassName: 'w-[4.75rem]',
      cell: (row) => <StatusBadge ativo={row.ativo} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      headerClassName: 'w-[6.5rem]',
      cellClassName: 'w-[6.5rem]',
      cell: (row) => (
        <ProdutoRowActions
          row={row}
          onEdit={onEdit}
          onInativar={onInativar}
          onReativar={onReativar}
          onViewHistorico={onViewHistorico}
        />
      ),
    },
  ]

  return (
    <>
      <section className="hidden overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl lg:block">
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          density="compact"
          tableClassName="table-fixed"
          className="rounded-none! border-0! shadow-none!"
          isRowExpanded={(row) => expandedId === row.id}
          renderExpandedRow={(row) => <ProdutoDetailPanel row={row} />}
          onRowClick={(row) => toggleExpand(row.id)}
        />
      </section>

      <MobileCardList
        items={rows}
        renderItem={(row) => (
          <ProdutoMobileCard
            key={row.id}
            row={row}
            expanded={expandedId === row.id}
            onToggleExpand={toggleExpand}
            onEdit={onEdit}
            onInativar={onInativar}
            onReativar={onReativar}
            onViewHistorico={onViewHistorico}
          />
        )}
      />
    </>
  )
}
