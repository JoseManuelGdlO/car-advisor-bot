import { app } from "./app.js";
import { env } from "./config/env.js";
import { sequelize } from "./config/database.js";

const start = async () => {
  await sequelize.authenticate();
  // Keep schema changes strictly in migrations to avoid
  // destructive/invalid ALTER operations at runtime.
  await sequelize.sync();
  app.listen(env.port, "0.0.0.0", () => {
    console.log(`Backend listening on http://0.0.0.0:${env.port}`);
  });
};

start().catch((err) => {
  console.error("Failed to start backend", err);
  process.exit(1);
});
