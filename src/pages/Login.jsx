import { useEffect, useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  IconClipboardList,
  IconDollarSign,
  IconLeaf,
  IconLock,
  IconPackage,
  IconShield,
  IconUser,
} from "../components/icons";
import { BrandLogoFull, BrandMark } from "../components/brand/BrandLogo";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../services/supabase";
import { homePathForRole } from "../utils/homePathForRole";
import { buildSyagriEmail } from "../utils/syagriEmail";

const BRAND_FEATURES = [
  {
    icon: IconDollarSign,
    title: "Precificação inteligente",
    desc: "Simulações com margem e câmbio em tempo real.",
  },
  {
    icon: IconClipboardList,
    title: "Fluxo comercial unificado",
    desc: "Cotações, aprovações e pedidos no mesmo lugar.",
  },
  {
    icon: IconPackage,
    title: "Catálogo integrado",
    desc: "Produtos e fornecedores alinhados à operação.",
  },
];

const TRUST_ITEMS = [
  { label: "Ambiente seguro", icon: IconShield },
  { label: "Acesso corporativo", icon: IconLock },
  { label: "Dados protegidos", icon: IconLeaf },
];

const LOGIN_REDIRECT_MS = 200;

function LoginSuccessTransition({ active }) {
  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Entrando no sistema"
    >
      <div
        className="login-exit-curtain absolute inset-0 bg-gradient-to-br from-primary-800 via-primary-600 to-emerald-900"
        aria-hidden
      />
      <div className="login-exit-content relative z-10 flex flex-col items-center gap-5 px-6 text-white">
        <span className="flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-black/40 shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
          <BrandMark className="size-12" />
        </span>
        <div className="text-center">
          <p className="text-lg font-semibold tracking-tight">
            Entrando no sistema
          </p>
          <p className="mt-1.5 text-sm text-primary-100/90">
            Preparando seu ambiente de trabalho…
          </p>
        </div>
        <span
          className="size-9 animate-spin rounded-full border-2 border-white/25 border-t-white"
          aria-hidden
        />
      </div>
    </div>
  );
}

function LoginLoadingScreen({ message }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-slate-50">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -right-20 -top-20 size-80 rounded-full bg-primary-200/40 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 size-64 rounded-full bg-emerald-100/50 blur-3xl" />
      </div>
      <div className="relative flex flex-col items-center gap-5">
        <div className="relative">
          <span
            className="login-loader-pulse absolute -inset-3 rounded-2xl bg-primary-400/30"
            aria-hidden
          />
          <span className="relative flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 shadow-lg shadow-slate-900/25 ring-1 ring-slate-800">
            <BrandMark className="size-10" />
          </span>
        </div>
        <p className="text-sm font-medium text-slate-600">{message}</p>
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden lg:flex lg:w-[46%] xl:w-[44%]">
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary-800 via-primary-700 to-emerald-950"
        aria-hidden
      />
      <div
        className="login-brand-blob pointer-events-none absolute -left-1/4 top-1/4 size-[28rem] rounded-full bg-primary-400/25 blur-3xl"
        aria-hidden
      />
      <div
        className="login-brand-blob-alt pointer-events-none absolute -bottom-1/4 -right-1/4 size-[32rem] rounded-full bg-emerald-300/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-0 top-0 size-64 rounded-full bg-white/5 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        aria-hidden
      >
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="syagri-login-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M40 0H0V40"
                fill="none"
                stroke="white"
                strokeWidth="0.45"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#syagri-login-grid)" />
        </svg>
      </div>
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent"
        aria-hidden
      />

      <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
        <div className="login-fade-up">
          <div className="flex items-center gap-3">
            <BrandLogoFull className="h-12 w-auto max-w-[220px]" />
          </div>

          <h1 className="mt-10 max-w-md text-3xl font-semibold leading-[1.15] tracking-tight text-white xl:text-[2.15rem]">
            Gestão comercial inteligente para o agronegócio
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-primary-100/85">
            Simulações, aprovações e pedidos em um ambiente seguro, integrado à
            sua operação e pensado para decisões rápidas no campo.
          </p>
        </div>

        <ul className="login-fade-up login-fade-up-delay-2 mt-10 space-y-3">
          {BRAND_FEATURES.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.title}
                className="flex gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 backdrop-blur-sm transition-colors hover:bg-white/10"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-primary-100">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-primary-100/75">
                    {item.desc}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        <p className="login-fade-up login-fade-up-delay-4 text-xs text-primary-200/70">
          © {new Date().getFullYear()} Aval. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}

