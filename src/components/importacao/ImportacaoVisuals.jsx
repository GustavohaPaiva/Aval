import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  IconFileSpreadsheet,
  IconPackage,
  IconUpload,
  IconUsers,
} from '../icons'
import { InfoStatCard } from '../ui/InfoStatCard'
import { CardOrListLayout } from '../ui/CardOrListLayout'
import { DataTable } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import {
  formatLoteDate,
  fornecedorInitial,
  statusLabel,
  statusTone,
} from '../../utils/importacaoVisuals'

export function ImportacaoStatusBadge({ status, compact = false }) {
  const tone = statusTone(status)

  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset',
        compact ? 'px-2 py-0.5 text-[0.65rem]' : 'px-3 py-1 text-xs',
        tone.badge,
      ].join(' ')}
    >
      <span
        className={['size-1.5 shrink-0 rounded-full', tone.dot].join(' ')}
        aria-hidden
      />
      <span className="truncate">{statusLabel(status)}</span>
    </span>
  )
}

export function ImportacaoStatsBar({
  fornecedoresCount,
  produtosCount,
  loading,
}) {
  const items = [
    {
      label: 'Fornecedores',
      value: loading ? '—' : String(fornecedoresCount),
      hint: 'Ativos para importação',
      icon: IconUsers,
      accent: 'text-primary-600 bg-primary-50',
    },
    {
      label: 'Produtos ativos',
      value: loading ? '—' : String(produtosCount),
      hint: 'No catálogo oficial',
      icon: IconPackage,
      accent: 'text-emerald-700 bg-emerald-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <InfoStatCard key={item.label} {...item} />
      ))}
    </div>
  )
}

export function ImportacaoUploadPanel({
  getRootProps,
  getInputProps,
  isDragActive,
  isDragAccept,
  disabled,
}) {
  const dropzoneClass = [
    'flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all sm:min-h-[220px] sm:rounded-3xl',
    isDragAccept || isDragActive
      ? 'border-primary-400 bg-primary-50/70 shadow-inner'
      : 'border-slate-200 bg-slate-50/60 hover:border-primary-300 hover:bg-primary-50/40',
    disabled ? 'pointer-events-none opacity-60' : '',
  ].join(' ')

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-sky-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
          Nova importação
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Envie a planilha do fornecedor para iniciar o lançamento de produtos.
        </p>
      </div>

      <div className="p-4 sm:p-6">
        <div {...getRootProps({ className: dropzoneClass })}>
          <input {...getInputProps()} />
          <div
            className={[
              'flex size-14 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset',
              isDragActive
                ? 'bg-primary-100 text-primary-700 ring-primary-200/80'
                : 'bg-white text-slate-500 ring-slate-200/80',
            ].join(' ')}
          >
            {isDragActive ? (
              <IconFileSpreadsheet className="size-7" aria-hidden />
            ) : (
              <IconUpload className="size-7" aria-hidden />
            )}
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">
              {isDragActive
                ? 'Solte a planilha aqui'
                : 'Arraste e solte sua planilha'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              ou clique para selecionar · .xlsx, .csv
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function ImportacaoLoteCard({ lote }) {
  const tone = statusTone(lote.status)
  const isClickable =
    lote.status === 'aguardando_validacao' || lote.status === 'concluido'

  const content = (
    <>
      <header className="relative border-b border-white/60 px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-sm font-semibold text-primary-700 shadow-sm ring-1 ring-white/80">
              {fornecedorInitial(lote.fornecedor_nome)}
            </span>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Fornecedor
              </p>
              <p className="truncate text-sm font-semibold text-slate-900">
                {lote.fornecedor_nome}
              </p>
            </div>
          </div>
          <ImportacaoStatusBadge status={lote.status} compact />
        </div>
      </header>

      <div className="px-4 py-4 sm:px-5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Enviado em
        </p>
        <p className="mt-1 text-sm font-medium text-slate-800">
          {formatLoteDate(lote.data_upload)}
        </p>
        {isClickable ? (
          <p className="mt-2 text-xs font-medium text-primary-700">
            Clique para {lote.status === 'concluido' ? 'ver' : 'revisar'}
          </p>
        ) : null}
      </div>
    </>
  )

  if (isClickable) {
    return (
      <Link
        to={`/admin/importacao/lote/${lote.id}`}
        className={[
          'group block overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br shadow-sm transition-[box-shadow,border-color] hover:border-primary-200 hover:shadow-md sm:rounded-3xl',
          tone.panel,
        ].join(' ')}
      >
        {content}
      </Link>
    )
  }

  return (
    <article
      className={[
        'group overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br shadow-sm sm:rounded-3xl',
        tone.panel,
      ].join(' ')}
    >
      {content}
    </article>
  )
}

export function ImportacaoLotesSection({ lotes, loading }) {
  const navigate = useNavigate()

  const lotesColumns = useMemo(
    () => [
      {
        key: 'fornecedor',
        header: 'Fornecedor',
        cell: (lote) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-sm font-semibold text-primary-700 ring-1 ring-primary-100">
              {fornecedorInitial(lote.fornecedor_nome)}
            </span>
            <span className="truncate font-medium text-slate-900">
              {lote.fornecedor_nome}
            </span>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (lote) => <ImportacaoStatusBadge status={lote.status} compact />,
      },
      {
        key: 'enviado',
        header: 'Enviado em',
        cell: (lote) => (
          <span className="whitespace-nowrap text-slate-600">
            {formatLoteDate(lote.data_upload)}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50/50 via-white to-primary-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
          Histórico
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Acompanhe os lotes enviados e o status de cada importação.
        </p>
      </div>

      <div className="p-4 sm:p-6">
        {loading ? (
          <EmptyState
            title="Carregando lotes…"
            description="Buscando as importações mais recentes."
          />
        ) : lotes.length === 0 ? (
          <EmptyState
            title="Nenhum lote importado ainda"
            description="Envie uma planilha acima para iniciar o primeiro lançamento."
          />
        ) : (
          <CardOrListLayout
            cards={
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {lotes.map((lote) => (
                  <ImportacaoLoteCard key={lote.id} lote={lote} />
                ))}
              </div>
            }
            list={
              <DataTable
                columns={lotesColumns}
                rows={lotes}
                getRowKey={(lote) => lote.id}
                onRowClick={(lote) => {
                  const clickable =
                    lote.status === 'aguardando_validacao' ||
                    lote.status === 'concluido'
                  if (!clickable) return
                  navigate(`/admin/importacao/lote/${lote.id}`)
                }}
                emptyMessage="Nenhum lote importado ainda"
              />
            }
          />
        )}
      </div>
    </section>
  )
}
