import "dotenv/config";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { startNotificationConsumer } from "./consumers/notification-consumer.js";
import { startEmailConsumer } from "./consumers/email-consumer.js";

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`✅ notification-service corriendo en el puerto ${env.PORT}`);
});

startNotificationConsumer().catch((err) => {
  console.error("[notification-service] no se pudo iniciar el consumidor de notification.create", err);
});

startEmailConsumer().catch((err) => {
  console.error("[notification-service] no se pudo iniciar el consumidor de email.send", err);
});
