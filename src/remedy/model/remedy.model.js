module.exports = (sequelize, Sequelize) => {
  const Remedy = sequelize.define(
    "Remedy",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: Sequelize.STRING(160),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(190),
        allowNull: false,
        unique: true,
      },
      category: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      imageUrl: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      tags: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JSON array e.g. ["career","wealth"]',
        get() {
          const raw = this.getDataValue("tags");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        set(val) {
          this.setDataValue("tags", Array.isArray(val) ? JSON.stringify(val) : val);
        },
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "remedies",
    }
  );

  return Remedy;
};
