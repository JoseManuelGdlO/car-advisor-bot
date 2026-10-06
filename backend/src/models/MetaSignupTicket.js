import { DataTypes } from "sequelize";

export default function MetaSignupTicketModel(sequelize) {
  return sequelize.define("meta_signup_tickets", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "user_id",
    },
    ticketHash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
      unique: true,
      field: "ticket_hash",
    },
    status: {
      type: DataTypes.ENUM("pending", "completed", "failed", "cancelled"),
      allowNull: false,
      defaultValue: "pending",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "expires_at",
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "used_at",
    },
    errorMessage: {
      type: DataTypes.STRING(300),
      allowNull: true,
      field: "error_message",
    },
  });
}
