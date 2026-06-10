"use strict";
const bcrypt = require("bcryptjs");
const { QueryTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    const [existingUser] = await queryInterface.sequelize.query(
      `SELECT id
       FROM users
       WHERE email = :email
       LIMIT 1`,
      {
        replacements: { email: "vendedor@autos.mx" },
        type: QueryTypes.SELECT,
      },
    );

    if (existingUser) return;

    const now = new Date();
    const hash = await bcrypt.hash("demo1234", 10);
    await queryInterface.bulkInsert("users", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "vendedor@autos.mx",
        password_hash: hash,
        name: "Andres Vendedor",
        calendar_scheduling_url: "https://calendar.app.google/tYniJNfcrd8qXvut8",
        active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete("users", { email: "vendedor@autos.mx" });
  },
};
