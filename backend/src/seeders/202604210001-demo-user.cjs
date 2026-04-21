"use strict";
const bcrypt = require("bcryptjs");

module.exports = {
  async up(queryInterface) {
    const hash = await bcrypt.hash("demo1234", 10);
    await queryInterface.bulkInsert("users", [{
      id: "11111111-1111-4111-8111-111111111111",
      email: "vendedor@autos.mx",
      password_hash: hash,
      name: "Andres Vendedor",
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    }]);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete("users", { email: "vendedor@autos.mx" });
  },
};
