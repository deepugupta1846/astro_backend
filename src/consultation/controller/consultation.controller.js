const db = require("../../../models");
const { buildRtcToken } = require("../../agora/agora.service");

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

    res.status(200).json({
      success: true,
      data: {
        session: sessionToJson(session),
        agoraAppId: process.env.AGORA_APP_ID || null,
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
      data: rows.map((m) => {
        const x = m.toJSON();
        return {
          id: x.id,
          sessionId: x.sessionId,
          senderUserId: x.senderUserId,
          body: x.body,
          messageType: x.messageType,
          createdAt: x.createdAt,
        };
      }),
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
 * Body: { senderUserId, body }
 */
exports.sendMessage = async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { senderUserId, body } = req.body;
    const sid = parseInt(senderUserId, 10);
    const text = String(body || "").trim();
    if (!sid || !text) {
      return res.status(400).json({
        success: false,
        message: "senderUserId and body are required",
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
      messageType: "text",
    });

    res.status(201).json({
      success: true,
      data: {
        id: msg.id,
        sessionId: msg.sessionId,
        senderUserId: msg.senderUserId,
        body: msg.body,
        messageType: msg.messageType,
        createdAt: msg.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error sending message",
    });
  }
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
