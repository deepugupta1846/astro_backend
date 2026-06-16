module.exports = (sequelize, Sequelize) => {
  const AccountDeletionRequest = sequelize.define(
    "AccountDeletionRequest",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        field: "user_id",
        comment: "Null after user data is purged on approval",
      },
      phone: {
        type: Sequelize.STRING(25),
        allowNull: false,
      },
      countryCode: {
        type: Sequelize.STRING(8),
        allowNull: false,
        defaultValue: "+91",
        field: "country_code",
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("pending", "approved", "rejected", "cancelled"),
        allowNull: false,
        defaultValue: "pending",
      },
      processedByAdminId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        field: "processed_by_admin_id",
      },
      adminNotes: {
        type: Sequelize.STRING(500),
        allowNull: true,
        field: "admin_notes",
      },
      rejectionReason: {
        type: Sequelize.STRING(300),
        allowNull: true,
        field: "rejection_reason",
      },
      processedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: "processed_at",
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "account_deletion_requests",
      indexes: [
        { fields: ["user_id", "status"] },
        { fields: ["phone"] },
        { fields: ["status"] },
      ],
    }
  );

  return AccountDeletionRequest;
};
