const astrologerController = require("../controller/astrologer.controller");

module.exports = (app) => {
  app.post("/api/v1/astrologer/send-otp", astrologerController.sendOtp);
  app.post("/api/v1/astrologer/verify-otp", astrologerController.verifyOtp);
  app.get("/api/v1/astrologer", astrologerController.list);
  app.patch(
    "/api/v1/astrologer/:id/availability",
    astrologerController.updateAvailability
  );
  app.get("/api/v1/astrologer/:id", astrologerController.findOne);
  app.post("/api/v1/astrologer/register", astrologerController.register);
  app.post("/api/v1/astrologer", astrologerController.create);
};
