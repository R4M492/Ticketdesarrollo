import "dotenv/config";
import { app } from "./app.js";
import { env } from "./config/env.js";

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`✅ organization-service corriendo en el puerto ${env.PORT}`);
});
