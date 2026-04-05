const astrologerController = require("../controller/astrologer.controller");

module.exports = (app) => {
  app.get("/api/v1/astrologer", astrologerController.list);
  app.post("/api/v1/astrologer/register", astrologerController.register);
  app.post("/api/v1/astrologer", astrologerController.create);
};
