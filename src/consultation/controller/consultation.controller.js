const { Op, QueryTypes } = require("sequelize");
const db = require("../../../models");
const { buildRtcToken } = require("../../agora/agora.service");
const {
  broadcastChatMessage,
  broadcastMessageStatus,
  broadcastConversationRead,
} = require("../consultation.realtime");

const ConsultationSession = db.consultationSession;
const ChatMessage = db.chatMessage;
const CallLog = db.callLog;
const User = db.user;
const Astrologer = db.astrologer;

function channelNameForSession(id) {
  return `astro_session_${id}`;
}

/**
 * POST /api/v1/consultation/sessions
 * Body: { customerUserId, astrologerId }
 * Finds astrologer's User row by matching phone; creates or returns existing active session.
 */
exports.createOrGetSession = async (req, res) => {
  try {
    const { customerUserId, astrologerId } = req.body;
    const cid = parseInt(customerUserId, 10);
    const aid = parseInt(astrologerId, 10);
    if (!cid || !aid) {
      return res.status(400).json({
        success: false,
        message: "customerUserId and astrologerId are required",
      });
    }

    const astro = await Astrologer.findByPk(aid);
    if (!astro || !astro.isActive) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    const astroUser = await User.findOne({
      where: { phone: astro.phone },
    });
    if (!astroUser) {
      return res.status(400).json({
        success: false,
        message:
          "Astrologer has no linked app account yet (same phone as User).",
      });
    }

    if (astroUser.id === cid) {
      return res.status(400).json({
        success: false,
        message: "Cannot open session with yourself",
      });
    }

    let session = await ConsultationSession.findOne({
      where: {
        customerUserId: cid,
        astrologerUserId: astroUser.id,
        status: "active",
      },
      order: [["id", "DESC"]],
    });

    if (!session) {
      session = await ConsultationSession.create({
        customerUserId: cid,
        astrologerUserId: astroUser.id,
        astrologerId: aid,
        channelName: "pending",
        status: "active",
      });
      await session.update({ channelName: channelNameForSession(session.id) });
      await session.reload();
    }

    const participants = await participantSummaries(session);

    res.status(200).json({
      success: true,
      data: {
        session: sessionToJson(session),
        agoraAppId: process.env.AGORA_APP_ID || null,
        customer: participants.customer,
        astrologerUser: participants.astrologerUser,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error creating session",
    });
  }
};

function sessionToJson(s) {
  const o = s.toJSON ? s.toJSON() : s;
  return {
    id: o.id,
    customerUserId: o.customerUserId,
    astrologerUserId: o.astrologerUserId,
    astrologerId: o.astrologerId,
    channelName: o.channelName,
    status: o.status,
    createdAt: o.createdAt,
  };
}

function messageToJson(m) {
  const x = m.toJSON ? m.toJSON() : m;
  return {
    id: x.id,
    sessionId: x.sessionId,
    senderUserId: x.senderUserId,
    body: x.body,
    messageType: x.messageType,
    createdAt: x.createdAt,
    deliveredAt: x.deliveredAt || null,
    readAt: x.readAt || null,
  };
}

async function participantSummaries(session) {
  const [cust, astro] = await Promise.all([
    User.findByPk(session.customerUserId, {
      attributes: ["id", "name", "profileImageUrl"],
    }),
    User.findByPk(session.astrologerUserId, {
      attributes: ["id", "name", "profileImageUrl"],
    }),
  ]);
  const tile = (u) =>
    u
      ? {
          userId: u.id,
          name: u.name || "",
          profileImageUrl: u.profileImageUrl || null,
        }
      : { userId: null, name: "", profileImageUrl: null };
  return { customer: tile(cust), astrologerUser: tile(astro) };
}

async function markDeliveredCore(sessionId, readerUserId, rawIds) {
  const session = await ConsultationSession.findByPk(sessionId);
  if (!session) return { error: "not_found" };
  if (
    readerUserId !== session.customerUserId &&
    readerUserId !== session.astrologerUserId
  ) {
    return { error: "forbidden" };
  }
  const messageIds = (Array.isArray(rawIds) ? rawIds : [])
    .map((x) => parseInt(x, 10))
    .filter((n) => n > 0);
  if (!messageIds.length) return { ok: true, updated: 0 };
  const now = new Date();
  let updated = 0;
  for (const mid of messageIds) {
    const msg = await ChatMessage.findOne({ where: { id: mid, sessionId } });
    if (!msg || msg.senderUserId === readerUserId) continue;
    if (msg.deliveredAt) continue;
    await msg.update({ deliveredAt: now });
    await msg.reload();
    broadcastMessageStatus(sessionId, messageToJson(msg));
    updated += 1;
  }
  return { ok: true, updated };
}

async function markReadCore(sessionId, readerUserId) {
  const session = await ConsultationSession.findByPk(sessionId);
  if (!session) return { error: "not_found" };
  if (
    readerUserId !== session.customerUserId &&
    readerUserId !== session.astrologerUserId
  ) {
    return { error: "forbidden" };
  }
  const now = new Date();
  const rows = await ChatMessage.findAll({
    where: {
      sessionId,
      senderUserId: { [Op.ne]: readerUserId },
      readAt: null,
    },
  });
  for (const msg of rows) {
    const patch = { readAt: now };
    if (!msg.deliveredAt) {
      patch.deliveredAt = now;
    }
    await msg.update(patch);
  }
  broadcastConversationRead(sessionId, {
    sessionId,
    readerUserId,
    readAt: now,
    customerUserId: session.customerUserId,
    astrologerUserId: session.astrologerUserId,
  });
  return { ok: true, count: rows.length };
}

/**
 * GET /api/v1/consultation/sessions/for-participant/:userId
 * Query:
 * - perspective=astrologer | customer (optional; omit = both roles).
 * - includeClosed=true | 1 — include closed sessions (default: active only).
 * Ordered by last message / activity.
 */
exports.listSessionsForParticipant = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const perspective = String(req.query.perspective || "").toLowerCase();
    const includeClosed =
      req.query.includeClosed === "true" ||
      req.query.includeClosed === "1" ||
      req.query.includeClosed === "yes";

    const where = {};
    if (perspective === "astrologer") {
      where.astrologerUserId = userId;
    } else if (perspective === "customer") {
      where.customerUserId = userId;
    } else {
      where[Op.or] = [
        { customerUserId: userId },
        { astrologerUserId: userId },
      ];
    }
    if (!includeClosed) {
      where.status = "active";
    }

    const sessions = await ConsultationSession.findAll({
      where,
      order: [["id", "DESC"]],
    });

    if (sessions.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const sessionIds = sessions.map((s) => s.id);
    const allRecent = await ChatMessage.findAll({
      where: { sessionId: { [Op.in]: sessionIds } },
      order: [["createdAt", "DESC"]],
    });
    const lastBySessionId = {};
    for (const m of allRecent) {
      const sid = m.sessionId;
      if (lastBySessionId[sid] == null) {
        lastBySessionId[sid] = m;
      }
    }

    const customerIds = [...new Set(sessions.map((s) => s.customerUserId))];
    const astroUserIds = [...new Set(sessions.map((s) => s.astrologerUserId))];
    const users = await User.findAll({
      where: { id: { [Op.in]: [...customerIds, ...astroUserIds] } },
      attributes: ["id", "name", "phone", "profileImageUrl"],
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const placeholders = sessionIds.map(() => "?").join(",");
    const unreadRows =
      sessionIds.length > 0
        ? await db.sequelize.query(
            `SELECT session_id AS sessionId, COUNT(*) AS cnt FROM chat_messages
             WHERE session_id IN (${placeholders}) AND sender_user_id != ? AND read_at IS NULL
             GROUP BY session_id`,
            {
              replacements: [...sessionIds, userId],
              type: QueryTypes.SELECT,
            }
          )
        : [];
    const unreadBySessionId = Object.fromEntries(
      unreadRows.map((r) => [
        r.sessionId,
        parseInt(String(r.cnt), 10) || 0,
      ])
    );

    const displayName = (row) => {
      if (!row) return "User";
      const n = row.name && String(row.name).trim();
      if (n) return n;
      const p = row.phone && String(row.phone).trim();
      if (p) return p;
      return `User #${row.id}`;
    };

    const decorated = sessions.map((session) => {
      const j = sessionToJson(session);
      const cust = userMap[session.customerUserId];
      const astro = userMap[session.astrologerUserId];
      const last = lastBySessionId[session.id];
      const lastAt = last
        ? last.createdAt
        : session.updatedAt || session.createdAt;
      const custImg =
        cust && cust.profileImageUrl
          ? String(cust.profileImageUrl).trim() || null
          : null;
      const astroImg =
        astro && astro.profileImageUrl
          ? String(astro.profileImageUrl).trim() || null
          : null;
      return {
        session: j,
        customerDisplayName: displayName(cust) || `User #${session.customerUserId}`,
        astrologerDisplayName: displayName(astro) || `Astrologer #${session.astrologerUserId}`,
        customerProfileImageUrl: custImg,
        astrologerProfileImageUrl: astroImg,
        unreadCount: unreadBySessionId[session.id] || 0,
        lastMessage: last
          ? {
              body: last.body,
              createdAt: last.createdAt,
              senderUserId: last.senderUserId,
              messageType: last.messageType || "text",
            }
          : null,
        lastActivityAt: lastAt,
      };
    });

    decorated.sort((a, b) => {
      const ta = new Date(a.lastActivityAt).getTime();
      const tb = new Date(b.lastActivityAt).getTime();
      return tb - ta;
    });

    res.status(200).json({ success: true, data: decorated });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error listing sessions",
    });
  }
};

