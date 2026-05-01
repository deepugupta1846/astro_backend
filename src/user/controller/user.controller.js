const db = require("../../../models");
const User = db.user;
const Kundli = db.kundli;
const Notification = db.notification;
const { signUserToken } = require("../../auth/jwt.service");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const twilio = require("twilio");

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;
const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const OTP_EXPIRY_SEC = 600;
const processedWalletPaymentIds = new Set();

const razorpayClient =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

function getRazorpayPublicKey() {
  return String(process.env.RAZORPAY_KEY_ID || "").trim();
}

function isSendOtpOnPhoneEnabled() {
  return String(process.env.SEND_OTP_ON_PHONE || "true").toLowerCase() === "true";
}

function getMasterOtp() {
  const masterRaw = process.env.MASTER_OTP;
  return masterRaw != null && String(masterRaw).trim() !== ""
    ? String(masterRaw).trim()
    : null;
}

function toE164Phone(phone, countryCode = "+91") {
  const phoneDigits = String(phone || "").replace(/\D/g, "");
  const code = String(countryCode || "+91").trim();
  const codeDigits = code.startsWith("+")
    ? `+${code.slice(1).replace(/\D/g, "")}`
    : `+${code.replace(/\D/g, "")}`;
  if (!phoneDigits) return "";
  if (String(phone || "").trim().startsWith("+")) {
    return `+${String(phone).trim().slice(1).replace(/\D/g, "")}`;
  }
  return `${codeDigits}${phoneDigits}`;
}

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
    const sendOtpOnPhone = isSendOtpOnPhoneEnabled();

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const normalizedPhone = String(phone).trim();
    const toPhone = toE164Phone(normalizedPhone, countryCode);
    if (!toPhone) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    if (!sendOtpOnPhone) {
      return res.status(200).json({
        success: true,
        message: "OTP sending is disabled. Use MASTER_OTP for verification.",
        data: { expiresIn: OTP_EXPIRY_SEC, sendOtpOnPhone: false },
      });
    }

    if (!twilioClient || !twilioVerifyServiceSid) {
      return res.status(500).json({
        success: false,
        message: "OTP service is not configured",
      });
    }

    await twilioClient.verify.v2
      .services(twilioVerifyServiceSid)
      .verifications.create({
        to: toPhone,
        channel: "sms",
      });

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: { expiresIn: OTP_EXPIRY_SEC, sendOtpOnPhone: true },
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
    const sendOtpOnPhone = isSendOtpOnPhoneEnabled();

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
    const toPhone = toE164Phone(normalizedPhone, countryCode);
    if (!toPhone) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    const otpStr = String(otp).trim();
    if (otpStr.length !== 6 || !/^\d+$/.test(otpStr)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP format",
      });
    }

    const masterOtp = getMasterOtp();
    const usedMasterOtp = Boolean(masterOtp && otpStr === masterOtp);

    if (!sendOtpOnPhone) {
      if (!masterOtp) {
        return res.status(500).json({
          success: false,
          message: "MASTER_OTP is not configured",
        });
      }
      if (!usedMasterOtp) {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
        });
      }
    }

    if (sendOtpOnPhone && !usedMasterOtp) {
      if (!twilioClient || !twilioVerifyServiceSid) {
        return res.status(500).json({
          success: false,
          message: "OTP service is not configured",
        });
      }

      const verification = await twilioClient.verify.v2
        .services(twilioVerifyServiceSid)
        .verificationChecks.create({
          to: toPhone,
          code: otpStr,
        });

      if (verification.status !== "approved") {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
        });
      }
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
 * Create Razorpay order for wallet topup
 * Body: { userId, amount }
 */
