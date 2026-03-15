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
        // Sync models (creates tables if they don't exist)
        await db.sequelize.sync();
        console.log("Database connection established successfully.");
    } catch (error) {
        console.log("Unable to connect database.", error.message);
    }
}


//set all routes

require("./src/user/routes/user.routes.js")(app);



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

