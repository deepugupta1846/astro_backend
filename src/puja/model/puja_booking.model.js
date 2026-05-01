module.exports = (sequelize, Sequelize) => {
  const PujaBooking = sequelize.define(
    "PujaBooking",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      pujaId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: "puja_id",
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        field: "user_id",
      },
      name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      phone: {
        type: Sequelize.STRING(25),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(180),
        allowNull: true,
      },
      city: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      preferredDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        field: "preferred_date",
      },
      preferredTime: {
        type: Sequelize.STRING(40),
        allowNull: true,
        field: "preferred_time",
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: Sequelize.ENUM("pending", "confirmed", "completed", "cancelled"),
        allowNull: false,
        defaultValue: "pending",
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "puja_bookings",
    }
  );

  return PujaBooking;
};
