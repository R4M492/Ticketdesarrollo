import { prisma } from "./prisma.js";

interface NotificationInput {
  userId: number;
  type: string;
  title: string;
  message: string;
  ticketId?: number | null;
}

/** Crea una notificación interna. En una fase posterior también disparará correo electrónico. */
export function createNotification(input: NotificationInput): Promise<void> {
  return prisma.notification
    .create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        ticketId: input.ticketId ?? null,
      },
    })
    .then(() => {})
    .catch((err) => {
      console.error("[notification]", err);
    });
}

/** Notifica a todos los usuarios con un rol dado (activos). */
export function notifyRole(
  roleCode: string,
  input: Omit<NotificationInput, "userId">,
): Promise<void> {
  return prisma.role
    .findUnique({ where: { code: roleCode } })
    .then((role) => {
      if (!role) return;
      return prisma.user
        .findMany({ where: { roleId: role.id, status: "ACTIVE" }, select: { id: true } })
        .then((users) => Promise.all(users.map((u) => createNotification({ ...input, userId: u.id }))).then(() => {}));
    })
    .then(() => {})
    .catch((err) => {
      console.error("[notifyRole]", err);
    });
}
