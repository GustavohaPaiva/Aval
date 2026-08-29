import {
  IconClipboardList,
  IconDollarSign,
  IconHistory,
  IconUser,
  IconUsers,
} from '../icons'
import { InfoStatCard } from '../ui/InfoStatCard'
import { Button } from '../ui/Button'
import { formatShortDate } from '../../utils/formatShortDate'
import { formatBRL } from '../../utils/money'
import { formatCorporateEmail } from '../../utils/syagriEmail'

function consultorInitial(nome) {
  const trimmed = (nome ?? '').trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

export function ConsultorDetailStats({ metric, conversionRate, loading }) {
  const items = [
    {
      label: 'Simulações',
      value: loading ? '—' : String(metric?.total_simulacoes ?? 0),
      hint: 'Total registrado',
      icon: IconClipboardList,
      accent: 'text-primary-600 bg-primary-50',
    },
    {
      label: 'Vendas',
      value: loading ? '—' : String(metric?.total_vendas ?? 0),
      hint: 'Pedidos convertidos',
      icon: IconDollarSign,
      accent: 'text-sky-700 bg-sky-50',
    },
    {
      label: 'Conversão',
      value: loading ? '—' : `${conversionRate}%`,
      hint: 'Vendas sobre simulações',
      icon: IconUsers,
      accent: 'text-emerald-700 bg-emerald-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <InfoStatCard key={item.label} {...item} />
      ))}
    </div>
  )
}

/**
 * Prévia de vendas + comissão (mesma fonte da tela /comissao).
 * Status Prompt 10: confirmada ≈ paga/convertida; calculada ≈ pendente.
 */
export function ConsultorResumoComercial({ vendas, comissao, loading }) {
  const qtd = vendas?.quantidade ?? 0
  const valorVendas = vendas?.valor ?? 0
  const total = comissao?.total ?? 0
  const confirmada = comissao?.confirmada ?? 0
  const calculada = comissao?.calculada ?? 0

  const items = [
    {
      label: 'Vendas',
      value: loading ? '—' : formatBRL(valorVendas),
      hint: loading
        ? 'Carregando…'
        : `${qtd.toLocaleString('pt-BR')} pedido${qtd === 1 ? '' : 's'} convertido${qtd === 1 ? '' : 's'}`,
      icon: IconDollarSign,
      accent: 'text-sky-700 bg-sky-50',
    },
    {
      label: 'Comissão total',
      value: loading ? '—' : formatBRL(total),
      hint: 'Confirmada + calculada',
      icon: IconClipboardList,
      accent: 'text-primary-600 bg-primary-50',
    },
    {
      label: 'Confirmada',
      value: loading ? '—' : formatBRL(confirmada),
      hint: 'Pedidos convertidos',
      icon: IconDollarSign,
      accent: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Calculada',
      value: loading ? '—' : formatBRL(calculada),
      hint: 'Pendente de confirmação',
      icon: IconHistory,
      accent: 'text-amber-700 bg-amber-50',
    },
  ]

  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
          Resumo comercial
        </p>
        <p className="mt-0.5 text-sm text-slate-600">
          Prévia de vendas e comissão — total geral, sem filtro de período.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <InfoStatCard key={item.label} {...item} />
        ))}
      </div>
    </section>
  )
}

export function ConsultorProfileHero({ nome, email, usuario }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-violet-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl sm:-right-10 sm:-top-10 sm:size-40"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-3xl bg-primary-600 text-2xl font-semibold text-white shadow-md ring-4 ring-white/80">
          {consultorInitial(nome)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
            Consultor
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {nome}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {usuario ? formatCorporateEmail(usuario) : email || 'Usuário não informado'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function ConsultorInfoPanel({ profile, usuario, onEdit, onTrocarCredenciais }) {
  const rows = [
    { label: 'Cadastro', value: formatShortDate(profile.created_at) },
    { label: 'Usuário', value: usuario ? formatCorporateEmail(usuario) : '—' },
    { label: 'Filial', value: profile.filial?.trim() || '—' },
    { label: 'WhatsApp', value: profile.whatsapp_phone_e164?.trim() || '—' },
    {
      label: 'Notificações no WhatsApp',
      value: profile.whatsapp_notifications_enabled ? 'Ativadas' : 'Desativadas',
    },
    { label: 'Perfil', value: profile.role },
  ]

  return (
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
                Dados de identificação do consultor.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="h-9 w-full px-3 sm:w-auto"
              onClick={onEdit}
            >
              Editar cadastro
            </Button>
            <Button
              type="button"
              className="h-9 w-full px-3 sm:w-auto"
              onClick={onTrocarCredenciais}
            >
              Trocar credenciais
            </Button>
          </div>
        </div>
      </div>

      <dl className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col items-center gap-1 px-4 py-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left"
          >
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {row.label}
            </dt>
            <dd className="text-sm font-medium capitalize text-slate-900">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
