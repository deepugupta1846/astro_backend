module.exports = (sequelize, Sequelize) => {
  const Kundli = sequelize.define(
    "Kundli",
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
        type: Sequelize.STRING(180),
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      fileUrl: {
        type: Sequelize.STRING(600),
        allowNull: false,
        field: "file_url",
      },
      fileType: {
        type: Sequelize.STRING(80),
        allowNull: true,
        field: "file_type",
      },
      originalName: {
        type: Sequelize.STRING(255),
        allowNull: true,
        field: "original_name",
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "kundlis",
    }
  );

  return Kundli;
};
