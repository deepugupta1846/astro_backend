const crypto = require("crypto");
const Razorpay = require("razorpay");
const db = require("../../../models");

const User = db.user;
const Astrologer = db.astrologer;
const WalletTransaction = db.walletTransaction;

const razorpayClient =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

function getRazorpayPublicKey() {
  return String(process.env.RAZORPAY_KEY_ID || "").trim();
}

function asAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

function parsePositiveInt(v) {
  const n = parseInt(String(v || ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function getEntityConfig(entityType) {
  if (entityType === "user") {
    return { model: User, idParam: "userId", label: "User" };
  }
  if (entityType === "astrologer") {
    return { model: Astrologer, idParam: "astrologerId", label: "Astrologer" };
  }
  return null;
}

function getWalletBalance(entity) {
  return Number(entity?.walletBalance || 0);
}

async function findEntityByType(entityType, entityId, tx) {
  const cfg = getEntityConfig(entityType);
  if (!cfg) return null;
  return cfg.model.findByPk(entityId, tx ? { transaction: tx } : undefined);
}

function mergeMetadata(existing, patch) {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? existing
      : {};
  return { ...base, ...(patch && typeof patch === "object" ? patch : {}) };
}

function errWithStatus(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Idempotent credit for a Razorpay wallet top-up (client verify or webhook).
 */
async function finalizeWalletTopup(tx, params) {
  const {
    entityType,
    entityId,
    razorpayOrderId,
    razorpayPaymentId,
    amountInr,
    verificationMeta,
  } = params;

  const cfg = getEntityConfig(entityType);
  if (!cfg) throw errWithStatus("Invalid entity type", 400);

  const amount = asAmount(amountInr);
  if (!amount || amount < 1) throw errWithStatus("Invalid amount", 400);

  const entity = await findEntityByType(entityType, entityId, tx);
  if (!entity) throw errWithStatus(`${cfg.label} not found`, 404);

  const samePayment = await WalletTransaction.findOne({
    where: { razorpayPaymentId, entityType, entityId },
    transaction: tx,
    lock: tx.LOCK.UPDATE,
  });
  if (samePayment && samePayment.status === "success") {
    await entity.reload({ transaction: tx });
    return {
      alreadyProcessed: true,
      walletBalance: getWalletBalance(entity),
      topupTx: samePayment,
    };
  }

  let topupTx = await WalletTransaction.findOne({
    where: { razorpayOrderId, entityType, entityId, source: "razorpay" },
    transaction: tx,
    lock: tx.LOCK.UPDATE,
  });
  if (!topupTx) {
    topupTx = await WalletTransaction.create(
      {
        entityType,
        entityId,
        type: "credit",
        amount,
        balanceBefore: getWalletBalance(entity),
        balanceAfter: getWalletBalance(entity),
        currency: "INR",
        status: "pending",
        source: "razorpay",
        description: `Wallet top-up (${cfg.label.toLowerCase()})`,
        razorpayOrderId,
      },
      { transaction: tx }
    );
  }

  if (topupTx.status === "success") {
    await entity.reload({ transaction: tx });
    return {
      alreadyProcessed: true,
      walletBalance: getWalletBalance(entity),
      topupTx,
    };
  }

  const expectedInr = asAmount(topupTx.amount);
  if (
    expectedInr &&
    Math.abs(Number(amount) - Number(expectedInr)) > 0.05
  ) {
    throw errWithStatus("Amount does not match wallet order", 400);
  }

  const before = getWalletBalance(entity);
  const nextBalance = Number((before + amount).toFixed(2));
  await entity.update({ walletBalance: nextBalance }, { transaction: tx });

  const prevMeta =
    topupTx.metadata && typeof topupTx.metadata === "object"
      ? topupTx.metadata
      : {};

  await topupTx.update(
    {
      amount,
      balanceBefore: before,
      balanceAfter: nextBalance,
      status: "success",
      razorpayPaymentId,
      metadata: mergeMetadata(prevMeta, verificationMeta || {}),
    },
    { transaction: tx }
  );

  return {
    alreadyProcessed: false,
    walletBalance: nextBalance,
    topupTx,
  };
}

function verifyRazorpayWebhookSignature(rawBodyBuffer, signatureHeader) {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret || !signatureHeader) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBodyBuffer)
    .digest("hex");
  const sig = String(signatureHeader).trim();
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch (_) {
    return false;
  }
}

async function createOrderFor(entityType, req, res) {
  try {
    const cfg = getEntityConfig(entityType);
    if (!cfg) {
      return res.status(400).json({
        success: false,
        message: "Invalid entity type",
      });
    }
    const entityId = parsePositiveInt(req.params[cfg.idParam]);
    const amount = asAmount(req.body?.amount);
    const description = req.body?.description
      ? String(req.body.description).trim().slice(0, 300)
      : null;

    if (!entityId) {
      return res.status(400).json({
        success: false,
        message: `Valid ${cfg.idParam} is required`,
      });
    }
    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        message: "Amount must be at least 1",
      });
    }
    if (!razorpayClient || !getRazorpayPublicKey()) {
      return res.status(500).json({
        success: false,
        message: "Razorpay is not configured",
      });
    }

    const entity = await findEntityByType(entityType, entityId);
    if (!entity) {
      return res.status(404).json({
        success: false,
        message: `${cfg.label} not found`,
      });
    }

    const amountPaise = Math.round(amount * 100);
    const order = await razorpayClient.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `wallet_${entityType}_${entityId}_${Date.now()}`,
      notes: {
        entityType,
        entityId: String(entityId),
        purpose: "wallet_topup",
      },
    });

    await WalletTransaction.create({
      entityType,
      entityId,
      type: "credit",
      amount,
      balanceBefore: getWalletBalance(entity),
      balanceAfter: getWalletBalance(entity),
      currency: "INR",
      status: "pending",
      source: "razorpay",
      description:
        description || `Wallet top-up order (${cfg.label.toLowerCase()})`,
      razorpayOrderId: order.id,
      metadata: {
        amountPaise: order.amount,
      },
    });

    const successReturnUrl = String(
      process.env.WALLET_TOPUP_SUCCESS_RETURN_URL || ""
    ).trim();
    const cancelReturnUrl = String(
      process.env.WALLET_TOPUP_CANCEL_RETURN_URL || ""
    ).trim();

    return res.status(200).json({
      success: true,
      message: "Wallet topup order created",
      data: {
        keyId: getRazorpayPublicKey(),
        orderId: order.id,
        amount,
        amountPaise: order.amount,
        currency: order.currency,
        entityType,
        entityId,
        checkout: {
          provider: "razorpay",
          hint:
            "Open Razorpay Checkout in the app with keyId + orderId + amount (paise). " +
            "User can pay with UPI (PhonePe, Google Pay, etc.); the SDK returns control to your app after payment.",
          suggestedMethods: ["upi", "card", "netbanking", "wallet"],
        },
        redirect: {
          successReturnUrl: successReturnUrl || null,
          cancelReturnUrl: cancelReturnUrl || null,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error creating wallet topup order",
    });
  }
}

