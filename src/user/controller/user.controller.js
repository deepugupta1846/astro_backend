const db = require("../../../models");
const User = db.user;

// In-memory OTP (use Redis/SMS provider in production). Key: phone (trimmed digits)
const otpStore = new Map();
const OTP_EXPIRY_SEC = 300;

async function findOrCreateUserByPhone(normalizedPhone, countryCode) {
  let user = await User.findOne({ where: { phone: normalizedPhone } });
  let existingUser = false;
  if (!user) {
    user = await User.create({
      phone: normalizedPhone,
      countryCode: String(countryCode || "+91").trim() || "+91",
    });
  } else {
    existingUser = true;
  }
  return { user, existingUser };
}

/**
 * Send OTP to phone (for signup/login)
 */
exports.sendOtp = async (req, res) => {
  try {
    const { phone, countryCode = "+91" } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const normalizedPhone = String(phone).trim();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + OTP_EXPIRY_SEC * 1000;
    otpStore.set(normalizedPhone, { otp, expiresAt });

    // Integrate SMS gateway later. _devOtp only in non-production for testing.
    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: { expiresIn: OTP_EXPIRY_SEC },
      ...(process.env.NODE_ENV !== "production" && { _devOtp: otp }),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error sending OTP",
    });
  }
};

/**
 * Verify OTP (for signup/login)
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, countryCode = "+91", otp, signupIntent } = req.body;

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    if (otp == null || String(otp).trim() === "") {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    const normalizedPhone = String(phone).trim();
    const otpStr = String(otp).trim();
    if (otpStr.length !== 6 || !/^\d+$/.test(otpStr)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP format",
      });
    }

    const masterRaw = process.env.MASTER_OTP;
    const masterOtp =
      masterRaw != null && String(masterRaw).trim() !== ""
        ? String(masterRaw).trim()
        : null;
    const usedMasterOtp = Boolean(masterOtp && otpStr === masterOtp);

    if (!usedMasterOtp) {
      const stored = otpStore.get(normalizedPhone);
      if (!stored) {
        return res.status(400).json({
          success: false,
          message: "OTP expired or not sent. Request a new OTP.",
        });
      }
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(normalizedPhone);
        return res.status(400).json({
          success: false,
          message: "OTP expired. Request a new OTP.",
        });
      }
      if (stored.otp !== otpStr) {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
        });
      }
      otpStore.delete(normalizedPhone);
    }

    const { user, existingUser } = await findOrCreateUserByPhone(
      normalizedPhone,
      countryCode
    );

    let responseUser = user;
    if (String(signupIntent || "").toLowerCase() === "astrologer") {
      if (user.role !== "admin") {
        await user.update({ role: "astrologer" });
      }
      responseUser = await User.findByPk(user.id);
    }

    res.status(200).json({
      success: true,
      message: usedMasterOtp
        ? "OTP verified successfully (master)"
        : "OTP verified successfully",
      data: {
        user: toUserResponse(responseUser),
        existingUser,
        ...(usedMasterOtp && { usedMasterOtp: true }),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error verifying OTP",
    });
  }
};

/**
 * Signup – create/update user with profile details (after OTP verified)
 * Body: phone, countryCode, name, gender, knowBirthTime, birthTime, birthDate, birthPlace, languages
 */
exports.signup = async (req, res) => {
  try {
    const {
      phone,
      countryCode = "+91",
      name,
      gender,
      knowBirthTime,
      birthTime,
      birthDate,
      birthPlace,
      languages,
      email,
      password,
    } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const normalizedPhone = phone.trim();
    let user = await User.findOne({ where: { phone: normalizedPhone } });

    const payload = {
      countryCode: countryCode ? String(countryCode).trim() : "+91",
      name: name != null ? String(name).trim() : null,
      gender: ["male", "female", "other"].includes(gender) ? gender : null,
      knowBirthTime:
        typeof knowBirthTime === "boolean" ? knowBirthTime : null,
      birthTime: birthTime != null ? String(birthTime).trim() : null,
      birthPlace: birthPlace != null ? String(birthPlace).trim() : null,
      languages: Array.isArray(languages) ? languages : null,
    };

    if (birthDate) {
      payload.birthDate = birthDate;
    }
    if (email != null && String(email).trim()) payload.email = email.trim();
    if (password != null && String(password).trim()) payload.password = password;

    if (user) {
      await user.update(payload);
    } else {
      user = await User.create({
        phone: normalizedPhone,
        ...payload,
      });
    }

    const userResponse = toUserResponse(user);

    res.status(201).json({
      success: true,
      message: "Signup successful",
      data: { user: userResponse },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error during signup",
    });
  }
};

/**
 * Login (phone + OTP flow: use verifyOtp instead; or email/password if set)
 */
exports.login = async (req, res) => {
  try {
    const { email, password, phone } = req.body;

    if (phone) {
      const user = await User.findOne({ where: { phone: phone.trim() } });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found. Please sign up first.",
        });
      }
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: "Account is deactivated.",
        });
      }
      return res.status(200).json({
        success: true,
        message: "User found. Proceed to OTP.",
        data: { user: toUserResponse(user) },
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated.",
      });
    }
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: { user: toUserResponse(user) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error during login",
    });
  }
};

function toUserResponse(user) {
  const u = user.toJSON ? user.toJSON() : user;
  delete u.password;
  if (u.languages && typeof u.languages === "string") {
    try {
      u.languages = JSON.parse(u.languages);
    } catch (_) {
      u.languages = [];
    }
  }
  return u;
}

/** For astrologer register and other modules */
exports.toUserResponse = toUserResponse;

/**
 * Get all users
 */
exports.findAll = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ["password"] },
    });
    const data = users.map((u) => toUserResponse(u));
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching users",
    });
  }
};

/**
 * Get user by ID
 */
exports.findOne = async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: toUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching user",
    });
  }
};

/**
 * Update user
 */
exports.update = async (req, res) => {
  try {
    const id = req.params.id;
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
    ];
    const payload = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    });
    if (Array.isArray(payload.languages)) {
      payload.languages = JSON.stringify(payload.languages);
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await user.update(payload);
    const refreshed = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
    });
    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: refreshed ? toUserResponse(refreshed) : null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error updating user",
    });
  }
};

/**
 * Delete user
 */
exports.delete = async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await User.destroy({ where: { id } });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting user",
    });
  }
};
