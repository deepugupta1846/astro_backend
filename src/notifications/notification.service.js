const db = require("../../models");
const Notification = db.notification;

/**
 * Common helper to persist in-app notification record.
 */
async function insertNotification({
  userId,
  title = "Astro Pulse",
  body = "",
  payload = null,
}) {
  if (!userId) {
    return { ok: false, skipped: true, reason: "missing_user_id" };
  }
  const row = await Notification.create({
    userId,
    title,
    body,
    payload,
    isRead: false,
  });
  return { ok: true, data: row };
}

module.exports = { insertNotification };
