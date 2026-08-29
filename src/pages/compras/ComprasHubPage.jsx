import { Link } from 'react-router-dom'
import { ComprasSubnav } from '../../components/compras/ComprasSubnav'
import { IconClipboardList, IconPackage, IconWarehouse } from '../../components/icons'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageInfoBanner } from '../../components/ui/InfoStatCard'
import { useSyncPageLoading } from '../../contexts/PageLoadingContext'

const CARDS = [
  {
    to: '/compras/demanda',
    title: 'Demanda',
    description: 'Pedidos convertidos. Abra o pedido para vincular estoque ou ordem de compra.',
    icon: IconClipboardList,
  },
  {
    to: '/compras/ordens',
    title: 'Pedidos de compra',
    description: 'Ordens ao fornecedor, PDF e recebimento.',
    icon: IconPackage,
  },
  {
    to: '/compras/estoque',
    title: 'Estoque',
    description: 'Lotes no Estoque Syagri e lançamentos individuais.',
    icon: IconWarehouse,
  },
]

export function ComprasHubPage() {
  useSyncPageLoading(false)

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <PageHeader
          eyebrow="Vendas"
          title="Compras"
          description="Hub de demanda, ordens de compra e estoque. Acesso exclusivo do gestor."
          className="relative mb-0"
        />
        <PageInfoBanner icon={IconPackage}>
          Local atual: Estoque Syagri. Multi-depósito entra numa próxima etapa.
        </PageInfoBanner>
      </div>

      <ComprasSubnav />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-primary-200 hover:bg-primary-50/40"
          >
            <span className="flex size-10 items-center justify-center rounded-2xl bg-primary-50 text-primary-800 ring-1 ring-primary-100">
              <card.icon className="size-4" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">{card.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{card.description}</p>
            <p className="mt-4 text-sm font-semibold text-primary-700 group-hover:underline">
              Abrir
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