/**
 * GET /api/v1/consultation/sessions/:sessionId/summary?forUserId=
 * Participant-only: load session + Agora app id (open chat without create session).
 */
exports.getSessionSummary = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId, 10);
    const forUserId = parseInt(req.query.forUserId, 10);
    if (!sessionId || !forUserId) {
      return res.status(400).json({
        success: false,
        message: "sessionId and forUserId query are required",
      });
    }

    const session = await ConsultationSession.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (
      forUserId !== session.customerUserId &&
      forUserId !== session.astrologerUserId
    ) {
      return res.status(403).json({
        success: false,
        message: "Not a participant in this session",
      });
    }

    const participants = await participantSummaries(session);

    res.status(200).json({
      success: true,
      data: {
        session: sessionToJson(session),
        agoraAppId: process.env.AGORA_APP_ID || null,
        customer: participants.customer,
        astrologerUser: participants.astrologerUser,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error loading session",
    });
  }
};

/**
 * GET /api/v1/consultation/sessions/:id/messages?limit=50
 */
exports.listMessages = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const session = await ConsultationSession.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    const rows = await ChatMessage.findAll({
      where: { sessionId },
      order: [["createdAt", "ASC"]],
      limit,
    });
    res.status(200).json({
      success: true,
      data: rows.map((m) => messageToJson(m)),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error loading messages",
    });
  }
};

