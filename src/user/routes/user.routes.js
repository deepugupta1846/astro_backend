const userController = require("../controller/user.controller");
const { kundliUploadMiddleware } = require("../kundli.upload.middleware");

module.exports = (app) => {
  // Auth / signup flow (match UI: login → OTP → details → signup with details)
  app.post("/api/v1/user/send-otp", userController.sendOtp);
  app.post("/api/v1/user/verify-otp", userController.verifyOtp);
  app.post("/api/v1/user/wallet/create-order", userController.createWalletTopupOrder);
  app.post("/api/v1/user/wallet/verify", userController.verifyWalletTopup);
  app.post("/api/v1/user/signup", userController.signup);
  app.post("/api/v1/user/signin", userController.login);
  app.post(
    "/api/v1/user/request-account-deletion",
    userController.requestAccountDeletion
  );
  app.put("/api/v1/user/:id/push-token", userController.updatePushToken);
  app.get("/api/v1/user/:id/push-token", userController.getPushToken);
  app.post("/api/v1/user/:id/logout", userController.logout);
  app.post(
    "/api/v1/user/:id/kundlis",
    kundliUploadMiddleware,
    userController.uploadKundli
  );
  app.get("/api/v1/user/:id/kundlis", userController.getKundlis);
  app.get("/api/v1/user/:id/notifications", userController.getNotifications);
  app.put(
    "/api/v1/user/:id/notifications/:notificationId/read",
    userController.markNotificationRead
  );

  // CRUD
  app.get("/api/v1/user", userController.findAll);
  app.get("/api/v1/user/:id", userController.findOne);
  app.put("/api/v1/user/:id", userController.update);
  app.delete("/api/v1/user/:id", userController.delete);
};
