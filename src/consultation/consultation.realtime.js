/**
 * Socket.IO broadcast helpers for consultation chat.
 * Set from server bootstrap via setIo().
 */

let io = null;

exports.setIo = (instance) => {
  io = instance;
};

function consultationRoom(sessionId) {
  return `consultation:${sessionId}`;
}

function userRoom(userId) {
  return `user:${userId}`;
}

/**
 * Push a new message to everyone in the session room + refresh both users' inbox.
 * @param {import("sequelize").Model} session ConsultationSession instance
 * @param {object} messagePayload { id, sessionId, senderUserId, body, messageType, createdAt }
 */
exports.broadcastChatMessage = (session, messagePayload) => {
  if (!io || !session) return;
  const sid = session.id;
  io.to(consultationRoom(sid)).emit("chat_message", messagePayload);
  io.to(userRoom(session.customerUserId)).emit("inbox_updated", { sessionId: sid });
  io.to(userRoom(session.astrologerUserId)).emit("inbox_updated", { sessionId: sid });
};

/** Delivery / read receipt for a single message (Instagram-style ticks). */
exports.broadcastMessageStatus = (sessionId, messagePayload) => {
  if (!io) return;
  io.to(consultationRoom(sessionId)).emit("message_status", messagePayload);
};

/** Bulk read: client updates all own messages to read. */
exports.broadcastConversationRead = (sessionId, payload) => {
  if (!io) return;
  io.to(consultationRoom(sessionId)).emit("conversation_read", payload);
  const c = payload?.customerUserId;
  const a = payload?.astrologerUserId;
  if (c && a) {
    io.to(userRoom(c)).emit("inbox_updated", { sessionId });
    io.to(userRoom(a)).emit("inbox_updated", { sessionId });
  }
};
