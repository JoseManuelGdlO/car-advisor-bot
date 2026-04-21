import { app } from "./app.js";
import { env } from "./config/env.js";
import { sequelize } from "./config/database.js";

const start = async () => {
  await sequelize.authenticate();
  // Keep schema changes strictly in migrations to avoid
  // destructive/invalid ALTER operations at runtime.
  await sequelize.sync();
  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
};

start().catch((err) => {
  console.error("Failed to start backend", err);
  process.exit(1);
});
