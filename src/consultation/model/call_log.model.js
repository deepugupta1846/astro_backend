module.exports = (sequelize, Sequelize) => {
  const CallLog = sequelize.define(
    "CallLog",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      sessionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      channelName: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      callType: {
        type: Sequelize.ENUM("voice", "video"),
        allowNull: false,
      },
      startedByUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      endedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    },
    {
      timestamps: true,
      updatedAt: false,
      freezeTableName: true,
      tableName: "call_logs",
    }
  );

  return CallLog;
};
