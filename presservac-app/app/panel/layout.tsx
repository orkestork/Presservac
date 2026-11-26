"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConfirmProvider, useConfirm } from "@/app/components/confirm-dialog";
import AccountEntryLoading from "@/app/components/account-entry-loading";
import { NotificationBell } from "@/app/panel/_components/notification-bell";
import { NotificationToast } from "@/app/panel/_components/notification-toast";
import { NotificationDetailProvider } from "@/app/panel/_components/notification-detail-modal";
import { AppTile, PanelNavContext, activeApp, childMatches, toneOf, visibleNav, type NavChild } from "@/app/panel/_components/panel-nav";


export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [visibleModules, setVisibleModules] = useState<Set<string> | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userInfo, setUserInfo] = useState<{ fullName: string; email: string; avatarUrl: string | null; role: string } | null>(null);
  const [navSearch, setNavSearch] = useState("");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ fullName: "", email: "", phone: "", company: "", currentPassword: "" });
  const [profileOriginalEmail, setProfileOriginalEmail] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    fetch("/api/panel/permissions")
      .then((r) => {
        // Sesión de una cuenta eliminada o inactiva: se limpia la cookie y va a login,
        // en vez de renderizar el panel sin datos de usuario.
        if (r.status === 401) {
          window.location.replace("/api/auth/session-expired");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setIsSuperAdmin(d.role === "SUPERADMIN");
        setUserInfo({ fullName: d.fullName, email: d.email, avatarUrl: d.avatarUrl, role: d.role });
        const perms = d.permissions as Record<string, { canView: boolean }> | undefined;
        if (!perms) {
          setVisibleModules(new Set());
          return;
        }
        setVisibleModules(new Set(Object.entries(perms).filter(([, p]) => p.canView).map(([m]) => m)));
      })
      .catch(() => setVisibleModules(new Set()));
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setNavSearch("");
  }, [pathname]);

  const items = visibleNav(visibleModules, isSuperAdmin);
  const current = pathname === "/panel" ? undefined : activeApp(items, pathname);
  const tone = toneOf(current?.key);
  const q = navSearch.trim().toLowerCase();
  const results = q
    ? items.flatMap((item) =>
        (item.children ?? [{ href: item.href, label: item.label, module: item.module ?? "", icon: item.icon } as NavChild])
          .filter((c) => c.label.toLowerCase().includes(q) || item.label.toLowerCase().includes(q))
          .map((c) => ({ app: item, child: c })),
      ).slice(0, 8)
    : [];
  // Secciones de la app actual, agrupadas como en el menú original
  const sections: { group?: string; children: NavChild[] }[] = [];
  current?.children?.forEach((child) => {
    if (child.group || sections.length === 0) sections.push({ group: child.group, children: [child] });
    else sections[sections.length - 1].children.push(child);
  });
  const activeChild = current?.children
    ?.filter((c) => childMatches(pathname, c.href))
    .sort((x, y) => y.href.length - x.href.length)[0]?.href;
  const initials = userInfo?.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() ?? "";

  const [loggingOut, setLoggingOut] = useState(false);
  const confirm = useConfirm();
  const logout = async () => {
    if (loggingOut) return;
    const ok = await confirm({
      title: "Cerrar sesión",
      message: "¿Seguro que quieres cerrar tu sesión?",
      confirmLabel: "Cerrar sesión",
      danger: false,
    });
    if (!ok) return;
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("logout falló");
    } catch {
      setLoggingOut(false);
      return;
    }
    window.location.replace("/login?logout=1");
  };

  const openProfileModal = async () => {
    setShowProfileModal(true);
    setProfileMsg(null);
    try {
      const r = await fetch("/api/account");
      if (r.ok) {
        const d = await r.json();
        const u = d.user;
        setProfileForm({ fullName: u.fullName ?? "", email: u.email ?? "", phone: u.phone ?? "", company: u.company ?? "", currentPassword: "" });
        setProfileOriginalEmail(u.email ?? "");
        setProfileAvatar(u.avatarUrl ?? null);
      }
    } catch {}
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileAvatarFile(file);
    const url = URL.createObjectURL(file);
    setProfileAvatar(url);
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      let avatarUrl = profileAvatar;
      if (profileAvatarFile) {
        const fd = new FormData();
        fd.append("file", profileAvatarFile);
        const upRes = await fetch("/api/empleado/avatar", { method: "POST", body: fd });
        if (upRes.ok) {
          const upData = await upRes.json();
          avatarUrl = upData.avatarUrl;
        }
      }
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: profileForm.fullName, email: profileForm.email, phone: profileForm.phone, company: profileForm.company, currentPassword: profileForm.currentPassword || undefined }),
      });
      if (res.ok) {
        setProfileMsg({ type: "ok", text: "Perfil actualizado" });
        setUserInfo((prev) => prev ? { ...prev, fullName: profileForm.fullName, avatarUrl } : prev);
        setTimeout(() => setShowProfileModal(false), 1200);
      } else {
        const d = await res.json();
        setProfileMsg({ type: "err", text: d.error || "Error al guardar" });
      }
    } catch {
      setProfileMsg({ type: "err", text: "Error de conexión" });
    }
    setProfileSaving(false);
  };

  return (
    <NotificationDetailProvider>
    <PanelNavContext.Provider value={{ items, ready: visibleModules !== null, firstName: userInfo?.fullName.split(" ")[0] ?? "" }}>
    <div className="pv-canvas min-h-screen font-sans text-[#051C46]">
      {/* ── Barra superior (estilo Workezt) ── */}
      <header className="sticky top-0 z-40 border-b border-[#051C46]/10 bg-white/85 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2 sm:px-6">
          <Link href="/panel" aria-label="Inicio · todas las apps" title="Todas las apps" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#051C46] transition hover:bg-[#051C46]/5">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">
              {[2, 8, 14].flatMap((y) => [2, 8, 14].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />))}
            </svg>
          </Link>

          {!current ? (
            <Link href="/panel" className="flex shrink-0 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/presservac/logo.png" alt="Presservac" className="h-7 w-auto" />
              <span className="hidden rounded-full bg-[#051C46]/[0.06] px-2.5 py-1 text-[11px] font-semibold text-[#051C46] sm:inline">Panel</span>
            </Link>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <Link href="/panel" aria-label="Presservac · inicio" className="hidden shrink-0 sm:block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/presservac/simbolo.png" alt="" className="h-6 w-6 object-contain" />
              </Link>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <Link href={current.href} className="flex min-w-0 items-center gap-2">
                <AppTile item={current} size={26} />
                <span className="pv-display truncate text-[17px] font-semibold text-[#051C46]">{current.label}</span>
              </Link>
            </div>
          )}

          {/* Buscador de módulos */}
          <div className={`relative hidden w-full lg:block ${current ? "ml-auto max-w-xs" : "mx-auto max-w-md"}`}>
            <label className="relative block">
              <span className="sr-only">Buscar en el panel</span>
              <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M13 13l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input
                value={navSearch}
                onChange={(e) => { setNavSearch(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                placeholder="Buscar en Presservac…"
                className="w-full rounded-full border border-[#051C46]/15 bg-[#051C46]/[0.04] py-2 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-[#D60517]/50 focus:bg-white"
              />
            </label>
            {searchOpen && q && (
              <div className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-2xl border border-[#051C46]/10 bg-white p-1.5 shadow-xl">
                {results.length === 0 ? (
                  <p className="px-3 py-3 text-center text-xs text-slate-400">Sin resultados</p>
                ) : results.map(({ app, child }) => (
                  <Link key={app.key + child.href} href={child.href} className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm hover:bg-[#051C46]/5">
                    <AppTile item={app} size={26} />
                    <span className="font-medium">{child.label}</span>
                    <span className="ml-auto text-xs text-slate-400">{app.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <div className="flex items-center gap-0.5 rounded-full border border-[#051C46]/10 bg-white/70 p-1 shadow-sm">
              <a
                href={process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || "https://presservac.com.co"}
                title="Ir al sitio web"
                aria-label="Ir al sitio web"
                className="grid h-8 w-8 place-items-center rounded-full text-slate-600 transition hover:bg-[#D60517]/10 hover:text-[#D60517]"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
              </a>
              <NotificationBell />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-label="Menú de usuario"
                title={userInfo?.fullName}
                className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#051C46] text-sm font-semibold text-white ring-2 ring-white"
              >
                {userInfo?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={userInfo.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : initials}
              </button>
              {menuOpen && (
                <>
                  <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-[#051C46]/10 bg-white p-3 text-sm shadow-xl">
                    <p className="font-semibold">{userInfo?.fullName}</p>
                    <p className="truncate text-xs text-slate-500">{userInfo?.email}</p>
                    <p className="mt-1 text-xs text-slate-500">{userInfo?.role} · Presservac</p>
                    <div className="mt-3 space-y-0.5 border-t border-slate-100 pt-2">
                      <button type="button" onClick={() => { setMenuOpen(false); openProfileModal(); }} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-100">Editar perfil</button>
                      <button type="button" onClick={() => { setMenuOpen(false); logout(); }} disabled={loggingOut} className="block w-full rounded-lg px-2 py-1.5 text-left text-[#D60517] hover:bg-[#D60517]/5">
                        {loggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Secciones de la app actual */}
        {current && sections.length > 0 && (
          <nav aria-label={`Secciones de ${current.label}`} className="border-t border-[#051C46]/[0.06]">
            <div className="pv-scroll mx-auto flex max-w-[1400px] items-center gap-1 overflow-x-auto px-4 py-1.5 sm:px-6">
              {sections.map((sec, si) => (
                <div key={sec.group ?? si} className="flex shrink-0 items-center gap-1">
                  {si > 0 && <span className="mx-1.5 h-4 w-px bg-[#051C46]/10" aria-hidden="true" />}
                  {sec.group && <span className="px-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{sec.group}</span>}
                  {sec.children.map((c) => {
                    const on = c.href === activeChild;
                    return (
                      <Link
                        key={c.href}
                        href={c.href}
                        aria-current={on ? "page" : undefined}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition"
                        style={on ? { background: tone.soft, color: "#051C46", boxShadow: "inset 0 0 0 1px rgba(5,28,70,.08)" } : undefined}
                      >
                        <span className={on ? "text-[#D60517]" : "text-slate-400"}>{c.icon}</span>
                        <span className={on ? "font-semibold" : "text-slate-600 hover:text-[#051C46]"}>{c.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* ── Contenido ── */}
      <main className="mx-auto w-full max-w-[1400px] pb-32">
        <ConfirmProvider>{children}</ConfirmProvider>
      </main>

      {/* ── Dock de apps ── */}
      {items.length > 0 && (
        <nav className="pv-dock print:hidden" aria-label="Aplicaciones">
          <div className="pv-dock-inner">
            <Link href="/panel" className={`pv-dock-item ${pathname === "/panel" ? "current" : ""}`} aria-label="Inicio" aria-current={pathname === "/panel" ? "page" : undefined}>
              <span className="pv-dock-home">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/presservac/simbolo.png" alt="" />
              </span>
              <span className="pv-dock-tip">Inicio</span>
            </Link>
            <span className="pv-dock-sep" aria-hidden="true" />
            {items.filter((i) => i.key !== "inicio").map((app) => {
              const on = current?.key === app.key;
              return (
                <Link key={app.key} href={app.href} className={`pv-dock-item ${on ? "current" : ""}`} aria-label={app.label} aria-current={on ? "page" : undefined}>
                  <AppTile item={app} size={44} />
                  <span className="pv-dock-tip">{app.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Profile Modal ── */}
      {showProfileModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowProfileModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4">
              <h3 className="text-sm font-bold text-[#1A1A1A]">Editar perfil</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-[#94A3B8] hover:text-[#1A1A1A] text-lg leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="group relative shrink-0">
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="Avatar" className="h-16 w-16 rounded-full object-cover ring-2 ring-[#E2E8F0] group-hover:ring-[#D60517] transition-all" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#D60517] text-lg font-bold text-white ring-2 ring-[#E2E8F0] group-hover:ring-[#D60517] transition-all">
                      {profileForm.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold">Cambiar</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <div>
                  <p className="text-xs font-semibold text-[#1A1A1A]">Foto de perfil</p>
                  <p className="text-[10px] text-[#94A3B8]">JPG, PNG o WEBP. Max 10 MB.</p>
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748B]">Nombre completo</label>
                <input value={profileForm.fullName} onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D60517]" />
              </div>

              {/* Email */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748B]">Correo</label>
                <input type="email" value={profileForm.email} onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D60517]" />
              </div>

              {/* Cambiar el correo exige la contraseña actual */}
              {profileForm.email.trim().toLowerCase() !== profileOriginalEmail && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#64748B]">Contraseña actual</label>
                  <input type="password" autoComplete="current-password" value={profileForm.currentPassword} onChange={(e) => setProfileForm((f) => ({ ...f, currentPassword: e.target.value }))} placeholder="Para confirmar el cambio de correo" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D60517]" />
                </div>
              )}

              {/* Teléfono */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748B]">Teléfono</label>
                <input value={profileForm.phone} onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D60517]" />
              </div>

              {/* Empresa */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#64748B]">Empresa</label>
                <input value={profileForm.company} onChange={(e) => setProfileForm((f) => ({ ...f, company: e.target.value }))} className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D60517]" />
              </div>

              {/* Mensaje */}
              {profileMsg && (
                <p className={`text-xs font-medium ${profileMsg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{profileMsg.text}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#E2E8F0] px-5 py-3">
              <button onClick={() => setShowProfileModal(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#64748B] hover:bg-[#F1F5F9]">Cancelar</button>
              <button onClick={saveProfile} disabled={profileSaving || !profileForm.fullName.trim() || !profileForm.email.trim()} className="rounded-lg bg-[#D60517] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#B00413] disabled:opacity-50 transition-colors">
                {profileSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <NotificationToast />
      {loggingOut && <AccountEntryLoading message="Cerrando sesión" detail="Nos vemos pronto." />}
    </div>
    </PanelNavContext.Provider>
    </NotificationDetailProvider>
  );
}