function MobileLoginHero({ showLoggedInCard }) {
  return (
    <header className="relative shrink-0 overflow-hidden lg:hidden">
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary-800 via-primary-700 to-emerald-950"
        aria-hidden
      />
      <div
        className="login-form-blob pointer-events-none absolute -left-16 -top-8 size-56 rounded-full bg-primary-400/35 blur-3xl"
        aria-hidden
      />
      <div
        className="login-form-blob pointer-events-none absolute -right-12 top-12 size-44 rounded-full bg-emerald-400/25 blur-3xl"
        style={{ animationDirection: "reverse" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        aria-hidden
      >
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="syagri-login-grid-mobile"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M32 0H0V32"
                fill="none"
                stroke="white"
                strokeWidth="0.45"
              />
            </pattern>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="url(#syagri-login-grid-mobile)"
          />
        </svg>
      </div>

      <div className="relative px-6 pb-14 pt-10 sm:px-10 sm:pt-12 md:px-12">
        <div className="login-fade-up mx-auto max-w-lg sm:text-center">
          <div className="flex items-center gap-3 sm:justify-center">
            <BrandLogoFull className="h-11 w-auto max-w-[200px] sm:mx-auto" />
          </div>

          <div className="login-fade-up login-fade-up-delay-1 mt-8 sm:mx-auto sm:max-w-md">
            <span
              className="mb-3 inline-block h-0.5 w-10 rounded-full bg-primary-300/80 sm:mx-auto sm:block"
              aria-hidden
            />
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-white sm:text-[1.65rem]">
              {showLoggedInCard
                ? "Sua sessão está ativa"
                : "Decisões comerciais com precisão no campo"}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-primary-100/85">
              {showLoggedInCard
                ? "Continue de onde parou ou entre com outra conta."
                : "Simulações, cotações e pedidos em um só lugar."}
            </p>
          </div>
        </div>
      </div>

      {/* Onda — só no hero; fundo branco contínuo abaixo (sem borda/cinza) */}
      <svg
        className="absolute bottom-0 left-0 block w-full text-white"
        viewBox="0 0 1440 72"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M0,36 C240,72 480,8 720,36 C960,64 1200,16 1440,32 L1440,72 L0,72 Z"
        />
      </svg>
    </header>
  );
}

function MobileFeatureStrip() {
  return (
    <div className="login-fade-up login-fade-up-delay-4 mt-6 w-full lg:hidden">
      <p className="mb-3 text-center text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary-700/80">
        Por que Aval
      </p>
      <ul className="mx-auto grid w-full max-w-md gap-2.5 sm:max-w-2xl sm:grid-cols-3 sm:gap-3 md:max-w-3xl">
        {BRAND_FEATURES.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.title}
              className="flex items-center gap-3 rounded-xl border border-primary-100/90 bg-gradient-to-br from-white to-primary-50/50 px-3.5 py-3 shadow-sm sm:flex-col sm:items-center sm:px-3 sm:py-4 sm:text-center"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700 sm:size-10">
                <Icon className="size-[1.125rem] sm:size-5" />
              </span>
              <span className="min-w-0 flex-1 sm:flex-none">
                <span className="block text-xs font-semibold leading-snug text-slate-800 sm:text-[0.8125rem]">
                  {item.title}
                </span>
                <span className="mt-0.5 hidden text-[0.65rem] leading-relaxed text-slate-500 sm:block">
                  {item.desc}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LoginTrustFooter() {
  return (
    <div className="login-fade-up login-fade-up-delay-5 mt-6 text-center lg:text-left">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 lg:justify-start">
        {TRUST_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <span
              key={item.label}
              className="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-slate-500"
            >
              <Icon className="size-3.5 text-primary-600/80" />
              {item.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function LoginField({
  label,
  icon: Icon,
  id,
  error,
  className = "",
  ...props
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-[0.9375rem] font-medium text-slate-700"
      >
        {label}
      </label>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden
        >
          <Icon className="size-[1.125rem]" />
        </span>
        <input
          id={fieldId}
          {...(hasError ? { "aria-invalid": "true" } : {})}
          className={[
            "h-11 w-full rounded-2xl border bg-white/90 pl-11 pr-4 text-sm text-slate-900 shadow-sm transition-[border-color,box-shadow,background-color] placeholder:text-slate-400",
            "focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20",
            "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
            hasError
              ? "border-red-300 focus:border-red-400 focus:ring-red-400/20"
              : "border-slate-200/90 hover:border-primary-200",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
      </div>
      {hasError ? (
        <p className="text-xs font-medium text-feedback-error">{error}</p>
      ) : null}
    </div>
  );
}

function DesktopWelcomePanel({ showLoggedInCard }) {
  return (
    <div className="login-fade-up login-fade-up-delay-1 relative mb-6 hidden overflow-hidden rounded-2xl border border-primary-100/70 bg-white/70 p-5 shadow-sm backdrop-blur-md lg:block">
      <div
        className="pointer-events-none absolute -left-8 -top-8 size-32 rounded-full bg-primary-200/40 blur-2xl"
        aria-hidden
      />
      <div className="relative flex items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-950 shadow-md ring-1 ring-slate-800">
          <BrandMark className="size-8" />
        </span>
        <div className="min-w-0 flex-1 border-l border-primary-100/80 pl-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-primary-600">
            Aval · Fechamento
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900">
            {showLoggedInCard ? "Sessão ativa" : "Bem-vindo de volta"}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            {showLoggedInCard
              ? "Você já possui uma sessão neste navegador."
              : "Acesse com seu usuário corporativo para continuar."}
          </p>
        </div>
      </div>
    </div>
  );
}

function FormSideBlobs() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-primary-50/25 lg:to-primary-50/35" />
      {/* Bola verde — canto superior esquerdo (referência do usuário) */}
      <div className="login-form-blob absolute -left-20 -top-16 size-56 rounded-full bg-primary-300/40 blur-3xl sm:size-64 sm:bg-primary-200/45 md:size-72" />
      {/* Inferior direito — moderado */}
      <div
        className="login-form-blob absolute -bottom-24 -right-20 size-52 rounded-full bg-emerald-200/35 blur-3xl md:size-56"
        style={{ animationDirection: "reverse" }}
      />
      {/* Centro-direita — só desktop, bem suave */}
      <div className="login-form-blob absolute right-[12%] top-[38%] hidden size-36 rounded-full bg-primary-100/50 blur-3xl opacity-80 lg:block" />
      <div className="absolute inset-0 opacity-[0.28] sm:opacity-[0.35] lg:opacity-[0.4]">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="syagri-login-dots-form"
              width="28"
              height="28"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.65" fill="rgb(16 185 129 / 0.1)" />
            </pattern>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="url(#syagri-login-dots-form)"
          />
        </svg>
      </div>
    </div>
  );
}

function LoginCardHeader({ showLoggedInCard }) {
  return (
    <div className="mb-6 flex items-center gap-3.5 border-b border-slate-100/90 pb-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 text-primary-700 ring-1 ring-primary-100">
        {showLoggedInCard ? (
          <IconUser className="size-5" />
        ) : (
          <IconLock className="size-5" />
        )}
      </span>
      <div>
        <p className="text-[0.9375rem] font-semibold text-slate-900">
          {showLoggedInCard ? "Conta conectada" : "Acesso corporativo"}
        </p>
        <p className="text-sm text-slate-500">
          {showLoggedInCard
            ? "Gerencie sua sessão neste dispositivo"
            : "Informe usuário e senha"}
        </p>
      </div>
    </div>
  );
}

function FormShell({ children, showLoggedInCard }) {
  return (
    <div className="relative flex min-h-svh flex-1 flex-col overflow-hidden bg-white lg:items-center lg:justify-center lg:bg-slate-50">
      <FormSideBlobs />

      <MobileLoginHero showLoggedInCard={showLoggedInCard} />

      <div className="relative z-10 flex flex-1 flex-col px-5 pb-10 sm:px-8 lg:flex-none lg:justify-center lg:px-[5%] lg:py-10">
        {/* Card + welcome — largura contida */}
        <div className="mx-auto w-full max-w-[26rem] sm:max-w-md md:max-w-lg lg:max-w-[30rem]">
          <DesktopWelcomePanel showLoggedInCard={showLoggedInCard} />

          <div className="login-fade-up login-fade-up-delay-2 relative mt-3 sm:mt-5 lg:mt-0">
            <div
              className="absolute -inset-px rounded-3xl bg-gradient-to-br from-primary-300/50 via-primary-100/30 to-emerald-200/40 opacity-100"
              aria-hidden
            />
            <div className="relative overflow-hidden rounded-3xl border border-white bg-white/95 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.15)] backdrop-blur-xl sm:shadow-[0_24px_60px_-18px_rgba(5,150,105,0.18)]">
              {/* Faixa superior do card */}
              <div
                className="h-1.5 w-full bg-gradient-to-r from-primary-500 via-primary-600 to-emerald-600"
                aria-hidden
              />
              <div
                className="login-card-shine pointer-events-none absolute inset-0 opacity-30"
                aria-hidden
              />
              <div className="relative p-6 sm:p-8 md:p-9">
                <LoginCardHeader showLoggedInCard={showLoggedInCard} />
                {children}
              </div>
            </div>
          </div>
        </div>

        {/* Destaques — fora do max-w estreito do card para centralizar em sm–lg */}
        {!showLoggedInCard ? (
          <div className="mx-auto mt-0 w-full max-w-md px-0 sm:max-w-2xl sm:px-2 md:max-w-3xl lg:hidden">
            <MobileFeatureStrip />
          </div>
        ) : null}
        <div className="w-full flex justify-center">
          <LoginTrustFooter />
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { user, profile, role, initializing, profileLoading, signOut } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const home = homePathForRole(role);
  const from =
    typeof location.state === "object" &&
    location.state !== null &&
    "from" in location.state &&
    typeof location.state.from === "string"
      ? location.state.from
      : home;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const showLoggedInCard = Boolean(user);

  useEffect(() => {
    if (!pendingRedirect || initializing || profileLoading || !user || !role) {
      return;
    }

    const target = !from || from === "/login" ? home : from;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const delay = prefersReduced ? 0 : LOGIN_REDIRECT_MS;

    const timer = window.setTimeout(() => {
      navigate(target, { replace: true });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    pendingRedirect,
    initializing,
    profileLoading,
    user,
    role,
    navigate,
    from,
    home,
  ]);

  if (initializing || signingOut || (pendingRedirect && profileLoading)) {
    return (
      <LoginLoadingScreen
        message={signingOut ? "Encerrando sessão…" : "Preparando seu acesso…"}
      />
    );
  }

  async function handleSwitchAccount() {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
      setUsername("");
      setPassword("");
    } finally {
      setSigningOut(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const email = buildSyagriEmail(username);
    if (!email) {
      setError("Informe um usuário válido.");
      return;
    }
    if (!password) {
      setError("Informe a senha.");
      return;
    }

    setSubmitting(true);
    const { error: signError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);

    if (signError) {
      setError(
        signError.message || "Não foi possível entrar. Tente novamente.",
      );
      return;
    }

    setIsExiting(true);
    setPendingRedirect(true);
  }

  const displayIdentity = profile?.nome?.trim() || user?.email || "sua conta";
  const showExitTransition = isExiting && pendingRedirect;

  return (
    <>
      <LoginSuccessTransition active={showExitTransition} />

      <div
        className={[
          "flex min-h-svh",
          showExitTransition ? "login-page-exit" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <BrandPanel />

        <FormShell showLoggedInCard={showLoggedInCard}>
          {showLoggedInCard ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3.5 rounded-2xl bg-gradient-to-r from-slate-50 to-primary-50/50 px-4 py-3 ring-1 ring-slate-100">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-base font-semibold text-white shadow-md shadow-primary-600/25">
                  {(displayIdentity.charAt(0) || "?").toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-700/80">
                    Conectado como
                  </p>
                  <p
                    className="truncate text-sm font-semibold text-slate-900"
                    title={displayIdentity}
                  >
                    {displayIdentity}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  type="button"
                  className="login-btn-glow h-11 w-full rounded-2xl text-sm"
                  onClick={() =>
                    navigate(!from || from === "/login" ? home : from, {
                      replace: true,
                    })
                  }
                >
                  Continuar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 w-full rounded-2xl"
                  onClick={() => void handleSwitchAccount()}
                >
                  Entrar com outra conta
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-6"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="space-y-5">
                <LoginField
                  label="Usuário"
                  name="username"
                  icon={IconUser}
                  autoComplete="username"
                  placeholder="ex.: joao.silva"
                  value={username}
                  onChange={(ev) => setUsername(ev.target.value)}
                  disabled={submitting || pendingRedirect}
                />

                <LoginField
                  label="Senha"
                  name="password"
                  type="password"
                  icon={IconLock}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  disabled={submitting || pendingRedirect}
                />
              </div>

              {error ? (
                <p
                  className="rounded-2xl border border-red-200/90 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                loading={submitting || showExitTransition}
                disabled={pendingRedirect}
                className="login-btn-glow h-11 w-full text-sm shadow-md shadow-primary-600/20"
              >
                Entrar na plataforma
              </Button>

              <p className="text-center text-xs leading-relaxed text-slate-500">
                Problemas para acessar?{" "}
                <span className="font-medium text-primary-700">
                  Contate o gestor da sua operação.
                </span>
              </p>
            </form>
          )}
        </FormShell>
      </div>
    </>
  );
}
