import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FinanceiroStatusBadge } from "../../components/financeiro/FinanceiroSituacao";
import { IconDollarSign } from "../../components/icons";
import { AlertMessage } from "../../components/ui/AlertMessage";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageInfoBanner } from "../../components/ui/InfoStatCard";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { useSyncPageLoading } from "../../contexts/PageLoadingContext";
import { useAbortableAsync } from "../../hooks/useAbortableAsync";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePersistedFilters } from "../../hooks/usePersistedFilters";
import { listarCarteiraFinanceira } from "../../services/financeiroService";
import { formatDateBr } from "../../utils/formatDateBr";
import {
  STATUS_PRINCIPAL_LABEL,
  statusPrincipalFinanceiro,
} from "../../utils/financeiroSituacao";
import { formatBRL } from "../../utils/money";

const SITUACAO_OPTIONS = [
  { value: "", label: "Todas as situações" },
  ...Object.entries(STATUS_PRINCIPAL_LABEL).map(([value, label]) => ({
    value,
    label,
  })),
];

export function FinanceiroPedidosPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, , patchFilters] = usePersistedFilters("filters:financeiro", {
    searchQuery: "",
    situacao: "",
  });
  const debouncedSearch = useDebouncedValue(filters.searchQuery, 300);

  useSyncPageLoading(loading);

  const load = useCallback(
    async (isActive) => {
      setLoading(true);
      setError(null);
      const res = await listarCarteiraFinanceira({
        busca: debouncedSearch,
      });
      if (!isActive()) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setRows([]);
        return;
      }
      setRows(res.rows);
    },
    [debouncedSearch],
  );

  useAbortableAsync(
    async (_signal, isActive) => {
      await load(isActive);
    },
    [load],
  );

  const visiveis = useMemo(
    () =>
      rows.filter(
        (row) =>
          !filters.situacao ||
          statusPrincipalFinanceiro(row) === filters.situacao,
      ),
    [filters.situacao, rows],
  );

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <PageHeader
          eyebrow="Financeiro"
          title="Recebimentos"
          description="Pedidos com valor, recebido e saldo. A situação é uma só: quitado, atrasado, próximo do vencimento (hoje e os 3 dias seguintes), parcial, pendente ou sem vencimento."
          className="relative mb-0"
        />
        <PageInfoBanner icon={IconDollarSign}>
          {loading
            ? "Carregando pedidos…"
            : `${visiveis.length} pedido(s) na carteira.`}
        </PageInfoBanner>
      </div>

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <SearchInput
              value={filters.searchQuery}
              onChange={(e) => patchFilters({ searchQuery: e.target.value })}
              placeholder="Cliente, consultor ou pedido…"
              ariaLabel="Buscar pedidos financeiros"
            />
          </div>
          <div className="w-full md:w-64">
            <Select
              label="Situação"
              value={filters.situacao}
              onChange={(e) => patchFilters({ situacao: e.target.value })}
              options={SITUACAO_OPTIONS}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <EmptyState
          title="Carregando pedidos…"
          description="Aguarde um instante."
        />
      ) : visiveis.length === 0 ? (
        <EmptyState
          title="Nenhum pedido encontrado"
          description="Ajuste a busca ou os filtros."
        />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-center text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr>
                  {[
                    "Pedido",
                    "Cliente",
                    "Consultor",
                    "Total",
                    "Recebido",
                    "Saldo",
                    "Vencimento",
                    "Situação",
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((row) => (
                  <tr
                    key={row.simulationId}
                    className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-primary-50/40"
                    onClick={() => navigate(`/financeiro/${row.simulationId}`)}
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-900">
                      {row.identificacao}
                    </td>
                    <td className="max-w-56 truncate px-4 py-3.5 text-slate-800">
                      {row.clienteNome}
                    </td>
                    <td className="max-w-44 truncate px-4 py-3.5 text-slate-600">
                      {row.consultorNome}
                    </td>
                    <td className="finance-text whitespace-nowrap px-4 py-3.5 text-slate-800">
                      {formatBRL(row.valorDevido)}
                    </td>
                    <td className="finance-text whitespace-nowrap px-4 py-3.5 text-slate-700">
                      {formatBRL(row.valorRecebido)}
                    </td>
                    <td className="finance-text whitespace-nowrap px-4 py-3.5 font-semibold text-slate-900">
                      {formatBRL(row.saldo)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                      {formatDateBr(row.vencimento)}
                    </td>
                    <td className="px-4 py-3.5">
                      <FinanceiroStatusBadge {...row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 md:hidden">
            {visiveis.map((row) => (
              <button
                key={row.simulationId}
                type="button"
                className="rounded-2xl border border-slate-200 p-4 text-left"
                onClick={() => navigate(`/financeiro/${row.simulationId}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {row.identificacao}
                    </p>
                    <p className="mt-1 truncate font-semibold text-slate-900">
                      {row.clienteNome}
                    </p>
                    <p className="truncate text-sm text-slate-600">
                      {row.consultorNome}
                    </p>
                  </div>
                  <FinanceiroStatusBadge {...row} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <ValorMini label="Total" value={row.valorDevido} />
                  <ValorMini label="Recebido" value={row.valorRecebido} />
                  <ValorMini label="Saldo" value={row.saldo} emphasis />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Vence {formatDateBr(row.vencimento)}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ValorMini({ label, value, emphasis = false }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p
        className={[
          "finance-text mt-0.5 truncate text-sm",
          emphasis ? "font-semibold text-slate-900" : "text-slate-700",
        ].join(" ")}
      >
        {formatBRL(value)}
      </p>
    </div>
  );
}
