// Plantilla HTML estándar para todos los correos salientes de email-consumer.ts, siguiendo la
// misma línea gráfica del frontend y del logotipo (degradado azul índigo → royal, isotipo de
// nodos en forma de M, tipografía sans-serif bold). Tabla + estilos inline a propósito: es lo
// único que se renderiza de forma consistente en clientes de correo (Gmail, Outlook, Apple Mail).

const COLOR = {
  gradientFrom: "#20317E", // brand-900
  gradientTo: "#3F6AEC", // brand-500
  textDark: "#1F2937",
  textMuted: "#64748B",
  border: "#E2E8F0",
  bg: "#F1F5F9",
};

export interface EmailTemplateInput {
  /** Título corto mostrado como encabezado del cuerpo (ej. "Confirmación de ticket"). */
  heading: string;
  /** Párrafo principal del mensaje, texto plano (se escapa automáticamente). */
  bodyText: string;
  /** Datos opcionales del ticket para mostrar como "chip" bajo el encabezado. */
  ticketNumber?: string | null;
  /** Texto del botón de acción (opcional). */
  ctaLabel?: string;
  ctaUrl?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildEmailHtml(input: EmailTemplateInput): string {
  const { heading, bodyText, ticketNumber, ctaLabel, ctaUrl } = input;
  const safeBody = escapeHtml(bodyText).replace(/\n/g, "<br/>");

  const ticketChip = ticketNumber
    ? `<tr><td style="padding:0 32px 8px;">
         <span style="display:inline-block;background:${COLOR.bg};color:${COLOR.gradientTo};font:600 13px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:4px 12px;border-radius:999px;letter-spacing:.3px;">
           ${escapeHtml(ticketNumber)}
         </span>
       </td></tr>`
    : "";

  const ctaButton =
    ctaLabel && ctaUrl
      ? `<tr><td style="padding:24px 32px 8px;">
           <a href="${ctaUrl}" style="display:inline-block;background:${COLOR.gradientTo};color:#ffffff;text-decoration:none;font:600 14px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:12px 24px;border-radius:8px;">
             ${escapeHtml(ctaLabel)}
           </a>
         </td></tr>`
      : "";

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:${COLOR.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.bg};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
            <!-- Encabezado de marca -->
            <tr>
              <td style="background:linear-gradient(135deg, ${COLOR.gradientFrom}, ${COLOR.gradientTo});padding:28px 32px;" bgcolor="${COLOR.gradientFrom}">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:10px;vertical-align:middle;">
                      <img src="cid:brand-logo" width="32" height="32" alt="" style="display:block;border-radius:8px;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="color:#ffffff;font:700 18px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">MicroHelpDesk</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Cuerpo -->
            <tr>
              <td style="padding:28px 32px 4px;">
                <h1 style="margin:0 0 4px;color:${COLOR.textDark};font-size:19px;font-weight:700;">${escapeHtml(heading)}</h1>
              </td>
            </tr>
            ${ticketChip}
            <tr>
              <td style="padding:8px 32px 4px;color:${COLOR.textDark};font-size:14px;line-height:1.6;">
                ${safeBody}
              </td>
            </tr>
            ${ctaButton}

            <!-- Separador -->
            <tr>
              <td style="padding:24px 32px 0;">
                <div style="border-top:1px solid ${COLOR.border};"></div>
              </td>
            </tr>

            <!-- Pie -->
            <tr>
              <td style="padding:16px 32px 28px;color:${COLOR.textMuted};font-size:12px;line-height:1.6;">
                Este es un mensaje automático del sistema de soporte técnico MicroHelpDesk.
                No respondas directamente a este correo.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
