const consultationController = require("../controller/consultation.controller");

module.exports = (app) => {
  app.post("/api/v1/consultation/sessions", consultationController.createOrGetSession);
  app.get(
    "/api/v1/consultation/sessions/for-participant/:userId",
    consultationController.listSessionsForParticipant
  );
  app.get(
    "/api/v1/consultation/sessions/:sessionId/summary",
    consultationController.getSessionSummary
  );
  app.post(
    "/api/v1/consultation/sessions/:sessionId/read",
    consultationController.markConversationRead
  );
  app.post(
    "/api/v1/consultation/sessions/:sessionId/messages/mark-delivered",
    consultationController.markMessagesDelivered
  );
  app.get(
    "/api/v1/consultation/sessions/:id/messages",
    consultationController.listMessages
  );
  app.post(
    "/api/v1/consultation/sessions/:id/messages",
    consultationController.sendMessage
  );
  app.post("/api/v1/consultation/agora/rtc-token", consultationController.issueRtcToken);
  app.post(
    "/api/v1/consultation/sessions/:id/call/start",
    consultationController.startCall
  );
  app.get(
    "/api/v1/consultation/calls/history/:userId",
    consultationController.listCallHistory
  );
  app.patch(
    "/api/v1/consultation/calls/:callLogId/end",
    consultationController.endCall
  );
};
