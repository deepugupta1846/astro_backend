const db = require("../../models");
const User = db.user;
const Astrologer = db.astrologer;
const {
  toUserResponse,
} = require("../user/controller/user.controller");

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
 * GET /api/v1/admin/me
 */
exports.me = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ["password"] },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }
    res.status(200).json({
      success: true,
      data: toUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error",
    });
  }
};

/**
 * GET /api/v1/admin/users
 */
exports.listUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ["password"] },
      order: [["id", "DESC"]],
    });
    res.status(200).json({
      success: true,
      data: users.map((u) => toUserResponse(u)),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching users",
    });
  }
};

/**
 * GET /api/v1/admin/users/:id
 */
exports.getUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    res.status(200).json({ success: true, data: toUserResponse(user) });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching user",
    });
  }
};

/**
 * PUT /api/v1/admin/users/:id
 */
exports.updateUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const allowed = [
      "name",
      "email",
      "password",
      "gender",
      "knowBirthTime",
      "birthTime",
      "birthDate",
      "birthPlace",
      "languages",
      "countryCode",
      "role",
      "isActive",
      "phone",
      "walletBalance",
    ];
    const payload = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    });

    if (payload.phone != null) {
      payload.phone = String(payload.phone).trim();
    }
    if (payload.email != null && String(payload.email).trim() === "") {
      payload.email = null;
    }
    if (Array.isArray(payload.languages)) {
      payload.languages = JSON.stringify(payload.languages);
    }
    if (payload.role != null) {
      const r = String(payload.role).toLowerCase();
      if (!["user", "admin", "astrologer"].includes(r)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role",
        });
      }
      payload.role = r;
    }

    await user.update(payload);
    const refreshed = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
    });
    res.status(200).json({
      success: true,
      message: "User updated",
      data: toUserResponse(refreshed),
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
      message: error.message || "Error updating user",
    });
  }
};

/**
 * DELETE /api/v1/admin/users/:id
 */
exports.deleteUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }
    const deleted = await User.destroy({ where: { id } });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "User deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting user",
    });
  }
};

/**
 * GET /api/v1/admin/astrologers
 */
exports.listAstrologers = async (req, res) => {
  try {
    const rows = await Astrologer.findAll({
      order: [
        ["isActive", "DESC"],
        ["id", "DESC"],
      ],
    });
    res.status(200).json({
      success: true,
      data: rows.map((r) => toAstrologerResponse(r)),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error listing astrologers",
    });
  }
};

/**
 * GET /api/v1/admin/astrologers/:id
 */
exports.getAstrologer = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await Astrologer.findByPk(id);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }
    res.status(200).json({
      success: true,
      data: toAstrologerResponse(row),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching astrologer",
    });
  }
};

/**
 * PUT /api/v1/admin/astrologers/:id
 */
exports.updateAstrologer = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await Astrologer.findByPk(id);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    const {
      name,
      phone,
      countryCode,
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

    const payload = {};
    if (name !== undefined)
      payload.name = name != null ? String(name).trim() : row.name;
    if (phone !== undefined)
      payload.phone = phone != null ? String(phone).trim() : row.phone;
    if (countryCode !== undefined)
      payload.countryCode = countryCode
        ? String(countryCode).trim()
        : "+91";
    if (email !== undefined)
      payload.email =
        email != null && String(email).trim()
          ? String(email).trim()
          : null;
    if (gender !== undefined)
      payload.gender = ["male", "female", "other"].includes(gender)
        ? gender
        : null;
    if (profileImageUrl !== undefined)
      payload.profileImageUrl =
        profileImageUrl != null && String(profileImageUrl).trim()
          ? String(profileImageUrl).trim()
          : null;
    if (idProofType !== undefined)
      payload.idProofType =
        idProofType != null && String(idProofType).trim()
          ? String(idProofType).trim().slice(0, 50)
          : null;
    if (idProofNumber !== undefined)
      payload.idProofNumber =
        idProofNumber != null && String(idProofNumber).trim()
          ? String(idProofNumber).trim().slice(0, 64)
          : null;
    if (idProofImageUrl !== undefined)
      payload.idProofImageUrl =
        idProofImageUrl != null && String(idProofImageUrl).trim()
          ? String(idProofImageUrl).trim()
          : null;
    if (idProofBackImageUrl !== undefined)
      payload.idProofBackImageUrl =
        idProofBackImageUrl != null && String(idProofBackImageUrl).trim()
          ? String(idProofBackImageUrl).trim()
          : null;
    if (bio !== undefined)
      payload.bio =
        bio != null && String(bio).trim() ? String(bio).trim() : null;
    if (experienceYears !== undefined)
      payload.experienceYears =
        experienceYears != null && experienceYears !== ""
          ? Number(experienceYears)
          : null;
    if (education !== undefined)
      payload.education =
        education != null && String(education).trim()
          ? String(education).trim()
          : null;
    if (specialties !== undefined)
      payload.specialties = Array.isArray(specialties) ? specialties : null;
    if (languages !== undefined)
      payload.languages = Array.isArray(languages) ? languages : null;
    if (skills !== undefined)
      payload.skills = Array.isArray(skills) ? skills : null;
    if (consultationFeePerMin !== undefined)
      payload.consultationFeePerMin =
        consultationFeePerMin != null && consultationFeePerMin !== ""
          ? Number(consultationFeePerMin)
          : null;
    if (chatEnabled !== undefined)
      payload.chatEnabled = typeof chatEnabled === "boolean" ? chatEnabled : row.chatEnabled;
    if (callEnabled !== undefined)
      payload.callEnabled = typeof callEnabled === "boolean" ? callEnabled : row.callEnabled;
    if (videoEnabled !== undefined)
      payload.videoEnabled =
        typeof videoEnabled === "boolean" ? videoEnabled : row.videoEnabled;
    if (birthDate !== undefined) payload.birthDate = birthDate || null;
    if (birthTime !== undefined)
      payload.birthTime =
        birthTime != null && String(birthTime).trim()
          ? String(birthTime).trim()
          : null;
    if (birthPlace !== undefined)
      payload.birthPlace =
        birthPlace != null && String(birthPlace).trim()
          ? String(birthPlace).trim()
          : null;
    if (isVerified !== undefined)
      payload.isVerified = typeof isVerified === "boolean" ? isVerified : false;
    if (isActive !== undefined)
      payload.isActive = typeof isActive === "boolean" ? isActive : true;
    if (isOnline !== undefined)
      payload.isOnline = typeof isOnline === "boolean" ? isOnline : false;
    if (averageRating !== undefined)
      payload.averageRating =
        averageRating != null && averageRating !== ""
          ? Number(averageRating)
          : row.averageRating;
    if (totalConsultations !== undefined)
      payload.totalConsultations =
        totalConsultations != null && totalConsultations !== ""
          ? parseInt(totalConsultations, 10)
          : row.totalConsultations;
    if (totalReviews !== undefined)
      payload.totalReviews =
        totalReviews != null && totalReviews !== ""
          ? parseInt(totalReviews, 10)
          : row.totalReviews;

    await row.update(payload);
    const refreshed = await Astrologer.findByPk(id);
    res.status(200).json({
      success: true,
      message: "Astrologer updated",
      data: toAstrologerResponse(refreshed),
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Phone or unique field conflict",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Error updating astrologer",
    });
  }
};
