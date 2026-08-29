import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { PageTransition } from "../components/layout/PageTransition";
import { SidebarUserMenu } from "../components/layout/SidebarUserMenu";
import { ProfileModal } from "../components/layout/ProfileModal";
import { BrandMark } from "../components/brand/BrandLogo";
import {
  IconBell,
  IconChevronDown,
  IconChevronsLeft,
  IconClipboardList,
  IconDollarSign,
  IconFileSpreadsheet,
  IconLayoutDashboard,
  IconLeaf,
  IconPackage,
  IconWarehouse,
  IconPanelLeft,
  IconSliders,
  IconTruck,
  IconUser,
  IconUsers,
} from "../components/icons";
import { useAuth } from "../hooks/useAuth";
import { fetchUnreadNotificationCount } from "../services/notificationService";
import { supabase } from "../services/supabase";

const COLLAPSE_STORAGE_KEY = "syagri:sidebar-collapsed";

function MenuIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function pathMatchesItem(pathname, to) {
  if (pathname === to) return true;
  if (to === "/dashboard") return false;
  return pathname.startsWith(`${to}/`);
}

function sectionContainsPath(section, pathname) {
  return section.items.some((item) => pathMatchesItem(pathname, item.to));
}

function navSectionsForRole(role) {
  if (role === "gestor") {
    return [
      {
        items: [
          {
            to: "/dashboard",
            label: "Dashboard",
            icon: IconLayoutDashboard,
          },
        ],
      },
      {
        id: "produtos",
        label: "Produtos",
        icon: IconLeaf,
        items: [
          { to: "/admin/produtos", label: "Catálogo", icon: IconLeaf },
          { to: "/admin/listas", label: "Listas", icon: IconFileSpreadsheet },
          {
            to: "/admin/importacao",
            label: "Lançamento",
            icon: IconPackage,
          },
        ],
      },
      {
        id: "cadastros",
        label: "Cadastros",
        icon: IconUsers,
        items: [
          { to: "/clientes", label: "Clientes", icon: IconUser },
          {
            to: "/admin/consultores",
            label: "Consultores",
            icon: IconUsers,
          },
          { to: "/frete", label: "Fretes", icon: IconTruck },
        ],
      },
      {
        id: "vendas",
        label: "Vendas",
        icon: IconClipboardList,
        items: [
          {
            to: "/simulacoes",
            label: "Simulações",
            icon: IconClipboardList,
          },
          { to: "/pedidos", label: "Pedidos", icon: IconPackage },
          { to: "/compras", label: "Compras", icon: IconWarehouse },
        ],
      },
      {
        items: [
          { to: "/comissao", label: "Comissão", icon: IconDollarSign },
          { to: "/notificacoes", label: "Notificações", icon: IconBell },
          { to: "/parametros", label: "Parâmetros", icon: IconSliders },
        ],
      },
    ];
  }

  return [
    {
      items: [
        { to: "/dashboard", label: "Dashboard", icon: IconLayoutDashboard },
        {
          to: "/simulacoes",
          label: "Minhas Simulações",
          icon: IconClipboardList,
        },
        { to: "/pedidos", label: "Pedidos", icon: IconPackage },
        { to: "/clientes", label: "Clientes", icon: IconUser },
        { to: "/notificacoes", label: "Notificações", icon: IconBell },
      ],
    },
  ];
}

function cargoLabel(role) {
  if (role === "gestor") return "Gestor";
  if (role === "consultor") return "Consultor";
  return "—";
}

