module.exports = (sequelize, Sequelize) => {
  const PhoneOtp = sequelize.define(
    "PhoneOtp",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      phone: {
        type: Sequelize.STRING(25),
        allowNull: false,
        unique: true,
      },
      otpHash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        field: "otp_hash",
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: "expires_at",
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastSentAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: "last_sent_at",
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "phone_otps",
      indexes: [{ unique: true, fields: ["phone"] }],
    }
  );

  return PhoneOtp;
};
