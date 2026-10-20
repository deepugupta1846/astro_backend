require("dotenv").config();

console.log("Server is starting...");

const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const app = express();
const PORT = process.env.PORT || 5000;
const bodyParser = require("body-parser");
const morgan = require("morgan");
const cors = require("cors");
const db = require("./models/index.js");
const walletController = require("./src/wallet/controller/wallet.controller.js");

// Razorpay webhooks require the raw body for signature verification (must run before JSON parser).
app.post(
  "/api/v1/wallet/razorpay/webhook",
  express.raw({ type: "application/json" }),
  walletController.handleRazorpayWebhook
);

// Middleware setup
app.use(bodyParser.json());
app.use(morgan("dev"));
app.use(cors());
app.use(express.static("public"));

// Ensure uploads directory exists
const path = require("path");
const fs = require("fs");
const uploadsDir = path.join(process.cwd(), "public", "uploads", "products");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("Created uploads directory:", uploadsDir);
}

/** Sequelize models synced on startup (see models/index.js). */
const SYNC_MODEL_NAMES = [
  "user",
  "astrologer",
  "astrologerPolicy",
  "remedy",
  "puja",
  "pujaBooking",
  "kundli",
  "notification",
  "consultationSession",
  "chatMessage",
  "callLog",
  "walletTransaction",
  "astrologerWithdrawalRequest",
  "accountDeletionRequest",
  "phoneOtp",
];

const connectDb = async () => {
  await db.sequelize.authenticate();
  console.log("Database connection established successfully.");

  if (process.env.DB_SYNC === "false") {
    console.log("DB sync skipped (DB_SYNC=false).");
    return;
  }

  // alter: true can re-add UNIQUE indexes on every start (MySQL ER_TOO_MANY_KEYS on users.phone).
  // Only enable explicitly; prefer scripts/migrations/*.sql for schema changes.
  const useAlter = process.env.DB_SYNC_ALTER === "true";

  await db.sequelize.sync(useAlter ? { alter: true } : {});

  console.log(
    `DB sync: all tables synced (${useAlter ? "alter: true — use only temporarily" : "create missing tables only"}).`
  );
  console.log(`DB models: ${SYNC_MODEL_NAMES.join(", ")}`);
  if (!useAlter) {
    console.log(
      "New columns/tables: run scripts/migrations/*.sql (do not leave DB_SYNC_ALTER=true on production)."
    );
  }
};

// Routes
require("./src/upload/upload.routes.js")(app);
require("./src/user/routes/user.routes.js")(app);
require("./src/astrologer/routes/astrologer.routes.js")(app);
require("./src/wallet/routes/wallet.routes.js")(app);
require("./src/consultation/routes/consultation.routes.js")(app);
require("./src/admin/admin.routes.js")(app);
require("./src/puja/routes/puja.routes.js")(app);

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
  path: process.env.SOCKET_PATH || "/socket.io",
});

require("./src/consultation/consultation.socket.js")(io);

const startServer = async () => {
  try {
    await connectDb();
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Server is running on http://localhost:${PORT} (REST + Socket.IO)`
      );
    });
  } catch (error) {
    console.log("Failed to start server.", error);
    process.exit(1);
  }
};

startServer();
