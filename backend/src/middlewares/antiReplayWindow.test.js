import test from "node:test";
import assert from "node:assert/strict";
import { antiReplayWindow } from "./antiReplayWindow.js";

test("antiReplayWindow permite timestamp dentro de ventana", () => {
  // Caso feliz: evento reciente debe pasar al siguiente middleware.
  const middleware = antiReplayWindow({ maxSkewMs: 300000 });
  let called = false;
  middleware(
    { wc: { requestTimestampMs: Date.now() - 1000 } },
    {},
    (err) => {
      assert.equal(err, undefined);
      called = true;
    }
  );
  assert.equal(called, true);
});

test("antiReplayWindow rechaza timestamp fuera de ventana", () => {
  // Caso de seguridad: evento viejo debe bloquearse con 401.
  const middleware = antiReplayWindow({ maxSkewMs: 1000 });
  middleware(
    { wc: { requestTimestampMs: Date.now() - 5000 } },
    {},
    (err) => {
      assert.equal(err?.status, 401);
    }
  );
});
