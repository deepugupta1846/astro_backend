module.exports = (sequelize, Sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // Auth / contact
      phone: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      countryCode: {
        type: Sequelize.STRING(5),
        defaultValue: "+91",
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true,
        validate: {
          isEmail: { msg: "Must be a valid email" },
        },
      },
      password: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // Profile (from details flow UI)
      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      gender: {
        type: Sequelize.ENUM("male", "female", "other"),
        allowNull: true,
      },
      knowBirthTime: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      birthTime: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: "e.g. 11:43 AM",
      },
      birthDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      birthPlace: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      languages: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "JSON array of language names, e.g. [\"English\",\"Hindi\"]",
        get() {
          const raw = this.getDataValue("languages");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        set(val) {
          this.setDataValue(
            "languages",
            Array.isArray(val) ? JSON.stringify(val) : val
          );
        },
      },
      role: {
        type: Sequelize.ENUM("user", "admin", "astrologer"),
        defaultValue: "user",
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "users",
    }
  );

  return User;
};
