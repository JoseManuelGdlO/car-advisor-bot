"use strict";

const { QueryTypes } = require("sequelize");
const { randomUUID } = require("crypto");

const OWNER_USER_ID = "11111111-1111-4111-8111-111111111111";
const VEHICLE_MODELS = [
  "Corolla LE",
  "RAV4 XLE",
  "Versa Advance",
  "Kicks Exclusive",
  "Mazda 3 i Touring",
  "CX-5 Grand Touring",
  "Jetta Comfortline",
  "Tiguan Trendline",
];
const PLAN_NAMES = ["Credito Tradicional 24 meses", "Plan Flexible 36 meses", "Premium 48 meses"];
const PROMOTION_TITLES = ["Bono de descuento de mayo", "Mensualidad gratis en SUVs", "Tasa preferencial de financiamiento"];
const FAQ_QUESTIONS = [
  "Que documentos necesito para tramitar un financiamiento?",
  "Puedo agendar una prueba de manejo?",
  "Los autos incluyen garantia?",
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkDelete("faqs", {
      owner_user_id: OWNER_USER_ID,
      question: FAQ_QUESTIONS,
    });
    await queryInterface.bulkDelete("promotions", {
      owner_user_id: OWNER_USER_ID,
      title: PROMOTION_TITLES,
    });
    await queryInterface.bulkDelete("financing_plans", {
      owner_user_id: OWNER_USER_ID,
      name: PLAN_NAMES,
    });
    await queryInterface.bulkDelete("vehicles", {
      owner_user_id: OWNER_USER_ID,
      model: VEHICLE_MODELS,
    });

    await queryInterface.bulkInsert("vehicles", [
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        brand: "Toyota",
        model: "Corolla LE",
        year: 2021,
        price: 339900.0,
        km: 42000,
        transmission: "Automatica",
        engine: "1.8L",
        color: "Blanco",
        status: "available",
        description: "Sedan economico y confiable, ideal para ciudad.",
        image: "🚗",
        image_urls: JSON.stringify(["https://images.example.com/toyota-corolla-2021-1.jpg"]),
        metadata: JSON.stringify({ fuel: "Gasolina", doors: 4, drivetrain: "FWD" }),
        outbound_priority: 10,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        brand: "Toyota",
        model: "RAV4 XLE",
        year: 2022,
        price: 549900.0,
        km: 28000,
        transmission: "Automatica",
        engine: "2.5L",
        color: "Gris",
        status: "available",
        description: "SUV familiar con gran espacio y excelente rendimiento.",
        image: "🚙",
        image_urls: JSON.stringify(["https://images.example.com/toyota-rav4-2022-1.jpg"]),
        metadata: JSON.stringify({ fuel: "Gasolina", doors: 5, drivetrain: "AWD" }),
        outbound_priority: 9,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        brand: "Nissan",
        model: "Versa Advance",
        year: 2020,
        price: 279900.0,
        km: 56000,
        transmission: "Manual",
        engine: "1.6L",
        color: "Plata",
        status: "available",
        description: "Sedan compacto con bajo costo de mantenimiento.",
        image: "🚗",
        image_urls: JSON.stringify(["https://images.example.com/nissan-versa-2020-1.jpg"]),
        metadata: JSON.stringify({ fuel: "Gasolina", doors: 4, drivetrain: "FWD" }),
        outbound_priority: 7,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        brand: "Nissan",
        model: "Kicks Exclusive",
        year: 2021,
        price: 429900.0,
        km: 39000,
        transmission: "CVT",
        engine: "1.6L",
        color: "Azul",
        status: "available",
        description: "SUV urbana con buena altura y equipamiento completo.",
        image: "🚙",
        image_urls: JSON.stringify(["https://images.example.com/nissan-kicks-2021-1.jpg"]),
        metadata: JSON.stringify({ fuel: "Gasolina", doors: 5, drivetrain: "FWD" }),
        outbound_priority: 8,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        brand: "Mazda",
        model: "Mazda 3 i Touring",
        year: 2022,
        price: 489900.0,
        km: 25000,
        transmission: "Automatica",
        engine: "2.5L",
        color: "Rojo",
        status: "available",
        description: "Sedan con manejo deportivo y acabados premium.",
        image: "🚗",
        image_urls: JSON.stringify(["https://images.example.com/mazda3-2022-1.jpg"]),
        metadata: JSON.stringify({ fuel: "Gasolina", doors: 4, drivetrain: "FWD" }),
        outbound_priority: 9,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        brand: "Mazda",
        model: "CX-5 Grand Touring",
        year: 2021,
        price: 599900.0,
        km: 31000,
        transmission: "Automatica",
        engine: "2.5L Turbo",
        color: "Negro",
        status: "reserved",
        description: "SUV mediana con gran seguridad y confort en carretera.",
        image: "🚙",
        image_urls: JSON.stringify(["https://images.example.com/cx5-2021-1.jpg"]),
        metadata: JSON.stringify({ fuel: "Gasolina", doors: 5, drivetrain: "AWD" }),
        outbound_priority: 6,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        brand: "Volkswagen",
        model: "Jetta Comfortline",
        year: 2020,
        price: 319900.0,
        km: 60000,
        transmission: "Tiptronic",
        engine: "1.4L Turbo",
        color: "Blanco",
        status: "available",
        description: "Sedan amplio con manejo estable y buena cajuela.",
        image: "🚗",
        image_urls: JSON.stringify(["https://images.example.com/jetta-2020-1.jpg"]),
        metadata: JSON.stringify({ fuel: "Gasolina", doors: 4, drivetrain: "FWD" }),
        outbound_priority: 5,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        brand: "Volkswagen",
        model: "Tiguan Trendline",
        year: 2022,
        price: 629900.0,
        km: 22000,
        transmission: "DSG",
        engine: "1.4L Turbo",
        color: "Gris",
        status: "available",
        description: "SUV para familia con excelente espacio interior.",
        image: "🚙",
        image_urls: JSON.stringify(["https://images.example.com/tiguan-2022-1.jpg"]),
        metadata: JSON.stringify({ fuel: "Gasolina", doors: 5, drivetrain: "FWD" }),
        outbound_priority: 10,
        created_at: now,
        updated_at: now,
      },
    ]);

    const insertedVehicles = await queryInterface.sequelize.query(
      `SELECT id, model
         FROM vehicles
         WHERE owner_user_id = :ownerUserId`,
      {
        replacements: { ownerUserId: OWNER_USER_ID },
        type: QueryTypes.SELECT,
      },
    );

    const vehicleIdsByModel = new Map(
      insertedVehicles
        .filter((vehicle) => VEHICLE_MODELS.includes(vehicle.model))
        .map((vehicle) => [vehicle.model, vehicle.id]),
    );

    await queryInterface.bulkInsert("financing_plans", [
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        name: "Credito Tradicional 24 meses",
        lender: "Banco Azteca",
        rate: 12.5,
        max_term_months: 24,
        active: true,
        show_rate: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        name: "Plan Flexible 36 meses",
        lender: "BBVA Auto",
        rate: 10.9,
        max_term_months: 36,
        active: true,
        show_rate: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        name: "Premium 48 meses",
        lender: "Santander Movilidad",
        rate: 9.8,
        max_term_months: 48,
        active: true,
        show_rate: true,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert("promotions", [
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        title: "Bono de descuento de mayo",
        description: "Obten $15,000 MXN de descuento en sedanes seleccionados.",
        valid_until: "2026-06-30",
        active: true,
        applies_to: "Sedanes 2020-2022",
        vehicle_ids: JSON.stringify([
          vehicleIdsByModel.get("Corolla LE"),
          vehicleIdsByModel.get("Versa Advance"),
          vehicleIdsByModel.get("Mazda 3 i Touring"),
          vehicleIdsByModel.get("Jetta Comfortline"),
        ].filter(Boolean)),
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        title: "Mensualidad gratis en SUVs",
        description: "Primera mensualidad sin costo en la compra de SUV participantes.",
        valid_until: "2026-07-15",
        active: true,
        applies_to: "SUVs",
        vehicle_ids: JSON.stringify([
          vehicleIdsByModel.get("RAV4 XLE"),
          vehicleIdsByModel.get("Kicks Exclusive"),
          vehicleIdsByModel.get("CX-5 Grand Touring"),
          vehicleIdsByModel.get("Tiguan Trendline"),
        ].filter(Boolean)),
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        title: "Tasa preferencial de financiamiento",
        description: "Tasa desde 8.9% con enganche minimo del 20%.",
        valid_until: "2026-08-31",
        active: true,
        applies_to: "Catalogo completo",
        vehicle_ids: JSON.stringify([]),
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert("faqs", [
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        question: "Que documentos necesito para tramitar un financiamiento?",
        answer:
          "Identificacion oficial vigente, comprobante de domicilio, comprobante de ingresos y solicitud firmada.",
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        question: "Puedo agendar una prueba de manejo?",
        answer:
          "Si, solo comparte el modelo de interes y tu horario disponible para confirmar una cita en sucursal.",
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        owner_user_id: OWNER_USER_ID,
        question: "Los autos incluyen garantia?",
        answer:
          "Si, ofrecemos garantia mecanica de 3 meses en motor y transmision para unidades seleccionadas.",
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("faqs", {
      owner_user_id: OWNER_USER_ID,
      question: FAQ_QUESTIONS,
    });
    await queryInterface.bulkDelete("promotions", {
      owner_user_id: OWNER_USER_ID,
      title: PROMOTION_TITLES,
    });
    await queryInterface.bulkDelete("financing_plans", {
      owner_user_id: OWNER_USER_ID,
      name: PLAN_NAMES,
    });
    await queryInterface.bulkDelete("vehicles", {
      owner_user_id: OWNER_USER_ID,
      model: VEHICLE_MODELS,
    });
  },
};
