/**
 * Asesores comerciales.
 *
 * Cada número tiene su correo asociado, para que el sitio nunca muestre el
 * teléfono de un asesor junto al correo de otro. Toda selección aleatoria de
 * asesor (footer, barra de contacto) debe salir de aquí.
 */
export type Advisor = {
  phone: string; // formato internacional sin "+"
  email: string;
};

// Línea comercial de Presservac (presservac.com.co/contacto). Agrega aquí a cada asesor con su correo.
export const ADVISORS: Advisor[] = [
  { phone: "573160268619", email: "gestioncomercial@presservac.com.co" },
];

export const ADVISOR_PHONES = ADVISORS.map((a) => a.phone);

export function pickAdvisor(): Advisor {
  return ADVISORS[Math.floor(Math.random() * ADVISORS.length)];
}

export function formatAdvisorPhone(phone: string) {
  const country = phone.slice(0, 2);
  const rest = phone.slice(2);
  return `+${country} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
}

/** Asesor dueño del WhatsApp único público (lib/site.ts); su correo acompaña ese número. */
export const MAIN_ADVISOR = ADVISORS[0];
