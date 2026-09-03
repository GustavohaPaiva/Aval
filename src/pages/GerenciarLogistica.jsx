import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModalNovoLogistica } from '../components/logistica/ModalNovoLogistica'
import { IconEye, IconTruck } from '../components/icons'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { PageInfoBanner } from '../components/ui/InfoStatCard'
import { SearchInput } from '../components/ui/SearchInput'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import { usePersistedFilters } from '../hooks/usePersistedFilters'
import { supabase } from '../services/supabase'
import { formatShortDate } from '../utils/formatShortDate'

export function GerenciarLogistica() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [filters, , patchFilters] = usePersistedFilters('filters:logistica-users', {
    searchQuery: '',
  })
  const { searchQuery } = filters

  useSyncPageLoading(loading)

  const loadUsers = useCallback(async (isActive) => {
    setLoading(true)
    setLoadError(null)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, created_at')
      .eq('role', 'logistica')
      .order('nome', { ascending: true })

    if (!isActive()) return

    setLoading(false)

    if (error) {
      setLoadError(error.message)
      setRows([])
      return
    }

    setRows(data ?? [])
  }, [])

  useAbortableAsync(
    async (_signal, isActive) => {
      await loadUsers(isActive)
    },
    [loadUsers],
  )

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => (row.nome ?? '').toLowerCase().includes(q))
  }, [rows, searchQuery])

  const hasFilters = Boolean(searchQuery.trim())

  const emptyMessage =
    rows.length === 0
      ? 'Nenhum usuário de logística cadastrado.'
      : 'Nenhum resultado para a busca.'

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-violet-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <PageHeader
          eyebrow="Administração"
          title="Usuários de logística"
          description="Cadastre gerentes de logística com acesso apenas a pedidos já assinados."
          actions={
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => setModalOpen(true)}
            >
              Novo usuário
            </Button>
          }
          className="relative mb-0"
        />

        <PageInfoBanner icon={IconTruck}>
          {loading
            ? 'Carregando usuários…'
            : hasFilters
              ? `${filteredRows.length} usuário(s) encontrado(s).`
              : `${rows.length} usuário(s) de logística cadastrado(s).`}
        </PageInfoBanner>
      </div>

      {loadError ? <AlertMessage>{loadError}</AlertMessage> : null}

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <SearchInput
          value={searchQuery}
          onChange={(e) => patchFilters({ searchQuery: e.target.value })}
          placeholder="Buscar por nome…"
        />
      </div>

      {loading ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Carregando…
        </section>
      ) : filteredRows.length === 0 ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-10">
          <EmptyState title={emptyMessage} />
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Nome
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Cadastro
                </th>
                <th className="w-16 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span className="sr-only">Detalhes</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="px-4 py-3.5 font-medium text-slate-900">
                    {row.nome || '—'}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">
                    {row.created_at ? formatShortDate(row.created_at) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-primary-50 hover:text-primary-700"
                      aria-label={`Ver detalhes de ${row.nome}`}
                      title="Ver detalhes"
                      onClick={() => navigate(`/admin/logistica/${row.id}`)}
                    >
                      <IconEye className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <ModalNovoLogistica
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => void loadUsers(() => true)}
      />
    </div>
  )
}
