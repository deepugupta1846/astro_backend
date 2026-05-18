-- Run once on MySQL/MariaDB if columns are missing.
ALTER TABLE consultation_sessions
  ADD COLUMN request_status ENUM('pending','accepted','declined') NULL DEFAULT 'pending' AFTER status,
  ADD COLUMN chat_started_at DATETIME NULL AFTER request_status,
  ADD COLUMN chat_ended_at DATETIME NULL AFTER chat_started_at,
  ADD COLUMN billed_amount DECIMAL(12,2) NULL AFTER chat_ended_at;

-- Legacy rows: treat as already accepted
UPDATE consultation_sessions SET request_status = 'accepted' WHERE request_status IS NULL;
