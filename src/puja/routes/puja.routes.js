const pujaController = require("../controller/puja.controller");

module.exports = (app) => {
  app.get("/api/v1/pujas", pujaController.listActivePujas);
  app.post("/api/v1/pujas/book", pujaController.bookPuja);
};