/**
 * POST /api/v1/consultation/sessions/:id/messages
 * Body: { senderUserId, body, messageType?: 'text' | 'image' }
 */
exports.sendMessage = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { senderUserId, body } = req.body;
    const sid = parseInt(senderUserId, 10);
    const text = String(body || "").trim();
    const messageType = String(req.body.messageType || "text").toLowerCase();
    if (!sid || !text) {
      return res.status(400).json({
        success: false,
        message: "senderUserId and body are required",
      });
    }
    if (!["text", "image"].includes(messageType)) {
      return res.status(400).json({
        success: false,
        message: "messageType must be text or image",
      });
    }
    if (messageType === "image" && !/^https?:\/\//i.test(text)) {
      return res.status(400).json({
        success: false,
        message: "Image messages require an http(s) URL in body",
      });
    }
    if (text.length > 4000) {
      return res.status(400).json({
        success: false,
        message: "Message too long",
      });
    }

    const session = await ConsultationSession.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (
      sid !== session.customerUserId &&
      sid !== session.astrologerUserId
    ) {
      return res.status(403).json({
        success: false,
        message: "Sender is not a participant in this session",
      });
    }

    const msg = await ChatMessage.create({
      sessionId,
      senderUserId: sid,
      body: text,
      messageType,
    });

    const payload = messageToJson(msg);
    broadcastChatMessage(session, payload);

    res.status(201).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error sending message",
    });
  }
};

/**
 * POST /api/v1/consultation/sessions/:sessionId/messages/mark-delivered
 * Body: { readerUserId, messageIds: number[] }
 */
exports.markMessagesDelivered = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId, 10);
    const readerUserId = parseInt(req.body?.readerUserId, 10);
    const messageIds = req.body?.messageIds;
    if (!sessionId || !readerUserId) {
      return res.status(400).json({
        success: false,
        message: "sessionId and readerUserId are required",
      });
    }
    const r = await markDeliveredCore(sessionId, readerUserId, messageIds);
    if (r.error === "not_found") {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (r.error === "forbidden") {
      return res.status(403).json({ success: false, message: "Not a participant" });
    }
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error marking delivered",
    });
  }
};

