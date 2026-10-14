const crypto = require("crypto");
const twilio = require("twilio");
const db = require("../../models");
const PhoneOtp = db.phoneOtp;

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const OTP_EXPIRY_SEC = Number(process.env.OTP_EXPIRY_SEC || 600);
const OTP_RESEND_SEC = Number(process.env.OTP_RESEND_SEC || 60);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

let tableReady = false;

function isSendOtpOnPhoneEnabled() {
  return String(process.env.SEND_OTP_ON_PHONE || "true").toLowerCase() === "true";
}

function getMasterOtp() {
  const masterRaw = process.env.MASTER_OTP;
  return masterRaw != null && String(masterRaw).trim() !== ""
    ? String(masterRaw).trim()
    : null;
}

function getTwilioFromNumber() {
  return String(
    process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || ""
  ).trim();
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

function errWithStatus(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function hashOtp(phone, otp) {
  return crypto
    .createHash("sha256")
    .update(`${phone}:${otp}`)
    .digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashesMatch(storedHash, phone, otp) {
  const expected = Buffer.from(hashOtp(phone, otp), "utf8");
  const actual = Buffer.from(String(storedHash || ""), "utf8");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

async function ensureOtpTable() {
  if (tableReady || !PhoneOtp) return;
  await PhoneOtp.sync();
  tableReady = true;
}

/**
 * Verifies a 6-digit OTP for the given phone. Throws with statusCode on failure.
 */
async function verifyPhoneOtp(phone, countryCode = "+91", otp) {
  if (!phone || !String(phone).trim()) {
    throw errWithStatus("Phone number is required", 400);
  }
  if (otp == null || String(otp).trim() === "") {
    throw errWithStatus("OTP is required", 400);
  }

  const normalizedPhone = String(phone).trim();
  const toPhone = toE164Phone(normalizedPhone, countryCode);
  if (!toPhone) {
    throw errWithStatus("Invalid phone number", 400);
  }

  const otpStr = String(otp).trim();
  if (otpStr.length !== 6 || !/^\d+$/.test(otpStr)) {
    throw errWithStatus("Invalid OTP format", 400);
  }

  const sendOtpOnPhone = isSendOtpOnPhoneEnabled();
  const masterOtp = getMasterOtp();
  const usedMasterOtp = Boolean(masterOtp && otpStr === masterOtp);

  if (!sendOtpOnPhone) {
    if (!masterOtp) {
      throw errWithStatus("MASTER_OTP is not configured", 500);
    }
    if (!usedMasterOtp) {
      throw errWithStatus("Invalid OTP", 400);
    }
    return { normalizedPhone, toPhone, usedMasterOtp };
  }

  if (usedMasterOtp) {
    return { normalizedPhone, toPhone, usedMasterOtp };
  }

  await ensureOtpTable();
  const row = await PhoneOtp.findOne({ where: { phone: toPhone } });
  if (!row) {
    throw errWithStatus("OTP not found or expired. Please request a new OTP", 400);
  }

  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await row.destroy();
    throw errWithStatus("OTP expired. Please request a new OTP", 400);
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await row.destroy();
    throw errWithStatus("Too many invalid attempts. Please request a new OTP", 400);
  }

  if (!hashesMatch(row.otpHash, toPhone, otpStr)) {
    await row.update({ attempts: row.attempts + 1 });
    throw errWithStatus("Invalid OTP", 400);
  }

  await row.destroy();
  return { normalizedPhone, toPhone, usedMasterOtp: false };
}

/**
 * Generates OTP, stores a hash, and sends it as a plain Twilio SMS.
 */
async function sendPhoneOtp(phone, countryCode = "+91") {
  if (!phone || !String(phone).trim()) {
    throw errWithStatus("Phone number is required", 400);
  }

  const normalizedPhone = String(phone).trim();
  const toPhone = toE164Phone(normalizedPhone, countryCode);
  if (!toPhone) {
    throw errWithStatus("Invalid phone number", 400);
  }

  const sendOtpOnPhone = isSendOtpOnPhoneEnabled();
  if (!sendOtpOnPhone) {
    return {
      normalizedPhone,
      expiresIn: OTP_EXPIRY_SEC,
      sendOtpOnPhone: false,
    };
  }

  const fromNumber = getTwilioFromNumber();
  if (!twilioClient || !fromNumber) {
    throw errWithStatus(
      "OTP SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER",
      500
    );
  }

  await ensureOtpTable();

  const existing = await PhoneOtp.findOne({ where: { phone: toPhone } });
  if (existing) {
    const elapsedMs = Date.now() - new Date(existing.lastSentAt).getTime();
    const waitMs = OTP_RESEND_SEC * 1000 - elapsedMs;
    if (waitMs > 0) {
      throw errWithStatus(
        `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another OTP`,
        429
      );
    }
  }

  const otp = generateOtp();
  const now = new Date();
  const payload = {
    phone: toPhone,
    otpHash: hashOtp(toPhone, otp),
    expiresAt: new Date(now.getTime() + OTP_EXPIRY_SEC * 1000),
    attempts: 0,
    lastSentAt: now,
  };

  if (existing) {
    await existing.update(payload);
  } else {
    await PhoneOtp.create(payload);
  }

  await twilioClient.messages.create({
    to: toPhone,
    from: fromNumber,
    body: `Your AstroLoger OTP is ${otp}. It is valid for ${Math.round(
      OTP_EXPIRY_SEC / 60
    )} minutes. Do not share this code.`,
  });

  return {
    normalizedPhone,
    expiresIn: OTP_EXPIRY_SEC,
    sendOtpOnPhone: true,
  };
}

/**
 * Returns an error message when phone belongs to a non-astrologer account, else null.
 */
function getAstrologerPhoneConflict(user) {
  if (!user) return null;
  const role = String(user.role || "user").toLowerCase();
  if (role === "astrologer") return null;
  if (role === "admin") {
    return "This account cannot be used for astrologer login";
  }
  return "This number is already registered as a customer user. Please use a different number.";
}

module.exports = {
  OTP_EXPIRY_SEC,
  isSendOtpOnPhoneEnabled,
  getMasterOtp,
  toE164Phone,
  verifyPhoneOtp,
  sendPhoneOtp,
  getAstrologerPhoneConflict,
};
