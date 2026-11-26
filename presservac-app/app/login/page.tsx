"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AccountEntryLoading from "../components/account-entry-loading";

type LoginFormState = {
  email: string;
  password: string;
};

type ToastState = {
  tone: "success" | "error";
  message: string;
} | null;

const GUEST_CART_STORAGE_KEY = "presservac-cart";
const GUEST_CART_SYNC_KEY = "presservac-cart-synced-user";

type AccessMode = "cliente" | "admin";

const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || "https://presservac.com.co";

const ACCESS_COPY: Record<AccessMode, { title: string; highlight: string; subtitle: string; button: string; image: string; imageAlt: string; caption: string }> = {
  cliente: {
    title: "Accede a tu",
    highlight: "cuenta",
    subtitle: "Consulta tus pedidos, cotizaciones y datos de empresa en Presservac.",
    button: "Ingresar a mi cuenta",
    image: "/presservac/acceso-cliente.jpg",
    imageAlt: "Oficina comercial de Presservac",
    caption: "Tus empaques, pedidos y cotizaciones en un solo lugar.",
  },
  admin: {
    title: "Panel",
    highlight: "administrativo",
    subtitle: "Acceso exclusivo para el equipo Presservac. Se pedirá un PIN adicional.",
    button: "Ingresar al panel",
    image: "/presservac/acceso-admin.jpg",
    imageAlt: "Rollo de película laminada impresa",
    caption: "Pedidos, producción, inventario y equipo, desde un mismo panel.",
  },
};

const initialState: LoginFormState = {
  email: "",
  password: "",
};

