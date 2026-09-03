import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconBell, IconCheck } from "../components/icons";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { DatePicker } from "../components/ui/DatePicker";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { PageInfoBanner } from "../components/ui/InfoStatCard";
import { SearchInput } from "../components/ui/SearchInput";
import { Select } from "../components/ui/Select";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePersistedFilters } from "../hooks/usePersistedFilters";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationOpensPedido,
  notificationTypeLabel,
} from "../services/notificationService";

const NOTIFICATION_TYPES = [
  "approval_request",
  "simulation_saved",
  "simulation_approved",
  "simulation_rejected",
  "simulation_gestor_updated",
  "order_approval_request",
  "order_conversion_request",
  "order_approved",
  "order_rejected",
  "pedido_fields_updated",
  "exchange_rate_changed",
  "price_list_changed",
];

const TYPE_OPTIONS = [
  { value: "", label: "Todos os tipos" },
  ...NOTIFICATION_TYPES.map((type) => ({
    value: type,
    label: notificationTypeLabel(type),
  })),
];

const READ_STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "unread", label: "Não lida" },
  { value: "read", label: "Lida" },
];

const EMPTY_FILTERS = {
  searchQuery: "",
  type: "",
  readStatus: "",
  senderId: "",
  dateFrom: "",
  dateTo: "",
};

