const { requireAdmin } = require("../middleware/auth.middleware");
const adminController = require("./admin.controller");
const astrologerController = require("../astrologer/controller/astrologer.controller");
const { remedyUploadMiddleware } = require("./remedy.upload.middleware");
const { kundliUploadMiddleware } = require("../user/kundli.upload.middleware");

module.exports = (app) => {
  app.get("/api/v1/admin/me", requireAdmin, adminController.me);
  app.get(
    "/api/v1/admin/notifications",
    requireAdmin,
    adminController.listMyNotifications
  );
  app.get("/api/v1/admin/users", requireAdmin, adminController.listUsers);
  app.get("/api/v1/admin/users/:id", requireAdmin, adminController.getUser);
  app.get(
    "/api/v1/admin/users/:id/kundlis",
    requireAdmin,
    adminController.getUserKundlis
  );
  app.get("/api/v1/admin/kundlis", requireAdmin, adminController.listKundlis);
  app.put(
    "/api/v1/admin/kundlis/:id",
    requireAdmin,
    kundliUploadMiddleware,
    adminController.updateKundli
  );
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

  app.get("/api/v1/admin/remedies", requireAdmin, adminController.listRemedies);
  app.get(
    "/api/v1/admin/remedies/:id",
    requireAdmin,
    adminController.getRemedy
  );
  app.post(
    "/api/v1/admin/remedies",
    requireAdmin,
    remedyUploadMiddleware,
    adminController.createRemedy
  );
  app.put(
    "/api/v1/admin/remedies/:id",
    requireAdmin,
    remedyUploadMiddleware,
    adminController.updateRemedy
  );
  app.delete(
    "/api/v1/admin/remedies/:id",
    requireAdmin,
    adminController.deleteRemedy
  );

  app.get("/api/v1/admin/pujas", requireAdmin, adminController.listPujas);
  app.get(
    "/api/v1/admin/puja-bookings",
    requireAdmin,
    adminController.listPujaBookings
  );
  app.put(
    "/api/v1/admin/puja-bookings/:id/status",
    requireAdmin,
    adminController.updatePujaBookingStatus
  );
  app.get("/api/v1/admin/pujas/:id", requireAdmin, adminController.getPuja);
  app.post(
    "/api/v1/admin/pujas",
    requireAdmin,
    remedyUploadMiddleware,
    adminController.createPuja
  );
  app.put(
    "/api/v1/admin/pujas/:id",
    requireAdmin,
    remedyUploadMiddleware,
    adminController.updatePuja
  );
  app.delete("/api/v1/admin/pujas/:id", requireAdmin, adminController.deletePuja);

  app.get(
    "/api/v1/admin/withdrawals",
    requireAdmin,
    adminController.listWithdrawals
  );
  app.get(
    "/api/v1/admin/withdrawals/:id",
    requireAdmin,
    adminController.getWithdrawal
  );
  app.put(
    "/api/v1/admin/withdrawals/:id",
    requireAdmin,
    adminController.updateWithdrawal
  );
  app.delete(
    "/api/v1/admin/withdrawals/:id",
    requireAdmin,
    adminController.deleteWithdrawal
  );
};
