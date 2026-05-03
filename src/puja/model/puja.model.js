module.exports = (sequelize, Sequelize) => {
  const Puja = sequelize.define(
    "Puja",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: Sequelize.STRING(180),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(220),
        allowNull: false,
        unique: true,
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      shortDescription: {
        type: Sequelize.STRING(300),
        allowNull: true,
        field: "short_description",
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      imageUrl: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      thumbnailImageUrl: {
        type: Sequelize.STRING(500),
        allowNull: true,
        field: "thumbnail_image_url",
      },
      price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      originalPrice: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        field: "original_price",
      },
      durationMinutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
        field: "duration_minutes",
      },
      tags: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JSON array e.g. ["career","prosperity"]',
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
      benefits: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JSON array e.g. ["Brings peace","Removes obstacles"]',
        get() {
          const raw = this.getDataValue("benefits");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        set(val) {
          this.setDataValue(
            "benefits",
            Array.isArray(val) ? JSON.stringify(val) : val
          );
        },
      },
      isTrending: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "is_trending",
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
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
      tableName: "pujas",
    }
  );

  return Puja;
};
