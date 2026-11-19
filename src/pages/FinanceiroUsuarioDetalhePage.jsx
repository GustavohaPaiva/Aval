import { useCallback, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ModalCredenciaisFinanceiro,
  ModalEditarFinanceiro,
} from '../components/financeiro/ModaisUsuarioFinanceiro'
import { IconDollarSign, IconUser } from '../components/icons'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageBackLink } from '../components/ui/PageBackLink'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import { supabase } from '../services/supabase'

export function FinanceiroUsuarioDetalhePage() {
  const { id } = useParams()
  const [loading, setLoading] = useState(Boolean(id))
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [credOpen, setCredOpen] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useSyncPageLoading(loading)
  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!id) return
      setLoading(true)
      setError(null)
      const [profileRes, emailRes] = await Promise.all([
        supabase.from('profiles').select('id, nome, ativo, role').eq('id', id).eq('role', 'financeiro').maybeSingle(),
        supabase.rpc('get_financeiro_email', { p_user_id: id }),
      ])
      if (!isActive()) return
      setLoading(false)
      if (profileRes.error || !profileRes.data) {
        setError(profileRes.error?.message || 'Usuário financeiro não encontrado.')
        setProfile(null)
        return
      }
      setProfile(profileRes.data)
      setEmail(emailRes.error ? '' : String(emailRes.data ?? ''))
    },
    [id, reloadToken],
    Boolean(id),
  )

  async function toggleAtivo() {
    if (!profile) return
    const next = profile.ativo === false
    const confirmed = window.confirm(
      next
        ? `Reativar o acesso de "${profile.nome}"?`
        : `Desativar o acesso de "${profile.nome}"? O histórico de recebimentos permanece.`,
    )
    if (!confirmed) return
    setActionLoading(true)
    setActionError(null)
    const { error: rpcError } = await supabase.rpc('set_financeiro_user_ativo', {
      p_user_id: id,
      p_ativo: next,
    })
    setActionLoading(false)
    if (rpcError) {
      setActionError(rpcError.message)
      return
    }
    reload()
  }

  if (!id) return <AlertMessage>Usuário não informado.</AlertMessage>

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to="/admin/financeiro">Voltar para usuários financeiros</PageBackLink>
      {loading ? (
        <EmptyState title="Carregando usuário…" description="Aguarde um instante." />
      ) : error ? (
        <AlertMessage>{error}</AlertMessage>
      ) : profile ? (
        <>
          <section className="rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-5 shadow-sm sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-600 text-xl font-semibold text-white">
                {(profile.nome ?? '?').trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Financeiro</p>
                <h1 className="mt-1 truncate text-2xl font-semibold text-slate-900">{profile.nome}</h1>
                <p className="truncate text-sm text-slate-600">{email || 'E-mail indisponível'}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 sm:ml-auto">
                <IconDollarSign className="size-3.5" />
                {profile.ativo === false ? 'Desativado' : 'Ativo'}
              </span>
            </div>
          </section>
          {actionError ? <AlertMessage>{actionError}</AlertMessage> : null}
          <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-2">
                <IconUser className="size-4 text-primary-700" />
                <p className="text-sm text-slate-600">Cadastro e credenciais de acesso.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="secondary" onClick={() => setEditOpen(true)}>Editar cadastro</Button>
                <Button type="button" onClick={() => setCredOpen(true)}>Trocar credenciais</Button>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <Button
                type="button"
                variant={profile.ativo === false ? 'primary' : 'danger'}
                loading={actionLoading}
                onClick={() => void toggleAtivo()}
              >
                {profile.ativo === false ? 'Reativar acesso' : 'Desativar acesso'}
              </Button>
            </div>
          </section>
          <ModalEditarFinanceiro
            open={editOpen}
            onClose={() => setEditOpen(false)}
            userId={id}
            nomeInicial={profile.nome}
            onSaved={reload}
          />
          <ModalCredenciaisFinanceiro
            open={credOpen}
            onClose={() => setCredOpen(false)}
            userId={id}
            emailInicial={email}
            onSaved={reload}
          />
        </>
      ) : null}
    </div>
  )
}
