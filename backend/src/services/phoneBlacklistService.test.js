import test from "node:test";
import assert from "node:assert/strict";
import { Op } from "sequelize";
import { BlackListEntry } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import {
  addBlacklistedPhone,
  isPhoneBlacklisted,
  listBlacklistedPhones,
  removeBlacklistedPhone,
} from "./phoneBlacklistService.js";

const ownerUserId = "11111111-1111-4111-8111-111111111111";

test("isPhoneBlacklisted normaliza a 521 antes de consultar", async () => {
  const originalFindOne = BlackListEntry.findOne;
  let capturedWhere = null;
  BlackListEntry.findOne = async ({ where }) => {
    capturedWhere = where;
    return { id: "row-1" };
  };

  try {
    const result = await isPhoneBlacklisted({
      ownerUserId,
      displayPhone: "6181556489",
    });
    assert.equal(result, true);
    assert.equal(capturedWhere.ownerUserId, ownerUserId);
    assert.deepEqual(capturedWhere.phone[Op.in], ["5216181556489", "6181556489"]);
  } finally {
    BlackListEntry.findOne = originalFindOne;
  }
});

test("isPhoneBlacklisted devuelve false cuando el telefono no es comparable", async () => {
  const originalFindOne = BlackListEntry.findOne;
  let called = false;
  BlackListEntry.findOne = async () => {
    called = true;
    return null;
  };

  try {
    const result = await isPhoneBlacklisted({
      ownerUserId,
      displayPhone: "60911863783463@lid",
    });
    assert.equal(result, false);
    assert.equal(called, false);
  } finally {
    BlackListEntry.findOne = originalFindOne;
  }
});

test("listBlacklistedPhones ordena por createdAt descendente", async () => {
  const originalFindAll = BlackListEntry.findAll;
  let capturedOptions = null;
  BlackListEntry.findAll = async (options) => {
    capturedOptions = options;
    return [];
  };

  try {
    await listBlacklistedPhones(ownerUserId);
    assert.deepEqual(capturedOptions, {
      where: { ownerUserId },
      order: [["createdAt", "DESC"]],
    });
  } finally {
    BlackListEntry.findAll = originalFindAll;
  }
});

test("addBlacklistedPhone valida el telefono", async () => {
  await assert.rejects(
    () => addBlacklistedPhone(ownerUserId, "123"),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "Introduce un teléfono válido.");
      return true;
    }
  );
});

test("addBlacklistedPhone rechaza más de 13 dígitos", async () => {
  await assert.rejects(
    () => addBlacklistedPhone(ownerUserId, "521618155648912"),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "El teléfono no puede tener más de 13 dígitos.");
      return true;
    }
  );
});

test("addBlacklistedPhone guarda siempre con prefijo 521", async () => {
  const originalFindOne = BlackListEntry.findOne;
  const originalCreate = BlackListEntry.create;
  let createdPhone = null;

  BlackListEntry.findOne = async () => null;
  BlackListEntry.create = async (payload) => {
    createdPhone = payload.phone;
    return { id: "row-1", ...payload };
  };

  try {
    await addBlacklistedPhone(ownerUserId, "6181556489");
    assert.equal(createdPhone, "5216181556489");
  } finally {
    BlackListEntry.findOne = originalFindOne;
    BlackListEntry.create = originalCreate;
  }
});

test("addBlacklistedPhone traduce duplicados a 409", async () => {
  const originalFindOne = BlackListEntry.findOne;
  const originalCreate = BlackListEntry.create;

  BlackListEntry.findOne = async () => ({ id: "existing" });
  BlackListEntry.create = async () => {
    throw new Error("should not create");
  };

  try {
    await assert.rejects(
      () => addBlacklistedPhone(ownerUserId, "6181556489"),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 409);
        assert.equal(error.message, "Ese teléfono ya está en la blacklist.");
        return true;
      }
    );
  } finally {
    BlackListEntry.findOne = originalFindOne;
    BlackListEntry.create = originalCreate;
  }
});

test("removeBlacklistedPhone destruye solo registros del owner", async () => {
  const originalFindOne = BlackListEntry.findOne;
  let destroyed = false;
  BlackListEntry.findOne = async ({ where }) => ({
    id: where.id,
    async destroy() {
      destroyed = true;
    },
  });

  try {
    const result = await removeBlacklistedPhone(ownerUserId, "22222222-2222-4222-8222-222222222222");
    assert.equal(result, true);
    assert.equal(destroyed, true);
  } finally {
    BlackListEntry.findOne = originalFindOne;
  }
});
