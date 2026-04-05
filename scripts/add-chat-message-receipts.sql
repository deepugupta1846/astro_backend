-- Run once on MySQL/MariaDB if columns are missing.

ALTER TABLE chat_messages
  ADD COLUMN delivered_at DATETIME NULL,
  ADD COLUMN read_at DATETIME NULL;
