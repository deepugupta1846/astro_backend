const { requireAdmin } = require("../middleware/auth.middleware");
const adminController = require("./admin.controller");
const astrologerController = require("../astrologer/controller/astrologer.controller");

module.exports = (app) => {
  app.get("/api/v1/admin/me", requireAdmin, adminController.me);
  app.get("/api/v1/admin/users", requireAdmin, adminController.listUsers);
  app.get("/api/v1/admin/users/:id", requireAdmin, adminController.getUser);
  app.put("/api/v1/admin/users/:id", requireAdmin, adminController.updateUser);
  app.delete("/api/v1/admin/users/:id", requireAdmin, adminController.deleteUser);

  app.get(
    "/api/v1/admin/astrologers",
    requireAdmin,
    adminController.listAstrologers
  );
  app.get(
    "/api/v1/admin/astrologers/:id",
    requireAdmin,
    adminController.getAstrologer
  );
  app.put(
    "/api/v1/admin/astrologers/:id",
    requireAdmin,
    adminController.updateAstrologer
  );
  app.post(
    "/api/v1/admin/astrologers",
    requireAdmin,
    astrologerController.create
  );
};