async function verifyOrderFor(entityType, req, res) {
  const tx = await db.sequelize.transaction();
  try {
    const cfg = getEntityConfig(entityType);
    if (!cfg) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid entity type",
      });
    }
    const entityId = parsePositiveInt(req.params[cfg.idParam]);
    const razorpayOrderId = String(req.body?.razorpayOrderId || "").trim();
    const razorpayPaymentId = String(req.body?.razorpayPaymentId || "").trim();
    const razorpaySignature = String(req.body?.razorpaySignature || "").trim();
    const amount = asAmount(req.body?.amount);

    if (!entityId) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: `Valid ${cfg.idParam} is required`,
      });
    }
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: "Payment verification fields are required",
      });
    }
    if (!amount || amount < 1) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: "Amount must be at least 1",
      });
    }

    const secret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
    if (!secret) {
      await tx.rollback();
      return res.status(500).json({
        success: false,
        message: "Razorpay is not configured",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");
    if (expectedSignature !== razorpaySignature) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    let result;
    try {
      result = await finalizeWalletTopup(tx, {
        entityType,
        entityId,
        razorpayOrderId,
        razorpayPaymentId,
        amountInr: amount,
        verificationMeta: {
          verifiedAt: new Date().toISOString(),
          verificationSource: "client_signature",
        },
      });
    } catch (inner) {
      await tx.rollback();
      const code = inner.statusCode && inner.statusCode >= 400 ? inner.statusCode : 500;
      return res.status(code).json({
        success: false,
        message: inner.message || "Error verifying wallet topup",
      });
    }

    await tx.commit();
    return res.status(200).json({
      success: true,
      message: result.alreadyProcessed
        ? "Payment already processed"
        : "Wallet topup successful",
      data: {
        entityType,
        entityId,
        walletBalance: result.walletBalance,
        alreadyProcessed: result.alreadyProcessed,
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        transactionId: result.topupTx?.id,
      },
    });
  } catch (error) {
    await tx.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error verifying wallet topup",
    });
  }
}

