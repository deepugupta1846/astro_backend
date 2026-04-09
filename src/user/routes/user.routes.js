const userController = require("../controller/user.controller");

module.exports = (app) => {
  // Auth / signup flow (match UI: login → OTP → details → signup with details)
  app.post("/api/v1/user/send-otp", userController.sendOtp);
  app.post("/api/v1/user/verify-otp", userController.verifyOtp);
  app.post("/api/v1/user/signup", userController.signup);
  app.post("/api/v1/user/signin", userController.login);
  app.put("/api/v1/user/:id/push-token", userController.updatePushToken);

  // CRUD
  app.get("/api/v1/user", userController.findAll);
  app.get("/api/v1/user/:id", userController.findOne);
  app.put("/api/v1/user/:id", userController.update);
  app.delete("/api/v1/user/:id", userController.delete);
};
