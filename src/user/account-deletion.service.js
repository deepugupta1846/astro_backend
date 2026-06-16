const path = require("path");
const fs = require("fs");
const { Op } = require("sequelize");
const db = require("../../models");
const { verifyPhoneOtp } = require("./otp.service");

const User = db.user;
const Astrologer = db.astrologer;
const Kundli = db.kundli;
const Notification = db.notification;
const ConsultationSession = db.consultationSession;
const ChatMessage = db.chatMessage;
const CallLog = db.callLog;
const PujaBooking = db.pujaBooking;
const AstrologerWithdrawalRequest = db.astrologerWithdrawalRequest;
const AccountDeletionRequest = db.accountDeletionRequest;

function errWithStatus(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function toRequestJson(row, options = {}) {
  const r = row.toJSON ? row.toJSON() : row;
  const user = r.user || options.user;
  const out = {
    id: r.id,
    userId: r.userId,
    phone: r.phone,
    countryCode: r.countryCode,
    reason: r.reason,
    status: r.status,
    processedByAdminId: r.processedByAdminId,
    adminNotes: r.adminNotes,
    rejectionReason: r.rejectionReason,
    processedAt: r.processedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
  if (user) {
    out.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      walletBalance: Number(user.walletBalance || 0),
      isActive: user.isActive,
    };
  }
  return out;
}

async function attachUsers(rows) {
  const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  if (!ids.length) return rows;
  const users = await User.findAll({
    where: { id: ids },
    attributes: [
      "id",
      "name",
      "email",
      "phone",
      "role",
      "walletBalance",
      "isActive",
    ],
  });
  const byId = Object.fromEntries(users.map((u) => [u.id, u.toJSON()]));
  return rows.map((r) => {
    const json = r.toJSON ? r.toJSON() : r;
    return { ...json, user: byId[json.userId] || null };
  });
}

function tryDeleteUploadFile(fileUrl) {
  if (!fileUrl) return;
  try {
    const marker = "/uploads/";
    const idx = String(fileUrl).indexOf(marker);
    if (idx === -1) return;
    const rel = String(fileUrl).slice(idx + marker.length);
    const abs = path.join(process.cwd(), "public", "uploads", rel);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (_) {
    /* best-effort */
  }
}

async function purgeUserAccount(userId, tx) {
  const user = await User.findByPk(userId, {
    transaction: tx,
    lock: tx.LOCK.UPDATE,
  });
  if (!user) throw errWithStatus("User not found", 404);

  const sessions = await ConsultationSession.findAll({
    where: {
      [Op.or]: [{ customerUserId: userId }, { astrologerUserId: userId }],
    },
    attributes: ["id"],
    transaction: tx,
  });
  const sessionIds = sessions.map((s) => s.id);

  if (sessionIds.length) {
    await ChatMessage.destroy({
      where: {
        [Op.or]: [
          { sessionId: sessionIds },
          { senderUserId: userId },
        ],
      },
      transaction: tx,
    });
    await CallLog.destroy({
      where: {
        [Op.or]: [
          { sessionId: sessionIds },
          { startedByUserId: userId },
        ],
      },
      transaction: tx,
    });
    await ConsultationSession.destroy({
      where: { id: sessionIds },
      transaction: tx,
    });
  } else {
    await ChatMessage.destroy({
      where: { senderUserId: userId },
      transaction: tx,
    });
    await CallLog.destroy({
      where: { startedByUserId: userId },
      transaction: tx,
    });
  }

  const kundlis = await Kundli.findAll({
    where: { userId },
    transaction: tx,
  });
  for (const k of kundlis) {
    tryDeleteUploadFile(k.fileUrl);
  }
  await Kundli.destroy({ where: { userId }, transaction: tx });

  await Notification.destroy({ where: { userId }, transaction: tx });

  await PujaBooking.update(
    {
      userId: null,
      name: "Deleted user",
      phone: "0000000000",
      email: null,
      city: null,
      notes: null,
    },
    { where: { userId }, transaction: tx }
  );

  if (String(user.role || "").toLowerCase() === "astrologer" && user.phone) {
    const astro = await Astrologer.findOne({
      where: { phone: String(user.phone).trim() },
      transaction: tx,
    });
    if (astro) {
      await AstrologerWithdrawalRequest.update(
        { status: "cancelled", rejectionReason: "Account deleted" },
        {
          where: { astrologerId: astro.id, status: "pending" },
          transaction: tx,
        }
      );
      await astro.destroy({ transaction: tx });
    }
  }

  await user.destroy({ transaction: tx });
}

async function requestAccountDeletion(body) {
  const { phone, countryCode = "+91", otp, reason } = body || {};
  const { normalizedPhone } = await verifyPhoneOtp(phone, countryCode, otp);

  const user = await User.findOne({ where: { phone: normalizedPhone } });
  if (!user) {
    throw errWithStatus(
      "No account found for this phone number. Sign up in the app first.",
      404
    );
  }

  if (String(user.role || "").toLowerCase() === "admin") {
    throw errWithStatus("Admin accounts cannot be deleted via this flow", 403);
  }

  const activeSession = await ConsultationSession.findOne({
    where: {
      status: "active",
      [Op.or]: [
        { customerUserId: user.id },
        { astrologerUserId: user.id },
      ],
    },
  });
  if (activeSession) {
    throw errWithStatus(
      "End your active consultation before requesting account deletion",
      400
    );
  }

  const existingPending = await AccountDeletionRequest.findOne({
    where: { userId: user.id, status: "pending" },
  });
  if (existingPending) {
    throw errWithStatus(
      "A deletion request is already pending for this account",
      409
    );
  }

  const row = await AccountDeletionRequest.create({
    userId: user.id,
    phone: normalizedPhone,
    countryCode: String(countryCode || "+91").trim() || "+91",
    reason:
      reason != null && String(reason).trim()
        ? String(reason).trim().slice(0, 2000)
        : null,
    status: "pending",
  });

  await user.update({ isActive: false });

  return toRequestJson(row, { user: user.toJSON() });
}

async function listDeletionRequestsAdmin({ status, limit = 50, offset = 0 } = {}) {
  const where = {};
  if (status) where.status = String(status).trim().toLowerCase();
  const rows = await AccountDeletionRequest.findAll({
    where,
    order: [["id", "DESC"]],
    limit: Math.min(Math.max(limit, 1), 100),
    offset: Math.max(offset, 0),
  });
  const enriched = await attachUsers(rows);
  return enriched.map((r) => toRequestJson(r));
}

async function getDeletionRequestByIdAdmin(id) {
  const row = await AccountDeletionRequest.findByPk(id);
  if (!row) throw errWithStatus("Deletion request not found", 404);
  const [enriched] = await attachUsers([row]);
  return toRequestJson(enriched);
}

async function updateDeletionRequestAdmin(id, body, adminUserId) {
  const tx = await db.sequelize.transaction();
  try {
    const row = await AccountDeletionRequest.findByPk(id, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!row) throw errWithStatus("Deletion request not found", 404);

    const nextStatus =
      body.status != null ? String(body.status).trim().toLowerCase() : null;
    const allowed = ["pending", "approved", "rejected", "cancelled"];

    if (!nextStatus || !allowed.includes(nextStatus)) {
      throw errWithStatus(
        `status must be one of: ${allowed.join(", ")}`,
        400
      );
    }

    if (nextStatus === row.status) {
      await tx.commit();
      const [enriched] = await attachUsers([row]);
      return toRequestJson(enriched);
    }

    if (row.status !== "pending") {
      throw errWithStatus(
        "Only pending deletion requests can change status",
        400
      );
    }

    const payload = {
      status: nextStatus,
      processedByAdminId: adminUserId,
      processedAt: new Date(),
    };

    if (body.adminNotes !== undefined) {
      const notes = String(body.adminNotes || "").trim();
      payload.adminNotes = notes ? notes.slice(0, 500) : null;
    }

    if (nextStatus === "rejected") {
      const reason = String(body.rejectionReason || "").trim();
      if (!reason) {
        throw errWithStatus(
          "rejectionReason is required when rejecting",
          400
        );
      }
      payload.rejectionReason = reason.slice(0, 300);
      const user = await User.findByPk(row.userId, { transaction: tx });
      if (user) {
        await user.update({ isActive: true }, { transaction: tx });
      }
    } else if (nextStatus === "approved") {
      const user = await User.findByPk(row.userId, { transaction: tx });
      if (!user) throw errWithStatus("User not found", 404);
      const snapshot = [
        user.name ? `name=${user.name}` : null,
        user.email ? `email=${user.email}` : null,
        `phone=${user.phone}`,
        `role=${user.role}`,
      ]
        .filter(Boolean)
        .join("; ");
      payload.adminNotes = payload.adminNotes || snapshot.slice(0, 500);
      payload.rejectionReason = null;
      await row.update(payload, { transaction: tx });
      await purgeUserAccount(row.userId, tx);
      await row.update({ userId: null }, { transaction: tx });
      await tx.commit();
      const refreshed = await AccountDeletionRequest.findByPk(id);
      return toRequestJson(refreshed);
    } else if (nextStatus === "cancelled") {
      const user = await User.findByPk(row.userId, { transaction: tx });
      if (user) {
        await user.update({ isActive: true }, { transaction: tx });
      }
    }

    await row.update(payload, { transaction: tx });
    await tx.commit();

    const refreshed = await AccountDeletionRequest.findByPk(id);
    const [enriched] = await attachUsers([refreshed]);
    return toRequestJson(enriched);
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = {
  requestAccountDeletion,
  listDeletionRequestsAdmin,
  getDeletionRequestByIdAdmin,
  updateDeletionRequestAdmin,
  purgeUserAccount,
};
