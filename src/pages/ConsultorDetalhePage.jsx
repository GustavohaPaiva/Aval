import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ConsultorDetailStats,
  ConsultorInfoPanel,
  ConsultorProfileHero,
  ConsultorResumoComercial,
} from "../components/consultores/ConsultorDetailVisuals";
import { ModalEditarConsultor } from "../components/consultores/ModalEditarConsultor";
import { ModalTrocarCredenciais } from "../components/consultores/ModalTrocarCredenciais";
import { AlertMessage } from "../components/ui/AlertMessage";
import { EmptyState } from "../components/ui/EmptyState";
import { PageBackLink } from "../components/ui/PageBackLink";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import {
  aggregateComissaoTotais,
  fetchComissoesByConsultor,
  fetchConsultorVendasResumo,
} from "../services/comissaoService";
import { supabase } from "../services/supabase";
import { parseSyagriLocalFromEmail } from "../utils/syagriEmail";

export function ConsultorDetalhePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [metric, setMetric] = useState(null);
  const [vendasResumo, setVendasResumo] = useState(null);
  const [comissaoTotais, setComissaoTotais] = useState(null);
  const [email, setEmail] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [credOpen, setCredOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useSyncPageLoading(loading);

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!id) return;

      setLoading(true);
      setError(null);
      setActionError(null);

      const [metricRes, profileRes, emailRes, vendasRes, comissaoRes] =
        await Promise.all([
          supabase
            .from("consultor_metricas")
            .select(
              "consultor_id, consultor_nome, total_simulacoes, total_vendas",
            )
            .eq("consultor_id", id)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("id, nome, filial, created_at, role, whatsapp_phone_e164, whatsapp_notifications_enabled")
            .eq("id", id)
            .maybeSingle(),
          supabase.rpc("get_consultant_email", { p_consultor_id: id }),
          fetchConsultorVendasResumo(id),
          fetchComissoesByConsultor(id),
        ]);

      if (!isActive()) return;

      setLoading(false);

      if (metricRes.error) {
        setError(metricRes.error.message);
        setMetric(null);
        setProfile(null);
        setVendasResumo(null);
        setComissaoTotais(null);
        return;
      }
      if (profileRes.error) {
        setError(profileRes.error.message);
        setMetric(null);
        setProfile(null);
        setVendasResumo(null);
        setComissaoTotais(null);
        return;
      }
      if (!metricRes.data || !profileRes.data) {
        setError("Consultor não encontrado ou sem permissão para visualizar.");
        setMetric(null);
        setProfile(null);
        setVendasResumo(null);
        setComissaoTotais(null);
        return;
      }

      setMetric(metricRes.data);
      setProfile(profileRes.data);
      if (emailRes.error) {
        setEmail("");
      } else {
        setEmail(String(emailRes.data ?? ""));
      }

      setVendasResumo(
        vendasRes.ok
          ? { quantidade: vendasRes.quantidade, valor: vendasRes.valor }
          : {
              quantidade: Number(metricRes.data.total_vendas) || 0,
              valor: 0,
            },
      );
      setComissaoTotais(
        comissaoRes.ok
          ? aggregateComissaoTotais(comissaoRes.rows)
          : aggregateComissaoTotais([]),
      );
    },
    [id, reloadToken],
    Boolean(id),
  );

  async function handleDelete() {
    if (!id || !profile) return;

    const confirmed = window.confirm(
      `Excluir o consultor "${profile.nome}"? Ele perderá o acesso ao sistema. Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    setActionLoading(true);
    setActionError(null);
    const { error: deleteError } = await supabase.rpc("delete_consultant", {
      p_consultor_id: id,
    });
    setActionLoading(false);

    if (deleteError) {
      setActionError(
        deleteError.message || "Não foi possível excluir o consultor.",
      );
      return;
    }

    navigate("/admin/consultores", { replace: true });
  }

  if (!id) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <PageBackLink to="/admin/consultores">
          Voltar para consultores
        </PageBackLink>
        <AlertMessage>Consultor não informado.</AlertMessage>
      </div>
    );
  }

  const usuario = parseSyagriLocalFromEmail(email);
  const conversionRate =
    metric && Number(metric.total_simulacoes) > 0
      ? Math.round(
          (Number(metric.total_vendas) / Number(metric.total_simulacoes)) * 100,
        )
      : 0;

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to="/admin/consultores">
        Voltar para consultores
      </PageBackLink>

      {loading ? (
        <EmptyState
          title="Carregando consultor…"
          description="Aguarde um instante."
        />
      ) : error ? (
        <AlertMessage>{error}</AlertMessage>
      ) : profile && metric ? (
        <>
          <ConsultorProfileHero
            nome={profile.nome}
            email={email}
            usuario={usuario}
          />

          <ConsultorDetailStats
            metric={metric}
            conversionRate={conversionRate}
            loading={loading}
          />

          <ConsultorResumoComercial
            vendas={vendasResumo}
            comissao={comissaoTotais}
            loading={loading}
          />

          {actionError ? <AlertMessage>{actionError}</AlertMessage> : null}

          <ConsultorInfoPanel
            profile={profile}
            usuario={usuario}
            deleting={actionLoading}
            onEdit={() => setEditOpen(true)}
            onTrocarCredenciais={() => setCredOpen(true)}
            onDelete={() => void handleDelete()}
          />

          <ModalEditarConsultor
            open={editOpen}
            consultorId={id}
            initialNome={profile.nome}
            initialFilial={profile.filial ?? ""}
            initialWhatsappPhone={profile.whatsapp_phone_e164 ?? ""}
            initialWhatsappEnabled={profile.whatsapp_notifications_enabled ?? false}
            onClose={() => setEditOpen(false)}
            onSaved={() => reload()}
          />
          <ModalTrocarCredenciais
            open={credOpen}
            consultorId={id}
            initialUsuario={usuario}
            onClose={() => setCredOpen(false)}
            onSaved={() => reload()}
          />
        </>
      ) : null}
    </div>
  );
}
