const db = require("../../models");
const User = db.user;
const Astrologer = db.astrologer;
const Remedy = db.remedy;
const Puja = db.puja;
const PujaBooking = db.pujaBooking;
const Kundli = db.kundli;
const Notification = db.notification;
const {
  toUserResponse,
} = require("../user/controller/user.controller");
const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled"];

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

function toRemedyResponse(row) {
  const r = row.toJSON ? row.toJSON() : row;
  if (r.tags && typeof r.tags === "string") {
    try {
      r.tags = JSON.parse(r.tags);
    } catch {
      r.tags = [];
    }
  }
  return r;
}

function toPujaResponse(row) {
  const p = row.toJSON ? row.toJSON() : row;
  ["tags", "benefits"].forEach((key) => {
    if (p[key] && typeof p[key] === "string") {
      try {
        p[key] = JSON.parse(p[key]);
      } catch {
        p[key] = [];
      }
    }
  });
  const totalMinutes = Number.isFinite(Number(p.durationMinutes))
    ? Number(p.durationMinutes)
    : null;
  if (totalMinutes != null) {
    p.durationHours = Math.floor(totalMinutes / 60);
    p.durationRemainingMinutes = totalMinutes % 60;
  } else {
    p.durationHours = null;
    p.durationRemainingMinutes = null;
  }
  return p;
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function remedyTagsFromBody(tags) {
  if (tags == null) return [];
  if (Array.isArray(tags)) return tags;
  const s = String(tags).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
}

function remedyBoolFromBody(value, defaultValue = true) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  if (value === "" || value == null) return defaultValue;
  return defaultValue;
}

function remedyPriorityFromBody(raw) {
  if (raw === undefined || raw === null || raw === "") return 0;
  const val = String(raw).trim().toLowerCase();
  if (val === "high") return 3;
  if (val === "medium") return 2;
  if (val === "low") return 1;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : 0;
}

function listFromBody(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
}

function numberFromBody(raw, defaultValue = 0) {
  if (raw === undefined || raw === null || raw === "") return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

function bookingStatusFromBody(raw) {
  const val = String(raw || "")
    .trim()
    .toLowerCase();
  return BOOKING_STATUSES.includes(val) ? val : null;
}

function pujaDurationFromBody(body) {
  const hasHM =
    body?.durationHours !== undefined || body?.durationMinutes !== undefined;
  if (!hasHM) return undefined;
  const hRaw = body?.durationHours;
  const mRaw = body?.durationMinutes;
  const hours =
    hRaw === undefined || hRaw === null || hRaw === ""
      ? 0
      : parseInt(String(hRaw), 10);
  const minutes =
    mRaw === undefined || mRaw === null || mRaw === ""
      ? 0
      : parseInt(String(mRaw), 10);
  const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return safeHours * 60 + safeMinutes;
}

function absoluteRemedyImageUrl(req, filename) {
  return `${req.protocol}://${req.get("host")}/uploads/remedies/${filename}`;
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
 * GET /api/v1/admin/notifications
 */
exports.listMyNotifications = async (req, res) => {
  try {
    const rows = await Notification.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit: 50,
    });
    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching notifications",
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
 * GET /api/v1/admin/users/:id/kundlis
 */
exports.getUserKundlis = async (req, res) => {
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
    const kundlis = await Kundli.findAll({
      where: { userId: id },
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({
      success: true,
      data: {
        user: toUserResponse(user),
        kundlis,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching user kundlis",
    });
  }
};

/**
 * GET /api/v1/admin/kundlis
 */
exports.listKundlis = async (_req, res) => {
  try {
    const rows = await Kundli.findAll({
      include: [
        {
          model: User,
          attributes: ["id", "name", "phone", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching kundlis",
    });
  }
};

/**
 * PUT /api/v1/admin/kundlis/:id
 * multipart/form-data (optional file field: file)
 */
exports.updateKundli = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await Kundli.findByPk(id);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const payload = {};
    if (req.body?.title !== undefined) {
      payload.title =
        req.body.title != null && String(req.body.title).trim()
          ? String(req.body.title).trim()
          : null;
    }
    if (req.body?.notes !== undefined) {
      payload.notes =
        req.body.notes != null && String(req.body.notes).trim()
          ? String(req.body.notes).trim()
          : null;
    }
    if (req.file) {
      payload.fileUrl = `${req.protocol}://${req.get("host")}/uploads/kundli/${req.file.filename}`;
      payload.fileType = req.file.mimetype || null;
      payload.originalName = req.file.originalname || null;
    }

    await row.update(payload);
    const refreshed = await Kundli.findByPk(id, {
      include: [
        {
          model: User,
          attributes: ["id", "name", "phone", "email"],
        },
      ],
    });
    return res.status(200).json({
      success: true,
      message: "Kundli updated",
      data: refreshed,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error updating kundli",
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

/**
 * GET /api/v1/admin/remedies
 */
exports.listRemedies = async (req, res) => {
  try {
    const rows = await Remedy.findAll({
      order: [
        ["priority", "DESC"],
        ["id", "DESC"],
      ],
    });
    res.status(200).json({
      success: true,
      data: rows.map((r) => toRemedyResponse(r)),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error listing remedies",
    });
  }
};

/**
 * GET /api/v1/admin/remedies/:id
 */
exports.getRemedy = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await Remedy.findByPk(id);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Remedy not found",
      });
    }
    res.status(200).json({
      success: true,
      data: toRemedyResponse(row),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching remedy",
    });
  }
};

/**
 * POST /api/v1/admin/remedies
 */
exports.createRemedy = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "title and description are required",
      });
    }

    const rawSlug = req.body.slug ? String(req.body.slug).trim() : title;
    const slug = slugify(rawSlug);
    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Invalid slug",
      });
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = absoluteRemedyImageUrl(req, req.file.filename);
    } else if (req.body.imageUrl != null && String(req.body.imageUrl).trim()) {
      imageUrl = String(req.body.imageUrl).trim();
    }

    const payload = {
      title,
      slug,
      description,
      category: req.body.category ? String(req.body.category).trim() : null,
      imageUrl,
      tags: remedyTagsFromBody(req.body.tags),
      isActive: remedyBoolFromBody(req.body.isActive, true),
      priority: remedyPriorityFromBody(req.body.priority),
    };

    const row = await Remedy.create(payload);
    res.status(201).json({
      success: true,
      message: "Remedy created",
      data: toRemedyResponse(row),
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Slug already exists",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Error creating remedy",
    });
  }
};

