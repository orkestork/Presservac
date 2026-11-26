import { Resend } from "resend";

type SendArgs = Parameters<Resend["emails"]["send"]>;
type SendResult = Awaited<ReturnType<Resend["emails"]["send"]>>;

/**
 * Cliente de correo. Sin RESEND_API_KEY (entorno local) no se envía nada:
 * el envío devuelve un error controlado en vez de tumbar la ruta al importarla.
 */
export const resend: { emails: { send: (...args: SendArgs) => Promise<SendResult> } } = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : {
      emails: {
        async send(...args: SendArgs) {
          const to = (args[0] as { to?: unknown }).to;
          console.warn(`[correo desactivado] RESEND_API_KEY no configurada; no se envió a ${JSON.stringify(to)}`);
          return { data: null, error: { name: "missing_api_key", message: "RESEND_API_KEY no configurada" } } as unknown as SendResult;
        },
      },
    };
