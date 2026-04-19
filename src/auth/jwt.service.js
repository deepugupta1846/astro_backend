const jwt = require("jsonwebtoken");

const SECRET =
  process.env.JWT_SECRET || "development-secret-set-JWT_SECRET-in-production";
const DEFAULT_EXPIRES = process.env.JWT_EXPIRES_IN || "7d";

function signUserToken(user) {
  const id = user.id != null ? user.id : user.get?.("id");
  const role = user.role != null ? user.role : user.get?.("role");
  return jwt.sign({ sub: id, role }, SECRET, { expiresIn: DEFAULT_EXPIRES });
}

function verifyBearerToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signUserToken, verifyBearerToken, SECRET };
