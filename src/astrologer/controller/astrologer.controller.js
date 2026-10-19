const { Op } = require("sequelize");
const db = require("../../../models");
const Astrologer = db.astrologer;
const User = db.user;
const {
  toUserResponse,
  attachAstrologerProfileId,
} = require("../../user/controller/user.controller");
const {
  sendPhoneOtp,
  verifyPhoneOtp,
  getAstrologerPhoneConflict,
} = require("../../user/otp.service");

const ID_PROOF_TYPES = [
  "aadhaar",
  "pan",
  "passport",
  "driving_license",
  "voter_id",
  "other",
];

/** Fields rejected on PUT /api/v1/astrologer/:id (admin / system only). */
const ASTROLOGER_SELF_UPDATE_FORBIDDEN = [
  "phone",
  "countryCode",
  "isVerified",
  "isActive",
  "walletBalance",
  "averageRating",
  "totalConsultations",
  "totalReviews",
  "isOnline",
];

function parseRequiredUserId(userId) {
  if (userId === undefined || userId === null || userId === "") {
    return {
      error: { status: 400, message: "userId is required" },
    };
  }
  const uid = parseInt(userId, 10);
  if (!uid || uid <= 0) {
    return {
      error: { status: 400, message: "Valid userId is required" },
    };
  }
  return { uid };
}

/** Ensures userId owns the astrologers row (matched by phone). */
async function resolveOwnedAstrologer(astrologerId, userId) {
  const id = parseInt(astrologerId, 10);
  const parsed = parseRequiredUserId(userId);
  if (parsed.error) {
    return parsed;
  }
  const uid = parsed.uid;
  if (!id || id <= 0) {
    return {
      error: {
        status: 400,
        message: "Valid astrologer id is required",
      },
    };
  }

  const astrologer = await Astrologer.findByPk(id);
  if (!astrologer) {
    return {
      error: { status: 404, message: "Astrologer not found" },
    };
  }

  const user = await User.findByPk(uid);
  if (!user) {
    return {
      error: { status: 404, message: "User not found" },
    };
  }
  if (String(user.role || "").toLowerCase() !== "astrologer") {
    return {
      error: {
        status: 403,
        message: "Only astrologer accounts can update astrologer profile",
      },
    };
  }
  if (
    String(user.phone || "").trim() !==
    String(astrologer.phone || "").trim()
  ) {
    return {
      error: {
        status: 403,
        message: "You can only update your own astrologer profile",
      },
    };
  }

  return { astrologer, user };
}

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

/**
 * POST /api/v1/astrologer/send-otp
 * Astrologer signup/login OTP. Rejects phones already registered as customer users.
 */
