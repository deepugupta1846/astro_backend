require("dotenv").config();

console.log("Server is starting...");

const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cors = require('cors');
const db = require("./models/index.js")

// Middleware setup
app.use(bodyParser.json());
app.use(morgan('dev'));
app.use(cors());
app.use(express.static('public'));

// Ensure uploads directory exists
const path = require('path');
const fs = require('fs');
const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}


const connectDb = async() => {
    try {
        await db.sequelize.authenticate();
        // sync() alone does NOT add new columns to existing tables.
        // alter: true updates the schema to match models (adds profileImageUrl, etc.).
        const useAlter =
            process.env.DB_SYNC_ALTER === "true" ||
            (process.env.NODE_ENV !== "production" &&
                process.env.DB_SYNC_ALTER !== "false");
        // await db.sequelize.sync(useAlter ? { alter: true } : {});
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
}


//set all routes

require("./src/upload/upload.routes.js")(app);
require("./src/user/routes/user.routes.js")(app);
require("./src/astrologer/routes/astrologer.routes.js")(app);
require("./src/consultation/routes/consultation.routes.js")(app);



const startServer = async() => {
    try {
        await connectDb()
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.log("Failed to start server.", error)
        process.exit(1)
    }
}

startServer();

