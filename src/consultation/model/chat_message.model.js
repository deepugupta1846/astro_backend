module.exports = (sequelize, Sequelize) => {
  const ChatMessage = sequelize.define(
    "ChatMessage",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      sessionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "FK consultation_sessions.id",
      },
      senderUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "FK users.id",
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      messageType: {
        type: Sequelize.STRING(20),
        defaultValue: "text",
        comment: "text | system",
      },
    },
    {
      timestamps: true,
      updatedAt: false,
      freezeTableName: true,
      tableName: "chat_messages",
    }
  );

  return ChatMessage;
};