async function syncGuestCartAfterLogin(userId: string) {
  if (typeof window === "undefined") return;

  const storedCart = window.localStorage.getItem(GUEST_CART_STORAGE_KEY);
  if (!storedCart) {
    window.sessionStorage.setItem(`${GUEST_CART_SYNC_KEY}:${userId}`, "done");
    return;
  }

  try {
    const items = JSON.parse(storedCart);

    if (!Array.isArray(items) || items.length === 0) {
      window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
      window.sessionStorage.setItem(`${GUEST_CART_SYNC_KEY}:${userId}`, "done");
      return;
    }

    const response = await fetch("/api/cart/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items }),
    });

    if (!response.ok) {
      return;
    }

    window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
    window.sessionStorage.setItem(`${GUEST_CART_SYNC_KEY}:${userId}`, "done");
  } catch {
    window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
  }
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<LoginFormState>(initialState);
  const [mode, setMode] = useState<AccessMode>("cliente");
  // Se lee después de montar para que el HTML del servidor y el del cliente coincidan.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tipo") === "admin") setMode("admin");
  }, []);
  const copy = ACCESS_COPY[mode];
  const [adminPin, setAdminPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [inlineError, setInlineError] = useState("");
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [pendingAdminUserId, setPendingAdminUserId] = useState<string | null>(null);
  const [isEnteringAccount, setIsEnteringAccount] = useState(false);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [logoAnimationKey, setLogoAnimationKey] = useState(0);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");

  // Se lee de window y no de useSearchParams porque este último llega vacío en el
  // primer render del cliente, y para entonces el efecto de abajo ya habría disparado
  // el fetch a /api/account que justamente queremos evitar al venir de cerrar sesión.
  const [vieneDeLogout] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("logout") === "1",
  );

  useEffect(() => {
    if (!vieneDeLogout) return;
    setToast({ tone: "success", message: "Sesión cerrada correctamente." });
    // replaceState y no router.replace: limpia el parámetro sin encadenar otra
    // navegación de Next encima de la recarga completa que ya acaba de ocurrir.
    const params = new URLSearchParams(window.location.search);
    params.delete("logout");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/login?${qs}` : "/login");
  }, [vieneDeLogout]);

  useEffect(() => {
    // Venimos de cerrar sesión: no hay sesión que comprobar, nos ahorramos el round-trip.
    if (vieneDeLogout) return;
    fetch("/api/account")
      .then((r) => r.ok ? r.json() : null)
      .then(async (data) => {
        if (!data?.user) return;
        const role = data.user.role;
        if (role === "ADMIN") { router.replace("/admin"); return; }
        if (role === "PACKING") { router.replace("/panel/empaque"); return; }
        if (role === "EMPLOYEE") { router.replace("/empleado"); return; }
        if (role === "CUSTOMER") { router.replace("/mi-cuenta"); return; }
        if (role === "SUPERADMIN") { router.replace("/panel"); return; }
        // SELLER y RRHH: aterrizar en el primer módulo que sí puedan ver,
        // nunca en una ruta fija (evita loop si el rol tiene permisos parciales).
        const res = await fetch("/api/panel/landing").catch(() => null);
        const landing = res?.ok ? await res.json() : null;
        router.replace(landing?.path ?? "/panel/sin-acceso");
      })
      .catch(() => {});
  }, [router, vieneDeLogout]);

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { id, value } = event.target;
    setForm((current) => ({ ...current, [id]: value }));
    setInvalidFields((current) => current.filter((field) => field !== id));
  };

  const triggerLogoError = () => {
    setLogoAnimationKey((current) => current + 1);
  };

  const validateForm = () => {
    const nextInvalidFields: string[] = [];

    if (!form.email.trim()) {
      nextInvalidFields.push("email");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextInvalidFields.push("email");
    }

    if (!form.password.trim()) {
      nextInvalidFields.push("password");
    }

    if (nextInvalidFields.length > 0) {
      setInvalidFields(nextInvalidFields);
      triggerLogoError();
      setInlineError(
        nextInvalidFields.includes("email") && nextInvalidFields.includes("password")
          ? "Llena bien el correo y la contraseña."
          : nextInvalidFields.includes("email")
            ? "Llena bien el correo electrónico."
            : "Ingresa bien la contraseña.",
      );
      setToast({
        tone: "error",
        message: "Revisa los campos marcados antes de continuar.",
      });
      return false;
    }

    return true;
  };

  const completeLogin = async (payload: {
    message?: string;
    redirectTo?: string;
    user?: { id: string; role: "CUSTOMER" | "ADMIN" | "SELLER" | "PACKING" | "RRHH" | "SUPERADMIN" | "EMPLOYEE" };
  }) => {
    setIsEnteringAccount(true);
    setForm(initialState);
    setAdminPin("");
    setShowAdminPinModal(false);
    setPendingAdminUserId(null);
    setInlineError("");
    setToast({
      tone: "success",
      message: payload.message || "Inicio de sesión correcto.",
    });

    const requestedPath = searchParams.get("next");
    const userId = payload.user?.id;

    window.setTimeout(async () => {
      if (userId) {
        await syncGuestCartAfterLogin(userId);
      }
      // redirectTo viene del servidor — siempre es la fuente de verdad
      const nextPath = payload.redirectTo
        || (requestedPath === "/admin" ? "/mi-cuenta" : requestedPath || "/mi-cuenta");

      router.push(nextPath);
      router.refresh();
    }, 500);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInlineError("");
    setToast(null);
    setInvalidFields([]);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const payload = (await response.json()) as {
      error?: string;
      message?: string;
      redirectTo?: string;
      user?: { id: string; role: "CUSTOMER" | "ADMIN" | "SELLER" | "PACKING" | "RRHH" | "SUPERADMIN" | "EMPLOYEE" };
      requiresAdminPin?: boolean;
    };

    setIsSubmitting(false);

    if (response.status === 202 && payload.requiresAdminPin && (payload.user?.role === "ADMIN" || payload.user?.role === "SUPERADMIN")) {
      setPendingAdminUserId(payload.user.id);
      setShowAdminPinModal(true);
      setToast({
        tone: "success",
        message: payload.message || "Confirma el PIN de administrador para continuar.",
      });
      return;
    }

    if (!response.ok) {
      const message = payload.error || "No fue posible iniciar sesión.";
      setInlineError(message);
      triggerLogoError();
      setToast({ tone: "error", message });
      return;
    }

    if (mode === "admin" && payload.user?.role === "CUSTOMER") {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
      const message = "Esta es una cuenta de cliente. Ingresa por la pestaña Cliente.";
      setInlineError(message);
      triggerLogoError();
      setToast({ tone: "error", message });
      return;
    }

    await completeLogin(payload);
  };

  const handleAdminPinSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInlineError("");
    setToast(null);
    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...form,
        adminPin,
      }),
    });

    const payload = (await response.json()) as {
      error?: string;
      message?: string;
      user?: { id: string; role: "CUSTOMER" | "ADMIN" | "SELLER" | "PACKING" | "RRHH" | "SUPERADMIN" | "EMPLOYEE" };
    };

    setIsSubmitting(false);

    if (!response.ok) {
      const message = payload.error || "No fue posible validar el PIN.";
      setInlineError(message);
      triggerLogoError();
      setToast({ tone: "error", message });
      return;
    }

    await completeLogin(payload);
  };

  const handleForgotSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setForgotError("");
    setForgotMessage("");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())) {
      setForgotError("Ingresa un correo válido.");
      return;
    }

    setForgotSubmitting(true);
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail.trim() }),
    });
    const payload = (await response.json()) as { error?: string; message?: string };
    setForgotSubmitting(false);

    if (!response.ok) {
      setForgotError(payload.error || "No fue posible procesar la solicitud.");
      return;
    }

    setForgotMessage(payload.message || "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.");
  };

  return (
    <main className="flex min-h-screen bg-white lg:h-screen lg:overflow-hidden">
      {isEnteringAccount && (
        <AccountEntryLoading
          message="Entrando a tu cuenta"
          detail="Estamos validando tu acceso y cargando tu información."
        />
      )}

      {showAdminPinModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0f172a]/45 px-6 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-[1.8rem] border border-black/8 bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0B2E6B]">
              Validación extra
            </p>
            <h2 className="mt-3 text-2xl font-bold text-[#051C46]">
              Ingresa el PIN de administrador
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Detectamos una cuenta administrativa. Para entrar al panel, confirma el código adicional.
            </p>

            <form onSubmit={handleAdminPinSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="adminPinModal"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  PIN extra
                </label>
                <input
                  id="adminPinModal"
                  type="password"
                  value={adminPin}
                  onChange={(event) => setAdminPin(event.target.value)}
                  placeholder="Ingresa el código"
                  autoFocus
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-colors duration-200 focus:border-[#D60517]"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminPinModal(false);
                    setAdminPin("");
                    setPendingAdminUserId(null);
                  }}
                  className="flex-1 rounded-xl border border-[#051C46]/20 px-4 py-3 font-semibold text-[#051C46] transition-colors duration-200 hover:bg-[#051C46] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !pendingAdminUserId}
                  className="flex-1 rounded-xl bg-[#0B2E6B] px-4 py-3 font-semibold text-white transition-colors duration-200 hover:bg-[#051C46] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "Validando..." : "Confirmar PIN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForgotModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0f172a]/45 px-6 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-[1.8rem] border border-black/8 bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <h2 className="text-2xl font-bold text-[#051C46]">
              Recupera tu contraseña
            </h2>

            {forgotMessage ? (
              <>
                <p className="mt-3 text-sm leading-7 text-slate-600">{forgotMessage}</p>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="mt-6 w-full rounded-xl bg-[#0B2E6B] px-4 py-3 font-semibold text-white transition-colors duration-200 hover:bg-[#051C46]"
                >
                  Cerrar
                </button>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                </p>

                <form onSubmit={handleForgotSubmit} className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="forgotEmail" className="mb-2 block text-sm font-medium text-slate-700">
                      Correo electrónico
                    </label>
                    <input
                      id="forgotEmail"
                      type="email"
                      value={forgotEmail}
                      onChange={(event) => setForgotEmail(event.target.value)}
                      placeholder="tucorreo@ejemplo.com"
                      autoFocus
                      required
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-colors duration-200 focus:border-[#D60517]"
                    />
                  </div>

                  {forgotError && (
                    <p className="rounded-xl border border-[#D60517]/20 bg-[#FDEEEF] px-4 py-3 text-sm font-medium text-[#051C46]">
                      {forgotError}
                    </p>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="flex-1 rounded-xl border border-[#051C46]/20 px-4 py-3 font-semibold text-[#051C46] transition-colors duration-200 hover:bg-[#051C46] hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={forgotSubmitting}
                      className="flex-1 rounded-xl bg-[#0B2E6B] px-4 py-3 font-semibold text-white transition-colors duration-200 hover:bg-[#051C46] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {forgotSubmitting ? "Enviando..." : "Enviar enlace"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-5 top-5 z-[80] w-[min(92vw,380px)]">
          <div
            className={`rounded-[1.4rem] border px-5 py-4 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-sm ${
              toast.tone === "success"
                ? "border-[#1f8b45]/18 bg-[#effaf2] text-[#1f6b39]"
                : "border-[#D60517]/18 bg-[#FDEEEF] text-[#051C46]"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em]">
                  {toast.tone === "success" ? "Correcto" : "Atención"}
                </p>
                <p className="mt-2 text-sm font-medium leading-6">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-lg leading-none opacity-60 transition-opacity duration-200 hover:opacity-100"
                aria-label="Cerrar notificación"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split layout */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 lg:w-1/2 lg:h-full lg:overflow-y-auto">
        <div className="w-full max-w-md">
          <a
            href={PUBLIC_SITE_URL}
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#5f6368] transition-colors hover:text-[#D60517]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
            Volver a Presservac
          </a>
          <a href={PUBLIC_SITE_URL} aria-label="Ir al sitio de Presservac" className="mb-8 block w-fit">
            <Image src="/presservac/logo.png" alt="Presservac" width={180} height={57} priority />
          </a>

          {/* Tipo de acceso */}
          <div role="tablist" aria-label="Tipo de acceso" className="mb-7 grid grid-cols-2 rounded-full bg-[#F3F3F3] p-1">
            {(["cliente", "admin"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setInlineError("");
                  setInvalidFields([]);
                  const params = new URLSearchParams(window.location.search);
                  if (m === "admin") params.set("tipo", "admin"); else params.delete("tipo");
                  const qs = params.toString();
                  window.history.replaceState(null, "", qs ? `/login?${qs}` : "/login");
                }}
                className={`flex h-10 items-center justify-center gap-2 rounded-full text-sm font-bold transition-colors ${
                  mode === m ? "bg-[#051C46] text-white shadow-sm" : "text-[#5f6368] hover:text-[#051C46]"
                }`}
              >
                {m === "cliente" ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                )}
                {m === "cliente" ? "Cliente" : "Administrador"}
              </button>
            ))}
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-[#051C46]">
            {copy.title} <span className="text-[#D60517]">{copy.highlight}</span>
          </h1>
          <p className="mt-2 text-sm text-[#6e7379]">{copy.subtitle}</p>

          {/* Tab toggle */}
          {mode === "cliente" && (
          <div className="mt-6 flex border-b border-black/10">
            <span className="flex items-center gap-2 border-b-2 border-[#051C46] pb-3 pr-6 text-sm font-bold text-[#051C46]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Iniciar sesión
            </span>
            <Link
              href="/registro"
              className="flex items-center gap-2 pb-3 pl-6 text-sm font-bold text-[#6e7379] transition-colors hover:text-[#D60517]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              Crear cuenta
            </Link>
          </div>
          )}

          <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className={invalidFields.includes("email") ? "field-shake" : ""}>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#333]">
                Correo electrónico
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="Ingresa tu correo electrónico"
                  className={`h-11 w-full rounded-xl border px-4 pr-10 text-sm outline-none transition focus:border-[#D60517] ${
                    invalidFields.includes("email") ? "border-[#D60517] bg-[#FDEEEF]" : "border-black/10"
                  }`}
                />
                <svg viewBox="0 0 24 24" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6368]" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
            </div>

            <div className={invalidFields.includes("password") ? "field-shake" : ""}>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-[#333]">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(form.email);
                    setForgotMessage("");
                    setForgotError("");
                    setShowForgotModal(true);
                  }}
                  className="text-xs text-[#0B2E6B] hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Ingresa tu contraseña"
                  className={`h-11 w-full rounded-xl border pr-10 px-4 text-sm outline-none transition focus:border-[#D60517] ${
                    invalidFields.includes("password") ? "border-[#D60517] bg-[#FDEEEF]" : "border-black/10"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-[#5f6368] hover:text-[#555]"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {inlineError && (
              <p className="rounded-xl border border-[#D60517]/20 bg-[#FDEEEF] px-4 py-3 text-sm font-medium text-[#051C46]">
                {inlineError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 w-full rounded-full bg-[#051C46] text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Ingresando..." : copy.button}
            </button>
          </form>

          {mode === "cliente" ? (
          <p className="mt-5 text-center text-sm text-[#6e7379]">
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="font-bold text-[#0B2E6B] hover:underline">
              Crear una cuenta
            </Link>
          </p>
          ) : (
          <p className="mt-5 text-center text-xs leading-5 text-[#6e7379]">
            ¿No tienes acceso? Pide a un administrador de Presservac que cree tu usuario.
          </p>
          )}
        </div>
      </div>

      {/* Right side — account banner */}
      <div className={`hidden overflow-hidden lg:flex lg:h-full lg:w-1/2 lg:items-center lg:justify-center ${mode === "admin" ? "bg-white" : "bg-[#F3F3F3]"}`}>
        <div className="relative h-full w-full">
          <Image
            key={copy.image}
            src={copy.image}
            alt={copy.imageAlt}
            fill
            priority
            sizes="50vw"
            className={mode === "admin" ? "object-contain object-center p-16" : "object-cover object-center"}
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#051C46] via-[#051C46]/80 to-transparent px-10 pb-10 pt-24">
            <span className="mb-3 block h-1 w-12 rounded-full bg-[#D60517]" />
            <p className="max-w-sm text-xl font-bold leading-snug text-white">{copy.caption}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
