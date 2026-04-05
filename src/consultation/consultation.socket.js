const db = require("../../models");
const ConsultationSession = db.consultationSession;
const consultationController = require("./controller/consultation.controller");
const { setIo } = require("./consultation.realtime");

function consultationRoom(sessionId) {
  return `consultation:${sessionId}`;
}

function userRoom(userId) {
  return `user:${userId}`;
}

/** @type {Map<number, number>} userId -> number of active sockets */
const userSocketCounts = new Map();

/**
 * @param {import("socket.io").Server} io
 */
module.exports = function attachConsultationSocket(io) {
  setIo(io);

  io.on("connection", (socket) => {
    const rawUid = socket.handshake.query?.userId;
    const userId = parseInt(rawUid, 10);
    if (userId) {
      socket.join(userRoom(userId));
      const prev = userSocketCounts.get(userId) || 0;
      userSocketCounts.set(userId, prev + 1);
      if (prev === 0) {
        io.emit("user_presence", { userId, online: true });
      }
    }

    socket.emit("presence_snapshot", {
      onlineUserIds: Array.from(userSocketCounts.keys()),
    });

    socket.on("disconnect", () => {
      if (!userId) return;
      const n = (userSocketCounts.get(userId) || 1) - 1;
      if (n <= 0) {
        userSocketCounts.delete(userId);
        io.emit("user_presence", { userId, online: false });
      } else {
        userSocketCounts.set(userId, n);
      }
    });

    socket.on("join_consultation", async (payload) => {
      try {
        const sessionId = parseInt(payload?.sessionId, 10);
        if (!sessionId || !userId) return;
        const session = await ConsultationSession.findByPk(sessionId);
        if (!session) return;
        if (
          userId !== session.customerUserId &&
          userId !== session.astrologerUserId
        ) {
          return;
        }
        socket.join(consultationRoom(sessionId));
      } catch (e) {
        console.error("join_consultation", e.message);
      }
    });

    socket.on("leave_consultation", (payload) => {
      const sessionId = parseInt(payload?.sessionId, 10);
      if (sessionId) {
        socket.leave(consultationRoom(sessionId));
      }
    });

    socket.on("message_delivered", async (payload) => {
      try {
        await consultationController.socketMarkDelivered(payload);
      } catch (e) {
        console.error("message_delivered", e.message);
      }
    });

    socket.on("conversation_read", async (payload) => {
      try {
        await consultationController.socketConversationRead(payload);
      } catch (e) {
        console.error("conversation_read", e.message);
      }
    });
  });
};
