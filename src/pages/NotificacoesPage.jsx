import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconBell } from "../components/icons";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { PageInfoBanner } from "../components/ui/InfoStatCard";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import { useAuth } from "../hooks/useAuth";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationTypeLabel,
} from "../services/notificationService";

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
      return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    case "simulation_approved":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "simulation_rejected":
      return "bg-red-50 text-red-800 ring-1 ring-red-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
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

  useSyncPageLoading(loading);

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoading(true);
      setError(null);
      const result = await fetchNotifications({ limit: 50 });
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
        const path =
          notification.type === "simulation_approved"
            ? `/pedido/${encodeURIComponent(notification.simulation_id)}`
            : `/simulador?simulationId=${encodeURIComponent(notification.simulation_id)}`;
        navigate(path);
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
            ? "Solicitações de revisão de simulações abaixo da margem."
            : "Atualizações das suas simulações enviadas para análise."
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

      <PageInfoBanner icon={IconBell}>
        {loading
          ? "Carregando notificações…"
          : unreadCount > 0
            ? `${unreadCount} não lida(s) · ${rows.length} no total`
            : rows.length > 0
              ? `${rows.length} notificação(ões) · todas lidas`
              : "Nenhuma notificação por enquanto."}
      </PageInfoBanner>

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      {!loading && rows.length === 0 && !error ? (
        <EmptyState
          title="Nenhuma notificação"
          description={
            isGestor
              ? "Quando um consultor solicitar revisão de uma simulação abaixo da margem, ela aparecerá aqui."
              : "Quando o gestor aprovar ou reprovar uma simulação sua em análise, a atualização aparecerá aqui."
          }
        />
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-3">
          {rows.map((row) => {
            const unread = !row.read_at;
            const openLabel =
              row.type === "simulation_approved"
                ? "Abrir pedido"
                : "Abrir simulação";
            return (
              <li key={row.id}>
                <article
                  className={[
                    "overflow-hidden rounded-2xl border bg-white shadow-sm sm:rounded-3xl",
                    unread
                      ? "border-primary-200 ring-1 ring-primary-100"
                      : "border-slate-200/90",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                            typeBadgeClass(row.type),
                          ].join(" ")}
                        >
                          {notificationTypeLabel(row.type)}
                        </span>
                        {unread ? (
                          <span className="inline-flex rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                            Nova
                          </span>
                        ) : null}
                      </div>
                      <h2 className="text-base font-semibold tracking-tight text-slate-900">
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
      ) : null}
    </div>
  );
}
