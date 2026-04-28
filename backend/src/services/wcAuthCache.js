import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";

export const getWcToken = async () => {
  const token = String(env.wc.serviceJwt || "").trim();
  if (!token) throw new ApiError(500, "WC_SERVICE_JWT is required");
  return token;
};

export const runWithWcToken = async (callback) => {
  const token = await getWcToken();
  return callback(token);
};
