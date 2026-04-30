import { app } from "./app.js";
import { env } from "./config/env.js";
import { sequelize } from "./config/database.js";

// Bootstrapping principal del backend: DB -> sync -> HTTP listen.
const start = async () => {
  // Falla rápido si no hay conectividad con la base de datos.
  await sequelize.authenticate();
  // Keep schema changes strictly in migrations to avoid
  // destructive/invalid ALTER operations at runtime.
  await sequelize.sync();
  // Bind explícito para contenedores (Docker/EasyPanel).
  app.listen(env.port, "0.0.0.0", () => {
    console.log(`Backend listening on http://0.0.0.0:${env.port}`);
  });
};

// Manejo centralizado de errores de arranque.
start().catch((err) => {
  console.error("Failed to start backend", err);
  process.exit(1);
});
