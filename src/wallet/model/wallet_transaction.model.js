module.exports = (sequelize, Sequelize) => {
  const WalletTransaction = sequelize.define(
    "WalletTransaction",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      entityType: {
        type: Sequelize.ENUM("user", "astrologer"),
        allowNull: false,
        field: "entity_type",
      },
      entityId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: "entity_id",
      },
      type: {
        type: Sequelize.ENUM("credit", "debit"),
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      balanceBefore: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        field: "balance_before",
      },
      balanceAfter: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        field: "balance_after",
      },
      currency: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: "INR",
      },
      status: {
        type: Sequelize.ENUM("pending", "success", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
      source: {
        type: Sequelize.ENUM("razorpay", "consultation", "adjustment"),
        allowNull: false,
        defaultValue: "razorpay",
      },
      description: {
        type: Sequelize.STRING(300),
        allowNull: true,
      },
      referenceId: {
        type: Sequelize.STRING(120),
        allowNull: true,
        field: "reference_id",
      },
      razorpayOrderId: {
        type: Sequelize.STRING(120),
        allowNull: true,
        field: "razorpay_order_id",
      },
      razorpayPaymentId: {
        type: Sequelize.STRING(120),
        allowNull: true,
        unique: true,
        field: "razorpay_payment_id",
      },
      metadata: {
        type: Sequelize.TEXT,
        allowNull: true,
        get() {
          const raw = this.getDataValue("metadata");
          if (!raw) return {};
          try {
            return JSON.parse(raw);
          } catch (_) {
            return {};
          }
        },
        set(val) {
          this.setDataValue(
            "metadata",
            val != null && typeof val === "object" ? JSON.stringify(val) : val
          );
        },
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "wallet_transactions",
      indexes: [
        {
          fields: ["entity_type", "entity_id", "createdAt"],
        },
        {
          fields: ["razorpay_order_id"],
        },
      ],
    }
  );

  return WalletTransaction;
};
