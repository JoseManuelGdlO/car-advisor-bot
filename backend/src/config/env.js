import dotenv from "dotenv";

dotenv.config();

const must = (key, fallback = "") => process.env[key] || fallback;
const parseCsv = (value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const env = {
  nodeEnv: must("NODE_ENV", "development"),
  port: Number(must("PORT", "4000")),
  apiPrefix: must("API_PREFIX", "/api"),
  corsOrigins: must("CORS_ORIGIN", "http://localhost:5173,http://localhost:8080")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  db: {
    host: must("DB_HOST"),
    port: Number(must("DB_PORT", "3306")),
    name: must("DB_NAME"),
    user: must("DB_USER"),
    password: must("DB_PASSWORD"),
  },
  jwt: {
    secret: must("JWT_SECRET", "dev-secret"),
    expiresIn: must("JWT_EXPIRES_IN", "8h"),
  },
};
