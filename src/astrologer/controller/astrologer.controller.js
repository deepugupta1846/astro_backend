const db = require("../../../models");
const Astrologer = db.astrologer;
const User = db.user;
const { toUserResponse } = require("../../user/controller/user.controller");

const ID_PROOF_TYPES = [
  "aadhaar",
  "pan",
  "passport",
  "driving_license",
  "voter_id",
  "other",
];

function toAstrologerResponse(row) {
  const a = row.toJSON ? row.toJSON() : row;
  ["specialties", "languages", "skills"].forEach((key) => {
    if (a[key] && typeof a[key] === "string") {
      try {
        a[key] = JSON.parse(a[key]);
      } catch {
        a[key] = [];
      }
    }
  });
  return a;
}

/** Fields never returned in public listing (privacy / KYC). */
const LIST_EXCLUDE_ATTRIBUTES = [
  "phone",
  "email",
  "idProofType",
  "idProofNumber",
  "idProofImageUrl",
  "idProofBackImageUrl",
];

/**
 * GET /api/v1/astrologer
 * Active astrologers for app home (no contact / KYC).
 */
exports.list = async (req, res) => {
  try {
    const rows = await Astrologer.findAll({
      where: { isActive: true },
      order: [
        ["isOnline", "DESC"],
        ["averageRating", "DESC"],
        ["totalConsultations", "DESC"],
        ["id", "ASC"],
      ],
      attributes: { exclude: LIST_EXCLUDE_ATTRIBUTES },
    });
    const data = rows.map((r) => toAstrologerResponse(r));
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error listing astrologers",
    });
  }
};

/**
 * POST /api/v1/astrologer
 * Body: full astrologer details (see model)
 */
exports.create = async (req, res) => {
  try {
    const {
      name,
      phone,
      countryCode = "+91",
      email,
      gender,
      profileImageUrl,
      idProofType,
      idProofNumber,
      idProofImageUrl,
      idProofBackImageUrl,
      bio,
      experienceYears,
      education,
      specialties,
      languages,
      skills,
      consultationFeePerMin,
      chatEnabled,
      callEnabled,
      videoEnabled,
      birthDate,
      birthTime,
      birthPlace,
      isVerified,
      isActive,
      isOnline,
      averageRating,
      totalConsultations,
      totalReviews,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone is required",
      });
    }

    const normalizedPhone = String(phone).trim();
    const existing = await Astrologer.findOne({
      where: { phone: normalizedPhone },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An astrologer with this phone number already exists",
      });
    }

    const payload = {
      name: String(name).trim(),
      phone: normalizedPhone,
      countryCode: countryCode ? String(countryCode).trim() : "+91",
      email: email != null && String(email).trim() ? String(email).trim() : null,
      gender: ["male", "female", "other"].includes(gender) ? gender : null,
      profileImageUrl:
        profileImageUrl != null && String(profileImageUrl).trim()
          ? String(profileImageUrl).trim()
          : null,
      idProofType:
        idProofType != null && String(idProofType).trim()
          ? String(idProofType).trim().slice(0, 50)
          : null,
      idProofNumber:
        idProofNumber != null && String(idProofNumber).trim()
          ? String(idProofNumber).trim().slice(0, 64)
          : null,
      idProofImageUrl:
        idProofImageUrl != null && String(idProofImageUrl).trim()
          ? String(idProofImageUrl).trim()
          : null,
      idProofBackImageUrl:
        idProofBackImageUrl != null && String(idProofBackImageUrl).trim()
          ? String(idProofBackImageUrl).trim()
          : null,
      bio: bio != null && String(bio).trim() ? String(bio).trim() : null,
      experienceYears:
        experienceYears != null && experienceYears !== ""
          ? Number(experienceYears)
          : null,
      education:
        education != null && String(education).trim()
          ? String(education).trim()
          : null,
      specialties: Array.isArray(specialties) ? specialties : null,
      languages: Array.isArray(languages) ? languages : null,
      skills: Array.isArray(skills) ? skills : null,
      consultationFeePerMin:
        consultationFeePerMin != null && consultationFeePerMin !== ""
          ? Number(consultationFeePerMin)
          : null,
      chatEnabled:
        typeof chatEnabled === "boolean" ? chatEnabled : true,
      callEnabled:
        typeof callEnabled === "boolean" ? callEnabled : true,
      videoEnabled:
        typeof videoEnabled === "boolean" ? videoEnabled : false,
      birthDate: birthDate || null,
      birthTime:
        birthTime != null && String(birthTime).trim()
          ? String(birthTime).trim()
          : null,
      birthPlace:
        birthPlace != null && String(birthPlace).trim()
          ? String(birthPlace).trim()
          : null,
      isVerified: typeof isVerified === "boolean" ? isVerified : false,
      isActive: typeof isActive === "boolean" ? isActive : true,
      isOnline: typeof isOnline === "boolean" ? isOnline : false,
      averageRating:
        averageRating != null && averageRating !== ""
          ? Number(averageRating)
          : 0,
      totalConsultations:
        totalConsultations != null && totalConsultations !== ""
          ? parseInt(totalConsultations, 10)
          : 0,
      totalReviews:
        totalReviews != null && totalReviews !== ""
          ? parseInt(totalReviews, 10)
          : 0,
    };

    const astrologer = await Astrologer.create(payload);

    res.status(201).json({
      success: true,
      message: "Astrologer created successfully",
      data: toAstrologerResponse(astrologer),
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Phone or unique field already exists",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Error creating astrologer",
    });
  }
};

