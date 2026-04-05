const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

/**
 * Builds an Agora RTC token for voice/video in [channelName] for integer [uid].
 * Uses env: AGORA_APP_ID, AGORA_APP_CERTIFICATE
 */
function buildRtcToken(channelName, uid, expireSeconds = 3600) {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !appCertificate) {
    const err = new Error(
      "Agora not configured: set AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env"
    );
    err.code = "AGORA_CONFIG";
    throw err;
  }
  const role = RtcRole.PUBLISHER;
  const now = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = now + expireSeconds;
  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    String(channelName),
    Number(uid),
    role,
    privilegeExpiredTs
  );
}

module.exports = { buildRtcToken };
