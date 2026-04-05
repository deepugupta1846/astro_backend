module.exports = (sequelize, Sequelize) => {
  const Astrologer = sequelize.define(
    "Astrologer",
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // Identity & contact
      name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
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
      gender: {
        type: Sequelize.ENUM("male", "female", "other"),
        allowNull: true,
      },
      profileImageUrl: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: "Public URL to profile photo",
      },
      // ID proof (KYC)
      idProofType: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment:
          "Document type: aadhaar, pan, passport, driving_license, voter_id, other",
      },
      idProofNumber: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: "ID document number as on the proof",
      },
      idProofImageUrl: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: "Public URL to ID proof image (front / single page)",
      },
      idProofBackImageUrl: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: "Public URL to ID proof back (optional)",
      },
      // Professional profile
      bio: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "About / description for clients",
      },
      experienceYears: {
        type: Sequelize.DECIMAL(4, 1),
        allowNull: true,
        comment: "Years of experience, e.g. 5.5",
      },
      education: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Degrees, institutes, certifications (plain text or JSON string)",
      },
      specialties: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JSON array e.g. ["Vedic","Tarot","Numerology"]',
        get() {
          const raw = this.getDataValue("specialties");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        set(val) {
          this.setDataValue(
            "specialties",
            Array.isArray(val) ? JSON.stringify(val) : val
          );
        },
      },
      languages: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JSON array e.g. ["English","Hindi"]',
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
      skills: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "JSON array of skill tags",
        get() {
          const raw = this.getDataValue("skills");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        set(val) {
          this.setDataValue(
            "skills",
            Array.isArray(val) ? JSON.stringify(val) : val
          );
        },
      },
      // Consultation
      consultationFeePerMin: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: "Rate per minute in INR (or your base currency)",
      },
      chatEnabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      callEnabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      videoEnabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      // Astrology-specific (optional)
      birthDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      birthTime: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      birthPlace: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      // Status & metrics
      isVerified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      isOnline: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      averageRating: {
        type: Sequelize.DECIMAL(3, 2),
        defaultValue: 0,
        comment: "0.00 - 5.00",
      },
      totalConsultations: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      totalReviews: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
    },
    {
      timestamps: true,
      freezeTableName: true,
      tableName: "astrologers",
    }
  );

  return Astrologer;
};
