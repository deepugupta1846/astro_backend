module.exports = (sequelize, Sequelize) => {
  const Notification = sequelize.define(
    "Notification",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: "user_id",
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      payload: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "JSON payload sent with notification",
        get() {
          const raw = this.getDataValue("payload");
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        set(val) {
          this.setDataValue("payload", val == null ? null : JSON.stringify(val));
        },
      },
      isRead: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "is_read",
      },
      readAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: "read_at",
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "notifications",
    }
  );

  return Notification;
};
