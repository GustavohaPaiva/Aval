import {
  IconClipboardList,
  IconDollarSign,
  IconPackage,
  IconUser,
} from "../icons";
import { InfoStatCard } from "../ui/InfoStatCard";
import { Button } from "../ui/Button";
import { ButtonGroup } from "../ui/ButtonGroup";
import { EmptyState } from "../ui/EmptyState";
import {
  isPedidoStatus,
  statusBadgeClass,
  statusLabelPt,
} from "../../constants/simulationStatus";
import { formatShortDate } from "../../utils/formatShortDate";
import { formatBRL } from "../../utils/money";
import { displayCep, displayCpfCnpj, displayPhone } from "../../utils/dataFormatters";

function clienteInitial(nome) {
  const trimmed = (nome ?? "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function statusLabel(status) {
  return statusLabelPt(status);
}

export function ClienteProfileHero({ client }) {
  const local = [client.municipio, client.uf].filter(Boolean).join(" — ");
  const isInactive = client.ativo === false;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl sm:-right-10 sm:-top-10 sm:size-40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-6 left-1/4 size-24 rounded-full bg-emerald-200/20 blur-3xl sm:-bottom-8 sm:left-1/3 sm:size-32"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-3xl bg-primary-600 text-2xl font-semibold text-white shadow-md ring-4 ring-white/80">
          {clienteInitial(client.nome)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
              Cliente
            </p>
            {isInactive ? (
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                Inativo
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {client.nome}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{displayCpfCnpj(client.cnpj_cpf)}</p>
          {local ? (
            <p className="mt-1 text-sm text-slate-500">{local}</p>
          ) : null}
          {isInactive ? (
            <p className="mt-2 text-sm text-slate-500">
              Cliente inativo: não aparece no simulador e não recebe novos lançamentos.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ClienteDetailStats({ stats, conversionRate, loading }) {
  const items = [
    {
      label: "Simulações",
      value: loading ? "—" : String(stats.total),
      hint: "Total registrado",
      icon: IconClipboardList,
      accent: "text-primary-600 bg-primary-50",
    },
    {
      label: "Vendas",
      value: loading ? "—" : String(stats.vendas),
      hint: "Pedidos convertidos",
      icon: IconDollarSign,
      accent: "text-sky-700 bg-sky-50",
    },
    {
      label: "Conversão",
      value: loading ? "—" : `${conversionRate}%`,
      hint: "Vendas sobre simulações",
      icon: IconPackage,
      accent: "text-emerald-700 bg-emerald-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <InfoStatCard key={item.label} {...item} />
      ))}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;

  return (
    <div className="flex flex-col items-center gap-1 px-4 py-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd className="text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function ClienteInfoPanel({
  client,
  isGestor,
  onEdit,
  onToggleAtivo,
  onDelete,
  actionLoading = false,
}) {
  const endereco = [client.logradouro, client.bairro, displayCep(client.cep)]
    .filter(Boolean)
    .join(" · ");
  const isInactive = client.ativo === false;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <IconUser className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                  Dados cadastrais
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  Informações de identificação e contato.
                </p>
              </div>
            </div>
            {isGestor ? (
              <Button
                type="button"
                variant="secondary"
                className="h-9 w-full px-3 sm:w-auto"
                onClick={onEdit}
                disabled={actionLoading}
              >
                Editar cliente
              </Button>
            ) : null}
          </div>
        </div>

        <dl className="divide-y divide-slate-100">
          <InfoRow
            label="Status"
            value={isInactive ? "Inativo" : "Ativo"}
          />
          <InfoRow label="CPF / CNPJ" value={displayCpfCnpj(client.cnpj_cpf)} />
          <InfoRow
            label="Cadastro"
            value={formatShortDate(client.created_at)}
          />
          <InfoRow label="Razão social" value={client.razao_social} />
          <InfoRow label="E-mail" value={client.email} />
          <InfoRow label="Telefone" value={displayPhone(client.telefone)} />
          <InfoRow
            label="Local"
            value={[client.municipio, client.uf].filter(Boolean).join(" — ")}
          />
          <InfoRow label="Endereço" value={endereco || null} />
        </dl>
      </section>

      {isGestor ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-amber-50/30 px-4 py-3.5 sm:px-6 sm:py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
              Gerenciamento
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              Inative para bloquear novos lançamentos ou exclua o cadastro quando não houver histórico.
            </p>
          </div>
          <div className="p-4 sm:p-6">
            <ButtonGroup>
              <Button
                type="button"
                variant="secondary"
                className="h-9"
                loading={actionLoading}
                onClick={onToggleAtivo}
              >
                {isInactive ? "Reativar cliente" : "Inativar cliente"}
              </Button>
              <Button
                type="button"
                variant="danger"
                className="h-9"
                loading={actionLoading}
                onClick={onDelete}
              >
                Excluir cliente
              </Button>
            </ButtonGroup>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MobileCellLabel({ children }) {
  return (
    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-500 md:hidden">
      {children}
    </span>
  );
}

export function ClienteSimulationsTable({
  rows,
  loading,
  emptyMessage,
  onViewPedido,
  isGestor = false,
}) {
  if (loading) {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
            Histórico comercial
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            Simulações e compras deste cliente.
          </p>
        </div>
        <div className="p-8 text-center text-sm text-slate-500">
          Carregando histórico…
        </div>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
            Histórico comercial
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            Simulações e compras deste cliente.
          </p>
        </div>
        <div className="p-6 sm:p-10">
          <EmptyState title={emptyMessage} />
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
          Histórico comercial
        </p>
        <p className="mt-0.5 text-sm text-slate-600">
          Simulações e compras deste cliente.
        </p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead className="hidden border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-primary-50/40 md:table-header-group">
          <tr>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Data
            </th>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Status
            </th>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Proposta
            </th>
            <th className="w-32 px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Ações
            </th>
          </tr>
        </thead>

        <tbody className="block md:table-row-group">
          {rows.map((row, index) => {
            const canViewPedido =
              (isGestor && isPedidoStatus(row.status)) ||
              row.status === "converted";

            return (
              <tr
                key={row.id}
                className={[
                  "group block border-b border-slate-100 p-4 last:border-b-0",
                  "md:table-row md:border-0 md:p-0",
                  index % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                  "md:hover:bg-primary-50/35",
                ].join(" ")}
              >
                <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 md:table-cell md:border-0 md:px-4 md:py-4 md:text-center">
                  <MobileCellLabel>Data</MobileCellLabel>
                  <span className="text-sm text-slate-700">
                    {formatShortDate(row.created_at)}
                  </span>
                </td>

                <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 md:table-cell md:border-0 md:px-4 md:py-4 md:text-center">
                  <MobileCellLabel>Status</MobileCellLabel>
                  <span
                    className={[
                      "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                      statusBadgeClass(row.status),
                    ].join(" ")}
                  >
                    {statusLabel(row.status)}
                  </span>
                </td>

                <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 md:table-cell md:border-0 md:px-4 md:py-4 md:text-center">
                  <MobileCellLabel>Proposta</MobileCellLabel>
                  <span className="finance-text inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200/80 md:min-w-[6.5rem] md:rounded-2xl md:px-3 md:py-2 group-hover:md:ring-primary-200">
                    {formatBRL(row.total_proposta)}
                  </span>
                </td>

                <td className="mt-3 flex justify-end border-t border-slate-100/80 pt-3 md:mt-0 md:table-cell md:border-0 md:px-4 md:py-4 md:text-center">
                  {canViewPedido ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 px-3"
                      onClick={() => onViewPedido(row.id)}
                    >
                      Ver pedido
                    </Button>
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