/**
 * POST /api/v1/consultation/sessions/:sessionId/read
 * Body: { readerUserId }
 */
exports.markConversationRead = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId, 10);
    const readerUserId = parseInt(req.body?.readerUserId, 10);
    if (!sessionId || !readerUserId) {
      return res.status(400).json({
        success: false,
        message: "sessionId and readerUserId are required",
      });
    }
    const r = await markReadCore(sessionId, readerUserId);
    if (r.error === "not_found") {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (r.error === "forbidden") {
      return res.status(403).json({ success: false, message: "Not a participant" });
    }
    res.status(200).json({ success: true, data: { count: r.count } });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error marking read",
    });
  }
};

/** Socket.IO: recipient acknowledged push. */
exports.socketMarkDelivered = async (payload) => {
  const sessionId = parseInt(payload?.sessionId, 10);
  const userId = parseInt(payload?.userId, 10);
  const ids = Array.isArray(payload?.messageIds)
    ? payload.messageIds
    : payload?.messageId != null
    ? [payload.messageId]
    : [];
  if (!sessionId || !userId || !ids.length) return;
  await markDeliveredCore(sessionId, userId, ids);
};

/** Socket.IO: reader opened chat. */
exports.socketConversationRead = async (payload) => {
  const sessionId = parseInt(payload?.sessionId, 10);
  const readerUserId = parseInt(payload?.readerUserId, 10);
  if (!sessionId || !readerUserId) return;
  await markReadCore(sessionId, readerUserId);
};

/**
 * POST /api/v1/consultation/agora/rtc-token
 * Body: { channelName, uid } — uid must match a session participant (checked if sessionId passed)
 * Optional: { sessionId, uid } to validate membership
 */
exports.issueRtcToken = async (req, res) => {
  try {
    const { channelName, uid, sessionId } = req.body;
    const u = parseInt(uid, 10);
    if (!channelName || !u) {
      return res.status(400).json({
        success: false,
        message: "channelName and uid are required",
      });
    }

    if (sessionId) {
      const sid = parseInt(sessionId, 10);
      const session = await ConsultationSession.findByPk(sid);
      if (!session) {
        return res.status(404).json({ success: false, message: "Session not found" });
      }
      if (session.channelName !== String(channelName)) {
        return res.status(400).json({
          success: false,
          message: "channelName does not match session",
        });
      }
      if (
        u !== session.customerUserId &&
        u !== session.astrologerUserId
      ) {
        return res.status(403).json({
          success: false,
          message: "uid is not a participant",
        });
      }
    }

    let token;
    try {
      token = buildRtcToken(channelName, u);
    } catch (e) {
      if (e.code === "AGORA_CONFIG") {
        return res.status(503).json({
          success: false,
          message: e.message,
        });
      }
      throw e;
    }

    res.status(200).json({
      success: true,
      data: {
        token,
        channelName: String(channelName),
        uid: u,
        appId: process.env.AGORA_APP_ID,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error issuing token",
    });
  }
};

/**
 * POST /api/v1/consultation/sessions/:id/call/start
 * Body: { callType: 'voice' | 'video', startedByUserId }
 */
exports.startCall = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { callType, startedByUserId } = req.body;
    const starter = parseInt(startedByUserId, 10);
    if (!["voice", "video"].includes(callType) || !starter) {
      return res.status(400).json({
        success: false,
        message: "callType (voice|video) and startedByUserId required",
      });
    }
    const session = await ConsultationSession.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (
      starter !== session.customerUserId &&
      starter !== session.astrologerUserId
    ) {
      return res.status(403).json({ success: false, message: "Not a participant" });
    }

    const log = await CallLog.create({
      sessionId,
      channelName: session.channelName,
      callType,
      startedByUserId: starter,
    });

    res.status(201).json({
      success: true,
      data: { callLogId: log.id, channelName: session.channelName, callType },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error starting call",
    });
  }
};

/**
 * PATCH /api/v1/consultation/calls/:callLogId/end
 */
exports.endCall = async (req, res) => {
  try {
    const id = parseInt(req.params.callLogId, 10);
    const log = await CallLog.findByPk(id);
    if (!log) {
      return res.status(404).json({ success: false, message: "Call not found" });
    }
    await log.update({ endedAt: new Date() });
    res.status(200).json({ success: true, data: { id: log.id, endedAt: log.endedAt } });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error ending call",
    });
  }
};
