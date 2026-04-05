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

const connectDb = async () => {
  try {
    await db.sequelize.authenticate();
    const useAlter =
      process.env.DB_SYNC_ALTER === "true" ||
      (process.env.NODE_ENV !== "production" &&
        process.env.DB_SYNC_ALTER !== "false");
    console.log("Database connection established successfully.");
    if (useAlter) {
      console.log(
        "DB sync: alter enabled (missing columns will be added). " +
          "Production: set DB_SYNC_ALTER=true once, or run SQL in scripts/migrations/."
      );
    }
  } catch (error) {
    console.log("Unable to connect database.", error.message);
  }
};

// Routes
require("./src/upload/upload.routes.js")(app);
require("./src/user/routes/user.routes.js")(app);
require("./src/astrologer/routes/astrologer.routes.js")(app);
require("./src/consultation/routes/consultation.routes.js")(app);

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
