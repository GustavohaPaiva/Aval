import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconTruck, IconUser } from '../components/icons'
import { ModalEditarLogistica } from '../components/logistica/ModalEditarLogistica'
import { ModalTrocarCredenciaisLogistica } from '../components/logistica/ModalTrocarCredenciaisLogistica'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { ButtonGroup } from '../components/ui/ButtonGroup'
import { EmptyState } from '../components/ui/EmptyState'
import { PageBackLink } from '../components/ui/PageBackLink'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import { supabase } from '../services/supabase'
import { formatShortDate } from '../utils/formatShortDate'
import {
  formatCorporateEmail,
  parseSyagriLocalFromEmail,
} from '../utils/syagriEmail'

export function LogisticaUsuarioDetalhePage() {
  const { id } = useParams()
  const navigate = useNavigate()
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

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1)
  }, [])

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!id) return

      setLoading(true)
      setError(null)
      setActionError(null)

      const [profileRes, emailRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, nome, created_at, role')
          .eq('id', id)
          .eq('role', 'logistica')
          .maybeSingle(),
        supabase.rpc('get_logistica_email', { p_user_id: id }),
      ])

      if (!isActive()) return

      setLoading(false)

      if (profileRes.error) {
        setError(profileRes.error.message)
        setProfile(null)
        return
      }
      if (!profileRes.data) {
        setError('Usuário de logística não encontrado.')
        setProfile(null)
        return
      }

      setProfile(profileRes.data)
      if (emailRes.error) {
        setEmail('')
      } else {
        setEmail(String(emailRes.data ?? ''))
      }
    },
    [id, reloadToken],
    Boolean(id),
  )

  async function handleDelete() {
    if (!id || !profile) return

    const confirmed = window.confirm(
      `Excluir o usuário "${profile.nome}"? Ele perderá o acesso ao sistema. Esta ação não pode ser desfeita.`,
    )
    if (!confirmed) return

    setActionLoading(true)
    setActionError(null)
    const { error: deleteError } = await supabase.rpc('delete_logistica_user', {
      p_user_id: id,
    })
    setActionLoading(false)

    if (deleteError) {
      setActionError(
        deleteError.message || 'Não foi possível excluir o usuário.',
      )
      return
    }

    navigate('/admin/logistica', { replace: true })
  }

  if (!id) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <PageBackLink to="/admin/logistica">Voltar para logística</PageBackLink>
        <AlertMessage>Usuário não informado.</AlertMessage>
      </div>
    )
  }

  const usuario = parseSyagriLocalFromEmail(email)
  const initial = (profile?.nome ?? '').trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to="/admin/logistica">Voltar para logística</PageBackLink>

      {loading ? (
        <EmptyState
          title="Carregando usuário…"
          description="Aguarde um instante."
        />
      ) : error ? (
        <AlertMessage>{error}</AlertMessage>
      ) : profile ? (
        <>
          <section className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-5 shadow-sm sm:rounded-[2rem] sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-xl font-semibold text-white shadow-md shadow-primary-600/25">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                  Logística
                </p>
                <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900">
                  {profile.nome || '—'}
                </h1>
                <p className="mt-1 truncate text-sm text-slate-600">
                  {email || formatCorporateEmail(usuario) || 'E-mail indisponível'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 sm:ml-auto">
                <IconTruck className="size-3.5" />
                Pedidos assinados
              </span>
            </div>
          </section>

          {actionError ? <AlertMessage>{actionError}</AlertMessage> : null}

          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-violet-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <IconUser className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                      Cadastro e acesso
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      Dados de identificação do usuário de logística.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 w-full px-3 sm:w-auto"
                    onClick={() => setEditOpen(true)}
                    disabled={actionLoading}
                  >
                    Editar cadastro
                  </Button>
                  <Button
                    type="button"
                    className="h-9 w-full px-3 sm:w-auto"
                    onClick={() => setCredOpen(true)}
                    disabled={actionLoading}
                  >
                    Trocar credenciais
                  </Button>
                </div>
              </div>
            </div>

            <dl className="divide-y divide-slate-100">
              {[
                {
                  label: 'Cadastro',
                  value: formatShortDate(profile.created_at),
                },
                {
                  label: 'Usuário',
                  value: usuario ? formatCorporateEmail(usuario) : '—',
                },
                { label: 'Perfil', value: 'Logística' },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex flex-col items-center gap-1 px-4 py-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left"
                >
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {row.label}
                  </dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-amber-50/30 px-4 py-3.5 sm:px-6 sm:py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                Gerenciamento
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                Exclua o cadastro para remover o acesso ao sistema. Esta ação não
                pode ser desfeita.
              </p>
            </div>
            <div className="p-4 sm:p-6">
              <ButtonGroup>
                <Button
                  type="button"
                  variant="danger"
                  className="h-9"
                  loading={actionLoading}
                  onClick={() => void handleDelete()}
                >
                  Excluir usuário
                </Button>
              </ButtonGroup>
            </div>
          </section>

          <ModalEditarLogistica
            open={editOpen}
            userId={id}
            initialNome={profile.nome}
            onClose={() => setEditOpen(false)}
            onSaved={() => reload()}
          />
          <ModalTrocarCredenciaisLogistica
            open={credOpen}
            userId={id}
            initialUsuario={usuario}
            onClose={() => setCredOpen(false)}
            onSaved={() => reload()}
          />
        </>
      ) : null}
    </div>
  )
}