/**
 * PUT /api/v1/admin/remedies/:id
 */
exports.updateRemedy = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await Remedy.findByPk(id);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Remedy not found",
      });
    }

    const payload = {};
    if (req.body.title !== undefined) {
      payload.title = String(req.body.title || "").trim();
    }
    if (req.body.slug !== undefined) {
      const slug = slugify(req.body.slug);
      if (!slug) {
        return res.status(400).json({
          success: false,
          message: "Invalid slug",
        });
      }
      payload.slug = slug;
    }
    if (req.body.description !== undefined) {
      payload.description = String(req.body.description || "").trim();
    }
    if (req.body.category !== undefined) {
      payload.category = req.body.category
        ? String(req.body.category).trim()
        : null;
    }
    if (req.file) {
      payload.imageUrl = absoluteRemedyImageUrl(req, req.file.filename);
    } else if (req.body.imageUrl !== undefined) {
      payload.imageUrl = req.body.imageUrl
        ? String(req.body.imageUrl).trim()
        : null;
    }
    if (req.body.tags !== undefined) {
      payload.tags = remedyTagsFromBody(req.body.tags);
    }
    if (req.body.isActive !== undefined) {
      payload.isActive = remedyBoolFromBody(req.body.isActive, row.isActive);
    }
    if (req.body.priority !== undefined) {
      payload.priority = remedyPriorityFromBody(req.body.priority);
    }

    await row.update(payload);
    const refreshed = await Remedy.findByPk(id);
    res.status(200).json({
      success: true,
      message: "Remedy updated",
      data: toRemedyResponse(refreshed),
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Slug already exists",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Error updating remedy",
    });
  }
};

/**
 * DELETE /api/v1/admin/remedies/:id
 */
exports.deleteRemedy = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await Remedy.destroy({ where: { id } });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Remedy not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Remedy deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting remedy",
    });
  }
};

/**
 * GET /api/v1/admin/pujas
 */
exports.listPujas = async (req, res) => {
  try {
    const rows = await Puja.findAll({
      order: [
        ["priority", "DESC"],
        ["id", "DESC"],
      ],
    });
    return res.status(200).json({
      success: true,
      data: rows.map((r) => toPujaResponse(r)),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error listing pujas",
    });
  }
};

/**
 * GET /api/v1/admin/puja-bookings
 */
exports.listPujaBookings = async (_req, res) => {
  try {
    const rows = await PujaBooking.findAll({
      include: [
        {
          model: Puja,
          attributes: ["id", "title", "category", "price"],
        },
        {
          model: User,
          attributes: ["id", "name", "phone", "email"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching puja bookings",
    });
  }
};

/**
 * PUT /api/v1/admin/puja-bookings/:id/status
 */
exports.updatePujaBookingStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking id",
      });
    }

    const status = bookingStatusFromBody(req.body.status);
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use: pending, confirmed, completed, cancelled",
      });
    }

    const booking = await PujaBooking.findByPk(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    booking.status = status;
    await booking.save();

    return res.status(200).json({
      success: true,
      message: "Booking status updated",
      data: booking,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error updating booking status",
    });
  }
};

/**
 * GET /api/v1/admin/pujas/:id
 */
exports.getPuja = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await Puja.findByPk(id);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Puja not found",
      });
    }
    return res.status(200).json({
      success: true,
      data: toPujaResponse(row),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching puja",
    });
  }
};

