import nodemailer, { type Transporter } from "nodemailer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

let transporter: Transporter | null = null;

/** true solo si SMTP_USER/SMTP_PASS están configurados — si no, el consumidor no intenta enviar. */
export const mailerConfigured = Boolean(env.SMTP_USER && env.SMTP_PASS);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Isotipo de marca incrustado por CID en el header de la plantilla (ver email-template.ts).
// Copia local en vez de leer de frontend/public/brand: cada microservicio es su propia imagen
// Docker, no comparte filesystem con el frontend en build time.
const LOGO_PATH = path.resolve(__dirname, "../../assets/logo.png");

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
    });
  }
  return transporter;
}

export async function sendMail(params: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  if (!mailerConfigured) {
    throw new Error("SMTP no configurado (faltan SMTP_USER/SMTP_PASS)");
  }
  await getTransporter().sendMail({
    from: env.SMTP_FROM!,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
    attachments: params.html ? [{ filename: "logo.png", path: LOGO_PATH, cid: "brand-logo" }] : undefined,
  });
}
