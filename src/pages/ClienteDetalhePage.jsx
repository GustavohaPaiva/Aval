import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ClienteDetailStats,
  ClienteInfoPanel,
  ClienteProfileHero,
  ClienteSimulationsTable,
} from "../components/clientes/ClienteDetailVisuals";
import { ModalClienteForm } from "../components/clientes/ModalClienteForm";
import { AlertMessage } from "../components/ui/AlertMessage";
import { EmptyState } from "../components/ui/EmptyState";
import { PageBackLink } from "../components/ui/PageBackLink";
import { useAlertDialog } from "../contexts/AlertDialogProvider";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import { useAuth } from "../hooks/useAuth";
import {
  deleteClient,
  fetchClientById,
  fetchClientSimulations,
  setClientAtivo,
} from "../services/clientService";

export function ClienteDetalhePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { showAlert } = useAlertDialog();
  const isGestor = role === "gestor";
  const [client, setClient] = useState(null);
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useSyncPageLoading(loading);

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!id) return;

      setLoading(true);
      setError(null);
      setActionError(null);

      const [clientRes, simRes] = await Promise.all([
        fetchClientById(id),
        fetchClientSimulations(id),
      ]);

      if (!isActive()) return;

      setLoading(false);

      if (!clientRes.ok) {
        setError(clientRes.error);
        setClient(null);
        setSimulations([]);
        return;
      }
      if (!simRes.ok) {
        setError(simRes.error);
        setClient(clientRes.client);
        setSimulations([]);
        return;
      }

      setClient(clientRes.client);
      setSimulations(simRes.rows);
    },
    [id],
    Boolean(id),
  );

  const stats = useMemo(() => {
    const counted = simulations.filter((s) => s.ativo !== false);
    const total = counted.length;
    const vendas = counted.filter((s) => s.status === "converted").length;
    const volume = counted.reduce(
      (acc, s) => acc + Number(s.total_proposta ?? 0),
      0,
    );
    return { total, vendas, volume };
  }, [simulations]);
    return { total, vendas, volume };
  }, [simulations]);

  const conversionRate =
    stats.total > 0 ? Math.round((stats.vendas / stats.total) * 100) : 0;

  async function handleToggleAtivo() {
    if (!client) return;

    const nextAtivo = client.ativo === false;
    const confirmed = window.confirm(
      nextAtivo
        ? "Reativar este cliente? Ele voltará a aparecer no simulador e poderá receber lançamentos."
        : "Inativar este cliente? Ele deixará de aparecer no simulador e não poderá receber novos lançamentos.",
    );
    if (!confirmed) return;

    setActionLoading(true);
    setActionError(null);
    const res = await setClientAtivo(client.id, nextAtivo);
    setActionLoading(false);

    if (!res.ok) {
      setActionError(res.error);
      return;
    }

    setClient(res.client);
    showAlert({
      title: nextAtivo ? "Cliente reativado" : "Cliente inativado",
      message: nextAtivo
        ? "O cliente voltou a ficar disponível para lançamentos."
        : "O cliente não aparece mais no select do simulador.",
      tone: "success",
    });
  }

  async function handleDelete() {
    if (!client) return;

    const confirmed = window.confirm(
      `Excluir o cliente "${client.nome}"? Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    setActionLoading(true);
    setActionError(null);
    const res = await deleteClient(client.id);
    setActionLoading(false);

    if (!res.ok) {
      setActionError(res.error);
      return;
    }

    navigate("/clientes", { replace: true });
  }

  if (!id) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <PageBackLink to="/clientes">Voltar para clientes</PageBackLink>
        <AlertMessage>Cliente não informado.</AlertMessage>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to="/clientes">Voltar para clientes</PageBackLink>

      {loading ? (
        <EmptyState
          title="Carregando cliente…"
          description="Aguarde um instante."
        />
      ) : error && !client ? (
        <AlertMessage>{error}</AlertMessage>
      ) : client ? (
        <>
          <ClienteProfileHero client={client} />

          <ClienteDetailStats
            stats={stats}
            conversionRate={conversionRate}
            loading={loading}
          />

          {error ? <AlertMessage>{error}</AlertMessage> : null}
          {actionError ? <AlertMessage>{actionError}</AlertMessage> : null}

          <ClienteInfoPanel
            client={client}
            isGestor={isGestor}
            actionLoading={actionLoading}
            onEdit={() => setEditOpen(true)}
            onToggleAtivo={() => void handleToggleAtivo()}
            onDelete={() => void handleDelete()}
          />

          <ClienteSimulationsTable
            rows={simulations}
            loading={false}
            emptyMessage="Nenhuma simulação ou compra registrada para este cliente."
            isGestor={isGestor}
            onViewPedido={(simId) => navigate(`/pedido/${simId}`)}
          />

          <ModalClienteForm
            open={editOpen}
            mode="edit"
            clientId={client.id}
            initial={client}
            onClose={() => setEditOpen(false)}
            onSaved={(updated) => {
              setClient((prev) => ({
                ...prev,
                ...updated,
                ativo: updated.ativo ?? prev?.ativo,
              }));
              setEditOpen(false);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
