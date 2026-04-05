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
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "consultation_sessions",
    }
  );

  return ConsultationSession;
};
