export const ROLES = {
  MASTER: "MASTER",
  TECNICO: "TECNICO",
  USUARIO: "USUARIO",
} as const;

export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

// Único tipo de notificación que este servicio dispara (recuperación de contraseña).
// El catálogo completo de tipos vive en notification-service (ver Fase 4).
export const NOTIFICATION_TYPE_PASSWORD_RESET = "PASSWORD_RESET";