/**
 * POST /api/v1/astrologer/register
 * After OTP: updates User profile + role astrologer, creates Astrologer row.
 * Requires: name, phone, idProofType, idProofNumber, idProofImageUrl
 */
exports.register = async (req, res) => {
  try {
    const {
      phone,
      countryCode = "+91",
      name,
      email,
      gender,
      profileImageUrl,
      idProofType,
      idProofNumber,
      idProofImageUrl,
      idProofBackImageUrl,
      bio,
      experienceYears,
      education,
      specialties,
      languages,
      skills,
      consultationFeePerMin,
      chatEnabled,
      callEnabled,
      videoEnabled,
      birthDate,
      birthTime,
      birthPlace,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone is required",
      });
    }
    const idTypeNorm =
      idProofType != null ? String(idProofType).trim().toLowerCase() : "";
    if (!ID_PROOF_TYPES.includes(idTypeNorm)) {
      return res.status(400).json({
        success: false,
        message: `idProofType must be one of: ${ID_PROOF_TYPES.join(", ")}`,
      });
    }
    if (!idProofNumber || !String(idProofNumber).trim()) {
      return res.status(400).json({
        success: false,
        message: "idProofNumber is required",
      });
    }
    if (!idProofImageUrl || !String(idProofImageUrl).trim()) {
      return res.status(400).json({
        success: false,
        message: "idProofImageUrl is required (upload image first)",
      });
    }

    const normalizedPhone = String(phone).trim();
    const user = await User.findOne({ where: { phone: normalizedPhone } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Verify OTP first with this phone number.",
      });
    }

    const existingAstro = await Astrologer.findOne({
      where: { phone: normalizedPhone },
    });
    if (existingAstro) {
      return res.status(409).json({
        success: false,
        message: "This phone is already registered as an astrologer",
      });
    }

    const userPayload = {
      name: String(name).trim(),
      gender: ["male", "female", "other"].includes(gender) ? gender : null,
      role: "astrologer",
    };
    if (email != null && String(email).trim()) {
      userPayload.email = String(email).trim();
    } else {
      userPayload.email = null;
    }
    if (
      profileImageUrl != null &&
      String(profileImageUrl).trim()
    ) {
      userPayload.profileImageUrl = String(profileImageUrl).trim();
    }

    await user.update(userPayload);

    const astroPayload = {
      name: String(name).trim(),
      phone: normalizedPhone,
      countryCode: countryCode ? String(countryCode).trim() : "+91",
      email:
        email != null && String(email).trim()
          ? String(email).trim()
          : user.email || null,
      gender: ["male", "female", "other"].includes(gender) ? gender : null,
      profileImageUrl:
        profileImageUrl != null && String(profileImageUrl).trim()
          ? String(profileImageUrl).trim()
          : null,
      idProofType: idTypeNorm,
      idProofNumber: String(idProofNumber).trim().slice(0, 64),
      idProofImageUrl: String(idProofImageUrl).trim(),
      idProofBackImageUrl:
        idProofBackImageUrl != null && String(idProofBackImageUrl).trim()
          ? String(idProofBackImageUrl).trim()
          : null,
      bio: bio != null && String(bio).trim() ? String(bio).trim() : null,
      experienceYears:
        experienceYears != null && experienceYears !== ""
          ? Number(experienceYears)
          : null,
      education:
        education != null && String(education).trim()
          ? String(education).trim()
          : null,
      specialties: Array.isArray(specialties) ? specialties : null,
      languages: Array.isArray(languages) ? languages : null,
      skills: Array.isArray(skills) ? skills : null,
      consultationFeePerMin:
        consultationFeePerMin != null && consultationFeePerMin !== ""
          ? Number(consultationFeePerMin)
          : null,
      chatEnabled: typeof chatEnabled === "boolean" ? chatEnabled : true,
      callEnabled: typeof callEnabled === "boolean" ? callEnabled : true,
      videoEnabled: typeof videoEnabled === "boolean" ? videoEnabled : false,
      birthDate: birthDate || null,
      birthTime:
        birthTime != null && String(birthTime).trim()
          ? String(birthTime).trim()
          : null,
      birthPlace:
        birthPlace != null && String(birthPlace).trim()
          ? String(birthPlace).trim()
          : null,
      isVerified: false,
      isActive: true,
      isOnline: false,
      averageRating: 0,
      totalConsultations: 0,
      totalReviews: 0,
    };

    const astrologer = await Astrologer.create(astroPayload);
    const refreshedUser = await User.findByPk(user.id);

    res.status(201).json({
      success: true,
      message: "Registered as astrologer successfully",
      data: {
        user: toUserResponse(refreshedUser),
        astrologer: toAstrologerResponse(astrologer),
      },
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Phone or email conflict",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Error registering astrologer",
    });
  }
};
