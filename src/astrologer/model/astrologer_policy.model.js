module.exports = (sequelize, Sequelize) => {
  const AstrologerPolicy = sequelize.define(
    "AstrologerPolicy",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        defaultValue: 1,
      },
      freeChatMinutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "free_chat_minutes",
        comment: "First N billable chat minutes free per session (platform-wide)",
      },
      withdrawalPlatformPercent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        field: "withdrawal_platform_percent",
        comment: "Platform fee % deducted from astrologer withdrawal (0–100)",
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "astrologer_policy",
    }
  );

  return AstrologerPolicy;
};