function readAvatarUrl(metadata) {
  const url = metadata?.avatar_url;
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

function SidebarNavLink({
  item,
  collapsed,
  indented = false,
  unreadCount = 0,
  onNavigate,
}) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.to === "/dashboard"}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        [
          "group relative flex notranslate items-center rounded-2xl text-sm font-medium transition-colors duration-200",
          collapsed
            ? "justify-center px-0 py-2"
            : indented
              ? "gap-2.5 py-2 pl-8 pr-2.5"
              : "gap-2.5 px-2.5 py-2",
          isActive
            ? "bg-primary-50 text-primary-700"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed ? (
            <span
              className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary-600"
              aria-hidden
            />
          ) : null}
          <Icon
            className={[
              "size-[1.125rem] shrink-0 transition-colors",
              isActive
                ? "text-primary-600"
                : "text-slate-400 group-hover:text-slate-600",
            ].join(" ")}
          />
          <span
            className={[
              "sidebar-reveal truncate",
              collapsed ? "is-collapsed" : "is-expanded",
            ].join(" ")}
          >
            {item.label}
          </span>
          {item.to === "/notificacoes" && unreadCount > 0 ? (
            <span
              className={[
                "inline-flex min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[0.65rem] font-bold text-white",
                collapsed
                  ? "absolute -right-0.5 -top-0.5 size-2 min-w-0 p-0"
                  : "ml-auto",
              ].join(" ")}
            >
              {collapsed ? null : unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export function MainLayout() {
  const { profile, user, role, clearAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  });
  const [openSectionId, setOpenSectionId] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [sectionSynced, setSectionSynced] = useState(false);

  const pathKey = `${location.pathname}${location.search}`;
  const [lastPathKey, setLastPathKey] = useState(pathKey);
  const [lastRole, setLastRole] = useState(role);

  const sections = navSectionsForRole(role);
  const activeGroupId =
    sections.find(
      (section) =>
        section.id && sectionContainsPath(section, location.pathname),
    )?.id ?? null;

  if (!sectionSynced) {
    setSectionSynced(true);
    if (activeGroupId) setOpenSectionId(activeGroupId);
  }

  if (pathKey !== lastPathKey) {
    setLastPathKey(pathKey);
    if (mobileOpen) setMobileOpen(false);
    setOpenSectionId(activeGroupId);
  }

  if (role !== lastRole) {
    setLastRole(role);
    setOpenSectionId(activeGroupId);
  }

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (!user?.id || !role) {
      return undefined;
    }

    let cancelled = false;

    async function loadCount() {
      const result = await fetchUnreadNotificationCount();
      if (!cancelled && result.ok) setUnreadNotifications(result.count);
    }

    void loadCount();
    const interval = window.setInterval(loadCount, 60_000);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void loadCount();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user?.id, role]);

  async function handleSignOut() {
    setProfileOpen(false);
    try {
      await supabase.auth.signOut();
    } finally {
      clearAuth();
      navigate("/login", { replace: true });
    }
  }

  function handleSwitchAccount() {
    void handleSignOut();
  }

  function toggleSection(sectionId) {
    setOpenSectionId((current) => (current === sectionId ? null : sectionId));
  }

  const displayName = profile?.nome?.trim() || user?.email || "Usuário";
  const avatarUrl = readAvatarUrl(user?.user_metadata);
  const roleLabel = cargoLabel(role);
  const effectiveUnreadNotifications =
    user?.id && role ? unreadNotifications : 0;

  return (
    <div className="h-svh overflow-hidden bg-slate-50">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-[2px] lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="flex h-full">
        <aside
          className={[
            "sidebar-shell fixed inset-y-0 left-0 z-40 flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white",
            "lg:sticky lg:top-0 lg:z-auto lg:translate-x-0",
            collapsed ? "lg:w-[3.625rem]" : "lg:w-60",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          ].join(" ")}
        >
          <div className="h-px w-full shrink-0 bg-primary-500/20" aria-hidden />

          <div
            className={[
              "flex shrink-0 border-b border-slate-100 px-2.5 py-3",
              collapsed
                ? "flex-col items-center gap-2"
                : "items-center justify-between gap-2 px-3",
            ].join(" ")}
          >
            <div
              className={[
                "flex min-w-0 items-center",
                collapsed ? "justify-center" : "gap-2.5",
              ].join(" ")}
            >
              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 ring-1 ring-slate-200">
                <BrandMark className="size-6" />
              </span>
              <span
                className={[
                  "sidebar-reveal min-w-0",
                  collapsed ? "is-collapsed" : "is-expanded",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold leading-tight text-slate-900">
                  Aval
                </span>
                <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-primary-600">
                  Fechamento
                </span>
              </span>
            </div>

            <button
              type="button"
              className="hidden size-8 items-center justify-center rounded-2xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:inline-flex"
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              aria-pressed={collapsed}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? (
                <IconPanelLeft className="size-4" />
              ) : (
                <IconChevronsLeft className="size-4" />
              )}
            </button>

            <button
              type="button"
              className="rounded-2xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Fechar menu"
              onClick={() => setMobileOpen(false)}
            >
              <CloseIcon />
            </button>
          </div>

          <nav
            id="main-sidebar-nav"
            className={[
              "flex min-h-0 flex-1 flex-col overflow-y-auto py-3",
              collapsed ? "gap-0.5 px-1.5" : "gap-1 px-2.5",
            ].join(" ")}
          >
            {sections.map((section, sectionIndex) => {
              const isGroup = Boolean(section.id);
              const isOpen = isGroup && openSectionId === section.id;
              const GroupIcon = section.icon;
              const groupActive =
                isGroup && sectionContainsPath(section, location.pathname);

              return (
                <div
                  key={section.id ?? section.label ?? `section-${sectionIndex}`}
                  className="flex flex-col gap-0.5"
                >
                  {isGroup ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        title={collapsed ? section.label : undefined}
                        onClick={() => toggleSection(section.id)}
                        className={[
                          "group relative flex w-full items-center rounded-2xl text-sm font-medium transition-colors duration-200",
                          collapsed
                            ? "justify-center px-0 py-2"
                            : "gap-2.5 px-2.5 py-2",
                          groupActive
                            ? "bg-slate-100 text-slate-900"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                        ].join(" ")}
                      >
                        {GroupIcon ? (
                          <GroupIcon
                            className={[
                              "size-[1.125rem] shrink-0 transition-colors",
                              groupActive
                                ? "text-primary-600"
                                : "text-slate-400 group-hover:text-slate-600",
                            ].join(" ")}
                          />
                        ) : null}
                        <span
                          className={[
                            "sidebar-reveal truncate",
                            collapsed ? "is-collapsed" : "is-expanded",
                          ].join(" ")}
                        >
                          {section.label}
                        </span>
                        <IconChevronDown
                          className={[
                            "ml-auto size-4 shrink-0 text-slate-400 transition-transform duration-200",
                            collapsed ? "hidden" : "",
                            isOpen ? "rotate-180" : "",
                          ].join(" ")}
                        />
                      </button>
                      {isOpen
                        ? section.items.map((item) => (
                            <SidebarNavLink
                              key={item.to}
                              item={item}
                              collapsed={collapsed}
                              indented={!collapsed}
                              unreadCount={effectiveUnreadNotifications}
                              onNavigate={() => setMobileOpen(false)}
                            />
                          ))
                        : null}
                    </>
                  ) : (
                    section.items.map((item) => (
                      <SidebarNavLink
                        key={item.to}
                        item={item}
                        collapsed={collapsed}
                        unreadCount={effectiveUnreadNotifications}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </nav>

          <div
            className={[
              "shrink-0 border-t border-slate-100",
              collapsed ? "p-1.5" : "p-2.5",
            ].join(" ")}
          >
            <SidebarUserMenu
              displayName={displayName}
              roleLabel={roleLabel}
              avatarUrl={avatarUrl}
              collapsed={collapsed}
              onOpenProfile={() => setProfileOpen(true)}
            />
          </div>
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden
          >
            <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary-200/25 blur-3xl" />
            <div className="absolute -left-16 top-40 size-56 rounded-full bg-emerald-100/30 blur-3xl" />
          </div>

          <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 lg:hidden">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-2xl text-slate-700 hover:bg-slate-100"
              aria-label="Abrir menu"
              aria-controls="main-sidebar-nav"
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon />
            </button>
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="flex size-7 items-center justify-center overflow-hidden rounded-xl bg-slate-950 ring-1 ring-slate-200">
                <BrandMark className="size-5" />
              </span>
              Aval
            </span>
          </header>

          <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4 lg:px-[5%] lg:py-6">
            <PageTransition />
          </main>
        </div>
      </div>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        displayName={displayName}
        email={user?.email ?? ""}
        roleLabel={roleLabel}
        avatarUrl={avatarUrl}
        onSwitchAccount={handleSwitchAccount}
        onSignOut={() => void handleSignOut()}
      />
    </div>
  );
}