exports.sendOtp = async (req, res) => {
  try {
    const { phone, countryCode = "+91" } = req.body;
    const normalizedPhone = phone != null ? String(phone).trim() : "";
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const existingUser = await User.findOne({
      where: { phone: normalizedPhone },
    });
    const conflict = getAstrologerPhoneConflict(existingUser);
    if (conflict) {
      return res.status(409).json({
        success: false,
        message: conflict,
      });
    }

    const result = await sendPhoneOtp(normalizedPhone, countryCode);
    if (!result.sendOtpOnPhone) {
      return res.status(200).json({
        success: true,
        message: "OTP sending is disabled. Use MASTER_OTP for verification.",
        data: {
          expiresIn: result.expiresIn,
          sendOtpOnPhone: false,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: {
        expiresIn: result.expiresIn,
        sendOtpOnPhone: true,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Error sending OTP",
    });
  }
};

/**
 * POST /api/v1/astrologer/verify-otp
 * Verifies OTP for astrologer login/signup. Same response shape as user verify-otp
 * with signupIntent astrologer. Blocks customer-registered phones.
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, countryCode = "+91", otp } = req.body;
    const { normalizedPhone, usedMasterOtp } = await verifyPhoneOtp(
      phone,
      countryCode,
      otp
    );

    let user = await User.findOne({ where: { phone: normalizedPhone } });
    const conflict = getAstrologerPhoneConflict(user);
    if (conflict) {
      return res.status(409).json({
        success: false,
        message: conflict,
      });
    }

    let existingUser = false;
    if (user) {
      existingUser = true;
    } else {
      user = await User.create({
        phone: normalizedPhone,
        countryCode: String(countryCode || "+91").trim() || "+91",
        role: "astrologer",
      });
    }

    if (user.role !== "admin" && String(user.role || "").toLowerCase() !== "astrologer") {
      await user.update({ role: "astrologer" });
      user = await User.findByPk(user.id);
    }

    const userPayload = await attachAstrologerProfileId(user);

    return res.status(200).json({
      success: true,
      message: usedMasterOtp
        ? "OTP verified successfully (master)"
        : "OTP verified successfully",
      data: {
        user: userPayload,
        existingUser,
        ...(usedMasterOtp && { usedMasterOtp: true }),
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Error verifying OTP",
    });
  }
};

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

    const ownerUserId = req.query.userId;
    if (
      ownerUserId !== undefined &&
      ownerUserId !== null &&
      String(ownerUserId).trim() !== ""
    ) {
      const owned = await resolveOwnedAstrologer(id, ownerUserId);
      if (owned.error) {
        return res.status(owned.error.status).json({
          success: false,
          message: owned.error.message,
        });
      }
      return res.status(200).json({
        success: true,
        data: toAstrologerResponse(owned.astrologer),
      });
    }

    const astrologer = await Astrologer.findByPk(id, {
      attributes: { exclude: LIST_EXCLUDE_ATTRIBUTES },
    });

    if (!astrologer || !astrologer.isActive) {
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
    const owned = await resolveOwnedAstrologer(
      req.params.id,
      req.body?.userId
    );
    if (owned.error) {
      return res.status(owned.error.status).json({
        success: false,
        message: owned.error.message,
      });
    }
    const { astrologer } = owned;

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
 * PUT /api/v1/astrologer/:id
 * Body: { userId, ...profileFields }
 * Astrologer self-service profile update (KYC + professional fields).
 * Does not change phone, verification, wallet, or admin metrics.
 */
exports.updateProfile = async (req, res) => {
  try {
    const forbiddenSent = ASTROLOGER_SELF_UPDATE_FORBIDDEN.filter(
      (key) => req.body[key] !== undefined
    );
    if (forbiddenSent.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot update via this route: ${forbiddenSent.join(", ")}`,
      });
    }

    const owned = await resolveOwnedAstrologer(
      req.params.id,
      req.body?.userId
    );
    if (owned.error) {
      return res.status(owned.error.status).json({
        success: false,
        message: owned.error.message,
      });
    }
    const { astrologer, user } = owned;

    const {
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
      address,
    } = req.body;

    const payload = {};

    if (name !== undefined) {
      const trimmed = name != null ? String(name).trim() : "";
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Name cannot be empty",
        });
      }
      payload.name = trimmed;
    }
    if (email !== undefined) {
      payload.email =
        email != null && String(email).trim()
          ? String(email).trim()
          : null;
    }
    if (gender !== undefined) {
      payload.gender = ["male", "female", "other"].includes(gender)
        ? gender
        : null;
    }
    if (profileImageUrl !== undefined) {
      payload.profileImageUrl =
        profileImageUrl != null && String(profileImageUrl).trim()
          ? String(profileImageUrl).trim()
          : null;
    }
    if (idProofType !== undefined) {
      const idTypeNorm =
        idProofType != null ? String(idProofType).trim().toLowerCase() : "";
      if (idTypeNorm && !ID_PROOF_TYPES.includes(idTypeNorm)) {
        return res.status(400).json({
          success: false,
          message: `idProofType must be one of: ${ID_PROOF_TYPES.join(", ")}`,
        });
      }
      payload.idProofType = idTypeNorm || null;
    }
    if (idProofNumber !== undefined) {
      payload.idProofNumber =
        idProofNumber != null && String(idProofNumber).trim()
          ? String(idProofNumber).trim().slice(0, 64)
          : null;
    }
    if (idProofImageUrl !== undefined) {
      payload.idProofImageUrl =
        idProofImageUrl != null && String(idProofImageUrl).trim()
          ? String(idProofImageUrl).trim()
          : null;
    }
    if (idProofBackImageUrl !== undefined) {
      payload.idProofBackImageUrl =
        idProofBackImageUrl != null && String(idProofBackImageUrl).trim()
          ? String(idProofBackImageUrl).trim()
          : null;
    }
    if (bio !== undefined) {
      payload.bio =
        bio != null && String(bio).trim() ? String(bio).trim() : null;
    }
    if (experienceYears !== undefined) {
      payload.experienceYears =
        experienceYears != null && experienceYears !== ""
          ? Number(experienceYears)
          : null;
    }
    if (education !== undefined) {
      payload.education =
        education != null && String(education).trim()
          ? String(education).trim()
          : null;
    }
    if (specialties !== undefined) {
      payload.specialties = Array.isArray(specialties) ? specialties : null;
    }
    if (languages !== undefined) {
      payload.languages = Array.isArray(languages) ? languages : null;
    }
    if (skills !== undefined) {
      payload.skills = Array.isArray(skills) ? skills : null;
    }
    if (consultationFeePerMin !== undefined) {
      payload.consultationFeePerMin =
        consultationFeePerMin != null && consultationFeePerMin !== ""
          ? Number(consultationFeePerMin)
          : null;
    }
    if (chatEnabled !== undefined) {
      payload.chatEnabled =
        typeof chatEnabled === "boolean"
          ? chatEnabled
          : astrologer.chatEnabled;
    }
    if (callEnabled !== undefined) {
      payload.callEnabled =
        typeof callEnabled === "boolean"
          ? callEnabled
          : astrologer.callEnabled;
    }
    if (videoEnabled !== undefined) {
      payload.videoEnabled =
        typeof videoEnabled === "boolean"
          ? videoEnabled
          : astrologer.videoEnabled;
    }
    if (birthDate !== undefined) payload.birthDate = birthDate || null;
    if (birthTime !== undefined) {
      payload.birthTime =
        birthTime != null && String(birthTime).trim()
          ? String(birthTime).trim()
          : null;
    }
    if (birthPlace !== undefined) {
      payload.birthPlace =
        birthPlace != null && String(birthPlace).trim()
          ? String(birthPlace).trim()
          : null;
    }
    if (address !== undefined) {
      payload.address =
        address != null && String(address).trim()
          ? String(address).trim()
          : null;
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one profile field to update",
      });
    }

    if (
      payload.chatEnabled !== undefined ||
      payload.callEnabled !== undefined
    ) {
      const nextChat =
        payload.chatEnabled !== undefined
          ? payload.chatEnabled
          : astrologer.chatEnabled;
      const nextCall =
        payload.callEnabled !== undefined
          ? payload.callEnabled
          : astrologer.callEnabled;
      payload.isOnline = Boolean(nextChat || nextCall);
    }

    await astrologer.update(payload);

    const userPayload = {};
    if (payload.name !== undefined) userPayload.name = payload.name;
    if (payload.email !== undefined) userPayload.email = payload.email;
    if (payload.gender !== undefined) userPayload.gender = payload.gender;
    if (payload.profileImageUrl !== undefined) {
      userPayload.profileImageUrl = payload.profileImageUrl;
    }
    if (payload.birthDate !== undefined) {
      userPayload.birthDate = payload.birthDate;
    }
    if (payload.birthTime !== undefined) {
      userPayload.birthTime = payload.birthTime;
    }
    if (payload.birthPlace !== undefined) {
      userPayload.birthPlace = payload.birthPlace;
    }
    if (payload.languages !== undefined) {
      userPayload.languages = Array.isArray(payload.languages)
        ? JSON.stringify(payload.languages)
        : null;
    }
    if (Object.keys(userPayload).length > 0) {
      await user.update(userPayload);
    }

    await astrologer.reload();
    const refreshedUser = await User.findByPk(user.id);
    const userResponse = toUserResponse(refreshedUser);
    userResponse.astrologerId = astrologer.id;

    res.status(200).json({
      success: true,
      message: "Astrologer profile updated",
      data: {
        user: userResponse,
        astrologer: toAstrologerResponse(astrologer),
      },
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Email or unique field already in use",
      });
    }
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: error.errors?.[0]?.message || "Validation failed",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Error updating astrologer profile",
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

/**
 * GET /api/v1/astrologer/policy
 * Public platform rules for astrologers (free chat minutes, withdrawal fee %).
 */
exports.getPolicy = async (req, res) => {
  try {
    const { getAstrologerPolicy } = require("../astrologer-policy.service");
    const data = await getAstrologerPolicy();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error loading astrologer policy",
    });
  }
};
