import { formatProdutoDisplayNome } from '../../constants/mapeamentoCampos'
import { IconBan, IconHistory, IconPencil, IconRotateCw } from '../icons'
import { IconActionButton } from '../fretes/FreteCard'
import { DataTable } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
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

export function ProdutoTable({
  rows,
  loading,
  emptyMessage,
  onEdit,
  onInativar,
  onReativar,
  onViewHistorico,
}) {
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
      key: 'nome',
      header: 'Produto',
      cell: (row) =>
        formatProdutoDisplayNome({
          nome: row.nome,
          referencia_complementar: row.referencia_complementar,
          fornecedor_nome: row.fornecedor_nome,
        }),
    },
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      cell: (row) => row.fornecedor_nome ?? '—',
    },
    { key: 'estado', header: 'Estado', cell: (row) => row.estado ?? '—' },
    { key: 'classe', header: 'Classe', cell: (row) => row.classe ?? 'Convencional' },
    { key: 'quarter', header: 'Quarter', cell: (row) => row.quarter },
    {
      key: 'lista',
      header: 'Lista',
      cell: (row) => {
        if (!row.lista_id && !row.lista_quarter && !row.lista_validade) {
          return '—'
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
        const label = parts.join(' · ') || 'Lista'
        return (
          <span
            className={[
              'inline-flex max-w-[12rem] truncate rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
              row.lista_ativa === false
                ? 'bg-slate-100 text-slate-600 ring-slate-200'
                : 'bg-sky-50 text-sky-800 ring-sky-200',
            ].join(' ')}
            title={label}
          >
            {label}
          </span>
        )
      },
    },
    {
      key: 'preco',
      header: 'Custo R$',
      align: 'right',
      cell: (row) => formatBRL(row.preco_interno_calculado),
    },
    {
      key: 'icms',
      header: 'Custo - ICMS',
      align: 'right',
      cell: (row) =>
        formatBRL(row.custo_icms ?? row.preco_interno_calculado * 0.96),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge ativo={row.ativo} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => {
        const produtoLabel = formatProdutoDisplayNome({
          nome: row.nome,
          referencia_complementar: row.referencia_complementar,
          fornecedor_nome: row.fornecedor_nome,
        })

        return (
          <div className="flex justify-end gap-0.5">
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
      },
    },
  ]

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
      />
    </section>
  )
}
