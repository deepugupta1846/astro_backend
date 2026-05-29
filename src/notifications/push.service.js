const { getMessaging } = require("./firebase-admin.service");
const { insertNotification } = require("./notification.service");
const db = require("../../models");

function isValidFcmToken(token) {
  if (!token || typeof token !== "string") return false;
  const t = token.trim();
  if (t.length < 20) return false;
  if (t === "null" || t === "undefined") return false;
  return true;
}

/** FCM requires every data value to be a string. */
function stringifyData(data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    out[String(key)] = value == null ? "" : String(value);
  }
  return out;
}

async function clearInvalidToken(userId) {
  if (!userId) return;
  try {
    await db.user.update(
      { fcmToken: null, fcmTokenUpdatedAt: null },
      { where: { id: userId } }
    );
  } catch (_) {
    // ignore
  }
}

async function sendPushToUser(user, payload) {
  const token = user?.fcmToken;
  const title = payload?.title || "Astro Pulse";
  const body = payload?.body || "";
  const data = stringifyData(payload?.data || {});

  // Persist notification history for in-app listing.
  if (user?.id) {
    try {
      await insertNotification({
        userId: user.id,
        title,
        body,
        payload: data,
      });
    } catch (_) {
      // Intentionally ignore storage errors to keep push flow resilient.
    }
  }

  if (!isValidFcmToken(token)) {
    return { ok: false, skipped: true, reason: "missing_or_invalid_token" };
  }

  const isIncomingVideo =
    data.type === "incoming_call" &&
    String(data.callType || "").toLowerCase() === "video";
  const androidChannelId = isIncomingVideo
    ? "astro_pulse_video_calls"
    : "astro_pulse_messages";

  const message = {
    token: token.trim(),
    notification: {
      title,
      body,
    },
    data,
    android: {
      priority: "high",
      notification: {
        channelId: androidChannelId,
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          alert: { title, body },
          sound: "default",
        },
      },
    },
  };

  try {
    const id = await getMessaging().send(message);
    return { ok: true, id };
  } catch (e) {
    const code = e?.code || e?.errorInfo?.code || "";
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token" ||
      code === "messaging/invalid-argument"
    ) {
      await clearInvalidToken(user?.id);
    }
    return { ok: false, error: e?.message || "push_send_failed", code };
  }
}

module.exports = { sendPushToUser, isValidFcmToken };
