const walletController = require("../controller/wallet.controller");

module.exports = (app) => {
  // User wallet
  app.get("/api/v1/wallet/user/:userId", walletController.getUserWallet);
  app.get(
    "/api/v1/wallet/user/:userId/transactions",
    walletController.getUserWalletHistory
  );
  app.post(
    "/api/v1/wallet/user/:userId/create-order",
    walletController.createUserTopupOrder
  );
  app.post(
    "/api/v1/wallet/user/:userId/verify",
    walletController.verifyUserTopup
  );
  app.get(
    "/api/v1/wallet/user/:userId/razorpay/order-status/:orderId",
    walletController.getUserRazorpayOrderStatus
  );

  // Astrologer wallet
  app.get(
    "/api/v1/wallet/astrologer/:astrologerId",
    walletController.getAstrologerWallet
  );
  app.get(
    "/api/v1/wallet/astrologer/:astrologerId/transactions",
    walletController.getAstrologerWalletHistory
  );
  app.post(
    "/api/v1/wallet/astrologer/:astrologerId/create-order",
    walletController.createAstrologerTopupOrder
  );
  app.post(
    "/api/v1/wallet/astrologer/:astrologerId/verify",
    walletController.verifyAstrologerTopup
  );
  app.get(
    "/api/v1/wallet/astrologer/:astrologerId/razorpay/order-status/:orderId",
    walletController.getAstrologerRazorpayOrderStatus
  );

  // Consultation settlement
  app.post(
    "/api/v1/wallet/transfer/user-to-astrologer",
    walletController.transferUserToAstrologer
  );
};
