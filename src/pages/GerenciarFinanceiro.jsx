import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModalNovoFinanceiro } from '../components/financeiro/ModaisUsuarioFinanceiro'
import { IconDollarSign, IconEye } from '../components/icons'
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

export function GerenciarFinanceiro() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [filters, , patchFilters] = usePersistedFilters('filters:financeiro-users', {
    searchQuery: '',
  })

  useSyncPageLoading(loading)

  const loadUsers = useCallback(async (isActive) => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, ativo')
      .eq('role', 'financeiro')
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

  useAbortableAsync(async (_signal, isActive) => {
    await loadUsers(isActive)
  }, [loadUsers])

  const filtered = useMemo(() => {
    const q = filters.searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => (row.nome ?? '').toLowerCase().includes(q))
  }, [rows, filters.searchQuery])

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <PageHeader
          eyebrow="Administração"
          title="Usuários financeiros"
          description="Cadastre o acesso ao controle de recebimentos. Um usuário desativado perde o login e não opera o módulo."
          actions={
            <Button type="button" className="w-full sm:w-auto" onClick={() => setModalOpen(true)}>
              Novo usuário
            </Button>
          }
          className="relative mb-0"
        />
        <PageInfoBanner icon={IconDollarSign}>
          {loading ? 'Carregando usuários…' : `${rows.length} usuário(s) financeiro(s).`}
        </PageInfoBanner>
      </div>

      {loadError ? <AlertMessage>{loadError}</AlertMessage> : null}

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <SearchInput
          value={filters.searchQuery}
          onChange={(e) => patchFilters({ searchQuery: e.target.value })}
          placeholder="Buscar por nome…"
        />
      </div>

      {loading ? (
        <EmptyState title="Carregando usuários…" />
      ) : filtered.length === 0 ? (
        <EmptyState title={rows.length === 0 ? 'Nenhum usuário financeiro cadastrado.' : 'Nenhum resultado para a busca.'} />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Acesso</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3.5 font-medium text-slate-900">{row.nome || '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className={row.ativo === false ? 'text-slate-500' : 'text-emerald-700'}>
                      {row.ativo === false ? 'Desativado' : 'Ativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-lg text-slate-400 hover:bg-primary-50 hover:text-primary-700"
                      aria-label={`Ver detalhes de ${row.nome}`}
                      onClick={() => navigate(`/admin/financeiro/${row.id}`)}
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

      <ModalNovoFinanceiro
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => void loadUsers(() => true)}
      />
    </div>
  )
}
