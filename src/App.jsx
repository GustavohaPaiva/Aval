import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { AppConfigError } from "./components/AppConfigError";
import { RouteFallback } from "./components/layout/RouteFallback";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AlertDialogProvider } from "./contexts/AlertDialogProvider";
import { AuthProvider } from "./contexts/AuthProvider";
import { MainLayout } from "./layouts/MainLayout";
import { Login } from "./pages/Login";
import { supabaseConfigError } from "./services/supabase";

const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const ClienteDetalhePage = lazy(() =>
  import("./pages/ClienteDetalhePage").then((m) => ({
    default: m.ClienteDetalhePage,
  })),
);
const ConsultorDetalhePage = lazy(() =>
  import("./pages/ConsultorDetalhePage").then((m) => ({
    default: m.ConsultorDetalhePage,
  })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const FretePage = lazy(() =>
  import("./pages/FretePage").then((m) => ({ default: m.FretePage })),
);
const GerenciarClientes = lazy(() =>
  import("./pages/GerenciarClientes").then((m) => ({
    default: m.GerenciarClientes,
  })),
);
const GerenciarConsultores = lazy(() =>
  import("./pages/GerenciarConsultores").then((m) => ({
    default: m.GerenciarConsultores,
  })),
);
const GerenciarListas = lazy(() =>
  import("./pages/GerenciarListas").then((m) => ({
    default: m.GerenciarListas,
  })),
);
const GerenciarProdutos = lazy(() =>
  import("./pages/GerenciarProdutos").then((m) => ({
    default: m.GerenciarProdutos,
  })),
);
const ImportacaoProdutos = lazy(() =>
  import("./pages/ImportacaoProdutos").then((m) => ({
    default: m.ImportacaoProdutos,
  })),
);
const ImportacaoPreviewPage = lazy(() =>
  import("./pages/ImportacaoPreviewPage").then((m) => ({
    default: m.ImportacaoPreviewPage,
  })),
);
const LoteDetalhePage = lazy(() =>
  import("./pages/LoteDetalhePage").then((m) => ({
    default: m.LoteDetalhePage,
  })),
);
const ListagemSimulacoes = lazy(() =>
  import("./pages/ListagemSimulacoes").then((m) => ({
    default: m.ListagemSimulacoes,
  })),
);
const ListagemPedidos = lazy(() =>
  import("./pages/ListagemPedidos").then((m) => ({
    default: m.ListagemPedidos,
  })),
);
const NotificacoesPage = lazy(() =>
  import("./pages/NotificacoesPage").then((m) => ({
    default: m.NotificacoesPage,
  })),
);
const ParametrosPage = lazy(() =>
  import("./pages/ParametrosPage").then((m) => ({ default: m.ParametrosPage })),
);
const ComissaoPage = lazy(() =>
  import("./pages/ComissaoPage").then((m) => ({ default: m.ComissaoPage })),
);
const PedidoPage = lazy(() =>
  import("./pages/PedidoPage").then((m) => ({ default: m.PedidoPage })),
);
const ComprasHubPage = lazy(() =>
  import("./pages/compras/ComprasHubPage").then((m) => ({
    default: m.ComprasHubPage,
  })),
);
const ComprasDemandaPage = lazy(() =>
  import("./pages/compras/ComprasDemandaPage").then((m) => ({
    default: m.ComprasDemandaPage,
  })),
);
const ComprasDemandaDetalhePage = lazy(() =>
  import("./pages/compras/ComprasDemandaDetalhePage").then((m) => ({
    default: m.ComprasDemandaDetalhePage,
  })),
);
const ComprasOrdensPage = lazy(() =>
  import("./pages/compras/ComprasOrdensPage").then((m) => ({
    default: m.ComprasOrdensPage,
  })),
);
const ComprasOrdemDetalhePage = lazy(() =>
  import("./pages/compras/ComprasOrdemDetalhePage").then((m) => ({
    default: m.ComprasOrdemDetalhePage,
  })),
);
const ComprasEstoquePage = lazy(() =>
  import("./pages/compras/ComprasEstoquePage").then((m) => ({
    default: m.ComprasEstoquePage,
  })),
);
const AssinarPedidoPage = lazy(() =>
  import("./pages/AssinarPedidoPage").then((m) => ({
    default: m.AssinarPedidoPage,
  })),
);
const Simulador = lazy(() =>
  import("./pages/Simulador").then((m) => ({ default: m.Simulador })),
);
const GerenciarLogistica = lazy(() =>
  import("./pages/GerenciarLogistica").then((m) => ({
    default: m.GerenciarLogistica,
  })),
);
const LogisticaUsuarioDetalhePage = lazy(() =>
  import("./pages/LogisticaUsuarioDetalhePage").then((m) => ({
    default: m.LogisticaUsuarioDetalhePage,
  })),
);
const LogisticaPedidosPage = lazy(() =>
  import("./pages/logistica/LogisticaPedidosPage").then((m) => ({
    default: m.LogisticaPedidosPage,
  })),
);
const LogisticaPedidoDetalhePage = lazy(() =>
  import("./pages/logistica/LogisticaPedidoDetalhePage").then((m) => ({
    default: m.LogisticaPedidoDetalhePage,
  })),
);

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

const ROLES_COMERCIAL = ["gestor", "consultor"];
const ROLES_GESTOR = ["gestor"];
const ROLES_LOGISTICA = ["logistica"];

function LazyPage({ children }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export default function App() {
  if (supabaseConfigError) {
    return <AppConfigError message={supabaseConfigError} />;
  }

  return (
    <BrowserRouter basename={routerBasename}>
      <AuthProvider>
        <AlertDialogProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/assinar/:token"
              element={
                <LazyPage>
                  <AssinarPedidoPage />
                </LazyPage>
              }
            />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={<Navigate to="dashboard" replace />}
              />
              <Route
                path="dashboard"
                element={
                  <ProtectedRoute roles={ROLES_COMERCIAL}>
                    <LazyPage>
                      <DashboardPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="simulador"
                element={
                  <ProtectedRoute roles={ROLES_COMERCIAL}>
                    <LazyPage>
                      <Simulador />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="pedido/:simulationId"
                element={
                  <ProtectedRoute roles={ROLES_COMERCIAL}>
                    <LazyPage>
                      <PedidoPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="simulacoes"
                element={
                  <ProtectedRoute roles={ROLES_COMERCIAL}>
                    <LazyPage>
                      <ListagemSimulacoes />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="notificacoes"
                element={
                  <ProtectedRoute roles={ROLES_COMERCIAL}>
                    <LazyPage>
                      <NotificacoesPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="frete"
                element={
                  <ProtectedRoute roles={ROLES_COMERCIAL}>
                    <LazyPage>
                      <FretePage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="clientes"
                element={
                  <ProtectedRoute roles={ROLES_COMERCIAL}>
                    <LazyPage>
                      <GerenciarClientes />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="clientes/:id"
                element={
                  <ProtectedRoute roles={ROLES_COMERCIAL}>
                    <LazyPage>
                      <ClienteDetalhePage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="pedidos"
                element={
                  <ProtectedRoute roles={ROLES_COMERCIAL}>
                    <LazyPage>
                      <ListagemPedidos />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="logistica"
                element={
                  <ProtectedRoute roles={ROLES_LOGISTICA}>
                    <LazyPage>
                      <LogisticaPedidosPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="logistica/:simulationId"
                element={
                  <ProtectedRoute roles={ROLES_LOGISTICA}>
                    <LazyPage>
                      <LogisticaPedidoDetalhePage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="compras"
                element={
                  <ProtectedRoute roles={ROLES_GESTOR}>
                    <LazyPage>
                      <ComprasHubPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="compras/demanda"
                element={
                  <ProtectedRoute roles={ROLES_GESTOR}>
                    <LazyPage>
                      <ComprasDemandaPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="compras/demanda/:simulationId"
                element={
                  <ProtectedRoute roles={ROLES_GESTOR}>
                    <LazyPage>
                      <ComprasDemandaDetalhePage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="compras/ordens"
                element={
                  <ProtectedRoute roles={ROLES_GESTOR}>
                    <LazyPage>
                      <ComprasOrdensPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="compras/ordens/:compraId"
                element={
                  <ProtectedRoute roles={ROLES_GESTOR}>
                    <LazyPage>
                      <ComprasOrdemDetalhePage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="compras/estoque"
                element={
                  <ProtectedRoute roles={ROLES_GESTOR}>
                    <LazyPage>
                      <ComprasEstoquePage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="gestor"
                element={<Navigate to="/dashboard" replace />}
              />
              <Route
                path="parametros"
                element={
                  <ProtectedRoute roles={ROLES_GESTOR}>
                    <LazyPage>
                      <ParametrosPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="comissao"
                element={
                  <ProtectedRoute roles={ROLES_GESTOR}>
                    <LazyPage>
                      <ComissaoPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin"
                element={
                  <ProtectedRoute roles={ROLES_GESTOR}>
                    <Outlet />
                  </ProtectedRoute>
                }
              >
                <Route
                  index
                  element={
                    <LazyPage>
                      <AdminPage />
                    </LazyPage>
                  }
                />
                <Route
                  path="consultores"
                  element={
                    <LazyPage>
                      <GerenciarConsultores />
                    </LazyPage>
                  }
                />
                <Route
                  path="consultores/:id"
                  element={
                    <LazyPage>
                      <ConsultorDetalhePage />
                    </LazyPage>
                  }
                />
                <Route
                  path="logistica"
                  element={
                    <LazyPage>
                      <GerenciarLogistica />
                    </LazyPage>
                  }
                />
                <Route
                  path="logistica/:id"
                  element={
                    <LazyPage>
                      <LogisticaUsuarioDetalhePage />
                    </LazyPage>
                  }
                />
                <Route
                  path="importacao"
                  element={
                    <LazyPage>
                      <ImportacaoProdutos />
                    </LazyPage>
                  }
                />
                <Route
                  path="importacao/preview"
                  element={
                    <LazyPage>
                      <ImportacaoPreviewPage />
                    </LazyPage>
                  }
                />
                <Route
                  path="produtos"
                  element={
                    <LazyPage>
                      <GerenciarProdutos />
                    </LazyPage>
                  }
                />
                <Route
                  path="listas"
                  element={
                    <LazyPage>
                      <GerenciarListas />
                    </LazyPage>
                  }
                />
                <Route
                  path="importacao/lote/:id"
                  element={
                    <LazyPage>
                      <LoteDetalhePage />
                    </LazyPage>
                  }
                />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AlertDialogProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
