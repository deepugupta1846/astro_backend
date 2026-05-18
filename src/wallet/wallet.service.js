const db = require("../../models");

const User = db.user;
const Astrologer = db.astrologer;
const WalletTransaction = db.walletTransaction;

function getWalletBalance(entity) {
  return Number(entity?.walletBalance || 0);
}

function asAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

function consultationReferenceId(callLogId) {
  return `call_${callLogId}`;
}

function sessionChatReferenceId(sessionId) {
  return `session_${sessionId}`;
}

/**
 * Billable minutes: any started second counts as a full minute (ceiling).
 */
function billableMinutesFromDuration(durationSeconds) {
  const seconds = Math.max(0, Math.floor(Number(durationSeconds) || 0));
  if (seconds <= 0) return 0;
  return Math.ceil(seconds / 60);
}

function calculateConsultationAmount(durationSeconds, feePerMin) {
  const rate = Number(feePerMin);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { amount: 0, billableMinutes: 0, feePerMin: rate };
  }
  const billableMinutes = billableMinutesFromDuration(durationSeconds);
  if (billableMinutes <= 0) {
    return { amount: 0, billableMinutes: 0, feePerMin: rate };
  }
  const amount = Number((billableMinutes * rate).toFixed(2));
  return { amount, billableMinutes, feePerMin: rate };
}

