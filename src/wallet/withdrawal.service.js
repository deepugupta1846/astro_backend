const { Op } = require("sequelize");
const db = require("../../models");

const User = db.user;
const Astrologer = db.astrologer;
const WalletTransaction = db.walletTransaction;
const WithdrawalRequest = db.astrologerWithdrawalRequest;

const MIN_WITHDRAWAL_AMOUNT = 1000;

function asAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

function errWithStatus(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function getWalletBalance(entity) {
  return Number(entity?.walletBalance || 0);
}

function normalizeIfsc(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function validateBankDetails(body) {
  const accountHolderName = String(body.accountHolderName || "").trim();
  const accountNumber = String(body.accountNumber || "")
    .trim()
    .replace(/\s+/g, "");
  const ifscCode = normalizeIfsc(body.ifscCode);
  const bankName = String(body.bankName || "").trim();
  const branchName = String(body.branchName || "").trim() || null;

  if (accountHolderName.length < 2) {
    throw errWithStatus("Account holder name is required", 400);
  }
  if (!/^\d{9,18}$/.test(accountNumber)) {
    throw errWithStatus("Account number must be 9–18 digits", 400);
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
    throw errWithStatus("Invalid IFSC code", 400);
  }
  if (bankName.length < 2) {
    throw errWithStatus("Bank name is required", 400);
  }

  return {
    accountHolderName,
    accountNumber,
    ifscCode,
    bankName,
    branchName,
  };
}

async function assertAstrologerOwner(astrologerId, userId) {
  const astro = await Astrologer.findByPk(astrologerId);
  if (!astro || !astro.isActive) {
    throw errWithStatus("Astrologer not found", 404);
  }
  const user = await User.findByPk(userId);
  if (!user) {
    throw errWithStatus("User not found", 404);
  }
  if (String(user.role || "").toLowerCase() !== "astrologer") {
    throw errWithStatus("Only astrologer accounts can request withdrawal", 403);
  }
  if (String(user.phone || "").trim() !== String(astro.phone || "").trim()) {
    throw errWithStatus("You can only withdraw from your own wallet", 403);
  }
  return { astro, user };
}

function toWithdrawalJson(row, options = {}) {
  const r = row.toJSON ? row.toJSON() : row;
  const adminView = options.admin === true;
  const astro = r.astrologer || options.astrologer;
  const out = {
    id: r.id,
    astrologerId: r.astrologerId,
    requestedByUserId: r.requestedByUserId,
    amount: Number(r.amount),
    status: r.status,
    accountHolderName: r.accountHolderName,
    accountNumber: adminView
      ? r.accountNumber
      : maskAccountNumber(r.accountNumber),
    ifscCode: r.ifscCode,
    bankName: r.bankName,
    branchName: r.branchName,
    rejectionReason: r.rejectionReason,
    walletTransactionId: r.walletTransactionId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
  if (astro) {
    out.astrologer = {
      id: astro.id,
      name: astro.name,
      phone: astro.phone,
      walletBalance: Number(astro.walletBalance || 0),
    };
  }
  return out;
}

function maskAccountNumber(num) {
  const s = String(num || "");
  if (s.length <= 4) return s;
  return `${"*".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

async function createAstrologerWithdrawal(params) {
  const { astrologerId, userId, amount, bank } = params;
  const amt = asAmount(amount);
  if (!amt || amt < MIN_WITHDRAWAL_AMOUNT) {
    throw errWithStatus(
      `Minimum withdrawal amount is ₹${MIN_WITHDRAWAL_AMOUNT}`,
      400
    );
  }

  const bankDetails = validateBankDetails(bank);
  const tx = await db.sequelize.transaction();

  try {
    const { astro } = await assertAstrologerOwner(astrologerId, userId);
    const locked = await Astrologer.findByPk(astrologerId, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });

    const existingPending = await WithdrawalRequest.findOne({
      where: { astrologerId, status: "pending" },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (existingPending) {
      throw errWithStatus(
        "You already have a pending withdrawal. Wait for it to be processed.",
        409
      );
    }

    const balanceBefore = getWalletBalance(locked);
    if (balanceBefore < amt) {
      throw errWithStatus("Insufficient wallet balance", 400);
    }

    const balanceAfter = Number((balanceBefore - amt).toFixed(2));
    await locked.update({ walletBalance: balanceAfter }, { transaction: tx });

    const withdrawal = await WithdrawalRequest.create(
      {
        astrologerId,
        requestedByUserId: userId,
        amount: amt,
        status: "pending",
        ...bankDetails,
      },
      { transaction: tx }
    );

    const walletTx = await WalletTransaction.create(
      {
        entityType: "astrologer",
        entityId: astrologerId,
        type: "debit",
        amount: amt,
        balanceBefore,
        balanceAfter,
        currency: "INR",
        status: "pending",
        source: "adjustment",
        description: "Withdrawal request",
        referenceId: `withdrawal_${withdrawal.id}`,
        metadata: {
          kind: "withdrawal",
          withdrawalRequestId: withdrawal.id,
          bankName: bankDetails.bankName,
          ifscCode: bankDetails.ifscCode,
          accountLast4: bankDetails.accountNumber.slice(-4),
        },
      },
      { transaction: tx }
    );

    await withdrawal.update(
      { walletTransactionId: walletTx.id },
      { transaction: tx }
    );

    await tx.commit();
    return {
      withdrawal: toWithdrawalJson(await withdrawal.reload()),
      walletBalance: balanceAfter,
    };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

async function listAstrologerWithdrawals(astrologerId, userId, { limit = 20, offset = 0 } = {}) {
  await assertAstrologerOwner(astrologerId, userId);
  const rows = await WithdrawalRequest.findAll({
    where: { astrologerId },
    order: [["id", "DESC"]],
    limit: Math.min(Math.max(limit, 1), 50),
    offset: Math.max(offset, 0),
  });
  return rows.map((r) => toWithdrawalJson(r));
}

async function attachAstrologer(rows) {
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.astrologerId))];
  const astros = await Astrologer.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ["id", "name", "phone", "walletBalance"],
  });
  const map = Object.fromEntries(astros.map((a) => [a.id, a.toJSON()]));
  return rows.map((r) => {
    const j = r.toJSON ? r.toJSON() : { ...r };
    j.astrologer = map[j.astrologerId] || null;
    return j;
  });
}

async function listAllWithdrawalsAdmin({
  status,
  astrologerId,
  limit = 50,
  offset = 0,
} = {}) {
  const where = {};
  if (status) where.status = status;
  if (astrologerId) where.astrologerId = astrologerId;

  const rows = await WithdrawalRequest.findAll({
    where,
    order: [["id", "DESC"]],
    limit: Math.min(Math.max(limit, 1), 100),
    offset: Math.max(offset, 0),
  });
  const enriched = await attachAstrologer(rows);
  return enriched.map((r) => toWithdrawalJson(r, { admin: true }));
}

async function getWithdrawalByIdAdmin(id) {
  const row = await WithdrawalRequest.findByPk(id);
  if (!row) throw errWithStatus("Withdrawal request not found", 404);
  const [enriched] = await attachAstrologer([row]);
  return toWithdrawalJson(enriched, { admin: true });
}

async function refundPendingWithdrawal(tx, withdrawal, astro) {
  const amt = Number(withdrawal.amount);
  const before = getWalletBalance(astro);
  const after = Number((before + amt).toFixed(2));
  await astro.update({ walletBalance: after }, { transaction: tx });

  if (withdrawal.walletTransactionId) {
    const walletTx = await WalletTransaction.findByPk(
      withdrawal.walletTransactionId,
      { transaction: tx, lock: tx.LOCK.UPDATE }
    );
    if (walletTx && walletTx.status === "pending") {
      await walletTx.update(
        {
          status: "failed",
          description: "Withdrawal rejected — amount refunded",
        },
        { transaction: tx }
      );
    }
  }
  return after;
}

async function updateWithdrawalAdmin(id, body) {
  const tx = await db.sequelize.transaction();
  try {
    const row = await WithdrawalRequest.findByPk(id, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!row) throw errWithStatus("Withdrawal request not found", 404);

    const payload = {};
    const nextStatus = body.status != null ? String(body.status).trim().toLowerCase() : null;
    const allowed = ["pending", "approved", "rejected", "cancelled"];

    if (nextStatus) {
      if (!allowed.includes(nextStatus)) {
        throw errWithStatus(
          `status must be one of: ${allowed.join(", ")}`,
          400
        );
      }
      if (nextStatus !== row.status) {
        if (row.status !== "pending") {
          throw errWithStatus(
            "Only pending withdrawals can change status",
            400
          );
        }
        const astro = await Astrologer.findByPk(row.astrologerId, {
          transaction: tx,
          lock: tx.LOCK.UPDATE,
        });
        if (!astro) throw errWithStatus("Astrologer not found", 404);

        if (nextStatus === "approved") {
          payload.status = "approved";
          if (row.walletTransactionId) {
            const walletTx = await WalletTransaction.findByPk(
              row.walletTransactionId,
              { transaction: tx, lock: tx.LOCK.UPDATE }
            );
            if (walletTx && walletTx.status === "pending") {
              await walletTx.update(
                {
                  status: "success",
                  description: "Withdrawal approved",
                },
                { transaction: tx }
              );
            }
          }
        } else if (nextStatus === "rejected" || nextStatus === "cancelled") {
          const reason = String(body.rejectionReason || "").trim();
          if (nextStatus === "rejected" && !reason) {
            throw errWithStatus(
              "rejectionReason is required when rejecting",
              400
            );
          }
          payload.status = nextStatus;
          payload.rejectionReason = reason || null;
          await refundPendingWithdrawal(tx, row, astro);
        } else {
          payload.status = nextStatus;
        }
      }
    }

    if (row.status === "pending") {
      if (body.accountHolderName !== undefined) {
        payload.accountHolderName = String(body.accountHolderName || "").trim();
      }
      if (body.accountNumber !== undefined) {
        payload.accountNumber = String(body.accountNumber || "")
          .trim()
          .replace(/\s+/g, "");
      }
      if (body.ifscCode !== undefined) {
        payload.ifscCode = normalizeIfsc(body.ifscCode);
      }
      if (body.bankName !== undefined) {
        payload.bankName = String(body.bankName || "").trim();
      }
      if (body.branchName !== undefined) {
        const b = String(body.branchName || "").trim();
        payload.branchName = b || null;
      }
      if (body.amount !== undefined) {
        const newAmt = asAmount(body.amount);
        if (!newAmt || newAmt < MIN_WITHDRAWAL_AMOUNT) {
          throw errWithStatus(
            `Minimum withdrawal amount is ₹${MIN_WITHDRAWAL_AMOUNT}`,
            400
          );
        }
        const astro = await Astrologer.findByPk(row.astrologerId, {
          transaction: tx,
          lock: tx.LOCK.UPDATE,
        });
        const diff = newAmt - Number(row.amount);
        const balance = getWalletBalance(astro);
        if (diff > 0 && balance < diff) {
          throw errWithStatus("Insufficient wallet balance for amount increase", 400);
        }
        if (diff !== 0) {
          const newBalance = Number((balance - diff).toFixed(2));
          await astro.update({ walletBalance: newBalance }, { transaction: tx });
          payload.amount = newAmt;
          if (row.walletTransactionId) {
            const walletTx = await WalletTransaction.findByPk(
              row.walletTransactionId,
              { transaction: tx }
            );
            if (walletTx) {
              await walletTx.update(
                {
                  amount: newAmt,
                  balanceAfter: newBalance,
                },
                { transaction: tx }
              );
            }
          }
        }
      }
    }

    if (Object.keys(payload).length === 0) {
      throw errWithStatus("No valid fields to update", 400);
    }

    await row.update(payload, { transaction: tx });
    await tx.commit();
    return getWithdrawalByIdAdmin(id);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

async function deleteWithdrawalAdmin(id) {
  const tx = await db.sequelize.transaction();
  try {
    const row = await WithdrawalRequest.findByPk(id, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!row) throw errWithStatus("Withdrawal request not found", 404);

    if (row.status === "approved") {
      throw errWithStatus("Cannot delete an approved withdrawal", 400);
    }
    if (row.status === "pending") {
      const astro = await Astrologer.findByPk(row.astrologerId, {
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });
      if (astro) await refundPendingWithdrawal(tx, row, astro);
      if (row.walletTransactionId) {
        await WalletTransaction.destroy({
          where: { id: row.walletTransactionId },
          transaction: tx,
        });
      }
    }

    await row.destroy({ transaction: tx });
    await tx.commit();
    return { deleted: true, id };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

module.exports = {
  MIN_WITHDRAWAL_AMOUNT,
  createAstrologerWithdrawal,
  listAstrologerWithdrawals,
  listAllWithdrawalsAdmin,
  getWithdrawalByIdAdmin,
  updateWithdrawalAdmin,
  deleteWithdrawalAdmin,
};
