const {Sequelize } = require('sequelize');
const dbConfig = require('../config/db.config.js');
require("dotenv").config();

const sequelize = new Sequelize(
    dbConfig.DB,
    dbConfig.USER,
    dbConfig.PASSWORD,
    {
        host: dbConfig.HOST,
        port: dbConfig.PORT,
        dialect: dbConfig.dialect,
        
        pool: {
            max: dbConfig.pool.max,
            min: dbConfig.pool.min,
            acquire: dbConfig.pool.acquire,
            idle: dbConfig.pool.idle
        }
    }
)

const db = {};

db.Sequelize = Sequelize,
db.sequelize = sequelize

db.user = require("../src/user/model/user.model.js")(sequelize, Sequelize);
db.astrologer = require("../src/astrologer/model/astrologer.model.js")(
  sequelize,
  Sequelize
);
db.consultationSession = require("../src/consultation/model/consultation_session.model.js")(
  sequelize,
  Sequelize
);
db.chatMessage = require("../src/consultation/model/chat_message.model.js")(
  sequelize,
  Sequelize
);
db.callLog = require("../src/consultation/model/call_log.model.js")(
  sequelize,
  Sequelize
);

db.consultationSession.belongsTo(db.user, {
  foreignKey: "customerUserId",
  as: "customer",
});
db.consultationSession.belongsTo(db.user, {
  foreignKey: "astrologerUserId",
  as: "astrologerUser",
});
db.chatMessage.belongsTo(db.consultationSession, { foreignKey: "sessionId" });

module.exports = db;