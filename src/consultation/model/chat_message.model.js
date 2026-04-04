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
        comment: "text | image | system",
      },
      deliveredAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: "delivered_at",
        comment: "Recipient device acknowledged delivery",
      },
      readAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: "read_at",
        comment: "Recipient opened thread / read receipt",
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