/**
 * POST /api/v1/admin/pujas
 */
exports.createPuja = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "title and description are required",
      });
    }

    const rawSlug = req.body.slug ? String(req.body.slug).trim() : title;
    const slug = slugify(rawSlug);
    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Invalid slug",
      });
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = absoluteRemedyImageUrl(req, req.file.filename);
    } else if (req.body.imageUrl != null && String(req.body.imageUrl).trim()) {
      imageUrl = String(req.body.imageUrl).trim();
    }

    const row = await Puja.create({
      title,
      slug,
      category: req.body.category ? String(req.body.category).trim() : null,
      shortDescription:
        req.body.shortDescription != null && String(req.body.shortDescription).trim()
          ? String(req.body.shortDescription).trim()
          : null,
      description,
      imageUrl,
      thumbnailImageUrl:
        req.body.thumbnailImageUrl != null &&
        String(req.body.thumbnailImageUrl).trim()
          ? String(req.body.thumbnailImageUrl).trim()
          : null,
      price: numberFromBody(req.body.price, 0),
      originalPrice:
        req.body.originalPrice === undefined ||
        req.body.originalPrice === null ||
        req.body.originalPrice === ""
          ? null
          : numberFromBody(req.body.originalPrice, 0),
      durationMinutes:
        pujaDurationFromBody(req.body) === undefined
          ? null
          : pujaDurationFromBody(req.body),
      tags: listFromBody(req.body.tags),
      benefits: listFromBody(req.body.benefits),
      isTrending: remedyBoolFromBody(req.body.isTrending, false),
      isActive: remedyBoolFromBody(req.body.isActive, true),
      priority: remedyPriorityFromBody(req.body.priority),
    });

    return res.status(201).json({
      success: true,
      message: "Puja created",
      data: toPujaResponse(row),
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Slug already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Error creating puja",
    });
  }
};

/**
 * PUT /api/v1/admin/pujas/:id
 */
exports.updatePuja = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await Puja.findByPk(id);
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Puja not found",
      });
    }

    const payload = {};
    if (req.body.title !== undefined) payload.title = String(req.body.title || "").trim();
    if (req.body.slug !== undefined) {
      const slug = slugify(req.body.slug);
      if (!slug) {
        return res.status(400).json({
          success: false,
          message: "Invalid slug",
        });
      }
      payload.slug = slug;
    }
    if (req.body.category !== undefined) {
      payload.category = req.body.category ? String(req.body.category).trim() : null;
    }
    if (req.body.shortDescription !== undefined) {
      payload.shortDescription =
        req.body.shortDescription != null && String(req.body.shortDescription).trim()
          ? String(req.body.shortDescription).trim()
          : null;
    }
    if (req.body.description !== undefined) {
      payload.description = String(req.body.description || "").trim();
    }
    if (req.file) {
      payload.imageUrl = absoluteRemedyImageUrl(req, req.file.filename);
    } else if (req.body.imageUrl !== undefined) {
      payload.imageUrl = req.body.imageUrl ? String(req.body.imageUrl).trim() : null;
    }
    if (req.body.thumbnailImageUrl !== undefined) {
      payload.thumbnailImageUrl =
        req.body.thumbnailImageUrl != null &&
        String(req.body.thumbnailImageUrl).trim()
          ? String(req.body.thumbnailImageUrl).trim()
          : null;
    }
    if (req.body.price !== undefined) payload.price = numberFromBody(req.body.price, 0);
    if (req.body.originalPrice !== undefined) {
      payload.originalPrice =
        req.body.originalPrice === null || req.body.originalPrice === ""
          ? null
          : numberFromBody(req.body.originalPrice, 0);
    }
    if (
      req.body.durationHours !== undefined ||
      req.body.durationMinutes !== undefined
    ) {
      payload.durationMinutes = pujaDurationFromBody(req.body);
    }
    if (req.body.tags !== undefined) payload.tags = listFromBody(req.body.tags);
    if (req.body.benefits !== undefined) payload.benefits = listFromBody(req.body.benefits);
    if (req.body.isTrending !== undefined) {
      payload.isTrending = remedyBoolFromBody(req.body.isTrending, row.isTrending);
    }
    if (req.body.isActive !== undefined) {
      payload.isActive = remedyBoolFromBody(req.body.isActive, row.isActive);
    }
    if (req.body.priority !== undefined) {
      payload.priority = remedyPriorityFromBody(req.body.priority);
    }

    await row.update(payload);
    const refreshed = await Puja.findByPk(id);
    return res.status(200).json({
      success: true,
      message: "Puja updated",
      data: toPujaResponse(refreshed),
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Slug already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Error updating puja",
    });
  }
};

/**
 * DELETE /api/v1/admin/pujas/:id
 */
exports.deletePuja = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await Puja.destroy({ where: { id } });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Puja not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Puja deleted",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error deleting puja",
    });
  }
};