function errWithStatus(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function findExistingConsultationTransfer(referenceId, tx) {
  if (!referenceId) return null;
  return WalletTransaction.findOne({
    where: {
      referenceId,
      source: "consultation",
      type: "debit",
      entityType: "user",
      status: "success",
    },
    transaction: tx,
    lock: tx.LOCK.UPDATE,
  });
}

/**
 * Debit user wallet and credit astrologer wallet (idempotent when referenceId is set).
 */
async function transferUserToAstrologer(tx, params) {
  const {
    userId,
    astrologerId,
    amount: amountInr,
    referenceId = null,
    description = "Consultation settlement",
    metadata = {},
  } = params;

  const amount = asAmount(amountInr);
  if (!userId || !astrologerId) {
    throw errWithStatus("Valid userId and astrologerId are required", 400);
  }
  if (!amount || amount <= 0) {
    throw errWithStatus("Amount must be greater than 0", 400);
  }

  if (referenceId) {
    const existing = await findExistingConsultationTransfer(referenceId, tx);
    if (existing) {
      const user = await User.findByPk(userId, { transaction: tx });
      const astrologer = await Astrologer.findByPk(astrologerId, {
        transaction: tx,
      });
      if (!user || !astrologer) {
        throw errWithStatus(
          !user ? "User not found" : "Astrologer not found",
          404
        );
      }
      return {
        alreadyProcessed: true,
        amount: Number(existing.amount),
        user: { id: userId, walletBalance: getWalletBalance(user) },
        astrologer: {
          id: astrologerId,
          walletBalance: getWalletBalance(astrologer),
        },
        referenceId,
      };
    }
  }

  const user = await User.findByPk(userId, {
    transaction: tx,
    lock: tx.LOCK.UPDATE,
  });
  const astrologer = await Astrologer.findByPk(astrologerId, {
    transaction: tx,
    lock: tx.LOCK.UPDATE,
  });
  if (!user || !astrologer) {
    throw errWithStatus(!user ? "User not found" : "Astrologer not found", 404);
  }

  const userBefore = getWalletBalance(user);
  if (userBefore < amount) {
    throw errWithStatus("Insufficient user wallet balance", 400);
  }
  const userAfter = Number((userBefore - amount).toFixed(2));
  const astroBefore = getWalletBalance(astrologer);
  const astroAfter = Number((astroBefore + amount).toFixed(2));

  await user.update({ walletBalance: userAfter }, { transaction: tx });
  await astrologer.update({ walletBalance: astroAfter }, { transaction: tx });

  const transferMeta = {
    ...metadata,
    counterpartyAstrologerId: astrologerId,
  };

  await WalletTransaction.bulkCreate(
    [
      {
        entityType: "user",
        entityId: userId,
        type: "debit",
        amount,
        balanceBefore: userBefore,
        balanceAfter: userAfter,
        status: "success",
        source: "consultation",
        description,
        referenceId,
        metadata: transferMeta,
      },
      {
        entityType: "astrologer",
        entityId: astrologerId,
        type: "credit",
        amount,
        balanceBefore: astroBefore,
        balanceAfter: astroAfter,
        status: "success",
        source: "consultation",
        description,
        referenceId,
        metadata: { counterpartyUserId: userId, ...metadata },
      },
    ],
    { transaction: tx }
  );

  return {
    alreadyProcessed: false,
    amount,
    user: { id: userId, walletBalance: userAfter },
    astrologer: { id: astrologerId, walletBalance: astroAfter },
    referenceId,
  };
}

/**
 * Settle a completed call: duration x astrologer consultationFeePerMin.
 */
async function settleCallConsultation(tx, params) {
  const {
    callLogId,
    userId,
    astrologerId,
    durationSeconds,
    feePerMin,
    callType = null,
    sessionId = null,
  } = params;

  const referenceId = consultationReferenceId(callLogId);
  const pricing = calculateConsultationAmount(durationSeconds, feePerMin);

  if (pricing.amount <= 0) {
    return {
      settled: false,
      skipped: true,
      reason:
        pricing.billableMinutes <= 0
          ? "zero_duration"
          : "zero_consultation_rate",
      amount: 0,
      billableMinutes: pricing.billableMinutes,
      feePerMin: pricing.feePerMin,
      referenceId,
    };
  }

  const description = callType
    ? `Consultation ${callType} call (${pricing.billableMinutes} min)`
    : `Consultation call (${pricing.billableMinutes} min)`;

  const transfer = await transferUserToAstrologer(tx, {
    userId,
    astrologerId,
    amount: pricing.amount,
    referenceId,
    description,
    metadata: {
      callLogId,
      sessionId,
      durationSeconds,
      billableMinutes: pricing.billableMinutes,
      feePerMin: pricing.feePerMin,
      callType,
    },
  });

  return {
    settled: true,
    skipped: false,
    amount: transfer.amount,
    billableMinutes: pricing.billableMinutes,
    feePerMin: pricing.feePerMin,
    durationSeconds,
    referenceId,
    alreadyProcessed: transfer.alreadyProcessed,
    user: transfer.user,
    astrologer: transfer.astrologer,
  };
}

/**
 * Settle a completed chat session: duration since chatStartedAt x feePerMin.
 */
async function settleSessionChat(tx, params) {
  const {
    sessionId,
    userId,
    astrologerId,
    durationSeconds,
    feePerMin,
  } = params;

  const referenceId = sessionChatReferenceId(sessionId);
  const pricing = calculateConsultationAmount(durationSeconds, feePerMin);

  if (pricing.amount <= 0) {
    return {
      settled: false,
      skipped: true,
      reason:
        pricing.billableMinutes <= 0
          ? "zero_duration"
          : "zero_consultation_rate",
      amount: 0,
      billableMinutes: pricing.billableMinutes,
      feePerMin: pricing.feePerMin,
      referenceId,
    };
  }

  const transfer = await transferUserToAstrologer(tx, {
    userId,
    astrologerId,
    amount: pricing.amount,
    referenceId,
    description: `Consultation chat (${pricing.billableMinutes} min)`,
    metadata: {
      sessionId,
      durationSeconds,
      billableMinutes: pricing.billableMinutes,
      feePerMin: pricing.feePerMin,
      kind: "chat",
    },
  });

  return {
    settled: true,
    skipped: false,
    amount: transfer.amount,
    billableMinutes: pricing.billableMinutes,
    feePerMin: pricing.feePerMin,
    durationSeconds,
    referenceId,
    alreadyProcessed: transfer.alreadyProcessed,
    user: transfer.user,
    astrologer: transfer.astrologer,
  };
}

module.exports = {
  calculateConsultationAmount,
  billableMinutesFromDuration,
  consultationReferenceId,
  sessionChatReferenceId,
  transferUserToAstrologer,
  settleCallConsultation,
  settleSessionChat,
};
