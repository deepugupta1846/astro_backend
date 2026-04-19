const { verifyBearerToken } = require("../auth/jwt.service");

function attachUserFromAuthHeader(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !String(auth).startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Missing or invalid Authorization header",
    });
  }
  const raw = String(auth).slice(7).trim();
  if (!raw) {
    return res.status(401).json({
      success: false,
      message: "Missing token",
    });
  }
  try {
    const decoded = verifyBearerToken(raw);
    const sub = decoded.sub;
    req.user = {
      id: typeof sub === "string" ? parseInt(sub, 10) : sub,
      role: decoded.role,
    };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

function requireAdmin(req, res, next) {
  attachUserFromAuthHeader(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }
    next();
  });
}

module.exports = { attachUserFromAuthHeader, requireAdmin };