async function getWalletSummary(entityType, req, res) {
  try {
    const cfg = getEntityConfig(entityType);
    const entityId = parsePositiveInt(req.params[cfg.idParam]);
    if (!entityId) {
      return res.status(400).json({
        success: false,
        message: `Valid ${cfg.idParam} is required`,
      });
    }
    const entity = await findEntityByType(entityType, entityId);
    if (!entity) {
      return res.status(404).json({
        success: false,
        message: `${cfg.label} not found`,
      });
    }
    const recent = await WalletTransaction.findAll({
      where: { entityType, entityId },
      order: [["id", "DESC"]],
      limit: 20,
    });
    return res.status(200).json({
      success: true,
      data: {
        entityType,
        entityId,
        walletBalance: getWalletBalance(entity),
        recentTransactions: recent.map((r) => r.toJSON()),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching wallet",
    });
  }
}

async function getWalletHistory(entityType, req, res) {
  try {
    const cfg = getEntityConfig(entityType);
    const entityId = parsePositiveInt(req.params[cfg.idParam]);
    const limit = Math.min(parsePositiveInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);

    if (!entityId) {
      return res.status(400).json({
        success: false,
        message: `Valid ${cfg.idParam} is required`,
      });
    }

    const rows = await WalletTransaction.findAll({
      where: { entityType, entityId },
      order: [["id", "DESC"]],
      limit,
      offset,
    });
    const count = await WalletTransaction.count({
      where: { entityType, entityId },
    });

    return res.status(200).json({
      success: true,
      data: rows.map((r) => r.toJSON()),
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: offset + rows.length < count,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching wallet transaction history",
    });
  }
}

async function getRazorpayOrderStatusFor(entityType, req, res) {
  try {
    const cfg = getEntityConfig(entityType);
    const entityId = parsePositiveInt(req.params[cfg.idParam]);
    const orderId = String(req.params.orderId || "").trim();

    if (!entityId || !orderId) {
      return res.status(400).json({
        success: false,
        message: `Valid ${cfg.idParam} and orderId are required`,
      });
    }
    if (!razorpayClient) {
      return res.status(500).json({
        success: false,
        message: "Razorpay is not configured",
      });
    }

    const pendingTx = await WalletTransaction.findOne({
      where: {
        razorpayOrderId: orderId,
        entityType,
        entityId,
        source: "razorpay",
      },
    });
    if (!pendingTx) {
      return res.status(404).json({
        success: false,
        message: "No wallet order found for this reference",
      });
    }

    const order = await razorpayClient.orders.fetch(orderId);
    let paymentItems = [];
    try {
      const payments = await razorpayClient.orders.fetchPayments(orderId);
      paymentItems = Array.isArray(payments?.items) ? payments.items : [];
    } catch (_) {
      paymentItems = [];
    }

    return res.status(200).json({
      success: true,
      data: {
        orderId,
        razorpayOrderStatus: order.status,
        amountPaise: order.amount,
        walletTransactionStatus: pendingTx.status,
        walletCredited: pendingTx.status === "success",
        payments: paymentItems.map((p) => ({
          id: p.id,
          status: p.status,
          method: p.method,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching Razorpay order status",
    });
  }
}

/**
 * Razorpay webhook: credits wallet when payment is captured (reliable after UPI app redirect).
 * Configure in Razorpay Dashboard → Webhooks → URL: POST /api/v1/wallet/razorpay/webhook
 * Events: payment.captured
 */
exports.handleRazorpayWebhook = async (req, res) => {
  const sig = req.headers["x-razorpay-signature"];
  const raw = req.body;

  if (!Buffer.isBuffer(raw)) {
    return res.status(400).json({ success: false, message: "Invalid body" });
  }

  if (!verifyRazorpayWebhookSignature(raw, sig)) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook signature",
    });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch (_) {
    return res.status(400).json({ success: false, message: "Invalid JSON" });
  }

  const event = String(payload.event || "");
  if (event !== "payment.captured") {
    return res.status(200).json({ received: true, ignored: true });
  }

  const paymentEntity = payload.payload?.payment?.entity;
  if (!paymentEntity?.id || !paymentEntity.order_id) {
    return res.status(200).json({ received: true, ignored: true });
  }

  const paymentId = String(paymentEntity.id);
  const orderId = String(paymentEntity.order_id);
  const status = String(paymentEntity.status || "");
  if (status !== "captured") {
    return res.status(200).json({ received: true, ignored: true });
  }

  const amountPaise = Number(paymentEntity.amount);
  if (!Number.isFinite(amountPaise)) {
    return res.status(200).json({ received: true, ignored: true });
  }
  const paidInr = Number((amountPaise / 100).toFixed(2));

  const tx = await db.sequelize.transaction();
  try {
    const topupTx = await WalletTransaction.findOne({
      where: { razorpayOrderId: orderId, source: "razorpay" },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!topupTx) {
      await tx.commit();
      return res.status(200).json({ received: true, ignored: true });
    }

    await finalizeWalletTopup(tx, {
      entityType: topupTx.entityType,
      entityId: topupTx.entityId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      amountInr: paidInr,
      verificationMeta: {
        webhookVerifiedAt: new Date().toISOString(),
        verificationSource: "razorpay_webhook",
        webhookEvent: event,
      },
    });

    await tx.commit();
    return res.status(200).json({ received: true });
  } catch (e) {
    await tx.rollback();
    console.error("Razorpay webhook wallet error:", e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

/**
 * Move money from user wallet to astrologer wallet (consultation settlement).
 * Body: { userId, astrologerId, amount, referenceId?, description? }
 */
exports.transferUserToAstrologer = async (req, res) => {
  const tx = await db.sequelize.transaction();
  try {
    const userId = parsePositiveInt(req.body?.userId);
    const astrologerId = parsePositiveInt(req.body?.astrologerId);
    const amount = asAmount(req.body?.amount);
    const referenceId = req.body?.referenceId
      ? String(req.body.referenceId).trim().slice(0, 120)
      : null;
    const description = req.body?.description
      ? String(req.body.description).trim().slice(0, 300)
      : "Consultation settlement";

    if (!userId || !astrologerId) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: "Valid userId and astrologerId are required",
      });
    }
    if (!amount || amount <= 0) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    const user = await User.findByPk(userId, { transaction: tx, lock: tx.LOCK.UPDATE });
    const astrologer = await Astrologer.findByPk(astrologerId, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!user || !astrologer) {
      await tx.rollback();
      return res.status(404).json({
        success: false,
        message: !user ? "User not found" : "Astrologer not found",
      });
    }

    const userBefore = getWalletBalance(user);
    if (userBefore < amount) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: "Insufficient user wallet balance",
      });
    }
    const userAfter = Number((userBefore - amount).toFixed(2));
    const astroBefore = getWalletBalance(astrologer);
    const astroAfter = Number((astroBefore + amount).toFixed(2));

    await user.update({ walletBalance: userAfter }, { transaction: tx });
    await astrologer.update({ walletBalance: astroAfter }, { transaction: tx });

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
          metadata: { counterpartyAstrologerId: astrologerId },
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
          metadata: { counterpartyUserId: userId },
        },
      ],
      { transaction: tx }
    );

    await tx.commit();
    return res.status(200).json({
      success: true,
      message: "Transfer completed",
      data: {
        amount,
        user: { id: userId, walletBalance: userAfter },
        astrologer: { id: astrologerId, walletBalance: astroAfter },
      },
    });
  } catch (error) {
    await tx.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error transferring wallet amount",
    });
  }
};

exports.createUserTopupOrder = (req, res) => createOrderFor("user", req, res);
exports.verifyUserTopup = (req, res) => verifyOrderFor("user", req, res);
exports.getUserWallet = (req, res) => getWalletSummary("user", req, res);
exports.getUserWalletHistory = (req, res) => getWalletHistory("user", req, res);
exports.getUserRazorpayOrderStatus = (req, res) =>
  getRazorpayOrderStatusFor("user", req, res);

exports.createAstrologerTopupOrder = (req, res) =>
  createOrderFor("astrologer", req, res);
exports.verifyAstrologerTopup = (req, res) =>
  verifyOrderFor("astrologer", req, res);
exports.getAstrologerWallet = (req, res) =>
  getWalletSummary("astrologer", req, res);
exports.getAstrologerWalletHistory = (req, res) =>
  getWalletHistory("astrologer", req, res);
exports.getAstrologerRazorpayOrderStatus = (req, res) =>
  getRazorpayOrderStatusFor("astrologer", req, res);
