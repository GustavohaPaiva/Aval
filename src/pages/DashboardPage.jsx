import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconClipboardList, IconLayoutDashboard, IconUser, IconUsers } from '../components/icons'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { InfoStatCard, PageInfoBanner } from '../components/ui/InfoStatCard'
import { PageHeader } from '../components/ui/PageHeader'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import { useAuth } from '../hooks/useAuth'
import {
  fetchConsultorDashboardStats,
  fetchGestorDashboardStats,
} from '../services/simulationOrderService'

export function DashboardPage() {
  const { user, role, initializing } = useAuth()
  const navigate = useNavigate()
  const isGestor = role === 'gestor'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [gestorStats, setGestorStats] = useState(null)
  const [consultorStats, setConsultorStats] = useState(null)

  useSyncPageLoading(loading || initializing)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!user?.id || !role) {
        if (!isActive()) return
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      if (role === 'gestor') {
        const res = await fetchGestorDashboardStats()
        if (!isActive()) return
        setLoading(false)
        if (!res.ok) {
          setError(res.error)
          setGestorStats(null)
          return
        }
        setGestorStats(res.stats)
        setConsultorStats(null)
        return
      }
      const res = await fetchConsultorDashboardStats(user.id)
      if (!isActive()) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setConsultorStats(null)
        return
      }
      setConsultorStats(res.stats)
      setGestorStats(null)
    },
    [user?.id, role],
    !initializing && Boolean(user?.id) && Boolean(role),
  )

  const gestorCards = gestorStats
    ? [
        {
          label: 'Pendentes',
          value: String(gestorStats.pendingCount),
          hint: 'Aguardando revisão',
          icon: IconClipboardList,
          accent: 'text-amber-700 bg-amber-50',
          to: '/simulacoes?status=pending',
        },
        {
          label: 'Aprovadas',
          value: String(gestorStats.approvedCount),
          hint: 'Liberadas',
          icon: IconClipboardList,
          accent: 'text-emerald-700 bg-emerald-50',
          to: '/simulacoes?status=approved',
        },
        {
          label: 'Clientes',
          value: String(gestorStats.clientsCount),
          hint: 'Cadastro',
          icon: IconUser,
          accent: 'text-primary-600 bg-primary-50',
          to: '/clientes',
        },
        {
          label: 'Consultores',
          value: String(gestorStats.consultoresCount),
          hint: 'Equipe',
          icon: IconUsers,
          accent: 'text-violet-700 bg-violet-50',
          to: '/admin/consultores',
        },
      ]
    : []

  const consultorCards = consultorStats
    ? [
        {
          label: 'Rascunhos',
          value: String(consultorStats.draftCount),
          hint: 'Em edição',
          icon: IconClipboardList,
          accent: 'text-slate-700 bg-slate-100',
          to: '/simulacoes?status=draft',
        },
        {
          label: 'Pendentes',
          value: String(consultorStats.pendingCount),
          hint: 'Com o gestor',
          icon: IconClipboardList,
          accent: 'text-amber-700 bg-amber-50',
          to: '/simulacoes?status=pending',
        },
        {
          label: 'Aprovadas',
          value: String(consultorStats.approvedCount),
          hint: 'Prontas para pedido',
          icon: IconClipboardList,
          accent: 'text-emerald-700 bg-emerald-50',
          to: '/simulacoes?status=approved',
        },
        {
          label: 'Convertidas',
          value: String(consultorStats.convertedCount),
          hint: 'Pedidos fechados',
          icon: IconClipboardList,
          accent: 'text-primary-600 bg-primary-50',
          to: '/pedidos',
        },
      ]
    : []

  const cards = isGestor ? gestorCards : consultorCards

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <PageHeader
          eyebrow="Visão geral"
          title="Dashboard"
          description={
            isGestor
              ? 'Acompanhe revisões pendentes e lance novas simulações quando necessário.'
              : 'Resumo das suas simulações e atalho para novas propostas.'
          }
          actions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => navigate('/simulador')}
              >
                Nova simulação
              </Button>
              {isGestor ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => navigate('/simulacoes?status=pending')}
                >
                  Ver pendentes
                </Button>
              ) : null}
            </div>
          }
          className="relative mb-0"
        />
        <PageInfoBanner icon={IconLayoutDashboard}>
          {loading || initializing
            ? 'Carregando indicadores…'
            : 'Indicadores atualizados com base nas simulações e cadastros.'}
        </PageInfoBanner>
      </div>

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading || initializing
          ? Array.from({ length: 4 }).map((_, i) => (
              <InfoStatCard
                key={i}
                label="…"
                value="—"
                hint="Carregando"
                icon={IconClipboardList}
                accent="text-slate-500 bg-slate-100"
              />
            ))
          : cards.map((card) => (
              <Link key={card.label} to={card.to} className="block min-w-0">
                <InfoStatCard
                  label={card.label}
                  value={card.value}
                  hint={card.hint}
                  icon={card.icon}
                  accent={card.accent}
                />
              </Link>
            ))}
      </div>
    </div>
  )
}
