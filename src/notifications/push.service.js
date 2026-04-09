const { getMessaging } = require("./firebase-admin.service");

async function sendPushToUser(user, payload) {
  const token = user?.fcmToken;
  if (!token) return { ok: false, skipped: true, reason: "missing_token" };

  const message = {
    token,
    notification: {
      title: payload?.title || "Astro Pulse",
      body: payload?.body || "",
    },
    data: payload?.data || {},
    android: {
      priority: "high",
      notification: {
        channelId: "astro_pulse_messages",
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
