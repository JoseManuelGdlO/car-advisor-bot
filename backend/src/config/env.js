import dotenv from "dotenv";

dotenv.config();

const must = (key, fallback = "") => process.env[key] || fallback;

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
  /** 32+ chars recommended; falls back to JWT_SECRET for dev only */
  credentialsEncryptionKey: must("CREDENTIALS_ENCRYPTION_KEY", ""),
  bot: {
    defaultOwnerUserId: must("BOT_DEFAULT_OWNER_USER_ID", ""),
    defaultInboundChannel: must("BOT_DEFAULT_INBOUND_CHANNEL", "web"),
  },
};
