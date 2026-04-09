-- Run once if these columns are missing (for production/manual migrations).

ALTER TABLE users
  ADD COLUMN fcm_token VARCHAR(512) NULL,
  ADD COLUMN fcm_token_updated_at DATETIME NULL;
