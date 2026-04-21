import { app } from "./app.js";
import { env } from "./config/env.js";
import { sequelize } from "./config/database.js";

const start = async () => {
  await sequelize.authenticate();
  // In development we auto-align tables with models to avoid
  // runtime failures when schema is partially migrated.
  await sequelize.sync({ alter: env.nodeEnv !== "production" });
  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
};

start().catch((err) => {
  console.error("Failed to start backend", err);
  process.exit(1);
});
