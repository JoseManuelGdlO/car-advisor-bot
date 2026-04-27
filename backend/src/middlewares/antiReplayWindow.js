import { ApiError } from "../utils/errors.js";
import { logWcWebhook } from "../utils/wcWebhookLog.js";

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

export const antiReplayWindow = ({ maxSkewMs = DEFAULT_WINDOW_MS } = {}) => (req, _res, next) => {
  try {
    // Rechaza eventos con desfase de tiempo excesivo para mitigar replay attacks.
    const requestTs = Number(req.wc?.requestTimestampMs || 0);
    if (!requestTs) throw new ApiError(401, "Invalid webhook timestamp");
    const drift = Math.abs(Date.now() - requestTs);
    if (drift > maxSkewMs) {
      logWcWebhook("anti-replay: timestamp outside window", { requestTs, driftMs: drift, maxSkewMs });
      throw new ApiError(401, "Webhook timestamp outside allowed window");
    }
    return next();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && error.message === "Invalid webhook timestamp") {
      logWcWebhook("anti-replay: invalid timestamp", { requestTimestampMs: req.wc?.requestTimestampMs });
    }
    return next(error);
  }
};
