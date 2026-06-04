module.exports = (sequelize, Sequelize) => {
  const AstrologerWithdrawalRequest = sequelize.define(
    "AstrologerWithdrawalRequest",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      astrologerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: "astrologer_id",
      },
      requestedByUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: "requested_by_user_id",
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("pending", "approved", "rejected", "cancelled"),
        allowNull: false,
        defaultValue: "pending",
      },
      accountHolderName: {
        type: Sequelize.STRING(120),
        allowNull: false,
        field: "account_holder_name",
      },
      accountNumber: {
        type: Sequelize.STRING(34),
        allowNull: false,
        field: "account_number",
      },
      ifscCode: {
        type: Sequelize.STRING(11),
        allowNull: false,
        field: "ifsc_code",
      },
      bankName: {
        type: Sequelize.STRING(120),
        allowNull: false,
        field: "bank_name",
      },
      branchName: {
        type: Sequelize.STRING(120),
        allowNull: true,
        field: "branch_name",
      },
      rejectionReason: {
        type: Sequelize.STRING(300),
        allowNull: true,
        field: "rejection_reason",
      },
      walletTransactionId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        field: "wallet_transaction_id",
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "astrologer_withdrawal_requests",
      indexes: [
        { fields: ["astrologer_id", "status"] },
        { fields: ["requested_by_user_id"] },
      ],
    }
  );

  return AstrologerWithdrawalRequest;
};