exports.createWalletTopupOrder = async (req, res) => {
  try {
    const userIdRaw = req.body?.userId;
    const amountRaw = req.body?.amount;
    const userId =
      typeof userIdRaw === "number"
        ? userIdRaw
        : parseInt(String(userIdRaw || ""), 10);
    const amount = Number(amountRaw);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid userId is required",
      });
    }
    if (!Number.isFinite(amount) || amount < 1) {
      return res.status(400).json({
        success: false,
        message: "Amount must be at least 1",
      });
    }
    if (!razorpayClient || !getRazorpayPublicKey()) {
      return res.status(500).json({
        success: false,
        message: "Razorpay is not configured",
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const amountPaise = Math.round(amount * 100);
    const order = await razorpayClient.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `wallet_${userId}_${Date.now()}`,
      notes: {
        userId: String(userId),
        purpose: "wallet_topup",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Wallet topup order created",
      data: {
        keyId: getRazorpayPublicKey(),
        orderId: order.id,
        amount: amount,
        amountPaise: order.amount,
        currency: order.currency,
        user: toUserResponse(user),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error creating wallet topup order",
    });
  }
};

/**
 * Verify Razorpay payment and credit wallet
 * Body: { userId, amount, razorpayOrderId, razorpayPaymentId, razorpaySignature }
 */
exports.verifyWalletTopup = async (req, res) => {
  try {
    const userIdRaw = req.body?.userId;
    const amountRaw = req.body?.amount;
    const razorpayOrderId = String(req.body?.razorpayOrderId || "").trim();
    const razorpayPaymentId = String(req.body?.razorpayPaymentId || "").trim();
    const razorpaySignature = String(req.body?.razorpaySignature || "").trim();
    const userId =
      typeof userIdRaw === "number"
        ? userIdRaw
        : parseInt(String(userIdRaw || ""), 10);
    const amount = Number(amountRaw);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid userId is required",
      });
    }
    if (!Number.isFinite(amount) || amount < 1) {
      return res.status(400).json({
        success: false,
        message: "Amount must be at least 1",
      });
    }
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification fields are required",
      });
    }

    const secret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
    if (!secret) {
      return res.status(500).json({
        success: false,
        message: "Razorpay is not configured",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (processedWalletPaymentIds.has(razorpayPaymentId)) {
      return res.status(200).json({
        success: true,
        message: "Payment already processed",
        data: {
          user: toUserResponse(user),
          walletBalance: Number(user.walletBalance || 0),
          alreadyProcessed: true,
        },
      });
    }

    const current = Number(user.walletBalance || 0);
    const nextBalance = Number((current + amount).toFixed(2));
    await user.update({ walletBalance: nextBalance });
    processedWalletPaymentIds.add(razorpayPaymentId);
    const refreshed = await User.findByPk(userId);

    return res.status(200).json({
      success: true,
      message: "Wallet topup successful",
      data: {
        user: toUserResponse(refreshed || user),
        walletBalance: Number((refreshed?.walletBalance ?? nextBalance) || 0),
        paymentId: razorpayPaymentId,
        orderId: razorpayOrderId,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error verifying wallet topup",
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

    const token = signUserToken(user);
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: { user: toUserResponse(user), token },
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
  delete u.fcmToken;
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
 * PUT /api/v1/user/:id/push-token
 * Body: { token, platform?: 'android' | 'ios' | 'web' }
 */
exports.updatePushToken = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const token = String(req.body?.token || "").trim();
    if (!id || !token) {
      return res.status(400).json({
        success: false,
        message: "id and token are required",
      });
    }
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    await user.update({
      fcmToken: token.slice(0, 512),
      fcmTokenUpdatedAt: new Date(),
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error updating push token",
    });
  }
};

/**
 * GET /api/v1/user/:id/push-token
 */
exports.getPushToken = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Valid user id is required",
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        fcmToken: user.fcmToken || null,
        fcmTokenUpdatedAt: user.fcmTokenUpdatedAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching push token",
    });
  }
};

/**
 * POST /api/v1/user/:id/logout
 * Clears stored FCM token for the user.
 */
exports.logout = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Valid user id is required",
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await user.update({
      fcmToken: null,
      fcmTokenUpdatedAt: null,
    });

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error during logout",
    });
  }
};

/**
 * POST /api/v1/user/:id/kundlis
 * multipart/form-data:
 * - file: image/pdf
 * - title?: string
 * - notes?: string
 */
exports.uploadKundli = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Valid user id is required",
      });
    }
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Kundli file is required (field: file)",
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/kundli/${req.file.filename}`;
    const row = await Kundli.create({
      userId: id,
      title:
        req.body?.title != null && String(req.body.title).trim()
          ? String(req.body.title).trim()
          : null,
      notes:
        req.body?.notes != null && String(req.body.notes).trim()
          ? String(req.body.notes).trim()
          : null,
      fileUrl,
      fileType: req.file.mimetype || null,
      originalName: req.file.originalname || null,
    });

    return res.status(201).json({
      success: true,
      message: "Kundli uploaded successfully",
      data: row,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error uploading kundli",
    });
  }
};

/**
 * GET /api/v1/user/:id/kundlis
 */
exports.getKundlis = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Valid user id is required",
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const rows = await Kundli.findAll({
      where: { userId: id },
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
 * GET /api/v1/user/:id/notifications
 */
exports.getNotifications = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Valid user id is required",
      });
    }
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const rows = await Notification.findAll({
      where: { userId: id },
      order: [["createdAt", "DESC"]],
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
 * PUT /api/v1/user/:id/notifications/:notificationId/read
 */
exports.markNotificationRead = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const notificationId = parseInt(req.params.notificationId, 10);
    if (!id || !notificationId) {
      return res.status(400).json({
        success: false,
        message: "Valid user id and notification id are required",
      });
    }
    const row = await Notification.findOne({
      where: { id: notificationId, userId: id },
    });
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    await row.update({
      isRead: true,
      readAt: row.readAt || new Date(),
    });
    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: row,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error updating notification",
    });
  }
};

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
