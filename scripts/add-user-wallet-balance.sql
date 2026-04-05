-- Run once if `wallet_balance` is missing (when not using Sequelize alter sync).

ALTER TABLE users
  ADD COLUMN wallet_balance DECIMAL(12, 2) NOT NULL DEFAULT 0;
