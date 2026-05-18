module.exports = (sequelize, Sequelize) => {
  const ConsultationSession = sequelize.define(
    "ConsultationSession",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      customerUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "FK users.id — end user (client)",
      },
      astrologerUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "FK users.id — astrologer account",
      },
      astrologerId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "FK astrologers.id for reference",
      },
      channelName: {
        type: Sequelize.STRING(128),
        allowNull: false,
        unique: true,
        comment: "Agora RTC channel name",
      },
      status: {
        type: Sequelize.ENUM("active", "closed"),
        defaultValue: "active",
      },
      requestStatus: {
        type: Sequelize.ENUM("pending", "accepted", "declined"),
        allowNull: true,
        defaultValue: "pending",
        field: "request_status",
        comment: "null = legacy accepted",
      },
      chatStartedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: "chat_started_at",
        comment: "When astrologer accepted (billing timer start)",
      },
      chatEndedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: "chat_ended_at",
      },
      billedAmount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        field: "billed_amount",
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "consultation_sessions",
    }
  );

  return ConsultationSession;
};
