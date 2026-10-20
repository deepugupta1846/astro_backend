const db = require("../../models");

const AstrologerPolicy = db.astrologerPolicy;

const POLICY_ROW_ID = 1;

const DEFAULTS = {
  freeChatMinutes: 0,
  withdrawalPlatformPercent: 0,
};

/** Policy GET includes this so clients know this freeChatMinutes is not used for billing. */
const FREE_CHAT_POLICY_PURPOSE = "dashboard_display_only";

function clampPercent(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Number(v.toFixed(2))));
}

function clampFreeMinutes(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(v, 24 * 60);
}

function toPolicyJson(row) {
  const o = row?.toJSON ? row.toJSON() : row || {};
  return {
    withdrawalPlatformPercent: clampPercent(
      o.withdrawalPlatformPercent ?? DEFAULTS.withdrawalPlatformPercent
    ),
    freeChatMinutes: clampFreeMinutes(
      o.freeChatMinutes ?? DEFAULTS.freeChatMinutes
    ),
    freeChatMinutesPurpose: FREE_CHAT_POLICY_PURPOSE,
    updatedAt: o.updatedAt || null,
  };
}

async function ensurePolicyRow() {
  let row = await AstrologerPolicy.findByPk(POLICY_ROW_ID);
  if (!row) {
    row = await AstrologerPolicy.create({
      id: POLICY_ROW_ID,
      ...DEFAULTS,
    });
  }
  return row;
}

/** Global platform settings (withdrawal fee + dashboard display freeChatMinutes). */
async function getAstrologerPolicy() {
  const row = await ensurePolicyRow();
  return toPolicyJson(row);
}

async function updateAstrologerPolicy(payload) {
  const row = await ensurePolicyRow();
  const updates = {};
  const body = payload || {};

  if (body.freeChatMinutes !== undefined) {
    updates.freeChatMinutes = clampFreeMinutes(body.freeChatMinutes);
  }
  if (body.withdrawalPlatformPercent !== undefined) {
    updates.withdrawalPlatformPercent = clampPercent(
      body.withdrawalPlatformPercent
    );
  }

  if (Object.keys(updates).length === 0) {
    const err = new Error(
      "Provide withdrawalPlatformPercent and/or freeChatMinutes (policy display only)"
    );
    err.statusCode = 400;
    throw err;
  }

  await row.update(updates);
  await row.reload();
  return toPolicyJson(row);
}

/** Net payout after platform fee (informational; wallet debits gross amount). */
function computeWithdrawalFeeBreakdown(grossAmount, withdrawalPlatformPercent) {
  const gross = Number(Number(grossAmount).toFixed(2));
  const percent = clampPercent(withdrawalPlatformPercent);
  const platformFeeAmount = Number(((gross * percent) / 100).toFixed(2));
  const netPayoutAmount = Number((gross - platformFeeAmount).toFixed(2));
  return {
    grossAmount: gross,
    withdrawalPlatformPercent: percent,
    platformFeeAmount,
    netPayoutAmount,
  };
}

module.exports = {
  getAstrologerPolicy,
  updateAstrologerPolicy,
  computeWithdrawalFeeBreakdown,
  clampFreeMinutes,
  toPolicyJson,
  FREE_CHAT_POLICY_PURPOSE,
};
