import "dotenv/config";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { startAuditConsumer } from "./consumers/audit-consumer.js";

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`✅ audit-service corriendo en el puerto ${env.PORT}`);
});

startAuditConsumer().catch((err) => {
  console.error("[audit-service] no se pudo iniciar el consumidor de eventos", err);
});
