const { getMessaging } = require("./firebase-admin.service");
const { insertNotification } = require("./notification.service");

async function sendPushToUser(user, payload) {
  const token = user?.fcmToken;
  const title = payload?.title || "Astro Pulse";
  const body = payload?.body || "";
  const data = payload?.data || {};

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

  if (!token) return { ok: false, skipped: true, reason: "missing_token" };

  const isIncomingVideo =
    data.type === "incoming_call" && String(data.callType || "").toLowerCase() === "video";
  const androidChannelId = isIncomingVideo
    ? "astro_pulse_video_calls"
    : "astro_pulse_messages";

  const message = {
    token,
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
  };

  try {
    const id = await getMessaging().send(message);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e?.message || "push_send_failed" };
  }
}

module.exports = { sendPushToUser };
