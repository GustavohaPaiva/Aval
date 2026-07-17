function userInitial(name) {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

export function SidebarUserMenu({
  displayName,
  roleLabel,
  avatarUrl,
  collapsed = false,
  onOpenProfile,
}) {
  const Avatar = avatarUrl ? (
    <img
      src={avatarUrl}
      alt=""
      className={[
        "shrink-0 rounded-full object-cover ring-1 ring-slate-200",
        collapsed ? "size-8" : "size-9",
      ].join(" ")}
    />
  ) : (
    <span
      className={[
        "flex shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white",
        collapsed ? "size-8 text-[0.65rem]" : "size-9 text-sm",
      ].join(" ")}
      aria-hidden
    >
      {userInitial(displayName)}
    </span>
  );

  return (
    <button
      type="button"
      onClick={onOpenProfile}
      title={collapsed ? `${displayName} · ${roleLabel}` : "Minha conta"}
      className={[
        "group flex w-full items-center rounded-2xl text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30",
        collapsed ? "justify-center p-1.5" : "gap-2.5 p-2",
      ].join(" ")}
      aria-label="Minha conta"
    >
      {Avatar}
      <span
        className={[
          "sidebar-reveal min-w-0 flex-1",
          collapsed ? "is-collapsed" : "is-expanded",
        ].join(" ")}
      >
        <span
          className="block truncate text-sm font-semibold text-slate-900"
          title={displayName}
        >
          {displayName}
        </span>
        <span className="block text-xs text-slate-500">{roleLabel}</span>
      </span>
    </button>
  );
}
