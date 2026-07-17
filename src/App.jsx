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
const NotificacoesPage = lazy(() =>
  import("./pages/NotificacoesPage").then((m) => ({
    default: m.NotificacoesPage,
  })),
);
const ParametrosPage = lazy(() =>
  import("./pages/ParametrosPage").then((m) => ({ default: m.ParametrosPage })),
);
const PedidoPage = lazy(() =>
  import("./pages/PedidoPage").then((m) => ({ default: m.PedidoPage })),
);
const Simulador = lazy(() =>
  import("./pages/Simulador").then((m) => ({ default: m.Simulador })),
);

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

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
                  <LazyPage>
                    <DashboardPage />
                  </LazyPage>
                }
              />
              <Route
                path="simulador"
                element={
                  <LazyPage>
                    <Simulador />
                  </LazyPage>
                }
              />
              <Route
                path="pedido/:simulationId"
                element={
                  <LazyPage>
                    <PedidoPage />
                  </LazyPage>
                }
              />
              <Route
                path="simulacoes"
                element={
                  <LazyPage>
                    <ListagemSimulacoes />
                  </LazyPage>
                }
              />
              <Route
                path="notificacoes"
                element={
                  <ProtectedRoute roles={["gestor", "consultor"]}>
                    <LazyPage>
                      <NotificacoesPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="frete"
                element={
                  <LazyPage>
                    <FretePage />
                  </LazyPage>
                }
              />
              <Route
                path="clientes"
                element={
                  <LazyPage>
                    <GerenciarClientes />
                  </LazyPage>
                }
              />
              <Route
                path="clientes/:id"
                element={
                  <LazyPage>
                    <ClienteDetalhePage />
                  </LazyPage>
                }
              />
              <Route
                path="pedidos"
                element={<Navigate to="/simulacoes?status=converted" replace />}
              />
              <Route
                path="gestor"
                element={<Navigate to="/dashboard" replace />}
              />
              <Route
                path="parametros"
                element={
                  <ProtectedRoute roles={["gestor"]}>
                    <LazyPage>
                      <ParametrosPage />
                    </LazyPage>
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin"
                element={
                  <ProtectedRoute roles={["gestor"]}>
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
