const twilio = require("twilio");

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;
const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const OTP_EXPIRY_SEC = 600;

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

function errWithStatus(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
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
  }

  if (sendOtpOnPhone && !usedMasterOtp) {
    if (!twilioClient || !twilioVerifyServiceSid) {
      throw errWithStatus("OTP service is not configured", 500);
    }

    const verification = await twilioClient.verify.v2
      .services(twilioVerifyServiceSid)
      .verificationChecks.create({
        to: toPhone,
        code: otpStr,
      });

    if (verification.status !== "approved") {
      throw errWithStatus("Invalid OTP", 400);
    }
  }

  return { normalizedPhone, toPhone, usedMasterOtp };
}

/**
 * Sends OTP via Twilio Verify (or returns disabled payload when SMS is off).
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

  if (!twilioClient || !twilioVerifyServiceSid) {
    throw errWithStatus("OTP service is not configured", 500);
  }

  await twilioClient.verify.v2
    .services(twilioVerifyServiceSid)
    .verifications.create({
      to: toPhone,
      channel: "sms",
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
