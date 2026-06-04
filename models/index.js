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
db.remedy = require("../src/remedy/model/remedy.model.js")(sequelize, Sequelize);
db.puja = require("../src/puja/model/puja.model.js")(sequelize, Sequelize);
db.pujaBooking = require("../src/puja/model/puja_booking.model.js")(
  sequelize,
  Sequelize
);
db.kundli = require("../src/kundli/model/kundli.model.js")(sequelize, Sequelize);
db.notification = require("../src/notification/model/notification.model.js")(
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
db.walletTransaction = require("../src/wallet/model/wallet_transaction.model.js")(
  sequelize,
  Sequelize
);
db.astrologerWithdrawalRequest = require("../src/wallet/model/astrologer_withdrawal_request.model.js")(
  sequelize,
  Sequelize
);

db.astrologerWithdrawalRequest.belongsTo(db.astrologer, {
  foreignKey: "astrologerId",
});
db.astrologer.hasMany(db.astrologerWithdrawalRequest, {
  foreignKey: "astrologerId",
});

db.consultationSession.belongsTo(db.user, {
  foreignKey: "customerUserId",
  as: "customer",
});
db.consultationSession.belongsTo(db.user, {
  foreignKey: "astrologerUserId",
  as: "astrologerUser",
});
db.chatMessage.belongsTo(db.consultationSession, { foreignKey: "sessionId" });
db.callLog.belongsTo(db.consultationSession, { foreignKey: "sessionId" });
db.consultationSession.hasMany(db.callLog, { foreignKey: "sessionId" });
db.pujaBooking.belongsTo(db.puja, { foreignKey: "pujaId" });
db.puja.hasMany(db.pujaBooking, { foreignKey: "pujaId" });
db.pujaBooking.belongsTo(db.user, { foreignKey: "userId" });
db.user.hasMany(db.pujaBooking, { foreignKey: "userId" });
db.kundli.belongsTo(db.user, { foreignKey: "userId" });
db.user.hasMany(db.kundli, { foreignKey: "userId" });
db.notification.belongsTo(db.user, { foreignKey: "userId" });
db.user.hasMany(db.notification, { foreignKey: "userId" });

module.exports = db;