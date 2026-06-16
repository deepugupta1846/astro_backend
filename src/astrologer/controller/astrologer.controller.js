const { Op } = require("sequelize");
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
 * Query: ?service=chat|call|any (default any)
 * Returns active astrologers with at least chat or call enabled (per filter).
 */
exports.list = async (req, res) => {
  try {
    const service = String(req.query.service || "any").toLowerCase();
    const where = { isActive: true };

    if (service === "chat") {
      where.chatEnabled = true;
    } else if (service === "call") {
      where.callEnabled = true;
    } else {
      where[Op.or] = [{ chatEnabled: true }, { callEnabled: true }];
    }

    const rows = await Astrologer.findAll({
      where,
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
 * GET /api/v1/astrologer/:id
 * Public astrologer details by ID (no contact / KYC).
 */
exports.findOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid astrologer id",
      });
    }

    const astrologer = await Astrologer.findByPk(id, {
      attributes: { exclude: LIST_EXCLUDE_ATTRIBUTES },
    });

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    res.status(200).json({
      success: true,
      data: toAstrologerResponse(astrologer),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching astrologer",
    });
  }
};

/**
 * PATCH /api/v1/astrologer/:id/availability
 * Body: { userId, chatEnabled?, callEnabled? }
 * Lets the logged-in astrologer turn chat/call on or off.
 * Sets isOnline automatically when any service is enabled.
 */
exports.updateAvailability = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = parseInt(req.body?.userId, 10);
    if (!id || !userId) {
      return res.status(400).json({
        success: false,
        message: "Valid astrologer id and userId are required",
      });
    }

    const astrologer = await Astrologer.findByPk(id);
    if (!astrologer || !astrologer.isActive) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (String(user.role || "").toLowerCase() !== "astrologer") {
      return res.status(403).json({
        success: false,
        message: "Only astrologer accounts can update availability",
      });
    }
    if (String(user.phone || "").trim() !== String(astrologer.phone || "").trim()) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own availability",
      });
    }

    const payload = {};
    if (typeof req.body.chatEnabled === "boolean") {
      payload.chatEnabled = req.body.chatEnabled;
    }
    if (typeof req.body.callEnabled === "boolean") {
      payload.callEnabled = req.body.callEnabled;
    }
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide chatEnabled and/or callEnabled (boolean)",
      });
    }

    const nextChat =
      payload.chatEnabled !== undefined
        ? payload.chatEnabled
        : astrologer.chatEnabled;
    const nextCall =
      payload.callEnabled !== undefined
        ? payload.callEnabled
        : astrologer.callEnabled;
    payload.isOnline = Boolean(nextChat || nextCall);

    await astrologer.update(payload);
    await astrologer.reload();

    res.status(200).json({
      success: true,
      message: "Availability updated",
      data: toAstrologerResponse(astrologer),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error updating availability",
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
      address,
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
      address:
        req.body.address != null && String(req.body.address).trim()
          ? String(req.body.address).trim()
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
      address:
        req.body.address != null && String(req.body.address).trim()
          ? String(req.body.address).trim()
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

    const userResponse = toUserResponse(refreshedUser);
    userResponse.astrologerId = astrologer.id;

    res.status(201).json({
      success: true,
      message: "Registered as astrologer successfully",
      data: {
        user: userResponse,
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

function buildAstroPayloadFromBody(body, defaults = {}) {
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
    address,
    isVerified,
    isActive,
    isOnline,
  } = body;

  const idTypeNorm =
    idProofType != null ? String(idProofType).trim().toLowerCase() : "";

  return {
    name: String(name).trim(),
    phone: String(phone).trim(),
    countryCode: countryCode ? String(countryCode).trim() : "+91",
    email:
      email != null && String(email).trim() ? String(email).trim() : null,
    gender: ["male", "female", "other"].includes(gender) ? gender : null,
    profileImageUrl:
      profileImageUrl != null && String(profileImageUrl).trim()
        ? String(profileImageUrl).trim()
        : null,
    idProofType: idTypeNorm || null,
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
    address:
      address != null && String(address).trim()
        ? String(address).trim()
        : null,
    isVerified:
      typeof isVerified === "boolean" ? isVerified : defaults.isVerified ?? false,
    isActive: typeof isActive === "boolean" ? isActive : true,
    isOnline: typeof isOnline === "boolean" ? isOnline : false,
    averageRating: 0,
    totalConsultations: 0,
    totalReviews: 0,
  };
}

/**
 * POST /api/v1/admin/astrologers (full create)
 * Creates astrologer profile + users row with role astrologer.
 * Requires KYC fields like mobile register flow.
 */
exports.createWithUser = async (req, res) => {
  try {
    const {
      name,
      phone,
      idProofType,
      idProofNumber,
      idProofImageUrl,
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
        message: "idProofImageUrl is required (upload ID proof image first)",
      });
    }

    const normalizedPhone = String(phone).trim();

    const existingAstro = await Astrologer.findOne({
      where: { phone: normalizedPhone },
    });
    if (existingAstro) {
      return res.status(409).json({
        success: false,
        message: "An astrologer with this phone number already exists",
      });
    }

    let user = await User.findOne({ where: { phone: normalizedPhone } });
    if (user && String(user.role || "").toLowerCase() === "admin") {
      return res.status(400).json({
        success: false,
        message: "Cannot convert an admin account to astrologer",
      });
    }

    const astroPayload = buildAstroPayloadFromBody(req.body, {
      isVerified: true,
    });
    astroPayload.idProofType = idTypeNorm;

    const userPayload = {
      phone: normalizedPhone,
      countryCode: astroPayload.countryCode,
      name: astroPayload.name,
      gender: astroPayload.gender,
      role: "astrologer",
      isActive: true,
    };
    if (astroPayload.email) userPayload.email = astroPayload.email;
    if (astroPayload.profileImageUrl) {
      userPayload.profileImageUrl = astroPayload.profileImageUrl;
    }
    if (astroPayload.birthDate) userPayload.birthDate = astroPayload.birthDate;
    if (astroPayload.birthTime) userPayload.birthTime = astroPayload.birthTime;
    if (astroPayload.birthPlace) userPayload.birthPlace = astroPayload.birthPlace;

    if (user) {
      if (String(user.role || "").toLowerCase() === "astrologer") {
        return res.status(409).json({
          success: false,
          message: "User already has astrologer role for this phone",
        });
      }
      await user.update(userPayload);
    } else {
      user = await User.create(userPayload);
    }

    const astrologer = await Astrologer.create(astroPayload);
    const refreshedUser = await User.findByPk(user.id);
    const userResponse = toUserResponse(refreshedUser);
    userResponse.astrologerId = astrologer.id;

    res.status(201).json({
      success: true,
      message: "Astrologer account created with user profile",
      data: {
        user: userResponse,
        astrologer: toAstrologerResponse(astrologer),
      },
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Phone or email already in use",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Error creating astrologer account",
    });
  }
};
