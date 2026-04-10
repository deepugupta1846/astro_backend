const { getMessaging } = require("./firebase-admin.service");

async function sendPushToUser(user, payload) {
  const token = user?.fcmToken;
  if (!token) return { ok: false, skipped: true, reason: "missing_token" };

  const data = payload?.data || {};
  const isIncomingVideo =
    data.type === "incoming_call" && String(data.callType || "").toLowerCase() === "video";
  const androidChannelId = isIncomingVideo
    ? "astro_pulse_video_calls"
    : "astro_pulse_messages";

  const message = {
    token,
    notification: {
      title: payload?.title || "Astro Pulse",
      body: payload?.body || "",
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