/** YYYY-MM-DD local from an ISO timestamp (for inclusive date-range compare). */
function toLocalDateKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatNotificationDate(iso) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeBadgeClass(type) {
  switch (type) {
    case "approval_request":
    case "order_approval_request":
    case "order_conversion_request":
      return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    case "simulation_approved":
    case "order_approved":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "simulation_rejected":
    case "order_rejected":
      return "bg-red-50 text-red-800 ring-1 ring-red-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

function notificationCardClass(unread) {
  return unread
    ? "relative overflow-hidden rounded-2xl border-2 border-red-300 bg-red-50 shadow-sm sm:rounded-3xl"
    : "relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-sm sm:rounded-3xl";
}

function ReadStatusBadge({ unread }) {
  if (unread) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
        <span className="size-1.5 rounded-full bg-white" aria-hidden />
        Não lida
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
      <IconCheck className="size-3" />
      Lida
    </span>
  );
}

export function NotificacoesPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isGestor = role === "gestor";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [filters, setFilters, patchFilters] = usePersistedFilters(
    "filters:notificacoes",
    EMPTY_FILTERS,
  );
  const { searchQuery, type, readStatus, senderId, dateFrom, dateTo } =
    filters;
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const hasFilters = Boolean(
    searchQuery.trim() || type || readStatus || senderId || dateFrom || dateTo,
  );

  useSyncPageLoading(loading);

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoading(true);
      setError(null);
      const result = await fetchNotifications({ limit: 200 });
      if (!isActive()) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        setRows([]);
        return;
      }
      setRows(result.rows);
    },
    [reloadToken],
  );

  const senderOptions = useMemo(() => {
    const byId = new Map();
    for (const row of rows) {
      const id = row.sender_id;
      if (id == null || byId.has(String(id))) continue;
      byId.set(String(id), {
        value: String(id),
        label: row.sender_nome || "Remetente sem nome",
      });
    }
    return [
      { value: "", label: "Todos os remetentes" },
      ...[...byId.values()].sort((a, b) =>
        a.label.localeCompare(b.label, "pt-BR"),
      ),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (type && row.type !== type) return false;

      if (readStatus === "unread" && row.read_at) return false;
      if (readStatus === "read" && !row.read_at) return false;

      if (senderId && String(row.sender_id) !== String(senderId)) {
        return false;
      }

      if (dateFrom || dateTo) {
        const key = toLocalDateKey(row.created_at);
        if (!key) return false;
        if (dateFrom && key < dateFrom) return false;
        if (dateTo && key > dateTo) return false;
      }

      if (q) {
        const title = String(row.title ?? "").toLowerCase();
        const body = String(row.body ?? "").toLowerCase();
        const sender = String(row.sender_nome ?? "").toLowerCase();
        if (
          !title.includes(q) &&
          !body.includes(q) &&
          !sender.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    rows,
    debouncedSearch,
    type,
    readStatus,
    senderId,
    dateFrom,
    dateTo,
  ]);

  const unreadCount = rows.filter((row) => !row.read_at).length;

  async function handleOpen(notification) {
    setOpeningId(notification.id);
    try {
      if (!notification.read_at) {
        await markNotificationRead(notification.id);
        setRows((prev) =>
          prev.map((row) =>
            row.id === notification.id
              ? { ...row, read_at: new Date().toISOString() }
              : row,
          ),
        );
      }
      if (notification.simulation_id) {
        if (notification.type === "order_approved") {
          navigate(
            `/pedido/${encodeURIComponent(notification.simulation_id)}`,
          );
        } else if (notification.type === "pedido_fields_updated") {
          navigate(
            `/pedido/${encodeURIComponent(notification.simulation_id)}`,
          );
        } else if (notification.type === "simulation_gestor_updated") {
          navigate(
            `/simulador?simulationId=${encodeURIComponent(notification.simulation_id)}`,
          );
        } else if (notificationOpensPedido(notification.type) && isGestor) {
          navigate(
            `/pedido/${encodeURIComponent(notification.simulation_id)}`,
          );
        } else if (notification.type === "order_conversion_request") {
          navigate(
            `/simulador?simulationId=${encodeURIComponent(notification.simulation_id)}`,
          );
        } else if (notification.type === "order_rejected") {
          navigate("/pedidos");
        } else {
          navigate(
            `/simulador?simulationId=${encodeURIComponent(notification.simulation_id)}`,
          );
        }
      }
    } finally {
      setOpeningId(null);
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      const result = await markAllNotificationsRead();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReloadToken((n) => n + 1);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow={isGestor ? "Gestor" : "Consultor"}
        title="Notificações"
        description={
          isGestor
            ? "Solicitações de revisão de simulações e pedidos aguardando aprovação."
            : "Atualizações das suas simulações e pedidos enviados para análise."
        }
        actions={
          unreadCount > 0 ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              loading={markingAll}
              onClick={() => void handleMarkAllRead()}
            >
              Marcar todas como lidas
            </Button>
          ) : null
        }
      />

      <PageInfoBanner
        icon={IconBell}
        iconClassName={
          unreadCount > 0
            ? "bg-red-600"
            : rows.length > 0
              ? "bg-emerald-600"
              : undefined
        }
      >
        {loading
          ? "Carregando notificações…"
          : unreadCount > 0
            ? (
              <>
                <span className="font-semibold text-red-700">
                  {unreadCount} não lida{unreadCount === 1 ? "" : "s"}
                </span>
                {` · ${rows.length} no total`}
              </>
            )
            : rows.length > 0
              ? (
                <>
                  <span className="font-semibold text-emerald-700">
                    {rows.length} notificação{rows.length === 1 ? "" : "ões"}
                  </span>
                  {" · todas lidas"}
                </>
              )
              : "Nenhuma notificação por enquanto."}
      </PageInfoBanner>

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      {!loading && rows.length === 0 && !error ? (
        <EmptyState
          title="Nenhuma notificação"
          description={
            isGestor
              ? "Quando um consultor solicitar revisão de simulação ou enviar um pedido para aprovação, a notificação aparecerá aqui."
              : "Quando o gestor aprovar ou reprovar uma simulação ou pedido seu, a atualização aparecerá aqui."
          }
        />
      ) : null}

      {rows.length > 0 ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                    Busca e filtros
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Filtre por tipo, status, remetente, período ou texto livre.
                  </p>
                </div>
                {hasFilters ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setFilters({ ...EMPTY_FILTERS })}
                  >
                    Limpar filtros
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label
                  htmlFor="notificacoes-busca"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Busca
                </label>
                <SearchInput
                  id="notificacoes-busca"
                  ariaLabel="Buscar por título, corpo ou remetente"
                  placeholder="Título, texto ou remetente…"
                  value={searchQuery}
                  onChange={(e) =>
                    patchFilters({ searchQuery: e.target.value })
                  }
                />
              </div>
              <Select
                label="Tipo"
                value={type}
                onChange={(e) => patchFilters({ type: e.target.value })}
                options={TYPE_OPTIONS}
              />
              <Select
                label="Status"
                value={readStatus}
                onChange={(e) => patchFilters({ readStatus: e.target.value })}
                options={READ_STATUS_OPTIONS}
              />
              <Select
                label="Remetente"
                value={senderId}
                onChange={(e) => patchFilters({ senderId: e.target.value })}
                options={senderOptions}
              />
              <DatePicker
                label="Data de"
                value={dateFrom}
                onChange={(e) => patchFilters({ dateFrom: e.target.value })}
              />
              <DatePicker
                label="Data até"
                value={dateTo}
                onChange={(e) => patchFilters({ dateTo: e.target.value })}
              />
            </div>
          </section>

          {filtered.length === 0 ? (
            <EmptyState
              title="Nenhuma notificação encontrada"
              description="Ajuste ou limpe os filtros para ver mais resultados."
            />
          ) : (
            <ul className="space-y-3">
              {filtered.map((row) => {
                const unread = !row.read_at;
                const openLabel =
                  row.type === "order_approved"
                    ? "Abrir pedido"
                    : notificationOpensPedido(row.type) && isGestor
                      ? "Abrir pedido"
                      : row.type === "order_conversion_request"
                        ? "Abrir simulação"
                        : row.type === "order_rejected"
                          ? "Ver pedidos"
                          : "Abrir simulação";
                return (
                  <li key={row.id}>
                    <article className={notificationCardClass(unread)}>
                      <span
                        className={[
                          "absolute inset-y-0 left-0 w-1.5",
                          unread ? "bg-red-500" : "bg-emerald-500",
                        ].join(" ")}
                        aria-hidden
                      />
                      <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-center sm:justify-between sm:p-5 sm:pl-6">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <ReadStatusBadge unread={unread} />
                            <span
                              className={[
                                "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                                typeBadgeClass(row.type),
                              ].join(" ")}
                            >
                              {notificationTypeLabel(row.type)}
                            </span>
                          </div>
                          <h2
                            className={[
                              "text-base tracking-tight",
                              unread
                                ? "font-bold text-slate-900"
                                : "font-semibold text-slate-700",
                            ].join(" ")}
                          >
                            {row.title}
                          </h2>
                          {row.body ? (
                            <p className="text-sm text-slate-600">{row.body}</p>
                          ) : null}
                          <p className="text-xs text-slate-500">
                            {row.sender_nome
                              ? `${isGestor ? "Consultor" : "Gestor"}: ${row.sender_nome} · `
                              : null}
                            {formatNotificationDate(row.created_at)}
                          </p>
                        </div>
                        {row.simulation_id ? (
                          <Button
                            type="button"
                            variant="primary"
                            className="w-full shrink-0 sm:w-auto"
                            loading={openingId === row.id}
                            onClick={() => void handleOpen(row)}
                          >
                            {openLabel}
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
