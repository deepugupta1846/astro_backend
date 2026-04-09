const admin = require("firebase-admin");

let initialized = false;

function _readServiceAccountFromEnv() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson && rawJson.trim()) {
    return JSON.parse(rawJson);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: String(privateKeyRaw).replace(/\\n/g, "\n"),
  };
}

function getMessaging() {
  if (!initialized) {
    const account = _readServiceAccountFromEnv();
    if (!account) {
      throw new Error(
        "Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON " +
          "or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY."
      );
    }
    admin.initializeApp({
      credential: admin.credential.cert(account),
    });
    initialized = true;
  }
  return admin.messaging();
}

module.exports = { getMessaging };
