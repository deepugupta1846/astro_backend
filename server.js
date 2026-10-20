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

  if (process.env.DB_SYNC_ALTER === "true") {
    console.warn(
      "DB_SYNC_ALTER is ignored (alter sync disabled — it breaks users.phone indexes). Use scripts/migrations/*.sql"
    );
  }

  const isProd = process.env.NODE_ENV === "production";
  const syncExplicit = process.env.DB_SYNC === "true";
  if (process.env.DB_SYNC === "false" || (isProd && !syncExplicit)) {
    console.log(
      isProd
        ? "DB sync skipped in production (set DB_SYNC=true to create missing tables only)."
        : "DB sync skipped (DB_SYNC=false)."
    );
    return;
  }

  // Never { alter: true } — MySQL ER_TOO_MANY_KEYS on users.phone UNIQUE.
  await db.sequelize.sync();

  console.log("DB sync: missing tables created if needed (no ALTER on existing tables).");
  console.log(`DB models: ${SYNC_MODEL_NAMES.join(", ")}`);
  console.log("Schema changes: run scripts/migrations/*.sql on the database.");
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
